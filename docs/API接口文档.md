# Hiu-2026 留言板 · 后端 API 接口文档

> 版本 v1.0 · 2026-11-24 · 面向后端开发同学
>
> 本文档由前端现有 Mock 层（`js/mock/api.js`）反向整理，是**前后端契约基线**。
> 前端已完成纯前端原型；接入真实后端时，把 `js/mock/api.js` 替换为 `fetch` 薄适配层即可，**页面零改动**。
> 因此：**入出参结构、字段白名单、错误码语义必须与本文完全一致**，否则前端需要改代码。

---

## 0. 通用约定

### 0.1 响应包（所有接口统一）

```json
{
  "success": true,
  "code": 0,
  "message": "ok",
  "data": { }
}
```

- 失败时 `success:false`、`code` 为下表错误码、`message` 为可直接展示给用户的中文文案、`data` 为 `{}`。
- **前端不解析后端 message 做逻辑判断，只看 `code`**；但 message 会直接展示，需保证中文可读。

### 0.2 鉴权与会话

| 项 | 规则 |
|---|---|
| 会话载体 | `Authorization: Bearer <token>`（Mock 用 localStorage，真实后端用 Header/Cookie 均可） |
| Token 有效期 | 空闲 30 分钟超时 → 401；每次请求顺延 `lastActive` |
| 写操作鉴权 | 除登录/注册/查询类外，所有写接口必须校验 `csrf` 参数与会话中的 csrf 一致 |
| CSRF 缺失/错误 | 9002 |
| 退出登录 | Token 立即失效；重放旧 Token → 401 |

**需要 `csrf` 参数的接口**：postMessage / postComment / postReply / updateContent / deleteContent / like / favorite / blindboxReply / updatePrivacy / updateNickname / updateSensitive / logout。
**不需要 csrf**：register / login / getMessages / getMessage / getComments / getProfile / getSession / getZone / getBlindbox。

### 0.3 错误码总表（code 固定，不可改）

| code | 含义 | 默认文案 |
|---|---|---|
| 0 | 成功 | ok |
| 1001 | 手机号格式错误 | 请输入 11 位大陆手机号 |
| 1002 | 手机号已注册 | 该手机号已注册，可直接登录 |
| 1003 | 密码强度不足 | 密码至少 8 位，且需同时包含字母与数字 |
| 1009 | 展示 ID 生成失败 | 展示 ID 生成失败，请稍后重试 |
| 2001 | 账号或密码错误 | 账号或密码错误 |
| 2002 | 连续失败 5 次锁定 15 分钟 | 失败次数过多，账号已锁定，请 {min} 分钟后再试 |
| 4001 | 敏感词拦截 | 请文明发言 |
| 4002 | 限流（发留言 10 秒滑窗 >3 次） | 操作太频繁，请 {sec} 秒后再试 |
| 5001 | 内容不存在（含私密帖被他人直开） | 内容不存在或已被删除 |
| 5002 | 非本人操作（owner 校验） | 只能修改或删除自己的内容 |
| 5003 | 评论层级超限（最多两级） | 评论最多两级，无法继续回复 |
| 9001 | 参数校验失败 | 参数有误，请检查后重试 |
| 9002 | CSRF 校验失败 | 登录状态已失效，请刷新后重试 |
| 9003 | 服务异常 | 服务开小差了，请稍后重试 |
| 401 | 未登录 / 会话失效 | 请先登录后继续 |
| -1 | 网络失败（前端演示开关，后端不必实现） | 网络好像开了小差，请稍后再试 |

### 0.4 安全与数据口径（务必实现）

| 机制 | 要求 |
|---|---|
| 密码存储 | **PBKDF2 / bcrypt 加盐哈希**。Mock 里是明文演示，真实后端严禁明文 |
| 脱敏（F6） | **列表类接口只返回掩码**：姓名 `王*`、邮箱 `abc***@qq.com`、手机 `138****5678`。明文**仅 `GET /profile` 本人可见** |
| 敏感词（F10） | 覆盖：发留言 / 评论 / 回复 / 编辑 / 盲盒回复。词表可配置（种子 44 词，分广告引流 / 刷单诈骗 / 博彩 / 违禁服务 / 垃圾营销五类；后台 G15 可继续增删） |
| 限流（F10） | **仅发留言**：同账号 10 秒滑窗 >3 次 → 4002，返回剩余秒数。评论/回复/盲盒回复只过敏感词，不过限流 |
| 幂等（F8） | 点赞接口接收 `idemKey`，**同一 key 重复请求必须返回当前状态，不得 +2/-1 抖动**。建议 `(user_id, target_id)` 唯一约束兜底 |
| 匿名红线（F9） | 盲盒匿名回复：输出层 `authorName` 固定为「热心同学」、`authorAvatar=0`、`authorDisplayId=""`、`isAnonymous=true`，且 `isMine=false`。**任何接口都不得返回匿名作者真实身份**；真实身份只留审计表 |
| 可见类型 | `is_public=false` 的帖子：他人列表/搜索/详情/盲盒候选一律不可见（详情返回 5001），作者本人可见并带「仅自己」标识 |
| 级别校验 | 评论最多二级：对 `depth>=2` 的评论回复 → 5003 |
| owner 校验 | 改/删/编辑前必须校验 `owner_id == 当前用户`，否则 5002（防 IDOR） |

### 0.5 ⚠️ 排行榜计算边界（重要）

**后端只回传原始统计字段与真实历史数据；前端只算当前期的折合分与排序。**

```
后端提供:  stats{views, likes, comments, favorites} + period + createdAt
           + weeklyStats[] + heatDelta + heatHistory[] + lastRank + peakRank + peakNewRank
前端计算:  折合分(heat) / 当前期排序 / 各周热度（按同一公式逐周实时折算）
前端展示:  历史字段按后端返回值展示；缺失一律显示 0（上周排名显示 --）
           完整周榜卡首次上榜时用本次真实名次展示历史最高（仅展示，不回写；搜索结果不兜底）；本周新帖不显示历史最高
           折线图最多显示 8 周（超过 8 期只取最近 8 期，不足前面补 0），一期一个真实点；0 值/未发布期按 0 画贴底平线（不估算、不伪造热度），期次下拉不承载任何排名信息
```

原因：得分公式与时间修正由前端 `HMB.util.rankBoard` 统一实现，biliboard 公示口径：

```
t = ln(e^d + 1) + 1        d = 投稿时间 − 该帖所属期次统计起点(天)，钳制 [0,7]
得分 = 浏览×1×t + 评论×1 + 点赞×2 + 收藏×5     （绝对分，前端以「万」展示）
```

- `heatDelta`：相对上周变动百分比（12.4 表示 +12.4%），后端原样透传；缺失时前端胶囊显示 `0%`。
- `weeklyStats[]`：逐周**原始统计**，按时间从远到近排列（每项 `{period:number, stats:{views,likes,comments,favorites}, empty?:boolean}`）。可返回任意期数（例如跨 24 期的老帖给 24 项）；前端最多画 8 周：超过 8 期只取末尾最近 8 期，不足 8 期在前面按 0 补齐。后端只给原始 stats；前端用与当前期相同的 `messageScore` 公式逐周实时折算热度并画折线。
  - **一个点 = 一期真实数据**：只有「发布期 → 本期」之间的周有真实统计；发布前的周带 `empty:true`、stats 填 0。前端把 0 值期**按 0 画成贴底平线**（不是留白、也不是伪造一段上升）：新帖前面是平线、有数据的期次抬起来。**不估算、不伪造热度**，0 就是真实的没有量。
  - `heatHistory[]` 优先级更高；若后端已能直接给真实历史热度序列，前端按该序列画折线，不重复折算。
  - 历史最高 `peakRank/peakNewRank` 为 0 时显示 `--`，不显示「第 0 名」；仅完整周榜单榜卡（非搜索结果）在 `peakRank=0` 且已有当前名次时，用该真实名次展示历史最高，本周新帖不显示历史最高。
