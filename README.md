# Hiu-2026-Message-Board-Frontend

黑龙江外国语学院 2024 级计算机科学与技术三班全栈开发实战项目 — 留言板

> **前端 v1 · 纯前端交互原型**：依据《留言板PRD.docx》v1.4 与 Page 1 概念稿（biliboard × Stella · 玻璃拟态+Glow）实现的第一版前端。**所有数据留在前端**（Mock API + localStorage），无需后端即可完成全流程交互测试。

## 快速开始

无需构建、无需依赖——直接双击 `pages/index.html`（file:// 可用），或起一个静态服务器：

```bash
python -m http.server 8080
# 打开 http://localhost:8080/pages/index.html
```

**演示账号**（见页面左下角 ⚙ 演示面板）：
手机号 `13800000001` ~ `13800000006`（小满/阿泽/橘子汽水/匿名同学/树树/晚风），密码统一 `abc12345`。

**演示面板**功能：一键切换身份、重置演示数据、强制会话过期（验 401）、模拟网络失败（验“保留草稿重试”）、限流窗口计数查看。

## 目录结构

```
pages/                全部页面（同目录互链，资源用 ../ 引用根目录的 css/js/fonts）
  index.html          P-01 首页榜单（F5 发布流程已移至编辑器新建模式 edit.html?mode=new）—— 入口页
  post.html           P-03 原独立发布页（已并入帖子编辑器：仅重定向 edit.html?mode=new）
  login.html          P-05 登录          register.html   P-02 注册
  detail.html         P-04 详情/评论树    profile.html    P-06 个人中心
  edit.html           帖子编辑页（参考好游快爆 sendThreadShow 发帖器设计：fid→话题标签 / type→可见类型）
  zone.html           个人主页（参考好游快爆 zone/user 页设计：头部资料/动态流/关于·生涯·话题侧栏）
  about.html          关于页（biliboard.uk/about 源码逐值复刻的 3D 气泡星座）  states.html  状态与规范样张页
css/
  tokens.css          设计令牌（PRD 9.2：--blue #359EFF 等全部 CSS 变量 + reduced-motion 降级）
  base.css            重置 / grain 噪点 / 焦点环 / active scale(0.97) / 逐层进入 25ms
  components.css      按钮/输入/开关/下拉/弹窗/榜单卡/评论树/四态
  pages.css           顶栏/Banner/搜索栏/表单/认证页/详情/个人中心/关于页/样张页 + 760px 断点
js/
  ui-text.js          ADR-003 文案集中管理（点分键 + t()/text() + data-text* 注入 + text-ready）
  mock/seed.js        种子数据（Page 1 画布 01/04/07/16 原值：6 条第 24 期留言、用户、评论树、词库）
  mock/db.js          localStorage 持久化（hmb_ 前缀）+ 重置
  mock/api.js         API-01~12 Mock：统一响应包 + 全部错误码 + 会话/CSRF/敏感词/限流/脱敏/幂等/盲盒留痕
  core/util.js        工具 + window.__boardTest 测试钩子（PRD 7.2）+ 演示控制面板（含页面导览）
  components.js       共享组件（顶栏/榜单卡/评论树/登录引导/改删确认/编辑/盲盒弹窗）
  pages/*.js          board / auth / detail / edit / zone / profile / about / states（编辑器统一承接发布表单，publishForm.js/post.js 已并入 edit.js 后移除）
```

## 设计稿画布 → 实现位置对照（Page 1 全部 20 块画布）

