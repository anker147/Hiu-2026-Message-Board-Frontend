/* ============================================================
 * 留言板 · Mock 数据库（localStorage 持久化，hmb_ 前缀）
 * 所有数据留在前端：刷新保留，重置入口还原种子。
 * ============================================================ */
(function (window) {
  "use strict";

  var PREFIX = "hmb_v1_";
  var SEED = window.HMB.SEED;

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* 配额满等异常：吞掉，不阻塞主流程 */ }
  }

  function remove(key) {
    try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* noop */ }
  }

  /** 首次访问时用种子数据初始化；带 meta.version 便于种子升级时重置 */
  function ensureSeeded() {
    var meta = read("meta", null);
    if (!meta || meta.seedVersion !== SEED.VERSION) {
      reset();
    }
  }

  /** 重置演示数据：清空全部 hmb_ 键并回写种子 */
  function reset() {
    var i, keys = [];
    for (i = 0; i < window.localStorage.length; i++) {
      var k = window.localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) keys.push(k);
    }
    keys.forEach(function (k) { window.localStorage.removeItem(k); });
    write("users", SEED.USERS);
    write("messages", SEED.MESSAGES);
    write("comments", SEED.COMMENTS);
    write("likes", SEED.LIKES);
    write("favorites", []);           // 用户收藏（userId + targetId 唯一）
    write("sessions", []);            // 所有会话令牌（token→userId）
    write("loginFails", {});          // {account: {count, lockUntil}}
    write("rateWindow", {});          // {userIdKey: [timestamps]}
    write("blindboxReplies", []);     // 匿名回复留痕（服务端留痕语义）
    write("adminActions", []);        // GM 操作审计（只增不改不删）
    write("settings", {
      sensitiveWords: SEED.SENSITIVE_WORDS,
      currentPeriod: SEED.CURRENT_PERIOD,
      simulateNetFail: false
    });
    write("meta", { seedVersion: SEED.VERSION, resetAt: Date.now() });
  }

  ensureSeeded();

  window.HMB = window.HMB || {};
  window.HMB.db = {
    read: read,
    write: write,
    remove: remove,
    reset: reset,

    /* —— 用户 —— */
    getUsers: function () { return read("users", []); },
    saveUsers: function (u) { write("users", u); },
    findUserByAccount: function (account) {
      return this.getUsers().find(function (u) { return u.account === account; }) || null;
    },
    findUserById: function (id) {
      return this.getUsers().find(function (u) { return u.id === id; }) || null;
    },

    /* —— 留言 —— */
    getMessages: function () { return read("messages", []); },
    saveMessages: function (m) { write("messages", m); },
    findMessage: function (resourceId) {
      return this.getMessages().find(function (m) { return m.resourceId === resourceId; }) || null;
    },

    /* —— 评论 —— */
    getComments: function () { return read("comments", []); },
    saveComments: function (c) { write("comments", c); },

    /* —— 点赞 —— */
    getLikes: function () { return read("likes", []); },
    saveLikes: function (l) { write("likes", l); },
    hasLike: function (userId, targetId) {
      return this.getLikes().some(function (x) {
        return x.userId === userId && x.targetId === targetId;
      });
    },

    /* —— 收藏 —— */
    getFavorites: function () { return read("favorites", []); },
    saveFavorites: function (f) { write("favorites", f); },
    hasFavorite: function (userId, targetId) {
      return this.getFavorites().some(function (x) {
        return x.userId === userId && x.targetId === targetId;
      });
    },

    /* —— 会话 —— */
    getSessions: function () { return read("sessions", []); },
    saveSessions: function (s) { write("sessions", s); },

    /* —— 登录失败计数 —— */
    getLoginFails: function () { return read("loginFails", {}); },
    saveLoginFails: function (f) { write("loginFails", f); },

    /* —— 限流滑窗 —— */
    getRateWindow: function () { return read("rateWindow", {}); },
    saveRateWindow: function (r) { write("rateWindow", r); },

    /* —— 盲盒留痕 —— */
    getBlindboxReplies: function () { return read("blindboxReplies", []); },
    saveBlindboxReplies: function (b) { write("blindboxReplies", b); },

    /* —— GM 审计（只增不改不删） —— */
    getAdminActions: function () { return read("adminActions", []); },
    saveAdminActions: function (a) { write("adminActions", a); },
    appendAdminAction: function (entry) {
      var list = this.getAdminActions();
      list.push({
        id: entry.id || ("A" + Date.now().toString(36) + Math.floor(Math.random() * 1000)),
        actorId: entry.actorId,
        actorNickname: entry.actorNickname || "",
        action: entry.action,
        targetType: entry.targetType || "",
        targetId: entry.targetId || "",
        detail: entry.detail || "",
        ip: entry.ip || "127.0.0.1",
        createdAt: entry.createdAt || Date.now()
      });
      this.saveAdminActions(list);
      return list[list.length - 1];
    },

    /* —— 设置 —— */
    getSettings: function () {
      return read("settings", {
        sensitiveWords: SEED.SENSITIVE_WORDS,
        currentPeriod: SEED.CURRENT_PERIOD,
        simulateNetFail: false
      });
    },
    saveSettings: function (s) { write("settings", s); }
  };
})(window);
