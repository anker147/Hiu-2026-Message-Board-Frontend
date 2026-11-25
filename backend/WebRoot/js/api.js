/* ============================================================
 * 留言板 · 真实后端 fetch 适配层（替换 js/mock/api.js 用）
 * ------------------------------------------------------------
 * 用法：把本文件放进前端项目 js/ 目录，index.html 里把
 *   <script src="js/mock/api.js"></script>
 * 换成
 *   <script src="js/api.js"></script>
 * 页面层（window.HMB.api.xxx）的调用方式和入出参结构零改动。
 *
 * 对接的后端：TestJDBC 的 /api/* REST 接口
 *   · 统一响应包 {success, code, message, data}（错误码与 PRD §6.2 一致）
 *   · 鉴权：Authorization: Bearer <token>；写操作参数里带 csrf
 *   · 会话空闲 30 分钟超时 → 401（适配层收到 401 自动清本地令牌）
 *
 * baseURL 配置：默认 http://localhost:8080/TestJDBC/api
 *   联调前可在引入本文件之前设置：window.HMB_API_BASE = "http://xxx/api"
 *
 * GM 管理接口（gmSummary/gmUsers/...）：后端本学期范围未开放，
 * 调用会返回 code:-1 的失败 Promise，GM 页面骨架可正常渲染但无数据。
 * ============================================================ */
