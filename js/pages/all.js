/* ============================================================
 * 留言板 · 全部留言（P-ALL）
 * 导航岛 tag 的岛内视图（index.html#allView），卡片形制与首页「我的留言」一致：
 * 复用 GET /api/messages，零新接口、零新表；列表卡片复用 C.renderCard 丰富榜卡
 * （头像 / NO. / 昵称 / 日期 / 话题 / 本周热度 / 折线 / 历史最高 / 点赞）。
 * 仅展示当前账号有权看到的留言（公开帖；作者可见自己的仅自己可见帖），
 * 按发布时间倒序，支持按标题 / 内容 / 作者 / 话题搜索，前端分页。
 * 不显示排名数字（rank=null）、不提供排序规则选择 —— 排名只属于双榜。
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

  /* 双模式：standalone（all.html 兼容）/ embedded（index.html#allView 岛内 tag）。
     岛内 DOM 由模板惰性构建，对外暴露 HMB.pages.all.show()/hide()。 */
  var view = document.getElementById("allView");
  var embedded = !!view;
  var built = false;
  var started = false;

  var ALL_TEMPLATE = [
    '<main class="all-page container">',
    '  <section class="all-head">',
    '    <h1 class="all-head-title" data-text="all.title">全部留言</h1>',
    '    <p class="all-head-sub" data-text="all.subtitle">看看大家写下的每一条</p>',
    '  </section>',
    '  <section class="toolbar" aria-label="搜索">',
    '    <div class="search-box">',
    '      <span class="search-icon" id="allSearchIcon"></span>',
    '      <input type="search" class="search-input" id="allSearchInput"',
    '             data-text-placeholder="all.searchPlaceholder"',
    '             placeholder="搜索留言内容 / 作者 / 话题" aria-label="搜索留言">',
    '    </div>',
    '  </section>',
    '  <div class="list-caption" id="allCaption" aria-live="polite"></div>',
    '  <section class="board-list stagger" id="allList" aria-label="全部留言列表"></section>',
    '  <div class="all-pager" id="allPager"></div>',
    '</main>'
  ].join("\n");

  function buildDom() {
    if (built) return;
    built = true;
    if (!embedded) return;
    view.innerHTML = ALL_TEMPLATE;
    HMB.i18n.apply(view);
  }

  var PAGE_SIZE = 10;
  var state = { q: "", page: 1, list: [] };
  var session = { loggedIn: false };
  var likedSet = {};
  var likeIntent = {};

  /* 打开详情 / F8 幂等点赞（与首页 board.js 同口径，350ms 内双击复用同一幂等键） */
  function openDetail(msg) {
    window.location.href = "detail.html?id=" + encodeURIComponent(msg.resourceId);
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

  function init() {
    if (embedded) return;              // 岛内模式：由 show() 惰性触发
    buildDom();
    start();
  }

  function start() {
    if (started) return;
    started = true;
    api.getSession().then(function (resp) {
      session = resp.data || { loggedIn: false };
      if (!embedded) C.renderTopbar($("topbar"), "all", session);
      U.renderDebugPanel();

      var icon = $("allSearchIcon");
      if (icon) icon.appendChild(U.icon("search"));
      $("allSearchInput").addEventListener("input", U.debounce(function () {
        state.q = $("allSearchInput").value.trim();
        state.page = 1;
        load();
      }, 220));

      load();
    });
  }

  function load() {
    var listEl = $("allList");
    listEl.textContent = "";
    $("allPager").textContent = "";
    $("allCaption").textContent = t("common.loading");

    api.getMessages({ tab: "all", sort: "latest", q: state.q }).then(function (resp) {
      if (!resp.success) {
        $("allCaption").textContent = "";
        C.renderStateBox(listEl, {
          emoji: "⚠️",
          titleKey: "board.stateErrorTitle",
          descKey: "board.stateErrorDesc",
          btnKey: "common.retry",
          onBtn: load
        });
        return;
      }
      // 前端装配热度字段（heat/rate/rateHistory），排序规则固定为最新 —— 排名只属双榜。
      var all = U.rankBoard(resp.data.list.slice(), { sort: "latest" });
      likedSet = {};
      (resp.data.likedIds || []).forEach(function (id) { likedSet[id] = true; });
      state.list = all;
      $("allCaption").textContent = t("all.resultCount", { n: all.length });

      if (!all.length) {
        C.renderStateBox(listEl, {
          emoji: state.q ? "🔎" : "✏️",
          titleKey: state.q ? "all.searchEmptyTitle" : "all.emptyTitle",
          descKey: state.q ? "all.searchEmptyDesc" : "all.emptyDesc",
          btnKey: "common.backHome",
          onBtn: function () { window.location.href = "index.html"; }
        });
        return;
      }

      var totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
      if (state.page > totalPages) state.page = totalPages;
      var slice = all.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      slice.forEach(function (m, i) {
        var card = C.renderCard(m, {
          rank: null,                 // 全部留言不显示排名（排名只属双榜）
          peakMode: "dual",           // 与首页「我的留言」一致：周榜/新帖两榜历史最高
          q: state.q,
          session: session,
          likedSet: likedSet,
          onLike: handleLike,
          onOpen: openDetail
        });
        card.style.setProperty("--i", String(i));
        card.classList.add("is-entered");
        listEl.appendChild(card);
      });
      renderPager(totalPages);
      HMB.i18n.apply(listEl);
    });
  }

  function renderPager(totalPages) {
    var pager = $("allPager");
    if (totalPages <= 1) return;
    var prev = el("button", "btn btn--soft btn--sm", t("gm.prev"));
    prev.type = "button";
    prev.disabled = state.page <= 1;
    prev.addEventListener("click", function () { state.page--; load(); });
    var label = el("span", "all-pager-label", t("gm.page", { p: state.page, t: totalPages }));
    var next = el("button", "btn btn--soft btn--sm", t("gm.next"));
    next.type = "button";
    next.disabled = state.page >= totalPages;
    next.addEventListener("click", function () { state.page++; load(); });
    pager.appendChild(prev);
    pager.appendChild(label);
    pager.appendChild(next);
  }

  HMB.pages = HMB.pages || {};
  HMB.pages.all = {
    show: function () {
      buildDom();
      view.hidden = false;
      start();
    },
    hide: function () { view.hidden = true; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
