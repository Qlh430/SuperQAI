# 无限画布项目管理与共享实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将无限画布升级为 DX OS 风格的项目目录、多个画布归属、画布级共享和“协同文件”筛选，同时把历史画布无损迁移到每个账号的“未分类”项目。

**Architecture:** 项目目录存放在现有 `system.sqlite`，画布节点和增量操作继续存放在 `canvas.db`。`boards.project_id` 连接两层；画布对应的 `resources` 行用 `workspace_id` 镜像项目归属，所有读取和写入仍由 `resource-access.js` 的账号权限校验负责。前端在现有画布编辑器外增加 DX OS 风格画廊，编辑器、虚拟化、媒体和增量保存接口保持兼容。

**Tech Stack:** Node.js 24、内置 `node:sqlite`、现有 worker-thread 画布仓库、原生 HTML/CSS/JavaScript、Playwright 浏览器验收脚本。

**Execution status (2026-09-05):** Tasks 1–6 implemented and verified. Final hardening also adds project rename/move panels, owner-only management controls, live collaboration refresh, five-scale browser coverage, and isolated legacy test databases. Detailed results are recorded in `.superpowers/sdd/progress.md`.

## Global Constraints

- 旧画布迁移到每个所有者的“未分类”项目，保留画布 ID、内容、版本和已有共享设置。
- 画布可见范围的 UI 只显示 `private`、`all`、`users`；服务器继续兼容既有 `password` 共享数据。
- 项目只属于创建者，本轮不实现项目级共享和实时多人编辑。
- `scope=all`、`scope=mine`、`scope=shared` 和 `projectId` 过滤必须在服务端执行，不能依赖前端隐藏数据保证安全。
- 现有画布节点增量保存、版本冲突、回收站、媒体引用和全局主题/缩放行为必须保持兼容。
- 不执行 Git 提交、推送或修改 `.git` 目录。

---

### Task 1: 系统数据库项目目录与领域服务

**Files:**
- Modify: `system-db.js`（迁移版本、项目表、项目映射与 CRUD）
- Create: `canvas-project-service.js`（项目名称、归属和迁移编排）
- Create: `tools/check-canvas-project-service.js`（项目目录和迁移测试）
- Modify: `package.json`（加入 `check:canvas-projects`）

**Interfaces:**
- Consumes: `createSystemDb()`、`db.listUsers()`、`db.listVisibleResources()`。
- Produces: `db.createCanvasProject(input)`、`db.listCanvasProjects(ownerUserId)`、`db.getCanvasProject(id)`、`db.renameCanvasProject(id,name)`、`createCanvasProjectService({db, canvasRepository})` with `ensureUnclassifiedProject(ownerUserId)` and `requireOwnerProject(ownerUserId, projectId)`。

- [ ] **Step 1: Write the failing test**

```js
const project = db.createCanvasProject({ id: "project-a", ownerUserId: "user-a", name: "未分类" });
assert.deepEqual(project, {
  id: "project-a", ownerUserId: "user-a", name: "未分类",
  createdAt: project.createdAt, updatedAt: project.updatedAt,
});
assert.equal(db.listCanvasProjects("user-a").length, 1);
assert.equal(db.listCanvasProjects("user-b").length, 0);
assert.throws(() => db.renameCanvasProject("project-a", ""), /name/i);
```

