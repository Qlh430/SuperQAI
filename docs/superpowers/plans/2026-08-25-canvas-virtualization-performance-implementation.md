# Canvas Virtualization Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make old and new infinite-canvas boards open through a virtualized runtime that keeps 3000-node boards responsive and preserves every node model, image reference, and connection.

**Architecture:** Add pure geometry/spatial-index rules and a model-first virtual store, then connect them to a DOM virtualizer that mounts only viewport, overscan, selected, editing, or running nodes. Existing node renderers remain the full-node adapters; serialization merges mounted DOM state back into the store, while connections use cached model geometry and viewport culling instead of repeated DOM queries.

**Tech Stack:** Node.js 18+, CommonJS/UMD browser modules, native DOM, `requestAnimationFrame`, existing image resource manager, Node `assert`, Playwright browser checks.

## Global Constraints

- The acceptance board contains exactly 3000 mixed nodes, about 1500 images, and 2999 connections.
- Old board JSON must enter the virtualized path automatically without a migration command or destructive rewrite.
- Unknown serialized node fields must survive open/save round trips.
- The server board JSON schema and all canonical original-image URL fields stay compatible.
- Viewport interaction must not serialize or mount all nodes.
- Full-node mounting work uses an 8ms maximum frame budget; viewport queries use 640px mount overscan and 960px retention overscan.
- Preserve unrelated dirty changes in `script.js`, `styles.css`, `index.html`, and `package.json`.

---

### Task 1: Pure virtualization geometry and spatial index

**Files:**
- Create: `canvas-virtualization-rules.js`
- Create: `tools/check-canvas-virtualization-rules.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `CanvasVirtualizationRules.GridSpatialIndex`.
- Produces: `getViewportCanvasRect(viewport, transform, overscanPx)`.
- Produces: `getNodeRect(model)`, `rectsIntersect(a, b)`, `getConnectionBounds(from, to)`.
- Produces: `chooseNodeLevel({ scale, visibleCount, pinned }) -> "full" | "compact" | "overview"`.

- [ ] **Step 1: Write the failing pure-rule test**

Create assertions for negative coordinates, multi-cell insertion, moving a node between cells, deleting a node, overscan conversion by scale, connection bounds, and display levels:

```js
const assert = require("node:assert/strict");
const rules = require("../canvas-virtualization-rules");

const index = new rules.GridSpatialIndex({ cellSize: 768 });
index.upsert("a", { left: -900, top: -100, right: -100, bottom: 300 });
index.upsert("b", { left: 100, top: 100, right: 420, bottom: 360 });
assert.deepEqual([...index.query({ left: -1000, top: -200, right: 0, bottom: 400 })], ["a"]);
index.upsert("a", { left: 2000, top: 2000, right: 2300, bottom: 2300 });
assert.deepEqual([...index.query({ left: -1000, top: -200, right: 0, bottom: 400 })], []);
index.remove("b");
assert.equal(index.has("b"), false);
assert.deepEqual(
  rules.getViewportCanvasRect({ width: 1000, height: 600 }, { x: 100, y: 50, scale: 2 }, 200),
  { left: -150, top: -125, right: 550, bottom: 375 },
);
assert.equal(rules.chooseNodeLevel({ scale: 1, visibleCount: 30, pinned: false }), "full");
assert.equal(rules.chooseNodeLevel({ scale: 0.45, visibleCount: 300, pinned: false }), "compact");
assert.equal(rules.chooseNodeLevel({ scale: 0.2, visibleCount: 1200, pinned: false }), "overview");
assert.equal(rules.chooseNodeLevel({ scale: 0.2, visibleCount: 1200, pinned: true }), "full");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node .\tools\check-canvas-virtualization-rules.js`

Expected: FAIL with `Cannot find module '../canvas-virtualization-rules'`.

- [ ] **Step 3: Implement the rules module**

Use a UMD wrapper. `GridSpatialIndex` stores `cells: Map<string, Set<string>>` and `entries: Map<string, { rect, keys }>`; `upsert` removes old keys before inserting new ones. Queries deduplicate IDs with a `Set`, then confirm exact rectangle intersection.

```js
const DEFAULT_CELL_SIZE = 768;
const MOUNT_OVERSCAN_PX = 640;
const RETAIN_OVERSCAN_PX = 960;
const FRAME_BUDGET_MS = 8;

