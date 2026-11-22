/* ============================================================
 * 留言板 · 发布表单共享组件（P-03 / 画布 03）
 * 同一套表单逻辑承载两处宿主：
 *  - index.html 内嵌表单区（PRD 5.12 口径：P-01 内嵌表单区）
 *  - post.html 独立发布页（Page 1 画布 03 整页呈现）
 * 依赖的 DOM id：postSection / postContent / tagRow / pflagName /
 *  pflagEmail / pflagPhone / postNickname / postSubmitBtn / postFailBar
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var t = function (k, p) { return HMB.i18n.t(k, p); };
  var el = U.el;

  var TAGS = ["校园日常", "互助", "食堂", "求助", "盲盒", "日常"];

  /**
   * opts: {
   *   getSession: function() -> session   // 实时取当前会话（含 csrf）
   *   quickPost?: Element                  // 快捷发布条（可选，绑定展开）
   *   insertInto: Element                  // 提交成功后新卡插入的列表容器
   *   onLike: function(msg, statEl)        // 新卡点赞回调
   *   onOpen: function(msg)                // 新卡点击跳详情
   *   onInserted?: function(card, msg)     // 插入后额外处理（tab/期次复位等）
   *   toastOnSuccess?: bool
   * }
   */
  function mount(opts) {
    var $ = function (id) { return document.getElementById(id); };
    var postSection = $("postSection");
    var postContent = $("postContent");
    var tagRow = $("tagRow");
    var postNickname = $("postNickname");
    var submitBtn = $("postSubmitBtn");
    var failBar = $("postFailBar");

    var selectedTag = "";
    var submitting = false;

    function renderTagRow() {
      tagRow.textContent = "";
      TAGS.forEach(function (tag) {
        var chip = el("span", "tag-chip tag-chip--select" + (selectedTag === tag ? " tag-chip--active" : ""), tag);
        chip.tabIndex = 0;
        chip.setAttribute("role", "button");
        var toggle = function () { selectedTag = selectedTag === tag ? "" : tag; renderTagRow(); };
        chip.addEventListener("click", toggle);
        chip.addEventListener("keydown", function (e) { if (e.key === "Enter") toggle(); });
        tagRow.appendChild(chip);
      });
      var none = el("span", "tag-chip tag-chip--select" + (selectedTag === "" ? " tag-chip--active" : ""));
      none.setAttribute("data-text", "post.tagNone");
      none.tabIndex = 0;
      none.addEventListener("click", function () { selectedTag = ""; renderTagRow(); });
      tagRow.appendChild(none);
      HMB.i18n.apply(tagRow);
    }

    /** 公开开关 ← 用户 F6 开关（v1 联动语义，见 README） */
    function syncPrivacySwitches() {
      var session = opts.getSession();
      if (!session.loggedIn) return;
      HMB.api.getProfile().then(function (resp) {
        if (!resp.success) return;
        $("pflagName").checked = resp.data.flagName;
        $("pflagEmail").checked = resp.data.flagEmail;
        $("pflagPhone").checked = resp.data.flagPhone;
      });
    }

    function expand() {
      if (!postSection.hidden) {
        postContent.focus();
        return;
      }
      postSection.hidden = false;
      syncPrivacySwitches();
      setTimeout(function () { postContent.focus(); }, 120);
    }

    if (opts.quickPost) {
      opts.quickPost.addEventListener("click", expand);
      opts.quickPost.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expand(); }
      });
    }

    function submit() {
      var session = opts.getSession();
      if (submitting) return; // F5 防重锁
      if (!session.loggedIn) { C.openGuideModal("publish"); return; }

      var content = postContent.value.trim();
      if (!content) {
        postContent.classList.add("is-error");
        postContent.focus();
        return;
      }

      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = t("common.submitting");
      failBar.classList.add("hint-bar--hidden");

      var S = window.scrollY;
      var t0 = performance.now();
      HMB.hooks._pushScroll(S);
      // 阶段一采样：0–200ms 内滚动位置应保持不变（供 __boardTest.scrollYAt 断言）
      [50, 100, 150, 200].forEach(function (dt) {
        setTimeout(function () { HMB.hooks._pushScroll(window.scrollY); }, dt);
      });

      // 随表单开关同步 F6 用户开关（fire-and-forget，不阻塞主流程）
      HMB.api.updatePrivacy({
        flagName: $("pflagName").checked,
        flagEmail: $("pflagEmail").checked,
        flagPhone: $("pflagPhone").checked,
        csrf: session.csrf
      });

      HMB.api.postMessage({
        content: content,
        nickname: postNickname.value.trim(),
        topic: selectedTag,
        csrf: session.csrf
      }).then(function (resp) {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.setAttribute("data-text", "post.submit");
        submitBtn.textContent = t("post.submit");

        if (!resp.success) {
          if (resp.code === 401) { C.openGuideModal("publish"); return; }
          // 4001 敏感词 / 4002 限流 / 9002 CSRF / 网络失败：就地提示并保留草稿（流程 B）
          failBar.textContent = resp.message;
          failBar.classList.remove("hint-bar--hidden");
          return;
        }

        // —— F5 两阶段定位 ——
        var wait = Math.max(0, 200 - (performance.now() - t0));
        setTimeout(function () {
          var card = C.renderCard(resp.data, {
            rank: 1, q: "", session: session, likedSet: {},
            onLike: opts.onLike, onOpen: opts.onOpen
          });
          card.style.setProperty("--i", "0");
          card.classList.add("is-entered");
          opts.insertInto.insertBefore(card, opts.insertInto.firstChild);

          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("is-highlight");
          setTimeout(function () {
            card.classList.remove("is-highlight");
            HMB.hooks.highlightRemovedAt = performance.now();
          }, 1800);

          // 成功复位：输入清空、开关复位、昵称保留（F5 验收）
          postContent.value = "";
          selectedTag = "";
          renderTagRow();
          $("pflagName").checked = false;
          $("pflagEmail").checked = false;
          $("pflagPhone").checked = false;

          if (opts.onInserted) opts.onInserted(card, resp.data);
          if (opts.toastOnSuccess) U.toast(t("post.successToast"), "success");
        }, wait);
      });
    }

    submitBtn.addEventListener("click", submit);
    postContent.addEventListener("input", function () {
      postContent.classList.remove("is-error");
      failBar.classList.add("hint-bar--hidden");
    });

    renderTagRow();
    if (opts.getSession().loggedIn) {
      postNickname.value = opts.getSession().nickname;
    }
    syncPrivacySwitches();

    return {
      expand: expand,
      submit: submit,
      isBusy: function () { return submitting; }
    };
  }

  HMB.publishForm = { mount: mount };
})(window, document);
