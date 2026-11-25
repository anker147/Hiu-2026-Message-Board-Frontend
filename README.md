# Hiu-2026 留言板（全栈）

黑龙江外国语学院 2024 级计算机科学与技术三班全栈开发实战项目 —— 留言板。

前后端一体的完整项目：根目录是**零构建原生前端**（HTML/CSS/JS），`backend/` 是 **Java Servlet/JSP + MySQL 后端**（TestJDBC）。前端已接入真实后端适配层（`js/api.js`），演示数据已清空，接口路径与后端 `/api/*` 完全对齐。

---

## 仓库结构

```
.                          前端（原生 HTML/CSS/JS，零构建零依赖）
├── index.html             根入口（GitHub Pages / 静态服务器首页）
├── pages/                 各功能页（index / edit / zone / login / detail / profile / all / gm）
│   └── *.html             同目录互链，资源以 ../ 引用根目录 css/js/fonts
├── css/                   tokens / base / components / pages 样式
├── fonts/                 fusion-pixel 像素字体（OFL 开源）
├── js/
│   ├── api.js             真实后端 fetch 适配层（Bearer 令牌 + csrf + 401 清令牌）
│   ├── ui-text.js         文案集中管理（点分键 + t() + VERSION）
│   ├── core/util.js       工具 + 页面过渡 / 逐条入场动画
│   ├── components.js      共享组件（导航岛 / 榜单卡 / 评论树 / 弹窗 / 盲盒）
│   ├── mock/              seed.js + db.js（仅保留常量与词库，演示数据已清空）
│   └── pages/             各页逻辑（board/about/auth/detail/edit/profile/zone/all/gm）
├── docs/                  API 接口文档 / 数据库表结构文档（交付后端团队的契约）
└── backend/               TestJDBC 后端（Java Servlet/JSP）
    ├── src/               源码（servlet / api / dao / service / domain / util / filter / db）
    ├── WebRoot/           JSP 页面 + WEB-INF（web.xml / classes / lib）
    ├── sql/               建表与升级脚本
    │   ├── messageboard.sql
    │   ├── api-contract-tables.sql
    │   └── upgrade-2026-11-19.sql
    ├── docs/              后端接口 / 表结构差异说明
    └── *.docx / *.md      产品需求、功能清单、交付文档、接口差异分析
```

---

## 快速开始

### 前端（静态站点）

无需构建、无需依赖。直接起一个静态服务器：

```bash
python -m http.server 8080
# 打开 http://localhost:8080/  （或 http://localhost:8080/pages/index.html）
```

前端默认请求后端地址 `http://localhost:8080/TestJDBC/api`。如后端不在该地址，在引入 `js/api.js` **之前**设置：

```html
<script>window.HMB_API_BASE = "http://your-host:port/context/api";</script>
```

> 纯前端双击 `pages/*.html`（file://）仍可打开页面骨架，但接口请求需要后端可达。

### 后端（TestJDBC）

后端是传统 Servlet/JSP 工程（MyEclipse 风格），需部署到 **Servlet 容器（如 Tomcat）** 并连接 **MySQL**：

1. **数据库**：按 `backend/sql/` 下的脚本建库建表（`messageboard.sql` → `api-contract-tables.sql` → 按需 `upgrade-2026-11-19.sql`）。
2. **连接配置**：修改 `backend/src/db/DatabaseConn.java` 中的 URL / 端口 / 账号 / 密码为本机 MySQL 实际值。当前文件里写死的是原开发环境的参数，**需按你的环境调整**。
3. **部署**：将 `backend/WebRoot` 作为 Web 应用部署到 Tomcat，上下文路径建议为 `TestJDBC`（与前端默认 BASE 一致）。
4. **接口**：统一入口 `ApiServlet` 映射 `/api/*`，覆盖登录注册、会话、留言、评论、点赞收藏、盲盒、个人主页等 REST 接口。

> 说明：GM 管理接口在本期后端范围未开放，前端 GM 页面骨架可正常渲染，但相关接口会返回 `code:-1`。

---

## 线上访问

推送 `main` 后 GitHub Pages 自动构建：

```
https://anker147.github.io/Hiu-2026-Message-Board-Frontend/
```

根路径 `index.html` 自动跳转到入口页。

---

## 主要功能

| 模块 | 说明 |
|---|---|
| 热度周榜 / 本周新帖 | 双榜岛内切换；热度由前端按公式实时计算，后端只提供原始 stats；折线图一期一个真实点，最多 8 周，无数据不估算 |
| 全部留言 | 岛内视图，全站公开帖按时间倒序 + 全局搜索（标题/正文/昵称/话题/编号/用户 ID） |
| 留言详情 | 树状评论（二级回复 + @引用）、点赞、收藏；统计四项数据联动更新 |
| 发布 / 编辑 | 富文本编辑器（字体/字号/标题/序号/首行缩进/对齐）、自定义话题（随 `topic` 字段透传后端）、封面与文末最多 10 图 |
| 登录 / 注册 | Stella 式沉浸设计，浮动标签表单；真实后端鉴权（Bearer 令牌 + csrf） |
| 个人主页 | 动态 / 赞过 / 收藏 / 话题足迹；活跃度称号前端按需计算；头像上传 |
| GM 管理 | 岛内视图；权限、封禁解封、禁言、改资料、隐藏/删除内容、审计（依赖后端 GM 接口开放） |
| 内容安全 | 敏感词库 100 词 / 8 类，写接口拦截 + 展示层脱敏；限流由后端控制 |

---

## 文档

- `docs/API接口文档.md` —— 前后端接口契约（含图片上传 U1、GM 接口 G1–G17）
- `docs/数据库表结构文档.md` —— 表结构与 SQL 建议（基础 11 张 + GM 审计 1 张，共 12 张）
- `backend/前后端接口差异分析.md` —— 后端视角的接口差异说明

---

## 技术约定

- **零构建**：前端无 npm / 无打包器，浏览器直接运行；脚本加载顺序固定，`window.HMB` 为全局命名空间。
- **后端权威**：热度 / 排名由前端计算展示，后端不存 `heat` / `rank`；缺失的历史字段显示 `--` 或 0，不推算。
- **敏感词**：词库与脱敏常量保留在 `js/mock/seed.js`，展示层 `U.maskSensitive()` 过滤，编辑页与 GM 保留原文。
- **动画**：统一 `--ease-std` / `--t-*` 令牌，页面切换 / 表单逐条入场 / 悬浮按钮逐层飞入，`prefers-reduced-motion` 降级。
