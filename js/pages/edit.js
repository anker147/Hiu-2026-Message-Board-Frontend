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
  var pendingImages = [];   // 文末图片引用（localimg://id），最多 10 张，随发布/保存提交

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
    $("editSaveBtn").textContent = isNew ? t("post.submit") : t("edit.save");
    document.title = (isNew ? t("post.title") : t("editPage.title")) + " · 留言板";
  }

  /* ---------------- 原帖信息条（仅编辑模式，只读上下文） ---------------- */

  function renderOrigin() {
    var box = $("editOrigin");
    box.textContent = "";
    var av = U.avatar(msg.avatarEnum, "avatar--sm edit-origin-avatar", msg.avatarUrl);
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

  /* ---------------- 文末图片（最多 10 张，横滑无滚动条） ---------------- */

  function renderImageStrip() {
    var strip = $("eiStrip");
    if (!strip) return;
    strip.textContent = "";
    $("eiCount").textContent = pendingImages.length + "/" + HMB.media.MAX_IMAGES;
    pendingImages.forEach(function (ref, idx) {
      var cell = el("div", "ei-item");
      var img = HMB.media.el(ref, "ei-thumb", "文末图片 " + (idx + 1));
      if (img) cell.appendChild(img);
      else cell.appendChild(el("div", "ei-thumb ei-thumb--err", "图片丢失"));
      var del = el("button", "ei-del", "×");
      del.type = "button";
      del.setAttribute("aria-label", "移除第 " + (idx + 1) + " 张");
      del.addEventListener("click", function () {
        pendingImages.splice(idx, 1);
        renderImageStrip();
      });
      cell.appendChild(del);
      strip.appendChild(cell);
    });
    var addCell = el("button", "ei-item ei-add-cell", "+");
    addCell.type = "button";
    addCell.setAttribute("aria-label", "添加图片");
    addCell.disabled = pendingImages.length >= HMB.media.MAX_IMAGES;
    addCell.addEventListener("click", function () { $("eiFile").click(); });
    strip.appendChild(addCell);
  }

  function bindImages() {
    var input = $("eiFile");
    if (!input) return;
    $("eiAddBtn").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = "";
      if (!files.length) return;
      var room = HMB.media.MAX_IMAGES - pendingImages.length;
      if (room <= 0) { U.toast(t("editPage.imagesMax") || "最多 10 张图片", "error"); return; }
      HMB.media.saveMany(files.slice(0, room), function (r) {
        r.refs.forEach(function (ref) {
          if (pendingImages.length < HMB.media.MAX_IMAGES) pendingImages.push(ref);
        });
        renderImageStrip();
        if (r.errors.length) U.toast(t("editPage.imagesFail") || "部分图片添加失败", "error");
      });
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

    // 文末图片：图片按钮启用，打开多选文件（正文不插图，图统一放文末）
    $("tbImage").classList.remove("is-disabled");
    $("tbImage").addEventListener("click", function () { $("eiFile").click(); });
    // 其余能力仍为原型禁用态，点击就地说明
    ["tbVideo", "tbPoll", "tbAt", "tbQuote"].forEach(function (id) {
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
          images: pendingImages.slice(),
          csrf: session.csrf
        })
      : api.updateContent({
          resourceId: msg.resourceId,
          title: title,
          content: content,
          topic: selectedTag,
          isPublic: isPublic,
          images: pendingImages.slice(),
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

      if (mode === "new") return afterNewPost(t0);
      U.toast(t("edit.successToast"), "success");
      setTimeout(function () { window.location.href = detailHref(); }, 600);
    });
  }

  /* ---------------- 新建成功：直接回到「我的留言」，由目标页给出成功反馈 ----------------
     发布页不再保留「最新发布」列表；新帖在 mine 视图按最新优先自然排在首位。 */
  function afterNewPost(t0) {
    var wait = Math.max(0, 260 - (performance.now() - t0));
    setTimeout(function () {
      window.location.href = "index.html?tab=mine&posted=1";
    }, wait);
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
      pendingImages = (msg.images || []).slice(0, HMB.media.MAX_IMAGES);
      $("backLink") && ($("backLink").href = detailHref());
    } else {
      setContent("");
      titleInput.value = "";
      selectedTag = "";
      isPublic = true;
      pendingImages = [];
      syncPrivacySwitches();
      if (session.loggedIn) $("postNickname").value = session.nickname;
    }
    renderImageStrip();

    renderTypeDropdown();
    renderTopicDropdown();
    buildEmojiPop();
    bindToolbar();
    bindImages();
    updateWordCount();

    $("editorTopbar").hidden = false;
    $("toolbarBar").hidden = false;
    $("editorCanvas").hidden = false;
    $("footerBar").hidden = false;
    // 编辑器各块逐层上浮淡入（追风杯 view-rise-in 语言）
    ["editorTopbar", "toolbarBar", "editorCanvas", "footerBar"].forEach(function (id) {
      var node = $(id);
      if (!node) return;
      node.classList.remove("view-in");
      void node.offsetWidth;
      node.classList.add("view-in");
    });
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