| 画布 | 内容 | 实现位置 |
|---|---|---|
| 00 概念总览 | 借鉴边界声明 | 约束性画布，落实于全局（无视频站字段/自有期次/文案集中管理） |
| 01 首页榜单 | P-01 六区榜单卡 | `index.html` |
| 02 注册 | P-02 表单+字段级错误 | `register.html` |
| 03 发布留言 | P-03 整页布局 | `edit.html`（新建模式整页呈现，画布 03 原布局）；index 内嵌表单区按 v1.1 用户决定移除，发布入口=浮动按钮/编辑器 |
| 04 详情/评论 | P-04 二级树 | `detail.html` |
| 05 登录 | P-05 | `login.html` |
| 06 个人中心 | P-06 隐私三开关 | `profile.html` |
| 07 盲盒弹窗 | P-07 | `index.html` 内浮层（抽取今日盲盒） |
| 08 改删确认弹窗 | P-08 | 详情页/个人中心/榜单卡触发 |
| 09 关于页 | 3D 气泡星座，参数逐值取自参考站编译产物：14 气泡规格表（top/left/z/rotateY/scale/尺寸）、hero #47474C + 信息气泡 #D2D1D6、鼠标视差（容器 ±2° 旋转 + 气泡 ±25/15px 平移）、bubble-float 每气泡随机振幅时长、背景原子：追风杯 Tp-director-system 环境光斑思路（对角两团 blur(100px) 色斑：--blue 左上 .24 / --accent 右下 .20，令牌取色、静态无纹理，替换参考站噪点层）、水平镜像水印、点击居中展开 #fbfbfd 面板 + 其余气泡 blur(1.5px) 后推，可交互卡触发区 = 独立轴对齐 box（.bubble-hitbox，卡外扩 32px，仅随锚点+视差平移、不受 rotateY/scale 变形影响，视觉卡 pointer-events:none、展开时恢复），装饰卡 pointer-events:none 不拦截、Sora 字体（Google Fonts，离线降级系统字体）。不触发装饰气泡内容为星座星象图剪影（中性色连线星座图，套用与原 emoji 相同的 ghost 滤镜，与卡片装扮色完全解耦）；装扮色保持最初配色：浅卡 #D2D1D6 / 深卡 #47474C（星象图剪影与底色解耦） | `about.html` |
| 10 核心状态与边界态 | 7 张状态卡 | `states.html` + 各页动态状态 |
| 11 响应式 760px | 断点规则 | `css/pages.css` 760px 断点 |
| 12 流程与四态矩阵 | 流程 A/B/C | 三条流程均可走通（见测试表） |
| 13 榜单控件与徽章 | 下拉/徽章四态/Top3 三色/搜索 | `states.html` + 首页真实控件 |
| 14 点赞状态机与身份态 | F8 四态 + 身份下拉 | `states.html` + 卡片红心 + 顶栏身份菜单 |
| 15 表单提交细节 | CSRF/复位三态/字段定位 | `states.html` + 各表单 |
| 16 隐私掩码与身份展示 | 掩码表 + 热心同学 | `states.html` + profile/榜单卡 |
| 17 按压态示意 | active scale(0.97) | `css/base.css` 全局按钮 |
| 18 卡片信息架构解剖 | 六区卡 | `js/components.js` renderCard |
| 19 状态语义与四态 | 四态样张卡 | `states.html` |
| 20 设计令牌 | 令牌色卡 | `css/tokens.css` |

## 帖子编辑页（参考好游快爆 sendThreadShow 发帖器设计）

参考 URL：`https://bbs.3839.com/index.php?m=api&c=thread&a=sendThreadShow&fid=159&type=1`（好游快爆发帖/编辑页，需登录态方可打开，按其接口语义与发帖器形制设计）。入口：详情页属主「编辑」按钮跳转 `edit.html?id=`（评论仍用编辑弹窗）。

| 参考端概念 | 本项目映射 | 实现位置 |
|---|---|---|
| fid=159 版块选择 | 话题标签选择（`SEED.TOPICS` 白名单词库，发布/编辑共用，编辑可改，服务端校验白名单） | `edit.html` tagRow / `mock/api.js` updateContent |
| type=1 帖子类型 | 帖子可见类型：公开留言 / 仅自己可见（isPublic 首次可写落地：榜单/搜索对他人过滤、盲盒候选排除、他人直开详情 → 5001） | `edit.html` typeRow / `mock/api.js` |
| 标题输入 | 不设（数据语义红线：无 title 字段） | — |
| 正文 + 工具栏（表情/图片/话题） | 留言内容 + 工具栏：表情弹层光标处插入（`SEED.EMOJI_LIBRARY` 24 枚）/ 还原原文 / 500 字上限提示（PRD 9.7 不设计数器）；图片/视频上传不设（无后端存储与 cover_url 红线） | `edit.js` insertAtCursor |
| 发布按钮 | 保存修改（API-07 防重锁，成功回详情）+ 危险区删除（P-08 确认弹窗复用，级联清评论/点赞，成功回热榜） | `edit.js` |