(function (window) {
  "use strict";

  /* ---------------- 基础配置 ---------------- */

  var BASE = window.HMB_API_BASE || "http://localhost:8080/TestJDBC/api";
  var TOKEN_KEY = "hmb_active_session";   // 与 mock 同名，页面层若直接读也不冲突

  /* ---------------- 令牌存取 ---------------- */

  function readToken() {
    try {
      var v = JSON.parse(window.localStorage.getItem(TOKEN_KEY) || "null");
      return v && v.token ? v : null;
    } catch (e) { return null; }
  }

  function writeToken(v) {
    if (v) window.localStorage.setItem(TOKEN_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(TOKEN_KEY);
  }

  /* ---------------- 底层请求 ---------------- */

  /* ---------------- 客户端限流计数（调试面板用） ----------------
   * 后端真实限流规则：10 秒滑窗内发帖类写请求超过 3 次返回 4002；
   * 这里在客户端把每个写请求的时间戳记进滑窗，供 _debug.rateCount()
   * 给调试面板显示“当前窗口内已发 n 条”，与后端判定口径一致。 */
  var RATE_WINDOW = 10 * 1000;   // 与后端限流窗口一致：10 秒
  var rateHits = [];             // 窗口内写请求的时间戳数组

  /** 每次非 GET 请求时记录一个时间戳，并顺手清掉滑窗外的旧记录 */
  function noteRate(method) {
    if (method === "GET") return; // 只统计写请求，与后端限流口径一致
    var now = Date.now();
    rateHits.push(now);
    while (rateHits.length && now - rateHits[0] >= RATE_WINDOW) {
      rateHits.shift();
    }
  }

  /**
   * 统一请求入口。
   * @param method  GET/POST/PUT/DELETE
   * @param path    接口路径（如 "/messages"）
   * @param opts    { params:查询参数对象, body:请求体对象, auth:是否带令牌 }
   * @return Promise，resolve 统一响应包 {success, code, message, data}
   *         网络层失败时 resolve {success:false, code:-1, message:网络异常}
   */
  function request(method, path, opts) {
    opts = opts || {};
    noteRate(method); // 进限流滑窗（调试面板展示用，不影响请求本身）
    var url = BASE + path;
    // 1.查询参数拼到 URL 上（fetch 会自动对中文 percent-encode）
    if (opts.params) {
      var qs = [];
      Object.keys(opts.params).forEach(function (k) {
        if (opts.params[k] !== undefined && opts.params[k] !== null && opts.params[k] !== "") {
          qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(opts.params[k]));
        }
      });
      if (qs.length) url += "?" + qs.join("&");
    }
    // 2.请求头：JSON 体 + 可选 Bearer 令牌
    var headers = { "Content-Type": "application/json" };
    var t = readToken();
    if (opts.auth && t) headers["Authorization"] = "Bearer " + t.token;
    // 3.写请求自动把 csrf 塞进请求体（后端从 body 里取参数 csrf）
    if (opts.body && opts.body.csrf === undefined && t) {
      opts.body = Object.assign({}, opts.body, { csrf: t.csrf });
    }
    return fetch(url, {
      method: method,
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (resp) {
      return resp.json();
    }).then(function (pkg) {
      // 后端约定：401 时清掉本地令牌，页面层下次进入会走登录引导
      if (pkg && pkg.code === 401) writeToken(null);
      return pkg;
    }).catch(function () {
      return { success: false, code: -1, message: "网络异常，请稍后重试", data: {} };
    });
  }

  /* ---------------- HMB.api 实现（与 mock 入出参一致） ---------------- */

  var api = {
    /* API-01 注册：成功后适配层保存 token/csrf（注册即登录） */
    register: function (args) {
      return request("POST", "/register", { body: args }).then(function (pkg) {
        if (pkg.success && pkg.data && pkg.data.token) {
          writeToken({ token: pkg.data.token, csrf: pkg.data.csrf });
        }
        return pkg;
      });
    },

    /* API-02 登录：同上保存会话 */
    login: function (args) {
      return request("POST", "/login", { body: args }).then(function (pkg) {
        if (pkg.success && pkg.data && pkg.data.token) {
          writeToken({ token: pkg.data.token, csrf: pkg.data.csrf });
        }
        return pkg;
      });
    },

    /* API-03 退出：成功后清本地令牌 */
    logout: function (args) {
      return request("POST", "/logout", { body: args || {}, auth: true }).then(function (pkg) {
        if (pkg.success) writeToken(null);
        return pkg;
      });
    },

    /* API-04 留言列表：tab=mine|hot|其它；q 搜索；period 期次 */
    getMessages: function (opts) {
      opts = opts || {};
      return request("GET", "/messages", {
        params: { tab: opts.tab, q: opts.q, period: opts.period },
        auth: true
      });
    },

    /* 扩展：留言详情（opts.countView=false 不计浏览） */
    getMessage: function (resourceId, opts) {
      opts = opts || {};
      return request("GET", "/messages/" + encodeURIComponent(resourceId), { auth: true })
        .then(function (pkg) {
          // 后端浏览量已在详情接口 +1；编辑页读取原文时由后端不计数，
          // 这里通过「先查后端再决定是否补一次浏览」不需要处理，直接透传。
          return pkg;
        });
    },

    /* API-04W 发布留言 */
    postMessage: function (args) {
      return request("POST", "/messages", { body: args, auth: true });
    },

    /* API-05 发一级评论 */
    postComment: function (args) {
      // 后端把一级评论挂在 /api/messages/{messageId}/comments
      return request("POST", "/messages/" + encodeURIComponent(args.messageId) + "/comments", {
        body: { content: args.content, nickname: args.nickname, atDisplayId: args.atDisplayId },
        auth: true
      });
    },

    /* API-06 发二级回复（commentId 挂靠的评论） */
    postReply: function (args) {
      return request("POST", "/replies", { body: args, auth: true });
    },

    /* API-07 编辑（留言或评论；title/topic/isPublic 等选传） */
    updateContent: function (args) {
      return request("PUT", "/content/" + encodeURIComponent(args.resourceId), {
        body: args, auth: true
      });
    },

    /* API-07 删除（留言级联评论；一级评论级联回复） */
    deleteContent: function (args) {
      // csrf 需要在参数里；DELETE 没有请求体，改用查询参数传
      var t = readToken();
      return request("DELETE", "/content/" + encodeURIComponent(args.resourceId), {
        params: { csrf: t ? t.csrf : "" },
        auth: true
      });
    },

    /* API-08 本人完整资料 */
    getProfile: function () {
      return request("GET", "/profile", { auth: true });
    },

    /* API-09 两级评论树 */
    getComments: function (messageId) {
      return request("GET", "/messages/" + encodeURIComponent(messageId) + "/comments", {
        auth: true
      });
    },

    /* API-10 点赞（targetId + op + idemKey；未传 op 时后端按切换处理） */
    like: function (args) {
      return request("POST", "/like", { body: args, auth: true });
    },

    /* 收藏（帖子 + 评论，幂等；与点赞分表） */
    favorite: function (args) {
      return request("POST", "/favorite", { body: args, auth: true });
    },

    /* API-11 盲盒：随机捞一条他人留言 */
    getBlindbox: function () {
      return request("GET", "/blindbox", { auth: true });
    },

    /* API-12 盲盒匿名回复（真实身份后端留痕，接口永不返回） */
    blindboxReply: function (args) {
      return request("POST", "/blindbox/reply", { body: args, auth: true });
    },

    /* 扩展：个人主页聚合（按展示 ID 查询，访客可看） */
    getZone: function (args) {
      return request("GET", "/zone", { params: { displayId: args.displayId }, auth: true });
    },

    /* 扩展：隐私开关 */
    updatePrivacy: function (args) {
      return request("POST", "/profile/privacy", { body: args, auth: true });
    },

    /* 扩展：昵称 / 签名 / 头像 */
    updateNickname: function (args) {
      return request("POST", "/profile/nickname", { body: args, auth: true });
    },

    /* 扩展：真实姓名 / 邮箱（手机号不可改） */
    updateSensitive: function (args) {
      return request("POST", "/profile/sensitive", { body: args, auth: true });
    },

    /* 扩展：登录状态查询（前端启动时调） */
    getSession: function () {
      return request("GET", "/session", { auth: true });
    }
  };

  /* ---------------- GM 接口：本学期范围未开放 ----------------
   * 返回统一失败包，保证 GM 页面渲染不崩（页面层可直接用）。 */

  function gmNotOpen() {
    return Promise.resolve({
      success: false, code: -1, data: {},
      message: "GM 管理接口暂未开放（后端本期只实现核心接口）"
    });
  }

  [
    "gmSummary", "gmUsers", "gmUserDetail", "gmSetUserStatus", "gmSetUserMute",
    "gmSetUserRole", "gmUpdateUserProfile", "gmResetPassword", "gmContents",
    "gmSetMessageHidden", "gmDeleteMessage", "gmSetCommentHidden", "gmDeleteComment",
    "gmActions", "gmSetSensitiveWords", "gmSetCurrentPeriod", "gmResetData"
  ].forEach(function (name) {
    api[name] = gmNotOpen;
  });

  /* ---------------- 调试辅助（与 mock 对齐的演示面板钩子） ---------------- */

  api._debug = {
    /**
     * 手动清除会话（调试面板“强制会话过期”按钮）。
     * 与 mock 语义对齐：本地令牌立刻清除并返回 true；
     * 同时尽力通知服务端销毁会话（fire-and-forget，不等结果，
     * 面板 600ms 后会自动刷新页面，所以不需要等响应）。
     */
    expireSession: function () {
      var t = readToken();
      if (!t) return false; // 本来就没登录，面板会提示“无可过期会话”
      try {
        fetch(BASE + "/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csrf: t.csrf })
        }).catch(function () { /* 网络失败也无所谓，本地令牌已清 */ });
      } catch (e) { /* 忽略 */ }
      writeToken(null);
      return true;
    },
    /**
     * 当前 10 秒滑窗内的写请求条数（调试面板限流提示用）。
     * 读取时再清一次过期记录，保证返回的是“此刻窗口内”的条数。
     */
    rateCount: function () {
      var now = Date.now();
      while (rateHits.length && now - rateHits[0] >= RATE_WINDOW) {
        rateHits.shift();
      }
      return rateHits.length;
    },
    /** 读取当前令牌信息 */
    token: readToken
  };

  /* ---------------- 汇出 ---------------- */

  window.HMB = window.HMB || {};
  window.HMB.api = api;
})(window);