function chooseNodeLevel({ scale, visibleCount, pinned }) {
  if (pinned) return "full";
  if (Number(scale) < 0.3 || Number(visibleCount) > 800) return "overview";
  if (Number(scale) < 0.65 || Number(visibleCount) > 220) return "compact";
  return "full";
}
```

- [ ] **Step 4: Run GREEN and add the test to `npm run check`**

Run: `node .\tools\check-canvas-virtualization-rules.js`

Expected: `Canvas virtualization rule checks passed.`

### Task 2: Model-first virtual store and old-board normalization

**Files:**
- Create: `canvas-virtual-store.js`
- Create: `tools/check-canvas-virtual-store.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CanvasVirtualizationRules.GridSpatialIndex`.
- Produces: `CanvasVirtualStore.load(nodes)`, `upsert(model)`, `mergeSerialized(id, serialized)`, `remove(id)`, `get(id)`, `values()`, `serialize()`, `query(rect)`, `setMounted(id, element)`, `getMounted(id)`, `clearMounted()`.

- [ ] **Step 1: Write a failing store test**

The test loads an old image node with an unknown field, verifies automatic ID/geometry normalization, merges edited DOM data, and confirms the unknown field survives serialization:

```js
const store = new CanvasVirtualStore({ rules });
store.load([{ id: 7, kind: "image", x: "-20", y: "30", imageSrc: "/old.png", futureField: { keep: true } }]);
assert.equal(store.get("7").id, "7");
assert.deepEqual(store.getRect("7"), { left: -20, top: 30, right: 300, bottom: 270 });
store.mergeSerialized("7", { id: "7", kind: "image", x: 40, y: 50, width: 400, height: 300, imageSrc: "/old.png" });
assert.deepEqual(store.serialize()[0].futureField, { keep: true });
assert.deepEqual(store.query({ left: 0, top: 0, right: 500, bottom: 500 }), ["7"]);
```

- [ ] **Step 2: Verify RED**

Run: `node .\tools\check-canvas-virtual-store.js`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement store normalization and merge semantics**

Store deep-cloned serializable models only. Geometry fallbacks are kind-aware but do not overwrite absent legacy fields in serialized output. `mergeSerialized` uses `{ ...existing, ...serialized, id }` so unknown fields survive. `load` rebuilds the spatial index in one pass.

```js
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

mergeSerialized(id, serialized) {
  const key = String(id);
  const next = { ...(this.models.get(key) || {}), ...clone(serialized), id: key };
  this.models.set(key, next);
  this.index.upsert(key, this.getRect(key));
  return next;
}
```

- [ ] **Step 4: Verify GREEN and register the check**

Run: `node .\tools\check-canvas-virtual-store.js`

Expected: `Canvas virtual store checks passed.`

### Task 3: Frame-budgeted DOM virtualizer

**Files:**
- Create: `canvas-virtualizer.js`
- Create: `tools/check-canvas-virtualizer.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: store query/mounted APIs and pure viewport rules.
- Produces: `CanvasVirtualizer.schedule()`, `flushNow()`, `reset()`, `pin(id)`, `unpin(id)`, `ensureMounted(id, level)`.
- Constructor callbacks: `getViewport()`, `mount(id, level)`, `unmount(id, element)`, `afterFlush(detail)`.

- [ ] **Step 1: Write a failing scheduler test with fake frames**

Verify that only queried IDs mount, retained IDs do not flap between the 640px and 960px rectangles, pinned IDs remain mounted, stale queued work is discarded, and `reset` unmounts every mounted element.

- [ ] **Step 2: Verify RED**

Run: `node .\tools\check-canvas-virtualizer.js`

Expected: FAIL because `canvas-virtualizer.js` is missing.

- [ ] **Step 3: Implement generation-based scheduling**

Each schedule increments `generation`. `flush` computes desired IDs, unmounts IDs outside the retention rectangle unless pinned, sorts missing IDs by distance to viewport center, and mounts until `now() - startedAt >= FRAME_BUDGET_MS`. Remaining work requests another frame only if its generation is still current.

```js
schedule() {
  this.generation += 1;
  if (this.frame) return;
  const generation = this.generation;
  this.frame = this.requestFrame(() => {
    this.frame = 0;
    this.flush(generation);
  });
}
```

- [ ] **Step 4: Verify GREEN and register the test**

Run: `node .\tools\check-canvas-virtualizer.js`

Expected: `Canvas virtualizer checks passed.`

### Task 4: Browser module wiring and static integration contract

**Files:**
- Create: `tools/check-canvas-virtualization-integration.js`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `build-portable.bat`

**Interfaces:**
- Loads modules in order: rules, store, virtualizer, then `script.js`.

- [ ] **Step 1: Write failing static assertions**

Assert ordered script tags, portable-copy entries, syntax-check commands, and the presence of integration names `canvasVirtualStore`, `canvasVirtualizer`, `mountCanvasVirtualNode`, `unmountCanvasVirtualNode`, `syncMountedCanvasModels`, and `restoreCanvasBoardVirtually`.

- [ ] **Step 2: Run the check and verify RED**

