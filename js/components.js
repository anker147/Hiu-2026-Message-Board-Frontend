/* ============================================================
 * 留言板 · 共享组件：顶栏 / 榜单卡 / 骨架 / 四态 / 评论树 /
 * 登录引导 / 改删确认 / 编辑 / 盲盒弹窗
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var t = function (k, p) { return HMB.i18n.t(k, p); };
  var el = U.el;

  /* ================= 顶栏 ================= */

  /* —— 线性匀速回顶（切换 tag / 回顶按钮共用）：rAF 逐帧线性插值 scrollY，
        匀速 1.6px/ms（短距下限 280ms、长距上限 800ms）；动画期间临时关掉
        CSS scroll-behavior:smooth，防止逐帧 scrollTo 被浏览器平滑动画吞掉；
        用户滚轮/触摸立即让位；reduced-motion 或无 rAF 环境直跳。
        __topAnim 递增令牌：仅最新动画有权推进/复位 scrollBehavior，防连点互抢。 —— */
  var __topAnim = 0;
  function smoothScrollToTop() {
    var startY = window.scrollY || 0;
    if (startY <= 1) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof window.requestAnimationFrame !== "function") {
      window.scrollTo(0, 0);
      return;
    }
    var dur = Math.max(280, Math.min(800, startY / 1.6));
    var root = document.documentElement;
    root.style.scrollBehavior = "auto";
    var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
    var myId = ++__topAnim;
    var t0 = now();
    var cancelled = false;
    var yieldScroll = function () { cancelled = true; };
    window.addEventListener("wheel", yieldScroll, { once: true, passive: true });
    window.addEventListener("touchstart", yieldScroll, { once: true, passive: true });
    var step = function (ts) {
      if (myId !== __topAnim) return;                     // 已被更新的动画接管 → 静默退出
      if (cancelled) { root.style.scrollBehavior = ""; return; }
      var k = Math.min(1, ((ts || now()) - t0) / dur);
      window.scrollTo(0, Math.round(startY * (1 - k)));   // 线性：位移与时间成正比
      if (k < 1) window.requestAnimationFrame(step);
      else { __topAnim++; root.style.scrollBehavior = ""; }
    };
    window.requestAnimationFrame(step);
  }

  function renderTopbar(mount, activeTab, session) {
    mount.textContent = "";
    var inner = el("div", "topbar-inner");

    var logo = el("a", "logo", t("common.appName"));
    logo.href = "index.html";
    inner.appendChild(logo);

    /* 导航：双层玻璃胶囊 —— 深色玻璃岛做底，当前项白色玻璃胶囊滑至其上。
       滑动动效：胶囊沿移动方向拉长、到位弹性回弹（Web Animations 逐段缓动）。 */
    var nav = el("nav", "nav-island");
    nav.setAttribute("aria-label", "主导航");
    var pill = el("span", "nav-pill");
    pill.style.width = "0px";
    nav.appendChild(pill);
    var TAB_ICONS = { hot: "flame", latest: "clock", mine: "user", all: "layers", about: "info", gm: "shield" };
    var TAB_SUBS = { hot: "HOT", latest: "NEW", mine: "MINE", all: "ALL", about: "ABOUT", gm: "GM" };
    // 「全部留言」为岛内 tag（mine 之后）；管理员 GM 仅 session.isAdmin=true 时追加（服务端也校验角色）
    var TAB_DEFS = [
      ["hot", "common.hot"], ["latest", "common.latest"],
      ["mine", "common.mine"], ["all", "common.allMessages"], ["about", "common.about"]
    ];
    if (session && session.isAdmin) TAB_DEFS.push(["gm", "gm.badge"]);
    var current = activeTab;
    var switchEpoch = 0;   // 点击代际：predict 异步期间连点时，过期点击的 doSwap 作废   // 当前项的可变副本：软切换后必须同步，否则闭包旧值会把"切回加载时 tab"判为无操作
    /* tab 构建器：活岛用 data-text 走 i18n 注入；测量克隆行用 withText 直接写文本（克隆不经过 i18n.apply） */
    function buildTab(pair, isActive, withText) {
      var a = el("a", "nav-tab" + (isActive ? " is-active" : ""));
      // 关于为独立页面；GM 与其余项均在榜单页内软切换（岛内 tag）
      a.href = (pair[0] === "about")
        ? pair[0] + ".html" : "index.html?tab=" + pair[0];
      a.setAttribute("data-tab", pair[0]);
      var ic = el("span", "nav-ico");
      ic.appendChild(U.icon(TAB_ICONS[pair[0]]));
      a.appendChild(ic);
      var txt = el("span", "nav-txt");
      var label = el("span", "nav-tab-label");
      if (withText) label.textContent = t(pair[1]);
      else label.setAttribute("data-text", pair[1]);
      txt.appendChild(label);
      txt.appendChild(el("span", "nav-tab-sub", TAB_SUBS[pair[0]]));
      a.appendChild(txt);
      return a;
    }
    TAB_DEFS.forEach(function (pair) {
      var a = buildTab(pair, activeTab === pair[0], false);
      a.addEventListener("click", function (e) {
        var board = HMB.pages && HMB.pages.board;
        // standalone about.html 上点当前页项 = 无操作（阻断页面过渡层）
        if (pair[0] === "about" && location.pathname.indexOf("about.html") >= 0) {
          e.preventDefault(); e.stopPropagation(); return;
        }
        // 榜单页内软切换：先立即播岛内动效（零等待、不卡手），再加载目标视图
        if (board && typeof board.switchTab === "function" &&
            !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();   // 软切换不交给页面过渡层（否则 140ms 后会被导航）
          if (current === pair[0]) { smoothScrollToTop(); return; }   // 回点当前项：线性回顶

          var myEpoch = ++switchEpoch;
          current = pair[0];

          // ① 同步动效：胶囊滑行 + 标签折叠展开 + 当前视图淡出
          var prev = nav.querySelector(".nav-tab.is-active");
          if (prev) {
            prev.classList.remove("is-active");
            var ptxt = prev.querySelector(".nav-txt");
            if (ptxt) ptxt.style.width = "0px";          // 旧当前项折叠为纯图标
          }
          a.classList.add("is-active");
          var ntxt = a.querySelector(".nav-txt");
          if (ntxt) ntxt.style.width = ntxt.scrollWidth + "px";  // 新当前项弹性展开
          slidePillTo(pair[0]);
          document.body.classList.add("is-tab-switching");
          smoothScrollToTop();

          // ② 动效起步后才真正加载页面（含岛内 show() 建 DOM / 列表请求）
          window.setTimeout(function () {
            document.body.classList.remove("is-tab-switching");
            if (myEpoch !== switchEpoch) return;   // 过期点击：最新的一击已接管
            if (history.replaceState) history.replaceState(null, "", "index.html?tab=" + pair[0]);
            board.switchTab(pair[0]);
          }, 130);
        }
        // 非榜单页 / 修饰键点击 → 默认整页跳转
      });
      nav.appendChild(a);
    });
    inner.appendChild(nav);

    /* —— 吸顶小边：完全收起态（is-crowded）岛平移到只露下缘小边，
          点小边弹出整岛再操作（capture 先于 tab 命中，避免露边误触导航）；
          弹出态点岛上空白收回；再次滚动自动收回。 —— */
    /* 果冻收回：移除弹出态并播过冲动画（jelly-tuck，仅 crowd=1 场景；430ms 后摘标记可重复触发） */
    var retractIsland = function () {
      mount.classList.remove("is-popped");
      nav.classList.remove("is-retracting");
      void nav.offsetWidth;
      nav.classList.add("is-retracting");
      setTimeout(function () { nav.classList.remove("is-retracting"); }, 430);
    };
    nav.addEventListener("click", function (e) {
      if (!mount.classList.contains("is-crowded")) return;
      if (!mount.classList.contains("is-popped")) {
        e.preventDefault(); e.stopPropagation();
        mount.classList.add("is-popped");
        return;
      }
      if (!(e.target.closest && e.target.closest(".nav-tab"))) {
        e.preventDefault(); e.stopPropagation();
        retractIsland();
      }
    }, true);

    /* 终态几何测量：折叠/展开过渡会改变所有 tab 的实时几何，
       胶囊必须落到"过渡结束后"的槽位——把整行 tab 克隆进同款隐形容器（目标项展开态）读取终值。 */
    function measureFinalTab(key) {
      var holder = el("div", "nav-island");
      holder.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
      TAB_DEFS.forEach(function (pair) {
        var c = buildTab(pair, pair[0] === key, true);
        var tx = c.querySelector(".nav-txt");
        tx.style.width = pair[0] === key ? "auto" : "0px";
        holder.appendChild(c);
      });
      document.body.appendChild(holder);
      var target = holder.querySelector('[data-tab="' + key + '"]');
      var out = { left: target.offsetLeft, width: target.offsetWidth };
      document.body.removeChild(holder);
      return out;
    }
    /* 玻璃胶囊滑动（液态动效）：前缘先行——胶囊体沿移动方向大幅拉长（≈1.55×），
       后缘追赶收拢；到位整体越过目标再弹性回弹（五段关键帧，left/width 直接编排）。
       fill:both 由最终内联样式兜底；prefers-reduced-motion 直落。 */
    function slidePillTo(key) {
      var m = measureFinalTab(key);
      if (!m) return;
      var toL = m.left, toW = m.width;
      var fromL = parseFloat(pill.style.left);
      var fromW = parseFloat(pill.style.width);
      if (isNaN(fromL) || isNaN(fromW)) { fromL = toL; fromW = toW; }
      pill.style.left = toL + "px";
      pill.style.width = toW + "px";
      var dx = toL - fromL;
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || Math.abs(dx) < 4 || !pill.animate) return;
      var dir = dx >= 0 ? 1 : -1;
      // 前缘 = 移动方向一侧的边；后缘 = 另一侧
      var leadFrom = dir > 0 ? fromL + fromW : fromL;
      var leadTo = dir > 0 ? toL + toW : toL;
      var trailFrom = dir > 0 ? fromL : fromL + fromW;
      var trailTo = dir > 0 ? toL : toL + toW;
      // k1：前缘先行 80% 行程，后缘仅 16% → 胶囊拉长至 ≈1.55×
      var lead1 = leadFrom + 0.8 * (leadTo - leadFrom);
      var trail1 = trailFrom + 0.16 * (trailTo - trailFrom);
      var l1 = dir > 0 ? trail1 : lead1;
      var w1 = dir > 0 ? lead1 - trail1 : trail1 - lead1;
      // k2：前缘到位，后缘收拢至 88% 行程 → 胶囊仍略拉长
      var lead2 = leadTo;
      var trail2 = trailFrom + 0.88 * (trailTo - trailFrom);
      var l2 = dir > 0 ? trail2 : lead2;
      var w2 = dir > 0 ? lead2 - trail2 : trail2 - lead2;
      var anim = pill.animate([
        { left: fromL + "px", width: fromW + "px", transform: "scaleY(1)",
          easing: "cubic-bezier(.3,.7,.4,1)" },
        { left: l1.toFixed(1) + "px", width: Math.max(w1, 8).toFixed(1) + "px", transform: "scaleY(.86)",
          offset: 0.38, easing: "cubic-bezier(.2,.7,.3,1)" },
        { left: l2.toFixed(1) + "px", width: Math.max(w2, 8).toFixed(1) + "px", transform: "scaleY(.92)",
          offset: 0.64, easing: "cubic-bezier(.4,1.4,.6,1)" },
        { left: (toL + dx * 0.08).toFixed(1) + "px", width: (toW * 0.97).toFixed(1) + "px", transform: "scaleY(.98)",
          offset: 0.84, easing: "cubic-bezier(.3,1.3,.5,1)" },
        { left: toL + "px", width: toW + "px", transform: "scaleY(1)" }
      ], { duration: 560, fill: "both" });
      anim.finished.then(function () { anim.cancel(); }).catch(function () {});
    }
    function placePill() {
      var tab = nav.querySelector(".nav-tab.is-active");
      if (!tab) { pill.style.width = "0px"; return; }
      pill.style.left = tab.offsetLeft + "px";
      pill.style.width = tab.offsetWidth + "px";
    }
    /* 当前项文字宽度同步：instant=true 时跳过过渡（boot/字体切换用），
       否则 rAF 里设置的宽度会从 0 开始播 360ms 展开——placePill 将读到过渡起点 0 宽 */
    function syncActiveTxt(instant) {
      var tab = nav.querySelector(".nav-tab.is-active");
      if (!tab) return;
      var tx = tab.querySelector(".nav-txt");
      if (!tx) return;
      if (instant) {
        tx.style.transition = "none";
        tx.style.width = tx.scrollWidth + "px";
        void tx.offsetWidth;          // 强制回流，让免过渡宽度生效
        tx.style.transition = "";
      } else {
        tx.style.width = tx.scrollWidth + "px";
      }
    }
    /* 入场动效：整页跳转到达后，当前项文字弹性展开、胶囊自中心 0 宽弹性撑开至槽位，
       与图标一同呈现“展开”过程（跨页到达不再瞬现）。reduced-motion 直落。 */
    var entranceDone = false, entranceSettled = false;
    function bootEntrance() {
      if (entranceDone || !activeTab) return;
      entranceDone = true;
      setTimeout(function () { entranceSettled = true; }, 560);
      var tab = nav.querySelector(".nav-tab.is-active");
      if (!tab) { placePill(); return; }
      var m = measureFinalTab(activeTab);
      var ntxt = tab.querySelector(".nav-txt");
      if (ntxt) syncActiveTxt(false);                       // 文字随弹性过渡展开
      pill.style.left = m.left + "px";
      pill.style.width = m.width + "px";
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce && pill.animate) {
        var anim = pill.animate([
          { left: (m.left + m.width / 2) + "px", width: "0px", transform: "scaleY(.55)", opacity: "0" },
          { left: m.left + "px", width: m.width + "px", transform: "scaleY(1)", opacity: "1" }
        ], { duration: 520, easing: "cubic-bezier(.3,1.25,.4,1)", fill: "both" });
        anim.finished.then(function () { anim.cancel(); }).catch(function () {});
      } else {
        placePill();
      }
    }
    if (activeTab) {
      requestAnimationFrame(function () { setTimeout(bootEntrance, 50); });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (!entranceDone) { bootEntrance(); return; }
        // 入场已收尾后才做字体就绪的瞬态校正（入场期间校正会打断动画）
        if (entranceSettled) { syncActiveTxt(true); placePill(); }
      });
    }
    window.addEventListener("resize", U.debounce(function () { placePill(); }, 150));

    var right = el("div", "topbar-right");
    if (session && session.loggedIn) {
      var wrap = el("div", "identity-wrap");
      // 注意：不能用 var pill —— 会覆盖闭包里的导航胶囊引用，placePill/slidePillTo 将错操作此按钮
      var idPill = el("button", "identity-pill");
      idPill.type = "button";
      idPill.appendChild(U.avatar(session.avatarEnum));
      idPill.appendChild(el("span", null, "@" + session.nickname));
      var menu = el("div", "identity-menu");

      function menuItem(labelKey, href, danger) {
        var a = el("a", "dropdown-item" + (danger ? " comment-action--danger" : ""));
        a.setAttribute("data-text", labelKey);
        a.href = href || "#";
        menu.appendChild(a);
        return a;
      }
      // 「个人中心」= 第一页面：个人主页动态流（zone.html，按展示 ID 寻址）
      if (session.displayId) menuItem("common.viewProfile", "zone.html?u=" + encodeURIComponent(session.displayId));
      menuItem("common.editProfile", "profile.html");
      menuItem("common.myMessages", "index.html?tab=mine");
      menuItem("common.allMessages", "index.html?tab=all");
      var logoutItem = menuItem("common.logout", "#", true);

      idPill.addEventListener("click", function (e) {
        e.stopPropagation();
        U.closeAllDropdowns();
        menu.classList.toggle("is-open");
      });
      document.addEventListener("click", function () { menu.classList.remove("is-open"); });
      logoutItem.addEventListener("click", function (e) {
        e.preventDefault();
        HMB.api.logout({ csrf: session.csrf }).then(function () {
          U.toast(t("toast.logoutDone"));
          setTimeout(function () { window.location.reload(); }, 400);
        });
      });

      wrap.appendChild(idPill);
      wrap.appendChild(menu);
      right.appendChild(wrap);
    } else {
      var loginBtn = el("a", "login-pill", t("topbar.login"));
      loginBtn.href = "login.html";
      right.appendChild(loginBtn);
    }
    inner.appendChild(right);
    mount.appendChild(inner);

    /* —— 回顶按钮：顶栏完全收起（is-crowded）时右下角弹出，点击线性丝滑回顶 —— */
    var backTop = el("button", "back-top");
    backTop.type = "button";
    backTop.setAttribute("data-text-aria", "topbar.backTop");
    backTop.appendChild(U.icon("up"));
    backTop.addEventListener("click", function () { smoothScrollToTop(); });
    mount.appendChild(backTop);
    HMB.i18n.apply(mount);

    /* —— 下滑挤占收起：banner 顶边上移穿过导航带时按进度写 --crowd(0→1)，
       CSS 三层错峰消费（两翼滑出 → 导航岛收紧 → 岛吸顶露小边），顶栏全程完全透明；
       banner 隐藏（软切换到关于视图）视为无挤占，复位展开态。 —— */
    var banner = document.querySelector(".banner");
    if (banner) {
      var updateCrowd = function () {
        var v;
        if (!banner.offsetWidth) {   // display:none（关于视图激活）→ 无挤占
          v = "0";
        } else {
          var top = banner.getBoundingClientRect().top;   // 静置时 top = 80（顶栏 60 + 外边距 20）
          v = (Math.min(1, Math.max(0, (80 - top) / 80))).toFixed(3);
        }
        // MO 监听全页属性变更，本函数自身也写 style/class —— Chromium 对 classList.toggle
        // 即使值未变也会派发 class 属性变更记录，必须逐项"值变化才写"，
        // 否则"写 → 触发 MO → 再写"会无限自旋饿死微任务队列
        if (mount.style.getPropertyValue("--crowd") !== v) {
          mount.style.setProperty("--crowd", v);
        }
        var crowded = v !== "0" && parseFloat(v) >= 0.98;
        if (crowded !== mount.classList.contains("is-crowded")) {
          mount.classList.toggle("is-crowded", crowded);
        }
        if (!crowded && mount.classList.contains("is-popped")) {
          mount.classList.remove("is-popped");   // 离开完全收起态 → 弹出态复位（视图切换，不播果冻）
          nav.classList.remove("is-retracting");
        }
      };
      window.addEventListener("scroll", function () {
        // 弹出态下再次滚动（进度仍为满）→ 果冻收回小边，回到吸顶待命
        if (mount.classList.contains("is-popped") &&
            parseFloat(mount.style.getPropertyValue("--crowd") || "0") >= 0.98) {
          retractIsland();
        }
        updateCrowd();
      }, { passive: true });
      if (window.MutationObserver) {   // banner 所在视图的显示切换（软切换"关于"）不伴随 scroll，
        new MutationObserver(updateCrowd).observe(document.body, {   // 用 MO 捕获 hidden/class/style 变更
          attributes: true, attributeFilter: ["hidden", "class", "style"], subtree: true,
        });
      }
      updateCrowd();
    }
  }

  /* ================= 榜单卡（9.3 六区） ================= */

  function rankBadge(isNew) {
    if (!isNew) return null;
    var b = el("span", "rank-badge rank-badge--new");
    b.setAttribute("data-text", "board.badgeNew");
    return b;
  }

  /** 变更比例胶囊（移植 biliboard.uk 首页 Gm 组件设计，配色用本站令牌）。
   *  rate 为小数（0.019 = +1.9%）；正数=涨(--up 红) / 负数=跌(--down 绿) / 0=平(--ink-3)。
   *  胶囊带 max-width / opacity / padding 展开动画（CSS .rate-pill）。 */
  function deltaChip(rate) {
    var has = (typeof rate === "number" && isFinite(rate));
    var pct = has ? Math.round(rate * 1000) / 10 : 0;
    var kind = pct > 0 ? "up" : (pct < 0 ? "down" : "flat");
    var txt = has ? (pct > 0 ? "+" : "") + pct.toFixed(1) + "%" : "0%";
    var chip = el("span", "rate-pill rate-pill--" + kind);
    chip.appendChild(el("span", "rate-pill-inner", txt));
    chip.setAttribute("aria-label", t("board.changeRate") + " " + txt);
    return chip;
  }

  /** 峰值栈：标签 + 空心名次数字（单榜“历史最高”与双榜“周榜最高/新帖最高”共用） */
  function peakStack(labelKey, num) {
    var stack = el("div", "peak-stack");
    var label = el("div", "peak-label");
    label.setAttribute("data-text", labelKey);
    stack.appendChild(label);
    var n = el("div", "peak-num" + (num <= 3 && num > 0 ? " peak-num--top" : ""));
    n.textContent = num > 0 ? String(num < 10 ? "0" + num : num) : "0";
    stack.appendChild(n);
    return stack;
  }

  /**
   * ctx: { rank:int|null(当前列表位次；null=无排名显示，我的留言视图),
   *        peakMode:"hot"|"new"|"dual"(峰值区口径), q:搜索词, session, onLike(msg, btn), onOpen(msg) }
   */
  function renderCard(msg, ctx) {
    ctx = ctx || {};
    var card = el("article", "rank-card");
    card.dataset.id = msg.resourceId;

    /* 01 排名区（我的留言视图无排名数字，仅留 NEW 徽章；无内容时不占位） */
    var rankZone = el("div", "rank-zone");
    if (ctx.rank) {
      var rankNum = el("div", "rank-num");
      if (ctx.rank >= 1 && ctx.rank <= 3) rankNum.classList.add("rank-num--" + ctx.rank);
      rankNum.textContent = String(ctx.rank >= 1 && ctx.rank <= 9 ? "0" + ctx.rank : ctx.rank);
      rankZone.appendChild(rankNum);
    }
    var badge = rankBadge(msg.isNew);
    if (badge) rankZone.appendChild(badge);
    if (rankZone.children.length > 0) card.appendChild(rankZone);

    /* 02 头像区 */
    var avZone = el("div", "avatar-zone");
    avZone.appendChild(U.avatar(msg.avatarEnum));
    card.appendChild(avZone);

    /* 03/04 主信息区 + 统计区 */
    var mainZone = el("div", "main-zone");
    var title = el("h3", "card-title");
    // 有选填标题时主标题行显示标题（正文入卡片正文位由详情承载）
    title.appendChild(U.highlightMatch(msg.title || U.richTextToPlain(msg.content), ctx.q));
    title.tabIndex = 0;
    title.setAttribute("role", "link");
    var openFn = function () { if (ctx.onOpen) ctx.onOpen(msg); };
    title.addEventListener("click", openFn);
    title.addEventListener("keydown", function (e) { if (e.key === "Enter") openFn(); });
    mainZone.appendChild(title);

    var meta = el("div", "card-meta");
    function metaSep() { return el("span", "sep", "·"); }
    meta.appendChild(el("span", null, "NO." + msg.no));
    meta.appendChild(metaSep());
    meta.appendChild(el("span", null, "@" + msg.nicknameSnapshot));
    meta.appendChild(metaSep());
    meta.appendChild(el("span", null, U.fmtDate(msg.createdAt)));
    if (msg.topicTag) {
      meta.appendChild(metaSep());
      meta.appendChild(el("span", "topic", "#" + msg.topicTag));
    }
    meta.appendChild(metaSep());
    var vis = el("span", "vis");
    vis.setAttribute("data-text", "common.public");
    meta.appendChild(vis);
    // F6：掩码字段（仅当作者勾选公开开关时非空）
    if (msg.maskedName) { meta.appendChild(metaSep()); meta.appendChild(el("span", null, "姓名 " + msg.maskedName)); }
    if (msg.maskedEmail) { meta.appendChild(metaSep()); meta.appendChild(el("span", null, "邮箱 " + msg.maskedEmail)); }
    if (msg.maskedPhone) { meta.appendChild(metaSep()); meta.appendChild(el("span", null, "手机 " + msg.maskedPhone)); }
    mainZone.appendChild(meta);

    var stats = el("div", "card-stats");
    function stat(iconName, value, extraCls) {
      var s = el("span", "stat" + (extraCls ? " " + extraCls : ""));
      s.appendChild(U.icon(iconName));
      s.appendChild(el("span", null, value));
      return s;
    }
    stats.appendChild(stat("eye", U.fmtViews(msg.stats.views)));
    var likeStat = stat("heart", U.fmtViews(msg.stats.likes), "stat--likebtn");
    likeStat.tabIndex = 0;
    likeStat.setAttribute("role", "button");
    likeStat.setAttribute("aria-label", t("detail.like"));
    if (ctx.session && ctx.session.loggedIn && ctx.likedSet && ctx.likedSet[msg.resourceId]) {
      likeStat.classList.add("is-liked");
    }
    var likeFn = function () { if (ctx.onLike) ctx.onLike(msg, likeStat); };
    likeStat.addEventListener("click", likeFn);
    likeStat.addEventListener("keydown", function (e) { if (e.key === "Enter") likeFn(); });
    stats.appendChild(likeStat);
    stats.appendChild(stat("comment", U.fmtViews(msg.stats.comments)));
    stats.appendChild(stat("star", U.fmtViews(msg.stats.favorites)));
    mainZone.appendChild(stats);
    card.appendChild(mainZone);

    /* 05 热度区（biliboard 首页形制：本周分数 + 变更胶囊 + 折线图）
     * 列①：本周热度标签 + 分数 + 变更比例胶囊；列②：8 期趋势折线图（只画真实数据，缺失为 0） */
    var heatZone = el("div", "heat-zone");
    var heatLabel = el("div", "heat-label");
    heatLabel.setAttribute("data-text", "board.heatLabel");
    heatZone.appendChild(heatLabel);
    var heatVal = el("div", "heat-value");
    heatVal.appendChild(el("span", null, U.fmtHeat(msg.heat)));
    heatVal.appendChild(el("span", "unit", "万"));
    heatZone.appendChild(heatVal);
    heatZone.appendChild(deltaChip(msg.rate));
    card.appendChild(heatZone);

    // 折线图：色值按涨红跌绿（--up / --down / --blue 平），hover 显示各期分数
    var sparkWrap = el("div", "card-spark");
    var sparkColor = msg.rate > 0 ? "var(--up)" : (msg.rate < 0 ? "var(--down)" : "var(--blue)");
    sparkWrap.appendChild(U.renderSparkline(msg.rateHistory || [], {
      width: 88, height: 48, stroke: sparkColor, fill: sparkColor,
      label: "本周热度趋势"
    }));
    // 趋势数值外显：起止两期由真实 weeklyStats 实时折算，缺失期次显示 0
    var trend = msg.rateHistory || [];
    var trendCaption = el("span", "sparkline-caption");
    trendCaption.setAttribute("title", "近8期热度走向（首期→本期）");
    trendCaption.style.color = sparkColor;
    trendCaption.textContent = t("board.trendRange", {
      a: U.fmtHeat(trend.length ? trend[0].value : 0),
      b: U.fmtHeat(trend.length ? trend[trend.length - 1].value : 0)
    });
    sparkWrap.appendChild(trendCaption);
    card.appendChild(sparkWrap);

    /* 06 最高区：单榜显示本榜历史最高；双榜（我的留言）并排显示周榜/新帖两榜历史最高。
     * 没有数据时显示 0，不做任何推导赋值。 */
    var peakZone = el("div", "peak-zone" + (ctx.peakMode === "dual" ? " peak-zone--dual" : ""));
    if (ctx.peakMode === "dual") {
      peakZone.appendChild(peakStack("board.peakHot", msg.peakRank));
      peakZone.appendChild(peakStack("board.peakNew", msg.peakNewRank || 0));
    } else {
      peakZone.appendChild(peakStack("board.rankLabel",
        ctx.peakMode === "new" ? (msg.peakNewRank || 0) : msg.peakRank));
    }
    card.appendChild(peakZone);

    HMB.i18n.apply(card);
    return card;
  }

  /* ================= 骨架屏 ================= */

  function renderSkeleton(container, count) {
    container.textContent = "";
    for (var i = 0; i < (count || 6); i++) {
      var c = el("div", "skeleton-card");
      c.appendChild(el("div", "skeleton-block sk-rank"));
      c.appendChild(el("div", "skeleton-block sk-avatar"));
      var lines = el("div", "sk-lines");
      lines.appendChild(el("div", "skeleton-block sk-line-a"));
      lines.appendChild(el("div", "skeleton-block sk-line-b"));
      c.appendChild(lines);
      c.appendChild(el("div", "skeleton-block sk-heat"));
      c.appendChild(el("div", "skeleton-block sk-peak"));
      container.appendChild(c);
    }
    HMB.hooks._skeletonShow();
  }

  /* ================= 四态（空 / 错误 / 无权限） ================= */

  /** spec: {emoji, titleKey, descKey, btnKey, onBtn, btnCls} */
  function renderStateBox(container, spec) {
    container.textContent = "";
    var box = el("div", "state-box");
    if (spec.emoji) box.appendChild(el("div", "state-emoji", spec.emoji));
    box.appendChild(el("div", "state-title"));
    box.appendChild(el("div", "state-desc"));
    box.querySelector(".state-title").setAttribute("data-text", spec.titleKey);
    box.querySelector(".state-desc").setAttribute("data-text", spec.descKey);
    if (spec.btnKey) {
      var btn = el("button", "btn " + (spec.btnCls || "btn--primary"));
      btn.type = "button";
      btn.setAttribute("data-text", spec.btnKey);
      btn.setAttribute("data-scramble", "");   // 重试 / 去登录 / 去发布：hover 乱码解码
      btn.addEventListener("click", function () { if (spec.onBtn) spec.onBtn(); });
      box.appendChild(btn);
    }
    container.appendChild(box);
    HMB.i18n.apply(box);
    return box;
  }

  /* ================= 评论树（F7 二级树状） ================= */

  /**
   * ctx: { session, onLike(c, btn), onReply(c), onEdit(c), onDelete(c) }
   */
  function renderCommentTree(container, tree, ctx) {
    container.textContent = "";
    if (!tree || tree.length === 0) {
      renderStateBox(container, {
        emoji: "💬",
        titleKey: "detail.emptyTitle",
        descKey: "detail.emptyDesc"
      });
      return;
    }

    tree.forEach(function (c) {
      container.appendChild(commentNode(c, ctx, false));
      if (c.replies && c.replies.length) {
        c.replies.forEach(function (r) {
          container.appendChild(commentNode(r, ctx, true));
        });
      }
    });
    HMB.i18n.apply(container);
  }

  function commentNode(c, ctx, isReply) {
    var node = el("div", (isReply ? "reply-item comment-item" : "comment-item") +
      (c.isAnonymous ? " is-anon-reply" : ""));
    node.dataset.id = c.resourceId;

    var head = el("div", "comment-head");
    var av = U.avatar(c.authorAvatar, "avatar--sm");
    av.style.width = "26px"; av.style.height = "26px"; av.style.fontSize = "14px"; av.style.borderRadius = "50%";
    head.appendChild(av);
    head.appendChild(el("span", "comment-author" + (c.isAnonymous ? " is-anon" : ""), c.authorName));
    if (c.isAnonymous) {
      head.appendChild(el("span", "rank-badge rank-badge--flat", t("detail.anonTag")));
    }
    if (isReply && (c.atDisplayId || c.atAuthorName)) {
      head.appendChild(el("span", "comment-at", "回复 @" + (c.atAuthorName || c.atDisplayId)));
    } else if (c.atDisplayId) {
      head.appendChild(el("span", "comment-at", "@" + c.atDisplayId));
    }
    head.appendChild(el("span", "comment-time", U.timeAgo(c.createdAt)));
    if (c.edited) head.appendChild(el("span", "edited-mark", t("common.edited")));

    /* 属主操作（仅作者渲染，P-08 前置） */
    if (c.isMine) {
      var editBtn = el("button", "comment-action");
      editBtn.type = "button";
      editBtn.setAttribute("data-text", "detail.edit");
      editBtn.addEventListener("click", function () { if (ctx.onEdit) ctx.onEdit(c); });
      head.appendChild(editBtn);
      var delBtn = el("button", "comment-action comment-action--danger");
      delBtn.type = "button";
      delBtn.setAttribute("data-text", "detail.delete");
      delBtn.addEventListener("click", function () { if (ctx.onDelete) ctx.onDelete(c); });
      head.appendChild(delBtn);
    }

    /* 回复入口 + 点赞 */
    if (ctx.onReply && !c.isAnonymous) {
      var replyBtn = el("button", "comment-action");
      replyBtn.type = "button";
      replyBtn.setAttribute("data-text", "detail.reply");
      replyBtn.addEventListener("click", function () { if (ctx.onReply) ctx.onReply(c); });
      head.appendChild(replyBtn);
    }
    var likeBtn = el("span", "comment-like comment-like-btn" + (c.isLiked ? " is-liked" : ""));
    likeBtn.appendChild(U.icon("heart"));
    likeBtn.appendChild(el("span", null, String(c.likes)));
    likeBtn.tabIndex = 0;
    likeBtn.setAttribute("role", "button");
    likeBtn.setAttribute("aria-label", t("detail.like"));
    likeBtn.addEventListener("click", function () { if (ctx.onLike) ctx.onLike(c, likeBtn); });
    head.appendChild(likeBtn);
    node.appendChild(head);

    var content = el("div", "comment-content");
    content.appendChild(U.highlightMatch(c.content, ctx.q || ""));
    node.appendChild(content);
    return node;
  }

  /* ================= 登录引导弹窗（401 → 引导，登录后回原位） ================= */

  function saveReturnPoint(extra) {
    try {
      window.sessionStorage.setItem("hmb_return", JSON.stringify({
        href: window.location.href,
        scrollY: window.scrollY,
        extra: extra || null
      }));
    } catch (e) { /* noop */ }
  }

  function consumeReturnPoint() {
    try {
      var raw = window.sessionStorage.getItem("hmb_return");
      if (!raw) return null;
      window.sessionStorage.removeItem("hmb_return");
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function openGuideModal(source) {
    saveReturnPoint(source ? { source: source } : null);
    var content = el("div", "guide-modal-inner");
    var box = el("div", "guide-modal");
    content.appendChild(el("div", "state-emoji", "🔒"));
    var title = el("h3", "modal-title");
    title.setAttribute("data-text", "guide.title");
    content.appendChild(title);
    var desc = el("p", "modal-sub");
    desc.setAttribute("data-text", "guide.desc");
    content.appendChild(desc);
    var actions = el("div", "modal-actions");
    var goBtn = el("button", "btn btn--primary");
    goBtn.type = "button";
    goBtn.setAttribute("data-text", "guide.btn");
    goBtn.setAttribute("data-scramble", "");   // 去登录：hover 乱码解码
    goBtn.addEventListener("click", function () {
      window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    });
    var cancelBtn = el("button", "btn btn--ghost");
    cancelBtn.type = "button";
    cancelBtn.setAttribute("data-text", "common.cancel");
    cancelBtn.addEventListener("click", function () { modal.close(); });
    actions.appendChild(goBtn);
    actions.appendChild(cancelBtn);
    content.appendChild(actions);
    box.appendChild(content);
    HMB.i18n.apply(content);
    var modal = U.openModal(box, { modalCls: "guide-modal" });
    return modal;
  }

  /* ================= 改删确认弹窗（P-08） ================= */

  function openConfirmModal(opts) {
    // opts: {titleKey, warnKey, preview, note, onConfirm}
    var content = el("div");
    var title = el("h3", "modal-title");
    title.setAttribute("data-text", opts.titleKey);
    content.appendChild(title);
    var warn = el("div", "hint-bar hint-bar--danger");
    warn.setAttribute("data-text", opts.warnKey);
    content.appendChild(warn);
    if (opts.preview) {
      var pv = el("div", "confirm-preview");
      pv.appendChild(el("span", null, t("confirm.previewLabel") + "  "));
      pv.appendChild(el("b", null, opts.preview));
      content.appendChild(pv);
    }
    var actions = el("div", "confirm-actions");
    var cancelBtn = el("button", "btn btn--ghost");
    cancelBtn.type = "button";
    cancelBtn.setAttribute("data-text", "confirm.cancel");
    cancelBtn.addEventListener("click", function () { modal.close(); });
    var okBtn = el("button", "btn btn--danger");
    okBtn.type = "button";
    okBtn.setAttribute("data-text", "confirm.deleteBtn");
    okBtn.addEventListener("click", function () {
      modal.close();
      if (opts.onConfirm) opts.onConfirm();
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    content.appendChild(actions);
    if (opts.note) {
      content.appendChild(el("div", "confirm-note", opts.note));
    }
    HMB.i18n.apply(content);
    var modal = U.openModal(content, { modalCls: "confirm-modal" });
    return modal;
  }

  /* ================= 编辑弹窗（复用 P-08 弹窗形制） ================= */

  function openEditModal(opts) {
    // opts: {initial, onSave(content), warnKey?}
    var content = el("div");
    var title = el("h3", "modal-title");
    title.setAttribute("data-text", "edit.title");
    content.appendChild(title);
    if (opts.warnKey) {
      var warn = el("div", "hint-bar hint-bar--info");
      warn.setAttribute("data-text", opts.warnKey);
      content.appendChild(warn);
    }
    var ta = el("textarea", "post-textarea");
    ta.value = opts.initial || "";
    ta.maxLength = 500;
    content.appendChild(ta);
    var failBar = el("div", "hint-bar hint-bar--danger hint-bar--hidden post-fail-bar");
    content.appendChild(failBar);
    var actions = el("div", "confirm-actions");
    var cancelBtn = el("button", "btn btn--ghost");
    cancelBtn.type = "button";
    cancelBtn.setAttribute("data-text", "common.cancel");
    cancelBtn.addEventListener("click", function () { modal.close(); });
    var saveBtn = el("button", "btn btn--primary");
    saveBtn.type = "button";
    saveBtn.setAttribute("data-text", "edit.save");
    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true;
      saveBtn.textContent = t("common.submitting");
      opts.onSave(ta.value, function (resp) {
        saveBtn.disabled = false;
        saveBtn.setAttribute("data-text", "edit.save");
        saveBtn.textContent = t("edit.save");
        if (resp && resp.success) modal.close();
        else {
          failBar.textContent = resp ? resp.message : t("error.network");
          failBar.classList.remove("hint-bar--hidden");
        }
      });
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    content.appendChild(actions);
    HMB.i18n.apply(content);
    var modal = U.openModal(content, { modalCls: "edit-modal" });
    setTimeout(function () { ta.focus(); }, 240);
    return modal;
  }

  /* ================= 盲盒弹窗（P-07，F9） ================= */

  function openBlindboxModal(session) {
    var content = el("div");
    var title = el("h3", "modal-title");
    title.setAttribute("data-text", "blindbox.title");
    content.appendChild(title);
    var sub = el("p", "modal-sub");
    sub.setAttribute("data-text", "blindbox.subtitle");
    content.appendChild(sub);

    var drawBtn = el("button", "btn btn--accent");
    drawBtn.type = "button";
    drawBtn.setAttribute("data-text", "blindbox.draw");
    content.appendChild(drawBtn);

    var drawArea = el("div", "blindbox-draw-card");
    drawArea.style.display = "none";
    content.appendChild(drawArea);

    var replyArea = el("div");
    replyArea.style.display = "none";
    var replyLabel = el("div", "reply-label");
    replyLabel.setAttribute("data-text", "blindbox.replyLabel");
    replyArea.appendChild(replyLabel);
    var ta = el("textarea", "post-textarea");
    ta.style.minHeight = "110px";
    ta.setAttribute("data-text-placeholder", "blindbox.replyPlaceholder");
    replyArea.appendChild(ta);
    var failBar = el("div", "hint-bar hint-bar--danger hint-bar--hidden post-fail-bar");
    failBar.setAttribute("data-text", "blindbox.replyFailNote");
    replyArea.appendChild(failBar);
    var sendRow = el("div", "confirm-actions");
    sendRow.style.justifyContent = "flex-start";
    var sendBtn = el("button", "btn btn--primary");
    sendBtn.type = "button";
    sendBtn.setAttribute("data-text", "blindbox.replySubmit");
    sendRow.appendChild(sendBtn);
    replyArea.appendChild(sendRow);
    content.appendChild(replyArea);

    HMB.i18n.apply(content);

    var modal = U.openModal(content, { modalCls: "blindbox-modal" });
    var current = null;

    drawBtn.addEventListener("click", function () {
      drawBtn.disabled = true;
      drawBtn.textContent = t("blindbox.drawing");
      HMB.api.getBlindbox().then(function (resp) {
        drawBtn.disabled = false;
        drawBtn.setAttribute("data-text", "blindbox.draw");
        drawBtn.textContent = t("blindbox.draw");
        if (!resp.success) {
          if (resp.code === 401) { modal.close(); openGuideModal("blindbox"); return; }
          U.toast(resp.message, "error");
          return;
        }
        if (!resp.data.message) {
          drawArea.textContent = "";
          HMB.components.renderStateBox(drawArea, {
            emoji: "📦",
            titleKey: "blindbox.emptyTitle",
            descKey: "blindbox.emptyDesc",
            btnKey: "common.backHome",
            onBtn: function () { window.location.href = "index.html"; }
          });
          drawArea.style.display = "block";
          replyArea.style.display = "none";
          return;
        }
        current = resp.data.message;
        drawArea.textContent = "";
        drawArea.appendChild(el("div", "drawn-label", t("blindbox.drawnLabel")));
        var drawn = el("div", "drawn-content rich-content");
        drawn.appendChild(U.renderRich(current.content, ""));
        drawArea.appendChild(drawn);
        drawArea.appendChild(el("div", "drawn-meta",
          t("blindbox.drawnMeta", { name: current.authorNickname })));
        drawArea.style.display = "block";
        replyArea.style.display = "block";
        ta.value = "";
        failBar.classList.add("hint-bar--hidden");
        HMB.i18n.apply(drawArea);
      });
    });

    sendBtn.addEventListener("click", function () {
      if (!current) return;
      sendBtn.disabled = true;
      sendBtn.textContent = t("common.submitting");
      HMB.api.blindboxReply({
        messageId: current.resourceId,
        content: ta.value,
        csrf: session.csrf
      }).then(function (resp) {
        sendBtn.disabled = false;
        sendBtn.setAttribute("data-text", "blindbox.replySubmit");
        sendBtn.textContent = t("blindbox.replySubmit");
        if (resp.success) {
          modal.close();
          U.toast(t("blindbox.successToast"), "success");
          // 匿名回复出现在目标留言的评论区；提供跳转
          setTimeout(function () {
            window.location.href = "detail.html?id=" + encodeURIComponent(current.resourceId);
          }, 500);
        } else if (resp.code === 401) {
          modal.close();
          openGuideModal("blindbox");
        } else {
          // 4001 敏感词 / 4002 限流 / 9002 CSRF：就地提示，保留输入（F10/F5）
          failBar.textContent = resp.message + (resp.code === 4002 ? "" : "（" + t("blindbox.replyFailNote") + "）");
          failBar.classList.remove("hint-bar--hidden");
        }
      });
    });

    return modal;
  }

  /* ---------------- 汇出 ---------------- */

  HMB.components = {
    renderTopbar: renderTopbar,
    renderCard: renderCard,
    renderSkeleton: renderSkeleton,
    renderStateBox: renderStateBox,
    renderCommentTree: renderCommentTree,
    openGuideModal: openGuideModal,
    saveReturnPoint: saveReturnPoint,
    consumeReturnPoint: consumeReturnPoint,
    openConfirmModal: openConfirmModal,
    openEditModal: openEditModal,
    openBlindboxModal: openBlindboxModal
  };
})(window, document);
