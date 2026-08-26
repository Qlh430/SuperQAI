# Canvas Visual-Fidelity Zoom and Board Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep complete node visuals continuous at every zoom, replace visible aggregate boxes with per-node scene sprites only when density exceeds the DOM budget, restore real board-history thumbnails, and reject stale canvas engines.

**Architecture:** Boards with at most 800 viewport candidates always mount the existing complete node DOM, independent of scale. Denser viewports return lightweight per-node visual records that a dedicated Canvas scene layer draws with the same geometry, surface, and thumbnail while complete DOM remains reserved for the top/active nodes. A materialized `node_previews` index supplies both scene textures and 1–4 board-list previews without loading whole boards.

**Tech Stack:** Node.js 24, SQLite STRICT tables and RTree, browser DOM/Canvas 2D/OffscreenCanvas, existing UMD modules, Playwright browser checks, Node assertion scripts.

## Global Constraints

- Single-canvas guarantee: 50,000 mixed nodes and 100,000 connections; no logical total-node hard limit.
- Complete DOM nodes must never exceed 800.
- For 800 or fewer viewport candidates, every zoom from 5% through 500% uses complete existing node DOM; no summary cards and no aggregate regions.
- For more than 800 candidates, render individual node geometry/sprites; never render type/count region cards.
- Never truncate visible node geometry. Frame-time budgets may defer thumbnail/text refinement, but every non-occluded visible node keeps a same-frame surface in the scene layer.
- Low-zoom rendering must not request original-size images.
- Preserve all historical node payloads, unknown fields, connection counts, viewports, and media references exactly.
- Pan P95 must stay at or below 20 ms, longest interaction task at or below 100 ms, and stable memory growth at or below 15%.
- Tests may use only copied historical data or the bounded pressure directory; never mutate formal canvases.

---

## File Structure

- Create `canvas-engine-contract.js`: shared engine version and compatibility check.
- Create `canvas-node-preview-rules.js`: pure extraction and prioritization of node preview sources.
- Create `canvas-scene-rules.js`: pure projected-geometry, occlusion, and sprite-budget selection.
- Create `canvas-scene-layer.js`: double-buffered Canvas 2D per-node sprite renderer and hit regions.
- Modify `canvas-schema.js`: schema version 2 and `node_previews` table/index.
- Modify `canvas-db-worker.js`: preview backfill/incremental maintenance, board `previewImages`, scene viewport responses, engine version.
- Modify `canvas-paged-store.js`: track `scenePage` instead of retaining visible aggregate LOD state.
- Modify `canvas-viewport-data-source.js`: engine-version rejection and mode-aware reuse without scale bands.
- Modify `canvas-virtualization-rules.js`: full DOM for every candidate when count is at most 800.
- Modify `canvas-virtualizer.js`: mount full nodes only; pinned/active nodes remain DOM when scene mode is active.
- Modify `script.js`: remove summary/aggregate presentation wiring, connect scene layer, use `previewImages`, preserve node-level scene interaction.
- Modify `styles.css`: remove low-zoom summary-card presentation and add scene-layer stacking/pointer rules.
- Modify `index.html`, `build-portable.bat`, `package.json`: load/copy/check the new focused modules.
- Create/update tests listed in each task.

---

### Task 1: Engine Contract and Full-DOM Rule

**Files:**
- Create: `canvas-engine-contract.js`
- Modify: `canvas-virtualization-rules.js`
- Modify: `canvas-viewport-data-source.js`
- Test: `tools/check-canvas-engine-contract.js`
- Test: `tools/check-canvas-virtualization-rules.js`
- Test: `tools/check-canvas-viewport-data-source.js`

**Interfaces:**
- Produces: `CanvasEngineContract.ENGINE_VERSION === "canvas-visual-fidelity-v2"`.
- Produces: `CanvasEngineContract.assertCompatible(actual)` returning `true` or throwing with `code="canvas_engine_version_mismatch"`.
- Produces: `chooseNodeLevel({ candidateCount, pinned }) -> "full" | "scene"`.

