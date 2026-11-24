/* ============================================================
 * 留言板 · 全部留言（P-ALL）
 * 导航岛 tag 的岛内视图（index.html#allView），与「我的留言」同形制：
 * 复用 GET /api/messages，零新接口、零新表；列表卡片延续 mymsg-item 样式。
 * 仅展示当前账号有权看到的留言（公开帖；作者可见自己的仅自己可见帖），
 * 按发布时间倒序，支持按标题 / 内容 / 作者 / 话题搜索，前端分页。
 * 不展示排名、不提供排序规则选择 —— 排名只属于双榜。
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
    '  <div class="mine-list" id="allList"></div>',
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

  function init() {
    if (embedded) return;              // 岛内模式：由 show() 惰性触发
    buildDom();
    start();
  }

  function start() {
    if (started) return;
    started = true;
    api.getSession().then(function (resp) {
      var session = resp.data || { loggedIn: false };
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
      var all = resp.data.list.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
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
      slice.forEach(function (m) { listEl.appendChild(renderItem(m)); });
      renderPager(totalPages);
      HMB.i18n.apply(listEl);
    });
  }

  /* 卡片形制延续「我的留言」(profile.js 的 mymsg-item)：左侧一行内容，右侧一行统计。 */
  function renderItem(m) {
    var item = el("div", "mymsg-item");
    item.dataset.id = m.resourceId;

    var content = el("div", "mymsg-content");
    content.textContent = (m.title ? m.title + "： " : "") +
      U.richTextToPlain(m.content) +
      (m.topicTag ? "  #" + m.topicTag : "");
    content.tabIndex = 0;
    content.setAttribute("role", "link");
    content.addEventListener("click", function () {
      window.location.href = "detail.html?id=" + encodeURIComponent(m.resourceId);
    });
    item.appendChild(content);

    item.appendChild(el("div", "mymsg-stats",
      t("common.statViews") + " " + U.fmtViews(m.stats.views) + "  " +
      t("common.likes") + " " + U.fmtViews(m.stats.likes)));

    return item;
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
