/* ============================================================
 * 留言板 · 关于页（Page 1 画布 09 × biliboard.uk/about 源码复刻）
 * 布局/参数逐值取自参考站编译产物（AboutContent 组件 + index.css）：
 *   - 14 个气泡：4 个信息气泡（hero #47474C / 其余 #D2D1D6）+ 10 个装饰气泡
 *   - 卡片 rounded-2xl + border-white/10 + 底部椭圆虚影 + 30×15 左下尾巴
 *   - idle 态：translate3d(x,y,z) + rotateY 倾斜 + scale + 鼠标视差
 *   - 激活态：气泡居中展开至 #fbfbfd 面板，其余气泡 blur(1.5px) 后推
 *   - 漂浮：bubble-float（每气泡随机振幅/时长/负延迟，hover 暂停）
 *   - 噪点：feTurbulence SVG 平铺 + grain 8s steps(10) 抖动，multiply
 *   - 水印：顶部水平镜像（scaleX(-1)），底部正向，12px neutral-400/60
 * 红线保持：角色立绘 → 8 选 1 emoji 白名单头像（brightness(0.3) 剪影，
 *   深色气泡 invert(1) brightness(2)）；文案本地化为留言板语义。
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var el = U.el;
  var t = function (k, p) { return HMB.i18n.t(k, p); };

  /* 气泡规格表：top/left/z/rotateY/scale/尺寸与参考站 O1 数组逐值一致。
     deco.iconSize 为头像占气泡高度的百分比（对应参考站 iconConfig.size）。 */
  var GRAY = "#D2D1D6", DARK = "#47474C";
  var BUBBLES = [
    { id: "hero",  kind: "hero",  top: "50%", left: "50%", z: 0,   ry: 0,   sc: 1,    w: 215, h: 115, bg: DARK, dark: true, icon: "comment", title: "about.bubbleIntro", sub: "ABOUT", aw: "min(85vw,480px)", ah: "min(360px,calc(100vh - 200px))", panel: "hero" },
    { id: "works", kind: "main",  top: "51%", left: "15%", z: 50,  ry: 20,  sc: 0.95, w: 260, h: 130, bg: GRAY, icon: "play", title: "about.bubbleWorks", sub: "WORKS", aw: "min(92vw,680px)", ah: "min(520px,calc(100vh - 200px))", panel: "works" },
    { id: "team",  kind: "main",  top: "62%", left: "76%", z: 50,  ry: -15, sc: 0.9,  w: 295, h: 160, bg: GRAY, icon: "users", title: "about.bubbleTeam", sub: "TEAM", aw: "min(90vw,480px)", ah: "min(400px,calc(100vh - 200px))", panel: "team" },
    { id: "links", kind: "main",  top: "39%", left: "67%", z: -5,  ry: -20, sc: 1,    w: 155, h: 90,  bg: GRAY, icon: "link2", title: "about.bubbleLinks", sub: "LINKS", aw: "min(90vw,420px)", ah: "min(280px,calc(100vh - 200px))", panel: "links" },
    // 装饰气泡（不触发）：内容 = 星座星象图剪影（同原 emoji 的 ghost 处理），
    // 装扮色 = 最初配色（浅卡 GRAY / 深卡 DARK），星象图剪影与底色解耦
    { id: "deco-1",  kind: "deco", top: "40%", left: "48%", z: -10, ry: 2,   sc: 1,    w: 180, h: 100, bg: GRAY, zodiac: "aries" },
    { id: "deco-2",  kind: "deco", top: "38%", left: "39%", z: -15, ry: 7,   sc: 1,    w: 180, h: 110, bg: GRAY, zodiac: "taurus" },
    { id: "deco-3",  kind: "deco", top: "44%", left: "88%", z: 20,  ry: -30, sc: 0.755, w: 290, h: 135, bg: GRAY, zodiac: "gemini" },
    { id: "deco-4",  kind: "deco", top: "44%", left: "79%", z: -45, ry: -20, sc: 1,    w: 175, h: 85,  bg: DARK, zodiac: "cancer", dark: true },
    { id: "deco-5",  kind: "deco", top: "43%", left: "98%", z: 150, ry: -40, sc: 1,    w: 200, h: 150, bg: DARK, zodiac: "leo", dark: true },
    { id: "deco-6",  kind: "deco", top: "58%", left: "63%", z: -5,  ry: -5,  sc: 1,    w: 140, h: 85,  bg: GRAY, zodiac: "virgo" },
    { id: "deco-7",  kind: "deco", top: "47%", left: "20%", z: -5,  ry: 20,  sc: 1,    w: 220, h: 105, bg: GRAY, zodiac: "libra" },
    { id: "deco-8",  kind: "deco", top: "44%", left: "16%", z: -10, ry: 30,  sc: 1,    w: 180, h: 100, bg: GRAY, zodiac: "scorpio" },
    { id: "deco-9",  kind: "deco", top: "33%", left: "1%",  z: -15, ry: 40,  sc: 1,    w: 280, h: 200, bg: DARK, zodiac: "sagittarius", dark: true },
    { id: "deco-10", kind: "deco", top: "56%", left: "-4%", z: -15, ry: 50,  sc: 0.9,  w: 150, h: 110, bg: GRAY, zodiac: "capricorn" }
  ];

  /* 星座简化星象图（viewBox 0 0 100 60）：星点坐标 + 连线；
     图形只用中性色，最终由卡片 ghost 滤镜统一成剪影（与装扮色解耦） */
  var ZODIAC = {
    aries:       { stars: [[18, 42], [32, 28], [48, 20], [64, 24], [76, 34]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    taurus:      { stars: [[20, 12], [34, 26], [50, 44], [66, 26], [80, 12]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    gemini:      { stars: [[32, 12], [32, 28], [32, 44], [68, 12], [68, 28], [68, 44]], lines: [[0, 1], [1, 2], [3, 4], [4, 5], [1, 4]] },
    cancer:      { stars: [[50, 12], [50, 30], [34, 46], [66, 46]], lines: [[0, 1], [1, 2], [1, 3]] },
    leo:         { stars: [[22, 16], [28, 30], [42, 38], [58, 36], [70, 28], [80, 42]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
    virgo:       { stars: [[16, 20], [32, 26], [44, 42], [60, 32], [76, 44], [86, 26]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
    libra:       { stars: [[34, 40], [50, 18], [66, 40], [26, 50], [74, 50]], lines: [[0, 1], [1, 2], [0, 3], [2, 4]] },
    scorpio:     { stars: [[16, 16], [28, 12], [38, 20], [52, 30], [62, 40], [60, 50], [48, 54]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
    sagittarius: { stars: [[26, 42], [40, 32], [54, 36], [68, 24], [84, 16]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 3]] },
    capricorn:   { stars: [[14, 22], [28, 36], [48, 44], [68, 36], [86, 18]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] }
  };
  var SVGNS = "http://www.w3.org/2000/svg";

  /* 星象图 SVG：背景碎星（确定性散布）+ 星座连线 + 主星（金色）+ 一般星（星光白） */
  function zodiacSvg(sign, idx) {
    var d = ZODIAC[sign];
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "zodiac-svg");
    svg.setAttribute("viewBox", "0 0 100 60");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var i, c;
    for (i = 0; i < 6; i++) {
      c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("class", "zodiac-ministar");
      c.setAttribute("cx", String(((idx + 1) * 37 + i * 53) % 100));
      c.setAttribute("cy", String(((idx + 2) * 23 + i * 31) % 60));
      c.setAttribute("r", String(0.5 + (i % 3) * 0.25));
      svg.appendChild(c);
    }
    d.lines.forEach(function (pair) {
      var ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("class", "zodiac-line");
      ln.setAttribute("x1", String(d.stars[pair[0]][0]));
      ln.setAttribute("y1", String(d.stars[pair[0]][1]));
      ln.setAttribute("x2", String(d.stars[pair[1]][0]));
      ln.setAttribute("y2", String(d.stars[pair[1]][1]));
      svg.appendChild(ln);
    });
    d.stars.forEach(function (s, si) {
      var glow = document.createElementNS(SVGNS, "circle");
      glow.setAttribute("class", "zodiac-star-glow");
      glow.setAttribute("cx", String(s[0]));
      glow.setAttribute("cy", String(s[1]));
      glow.setAttribute("r", String(si === 0 ? 3.4 : 2.6));
      svg.appendChild(glow);
      var core = document.createElementNS(SVGNS, "circle");
      core.setAttribute("class", si === 0 ? "zodiac-star-main" : "zodiac-star-core");
      core.setAttribute("cx", String(s[0]));
      core.setAttribute("cy", String(s[1]));
      core.setAttribute("r", String(si === 0 ? 1.9 : 1.4));
      svg.appendChild(core);
    });
    return svg;
  }

  /* 每气泡漂浮参数：参考站按 id 字符码取模（delay -0~4s，振幅 8~13px，时长 5~8s） */
  function floatParams(id) {
    var sum = 0, i;
    for (i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return { delay: "-" + (sum % 5) + "s", amp: 8 + (sum % 6), dur: 5 + (sum % 4) };
  }

  var scene, space;
  var activeId = null;
  var activePlaque = null;   // 当前展开卡标题牌（BB.createPlaque 实例）
  var isMobile = false;
  var outCloseHandler = null;

  /* ---------- 激活面板内容（本地化：留言板语义） ---------- */
  function chipRow(href, key) {
    var a = el("a", "hero-chip", t(key));
    a.href = href;
    if (href.indexOf("http") === 0) { a.target = "_blank"; a.rel = "noopener"; }
    return a;
  }

  /* 友情链接（显示形式照搬参考站：两列网格 + hover 行，名称左 / 外链箭头右） */
  var LINKS = [
    { name: "GitHub 仓库", url: "https://github.com/anker147/Hiu-2026-Message-Board-Frontend" },
    { name: "Biliboard 参考站", url: "https://biliboard.uk/" },
    { name: "Stella 状态秩序参考", url: "https://github.com/" }
  ];

  var PANELS = {
    hero: function (box) {
      var brand = el("div", "hero-brand");
      brand.appendChild(el("div", "hero-logo", "Board"));
      var nameCol = el("div", null);
      nameCol.appendChild(el("div", "hero-name", "留言板"));
      nameCol.appendChild(el("div", "hero-tag", t("about.heroTag")));
      brand.appendChild(nameCol);
      box.appendChild(brand);
      box.appendChild(el("p", "about-modal-body", t("about.introBody")));
      var chips = el("div", "hero-chips");
      chips.appendChild(chipRow("edit.html?mode=new", "about.chipPost"));
      chips.appendChild(chipRow("https://github.com/anker147/Hiu-2026-Message-Board-Frontend", "about.chipRepo"));
      box.appendChild(chips);
    },
    works: function (box) {
      box.appendChild(el("p", "about-modal-body", t("about.worksBody")));
      var ul = el("ul", "about-modal-list");
      ["about.worksItem1", "about.worksItem2", "about.worksItem3"].forEach(function (k) {
        ul.appendChild(el("li", null, t(k)));
      });
      box.appendChild(ul);
    },
    team: function (box) {
      box.appendChild(el("p", "about-modal-body", t("about.teamBody")));
      var ul = el("ul", "about-modal-list");
      ["about.teamItem1", "about.teamItem2", "about.teamItem3", "about.teamItem4", "about.teamItem5"].forEach(function (k) {
        ul.appendChild(el("li", null, t(k)));
      });
      box.appendChild(ul);
    },
    links: function (box) {
      var grid = el("div", "link-grid");
      LINKS.forEach(function (o) {
        var a = el("a", "link-item");
        a.href = o.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.appendChild(el("span", "link-name", o.name));
        var ic = el("span", "link-arrow");
        ic.appendChild(U.icon("link2"));
        a.appendChild(ic);
        grid.appendChild(a);
      });
      box.appendChild(grid);
      box.appendChild(el("p", "about-modal-note", t("about.linksNote")));
    }
  };

  /* ---------- 移动端：弹窗展开（参考站移动端为列表视图，此处保持可用性） ---------- */
  function openMobileModal(key) {
    var box = el("div", "about-modal");
    var b = null;
    BUBBLES.forEach(function (x) { if (x.panel === key) b = x; });
    if (b) box.appendChild(el("h3", "about-modal-title", t(b.title)));
    PANELS[key](box);
    U.openModal(box, { modalCls: "modal--about" });
  }

  /* ---------- 展开卡标题栏：照搬 biliboard.uk/about 编译产物（AboutContent 分包） ----------
     逐行移植 ia（双行文字牌组件）与其依赖 Ae/n0/qt/pe/de/br/xr/N1/B1/E1/C1/I1/R1/yr/Oe/Le/wr，
     仅将 React refs/useState 换成等价 DOM 对象；t0 常量、状态机（phase 0-6）、
     clip-path 擦入、每帧并集描边重算的逻辑与数值保持原实现。
     结构：上行大字（12×1.8=21.6px）+ 底行悬挂于顶行右下（top-full right-0，
     marginTop:-24px(OVERLAP_Y)、left:100%、marginLeft:-9px(OVERLAP_X-BORDER)）向右探出；
     每行 base/reveal 双层 TextBox，擦入为 L→R 的 clip-path inset；
     描边 = 各擦入子矩形外扩半线宽后的并集外轮廓（网格追踪 I1），rAF 每帧重算；
     编排：0(复位+100ms)→1 顶行擦入→2 底行擦入→读 1500ms→3 顶行擦出+新层擦入→4 提升
     →5 底行擦出+新层擦入→6 提升→3 循环。 */
  var BB = (function () {
    var t0 = { WIPE_DURATION: 1200, READ_DELAY: 1500, OVERLAP_RATIO: 0.2, OVERLAP_X: 10, OVERLAP_Y: 24, BORDER_WIDTH: 1, BASE_FONT_SIZE: 12, TOP_FONT_SCALE: 1.8 };
    var m0 = { HIDDEN_LEFT: "HIDDEN_LEFT", ENTERING: "ENTERING", VISIBLE: "VISIBLE", EXITING: "EXITING", HIDDEN_RIGHT: "HIDDEN_RIGHT" };
    function n0(r) { return Math.round(r * 1e3) / 1e3; }
    function qt(r) { return Math.min(1, Math.max(0, r)); }
    function pe(r) { return !!r && r.right > r.left && r.bottom > r.top; }
    function de(r) { return n0(r.x) + "," + n0(r.y); }
    function br(r, e) { var t = de(r), a = de(e); return t < a ? t + "|" + a : a + "|" + t; }
    function xr(r) { return Array.from(new Set(r.map(n0))).sort(function (a, b) { return a - b; }); }
    function N1(r, e, t) { return r >= t.left && r <= t.right && e >= t.top && e <= t.bottom; }
    function B1(r, e) { return { left: n0(r.left - e), top: n0(r.top - e), right: n0(r.right + e), bottom: n0(r.bottom + e) }; }
    function E1(r) {
      if (r.length <= 2) return r;
      var e = function (a, n, i) {
        var o = Math.abs(a.x - n.x) < 1e-6 && Math.abs(n.x - i.x) < 1e-6,
            u = Math.abs(a.y - n.y) < 1e-6 && Math.abs(n.y - i.y) < 1e-6;
        return o || u;
      }, t = [];
      for (var a = 0; a < r.length; a++) {
        var n = r[(a - 1 + r.length) % r.length], i = r[a], o = r[(a + 1) % r.length];
        if (!e(n, i, o)) t.push(i);
      }
      return t;
    }
    function C1(r) {
      return r.filter(function (e) { return e.length >= 3; }).map(function (e) {
        var t = e[0], a = e.slice(1),
            n = "M " + t.x + " " + t.y,
            i = a.map(function (o) { return "L " + o.x + " " + o.y; }).join(" ");
        return n + " " + i + " Z";
      }).join(" ");
    }
    function I1(r) {
      var e = r.filter(pe);
      if (e.length === 0) return "";
      var t = xr(e.flatMap(function (f) { return [f.left, f.right]; })),
          a = xr(e.flatMap(function (f) { return [f.top, f.bottom]; }));
      if (t.length < 2 || a.length < 2) return "";
      var n = Array.from({ length: t.length - 1 }, function () { return Array.from({ length: a.length - 1 }, function () { return !1; }); });
      for (var f = 0; f < t.length - 1; f++) {
        var b = t[f], y = t[f + 1], x = (b + y) / 2;
        for (var k = 0; k < a.length - 1; k++) {
          var S = a[k], z = a[k + 1], T = (S + z) / 2;
          n[f][k] = e.some(function (E) { return N1(x, T, E); });
        }
      }
      var i = new Map, o = new Map;
      var u = function (f, b) {
        var y = { x: n0(f.x), y: n0(f.y) }, x = { x: n0(b.x), y: n0(b.y) },
            k = de(y), S = de(x);
        i.set(k, y); i.set(S, x);
        var z = o.get(k) || []; z.push(x); o.set(k, z);
        var T = o.get(S) || []; T.push(y); o.set(S, T);
      };
      for (var f2 = 0; f2 < t.length - 1; f2++) for (var b2 = 0; b2 < a.length - 1; b2++) {
        if (!n[f2][b2]) continue;
        var y2 = t[f2], x2 = t[f2 + 1], k2 = a[b2], S2 = a[b2 + 1],
            z2 = f2 === 0 || !n[f2 - 1][b2],
            T2 = f2 === t.length - 2 || !n[f2 + 1][b2],
            E2 = b2 === 0 || !n[f2][b2 - 1],
            q2 = b2 === a.length - 2 || !n[f2][b2 + 1];
        if (z2) u({ x: y2, y: k2 }, { x: y2, y: S2 });
        if (T2) u({ x: x2, y: k2 }, { x: x2, y: S2 });
        if (E2) u({ x: y2, y: k2 }, { x: x2, y: k2 });
        if (q2) u({ x: y2, y: S2 }, { x: x2, y: S2 });
      }
      var h = new Set, d = [];
      o.forEach(function (b3, f3) {
        b3.forEach(function (y3) {
          var x3 = i.get(f3);
          if (!x3) return;
          var k3 = br(x3, y3);
          if (h.has(k3)) return;
          var S3 = [x3], z3 = f3, T3 = null;
          for (;;) {
            var E3 = i.get(z3);
            if (!E3) break;
            var q3 = o.get(z3) || [],
                H3 = T3 === null ? q3[0] : (q3.find(function (P) { return de(P) !== T3; }) || q3[0]);
            h.add(br(E3, H3));
            T3 = z3; z3 = de(H3);
            if (z3 === f3) break;
            var j3 = i.get(z3);
            if (!j3) break;
            S3.push(j3);
          }
          d.push(E1(S3));
        });
      });
      return C1(d);
    }
    function R1(r) {
      var e = function (i) { return 1 / (1 + Math.exp(-i)); },
          t = e(-r / 2), n = e(r / 2) - t;
      return function (i) {
        var u = (qt(i) - 0.5) * r;
        return (e(u) - t) / n;
      };
    }
    var yr = R1(10);
    function Oe(r, e, t) {
      if (!pe(r)) return "inset(0px)";
      var a = r.right - r.left;
      if (a <= 0) return "inset(0px)";
      var n = function (u) { return Math.max(0, Math.min(a, u)); };
      if (!pe(e)) {
        var u = t === "EXITING" || t === "HIDDEN_RIGHT", h = u ? a : 0;
        return "inset(0px " + n0(u ? 0 : a) + "px 0px " + n0(h) + "px)";
      }
      var i = n(e.left - r.left), o = n(r.right - e.right);
      return "inset(0px " + n0(o) + "px 0px " + n0(i) + "px)";
    }
    function Le(r, e, t, a, n) {
      if (!pe(r)) return null;
      var i = r.right - r.left, o = 0, u = 0;
      switch (e) {
        case "HIDDEN_LEFT": u = 1; break;
        case "ENTERING": { var b = a === null ? 1 : qt((t - a) / n); u = 1 - yr(b); break; }
        case "VISIBLE": break;
        case "EXITING": { var b2 = a === null ? 1 : qt((t - a) / n); o = yr(b2); break; }
        case "HIDDEN_RIGHT": o = 1; break;
      }
      var h = r.left + i * o, d = r.right - i * u,
          f = { left: n0(h), top: n0(r.top), right: n0(d), bottom: n0(r.bottom) };
      return pe(f) ? f : null;
    }
    function wr(r, e) {
      var t = 0, a = 0, n = e;
      for (; n && n !== r;) { t += n.offsetLeft; a += n.offsetTop; n = n.offsetParent; }
      return n ? { left: n0(t), top: n0(a), right: n0(t + e.offsetWidth), bottom: n0(a + e.offsetHeight) } : null;
    }
    function TextBox(text, isTop) {
      var d = document.createElement("div");
      d.className = "bb-texbox " + (isTop ? "bb-texbox--top" : "bb-texbox--bot");
      d.style.fontSize = (isTop ? t0.BASE_FONT_SIZE * t0.TOP_FONT_SCALE : t0.BASE_FONT_SIZE) + "px";
      d.textContent = text;
      return d;
    }
    /* 照搬 ia：phase 0-6 状态机 + rAF 擦入 tick + 每帧并集描边 */
    function createPlaque(opts) {
      var topText = opts.topText, bottomText = opts.bottomText || "", cls = opts.className || "";
      var hasBottom = (bottomText ?? "").trim().length > 0;
      var stack, svgEl, pathEl, topBase, topRev, botBase, botRev;
      var measured = null, rafId = null, spacerEl, spacerH = 0;
      var states = { yb: m0.HIDDEN_LEFT, xb: m0.HIDDEN_LEFT, kb: m0.HIDDEN_LEFT, sb: m0.HIDDEN_LEFT };
      var starts = { z: { current: null }, T: { current: null }, E: { current: null }, q: { current: null } };
      var clearHandles = null;

      var el = document.createElement.bind(document);
      var root = el("div");
      root.className = cls;
      var inner = el("div");
      inner.className = "bb-inline";
      stack = el("div");
      stack.className = "bb-stack";
      svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("class", "bb-svg");
      svgEl.setAttribute("width", "100%");
      svgEl.setAttribute("height", "100%");
      svgEl.style.overflow = "visible";
      pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("data-role", "union-border");
      pathEl.setAttribute("d", "");
      pathEl.setAttribute("fill", "none");
      pathEl.setAttribute("stroke", "black");
      pathEl.setAttribute("stroke-width", String(t0.BORDER_WIDTH));
      pathEl.setAttribute("stroke-linejoin", "miter");
      pathEl.setAttribute("stroke-linecap", "square");
      pathEl.setAttribute("vector-effect", "non-scaling-stroke");
      svgEl.appendChild(pathEl);
      stack.appendChild(svgEl);
      topBase = TextBox(topText, true);
      topBase.setAttribute("data-role", "plaque-top");
      stack.appendChild(topBase);
      var topRevWrap = el("div");
      topRevWrap.className = "bb-inset0";
      topRev = TextBox(topText, true);
      topRevWrap.appendChild(topRev);
      stack.appendChild(topRevWrap);
      if (hasBottom) {
        var hang = el("div");
        hang.className = "bb-hang";
        hang.style.marginTop = "-" + t0.OVERLAP_Y + "px";
        hang.style.left = "100%";
        hang.style.marginLeft = "-" + (t0.OVERLAP_X - t0.BORDER_WIDTH) + "px";
        var baseWrap = el("div");
        baseWrap.className = "bb-wmax";
        botBase = TextBox(bottomText, false);
        botBase.setAttribute("data-role", "plaque-bottom");
        baseWrap.appendChild(botBase);
        hang.appendChild(baseWrap);
        var revWrap = el("div");
        revWrap.className = "bb-inset0 bb-wmax";
        botRev = TextBox(bottomText, false);
        revWrap.appendChild(botRev);
        hang.appendChild(revWrap);
        stack.appendChild(hang);
      }
      inner.appendChild(stack);
      spacerEl = el("div");
      spacerEl.setAttribute("aria-hidden", "true");
      spacerEl.style.height = "0px";
      root.appendChild(inner);
      root.appendChild(spacerEl);

      function measure() {
        var G = stack, _ = topBase, V = hasBottom ? botBase : null;
        if (!G || !_) return;
        var a0 = wr(G, _), d0 = hasBottom && V ? wr(G, V) : null;
        if (!a0) return;
        var c0 = { width: n0(G.offsetWidth), height: n0(G.offsetHeight) };
        measured = { size: c0, top: a0, bottom: d0 };
        svgEl.setAttribute("viewBox", "0 0 " + c0.width + " " + c0.height);
        if (!hasBottom || !V) { setSpacer(0); return; }
        var b0 = Math.max(0, V.offsetHeight - t0.OVERLAP_Y);
        setSpacer(Math.abs(b0 - spacerH) > 0.5 ? b0 : spacerH);
      }
      function setSpacer(h) {
        spacerH = h;
        spacerEl.style.height = h + "px";
      }
      function tick() {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(function (G) {
          rafId = null;
          if (!measured) measure();
          var _ = measured;
          if (!_) return;
          var V = function (h0, w0) {
            h0 !== m0.ENTERING && h0 !== m0.EXITING || w0.current !== null && w0.current < 0 && (w0.current = G);
          };
          V(states.yb, starts.z); V(states.xb, starts.T); V(states.kb, starts.E); V(states.sb, starts.q);
          var a0 = Le(_.top, states.yb, G, starts.z.current, t0.WIPE_DURATION),
              d0 = Le(_.top, states.kb, G, starts.E.current, t0.WIPE_DURATION),
              c0 = hasBottom ? Le(_.bottom, states.xb, G, starts.T.current, t0.WIPE_DURATION) : null,
              b0 = hasBottom ? Le(_.bottom, states.sb, G, starts.q.current, t0.WIPE_DURATION) : null;
          if (topBase) topBase.style.clipPath = Oe(_.top, a0, states.yb);
          if (topRev) topRev.style.clipPath = Oe(_.top, d0, states.kb);
          if (hasBottom && botBase) botBase.style.clipPath = Oe(_.bottom, c0, states.xb);
          if (hasBottom && botRev) botRev.style.clipPath = Oe(_.bottom, b0, states.sb);
          if (!pathEl && svgEl) pathEl = svgEl.querySelector('path[data-role="union-border"]');
          if (pathEl) {
            var h0 = [a0, d0, c0, b0].filter(pe).map(function (S0) { return B1(S0, t0.BORDER_WIDTH / 2); }),
                w0 = I1(h0);
            pathEl.setAttribute("d", w0);
          }
          var x0 = function (h0, w0) {
            return w0 === null || h0 !== m0.ENTERING && h0 !== m0.EXITING ? false : G - w0 < t0.WIPE_DURATION;
          };
          if (x0(states.yb, starts.z.current) || x0(states.xb, starts.T.current) || x0(states.kb, starts.E.current) || x0(states.sb, starts.q.current)) tick();
        });
      }
      var resizeHandler = function () { measure(); tick(); };
      window.addEventListener("resize", resizeHandler);
      var phase = -1;
      function runPhase(p) {
        phase = p;
        if (clearHandles) clearHandles();
        var G, _;
        var V = function (x0, h0) { G = setTimeout(function () { runPhase(h0); }, x0); };
        var a0 = t0.WIPE_DURATION * t0.OVERLAP_RATIO, d0 = t0.WIPE_DURATION - a0;
        var c0 = function () {
          states.yb = states.xb = states.kb = states.sb = m0.HIDDEN_LEFT;
          starts.z.current = starts.T.current = starts.E.current = starts.q.current = null;
          measure(); tick();
        };
        var b0 = function () { states.yb = states.kb; starts.z.current = starts.E.current; states.kb = m0.HIDDEN_LEFT; starts.E.current = null; };
        var e0 = function () { states.xb = states.sb; starts.T.current = starts.q.current; states.sb = m0.HIDDEN_LEFT; starts.q.current = null; };
        switch (p) {
          case 0: c0(); V(100, 1); break;
          case 1: states.yb = m0.ENTERING; starts.z.current = -1; measure(); tick(); V(hasBottom ? t0.WIPE_DURATION : t0.WIPE_DURATION + t0.READ_DELAY, hasBottom ? 2 : 3); break;
          case 2: states.xb = m0.ENTERING; starts.T.current = -1; measure(); tick(); V(t0.WIPE_DURATION + t0.READ_DELAY, 3); break;
          case 3: states.yb = m0.EXITING; starts.z.current = -1; measure(); tick();
            _ = setTimeout(function () { states.kb = m0.ENTERING; starts.E.current = -1; tick(); }, d0);
            V(t0.WIPE_DURATION, 4); break;
          case 4: b0(); measure(); tick(); V(a0 + t0.READ_DELAY, hasBottom ? 5 : 3); break;
          case 5: states.xb = m0.EXITING; starts.T.current = -1; measure(); tick();
            _ = setTimeout(function () { states.sb = m0.ENTERING; starts.q.current = -1; tick(); }, d0);
            V(t0.WIPE_DURATION, 6); break;
          case 6: e0(); measure(); tick(); V(a0 + t0.READ_DELAY, 3); break;
        }
        clearHandles = function () {
          if (G !== undefined) clearTimeout(G);
          if (_ !== undefined) clearTimeout(_);
        };
      }
      measure(); tick();
      runPhase(0);
      return {
        el: root,
        destroy: function () {
          if (clearHandles) clearHandles();
          if (rafId !== null) cancelAnimationFrame(rafId);
          window.removeEventListener("resize", resizeHandler);
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
    return { createPlaque: createPlaque };
  })();

  function renderTitleBar(panel, b) {
    var plaque = BB.createPlaque({ topText: t(b.title), bottomText: b.sub, className: "bb-root-mb4 bb-root-pr14" });
    activePlaque = plaque;
    panel.appendChild(plaque.el);
    panel.appendChild(el("div", "panel-divider"));
    var close = el("button", "panel-close", "Close");
    close.type = "button";
    close.setAttribute("aria-label", "关闭");
    close.addEventListener("click", function (e) { e.stopPropagation(); closeActive(); });
    panel.appendChild(close);
  }

  /* ---------- 桌面端：气泡居中展开 ---------- */
  function activate(b) {
    var wrap = document.getElementById("bw-" + b.id);
    if (!wrap || activeId === b.id) return;
    closeActive();
    activeId = b.id;
    space.classList.add("has-active");
    wrap.classList.add("is-active");
    var card = wrap.querySelector(".bubble-card");
    card.classList.add("is-active");
    var hb = wrap.querySelector(".bubble-hitbox");
    if (hb) hb.setAttribute("aria-expanded", "true");
    var panel = card.querySelector(".bubble-panel");
    panel.textContent = "";
    renderTitleBar(panel, b);                    // 双行文字牌 + 描边 + 贴纸 + 分隔线 + Close
    var body = el("div", "panel-body");
    PANELS[b.panel](body);
    panel.appendChild(body);
    // 外点/Esc 关闭
    outCloseHandler = function (e) {
      if (!wrap.contains(e.target)) closeActive();
    };
    document.addEventListener("click", outCloseHandler, true);
    document.addEventListener("keydown", escHandler);
  }

  function escHandler(e) {
    if (e.key === "Escape") closeActive();
  }

  function closeActive() {
    if (!activeId) return;
    var wrap = document.getElementById("bw-" + activeId);
    if (wrap) {
      wrap.classList.remove("is-active");
      wrap.querySelector(".bubble-card").classList.remove("is-active");
      var hb = wrap.querySelector(".bubble-hitbox");
      if (hb) hb.setAttribute("aria-expanded", "false");
    }
    if (activePlaque) { activePlaque.destroy(); activePlaque = null; }   // 停掉标题牌的擦写循环
    space.classList.remove("has-active");
    document.removeEventListener("click", outCloseHandler, true);
    document.removeEventListener("keydown", escHandler);
    outCloseHandler = null;
    activeId = null;
  }

  /* ---------- 视差：鼠标归一化 [-1,1]，容器 ±2° 旋转 + 气泡 ±25/15px 平移 ---------- */
  function onMouseMove(e) {
    if (activeId || isMobile) return;
    var nx = (e.clientX / window.innerWidth) * 2 - 1;
    var ny = (e.clientY / window.innerHeight) * 2 - 1;
    space.style.setProperty("--mx", nx.toFixed(3));
    space.style.setProperty("--my", ny.toFixed(3));
    space.style.transform = "rotateY(" + (nx * 2).toFixed(2) + "deg) rotateX(" + (-ny * 2).toFixed(2) + "deg)";
  }

  function build() {
    space.textContent = "";
    BUBBLES.forEach(function (b) {
      var fp = floatParams(b.id);
      var wrap = el("div", "bubble-wrap" + (b.kind === "deco" ? " bubble-wrap--deco" : ""));
      wrap.id = "bw-" + b.id;
      wrap.style.top = b.top;
      wrap.style.left = b.left;
      wrap.style.zIndex = String(200 + b.z);
      wrap.style.setProperty("--kd", String((b.z + 200) / 400));
      var kd = ((b.z + 200) / 400).toFixed(4);
      wrap.style.setProperty("--tx",
        "translate3d(calc(-50% + var(--mx,0) * 25px * " + kd + ")," +
        " calc(-50% + var(--my,0) * 15px * " + kd + ")," +
        " " + b.z + "px) rotateY(" + b.ry + "deg)");
      // 背景态（其他气泡激活时）：z 后推 100px + rotateY 减半（参考站 ground 分支）
      wrap.style.setProperty("--txb",
        "translate3d(calc(-50% + var(--mx,0) * 25px * " + kd + ")," +
        " calc(-50% + var(--my,0) * 15px * " + kd + ")," +
        " " + (b.z - 100) + "px) rotateY(" + (b.ry * 0.5) + "deg)");

      var floater = el("div", "bubble-float");
      floater.style.setProperty("--fdur", fp.dur + "s");
      floater.style.setProperty("--fdelay", fp.delay);
      floater.style.setProperty("--famp", fp.amp + "px");

      var card = el("div", "bubble-card" + (b.dark ? " bubble-card--dark" : "") + (b.kind === "deco" ? " bubble-card--deco" : ""));
      card.style.setProperty("--bw", b.w + "px");
      card.style.setProperty("--bh", b.h + "px");
      card.style.setProperty("--aw", b.aw || "480px");
      card.style.setProperty("--ah", b.ah || "360px");
      card.style.setProperty("--sc", String(b.sc));
      card.style.setProperty("--ry", b.ry + "deg");
      card.style.setProperty("--bz", b.z + "px");
      if (b.bg) card.style.setProperty("--bubble-bg", b.bg);

      // 底部椭圆虚影（参考站：bottom-[-30px] w-70% h-15px blur-15px）
      card.appendChild(el("div", "bubble-ushadow"));
      // 左下尾巴（SVG 30×15 polygon 5,0 30,0 0,15）
      var tail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tail.setAttribute("class", "bubble-tail");
      tail.setAttribute("width", "30");
      tail.setAttribute("height", "15");
      tail.setAttribute("viewBox", "0 0 30 15");
      var poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", "5,0 30,0 0,15");
      tail.appendChild(poly);
      card.appendChild(tail);

      var idle = el("div", "bubble-idle");
      var hitbox = null;
      if (b.kind === "deco") {
        wrap.setAttribute("aria-hidden", "true");
        card.tabIndex = -1;
        idle.appendChild(zodiacSvg(b.zodiac, Number(b.id.split("-")[1])));
      } else {
        var ic = el("span", "b-icon");
        ic.appendChild(U.icon(b.icon));   // 闲置卡图标恢复最初版（展开面板内保留 hero-brand logo）
        idle.appendChild(ic);
        idle.appendChild(el("span", "b-title", t(b.title)));
        idle.appendChild(el("span", "b-sub", b.sub));
      }
      card.appendChild(idle);

      var panel = el("div", "bubble-panel");
      card.appendChild(panel);

      if (b.kind !== "deco") {
        // 触发 box：轴对齐矩形（不随 rotateY/scale 变形），仅跟随锚点与视差平移，
        // 命中区域与 3D 渲染面完全解耦——点击稳定居中于视觉卡
        hitbox = el("div", "bubble-hitbox");
        hitbox.style.width = (b.w + 64) + "px";
        hitbox.style.height = (b.h + 64) + "px";
        hitbox.setAttribute("role", "button");
        hitbox.tabIndex = 0;
        hitbox.setAttribute("aria-expanded", "false");
        hitbox.setAttribute("aria-label", t(b.title) + " " + b.sub);
        hitbox.setAttribute("data-bubble", b.panel);
        hitbox.setAttribute("data-bubble-id", b.id);
        hitbox.addEventListener("click", function (e) {
          e.stopPropagation();
          if (isMobile) { openMobileModal(b.panel); return; }
          activate(b);
        });
        hitbox.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (isMobile) { openMobileModal(b.panel); } else { activate(b); }
          }
        });
      }
      floater.appendChild(card);
      if (hitbox) floater.appendChild(hitbox);   // 后插 = 命中优先于视觉卡
      wrap.appendChild(floater);
      space.appendChild(wrap);
    });
  }

  /* ---------- 双模式：standalone（about.html）/ 内嵌视图（index.html#aboutView） ----------
     index 页将“关于”并入导航岛软切换：switchTab("about") → show() 惰性构建场景并显示，
     切回榜单 tab → hide()（含未关闭气泡的收合），全程无文档导航。 */
  var view = document.getElementById("aboutView");
  var embedded = !!view;
  var built = false, globalBound = false;

  function bindGlobalHandlers() {
    if (globalBound) return;
    globalBound = true;
    /* 点击分发兜底：3D 透视下命中盒偶尔被更深平面（卡片 translateZ）竞争跳过，
       elementFromPoint 亦同步跳过——document 捕获阶段按坐标找回命中盒并激活，
       触发不再依赖单次 hit-test。同一 hitbox 的常规监听保留为键盘/辅助路径。 */
    document.addEventListener("click", function (e) {
      var hb = e.target.closest ? e.target.closest(".bubble-hitbox") : null;
      var id = null;
      // 展开卡分层守卫：点击落在展开卡范围内（含 Close）→ 交给面板自身控件，绝不触发其他卡片
      if (activeId) {
        var aw = document.getElementById("bw-" + activeId);
        var ac = aw ? aw.querySelector(".bubble-card") : null;
        if (ac) {
          var ar = ac.getBoundingClientRect();
          if (e.clientX >= ar.left && e.clientX <= ar.right && e.clientY >= ar.top && e.clientY <= ar.bottom) return;
        }
      }
      if (hb) {
        id = hb.getAttribute("data-bubble-id");
      } else {
        var boxes = document.querySelectorAll(".bubble-hitbox");
        for (var i = 0; i < boxes.length; i++) {
          var r = boxes[i].getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            id = boxes[i].getAttribute("data-bubble-id");
            break;
          }
        }
      }
      if (!id || activeId === id) return;   // 未命中 / 已展开（面板内点击交给自身控件）
      var meta = null;
      BUBBLES.forEach(function (x) { if (x.id === id) meta = x; });
      if (!meta) return;
      e.stopPropagation();
      if (isMobile) { openMobileModal(meta.panel); return; }
      activate(meta);
    }, true);
  }

  function bindParallax() {
    if (!scene || isMobile) return;
    scene.addEventListener("mousemove", onMouseMove);
    scene.addEventListener("mouseleave", function () {
      space.style.setProperty("--mx", "0");
      space.style.setProperty("--my", "0");
      space.style.transform = "";
    });
  }

  function init() {
    if (embedded) return;   // index.html：视图模块模式，由 show() 惰性构建
    scene = document.getElementById("aboutScene");
    space = document.getElementById("aboutSpace");
    isMobile = window.matchMedia("(max-width: 760px)").matches;
    bindGlobalHandlers();
    HMB.api.getSession().then(function (resp) {
      C.renderTopbar(document.getElementById("topbar"), "about", resp.data);   // 岛内"关于"项激活
      build();
      HMB.i18n.apply(document.body);
      bindParallax();
    });
  }

  /* 内嵌模式：构建场景壳（与 about.html 静态结构一致）+ 气泡 */
  function ensureBuilt() {
    if (built) return;
    built = true;
    scene = el("main", "about-scene");
    scene.id = "aboutScene";
    scene.appendChild(el("div", "about-ambient about-ambient--a"));
    scene.appendChild(el("div", "about-ambient about-ambient--b"));
    var wmt = el("div", "about-wm about-wm--top");
    wmt.setAttribute("data-text", "about.wmTop");
    scene.appendChild(wmt);
    space = el("div", "about-space");
    space.id = "aboutSpace";
    space.setAttribute("aria-label", "关于本站信息气泡");
    scene.appendChild(space);
    var wmb = el("div", "about-wm about-wm--bottom");
    wmb.setAttribute("data-text", "about.wmBottom");
    scene.appendChild(wmb);
    var h1 = el("h1", "about-title-sr");
    h1.setAttribute("data-text", "about.title");
    view.appendChild(h1);
    view.appendChild(scene);
    HMB.i18n.apply(view);
    isMobile = window.matchMedia("(max-width: 760px)").matches;
    bindGlobalHandlers();
    build();
    bindParallax();
  }

  HMB.pages = HMB.pages || {};
  HMB.pages.about = {
    show: function () { ensureBuilt(); view.hidden = false; },
    hide: function () {
      if (activeId) closeActive();   // 切走时收合未关闭的展开卡
      view.hidden = true;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  })(window, document);

