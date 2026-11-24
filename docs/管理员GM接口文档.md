# Hiu-2026 留言板 · 管理员 GM 接口文档

> 版本 v1.0 · 2026-11-24 · 面向后端开发同学
>
> 本文是《API接口文档.md》的**权限扩展契约**，基础响应包、鉴权、错误码、脱敏、富文本口径
> 全部沿用基础文档，本文只定义新增部分。
> 参考形制：赛事导播系统的「管理员标记 + 独立 GM 页 + 权限操作面板」。
> 落地时 GM 页是导航岛第五项，带"管理员"标记，**仅 `role=admin` 可见/可访问**。

---

## 0. 硬性约定（先读）

### 0.1 默认管理员账号（写死，不得改动）

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
| 数据来源 | 由后端**种子 SQL 写入**（见《管理员GM表结构文档.md》§4），前端 mock 同步写死在 `seed.js` |

> ⚠️ 这是**演示/内部账号**。生产环境首次登录后必须强制改密（字段 `must_change_password`），
> 或由部署脚本在启动时覆盖密码。文档里保留明文只是为了联调可复现。

### 0.2 权限模型

| 角色 | role 值 | 能力 |
|---|---|---|
| 普通用户 | `user` | 基础文档全部能力；禁言期间禁止一切发言；封禁期间禁止登录与所有写操作 |
| 管理员 | `admin` | 基础能力 + 本文全部 GM 接口 + 导航岛第五项「GM（管理员）」 |

**权限判定必须在服务端**：GM 接口在路由层统一校验 `session.role === 'admin'`，
前端隐藏岛项只是体验，**不能作为安全边界**。非管理员调用任意 GM 接口 → `6001`。

**受保护操作**：
- 不能封禁 / 降级 / 重置密码 / 删除自己 → `6002`；
- 不能对 `id=9999` 的内置 admin 执行封禁 / 降级 / 删除 / 改密 → `6003`；
- 至少保留一名 `role=admin` 且 `status=active` 的账号（降级最后一名管理员 → `6003`）。

### 0.3 导航岛第五项（本次新增 UI 契约）

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

岛内项定义（前端顺序固定）：`hot → latest → mine → about → gm`，
其中 `gm` 项仅在 `isAdmin=true` 时渲染，标签文案 `GM`，角标文案 `管理员`。
非管理员直接访问 `gm.html` → 页面显示无权限状态盒；接口层仍以 `6001` 为准。

### 0.4 新增错误码（追加到基础文档 §0.3）

| code | 含义 | 默认文案 |
|---|---|---|
| 2003 | 账号已被封禁 | 账号已被封禁，如有疑问请联系管理员 |
| 6001 | 无管理员权限 | 该功能仅管理员可用 |
| 6002 | 禁止操作自己 | 不能对自己执行此操作 |
| 6003 | 目标账号受保护 | 该账号受保护，不能执行此操作 |
| 6004 | 目标处于封禁/禁言状态 | 对方当前无法执行该操作 |
| 6005 | 禁言时长非法 | 禁言时长无效，请选择 1 小时 / 1 天 / 7 天 / 永久 |
| 6006 | 目标状态未变更 | 目标已经是当前状态 |

### 0.5 状态拦截规则（基础接口也要改）

| 场景 | 规则 |
|---|---|
| 登录 | `status=banned` → `2003`；`mute_until` 不影响登录 |
| 发帖 / 评论 / 回复 / 盲盒回复 | `mute_until > now` → `6004`；`status=banned` → `2003` |
| 点赞 / 收藏 / 浏览 | 不受禁言影响；封禁账号会话失效后按未登录处理 |
| GM 接口 | 不受禁言影响（管理员自身不可能被禁言，SQL 约束 + 6003 双保险） |
| 已登录用户被封禁 | 立即吊销其全部 `sessions`，旧 token → `401` |

---

## 1. 接口清单总览

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

## 2. 接口详情

### G1 GM 概览 `GET /api/gm/summary`

**出参**

```json
{
  "users": { "total": 7, "active": 6, "banned": 1, "muted": 2, "admins": 1 },
  "contents": { "messages": 8, "comments": 24, "hiddenMessages": 1, "hiddenComments": 2 },
  "today": { "newUsers": 1, "newMessages": 2, "newComments": 5 },
  "actions": { "total": 18, "today": 4 }
}
```