- [ ] **Step 1: Write failing engine and node-level tests**

```js
const contract = require("../canvas-engine-contract");
assert.equal(contract.ENGINE_VERSION, "canvas-visual-fidelity-v2");
assert.equal(contract.assertCompatible(contract.ENGINE_VERSION), true);
assert.throws(
  () => contract.assertCompatible(""),
  (error) => error.code === "canvas_engine_version_mismatch",
);

for (const scale of [0.05, 0.11, 0.25, 0.55, 0.64, 0.65, 1, 5]) {
  assert.equal(rules.chooseNodeLevel({ scale, candidateCount: 94 }), "full");
  assert.equal(rules.chooseNodeLevel({ scale, candidateCount: 800 }), "full");
}
assert.equal(rules.chooseNodeLevel({ scale: 0.11, candidateCount: 801 }), "scene");
assert.equal(rules.chooseNodeLevel({ scale: 0.11, candidateCount: 50_000, pinned: true }), "full");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/check-canvas-engine-contract.js && node tools/check-canvas-virtualization-rules.js && node tools/check-canvas-viewport-data-source.js`

Expected: FAIL because `canvas-engine-contract.js` is missing and the current low-scale rule returns `overview`/`compact`.

- [ ] **Step 3: Implement the contract and scale-independent full-node rule**

```js
const ENGINE_VERSION = "canvas-visual-fidelity-v2";

function assertCompatible(actual) {
  if (String(actual || "") === ENGINE_VERSION) return true;
  const error = new Error("画布引擎已更新，请重启本地服务后重试。");
  error.code = "canvas_engine_version_mismatch";
  throw error;
}

function chooseNodeLevel({ candidateCount, pinned } = {}) {
  if (pinned) return "full";
  return Number(candidateCount || 0) <= 800 ? "full" : "scene";
}
```

Configure `CanvasViewportDataSource` with `expectedEngineVersion`; call `assertCompatible(page.engineVersion)` before `store.applyViewportPage(nextPage)`. On mismatch, retain the previous page and emit `onStatus({ state: "error", error })`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tools/check-canvas-engine-contract.js && node tools/check-canvas-virtualization-rules.js && node tools/check-canvas-viewport-data-source.js`

Expected: all three checks print `passed` and exit 0.

- [ ] **Step 5: Commit**

```bash
git add canvas-engine-contract.js canvas-virtualization-rules.js canvas-viewport-data-source.js tools/check-canvas-engine-contract.js tools/check-canvas-virtualization-rules.js tools/check-canvas-viewport-data-source.js
git commit -m "fix: keep complete canvas nodes across zoom"
```

### Task 2: Persistent Node Preview Index and Legacy Backfill

**Files:**
- Create: `canvas-node-preview-rules.js`
- Modify: `canvas-schema.js`
- Modify: `canvas-db-worker.js`
- Test: `tools/check-canvas-node-preview-rules.js`
- Test: `tools/check-canvas-schema.js`
- Test: `tools/check-canvas-repository.js`
- Test: `tools/check-canvas-legacy-migrator.js`

**Interfaces:**
- Produces: `extractNodePreviewSources(node) -> string[]`, ordered best-first and de-duplicated.
- Produces: `syncNodePreview(boardPk, nodeId, zOrder, payload, updatedAt)` inside the worker.
- Produces: board metadata property `previewImages: string[]` with length 0–4.

- [ ] **Step 1: Write failing preview extraction and repository tests**

```js
assert.deepEqual(extractNodePreviewSources({
  thumbnailSrc: "/thumb.webp",
  imageSrc: "/original.png",
  galleryImages: [{ thumbnailUrl: "/gallery.webp", src: "/gallery.png" }],
}), ["/thumb.webp", "/gallery.webp", "/original.png", "/gallery.png"]);

