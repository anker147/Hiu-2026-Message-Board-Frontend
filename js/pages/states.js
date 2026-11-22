/* ============================================================
 * 留言板 · 状态样张页（Page 1 画布 10/13/14/16/19 的可视化落地）
 * 全部复用真实组件与真实数据渲染，非贴图。
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var t = function (k, p) { return HMB.i18n.t(k, p); };
  var el = U.el;
  var $ = function (id) { return document.getElementById(id); };

  function init() {
    HMB.api.getSession().then(function (resp) {
      C.renderTopbar($("topbar"), null, resp.data);
      HMB.util.renderDebugPanel();
      renderAll();
    });
    $("demoGuideBtn").addEventListener("click", function () {
      C.openGuideModal("states-demo");
    });
  }

  /* 画布 19：四态样张 */
  function renderFourStates() {
    // 加载态：真实骨架卡
    var loading = $("demoLoading");
    loading.appendChild(el("div", "states-sec-note", "加载态：shimmer 骨架屏，切换 ≤300ms（__boardTest.skeletonAt 可测）"));
    C.renderSkeleton(loading, 1);

    // 空态
    var empty = $("demoEmpty");
    empty.appendChild(el("div", "states-sec-note", "空态：说明下一步动作，禁止单独“-”占位"));
    C.renderStateBox(empty, {
      emoji: "✏️",
      titleKey: "board.stateEmptyTitle",
      descKey: "board.stateEmptyDesc",
      btnKey: "board.stateEmptyBtn",
      onBtn: function () { window.location.href = "edit.html?mode=new"; }
    });

    // 错误态
    var errorBox = $("demoError");
    errorBox.appendChild(el("div", "states-sec-note", "错误态：就地重试"));
    C.renderStateBox(errorBox, {
      emoji: "⚠️",
      titleKey: "board.stateErrorTitle",
      descKey: "board.stateErrorDesc",
      btnKey: "common.retry",
      onBtn: function () { U.toast(t("error.network")); }
    });

    // 无权限/禁用态
    var forbidden = $("demoForbidden");
    forbidden.appendChild(el("div", "states-sec-note", "无权限态：引导登录后回原位"));
    C.renderStateBox(forbidden, {
      emoji: "🔒",
      titleKey: "board.stateLoginTitle",
      descKey: "board.stateLoginDesc",
      btnKey: "guide.btn",
      btnCls: "btn--ghost",
      onBtn: function () {
        C.saveReturnPoint({ source: "states-demo" });
        window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
      }
    });
  }

  /* 画布 13：涨跌徽章四态 */
  function renderDelta() {
    var box = $("demoDelta");
    var rows = [
      { cls: "demo-delta-up", chip: "▲ 12.4%", lab: "上升 · --up #FF5A7A（涨红）" },
      { cls: "demo-delta-down", chip: "▼ 3.8%", lab: "下降 · --down #12B886（跌绿）" },
      { cls: "demo-delta-new", chip: "NEW", lab: "新上榜（点缀粉胶囊）" },
      { cls: "demo-delta-flat", chip: "— 0.0%", lab: "持平 · heat_delta = 0" }
    ];
    rows.forEach(function (r) {
      var row = el("div", "demo-delta-row " + r.cls);
      row.appendChild(el("span", null, r.chip));
      row.appendChild(el("span", "lab", r.lab));
      box.appendChild(row);
    });
  }

  /* 画布 13：Top3 三色 */
  function renderTop3() {
    var box = $("demoTop3");
    [["01", "rank-num--1"], ["02", "rank-num--2"], ["03", "rank-num--3"], ["04", ""]].forEach(function (p) {
      var n = el("div", "rank-num " + p[1], p[0]);
      box.appendChild(n);
    });
  }

  /* 画布 13：下拉展开态（静态展开 + 可交互） */
  function renderDropdown() {
    var root = $("demoDropdown");
    root.classList.add("is-open");
    U.makeDropdown(root, [
      { key: "heat", label: t("common.sortHeat") },
      { key: "latest", label: t("common.sortLatest") },
      { key: "likes", label: t("common.sortLikes") },
      { key: "comments", label: t("common.sortComments") }
    ], "heat", function () { /* 样张：仅展示 */ });
  }

  /* 画布 13：搜索命中高亮 */
  function renderSearchHit() {
    $("demoSearchIcon").appendChild(U.icon("search"));
    var hit = $("demoSearchHit");
    var row = el("div", "states-card", "");
    row.style.cssText = "background:var(--blue-soft);border-color:var(--blue);padding:12px 16px;display:flex;align-items:center;gap:8px";
    row.appendChild(el("span", "check", "✓"));
    var title = el("span", null, "");
    title.appendChild(U.highlightMatch("下课后一起去看晚霞吗，操场边那棵树又开花了", "晚霞"));
    row.appendChild(title);
    row.appendChild(el("span", "comment-time", "· @小满"));
    hit.appendChild(row);
  }

  /* 画布 14：点赞状态机表 */
  function renderLike() {
    var box = $("demoLike");
    [
      ["states.machine1", "states.m1r"],
      ["states.machine2", "states.m2r"],
      ["states.machine3", "states.m3r"],
      ["states.machine4", "states.m4r"]
    ].forEach(function (p) {
      var row = el("div", "demo-machine-row");
      row.appendChild(el("span", null, t(p[0])));
      row.appendChild(el("span", "r", t(p[1])));
      box.appendChild(row);
    });
    // 可交互的真实点赞按钮样例
    var row2 = el("div", "demo-machine-row");
    var btn = el("span", "stat stat--likebtn");
    btn.setAttribute("role", "button");
    btn.tabIndex = 0;
    btn.appendChild(U.icon("heart"));
    btn.appendChild(el("span", null, "328"));
    btn.addEventListener("click", function () {
      U.toast(t("states.likeMachine"), "");
    });
    row2.appendChild(el("span", null, "交互样例（真实 F8 逻辑见榜单卡红心）"));
    row2.appendChild(btn);
    box.appendChild(row2);
  }

  /* 画布 10④：写时快照 + 已编辑 */
  function renderSnapshot() {
    var box = $("demoSnapshot");
    var node = el("div", "comment-item", "");
    node.style.border = "none";
    var head = el("div", "comment-head");
    head.appendChild(el("span", "comment-author", "阿泽"));
    head.appendChild(el("span", "comment-time", "2 小时前"));
    head.appendChild(el("span", "edited-mark", t("common.edited")));
    node.appendChild(head);
    node.appendChild(el("div", "comment-content", "带上相机，晚霞值得记录"));
    var note = el("p", "states-sec-note", "");
    note.style.marginTop = "10px";
    note.textContent = "改名后：新留言/新评论用新昵称；历史内容保留发布时 nickname_snapshot；@引用以展示 ID 为准";
    box.appendChild(node);
    box.appendChild(note);
  }

  /* 画布 16：掩码表 */
  function renderMask() {
    var table = $("demoMask");
    var thead = el("tr");
    ["原值", "掩码输出", "规则"].forEach(function (h) {
      var th = el("th", null, h);
      thead.appendChild(th);
    });
    var head = el("thead");
    head.appendChild(thead);
    table.appendChild(head);
    var tbody = el("tbody");
    [
      ["张三丰", "张*", "姓名保留姓，超长截断再掩码"],
      ["欧阳娜娜", "欧**", "复姓按首字处理"],
      ["abcdef@qq.com", "abc***@qq.com", "邮箱保留前 3 位 + ***@域名"],
      ["a@b.cc", "a@***", "短邮箱：首字符 + @***"],
      ["13812345678", "138****5678", "手机号 3-4-4"],
      ["（空值）", "（空串）", "空值返回空串，不展示开关"]
    ].forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", null, r[0]));
      var td = el("td");
      td.appendChild(el("b", null, r[1]));
      tr.appendChild(td);
      tr.appendChild(el("td", null, r[2]));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  /* 画布 16②：热心同学匿名回复样例 */
  function renderAnon() {
    var box = $("demoAnon");
    var reply = el("div", "reply-item is-anon-reply comment-item", "");
    var head = el("div", "comment-head");
    var av = U.avatar(0, "avatar--sm");
    av.style.cssText = "width:26px;height:26px;font-size:14px;border-radius:50%";
    head.appendChild(av);
    head.appendChild(el("span", "comment-author is-anon", t("common.anonymous")));
    head.appendChild(el("span", "rank-badge rank-badge--flat", t("detail.anonTag")));
    head.appendChild(el("span", "comment-time", "30 分钟前"));
    reply.appendChild(head);
    reply.appendChild(el("div", "comment-content", "上周刚去过，环湖的日落特别好看，祝你玩得开心"));
    box.appendChild(reply);
    var note = el("p", "states-sec-note", "");
    note.style.marginTop = "10px";
    note.textContent = "回复内容对原作者可见；回复者真实昵称/展示 ID 不展示；服务端留痕真实身份，前端接口绝不返回";
    box.appendChild(note);
  }

  function renderAll() {
    renderFourStates();
    renderDelta();
    renderTop3();
    renderDropdown();
    renderSearchHit();
    renderLike();
    renderSnapshot();
    renderMask();
    renderAnon();
    HMB.i18n.apply(document.querySelector("main"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
