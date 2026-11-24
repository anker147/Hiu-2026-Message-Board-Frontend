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

**需要 `csrf` 参数的接口**：postMessage / postComment / postReply / updateContent / deleteContent / like / blindboxReply / updatePrivacy / updateNickname / updateSensitive / logout。
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
| 敏感词（F10） | 覆盖：发留言 / 评论 / 回复 / 编辑 / 盲盒回复。词表可配置（当前 4 词：加微信/代考/办证/刷单） |
| 限流（F10） | **仅发留言**：同账号 10 秒滑窗 >3 次 → 4002，返回剩余秒数。评论/回复/盲盒回复只过敏感词，不过限流 |
| 幂等（F8） | 点赞接口接收 `idemKey`，**同一 key 重复请求必须返回当前状态，不得 +2/-1 抖动**。建议 `(user_id, target_id)` 唯一约束兜底 |
| 匿名红线（F9） | 盲盒匿名回复：输出层 `authorName` 固定为「热心同学」、`authorAvatar=0`、`authorDisplayId=""`、`isAnonymous=true`，且 `isMine=false`。**任何接口都不得返回匿名作者真实身份**；真实身份只留审计表 |
| 可见类型 | `is_public=false` 的帖子：他人列表/搜索/详情/盲盒候选一律不可见（详情返回 5001），作者本人可见并带「仅自己」标识 |
| 级别校验 | 评论最多二级：对 `depth>=2` 的评论回复 → 5003 |
| owner 校验 | 改/删/编辑前必须校验 `owner_id == 当前用户`，否则 5002（防 IDOR） |

### 0.5 ⚠️ 排行榜计算边界（重要，别在后端算分）

**后端只回传原始统计字段，不要计算 heat / 排名 / 历史最高。**

```
后端提供:  stats{views, likes, comments, favorites} + period + createdAt + heatDelta
前端计算:  折合分(heat) / 排序 / peakRank / peakNewRank / 趋势折线图
```

原因：得分公式与时间修正由前端 `HMB.util.rankBoard` 统一实现，biliboard 公示口径：

```
t = ln(e^d + 1) + 1        d = 投稿时间 − 该帖所属期次统计起点(天)，钳制 [0,7]
得分 = 浏览×1×t + 评论×1 + 点赞×2 + 收藏×5     （绝对分，前端以「万」展示）
```

- `heatDelta` 是**前端演示用的相对上周变动百分比**（如 12.4 表示 +12.4%），由后端原样透传即可。
- **不要**在响应里返回 `heat` 字段——前端会自行计算并覆盖。
- **不要**对 `getMessages` 的结果做排序——前端按 `sort` 参数自行排序。后端按 `createdAt DESC` 返回即可。

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
| 11 | 抽取盲盒 | GET | `/api/blindbox` | 是 | 否 |
| 12 | 盲盒匿名回复 | POST | `/api/blindbox/reply` | 是 | 是 |
| E1 | 单条详情 | GET | `/api/messages/{resourceId}` | 否 | 否 |
| E2 | 个人主页聚合 | GET | `/api/zone?displayId=...` | 否 | 否 |
| E3 | 隐私开关 | PUT | `/api/profile/privacy` | 是 | 是 |
| E4 | 昵称/签名/头像 | PUT | `/api/profile/nickname` | 是 | 是 |
| E5 | 敏感信息编辑 | PUT | `/api/profile/sensitive` | 是 | 是 |
| E6 | 会话查询 | GET | `/api/session` | 否 | 否 |

> 计 20 条路由（Mock 层 17 个方法：API-01~12 中 07 拆两路由、06 与 05 共用实现、加 7 扩展）。

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

> ⭐ 这是"所有帖子"功能依赖的核心接口，前端所有列表视图（热榜/新帖/我的留言/搜索/全站页）共用它。

**查询参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `tab` | enum | `hot` \| `latest` \| `mine`，默认 `hot` |
| `sort` | enum | `heat` \| `latest` \| `likes` \| `comments` |
| `period` | int | 期次号（21~24）。**仅 `latest` 生效**，筛选该期新帖；`hot` 忽略此参数 |
| `q` | string | 搜索词，匹配 haystack = `title + content + nicknameSnapshot + topicTag`（不区分大小写） |
| `csrf` | — | 不需要 |

**tab 语义**

| tab | 数据范围 | 鉴权 |
|---|---|---|
| `hot` | **全站所有公开帖子**（不限发帖期次）—— 即"所有帖子" | 无需登录 |
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
      "content": "string（≤500）",
      "nicknameSnapshot": "string（发帖时昵称快照）",
      "avatarEnum": 1,
      "displayId": "20849317",
      "topicTag": "校园日常",
      "createdAt": 1730000000000,
      "stats": { "views": 12000, "likes": 328, "comments": 46, "favorites": 89 },
      "heatDelta": 12.4,
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
| `isMine` | ⭐ **新增字段**（本次"所有帖子"功能需要）：当前用户是否为作者。未登录恒 `false`。前端据此显示"编辑/删除"入口 |
| `maskedXxx` | F6 掩码，受用户三项公开开关控制；未开启时返回空串 |
| `heatDelta` | 相对上周变动百分比，后端原样透传；前端用于变更胶囊与趋势图 |
| `peakRank` / `peakNewRank` | 历史最高名次，后端存储并透传（首次为 0）；**前端负责更新**，但需后端提供写接口或由前端直接写（见 §5） |
| `likedIds` | 当前用户点过赞的 targetId 列表；未登录为 `[]` |

> **不要返回**：`ownerId`、`account`、`email`、`password`、`realName` 明文、`heat`、`rank`。

---

### API-04W 发布留言 `POST /api/messages`

