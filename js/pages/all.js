/* ============================================================
 * 留言板 · 全部留言（P-ALL）
 * 与「我的留言」同形制的列表页：复用 GET /api/messages，零新接口、零新表。
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

  var PAGE_SIZE = 10;
  var state = { q: "", page: 1, list: [] };

  function init() {
    api.getSession().then(function (resp) {
      var session = resp.data || { loggedIn: false };
      // 该页归属榜单浏览域：导航岛高亮「热度周榜」
      C.renderTopbar($("topbar"), "hot", session);
      U.renderDebugPanel();

      $("allSearchIcon").appendChild(U.icon("search"));
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

  function renderItem(m) {
    var item = el("div", "all-item");

    var main = el("div", "all-item-main");
    main.tabIndex = 0;
    main.setAttribute("role", "link");
    main.addEventListener("click", function () {
      window.location.href = "detail.html?id=" + encodeURIComponent(m.resourceId);
    });

    var title = el("h2", "all-item-title", m.title || U.richTextToPlain(m.content).slice(0, 30));
    var excerpt = el("p", "all-item-excerpt", U.richTextToPlain(m.content));
    var meta = el("div", "all-item-meta");
    meta.appendChild(el("span", "all-item-author", "@" + (m.nicknameSnapshot || "匿名同学")));
    if (m.topicTag) meta.appendChild(el("span", "all-item-tag", "#" + m.topicTag));
    meta.appendChild(el("span", "all-item-time", U.timeAgo(m.createdAt)));
    if (m.hidden) meta.appendChild(el("span", "all-item-hidden", t("all.hiddenTip")));
    main.appendChild(title);
    main.appendChild(excerpt);
    main.appendChild(meta);

    var stats = el("div", "all-item-stats");
    stats.appendChild(stat("eye", t("common.statViews") + " " + U.fmtViews(m.stats.views)));
    stats.appendChild(stat("comment", t("common.statComments") + " " + U.fmtViews(m.stats.comments)));
    stats.appendChild(stat("heart", t("common.likes") + " " + U.fmtViews(m.stats.likes)));

    item.appendChild(main);
    item.appendChild(stats);
    return item;
  }

  function stat(iconName, label) {
    var wrap = el("span", "all-item-stat");
    wrap.appendChild(U.icon(iconName));
    wrap.appendChild(el("span", null, label));
    return wrap;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
