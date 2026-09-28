# 无限画布资产库与共享精选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在无限画布中交付复用 AI OS 文件/资源层的媒体资产库，支持个人与项目筛选、共享精选、指定人共享、收藏、点赞以及无重复上传的画布插入。

**Architecture:** 继续以 `resources` 和 `/output` 受管媒体为唯一文件事实来源，新增轻量项目使用关联、点赞与收藏表；`asset-library-service.js` 集中执行媒体规范化和权限过滤。浏览器端使用独立 `canvas-asset-library.js` 管理右侧面板，只通过资产 ID 拖放，并调用现有画布节点创建函数完成插入。

**Tech Stack:** Node.js、`node:sqlite`、原生 HTTP 服务、原生浏览器 DOM/CSS、现有画布引擎、Node `assert`、Playwright。

## Global Constraints

- 资产库不是第二套文件系统；桌面文件/资源层仍然是唯一事实来源。
- 同一媒体只保存一份二进制文件，画布与项目只保存资源 ID 和使用关联。
- 默认仅所有者可见；“共享精选”必须由所有者主动发布为 `all`，不能自动公开私人素材。
- 指定人共享继续使用 `shares/share_members`，所有资产查询必须在服务端按认证账号过滤。
- 主题必须跟随整个 AI OS；支持浅色、深色以及 75%、100%、125%、150%、175% 系统缩放。
- 保留现有 `/api/upload-image`、`/api/upload-media` 和分片接口响应字段，新增字段不能破坏旧调用者。
- 现有旧画布没有 `assetId` 时继续正常显示，不做破坏性批量重写。
- 当前 `.git` 目录保持只读；本计划执行阶段不得修改 `.git` 或尝试提交，阶段状态写入 `.superpowers/sdd/progress.md`。

---

## File Structure

- Create `asset-library-service.js`: 媒体资源规范化、范围查询、项目使用、共享精选、点赞和收藏规则。
- Create `canvas-asset-library.js`: 资产面板状态、API、渲染、搜索筛选、导入、拖放和画布插入桥接。
- Create `canvas-asset-library.css`: 资产面板、卡片、共享状态以及全局主题/缩放适配。
- Modify `system-db.js`: schema v4 与资产项目关联、点赞、收藏持久化原语。
- Modify `resource-access.js`: 提供资产服务需要的可见资源访问摘要，不放宽现有权限。
- Modify `server.js`: 注入资产服务、注册 `/api/assets` 路由、返回上传资产摘要、规范化音频类型。
- Modify `index.html`: 增加资产库按钮、右侧面板、导入 input，并加载新 CSS/JS。
- Modify `script.js`: 暴露画布资产插入桥接，在节点序列化/恢复中保留 `assetId`。
- Modify `package.json`: 增加资产库检查脚本并纳入项目验证。
- Create `tools/check-asset-library-db.js`: 数据库迁移、关联、点赞和收藏测试。
- Create `tools/check-asset-library-service.js`: 五种范围、媒体识别和权限测试。
- Create `tools/check-asset-library-endpoint.js`: 认证 HTTP 查询和写接口测试。
- Create `tools/check-canvas-asset-library-ui.js`: 静态 UI/拖放契约测试。
- Create `tools/check-canvas-asset-library-browser.js`: 两账号端到端共享、收藏、拖放和主题缩放测试。
- Modify `.superpowers/sdd/progress.md`: 记录每个任务的验证证据和未触碰 `.git` 的约束。

---

### Task 1: System database asset primitives