Run: `node .\tools\check-canvas-virtualization-integration.js`

Expected: FAIL because the HTML tags and runtime integration are absent.

- [ ] **Step 3: Add module tags and portable-copy entries**

```html
<script src="./canvas-virtualization-rules.js?v=20260825-canvas-virtualization"></script>
<script src="./canvas-virtual-store.js?v=20260825-canvas-virtualization"></script>
<script src="./canvas-virtualizer.js?v=20260825-canvas-virtualization"></script>
```

Place them after existing canvas/image rule modules and before `script.js`.

- [ ] **Step 4: Add syntax and focused checks to `npm run check`**

Run the static check again. Expected: it still fails only for missing `script.js` integration names, proving the wiring portion is present.

### Task 5: Model-first restore, mount lifecycle, and serialization

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-virtualization-integration.js`
- Create: `tools/check-canvas-virtualization-roundtrip-ui.js`

**Interfaces:**
- Produces: `canvasVirtualStore`, `canvasVirtualizer`, `mountCanvasVirtualNode`, `mountCanvasVirtualSummary`, `unmountCanvasVirtualNode`, `syncMountedCanvasModels`, `restoreCanvasBoardVirtually`.

- [ ] **Step 1: Extend the static and browser tests to fail on current behavior**

The browser test routes a 3000-node old-format board, opens it, and asserts:

```js
assert.equal(await page.evaluate(() => canvasVirtualStore.size), 3000);
assert.ok(await page.locator("#canvasPlane .canvas-node").count() < 220);
assert.equal(await page.evaluate(() => serializeCanvasBoard().nodes.length), 3000);
assert.equal(await page.evaluate(() => serializeCanvasBoard().nodes[0].futureField), "preserved");
```

Verify RED because all 3000 DOM nodes currently mount and no virtual store exists.

- [ ] **Step 2: Initialize store and virtualizer next to canvas state**

Use callbacks that read `#infiniteCanvas`, `canvasState`, and existing render functions. Full mounts call `restoreCanvasBoardNode` with `{ virtualizedMount: true }`; summary mounts create a lightweight article with position, dimensions, title/type, and optional deferred thumbnail.

- [ ] **Step 3: Make `placeCanvasNode` register new nodes**

After appending and positioning a normal new node, merge `serializeCanvasNode(node)` into the store and register the mounted element. A node marked `data-virtual-managed="true"` only registers its element because its model already exists.

- [ ] **Step 4: Make serialization model-first**

`syncMountedCanvasModels()` skips summary/error nodes and merges real mounted DOM state. `serializeCanvasBoard()` reads `canvasVirtualStore.serialize()` and therefore includes offscreen nodes.

- [ ] **Step 5: Replace historical restore loops with model loading**

`beginCanvasBoardRestore` clears DOM/runtime state; the synchronous path calls `canvasVirtualStore.load(nodes)`. The progressive path adds normalized models within the existing 8ms budget without rendering DOM. Both restore the viewport, call `canvasVirtualizer.flushNow()`, refresh only mounted refs, and preserve existing loading UI progress.

- [ ] **Step 6: Add automatic old-board adaptation**

Every entry point (`loadCanvasBoards({ restoreFirst })`, board-history cards, unified history, undo, and trash restore) continues to call `restoreCanvasBoard`; that function delegates to `restoreCanvasBoardVirtually` unconditionally. No version flag or migration action is required.

- [ ] **Step 7: Verify round-trip GREEN**

Run the focused integration and browser round-trip checks. Expected: 3000 models, fewer than 220 mounted nodes in the distributed fixture, all nodes serialized, and unknown fields preserved.

### Task 6: O(1) nodes, visible connections, and mounted-only images

**Files:**
- Modify: `script.js`
- Modify: `canvas-virtualization-rules.js`
- Modify: `tools/check-canvas-virtualization-rules.js`
- Create: `tools/check-canvas-virtual-connections-ui.js`

**Interfaces:**
- Produces: `getCanvasNodeModel(id)`, `ensureCanvasNodeMounted(id)`, `getCanvasModelPortPoint(id, kind)`, `getVisibleCanvasConnections()`.

- [ ] **Step 1: Write failing connection tests**

Assert that 2999 stored connections yield only viewport-intersecting paths, `renderCanvasConnections()` does not call DOM `querySelector` per edge, and the visible refresh duration is below 16ms in the distributed stress fixture.

- [ ] **Step 2: Replace DOM selector node lookup**

`getCanvasNode(id)` returns `canvasVirtualStore.getMounted(id)`. Agent operations that require a DOM node call `ensureCanvasNodeMounted(id)` first; connection rendering never forces a mount.

- [ ] **Step 3: Calculate endpoints from model geometry**

