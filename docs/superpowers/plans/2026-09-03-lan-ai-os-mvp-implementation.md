# LAN AI Operating System MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有本地 AI Studio 变成由一台 Windows 主机提供服务、支持账号隔离与资源共享、并拥有苹果风格桌面壳和主机桌面启动器的局域网 AI 操作系统 MVP。

**Architecture:** 保留现有 Node.js HTTP 服务和原生 HTML/CSS/JS 应用，新增一个独立的 SQLite 系统数据库保存用户、会话、资源索引、共享关系和审计记录。服务端在所有现有图片、聊天、画布和媒体路由前建立认证/授权上下文；浏览器端新增桌面壳和应用注册表；主机端用 Electron 启动器负责启动服务、托盘和 Windows 自动启动设置。

**Tech Stack:** Node.js 24.13+、内置 `node:sqlite`、内置 `crypto.scrypt`、现有原生 HTML/CSS/JS、Electron（仅主机启动器）、Node `assert` 检查脚本。

## Implementation Status (2026-09-03)

- Task 1–7 的可运行代码均已完成；Task 8 已增加统一验收脚本并生成、检查真实便携包。
- `npm run check:ai-os` 已通过，覆盖认证、账号、强制首次改密、普通用户通讯录、ACL、指定/口令共享、备份、桌面壳、主机启动器和便携清单。
- 原项目 `npm run check` 已完整通过，确认未破坏已有生图、无限画布、Canvas Agent 和供应商路由功能。
- Electron 44.1.1 已安装；当前电脑桌面与开始菜单快捷方式已创建，隐藏启动冒烟测试确认监听 `0.0.0.0:3099`。
- `dist/AI-Studio-Portable.zip` 已生成并验证不含 `.env` 与真实 `system.sqlite`。
- 与原计划的偏差：便携版采用“Electron 运行时 + `desktop/main.js` + 快捷方式安装器”，没有生成签名的单文件 `AI OS Host.exe`；完整说明见设计规格第 14 节。
- 尚未执行的 Phase 2 工作：任意文件上传、评论/复制工作流、画布子媒体授权传播、部门与审计界面、定时备份/恢复向导。
- Git 提交仍因当前执行环境不能写入 `.git/index.lock` 而延后；不要为了提交覆盖或清理用户现有的大量未提交改动。

## Global Constraints

- 部署：一台 Windows 主机 + 局域网浏览器客户端。
- MVP 不实现 GPU 工作节点、多主机同步、公开注册、计费和应用市场。
- 每个账号独立画布、文件和聊天空间；新资源默认仅自己可见。
- 共享范围固定为：仅自己、所有人、指定人、口令；权限固定为 read、comment、edit、copy。
- 超级管理员分配普通账号，不允许普通账号创建账号。
- 密码使用 Node.js `crypto.scrypt` 加盐哈希；数据库只保存哈希和会话 token 哈希。
- 现有未提交用户改动必须保留；每个任务只修改任务列出的文件。
- 服务端默认监听 `0.0.0.0:3099`，但不开放公网端口；错误响应不得泄露密码、Cookie 或 API Key。

## File Map

### New files

- `auth-crypto.js`：密码哈希、校验和随机 token 工具。
- `system-db.js`：系统 SQLite 数据库、迁移和账户/会话/资源/共享/审计持久化。
- `auth-service.js`：登录、登出、会话解析、密码修改和角色检查。
- `resource-access.js`：资源归属和共享 ACL 的统一读写判断。
- `backup-service.js`：系统数据库、元数据和用户媒体的可恢复快照。
- `desktop-shell.js`：浏览器端桌面、Dock、应用注册和窗口状态。
- `desktop-shell.css`：苹果风格桌面壳样式，避免继续膨胀 `styles.css`。
- `account-management-ui.js`：账户管理应用的渲染和交互。
- `desktop/main.js`：Electron 主机窗口、服务子进程、托盘和单实例锁。
- `desktop/preload.js`：仅暴露主机状态和自动启动设置 API。
- `desktop/autostart.js`：Electron 登录项读写适配。
- `tools/check-auth-crypto.js`、`tools/check-system-db.js`、`tools/check-auth-service.js`、`tools/check-resource-access.js`、`tools/check-backup-service.js`：Node 检查脚本。
- `tools/check-ai-os-shell.js`：静态浏览器壳契约检查。
- `tools/check-auth-endpoint.js`、`tools/check-resource-endpoint.js`：启动临时 HTTP 服务后的集成检查。