**Files:**
- Modify: `system-db.js`
- Create: `tools/check-asset-library-db.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `linkAssetProject(input)`, `listAssetProjectLinks(resourceId)`, `setAssetLike(userId, resourceId, liked)`, `setAssetFavorite(userId, resourceId, favorited)`, `getAssetEngagement(resourceId, userId)`, `listFavoriteResourceIds(userId)`.
- Consumes: existing `getUserById`, `getResource`, `getCanvasProject`, `runInTransaction`.

- [ ] **Step 1: Write the failing database test**

Create a temporary system database, two active users, one project and one image resource; assert schema version 4, idempotent project links, idempotent likes/favorites, per-user state and cascade cleanup:

```js
const first = db.linkAssetProject({ resourceId: image.id, projectId: project.id, boardId: "board-a" });
const second = db.linkAssetProject({ resourceId: image.id, projectId: project.id, boardId: "board-a" });
assert.equal(first.createdAt, second.createdAt);
assert.equal(db.listAssetProjectLinks(image.id).length, 1);
db.setAssetLike(alice.id, image.id, true);
db.setAssetLike(alice.id, image.id, true);
db.setAssetFavorite(bob.id, image.id, true);
assert.deepEqual(db.getAssetEngagement(image.id, alice.id), { likeCount: 1, liked: true, favorited: false });
assert.deepEqual(db.listFavoriteResourceIds(bob.id), [image.id]);
```

- [ ] **Step 2: Run the test and verify the missing API failure**

Run: `node --disable-warning=ExperimentalWarning tools/check-asset-library-db.js`

Expected: FAIL because `linkAssetProject` is not defined.

- [ ] **Step 3: Add schema v4 and database methods**

Set `SCHEMA_VERSION = 4`; create `asset_project_links`, `asset_likes`, and `asset_favorites` with the exact foreign keys and primary keys from the design. Implement each mutation as an upsert/delete and return normalized values:

```js
function setAssetLike(userId, resourceId, liked) {
  assertOpen();
  if (liked) database.prepare(`INSERT INTO asset_likes(user_id, resource_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, resource_id) DO NOTHING`).run(requiredText(userId, "userId"), requiredText(resourceId, "resourceId"), nowIso());
  else database.prepare("DELETE FROM asset_likes WHERE user_id = ? AND resource_id = ?").run(String(userId || ""), String(resourceId || ""));
  return getAssetEngagement(resourceId, userId);
}
```

Export all six methods from the database instance.

- [ ] **Step 4: Run focused database and migration checks**

Run: `node --disable-warning=ExperimentalWarning tools/check-asset-library-db.js`

Expected: `Asset library database checks passed.`

Run: `npm run check:system`

Expected: existing system database and authentication checks pass.

- [ ] **Step 5: Record the verified checkpoint**

Append Task 1 status, commands and results to `.superpowers/sdd/progress.md`; do not run Git commands while `.git` remains read-only.

---

### Task 2: Asset library domain service and permissions

**Files:**
- Create: `asset-library-service.js`
- Create: `tools/check-asset-library-service.js`

**Interfaces:**
- Consumes: database methods from Task 1; `resourceAccess.listVisible`, `resourceAccess.assertRead`, `resourceAccess.createShare`, `resourceAccess.updateShare`; `projectService.requireOwnerProject`.
- Produces: `createAssetLibraryService({ db, resourceAccess, projectService })` with `registerMedia`, `listAssets`, `getAsset`, `recordUse`, `setShare`, `setLike`, `setFavorite`.

- [ ] **Step 1: Write the failing service test**

Build Alice, Bob and Carol fixtures with private, `all`, and `users` resources. Assert `mine`, `project`, `public`, `shared`, and `favorites` results, plus audio compatibility:

```js
assert.deepEqual((await assets.listAssets(alice.id, { scope: "mine" })).items.map(item => item.id), [aliceImage.id]);
assert.deepEqual((await assets.listAssets(bob.id, { scope: "public" })).items.map(item => item.id), [alicePublicVideo.id]);
assert.deepEqual((await assets.listAssets(bob.id, { scope: "shared" })).items.map(item => item.id), [aliceUsersAudio.id]);
assert.equal((await assets.getAsset(bob.id, legacyAudio.id)).kind, "audio");
await assert.rejects(() => assets.getAsset(carol.id, alicePrivate.id), error => error.code === "forbidden");
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `node --disable-warning=ExperimentalWarning tools/check-asset-library-service.js`

Expected: FAIL because `asset-library-service.js` does not exist.

- [ ] **Step 3: Implement media normalization and range queries**

Implement `normalizeAsset(resource, access, engagement, links, owner)` and accept only image/video/audio media. Recognize historical audio rows with `resource.type === "file" && metadata.mimeType.startsWith("audio/")`. Apply scope filters after `resourceAccess.listVisible(userId)` and before sorting/pagination:

```js
const scopes = new Set(["mine", "project", "public", "shared", "favorites"]);
const kinds = new Set(["all", "image", "video", "audio"]);
if (!scopes.has(scope)) throw assetError("invalid_asset_scope", "Unsupported asset scope.", 400);
```

Use stable `(updatedAt DESC, id ASC)` ordering and an opaque base64url cursor containing the last pair.

- [ ] **Step 4: Implement project use, sharing, likes and favorites**

`recordUse` must assert read access and require that the target project belongs to the actor. `setShare` must restrict UI asset shares to `private|all|users` and permission `read`. Likes require an active `all` share; favorites require current read access. Superadmin moderation may only convert another user's `all` share to `private`.

- [ ] **Step 5: Run focused service and resource access checks**