### G2 用户列表 `GET /api/gm/users`

| 参数 | 类型 | 说明 |
|---|---|---|
| `q` | string | 匹配 `account / displayId / nickname / realName` |
| `status` | enum | `all` \| `active` \| `banned`，默认 `all` |
| `role` | enum | `all` \| `user` \| `admin`，默认 `all` |
| `page` / `pageSize` | int | 默认 1 / 20 |

**出参** `list[]`：`id, account（仅管理员可见完整）, displayId, nickname, avatarEnum, role, status, muteUntil, bio, realName, email, createdAt, lastActive, messageCount, commentCount`。

> 普通用户接口仍只返回掩码；GM 接口可返回完整手机号/邮箱，但**必须写审计日志**（`action=user.read_sensitive`）。

### G3 用户详情 `GET /api/gm/users/{id}`

在 G2 字段基础上增加：`flagName/flagEmail/flagPhone`、`banReason`、`muteReason`、`lastLoginAt`、`recentActionIds[]`。

### G4 封禁/解封 `PUT /api/gm/users/{id}/status`

**入参** `{ "status": "banned" | "active", "reason": "刷屏广告", "csrf": "..." }`

**逻辑**
1. 校验 `id !== session.userId`，`id !== 9999`；
2. 目标状态相同 → `6006`；
3. `banned`：写 `status=banned`、`banReason`、`bannedAt`，吊销目标全部会话；
4. `active`：写 `status=active`、清 `banReason`；
5. 写 `admin_actions`（`action=user.ban` / `user.unban`）。

**出参** `{ "id": 123, "status": "banned", "muteUntil": 0 }`

### G5 禁言/解除 `PUT /api/gm/users/{id}/mute`

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

### G6 角色调整 `PUT /api/gm/users/{id}/role`

**入参** `{ "role": "admin" | "user", "csrf": "..." }`

**逻辑**：不可操作 `id=9999`；不可操作自己；降级最后一名 active admin → `6003`；
变更后写审计（`action=user.role`）。被降级用户已有会话立即失效（重新登录才生效新角色）。

**出参** `{ "id": 123, "role": "admin", "isAdmin": true }`

### G7 修改用户信息 `PUT /api/gm/users/{id}/profile`

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

### G8 重置密码 `POST /api/gm/users/{id}/reset-password`

**入参** `{ "newPassword": "Abcd1234", "csrf": "..." }`
**校验**：8~32 位，含字母与数字；不可重置 `id=9999`（用部署脚本改）；不可重置自己（用普通改密流程）。
**逻辑**：bcrypt 加盐写入；吊销目标全部会话；`must_change_password=true`；写审计。
**出参** `{ "id": 123, "passwordReset": true }`

### G9 内容列表 `GET /api/gm/messages`

| 参数 | 说明 |
|---|---|
| `type` | `message` \| `comment` \| `all`（默认 `all`） |
| `q` | 匹配标题 / 去标签正文 / 作者昵称 |
| `hidden` | `all` \| `1` \| `0`，默认 `all` |
| `page` / `pageSize` | 默认 1 / 20 |

**出参** `list[]`：`{ type, resourceId, messageId, title, content, authorId, authorNickname, createdAt, hidden, stats }`。

### G10 隐藏/显示帖子 `PUT /api/gm/messages/{resourceId}/hidden`

**入参** `{ "hidden": true, "reason": "引战", "csrf": "..." }`
**逻辑**：写 `messages.hidden`；隐藏后从公开列表/搜索/详情/盲盒候选中排除，作者本人"我的留言"仍可见并带"仅自己可见"之外的"已被隐藏"提示；写审计。
**出参** `{ "resourceId": "...", "hidden": true }`

### G11 删除任意帖子 `DELETE /api/gm/messages/{resourceId}`

**入参** `csrf`；**无 owner 校验**（管理员特权），但写审计。
**逻辑**：事务内删除帖子 + 其全部评论 + 点赞关系 + 盲盒留痕；物理删除不可恢复；返回被清理数量。
**出参** `{ "resourceId": "...", "deletedComments": 12, "deletedLikes": 30 }`

### G12 / G13 评论隐藏与删除

