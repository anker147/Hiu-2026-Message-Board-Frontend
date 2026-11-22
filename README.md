# Hiu-2026-Message-Board-Frontend

黑龙江外国语学院 2024 级计算机科学与技术三班全栈开发实战项目 — 留言板

> **前端 v1 · 纯前端交互原型**：依据《留言板PRD.docx》v1.4 与 Page 1 概念稿（biliboard × Stella · 玻璃拟态+Glow）实现的第一版前端。**所有数据留在前端**（Mock API + localStorage），无需后端即可完成全流程交互测试。

## 快速开始

无需构建、无需依赖——直接双击 `index.html`（file:// 可用），或起一个静态服务器：

```bash
python -m http.server 8080
# 打开 http://localhost:8080/index.html
```

**演示账号**（见页面左下角 ⚙ 演示面板）：
手机号 `13800000001` ~ `13800000006`（小满/阿泽/橘子汽水/匿名同学/树树/晚风），密码统一 `abc12345`。

**演示面板**功能：一键切换身份、重置演示数据、强制会话过期（验 401）、模拟网络失败（验“保留草稿重试”）、限流窗口计数查看。

## 目录结构

```
index.html            P-01 首页榜单 + P-03 发布表单区（内嵌，F5 两阶段定位）
post.html             P-03 独立发布页（Page 1 画布 03 整页呈现，与内嵌表单共享提交逻辑）
login.html            P-05 登录          register.html   P-02 注册
detail.html           P-04 详情/评论树    profile.html    P-06 个人中心
about.html            关于页（biliboard.uk/about 源码逐值复刻的 3D 气泡星座）  states.html  状态与规范样张页
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
  pages/*.js          board / post / auth / detail / profile / about / states / publishForm（共享表单）
```

## 设计稿画布 → 实现位置对照（Page 1 全部 20 块画布）

| 画布 | 内容 | 实现位置 |
|---|---|---|
| 00 概念总览 | 借鉴边界声明 | 约束性画布，落实于全局（无视频站字段/自有期次/文案集中管理） |
| 01 首页榜单 | P-01 六区榜单卡 | `index.html` |
| 02 注册 | P-02 表单+字段级错误 | `register.html` |
| 03 发布留言 | P-03 整页布局 | `post.html`（独立页）+ `index.html` 内嵌表单区（PRD 5.12 口径），共享 `publishForm.js` |
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

## 已实现功能（F1–F10 → 交互测试要点）

| 功能 | 前端表现 | 测试方式 |
|---|---|---|
| F1 注册 | 手机号正则/已注册/弱密码/两次不一致字段级定位；随机网名 + 8 选 1 emoji + 8 位展示 ID | 注册页输入 10 位手机号 → 固定文案“请输入 11 位大陆手机号”，不发请求 |
| F3 登录/退出 | 2001 密码错误、连续 5 次锁定 15 分钟（2002）、退出后令牌失效重放 401 | 演示面板换号；连续错 5 次密码 |
| F5 无刷新提交 | 防重锁 → 0–200ms scrollY 不动 → 平滑居中 → --blue 高亮 1800ms → 清空/复位/昵称保留 | 发布留言后观察高亮；`__boardTest.scrollYAt/highlightRemovedAt` 可断言 |
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