const listed = await repository.listBoards();
const board = listed.boards.find((item) => item.id === "legacy-images");
assert.deepEqual(board.previewImages, ["/first-thumb.webp", "/second-saved.webp"]);
assert.equal(Object.hasOwn(board, "nodes"), false);
```

Add a legacy-import fixture whose nodes contain direct images, galleries, groups, malformed gallery JSON, and unknown fields. Assert that re-opening the database returns previews while the exported node payloads remain byte-for-byte equivalent after canonical JSON parsing.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/check-canvas-node-preview-rules.js && node --disable-warning=ExperimentalWarning tools/check-canvas-schema.js && node --disable-warning=ExperimentalWarning tools/check-canvas-repository.js && node --disable-warning=ExperimentalWarning tools/check-canvas-legacy-migrator.js`

Expected: FAIL because the extraction module/table/`previewImages` metadata do not exist.

- [ ] **Step 3: Add schema v2 and pure source extraction**

```sql
CREATE TABLE IF NOT EXISTS node_previews (
  board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  source TEXT NOT NULL,
  z_order INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(board_pk, node_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS node_previews_board_rank_idx
  ON node_previews(board_pk, z_order DESC, updated_at DESC);
```

Set `SCHEMA_VERSION = 2`. `extractNodePreviewSources` must prioritize `thumbnailSrc`, `thumbnailUrl`, `previewUrl`, `resultThumbnailSrc`, gallery/group thumbnail fields, `savedUrl`, then `imageSrc`/`resultSrc`/`src`/`url`, returning only non-empty strings.

- [ ] **Step 4: Maintain and backfill the index transactionally**

Call `syncNodePreview` after `upsertNode` and `importLegacyNode`; delete its row on `node.delete`. On worker startup, run one idempotent backfill query for nodes that lack an index row, process in primary-key batches of 500, and never update `nodes.payload_json`.

Extend `listBoards()` with one correlated JSON aggregation over the indexed top four sources and parse it in `toBoardMeta`:

```sql
COALESCE((
  SELECT json_group_array(source)
    FROM (
      SELECT source FROM node_previews p
       WHERE p.board_pk = b.pk
       ORDER BY p.z_order DESC, p.updated_at DESC
       LIMIT 4
    )
), '[]') AS preview_images_json
```

- [ ] **Step 5: Run tests and verify GREEN**

Run the four commands from Step 2.

Expected: all checks pass; legacy payload/count/connection assertions remain exact.

- [ ] **Step 6: Commit**

```bash
git add canvas-node-preview-rules.js canvas-schema.js canvas-db-worker.js tools/check-canvas-node-preview-rules.js tools/check-canvas-schema.js tools/check-canvas-repository.js tools/check-canvas-legacy-migrator.js
git commit -m "feat: persist canvas board preview images"
```

### Task 3: Restore Real Thumbnails in Canvas Selection

**Files:**
- Modify: `script.js:12329-12370`
- Modify: `script.js:16834-16848`
- Modify: `styles.css` board preview rules
- Test: `tools/check-canvas-board-preview-ui.js`
- Test: `tools/check-canvas-virtualization-integration.js`

**Interfaces:**
- Consumes: `board.previewImages` from Task 2.
- Produces: `getCanvasBoardPreviewImages(board) -> string[]` using metadata first and legacy nodes second.

- [ ] **Step 1: Write a failing Playwright board-list test**

```js
await page.locator("#canvasHistoryButton").click();
for (const title of ["测试2", "苹果", "画布 17", "NILLKIN", "画布 41"]) {
  const card = page.locator(".canvas-board-item", { hasText: title }).first();
  await expect(card.locator(".canvas-board-preview img").first()).toBeVisible();
  await expect(card.locator(".canvas-board-preview-empty")).toHaveCount(0);
}
assert.equal(viewportRequests.length, 0, "opening history must not load whole boards");
assert.equal(originalImageRequests.length, 0, "history previews must use thumbnails");
```

- [ ] **Step 2: Run test and verify RED**

Run: `node tools/check-canvas-board-preview-ui.js`