Add a migration assertion that a second call to `ensureUnclassifiedProject("user-a")` returns the same project ID.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-project-service.js`

Expected: FAIL because `createCanvasProject` and `ensureUnclassifiedProject` do not exist.

- [ ] **Step 3: Write minimal implementation**

Add `canvas_projects` to `system-db.js` migration with `id`, `owner_user_id`, `name`, `created_at`, `updated_at`, a unique `(owner_user_id,name)` index, mapping helpers and CRUD methods. `canvas-project-service.js` must normalize names with whitespace folding and a maximum of 80 characters, reject non-owner project access with `canvas_project_forbidden`, and implement:

```js
async function ensureUnclassifiedProject(ownerUserId) {
  const existing = db.listCanvasProjects(ownerUserId).find((item) => item.name === "未分类");
  return existing || db.createCanvasProject({ ownerUserId, name: "未分类" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-project-service.js`

Expected: PASS with project creation, owner isolation, normalization and idempotent default project checks.

- [ ] **Step 5: Add the check command**

Add `"check:canvas-projects": "node --disable-warning=ExperimentalWarning tools/check-canvas-project-service.js"` to `package.json`, then run `npm run check:canvas-projects`.

### Task 2: 画布数据库 project_id 元数据与目录迁移

**Files:**
- Modify: `canvas-schema.js`（schema version 5 和 `boards.project_id` 补列）
- Modify: `canvas-db-worker.js`（读写 project_id、设置归属）
- Modify: `canvas-repository.js`（暴露 `setBoardProject`）
- Modify: `canvas-command-service.js`（项目归属命令）
- Modify: `canvas-query-service.js`（返回 projectId）
- Create: `tools/check-canvas-project-metadata.js`

**Interfaces:**
- Consumes: Task 1 project IDs and existing worker board methods.
- Produces: `repository.setBoardProject({boardId, projectId})` and `commandService.setProject(boardId, projectId)`; board summaries expose `projectId`.

- [ ] **Step 1: Write the failing test**

```js
const board = await repository.createBoard({ id: "board-a", title: "A", projectId: "project-a" });
assert.equal(board.projectId, "project-a");
const moved = await repository.setBoardProject({ boardId: board.id, projectId: "project-b" });
assert.equal(moved.projectId, "project-b");
assert.equal(moved.revision, board.revision);
```

Also open a schema-v4 fixture and assert initialization adds `project_id` without deleting any rows.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-project-metadata.js`

Expected: FAIL because `boards.project_id` and `setBoardProject` are missing.

- [ ] **Step 3: Write minimal implementation**

Set `SCHEMA_VERSION = 5`; create the column with `ALTER TABLE boards ADD COLUMN project_id TEXT` when absent. Include `project_id` in `boardRow()` and `toBoardMeta()`. Pass `projectId` through `createBoard()`. Add a transactional worker handler that updates only `project_id` and `updated_at`, returns the refreshed board, and does not increment content `revision`. Expose the method through repository and command service.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-project-metadata.js`

Expected: PASS with fresh schema, v4 upgrade, create, move and revision preservation.

- [ ] **Step 5: Run existing storage regression checks**

Run: `npm run check:canvas-storage`

Expected: all existing canvas schema, repository, operations, migration, services and endpoint checks pass.

### Task 3: 服务端项目目录、旧画布迁移与筛选 API

**Files:**
- Modify: `server.js`（项目服务初始化、目录 helper、routes）
- Create: `tools/check-canvas-project-endpoint.js`

**Interfaces:**
- Consumes: Task 1 system-db project methods and Task 2 repository/command methods; existing `resourceAccess.assertRead/assertWrite`.
- Produces: `GET/POST/PATCH /api/canvas/projects`, extended `GET /api/canvas/boards`, `PATCH /api/canvas/boards/:id/project`.

- [ ] **Step 1: Write the failing HTTP test**

Create an isolated server fixture with users `user-a` and `user-b`, then assert:

```js
const project = await request("POST", "/api/canvas/projects", { name: "项目 A" }, sessionA);
assert.equal(project.status, 201);
const boards = await request("GET", "/api/canvas/boards?scope=all", null, sessionA);
assert.ok(Array.isArray(boards.body.projects));
assert.ok(boards.body.boards.every((board) => board.projectId));
const shared = await request("GET", "/api/canvas/boards?scope=shared", null, sessionB);
assert.equal(shared.body.boards.some((board) => board.id === publicBoardId), true);
const privateBoards = await request("GET", "/api/canvas/boards?scope=shared", null, sessionB);
assert.equal(privateBoards.body.boards.some((board) => board.id === privateBoardId), false);
```

Add assertions that moving a board to another user’s project returns 403 and that the second migration call does not change IDs or timestamps unexpectedly.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/check-canvas-project-endpoint.js`

Expected: FAIL with missing project route or missing `projects/projectId` fields.

- [ ] **Step 3: Write minimal implementation**

Initialize `createCanvasProjectService({ db: systemDb, canvasRepository: getCanvasStorage().repository })`. Add a helper that, for every board summary, finds or creates its resource, determines the resource owner, ensures that owner’s “未分类” project, assigns missing `project_id`, and synchronizes `resources.workspace_id`. Enrich each board with `ownerUserId`, `mine`, `visibility`, `access`, `permission`, `projectId`, and `share` from `resourceAccess`.

Implement server-side scope behavior:

```js
if (scope === "mine") boards = boards.filter((board) => board.mine);
if (scope === "shared") boards = boards.filter((board) => !board.mine);
if (projectId) {
  const project = projectService.requireOwnerProject(userId, projectId);
  boards = boards.filter((board) => board.mine && board.projectId === project.id);
}
```

`POST /api/canvas/boards` defaults to the current user’s “未分类” project and validates a supplied project ID. Project mutations append audit events. `PATCH /api/canvas/boards/:id/project` requires owner access, calls `commandService.setProject`, and updates the resource workspace ID.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/check-canvas-project-endpoint.js`

Expected: PASS for project CRUD, legacy migration, scope filtering, account isolation, board move and resource synchronization.

- [ ] **Step 5: Run auth/resource regressions**

Run: `npm run check:auth && npm run check:resources && npm run check:canvas-storage`

Expected: all commands exit 0.

### Task 4: 画布工作区 DX OS 风格项目画廊

**Files:**
- Modify: `script.js`（画廊状态、API client、项目/画布渲染和事件）
- Modify: `styles.css`（侧栏、项目树、卡片、空状态、共享徽标）
- Create: `tools/check-canvas-project-gallery.js`

**Interfaces:**
- Consumes: Task 3 board/project API response and existing `openCanvasBoardFromHistory`, `createNewCanvasBoard`, `renderCanvasBoardList` behavior.
- Produces: browser-callable `loadCanvasWorkspace({scope, projectId})`, `renderCanvasWorkspace()`, `openCanvasProjectDialog()`, `moveCanvasToProject(boardId, projectId)`.

- [ ] **Step 1: Write the failing browser/static test**

Assert that `ensureCanvasMarkup()` produces:

```js
assert.ok(document.querySelector("[data-canvas-scope='all']"));
assert.ok(document.querySelector("[data-canvas-scope='shared']"));
assert.ok(document.querySelector("[data-canvas-project-tree]"));
assert.ok(document.querySelector("[data-canvas-new-project]"));
```

In a browser fixture, click “协同文件” and assert the request URL contains `scope=shared`; click a project node and assert `projectId` is sent.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/check-canvas-project-gallery.js`

Expected: FAIL because the project tree and scope controls do not exist.

- [ ] **Step 3: Write minimal implementation**

Extend the existing canvas board panel markup with an Apple/DX OS layout:

```html
<aside class="canvas-gallery-sidebar">
  <button data-canvas-scope="all">全部画布</button>
  <button data-canvas-scope="recent">最近使用</button>
  <div data-canvas-project-tree></div>
  <button data-canvas-scope="shared">协同文件</button>
  <button data-canvas-scope="trash">回收站</button>
</aside>
<main class="canvas-gallery-main"><div id="canvasGalleryGrid"></div></main>
```

Add a user-scoped gallery state `{ scope, projectId, projects, boards }`, fetch the extended board endpoint, render project nodes and cards, keep existing open/rename/trash actions, and add project create/rename/move actions. The “协同文件” scope must render only non-owned board cards. Clicking a card uses the existing editor restore path.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/check-canvas-project-gallery.js`

Expected: PASS for static markup, scope requests, project tree, card opening and empty/error states.

- [ ] **Step 5: Run existing canvas UI checks**

Run: `node tools/check-canvas-shell-history-theme.js; node tools/check-canvas-board-preview-ui.js; node tools/check-existing-old-canvas-ui.js`

Expected: all existing UI checks pass without removing legacy history access.

### Task 5: 画布级三态共享弹窗与协同文件联动

**Files:**
- Modify: `script.js`（画布卡片共享动作和三态表单提交）
- Modify: `index.html`（画布专用共享入口文本/可访问标签）
- Modify: `styles.css`（共享徽标、指定账号选择状态）
- Create: `tools/check-canvas-project-sharing.js`

**Interfaces:**
- Consumes: existing `/api/resources/:id/shares` and `/api/shares/:id` routes; Task 3 board `share`/`visibility` fields.
- Produces: `openCanvasShareDialog(board)` and `saveCanvasShareDialog(event)` with visibility values `private|all|users`.

- [ ] **Step 1: Write the failing test**

```js
await openCanvasShareDialog(publicBoard);
assert.deepEqual(readShareVisibilityOptions(), ["private", "all", "users"]);
await selectShareVisibility("users");
assert.equal(document.querySelector("[data-share-users]").hidden, false);
await saveShare({ visibility: "users", userIds: ["user-b"] });
const refreshed = await getBoards({ scope: "shared" }, sessionB);
assert.equal(refreshed.boards.some((item) => item.id === publicBoard.id), true);
```

Add a negative assertion for an unknown user ID returning `invalid_share_member` without changing the previous share.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/check-canvas-project-sharing.js`

Expected: FAIL because the canvas gallery has no share action and does not refresh `scope=shared` after saving.

- [ ] **Step 3: Write minimal implementation**

Add a share action to owner cards, bind the existing share dialog to the selected canvas resource, hide the password choice only in the canvas dialog, validate at least one selected account for `users`, call the existing share API, close the dialog only after success, and refresh the current gallery scope plus the card badge. Keep generic shared files’ password flow unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/check-canvas-project-sharing.js`

Expected: PASS for three visibility choices, user validation, permission preservation, account isolation and immediate collaboration-list refresh.

- [ ] **Step 5: Run resource access regression**

Run: `npm run check:resources && npm run check:auth`

Expected: all existing resource sharing and authentication checks pass.

### Task 6: 账号隔离、主题缩放和完整浏览器验收

**Files:**
- Modify: `tools/check-ai-os-browser.js`（项目/协同文件验收场景）
- Create: `tools/check-canvas-project-browser.js`（专用 Playwright 流程）
- Modify: `package.json`（加入 `check:canvas-project-browser`）
- Modify: `.superpowers/sdd/progress.md`（记录执行结果）

**Interfaces:**
- Consumes: Tasks 1–5 public API and UI.
- Produces: reproducible browser evidence for five display scales, light/dark themes, project creation, migration and per-account sharing.

- [ ] **Step 1: Write the failing browser test**

Create two ordinary accounts through the admin fixture. The test must:

1. Sign in as A and verify the migrated “未分类” project contains A’s legacy board.
2. Create project “产品图”，create two canvases under it, and move one from “未分类”.
3. Share one canvas with B and leave the other private.
4. Sign in as B and verify “协同文件” contains only the shared canvas.
5. At scales `0.75, 1, 1.25, 1.5, 1.75`, assert the project sidebar and cards remain within the logical viewport and clickable.
6. Toggle light/dark and assert the canvas gallery and editor inherit the same resolved theme.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/check-canvas-project-browser.js`

Expected: FAIL at missing project controls or missing directory fields.

- [ ] **Step 3: Write minimal implementation adjustments**

Fix only the failing integration edges discovered by the test: user-scoped local cache keys, async gallery refresh races, scale-aware dialog positioning, card keyboard focus, and editor return state. Do not bypass server permission checks or duplicate project data in localStorage beyond cache.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/check-canvas-project-browser.js`

Expected: PASS for both accounts, all five scales, light/dark themes, migration, project operations and collaboration filtering with zero unexpected page errors.

- [ ] **Step 5: Run the feature and regression suite**

Run: `npm run check:canvas-projects && npm run check:canvas-storage && npm run check:resources && npm run check:auth && npm run check:ai-os-browser`

Expected: every command exits 0; browser output reports no unexpected console/page errors.