**交互与测试要点**：访问控制四态（未登录引导 / 5001 状态盒 / 非本人 5002 / 缺参引导发布）；读取原文不计浏览（`getMessage(id, {countView:false})`）；保存分支 4001 敏感词 / 9002 / 网络失败就地提示保留草稿（流程 B），成功回详情并标记「已编辑」（详情主卡、原帖信息条、列表 `edited` 字段）；「仅自己可见」自测：他人列表/搜索不可见、直开详情 5001、作者自己视图可见并显示「仅自己」；删除走 P-08 确认后回热榜。

## 个人主页（参考好游快爆 zone/user 页设计）

参考 URL：`https://www.3839.com/zone/user/157978`（好游快爆用户公开主页：头部资料区 + 动态 tab + 关于我/游戏生涯/荣誉勋章/关注论坛侧栏）。入口：身份菜单「个人主页」、榜单卡/详情页作者昵称点击，URL `zone.html?u=<展示ID>`（参照 zone/user/157978 的用户 ID 寻址），访客可看。

| 参考端概念 | 本项目映射 | 实现位置 |
|---|---|---|
| 头部：头像/昵称/认证徽章/ID/签名/关注·粉丝 | emoji 头像 + 昵称 + 展示 ID chip + 个性签名（bio，个人中心可编辑）+ 本人标记；统计行映射为 留言 / 评论 / 收到赞（不虚构关注关系与关注按钮） | `zone.html` hero |
| 动态大 tab（动态/游戏/游戏单） | 仅保留动态域；子筛选 全部 N / 留言 N / 评论 N（映射 全部/评价/帖子/回复 计数 chips） | `zone.js` tabs |
| 动态流（TA发表的帖子 / TA回复的帖子+引用卡） | 留言项（内容 + 统计 + 话题 chip）/ 评论项（评论内容 + 「TA 评论的原帖」引用卡：摘要 + 来自 #话题 + @原作者），统一按时间倒序，点击进详情 | `zone.js` feed |
| 关于我（爆龄/性别/IP属地） | 关于 TA：展示 ID / 加入天数（爆龄→加入留言板 N 天）/ 注册时间；不虚构性别与 IP 属地 | `zone.js` side |
| 游戏生涯（331 款 / 8370 小时） | 留言生涯：发布留言 / 发表评论 / 收获点赞（三条大数字行） | `zone.js` side |
| 荣誉勋章 + 关注论坛 | 话题足迹：TA 发布留言的话题分布（话题 + 条数，映射论坛卡「xx 讨论」形制）；勋章体系不设（无对应数据） | `zone.js` side |

**红线与测试要点**：

- **F9/D-02 匿名红线**：盲盒匿名回复绝不出现在作者主页（接口层按 `isAnonymous` 过滤，前端无法通过主页反查匿名作者）。
- **F6 脱敏**：主页只返回掩码字段，且仅在本人公开开关开启时非空；真实姓名/邮箱/手机号明文永不出现在他人主页。
- **可见类型联动**：「仅自己可见」的留言与其下评论，对他人主页不可见；本人主页可见（isSelf 才返回）。
- 自测：身份菜单/卡片作者进入主页 → 统计与动态计数一致；切子筛选；评论动态引用卡点击回原帖详情；个人中心改签名 → 主页即时生效；未注册展示 ID → 「用户不存在或已注销」状态盒；缺 `?u=` → 缺参状态盒。

## 已实现功能（F1–F10 → 交互测试要点）