Expected: FAIL because metadata-only board cards render `.canvas-board-preview-empty`.

- [ ] **Step 3: Implement metadata-first previews**

```js
function getCanvasBoardPreviewImages(board) {
  const indexed = Array.isArray(board?.previewImages)
    ? board.previewImages.map(String).filter(Boolean)
    : [];
  if (indexed.length) return [...new Set(indexed)].slice(0, 4);
  return getLegacyCanvasBoardPreviewImages(board).slice(0, 4);
}
```

Render each source with `createDeferredThumbnail(source, board.title, { allowOriginalFallback: false, unload: false })`. Keep the title fallback only when both indexed previews and legacy images are empty. Add an image-error class that preserves the card surface without a broken-image icon.

- [ ] **Step 4: Run browser and static tests**

Run: `node tools/check-canvas-board-preview-ui.js && node tools/check-canvas-virtualization-integration.js`

Expected: both pass with real images and zero full-board/original-image requests.

- [ ] **Step 5: Commit**

```bash
git add script.js styles.css tools/check-canvas-board-preview-ui.js tools/check-canvas-virtualization-integration.js
git commit -m "fix: restore canvas history thumbnails"
```

### Task 4: Lightweight Per-Node Scene Data

**Files:**
- Create: `canvas-scene-rules.js`
- Modify: `canvas-db-worker.js`
- Modify: `canvas-repository.js`
- Test: `tools/check-canvas-scene-rules.js`
- Test: `tools/check-canvas-repository-operations.js`

**Interfaces:**
- Produces: `selectVisibleSprites(rows, { bounds, scale, maxTexturedSprites: 5000 }) -> { visualNodes, texturedNodeIds }`.
- Produces viewport `mode="scene"`, `visualNodes`, `candidateCount`, `engineVersion`, and no `lodNodes` when candidates exceed 800.
- `VisualNode`: `{ id, kind, x, y, width, height, zOrder, previewSource }`.

- [ ] **Step 1: Write failing density and occlusion tests**

```js
const exact800Viewport = await createViewportFixture({ visibleNodeCount: 800 });
const page800 = await repository.queryViewport({ ...exact800Viewport, nodeLimit: 800 });
assert.equal(page800.mode, "detail");
assert.equal(page800.nodes.length, 800);

const exact801Viewport = await createViewportFixture({ visibleNodeCount: 801 });
const page801 = await repository.queryViewport({ ...exact801Viewport, nodeLimit: 800 });
assert.equal(page801.mode, "scene");
assert.ok(page801.visualNodes.length > 0);
assert.equal(page801.visualNodes.length, 801);
assert.equal(Object.hasOwn(page801, "lodNodes"), false);
assert.ok(page801.visualNodes.every((node) => node.id && node.width > 0 && node.height > 0));
```