Run: `node --disable-warning=ExperimentalWarning tools/check-asset-library-service.js`

Expected: `Asset library service checks passed.`

Run: `npm run check:resources`

Expected: all existing resource access checks pass.

- [ ] **Step 6: Record the verified checkpoint**

Append Task 2 evidence to `.superpowers/sdd/progress.md`.

---

### Task 3: Authenticated asset HTTP API and upload registration

**Files:**
- Modify: `server.js`
- Create: `tools/check-asset-library-endpoint.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createAssetLibraryService` from Task 2 and existing authenticated request, upload, user directory and resource services.
- Produces: `/api/assets` routes and an `asset` object on completed upload responses.

- [ ] **Step 1: Write the failing endpoint test**

Start the server with a temporary `AI_OS_DATA_DIR`; bootstrap Alice, create Bob through the admin API, log in separately and verify:

```js
const imported = await requestBinary(alice, "/api/assets/import?projectId=project-a&boardId=board-a", pngBuffer, { "Content-Type": "image/png", "X-File-Name": encodeURIComponent("hero.png") });
assert.equal(imported.status, 201);
assert.equal(imported.data.asset.kind, "image");
assert.equal((await requestJson(alice, "/api/assets?scope=mine")).data.items.length, 1);
assert.equal((await requestJson(bob, `/api/assets/${imported.data.asset.id}`)).status, 403);
```

Continue the test through `all`, `users`, like, favorite and project-use routes; assert Carol cannot see Bob-only shares and repeated PUT/DELETE calls remain idempotent.

- [ ] **Step 2: Run the endpoint test and verify 404**

Run: `node --disable-warning=ExperimentalWarning tools/check-asset-library-endpoint.js`

Expected: FAIL because `/api/assets` returns 404.

- [ ] **Step 3: Wire the route dispatcher and JSON handlers**

Instantiate the asset service after resource/project services. Route exact paths before canvas and generic upload routes:

```js
if (requestPath === "/api/assets" || requestPath.startsWith("/api/assets/")) {
  await handleAssetLibraryRoute(req, res, requestPath);
  return;
}
```

Parse IDs with `decodeURIComponent`, validate bodies with the existing `readJson`, map domain `statusCode/status` and `code`, and return `{ items, nextCursor, counts }` for lists.

- [ ] **Step 4: Implement import and upload compatibility**

`POST /api/assets/import` accepts supported raw media, saves with `saveBinaryMedia`, calls `assetLibrary.registerMedia`, records optional project use, and returns HTTP 201 `{ asset, url, filename, mimeType }`. Change `registerSavedMedia` to return the registered asset resource and recognize `audio/`. Existing upload handlers append `asset` without removing their old fields:

```js
const resource = await registerSavedMedia(req, saved, media.contentType);
sendJson(res, 200, { ...saved, mimeType: media.contentType, asset: resource ? await assetLibrary.getAsset(req.auth.user.id, resource.id) : null });
```

- [ ] **Step 5: Run endpoint, upload, auth and project regressions**

Run: `node --disable-warning=ExperimentalWarning tools/check-asset-library-endpoint.js`

Expected: `Asset library endpoint checks passed.`

Run: `npm run check:auth && npm run check:resources && npm run check:canvas-projects`

Expected: all commands exit 0.

- [ ] **Step 6: Record the verified checkpoint**

Append Task 3 evidence to `.superpowers/sdd/progress.md`.

---

### Task 4: Canvas asset insertion contract

**Files:**
- Modify: `script.js`
- Create: `tools/check-canvas-asset-library-ui.js`

**Interfaces:**
- Consumes: existing `addCanvasImage`, `addCanvasVideoNode`, `addCanvasAudioNode`, `getCanvasViewportCenterPoint`, `getCanvasPointFromEvent`, `scheduleCanvasSave`.
- Produces: `window.CanvasAssetBridge` with `insertAsset(asset, point)`, `getCurrentContext()`, and serialization support for `assetId`.

- [ ] **Step 1: Write the failing bridge contract test**

Load `script.js` source and assert it contains the public bridge, asset MIME handling and serialized `assetId`. In a VM fixture, call the extracted pure normalizer for image/video/audio and reject unknown kinds:

```js
assert.match(source, /window\.CanvasAssetBridge\s*=/);
assert.match(source, /application\/x-ai-os-asset/);
assert.match(source, /assetId/);
```

- [ ] **Step 2: Run the UI contract test and verify failure**

Run: `node tools/check-canvas-asset-library-ui.js`

Expected: FAIL because the bridge is absent.