### Existing files to modify

- `server.js`：初始化系统数据库，增加认证上下文，接入管理/资源/共享/健康/备份路由，并为旧路由注入当前用户。
- `index.html`：加入登录门、桌面栏、Dock、应用窗口和账户管理视图。
- `script.js`：将现有 image/chat/records 视图注册为桌面应用并携带会话错误处理。
- `styles.css`：仅保留现有应用样式和少量兼容规则；新桌面样式放入 `desktop-shell.css`。
- `package.json`：新增系统检查、桌面启动和打包脚本；加入 Electron 开发依赖。
- `build-portable.bat`、`start.bat`、`tools/portable-package-manifest.js`：把主机启动器、桌面图标资源和自动启动配置纳入便携包。
- `README.md`：补充主机安装、局域网访问、创建账号和关闭自动启动说明。

---

### Task 1: 密码和系统数据库基础

**Files:**
- Create: `auth-crypto.js`
- Create: `system-db.js`
- Create: `tools/check-auth-crypto.js`
- Create: `tools/check-system-db.js`
- Modify: `package.json`（加入 `check:system`）

**Interfaces:**
- `auth-crypto.js` produces `hashPassword(password, options)`, `verifyPassword(password, encoded)`, `createOpaqueToken(byteLength)`。
- `system-db.js` produces `createSystemDb({ dbPath, clock })`，返回 `migrate()`, `close()`, `countUsers()`, `getUserById(id)`, `getUserByUsername(username)`, `listUsers()`, `insertUser(input)`, `updateUser(id, patch)`, `createSession(input)`, `getSessionByTokenHash(tokenHash)`, `revokeSession(id)`, `revokeUserSessions(userId)`, `registerResource(input)`, `getResource(id)`, `listVisibleResources(userId, type)`, `createShare(input)`, `updateShare(id, patch)`, `deleteShare(id)`, `appendAudit(input)`, `getSetting(key)`, `setSetting(key, value)`。

- [x] **Step 1: Write the failing password checks**

在 `tools/check-auth-crypto.js` 中验证：同一密码的两次哈希不同；正确密码能校验；错误密码不能校验；格式损坏返回 false；token 长度与随机性满足要求。

- [x] **Step 2: Run the password check to verify it fails**

Run: `node tools/check-auth-crypto.js`

Expected: FAIL with `Cannot find module '../auth-crypto'`。

- [x] **Step 3: Implement password hashing**

使用 Node 内置 API，编码格式固定为 `scrypt$N$r$p$saltBase64$hashBase64`。默认参数 `N=16384,r=8,p=1,keylen=64`；比较使用 `timingSafeEqual`；密码为空或超过 4096 字符时抛出 `invalid_password`。

- [x] **Step 4: Run the password check to verify it passes**

Run: `node tools/check-auth-crypto.js`

Expected: `Auth crypto checks passed.`

- [x] **Step 5: Write the failing database checks**

在 `tools/check-system-db.js` 中使用 `fs.mkdtempSync(os.tmpdir())` 创建临时库，检查迁移后表存在；插入 `superadmin` 和 `user`；用户名唯一；会话可创建和撤销；资源默认仅 owner 可见；共享给指定用户后可见；审计事件可读取。结束时关闭数据库并删除临时目录。

- [x] **Step 6: Run the database check to verify it fails**