同 G10 / G11，路由换成 `/api/gm/comments/{resourceId}/hidden`、`DELETE /api/gm/comments/{resourceId}`。
删除一级评论时其下二级回复一并删除；盲盒匿名回复删除后同步清理 `blindbox_replies` 留痕。

### G14 操作审计 `GET /api/gm/actions`

| 参数 | 说明 |
|---|---|
| `actorId` / `action` / `targetType` | 筛选 |
| `from` / `to` | 毫秒时间戳区间 |
| `page` / `pageSize` | 默认 1 / 20 |

**出参** `list[]`：`{ id, actorId, actorNickname, action, targetType, targetId, detail, ip, createdAt }`。
**红线**：审计日志不可删除、不可修改；只有 `admin` 可读。

### G15 / G16 配置修改

- `PUT /api/gm/settings/sensitive-words`：`{ "words": ["加微信","代考"], "csrf": "..." }` → 写 `settings.sensitiveWords`，立即生效；
- `PUT /api/gm/settings/current-period`：`{ "period": 25, "csrf": "..." }` → 写 `settings.currentPeriod`，`period` 必须 ≥ 当前值（不允许回退）。

均写审计。

### G17 重置演示数据 `POST /api/gm/data/reset`

**入参** `csrf` + `confirm: "RESET"`。重建全部种子数据（含 admin 账号），写审计到独立文件/表（重置后审计表本身保留最后一条）。

---

## 3. GM 页前端消费对照

| 页面 | 能力 | 调用接口 |
|---|---|---|
| `gm.html`（岛内第五项） | 概览卡片 | G1 |
| `gm.html#users` | 用户表格 / 搜索 / 封禁 / 禁言 / 角色 / 改资料 / 重置密码 | G2 G3 G4 G5 G6 G7 G8 |
| `gm.html#content` | 内容表格 / 隐藏 / 删除 | G9 G10 G11 G12 G13 |
| `gm.html#actions` | 审计日志 | G14 |
| `gm.html#settings` | 敏感词 / 期次 / 重置演示数据 | G15 G16 G17 |

前端文案键建议：`gm.title`、`gm.tabUsers`、`gm.tabContent`、`gm.tabActions`、`gm.tabSettings`、
`gm.badge`（"管理员"）、`gm.action.ban`、`gm.action.unban`、`gm.action.mute`、`gm.action.unmute`、
`gm.action.role`、`gm.action.delete`、`gm.confirm.delete`、`gm.noPermission`。
文案变更需递增 `ui-text.VERSION`，GM 页 CSS/JS 带独立缓存版本号。

---

## 4. 安全红线（务必实现）

1. **服务端鉴权**：GM 路由统一中间件校验 `role === 'admin'`，不看前端隐藏；
2. **内置账号保护**：`id=9999` 不可封禁/降级/删除/改密，账号 `admin` 不可被重命名；
3. **审计必写**：所有写操作 + G2 敏感字段读取都要写 `admin_actions`，不可删除；
4. **匿名红线保留**：GM 也不得在内容列表里暴露盲盒匿名回复的真实身份（`blindbox_replies` 仅服务端可见）；
5. **会话吊销**：封禁、降级、改密后立即吊销目标会话；
6. **最少管理员**：最后一名 active admin 不可被降级或封禁；
7. **CSRF + 幂等**：所有写操作校验 csrf；删除/封禁类操作前端二次确认，后端重复请求按 6006 处理。

---

## 5. 联调检查清单

- [ ] `POST /api/login {phone:"admin", password:"admin"}` 成功，`GET /api/session` 返回 `role=admin, isAdmin=true`
- [ ] 普通账号登录后看不到岛内 GM 项；直接调 G1 → `6001`
- [ ] 封禁普通账号 → 其旧 token 立即 `401`，重新登录 → `2003`
- [ ] 禁言 1 小时 → 发帖/评论/盲盒回复 → `6004`；点赞不受影响
- [ ] GM 对 `id=9999` 封禁 → `6003`；对自己的账号封禁 → `6002`
- [ ] GM 删除任意帖子 → 评论/点赞/留痕级联清理，审计表新增一条
- [ ] `GET /api/gm/actions` 可查到上述全部操作，且无法删除审计记录