- [ ] **Step 3: Add asset IDs to node creation and persistence**

Allow the existing image/video/audio creation functions to accept `assetId`; write it to `node.dataset.assetId`. Add `assetId` to serialized nodes and restore it during node rendering without changing legacy nodes that omit it.

- [ ] **Step 4: Expose the insertion bridge**

Implement:

```js
window.CanvasAssetBridge = {
  getCurrentContext: () => ({ projectId: canvasState.activeProjectId || null, boardId: canvasState.activeBoardId || null }),
  insertAsset(asset, point = getCanvasViewportCenterPoint()) {
    if (asset.kind === "image") return addCanvasImage(asset.url, asset.name, point, { assetId: asset.id });
    if (asset.kind === "video") return addCanvasVideoNode(point, { src: asset.url, name: asset.name, mimeType: asset.mimeType, assetId: asset.id });
    if (asset.kind === "audio") return addCanvasAudioNode(point, { src: asset.url, name: asset.name, mimeType: asset.mimeType, assetId: asset.id });
    throw new Error("不支持的资产类型。");
  },
};
```

Extend viewport dragover/drop to read `application/x-ai-os-asset`; dispatch a request event containing the asset ID and canvas point so the library controller resolves permission and inserts it. Existing OS-file and gallery drops retain precedence.

- [ ] **Step 5: Run canvas contract and core regression checks**

Run: `node tools/check-canvas-asset-library-ui.js`

Expected: `Canvas asset library UI contract checks passed.`

Run: `node tools/check-canvas-engine-contract.js && node tools/check-canvas-paged-roundtrip-ui.js && node tools/check-existing-old-canvas-ui.js`

Expected: all commands exit 0.

- [ ] **Step 6: Record the verified checkpoint**

Append Task 4 evidence to `.superpowers/sdd/progress.md`.

---

### Task 5: Asset library panel, filters and import UX

**Files:**
- Create: `canvas-asset-library.js`
- Create: `canvas-asset-library.css`
- Modify: `index.html`
- Modify: `tools/check-canvas-asset-library-ui.js`

**Interfaces:**
- Consumes: `/api/assets`, `window.CanvasAssetBridge`, `window.AiOsManagement.openShareDialog`, global `ai-os-session` and canvas workspace events.
- Produces: toolbar entry `#canvasAssetLibraryButton`, panel `#canvasAssetLibraryPanel`, and `window.CanvasAssetLibrary` test bridge.

- [ ] **Step 1: Extend the failing static UI test**

Assert the toolbar button, panel, five scope buttons, four kind filters, search, import input, grid, status region and script/style includes are present exactly once.

- [ ] **Step 2: Run the static test and verify missing selectors**

Run: `node tools/check-canvas-asset-library-ui.js`

Expected: FAIL naming `#canvasAssetLibraryButton`.

- [ ] **Step 3: Add semantic panel markup and responsive styles**

Add an `aside` inside the canvas app shell with `aria-label="资产库"`, `hidden`, focusable close button and accessible filter buttons. Use CSS variables already provided by global AI OS themes; panel width uses `clamp(300px, 28vw, 420px)` and becomes a full-width overlay below 720 CSS pixels. Do not hard-code a dark sidebar in light mode.

- [ ] **Step 4: Implement query state and race-safe rendering**

Use one state object:

```js
const state = { open: false, scope: "mine", kind: "all", search: "", items: [], nextCursor: null, loading: false, requestId: 0, currentProjectId: null };
```

Increment `requestId` for every load and ignore stale responses. Debounce search by 180 ms. Render image thumbnails, muted video previews and audio placeholders; escape all user-controlled text. Empty and retry states must preserve active filters.

- [ ] **Step 5: Implement import, preview, double-click and drag source**

Import supported files sequentially through `/api/assets/import` with current project/board query parameters. Files larger than 6 MiB use the existing `/api/upload-media/chunk` protocol, then call `/api/assets/:id/use` with the returned asset ID. Card double-click calls `insertAsset`; `dragstart` sets only the asset ID:

```js
event.dataTransfer.setData("application/x-ai-os-asset", JSON.stringify({ assetId: asset.id }));
event.dataTransfer.effectAllowed = "copy";
```

After insertion, call `POST /api/assets/:id/use` and reload counts without blocking node creation.

- [ ] **Step 6: Re-run static and syntax checks**

Run: `node --check canvas-asset-library.js && node tools/check-canvas-asset-library-ui.js`

Expected: syntax passes and `Canvas asset library UI contract checks passed.`

- [ ] **Step 7: Record the verified checkpoint**

