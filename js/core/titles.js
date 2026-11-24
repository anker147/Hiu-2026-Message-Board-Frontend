/* ============================================================
 * 留言板 · 活跃度称号系统（纯前端计算 + 本地缓存）
 * ------------------------------------------------------------
 * 红线：
 *  - 是否颁发、颁发哪一枚、等级与进度，全部由本模块按「接口已返回的公开数据」计算；
 *    后端只提供原始活跃统计，不存称号、不返回称号、不参与判定。
 *  - 加载本脚本时不计算任何用户、不写 localStorage；只有页面显式调用 ensure() 才触发。
 *    不需要显示称号的页面不引用本模块，自然不计算。
 *  - 计算输入只用 getZone 出口已有字段：stats.messages / stats.comments /
 *    stats.likesReceived / memberDays / topics。不读取掩码、不读取他人盲盒等隐私域。
 *
 * 缓存：hmb_v1_titles = { [displayId]: { sig, computedAt, awarded:[id], level, primary } }
 *  sig 是输入数据的签名；数据没变则复用上次结果，数据变了才重算并回写。
 * ============================================================ */
(function (window) {
  "use strict";

  var HMB = (window.HMB = window.HMB || {});
  var VERSION = 1; // 规则版本号；规则变更时 +1，old 缓存自动失效
  var STORE_KEY = "titles";
  var runStats = { computes: 0, hits: 0 }; // 内存计数（刷新归零），仅用于验证按需计算

  /** 称号规则表：id 稳定不复用；tier 1–4；check(input) → boolean；progress(input) → {cur,max}
   *  文案键 title.<id> / title.<id>Desc 集中在 ui-text.js。 */
  var RULES = [
    {
      id: "firstStep", tier: 1, icon: "🌱",
      check: function (x) { return x.messages >= 1; },
      progress: function (x) { return { cur: x.messages, max: 1 }; }
    },
    {
      id: "voice", tier: 1, icon: "💬",
      check: function (x) { return x.comments >= 1; },
      progress: function (x) { return { cur: x.comments, max: 1 }; }
    },
    {
      id: "weekGuest", tier: 1, icon: "📅",
      check: function (x) { return x.memberDays >= 7; },
      progress: function (x) { return { cur: x.memberDays, max: 7 }; }
    },
    {
      id: "regular", tier: 2, icon: "✍️",
      check: function (x) { return x.messages >= 5; },
      progress: function (x) { return { cur: x.messages, max: 5 }; }
    },
    {
      id: "topicFinder", tier: 2, icon: "🏷️",
      check: function (x) { return x.topics >= 3; },
      progress: function (x) { return { cur: x.topics, max: 3 }; }
    },
    {
      id: "warmHeart", tier: 2, icon: "❤️",
      check: function (x) { return x.likesReceived >= 50; },
      progress: function (x) { return { cur: x.likesReceived, max: 50 }; }
    },
    {
      id: "veteran", tier: 3, icon: "🏅",
      check: function (x) { return x.memberDays >= 30 && x.messages >= 5; },
      progress: function (x) {
        var a = Math.min(1, x.memberDays / 30), b = Math.min(1, x.messages / 5);
        return { cur: Math.round(Math.min(a, b) * 100), max: 100 };
      }
    },
    {
      id: "popular", tier: 3, icon: "🔥",
      check: function (x) { return x.likesReceived >= 300; },
      progress: function (x) { return { cur: x.likesReceived, max: 300 }; }
    },
    {
      id: "boardLegend", tier: 4, icon: "👑",
      check: function (x) { return x.messages >= 8 && x.comments >= 3 && x.likesReceived >= 500; },
      progress: function (x) {
        var a = Math.min(1, x.messages / 8), b = Math.min(1, x.comments / 3), c = Math.min(1, x.likesReceived / 500);
        return { cur: Math.round(Math.min(a, b, c) * 100), max: 100 };
      }
    }
  ];

  function n(x) { return (typeof x === "number" && isFinite(x) && x > 0) ? Math.floor(x) : 0; }

  /** 只从 zone 出口的公开数据提取判定输入；缺字段一律 0，不估算。 */
  function extract(zone) {
    var z = zone || {};
    var stats = z.stats || {};
    return {
      messages: n(stats.messages),
      comments: n(stats.comments),
      likesReceived: n(stats.likesReceived),
      memberDays: n(z.memberDays),
      topics: z.topics ? z.topics.length : 0
    };
  }

  function sigOf(input) {
    return [VERSION, input.messages, input.comments, input.likesReceived, input.memberDays, input.topics].join("|");
  }

  function readAll() {
    return (HMB.db && HMB.db.read(STORE_KEY, {})) || {};
  }

  /** 按需计算：只有调用方（显示称号的页面）触发才执行。
   *  命中缓存（签名一致）直接返回，不重复计算；否则计算并写回本地。 */
  function ensure(zone) {
    var key = zone && zone.user && zone.user.displayId;
    if (!key) return { awarded: [], level: 0, primary: null, cached: false, computed: false };

    var store = readAll();
    var input = extract(zone);
    var sig = sigOf(input);
    var hit = store[key];
    if (hit && hit.sig === sig && Array.isArray(hit.awarded)) {
      runStats.hits += 1;
      return {
        awarded: hit.awarded.slice(), level: hit.level || 0,
        primary: hit.primary || null, cached: true, computed: false,
        input: input
      };
    }

    var awarded = [];
    RULES.forEach(function (r) { if (r.check(input)) awarded.push(r.id); });
    // primary：最高 tier 优先，同 tier 取规则表靠后者（更"稀有"）
    var primary = null, primaryTier = -1;
    RULES.forEach(function (r) {
      if (awarded.indexOf(r.id) >= 0 && r.tier >= primaryTier) {
        primary = r.id; primaryTier = r.tier;
      }
    });
    var level = awarded.length;
    runStats.computes += 1;
    var result = {
      awarded: awarded, level: level, primary: primary,
      cached: false, computed: true, input: input
    };
    store[key] = {
      sig: sig, computedAt: Date.now(), awarded: awarded,
      level: level, primary: primary
    };
    if (HMB.db) HMB.db.write(STORE_KEY, store);
    return result;
  }

  /** 只读取已缓存结果，不计算、不写入；供不需要触发计算的诊断场景使用。 */
  function peek(displayId) {
    var hit = readAll()[displayId];
    if (!hit) return null;
    return {
      awarded: (hit.awarded || []).slice(), level: hit.level || 0,
      primary: hit.primary || null, cached: true, computed: false,
      computedAt: hit.computedAt || 0
    };
  }

  /** 当前用户的"下一枚"称号：返回最接近解锁的未获得规则（含进度）。 */
  function nextTitle(result) {
    if (!result) return null;
    var owned = result.awarded || [];
    var input = result.input || null;
    if (!input) return null;
    var best = null, bestRatio = -1;
    RULES.forEach(function (r) {
      if (owned.indexOf(r.id) >= 0) return;
      var p = r.progress(input);
      var ratio = p.max ? Math.min(1, p.cur / p.max) : 0;
      if (ratio >= bestRatio) { bestRatio = ratio; best = { id: r.id, tier: r.tier, icon: r.icon, progress: p }; }
    });
    return best;
  }

  function rule(id) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].id === id) return RULES[i];
    return null;
  }

  HMB.titles = {
    VERSION: VERSION,
    RULES: RULES,
    rule: rule,
    extract: extract,
    ensure: ensure,
    peek: peek,
    nextTitle: nextTitle,
    stats: function () { return { computes: runStats.computes, hits: runStats.hits }; }
  };
})(window);
