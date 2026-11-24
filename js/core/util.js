/* ============================================================
 * 留言板 · 公共工具：DOM / 格式化 / 下拉 / 弹窗 / Toast /
 * 测试钩子 window.__boardTest（PRD 7.2）/ 演示控制面板
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = (window.HMB = window.HMB || {});
  var t = function (k, p) { return HMB.i18n.t(k, p); };

  /* ---------------- DOM 构建（textContent 写入，禁 innerHTML 拼用户内容） ---------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function frag() { return document.createDocumentFragment(); }

  /** 搜索命中高亮：textContent 安全拼装 + <mark> */
  function highlightMatch(text, q) {
    var node = frag();
    var src = String(text == null ? "" : text);
    if (!q) { node.appendChild(document.createTextNode(src)); return node; }
    var lower = src.toLowerCase(), needle = q.toLowerCase(), i = 0, idx;
    while ((idx = lower.indexOf(needle, i)) >= 0) {
      if (idx > i) node.appendChild(document.createTextNode(src.slice(i, idx)));
      var mk = document.createElement("mark");
      mk.textContent = src.slice(idx, idx + needle.length);
      node.appendChild(mk);
      i = idx + needle.length;
    }
    if (i < src.length) node.appendChild(document.createTextNode(src.slice(i)));
    return node;
  }

  /* ---------------- 格式化 ---------------- */

  function fmtViews(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    return Number(n).toLocaleString("en-US");
  }

  function fmtHeat(heat) {
    // heat 以“万”为单位存储（PRD 6.5：展示时格式化为万）
    var v = Math.round(heat * 10) / 10;
    return String(v);
  }

  /* ---------------- 榜单得分与排序（前端权威计算层） ----------------
   * 结构参照 biliboard.uk 公示口径，权重为留言板自有语义。
   * mock api 只回传原始统计（views/likes/comments/favorites + period + createdAt），
   * 折合分、排序、历史最高全部由前端按此处公式计算 —— 后端零排行逻辑。
   *
   * t = ln(e^d + 1) + 1，d = 投稿 − 该帖所属期次统计起点（天，钳制 [0,7]）
   * 得分 = 浏览 × 1 × t + 评论 × 1 + 点赞 × 2 + 收藏 × 5（绝对分）
   * ============================================================ */
  var BOARD_WEIGHTS = { views: 1, comments: 1, likes: 2, favorites: 5 };
  var BOARD_DAY_MS = 86400000;

  /** 期次统计起点（周日 00:00）；期次区间取自 HMB.SEED.PERIODS.range。解析失败 → null（不做时间修正） */
  function periodStartTime(periodNo) {
    var periods = HMB.SEED && HMB.SEED.PERIODS;
    if (!periods) return null;
    var p = periods.find(function (x) { return x.no === periodNo; });
    if (!p) return null;
    var m = String(p.range || "").match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
  }

  /** 时间修正 t = ln(e^d + 1) + 1；无期次起点 → t = 1 */
  function viewTimeFactor(periodNo, createdAt) {
    var start = periodStartTime(periodNo);
    if (start === null) return 1;
    var d = Math.min(Math.max((createdAt - start) / BOARD_DAY_MS, 0), 7);
    return Math.log(Math.exp(d) + 1) + 1;
  }

  /** 折合分（绝对分）：浏览 × t + 评论 + 点赞×2 + 收藏×5 */
  function messageScore(m) {
    var s = m.stats || {};
    return (s.views || 0) * BOARD_WEIGHTS.views * viewTimeFactor(m.period, m.createdAt) +
      (s.comments || 0) * BOARD_WEIGHTS.comments +
      (s.likes || 0) * BOARD_WEIGHTS.likes +
      (s.favorites || 0) * BOARD_WEIGHTS.favorites;
  }

  /** 榜单比较器：heat 用折合分（同分新者在前）；其余直取原始字段 */
  function boardComparator(sort) {
    switch (sort) {
      case "latest": return function (a, b) { return b.createdAt - a.createdAt; };
      case "likes": return function (a, b) { return b.stats.likes - a.stats.likes; };
      case "comments": return function (a, b) { return b.stats.comments - a.stats.comments; };
      default: return function (a, b) {
        var d = messageScore(b) - messageScore(a);
        return d !== 0 ? d : b.createdAt - a.createdAt;
      };
    }
  }

  /** 前端榜单装配：注入 heat（万分制）→ 排序 →（可选）维护历史最高并写回 db。
   *  opts: { sort:"heat"|"latest"|..., peakField:"peakRank"|"peakNewRank" }
   *  peakField 仅在“完整榜单视图”（heat 排序 + 无搜索 + 非我的留言）传入。 */
  function rankBoard(list, opts) {
    opts = opts || {};
    list.forEach(function (m) { m.heat = messageScore(m) / 10000; });
    list.sort(boardComparator(opts.sort || "heat"));
    if (opts.peakField && HMB.db) {
      var all = HMB.db.getMessages();
      var changed = false;
      list.forEach(function (m, i) {
        var raw = all.find(function (x) { return x.resourceId === m.resourceId; });
        if (raw && (raw[opts.peakField] <= 0 || i + 1 < raw[opts.peakField])) {
          raw[opts.peakField] = i + 1;
          m[opts.peakField] = i + 1;
          changed = true;
        }
      });
      if (changed) HMB.db.saveMessages(all);
    }
    return list;
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60e3) return t("time.now");
    if (diff < 3600e3) return t("time.minutesAgo", { n: Math.floor(diff / 60e3) });
    if (diff < 24 * 3600e3) return t("time.hoursAgo", { n: Math.floor(diff / 3600e3) });
    return fmtDate(ts);
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------------- 线性小图标（静态 SVG 常量，非用户内容） ---------------- */

  var SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var ICONS = {
    eye: '<svg ' + SVG_ATTRS + '><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    heart: '<svg ' + SVG_ATTRS + '><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    comment: '<svg ' + SVG_ATTRS + '><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    star: '<svg ' + SVG_ATTRS + '><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
    search: '<svg ' + SVG_ATTRS + '><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    caret: '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="12" height="12"><path d="M6 9l6 6 6-6"/></svg>',
    close: '<svg ' + SVG_ATTRS + ' width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    pencil: '<svg ' + SVG_ATTRS + ' width="15" height="15"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    flame: '<svg ' + SVG_ATTRS + '><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    clock: '<svg ' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    user: '<svg ' + SVG_ATTRS + '><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    info: '<svg ' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    play: '<svg ' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
    users: '<svg ' + SVG_ATTRS + '><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    link2: '<svg ' + SVG_ATTRS + '><path d="M15 7h3a5 5 0 0 1 0 10h-3M9 17H6a5 5 0 0 1 0-10h3M8 12h8"/></svg>',
    gift: '<svg ' + SVG_ATTRS + ' width="15" height="15"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M12 8s-1.5-4-4-4-2.5 3 0 4M12 8s1.5-4 4-4 2.5 3 0 4"/></svg>'
  };

  function icon(name) {
    var holder = document.createElement("span");
    holder.className = "ico";
    holder.style.display = "inline-flex";
    holder.style.alignItems = "center";
    holder.innerHTML = ICONS[name] || ""; // 静态常量，非用户内容，安全
    return holder;
  }

  /* ---------------- 迷你走势箭头（stroke-dasharray 绘制 ~900ms +250ms 延迟） ---------------- */

  function trendArrow(delta) {
    var wrap = el("span");
    wrap.style.display = "inline-block";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 18 10");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "10");
    var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    var pts = delta > 0 ? "1,8 6,3 10,6 17,1" : (delta < 0 ? "1,2 6,7 10,4 17,9" : "1,5 6,5 10,5 17,5");
    line.setAttribute("points", pts);
    line.setAttribute("class", "arrow-path");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.8");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
    wrap.appendChild(svg);
    return wrap;
  }

  /* ---------------- 头像 ---------------- */

  function avatarNode(enumVal, extraCls) {
    var seedAv = window.HMB.SEED.AVATARS;
    var cls = "avatar" + (extraCls ? " " + extraCls : "");
    if (!enumVal || enumVal < 1 || enumVal > seedAv.length) {
      // 匿名身份“热心同学”
      var anon = el("div", cls + " avatar--anon", "🎁");
      return anon;
    }
    return el("div", cls + " avatar--" + enumVal, seedAv[enumVal - 1]);
  }

  /* ---------------- 自定义下拉（spring ≤300ms，外点关闭，选中回写） ---------------- */

  var dropdownRegistry = [];

  function makeDropdown(root, items, initialKey, onSelect, labelTpl) {
    // root: 容器（.dropdown）；items: [{key, label}]
    var btn = el("button", "dropdown-btn");
    btn.type = "button";
    var labelSpan = el("span", "dropdown-label");
    btn.appendChild(labelSpan);
    btn.appendChild(icon("caret"));
    var menu = el("div", "dropdown-menu");
    var itemEls = {};

    function renderMenu() {
      menu.textContent = "";
      items.forEach(function (it) {
        var item = el("div", "dropdown-item" + (it.key === currentKey ? " is-active" : ""));
        item.setAttribute("role", "option");
        var check = el("span", "check", "✓");
        item.appendChild(check);
        item.appendChild(el("span", null, it.label));
        item.addEventListener("click", function (e) {
          e.stopPropagation();
          select(it.key, true);
          close();
        });
        itemEls[it.key] = item;
        menu.appendChild(item);
      });
    }

    var currentKey = initialKey;
    function syncLabel() {
      var it = items.find(function (x) { return x.key === currentKey; });
      labelSpan.textContent = labelTpl ? labelTpl(it) : (it ? it.label : "");
      renderMenu();
    }

    function select(key, fire) {
      currentKey = key;
      syncLabel();
      if (fire && onSelect) onSelect(key);
    }

    function open() {
      closeAllDropdowns();
      root.classList.add("is-open");
      HMB.hooks._dropdown = { open: true, openedAt: performance.now() };
    }

    function close() {
      if (!root.classList.contains("is-open")) return;
      root.classList.remove("is-open");
      var d = HMB.hooks._dropdown;
      if (d && d.open) {
        HMB.hooks._dropdown = {
          open: false, openedAt: d.openedAt,
          closedAt: performance.now(),
          lastDuration: Math.round(performance.now() - d.openedAt)
        };
      }
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (root.classList.contains("is-open")) close(); else open();
    });

    root.appendChild(btn);
    root.appendChild(menu);
    syncLabel();
    dropdownRegistry.push({ root: root, close: close });
    select(initialKey, false);

    return {
      get: function () { return currentKey; },
      set: function (k) { select(k, false); },
      close: close,
      btn: btn
    };
  }

  function closeAllDropdowns() {
    dropdownRegistry.forEach(function (d) { d.close(); });
  }

  document.addEventListener("click", function () { closeAllDropdowns(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllDropdowns();
      var mask = document.querySelector(".modal-mask.is-open");
      if (mask) mask._close && mask._close();
    }
  });

  /* ---------------- 弹窗 ---------------- */

  function openModal(contentNode, opts) {
    opts = opts || {};
    var mask = el("div", "modal-mask");
    var box = el("div", "modal " + (opts.modalCls || ""));
    if (opts.closable !== false) {
      var closeBtn = el("button", "modal-close");
      closeBtn.type = "button";
      closeBtn.appendChild(icon("close"));
      closeBtn.addEventListener("click", function () { close(); });
      box.appendChild(closeBtn);
    }
    box.appendChild(contentNode);
    mask.appendChild(box);
    mask.addEventListener("click", function (e) {
      if (e.target === mask && opts.dismissable !== false) close();
    });
    function close() {
      mask.classList.remove("is-open");
      setTimeout(function () { mask.remove(); }, 220);
      if (opts.onClose) opts.onClose();
    }
    mask._close = close;
    document.body.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add("is-open"); });
    return { mask: mask, box: box, close: close };
  }

  /* ---------------- Toast ---------------- */

  var toastWrap = null;
  function toast(msg, type) {
    if (!toastWrap) {
      toastWrap = el("div", "toast-wrap");
      document.body.appendChild(toastWrap);
    }
    var node = el("div", "toast" + (type ? " toast--" + type : ""), msg);
    toastWrap.appendChild(node);
    setTimeout(function () {
      node.classList.add("is-leaving");
      setTimeout(function () { node.remove(); }, 240);
    }, 2200);
  }

  /* ---------------- 测试钩子（PRD 7.2：window.__boardTest） ---------------- */

  var hooks = {
    navCount: 0,
    marker: null,
    _scrolls: [],
    _skeleton: [],
    highlightRemovedAt: null,
    _dropdown: { open: false },
    scrollYAt: function (tMs) {
      // 返回时刻 tMs 附近（±30ms）采样的 scrollY；无样本返回 null
      var best = null, bestDiff = Infinity;
      this._scrolls.forEach(function (s) {
        var d = Math.abs(s.t - tMs);
        if (d < bestDiff) { bestDiff = d; best = s; }
      });
      return best && bestDiff <= 30 ? best.y : null;
    },
    skeletonAt: function () { return this._skeleton.slice(); },
    dropdownState: function () {
      var d = this._dropdown;
      return {
        open: !!d.open,
        openedAt: d.openedAt || null,
        closedAt: d.closedAt || null,
        lastDuration: d.lastDuration || null
      };
    },
    _pushScroll: function (y) {
      this._scrolls.push({ t: performance.now(), y: y });
      if (this._scrolls.length > 600) this._scrolls.shift();
    },
    _skeletonShow: function () { this._skeleton.push({ t: performance.now(), phase: "show" }); },
    _skeletonHide: function () { this._skeleton.push({ t: performance.now(), phase: "hide" }); }
  };

  hooks.marker = { openedAt: performance.now() }; // 埋标记：提交后仍存在 ⇒ 无 document 级导航
  window.__boardTest = hooks;

  var lastY = window.scrollY;
  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    if (Math.abs(y - lastY) >= 1) {
      lastY = y;
      hooks._pushScroll(y);
    }
  }, { passive: true });

  window.addEventListener("pagehide", function () {
    try {
      var n = parseInt(window.sessionStorage.getItem("hmb_nav_count") || "0", 10) + 1;
      window.sessionStorage.setItem("hmb_nav_count", String(n));
    } catch (e) { /* noop */ }
  });

  /* ---------------- 演示控制面板（交互测试辅助） ---------------- */

  function renderDebugPanel() {
    var fab = el("button", "debug-fab");
    fab.type = "button";
    fab.setAttribute("data-text-title", "debug.title");
    fab.textContent = "⚙";

    var panel = el("div", "debug-panel");

    var title = el("h4");
    title.setAttribute("data-text", "debug.title");
    panel.appendChild(title);

    var sec1 = el("div", "dbg-sec");
    sec1.setAttribute("data-text", "debug.identity");
    panel.appendChild(sec1);
    var row1 = el("div", "dbg-row");
    var accounts = [
      { name: "小满", phone: "13800000001" },
      { name: "阿泽", phone: "13800000002" },
      { name: "橘子汽水", phone: "13800000003" },
      { name: "树树", phone: "13800000005" },
      { name: "晚风", phone: "13800000006" }
    ];
    accounts.forEach(function (a) {
      var b = el("button", "dbg-btn", "登录：" + a.name);
      b.type = "button";
      b.addEventListener("click", function () {
        window.HMB.api.login({ phone: a.phone, password: "abc12345" }).then(function () {
          window.location.reload();
        });
      });
      row1.appendChild(b);
    });
    var logoutBtn = el("button", "dbg-btn", "退出（访客）");
    logoutBtn.type = "button";
    logoutBtn.addEventListener("click", function () {
      window.HMB.api.logout({ csrf: (HMB.session && HMB.session.csrf) || "x" }).then(function () {
        window.location.reload();
      });
    });
    row1.appendChild(logoutBtn);
    panel.appendChild(row1);

    var secNav = el("div", "dbg-sec", "页面导览");
    panel.appendChild(secNav);
    var navRow = el("div", "dbg-row");
    [
      ["首页榜单", "index.html"],
      ["发布留言", "post.html"],
      ["详情/评论", "detail.html?id=a1f0b2c3-7f3a-4c21-9d01-000000000001"],
      ["注册", "register.html"],
      ["登录", "login.html"],
      ["个人中心", "profile.html"],
      ["关于", "about.html"],
      ["状态样张", "states.html"]
    ].forEach(function (p) {
      var a = el("a", "dbg-btn", p[0]);
      a.href = p[1];
      navRow.appendChild(a);
    });
    panel.appendChild(navRow);

    var sec2 = el("div", "dbg-sec");
    sec2.setAttribute("data-text", "debug.data");
    panel.appendChild(sec2);
    var row2 = el("div", "dbg-row");

    var resetBtn = el("button", "dbg-btn");
    resetBtn.type = "button";
    resetBtn.setAttribute("data-text", "debug.reset");
    resetBtn.addEventListener("click", function () {
      window.HMB.db.reset();
      toast(t("debug.resetDone"), "success");
      setTimeout(function () { window.location.reload(); }, 600);
    });
    row2.appendChild(resetBtn);

    var expireBtn = el("button", "dbg-btn");
    expireBtn.type = "button";
    expireBtn.setAttribute("data-text", "debug.expire");
    expireBtn.addEventListener("click", function () {
      var done = window.HMB.api._debug.expireSession();
      toast(done ? t("debug.expiredDone") : t("common.ok"), done ? "success" : "");
      if (done) setTimeout(function () { window.location.reload(); }, 600);
    });
    row2.appendChild(expireBtn);

    var netBtn = el("button", "dbg-btn");
    netBtn.type = "button";
    netBtn.setAttribute("data-text", "debug.netFail");
    netBtn.addEventListener("click", function () {
      var s = window.HMB.db.getSettings();
      s.simulateNetFail = !s.simulateNetFail;
      window.HMB.db.saveSettings(s);
      netBtn.classList.toggle("is-on", s.simulateNetFail);
      toast(s.simulateNetFail ? "模拟网络失败：开启" : "模拟网络失败：关闭");
    });
    row2.appendChild(netBtn);
    if (window.HMB.db.getSettings().simulateNetFail) netBtn.classList.add("is-on");
    panel.appendChild(row2);

    var rateNote = el("div", "dbg-note");
    function refreshRate() {
      rateNote.textContent = t("debug.rateWindow", { n: window.HMB.api._debug.rateCount() });
    }
    refreshRate();
    setInterval(refreshRate, 1500);
    panel.appendChild(rateNote);

    var note1 = el("div", "dbg-note");
    note1.setAttribute("data-text", "debug.sensitive");
    panel.appendChild(note1);
    var note2 = el("div", "dbg-note");
    note2.setAttribute("data-text", "debug.lockout");
    panel.appendChild(note2);
    var note3 = el("div", "dbg-note");
    note3.setAttribute("data-text", "debug.accounts");
    panel.appendChild(note3);

    fab.addEventListener("click", function () { panel.classList.toggle("is-open"); });
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    HMB.i18n.apply(panel);
  }

  /* ---------------- 汇出 ---------------- */

  HMB.util = {
    el: el,
    frag: frag,
    highlightMatch: highlightMatch,
    fmtViews: fmtViews,
    fmtHeat: fmtHeat,
    periodStartTime: periodStartTime,
    viewTimeFactor: viewTimeFactor,
    messageScore: messageScore,
    boardComparator: boardComparator,
    rankBoard: rankBoard,
    fmtDate: fmtDate,
    timeAgo: timeAgo,
    debounce: debounce,
    icons: ICONS,
    icon: icon,
    trendArrow: trendArrow,
    avatar: avatarNode,
    makeDropdown: makeDropdown,
    closeAllDropdowns: closeAllDropdowns,
    openModal: openModal,
    toast: toast,
    renderDebugPanel: renderDebugPanel
  };
  HMB.hooks = hooks;

  /* ---------- 按钮乱码解码（hover）：字库取自站内文字，总时长 ≤ 0.5s，乱码每 70ms 才换一批 ----------
     mouseover 委托到 [data-scramble]——动态渲染的按钮（重试/去登录等）同样命中；
     只改写文本节点（nodeValue），按钮内的图标 span / SVG 等元素子节点原样保留；
     空格保持原位，字符从左到右逐位"解锁"；reduced-motion 不启用。 */
  (function () {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var POOL = "留言板热榜最新我的关于评论点赞盲盒抽取发布重试登录注册消息身份选择好友确认取消周更互动Hiu24码号中英混排01{}<>/#*+";
    var running = new WeakSet();
    var doneAt = new WeakMap();
    function play(el) {
      if (running.has(el) || el.disabled) return;
      var now = performance.now();
      var last = doneAt.get(el);
      if (last && now - last < 350) return;      // 刚播完的短冷却，防止在按钮内移动时连播
      var nodes = [];
      (function walk(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) { if (c.nodeValue && c.nodeValue.trim()) nodes.push({ node: c, text: c.nodeValue }); }
          else if (c.nodeType === 1) walk(c);
        }
      })(el);
      var len = 0;
      nodes.forEach(function (pair) {
        pair.entries = [];
        for (var i = 0; i < pair.text.length; i++) {
          var ch = pair.text[i];
          var space = (ch === " " || ch === "　");
          pair.entries.push({ ch: ch, space: space, glyph: POOL[(Math.random() * POOL.length) | 0] });
          if (!space) len++;
        }
      });
      if (len < 2) return;
      var done = 0;
      nodes.forEach(function (pair) {
        pair.entries.forEach(function (en) {
          if (en.space) { en.unlock = 0; return; }
          en.unlock = 0.18 + 0.72 * (done / Math.max(1, len - 1));
          done++;
        });
      });
      running.add(el);
      var start = now, DUR = 460, ROLL = 70, lastRoll = start;
      function tick(now2) {
        var t = Math.min(1, (now2 - start) / DUR);
        if (now2 - lastRoll >= ROLL) {           // 频次：乱码字每 70ms 才重摇一次
          lastRoll = now2;
          nodes.forEach(function (pair) {
            pair.entries.forEach(function (en) {
              if (t < en.unlock) en.glyph = POOL[(Math.random() * POOL.length) | 0];
            });
          });
        }
        nodes.forEach(function (pair) {
          var out = "";
          pair.entries.forEach(function (en) {
            out += (t >= en.unlock) ? en.ch : en.glyph;
          });
          pair.node.nodeValue = out;             // 只写文本节点 → 图标元素不动
        });
        if (t < 1) requestAnimationFrame(tick);
        else {
          nodes.forEach(function (pair) { pair.node.nodeValue = pair.text; });   // 精确还原
          running.delete(el); doneAt.set(el, performance.now());
        }
      }
      requestAnimationFrame(tick);
    }
    document.addEventListener("mouseover", function (e) {
      var el = e.target.closest ? e.target.closest("[data-scramble]") : null;
      if (el) play(el);
    });
  })();

  /* ---------- 页面过渡：淡出 140ms → 跳转 → 到达淡入（消除 MPA 白屏闪烁） ----------
     仅拦截同站锚链接（排除外链/锚点/修饰键/新标签）；应用内软切换自行 stopPropagation。
     reduced-motion 用户直跳。CSS 见 base.css 的 .bb-veil / bb-page-in。 */
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function boot() {
      var veil = document.createElement("div");
      veil.className = "bb-veil";
      document.body.appendChild(veil);
      document.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
        var href = a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#" || /^(https?:|mailto:|javascript:)/i.test(href)) return;
        e.preventDefault();
        document.documentElement.classList.add("bb-leaving");
        setTimeout(function () { window.location.href = href; }, 140);
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  })();
})(window, document);