**入参**

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| title | string | 否 | ≤48 字，过敏感词 |
| content | string | 是 | 1~500 字，过敏感词 + 限流 |
| nickname | string | 否 | 1~20 字；非空且与现昵称不同时**更新用户昵称** |
| topic | string | 否 | 必须在 `TOPICS` 白名单：校园日常/互助/食堂/求助/盲盒/日常 |
| csrf | string | 是 | — |

**服务端生成**：`resourceId`(UUID)、`no`(8位随机)、`ownerId`=会话用户、`nicknameSnapshot`=本次昵称、`avatarEnum`=用户头像、`displayId`、`isPublic=true`、`period`=当前期次、`createdAt`=now、`stats` 全 0、`heatDelta=0`、`peakRank=0`、`peakNewRank=0`、`isNew=true`。

**安检门**：敏感词(4001) → 限流(4002, 10秒滑窗>3次) → 记录本次时间戳。

**出参** 同 API-04 的 list 元素结构（单条）。

---

### API-05 发表评论 `POST /api/comments`

**入参** `messageId`(必填)、`content`(1~500)、`nickname`(选填)、`csrf`

**逻辑**：一级评论 `depth=1, parentId=null`；`atDisplayId` 留空。敏感词门（无限流）。`message.stats.comments += 1`。

**出参** 评论对象（见 API-09 字段）。

---

### API-06 发表回复 `POST /api/replies`

**入参** `messageId`、`parentId`、`content`、`nickname`、`atDisplayId`（选填）、`csrf`

**逻辑**：`parentId` 不存在 → 5001；父评论 `depth>=2` → 5003（最多二级）；`depth=2`，`rootId=parent.rootId||parent.resourceId`；`atDisplayId` **自动取父作者展示 ID**（前端传入值会被覆盖），`atAuthorName` 自动取父作者昵称（匿名父则为「热心同学」）。

**出参** 同 API-05。

---

### API-07a 编辑内容 `PUT /api/content/{resourceId}`

**入参** `content`(必填,1~500)、`title`(选填,≤48)、`topic`(选填,白名单)、`isPublic`(选填,bool)、`csrf`

**逻辑**：
- 先查帖子，再查评论（同一接口按 resourceId 分发）；
- owner 不符 → 5002；不存在 → 5001；
- 敏感词门（无限流）；
- 未传的 `title`/`topic`/`isPublic` **保持原值**；
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
  "messages": [ { "...": "公开帖子列表（他人不可见私密帖）" } ],
  "comments": [ { "...": "非匿名评论 + 引用原帖摘要" } ],
  "topics": [ { "tag": "校园日常", "count": 3 } ]
}
```

**红线**：匿名回复绝不出现在主页；私密帖对他人不可见；掩码字段受本人开关控制。

---

### E3 隐私开关 `PUT /api/profile/privacy`

**入参** `flagName`、`flagEmail`、`flagPhone`（均 bool）、`csrf`。**出参** `{}`

### E4 昵称/签名/头像 `PUT /api/profile/nickname`

**入参** `nickname`(1~20,必填)、`bio`(选填,≤60)、`avatarEnum`(选填,1~8)、`csrf`
**出参** `{ nickname, bio, avatar }`
> 昵称/头像写时快照：历史留言保留发帖当时的昵称与头像，不随用户资料变化。

### E5 敏感信息编辑 `PUT /api/profile/sensitive`

**入参** `realName`(选填,≤20)、`email`(选填,≤60,格式校验)、`csrf`
> 手机号 = 登录账号，不可修改。
**出参** `{ realName, email, maskedName, maskedEmail }`

### E6 会话查询 `GET /api/session`

**出参**（未登录）`{ "loggedIn": false }`；（已登录）
`{ "loggedIn": true, "userId": 1, "nickname": "小满", "avatarEnum": 1, "displayId": "20849317", "csrf": "..." }`
> csrf 由此接口下发，前端写操作带上。

---

## 3. "所有帖子"功能落地说明（本次新增需求）

**结论：零新接口、零新表，仅 API-04 响应新增 1 个字段。**

| 需求 | 落地方式 |
|---|---|
| 显示全站所有帖子 | `GET /api/messages?tab=hot&sort=latest` —— hot 已忽略 period、返回全站 |
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
| 编辑器 `edit.html` | E1（读原文，`countView=false`）、API-04W、API-07a、API-07b |
| 详情页 `detail.html` | E1、API-09、API-10、API-07a、API-07b |
| 登录页 `login.html` | API-01、API-02 |
| 个人中心 `profile.html` | API-08、API-04(mine)、E3/E4/E5 |
| 个人主页 `zone.html` | E2 |
| 全站帖子页（本次新增） | API-04(hot) + `q` 搜索 + `isMine` |

联调入口：`python -m http.server 8080` → `http://localhost:8080/pages/index.html`

---

## 5. 待后端确认的开放项

1. **peakRank / peakNewRank 的写入**：当前前端直接写 localStorage。接后端后需要：(a) 后端提供批量更新接口，或 (b) 后端在列表查询时计算并持久化。建议 (b)，前端只透传展示。
2. **heatDelta 来源**：目前是种子里的演示值。真实系统需要后端按"本周分 vs 上周分"计算 `(本周−上周)/上周×100`，浮点保留 1 位。
3. **分页**：当前 Mock 一次性返回全量。数据量上来后建议 API-04 加 `page`/`pageSize`，前端列表改为滚动加载（**需前端配合改代码**）。
4. **统计口径**：`stats` 的"新增互动"语义 —— 帖子 `period` 归属期次，stats 即该期新增。真实后端需按周窗口聚合，不能是历史累计值。
5. **`no` 字段**：8 位随机展示号（非主键），用于卡片 "NO.7f3a9c21" 展示；是否保留请确认。
