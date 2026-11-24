/* ============================================================
 * 留言板 · 用户可见文案集中管理（PRD ADR-003）
 * ------------------------------------------------------------
 * 扁平点分键目录。v1 原型为 file:// 双击可用，以 JS 内嵌目录；
 * 接入 JSP 后端时按 ADR-003 抽为 ui-text.json?v=N 用原生
 * fetch / XMLHttpRequest 加载，键结构不变，本文件 loader 已预留。
 *
 * 契约：
 *  - t(key, params)            同步读取，未就绪返回键名
 *  - text(key, fallback, params) 兜底重载
 *  - {name} 占位符插值
 *  - data-text / data-text-placeholder / data-text-title / data-text-aria
 *    四类属性注入；宿主含子元素时跳过 text 替换并告警（防图标被吞）
 *  - 目录就绪派发 window 事件 text-ready；就绪不阻塞首屏、不抛错
 * ============================================================ */
(function (window) {
  "use strict";

  var VERSION = 5; // 文案变更必须递增（?v=N 防缓存，ADR-003）；v5：榜单卡新增本周热度/变化率/上周排名

  window.UI_TEXT = {
    /* —— 通用 —— */
    "common.about": "关于",
    "common.appName": "Msg Board",
    "common.ok": "确定",
    "common.cancel": "取消",
    "common.retry": "重试",
    "common.close": "关闭",
    "common.send": "发送",
    "common.submitting": "提交中…",
    "common.loading": "加载中…",
    "common.backHome": "回首页",
    "common.public": "公开",
    "common.edited": "已编辑",
    "common.anonymous": "热心同学",
    "common.viewProfile": "个人中心",
    "common.zone": "个人主页",
    "common.editProfile": "编辑资料",
    "common.private": "仅自己",
    "common.zone": "个人主页",
    "common.private": "仅自己",
    "common.myMessages": "我的留言",
    "common.logout": "退出登录",
    "common.hot": "热榜",
    "common.latest": "新帖",
    "common.mine": "我的留言",
    "common.searchPlaceholder": "搜索留言内容 / 作者 / 话题",
    "common.sort": "排序",
    "common.period": "期次",
    "common.sortHeat": "热度（默认）",
    "common.sortLatest": "最新",
    "common.sortLikes": "点赞",
    "common.sortComments": "评论",
    "common.periodCurrent": "第 {n} 期（本期）",
    "common.periodOngoing": "第 {n} 期（统计中）", // 热榜出版语义：当期周榜尚未发布
    "common.periodN": "第 {n} 期",
    "common.foundCount": "找到 {n} 条相关留言",
    "common.likes": "赞",
    "common.statViews": "浏览",
    "common.statComments": "评论",
    "common.statFavorites": "收藏",

    /* —— 相对时间 —— */
    "time.now": "刚刚",
    "time.minutesAgo": "{n} 分钟前",
    "time.hoursAgo": "{n} 小时前",

    /* —— 错误码文案（PRD 6.2，Ajax 与页面共用） —— */
    "error.401": "请先登录后继续",
    "error.1001": "请输入 11 位大陆手机号",
    "error.1002": "该手机号已注册，可直接登录",
    "error.1003": "密码至少 8 位，且需同时包含字母与数字",
    "error.1009": "展示 ID 生成失败，请稍后重试",
    "error.2001": "账号或密码错误",
    "error.2002": "失败次数过多，账号已锁定，请 {min} 分钟后再试",
    "error.4001": "请文明发言",
    "error.4002": "操作太频繁，请 {sec} 秒后再试",
    "error.5001": "内容不存在或已被删除",
    "error.5002": "只能修改或删除自己的内容",
    "error.5003": "评论最多两级，无法继续回复",
    "error.9001": "参数有误，请检查后重试",
    "error.9002": "登录状态已失效，请刷新后重试",
    "error.9003": "服务开小差了，请稍后重试",
    "error.network": "网络好像开了小差，请稍后再试",

    /* —— 顶栏 —— */
    "topbar.login": "登录",
    "topbar.identityTitle": "当前身份",
    "topbar.backTop": "回到顶部",

    /* —— Banner —— */
    "banner.title": "留言板热榜",
    "banner.titleNew": "本周新帖", // 新帖榜 tab：banner 标题随视图语义切换
    "banner.subtitle": "把今天想说的话，留在榜上",
    "banner.issue": "第 {n} 期 · {range}",
    "banner.ariaHot": "留言板热榜横幅",
    "banner.ariaNew": "本周新帖横幅",

    /* —— 首页榜单 —— */
    "board.rankLabel": "历史最高",
    "board.peakHot": "周榜最高",
    "board.peakNew": "新帖最高",
    "board.heatLabel": "本周热度",
    "board.changeRate": "较上周变化",
    "board.lastRank": "上周排名",
    "board.tabHot": "热榜",
    "board.tabLatest": "新帖",
    "board.tabMine": "我的留言",
    "board.sortDeltaUp": "上升",
    "board.sortDeltaDown": "下降",
    "board.sortDeltaFlat": "持平",
    "board.badgeNew": "NEW",
    "board.publishFloat": "发布一条留言",
    "board.blindboxFloat": "抽取今日盲盒",
    "board.quickPostPlaceholder": "写下你想说的话，支持话题标签…",
    "board.skeletonTitle": "榜单加载中",
    "board.stateEmptyTitle": "这里还没有留言",
    "board.stateEmptyDesc": "成为第一个留下足迹的人吧",
    "board.stateEmptyBtn": "发布第一条留言",
    "board.stateErrorTitle": "加载失败了",
    "board.stateErrorDesc": "网络好像开了小差，请稍后再试",
    "board.stateLoginTitle": "请先登录",
    "board.stateLoginDesc": "查看我的留言需要登录后使用",
    "board.searchNoResult": "没有找到与「{q}」相关的留言，换个关键词试试",

    /* —— 发布留言（P-03） —— */
    "post.title": "发布留言",
    "post.subtitle": "无刷新提交，成功后原地定位高亮，不跳回页首",
    "post.contentLabel": "留言内容",
    "post.contentMax": "最多 500 字",
    "post.contentPlaceholder": "写下你想说的话，支持话题标签",
    "post.tagLabel": "话题标签",
    "post.tagNone": "不设话题",
    "post.privacyLabel": "公开范围（独立控制）",
    "post.privacyName": "公开姓名",
    "post.privacyEmail": "公开邮箱",
    "post.privacyPhone": "公开手机号",
    "post.nicknameLabel": "本次显示昵称",
    "post.submit": "发布留言",
    "post.submittingNote": "提交中防重锁 · 滚动位置保持 · scrollY 偏差不超过 2px",
    "post.needLogin": "发布留言需要先登录",
    "post.successToast": "发布成功",
    "post.latestTitle": "最新发布",
    "post.backBoard": "返回热榜 →",
    "post.branchNote": "异常分支：敏感词就地提示并保留内容 · 限流显示剩余秒数 · 网络失败保留草稿可重试",

    /* —— 帖子编辑页（参考好游快爆 sendThreadShow 发帖器设计） —— */
    "editPage.title": "编辑帖子",
    "editPage.subtitle": "仅作者可编辑 · 保存后内容将标记「已编辑」",
    "editPage.originLabel": "原帖信息",
    "editPage.typeLabel": "帖子类型",
    "editPage.typePublic": "公开留言",
    "editPage.typePublicDesc": "进入榜单与他人视图，可被抽入盲盒",
    "editPage.typePrivate": "仅自己可见",
    "editPage.typePrivateDesc": "不进入榜单与他人视图，可在「我的留言」中查看",
    "editPage.toolbarEmoji": "表情",
    "editPage.titlePlaceholder": "标题（选填）· 48 字以内",
    "editPage.contentPlaceholder": "请输入内容",
    "editPage.modeNew": "新建",
    "editPage.modeEdit": "编辑",
    "editPage.settingsLabel": "设置",
    "editPage.publishSettings": "发布设置",
    "editPage.coverLabel": "设置封面",
    "editPage.coverNote1": "· 前端原型不包含图片上传（无后端存储）",
    "editPage.coverNote2": "· 图片能力接入后支持 JPEG / JPG / PNG",
    "editPage.disabledImageTip": "前端原型不支持图片上传",
    "editPage.disabledVideoTip": "前端原型不支持视频投稿",
    "editPage.disabledPollTip": "前端原型不支持投票帖",
    "editPage.disabledAtTip": "留言暂不支持 @ 用户",
    "editPage.disabledQuoteTip": "前端原型不支持引用功能",
    "editPage.disabledCoverTip": "前端原型不支持封面图片上传",
    "editPage.wordCount": "正文字数",
    "editPage.toolbarReset": "还原原文",
    "editPage.resetDone": "已还原为原文",
    "editPage.saveHint": "保存后内容标记「已编辑」 · 敏感词就地提示并保留草稿",
    "editPage.dangerZone": "危险操作",
    "editPage.dangerNote": "删除后不可恢复，评论与点赞一并清除",
    "editPage.needLoginDesc": "编辑帖子需要登录后使用",
    "editPage.noIdTitle": "缺少帖子参数",
    "editPage.noIdDesc": "请从详情页的「编辑」进入本页，或发布一条新留言",
    "editPage.goPublish": "去发布留言",
    "editPage.notMineTitle": "只能编辑自己的留言",
    "editPage.backDetail": "返回详情 →",

    /* —— 个人主页（参照好游快爆 zone 页设计） —— */
    "zone.maintabFeed": "动态",
    "zone.of": "{name} 的个人主页",
    "zone.bioEmpty": "这个人还没有写下签名",
    "zone.memberDays": "加入留言板 {n} 天",
    "zone.joinedAt": "注册于 {date}",
    "zone.statMessages": "留言",
    "zone.statComments": "评论",
    "zone.statLikes": "收到赞",
    "zone.editProfile": "修改资料与隐私",
    "zone.tabAll": "全部",
    "zone.tabMessages": "留言",
    "zone.tabComments": "评论",
    "zone.typePost": "发布了留言",
    "zone.typeReply": "评论了留言",
    "zone.quoteLabel": "TA 评论的原帖",
    "zone.quoteFrom": "来自 {topic}",
    "zone.aboutTitle": "关于 TA",
    "zone.aboutId": "展示 ID",
    "zone.aboutDays": "加入天数",
    "zone.aboutJoined": "注册时间",
    "zone.careerTitle": "留言生涯",
    "zone.careerMessages": "发布留言（条）",
    "zone.careerComments": "发表评论（条）",
    "zone.careerLikes": "收获点赞（个）",
    "zone.topicsTitle": "话题足迹",
    "zone.topicsUnit": "{n} 条留言",
    "zone.emptyTitle": "这里还没有动态",
    "zone.emptyDesc": "TA 还没有发布留言或评论",
    "zone.needIdTitle": "缺少用户参数",
    "zone.needIdDesc": "从榜单卡的作者昵称或身份菜单进入个人主页",
    "zone.userNotFound": "用户不存在或已注销",
    "zone.maskedChip": "姓名 {v}",

    /* —— 帖子编辑页（参考好游快爆 sendThreadShow 发帖器设计） —— */
    "editPage.title": "编辑帖子",
    "editPage.subtitle": "仅作者可编辑 · 保存后内容将标记「已编辑」",
    "editPage.originLabel": "原帖信息",
    "editPage.typeLabel": "帖子类型",
    "editPage.typePublic": "公开留言",
    "editPage.typePublicDesc": "进入榜单与他人视图，可被抽入盲盒",
    "editPage.typePrivate": "仅自己可见",
    "editPage.typePrivateDesc": "不进入榜单与他人视图，可在「我的留言」中查看",
    "editPage.toolbarEmoji": "表情",
    "editPage.toolbarReset": "还原原文",
    "editPage.resetDone": "已还原为原文",
    "editPage.saveHint": "保存后内容标记「已编辑」 · 敏感词就地提示并保留草稿",
    "editPage.dangerZone": "危险操作",
    "editPage.dangerNote": "删除后不可恢复，评论与点赞一并清除",
    "editPage.needLoginDesc": "编辑帖子需要登录后使用",
    "editPage.noIdTitle": "缺少帖子参数",
    "editPage.noIdDesc": "请从详情页的「编辑」进入本页，或发布一条新留言",
    "editPage.goPublish": "去发布留言",
    "editPage.notMineTitle": "只能编辑自己的留言",
    "editPage.backDetail": "返回详情 →",

    /* —— 个人主页（参照好游快爆 zone 页设计） —— */
    "zone.maintabFeed": "动态",
    "zone.of": "{name} 的个人主页",
    "zone.bioEmpty": "这个人还没有写下签名",
    "zone.memberDays": "加入留言板 {n} 天",
    "zone.joinedAt": "注册于 {date}",
    "zone.statMessages": "留言",
    "zone.statComments": "评论",
    "zone.statLikes": "收到赞",
    "zone.editProfile": "修改资料与隐私",
    "zone.tabAll": "全部",
    "zone.tabMessages": "留言",
    "zone.tabComments": "评论",
    "zone.typePost": "发布了留言",
    "zone.typeReply": "评论了留言",
    "zone.quoteLabel": "TA 评论的原帖",
    "zone.quoteFrom": "来自 {topic}",
    "zone.aboutTitle": "关于 TA",
    "zone.aboutId": "展示 ID",
    "zone.aboutDays": "加入天数",
    "zone.aboutJoined": "注册时间",
    "zone.careerTitle": "留言生涯",
    "zone.careerMessages": "发布留言（条）",
    "zone.careerComments": "发表评论（条）",
    "zone.careerLikes": "收获点赞（个）",
    "zone.topicsTitle": "话题足迹",
    "zone.topicsUnit": "{n} 条留言",
    "zone.emptyTitle": "这里还没有动态",
    "zone.emptyDesc": "TA 还没有发布留言或评论",
    "zone.needIdTitle": "缺少用户参数",
    "zone.needIdDesc": "从榜单卡的作者昵称或身份菜单进入个人主页",
    "zone.userNotFound": "用户不存在或已注销",
    "zone.maskedChip": "姓名 {v}",

    /* —— 状态样张页（画布 10/13/14/16/19） —— */
    "states.title": "状态与规范样张",
    "states.subtitle": "设计稿画布 10 / 13 / 14 / 16 / 19 的全部状态 UI 落地样张，均可交互测试",
    "states.fourStates": "四态样张（加载 / 空 / 错误 / 无权限）",
    "states.deltaBadges": "涨跌徽章四态（heat_delta 推导）",
    "states.top3": "Top3 排名三色（空心描边，只区分名次不代表涨跌）",
    "states.dropdownDemo": "自定义下拉展开态（spring ≤300ms · 选中回写 · 外点关闭）",
    "states.searchDemo": "搜索防抖 200ms · 命中高亮",
    "states.likeMachine": "点赞状态机（F8：未登录 401 / 未赞 +1 / 已赞 -1 / 幂等键防抖动）",
    "states.securityBars": "安检门提示（F10：敏感词 / 限流 / CSRF）",
    "states.snapshotDemo": "写时快照与已编辑标记（D-03）",
    "states.maskTable": "脱敏掩码规则（F6：Service 出口，列表只返回掩码）",
    "states.anonDemo": "盲盒匿名回复（F9/D-02：对作者显示「热心同学」）",
    "states.resetDemo": "提交成功表单复位三态（F5：内容清空 / 开关复位 / 昵称保留）",
    "states.emptyMatrix": "空态文案矩阵（空态必须说明下一步）",
    "states.loginGuide": "登录引导弹窗（流程 C：401 → 引导 → 回原位重试）",
    "states.openGuideBtn": "打开登录引导弹窗",
    "states.beforeSubmit": "提交前",
    "states.afterSubmit": "提交成功后",
    "states.machine1": "未登录点击",
    "states.machine2": "未赞 → 点击",
    "states.machine3": "已赞 → 再点",
    "states.machine4": "快速双击（幂等键相同）",
    "states.m1r": "401 + 引导登录，计数不变",
    "states.m2r": "liked=true，count +1",
    "states.m3r": "liked=false，count -1",
    "states.m4r": "最终 liked=true，count +1，不出现 ±抖动",

    /* —— 登录引导弹窗（流程 C） —— */
    "guide.title": "需要先登录才能继续",
    "guide.desc": "点赞 / 评论 / 发布 / 抽盲盒需要登录后使用，登录后将回到原位",
    "guide.btn": "去登录",

    /* —— 登录页（P-05） —— */
    "login.tabLogin": "账号登录",
    "login.tabReg": "注册账号",
    "login.skip": "暂不登录",
    "login.agree": "我已阅读并同意",
    "login.agreeDoc": "《用户协议》",
    "login.agreeRequired": "请先阅读并同意《用户协议》",
    "login.subtitle": "登录后即可留言 评论 点赞 抽盲盒",
    "login.phonePlaceholder": "请输入注册手机号",
    "login.pwdPlaceholder": "请输入密码",
    "login.submit": "登 录",
    "login.slogan": "留言板 · 把今天想说的话，留在榜上",
    "login.kicker": "MESSAGE BOARD · HIU 2026",
    "login.toRegister": "还没有账号",
    "login.registerLink": "去注册",
    "login.demoHint": "演示账号见左下角演示面板",

    /* —— 注册页（P-02） —— */
    "register.phonePlaceholder": "请输入 11 位大陆手机号",
    "register.pwdPlaceholder": "至少 8 位，含字母与数字",
    "register.confirmPlaceholder": "再次输入密码",
    "register.confirmMismatch": "两次输入的密码不一致",
    "register.namePlaceholder": "真实姓名",
    "register.emailPlaceholder": "邮箱地址",
    "register.hint": "注册后分配 8 位展示 ID 与 emoji 头像",
    "register.submit": "注册并进入留言板",
    "register.gotoLogin": "去登录",

    /* —— 详情页（P-04） —— */
    "detail.title": "留言详情与评论",
    "detail.commentTitle": "评论",
    "detail.commentTreeNote": "二级树状",
    "detail.commentPlaceholder": "写下你的评论",
    "detail.commentSubmit": "发送评论",
    "detail.replyPlaceholder": "回复 {name}：",
    "detail.reply": "回复",
    "detail.like": "点赞",
    "detail.delete": "删除",
    "detail.edit": "编辑",
    "detail.emptyTitle": "暂无评论，来抢沙发",
    "detail.emptyDesc": "给出下一步动作：发表第一条评论吧",
    "detail.notFound": "这条留言不存在或已被删除",
    "detail.notFoundBtn": "回到热榜",
    "detail.anonTag": "盲盒回复",

    /* —— 盲盒弹窗（P-07） —— */
    "blindbox.title": "盲盒回复",
    "blindbox.subtitle": "抽一条留言，送上匿名祝福，不暴露身份",
    "blindbox.draw": "抽一条留言",
    "blindbox.drawing": "抽取中…",
    "blindbox.drawnLabel": "抽中的留言",
    "blindbox.drawnMeta": "作者 {name} · 服务端留痕，对作者显示「热心同学」",
    "blindbox.replyLabel": "匿名回复",
    "blindbox.replyPlaceholder": "写下一句祝福，身份不会展示",
    "blindbox.replySubmit": "匿名发送",
    "blindbox.replyFailNote": "失败就地重试，命中敏感词保留输入",
    "blindbox.emptyTitle": "暂无可抽取的留言",
    "blindbox.emptyDesc": "大家还没有新的公开留言，先回首页看看吧",
    "blindbox.successToast": "祝福已匿名送达",
    "blindbox.needLogin": "抽盲盒需要先登录",

    /* —— 改删确认弹窗（P-08） —— */
    "confirm.deleteTitle": "删除这条留言",
    "confirm.deleteCommentTitle": "删除这条评论",
    "confirm.deleteWarn": "删除后不可恢复，请确认这是你自己的留言",
    "confirm.deleteCommentWarn": "删除一级评论会连同其下回复一并删除",
    "confirm.previewLabel": "原文预览",
    "confirm.cancel": "取消",
    "confirm.deleteBtn": "确认删除",
    "confirm.ownerNote": "仅作者渲染入口，他人不可见，直调接口返回 403",
    "confirm.deleteSuccess": "已删除",
    "edit.title": "编辑内容",
    "edit.save": "保存修改",
    "edit.successToast": "已保存，内容将标记「已编辑」",

    /* —— 个人中心（P-06） —— */
    "profile.title": "个人中心",
    "profile.privacyTitle": "隐私控制",
    "profile.privacyNote": "三项独立开关",
    "profile.flagName": "公开真实姓名",
    "profile.flagEmail": "公开邮箱",
    "profile.flagPhone": "公开手机号",
    "profile.privacyDesc": "Service 出口脱敏：列表只返回掩码，明文不入响应体；本人完整信息仅本页可见",
    "profile.nicknameTitle": "修改昵称",
    "profile.nicknameBtn": "修改昵称",
    "profile.nicknameSave": "保存",
    "profile.nicknamePlaceholder": "1–20 个字符",
    "profile.bioPlaceholder": "一句话签名（选填，展示在个人主页）",
    "profile.bioTooLong": "签名最多 60 个字符",
    "profile.breadcrumbHome": "个人主页",
    "profile.breadcrumbEdit": "编辑资料",
    "profile.nicknameLabel": "昵称",
    "profile.bioLabel": "个性签名",
    "profile.avatarTip": "点击更换 emoji 头像",
    "profile.nicknameRule": "1–20 个字符 · 修改后历史留言保留当时昵称",
    "profile.privacyValues": "隐私脱敏展示",
    "profile.sensitiveLabel": "敏感信息",
    "profile.realNameLabel": "真实姓名",
    "profile.emailLabel": "邮箱",
    "profile.accountLabel": "手机号（登录账号）",
    "profile.phoneNote": "手机号为登录账号，不可修改",
    "profile.sensitiveNote": "保存后按公开开关对外掩码展示；手机号不参与公开开关",
    "profile.emailInvalid": "邮箱格式不正确",
    "profile.sensitiveSaved": "敏感信息已更新",
    "profile.avatarTitle": "选择 emoji 头像",
    "profile.savedReload": "资料已保存",
    "profile.bioPlaceholder": "一句话签名（选填，展示在个人主页）",
    "profile.bioTooLong": "签名最多 60 个字符",
    "profile.snapshotNote": "新内容用新昵称，历史留言保留当时昵称",
    "profile.displayId": "展示 ID",
    "profile.myMsgTitle": "我的留言",
    "profile.realName": "真实姓名",
    "profile.email": "邮箱",
    "profile.phone": "手机号",
    "profile.emptyTitle": "还没有留言",
    "profile.emptyDesc": "去发布第一条留言吧",
    "profile.emptyBtn": "去发布",
    "profile.needLogin": "个人中心需要登录后查看",
    "profile.nicknameTooLong": "昵称需为 1–20 个字符",

    /* —— 关于页 —— */
    "about.title": "关于留言板",
    "about.subtitle": "一面面向同学的留言热榜 —— 站点简介、公开规则、团队与相关链接",
    "about.wmTop": "© 2024–2026 留言板 · HIU-24计科三班第一组 保留所有权利",
    "about.wmBottom": "© 2024–2026 留言板 · HIU-24计科三班第一组 保留所有权利",
    "about.heroTag": "把今天想说的话，留在榜上",
    "about.chipPost": "✏ 发布留言",
    "about.chipStates": "📋 状态样张",
    "about.chipRepo": "⭐ GitHub 仓库",
    "about.bubbleIntro": "简介",
    "about.bubbleWorks": "团队作品",
    "about.bubbleTeam": "团队成员",
    "about.bubbleLinks": "友情链接",
    "about.introDesc": "把今天想说的话留在榜上，为校园日常留一面会呼吸的墙",
    "about.worksDesc": "留言板前端 v1 · PRD v1.4 · Page 1 概念稿",
    "about.teamDesc": "黑龙江外国语学院 2024 级计科三班 全栈开发实战小组",
    "about.linksDesc": "课程实训项目 · PRD 与设计稿 · 参考来源声明",
    "about.footer": "© 2024–2026 留言板 · HIU-24计科三班第一组 保留所有权利",

    "about.introTitle": "站点简介",
    "about.introBody": "留言板是黑龙江外国语学院 Java Web 课程综合实训项目：注册 → 登录 → 留言 → 评论/回复 → 点赞 → 隐私控制 → 退出 全链路可用。核心操作（提交 / 点赞 / 盲盒回复）全部 Ajax 无刷新，提交后原地定位高亮，不跳回页首。榜单字段、隐私脱敏与安全基线均按 PRD v1.4 可测验收。",
    "about.introPoint1": "公开数据范围：榜单只展示留言内容、昵称快照、展示 ID、话题标签、统计与热度",
    "about.introPoint2": "隐私脱敏：姓名 / 邮箱 / 手机号在 Service 出口掩码，明文不进列表响应体",
    "about.introPoint3": "期次语义：自有周榜期次（第 21–24 期），不搬运任何参考站业务字段",
    "about.worksTitle": "团队作品",
    "about.worksBody": "课程实训产出清单，全部随仓库交付：",
    "about.worksItem1": "《留言板PRD》v1.4 —— 需求基线（F1–F10 / API-01~12 / 第九章 UI 规范）",
    "about.worksItem2": "Page 1 概念稿 —— biliboard × Stella · 玻璃拟态+Glow，20 块画布",
    "about.worksItem3": "留言板前端 v1 —— 原生 HTML/CSS/JS + Mock 数据交互原型",
    "about.teamTitle": "团队成员",
    "about.teamBody": "2024 级计算机科学与技术三班 · 全栈开发实战小组",
    "about.teamItem1": "团长 —— 需求评审、参考站勘查与变更登记",
    "about.teamItem2": "产品 / 需求分析师 —— PRD 撰写与四维度交叉评审",
    "about.teamItem3": "全栈研发师 —— 五层架构与前端交互落地",
    "about.teamItem4": "质量测试官 —— Given/When/Then 用例与必测清单",
    "about.teamItem5": "增长运营师 —— 成功度量与埋点漏斗",
    "about.linksTitle": "友情链接",
    "about.linksBody": "项目与参考来源（答辩可追溯）：",
    "about.linksNote": "严禁迁移参考站业务数据语义（视频字段 / 期次语义 / 角色立绘）",

    /* —— 演示控制面板 —— */
    "debug.title": "演示控制",
    "debug.identity": "切换身份",
    "debug.data": "数据与状态",
    "debug.reset": "重置演示数据",
    "debug.expire": "强制会话过期",
    "debug.netFail": "模拟网络失败",
    "debug.rateWindow": "限流窗口：{n}/3 次",
    "debug.sensitive": "敏感词测试：留言中包含「加微信 / 代考 / 办证 / 刷单」",
    "debug.lockout": "登录锁定测试：连续输错密码 5 次触发 2002",
    "debug.accounts": "演示账号：13800000001~06，密码 abc12345",
    "debug.resetDone": "演示数据已重置",
    "debug.expiredDone": "会话已过期（模拟 30 分钟超时）",

    /* —— Toast —— */
    "toast.likeOn": "已点赞",
    "toast.likeOff": "已取消点赞",
    "toast.loginSuccess": "登录成功",
    "toast.registerSuccess": "注册成功",
    "toast.logoutDone": "已退出登录",
    "toast.nicknameSaved": "昵称已更新，新内容将使用新昵称",
    "toast.privacySaved": "隐私设置已更新",
    "toast.viewPlus": "浏览 +1"
  };

  /* ---------- 目录状态 ---------- */
  var ready = false;

  function interpolate(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return (k in params) ? String(params[k]) : m;
    });
  }

  /** 同步读取：未就绪返回键名（ADR-003：不阻塞首屏、不抛错） */
  function t(key, params) {
    var raw = window.UI_TEXT && Object.prototype.hasOwnProperty.call(window.UI_TEXT, key)
      ? window.UI_TEXT[key] : key;
    return interpolate(raw, params);
  }

  /** 兜底重载：目录未就绪或缺键时返回 fallback */
  function text(key, fallback, params) {
    if (window.UI_TEXT && Object.prototype.hasOwnProperty.call(window.UI_TEXT, key)) {
      return interpolate(window.UI_TEXT[key], params);
    }
    return interpolate(fallback, params);
  }

  /**
   * data-text* 四类属性注入。
   * 宿主已含子元素时跳过 text 替换并告警（防图标节点被吞）。
   */
  function apply(root) {
    root = root || document;
    var i, el;
    // data-text
    var textEls = root.querySelectorAll("[data-text]");
    for (i = 0; i < textEls.length; i++) {
      el = textEls[i];
      if (el.children.length > 0) {
        console.warn("[ui-text] 宿主含子元素，跳过 data-text 注入:", el);
        continue;
      }
      el.textContent = t(el.getAttribute("data-text"));
    }
    // data-text-placeholder
    var phEls = root.querySelectorAll("[data-text-placeholder]");
    for (i = 0; i < phEls.length; i++) {
      el = phEls[i];
      el.setAttribute("placeholder", t(el.getAttribute("data-text-placeholder")));
    }
    // data-text-title + aria 同步（ADR-003：title 注入后同步写入 aria-label）
    var titleEls = root.querySelectorAll("[data-text-title]");
    for (i = 0; i < titleEls.length; i++) {
      el = titleEls[i];
      var tv = t(el.getAttribute("data-text-title"));
      el.setAttribute("title", tv);
      el.setAttribute("aria-label", tv);
    }
    // data-text-aria
    var ariaEls = root.querySelectorAll("[data-text-aria]");
    for (i = 0; i < ariaEls.length; i++) {
      el = ariaEls[i];
      el.setAttribute("aria-label", t(el.getAttribute("data-text-aria")));
    }
  }

  /** v1：目录随脚本同步内嵌即就绪；接入后端后改为 fetch ui-text.json?v=N */
  function init() {
    ready = true;
    apply(document);
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("text-ready", { detail: { version: VERSION } }));
    }
  }

  window.HMB = window.HMB || {};
  window.HMB.i18n = {
    t: t,
    text: text,
    apply: apply,
    isReady: function () { return ready; },
    version: VERSION
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
