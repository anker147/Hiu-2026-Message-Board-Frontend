/* ============================================================
 * 留言板 · Mock API 层（PRD 第六章契约的前端实现）
 * ------------------------------------------------------------
 * API-01~12 全量 mock：统一响应包 {success, code, message, data}、
 * 6.2 全部错误码、模拟延迟（可测骨架屏）、模拟网络失败开关、
 * 会话（30 分钟空闲超时 → 401）、CSRF（缺失/错误 → 9002）、
 * F10 敏感词（4001）与限流（4002 剩余秒数）、F6 出口脱敏、
 * F8 点赞状态机（幂等）、F9 盲盒随机 + 匿名留痕。
 *
 * 接入真实后端时：本文件替换为 fetch('/api/...') 薄适配层，
 * 入出参结构与错误码保持不变，页面层零改动。
 * ============================================================ */
(function (window) {
  "use strict";

  var db = window.HMB.db;
  var seed = window.HMB.SEED;
  var t = function (k, p) { return window.HMB.i18n.t(k, p); };

  var SESSION_TTL = 30 * 60 * 1000;   // 会话空闲 30 分钟超时（PRD F2）
  var LOCK_MS = 15 * 60 * 1000;       // 登录锁定 15 分钟（PRD F3）
  var MAX_FAILS = 5;
  var RATE_WINDOW = 10 * 1000;        // 限流滑窗 10 秒
  var RATE_LIMIT = 3;                 // 10 秒内最多 3 次
  var ACTIVE_KEY = "hmb_active_session";

  /* ---------------- 基础设施 ---------------- */

  function rnd(len) {
    var chars = "0123456789abcdef";
    var s = "";
    for (var i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }

  function rndDigits(len) {
    var s = "";
    for (var i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function uuid() {
    return "u" + Date.now().toString(36) + "-" + rnd(4) + "-" + rnd(4) + "-" + rnd(12);
  }

  function latency() {
    return 260 + Math.floor(Math.random() * 240); // 260~500ms，供骨架屏可测
  }

  function ok(data) {
    return Promise.resolve({ success: true, code: 0, message: "ok", data: data || {} });
  }

  function fail(code, key, params) {
    return Promise.resolve({ success: false, code: code, message: t(key, params), data: {} });
  }

  /** 模拟网络失败（演示面板开关），失败保留草稿可重试 */
  function netGate() {
    var s = db.getSettings();
    if (s.simulateNetFail) {
      return Promise.resolve({ success: false, code: -1, message: t("error.network"), data: {} });
    }
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ success: true, code: 0, message: "ok", data: {} });
      }, latency());
    });
  }

  /* ---------------- 脱敏（F6：Service 出口） ---------------- */

  function maskName(name) {
    if (!name) return "";
    if (name.length === 1) return name;
    var stars = Math.min(2, Math.max(1, name.length - 2));
    return name.charAt(0) + new Array(stars + 1).join("*");
  }

  function maskEmail(email) {
    if (!email) return "";
    var at = email.indexOf("@");
    if (at < 0) return maskName(email);
    var local = email.slice(0, at);
    var domain = email.slice(at + 1);
    if (local.length >= 4) return local.slice(0, 3) + "***@" + domain;
    return local.charAt(0) + "@***";
  }

  function maskPhone(phone) {
    if (!phone || phone.length !== 11) return "";
    return phone.slice(0, 3) + "****" + phone.slice(7);
  }

  /* ---------------- 会话（F2） ---------------- */

  function readActive() {
    try { return JSON.parse(window.localStorage.getItem(ACTIVE_KEY) || "null"); }
    catch (e) { return null; }
  }

  function writeActive(v) {
    if (v) window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(ACTIVE_KEY);
  }

  /** 当前会话；空闲超 TTL 即失效（→401），每次调用顺延 lastActive */
  function currentSession(touch) {
    var active = readActive();
    if (!active || !active.token) return null;
    var sessions = db.getSessions();
    var i = sessions.findIndex(function (s) { return s.token === active.token; });
    if (i < 0) { writeActive(null); return null; } // 退出后令牌重放 → 失效
    var s = sessions[i];
    // GM 封禁：目标账号的所有会话立即失效（旧 token 重放 → 401）
    var owner = db.findUserById(s.userId);
    if (isBanned(owner)) {
      db.saveSessions(sessions.filter(function (x) { return x.userId !== s.userId; }));
      writeActive(null);
      return null;
    }
    if (Date.now() - s.lastActive > SESSION_TTL) {
      sessions.splice(i, 1);
      db.saveSessions(sessions);
      writeActive(null);
      return null; // 超时 → 401
    }
    if (touch) {
      s.lastActive = Date.now();
      sessions[i] = s;
      db.saveSessions(sessions);
    }
    return s;
  }

  function createSession(userId) {
    var s = { token: rnd(48), userId: userId, csrf: rnd(24), lastActive: Date.now() };
    var sessions = db.getSessions();
    sessions.push(s);
    db.saveSessions(sessions);
    writeActive({ token: s.token });
    return s;
  }

  function destroySession() {
    var active = readActive();
    if (!active) return;
    var sessions = db.getSessions().filter(function (s) { return s.token !== active.token; });
    db.saveSessions(sessions);
    writeActive(null);
  }

  /** 写操作鉴权：无会话 → 401；CSRF 缺失/错误 → 9002（PRD F2/6.4） */
  function requireAuth(csrf) {
    var s = currentSession(true);
    if (!s) return { err: fail(401, "error.401") };
    if (!csrf || csrf !== s.csrf) return { err: fail(9002, "error.9002") };
    return { session: s };
  }

  /* ---------------- GM 权限基础设施（文档 §6） ---------------- */

  function isAdmin(u) { return !!u && u.role === "admin"; }

  /** 封禁账号的旧会话立即作废：所有令牌从 sessions 中移除（文档 §6.5） */
  function isBanned(u) { return !!u && u.status === "banned"; }

  function revokeUserSessions(userId) {
    db.saveSessions(db.getSessions().filter(function (s) { return s.userId !== userId; }));
  }

  /** 禁言拦截：仅写内容受限，点赞等交互不受影响；永久禁言以 9999-12-31 时间戳表示 */
  function muteGate(userId) {
    var u = db.findUserById(userId);
    if (u && u.muteUntil && u.muteUntil > Date.now()) return fail(6004, "error.6004");
    return null;
  }

  /** GM 路由统一鉴权：非 admin → 6001（前端隐藏入口不算权限） */
  function requireAdmin(csrf) {
    var auth = requireAuth(csrf);
    if (auth.err) return auth;
    var u = db.findUserById(auth.session.userId);
    if (!isAdmin(u)) return { err: fail(6001, "error.6001") };
    return { session: auth.session, user: u };
  }

  /** GM 只读接口：会话 + 角色校验，读操作不要求 csrf（与文档 G1/G2/G3/G9/G14 一致） */
  function requireAdminRead() {
    var s = currentSession(true);
    if (!s) return { err: fail(401, "error.401") };
    var u = db.findUserById(s.userId);
    if (!isAdmin(u)) return { err: fail(6001, "error.6001") };
    return { session: s, user: u };
  }

  /** 受保护对象 / 自身 / 最后一名管理员：返回错误 Promise 或 null */
  function guardTarget(actor, target, action) {
    if (!target) return fail(5001, "error.5001");
    if (seed.isProtectedUser(target.id)) return fail(6003, "error.6003");
    if (target.id === actor.id) return fail(6002, "error.6002");
    if (action === "demote" || action === "ban") {
      if (isAdmin(target) && countActiveAdmins() <= 1) return fail(6003, "error.6003");
    }
    return null;
  }

  function countActiveAdmins() {
    return db.getUsers().filter(function (u) {
      return isAdmin(u) && u.status !== "banned" && !seed.isProtectedUser(u.id);
    }).length + 1; // +1 = 内置账号 9999 常驻
  }

  /** 审计写入：所有 GM 写操作留痕，只增不改不删 */
  function audit(actor, action, targetType, targetId, detail) {
    return db.appendAdminAction({
      actorId: actor.id, actorNickname: actor.nickname || "",
      action: action, targetType: targetType, targetId: String(targetId || ""),
      detail: detail || "", createdAt: Date.now()
    });
  }

  /** GM 用户出口：文档 G2 字段（mock 演示直接返回完整字段，由页面承担脱敏展示） */
  function toGmUser(u) {
    var messages = db.getMessages().filter(function (m) { return m.ownerId === u.id; });
    var comments = db.getComments().filter(function (c) { return c.ownerId === u.id; });
    var sessions = db.getSessions().filter(function (s) { return s.userId === u.id; })
      .sort(function (a, b) { return b.lastActive - a.lastActive; });
    return {
      id: u.id, account: u.account, displayId: u.displayId,
      nickname: u.nickname, avatarEnum: u.avatarEnum, bio: u.bio || "",
      role: u.role || "user", status: u.status || "active",
      muteUntil: u.muteUntil || 0, muted: !!(u.muteUntil && u.muteUntil > Date.now()),
      banReason: u.banReason || "", muteReason: u.muteReason || "",
      realName: u.realName || "", email: u.email || "",
      flagName: !!u.flagName, flagEmail: !!u.flagEmail, flagPhone: !!u.flagPhone,
      mustChangePassword: !!u.mustChangePassword,
      createdAt: u.createdAt || 0, lastActive: sessions.length ? sessions[0].lastActive : 0,
      lastLoginAt: u.lastLoginAt || 0,
      messageCount: messages.length, commentCount: comments.length,
      protected: seed.isProtectedUser(u.id)
    };
  }

  function paginate(list, page, pageSize) {
    var p = Math.max(1, parseInt(page, 10) || 1);
    var size = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 20));
    return {
      list: list.slice((p - 1) * size, p * size),
      total: list.length, page: p, pageSize: size
    };
  }

  /* ---------------- F10 敏感词 + 限流 ---------------- */

  function hitSensitive(text) {
    var words = db.getSettings().sensitiveWords || [];
    for (var i = 0; i < words.length; i++) {
      if (text && text.indexOf(words[i]) >= 0) return words[i];
    }
    return null;
  }

  /** 同账号 10 秒滑窗 >3 次 → 4002 + 剩余秒数（按 session.userId 统计） */
  function rateCheck(userId) {
    var win = db.getRateWindow();
    var key = "u" + userId;
    var arr = (win[key] || []).filter(function (ts) { return Date.now() - ts < RATE_WINDOW; });
    if (arr.length >= RATE_LIMIT) {
      var remain = Math.max(1, Math.ceil((RATE_WINDOW - (Date.now() - arr[0])) / 1000));
      return { blocked: true, remain: remain };
    }
    return { blocked: false };
  }

  function rateRecord(userId) {
    var win = db.getRateWindow();
    var key = "u" + userId;
    var arr = (win[key] || []).filter(function (ts) { return Date.now() - ts < RATE_WINDOW; });
    arr.push(Date.now());
    win[key] = arr;
    db.saveRateWindow(win);
  }

  /**
   * 安检门（Filter 语义，PRD F10）：
   * - 敏感词：覆盖 留言/评论/回复/盲盒回复（4001）
   * - 限流：仅针对“发留言”（同账号 10 秒滑窗 >3 次 → 4002 + 剩余秒数）
   */
  function sensitiveGate(content) {
    if (hitSensitive(content)) return fail(4001, "error.4001");
    return null;
  }

  /** 富文本 → 纯文本：字数、敏感词、搜索都按用户真正看到的文字计算，不按标签算。 */
  function plainContent(content) {
    var stripped = String(content == null ? "" : content)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ");
    var box = document.createElement("div");
    box.innerHTML = stripped;
    return (box.textContent || box.innerText || "").replace(/\u00a0/g, " ").trim();
  }

  /** 文末图片引用白名单校验：只接受 localimg://id，最多 10 张，去重。
   *  正文 content 仍不含 img（不图文混排），图作为独立字段随帖保存。 */
  function sanitizeImages(images) {
    if (!Array.isArray(images)) return [];
    var out = [], seen = {};
    for (var i = 0; i < images.length && out.length < 10; i++) {
      var s = typeof images[i] === "string" ? images[i] : "";
      if (s.indexOf("localimg://") !== 0 || s.length <= 11 || seen[s]) continue;
      seen[s] = 1;
      out.push(s);
    }
    return out;
  }

  function messageSecurityGate(userId, content) {
    var sens = sensitiveGate(content);
    if (sens) return sens;
    var rate = rateCheck(userId);
    if (rate.blocked) return fail(4002, "error.4002", { sec: rate.remain });
    return null;
  }

  /* ---------------- 榜单计算职责：全在前端（util.js rankBoard） ----------------
   * mock api 只回传原始统计字段（stats：views/likes/comments/favorites + period + createdAt），
   * 折合分公式与排序由 HMB.util.rankBoard 在前端完成；历史数据（历史最高/上周排名/趋势）
   * 只按接口返回值展示，缺失就是 0，不在浏览时反推补写。
   * biliboard 公示口径（仅供前端公式参考，后端不参与）：
   *   t = ln(e^d + 1) + 1（d = 投稿 − 期次起点，天，钳制 [0,7]）
   *   得分 = 浏览×1×t + 评论×1 + 点赞×2 + 收藏×5
   * ============================================================ */

  /* ---------------- 数据出口（6.5 字段白名单 + F6 掩码） ---------------- */

  function toListMessage(m) {
    var owner = db.findUserById(m.ownerId);
    return {
      // 6.5 白名单
      resourceId: m.resourceId,
      title: m.title || "",
      content: m.content,
      nicknameSnapshot: m.nicknameSnapshot,
      avatarEnum: m.avatarEnum,
      avatarUrl: (m.avatarUrlSnapshot !== undefined ? m.avatarUrlSnapshot : (owner && owner.avatarUrl)) || "",
      images: (m.images || []).slice(0, 10),   // 文末图片引用（localimg://id），最多 10 张；正文不含图
      displayId: m.displayId,
      topicTag: m.topicTag || "",
      createdAt: m.createdAt,
      stats: {
        views: m.stats.views, likes: m.stats.likes,
        comments: m.stats.comments, favorites: m.stats.favorites
      },
      // heat 不落库、不由后端计算：前端 rankBoard 按原始 stats 实时折算（万分制展示）
      heatDelta: m.heatDelta, peakRank: m.peakRank, peakNewRank: m.peakNewRank || 0,
      // 逐周原始统计：后端只给原始 stats，前端折线图按同一套公式实时折算各周热度
      weeklyStats: m.weeklyStats || [],
      // 展示辅助（非后端契约，页面渲染用）
      no: m.no, isNew: !!m.isNew, isPublic: m.isPublic !== false, period: m.period,
      edited: !!m.edited,
      // GM 隐藏：作者本人仍可在「我的留言」看到并收到提示，其他视图一律排除
      hidden: !!m.hidden, hiddenReason: m.hiddenReason || "",
      // F6：列表只返回掩码，且受三项公开开关控制（未勾选 → 空串）
      maskedName: owner && owner.flagName ? maskName(owner.realName) : "",
      maskedEmail: owner && owner.flagEmail ? maskEmail(owner.email) : "",
      maskedPhone: owner && owner.flagPhone ? maskPhone(owner.account) : ""
    };
  }

  /* ---------------- F1 注册（API-01） ---------------- */

  function validatePassword(pwd) {
    return typeof pwd === "string" && pwd.length >= 8 &&
      /[a-zA-Z]/.test(pwd) && /\d/.test(pwd);
  }

  function apiRegister(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var phone = (args.phone || "").trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) return fail(1001, "error.1001");
      var users = db.getUsers();
      if (users.some(function (u) { return u.account === phone; })) return fail(1002, "error.1002");
      if (!validatePassword(args.password)) return fail(1003, "error.1003");

      // 8 位展示 ID：碰撞重试 5 次，仍失败 → 1009（PRD F1）
      var displayId = null;
      for (var tries = 0; tries < 5; tries++) {
        var cand = rndDigits(8);
        if (cand.charAt(0) !== "0" && !users.some(function (u) { return u.displayId === cand; })) {
          displayId = cand; break;
        }
      }
      if (!displayId) return fail(1009, "error.1009");

      var nickname = seed.NICK_ADJ[Math.floor(Math.random() * seed.NICK_ADJ.length)] +
        seed.NICK_ANIMAL[Math.floor(Math.random() * seed.NICK_ANIMAL.length)];
      var avatarEnum = 1 + Math.floor(Math.random() * seed.AVATARS.length);

      var user = {
        id: Date.now(),
        account: phone,
        password: args.password, // 演示用明文；真实系统 PBKDF2WithHmacSHA1 加盐哈希
        displayId: displayId,
        nickname: nickname,
        avatarEnum: avatarEnum,
        realName: (args.name || "").trim(),
        email: (args.email || "").trim(),
        flagName: false, flagEmail: false, flagPhone: false,
        bio: "",
        role: "user", status: "active", muteUntil: 0, muteReason: "",
        banReason: "", bannedAt: 0, lastLoginAt: 0, mustChangePassword: false,
        createdAt: Date.now()
      };
      users.push(user);
      db.saveUsers(users);
      createSession(user.id); // 注册成功即建立会话（流程 A：免二次登录）

      return ok({
        displayId: displayId,
        nickname: nickname,
        avatar: avatarEnum
      });
    });
  }

  /* ---------------- F3 登录 / 退出（API-02 / API-03） ---------------- */

  function apiLogin(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var phone = (args.phone || "").trim();
      var fails = db.getLoginFails();
      var rec = fails[phone] || { count: 0, lockUntil: 0 };

      if (rec.lockUntil > Date.now()) {
        return fail(2002, "error.2002", { min: Math.max(1, Math.ceil((rec.lockUntil - Date.now()) / 60000)) });
      }

      var user = db.findUserByAccount(phone);
      // 恒定时间比较（演示级实现：哈希后对比，真实系统用 timingSafeEqual）
      var pass = user && user.password === args.password;
      if (!pass) {
        rec.count += 1;
        if (rec.count >= MAX_FAILS) {
          rec.lockUntil = Date.now() + LOCK_MS;
          rec.count = 0;
          fails[phone] = rec;
          db.saveLoginFails(fails);
          return fail(2002, "error.2002", { min: 15 });
        }
        fails[phone] = rec;
        db.saveLoginFails(fails);
        return fail(2001, "error.2001");
      }

      if (isBanned(user)) return fail(2003, "error.2003", { reason: user.banReason || "" });

      delete fails[phone];
      db.saveLoginFails(fails);
      user.lastLoginAt = Date.now();
      db.saveUsers(db.getUsers().map(function (u) { return u.id === user.id ? user : u; }));
      createSession(user.id);
      return ok({
        displayId: user.displayId,
        nickname: user.nickname,
        avatar: user.avatarEnum
      });
    });
  }

  function apiLogout(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var s = currentSession(false);
      if (!s) return ok({});
      if (!args || !args.csrf || args.csrf !== s.csrf) return fail(9002, "error.9002");
      destroySession(); // 令牌立即失效，重放 → 401（PRD F3）
      return ok({});
    });
  }

  /* ---------------- 榜单（API-04） ---------------- */

  function apiGetMessages(opts) {
    opts = opts || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var session = currentSession(true);

      if (opts.tab === "mine") {
        if (!session) return fail(401, "error.401"); // “我的留言”未登录 → 引导 P-05
      }

      var period = opts.period;
      var messages = db.getMessages(); // 全量引用：filter 元素共享引用，历史最高刷新后整体回写
      var list = messages.filter(function (m) {
        // 热榜 = 全站所有公开帖子的排行（周榜公示口径），不受期次过滤：
        // 期次只是榜单的“统计周”标签，不是筛选条件；得分与名次由前端按原始 stats 计算。
        // 新帖榜（latest）仍按期次过滤“本周新帖”。
        if (period && opts.tab !== "hot" && m.period !== period) return false;
        // 帖子可见类型（isPublic=false 仅自己可见）：不进入他人可见的任何列表视图
        if (m.isPublic === false &&
            !(session && session.userId === m.ownerId)) return false;
        // GM 隐藏：公开视图排除；作者本人的「我的留言」保留并带"已被隐藏"提示
        if (m.hidden === true &&
            !(opts.tab === "mine" && session && session.userId === m.ownerId)) return false;
        if (opts.tab === "mine" && m.ownerId !== session.userId) return false;
        if (opts.q) {
          var q = opts.q.toLowerCase();
          var hay = ((m.title ? m.title + " " : "") + plainContent(m.content) + " " + m.nicknameSnapshot + " " + (m.topicTag || "")).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });

      // 排行榜计算（折合分 / 排序 / 历史最高）全在前端 HMB.util.rankBoard 完成：
      // api 只回传原始 stats + period + createdAt，不排序、不算分、不写 peak。
      // 前端按 sort / tab / 搜索词决定是否维护 peak，口径见 util.js rankBoard。

      var likedIds = [];
      if (session) {
        likedIds = db.getLikes()
          .filter(function (l) { return l.userId === session.userId; })
          .map(function (l) { return l.targetId; });
      }
      return ok({
        list: list.map(toListMessage),
        total: list.length,
        likedIds: likedIds
      });
    });
  }

  /**
   * 单条留言（详情页用；浏览 +1 best-effort）。
   * opts.countView=false 时不计浏览（帖子编辑页读取原文不得推高浏览量）。
   * 帖子可见类型：isPublic=false 仅自己可见，非作者读取 → 5001（他人视图中不存在）。
   */
  function apiGetMessage(resourceId, opts) {
    opts = opts || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === resourceId; });
      if (!m) return fail(5001, "error.5001");
      var session = currentSession(true);
      if (m.isPublic === false &&
          !(session && session.userId === m.ownerId)) return fail(5001, "error.5001");
      if (m.hidden === true &&
          !(session && session.userId === m.ownerId)) return fail(5001, "error.5001");
      if (opts.countView !== false) {
        m.stats.views += 1;
        db.saveMessages(messages);
      }
      var data = toListMessage(m);
      data.isMine = !!(session && session.userId === m.ownerId);
      // 当前访问者的互动状态：详情卡据此点亮爱心 / 星标
      data.isLiked = !!(session && db.hasLike(session.userId, resourceId));
      data.isFavorite = !!(session && db.hasFavorite(session.userId, resourceId));
      return ok(data);
    });
  }

  /** 发布留言（API-04W，F5 无刷新提交） */
  function apiPostMessage(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var s = auth.session;
      var muted = muteGate(s.userId);
      if (muted) return muted;

      var content = String(args.content || "").trim();
      var plain = plainContent(content);                 // 富文本按可见文字计字数
      if (!plain || plain.length > 500) return fail(9001, "error.9001");
      // 选填标题（参照 sendThreadShow「标题（选填）·48 字以内」），敏感词同检
      var title = (args.title || "").trim();
      if (title.length > 48) return fail(9001, "error.9001");
      var gate = messageSecurityGate(s.userId, plain + " " + title); // 发留言：敏感词 + 限流（F10）
      if (gate) return gate;
      rateRecord(s.userId);

      // F4：本次昵称 → 更新当前昵称，历史内容保留快照
      var users = db.getUsers();
      var user = users.find(function (x) { return x.id === s.userId; });
      var nick = (args.nickname || "").trim();
      if (nick && nick.length >= 1 && nick.length <= 20 && nick !== user.nickname) {
        user.nickname = nick;
        db.saveUsers(users);
      }

      var settings = db.getSettings();
      var m = {
        resourceId: uuid(),
        no: rnd(8),
        ownerId: s.userId,
        title: title,
        content: content,
        nicknameSnapshot: nick || user.nickname,
        avatarEnum: user.avatarEnum,
        avatarUrlSnapshot: user.avatarUrl || "",   // 发帖时头像快照（真实头像引用，历史不变）
        images: sanitizeImages(args.images),        // 文末图片引用，最多 10 张
        displayId: user.displayId,
        topicTag: args.topic || "",
        isPublic: true,
        period: settings.currentPeriod,
        createdAt: Date.now(),
        stats: { views: 0, likes: 0, comments: 0, favorites: 0 },
        heatDelta: 0, peakRank: 0, peakNewRank: 0, // heat 由出口层按周榜分数公式实时计算，不落库；双榜历史最高各自维护
        weeklyStats: [], // 新帖暂无历史周数据，折线图缺失期次一律 0，不估算
        isNew: true
      };
      var messages = db.getMessages();
      messages.push(m);
      db.saveMessages(messages);

      return ok(toListMessage(m));
    });
  }

  /* ---------------- 评论树（API-05 / 06 / 09，F7） ---------------- */

  function toCommentOut(c, session) {
    var anon = !!c.isAnonymous;
    return {
      resourceId: c.resourceId,
      messageId: c.messageId,
      parentId: c.parentId,
      depth: c.depth,
      authorName: anon ? t("common.anonymous") : c.authorName,
      authorAvatar: anon ? 0 : c.authorAvatar,
      authorDisplayId: anon ? "" : c.authorDisplayId,
      atDisplayId: c.atDisplayId || "",
      atAuthorName: c.atAuthorName || "",
      content: c.content,
      createdAt: c.createdAt,
      likes: c.likes,
      favorites: c.favorites || 0,
      // 当前访问者对评论的互动状态（未登录恒 false）
      isLiked: !!(session && db.hasLike(session.userId, c.resourceId)),
      isFavorite: !!(session && db.hasFavorite(session.userId, c.resourceId)),
      edited: !!c.edited,
      isAnonymous: anon,
      hidden: !!c.hidden, hiddenReason: c.hiddenReason || "",
      // 前端绝不返回匿名回复的真实身份（F9/D-02）：isMine 对匿名一律 false
      isMine: !anon && !!(session && session.userId === c.ownerId)
    };
  }

  function buildCommentTree(messageId, session) {
    // GM 隐藏评论：普通视图不展示，其下回复也一并不展示（本人可见自己的隐藏评论）
    var visible = db.getComments().filter(function (c) {
      return c.messageId === messageId &&
        !(c.hidden === true && !(session && session.userId === c.ownerId));
    });
    var visibleIds = {};
    visible.forEach(function (c) { visibleIds[c.resourceId] = true; });
    var all = visible.filter(function (c) { return !c.parentId || visibleIds[c.parentId]; });
    var roots = [];
    var byId = {};
    all.forEach(function (c) { byId[c.resourceId] = toCommentOut(c, session); });
    all.forEach(function (c) {
      var out = byId[c.resourceId];
      if (!c.parentId || !byId[c.parentId]) roots.push(out);
      else {
        var parentOut = byId[c.parentId];
        parentOut.replies = parentOut.replies || [];
        parentOut.replies.push(out);
      }
    });
    // 时间正序（旧→新），回复同理
    roots.sort(function (a, b) { return a.createdAt - b.createdAt; });
    Object.keys(byId).forEach(function (k) {
      if (byId[k].replies) byId[k].replies.sort(function (a, b) { return a.createdAt - b.createdAt; });
    });
    return roots;
  }

  function apiGetComments(messageId) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var session = currentSession(true);
      var m = db.findMessage(messageId);
      if (!m) return fail(5001, "error.5001");
      return ok({ list: buildCommentTree(messageId, session), total: m.stats.comments });
    });
  }

  function apiPostComment(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var s = auth.session;
      var muted = muteGate(s.userId);
      if (muted) return muted;

      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === args.messageId; });
      if (!m) return fail(5001, "error.5001");

      var content = (args.content || "").trim();
      if (!content || content.length > 500) return fail(9001, "error.9001");

      var gate = sensitiveGate(content); // 评论/回复：仅敏感词门（F10）
      if (gate) return gate;

      var users = db.getUsers();
      var user = users.find(function (x) { return x.id === s.userId; });
      var nick = (args.nickname || "").trim();
      if (nick && nick.length >= 1 && nick.length <= 20 && nick !== user.nickname) {
        user.nickname = nick;
        db.saveUsers(users);
      }

      // 层级校验：一级评论 / 二级回复，最多二级（超限 400 + 5003）
      var parentId = args.parentId || null;
      var depth = 1, rootId = null, atDisplayId = args.atDisplayId || "", atAuthorName = "";
      if (parentId) {
        var comments = db.getComments();
        var parent = comments.find(function (c) { return c.resourceId === parentId; });
        if (!parent) return fail(5001, "error.5001");
        if (parent.depth >= 2) return fail(5003, "error.5003");
        depth = 2;
        rootId = parent.rootId || parent.resourceId;
        var parentAuthor = db.findUserById(parent.ownerId);
        atDisplayId = parentAuthor ? parentAuthor.displayId : (parent.authorDisplayId || atDisplayId);
        atAuthorName = parent.isAnonymous ? t("common.anonymous") : (parentAuthor ? parentAuthor.nickname : (parent.authorName || ""));
      }

      var c = {
        resourceId: uuid(),
        messageId: m.resourceId,
        parentId: parentId,
        rootId: rootId,
        depth: depth,
        ownerId: s.userId,
        authorName: nick || user.nickname,
        authorAvatar: user.avatarEnum,
        authorDisplayId: user.displayId,
        atDisplayId: atDisplayId,
        atAuthorName: atAuthorName,
        content: content,
        createdAt: Date.now(),
        likes: 0,
        edited: false,
        likedBy: []
      };
      var list = db.getComments();
      list.push(c);
      db.saveComments(list);
      m.stats.comments += 1;
      db.saveMessages(messages);

      return ok(toCommentOut(c, s));
    });
  }

  /* ---------------- 内容改删（API-07，F7） ---------------- */

  function apiUpdateContent(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var s = auth.session;

      var content = String(args.content || "").trim();
      var plain = plainContent(content);
      if (!plain || plain.length > 500) return fail(9001, "error.9001");

      // 先查留言，再查评论（owner 校验防 IDOR）
      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === args.resourceId; });
      if (m) {
        if (m.ownerId !== s.userId) return fail(5002, "error.5002");
        var gate = sensitiveGate(plain); // 改删/编辑：仅敏感词门（F10）
        if (gate) return gate;
        m.content = content;
        if (args.title !== undefined) {
          var t2 = (args.title || "").trim();
          if (t2.length > 48) return fail(9001, "error.9001");
          var gateT = sensitiveGate(t2);
          if (gateT) return gateT;
          m.title = t2;
        }
        // 帖子编辑页扩展：话题（白名单校验）与可见类型随保存提交；未传参保持原值（评论编辑不传）
        if (args.topic !== undefined) {
          var topic = (args.topic || "").trim();
          if (topic && seed.TOPICS.indexOf(topic) < 0) return fail(9001, "error.9001");
          m.topicTag = topic;
        }
        if (args.isPublic !== undefined) m.isPublic = !!args.isPublic;
        // 文末图片：传 images 时整体替换（含全部删除→空数组）；未传保持原值（评论编辑不传）
        if (args.images !== undefined) m.images = sanitizeImages(args.images);
        m.edited = true;
        db.saveMessages(messages);
        return ok(toListMessage(m));
      }

      var comments = db.getComments();
      var c = comments.find(function (x) { return x.resourceId === args.resourceId; });
      if (!c) return fail(5001, "error.5001");
      if (c.ownerId !== s.userId) return fail(5002, "error.5002");
      var gate2 = sensitiveGate(content);
      if (gate2) return gate2;
      c.content = content;
      c.edited = true;
      db.saveComments(comments);
      return ok({});
    });
  }

  function apiDeleteContent(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var s = auth.session;

      var messages = db.getMessages();
      var mi = messages.findIndex(function (x) { return x.resourceId === args.resourceId; });
      if (mi >= 0) {
        if (messages[mi].ownerId !== s.userId) return fail(5002, "error.5002");
        var rid = messages[mi].resourceId;
        messages.splice(mi, 1);
        db.saveMessages(messages);
        // 级联：留言下全部评论 + 相关点赞（单事务语义）
        db.saveComments(db.getComments().filter(function (c) { return c.messageId !== rid; }));
        db.saveLikes(db.getLikes().filter(function (l) { return l.targetId !== rid; }));
        return ok({});
      }

      var comments = db.getComments();
      var ci = comments.findIndex(function (x) { return x.resourceId === args.resourceId; });
      if (ci < 0) return fail(5001, "error.5001");
      if (comments[ci].ownerId !== s.userId) return fail(5002, "error.5002");
      var c = comments[ci];
      var rootId = c.rootId || c.resourceId;
      // 删一级评论 → 按 root_id 级联删除整棵子树（F7）
      var kept = comments.filter(function (x) {
        return x.resourceId !== c.resourceId &&
          !(x.rootId === rootId || x.resourceId === rootId);
      });
      db.saveComments(kept);
      var messages2 = db.getMessages();
      var msg = messages2.find(function (x) { return x.resourceId === c.messageId; });
      if (msg && msg.stats.comments > 0) {
        msg.stats.comments -= 1; // 计数按一级评论数递减（子回复随树删除）
        db.saveMessages(messages2);
      }
      db.saveLikes(db.getLikes().filter(function (l) { return l.targetId !== c.resourceId; }));
      return ok({});
    });
  }

  /* ---------------- 点赞（API-10，F8 四态状态机） ---------------- */

  var idemSeen = {}; // 幂等键去重（进程级；真实系统由唯一约束 + 幂等键兜底）

  function apiLike(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var s = currentSession(true);
      if (!s) return fail(401, "error.401"); // 未登录 → 401 引导，计数不变
      if (!args.csrf || args.csrf !== s.csrf) return fail(9002, "error.9002");

      var targetId = args.targetId;
      var comments = db.getComments();
      var ci = comments.findIndex(function (x) { return x.resourceId === targetId; });
      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === targetId; });
      if (!m && ci < 0) return fail(5001, "error.5001");

      // 幂等键：重复请求保持当前状态，不出现 +2/-1 抖动（F8）
      var idemKey = args.idemKey || "";
      if (idemKey && idemSeen[idemKey]) {
        var cur0 = db.hasLike(s.userId, targetId);
        return ok({ liked: cur0, count: m ? m.stats.likes : comments[ci].likes });
      }
      if (idemKey) idemSeen[idemKey] = true;

      var liked = db.hasLike(s.userId, targetId);
      var op = args.op || (liked ? "unlike" : "like");
      if (op === "like" && !liked) {
        var likes = db.getLikes();
        likes.push({ userId: s.userId, targetId: targetId });
        db.saveLikes(likes); // (user_id, target_id) 唯一约束语义
        liked = true;
        if (m) { m.stats.likes += 1; db.saveMessages(messages); }
        else { comments[ci].likes += 1; db.saveComments(comments); }
      } else if (op === "unlike" && liked) {
        db.saveLikes(db.getLikes().filter(function (l) {
          return !(l.userId === s.userId && l.targetId === targetId);
        }));
        liked = false;
        if (m) { m.stats.likes = Math.max(0, m.stats.likes - 1); db.saveMessages(messages); }
        else { comments[ci].likes = Math.max(0, comments[ci].likes - 1); db.saveComments(comments); }
      }
      // 其余分支：状态保持，返回当前值（类型固定：liked 布尔 / count 整数）
      return ok({
        liked: liked,
        count: m ? m.stats.likes : comments[ci].likes
      });
    });
  }

  /* ---------------- 收藏（帖子 + 评论，幂等；与点赞分表） ---------------- */

  var favIdemSeen = {};

  function apiFavorite(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var s = currentSession(true);
      if (!s) return fail(401, "error.401");
      if (!args.csrf || args.csrf !== s.csrf) return fail(9002, "error.9002");

      var targetId = args.targetId;
      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === targetId; });
      var comments = db.getComments();
      var ci = comments.findIndex(function (x) { return x.resourceId === targetId; });
      if (!m && ci < 0) return fail(5001, "error.5001");

      var count = function () {
        return m ? m.stats.favorites : (comments[ci].favorites || 0);
      };
      var idemKey = args.idemKey || "";
      if (idemKey && favIdemSeen[idemKey]) {
        return ok({ favorite: db.hasFavorite(s.userId, targetId), count: count() });
      }
      if (idemKey) favIdemSeen[idemKey] = true;

      var fav = db.hasFavorite(s.userId, targetId);
      var op = args.op || (fav ? "unfavorite" : "favorite");
      if (op === "favorite" && !fav) {
        var fs = db.getFavorites();
        fs.push({ userId: s.userId, targetId: targetId, createdAt: Date.now() });
        db.saveFavorites(fs);
        fav = true;
        if (m) { m.stats.favorites += 1; db.saveMessages(messages); }
        else { comments[ci].favorites = (comments[ci].favorites || 0) + 1; db.saveComments(comments); }
      } else if (op === "unfavorite" && fav) {
        db.saveFavorites(db.getFavorites().filter(function (f) {
          return !(f.userId === s.userId && f.targetId === targetId);
        }));
        fav = false;
        if (m) { m.stats.favorites = Math.max(0, m.stats.favorites - 1); db.saveMessages(messages); }
        else { comments[ci].favorites = Math.max(0, (comments[ci].favorites || 0) - 1); db.saveComments(comments); }
      }
      return ok({ favorite: fav, count: count() });
    });
  }

  /* ---------------- 盲盒（API-11 / API-12，F9） ---------------- */

  function apiGetBlindbox() {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var s = currentSession(true);
      if (!s) return fail(401, "error.401");

      // 候选集：他人的、公开的、未删除的、非空的留言（排除自己）
      var candidates = db.getMessages().filter(function (m) {
        return m.ownerId !== s.userId && m.isPublic !== false && m.hidden !== true &&
          plainContent(m.content).length > 0;
      });
      if (candidates.length === 0) return ok({ message: null });
      var picked = candidates[Math.floor(Math.random() * candidates.length)];
      var out = toListMessage(picked);
      out.authorNickname = picked.nicknameSnapshot;
      out.authorDisplayId = picked.displayId;
      return ok({ message: out });
    });
  }

  function apiBlindboxReply(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var s = auth.session;
      var muted = muteGate(s.userId);
      if (muted) return muted;

      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === args.messageId; });
      if (!m) return fail(5001, "error.5001");

      var content = (args.content || "").trim();
      if (!content || content.length > 500) return fail(9001, "error.9001");

      var gate = sensitiveGate(content); // 盲盒回复：仅敏感词门（F10）
      if (gate) return gate;

      // 匿名回复：内容对原作者可见，显示“热心同学”；
      // 服务端留痕真实身份（blindboxReplies），前端接口绝不返回（D-02）
      var c = {
        resourceId: uuid(),
        messageId: m.resourceId,
        parentId: null, rootId: null, depth: 1,
        ownerId: s.userId, // 留痕（审计与删除用），输出层永不暴露
        authorName: t("common.anonymous"),
        authorAvatar: 0,
        authorDisplayId: "",
        isAnonymous: true,
        content: content,
        createdAt: Date.now(),
        likes: 0, edited: false, likedBy: []
      };
      var list = db.getComments();
      list.push(c);
      db.saveComments(list);
      m.stats.comments += 1;
      db.saveMessages(messages);

      var traces = db.getBlindboxReplies();
      traces.push({ replyId: c.resourceId, messageId: m.resourceId, realOwnerId: s.userId, at: Date.now() });
      db.saveBlindboxReplies(traces);

      return ok(toCommentOut(c, s));
    });
  }

  /* ---------------- 个人主页（扩展，参照好游快爆 zone 页设计） ---------------- */

  /**
   * 公开个人主页聚合（按展示 ID 查询，访客可看）：
   * - 用户公开面：昵称 / emoji 头像 / 展示 ID / 签名 / 注册时间；掩码字段仅在本人开关开启时返回
   * - 动态流：公开留言 + 非匿名评论（引用原帖摘要）
   * - 红线 F9/D-02：匿名（盲盒）回复绝不出现在作者主页 —— 前端接口不返回其归属关系
   * - 可见类型：仅自己可见的留言与其下的评论，对他人一律不可见
   */
  function apiGetZone(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var session = currentSession(true);
      var u = db.getUsers().find(function (x) { return x.displayId === args.displayId; });
      if (!u) return fail(5001, "zone.userNotFound");

      var isSelf = !!(session && session.userId === u.id);
      var allMessages = db.getMessages();
      var msgById = {};
      allMessages.forEach(function (m) { msgById[m.resourceId] = m; });

      // 仅自己可见：本人主页可见（isSelf），他人不可见；其下评论同理
      var messages = allMessages.filter(function (m) {
        return m.ownerId === u.id && (isSelf || (m.isPublic !== false && m.hidden !== true));
      });
      var comments = db.getComments().filter(function (c) {
        if (c.ownerId !== u.id || c.isAnonymous) return false;
        if (c.hidden === true && !isSelf) return false;
        var m = msgById[c.messageId];
        return m && (isSelf || m.isPublic !== false);
      });

      function zoneComment(c) {
        var parent = msgById[c.messageId];
        if (!parent) return null;
        return {
          resourceId: c.resourceId,
          messageId: c.messageId,
          content: c.content,
          createdAt: c.createdAt,
          likes: c.likes,
          favorites: c.favorites || 0,
          edited: !!c.edited,
          message: {
            resourceId: parent.resourceId,
            title: parent.title || "",
            content: parent.content,
            topicTag: parent.topicTag || "",
            nicknameSnapshot: parent.nicknameSnapshot,
            createdAt: parent.createdAt
          }
        };
      }

      function visibleToVisitor(m) {
        return !!m && (isSelf || (m.isPublic !== false && m.hidden !== true));
      }

      /** 我赞过的 / 我收藏的：按目标 id 聚合帖子与评论，时间倒序。
          本人始终可见；他人仅当对应公开开关开启时由出口返回数据。 */
      function interactions(kind) {
        var rows = kind === "liked" ? db.getLikes() : db.getFavorites();
        var allComments = db.getComments();
        var posts = [], replies = [];
        rows.forEach(function (x) {
          if (x.userId !== u.id) return;
          var m = msgById[x.targetId];
          if (visibleToVisitor(m)) { posts.push(m); return; }
          var c = allComments.find(function (y) { return y.resourceId === x.targetId; });
          if (c && !c.isAnonymous && visibleToVisitor(msgById[c.messageId])) {
            var mapped = zoneComment(c);
            if (mapped) replies.push(mapped);
          }
        });
        posts.sort(function (a, b) { return b.createdAt - a.createdAt; });
        replies.sort(function (a, b) { return b.createdAt - a.createdAt; });
        return { posts: posts.map(toListMessage), comments: replies };
      }

      var likesReceived = messages.reduce(function (s, m) { return s + m.stats.likes; }, 0) +
        comments.reduce(function (s, c) { return s + (c.likes || 0); }, 0);

      // 盲盒匿名回复：仅本人可见自己的送出记录（F9 不泄露给原作者以外的人；
      // 这里只回给真实发送者本人，绝不回给接收者/访客）。
      var blindboxMessages = [];
      if (isSelf) {
        var allComments = db.getComments();
        blindboxMessages = db.getBlindboxReplies().filter(function (tr) {
          return tr.realOwnerId === u.id;
        }).map(function (tr) {
          var c = allComments.find(function (x) { return x.resourceId === tr.replyId; });
          var target = msgById[tr.messageId];
          if (!c || !target) return null;
          return {
            replyId: c.resourceId,
            content: c.content,
            createdAt: c.createdAt,
            target: {
              resourceId: target.resourceId,
              title: target.title || "",
              excerpt: plainContent(target.content).slice(0, 60)
            }
          };
        }).filter(Boolean).sort(function (a, b) { return b.createdAt - a.createdAt; });
      }

      var topicsMap = {};
      messages.forEach(function (m) {
        if (m.topicTag) topicsMap[m.topicTag] = (topicsMap[m.topicTag] || 0) + 1;
      });
      var topics = Object.keys(topicsMap).map(function (tag) {
        return { tag: tag, count: topicsMap[tag] };
      }).sort(function (a, b) { return b.count - a.count; });

      return ok({
        isSelf: isSelf,
        user: {
          displayId: u.displayId,
          nickname: u.nickname,
          avatarEnum: u.avatarEnum,
          avatarUrl: u.avatarUrl || "",
          bio: u.bio || "",
          createdAt: u.createdAt,
          // F6：主页只展示掩码，且仅在本人公开开关开启时非空
          maskedName: u.flagName ? maskName(u.realName) : "",
          maskedEmail: u.flagEmail ? maskEmail(u.email) : "",
          maskedPhone: u.flagPhone ? maskPhone(u.account) : ""
        },
        memberDays: Math.max(1, Math.ceil((Date.now() - u.createdAt) / 86400000)),
        stats: {
          messages: messages.length,
          comments: comments.length,
          likesReceived: likesReceived
        },
        topics: topics,
        blindboxMessages: blindboxMessages,   // 仅本人有值；他人恒为空数组
        // 互动展示开关：本人恒 true；他人按设置决定主页是否出现这两个域
        canSeeLiked: isSelf || !!u.flagLiked,
        canSeeFavorite: isSelf || !!u.flagFavorite,
        liked: (isSelf || u.flagLiked !== false) ? interactions("liked") : { posts: [], comments: [] },
        favorite: (isSelf || u.flagFavorite !== false) ? interactions("favorite") : { posts: [], comments: [] },
        messages: messages.map(toListMessage),
        comments: comments.map(zoneComment).filter(Boolean)
      });
    });
  }

  /* ---------------- 个人中心（API-08 + 扩展，F6/F4） ---------------- */

  function apiGetProfile() {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var s = currentSession(true);
      if (!s) return fail(401, "error.401");
      var u = db.findUserById(s.userId);
      if (!u) return fail(401, "error.401");
      // 本人完整信息仅此接口返回（列表接口永远只有掩码）
      return ok({
        displayId: u.displayId,
        nickname: u.nickname,
        avatarEnum: u.avatarEnum,
        avatarUrl: u.avatarUrl || "",
        account: u.account,
        realName: u.realName || "",
        email: u.email || "",
        bio: u.bio || "",
        flagName: !!u.flagName,
        flagEmail: !!u.flagEmail,
        flagPhone: !!u.flagPhone,
        flagLiked: u.flagLiked !== false,
        flagFavorite: u.flagFavorite !== false,
        maskedName: maskName(u.realName),
        maskedEmail: maskEmail(u.email),
        maskedPhone: maskPhone(u.account)
      });
    });
  }

  function apiUpdatePrivacy(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var users = db.getUsers();
      var u = users.find(function (x) { return x.id === auth.session.userId; });
      if (!u) return fail(401, "error.401");
      u.flagName = !!args.flagName;
      u.flagEmail = !!args.flagEmail;
      u.flagPhone = !!args.flagPhone;
      // 互动展示开关：缺省保留原值，兼容旧调用方
      if (args.flagLiked !== undefined) u.flagLiked = !!args.flagLiked;
      if (args.flagFavorite !== undefined) u.flagFavorite = !!args.flagFavorite;
      db.saveUsers(users);
      return ok({});
    });
  }

  /** F4 昵称 / 个性签名（写时快照：历史留言保留当时昵称；签名展示在个人主页） */
  function apiUpdateNickname(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var nick = (args.nickname || "").trim();
      if (!nick || nick.length > 20) return fail(9001, "error.9001");
      if (args.bio !== undefined) {
        var bio = (args.bio || "").trim();
        if (bio.length > 60) return fail(9001, "error.9001");
      }
      // 编辑资料扩展：emoji 头像 8 选 1（F1 词库，历史留言保留当时头像快照）
      if (args.avatarEnum !== undefined) {
        var av = parseInt(args.avatarEnum, 10);
        if (!(av >= 1 && av <= seed.AVATARS.length)) return fail(9001, "error.9001");
      }
      var users = db.getUsers();
      var u = users.find(function (x) { return x.id === auth.session.userId; });
      if (!u) return fail(401, "error.401");
      u.nickname = nick; // 写时快照：历史留言保留当时昵称（D-03）
      if (args.bio !== undefined) u.bio = (args.bio || "").trim();
      if (args.avatarEnum !== undefined) u.avatarEnum = parseInt(args.avatarEnum, 10);
      // 头像上传（追风杯式字符串引用）：localimg://id 存 users.avatarUrl；
      // 传空串表示回退 emoji 头像（avatarEnum）。业务字段只存引用，不存二进制。
      if (args.avatarUrl !== undefined) {
        var au = String(args.avatarUrl || "");
        if (au && au.indexOf("localimg://") !== 0) return fail(9001, "error.9001");
        u.avatarUrl = au;
      }
      db.saveUsers(users);
      return ok({ nickname: nick, bio: u.bio || "", avatar: u.avatarEnum, avatarUrl: u.avatarUrl || "" });
    });
  }

  /* ---------------- 敏感信息编辑（API-08 扩展，F6 出口仍脱敏） ---------------- */

  /**
   * 真实姓名 / 邮箱可编辑；手机号 = 登录账号，不可修改（账号语义）。
   * 校验：姓名 ≤20 字；邮箱格式 + ≤60 字（均选填，可清空）。
   * 写后 F6 出口掩码即时变化（脱敏在出口层，不在存储层）。
   */
  function apiUpdateSensitive(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var realName = (args.realName !== undefined) ? args.realName.trim() : null;
      var email = (args.email !== undefined) ? args.email.trim() : null;
      if (realName !== null && realName.length > 20) return fail(9001, "error.9001");
      if (email !== null) {
        if (email.length > 60) return fail(9001, "error.9001");
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(9001, "profile.emailInvalid");
      }
      var users = db.getUsers();
      var u = users.find(function (x) { return x.id === auth.session.userId; });
      if (!u) return fail(401, "error.401");
      if (realName !== null) u.realName = realName;
      if (email !== null) u.email = email;
      db.saveUsers(users);
      return ok({
        realName: u.realName || "",
        email: u.email || "",
        maskedName: maskName(u.realName),
        maskedEmail: maskEmail(u.email)
      });
    });
  }

  /* ================= GM 管理接口（G1–G17，文档 §6.3） ================= */

  /** G1 概览 */
  function gmSummary() {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdminRead();
      if (auth.err) return auth.err;
      var users = db.getUsers();
      var messages = db.getMessages();
      var comments = db.getComments();
      var actions = db.getAdminActions();
      var dayAgo = Date.now() - 86400000;
      return ok({
        users: {
          total: users.length,
          active: users.filter(function (u) { return u.status !== "banned"; }).length,
          banned: users.filter(function (u) { return u.status === "banned"; }).length,
          admins: users.filter(isAdmin).length,
          muted: users.filter(function (u) { return u.muteUntil && u.muteUntil > Date.now(); }).length
        },
        contents: {
          messages: messages.length,
          comments: comments.length,
          hiddenMessages: messages.filter(function (m) { return m.hidden === true; }).length,
          hiddenComments: comments.filter(function (c) { return c.hidden === true; }).length
        },
        today: {
          newUsers: users.filter(function (u) { return u.createdAt > dayAgo; }).length,
          newMessages: messages.filter(function (m) { return m.createdAt > dayAgo; }).length,
          newComments: comments.filter(function (c) { return c.createdAt > dayAgo; }).length
        },
        actions: {
          total: actions.length,
          today: actions.filter(function (a) { return a.createdAt > dayAgo; }).length
        },
        // 设置页回填用（G15 / G16 的当前值），避免页面直接读数据库
        settings: {
          sensitiveWords: (db.getSettings().sensitiveWords || []).slice(),
          currentPeriod: db.getSettings().currentPeriod
        }
      });
    });
  }

  /** G2 用户列表 */
  function gmUsers(args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdminRead();
      if (auth.err) return auth.err;
      var q = (args.q || "").toLowerCase();
      var status = args.status || "all";
      var role = args.role || "all";
      var list = db.getUsers().filter(function (u) {
        if (status !== "all" && (u.status || "active") !== status) return false;
        if (role !== "all" && (u.role || "user") !== role) return false;
        if (!q) return true;
        return [u.account, u.displayId, u.nickname, u.realName]
          .some(function (v) { return String(v || "").toLowerCase().indexOf(q) >= 0; });
      }).map(toGmUser).sort(function (a, b) { return b.createdAt - a.createdAt; });
      var out = paginate(list, args.page, args.pageSize);
      // 读取敏感字段（完整手机号/邮箱）须写审计
      var kw = String(args.q || "").trim();
      audit(auth.user, "user.read_sensitive", "user", "list",
        kw ? ("查看账号信息：搜索「" + kw + "」，命中 " + out.total + " 条")
           : ("查看账号信息：全部账号，共 " + out.total + " 条"));
      return ok(out);
    });
  }

  /** G3 用户详情 */
  function gmUserDetail(userId) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdminRead();
      if (auth.err) return auth.err;
      var u = db.findUserById(userId);
      if (!u) return fail(5001, "error.5001");
      var out = toGmUser(u);
      out.recentActionIds = db.getAdminActions().filter(function (a) {
        return String(a.targetId) === String(userId) && a.targetType === "user";
      }).sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 10).map(function (a) { return a.id; });
      return ok(out);
    });
  }

  /** G4 封禁 / 解封 */
  function gmSetUserStatus(userId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var u = db.findUserById(userId);
      var guard = guardTarget(auth.user, u, args.status === "banned" ? "ban" : "none");
      if (guard) return guard;
      var status = args.status === "banned" ? "banned" : "active";
      if ((u.status || "active") === status) return fail(6006, "error.6006");
      u.status = status;
      u.banReason = status === "banned" ? (args.reason || "") : "";
      u.bannedAt = status === "banned" ? Date.now() : 0;
      db.saveUsers(db.getUsers().map(function (x) { return x.id === u.id ? u : x; }));
      if (status === "banned") revokeUserSessions(u.id);
      audit(auth.user, status === "banned" ? "user.ban" : "user.unban", "user", u.id, args.reason || "");
      return ok({ id: u.id, status: u.status, muteUntil: u.muteUntil || 0 });
    });
  }

  /** G5 禁言 / 解除（1h / 1d / 7d / 永久 / 解除） */
  function gmSetUserMute(userId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var u = db.findUserById(userId);
      var guard = guardTarget(auth.user, u, "none");
      if (guard) return guard;
      var dur = Number(args.durationSec);
      if ([3600, 86400, 604800, -1, 0].indexOf(dur) < 0) return fail(6005, "error.6005");
      var until = dur === -1 ? 253402300800000 : (dur === 0 ? 0 : Date.now() + dur * 1000);
      if ((u.muteUntil || 0) === until) return fail(6006, "error.6006");
      u.muteUntil = until;
      u.muteReason = dur === 0 ? "" : (args.reason || "");
      db.saveUsers(db.getUsers().map(function (x) { return x.id === u.id ? u : x; }));
      audit(auth.user, dur === 0 ? "user.unmute" : "user.mute", "user", u.id,
        (dur === 0 ? "解除禁言" : "时长 " + dur + " 秒") + (args.reason ? "｜" + args.reason : ""));
      return ok({ id: u.id, muteUntil: until, muted: until > Date.now() });
    });
  }

  /** G6 角色调整 */
  function gmSetUserRole(userId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var u = db.findUserById(userId);
      var guard = guardTarget(auth.user, u, args.role === "user" ? "demote" : "none");
      if (guard) return guard;
      var role = args.role === "admin" ? "admin" : "user";
      if ((u.role || "user") === role) return fail(6006, "error.6006");
      u.role = role;
      db.saveUsers(db.getUsers().map(function (x) { return x.id === u.id ? u : x; }));
      // 角色变更后已有会话立即失效（重新登录才生效新角色）
      revokeUserSessions(u.id);
      audit(auth.user, "user.role", "user", u.id, role);
      return ok({ id: u.id, role: role, isAdmin: role === "admin" });
    });
  }

  /** G7 修改用户信息（detail 只记字段名，不记明文值） */
  function gmUpdateUserProfile(userId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var u = db.findUserById(userId);
      var guard = guardTarget(auth.user, u, "none");
      if (guard) return guard;
      var fields = [];
      if (args.nickname !== undefined) {
        var nick = String(args.nickname).trim();
        if (!nick || nick.length > 20) return fail(6005, "error.6005");
        u.nickname = nick; fields.push("nickname");
      }
      if (args.bio !== undefined) {
        var bio = String(args.bio).trim();
        if (bio.length > 60) return fail(6005, "error.6005");
        u.bio = bio; fields.push("bio");
      }
      if (args.avatarEnum !== undefined) {
        var av = Number(args.avatarEnum);
        if (!(av >= 1 && av <= seed.AVATARS.length)) return fail(6005, "error.6005");
        u.avatarEnum = av; fields.push("avatarEnum");
      }
      if (args.realName !== undefined) {
        var rn = String(args.realName).trim();
        if (rn.length > 20) return fail(6005, "error.6005");
        u.realName = rn; fields.push("realName");
      }
      if (args.email !== undefined) {
        var em = String(args.email).trim();
        if (em.length > 60 || (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))) return fail(6005, "error.6005");
        u.email = em; fields.push("email");
      }
      ["flagName", "flagEmail", "flagPhone"].forEach(function (k) {
        if (args[k] !== undefined) { u[k] = !!args[k]; fields.push(k); }
      });
      if (!fields.length) return fail(6005, "error.6005");
      db.saveUsers(db.getUsers().map(function (x) { return x.id === u.id ? u : x; }));
      audit(auth.user, "user.profile_update", "user", u.id, fields.join(","));
      return ok({ id: u.id, nickname: u.nickname, bio: u.bio, avatarEnum: u.avatarEnum });
    });
  }

  /** G8 重置密码（不可操作内置账号 / 自己；吊销会话 + 强制改密） */
  function gmResetPassword(userId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var u = db.findUserById(userId);
      var guard = guardTarget(auth.user, u, "none");
      if (guard) return guard;
      var pwd = String(args.newPassword || "");
      if (pwd.length < 8 || pwd.length > 32 || !/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) {
        return fail(6005, "error.6005");
      }
      u.password = pwd; // 演示明文；真实系统为 bcrypt/加盐哈希
      u.mustChangePassword = true;
      db.saveUsers(db.getUsers().map(function (x) { return x.id === u.id ? u : x; }));
      revokeUserSessions(u.id);
      audit(auth.user, "user.reset_password", "user", u.id, "重置密码");
      return ok({ id: u.id, passwordReset: true });
    });
  }

  function toGmContent(type, item) {
    if (type === "message") {
      /* 列表只用 content 摘要；详情弹窗另取完整正文与下方评论。
         盲盒匿名回复沿用匿名红线：GM 出口也不暴露真实身份。 */
      var children = db.getComments().filter(function (c) {
        return c.messageId === item.resourceId;
      }).sort(function (a, b) { return a.createdAt - b.createdAt; }).map(function (c) {
        return {
          authorName: c.isAnonymous ? t("common.anonymous") : (c.authorName || ""),
          content: c.content || "", createdAt: c.createdAt, hidden: !!c.hidden
        };
      });
      return {
        type: "message", resourceId: item.resourceId, messageId: item.resourceId,
        title: item.title || "", content: plainContent(item.content).slice(0, 160),
        fullContent: item.content || "", comments: children,
        authorId: item.ownerId, authorNickname: item.nicknameSnapshot || "",
        createdAt: item.createdAt, hidden: !!item.hidden, hiddenReason: item.hiddenReason || "",
        period: item.period, stats: {
          views: item.stats.views, likes: item.stats.likes,
          comments: item.stats.comments, favorites: item.stats.favorites
        }
      };
    }
    var anon = !!item.isAnonymous;
    var parent = db.findMessage(item.messageId);
    return {
      type: "comment", resourceId: item.resourceId, messageId: item.messageId,
      title: parent ? ("回复：" + (parent.title || "留言")) : "评论",
      content: item.content,
      // 匿名红线：GM 也不暴露盲盒匿名回复的真实身份
      authorId: anon ? "" : item.ownerId,
      authorNickname: anon ? t("common.anonymous") : (item.authorName || ""),
      createdAt: item.createdAt, hidden: !!item.hidden, hiddenReason: item.hiddenReason || "",
      stats: { likes: item.likes || 0 }
    };
  }

  /** G9 内容统一列表 */
  function gmContents(args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdminRead();
      if (auth.err) return auth.err;
      var type = args.type || "all";
      var q = (args.q || "").toLowerCase();
      var hidden = String(args.hidden || "all");
      var list = [];
      if (type !== "comment") {
        db.getMessages().forEach(function (m) { list.push(toGmContent("message", m)); });
      }
      if (type !== "message") {
        db.getComments().forEach(function (c) { list.push(toGmContent("comment", c)); });
      }
      list = list.filter(function (x) {
        if (hidden === "1" && !x.hidden) return false;
        if (hidden === "0" && x.hidden) return false;
        if (!q) return true;
        return [x.title, x.content, x.authorNickname]
          .some(function (v) { return String(v || "").toLowerCase().indexOf(q) >= 0; });
      }).sort(function (a, b) { return b.createdAt - a.createdAt; });
      return ok(paginate(list, args.page, args.pageSize));
    });
  }

  /** G10 / G12 隐藏与显示 */
  function gmSetHidden(kind, resourceId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var isMsg = kind === "message";
      var list = isMsg ? db.getMessages() : db.getComments();
      var item = list.find(function (x) { return x.resourceId === resourceId; });
      if (!item) return fail(5001, "error.5001");
      var hidden = !!args.hidden;
      if (!!item.hidden === hidden) return fail(6006, "error.6006");
      item.hidden = hidden;
      item.hiddenReason = hidden ? (args.reason || "") : "";
      (isMsg ? db.saveMessages : db.saveComments).call(db, list);
      audit(auth.user, isMsg ? (hidden ? "message.hide" : "message.show") :
        (hidden ? "comment.hide" : "comment.show"), kind, resourceId, args.reason || "");
      return ok({ resourceId: resourceId, hidden: hidden });
    });
  }

  /** G11 / G13 硬删除（级联清理 + 审计） */
  function gmDelete(kind, resourceId, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var deletedComments = 0, deletedLikes = 0, deletedTraces = 0;
      if (kind === "message") {
        var messages = db.getMessages();
        var m = messages.find(function (x) { return x.resourceId === resourceId; });
        if (!m) return fail(5001, "error.5001");
        var comments = db.getComments();
        deletedComments = comments.filter(function (c) { return c.messageId === resourceId; }).length;
        db.saveComments(comments.filter(function (c) { return c.messageId !== resourceId; }));
        var likes = db.getLikes();
        var targets = {};
        comments.forEach(function (c) { if (c.messageId === resourceId) targets[c.resourceId] = true; });
        targets[resourceId] = true;
        deletedLikes = likes.filter(function (l) { return targets[l.targetId]; }).length;
        db.saveLikes(likes.filter(function (l) { return !targets[l.targetId]; }));
        var traces = db.getBlindboxReplies();
        deletedTraces = traces.filter(function (tr) { return tr.messageId === resourceId; }).length;
        db.saveBlindboxReplies(traces.filter(function (tr) { return tr.messageId !== resourceId; }));
        db.saveMessages(messages.filter(function (x) { return x.resourceId !== resourceId; }));
      } else {
        var allComments = db.getComments();
        var c0 = allComments.find(function (x) { return x.resourceId === resourceId; });
        if (!c0) return fail(5001, "error.5001");
        var rootId = c0.rootId || c0.resourceId;
        var removedIds = {};
        allComments.forEach(function (c) {
          if (c.resourceId === resourceId || (c0.depth === 1 && (c.rootId === rootId || c.resourceId === rootId))) {
            removedIds[c.resourceId] = true;
          }
        });
        deletedComments = Object.keys(removedIds).length;
        db.saveComments(allComments.filter(function (c) { return !removedIds[c.resourceId]; }));
        var allLikes = db.getLikes();
        deletedLikes = allLikes.filter(function (l) { return removedIds[l.targetId]; }).length;
        db.saveLikes(allLikes.filter(function (l) { return !removedIds[l.targetId]; }));
        var allTraces = db.getBlindboxReplies();
        deletedTraces = allTraces.filter(function (tr) { return removedIds[tr.replyId]; }).length;
        db.saveBlindboxReplies(allTraces.filter(function (tr) { return !removedIds[tr.replyId]; }));
        var msgs = db.getMessages();
        var parent = msgs.find(function (x) { return x.resourceId === c0.messageId; });
        if (parent && parent.stats.comments > 0) {
          parent.stats.comments -= 1;
          db.saveMessages(msgs);
        }
      }
      audit(auth.user, kind + ".delete", kind, resourceId, "级联清理评论 " + deletedComments);
      return ok({ resourceId: resourceId, deletedComments: deletedComments,
        deletedLikes: deletedLikes, deletedTraces: deletedTraces });
    });
  }

  /** G14 审计列表 */
  function gmActions(args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdminRead();
      if (auth.err) return auth.err;
      var list = db.getAdminActions().filter(function (a) {
        if (args.actorId && String(a.actorId) !== String(args.actorId)) return false;
        if (args.action && a.action !== args.action) return false;
        if (args.targetType && a.targetType !== args.targetType) return false;
        if (args.from && a.createdAt < Number(args.from)) return false;
        if (args.to && a.createdAt > Number(args.to)) return false;
        return true;
      }).sort(function (a, b) { return b.createdAt - a.createdAt; });
      return ok(paginate(list, args.page, args.pageSize));
    });
  }

  /** G15 / G16 配置修改 */
  function gmSetSettings(kind, args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      var settings = db.getSettings();
      if (kind === "sensitiveWords") {
        if (!Array.isArray(args.words)) return fail(6005, "error.6005");
        var words = [];
        args.words.forEach(function (w) {
          var s = String(w || "").trim();
          if (s && s.length <= 30 && words.indexOf(s) < 0) words.push(s);
        });
        settings.sensitiveWords = words;
        audit(auth.user, "settings.sensitive_words", "settings", "sensitiveWords", words.join(","));
      } else {
        var p = Number(args.period);
        if (!isFinite(p) || p < settings.currentPeriod) return fail(6005, "error.6005");
        settings.currentPeriod = p;
        audit(auth.user, "settings.current_period", "settings", "currentPeriod", String(p));
      }
      db.saveSettings(settings);
      return ok({ sensitiveWords: settings.sensitiveWords, currentPeriod: settings.currentPeriod });
    });
  }

  /** G17 重置演示数据：审计表保留最后一条重置记录 */
  function gmResetData(args) {
    args = args || {};
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAdmin(args.csrf);
      if (auth.err) return auth.err;
      if (args.confirm !== "RESET") return fail(6005, "error.6005");
      var entry = {
        id: "RESET" + Date.now().toString(36),
        actorId: auth.user.id, actorNickname: auth.user.nickname || "",
        action: "data.reset", targetType: "system", targetId: "all",
        detail: "重置演示数据", ip: "127.0.0.1", createdAt: Date.now()
      };
      db.reset();
      db.saveAdminActions([entry]);
      return ok({ reset: true, auditId: entry.id });
    });
  }

  /* ---------------- 会话查询 ---------------- */

  function apiGetSession() {
    var s = currentSession(true);
    if (!s) return ok({ loggedIn: false });
    var u = db.findUserById(s.userId);
    if (!u) return ok({ loggedIn: false });
    return ok({
      loggedIn: true,
      userId: u.id,
      nickname: u.nickname,
      avatarEnum: u.avatarEnum,
      avatarUrl: u.avatarUrl || "",
      displayId: u.displayId,
      role: u.role || "user",
      isAdmin: isAdmin(u),
      csrf: s.csrf
    });
  }

  /* ---------------- 汇出 ---------------- */

  window.HMB = window.HMB || {};
  window.HMB.api = {
    /* API-01 */ register: apiRegister,
    /* API-02 */ login: apiLogin,
    /* API-03 */ logout: apiLogout,
    /* API-04 */ getMessages: apiGetMessages,
    /* API-04W */ postMessage: apiPostMessage,
    /* API-05 */ postComment: apiPostComment,
    /* API-06 */ postReply: function (args) {
      // API-06 语义：commentId + content + atDisplayId → 二级回复
      return apiPostComment({
        messageId: args.messageId,
        parentId: args.commentId,
        content: args.content,
        atDisplayId: args.atDisplayId,
        nickname: args.nickname,
        csrf: args.csrf
      });
    },
    /* API-07 */ updateContent: apiUpdateContent,
    /* API-07 */ deleteContent: apiDeleteContent,
    /* API-08 */ getProfile: apiGetProfile,
    /* API-09 */ getComments: apiGetComments,
    /* API-10 */ like: apiLike,
    /* 收藏（帖子 + 评论） */ favorite: apiFavorite,
    /* API-11 */ getBlindbox: apiGetBlindbox,
    /* API-12 */ blindboxReply: apiBlindboxReply,
    /* 扩展 */   getMessage: apiGetMessage,
    /* 扩展 */   getZone: apiGetZone,
    /* 扩展 */   updatePrivacy: apiUpdatePrivacy,
    /* 扩展 */   updateNickname: apiUpdateNickname,
    /* 扩展 */   updateSensitive: apiUpdateSensitive,
    /* 扩展 */   getSession: apiGetSession,

    /* GM G1–G17 */
    gmSummary: gmSummary,
    gmUsers: gmUsers,
    gmUserDetail: gmUserDetail,
    gmSetUserStatus: gmSetUserStatus,
    gmSetUserMute: gmSetUserMute,
    gmSetUserRole: gmSetUserRole,
    gmUpdateUserProfile: gmUpdateUserProfile,
    gmResetPassword: gmResetPassword,
    gmContents: gmContents,
    gmSetMessageHidden: function (resourceId, args) { return gmSetHidden("message", resourceId, args); },
    gmDeleteMessage: function (resourceId, args) { return gmDelete("message", resourceId, args); },
    gmSetCommentHidden: function (resourceId, args) { return gmSetHidden("comment", resourceId, args); },
    gmDeleteComment: function (resourceId, args) { return gmDelete("comment", resourceId, args); },
    gmActions: gmActions,
    gmSetSensitiveWords: function (args) { return gmSetSettings("sensitiveWords", args); },
    gmSetCurrentPeriod: function (args) { return gmSetSettings("currentPeriod", args); },
    gmResetData: gmResetData,

    /* 调试辅助（演示面板） */
    _debug: {
      expireSession: function () {
        var active = readActive();
        if (!active) return false;
        var sessions = db.getSessions();
        var i = sessions.findIndex(function (s) { return s.token === active.token; });
        if (i < 0) return false;
        sessions[i].lastActive -= (SESSION_TTL + 60 * 1000); // 强制超时
        db.saveSessions(sessions);
        return true;
      },
      rateCount: function () {
        var s = currentSession(false);
        if (!s) return 0;
        var arr = (db.getRateWindow()["u" + s.userId] || [])
          .filter(function (ts) { return Date.now() - ts < RATE_WINDOW; });
        return arr.length;
      }
    }
  };
})(window);