- `heatHistory[]`：真实热度序列（每项 `{value:number}`），优先级高于 `weeklyStats`；可返回任意期数，前端最多取最近 8 期；缺失的期次前端补 0，不做反推/扰动/估算。
- `lastRank`：上周名次；没有就是 `0`，展示为 `--`。**不得用 peakRank、当前名次或变化率倒推。**
- `peakRank` / `peakNewRank`：历史最高名次，由后端在周榜结算时写入并透传；前端不在浏览时反写补算或持久化，仅按上述展示口径处理。
- **不要**在响应里返回 `heat` 字段——前端会自行计算并覆盖。
- **不要**对 `getMessages` 的结果做排序——前端按固定规则自行排序，后端按 `createdAt DESC` 返回即可。
- 排名规则由榜单类型固定，不向用户开放选择：热度周榜 / 本周新帖按折合分，我的留言按最新。

### 0.6 正文内容格式（富文本排版）

编辑器提供 Word 式排版（字体 / 字号 / 标题 / 有序无序列表 / 首行缩进 / 对齐 / 加粗斜体下划线）。
`content` 字段改为**受限 HTML 片段**，后端按以下规则处理：

1. **字数与敏感词按可见纯文本计算**：去标签后 1~500 字，标签本身不计入字数。
2. **白名单标签**：`p div span br b strong i em u h1~h6 ol ul li blockquote`。
3. **白名单样式属性**：`font-family / font-size / text-indent / text-align / font-weight / font-style / text-decoration / color`。
4. 必须剔除 `script / style / iframe / object / embed / svg / img / video / audio` 等标签，
   以及所有 `on*` 事件属性、`javascript:` / `url()` / `expression` 等危险值。
5. 历史纯文本数据保持兼容，前端会按纯文本渲染；不需要数据迁移。

字体选择使用系统字体或本地打包的免费开源字体（思源黑体 / 霞鹜文楷 / Fusion Pixel，OFL 许可），
**不得引入需要商业授权的字体文件**。

> **图片不入正文**：帖子为纯文字排版，**不做图文混排**。`content` 白名单持续剔除 `img`；
> 用户上传的图片走独立字段（头像 `avatarUrl`、文末图 `images[]`）单独渲染，见 §0.7。

### 0.7 图片与头像存储方案（本次新增）

设计参考追风杯导播系统：**业务字段只存字符串引用，不存二进制**；引用解析失败时回退默认资源。
本站是前后端分离项目，在此基础上补一个上传接口 + 文件表，业务层契约与追风杯保持一致（字段都是字符串引用）。

**核心约定（务必实现）**

1. **业务字段只存引用字符串**：头像 `avatarUrl`、文末图 `images[]` 元素均为不透明字符串引用，
   后端不解析、不改写含义，原样入库、原样出口。
2. **上传接口返回引用**：`POST /api/upload` 返回 `{ ref, url }`。`ref` 为稳定引用串，`url` 为可直接渲染的 CDN 地址；
   二者等价，前端只保存其一。
3. **默认回退**：`avatarUrl` 为空 / 引用失效时，前端回退到 `avatarEnum` emoji 头像；
   `images[]` 中失效引用被跳过，不影响其余图片。
4. **数量与格式限制**：头像单张；文末图最多 **10 张**、按数组顺序展示；
   仅接受 `image/jpeg|png|gif|webp`，单张 ≤ **5 MB**。超限 → 9001。
5. **本地原型（Mock）**：无后端上传，`ref` 形如 `localimg://<id>`，本体是 dataURL 存浏览器
   `localStorage['hmb_v1_media']`；生产把上传换成对象存储、返回 CDN URL 即可，**业务字段与渲染逻辑无需改动**。
6. **内容口径不变**：图片渲染在正文**末尾**（独立区块），`content` 内仍禁止 `img`；字数/敏感词只按可见文字算，图片不计数。

---

## 1. 接口清单总览

| # | 接口 | 方法 | 路径 | 鉴权 | csrf |
|---|---|---|---|---|---|
| 01 | 注册 | POST | `/api/register` | 否 | 否 |
| 02 | 登录 | POST | `/api/login` | 否 | 否 |
| 03 | 退出 | POST | `/api/logout` | 是 | 是 |
| 04 | 留言列表（含搜索/全站） | GET | `/api/messages` | 否 | 否 |
| 04W | 发布留言 | POST | `/api/messages` | 是 | 是 |
| 05 | 发表评论 | POST | `/api/comments` | 是 | 是 |
| 06 | 发表回复 | POST | `/api/replies` | 是 | 是 |
| 07a | 编辑内容 | PUT | `/api/content/{resourceId}` | 是 | 是 |
| 07b | 删除内容 | DELETE | `/api/content/{resourceId}` | 是 | 是 |
| 08 | 个人中心（明文唯一出口） | GET | `/api/profile` | 是 | 否 |
| 09 | 评论树 | GET | `/api/messages/{resourceId}/comments` | 否 | 否 |
| 10 | 点赞/取消 | POST | `/api/like` | 是 | 是 |
| 10b | 收藏/取消 | POST | `/api/favorite` | 是 | 是 |
| 11 | 抽取盲盒 | GET | `/api/blindbox` | 是 | 否 |
| 12 | 盲盒匿名回复 | POST | `/api/blindbox/reply` | 是 | 是 |
| E1 | 单条详情 | GET | `/api/messages/{resourceId}` | 否 | 否 |
| E2 | 个人主页聚合 | GET | `/api/zone?displayId=...` | 否 | 否 |
| E3 | 隐私开关 | PUT | `/api/profile/privacy` | 是 | 是 |
| E4 | 昵称/签名/头像 | PUT | `/api/profile/nickname` | 是 | 是 |
| E5 | 敏感信息编辑 | PUT | `/api/profile/sensitive` | 是 | 是 |
| E6 | 会话查询 | GET | `/api/session` | 否 | 否 |
| U1 | 图片上传（头像/文末图） | POST | `/api/upload` | 是 | 是 |

> 计 21 条路由（Mock 层 17 个方法：API-01~12 中 07 拆两路由、06 与 05 共用实现、加 7 扩展；U1 为本地存储实现，无需后端）。

---

## 2. 接口详情

### API-01 注册 `POST /api/register`

**入参**

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| phone | string | 是 | `^1[3-9]\d{9}$`，否则 1001；重复 → 1002 |
| password | string | 是 | ≥8 位且同时含字母与数字，否则 1003 |
| name | string | 否 | 真实姓名 |
| email | string | 否 | 邮箱 |

**服务端生成**：8 位 `displayId`（首位非 0、全局唯一，重试 5 次失败 → 1009）；随机网名（词库形容词+动物）；头像 `avatarEnum` 1~8 随机。注册成功即建会话。

**出参** `{ displayId, nickname, avatar }`

---