For 50,000 exactly overlapping rows, assert that z-order occlusion keeps the top visible sprites; for separated projected rectangles, assert all remain in the same geometry/order.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/check-canvas-scene-rules.js && node --disable-warning=ExperimentalWarning tools/check-canvas-repository-operations.js`

Expected: FAIL because 801 candidates return aggregate `mode="lod"` and no per-node visuals.

- [ ] **Step 3: Implement projected occlusion and scene responses**

Query candidate rows in descending z-order with minimal geometry plus a left join to `node_previews`. `selectVisibleSprites` must:

```js
function projectRect(node, bounds, scale) {
  return {
    left: (node.x - bounds.left) * scale,
    top: (node.y - bounds.top) * scale,
    right: (node.x + node.width - bounds.left) * scale,
    bottom: (node.y + node.height - bounds.top) * scale,
  };
}
```

Use 4-pixel screen bins. Process highest z-order first; omit only a node whose projected bins are fully covered by already retained opaque node surfaces. For subpixel nodes retain the highest-z node per occupied pixel. Return every retained geometry record. Rank at most 5,000 nodes for thumbnail/text refinement, but draw the remaining retained nodes with their exact surface, border, geometry, and z-order; never set a geometry-truncation flag or substitute count/type regions.

- [ ] **Step 4: Run focused and storage tests**

Run: `node tools/check-canvas-scene-rules.js && node --disable-warning=ExperimentalWarning tools/check-canvas-repository-operations.js && npm run check:canvas-storage`

Expected: all pass; exact 800 is detail, 801 is scene, and storage checks remain green.

- [ ] **Step 5: Commit**

```bash
git add canvas-scene-rules.js canvas-db-worker.js canvas-repository.js tools/check-canvas-scene-rules.js tools/check-canvas-repository-operations.js
git commit -m "feat: return per-node visuals for dense canvases"
```

### Task 5: Scene Layer and Invisible Representation Handoff

**Files:**
- Create: `canvas-scene-layer.js`
- Modify: `canvas-paged-store.js`
- Modify: `canvas-viewport-data-source.js`
- Modify: `canvas-virtualizer.js`
- Modify: `script.js` canvas initialization/rendering functions
- Modify: `styles.css` canvas layer stacking
- Modify: `index.html`
- Modify: `build-portable.bat`
- Test: `tools/check-canvas-scene-layer.js`
- Test: `tools/check-canvas-paged-store.js`
- Test: `tools/check-canvas-seamless-zoom-ui.js`

**Interfaces:**
- Consumes: Task 4 `VisualNode[]`.
- Produces: `CanvasSceneLayer.render({ visualNodes, transform, resolveTexture })`.
- Produces: `CanvasSceneLayer.hitTest(screenX, screenY) -> VisualNode | null`.
- Produces: `CanvasPagedStore.scenePage` and clears legacy `lodPage`.

- [ ] **Step 1: Write failing scene-layer and browser tests**

```js
layer.render({ visualNodes, transform, resolveTexture: () => thumbnail });
assert.equal(layer.getDiagnostics().aggregateCardCount, 0);
assert.equal(layer.getDiagnostics().spriteCount, visualNodes.length);
assert.equal(context.text.some((value) => /区域|个节点/.test(value)), false);
assert.equal(layer.hitTest(120, 80).id, "top-node");
```

In Playwright, open every non-empty historical board and scan `[0.05, 0.11, 0.25, 0.55, 0.64, 0.65, 0.74, 1, 1.6]`. For boards with at most 800 candidates assert:

```js
assert.equal(document.querySelectorAll(".canvas-node-virtual-summary").length, 0);
assert.equal(canvasPagedStore.scenePage, null);
assert.equal(canvasPagedStore.lodPage, null);
assert.ok(document.querySelectorAll("#canvasPlane .canvas-node:not(.canvas-node-virtual-summary)").length > 0);
```

For the dense fixture assert `scenePage` exists, `spriteCount > 0`, no aggregate labels exist, no non-occluded node geometry is missing, and complete DOM remains at or below 800.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/check-canvas-scene-layer.js && node tools/check-canvas-paged-store.js && node tools/check-canvas-seamless-zoom-ui.js`

Expected: FAIL because the scene layer/store do not exist and current UI mounts summaries or aggregate boxes.

- [ ] **Step 3: Implement double-buffered sprite rendering**

`CanvasSceneLayer` owns retained screen tiles with front/back buffers. On a new viewport, synchronously paint every visible node surface into dirty back tiles, swap completed tiles atomically, and refine thumbnail/text details within the frame-time budget. Each sprite uses exact projected geometry, the existing node surface/border palette by kind, and `drawImage` with `object-fit: cover` crop when a thumbnail texture is ready. If it is not ready, keep the prior front-buffer pixels or draw the original node surface without new labels. Reuse unchanged tiles during pan/zoom so all geometry is present without repainting 50,000 records every frame.

Store screen hit regions in z-order. On pointer down, call `ensureCanvasNodeMounted(id)` and pin the full node before hiding its matching sprite. Do not clear the old representation until the replacement is mounted and positioned.