Run: `node --disable-warning=ExperimentalWarning tools/check-system-db.js`

Expected: FAIL with `Cannot find module '../system-db'`。

- [x] **Step 7: Implement the SQLite schema and repository**

使用 `DatabaseSync` 建立以下表：`schema_meta`、`users`、`sessions`、`resources`、`shares`、`share_members`、`audit_events`、`system_settings`。`resources` 额外包含 `ref_type` 和 `ref_id`，用于映射现有图片、聊天和画布 ID，并建立 `(ref_type, ref_id)` 唯一索引。所有时间保存 ISO 字符串；`users.username` 唯一；`resources.owner_user_id` 和 `shares.resource_id` 建索引；删除使用 `deleted_at` 软删除。`listVisibleResources` 的 SQL 必须同时覆盖 owner、visibility=all、share_members 三种情况，password 共享只在解锁后的服务层临时放行。

- [x] **Step 8: Run the database check to verify it passes**

Run: `node --disable-warning=ExperimentalWarning tools/check-system-db.js`

Expected: `System database checks passed.`

- [x] **Step 9: Add the package script and commit**

在 `package.json` 增加：

```json
"check:system": "node tools/check-auth-crypto.js && node --disable-warning=ExperimentalWarning tools/check-system-db.js"
```

Run: `npm run check:system`

Expected: 两个检查均 PASS。Commit: `feat: add system database primitives`。

> 状态说明：代码与检查已完成；当前运行环境禁止写入 `.git/index.lock`，因此提交动作延后，不影响后续实现。

### Task 2: 认证服务和 HTTP 会话

**Files:**
- Create: `auth-service.js`
- Create: `tools/check-auth-service.js`
- Create: `tools/check-auth-endpoint.js`
- Modify: `server.js`
- Modify: `package.json`（加入 `check:auth`）

**Interfaces:**
- `createAuthService({ db, sessionTtlMs, now })` returns `bootstrapSuperAdmin`, `login`, `logout`, `resolveSession`, `changePassword`, `requireRole`。
- `parseCookies(header)` and `serializeSessionCookie(token, maxAgeSeconds)` are exported for endpoint tests。
- HTTP auth context shape is `{ user: { id, username, displayName, role, status, mustChangePassword }, sessionId }`。

- [x] **Step 1: Write service tests**

覆盖首次 bootstrap、重复 bootstrap 拒绝、正确/错误密码、禁用账号不能登录、会话过期、登出撤销、密码修改撤销旧会话、普通用户角色检查失败。

- [x] **Step 2: Run service tests to verify they fail**

Run: `node tools/check-auth-service.js`

Expected: FAIL with missing `auth-service`。

- [x] **Step 3: Implement auth service**

登录成功后创建 32 字节随机 token，只把 `sha256(token)` 写入 `sessions.token_hash`，明文 token 仅返回给 HTTP 层写 Cookie。`resolveSession` 检查撤销标记、过期时间和用户状态；`changePassword` 先校验旧密码，再更新哈希并撤销用户其他会话。

- [x] **Step 4: Run service tests to verify they pass**

Run: `node tools/check-auth-service.js`

Expected: `Auth service checks passed.`

- [x] **Step 5: Add server initialization and auth routes**

在 `server.js` 创建 `systemDb` 和 `authService`，启动时执行 `migrate()`。将数据根目录改为 `process.env.AI_OS_DATA_DIR || path.join(__dirname, "data")`，使集成检查可以使用临时目录。增加：

```text
POST /api/auth/bootstrap（仅主机回环地址，且仅空数据库可用）
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/change-password
```

新增 `getAuthContext(req)`、`requireAuth(req,res)`、`requireSuperAdmin(req,res)`，在现有业务路由前调用。未登录的 `/api/*` 返回 401；静态入口仍返回登录门页面，不返回用户数据。

- [x] **Step 6: Write endpoint tests**

