# Hiu-2026 留言板 · 管理员 GM 表结构文档

> 版本 v1.0 · 2026-11-24 · 面向后端开发同学
>
> 本文是《数据库表结构文档.md》的权限扩展，基础 10 张表定义沿用原文。
> 本次新增：**0 张业务表 + 1 张审计表**（`admin_actions`），
> 在 `users` / `messages` / `comments` 上增加 5 个字段。
> 默认管理员 `admin / admin` 由本文 §4 的 SQL **写死写入**。

---

## 0. 变更总览

| 变更 | 对象 | 说明 |
|---|---|---|
| 新增字段 | `users.role` | `user` \| `admin`，默认 `user` |
| 新增字段 | `users.status` | `active` \| `banned`，默认 `active` |
| 新增字段 | `users.mute_until` | 禁言截止毫秒；`0`=未禁言，永久=`253402300800000` |
| 新增字段 | `users.ban_reason` | 最近一次封禁原因（解封时清空） |
| 新增字段 | `users.must_change_password` | 管理员代重置后为 `true`，强制首次改密 |
| 新增字段 | `messages.hidden` | GM 隐藏标记，默认 `false` |
| 新增字段 | `comments.hidden` | GM 隐藏标记，默认 `false` |
| 新增表 | `admin_actions` | GM 操作审计（只增不改不删） |
| 新增索引 | `users(role,status)`、`messages(hidden)`、`comments(hidden)`、`admin_actions(actor_id,created_at)` | 列表与审计查询 |

表总数：**10 → 11**（仅新增审计表）。

---

## 1. 字段详情

### 1.1 `users` 新增字段

| 字段 | 前端类型 | 建议 SQL 类型 | 约束 | 说明 |
|---|---|---|---|---|
| `role` | string | `ENUM('user','admin')` | NOT NULL DEFAULT `'user'` | 角色；仅 `admin` 可见岛内 GM 项 |
| `status` | string | `ENUM('active','banned')` | NOT NULL DEFAULT `'active'` | 封禁状态；封禁时吊销全部会话 |
| `muteUntil` | number | `BIGINT` | NOT NULL DEFAULT `0` | 禁言截止毫秒时间戳；`0`=无禁言；永久=9999 年末 |
| `banReason` | string | `VARCHAR(200)` | DEFAULT `''` | 封禁原因，解封时清空 |
| `mustChangePassword` | boolean | `BOOLEAN` | DEFAULT `FALSE` | 被管理员重置密码后为 true |

**约束**
- `CHECK (id <> 9999 OR role = 'admin')` —— 内置账号永远是管理员；
- 应用层保证至少存在一名 `role='admin' AND status='active'` 的账号；
- `mute_until` 与 `status` 相互独立：解封不自动解禁言，解除禁言不自动解封。

### 1.2 `messages` / `comments` 新增字段

| 字段 | 建议 SQL 类型 | 约束 | 说明 |
|---|---|---|---|
| `hidden` | `BOOLEAN` | NOT NULL DEFAULT `FALSE` | GM 软处置。隐藏后从公开列表/搜索/详情/盲盒候选排除；作者本人列表仍可见并带提示 |

`hidden` **不等于** `is_public`：`is_public=false` 是作者自己的私密设置，`hidden=true` 是管理员的处置结果，
两者任一为真即对外不可见。

### 1.3 `admin_actions` 审计表（新增）

| 字段 | 前端类型 | 建议 SQL 类型 | 约束 | 说明 |
|---|---|---|---|---|
| `id` | number | `BIGINT PK AUTO_INCREMENT` | — | 审计序号 |
| `actorId` | number | `BIGINT` | NOT NULL | 操作人 user_id |
| `actorNickname` | string | `VARCHAR(20)` | NOT NULL | 操作时昵称快照（防改名后追溯丢失） |
| `action` | string | `VARCHAR(40)` | NOT NULL | 操作码，见 §2 |
| `targetType` | string | `VARCHAR(16)` | NOT NULL | `user` \| `message` \| `comment` \| `settings` \| `system` |
| `targetId` | string | `VARCHAR(36)` | DEFAULT `''` | 目标 ID（用户为数字转字符串） |
| `detail` | object | `JSON` | DEFAULT `{}` | 操作详情；**只记字段名与状态值，不记密码/邮箱明文** |
| `ip` | string | `VARCHAR(64)` | DEFAULT `''` | 操作来源 IP |
| `createdAt` | number | `BIGINT` | NOT NULL | 操作时间戳(ms) |

