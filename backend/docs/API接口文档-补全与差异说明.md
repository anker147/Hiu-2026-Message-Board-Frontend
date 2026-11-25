# API 接口文档 · 补全与差异说明（后端已实现版）

> 配合《API接口文档(2).md》使用。本文只写**补充新增**和**与原文档的差异**，
> 原文档没提到的内容一律不变。对应后端代码：TestJDBC `src/api/`、`src/servlet/ApiServlet.java`。
> 生成日期：2026-11-25。

---

## 1. 路由差异（重要，联调前先看）

| 接口 | 原文档写法 | 实际实现（请按这个联调） |
| --- | --- | --- |
| API-05 发表评论 | `POST /api/comments` | `POST /api/messages/{messageId}/comments`（body 带 content/nickname/atDisplayId/csrf） |
| API-06 发表回复 | `POST /api/replies` | 相同 `POST /api/replies`，body 需带 `messageId + commentId + content` |
| E3 隐私开关 | `PUT /api/profile/privacy` | `POST /api/profile/privacy`（**PUT 同路径也兼容**，两种都能用） |
| E4 昵称/签名/头像 | `PUT /api/profile/nickname` | `POST /api/profile/nickname`（PUT 兼容） |
| E5 敏感信息 | `PUT /api/profile/sensitive` | `POST /api/profile/sensitive`（PUT 兼容） |
| API-07b 删除 | body 传 csrf | DELETE 无请求体，csrf 通过**查询参数**传：`DELETE /api/content/{id}?csrf=xxx` |

其余 API-01~12 / E1 / E2 / E6 路由与原文档一致。

---

## 2. 遗漏接口补全（原文档没写，前端 Mock 在用）

### 2.1 收藏/取消收藏 `POST /api/favorite` ★新增

帖子与评论通用，与点赞分表、幂等语义相同。

请求体：

```json
{ "targetId": "m-xxx 或 c-xxx", "op": "favorite | unfavorite", "idemKey": "可选", "csrf": "xxx" }
```

响应 data：

```json
{ "favorite": true, "count": 12 }
```

- `op` 不传时按切换处理；幂等键重复时返回当前状态不重复计数（4002 同点赞）。
- 未登录 401；CSRF 缺失/错误 9002；目标不存在 5001。
- 收藏计数落在 `messages.favorites` / `comments.favorites`，关系存 `favorites` 表（见数据库文档补全 §1）。

### 2.2 `tab=all` 明确化（API-04）

- `tab` 取值：`mine`（我的留言，必须登录）/ `hot`（热度榜，period 为上限过滤）/ **`all` 或不传**（全站列表）。
- `tab=all` 原文档未明确，前端 all.js 实际在用：行为 = 不带 tab。

---

## 3. 遗漏字段补全（出口白名单 6.5）

### 3.1 留言对象（列表 + 详情）新增字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `avatarUrl` | string | 发帖时真实头像引用快照（`localimg://id`），空串=用 emoji 头像 |
| `images` | array | 文末图片引用数组（`localimg://id`），最多 10 张，正文不含图 |
| `coverUrl` | string | 独立封面引用，空串 = 用默认头像 |
| `coverFromFirst` | bool | true = 取 images[0] 当封面，随图集变化 |
| `weeklyStats` | array | 逐周原始统计 `[{"value":120},...]`，缺失期次前端按 0 折算 |
| `hidden` | bool | GM 隐藏标记（本期 GM 未开放，恒 false，字段保留） |
| `hiddenReason` | string | 隐藏原因 |

### 3.2 详情接口（E1）新增访问者状态

```json
{ "isMine": true, "isLiked": false, "isFavorite": true }
```

- 未登录时三个值恒 false；`isMine` 按当前 Bearer 令牌判断。

### 3.3 用户/个人中心新增字段