### API-02 登录 `POST /api/login`

**入参** `phone`（同上正则）、`password`

**逻辑**：连续失败 5 次 → 锁定 15 分钟（2002，带 `min` 分钟数）；密码错误 2001。恒定时间比较防时序攻击。成功建会话。

**出参** `{ displayId, nickname, avatar }`

---

### API-03 退出 `POST /api/logout`

**入参** `csrf`。销毁会话，Token 立即失效。**出参** `{}`

---

### API-04 留言列表（含"所有帖子"） `GET /api/messages`

> ⭐ 这是"所有帖子"功能依赖的核心接口，前端所有列表视图（留言板热度周榜/本周新帖/我的留言/搜索/全站页）共用它。

**查询参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `tab` | enum | `hot` \| `latest` \| `mine`，默认 `hot` |
| `sort` | enum | 兼容字段，可忽略。当前前端固定传 `heat`（我的留言为 `latest`），不向用户开放排序选择 |
| `period` | int | 期次号（21~24）。**仅 `latest` 生效**，筛选该期新帖；`hot` 忽略此参数 |
| `q` | string | 搜索词，匹配 haystack = `title + content + nicknameSnapshot + topicTag`（不区分大小写） |
| `csrf` | — | 不需要 |

**tab 语义**

| tab | 数据范围 | 鉴权 |
|---|---|---|
| `hot` | **全站所有公开帖子**（不限发帖期次）—— 即"所有帖子"，前端命名为「留言板热度周榜」 | 无需登录 |
| `latest` | `period` 指定期次的新帖 | 无需登录 |
| `mine` | 当前用户自己的帖子 | **未登录 → 401** |

**过滤规则（与 tab 无关，始终生效）**

1. `is_public=false` 的帖子对非作者不可见；
2. `q` 搜索按 haystack 子串匹配；
3. 按 `createdAt DESC` 返回（**前端自行排序**）。

**出参**

```json
{
  "list": [
    {
      "resourceId": "string",
      "title": "string（选填，≤48）",
      "content": "string（可见文字≤500，可为白名单 HTML 排版片段）",
      "nicknameSnapshot": "string（发帖时昵称快照）",
      "avatarEnum": 1,
      "avatarUrl": "localimg://img-xxx（发帖时头像 URL 快照，可空；空则回退 avatarEnum）",
      "images": ["localimg://img-xxx", "localimg://img-yyy"],
      "displayId": "20849317",
      "topicTag": "校园日常",
      "createdAt": 1730000000000,
      "stats": { "views": 12000, "likes": 328, "comments": 46, "favorites": 89 },
      "heatDelta": 12.4,
      "weeklyStats": [
        { "period": 17, "empty": true, "stats": { "views": 0, "likes": 0, "comments": 0, "favorites": 0 } },
        { "period": 24, "stats": { "views": 12000, "likes": 328, "comments": 46, "favorites": 89 } }
      ],
      "heatHistory": [{ "value": 0 }, { "value": 0 }],
      "lastRank": 0,
      "peakRank": 0,
      "peakNewRank": 0,
      "no": "7f3a9c21",
      "isNew": true,
      "isPublic": true,
      "period": 24,
      "edited": false,
      "isMine": false,
      "maskedName": "王*",
      "maskedEmail": "",
      "maskedPhone": ""
    }
  ],
  "total": 8,
  "likedIds": ["resourceId1", "resourceId2"]
}
```

| 字段 | 说明 |
|---|---|
| `avatarUrl` | ⭐ 本次新增：发帖时头像 URL 快照（字符串引用，见 §0.7）；为空/失效时前端回退 `avatarEnum` emoji。历史数据缺字段按空串处理 |
| `images` | ⭐ 本次新增：文末图片引用数组，最多 10 张、按数组顺序在正文末尾独立渲染；失效引用跳过。历史数据缺字段按 `[]` 处理 |
| `isMine` | ⭐ **新增字段**（本次"所有帖子"功能需要）：当前用户是否为作者。未登录恒 `false`。前端据此显示"编辑/删除"入口 |
| `maskedXxx` | F6 掩码，受用户三项公开开关控制；未开启时返回空串 |
| `heatDelta` | 相对上周变动百分比，后端原样透传；缺失时前端显示 `0%` |
| `weeklyStats` | 逐周原始统计 `[{period,stats,empty?}]`，可返回任意期数；前端最多画最近 8 期，按同一公式逐周折算，一个点 = 一期真实数据；发布前的周带 `empty:true`、stats 填 0，前端按 0 画贴底平线；**不接受估算值** |
| `heatHistory` | 真实热度序列（含 `empty?` 标记），优先级高于 `weeklyStats`；可返回任意期数，前端最多取最近 8 期；0 值/未发布期按 0 画贴底平线；**不接受估算值** |
| `lastRank` | 上周名次；`0` = 无数据，前端显示 `--`；**禁止用其他字段倒推** |
| `peakRank` / `peakNewRank` | 历史最高名次，由后端结算写入并透传；首次为 `0`，前端周榜单榜可用当前真实名次展示兜底，不回写后端 |
| `likedIds` | 当前用户点过赞的 targetId 列表；未登录为 `[]` |

> **不要返回**：`ownerId`、`account`、`email`、`password`、`realName` 明文、`heat`、`rank`。

---

### API-04W 发布留言 `POST /api/messages`

**入参**

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| title | string | 否 | ≤48 字，过敏感词 |
| content | string | 是 | 可见文字 1~500 字，可为白名单 HTML 排版片段；过敏感词 + 限流（见 §0.6）；**不得含 `img`**（图片走 `images`） |
| nickname | string | 否 | 1~20 字；非空且与现昵称不同时**更新用户昵称** |
| topic | string | 否 | 必须在 `TOPICS` 白名单：校园日常/互助/食堂/求助/盲盒/日常 |
| images | string[] | 否 | ⭐ 本次新增：文末图引用数组，最多 10 张，仅接受上传接口返回的引用；去重、超长截断、非法引用丢弃（见 §0.7） |
| csrf | string | 是 | — |

**服务端生成**：`resourceId`(UUID)、`no`(8位随机)、`ownerId`=会话用户、`nicknameSnapshot`=本次昵称、`avatarEnum`=用户头像、`avatarUrlSnapshot`=用户当前头像 URL（本次新增）、`displayId`、`isPublic=true`、`period`=当前期次、`createdAt`=now、`stats` 全 0、`heatDelta=0`、`peakRank=0`、`peakNewRank=0`、`isNew=true`。

**安检门**：敏感词(4001) → 限流(4002, 10秒滑窗>3次) → 记录本次时间戳。

**出参** 同 API-04 的 list 元素结构（单条）。

---

### API-05 发表评论 `POST /api/comments`

**入参** `messageId`(必填)、`content`(可见文字 1~500，白名单 HTML)、`nickname`(选填)、`csrf`

**逻辑**：一级评论 `depth=1, parentId=null`；`atDisplayId` 留空。敏感词门（无限流）。`message.stats.comments += 1`。

**出参** 评论对象（见 API-09 字段）。

---

### API-06 发表回复 `POST /api/replies`

**入参** `messageId`、`parentId`、`content`、`nickname`、`atDisplayId`（选填）、`csrf`