`tools/check-auth-endpoint.js` 启动临时端口服务，POST login，读取 `set-cookie`，GET session，POST logout，再用旧 Cookie 验证返回 401；测试错误密码返回 401 且不包含 `password_hash`。

- [x] **Step 7: Run endpoint tests to verify they pass**

Run: `node tools/check-auth-endpoint.js`

Expected: `Auth endpoint checks passed.`

- [x] **Step 8: Commit**

在 `package.json` 增加：

```json
"check:auth": "node tools/check-auth-service.js && node tools/check-auth-endpoint.js"
```

Run: `npm run check:auth`

Expected: service 与 endpoint checks PASS。Commit: `feat: add account authentication`。

> 状态说明：代码与检查已完成；与 Task 1 相同，Git 提交因当前环境不能写入 `.git/index.lock` 而延后。

### Task 3: 账户管理和资源 ACL

**Files:**
- Create: `resource-access.js`
- Create: `tools/check-resource-access.js`
- Create: `tools/check-resource-endpoint.js`
- Modify: `system-db.js`
- Modify: `server.js`

**Interfaces:**
- `createResourceAccess({ db })` returns `registerResource(input)`, `assertRead(userId, resourceId, options)`, `assertWrite(userId, resourceId, options)`, `listVisible(userId, type)`, `createShare(userId, resourceId, input)`, `unlockShare(userId, shareId, password)`。
- `registerLegacyResources({ db, ownerUserId, dataDir })` is idempotent and returns `{ images, chats, canvases }` counts。

- [ ] **Step 1: Write ACL matrix tests**

验证 owner 读写；普通用户不能读取他人私有资源；all/read 可读但不可写；users/edit 可读写；copy 只允许创建副本；password 共享未解锁前不可读；撤销共享后旧权限立即失效；disabled 用户无权访问。

- [ ] **Step 2: Run ACL tests to verify they fail**

Run: `node tools/check-resource-access.js`

Expected: FAIL with missing `resource-access`。

- [ ] **Step 3: Implement ACL checks**

所有检查先加载 user 状态，再加载 resource 和 share；错误码固定为 `not_authenticated`、`forbidden`、`resource_not_found`、`share_password_required`。password 解锁只返回短期内存凭证，不把明文口令写数据库。

- [ ] **Step 4: Run ACL tests to verify they pass**

Run: `node tools/check-resource-access.js`

Expected: `Resource access checks passed.`

- [ ] **Step 5: Implement admin user endpoints**

增加：

```text
GET   /api/admin/users
POST  /api/admin/users
PATCH /api/admin/users/:id
POST  /api/admin/users/:id/reset-password
POST  /api/admin/users/:id/revoke-sessions
```

创建普通用户时生成临时密码并只在本次响应中返回；响应标记 `mustChangePassword=true`。禁止删除最后一个 superadmin；停用账号立即撤销会话。

- [ ] **Step 6: Connect existing history/canvas/media routes to owner context**

在现有 `/api/history/images`、`/api/history/chat`、`/api/canvas/boards`、`/api/canvas/media/*`、`/api/image-jobs` 路由中，调用 `registerResource` 记录 `ref_type/ref_id`，查询时经过 `listVisible`。旧资源没有 owner 时由首次 superadmin 接管，迁移函数重复执行不重复插入。

- [ ] **Step 7: Add resource/share endpoints and integration tests**

增加：

```text
GET    /api/resources?type=file|canvas|chat|image|video|job
GET    /api/resources/:id
PATCH  /api/resources/:id
DELETE /api/resources/:id
POST   /api/resources/:id/shares
PATCH  /api/shares/:id
DELETE /api/shares/:id
POST   /api/shares/:id/unlock
```

`tools/check-resource-endpoint.js` 用三个账号验证私有/全员/指定/口令矩阵，并验证 C 账号无法通过猜测 ID 读取 A 资源。

- [ ] **Step 8: Run checks and commit**

Run: `node tools/check-resource-access.js; node tools/check-resource-endpoint.js`

