/* ============================================================
 * 留言板 · 帖子编辑器（新建 / 编辑统一入口）
 * 形制参照好游快爆 sendThreadShow 发帖器：
 *  - 顶部操作行：类型下拉（「文章▾」→ 帖子可见类型）+ 话题版块下拉（fid）
 *  - 图标工具栏：表情可用；图片/视频/投票/@/引用为原型禁用态（无后端能力）
 *  - 居中窄卡：标题（选填）·48 字以内 + 分隔线 + 正文（纯白大区）
 *  - 设置封面禁用卡 + 「▼ 发布设置」折叠设置卡（公开范围 / 本次昵称 / 危险区）
 *  - 底部固定条：正文字数（实时）+ 发布 / 保存修改
 * 双模式：?id=<resourceId> 编辑（预填原文，API-07，标记「已编辑」）；
 *         无参 / ?mode=new 新建（承接原 P-03 全部语义：F5 两阶段定位等）。
 * 红线说明：标题/字数计数按新参考（好游快爆）落地；图片上传与封面不设
 * （无后端存储），工具栏对应项为禁用态并就地说明。
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

  /* ---------------- 富文本正文读写（白名单清洗后再提交/回填） ---------------- */

  function contentEl() { return $("editContent"); }
  function getContentHtml() { return U.sanitizeRichHtml(contentEl().innerHTML); }
  function getPlainContent() { return U.richTextToPlain(contentEl().innerHTML); }

  function setContent(raw) {
    var node = contentEl();
    var s = String(raw == null ? "" : raw);
    if (/<[a-z][\s\S]*>/i.test(s)) node.innerHTML = U.sanitizeRichHtml(s);
    else node.textContent = s;
    updateWordCount();
  }

  /** 光标处插入纯文本（表情） */
  function insertTextAtCursor(text) {
    var done = false;
    try { done = document.execCommand("insertText", false, text); } catch (err) { /* noop */ }
    if (!done) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount) {
        var r = sel.getRangeAt(0);
        r.deleteContents();
        r.insertNode(document.createTextNode(text));
        r.collapse(false);
        sel.removeAllRanges(); sel.addRange(r);
      }
    }
    updateWordCount();
  }

  /** 选区所在的块级元素（缩进作用于整段，符合 Word 习惯） */
  function currentBlock() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var n = sel.getRangeAt(0).commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    var root = contentEl();
    while (n && n !== root && n.nodeType === 1) {
      var tag = n.tagName.toUpperCase();
      if (tag === "P" || tag === "DIV" || tag === "H1" || tag === "H2" ||
          tag === "H3" || tag === "LI" || tag === "BLOCKQUOTE") return n;
      n = n.parentNode;
    }
    return null;
  }

  function execRich(cmd, value) {
    var node = contentEl();
    node.focus();
    try { document.execCommand("styleWithCSS", false, true); } catch (err) { /* noop */ }
    document.execCommand(cmd, false, value);
    syncRichState();
    updateWordCount();
  }

  function toggleIndent() {
    var block = currentBlock();
    if (!block) { execRich("formatBlock", "<p>"); block = currentBlock(); }
    if (!block || !block.style) return;
    block.style.textIndent = block.style.textIndent === "2em" ? "" : "2em";
    updateWordCount();
  }

  function syncRichState() {
    var btns = document.querySelectorAll("#richTools .rt-btn[data-cmd]");
    for (var i = 0; i < btns.length; i++) {
      var cmd = btns[i].getAttribute("data-cmd");
      var on = false;
      try { on = document.queryCommandState(cmd); } catch (err) { /* noop */ }
      btns[i].classList.toggle("is-active", on);
    }
  }

  var session = { loggedIn: false };
  var msg = null;
  var msgId = "";
  var mode = "new";           // "new" | "edit"
  var originalContent = "";
  var originalTitle = "";
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
    $("editorTopbar").hidden = true;
    $("toolbarBar").hidden = true;
    $("editorCanvas").hidden = true;
    $("footerBar").hidden = true;
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

  /* ---------------- 模式注入（区块显隐 / 模式标记 / 底部按钮） ---------------- */

  function applyMode() {
    var isNew = mode === "new";
    $("modeChip").textContent = isNew ? t("editPage.modeNew") : t("editPage.modeEdit");
    $("editOrigin").hidden = isNew;
    $("newOnlyBlock").hidden = !isNew;
    $("newListTitle").hidden = !isNew;
    $("newList").hidden = !isNew;
    $("editSaveBtn").textContent = isNew ? t("post.submit") : t("edit.save");
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

  /* ---------------- 顶部下拉：帖子类型 / 话题版块（fid 语义映射） ---------------- */

  function renderTypeDropdown() {
    U.makeDropdown($("typeDropdown"), [
      { key: "public", label: t("editPage.typePublic") },
      { key: "private", label: t("editPage.typePrivate") }
    ], isPublic ? "public" : "private", function (key) {
      isPublic = key === "public";
    });
    var root = $("typeDropdown");
    root.querySelector(".dropdown-btn").classList.add("editor-select-btn");
    HMB.i18n.apply(root);
  }

  function renderTopicDropdown() {
    var items = [{ key: "", label: t("post.tagNone") }].concat(
      HMB.SEED.TOPICS.map(function (tag) { return { key: tag, label: tag }; })
    );
    U.makeDropdown($("topicDropdown"), items, selectedTag, function (key) {
      selectedTag = key;
    });
    $("topicDropdown").querySelector(".dropdown-btn").classList.add("editor-select-btn");
  }

  /* ---------------- 图标工具栏：表情弹层（光标处插入）+ 禁用态 ---------------- */

  function buildEmojiPop() {
    var pop = $("emojiPop");
    pop.textContent = "";
    HMB.SEED.EMOJI_LIBRARY.forEach(function (em) {
      var b = el("button", "emoji-pop-item", em);
      b.type = "button";
      b.title = em;
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          insertTextAtCursor(em);
        });
      pop.appendChild(b);
    });
  }

  function bindToolbar() {
    // Word 式排版工具栏：mousedown 阻止默认行为，避免点击按钮丢失正文选区
    var rich = $("richTools");
    var rbtns = rich.querySelectorAll("button");
    for (var bi = 0; bi < rbtns.length; bi++) {
      (function (btn) {
        btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
        btn.addEventListener("click", function () {
          if (btn.id === "rtIndent") toggleIndent();
          else execRich(btn.getAttribute("data-cmd"), null);
        });
      })(rbtns[bi]);
    }
    $("rtFont").addEventListener("change", function () {
      var v = this.value;
      execRich("fontName", v || "'Microsoft YaHei',sans-serif");
    });
    $("rtSize").addEventListener("change", function () { execRich("fontSize", this.value); });
    $("rtTitle").addEventListener("change", function () {
      var v = this.value;
      execRich("formatBlock", v === "p" ? "<p>" : "<" + v + ">");
      this.value = "p";
    });
    contentEl().addEventListener("keyup", syncRichState);
    contentEl().addEventListener("mouseup", syncRichState);

    // 禁用态图标注入（静态 SVG 常量，非用户内容）
    [["tbImage", "image"], ["tbVideo", "video"], ["tbPoll", "poll"], ["tbAt", "at"], ["tbQuote", "quote"]]
      .forEach(function (pair) {
        var btn = $(pair[0]);
        btn.textContent = "";
        btn.appendChild(U.icon(pair[1]));
      });
    // 封面按钮图标
    var coverBtn = $("coverBtn");
    coverBtn.textContent = "";
    coverBtn.appendChild(U.icon("image"));

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

    // 禁用态按钮：原型无图片/视频/投票/@/引用能力，点击就地说明
    ["tbImage", "tbVideo", "tbPoll", "tbAt", "tbQuote"].forEach(function (id) {
      $(id).addEventListener("click", function () {
        U.toast($(id).getAttribute("title") || t("editPage.disabledImageTip"));
      });
    });

    // 封面按钮同禁用语义
    $("coverBtn").addEventListener("click", function () {
      U.toast(t("editPage.disabledCoverTip"));
    });

    // 设置卡折叠（「▼ 发布设置」）
    var settingsCard = document.querySelector(".editor-settings-card");
    $("settingsToggle").addEventListener("click", function () {
      settingsCard.classList.toggle("is-collapsed");
    });
  }

  /* ---------------- 正文字数（底部固定条，实时） ---------------- */

  function updateWordCount() {
    var n = getPlainContent().length;
    $("wordCount").textContent = String(n);
    var counter = $("wordCount").parentNode;
    if (counter && counter.classList) counter.classList.toggle("is-over", n > 500);
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
    var ta = contentEl();
    var content = getContentHtml();
    var plain = U.richTextToPlain(content);
    if (!plain) {
      ta.classList.add("is-error");
      ta.focus();
      return;
    }
    if (plain.length > 500) {
      U.toast(t("post.contentMax"), "error");
      return;
    }
    if (!session.loggedIn) { C.openGuideModal("publish"); return; }

    var title = ($("editTitle").value || "").trim();

    setBusy(true);
    $("editFailBar") && $("editFailBar").classList.add("hint-bar--hidden");

    // 新建：F5 无刷新提交（两阶段定位）采样起点
    var S = window.scrollY;
    var t0 = performance.now();
    if (mode === "new") {
      HMB.hooks._pushScroll(S);
      [50, 100, 150, 200].forEach(function (dt) {
        setTimeout(function () { HMB.hooks._pushScroll(window.scrollY); }, dt);
      });
      // 随表单开关同步 F6 用户开关（fire-and-forget，不阻塞主流程）
      api.updatePrivacy({
        flagName: $("pflagName").checked,
        flagEmail: $("pflagEmail").checked,
        flagPhone: $("pflagPhone").checked,
        csrf: session.csrf
      });
    }

    var req = mode === "new"
      ? api.postMessage({
          title: title,
          content: content,
          nickname: $("postNickname").value.trim(),
          topic: selectedTag,
          csrf: session.csrf
        })
      : api.updateContent({
          resourceId: msg.resourceId,
          title: title,
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
        U.toast(resp.message, "error");
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
      // api 只回传原始 stats，卡片折合分由前端计算（万分制展示）
      resp.data.heat = U.messageScore(resp.data) / 10000;
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

      // 成功复位：标题/内容清空、开关复位、昵称保留（F5 验收）
      setContent("");
      $("editTitle").value = "";
      $("editContent").classList.remove("is-error");
      selectedTag = "";
      isPublic = true;
      renderTopicDropdown();
      renderTypeDropdown();
      $("pflagName").checked = false;
      $("pflagEmail").checked = false;
      $("pflagPhone").checked = false;
      updateWordCount();

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
      preview: ($("editTitle").value ? $("editTitle").value + "：" : "") + getPlainContent(),
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

    var ta = contentEl();
    var titleInput = $("editTitle");
    if (mode === "edit") {
      renderOrigin();
      originalContent = msg.content;
      originalTitle = msg.title || "";
      setContent(msg.content);
      titleInput.value = originalTitle;
      selectedTag = msg.topicTag || "";
      isPublic = msg.isPublic !== false;
      $("backLink") && ($("backLink").href = detailHref());
    } else {
      setContent("");
      titleInput.value = "";
      selectedTag = "";
      isPublic = true;
      syncPrivacySwitches();
      if (session.loggedIn) $("postNickname").value = session.nickname;
    }

    renderTypeDropdown();
    renderTopicDropdown();
    buildEmojiPop();
    bindToolbar();
    updateWordCount();

    $("editorTopbar").hidden = false;
    $("toolbarBar").hidden = false;
    $("editorCanvas").hidden = false;
    $("footerBar").hidden = false;
    HMB.i18n.apply($("editorTopbar"));
    HMB.i18n.apply($("toolbarBar"));
    HMB.i18n.apply(document.querySelector(".editor-canvas"));
    HMB.i18n.apply($("footerBar"));
    ta.setAttribute("data-placeholder", t("editPage.contentPlaceholder"));

    ta.addEventListener("input", function () {
      ta.classList.remove("is-error");
      updateWordCount();
    });
    titleInput.addEventListener("input", function () {
      titleInput.classList.remove("is-error");
    });
    $("editSaveBtn").addEventListener("click", save);
    $("deleteBtn").addEventListener("click", confirmDelete);
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
