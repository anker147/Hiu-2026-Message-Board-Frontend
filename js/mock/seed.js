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

  // 敏感词表（PRD F10：加微信、代考、办证、刷单等，可配置）
  var SENSITIVE_WORDS = ["加微信", "代考", "办证", "刷单"];

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
  var PERIODS = [
    { no: 24, range: "2026.11.22–11.28" },
    { no: 23, range: "2026.11.15–11.21" },
    { no: 22, range: "2026.11.08–11.14" },
    { no: 21, range: "2026.11.01–11.07" }
  ];
  var CURRENT_PERIOD = PERIODS[0].no;

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

  /* —— 用户（密码为演示明文，mock 校验用；真实系统为 PBKDF2 加盐哈希） —— */
  var USERS = [
    { id: 1, account: "13800000001", password: "abc12345", displayId: "20849317", nickname: "小满",   avatarEnum: 1, realName: "王小满",  email: "xiaoman@hiu.edu.cn", flagName: true,  flagEmail: false, flagPhone: false, bio: "喜欢在晚自习后去操场看晚霞", createdAt: now - 30 * DAY },
    { id: 2, account: "13800000002", password: "abc12345", displayId: "70134852", nickname: "阿泽",   avatarEnum: 4, realName: "陈泽宇",  email: "azezey@qq.com",      flagName: false, flagEmail: false, flagPhone: false, bio: "图书馆靠窗党，耳机常备", createdAt: now - 28 * DAY },
    { id: 3, account: "13800000003", password: "abc12345", displayId: "44920183", nickname: "橘子汽水", avatarEnum: 4, realName: "李橘橙",  email: "",                   flagName: false, flagEmail: false, flagPhone: false, bio: "食堂测评雷达，三楼蹲点中", createdAt: now - 25 * DAY },
    { id: 4, account: "13800000004", password: "abc12345", displayId: "53871022", nickname: "匿名同学", avatarEnum: 6, realName: "",       email: "anon2026@163.com",   flagName: false, flagEmail: true,  flagPhone: false, bio: "路过，随便看看", createdAt: now - 21 * DAY },
    { id: 5, account: "13800000005", password: "abc12345", displayId: "61590247", nickname: "树树",   avatarEnum: 7, realName: "苏树",    email: "sushu@hiu.edu.cn",   flagName: false, flagEmail: false, flagPhone: false, bio: "盲盒爱好者，专职送祝福", createdAt: now - 18 * DAY },
    { id: 6, account: "13800000006", password: "abc12345", displayId: "36208841", nickname: "晚风",   avatarEnum: 4, realName: "林晚风",  email: "wanfeng@qq.com",     flagName: true,  flagEmail: false, flagPhone: true,  bio: "环湖散步队队长", createdAt: now - 15 * DAY }
  ];

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
    bio: "留言板管理员",
    createdAt: 1730000000000
  };

  /* —— 留言（第 24 期 6 条：画布 01 原值；第 23 期 2 条）
     时间锚点：周界口径为“周日 00:00 → 周六 24:00”，演示留言锚定在本期周日内
     （第 24 期 6 条在周日内 3~19h，第 23 期 2 条在上周日晚 ~ 周一晚）；
     热度分不落库：由 api 出口层按周榜公式实时计算（浏览基数×时间修正 + 评论×1 + 点赞×2 + 收藏×5，
     结构参照 biliboard.uk 公示口径，绝对分值以“万”展示） —— */
  var MESSAGES = [
    {
      resourceId: "a1f0b2c3-7f3a-4c21-9d01-000000000001", title: "一起去看晚霞吧", no: "7f3a9c21",
      ownerId: 1, content: "下课后一起去看晚霞吗，操场边那棵树又开花了",
      nicknameSnapshot: "小满", avatarEnum: 1, displayId: "20849317",
      topicTag: "校园日常", isPublic: true, period: 24,
      createdAt: now - 3 * HOUR,
      stats: { views: 12000, likes: 328, comments: 46, favorites: 89 },
      heatDelta: 12.4, peakRank: 0, peakNewRank: 0, isNew: true
    },
    {
      resourceId: "a1f0b2c3-b2e1-4d94-9d02-000000000002", title: "图书馆靠窗位与耳机共享", no: "b2e1d94c",
      ownerId: 2, content: "图书馆靠窗的位置今天没人，把耳机借给需要的同学",
      nicknameSnapshot: "阿泽", avatarEnum: 4, displayId: "70134852",
      topicTag: "互助", isPublic: true, period: 24,
      createdAt: now - 7 * HOUR,
      stats: { views: 9840, likes: 256, comments: 38, favorites: 72 },
      heatDelta: 5.1, peakRank: 0, peakNewRank: 0, isNew: false
    },
    {
      resourceId: "a1f0b2c3-c9a2-278e-9d03-000000000003", title: "糖醋排骨回归了", no: "c9a2278e",
      ownerId: 3, content: "食堂三楼的糖醋排骨回归了，排队值得，附今日窗口实拍感受",
      nicknameSnapshot: "橘子汽水", avatarEnum: 4, displayId: "44920183",
      topicTag: "食堂", isPublic: true, period: 24,
      createdAt: now - 8 * HOUR,
      stats: { views: 8120, likes: 198, comments: 51, favorites: 63 },
      heatDelta: -3.8, peakRank: 0, peakNewRank: 0, isNew: false
    },
    {
      resourceId: "a1f0b2c3-8e7c-c35a-9d04-000000000004", title: "助攻课推荐求真实体验", no: "8e7cc35a",
      ownerId: 4, content: "问一下大家，助攻课还有没有被推荐的老师，想听真实体验",
      nicknameSnapshot: "匿名同学", avatarEnum: 6, displayId: "53871022",
      topicTag: "求助", isPublic: true, period: 24,
      createdAt: now - 12 * HOUR,
      stats: { views: 7560, likes: 142, comments: 64, favorites: 41 },
      heatDelta: 0, peakRank: 0, peakNewRank: 0, isNew: false
    },
    {
      resourceId: "a1f0b2c3-dda5-e812-9d05-000000000005", title: "盲盒破冰成功", no: "dda5e812",
      ownerId: 5, content: "盲盒回复太好玩了，抽到一条去年陌生同学的祝福，破冰成功",
      nicknameSnapshot: "树树", avatarEnum: 7, displayId: "61590247",
      topicTag: "盲盒", isPublic: true, period: 24,
      createdAt: now - 17 * HOUR,
      stats: { views: 6910, likes: 176, comments: 33, favorites: 58 },
      heatDelta: 8.7, peakRank: 0, peakNewRank: 0, isNew: false
    },
    {
      resourceId: "a1f0b2c3-ad8b-9f97-9d06-000000000006", title: "环湖散步路线推荐", no: "ad8b9f97",
      ownerId: 6, content: "今天的天气太适合散步了，晚风很温柔，推荐环湖路线给大家",
      nicknameSnapshot: "晚风", avatarEnum: 4, displayId: "36208841",
      topicTag: "日常", isPublic: true, period: 24,
      createdAt: now - 19 * HOUR,
      stats: { views: 5430, likes: 121, comments: 27, favorites: 35 },
      heatDelta: 0, peakRank: 0, peakNewRank: 0, isNew: false
    },
    /* —— 第 23 期 2 条（期次切换可测） —— */
    {
      resourceId: "a1f0b2c3-23a1-0001-9d07-000000000007", title: "英语角继续约", no: "23a10001",
      ownerId: 2, content: "上周的英语角来了好多外教，这周继续约起来",
      nicknameSnapshot: "阿泽", avatarEnum: 4, displayId: "70134852",
      topicTag: "校园日常", isPublic: true, period: 23,
      createdAt: now - 6 * DAY - 3 * HOUR,
      stats: { views: 4210, likes: 96, comments: 18, favorites: 22 },
      heatDelta: -1.2, peakRank: 1, peakNewRank: 1, isNew: false
    },
    {
      resourceId: "a1f0b2c3-23a2-0002-9d08-000000000008", title: "期末小组自习室分享", no: "23a20002",
      ownerId: 5, content: "分享一个期末复习的小组自习室，氛围超好",
      nicknameSnapshot: "树树", avatarEnum: 7, displayId: "61590247",
      topicTag: "互助", isPublic: true, period: 23,
      createdAt: now - 7 * DAY - 2 * HOUR,
      stats: { views: 3870, likes: 88, comments: 15, favorites: 30 },
      heatDelta: 2.3, peakRank: 2, peakNewRank: 2, isNew: false
    }
  ];

  // 逐周原始统计由 mock“后端”随留言一并返回；前端只负责按公式实时折算与画图
  MESSAGES.forEach(function (m) { m.weeklyStats = makeWeeklyStats(m.stats, m.period, m.no); });

  /* —— 评论树（画布 04/16 原值，挂在第 1 条留言下） —— */
  var COMMENTS = [
    {
      resourceId: "c0000000-0000-4000-8000-000000000001",
      messageId: "a1f0b2c3-7f3a-4c21-9d01-000000000001",
      parentId: null, rootId: null, depth: 1,
      ownerId: 2, authorName: "阿泽", authorAvatar: 4, authorDisplayId: "70134852",
      content: "我也想去！带上相机，晚霞值得记录",
      createdAt: now - 2 * 3600e3, likes: 12, edited: false,
      likedBy: []
    },
    {
      resourceId: "c0000000-0000-4000-8000-000000000002",
      messageId: "a1f0b2c3-7f3a-4c21-9d01-000000000001",
      parentId: "c0000000-0000-4000-8000-000000000001",
      rootId: "c0000000-0000-4000-8000-000000000001", depth: 2,
      ownerId: 1, authorName: "小满", authorAvatar: 1, authorDisplayId: "20849317",
      atDisplayId: "70134852", atAuthorName: "阿泽",
      content: "好呀，周六傍晚见",
      createdAt: now - 1 * 3600e3, likes: 5, edited: false,
      likedBy: []
    },
    {
      resourceId: "c0000000-0000-4000-8000-000000000003",
      messageId: "a1f0b2c3-7f3a-4c21-9d01-000000000001",
      parentId: null, rootId: null, depth: 1,
      ownerId: 5, authorName: "树树", authorAvatar: 7, authorDisplayId: "61590247",
      content: "盲盒回复太好玩了，我也抽到过一条陌生同学的祝福",
      createdAt: now - 3 * 3600e3, likes: 8, edited: false,
      likedBy: []
    },
    /* 盲盒匿名回复示例（热心同学，橙底，F9/D-02） */
    {
      resourceId: "c0000000-0000-4000-8000-000000000004",
      messageId: "a1f0b2c3-ad8b-9f97-9d06-000000000006",
      parentId: null, rootId: null, depth: 1,
      ownerId: 2, authorName: "热心同学", authorAvatar: 0, authorDisplayId: "",
      isAnonymous: true,
      content: "上周刚去过，环湖的日落特别好看，祝你玩得开心",
      createdAt: now - 30 * 60e3, likes: 3, edited: false,
      likedBy: []
    }
  ];

  /* —— 点赞记录（user_id + target_id 唯一） —— */
  var LIKES = [
    { userId: 1, targetId: "a1f0b2c3-ad8b-9f97-9d06-000000000006" },
    { userId: 2, targetId: "a1f0b2c3-7f3a-4c21-9d01-000000000001" },
    { userId: 3, targetId: "a1f0b2c3-7f3a-4c21-9d01-000000000001" },
    { userId: 6, targetId: "a1f0b2c3-b2e1-4d94-9d02-000000000002" }
  ];

  function withDefaults(defaults, item) {
    var out = {}, k;
    for (k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = defaults[k];
    for (k in item) if (Object.prototype.hasOwnProperty.call(item, k)) out[k] = item[k];
    return out;
  }

  // 普通用户补齐 GM 权限字段（便于文档契约与 mock 出口一致），不改变原有演示数据
  var USER_GM_DEFAULTS = {
    role: "user", status: "active", muteUntil: 0, muteReason: "",
    banReason: "", bannedAt: 0, lastLoginAt: 0, mustChangePassword: false
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
    VERSION: 10, // v10：未发布期 stats 填 0、折线按 0 画贴底平线（不造假上升也不留白）
    AVATARS: AVATARS,
    NICK_ADJ: NICK_ADJ,
    NICK_ANIMAL: NICK_ANIMAL,
    SENSITIVE_WORDS: SENSITIVE_WORDS,
    TOPICS: TOPICS,
    EMOJI_LIBRARY: EMOJI_LIBRARY,
    PERIODS: PERIODS,
    CURRENT_PERIOD: 24,
    USERS: USERS_WITH_ROLE.concat([ADMIN_USER]),
    MESSAGES: MESSAGES_WITH_HIDDEN,
    COMMENTS: COMMENTS_WITH_HIDDEN,
    LIKES: LIKES,
    ADMIN_USER: ADMIN_USER,
    /** 内置保护账号：不可封禁 / 降级 / 改密 / 删除 */
    isProtectedUser: function (userId) { return Number(userId) === 9999; }
  };
})(window);