Expected: 两个检查 PASS。Commit: `feat: enforce per-user resources and sharing`。

### Task 4: 浏览器桌面壳和应用注册表

**Files:**
- Create: `desktop-shell.js`
- Create: `desktop-shell.css`
- Create: `tools/check-ai-os-shell.js`
- Modify: `index.html`
- Modify: `script.js`

**Interfaces:**
- Browser global `window.AiOsAppRegistry.register({ id, label, icon, viewId, roles })`、`getVisibleApps(role)`。
- Browser global `window.AiOsDesktop.openApp(id)`、`focusApp(id)`、`minimizeApp(id)`、`closeApp(id)`、`setSession(session)`。

- [ ] **Step 1: Add static shell contract tests**

`tools/check-ai-os-shell.js` 读取 `index.html` 和 `desktop-shell.js`，断言存在 `#loginGate`、`#desktopShell`、`#systemBar`、`#appDock`、`#accountManagementView`、`AiOsAppRegistry.register` 和登录/登出事件绑定。

- [ ] **Step 2: Run shell check to verify it fails**

Run: `node tools/check-ai-os-shell.js`

Expected: FAIL because the new shell IDs are absent。

- [ ] **Step 3: Add shell markup**

在 `index.html` 保留现有 image/chat/records DOM，外层增加登录门、顶部栏、桌面背景、Dock 和应用窗口容器；新增账户管理窗口。未认证时只显示登录门；不在 HTML 中预填用户数据。

- [ ] **Step 4: Implement app registry and window state**

`desktop-shell.js` 维护 `Map` 类型的窗口状态：`{ id, status: 'closed'|'open'|'minimized', zIndex }`。注册 image/chat/records/canvas/records/account-settings；根据 `session.user.role` 过滤。窗口切换只改 DOM class，不销毁现有画布状态。

- [ ] **Step 5: Add Apple-style shell CSS**

`desktop-shell.css` 实现蓝紫渐变背景、磨砂面板、红黄绿窗口控制、Dock、响应式单窗口降级和深色主题变量。所有动效只使用 120–220ms 过渡，`prefers-reduced-motion` 时关闭。

- [ ] **Step 6: Connect existing script views**

在 `script.js` 启动时调用 `/api/auth/session`；401 时展示登录门。现有 image/chat/records 初始化移动到 `AiOsDesktop.openApp` 后执行，避免未登录时读取历史；fetch 统一在 401 时触发登出状态。

- [ ] **Step 7: Run shell checks and commit**

Run: `node tools/check-ai-os-shell.js; node --check desktop-shell.js; node --check script.js`

Expected: 全部 PASS。Commit: `feat: add apple-style desktop shell`。

### Task 5: 账户管理应用与共享入口

**Files:**
- Create: `account-management-ui.js`
- Modify: `index.html`
- Modify: `script.js`
- Modify: `desktop-shell.css`
- Modify: `server.js`（如需补充管理员字段返回）

**Interfaces:**
- `initAccountManagement({ root, fetchImpl, session })`：初始化账户列表、搜索、编辑和账号操作。
- `renderShareDialog({ resource, users, onSave })`：共享范围和权限选择器。

- [ ] **Step 1: Add UI contract checks**

扩展 `tools/check-ai-os-shell.js`，断言账户管理包含用户/部门分段占位、搜索框、添加按钮、账号详情字段、状态和密码状态；资源卡片包含共享按钮。

- [ ] **Step 2: Implement superadmin account view**

普通用户访问账户管理应用时只渲染个人资料和会话列表；superadmin 渲染账号列表、创建表单、停用/启用、重置临时密码和撤销会话操作。所有危险操作使用应用内确认弹窗，不使用浏览器原生 `confirm`。

- [ ] **Step 3: Implement login and first-password-change views**

登录表单提交 `/api/auth/login`；收到 `mustChangePassword` 时强制打开修改密码窗口，成功后才进入桌面。错误只显示“用户名或密码错误”等通用信息。

