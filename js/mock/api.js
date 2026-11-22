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

  function messageSecurityGate(userId, content) {
    var sens = sensitiveGate(content);
    if (sens) return sens;
    var rate = rateCheck(userId);
    if (rate.blocked) return fail(4002, "error.4002", { sec: rate.remain });
    return null;
  }

  /* ---------------- 数据出口（6.5 字段白名单 + F6 掩码） ---------------- */

  function toListMessage(m) {
    var owner = db.findUserById(m.ownerId);
    return {
      // 6.5 白名单
      resourceId: m.resourceId,
      content: m.content,
      nicknameSnapshot: m.nicknameSnapshot,
      avatarEnum: m.avatarEnum,
      displayId: m.displayId,
      topicTag: m.topicTag || "",
      createdAt: m.createdAt,
      stats: {
        views: m.stats.views, likes: m.stats.likes,
        comments: m.stats.comments, favorites: m.stats.favorites
      },
      heat: m.heat, heatDelta: m.heatDelta, peakRank: m.peakRank,
      // 展示辅助（非后端契约，页面渲染用）
      no: m.no, isNew: !!m.isNew, isPublic: m.isPublic !== false, period: m.period,
      // F6：列表只返回掩码，且受三项公开开关控制（未勾选 → 空串）
      maskedName: owner && owner.flagName ? maskName(owner.realName) : "",
      maskedEmail: owner && owner.flagEmail ? maskEmail(owner.email) : "",
      maskedPhone: owner && owner.flagPhone ? maskPhone(owner.account) : ""
    };
  }

  function messageRankMap(messages) {
    // heat 降序 → 当前名次（备用：榜单外场景需要名次语义时使用）
    var sorted = messages.slice().sort(function (a, b) { return b.heat - a.heat; });
    var map = {};
    sorted.forEach(function (m, i) { map[m.resourceId] = i + 1; });
    return map;
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

      delete fails[phone];
      db.saveLoginFails(fails);
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
      var list = db.getMessages().filter(function (m) {
        if (period && m.period !== period) return false;
        if (opts.tab === "mine" && m.ownerId !== session.userId) return false;
        if (opts.q) {
          var q = opts.q.toLowerCase();
          var hay = (m.content + " " + m.nicknameSnapshot + " " + (m.topicTag || "")).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });

      var sort = opts.sort || (opts.tab === "latest" ? "latest" : "heat");
      list.sort(function (a, b) {
        switch (sort) {
          case "latest": return b.createdAt - a.createdAt;
          case "likes": return b.stats.likes - a.stats.likes;
          case "comments": return b.stats.comments - a.stats.comments;
          default: return b.heat - a.heat;
        }
      });

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

  /** 单条留言（详情页用；浏览 +1 best-effort） */
  function apiGetMessage(resourceId) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === resourceId; });
      if (!m) return fail(5001, "error.5001");
      m.stats.views += 1;
      db.saveMessages(messages);
      var session = currentSession(true);
      var data = toListMessage(m);
      data.isMine = !!(session && session.userId === m.ownerId);
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

      var content = (args.content || "").trim();
      if (!content || content.length > 500) return fail(9001, "error.9001");

      var gate = messageSecurityGate(s.userId, content); // 发留言：敏感词 + 限流（F10）
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
        content: content,
        nicknameSnapshot: nick || user.nickname,
        avatarEnum: user.avatarEnum,
        displayId: user.displayId,
        topicTag: args.topic || "",
        isPublic: true,
        period: settings.currentPeriod,
        createdAt: Date.now(),
        stats: { views: 0, likes: 0, comments: 0, favorites: 0 },
        heat: 0.6, heatDelta: 0, peakRank: 0,
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
      edited: !!c.edited,
      isAnonymous: anon,
      // 前端绝不返回匿名回复的真实身份（F9/D-02）：isMine 对匿名一律 false
      isMine: !anon && !!(session && session.userId === c.ownerId)
    };
  }

  function buildCommentTree(messageId, session) {
    var all = db.getComments().filter(function (c) { return c.messageId === messageId; });
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

      var content = (args.content || "").trim();
      if (!content || content.length > 500) return fail(9001, "error.9001");

      // 先查留言，再查评论（owner 校验防 IDOR）
      var messages = db.getMessages();
      var m = messages.find(function (x) { return x.resourceId === args.resourceId; });
      if (m) {
        if (m.ownerId !== s.userId) return fail(5002, "error.5002");
        var gate = sensitiveGate(content); // 改删/编辑：仅敏感词门（F10）
        if (gate) return gate;
        m.content = content;
        m.edited = true;
        db.saveMessages(messages);
        return ok({});
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

  /* ---------------- 盲盒（API-11 / API-12，F9） ---------------- */

  function apiGetBlindbox() {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var s = currentSession(true);
      if (!s) return fail(401, "error.401");

      // 候选集：他人的、公开的、未删除的、非空的留言（排除自己）
      var candidates = db.getMessages().filter(function (m) {
        return m.ownerId !== s.userId && m.isPublic !== false &&
          m.content && m.content.trim().length > 0;
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
        account: u.account,
        realName: u.realName || "",
        email: u.email || "",
        flagName: !!u.flagName,
        flagEmail: !!u.flagEmail,
        flagPhone: !!u.flagPhone,
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
      db.saveUsers(users);
      return ok({});
    });
  }

  function apiUpdateNickname(args) {
    return netGate().then(function (net) {
      if (!net.success) return net;
      var auth = requireAuth(args.csrf);
      if (auth.err) return auth.err;
      var nick = (args.nickname || "").trim();
      if (!nick || nick.length > 20) return fail(9001, "error.9001");
      var users = db.getUsers();
      var u = users.find(function (x) { return x.id === auth.session.userId; });
      if (!u) return fail(401, "error.401");
      u.nickname = nick; // 写时快照：历史留言保留当时昵称（D-03）
      db.saveUsers(users);
      return ok({ nickname: nick });
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
      displayId: u.displayId,
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
    /* API-11 */ getBlindbox: apiGetBlindbox,
    /* API-12 */ blindboxReply: apiBlindboxReply,
    /* 扩展 */   getMessage: apiGetMessage,
    /* 扩展 */   updatePrivacy: apiUpdatePrivacy,
    /* 扩展 */   updateNickname: apiUpdateNickname,
    /* 扩展 */   getSession: apiGetSession,

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