**红线**：该表 `INSERT ONLY`；数据库账号对应用户不应具有 `UPDATE/DELETE` 权限；
前端不提供任何删除入口；按 `created_at` 分区/归档，不在业务库里删除。

---

## 2. 常量字典（新增）

| 名称 | 值 | 说明 |
|---|---|---|
| `ROLES` | `user` / `admin` | 角色枚举 |
| `USER_STATUS` | `active` / `banned` | 账号状态 |
| `MUTE_DURATIONS` | `3600` / `86400` / `604800` / `-1` / `0` | 1h / 1d / 7d / 永久 / 解除 |
| `MUTE_FOREVER` | `253402300800000` | 9999-12-31T00:00:00Z 毫秒值 |
| `PROTECTED_USER_ID` | `9999` | 内置 admin，禁止封禁/降级/删除/改密 |
| `GM_ACTIONS` | `user.ban` / `user.unban` / `user.mute` / `user.unmute` / `user.role` / `user.profile_update` / `user.password_reset` / `user.read_sensitive` / `message.hide` / `message.show` / `message.delete` / `comment.hide` / `comment.show` / `comment.delete` / `settings.sensitive_words` / `settings.period` / `data.reset` | `admin_actions.action` 白名单 |

---

## 3. 默认管理员账号（写死）

| 字段 | 固定值 |
|---|---|
| `id` | `9999` |
| `account` | `admin` |
| `password` | `admin`（明文；落库为 bcrypt 哈希） |
| `display_id` | `90000001` |
| `nickname` | `管理员` |
| `avatar_enum` | `1` |
| `role` | `admin` |
| `status` | `active` |
| `mute_until` | `0` |
| `must_change_password` | `true`（生产）；演示环境可设 `false` 便于联调 |
| `created_at` | `1730000000000`（2024-10-28，仅占位） |

前端 Mock 同步写死（`js/mock/seed.js`）：

```js
{ id: 9999, account: "admin", password: "admin", displayId: "90000001",
  nickname: "管理员", avatarEnum: 1, bio: "留言板管理员",
  role: "admin", status: "active", muteUntil: 0, banReason: "",
  mustChangePassword: false, flagName: false, flagEmail: false, flagPhone: false,
  createdAt: 1730000000000 }
```

---

## 4. 可执行 SQL

> 以下以 PostgreSQL 语法为主；MySQL 差异在 §4.5 说明。
> 全部语句在已有《数据库表结构文档.md》§4 的基础表之后执行。

### 4.1 扩展基础表

```sql
-- users：角色 / 封禁 / 禁言
ALTER TABLE users
  ADD COLUMN role VARCHAR(16)       NOT NULL DEFAULT 'user',
  ADD COLUMN status VARCHAR(16)     NOT NULL DEFAULT 'active',
  ADD COLUMN mute_until BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN ban_reason VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD CONSTRAINT users_role_check   CHECK (role IN ('user','admin')),
  ADD CONSTRAINT users_status_check CHECK (status IN ('active','banned')),
  ADD CONSTRAINT users_admin_locked CHECK (id <> 9999 OR role = 'admin');

-- 内容隐藏标记
ALTER TABLE messages ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comments ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- 列表/审计查询索引
CREATE INDEX idx_users_role_status ON users (role, status);
CREATE INDEX idx_messages_hidden   ON messages (hidden);
CREATE INDEX idx_comments_hidden   ON comments (hidden);
```

### 4.2 新建审计表

```sql
CREATE TABLE admin_actions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id BIGINT NOT NULL REFERENCES users(id),
  actor_nickname VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(36) NOT NULL DEFAULT '',
  detail JSON NOT NULL DEFAULT '{}'::json,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_actions_actor_time ON admin_actions (actor_id, created_at DESC);
CREATE INDEX idx_actions_action     ON admin_actions (action);
CREATE INDEX idx_actions_target     ON admin_actions (target_type, target_id);

-- 只增不改不删：应用连接账号只授予 SELECT, INSERT
REVOKE UPDATE, DELETE, TRUNCATE ON admin_actions FROM app_user;
GRANT SELECT, INSERT ON admin_actions TO app_user;
```

### 4.3 写入默认管理员 admin / admin

