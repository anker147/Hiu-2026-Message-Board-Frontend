/* ============================================================
 * 留言板 · 独立发布页（Page 1 画布 03 整页呈现）
 * 与 index 内嵌表单区共享 publishForm 提交逻辑；
 * 新卡插入“最新发布”区并 --blue 高亮 1800ms（两阶段定位同 F5）。
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var api = HMB.api;

  var session = { loggedIn: false };
  var likeIntent = {};

  function init() {
    api.getSession().then(function (resp) {
      session = resp.data;
      C.renderTopbar(document.getElementById("topbar"), null, session);
      HMB.util.renderDebugPanel();

      HMB.publishForm.mount({
        getSession: function () { return session; },
        insertInto: document.getElementById("newList"),
        onLike: handleLike,
        onOpen: function (msg) {
          window.location.href = "detail.html?id=" + encodeURIComponent(msg.resourceId);
        },
        toastOnSuccess: true
      });
    });
  }

  function handleLike(msg, statEl) {
    if (!session.loggedIn) { C.openGuideModal("like"); return; }
    var now = Date.now();
    var intent = likeIntent[msg.resourceId];
    if (!intent || now - intent.ts > 350) {
      intent = likeIntent[msg.resourceId] = {
        idemKey: "idem-" + now + "-" + Math.random().toString(36).slice(2, 8),
        ts: now
      };
    } else {
      intent.ts = now;
    }
    api.like({ targetId: msg.resourceId, idemKey: intent.idemKey, csrf: session.csrf })
      .then(function (resp) {
        if (resp.code === 401) { C.openGuideModal("like"); return; }
        if (resp.success) {
          statEl.classList.toggle("is-liked", resp.data.liked);
          var cnt = statEl.querySelector("span:last-child");
          if (cnt) cnt.textContent = U.fmtViews(resp.data.count);
        } else {
          U.toast(resp.message, "error");
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
