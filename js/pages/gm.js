/* ============================================================
 * 留言板 · 管理员 GM 页（P-GM）
 * 五个面板：概览 / 用户 / 内容 / 审计 / 设置。
 * 所有数据来自 HMB.api 的 GM 接口（G1–G17）；本页不直接读写数据库。
 * 前端隐藏入口不算鉴权：进入页面先校验 session.isAdmin，接口侧独立校验角色。
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

  /* 双模式：standalone（gm.html 独立页，保留兼容）/ embedded（index.html#gmView 岛内 tag）。
     岛内模式下 DOM 由模板惰性构建，对外暴露 HMB.pages.gm.show()/hide() 供 board.js 软切换。 */
  var view = document.getElementById("gmView");
  var embedded = !!view;
  var built = false;
  var started = false;

  var session = { loggedIn: false, csrf: "" };
  var current = "overview";
  var page = { users: 1, content: 1, actions: 1 };
  var PAGE_SIZE = 20;

  /* 岛内模式的 GM 结构模板（静态可信结构，无用户输入；文案由 data-text 交 i18n 注入）。
     与 pages/gm.html 的 <main> 保持一致，去掉"回首页"按钮（岛内返回由导航岛承接）。 */
  var GM_TEMPLATE = [
    '<main class="gm-page container">',
    '  <section class="gm-head">',
    '    <div class="gm-head-copy">',
    '      <div class="gm-head-titlerow">',
    '        <h1 class="gm-head-title" data-text="gm.title">留言板管理</h1>',
    '        <span class="gm-head-chip" aria-hidden="true">GM</span>',
    '      </div>',
    '      <p class="gm-head-sub" data-text="gm.subtitle">账号、内容与运行数据，统一在这里管理</p>',
    '    </div>',
    '  </section>',
    '  <div class="gm-shell">',
    '    <nav class="gm-side" id="gmSide" aria-label="管理功能">',
    '      <div class="gm-side-title" data-text="gm.sideTitle">控制面板</div>',
    '      <button type="button" class="gm-side-btn is-active" data-panel="overview" data-text="gm.tabOverview">概览</button>',
    '      <button type="button" class="gm-side-btn" data-panel="users" data-text="gm.tabUsers">用户管理</button>',
    '      <button type="button" class="gm-side-btn" data-panel="content" data-text="gm.tabContent">内容管理</button>',
    '      <button type="button" class="gm-side-btn" data-panel="actions" data-text="gm.tabActions">操作审计</button>',
    '      <button type="button" class="gm-side-btn" data-panel="settings" data-text="gm.tabSettings">设置</button>',
    '    </nav>',
    '    <section class="gm-main" id="gmMain">',
    '      <div class="gm-panel is-active" id="panel-overview">',
    '        <h2 class="gm-section-title" data-text="gm.tabOverview">概览</h2>',
    '        <div class="gm-stat-grid" id="gmStats"></div>',
    '      </div>',
    '      <div class="gm-panel" id="panel-users">',
    '        <h2 class="gm-section-title" data-text="gm.tabUsers">用户管理</h2>',
    '        <div class="gm-toolbar">',
    '          <div class="search-box">',
    '            <span class="search-icon" id="gmUserSearchIcon"></span>',
    '            <input type="search" class="search-input" id="gmUserSearch" data-text-placeholder="gm.user.searchPlaceholder" placeholder="搜索昵称 / 账号 / 展示 ID" aria-label="搜索用户">',
    '          </div>',
    '          <select class="gm-select" id="gmUserStatus" aria-label="账号状态">',
    '            <option value="all" data-text="gm.user.statusAll">全部状态</option>',
    '            <option value="active" data-text="gm.user.statusActive">正常</option>',
    '            <option value="banned" data-text="gm.user.statusBanned">已封禁</option>',
    '          </select>',
    '          <select class="gm-select" id="gmUserRole" aria-label="账号角色">',
    '            <option value="all" data-text="gm.user.roleAll">全部角色</option>',
    '            <option value="user" data-text="gm.user.roleUser">普通用户</option>',
    '            <option value="admin" data-text="gm.user.roleAdmin">管理员</option>',
    '          </select>',
    '          <button type="button" class="btn btn--soft btn--sm" id="gmUserReload" data-text="common.retry">重试</button>',
    '          <span class="gm-result-count" id="gmUserCount"></span>',
    '        </div>',
    '        <div class="gm-table-wrap" id="gmUserTable"></div>',
    '        <div class="gm-pager" id="gmUserPager"></div>',
    '      </div>',
    '      <div class="gm-panel" id="panel-content">',
    '        <h2 class="gm-section-title" data-text="gm.tabContent">内容管理</h2>',
    '        <div class="gm-toolbar">',
    '          <div class="search-box">',
    '            <span class="search-icon" id="gmContentSearchIcon"></span>',
    '            <input type="search" class="search-input" id="gmContentSearch" data-text-placeholder="gm.content.searchPlaceholder" placeholder="搜索标题 / 正文 / 作者" aria-label="搜索内容">',
    '          </div>',
    '          <select class="gm-select" id="gmContentType" aria-label="内容类型">',
    '            <option value="all" data-text="gm.content.typeAll">全部内容</option>',
    '            <option value="message" data-text="gm.content.typeMessage">留言</option>',
    '            <option value="comment" data-text="gm.content.typeComment">评论</option>',
    '          </select>',
    '          <select class="gm-select" id="gmContentHidden" aria-label="隐藏状态">',
    '            <option value="all" data-text="gm.content.hiddenAll">全部状态</option>',
    '            <option value="0" data-text="gm.content.hiddenNo">正常</option>',
    '            <option value="1" data-text="gm.content.hiddenYes">已隐藏</option>',
    '          </select>',
    '          <button type="button" class="btn btn--soft btn--sm" id="gmContentReload" data-text="common.retry">重试</button>',
    '          <span class="gm-result-count" id="gmContentCount"></span>',
    '        </div>',
    '        <div class="gm-table-wrap" id="gmContentTable"></div>',
    '        <div class="gm-pager" id="gmContentPager"></div>',
    '      </div>',
    '      <div class="gm-panel" id="panel-actions">',
    '        <h2 class="gm-section-title" data-text="gm.tabActions">操作审计</h2>',
    '        <div class="gm-toolbar gm-toolbar--simple">',
    '          <p class="gm-note" data-text="gm.actions.note">所有管理操作都会留痕，记录不可修改或删除。</p>',
    '          <span class="gm-result-count" id="gmActionCount"></span>',
    '        </div>',
    '        <div class="gm-table-wrap" id="gmActionTable"></div>',
    '        <div class="gm-pager" id="gmActionPager"></div>',
    '      </div>',
    '      <div class="gm-panel" id="panel-settings">',
    '        <h2 class="gm-section-title" data-text="gm.tabSettings">设置</h2>',
    '        <div class="gm-settings-grid">',
    '          <section class="gm-card">',
    '            <h3 class="gm-card-title" data-text="gm.settings.sensitiveTitle">敏感词配置</h3>',
    '            <p class="gm-card-desc" data-text="gm.settings.sensitiveDesc">每行一个词，命中后留言与评论将无法发布；修改后立即生效</p>',
    '            <textarea class="gm-textarea" id="gmWords" rows="7" data-text-placeholder="gm.settings.wordsPlaceholder" placeholder="每行一个敏感词"></textarea>',
    '            <h3 class="gm-card-title gm-card-title--gap" data-text="gm.settings.periodTitle">当前期次</h3>',
    '            <p class="gm-card-desc" data-text="gm.settings.periodDesc">新发布的留言会归入该期次；期次只能前进，不能回退</p>',
    '            <input type="number" class="gm-input" id="gmPeriod" min="1" step="1" aria-label="当前期次">',
    '            <div class="gm-card-actions">',
    '              <button type="button" class="btn btn--primary btn--sm" id="gmSettingsSave" data-text="gm.settings.save">保存设置</button>',
    '            </div>',
    '          </section>',
    '          <section class="gm-card gm-card--danger">',
    '            <h3 class="gm-card-title" data-text="gm.settings.resetTitle">重置演示数据</h3>',
    '            <p class="gm-card-desc" data-text="gm.settings.resetDesc">清空当前演示数据并按初始种子重建（含管理员账号），操作不可恢复</p>',
    '            <button type="button" class="btn btn--danger btn--sm" id="gmDataReset" data-text="gm.settings.resetBtn">重置数据</button>',
    '          </section>',
    '        </div>',
    '      </div>',
    '    </section>',
    '  </div>',
    '</main>',
    '<div id="gmModalRoot"></div>'
  ].join("\n");

  function buildDom() {
    if (built) return;
    built = true;
    if (!embedded) return;             // standalone：DOM 来自 gm.html 静态结构
    view.innerHTML = GM_TEMPLATE;
    HMB.i18n.apply(view);
  }

  function showNoPermission() {
    document.querySelectorAll(".gm-shell").forEach(function (n) { n.style.display = "none"; });
    C.renderStateBox($("gmMain"), {
      emoji: "🔒",
      titleKey: "gm.noPermissionTitle",
      descKey: "gm.noPermissionDesc",
      btnKey: "common.backHome",
      onBtn: function () { window.location.href = "index.html"; }
    });
  }

  /* 启动（含会话校验与事件绑定）只做一次，岛内反复 show() 不重复绑定。 */
  function start() {
    if (started) return;
    started = true;
    api.getSession().then(function (resp) {
      session = resp.data || { loggedIn: false };
      if (!embedded) C.renderTopbar($("topbar"), "gm", session);
      U.renderDebugPanel();

      if (!session.loggedIn || !session.isAdmin) {
        showNoPermission();
        return;
      }

      var us = $("gmUserSearchIcon"), cs = $("gmContentSearchIcon");
      if (us) us.appendChild(U.icon("search"));
      if (cs) cs.appendChild(U.icon("search"));
      bindNav();
      bindFilters();
      var hash = (window.location.hash || "").replace("#", "");
      switchPanel(["overview", "users", "content", "actions", "settings"].indexOf(hash) >= 0 ? hash : "overview");
    });
  }

  function init() {
    if (embedded) return;              // 岛内模式：由 show() 惰性触发 buildDom + start
    buildDom();
    start();
  }

  function bindNav() {
    document.querySelectorAll(".gm-side-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchPanel(btn.dataset.panel); });
    });
  }

  function bindFilters() {
    $("gmUserSearch").addEventListener("input", U.debounce(function () {
      page.users = 1; loadUsers();
    }, 220));
    ["gmUserStatus", "gmUserRole"].forEach(function (id) {
      $(id).addEventListener("change", function () { page.users = 1; loadUsers(); });
    });
    $("gmUserReload").addEventListener("click", loadUsers);

    $("gmContentSearch").addEventListener("input", U.debounce(function () {
      page.content = 1; loadContent();
    }, 220));
    ["gmContentType", "gmContentHidden"].forEach(function (id) {
      $(id).addEventListener("change", function () { page.content = 1; loadContent(); });
    });
    $("gmContentReload").addEventListener("click", loadContent);

    $("gmSettingsSave").addEventListener("click", saveSettings);
    $("gmDataReset").addEventListener("click", confirmResetData);
  }

  function switchPanel(name) {
    current = name;
    document.querySelectorAll(".gm-side-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.panel === name);
    });
    document.querySelectorAll(".gm-panel").forEach(function (p) {
      p.classList.toggle("is-active", p.id === "panel-" + name);
    });
    if (history.replaceState) history.replaceState(null, "", "#" + name);
    loadPanel();
  }

  function loadPanel() {
    if (current === "overview") loadOverview();
    else if (current === "users") loadUsers();
    else if (current === "content") loadContent();
    else if (current === "actions") loadActions();
    else loadSettings();
  }

  function reload() { loadPanel(); if (current !== "overview") loadOverview(); }

  /* ---------------- 概览 ---------------- */

  function loadOverview() {
    api.gmSummary().then(function (resp) {
      if (!resp.success) { toastFail(resp); return; }
      var d = resp.data;
      var grid = $("gmStats");
      grid.textContent = "";
      statCard(grid, "gm.overview.users", d.users.total, "primary");
      statCard(grid, "gm.overview.active", d.users.active);
      statCard(grid, "gm.overview.banned", d.users.banned, "danger");
      statCard(grid, "gm.overview.admins", d.users.admins);
      statCard(grid, "gm.overview.muted", d.users.muted, "warn");
      statCard(grid, "gm.overview.messages", d.contents.messages);
      statCard(grid, "gm.overview.comments", d.contents.comments);
      statCard(grid, "gm.overview.hidden", d.contents.hiddenMessages + d.contents.hiddenComments, "warn");
      statCard(grid, "gm.overview.todayUsers", d.today.newUsers);
      statCard(grid, "gm.overview.todayMessages", d.today.newMessages);
      statCard(grid, "gm.overview.todayComments", d.today.newComments);
      statCard(grid, "gm.overview.actions", d.actions.total);
    });
  }

  function statCard(grid, labelKey, num, tone) {
    var card = el("div", "gm-stat-card" + (tone ? " gm-stat-card--" + tone : ""));
    card.appendChild(el("div", "gm-stat-num", String(num)));
    var label = el("div", "gm-stat-label");
    label.setAttribute("data-text", labelKey);
    card.appendChild(label);
    grid.appendChild(card);
    HMB.i18n.apply(card);
  }

  /* ---------------- 用户管理 ---------------- */

  function loadUsers() {
    var wrap = $("gmUserTable");
    wrap.textContent = "";
    $("gmUserPager").textContent = "";
    api.gmUsers({
      q: $("gmUserSearch").value.trim(),
      status: $("gmUserStatus").value,
      role: $("gmUserRole").value,
      page: page.users, pageSize: PAGE_SIZE
    }).then(function (resp) {
      if (!resp.success) { renderTableError(wrap, loadUsers, resp); return; }
      var d = resp.data;
      var headers = ["gm.user.colUser", "gm.user.colRole", "gm.user.colStatus", "gm.content.colStats", "gm.user.colActions"];
      var rows = d.list.map(function (u) {
        var userCell = el("div", "gm-user-cell");
        userCell.appendChild(U.avatar(u.avatarEnum));
        var info = el("div", "gm-user-info");
        info.appendChild(el("div", "gm-user-name", u.nickname));
        info.appendChild(el("div", "gm-user-sub", "@" + u.displayId + " · " + u.account));
        userCell.appendChild(info);

        var roleCell = el("div", "gm-cell");
        roleCell.appendChild(badge(u.role === "admin" ? "gm.user.roleAdmin" : "gm.user.roleUser",
          u.role === "admin" ? "admin" : ""));

        var statusCell = el("div", "gm-cell");
        statusCell.appendChild(badge(u.status === "banned" ? "gm.user.statusBanned" : "gm.user.statusActive",
          u.status === "banned" ? "danger" : "ok"));
        if (u.muteUntil && u.muteUntil > Date.now()) {
          statusCell.appendChild(el("div", "gm-cell-sub",
            t("gm.user.mutedUntil", { date: u.muteUntil > 253402300800000 - 1000 ? t("gm.user.permanent") : U.fmtDate(u.muteUntil) })));
        }

        var statsCell = el("div", "gm-cell-sub",
          t("gm.overview.messages") + " " + u.messageCount + " · " + t("gm.overview.comments") + " " + u.commentCount);

        var actions = el("div", "gm-actions-cell");
        if (u.protected || u.id === session.userId) {
          actions.appendChild(el("span", "gm-cell-sub", u.protected ? t("gm.user.protected") : t("gm.user.selfNote")));
          if (!u.protected) actions.appendChild(btn("gm.user.editProfile", "btn--soft btn--sm", function () { openProfile(u); }));
        } else {
          actions.appendChild(btn(u.status === "banned" ? "gm.user.unban" : "gm.user.ban",
            u.status === "banned" ? "btn--soft btn--sm" : "btn--danger btn--sm",
            function () { u.status === "banned" ? openUnban(u) : openBan(u); }));
          if (u.muteUntil && u.muteUntil > Date.now()) {
            actions.appendChild(btn("gm.user.unmute", "btn--soft btn--sm", function () { openUnmute(u); }));
          } else {
            actions.appendChild(btn("gm.user.mute", "btn--soft btn--sm", function () { openMute(u); }));
          }
          actions.appendChild(moreMenu([
            { key: u.role === "admin" ? "gm.user.demote" : "gm.user.promote", onClick: function () { openRole(u); } },
            { key: "gm.user.editProfile", onClick: function () { openProfile(u); } },
            { key: "gm.user.resetPassword", onClick: function () { openResetPwd(u); } }
          ]));
        }
        return [userCell, roleCell, statusCell, statsCell, actions];
      });
      renderTable(wrap, headers, rows);
      renderPager($("gmUserPager"), "users", d, loadUsers);
      setResultCount("gmUserCount", d.total);
    });
  }

  function openBan(u) {
    var reason = el("input", "gm-input");
    reason.placeholder = t("gm.user.reasonPlaceholder");
    openModal({
      title: t("gm.user.ban") + " · " + u.nickname,
      desc: t("gm.user.confirmBan"),
      content: field(t("gm.user.reasonLabel"), reason),
      okText: t("gm.user.ban"), danger: true,
      onOk: function () { return api.gmSetUserStatus(u.id, { status: "banned", reason: reason.value.trim(), csrf: session.csrf }); }
    });
  }

  function openUnban(u) {
    openModal({
      title: t("gm.user.unban") + " · " + u.nickname,
      desc: t("gm.user.confirmUnban"),
      okText: t("gm.user.unban"),
      onOk: function () { return api.gmSetUserStatus(u.id, { status: "active", csrf: session.csrf }); }
    });
  }

  function openMute(u) {
    var select = el("select", "gm-select");
    [["3600", "gm.user.mute1h"], ["86400", "gm.user.mute1d"],
     ["604800", "gm.user.mute7d"], ["-1", "gm.user.muteForever"]].forEach(function (pair) {
      var opt = el("option", null, t(pair[1]));
      opt.value = pair[0];
      select.appendChild(opt);
    });
    var reason = el("input", "gm-input");
    reason.placeholder = t("gm.user.reasonPlaceholder");
    var body = el("div", "gm-modal-fields");
    body.appendChild(field(t("gm.user.mute"), select));
    body.appendChild(field(t("gm.user.reasonLabel"), reason));
    openModal({
      title: t("gm.user.mute") + " · " + u.nickname,
      content: body, okText: t("gm.user.mute"), danger: true,
      onOk: function () {
        return api.gmSetUserMute(u.id, {
          durationSec: Number(select.value), reason: reason.value.trim(), csrf: session.csrf
        });
      }
    });
  }

  function openUnmute(u) {
    openModal({
      title: t("gm.user.unmute") + " · " + u.nickname,
      okText: t("gm.user.unmute"),
      onOk: function () { return api.gmSetUserMute(u.id, { durationSec: 0, csrf: session.csrf }); }
    });
  }

  function openRole(u) {
    openModal({
      title: t("gm.user.role") + " · " + u.nickname,
      desc: t("gm.user.confirmDeleteRole"),
      okText: u.role === "admin" ? t("gm.user.demote") : t("gm.user.promote"),
      onOk: function () {
        return api.gmSetUserRole(u.id, { role: u.role === "admin" ? "user" : "admin", csrf: session.csrf });
      }
    });
  }

  function openProfile(u) {
    var nick = el("input", "gm-input"); nick.value = u.nickname || ""; nick.maxLength = 20;
    var bio = el("input", "gm-input"); bio.value = u.bio || ""; bio.maxLength = 60;
    var real = el("input", "gm-input"); real.value = u.realName || ""; real.maxLength = 20;
    var mail = el("input", "gm-input"); mail.value = u.email || ""; mail.maxLength = 60;
    var av = el("select", "gm-select");
    HMB.SEED.AVATARS.forEach(function (emoji, i) {
      var opt = el("option", null, emoji + " " + (i + 1));
      opt.value = String(i + 1);
      if (u.avatarEnum === i + 1) opt.selected = true;
      av.appendChild(opt);
    });
    var body = el("div", "gm-modal-fields");
    body.appendChild(field(t("profile.nicknameLabel"), nick));
    body.appendChild(field(t("profile.bioLabel"), bio));
    body.appendChild(field(t("profile.realNameLabel"), real));
    body.appendChild(field(t("profile.emailLabel"), mail));
    body.appendChild(field(t("profile.avatarTip"), av));
    openModal({
      title: t("gm.user.profileTitle") + " · " + u.nickname,
      content: body, okText: t("common.ok"),
      onOk: function () {
        return api.gmUpdateUserProfile(u.id, {
          nickname: nick.value.trim(), bio: bio.value.trim(),
          realName: real.value.trim(), email: mail.value.trim(),
          avatarEnum: Number(av.value), csrf: session.csrf
        });
      }
    });
  }

  function openResetPwd(u) {
    var pwd = el("input", "gm-input");
    pwd.type = "password"; pwd.placeholder = t("gm.user.newPwdPlaceholder");
    var body = el("div", "gm-modal-fields");
    body.appendChild(field(t("gm.user.resetPwdTitle"), pwd));
    body.appendChild(el("p", "gm-note", t("gm.user.mustChange")));
    openModal({
      title: t("gm.user.resetPwdTitle") + " · " + u.nickname,
      desc: t("gm.user.confirmResetPwd"),
      content: body, okText: t("gm.user.resetPassword"), danger: true,
      onOk: function () {
        return api.gmResetPassword(u.id, { newPassword: pwd.value, csrf: session.csrf });
      }
    });
  }

  /* ---------------- 内容管理 ---------------- */

  function loadContent() {
    var wrap = $("gmContentTable");
    wrap.textContent = "";
    $("gmContentPager").textContent = "";
    api.gmContents({
      q: $("gmContentSearch").value.trim(),
      type: $("gmContentType").value,
      hidden: $("gmContentHidden").value,
      page: page.content, pageSize: PAGE_SIZE
    }).then(function (resp) {
      if (!resp.success) { renderTableError(wrap, loadContent, resp); return; }
      var d = resp.data;
      var headers = [
        "gm.content.colType", "gm.content.colContent", "gm.content.colStatus",
        "gm.content.colStats", "gm.user.colActions"
      ];
      var rows = d.list.map(function (x) {
        var typeCell = el("div", "gm-cell");
        typeCell.appendChild(badge(x.type === "message" ? "gm.content.typeMessage" : "gm.content.typeComment",
          x.type === "message" ? "admin" : ""));

        var contentCell = el("div", "gm-content-cell");
        contentCell.appendChild(el("div", "gm-content-title", x.title || "（无标题）"));
        contentCell.appendChild(el("div", "gm-cell-sub", String(x.content || "").slice(0, 90)));
        contentCell.appendChild(el("div", "gm-cell-sub", "@" + (x.authorNickname || "—") + " · " + U.fmtDate(x.createdAt)));

        var statusCell = el("div", "gm-cell");
        statusCell.appendChild(badge(x.hidden ? "gm.content.hiddenYes" : "gm.content.hiddenNo", x.hidden ? "warn" : "ok"));
        if (x.hidden && x.hiddenReason) statusCell.appendChild(el("div", "gm-cell-sub", x.hiddenReason));

        var statsCell = el("div", "gm-cell-sub",
          (x.stats.views !== undefined ? t("common.statViews") + " " + U.fmtViews(x.stats.views) + " · " : "") +
          t("common.likes") + " " + U.fmtViews(x.stats.likes || 0));

        var actions = el("div", "gm-actions-cell");
        actions.appendChild(btn(x.hidden ? "gm.content.show" : "gm.content.hide",
          "btn--soft btn--sm", function () {
            openModal({
              title: t(x.hidden ? "gm.content.show" : "gm.content.hide"),
              desc: t("gm.content.confirmHide"),
              okText: t(x.hidden ? "gm.content.show" : "gm.content.hide"),
              onOk: function () {
                var args = { hidden: !x.hidden, reason: "", csrf: session.csrf };
                return x.type === "message"
                  ? api.gmSetMessageHidden(x.resourceId, args)
                  : api.gmSetCommentHidden(x.resourceId, args);
              }
            });
          }));
        actions.appendChild(btn("gm.content.delete", "btn--danger btn--sm", function () {
          openModal({
            title: t("gm.content.delete"),
            desc: t("gm.content.confirmDelete"),
            okText: t("gm.content.delete"), danger: true,
            onOk: function () {
              return x.type === "message"
                ? api.gmDeleteMessage(x.resourceId, { csrf: session.csrf })
                : api.gmDeleteComment(x.resourceId, { csrf: session.csrf });
            }
          });
        }));
        return [typeCell, contentCell, statusCell, statsCell, actions];
      });
      renderTable(wrap, headers, rows);
      renderPager($("gmContentPager"), "content", d, loadContent);
      setResultCount("gmContentCount", d.total);
    });
  }

  /* ---------------- 操作审计 ---------------- */

  function loadActions() {
    var wrap = $("gmActionTable");
    wrap.textContent = "";
    $("gmActionPager").textContent = "";
    api.gmActions({ page: page.actions, pageSize: PAGE_SIZE }).then(function (resp) {
      if (!resp.success) { renderTableError(wrap, loadActions, resp); return; }
      var d = resp.data;
      var headers = ["gm.actions.colTime", "gm.actions.colActor", "gm.actions.colAction", "gm.actions.colTarget", "gm.actions.colDetail"];
      var rows = d.list.map(function (a) {
        return [
          el("div", "gm-cell-sub", new Date(a.createdAt).toLocaleString("zh-CN")),
          el("div", "gm-cell", a.actorNickname || ("ID " + a.actorId)),
          el("div", "gm-cell", actionLabel(a.action)),
          el("div", "gm-cell-sub", a.targetType + " · " + String(a.targetId || "").slice(0, 12)),
          el("div", "gm-cell-sub", String(a.detail || "").slice(0, 80))
        ];
      });
      renderTable(wrap, headers, rows, "gm.actions.empty");
      renderPager($("gmActionPager"), "actions", d, loadActions);
      setResultCount("gmActionCount", d.total);
    });
  }

  function actionLabel(action) {
    var key = "gm.action." + action;
    var v = t(key);
    return v === key ? action : v;
  }

  /* ---------------- 设置 ---------------- */

  function loadSettings() {
    api.gmSummary().then(function (resp) {
      if (!resp.success) { toastFail(resp); return; }
      var s = resp.data.settings || {};
      $("gmWords").value = (s.sensitiveWords || []).join("\n");
      $("gmPeriod").value = s.currentPeriod;
    });
  }

  function saveSettings() {
    var words = $("gmWords").value.split("\n");
    var period = Number($("gmPeriod").value);
    api.gmSetSensitiveWords({ words: words, csrf: session.csrf }).then(function (r1) {
      if (!r1.success) { toastFail(r1); return; }
      return api.gmSetCurrentPeriod({ period: period, csrf: session.csrf }).then(function (r2) {
        if (!r2.success) { toastFail(r2); return; }
        U.toast(t("gm.settings.saved"), "success");
        loadOverview();
      });
    });
  }

  function confirmResetData() {
    openModal({
      title: t("gm.settings.resetTitle"),
      desc: t("gm.settings.resetConfirm"),
      okText: t("gm.settings.resetBtn"), danger: true,
      onOk: function () {
        return api.gmResetData({ confirm: "RESET", csrf: session.csrf }).then(function (resp) {
          if (resp.success) {
            U.toast(t("gm.settings.resetDone"), "success");
            setTimeout(function () { window.location.href = "index.html"; }, 800);
          }
          return resp;
        });
      }
    });
  }

  /* ---------------- 通用 UI 工具 ---------------- */

  function btn(labelKey, cls, onClick) {
    var b = el("button", "btn " + cls, t(labelKey));
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  /** 行内「更多」菜单：把低频操作收进弹出层，表格只留封禁/禁言两个高频动作 */
  function moreMenu(items) {
    var wrap = el("div", "gm-more");
    var toggle = el("button", "btn btn--soft btn--sm gm-more-btn", t("gm.common.more"));
    toggle.type = "button";
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    var menu = el("div", "gm-more-menu");
    function close() {
      wrap.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", outside);
    }
    function outside(e) { if (!wrap.contains(e.target)) close(); }
    items.forEach(function (it) {
      var item = el("button", "gm-more-item", t(it.key));
      item.type = "button";
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        close();
        it.onClick();
      });
      menu.appendChild(item);
    });
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (wrap.classList.contains("is-open")) { close(); return; }
      document.querySelectorAll(".gm-more.is-open").forEach(function (m) { m.classList.remove("is-open"); });
      wrap.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("click", outside);
    });
    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    return wrap;
  }

  function setResultCount(id, total) {
    var node = $(id);
    if (node) node.textContent = t("gm.resultCount", { n: total || 0 });
  }

  function badge(labelKey, tone) {
    // 直接写文本：i18n.apply 只注入 root 的后代，不含 root 自身
    return el("span", "gm-badge" + (tone ? " gm-badge--" + tone : ""), t(labelKey));
  }

  function renderTable(wrap, headers, rows, emptyKey) {
    var table = el("table", "gm-table");
    var thead = el("thead");
    var hr = el("tr");
    headers.forEach(function (h) {
      var th = el("th", null, t(h));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    var tbody = el("tbody");
    if (!rows.length) {
      var tr = el("tr");
      var td = el("td", "gm-table-empty", t(emptyKey || "gm.empty"));
      td.colSpan = headers.length;
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach(function (cells) {
        var tr = el("tr");
        cells.forEach(function (c) {
          var td = el("td");
          if (c !== null && c !== undefined) td.appendChild(c);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderTableError(wrap, retry, resp) {
    C.renderStateBox(wrap, {
      emoji: "⚠️",
      titleKey: "board.stateErrorTitle",
      descKey: "board.stateErrorDesc",
      btnKey: "common.retry", onBtn: retry
    });
    if (resp && resp.code === 6001) U.toast(t("error.6001"), "error");
  }

  function renderPager(container, key, data, reloadFn) {
    if (!data || data.total <= PAGE_SIZE) return;
    var totalPages = Math.ceil(data.total / PAGE_SIZE);
    var prev = el("button", "btn btn--ghost btn--sm", t("gm.prev"));
    prev.type = "button"; prev.disabled = page[key] <= 1;
    prev.addEventListener("click", function () { page[key]--; reloadFn(); });
    var label = el("span", "gm-pager-label", t("gm.page", { p: page[key], t: totalPages }));
    var next = el("button", "btn btn--ghost btn--sm", t("gm.next"));
    next.type = "button"; next.disabled = page[key] >= totalPages;
    next.addEventListener("click", function () { page[key]++; reloadFn(); });
    container.appendChild(prev);
    container.appendChild(label);
    container.appendChild(next);
  }

  function field(label, control) {
    var wrap = el("label", "gm-field");
    var lab = el("span", "gm-field-label", label);
    wrap.appendChild(lab);
    wrap.appendChild(control);
    return wrap;
  }

  function openModal(opts) {
    var root = $("gmModalRoot");
    root.textContent = "";
    var mask = el("div", "gm-modal-mask");
    var box = el("div", "gm-modal");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    var head = el("div", "gm-modal-head");
    head.appendChild(el("h3", "gm-modal-title", opts.title || ""));
    var close = el("button", "gm-modal-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("common.close"));
    head.appendChild(close);
    box.appendChild(head);

    var body = el("div", "gm-modal-body");
    if (opts.desc) body.appendChild(el("p", "gm-note", opts.desc));
    if (opts.content) body.appendChild(opts.content);
    box.appendChild(body);

    var foot = el("div", "gm-modal-foot");
    var cancel = el("button", "btn btn--ghost btn--sm", t("common.cancel"));
    cancel.type = "button";
    foot.appendChild(cancel);
    var ok = el("button", "btn " + (opts.danger ? "btn--danger" : "btn--primary") + " btn--sm",
      opts.okText || t("common.ok"));
    ok.type = "button";
    foot.appendChild(ok);
    box.appendChild(foot);
    mask.appendChild(box);
    root.appendChild(mask);

    function closeModal() { root.textContent = ""; }
    close.addEventListener("click", closeModal);
    cancel.addEventListener("click", closeModal);
    mask.addEventListener("click", function (e) { if (e.target === mask) closeModal(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key !== "Escape") return;
      closeModal();
      document.removeEventListener("keydown", onEsc);
    });

    ok.addEventListener("click", function () {
      ok.disabled = true;
      var p = opts.onOk ? opts.onOk() : null;
      if (!p || typeof p.then !== "function") { closeModal(); return; }
      p.then(function (resp) {
        ok.disabled = false;
        if (!resp || !resp.success) { toastFail(resp); return; }
        closeModal();
        reload();
      });
    });
    return { body: body, close: closeModal };
  }

  function toastFail(resp) {
    if (!resp) return;
    U.toast(resp.message || t("error.9003"), "error");
    if (resp.code === 401) {
      C.saveReturnPoint({ source: "gm" });
      window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    }
  }

  /* 岛内 tag 接口：board.js 软切换调用 show()/hide()。show() 首次进入时惰性构建 + 启动。 */
  HMB.pages = HMB.pages || {};
  HMB.pages.gm = {
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