**逻辑**：`parentId` 不存在 → 5001；父评论 `depth>=2` → 5003（最多二级）；`depth=2`，`rootId=parent.rootId||parent.resourceId`；`atDisplayId` **自动取父作者展示 ID**（前端传入值会被覆盖），`atAuthorName` 自动取父作者昵称（匿名父则为「热心同学」）。

**出参** 同 API-05。

---

### API-07a 编辑内容 `PUT /api/content/{resourceId}`

**入参** `content`(必填,可见文字 1~500 的白名单 HTML)、`title`(选填,≤48)、`topic`(选填,白名单)、`isPublic`(选填,bool)、`images`(选填,string[] 最多 10 张,见 §0.7)、`csrf`

**逻辑**：
- 先查帖子，再查评论（同一接口按 resourceId 分发）；
- owner 不符 → 5002；不存在 → 5001；
- 敏感词门（无限流）；
- 未传的 `title`/`topic`/`isPublic`/`images` **保持原值**；传 `images` 则**整体替换**文末图数组（不是追加）；
- 标记 `edited=true`。

**出参** 帖子 → 列表元素结构；评论 → `{}`。

---

### API-07b 删除内容 `DELETE /api/content/{resourceId}`

**入参** `csrf`（resourceId 在路径）

**逻辑**：owner 校验 → 5002；删帖子时**级联删除其全部评论与相关点赞**（单事务）；删评论时同步 `message.stats.comments -= 1`。**出参** `{}`

---

### API-08 个人中心 `GET /api/profile`

未登录 → 401。**这是全站唯一返回明文个人信息的接口。**

**出参**

```json
{
  "displayId": "20849317", "nickname": "小满", "avatarEnum": 1,
  "avatarUrl": "localimg://img-xxx（可空，空则用 avatarEnum 回退）",
  "account": "13800000001", "realName": "王小满", "email": "xiaoman@hiu.edu.cn",
  "bio": "喜欢在晚自习后去操场看晚霞",
  "flagName": true, "flagEmail": false, "flagPhone": false,
  "maskedName": "王*", "maskedEmail": "xiao***@hiu.edu.cn", "maskedPhone": "138****0001"
}
```

---

### API-09 评论树 `GET /api/messages/{resourceId}/comments`

帖子不存在 → 5001。**出参**

```json
{
  "list": [
    {
      "resourceId": "c1", "messageId": "m1", "parentId": null,
      "depth": 1,
      "authorName": "小满", "authorAvatar": 1, "authorDisplayId": "20849317",
      "atDisplayId": "", "atAuthorName": "",
      "content": "...", "createdAt": 1730000000000, "likes": 3,
      "edited": false, "isAnonymous": false, "isMine": true,
      "replies": [ { "...": "同结构，depth=2" } ]
    }
  ],
  "total": 8
}
```

- 顶层与回复均按 `createdAt ASC`（旧→新）；
- 匿名回复：`authorName="热心同学"`、`authorAvatar=0`、`authorDisplayId=""`、`isAnonymous=true`、`isMine=false`；
- `total` = 帖子的 `stats.comments`。

---

### API-10 点赞/取消 `POST /api/like`

**入参** `targetId`（帖子或评论 ID）、`idemKey`（幂等键，前端生成）、`op`（`like`|`unlike`，选填，缺省则按当前状态切换）、`csrf`

**逻辑**
- 未登录 → 401（计数不变）；CSRF 错 → 9002；目标不存在 → 5001；
- **幂等**：同一 `idemKey` 重复请求 → 直接返回当前状态，不重复变更；
- `like` 且未赞 → 插入关系 + 计数 +1；`unlike` 且已赞 → 删关系 + 计数 −1（下限 0）；其余状态保持。

**出参** `{ "liked": true, "count": 329 }`

> 后端建议：`likes(user_id, target_id)` 唯一索引；`idem_keys(key, user_id, created_at)` 表或 Redis 去重。

**详情/评论出口补充**：`GET /api/messages/{id}` 返回 `isLiked`、`isFavorite`（当前访问者视角）；`getComments` 每条评论返回 `isLiked`、`isFavorite`、`favorites`，供详情页点亮爱心/星标。未登录恒为 `false`。

---

### API-10b 收藏/取消 `POST /api/favorite`

**入参** `targetId`（帖子或评论 ID）、`idemKey`（与点赞**分开**的幂等键，前端加 `fav-` 前缀）、`op`（`favorite`|`unfavorite`，选填，缺省按当前状态切换）、`csrf`

**逻辑**：与 API-10 对称——未登录 401、CSRF 错 9002、目标不存在 5001；同一 `idemKey` 重复请求只返回当前状态；`favorite` 且未收藏 → 写关系 + 计数 +1，`unfavorite` 且已收藏 → 删关系 + 计数 −1（下限 0）。

**出参** `{ "favorite": true, "count": 90 }`

> 后端建议：`favorites(user_id, target_id, created_at)` 唯一索引；幂等键复用了 `idempotency_keys` 时务必按接口类型区分 key 命名空间，避免与点赞冲突。

---

### API-11 抽取盲盒 `GET /api/blindbox`

未登录 → 401。**候选集**：他人 + `is_public=true` + 内容非空。随机取 1 条。无候选 → `{ "message": null }`。

**出参** `{ "message": { ...列表元素结构, "authorNickname": "...", "authorDisplayId": "..." } }`

---

### API-12 盲盒匿名回复 `POST /api/blindbox/reply`

**入参** `messageId`、`content`(1~500)、`csrf`

**逻辑**：敏感词门（无限流）；写入评论 `isAnonymous=true`、`authorName="热心同学"`、`authorAvatar=0`、`authorDisplayId=""`、真实 ownerId 只入**审计表**；`message.stats.comments += 1`。

**出参** 匿名评论对象（`isMine=false`，绝不泄露真实身份）。

---

### E1 单条详情 `GET /api/messages/{resourceId}`

- `is_public=false` 且非作者 → 5001；不存在 → 5001；
- 浏览 +1（best-effort）；
- **出参 = 列表元素 + `isMine`**（编辑器读取原文时用 `?countView=false` 参数跳过浏览 +1）。

---

### E2 个人主页聚合 `GET /api/zone?displayId={id}`

用户不存在 → 5001（`zone.userNotFound`）。访客可看，无需登录。

**出参**