```sql
-- PostgreSQL：用 pgcrypto 现算 bcrypt 哈希，明文 admin 在 SQL 里写死
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (
  id, account, password_hash, display_id, nickname, avatar_enum,
  real_name, email, bio, role, status, mute_until, ban_reason,
  must_change_password, flag_name, flag_email, flag_phone, created_at
) VALUES (
  9999,
  'admin',
  crypt('admin', gen_salt('bf', 10)),
  '90000001',
  '管理员',
  1,
  '', '', '留言板管理员',
  'admin', 'active', 0, '',
  FALSE,  -- 演示环境直接可用；生产改 TRUE 强制首次改密
  FALSE, FALSE, FALSE,
  1730000000000
)
ON CONFLICT (id) DO NOTHING;

-- 登录特例：允许 phone 字段传 'admin'（应用层跳过 11 位手机号校验）
-- 或新增别名参数 account='admin'，二选一实现即可，文档两种都接受。
```

**校验登录**（PostgreSQL / pgcrypto）：

```sql
SELECT id, role, status FROM users
WHERE (account = 'admin' OR account = $1)
  AND password_hash = crypt($2, password_hash)
  AND status = 'active';
```

### 4.4 种子审计一条（可选）

```sql
INSERT INTO admin_actions (
  actor_id, actor_nickname, action, target_type, target_id, detail, ip, created_at
) VALUES (
  9999, '管理员', 'system.seed_admin', 'system', '9999',
  '{"account":"admin","note":"默认管理员种子账号"}'::json,
  '127.0.0.1', 1730000000000
);
```

### 4.5 MySQL 8 差异

```sql
-- ENUM 可直接用
ALTER TABLE users
  ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user',
  ADD COLUMN status ENUM('active','banned') NOT NULL DEFAULT 'active',
  ADD COLUMN mute_until BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN ban_reason VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE admin_actions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT NOT NULL,
  actor_nickname VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(36) NOT NULL DEFAULT '',
  detail JSON NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  KEY idx_actions_actor_time (actor_id, created_at),
  KEY idx_actions_action (action)
) ENGINE=InnoDB;

-- MySQL 无 crypt()：密码哈希由应用种子脚本用 bcrypt 生成后代入
-- bcrypt.hashSync('admin', 10) → 填入 password_hash
INSERT INTO users (id, account, password_hash, display_id, nickname, avatar_enum,
  role, status, mute_until, must_change_password, flag_name, flag_email, flag_phone, created_at)
VALUES (9999, 'admin', '<bcrypt_hash_of_admin>', '90000001', '管理员', 1,
  'admin', 'active', 0, 0, 0, 0, 0, 1730000000000);
```

---

## 5. 数据可见性规则

| 场景 | 规则 |
|---|---|
| 普通用户列表 / 搜索 / 详情 / 盲盒候选 | `hidden=false AND is_public=true` 才可见 |
| 作者本人"我的留言" | `hidden=true` 仍可见，带"已被隐藏"提示 |
| GM 内容列表 | `hidden=true/false` 都可见，带隐藏标记 |
| 匿名盲盒回复 | `hidden` 字段同样适用；但 `blindbox_replies.real_owner_id` **永远不对 GM 以外的接口暴露**，GM 内容列表也不显示真实身份 |
| GM 用户列表 | 可返回完整 account/email；必须写 `user.read_sensitive` 审计 |

---

## 6. 迁移注意事项（新增）

1. **默认密码**：`admin/admin` 仅用于联调；生产首启必须改密码或设 `must_change_password=true`。
2. **账号字段语义变化**：`account` 原本只允许 11 位手机号，`admin` 是唯一例外；所有按手机号格式校验的地方都要加白名单分支。
3. **角色快照**：`users.role` 存当前角色；会话不缓存角色，每次请求读库或用短 TTL 缓存，避免降级后仍有权。
4. **封禁要吊销会话**：`status=banned` 时删除该用户 `sessions` 全部记录，否则旧 token 仍可用。
5. **禁言只拦写操作**：浏览、点赞、查看个人主页不受影响；GM 页不受影响。
6. **隐藏而非删除优先**：先 `hidden=true` 观察，确认无误再物理删除；删除必须事务级联清理 likes/comments/blindbox_replies。
7. **审计只增不改**：不要给应用账号 `UPDATE/DELETE` 权限；归档用分区换出，不要在业务库 DELETE。
8. **最少管理员**：迁移脚本执行后校验 `SELECT COUNT(*) FROM users WHERE role='admin' AND status='active' >= 1`。
9. **岛内第五项依赖 session 新字段**：`GET /api/session` 必须返回 `role` 与 `isAdmin`，否则前端 GM 项不渲染。
10. **种子版本**：前端 `SEED.VERSION` 需 bump（5→6）以重建 mock 数据；admin 账号会随种子一起写入，联调时两侧密码保持一致。
