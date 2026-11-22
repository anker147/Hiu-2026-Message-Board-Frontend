/* ============================================================
 * 留言板 · 帖子编辑器（新建 / 编辑统一入口）
 * 参考好游快爆 sendThreadShow 发帖器设计（fid→话题 / type→可见类型）
 * ------------------------------------------------------------
 * 双模式：
 *  - ?id=<resourceId> → 编辑模式：预填原文，保存走 API-07（标记「已编辑」），
 *    含原帖信息条 / 还原原文 / 危险区删除（P-08）
 *  - 无参（或 ?mode=new）→ 新建模式：承接原 P-03 发布表单全部语义
 *    （F5 无刷新提交两阶段定位、公开范围开关、本次昵称、防重锁、
 *    敏感词/限流/CSRF 就地提示保留草稿），发布成功插入「最新发布」高亮
 * 入口：详情页属主「编辑」、个人中心我的留言「编辑」、首页浮动按钮、
 *       post.html（重定向）、身份菜单等。
 * 红线：标题不设（数据语义红线）/ 字数计数器不设（PRD 9.7）/ 图片上传不设。
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
  var msg = null;
  var msgId = "";
  var mode = "new";           // "new" | "edit"
  var originalContent = "";
  var selectedTag = "";
  var isPublic = true;
  var submitting = false;
  var likeIntent = {};

  function qsId() {
    var m = window.location.search.match(/[?&]id=([^&#]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function detailHref(id) {
    return "detail.html?id=" + encodeURIComponent(id || msgId);
  }

  /* ---------------- 页面级状态盒（编辑模式四态） ---------------- */

  function renderState(spec) {
    $("editorCard").hidden = true;
    $("backLink").hidden = true;
    C.renderStateBox($("editArea"), spec);
  }

  function renderNotFound() {
    renderState({
      emoji: "📭",
      titleKey: "detail.notFound",
      descKey: "error.5001",
      btnKey: "detail.notFoundBtn",
      onBtn: function () { window.location.href = "index.html"; }
    });
  }

  function renderNeedLogin() {
    renderState({
      emoji: "🔒",
      titleKey: "board.stateLoginTitle",
      descKey: "editPage.needLoginDesc",
      btnKey: "guide.btn",
      onBtn: function () {
        window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
      }
    });
  }

  function renderNotMine() {
    renderState({
      emoji: "🚫",
      titleKey: "editPage.notMineTitle",
      descKey: "error.5002",
      btnKey: "detail.notFoundBtn",
      onBtn: function () { window.location.href = detailHref(); }
    });
  }

  /* ---------------- 模式注入（标题 / 副题 / 区块显隐 / 按钮文案） ---------------- */

  function applyMode() {
    var isNew = mode === "new";
    $("pageTitle").textContent = isNew ? t("post.title") : t("editPage.title");
    $("pageSub").textContent = isNew ? t("post.subtitle") : t("editPage.subtitle");
    $("editOrigin").hidden = isNew;
    $("editDanger").hidden = isNew;
    $("newOnlyBlock").hidden = !isNew;
    $("resetBtn").hidden = isNew;            // 新建无“原文”，不设还原
    $("newListTitle").hidden = !isNew;
    $("newList").hidden = !isNew;
    $("editSaveBtn").textContent = isNew ? t("post.submit") : t("edit.save");
    $("submitHint").textContent = isNew ? t("post.submittingNote") : t("editPage.saveHint");
    document.title = (isNew ? t("post.title") : t("editPage.title")) + " · 留言板";
  }

  /* ---------------- 原帖信息条（仅编辑模式，只读上下文） ---------------- */

  function renderOrigin() {
    var box = $("editOrigin");
    box.textContent = "";
    var av = U.avatar(msg.avatarEnum, "avatar--sm edit-origin-avatar");
    box.appendChild(av);

    var main = el("div", "edit-origin-main");
    var label = el("div", "edit-origin-label");
    label.setAttribute("data-text", "editPage.originLabel");
    main.appendChild(label);

    var meta = el("div", "edit-origin-meta");
    meta.appendChild(el("span", null, "@" + msg.nicknameSnapshot));
    meta.appendChild(el("span", "sep", "·"));
    meta.appendChild(el("span", null, "NO." + msg.no));
    meta.appendChild(el("span", "sep", "·"));
    meta.appendChild(el("span", null, t("common.periodN", { n: msg.period })));
    meta.appendChild(el("span", "sep", "·"));
    meta.appendChild(el("span", null, U.fmtDate(msg.createdAt)));
    if (msg.topicTag) {
      meta.appendChild(el("span", "sep", "·"));
      meta.appendChild(el("span", "topic", "#" + msg.topicTag));
    }
    if (msg.edited) meta.appendChild(el("span", "edited-mark", t("common.edited")));
    main.appendChild(meta);
    box.appendChild(main);

    var stats = el("div", "edit-origin-stats");
    stats.appendChild(el("span", null, t("common.statViews") + " " + U.fmtViews(msg.stats.views)));
    stats.appendChild(el("span", null, t("common.likes") + " " + U.fmtViews(msg.stats.likes)));
    stats.appendChild(el("span", null, t("common.statComments") + " " + U.fmtViews(msg.stats.comments)));
    box.appendChild(stats);
    HMB.i18n.apply(box);
  }

  /* ---------------- 工具栏：表情弹层（光标处插入） ---------------- */

  function insertAtCursor(ta, text) {
    var s = typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length;
    var e = typeof ta.selectionEnd === "number" ? ta.selectionEnd : s;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    try { ta.setSelectionRange(s + text.length, s + text.length); } catch (err) { /* noop */ }
    ta.focus();
  }

  function buildEmojiPop() {
    var pop = $("emojiPop");
    pop.textContent = "";
    HMB.SEED.EMOJI_LIBRARY.forEach(function (em) {
      var b = el("button", "emoji-pop-item", em);
      b.type = "button";
      b.title = em;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        insertAtCursor($("editContent"), em);
      });
      pop.appendChild(b);
    });
  }

  function bindToolbar() {
    var pop = $("emojiPop");
    pop.setAttribute("aria-hidden", "true"); // 收起态不进无障碍树
    function setPop(open) {
      pop.classList.toggle("is-open", open);
      pop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    $("emojiBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      setPop(!pop.classList.contains("is-open"));
    });
    document.addEventListener("click", function (e) {
      if (!pop.classList.contains("is-open")) return;
      if (pop.contains(e.target)) return;
      setPop(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setPop(false);
    });

    $("resetBtn").addEventListener("click", function () {
      $("editContent").value = originalContent;
      $("editContent").classList.remove("is-error");
      U.toast(t("editPage.resetDone"));
    });
  }

  /* ---------------- 帖子类型（type 语义映射） ---------------- */

  function renderTypeRow() {
    var row = $("typeRow");
    row.textContent = "";
    [
      { key: true, title: "editPage.typePublic", desc: "editPage.typePublicDesc" },
      { key: false, title: "editPage.typePrivate", desc: "editPage.typePrivateDesc" }
    ].forEach(function (d) {
      var active = isPublic === d.key;
      var opt = el("button", "type-opt" + (active ? " type-opt--active" : ""));
      opt.type = "button";
      opt.setAttribute("role", "radio");
      opt.setAttribute("aria-checked", active ? "true" : "false");
      var title = el("div", "type-opt-title");
      title.appendChild(el("span", "check", "✓"));
      var titleText = el("span");
      titleText.setAttribute("data-text", d.title);
      title.appendChild(titleText);
      opt.appendChild(title);
      var desc = el("div", "type-opt-desc");
      desc.setAttribute("data-text", d.desc);
      opt.appendChild(desc);
      opt.addEventListener("click", function () {
        if (isPublic === d.key) return;
        isPublic = d.key;
        renderTypeRow();
      });
      row.appendChild(opt);
    });
    HMB.i18n.apply(row);
  }

  /* ---------------- 话题标签（fid 语义映射，发布/编辑共用词库） ---------------- */

  function renderTagRow() {
    var row = $("tagRow");
    row.textContent = "";
    HMB.SEED.TOPICS.forEach(function (tag) {
      var chip = el("span", "tag-chip tag-chip--select" + (selectedTag === tag ? " tag-chip--active" : ""), tag);
      chip.tabIndex = 0;
      chip.setAttribute("role", "button");
      var toggle = function () { selectedTag = selectedTag === tag ? "" : tag; renderTagRow(); };
      chip.addEventListener("click", toggle);
      chip.addEventListener("keydown", function (e) { if (e.key === "Enter") toggle(); });
      row.appendChild(chip);
    });
    var none = el("span", "tag-chip tag-chip--select" + (selectedTag === "" ? " tag-chip--active" : ""));
    none.setAttribute("data-text", "post.tagNone");
    none.tabIndex = 0;
    none.setAttribute("role", "button");
    none.addEventListener("click", function () { selectedTag = ""; renderTagRow(); });
    none.addEventListener("keydown", function (e) { if (e.key === "Enter") { selectedTag = ""; renderTagRow(); } });
    row.appendChild(none);
    HMB.i18n.apply(row);
  }

  /* ---------------- 公开范围开关（仅新建模式，F6 用户级开关联动） ---------------- */

  function syncPrivacySwitches() {
    if (!session.loggedIn) return;
    api.getProfile().then(function (resp) {
      if (!resp.success) return;
      $("pflagName").checked = resp.data.flagName;
      $("pflagEmail").checked = resp.data.flagEmail;
      $("pflagPhone").checked = resp.data.flagPhone;
    });
  }

  /* ---------------- 提交（新建 postMessage / 编辑 updateContent，防重锁） ---------------- */

  function setBusy(busy) {
    submitting = busy;
    var btn = $("editSaveBtn");
    btn.disabled = busy;
    btn.textContent = busy ? t("common.submitting")
      : (mode === "new" ? t("post.submit") : t("edit.save"));
  }

  function save() {
    if (submitting) return; // 防重锁
    var ta = $("editContent");
    var content = ta.value.trim();
    if (!content) {
      ta.classList.add("is-error");
      ta.focus();
      return;
    }
    if (!session.loggedIn) { C.openGuideModal("publish"); return; }

    setBusy(true);
    $("editFailBar").classList.add("hint-bar--hidden");

    // 新建：F5 无刷新提交（两阶段定位）采样起点；编辑：就地保存后回详情
    var S = window.scrollY;
    var t0 = performance.now();
    if (mode === "new") {
      HMB.hooks._pushScroll(S);
      [50, 100, 150, 200].forEach(function (dt) {
        setTimeout(function () { HMB.hooks._pushScroll(window.scrollY); }, dt);
      });
    }

    // 新建：随表单开关同步 F6 用户开关（fire-and-forget，不阻塞主流程）
    if (mode === "new") {
      api.updatePrivacy({
        flagName: $("pflagName").checked,
        flagEmail: $("pflagEmail").checked,
        flagPhone: $("pflagPhone").checked,
        csrf: session.csrf
      });
    }

    var req = mode === "new"
      ? api.postMessage({
          content: content,
          nickname: $("postNickname").value.trim(),
          topic: selectedTag,
          csrf: session.csrf
        })
      : api.updateContent({
          resourceId: msg.resourceId,
          content: content,
          topic: selectedTag,
          isPublic: isPublic,
          csrf: session.csrf
        });

    req.then(function (resp) {
      setBusy(false);

      if (!resp.success) {
        if (resp.code === 401) { C.openGuideModal(mode === "new" ? "publish" : "edit"); return; }
        // 4001 敏感词 / 4002 限流 / 9002 CSRF / 9001 参数 / 网络失败：就地提示并保留草稿（流程 B）
        $("editFailBar").textContent = resp.message;
        $("editFailBar").classList.remove("hint-bar--hidden");
        return;
      }

      if (mode === "new") return afterNewPost(resp, t0);
      U.toast(t("edit.successToast"), "success");
      setTimeout(function () { window.location.href = detailHref(); }, 600);
    });
  }

  /* ---------------- 新建成功：F5 两阶段定位 + 新卡高亮 + 表单复位 ---------------- */

  function afterNewPost(resp, t0) {
    var wait = Math.max(0, 200 - (performance.now() - t0));
    setTimeout(function () {
      var card = C.renderCard(resp.data, {
        rank: 1, q: "", session: session, likedSet: {},
        onLike: handleLike,
        onOpen: function (m) { window.location.href = detailHref(m.resourceId); }
      });
      card.style.setProperty("--i", "0");
      card.classList.add("is-entered");
      var list = $("newList");
      list.insertBefore(card, list.firstChild);

      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("is-highlight");
      setTimeout(function () {
        card.classList.remove("is-highlight");
        HMB.hooks.highlightRemovedAt = performance.now();
      }, 1800);

      // 成功复位：内容清空、开关复位、昵称保留（F5 验收）
      $("editContent").value = "";
      $("editContent").classList.remove("is-error");
      selectedTag = "";
      isPublic = true;
      renderTagRow();
      renderTypeRow();
      $("pflagName").checked = false;
      $("pflagEmail").checked = false;
      $("pflagPhone").checked = false;

      U.toast(t("post.successToast"), "success");
    }, wait);
  }

  /** F8 点赞（新卡红心）：350ms 内重复点击复用幂等键 */
  function handleLike(m, statEl) {
    if (!session.loggedIn) { C.openGuideModal("like"); return; }
    var now = Date.now();
    var intent = likeIntent[m.resourceId];
    if (!intent || now - intent.ts > 350) {
      intent = likeIntent[m.resourceId] = {
        idemKey: "idem-" + now + "-" + Math.random().toString(36).slice(2, 8),
        ts: now
      };
    } else {
      intent.ts = now;
    }
    api.like({ targetId: m.resourceId, idemKey: intent.idemKey, csrf: session.csrf })
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

  /* ---------------- 删除（仅编辑模式，P-08 确认弹窗复用） ---------------- */

  function confirmDelete() {
    C.openConfirmModal({
      titleKey: "confirm.deleteTitle",
      warnKey: "confirm.deleteWarn",
      preview: $("editContent").value.trim() || msg.content,
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

  /* ---------------- 编辑器挂载 ---------------- */

  function mountEditor() {
    var area = $("editArea");
    area.textContent = "";
    area.hidden = true;

    var ta = $("editContent");
    if (mode === "edit") {
      renderOrigin();
      originalContent = msg.content;
      ta.value = msg.content;
      selectedTag = msg.topicTag || "";
      isPublic = msg.isPublic !== false;
      var backLink = $("backLink");
      backLink.href = detailHref();
      backLink.hidden = false;
    } else {
      ta.value = "";
      selectedTag = "";
      isPublic = true;
      syncPrivacySwitches();
      if (session.loggedIn) $("postNickname").value = session.nickname;
    }

    buildEmojiPop();
    bindToolbar();
    renderTypeRow();
    renderTagRow();

    $("editorCard").hidden = false;
    HMB.i18n.apply($("editorCard"));

    ta.addEventListener("input", function () {
      ta.classList.remove("is-error");
      $("editFailBar").classList.add("hint-bar--hidden");
    });
    $("editSaveBtn").addEventListener("click", save);
    $("deleteBtn").addEventListener("click", confirmDelete);
  }

  /* ---------------- 入口：?id= 编辑 / 无参新建 ---------------- */

  function init() {
    msgId = qsId();
    mode = msgId ? "edit" : "new";
    api.getSession().then(function (resp) {
      session = resp.data;
      C.renderTopbar(document.getElementById("topbar"), null, session);
      HMB.util.renderDebugPanel();

      if (mode === "new") { applyMode(); mountEditor(); return; }

      // 编辑模式：读取原文不计浏览（countView=false）
      C.renderSkeleton($("editArea"), 2);
      api.getMessage(msgId, { countView: false }).then(function (r) {
        if (!r.success) {
          // 未登录一律引导登录（帖子可能存在，登录后可再判权属）
          if (!session.loggedIn) return renderNeedLogin();
          return renderNotFound();
        }
        msg = r.data;
        if (!session.loggedIn) return renderNeedLogin();
        if (!msg.isMine) return renderNotMine();
        applyMode();
        mountEditor();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