```json
{
  "isSelf": false,
  "user": {
    "displayId": "20849317", "nickname": "小满", "avatarEnum": 1,
    "avatarUrl": "localimg://img-xxx（可空，空则用 avatarEnum 回退）",
    "bio": "...", "createdAt": 1730000000000,
    "maskedName": "王*", "maskedEmail": "", "maskedPhone": ""
  },
  "memberDays": 30,
  "stats": {
    "messages": 6,
    "comments": 12,
    "likesReceived": 328,
    "peakMessages": 3,
    "peakComments": 5,
    "peakLikes": 120
  },
  "canSeeLiked": true,
  "canSeeFavorite": true,
  "liked": { "posts": [], "comments": [] },
  "favorite": { "posts": [], "comments": [] },
  "messages": [ { "...": "公开帖子列表（他人不可见私密帖）" } ],
  "comments": [ { "...": "非匿名评论 + 引用原帖摘要" } ],
  "topics": [ { "tag": "校园日常", "count": 3 } ],
  "blindboxMessages": [
    {
      "replyId": "comment-uuid",
      "content": "祝你每天都开心",
      "createdAt": 1730000000000,
      "target": {
        "resourceId": "message-uuid",
        "title": "一起去看晚霞吧",
        "excerpt": "正文前 60 字"
      }
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `blindboxMessages` | ⭐ 本次新增：**仅 `isSelf=true` 时返回自己送出的盲盒匿名回复**（按 `blindbox_replies.real_owner_id` 关联），他人访问恒为 `[]`。回复内容来自匿名评论本身，不返回真实身份以外的作者信息 |
| `canSeeLiked` / `canSeeFavorite` | 主页是否展示「我赞过的 / 我收藏的」主 tab：本人恒 `true`；他人按 `users.flagLiked` / `flagFavorite` 决定 |
| `liked` / `favorite` | 对应互动域的 `{ posts[], comments[] }`，均按时间倒序；评论项沿用 `comments[]` 结构（含引用原帖）。他人且开关关闭时出口返回空列表，不泄露互动记录 |

**红线**：匿名回复绝不出现在作者主页的公开动态里；只有发送者本人在自己主页的独立区块可见自己的送出记录；
私密帖对他人不可见；掩码字段受本人开关控制。

---

### E3 隐私开关 `PUT /api/profile/privacy`

**入参** `flagName`、`flagEmail`、`flagPhone`、`flagLiked`、`flagFavorite`（均 bool）、`csrf`。**出参** `{}`

> `flagLiked` / `flagFavorite` 只控制**他人访问个人主页**时能否看到「我赞过的 / 我收藏的」；本人始终可见。缺省保留原值，默认 `true`。`getProfile` 同步返回这两个字段供设置页回填。

### E4 昵称/签名/头像 `PUT /api/profile/nickname`

**入参** `nickname`(1~20,必填)、`bio`(选填,≤60)、`avatarEnum`(选填,1~8)、`avatarUrl`(选填,string,见 §0.7)、`csrf`
**出参** `{ nickname, bio, avatar, avatarEnum, avatarUrl }`
> - `avatarUrl` 传上传接口返回的引用即启用图片头像；传空串 `""` = 恢复默认 emoji 头像（前端"恢复默认"按钮）。
> - 未传 `avatarUrl` 时保持原值；历史数据缺字段按空串处理。非空引用必须是合法引用格式，否则 → 9001。
> - 昵称/头像写时快照：历史留言保留发帖当时的昵称与头像，不随用户资料变化。

### E5 敏感信息编辑 `PUT /api/profile/sensitive`

**入参** `realName`(选填,≤20)、`email`(选填,≤60,格式校验)、`csrf`
> 手机号 = 登录账号，不可修改。
**出参** `{ realName, email, maskedName, maskedEmail }`

### E6 会话查询 `GET /api/session`

**出参**（未登录）`{ "loggedIn": false }`；（已登录）
`{ "loggedIn": true, "userId": 1, "nickname": "小满", "avatarEnum": 1, "avatarUrl": "localimg://img-xxx（可空）", "displayId": "20849317", "csrf": "..." }`
> csrf 由此接口下发，前端写操作带上；`avatarUrl` 供顶栏/导航头像渲染，空则用 `avatarEnum`。

---

### U1 图片上传 `POST /api/upload` ⭐ 本次新增

> 头像上传与文末图共用一个接口。前端原型（Mock）用 localStorage 实现，不发真实网络请求；生产需实现此接口对接对象存储。

**入参**（`multipart/form-data`）

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `file` | binary | 是 | 仅 `image/jpeg|png|gif|webp`，单张 ≤ 5 MB；超限 → 9001 |
| `type` | enum | 是 | `avatar`（头像）\| `message`（文末图），仅用于后端分目录/配额，不改变返回结构 |
| `csrf` | string | 是 | — |

**出参**

```json
{
  "ref": "localimg://img-mn3k2a9f-x7p2qc1d",
  "url": "https://cdn.example.com/hmb/2026/11/img-mn3k2a9f.webp",
  "type": "avatar",
  "size": 182344
}
```

| 字段 | 说明 |
|---|---|
| `ref` | 稳定引用串，本地原型用 `localimg://<id>`；生产可等于 `url` |
| `url` | 可直接塞进 `<img src>` 的地址；生产为 CDN/对象存储公网地址 |
| 说明 | 业务接口（E4 / API-04W / API-07a）保存 `ref` 或 `url` 任一字符串即可，出口原样返回；前端做失效回退 |

**约束**：需登录（是）、需 csrf（是）；单账号建议加上传频率限制（与 API-04W 限流独立）；
图片本体存对象存储，业务表只存引用字符串（见 §0.7 与表结构文档 §7）。失败错误码用 9001（非法文件）或 9003（存储配额/写入失败）。

---

## 3. "所有帖子"功能落地说明（本次新增需求）

**结论：零新接口、零新表，仅 API-04 响应新增 1 个字段。**

| 需求 | 落地方式 |
|---|---|
| 显示全站所有帖子 | `GET /api/messages?tab=hot` —— hot 已忽略 period、返回全站（前端命名为「留言板热度周榜」） |
| 可搜索 | 同一接口加 `q=关键词`，haystack 已含标题/正文/昵称/话题 |
| 属主改删入口 | `list[].isMine` 新字段（见 API-04 出参），前端据此显示按钮 |
| 列表形制 | 前端复用 profile 页 `.mymsg-item` 组件，后端无需关心 |

**后端唯一改动**：在 `toListMessage` 的出口函数里补一行（伪代码）：

```
out.isMine = (session != null && session.userId == message.ownerId)
```

未登录会话时 `isMine=false`。**不需要新增表、不需要新增路由、不需要数据迁移。**

---

## 4. 前端消费对照（便于联调自测）

| 前端页面 | 调用接口 |
|---|---|
| 榜单页 `index.html` | API-04（hot/latest/mine）、API-10、API-11 |
| 编辑器 `edit.html` | E1（读原文，`countView=false`）、API-04W、API-07a、API-07b、U1（文末图上传，原型走本地媒体层） |
| 详情页 `detail.html` | E1、API-09、API-10、API-07a、API-07b；正文末尾按 `images[]` 渲染图片条 |
| 登录页 `login.html` | API-01、API-02 |
| 个人中心 `profile.html` | API-08、API-04(mine)、E3/E4/E5、U1（头像上传，原型走本地媒体层） |
| 个人主页 `zone.html` | E2；顶栏/侧栏/留言卡统一按 `avatarUrl` 渲染头像，空则回退 `avatarEnum` |
| 全站帖子页（本次新增） | API-04(hot) + `q` 搜索 + `isMine` |

联调入口：`python -m http.server 8080` → `http://localhost:8080/pages/index.html`

### 4.1 活跃度称号系统（纯前端，不新增接口）

称号**是否颁发、等级、主称号、解锁进度全部在前端计算**，后端不参与判定：
- 数据源只用 E2 `GET /api/zone` 已返回的 `stats.messages` / `stats.comments` / `stats.likesReceived`、`memberDays`、`topics[]`，**不新增任何字段、不新增接口、不落库**。
- 触发时机：只有进入需要显示称号的页面（当前为 `zone.html` 个人主页）才调用 `HMB.titles.ensure(zone)`；其他页面不引用该模块，加载脚本本身不计算任何用户。
- 缓存：结果写入浏览器 `localStorage` 的 `hmb_v1_titles`（非后端表），按 `displayId` 存储并带输入数据签名 `sig`；签名一致直接复用，数据变化才重算回写。规则表版本号变更会让旧缓存自动失效。
- 隐私：判定不读取掩码字段与他人盲盒数据；任何用户只能通过公开主页看到同样的称号结果。
- 后端联调无需任何改动；若未来改为服务端颁发，需另立接口契约，当前版本明确不需要。

