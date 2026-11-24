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
    period: currentPeriod,   // 新帖榜所选期次（默认本期）
    // 热榜所选期次（周榜按期次出版：默认最新已发布期次 = 上一期，即“上一周的数据”）
    hotPeriod: (function () {
      var prev = HMB.SEED.PERIODS.filter(function (p) { return p.no < currentPeriod; })
        .map(function (p) { return p.no; })
        .sort(function (a, b) { return b - a; })[0];
      return prev || currentPeriod; // 无更早期次时回退本期（统计中预览）
    })(),
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

    // 视图外壳随 tab 切换（banner 标题/期次徽章 + 工具栏下拉组合）
    els.banner = document.querySelector(".banner");
    els.bannerTitle = document.querySelector(".banner-title");
    updateView();
    renderPeriodDropdown();

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

  /* ---------------- 视图外壳随 tab 切换（Banner + 工具栏） ---------------- */

  /** 双榜视图语义（周榜按期次出版，biliboard 式）：
   *  - 热榜（周榜）：已发布存档榜，默认显示上一期（“上一周的数据”），期次下拉可回看往期，
   *    当前期标注“统计中”可实时预览；
   *  - 新帖（新帖榜）：本周新帖按折合分实时排序，期次下拉可回看往期；
   *  - 我的留言：隐藏 banner 与两个下拉（固定最新优先，无期次语义，卡片无排名显示）；
   *  - 关于视图由 boardView 整体隐藏承接 */
  function updateView() {
    if (!els.banner || !els.bannerTitle) return;
    els.banner.hidden = state.tab === "mine";
    var latest = state.tab === "latest";
    var key = latest ? "banner.titleNew" : "banner.title";
    // 直接写 textContent（apply 的 querySelectorAll 不含根元素自身）；
    // data-text 同步更新，整体 apply(document) 重注入时不会回退
    els.bannerTitle.setAttribute("data-text", key);
    els.bannerTitle.textContent = t(key);
    els.banner.setAttribute("aria-label", t(latest ? "banner.ariaNew" : "banner.ariaHot"));
    refreshIssueBadge();
    // 工具栏：排序下拉在我的留言隐藏（固定最新优先）；期次下拉仅双榜视图需要
    els.sortDropdown.hidden = state.tab === "mine";
    els.periodDropdown.hidden = state.tab === "mine";
  }

  /** 期次徽章：热榜随所选期次（默认上一期已发布榜），新帖随所选期次（默认本期） */
  function refreshIssueBadge() {
    var periodNo = state.tab === "hot" ? state.hotPeriod
      : (state.tab === "latest" ? state.period : currentPeriod);
    var period = HMB.SEED.PERIODS.find(function (p) { return p.no === periodNo; });
    els.issueBadge.textContent = String(periodNo);
    els.issueText.textContent = t("banner.issue", { n: periodNo, range: period ? period.range : "" });
  }

  /** 期次下拉按 tab 重建（makeDropdown 不清空挂载点，切 tab 需显式重渲染）：
   *  热榜当前期标注“统计中”，新榜当前期标注“本期” */
  function renderPeriodDropdown() {
    els.periodDropdown.textContent = "";   // makeDropdown 不清空挂载点：切 tab 重建前必须先清，否则 btn/menu 逐次叠加
    var isHot = state.tab === "hot";
    var items = HMB.SEED.PERIODS.map(function (p) {
      return {
        key: String(p.no),
        label: p.no === currentPeriod
          ? t(isHot ? "common.periodOngoing" : "common.periodCurrent", { n: p.no })
          : t("common.periodN", { n: p.no })
      };
    });
    U.makeDropdown(els.periodDropdown, items,
      String(isHot ? state.hotPeriod : state.period),
      function (k) {
        if (isHot) state.hotPeriod = parseInt(k, 10);
        else state.period = parseInt(k, 10);
        refreshIssueBadge();
        loadList();
      });
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
    // 期次下拉由 renderPeriodDropdown 按 tab 重建（bindToolbar 仅在会话就绪时调用一次）

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
      sort: state.tab === "mine" ? "latest" : state.sortKey,  // 我的留言固定最新优先
      // 热榜=所选期次的已发布周榜（默认上一期）；新帖榜=所选期次（默认本期）
      period: state.tab === "hot" ? state.hotPeriod
        : (state.tab === "latest" ? state.period : undefined),
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
          rank: state.tab === "mine" ? null : i + 1,                        // 我的留言无排名显示
          peakMode: state.tab === "mine" ? "dual" : (state.tab === "latest" ? "new" : "hot"),
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
    /* —— 预判目标页的最大滚动值（软切换转场选路用）：
         非列表区实测高度 + 目标 tab 列表估高（单卡 104px + 间距）- 视口。
         当前 scrollY 超过它 → 换页时滚动位置会被钳制硬切 → 应走编排转场；
         mock 数据本地即回，判定失败返回 Infinity → 保持线性回顶旧路径。 —— */
    predictTargetMaxScroll: function (key) {
      if (key === "about") return Promise.resolve(0);              // 全视口固定场景
      if (key === "mine" && !session.loggedIn) return Promise.resolve(0);  // 未登录仅一个状态框
      return api.getMessages({
        tab: key,
        sort: key === "mine" ? "latest" : state.sortKey,
        period: key === "hot" ? state.hotPeriod
          : (key === "latest" ? state.period : undefined),
        q: state.q
      }).then(function (resp) {
        if (!resp.success || !els.boardView || !els.boardList) return Infinity;
        var n = resp.data.list.length;
        var chrome = els.boardView.offsetHeight - els.boardList.offsetHeight - els.listCaption.offsetHeight;
        return Math.max(0, chrome + n * 118 + 24 - window.innerHeight);
      }).catch(function () { return Infinity; });
    },
    switchTab: function (key) {
      if (["hot", "latest", "mine", "about"].indexOf(key) < 0 || state.tab === key) return;
      state.tab = key;
      state._topbarTab = key;
      updateView();
      renderPeriodDropdown(); // 期次下拉按新 tab 的条目/选中项重建
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
