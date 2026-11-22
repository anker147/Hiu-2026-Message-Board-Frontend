/* ============================================================
 * 留言板 · 首页榜单页（P-01 + P-03 内嵌表单区）
 * tab 切换 / 搜索防抖 / 自定义下拉 / 浮动操作（发布入口 → 帖子编辑器新建模式）/
 * 点赞状态机（F8）/ 盲盒入口（F9）/ 四态
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
  var likedSet = {};
  var likeIntent = {};
  var currentPeriod = HMB.db.getSettings().currentPeriod;

  var state = {
    tab: "hot",       // hot | latest | mine
    sortKey: "heat",  // heat | latest | likes | comments
    period: currentPeriod,
    q: ""
  };

  var els = {};

  /* ---------------- 初始化 ---------------- */

  function init() {
    els.topbar = $("topbar");
    els.searchInput = $("searchInput");
    els.searchIcon = $("searchIcon");
    els.sortDropdown = $("sortDropdown");
    els.periodDropdown = $("periodDropdown");
    els.listCaption = $("listCaption");
    els.boardList = $("boardList");
    els.publishFloatBtn = $("publishFloatBtn");
    els.blindboxBtn = $("blindboxBtn");
    els.issueBadge = $("issueBadge");
    els.issueText = $("issueText");
    els.boardView = $("boardView");

    // URL → tab
    var m = window.location.search.match(/[?&]tab=(\w+)/);
    if (m && ["hot", "latest", "mine", "about"].indexOf(m[1]) >= 0) state.tab = m[1];

    // 图标（静态 SVG 常量）
    els.searchIcon.appendChild(U.icon("search"));
    $("publishIcon").appendChild(U.icon("pencil"));
    $("blindboxIcon").appendChild(U.icon("gift"));

    // Banner 期次（留言板自有周榜期次，PRD 9.0/9.6）
    var period = HMB.SEED.PERIODS.find(function (p) { return p.no === currentPeriod; });
    els.issueBadge.textContent = String(currentPeriod);
    els.issueText.textContent = t("banner.issue", { n: currentPeriod, range: period ? period.range : "" });

    api.getSession().then(function (resp) {
      session = resp.data;
      renderTopbarIfNeeded();
      bindToolbar();
      bindFloatActions();
      if (state.tab === "about") {   // ?tab=about 直达：显示关于视图，跳过列表
        if (els.boardView) els.boardView.hidden = true;
        if (HMB.pages.about) HMB.pages.about.show();
        return;
      }
      loadList();
      restoreReturn();
      HMB.util.renderDebugPanel();
    });
  }

  function restoreReturn() {
    var ret = C.consumeReturnPoint();
    if (ret && ret.scrollY) {
      setTimeout(function () { window.scrollTo(0, ret.scrollY); }, 60);
    }
  }

  /* ---------------- 工具栏：下拉 + 搜索 ---------------- */

  function bindToolbar() {
    U.makeDropdown(els.sortDropdown, [
      { key: "heat", label: t("common.sortHeat") },
      { key: "latest", label: t("common.sortLatest") },
      { key: "likes", label: t("common.sortLikes") },
      { key: "comments", label: t("common.sortComments") }
    ], state.sortKey, function (key) {
      state.sortKey = key;
      loadList();
    });

    var periodItems = HMB.SEED.PERIODS.map(function (p) {
      return {
        key: String(p.no),
        label: p.no === currentPeriod ? t("common.periodCurrent", { n: p.no }) : t("common.periodN", { n: p.no })
      };
    });
    U.makeDropdown(els.periodDropdown, periodItems, String(state.period),
      function (key) { state.period = parseInt(key, 10); loadList(); });

    var debounced = U.debounce(function () {
      state.q = els.searchInput.value.trim();
      loadList();
    }, 200); // 搜索防抖 200ms（PRD 9.4）
    els.searchInput.addEventListener("input", debounced);
    els.searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        state.q = els.searchInput.value.trim();
        loadList();
      }
    });
  }

  /* ---------------- 浮动操作 ---------------- */

  function bindFloatActions() {
    // 发布入口 → 帖子编辑器新建模式（原内嵌表单区已移除，编辑器统一承接新建/编辑）
    els.publishFloatBtn.addEventListener("click", function () {
      window.location.href = "edit.html?mode=new";
    });
    els.blindboxBtn.addEventListener("click", function () {
      if (!session.loggedIn) { C.openGuideModal("blindbox"); return; }
      C.openBlindboxModal(session);
    });
  }

  /* ---------------- 榜单列表 ---------------- */

  function openDetail(msg) {
    window.location.href = "detail.html?id=" + encodeURIComponent(msg.resourceId);
  }

  /** F8 点赞：350ms 内重复点击复用同一幂等键（双击最终 +1，不抖动） */
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
    api.like({
      targetId: msg.resourceId,
      idemKey: intent.idemKey,
      csrf: session.csrf
    }).then(function (resp) {
      if (resp.code === 401) { C.openGuideModal("like"); return; }
      if (resp.success) {
        likedSet[msg.resourceId] = resp.data.liked;
        statEl.classList.toggle("is-liked", resp.data.liked);
        var cnt = statEl.querySelector("span:last-child");
        if (cnt) cnt.textContent = U.fmtViews(resp.data.count);
        U.toast(resp.data.liked ? t("toast.likeOn") : t("toast.likeOff"));
      } else {
        U.toast(resp.message, "error");
      }
    });
  }

  /* 顶栏仅按需重建：会话或 tab 变化才重建（软切换由岛内 activateTab 自更新，
     排序/期次等列表级刷新不惊动导航岛） */
  function renderTopbarIfNeeded() {
    var sessKey = session && session.loggedIn ? session.token : "guest";
    if (state._topbarSess !== sessKey || state._topbarTab !== state.tab ||
        !els.topbar.querySelector(".nav-island")) {
      C.renderTopbar(els.topbar, state.tab, session);
      state._topbarSess = sessKey;
      state._topbarTab = state.tab;
    }
  }

  var listReqSeq = 0;   // 列表请求序号：快速连续切 tab 时丢弃过期响应，防旧结果覆盖新 tab
  function loadList(opts) {
    opts = opts || {};
    if (!opts.skipTopbar) renderTopbarIfNeeded();
    if (state.tab === "about") return;   // 关于视图：无留言列表
    C.renderSkeleton(els.boardList, 6);

    // “我的留言”未登录 → 无权限态引导 P-05（5.12）
    if (state.tab === "mine" && !session.loggedIn) {
      listReqSeq++;           // 使在途响应过期：慢返回不得覆盖此锁定态
      HMB.hooks._skeletonHide();
      C.renderStateBox(els.boardList, {
        emoji: "🔒",
        titleKey: "board.stateLoginTitle",
        descKey: "board.stateLoginDesc",
        btnKey: "guide.btn",
        onBtn: function () {
          C.saveReturnPoint({ source: "mine-tab" });
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
        }
      });
      els.listCaption.textContent = "";
      return;
    }

    var seq = ++listReqSeq;
    api.getMessages({
      tab: state.tab,
      sort: state.sortKey,
      period: state.period,
      q: state.q
    }).then(function (resp) {
      if (seq !== listReqSeq) return;   // 过期响应：用户已切到别的 tab
      HMB.hooks._skeletonHide(); // 骨架 → 真实卡片切换（≤300ms 可测）
      els.boardList.textContent = "";

      if (!resp.success) {
        C.renderStateBox(els.boardList, {
          emoji: "⚠️",
          titleKey: "board.stateErrorTitle",
          descKey: "board.stateErrorDesc",
          btnKey: "common.retry",
          onBtn: loadList
        });
        return;
      }

      var list = resp.data.list;
      likedSet = {};
      resp.data.likedIds.forEach(function (id) { likedSet[id] = true; });

      if (state.q) {
        els.listCaption.textContent = t("common.foundCount", { n: list.length });
      } else {
        els.listCaption.textContent = "";
      }

      if (list.length === 0) {
        if (state.q) {
          var box = C.renderStateBox(els.boardList, {
            emoji: "🔍",
            titleKey: "board.stateErrorTitle",
            descKey: "board.stateErrorDesc"
          });
          box.querySelector(".state-title").textContent = t("common.searchPlaceholder") + "：";
          box.querySelector(".state-desc").textContent = t("board.searchNoResult", { q: state.q });
        } else {
          C.renderStateBox(els.boardList, {
            emoji: "✏️",
            titleKey: "board.stateEmptyTitle",
            descKey: "board.stateEmptyDesc",
            btnKey: "board.stateEmptyBtn",
            onBtn: function () {
              window.location.href = "edit.html?mode=new";
            }
          });
        }
        return;
      }

      list.forEach(function (m, i) {
        var card = C.renderCard(m, {
          rank: i + 1,
          q: state.q,
          session: session,
          likedSet: likedSet,
          onLike: handleLike,
          onOpen: openDetail
        });
        card.style.setProperty("--i", String(i)); // 子层逐层进入：25ms 递增
        card.classList.add("is-entered");
        els.boardList.appendChild(card);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // 顶栏"岛"软切换入口：只重载列表，导航动画由 renderTopbar 内部处理
  HMB.pages = HMB.pages || {};
  HMB.pages.board = {
    switchTab: function (key) {
      if (["hot", "latest", "mine", "about"].indexOf(key) < 0 || state.tab === key) return;
      state.tab = key;
      state._topbarTab = key;
      if (key === "about") {
        listReqSeq++;                                  // 使在途列表响应过期
        if (els.boardView) els.boardView.hidden = true;
        if (HMB.pages.about) HMB.pages.about.show();
        return;
      }
      if (HMB.pages.about) HMB.pages.about.hide();
      if (els.boardView) els.boardView.hidden = false;
      loadList({ skipTopbar: true });
    }
  };
})(window, document);