---

## 5. 待后端确认的开放项

1. **peakRank / peakNewRank 的写入**：改由后端在周榜结算时计算并持久化；前端不在浏览时反写或持久化（无数据就是 0），完整周榜卡首次上榜只用当前真实名次做展示兜底，搜索结果不兜底。确认是否需要独立的结算任务/接口。
2. **heatDelta / weeklyStats / heatHistory / lastRank 来源**：目前 `heatDelta`、`weeklyStats` 是种子演示数据，`heatHistory` 与 `lastRank` 全缺失 → 前端按红线显示 0 / `--`。折线图由 `weeklyStats` 逐周原始 stats 实时折算走向，不再依赖缺失的 `heatHistory`。真实系统需要后端按"本周分 vs 上周分"计算 `(本周−上周)/上周×100`（浮点保留 1 位），并提供近 8 期真实逐周统计（或真实热度序列）与上周名次；**任何字段缺失都不能由前端估算**。期次下拉只显示期号，不承载排名。
3. **分页**：当前 Mock 一次性返回全量。数据量上来后建议 API-04 加 `page`/`pageSize`，前端列表改为滚动加载（**需前端配合改代码**）。
4. **统计口径**：`stats` 的"新增互动"语义 —— 帖子 `period` 归属期次，stats 即该期新增。真实后端需按周窗口聚合，不能是历史累计值。
5. **`no` 字段**：8 位随机展示号（非主键），用于卡片 "NO.7f3a9c21" 展示；是否保留请确认。
6. **图片存储落地（本次新增）**：U1 上传接口需后端对接对象存储（OSS/S3/COS），确认存储桶、公网 CDN 域名与目录分法（`avatar/` / `message/`）；
   建议图片入 CDN 后返回 `ref = url`，业务表只存该字符串。需确认单账号上传频率上限与是否需要图片内容审核（鉴黄/敏感图）。
   前端原型不依赖此项：`ref` 用 `localimg://<id>`、本体存 localStorage，生产替换上传实现即可，业务接口字段契约不变。

---

## 6. 管理员 GM 扩展（权限模块）

> 本章定义管理员标记、导航岛第五项与全部 GM 接口；基础响应包、鉴权、脱敏与排行口径沿用前文。

### 6.1 硬性约定（先读）

#### 6.1.1 默认管理员账号（写死，不得改动）

| 项 | 值 |
|---|---|
| 登录账号 | `admin` |
| 密码 | `admin` |
| 角色 | `admin`（管理员） |
| 用户 ID | `9999`（固定，保留位） |
| 展示 ID | `90000001` |
| 昵称 | `管理员` |
| 头像 | `1`（🌸） |
| 状态 | `active`（未封禁、未禁言） |
| 登录特例 | `POST /api/login` 的 `phone` 字段允许传 `admin`（跳过 11 位手机号校验）；也接受新增别名 `account=admin` |
| 数据来源 | 由后端**种子 SQL 写入**（见《数据库表结构文档.md》§6.5），前端 mock 同步写死在 `seed.js` |

> ⚠️ 这是**演示/内部账号**。生产环境首次登录后必须强制改密（字段 `must_change_password`），
> 或由部署脚本在启动时覆盖密码。文档里保留明文只是为了联调可复现。

#### 6.1.2 权限模型

| 角色 | role 值 | 能力 |
|---|---|---|
| 普通用户 | `user` | 前文全部能力；禁言期间禁止一切发言；封禁期间禁止登录与所有写操作 |
| 管理员 | `admin` | 基础能力 + 本章全部 GM 接口 + 导航岛第五项「GM（管理员）」 |

**权限判定必须在服务端**：GM 接口在路由层统一校验 `session.role === 'admin'`，
前端隐藏岛项只是体验，**不能作为安全边界**。非管理员调用任意 GM 接口 → `6001`。

**受保护操作**：
- 不能封禁 / 降级 / 重置密码 / 删除自己 → `6002`；
- 不能对 `id=9999` 的内置 admin 执行封禁 / 降级 / 删除 / 改密 → `6003`；
- 至少保留一名 `role=admin` 且 `status=active` 的账号（降级最后一名管理员 → `6003`）。

#### 6.1.3 导航岛第五项（本次新增 UI 契约）

`GET /api/session` 出参新增两个字段，前端据此在导航岛追加第五项：

```json
{
  "loggedIn": true,
  "userId": 9999,
  "nickname": "管理员",
  "avatarEnum": 1,
  "displayId": "90000001",
  "csrf": "...",
  "role": "admin",
  "isAdmin": true
}
```

| 字段 | 说明 |
|---|---|
| `role` | `user` \| `admin`；未登录会话返回 `user` |
| `isAdmin` | `role === 'admin' && status === 'active'`，未登录恒 `false` |

岛内项定义（前端顺序固定）：`hot → latest → mine → all → about → gm`，
其中 `all`（全部留言）、`about`（关于）为全用户可见的岛内视图，`gm` 项仅在 `isAdmin=true` 时渲染，
标签文案 `GM`，角标文案 `管理员`。`all`/`about`/`gm` 均为 `index.html` 内的软切换视图（挂载点
`#allView` / `#aboutView` / `#gmView`，URL 形式 `?tab=<key>`），非独立页面；对应 `all.html`/`gm.html`
仅作兼容入口保留。

`gm` 与 `about` 同为**岛内软切换视图**（非独立页面）：点击后在当前 `index.html` 内切换
到 `#gmView` 挂载点（`?tab=gm#<panel>`，无文档导航），由 `HMB.pages.gm.show()/hide()` 控制；
`pages/gm.html` 仅作兼容入口保留。非管理员直接访问 `gm.html` → 页面显示无权限状态盒；
接口层仍以 `6001` 为准。

#### 6.1.4 新增错误码（追加到前文 §0.3）

| code | 含义 | 默认文案 |
|---|---|---|
| 2003 | 账号已被封禁 | 账号已被封禁，如有疑问请联系管理员 |
| 6001 | 无管理员权限 | 该功能仅管理员可用 |
| 6002 | 禁止操作自己 | 不能对自己执行此操作 |
| 6003 | 目标账号受保护 | 该账号受保护，不能执行此操作 |
| 6004 | 目标处于封禁/禁言状态 | 对方当前无法执行该操作 |
| 6005 | 禁言时长非法 | 禁言时长无效，请选择 1 小时 / 1 天 / 7 天 / 永久 |
| 6006 | 目标状态未变更 | 目标已经是当前状态 |

#### 6.1.5 状态拦截规则（基础接口也要改）

| 场景 | 规则 |
|---|---|
| 登录 | `status=banned` → `2003`；`mute_until` 不影响登录 |
| 发帖 / 评论 / 回复 / 盲盒回复 | `mute_until > now` → `6004`；`status=banned` → `2003` |
| 点赞 / 收藏 / 浏览 | 不受禁言影响；封禁账号会话失效后按未登录处理 |
| GM 接口 | 不受禁言影响（管理员自身不可能被禁言，SQL 约束 + 6003 双保险） |
| 已登录用户被封禁 | 立即吊销其全部 `sessions`，旧 token → `401` |

---

### 6.2 接口清单总览