- [ ] **Step 4: Implement sharing dialog**

资源卡片的共享按钮打开“仅自己 / 所有人 / 指定人 / 口令”分段选择；指定人使用用户列表多选；权限选择 read/comment/edit/copy；保存调用资源 share API，成功后更新卡片徽标。

- [ ] **Step 5: Run browser/static checks**

Run: `node tools/check-ai-os-shell.js; node --check account-management-ui.js`

Expected: PASS。手动验证：superadmin 创建账号，普通账号登录并修改临时密码，A 共享画布给 B 后 B 可见。

- [ ] **Step 6: Commit**

Commit: `feat: add account and sharing applications`。

### Task 6: 备份、健康状态和主机运维

**Files:**
- Create: `backup-service.js`
- Create: `tools/check-backup-service.js`
- Modify: `server.js`
- Modify: `index.html`
- Modify: `desktop-shell.js`
- Modify: `README.md`

**Interfaces:**
- `createBackupService({ db, dataDir, backupDir, clock })` returns `createSnapshot({ includeMedia })`, `listSnapshots()`, `verifySnapshot(path)`, `restoreSnapshot(path)`。
- `GET /api/system/health` returns `{ ok, version, uptime, dataDir, freeBytes, lanUrls }`，不包含密钥。
- `POST /api/admin/backup` and `GET /api/system/backup/status` are superadmin-only。

- [ ] **Step 1: Write backup tests**

创建临时 data 目录和数据库，写入用户/资源/媒体，生成快照，验证 manifest、数据库 quick check 和媒体 hash；修改原数据后恢复并验证内容回到快照状态；恢复前自动留下 `pre-restore-*` 快照。

- [ ] **Step 2: Run backup tests to verify they fail**

Run: `node tools/check-backup-service.js`

Expected: FAIL with missing `backup-service`。

- [ ] **Step 3: Implement snapshot service**

数据库通过 `VACUUM INTO` 生成一致性副本；用户元数据和媒体使用 `fs.cp` 复制；manifest 保存版本、创建时间、相对路径和 SHA-256。禁止把 `tmp/uploads`、缓存和 `.env` 纳入备份。

- [ ] **Step 4: Add health and backup routes/UI**

健康接口显示磁盘空间、服务 uptime、端口和局域网 URL；设置窗口显示主机在线、备份按钮和最近快照。备份按钮仅 superadmin 可见。

- [ ] **Step 5: Run checks and commit**

Run: `node tools/check-backup-service.js; node --check backup-service.js; node --check server.js`

Expected: PASS。Commit: `feat: add host health and backups`。

### Task 7: Electron 主机应用、桌面图标和自动启动

**Files:**
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Create: `desktop/autostart.js`
- Create: `desktop/icon.ico`（由现有 `logo.png` 转换，保持项目品牌）
- Modify: `package.json`
- Modify: `build-portable.bat`
- Modify: `start.bat`
- Modify: `tools/portable-package-manifest.js`
- Modify: `README.md`
- Create: `tools/check-host-launcher.js`

**Interfaces:**
- Main process starts `server.js` as a child with inherited `PORT`, waits for `/api/system/health`, then creates BrowserWindow loading `http://127.0.0.1:<port>`。
- IPC methods: `host.getStatus()`, `host.openSystem()`, `host.getAutostart()`, `host.setAutostart(enabled)`, `host.quit()`。
- `autostart.js` exports `getAutostart(app)`, `setAutostart(app, enabled)` and uses Electron `app.getLoginItemSettings()` / `app.setLoginItemSettings()` on Windows。

- [ ] **Step 1: Add launcher contract checks**

`tools/check-host-launcher.js` 静态检查单实例锁、`server.js` 子进程、健康轮询、托盘、`getLoginItemSettings`、`setLoginItemSettings` 和退出清理逻辑。