| 功能 | 前端表现 | 测试方式 |
|---|---|---|
| F1 注册 | 手机号正则/已注册/弱密码/两次不一致字段级定位；随机网名 + 8 选 1 emoji + 8 位展示 ID | 注册页输入 10 位手机号 → 固定文案“请输入 11 位大陆手机号”，不发请求 |
| F3 登录/退出 | 2001 密码错误、连续 5 次锁定 15 分钟（2002）、退出后令牌失效重放 401 | 演示面板换号；连续错 5 次密码 |
| F5 无刷新提交 | 防重锁 → 0–200ms scrollY 不动 → 平滑居中 → --blue 高亮 1800ms → 清空/复位/昵称保留 | 在编辑器新建模式（`edit.html?mode=new`）发布留言后观察高亮；`__boardTest.scrollYAt/highlightRemovedAt` 可断言 |
| F6 隐私控制 | 三项独立开关；列表接口只返回掩码（王*/abc***@qq.com/138****5678）；明文仅 API-08 个人中心 | 个人中心开“公开真实姓名” → 榜单卡显示“姓名 王*” |
| F7 树状评论 | 二级回复 + @引用（展示 ID 为准）、已编辑标记、删一级评论级联删子树、owner 校验 5002 | 详情页评论/回复/编辑/删除 |
| F8 点赞 | 四态状态机 + 幂等键（350ms 内双击复用 → 最终 +1 不抖动）；未登录 401 引导弹窗 | 快速双击红心看计数 |
| F9 盲盒 | 随机抽他人公开留言；匿名回复显示“热心同学”，服务端留痕、前端绝不返回真实身份 | 首页右下“抽取今日盲盒” |
| F10 安检门 | 敏感词（加微信/代考/办证/刷单）→ 4001“请文明发言”；发留言 10 秒滑窗 >3 次 → 4002 剩余秒数 | 留言中输入“代考”；连续快速发 4 条 |
| 四态 | 骨架 shimmer ≤300ms / 空态（含下一步动作）/ 错误重试 / 无权限引导 | 期次切到“第 21 期”看空态；演示面板“模拟网络失败” |

**测试钩子**（PRD 7.2）：`window.__boardTest = { navCount, scrollYAt(t), highlightRemovedAt, skeletonAt(), dropdownState() }`。

## 与 PRD 的实现取舍（v1 原型说明）