| # | 名称 | 方法 | 路由 | 说明 |
|---|---|---|---|---|
| G1 | GM 概览 | GET | `/api/gm/summary` | 用户/帖子/评论/今日新增/处置数 |
| G2 | 用户列表 | GET | `/api/gm/users` | 搜索 + 状态/角色筛选 + 分页 |
| G3 | 用户详情 | GET | `/api/gm/users/{id}` | 含处罚状态、发帖数、最近登录 |
| G4 | 封禁/解封 | PUT | `/api/gm/users/{id}/status` | `active` \| `banned` |
| G5 | 禁言/解除 | PUT | `/api/gm/users/{id}/mute` | 时长 1h/1d/7d/永久，`0`=解除 |
| G6 | 角色调整 | PUT | `/api/gm/users/{id}/role` | 设为/取消管理员 |
| G7 | 修改用户信息 | PUT | `/api/gm/users/{id}/profile` | 昵称/签名/头像/真实姓名/邮箱/隐私开关 |
| G8 | 重置密码 | POST | `/api/gm/users/{id}/reset-password` | 管理员代重置 |
| G9 | 内容列表 | GET | `/api/gm/messages` | 帖子 + 评论统一列表，可按隐藏态筛选 |
| G10 | 隐藏/显示帖子 | PUT | `/api/gm/messages/{resourceId}/hidden` | 软处置，不删除 |
| G11 | 删除任意帖子 | DELETE | `/api/gm/messages/{resourceId}` | 硬删除，级联评论/点赞/留痕 |
| G12 | 隐藏/显示评论 | PUT | `/api/gm/comments/{resourceId}/hidden` | 软处置 |
| G13 | 删除任意评论 | DELETE | `/api/gm/comments/{resourceId}` | 硬删除，二级回复一并删除 |
| G14 | 操作审计 | GET | `/api/gm/actions` | 全部 GM 操作留痕 |
| G15 | 敏感词配置 | PUT | `/api/gm/settings/sensitive-words` | 改 `settings.sensitiveWords` |
| G16 | 期次配置 | PUT | `/api/gm/settings/current-period` | 改 `settings.currentPeriod` |
| G17 | 重置演示数据 | POST | `/api/gm/data/reset` | 清 localStorage/mock 数据，重建种子 |

全部接口：`Authorization: Bearer <token>` + `csrf` 参数（写操作）。

---

### 6.3 接口详情

#### G1 GM 概览 `GET /api/gm/summary`

**出参**

```json
{
  "users": { "total": 7, "active": 6, "banned": 1, "muted": 2, "admins": 1 },
  "contents": { "messages": 8, "comments": 24, "hiddenMessages": 1, "hiddenComments": 2 },
  "today": { "newUsers": 1, "newMessages": 2, "newComments": 5 },
  "actions": { "total": 18, "today": 4 },
  "settings": { "sensitiveWords": ["加微信", "代考"], "currentPeriod": 24 }
}
```

> `settings` 用于 GM 设置页回填当前值（G15 / G16 的读取侧），避免前端直连数据库。

#### G2 用户列表 `GET /api/gm/users`

| 参数 | 类型 | 说明 |
|---|---|---|
| `q` | string | 匹配 `account / displayId / nickname / realName` |
| `status` | enum | `all` \| `active` \| `banned`，默认 `all` |
| `role` | enum | `all` \| `user` \| `admin`，默认 `all` |
| `page` / `pageSize` | int | 默认 1 / 20 |

**出参** `list[]`：`id, account（仅管理员可见完整）, displayId, nickname, avatarEnum, role, status, muteUntil, bio, realName, email, createdAt, lastActive, messageCount, commentCount`。

> 普通用户接口仍只返回掩码；GM 接口可返回完整手机号/邮箱，但**必须写审计日志**（`action=user.read_sensitive`）。

#### G3 用户详情 `GET /api/gm/users/{id}`

在 G2 字段基础上增加：`flagName/flagEmail/flagPhone`、`banReason`、`muteReason`、`lastLoginAt`、`recentActionIds[]`。

#### G4 封禁/解封 `PUT /api/gm/users/{id}/status`

**入参** `{ "status": "banned" | "active", "reason": "刷屏广告", "csrf": "..." }`

**逻辑**
1. 校验 `id !== session.userId`，`id !== 9999`；
2. 目标状态相同 → `6006`；
3. `banned`：写 `status=banned`、`banReason`、`bannedAt`，吊销目标全部会话；
4. `active`：写 `status=active`、清 `banReason`；
5. 写 `admin_actions`（`action=user.ban` / `user.unban`）。

**出参** `{ "id": 123, "status": "banned", "muteUntil": 0 }`

#### G5 禁言/解除 `PUT /api/gm/users/{id}/mute`

**入参** `{ "durationSec": 3600 | 86400 | 604800 | -1 | 0, "reason": "辱骂他人", "csrf": "..." }`

| durationSec | 含义 |
|---|---|
| `3600` | 禁言 1 小时 |
| `86400` | 禁言 1 天 |
| `604800` | 禁言 7 天 |
| `-1` | 永久禁言（`mute_until = 253402300800000`，即 9999-12-31） |
| `0` | 解除禁言 |

**逻辑**：非上述枚举 → `6005`；写入 `mute_until = now + durationSec*1000`（解除写 0）；
写审计（`action=user.mute` / `user.unmute`）。封禁用户仍可设置禁言，但解封后继续生效。

**出参** `{ "id": 123, "muteUntil": 1764000000000, "muted": true }`

#### G6 角色调整 `PUT /api/gm/users/{id}/role`

**入参** `{ "role": "admin" | "user", "csrf": "..." }`

**逻辑**：不可操作 `id=9999`；不可操作自己；降级最后一名 active admin → `6003`；
变更后写审计（`action=user.role`）。被降级用户已有会话立即失效（重新登录才生效新角色）。

**出参** `{ "id": 123, "role": "admin", "isAdmin": true }`

#### G7 修改用户信息 `PUT /api/gm/users/{id}/profile`

**入参**（均选填，至少一项）

```json
{
  "nickname": "新昵称", "bio": "新签名", "avatarEnum": 3,
  "realName": "张三", "email": "a@b.com",
  "flagName": true, "flagEmail": false, "flagPhone": false,
  "csrf": "..."
}
```

**校验**：昵称 1~20、签名 ≤60、头像 1~8、邮箱格式、`account`（手机号）只读不可改。
**逻辑**：写审计（`action=user.profile_update`，`detail` 只记字段名不记明文值）；
历史留言的 `nicknameSnapshot` 保持不变（D-03）。

**出参** `{ "id": 123, "nickname": "新昵称", "bio": "新签名", "avatarEnum": 3 }`

#### G8 重置密码 `POST /api/gm/users/{id}/reset-password`

**入参** `{ "newPassword": "Abcd1234", "csrf": "..." }`
**校验**：8~32 位，含字母与数字；不可重置 `id=9999`（用部署脚本改）；不可重置自己（用普通改密流程）。
**逻辑**：bcrypt 加盐写入；吊销目标全部会话；`must_change_password=true`；写审计。
**出参** `{ "id": 123, "passwordReset": true }`

#### G9 内容列表 `GET /api/gm/messages`

| 参数 | 说明 |
|---|---|
| `type` | `message` \| `comment` \| `all`（默认 `all`） |
| `q` | 匹配标题 / 去标签正文 / 作者昵称 |
| `hidden` | `all` \| `1` \| `0`，默认 `all` |
| `page` / `pageSize` | 默认 1 / 20 |