Append Task 5 evidence to `.superpowers/sdd/progress.md`.

---

### Task 6: Shared curation, specified-user sharing, likes and favorites UX

**Files:**
- Modify: `canvas-asset-library.js`
- Modify: `canvas-asset-library.css`
- Modify: `account-management-ui.js`
- Modify: `index.html`
- Modify: `tools/check-files-app.js`
- Modify: `tools/check-canvas-asset-library-ui.js`

**Interfaces:**
- Consumes: asset share/like/favorite endpoints from Task 3 and existing user directory/share dialog.
- Produces: card actions for publishing/unpublishing, specified-user sharing, liking and favoriting; refresh event `ai-os-assets-changed`.

- [ ] **Step 1: Add failing interaction contract assertions**

Assert owned cards expose share actions, public cards expose like/favorite actions, non-owned cards never expose management actions, and the Files app treats `video` and `audio` as media resources.

- [ ] **Step 2: Run focused UI/Files tests and verify failure**

Run: `node tools/check-canvas-asset-library-ui.js && npm run check:files-app`

Expected: at least one assertion fails for absent media sharing controls.

- [ ] **Step 3: Reuse and constrain the share dialog**

Extend `openShareDialog(resourceId, { canvas, asset })`; asset mode hides password and permission controls, fixes permission to `read`, and relabels `all` as“发布到共享精选”. Add video and audio filters/counts to the desktop file/shared window so both entrances reflect the same resource records. After a successful asset share, dispatch `ai-os-assets-changed` so the panel and desktop resource view refresh from the server.

- [ ] **Step 4: Add idempotent optimistic like and favorite actions**

Immediately toggle the card state, send PUT/DELETE, and rollback on failure. Disable repeated clicks while a request for the same asset/action is pending. Only public assets display likes; every accessible asset can display the current user's private favorite action.

- [ ] **Step 5: Verify focused UI and Files behavior**

Run: `node tools/check-canvas-asset-library-ui.js && npm run check:files-app`

Expected: both commands exit 0.

- [ ] **Step 6: Record the verified checkpoint**

Append Task 6 evidence to `.superpowers/sdd/progress.md`.

---

### Task 7: Multi-account browser acceptance and full regression

**Files:**
- Create: `tools/check-canvas-asset-library-browser.js`
- Modify: `package.json`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: completed asset library UI/API.
- Produces: repeatable end-to-end acceptance command `npm run check:canvas-assets`.

- [ ] **Step 1: Write the end-to-end browser test**

Use two isolated browser contexts. Alice imports one image, one video fixture and one audio fixture, confirms all three appear under “我的资产”, inserts the image by double-click, publishes the video to all users and shares the audio only with Bob. Bob verifies public/specified scopes, likes and favorites the video, drags it into his own canvas, and confirms no second upload request occurs. Carol verifies the specified audio is absent.

- [ ] **Step 2: Add theme and scale assertions**

For light/dark and scales 0.75, 1, 1.25, 1.5, 1.75, open the panel and assert its bounding rectangle remains within the canvas window, filters remain visible and asset cards can be activated.

- [ ] **Step 3: Run the browser test and correct only evidenced failures**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-asset-library-browser.js`

Expected: `Canvas asset library browser checks passed.`

- [ ] **Step 4: Add aggregate scripts and run focused suite**

Add:

```json
"check:canvas-assets": "node --disable-warning=ExperimentalWarning tools/check-asset-library-db.js && node --disable-warning=ExperimentalWarning tools/check-asset-library-service.js && node --disable-warning=ExperimentalWarning tools/check-asset-library-endpoint.js && node tools/check-canvas-asset-library-ui.js && node --disable-warning=ExperimentalWarning tools/check-canvas-asset-library-browser.js"
```

Run: `npm run check:canvas-assets`

Expected: all five asset checks pass.

- [ ] **Step 5: Run affected-system regressions**

Run: `npm run check:system && npm run check:auth && npm run check:resources && npm run check:canvas-projects && npm run check:canvas-project-browser && npm run check:global-theme && npm run check:scale-interactions && npm run check:files-app`

Expected: every command exits 0.

- [ ] **Step 6: Run the repository verification command**

Run: `npm run check`

Expected: exit code 0 with no new failures. If a pre-existing environment-dependent check is unavailable, record its exact command and output rather than claiming it passed.

- [ ] **Step 7: Record completion evidence**

Update `.superpowers/sdd/progress.md` with implemented files, all command outputs, any pre-existing unrelated failures, and confirmation that `.git` was not modified.
