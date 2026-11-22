/* ============================================================
 * 留言板 · 详情/评论页（P-04）
 * 主留言卡（点赞/属主改删）+ 二级评论树（F7）+ 评论提交（F5 两阶段）
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var api = HMB.api;
  var t = function (k, p) { return HMB.i18n.t(k, p); };
  var el = U.el;
  var $ = function (id) { return document.getElementById(id); };

  var session = { loggedIn: false };
  var msgId = "";
  var msg = null;
  var commentTree = [];
  var likeIntent = {};
  var busyComment = false;
  var replyEditorAt = null; // 当前展开回复输入的评论节点

  var els = {};

  function qsId() {
    var m = window.location.search.match(/[?&]id=([^&#]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function init() {
    els.topbar = $("topbar");
    els.msgArea = $("msgArea");
    els.commentList = $("commentList");
    els.commentInput = $("commentInput");
    els.commentSubmitBtn = $("commentSubmitBtn");
    els.commentErrBar = $("commentErrBar");
    els.commentCount = $("commentCount");

    msgId = qsId();
    api.getSession().then(function (resp) {
      session = resp.data;
      C.renderTopbar(els.topbar, null, session);
      HMB.util.renderDebugPanel();

      if (!msgId) return renderNotFound();
      api.getMessage(msgId).then(function (r1) {
        if (!r1.success) return renderNotFound();
        msg = r1.data;
        renderMessage();
        loadComments();
      });
    });

    els.commentSubmitBtn.addEventListener("click", submitComment);
    els.commentInput.addEventListener("input", function () {
      els.commentErrBar.classList.add("hint-bar--hidden");
      autoGrow(els.commentInput);
    });
    els.commentInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); }
    });
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  }

  function renderNotFound() {
    els.msgArea.textContent = "";
    C.renderStateBox(els.msgArea, {
      emoji: "📭",
      titleKey: "detail.notFound",
      descKey: "error.5001",
      btnKey: "detail.notFoundBtn",
      onBtn: function () { window.location.href = "index.html"; }
    });
    els.commentList.textContent = "";
    $("commentBar").style.display = "none";
  }

  /* ---------------- 主留言卡 ---------------- */

  function renderMessage() {
    els.msgArea.textContent = "";
    var card = el("article", "msg-card");
    card.dataset.id = msg.resourceId;

    var head = el("div", "msg-card-head");
    var avWrap = el("div", "msg-card-avatar");
    avWrap.appendChild(U.avatar(msg.avatarEnum));
    head.appendChild(avWrap);

    var body = el("div");
    body.style.flex = "1";
    body.style.minWidth = "0";
    var who = el("div", "who");
    var author = el("span", "msg-card-author author-link", "@" + msg.nicknameSnapshot);
    author.tabIndex = 0;
    author.setAttribute("role", "link");
    author.addEventListener("click", function () {
      if (msg.displayId) window.location.href = "zone.html?u=" + encodeURIComponent(msg.displayId);
    });
    author.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && msg.displayId) {
        window.location.href = "zone.html?u=" + encodeURIComponent(msg.displayId);
      }
    });
    who.appendChild(author);
    who.appendChild(el("span", "msg-card-date", U.fmtDate(msg.createdAt)));
    if (msg.edited) who.appendChild(el("span", "edited-mark", t("common.edited")));
    // 帖子可见类型（isPublic=false 仅自己可见，他人视图中本就不出现）
    who.appendChild(el("span", "msg-card-date", msg.isPublic === false ? t("common.private") : t("common.public")));
    body.appendChild(who);

    var content = el("div", "msg-card-content");
    content.appendChild(U.highlightMatch(msg.content, ""));
    body.appendChild(content);
    head.appendChild(body);
    card.appendChild(head);

    var foot = el("div", "msg-card-foot");
    var stats = el("div", "msg-card-stats");
    function stat(labelKey, value) {
      var s = el("span", "stat");
      s.appendChild(el("span", null, t(labelKey)));
      s.appendChild(el("span", null, " " + value));
      return s;
    }
    stats.appendChild(stat("common.statViews", U.fmtViews(msg.stats.views)));
    stats.appendChild(stat("common.likes", U.fmtViews(msg.stats.likes)));
    stats.appendChild(stat("common.statComments", U.fmtViews(msg.stats.comments)));
    stats.appendChild(stat("common.statFavorites", U.fmtViews(msg.stats.favorites)));
    foot.appendChild(stats);

    if (msg.isMine) {
      var actions = el("div", "owner-actions");
      var editBtn = el("button", "btn btn--soft btn--sm");
      editBtn.type = "button";
      editBtn.setAttribute("data-text", "detail.edit");
      editBtn.addEventListener("click", editMessage);
      var delBtn = el("button", "btn btn--ghost btn--sm");
      delBtn.type = "button";
      delBtn.setAttribute("data-text", "detail.delete");
      delBtn.addEventListener("click", confirmDeleteMessage);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      foot.appendChild(actions);
    }

    var likeBtn = el("button", "msg-like-btn");
    likeBtn.type = "button";
    likeBtn.appendChild(el("span", null, t("common.likes") + " " + U.fmtViews(msg.stats.likes)));
    likeBtn.addEventListener("click", function () { likeTarget(msg.resourceId, likeBtn, null); });
    foot.appendChild(likeBtn);
    card.appendChild(foot);

    els.msgArea.appendChild(card);
    HMB.i18n.apply(card);
    refreshLikeVisual();
  }

  function refreshLikeVisual() {
    // 从接口侧数据校正红心态：详情页不批量拉取，取最近一次响应为准
    if (typeof msg._liked === "boolean") {
      var btn = els.msgArea.querySelector(".msg-like-btn");
      if (btn) {
        btn.classList.toggle("is-liked", msg._liked);
        btn.querySelector("span").textContent = t("common.likes") + " " + U.fmtViews(msg.stats.likes);
      }
    }
  }

  /** F8 点赞状态机（350ms 内重复点击复用幂等键） */
  function likeTarget(targetId, btn, commentNode) {
    if (!session.loggedIn) { C.openGuideModal("like"); return; }
    var now = Date.now();
    var intent = likeIntent[targetId];
    if (!intent || now - intent.ts > 350) {
      intent = likeIntent[targetId] = {
        idemKey: "idem-" + now + "-" + Math.random().toString(36).slice(2, 8),
        ts: now
      };
    } else {
      intent.ts = now;
    }
    api.like({ targetId: targetId, idemKey: intent.idemKey, csrf: session.csrf }).then(function (resp) {
      if (resp.code === 401) { C.openGuideModal("like"); return; }
      if (!resp.success) { U.toast(resp.message, "error"); return; }
      if (commentNode) {
        commentNode.classList.toggle("is-liked", resp.data.liked);
        var cnt = commentNode.querySelector("span:last-child");
        if (cnt) cnt.textContent = String(resp.data.count);
        var c = findComment(targetId);
        if (c) c.likes = resp.data.count;
      } else {
        msg.stats.likes = resp.data.count;
        msg._liked = resp.data.liked;
        refreshLikeVisual();
      }
    });
  }

  function findComment(id) {
    var found = null;
    (function walk(list) {
      (list || []).forEach(function (c) {
        if (c.resourceId === id) found = c;
        walk(c.replies);
      });
    })(commentTree);
    return found;
  }

  /* ---------------- 属主改删（P-08） ---------------- */

  function editMessage() {
    // 帖子走整页编辑器（参考好游快爆 sendThreadShow 设计）；评论仍用编辑弹窗
    window.location.href = "edit.html?id=" + encodeURIComponent(msg.resourceId);
  }

  function confirmDeleteMessage() {
    C.openConfirmModal({
      titleKey: "confirm.deleteTitle",
      warnKey: "confirm.deleteWarn",
      preview: msg.content,
      note: t("confirm.ownerNote"),
      onConfirm: function () {
        api.deleteContent({ resourceId: msg.resourceId, csrf: session.csrf }).then(function (resp) {
          if (resp.success) {
            U.toast(t("confirm.deleteSuccess"), "success");
            setTimeout(function () { window.location.href = "index.html"; }, 500);
          } else if (resp.code === 401) {
            C.openGuideModal("delete");
          } else {
            U.toast(resp.message, "error");
          }
        });
      }
    });
  }

  /* ---------------- 评论树 ---------------- */

  function loadComments() {
    return api.getComments(msgId).then(function (resp) {
      if (!resp.success) {
        C.renderStateBox(els.commentList, {
          emoji: "⚠️",
          titleKey: "board.stateErrorTitle",
          descKey: "board.stateErrorDesc",
          btnKey: "common.retry",
          onBtn: loadComments
        });
        return;
      }
      commentTree = resp.data.list;
      els.commentCount.textContent = " " + resp.data.total;
      C.renderCommentTree(els.commentList, commentTree, {
        session: session,
        onLike: function (c, btn) { likeTarget(c.resourceId, btn, btn); },
        onReply: openReplyEditor,
        onEdit: editComment,
        onDelete: confirmDeleteComment
      });
      // 恢复未关闭的回复编辑器
      if (replyEditorAt) {
        var node = els.commentList.querySelector('[data-id="' + replyEditorAt + '"]');
        if (node) attachReplyEditor(node, replyEditorAt);
      }
    });
  }

  function editComment(c) {
    C.openEditModal({
      initial: c.content,
      onSave: function (content, done) {
        api.updateContent({ resourceId: c.resourceId, content: content, csrf: session.csrf })
          .then(function (resp) {
            done(resp);
            if (resp.success) {
              U.toast(t("edit.successToast"), "success");
              loadComments();
            }
          });
      }
    });
  }

  function confirmDeleteComment(c) {
    C.openConfirmModal({
      titleKey: "confirm.deleteCommentTitle",
      warnKey: "confirm.deleteCommentWarn",
      preview: c.content,
      note: t("confirm.ownerNote"),
      onConfirm: function () {
        api.deleteContent({ resourceId: c.resourceId, csrf: session.csrf }).then(function (resp) {
          if (resp.success) {
            U.toast(t("confirm.deleteSuccess"), "success");
            if (replyEditorAt === c.resourceId) replyEditorAt = null;
            loadComments();
          } else if (resp.code === 401) {
            C.openGuideModal("delete");
          } else {
            U.toast(resp.message, "error");
          }
        });
      }
    });
  }

  /* ---------------- 回复编辑器（二级，@以展示 ID 为准） ---------------- */

  function openReplyEditor(c) {
    if (!session.loggedIn) { C.openGuideModal("reply"); return; }
    // 关闭旧编辑器
    var old = document.querySelector(".reply-editor");
    if (old) old.remove();
    replyEditorAt = c.resourceId;
    var node = els.commentList.querySelector('[data-id="' + c.resourceId + '"]');
    if (!node) return;
    attachReplyEditor(node, c);
    node.querySelector(".reply-editor textarea").focus();
  }

  function attachReplyEditor(node, c) {
    if (node.querySelector(".reply-editor")) return;
    // 目标挂载点：回复二级评论 → 挂回其根评论（最多二级，@引用以展示 ID 为准）
    var targetId = c.depth === 2 ? (c.parentId || c.resourceId) : c.resourceId;

    var editor = el("div", "reply-editor");
    editor.style.marginTop = "10px";
    var row = el("div", "comment-input-bar");
    row.style.padding = "10px 14px";
    var ta = el("textarea");
    ta.rows = 1;
    ta.setAttribute("placeholder", t("detail.replyPlaceholder",
      { name: c.authorName || c.atDisplayId || "" }));
    ta.setAttribute("aria-label", t("detail.reply"));
    row.appendChild(ta);
    var send = el("button", "btn btn--primary btn--sm");
    send.type = "button";
    send.setAttribute("data-text", "detail.commentSubmit");
    row.appendChild(send);
    editor.appendChild(row);
    var bar = el("div", "hint-bar hint-bar--danger hint-bar--hidden");
    editor.appendChild(bar);
    node.appendChild(editor);
    HMB.i18n.apply(editor);

    function go() {
      if (busyComment) return;
      if (!ta.value.trim()) { ta.focus(); return; }
      postCommentFlow(
        { content: ta.value.trim(), parentId: targetId },
        bar,
        null,
        function () { editor.remove(); replyEditorAt = null; }
      );
    }
    send.addEventListener("click", go);
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); }
    });
  }

  /* ---------------- 评论/回复提交（F5 两阶段定位） ---------------- */

  function submitComment() {
    if (busyComment) return; // 防重锁
    if (!session.loggedIn) { C.openGuideModal("comment"); return; }
    var content = els.commentInput.value.trim();
    if (!content) {
      els.commentInput.focus();
      return;
    }
    postCommentFlow({ content: content }, els.commentErrBar, els.commentSubmitBtn, function () {
      els.commentInput.value = "";
      autoGrow(els.commentInput);
    });
  }

  function postCommentFlow(args, errBar, btn, onReset) {
    busyComment = true;
    if (btn) { btn.disabled = true; btn.textContent = t("common.submitting"); }
    if (errBar) errBar.classList.add("hint-bar--hidden");

    var S = window.scrollY;
    var t0 = performance.now();
    HMB.hooks._pushScroll(S);
    // 阶段一采样：0–200ms 内滚动位置应保持不变（供 __boardTest.scrollYAt 断言）
    [50, 100, 150, 200].forEach(function (dt) {
      setTimeout(function () { HMB.hooks._pushScroll(window.scrollY); }, dt);
    });

    args.messageId = msgId;
    args.csrf = session.csrf;

    api.postComment(args).then(function (resp) {
      busyComment = false;
      if (btn) {
        btn.disabled = false;
        btn.setAttribute("data-text", "detail.commentSubmit");
        btn.textContent = t("detail.commentSubmit");
      }

      if (!resp.success) {
        if (resp.code === 401) { C.openGuideModal("comment"); return; }
        // 4001 / 4002 / 9002 / 网络：就地提示并保留已输入内容（F10/流程 B）
        if (errBar) {
          errBar.textContent = resp.message;
          errBar.classList.remove("hint-bar--hidden");
        } else {
          U.toast(resp.message, "error");
        }
        return;
      }

      var newId = resp.data.resourceId;
      // 阶段一：0–200ms 保持滚动位置；阶段二：插入 + 居中 + 高亮 1800ms
      var wait = Math.max(0, 200 - (performance.now() - t0));
      setTimeout(function () {
        if (onReset) onReset();
        loadComments().then(function () {
          var node = els.commentList.querySelector('[data-id="' + newId + '"]');
          if (!node) return;
          node.scrollIntoView({ behavior: "smooth", block: "center" });
          node.classList.add("is-highlight");
          setTimeout(function () {
            node.classList.remove("is-highlight");
            HMB.hooks.highlightRemovedAt = performance.now();
          }, 1800);
        });
      }, wait);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