- [ ] **Step 2: Add Electron dependency and scripts**

在 `package.json` 增加开发依赖 `electron`，并加入：

```json
"desktop:start": "electron desktop/main.js",
"desktop:check": "node tools/check-host-launcher.js"
```

如依赖安装需要网络权限，先请求用户允许安装；安装后运行 `npm install` 和 `npm run desktop:check`。

- [ ] **Step 3: Implement Electron main process**

使用 `app.requestSingleInstanceLock()` 防止重复启动；`spawn(process.execPath, ['server.js'])` 仅在开发模式使用，便携包使用内置 Node runtime 路径。主进程监听退出并关闭子进程；窗口关闭改为隐藏到托盘；托盘菜单提供“打开系统、复制局域网地址、自动启动、退出”。

- [ ] **Step 4: Implement autostart toggle**

设置窗口调用 IPC 读取开关，切换时写入 Windows 登录项；禁用后只影响下次开机，不停止当前服务。应用首次启动默认关闭自动启动，用户明确开启后才写入登录项。

- [ ] **Step 5: Package desktop shortcut**

便携包根目录包含 `AI OS Host.exe`、`AI OS Host.lnk` 和 `start.bat` 兼容入口；快捷方式目标指向主机 exe，工作目录指向便携根目录。更新 `portable-package-manifest.js` 和 `build-portable.bat`，验证桌面图标资源与启动器一同复制。

- [ ] **Step 6: Update README and run launcher checks**

README 明确：主机双击桌面图标即可启动；设置中可关闭开机启动；局域网设备访问显示的地址；关闭窗口进入托盘，退出才停止服务。

Run: `node tools/check-host-launcher.js; npm run desktop:check`

Expected: PASS。Commit: `feat: add windows host launcher and autostart`。

### Task 8: 端到端验收、迁移和发布

**Files:**
- Create: `tools/check-ai-os-mvp.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-03-dxos-lan-ai-os-design.md`（记录实现偏差和完成项）

- [ ] **Step 1: Build an isolated MVP fixture**

使用临时 `DATA_DIR`、临时端口和三个测试账号启动 server，禁止读取真实 `data/`、`output/` 和 `.env`；fixture 包含一个旧画布、一个旧聊天记录和一张媒体文件。

- [ ] **Step 2: Run the full user journey**

依次验证：首次 superadmin bootstrap → 创建 A/B → A 登录并修改密码 → A 创建画布/聊天/图片 → A 私有资源不被 B 读取 → A 共享给 B → B 可读但按权限不可写 → 撤销共享 → B 立即失权 → 停用 B → B 会话失效 → 生成备份 → 恢复后资源和权限一致。

- [ ] **Step 3: Run project checks**

Run: `npm run check:system; npm run check:auth; node tools/check-resource-access.js; node tools/check-resource-endpoint.js; node tools/check-ai-os-shell.js; node tools/check-backup-service.js; node tools/check-host-launcher.js`

Expected: 全部 PASS；已有 `npm test` 或 `npm run check` 中与本任务无关的失败必须单独记录，不得删除原检查。

- [ ] **Step 4: Verify portable package**

Run: `build-portable.bat --no-pause`，检查便携包中有主机启动器、桌面图标、服务资源、`data/` 和 `output/` 空目录；不包含 `.env`、真实历史数据或临时上传文件。

- [ ] **Step 5: Update the spec and commit release notes**

在设计规格的“关键决策与验收标准”后追加实际完成项、已知限制和下一阶段入口；更新 README 的局域网部署说明。Commit: `docs: record LAN AI OS MVP verification`。

## Execution Notes

- 实施顺序必须保持 Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8；后续任务依赖前一任务的接口。
- 每个任务完成后先运行该任务的检查，再进行提交；不得用一次大重构替代逐步迁移。
- 任何需要改变共享语义、角色定义、主机部署方式或 MVP 边界的需求，先更新设计规格，再更新本计划。