- **纯前端 Mock**：`js/mock/api.js` 模拟全部 12 个接口与错误码，接入 JSP/Servlet 后端时替换为 fetch 薄适配层，页面零改动。密码为演示明文（真实系统 PBKDF2 加盐）。
- **文案目录以 JS 内嵌**（file:// 双击可用）；接后端时按 ADR-003 抽为 `ui-text.json?v=N` + fetch，键结构不变。
- **发布表单“公开姓名/邮箱/手机号”开关**：v1 与 P-06 用户级开关联动（提交时同步保存，成功后按 F5 复位开关）。PRD 与设计稿对开关语义存在张力，已在代码注释标注。
- **限流范围**：按 PRD F10 仅对“发留言”限流；评论/回复/盲盒回复仅做敏感词过滤。
- **500 字计数 UI**：按 PRD 9.7“不借鉴”条款未实现计数器，仅保留“最多 500 字”提示。
- **F5 高亮视觉**：`--blue-soft` 底 + `--blue` 描边渐隐动画（1800ms），满足“主色高亮”语义；严格“背景==#359EFF”的断言留待评审定夺。
- 接口扩展：`updatePrivacy / updateNickname / getMessage` 为 mock 层补充（PRD 接口清单未列，前端闭环需要）。
- **数据语义红线**：无任何视频站字段（title/UP主/播放/弹幕/投币/cover_url）与“第 128 期/术力口”语义；期号为自有周榜期次（第 21~24 期）。
- **导航栏 v2（透明顶栏 + 暗玻璃导航岛，状态语言参考追风杯 Tp-director-system）**：Transparent Nav（顶栏无背景色/分隔线，Logo 与登录/身份胶囊直接落在页面背景上）；三 tab 导航岛本体 = 暗玻璃胶囊：底色做深 rgba(30,41,59,.34) + 蓝粉折射色渐变（--blue-pale→--pink-pale，透彩玻璃）+ 斜向高光条 + 白亮玻璃边 rgba(255,255,255,.55) + 内圈折射环 + 浮起投影；页顶两团淡色环境光斑（body::before/::after，蓝 .18 / 粉 .15，blur 90px，追风杯 tp-ambient 语言）供玻璃磨砂透出（blur(20px) saturate(1.5)），滚动时内容穿过岛后即显磨砂，透明质感可读；当前项 = 近实白玻璃胶囊（rgba(255,255,255,.92) + 渐变高光面 + 边缘一圈细高光 inset 0 0 0 1px #fff + 加重悬浮投影），与暗岛形成强对比突出；全站页面均标注当前项（榜单页=当前 tab，个人中心=我的留言）；导航岛于顶栏三列网格（1fr auto 1fr）严格居中——两翼为 Logo 与登录/身份胶囊，与两侧宽度差无关（1440/1024/768/600/390px 实测 centerOffset=0、零溢出，600px 档 Logo 收至 14px 单行）；切换时胶囊以 WAAPI 做液态滑动（left/width 双边编排，560ms 五段关键帧）：前缘先冲 80% 行程、胶囊体沿移动方向大幅拉长（长跳实测峰值 ≈1.96× 终宽、相邻跳 ≈1.55×，并 scaleY 压扁补体积），后缘再追赶收拢；到位整体越过目标 ≈8% 后弹性回弹落定，prefers-reduced-motion 降级为直落；当前项 = 淡蓝文字 + 大写字距英文副行 HOT/LATEST/MINE；未选中 tab 折叠为纯图标（文字块 width→0、gap/padding 收紧），当前项展开——宽度以弹性缓动 cubic-bezier(.3,1.35,.4,1) 过冲回弹（360ms，width/gap/padding 同步），胶囊几何由隐形克隆行测终态（折叠/展开过渡会改全行几何，实时 offset 会读到瞬态值）；未选中 #475569 保持暗岛可读；全导航 180ms 快过渡；榜单页 tab 为软切换（history.replaceState + 列表就地重载，不触发文档导航，navCount=0）；修复：renderTopbar 内身份按钮曾与导航胶囊同名闭包变量（var pill 覆盖），导致登录态下 placePill/slidePillTo 错操作身份按钮、导航胶囊恒为 0 宽——已改名 idPill；:root 声明 color-scheme: light（全站 HTML 同步 meta）防浏览器强制暗色反转浅色设计；修复：tab 点击处理器闭包捕获的是加载时 activeTab 且永不更新，软切走后"点回加载时 tab"被误判为无操作（点击失效）——已改为可变当前项 current 并随切换同步；loadList 加请求序号守卫，快速连切 tab 时丢弃过期响应，防慢返回覆盖新 tab 的列表。新增淡色令牌：--blue-pale #8FC1EE / --blue-pale-ink #4E88B8 / --pink-pale #F6B9C9（原色降曝光降饱和，色彩记忆规则）；600px 紧凑档防长品牌名溢出。
- **关于页展开卡标题栏（照搬 biliboard.uk/about 源码移植）**：从其编译产物 AboutContent 分包逐行移植 ia 标题牌组件及其全部依赖（Ae TextBox / n0/qt/pe/de/br/xr/N1/B1/E1/C1/I1 并集轮廓追踪 / R1·yr sigmoid 缓动 / Oe clip-path / Le 擦入进度 / wr 偏移测量），仅将 React refs/useState 换成等价 DOM 对象，常量 t0 原值保留（WIPE 1200ms、READ_DELAY 1500ms、OVERLAP_Y 24px、OVERLAP_X 10px、BORDER 1px、字号 12×1.8）；结构：上行大字 + 底行悬挂于顶行右下（top-full right-0，marginTop -24px、left 100%、marginLeft -9px）向右探出，每行 base/reveal 双层 TextBox（bg-white/20、px-2 py-1、font-pixel），clip-path inset 左→右擦入；phase 0-6 状态机：复位→顶行擦入→底行擦入→读 1500ms→擦出/新层擦入（错峰 960ms=1200×0.8）→提升→循环；描边 = 各擦入子矩形外扩半线宽后 I1 网格追踪并集外轮廓，rAF 每帧重算 d 属性；窗口 resize 重测量；面板关闭时 destroy（清 timer/rAF/resize）。字体照搬：fonts/fusion-pixel.woff2（缝合像素，OFL 开源）+ @font-face，标题牌与气泡闲置文字同为像素字体；原 h3 标题/hero-brand 块移除，移动端弹窗保留 h3 标题；Close 按钮/stone-200 分隔线/面板 flex 列独立滚动同前版；测试 M8 断言牌+Close+分隔线+描边路径 d 值。
- **关于页四项优化**：①点击触发：3D 透视下命中盒偶被更深平面（卡片 translateZ）竞争跳过——document 捕获阶段增加按坐标找回命中盒的兜底分发器（closest 失败后遍历命中盒矩形做点内判定），真鼠标连点四卡 100% 触发（测试 M15）；②简介卡 logo 回归：展开面板恢复 hero-brand（Board 标 + 留言板 + 副题），闲置简介卡图标位改 logo 标记（.bubble-logo，参考站简介卡即 logo）；③友链面板改参考站表现形式：{name,url} 两列网格（≥640px 双列）、每项 p-2.5 rounded-lg 行、名称左 + 外链箭头右、hover 淡蓝底 + 右移 4px + 名称变蓝（--blue 令牌），数据 LINKS 常量（GitHub 仓库 / Biliboard 参考站 / Stella 状态秩序参考）；④气泡卡打开/关闭全部过渡改线性（transform/width/height 500ms、背景/边框/阴影/滤镜 300ms、面板与闲置层 400-500ms，全部 linear）。
- **关于页五项优化（第二轮）**：①打开改变速提速：展开路径 300ms 快出缓入 cubic-bezier(0.2,0.9,0.3,1)（宽高/位移），色彩类 200ms；收合路径保持线性 400ms（区分 .is-active 开/关两条 transition）；面板开 280ms 变速 / 关 400ms 线性，闲置层 250ms；②闲置简介卡图标恢复最初版（通用评论图标），展开面板内 hero-brand logo 保留；③简介展开卡三胶囊按钮与正文间距 16px→8px；④展开卡实心分层：.bubble-card.is-active pointer-events:auto + 分发器展开卡矩形守卫，Close/面板内点击不再穿透触发其他卡片；⑤导航岛加入第四项"关于"（info 图标 + ABOUT 副行，整页跳转不参与软切换），ui-text 新增 common.about，关于页岛内"关于"项激活且胶囊落位（测试 M0），A5 断言岛 4 项，全宽度溢出复测为零。
- **跨页到达入场 + 页面过渡去闪屏**：①整页跳转到达后岛内当前项播“展开入场”——文字弹性展开（CSS 360ms 过渡）与胶囊自中心 0 宽弹性撑开至槽位（WAAPI 520ms，scaleY .55→1 + 淡入）同拍进行，reduced-motion 直落；字体后到时仅在入场收尾后瞬态校正几何；②slidePillTo/入场动画 finished 后自 cancel（fill 残留不再污染 getAnimations）；③页面切换去闪屏：util 拦截同站锚链接（排除外链/锚点/修饰键/新标签）→ .bb-veil 淡出 140ms → 跳转，到达页 body 淡入 160ms（bb-page-in），遮罩色取 --bg 与页面同底色；应用内软切换 stopPropagation 不交给过渡层；reduced-motion 直跳。CSS 见 base.css。
- **展开卡飞行动画**：wrap 增加 top/left/transform 位移过渡（此前 top/left 瞬移、只有尺寸在原地展开）——打开 300ms 快出缓入曲线从原位滑向中心并同步长大，关闭 400ms 线性滑回原位；背景态推挤（--txb）与鼠标视差经同一过渡平滑化，命中盒 transform 300ms linear 同步跟随；实测 works 飞行轨迹 x 272→452→720 平滑连续。
- **“关于”并入导航岛软切换（用户方案：about 成为 index 页内视图）**：index.html 以 #boardView 包裹榜单内容、新增 #aboutView 挂载点（hidden）；about.js 双模式重构——standalone（about.html 原样保留，直接打开仍可用）与 embedded（惰性构建场景壳+气泡，HMB.pages.about.show/hide，hide 时收合未关闭展开卡）；board.js switchTab 接受 about：隐藏榜单视图/显示关于视图/使在途列表响应过期，?tab=about 直达同样生效；components.js 关于项并入软切换（胶囊滑动+折叠展开全程有动画，standalone about.html 上点击为无操作）；悬浮操作组移入 boardView 随视图隐藏；测试 A17/A17b：视图切换+胶囊落位+navCount=0+切回榜单列表恢复，106→108 断言全过。
- **登录页重做（mail.163.com 形式，入口/版权按需砍除）**：深色全屏（页顶 #10151f 与主区连续），顶栏仅 logo+口号（右侧多余入口全砍）；主区左品牌右白卡——左：像素字渐变大标题 + 口号行 + 三枚特性胶囊；右：白色登录卡（账号登录标题 / 手机号+密码占位输入 / 密码显隐眼形按钮 / 错误行 / 大蓝间距按钮 / 去注册 / 演示面板提示），无 QR/免登录/协议条款/页脚 ICP；登录页不再渲染岛顶栏（renderTopbar 元素守卫，注册页保留）；auth.js 新增密码显隐绑定；ui-text 更新 login.title=账号登录、新增 login.slogan、移除 3 个废弃键。
- **登录页第二轮（五项）**：①背景：picsum 公开图站随机自然景观（7 张预置图集随机取一张，1920×1080，15% 不透明度，离线 onerror 静默回落纯深色底）；②左品牌区与登录卡向中心收拢（justify-center + clamp 间距）；③新增“暂不登录”幽灵按钮（同卡登录表单内，直接进榜单访客态）；④注册并入登录卡：双 tab（账号登录/注册账号，蓝色下划线），切换时卡高自然拉伸（先钉住旧高→测新自然高→300ms 变速过渡→收尾清 inline），1002 引导链接改同页切回登录 tab 并带号填充；register.html 删除（auth.js initRegister 原绑定与校验原样迁入）；⑤用户协议：卡底勾选行 + 《用户协议》弹窗（6 条教学项目条款），未勾选提交被拦（错误条提示 + 协议行抖动动画），登录/注册两个提交入口共用校验。
- **登录页第三轮（冬季背景 + 追风杯节奏）**：①背景图集换冬季主题：picsum 6 张雪景/冷调图（1036 雪山村庄 / 866 雪丘马特洪峰 / 869 雪夜星空 / 903 雪原银河 / 1044 冷雾河谷 / 1045 雾山，逐张目检确认），随机一张；②加载不唰一下：new Image() 预载 → onload 换 src + is-loaded 类 → CSS opacity 0→0.15 渐显 0.9s + 微缩放 1.045→1（1.6s），离线静默回落；③排版按追风杯 Tp-director-system 节奏：品牌区加 kicker（12px/900/0.35em 大字距蓝字）+ 标题字距 0.08em/字重 900 + splash 式渐变分隔条（220px 2px），卡内 tab 下距 26px、字段间距 16px、卡内边距 34px 40px；品牌区与登录卡间距加档（clamp 72px~220px）——字和窗口拉开；④入场动效按追风杯 tpSplashIn 语言：hero 淡入+微缩放 0.55s、品牌区上升 0.5s（延迟 0.12s）、卡片浮入 0.5s（延迟 0.2s）错峰到达。
- **按钮乱码解码动效（scramble text）**：登录/发布留言/抽取今日盲盒/发布一条留言/重试/去登录等按钮 hover 时触发——mouseover 委托到 [data-scramble]（动态渲染的重试/去登录同样命中），字符从左到右逐位"解锁"（18%+72%×位置阈值），未解锁位从站内字库随机取字（热榜/盲盒/留言板/评论等站内词 + 数字符号混排），空格保持原位，总时长 460ms ≤0.5s，播完 350ms 冷却防连播，reduced-motion 不启用。测试 I6：hover 后 rAF 采样捕获乱码帧且收尾还原原文。
- **帖子编辑页接口扩展（保持向后兼容）**：`getMessage` 增可选 `opts.countView`（编辑预览不计浏览）与 isPublic=false 可见性校验；`updateContent` 增 `topic`（TOPICS 白名单校验）与 `isPublic` 参数，未传参保持原值（评论编辑弹窗不受影响）；`toListMessage` 增 `edited` 展示字段；「仅自己可见」为 isPublic 字段首次可写落地，榜单/搜索/盲盒/详情按可见类型过滤。
- **个人主页接口扩展**：用户模型增 `bio` 签名（注册默认空，个人中心与昵称一并编辑，≤60 字）；新增 `getZone({displayId})` 聚合接口（公开面用户信息 + 留言/评论动态 + 掩码字段按本人开关 + 话题足迹统计），匿名评论按 F9 红线在接口层过滤，非本人请求不返回 isPublic=false 内容。
- **P-03 发布表单统一并入帖子编辑器（v1.1 用户决定）**：edit.html 双模式——无参或 `?mode=new` 为新建（承接原发布表单全部语义：F5 两阶段定位、公开范围开关、本次昵称、防重锁、敏感词/限流就地提示），`?id=` 为编辑；index 榜单中间的快捷发布行与内嵌表单区移除，发布入口=浮动「发布一条留言」按钮/编辑器；post.html 仅保留重定向；publishForm.js/post.js 并入 edit.js 后移除；个人中心「我的留言」编辑改跳编辑页（评论仍用弹窗）。