- [ ] **Step 4: Remove visible summary/aggregate wiring**

For detail pages, `CanvasVirtualizer` requests only `"full"`. Delete calls that mount `mountCanvasVirtualSummary` from runtime paths. Replace `renderCanvasPrimitiveLayer()` with `renderCanvasSceneLayer()` and remove `.has-primitive-lod` activation. Keep old aggregate code only as dead migration compatibility until all tests no longer reference it; it must never be called by current viewport responses.

- [ ] **Step 5: Run scene, browser-core, and seamless tests**

Run: `node tools/check-canvas-scene-layer.js && npm run check:canvas-browser-core && node tools/check-canvas-seamless-zoom-ui.js`

Expected: all pass; no summary/aggregate elements appear in the zoom matrix.

- [ ] **Step 6: Commit**

```bash
git add canvas-scene-layer.js canvas-paged-store.js canvas-viewport-data-source.js canvas-virtualizer.js script.js styles.css index.html build-portable.bat tools/check-canvas-scene-layer.js tools/check-canvas-paged-store.js tools/check-canvas-seamless-zoom-ui.js
git commit -m "feat: render dense canvases without visible lod changes"
```

### Task 6: Runtime Integration, Old-Canvas Safety, and Live Restart

**Files:**
- Modify: `script.js` status handling
- Modify: `server.js` canvas storage response handling if required for engine metadata
- Modify: `package.json`
- Modify: `tools/check-existing-old-canvas-ui.js`
- Modify: `tools/diagnose-current-canvas-ui.js`
- Test: `tools/check-canvas-engine-mismatch-ui.js`
- Test: `tools/check-canvas-board-preview-ui.js`

**Interfaces:**
- Consumes: `ENGINE_VERSION`, `previewImages`, `scenePage`.
- Produces: user-facing restart status for stale engines without clearing visible canvas content.

- [ ] **Step 1: Write failing mismatch and historical-data tests**

Intercept a viewport response and remove/change `engineVersion`; assert that the previous complete nodes stay mounted and status contains `请重启本地服务`. For copied historical JSON/DB, capture hashes, node/connection counts, viewports, and unknown fields before opening all boards; assert exact equality afterward.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/check-canvas-engine-mismatch-ui.js && node tools/check-existing-old-canvas-ui.js && node tools/check-canvas-board-preview-ui.js`

Expected: mismatch test fails because stale responses are currently applied or surfaced as generic errors.

- [ ] **Step 3: Implement explicit mismatch UX and final scripts**

Map `canvas_engine_version_mismatch` to `画布引擎已更新，请重启本地服务后重试。`; do not call `clearCanvasPlane()` for this error. Add `check:canvas-visual-fidelity` to `package.json`, containing engine, preview, scene, seamless zoom, board preview, and existing-old-canvas checks.

- [ ] **Step 4: Run focused and full regression**

Run: `npm run check:canvas-visual-fidelity && npm run check:canvas-storage && npm run check:canvas-browser-core && npm run check`

Expected: every command exits 0.

- [ ] **Step 5: Restart the real 3099 service safely**

Resolve the exact PID listening on `0.0.0.0:3099`, verify its executable is Node and its start time predates the engine version, stop only that PID, then launch `node server.js` hidden from the repository root with the existing environment. Do not stop unrelated Node processes.

- [ ] **Step 6: Verify the live service, not a copy**

Run live API checks against `http://127.0.0.1:3099`:

```js
assert.equal(apple.nodeCount, 94);
assert.equal(appleAt11Percent.engineVersion, "canvas-visual-fidelity-v2");
assert.equal(appleAt11Percent.mode, "detail");
assert.equal(appleAt11Percent.candidateCount, 94);
assert.equal(appleAt11Percent.lodNodes.length, 0);
assert.ok(apple.previewImages.length > 0);
```

Open the live UI with Playwright and assert the Apple canvas at 11% contains complete `.canvas-node` elements, zero summaries/aggregate regions, and the board-selection card contains a visible image.

