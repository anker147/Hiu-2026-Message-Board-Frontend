/* ============================================================
 * 留言板 · 种子数据（Page 1 画布 01/04/07/16 原值）
 * 所有数据留在前端（localStorage 持久化），供交互测试。
 * ============================================================ */
(function (window) {
  "use strict";

  var now = Date.now();
  var DAY = 24 * 3600 * 1000;
  var HOUR = 3600 * 1000;

  // 8 选 1 emoji 头像白名单（PRD F1）
  var AVATARS = ["🌸", "🐰", "🐱", "🦊", "🐻", "🐼", "🐸", "🐯"];

  // 随机网名词库：形容词 + 动物（PRD F1/F4）
  var NICK_ADJ = ["快乐的", "温柔的", "元气的", "安静的", "闪闪的", "好奇的", "软软的", "勇敢的", "慢慢来的", "爱笑的"];
  var NICK_ANIMAL = ["小鹿", "兔子", "狐狸", "熊猫", "考拉", "海豚", "小熊", "刺猬", "松鼠", "小猫"];

  // 敏感词表（PRD F10：可配置；命中后留言与评论无法发布，G15 后台可继续增删）
  /* 敏感词种子分组：
     广告引流 / 刷单诈骗 / 博彩 / 违禁服务 / 垃圾营销
     + 涉政与公共安全 / 色情低俗 / 诈骗资金风险（通用风险标签，不收录具体人物或事件名称）。
     匹配按可见纯文本子串命中，分组仅用于维护阅读，不影响数据结构（仍是扁平字符串数组）。 */
  var SENSITIVE_WORDS = [
    /* 广告引流 */
    "加微信", "加V信", "微信私聊", "扫码加群", "私聊领取", "点击链接", "免费领取",
    "限时福利", "全网最低", "便宜出", "包邮秒杀",
    "加QQ", "加群", "薇信", "威信", "私信我", "扫码进群",
    /* 刷单与诈骗 */
    "刷单", "刷单返利", "代刷", "代刷流量", "兼职日结", "日入过千", "虚假中奖",
    "冒充客服", "钓鱼链接", "先交保证金",
    /* 博彩 */
    "博彩", "网络赌博", "赌球", "彩票网站", "在线投注",
    "赌博平台", "私彩", "网络彩票", "博彩网站", "赌资",
    /* 违禁服务 */
    "代考", "办证", "办假证", "代考代写", "出售题库", "代刷课", "雇佣枪手",
    "出售答案", "作弊器", "外挂", "破解版", "盗版资源",
    "代写论文", "枪手代考", "假发票", "伪造证件",
    /* 垃圾营销变体 */
    "私聊我", "低价出", "秒杀价", "领福利", "点击领取", "群号",
    /* 涉政与公共安全（通用风险标签，不收录具体人物 / 事件名称） */
    "涉政", "政治谣言", "敏感事件", "非法集会", "煽动", "分裂", "颠覆",
    "暴恐", "暴力恐怖", "极端主义", "涉密", "机密文件",
    /* 色情低俗 */
    "色情", "淫秽", "成人内容", "成人视频", "成人网站", "裸照", "裸聊",
    "偷拍", "不雅照", "不雅视频", "性交易", "招嫖", "卖淫",
    /* 诈骗与资金风险 */
    "杀猪盘", "资金盘", "传销", "冒充公检法", "虚假投资", "虚假贷款",
    "刷流水", "解冻费", "高额返利", "代充值", "低价代充", "跑分", "洗钱",
    "出租银行卡", "买卖银行卡", "高薪兼职"
  ];

  // 话题词库（发布表单 / 编辑页共享的“版块”语义，服务端校验以此白名单为准）
  var TOPICS = ["校园日常", "互助", "食堂", "求助", "盲盒", "日常"];

  // 编辑器表情库（帖子编辑页工具栏“表情”选择器；与头像 8 选 1 白名单同源起头）
  var EMOJI_LIBRARY = [
    "🌸", "🐰", "🐱", "🦊", "🐻", "🐼", "🐸", "🐯",
    "😊", "😂", "🥰", "😎", "🤔", "😭", "🥳", "😴",
    "👍", "🎉", "✨", "🔥", "💡", "📚", "☕", "🌙"
  ];

  // 期次（留言板自有周榜期次，严禁“第 128 期 / 术力口”语义）
  // 周界口径：一周 = 周日 00:00 → 周六 24:00（非周一到周日）；range 起始日即周日
  // 演示期次已清空：接真实后端后，期次清单与当前期次由后端提供。
  var PERIODS = [];
  var CURRENT_PERIOD = 24; // 占位默认值；真实期次以后端返回为准（board.js 依赖此值，不可为空）

  /* 近 8 期逐周原始统计（后端字段 weeklyStats 的 mock 实现）。
     只有“发布期 → 本期”之间的周才有真实统计；发布前的周标记 empty=true、stats 全 0，
     前端折线把 0 值期画成贴底平线（不估算、不伪造热度，0 就是真的没有量）。
     本期 stats 与当前 stats 完全一致，保证卡片热度与折线末点同源。 */
  function makeWeeklyStats(stats, periodNo, key) {
    var first = CURRENT_PERIOD - 7;
    var span = CURRENT_PERIOD - periodNo;          // 可用周跨度；0 = 本周新帖
    var firstIdx = 7 - span;
    var sum = 0;
    String(key || "").replace(/./g, function (ch) { sum += ch.charCodeAt(0); return ch; });
    var jitter = 0.94 + (sum % 5) * 0.03;          // 往期轻微差异，末周不受影响
    var out = [];
    for (var i = 0; i < 8; i++) {
      var p = first + i;
      if (p < periodNo) {
        out.push({
          period: p, empty: true,
          stats: { views: 0, likes: 0, comments: 0, favorites: 0 }
        });
      } else {
        var step = span > 0 ? (i - firstIdx) / span : 1;
        var r = i === 7 ? 1 : Math.min(0.92, Math.max(0.25, (0.45 + 0.5 * step) * jitter));
        out.push({
          period: p,
          stats: {
            views: Math.round(stats.views * r),
            likes: Math.round(stats.likes * r),
            comments: Math.round(stats.comments * r),
            favorites: Math.round(stats.favorites * r)
          }
        });
      }
    }
    return out;
  }

  /** 跨 24 期样本帖的逐周增量统计：每周 stats 是「当周新增」的四项，
   *  24 周逐项相加精确等于总 stats 的四项（views/likes/comments/favorites 分别回加对上）。
   *  权重带起伏，用来观察多期时折线的真实波动；不估算、不伪造，最后一期用减法兜齐误差。 */
  function makeLongRunWeeklyStats(total, fromPeriod, weeks) {
    var growth = [0.60, 0.90, 1.20, 0.80, 1.50, 1.10, 0.70, 1.30, 1.60, 1.00, 0.90, 1.40,
                  1.10, 0.80, 1.20, 1.50, 0.70, 1.00, 1.30, 0.90, 1.10, 0.60, 0.80, 0.50];
    var keys = ["views", "likes", "comments", "favorites"];
    var all = 0, out = [], acc = {}, i, k;
    for (i = 0; i < weeks; i++) all += growth[i % growth.length];
    for (k = 0; k < keys.length; k++) acc[keys[k]] = 0;
    for (i = 0; i < weeks; i++) {
      var stats = {};
      for (k = 0; k < keys.length; k++) {
        var key = keys[k];
        stats[key] = (i === weeks - 1)
          ? total[key] - acc[key]   // 末期兜齐四舍五入误差，保证逐项相加 === 总 stats
          : Math.round(total[key] * growth[i % growth.length] / all);
        acc[key] += stats[key];
      }
      out.push({ period: fromPeriod + i, stats: stats });
    }
    return out;
  }

  /* —— 用户（密码为演示明文，mock 校验用；真实系统为 PBKDF2 加盐哈希） —— */
  // 演示用户已清空：仅保留内置 admin 账号（见下方 ADMIN_USER）。
  var USERS = [];

  /* —— 管理员账号（GM 默认账号，写死；文档 §6.1 约定）——
     id=9999 为内置保护账号：不可封禁 / 降级 / 改密 / 删除；
     登录入口与手机号账号共用 password 校验（演示明文，真实系统为加盐哈希）。 */
  var ADMIN_USER = {
    id: 9999,
    account: "admin",
    password: "admin",
    displayId: "90000001",
    nickname: "管理员",
    avatarEnum: 1,
    role: "admin",
    status: "active",
    muteUntil: 0,
    muteReason: "",
    banReason: "",
    bannedAt: 0,
    lastLoginAt: 0,
    mustChangePassword: false,
    flagName: false,
    flagEmail: false,
    flagPhone: false,
    flagLiked: true,
    flagFavorite: true,
    bio: "留言板管理员",
    createdAt: 1730000000000
  };

  /* —— 留言数据已清空：演示帖子属于 demo 数据，接真实后端后由 /api/messages 提供 —— */
  var MESSAGES = [];

  // 逐周原始统计由 mock“后端”随留言一并返回；前端只负责按公式实时折算与画图
  MESSAGES.forEach(function (m) {
    if (!m.weeklyStats) m.weeklyStats = makeWeeklyStats(m.stats, m.period, m.no);
  });

  /* —— 评论数据已清空：由后端 /api/comments 提供 —— */
  var COMMENTS = [];

  /* —— 点赞数据已清空：由后端 /api/like 维护 —— */
  var LIKES = [];

  function withDefaults(defaults, item) {
    var out = {}, k;
    for (k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    for (k in item) if (Object.prototype.hasOwnProperty.call(item, k)) out[k] = item[k];
    return out;
  }

  // 普通用户补齐 GM 权限字段（便于文档契约与 mock 出口一致），不改变原有演示数据
  var USER_GM_DEFAULTS = {
    role: "user", status: "active", muteUntil: 0, muteReason: "",
    banReason: "", bannedAt: 0, lastLoginAt: 0, mustChangePassword: false,
    // 互动展示开关：控制他人访问个人主页时能否看到「我赞过的 / 我收藏的」，本人始终可见
    flagLiked: true, flagFavorite: true
  };
  var USERS_WITH_ROLE = USERS.map(function (u) {
    return withDefaults(USER_GM_DEFAULTS, u);
  });

  // hidden 为 GM 软处置字段：缺省即公开，这里显式补齐便于审计与列表筛选
  var MESSAGES_WITH_HIDDEN = MESSAGES.map(function (m) {
    return withDefaults({ hidden: false }, m);
  });
  var COMMENTS_WITH_HIDDEN = COMMENTS.map(function (c) {
    return withDefaults({ hidden: false }, c);
  });

  window.HMB = window.HMB || {};
  window.HMB.SEED = {
    VERSION: 15, // v15：清空 demo 数据（帖子/期次/演示用户/评论/点赞），保留敏感词库与常量
    AVATARS: AVATARS,
    NICK_ADJ: NICK_ADJ,
    NICK_ANIMAL: NICK_ANIMAL,
    SENSITIVE_WORDS: SENSITIVE_WORDS,
    TOPICS: TOPICS,
    EMOJI_LIBRARY: EMOJI_LIBRARY,
    PERIODS: PERIODS,
    CURRENT_PERIOD: CURRENT_PERIOD,
    USERS: USERS_WITH_ROLE.concat([ADMIN_USER]),
    MESSAGES: MESSAGES_WITH_HIDDEN,
    COMMENTS: COMMENTS_WITH_HIDDEN,
    LIKES: LIKES,
    ADMIN_USER: ADMIN_USER,
    /** 内置保护账号：不可封禁 / 降级 / 改密 / 删除 */
    isProtectedUser: function (userId) { return Number(userId) === 9999; }
  };
})(window);