**出参** `list[]`：`{ type, resourceId, messageId, title, content, fullContent, comments, authorId, authorNickname, createdAt, hidden, hiddenReason, period, stats }`。
- `content`：去标签正文摘要（≤160 字），只用于表格预览；
- `fullContent`：`message` 类型的完整白名单 HTML 正文，供 GM 详情弹窗按富文本渲染；`comment` 类型无此字段；
- `comments`：`message` 类型下方评论数组 `[{ authorName, content, createdAt, hidden }]`，按时间正序；匿名回复的 `authorName` 仍按匿名红线固定，**不得暴露真实身份**。

#### G10 隐藏/显示帖子 `PUT /api/gm/messages/{resourceId}/hidden`

**入参** `{ "hidden": true, "reason": "引战", "csrf": "..." }`
**逻辑**：写 `messages.hidden`；隐藏后从公开列表/搜索/详情/盲盒候选中排除，作者本人"我的留言"仍可见并带"仅自己可见"之外的"已被隐藏"提示；写审计。
**出参** `{ "resourceId": "...", "hidden": true }`

#### G11 删除任意帖子 `DELETE /api/gm/messages/{resourceId}`

**入参** `csrf`；**无 owner 校验**（管理员特权），但写审计。
**逻辑**：事务内删除帖子 + 其全部评论 + 点赞关系 + 盲盒留痕；物理删除不可恢复；返回被清理数量。
**出参** `{ "resourceId": "...", "deletedComments": 12, "deletedLikes": 30 }`

#### G12 / G13 评论隐藏与删除

同 G10 / G11，路由换成 `/api/gm/comments/{resourceId}/hidden`、`DELETE /api/gm/comments/{resourceId}`。
删除一级评论时其下二级回复一并删除；盲盒匿名回复删除后同步清理 `blindbox_replies` 留痕。

#### G14 操作审计 `GET /api/gm/actions`

| 参数 | 说明 |
|---|---|
| `actorId` / `action` / `targetType` | 筛选 |
| `from` / `to` | 毫秒时间戳区间 |
| `page` / `pageSize` | 默认 1 / 20 |

**出参** `list[]`：`{ id, actorId, actorNickname, action, targetType, targetId, detail, ip, createdAt }`。
**红线**：审计日志不可删除、不可修改；只有 `admin` 可读。

**`detail` 文案规范（人类可读，禁止直接拼接口参数）**：
- 应写成完整句子，例如 G2 读取敏感字段：`查看账号信息：搜索「关键词」，命中 7 条` / `查看账号信息：全部账号，共 7 条`；
- 禁止出现 `q=xxx 共 N 条` 这类原始参数拼接；
- 前端审计详情弹窗同时展示「功能简述」（`action` 映射的中文名，如"封禁账号"）与「原始记录」（`detail` 全文，不截断）。

#### G15 / G16 配置修改

- `PUT /api/gm/settings/sensitive-words`：`{ "words": ["加微信","代考"], "csrf": "..." }` → 写 `settings.sensitiveWords`，立即生效；
- `PUT /api/gm/settings/current-period`：`{ "period": 25, "csrf": "..." }` → 写 `settings.currentPeriod`，`period` 必须 ≥ 当前值（不允许回退）。

**期次修改的影响范围（务必按此实现）**：
- **只影响新发布内容**：`POST /api/messages` 写入 `messages.period = settings.currentPeriod`；
- **不改动历史数据**：已发布留言的 `period`、各帖 `weeklyStats`、历史热度与峰值、周榜统计周均不受影响；
- **前端需同步**：GM 保存后刷新首页榜单的本地期次缓存与期次下拉；当新期次超出种子 `PERIODS` 清单时，动态补入该期，避免新帖在下拉与徽章中消失；
- **周榜下拉口径不变**：仅列「`no < currentPeriod` 且该期有公开帖」的统计周。

均写审计。

#### G17 重置演示数据 `POST /api/gm/data/reset`

**入参** `csrf` + `confirm: "RESET"`。重建全部种子数据（含 admin 账号），写审计到独立文件/表（重置后审计表本身保留最后一条）。

---

### 6.4 GM 视图前端消费对照

GM 为导航岛第五项 tag 的岛内视图（`index.html?tab=gm#<panel>`），非独立页面；
`gm.html` 仅保留兼容。下表"面板"即岛内 `#gmView` 的五个子面板。

| 面板（岛内视图） | 能力 | 调用接口 |
|---|---|---|
| `gm#overview`（岛内第五项） | 概览卡片 | G1 |
| `gm#users` | 用户表格 / 搜索 / 封禁 / 禁言 / 角色 / 改资料 / 重置密码 | G2 G3 G4 G5 G6 G7 G8 |
| `gm#content` | 内容表格 / 隐藏 / 删除 | G9 G10 G11 G12 G13 |
| `gm#actions` | 审计日志 | G14 |
| `gm#settings` | 敏感词 / 期次 / 重置演示数据 | G15 G16 G17 |
| `all`（岛内 tag） | 全部留言列表 + 搜索，列表样式延续「我的留言」简洁卡（零新接口，复用 `GET /api/messages`）；`all.html` 仅兼容 | API-04 |

前端文案键建议：`gm.title`、`gm.tabUsers`、`gm.tabContent`、`gm.tabActions`、`gm.tabSettings`、
`gm.badge`（"管理员"）、`gm.action.ban`、`gm.action.unban`、`gm.action.mute`、`gm.action.unmute`、
`gm.action.role`、`gm.action.delete`、`gm.confirm.delete`、`gm.noPermission`。
文案变更需递增 `ui-text.VERSION`，GM 页 CSS/JS 带独立缓存版本号。

---

### 6.5 安全红线（务必实现）

1. **服务端鉴权**：GM 路由统一中间件校验 `role === 'admin'`，不看前端隐藏；
2. **内置账号保护**：`id=9999` 不可封禁/降级/删除/改密，账号 `admin` 不可被重命名；
3. **审计必写**：所有写操作 + G2 敏感字段读取都要写 `admin_actions`，不可删除；
4. **匿名红线保留**：GM 也不得在内容列表里暴露盲盒匿名回复的真实身份（`blindbox_replies` 仅服务端可见）；
5. **会话吊销**：封禁、降级、改密后立即吊销目标会话；
6. **最少管理员**：最后一名 active admin 不可被降级或封禁；
7. **CSRF + 幂等**：所有写操作校验 csrf；删除/封禁类操作前端二次确认，后端重复请求按 6006 处理。

---

### 6.6 联调检查清单

- [ ] `POST /api/login {phone:"admin", password:"admin"}` 成功，`GET /api/session` 返回 `role=admin, isAdmin=true`
- [ ] 普通账号登录后看不到岛内 GM 项；直接调 G1 → `6001`
- [ ] 封禁普通账号 → 其旧 token 立即 `401`，重新登录 → `2003`
- [ ] 禁言 1 小时 → 发帖/评论/盲盒回复 → `6004`；点赞不受影响
- [ ] GM 对 `id=9999` 封禁 → `6003`；对自己的账号封禁 → `6002`
- [ ] GM 删除任意帖子 → 评论/点赞/留痕级联清理，审计表新增一条
- [ ] `GET /api/gm/actions` 可查到上述全部操作，且无法删除审计记录