Use stored width/height and per-kind port ratios. When a full node is mounted, update cached rendered geometry from ResizeObserver. Filter connections by their Bezier control-point bounds intersecting the expanded viewport.

- [ ] **Step 4: Reuse visible SVG paths and delegate clicks**

Keep `Map<connectionKey, { path, hit }>`; remove stale keys, update changed `d` attributes, and handle hit clicks from one SVG listener using `data-connection-key`.

- [ ] **Step 5: Restrict image quality work to mounted nodes**

Iterate `canvasVirtualStore.mountedElements()` or the virtualizer mounted Map, not every stored model. Unmounting must call `imageResources.disconnect(node)` before removal.

- [ ] **Step 6: Verify connection and image GREEN**

Run focused rule, integration, and browser connection checks.

### Task 7: Interaction pinning, offscreen-safe mutations, and unbounded styling

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-virtualization-integration.js`

**Interfaces:**
- Produces: `pinCanvasNode(id)`, `unpinCanvasNode(id)`, `syncCanvasNodeModel(node)`, `removeCanvasNodeModels(ids)`.

- [ ] **Step 1: Add failing integration assertions**

Require pin/unpin calls in drag, resize, text focus, crop/mask, and async-job paths; require virtual-store removal in delete/clear; require `.canvas-node-virtual-summary` and non-finite plane CSS.

- [ ] **Step 2: Pin interactive nodes**

Selection pins the active node. Drag and resize pin at pointerdown and unpin after model sync on pointerup. `focusin` pins editable descendants; `focusout` syncs and unpins unless still selected/running. Image crop, mask, grid editing, and active generation tasks use the same pin API.

- [ ] **Step 3: Make mutations update models**

`updateCanvasNodePosition` and resize changes update store geometry. Delete removes models and all connected edges before DOM disposal. Clear resets store and virtualizer. Copy serializes selected models; undo snapshots already use model-first board serialization.

- [ ] **Step 4: Make group relationships model-aware**

Group counts and membership resolve member output from mounted DOM when present, otherwise from serialized model fields. Spatial containment uses store rectangles for offscreen nodes.

- [ ] **Step 5: Remove finite plane dimensions and style LOD nodes**

Set `.canvas-plane` and `.canvas-connections` to `width: 1px; height: 1px; overflow: visible`. Add compact and overview summary styles with `contain: strict` and fixed intrinsic geometry. Update infinite-grid `background-position` and `background-size` from viewport transform.

- [ ] **Step 6: Verify focused regression checks**

Run canvas grid editor, galleries, video history, H3, image demand-loading, zoom, middle-pan, and integration checks.

### Task 8: 3000-node performance, legacy compatibility, and full regression

**Files:**
- Create: `tools/check-canvas-virtualization-performance-ui.js`
- Modify: `package.json`
- Modify: `index.html`

**Interfaces:**
- Produces: a repeatable 3000-node performance report and hard correctness assertions.

- [ ] **Step 1: Create the final Playwright stress fixture**

Route a board with 3000 mixed nodes, 1500 unique image fields using a cached test asset, 2999 connections, negative and far-positive coordinates, and legacy/unknown fields. Record first-visible time, mounted DOM count, connection path count, long tasks, pan frame delays, far-node content, image `src`, and serialize/reopen equality.

- [ ] **Step 2: Verify the pre-fix baseline fails the budgets**

Expected baseline evidence: about 27000 DOM elements, about 19s restore, about 968ms full connection render, and multi-second long tasks.

- [ ] **Step 3: Run the final stress check after implementation**

Expected assertions:

```text
modelCount = 3000
mountedFullNodeCount <= 220 (distributed fixture)
firstVisibleMs <= 1000
panFrameP95Ms <= 18
visibleConnectionRenderMs < 16
farTextPresent = true
farImageEventuallyHasSrc = true
serializedNodeCount = 3000
serializedConnectionCount = 2999
legacyUnknownFieldsPreserved = true
```

- [ ] **Step 4: Run syntax, focused, and full regression checks**

Run:

```powershell
node --check .\canvas-virtualization-rules.js
node --check .\canvas-virtual-store.js
node --check .\canvas-virtualizer.js
node --check .\script.js
node .\tools\check-canvas-virtualization-rules.js
node .\tools\check-canvas-virtual-store.js
node .\tools\check-canvas-virtualizer.js
node .\tools\check-canvas-virtualization-integration.js
npm run check
```

Expected: all commands exit 0 with no page errors.

- [ ] **Step 5: Check patch scope and whitespace**

Run:

```powershell
git diff --check
git status --short -- canvas-virtualization-rules.js canvas-virtual-store.js canvas-virtualizer.js script.js styles.css index.html package.json build-portable.bat tools
```

Expected: no whitespace errors; unrelated user changes remain untouched.