- [ ] **Step 7: Commit**

```bash
git add script.js server.js package.json tools/check-existing-old-canvas-ui.js tools/diagnose-current-canvas-ui.js tools/check-canvas-engine-mismatch-ui.js tools/check-canvas-board-preview-ui.js
git commit -m "fix: activate visually continuous canvas engine"
```

### Task 7: 50,000-Node Performance and Cleanup

**Files:**
- Modify: `tools/check-canvas-50000-performance-ui.js`
- Modify: `tools/run-canvas-50000-soak.js`
- Modify: `tools/generate-canvas-50000-fixture.js` only if preview-index fixture fields are required

**Interfaces:**
- Consumes all production behavior from Tasks 1–6.
- Produces final performance metrics and guaranteed removal of `tmp/canvas-pressure`.

- [ ] **Step 1: Extend the 50,000-node browser assertions before changing production code**

At `[0.05, 0.11, 0.25, 0.55, 0.64, 0.65, 0.74, 1, 1.6]`, record detail/scene mode, complete DOM count, visible non-occluded geometry count, sprite count, aggregate count, blank nodes, direct original requests, frame durations, heap, and server RSS. Assert:

```js
assert.ok(snapshot.completeDomNodes <= 800);
assert.equal(snapshot.summaryNodes, 0);
assert.equal(snapshot.aggregateCardCount, 0);
assert.equal(snapshot.blankNodeCount, 0);
assert.deepEqual(snapshot.directOriginalRequests, []);
assert.ok(snapshot.completeDomNodes > 0 || snapshot.spriteCount > 0);
assert.equal(snapshot.renderedGeometryCount, snapshot.visibleNonOccludedGeometryCount);
```

- [ ] **Step 2: Run the performance test and verify current failure or new coverage**

Run: `node --disable-warning=ExperimentalWarning tools/generate-canvas-50000-fixture.js && node tools/check-canvas-50000-performance-ui.js`

Expected before Tasks 4–5: FAIL because dense views still expose aggregate regions; after Tasks 4–5 the same assertions must pass.

- [ ] **Step 3: Run the 3-minute soak**

Run: `node --disable-warning=ExperimentalWarning tools/run-canvas-50000-soak.js --minutes=3`

Expected: query P95 ≤ 75 ms, memory growth ≤ 15%, blank nodes 0, 50,000 nodes and 100,000 connections unchanged.

- [ ] **Step 4: Verify cleanup and formal data health**

Assert `tmp/canvas-pressure` no longer exists. Open formal `data/canvas.db` read-only, run `PRAGMA quick_check`, and verify all five active real canvases open through the live service without changing the database or historical JSON hashes.

- [ ] **Step 5: Run final complete verification**

Run: `npm run check:canvas-visual-fidelity && npm run check:canvas-storage && npm run check:canvas-browser-core && npm run check`

Expected: all commands exit 0 with no page errors, no failed assertions, and no test-canvas residue.

- [ ] **Step 6: Commit**

```bash
git add tools/check-canvas-50000-performance-ui.js tools/run-canvas-50000-soak.js tools/generate-canvas-50000-fixture.js
git commit -m "test: guarantee visually continuous 50000-node canvas"
```

---

## Completion Checklist

- [ ] Apple with 94 nodes returns detail mode at 11% from the live 3099 service.
- [ ] Every board with at most 800 viewport candidates uses complete DOM at every tested zoom.
- [ ] No runtime path creates summary cards or aggregate count/type boxes.
- [ ] Dense scene mode preserves per-node geometry, thumbnail surfaces, z-order, and hit testing.
- [ ] Board list metadata contains indexed previews without `nodes` payloads.
- [ ] Every historical board with media shows a real selection thumbnail after automatic backfill.
- [ ] Stale worker/frontend versions are rejected without blanking the canvas.
- [ ] Formal board payloads/counts/connections/viewports are unchanged.
- [ ] 50,000-node browser and 3-minute soak checks pass and clean their fixture.