| 字段 | 位置 | 说明 |
| --- | --- | --- |
| `flagLiked` | profile / zone | 互动展示开关：他人可否看"我赞过的" |
| `flagFavorite` | profile / zone | 互动展示开关：他人可否看"我收藏的" |
| `avatarUrl` | profile / session / zone | 真实头像引用（`localimg://`），空串回退 emoji |
| `canSeeLiked` / `canSeeFavorite` | zone | 本人恒 true；他人按对应开关决定 liked/favorite 域是否有数据 |

### 3.4 zone（E2）补充

- `liked` / `favorite` 两个域结构：`{ "posts": [留言对象], "comments": [zone 评论对象] }`，按时间倒序。
- 评论对象（zone 内）带 `message` 引用（原帖 resourceId/title/content/topicTag/nicknameSnapshot/createdAt 摘要）。
- 匿名（盲盒）回复**绝不出现在** `comments` / `liked` / `favorite` / 他人 `blindboxMessages`（F9/D-02 红线，已实现）。

---

## 4. 登录/注册响应补充

原文档 data 只有 `{displayId, nickname, avatar}`。实际实现额外返回（前端适配层需要，页面层可忽略）：

```json
{
  "displayId": "20849317",
  "nickname": "小满",
  "avatar": 1,
  "token": "48位hex（Authorization: Bearer 用）",
  "csrf": "24位hex（写操作参数用）"
}
```

前端适配层负责保存；`GET /api/session` 每次也会回 csrf，可与本地比对。

---

## 5. 已实现 / 未实现清单

### 5.1 已实现并全部 curl 联调通过

- API-01~12、API-04W、E1~E6 全部核心接口；
- 统一响应包与 §0.3 错误码（1001/1002/1003/1009/2001/2002/2003/4001/4002/5001/5002/5003/6004/9001/9002/9003/401）；
- PBKDF2WithHmacSHA1 密码哈希（与种子数据 `pbkdf2:10000:salt:hash` 完全兼容）；
- 会话 30 分钟空闲超时、退出即失效（旧令牌重放 401）、CSRF 校验；
- 登录连错 5 次锁 15 分钟；发留言 10 秒滑窗 3 次限流（4002 带剩余秒）；
- 敏感词（settings 表可配置词库）；F6 出口脱敏（掩码受本人开关控制）；
- 盲盒匿名回复"热心同学" + `blindbox_replies` 留痕（接口永不返回真实身份）；
- 点赞/收藏幂等键（`idempotency_keys` 表防抖动）；
- 评论两级树（超层 5003）、删一级评论级联子树并递减计数；
- CORS（CorsFilter：Allow-Origin 回显 / Methods / Headers / OPTIONS 预检短路 200）。

### 5.2 本期未实现（GM G1~G17）

- GM 管理接口全部未开放；前端适配层对 `gmXxx` 返回 `{success:false, code:-1}`，GM 页面可渲染骨架但无数据；
- `hidden/hiddenReason/mute` 相关字段已预留（表结构和出口字段都在），后续接 GM 时无需改表。

---

## 6. 联调自测速查（curl）

```bash
B="http://localhost:8080/TestJDBC/api"
# 1.预检
curl -i -X OPTIONS "$B/messages" -H "Origin: http://localhost:3000"
# 2.登录拿令牌
curl -s -X POST "$B/login" -H "Content-Type: application/json" \
     -d '{"phone":"13800000001","password":"abc12345"}'
# 3.带令牌列表
curl -s "$B/messages?tab=mine" -H "Authorization: Bearer <token>"
# 4.发留言（csrf 放 body）
curl -s -X POST "$B/messages" -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" -d '{"content":"你好","csrf":"<csrf>"}'
```

演示账号（密码统一 `abc12345`）：`13800000001` ~ `13800000006`。

---

## 7. 前端接入方式

把 `WebRoot/js/api.js`（后端仓库已提供）拷进前端项目，替换对 `js/mock/api.js` 的引用：

```html
<!-- <script src="js/mock/api.js"></script> -->
<script>window.HMB_API_BASE = "http://localhost:8080/TestJDBC/api";</script>
<script src="js/api.js"></script>
```

页面层 `window.HMB.api.xxx` 调用方式与 mock 完全一致，零改动。
