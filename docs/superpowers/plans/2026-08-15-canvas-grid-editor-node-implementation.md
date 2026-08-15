# Canvas Grid Editor Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single modal-only gallery slicing path with a two-stage grid menu that can either create atomically persisted standalone slice nodes or a non-destructive, persistent grid editor node that later outputs a normal gallery.

**Architecture:** Extend the DOM-free `GridSlicingRules` module with grid specification, aspect crop, per-cell transform, and common output-size calculations. Keep canvas node rendering, pointer interaction, persistence, upload orchestration, and placement in the existing canvas application layer, while introducing one serialized `grid-editor` node kind. Both direct slicing and editor export use one shared crop renderer so preview and PNG output consume the same source rectangles.

**Tech Stack:** Vanilla JavaScript and DOM APIs, HTML canvas, CSS, Node.js `assert/strict` checks, Playwright browser checks, existing `/api/upload-image` persistence.

## Global Constraints

- Grid presets are exactly 2×2, 3×3, 4×4, and 5×5; custom grids allow 1–5 rows and 1–5 columns.
- Direct slicing processes only the source gallery's current image, uses equal divisions with 0px gaps, and creates standalone image nodes in row-major order.
- The grid editor keeps a persistent source snapshot; later source-gallery selection changes must not replace it.
- Aspect choices are `match`, `16:9`, `9:16`, `3:4`, `4:3`, and `1:1`.
- Aspect changes apply to every cell, while pan center and zoom remain independent per cell.
- Uniform and per-line gaps accept only non-negative even source pixels.
- Covered gap pixels never enter a retained cell.
- Direct slicing and editor export are atomic: no result nodes are created until every PNG upload succeeds.
- Editor output creates a new ordinary gallery every time and never mutates the source gallery or previous outputs.
- Do not add runtime dependencies or a second upload/storage API.

---

## File Structure

- Modify `grid-slicing-rules.js`: pure grid normalization, aspect crop, cell transform clamping, and common output-size rules.
- Modify `script.js`: menu lifecycle, direct slicing, grid editor node rendering and interaction, output orchestration, placement, serialization, restore, copy/paste, and source connection.
- Modify `styles.css`: two-stage menu, direct-slice layout feedback, grid editor toolbar/cells/overlays, edit handles, collapsed state, and responsive sizing.
- Modify `package.json`: add the new focused static/state check to `npm run check`.
- Modify `tools/check-grid-slicing-rules.js`: unit checks for grid specifications, aspect crops, transforms, and common dimensions.
- Create `tools/check-canvas-grid-editor.js`: static contract and serialization/paste contract checks.
- Create `tools/check-canvas-grid-editor-ui.js`: real browser flow covering both menu branches, node editing, output, and restore.
- Modify `tools/check-canvas-gallery-grid-slicing.js`: retire assertions tied to the old full-screen entry and assert the new menu entry instead.
- Modify `tools/check-canvas-gallery-grid-slicing-ui.js`: retain only reusable legacy rule coverage or remove the obsolete modal flow after the new browser test passes.

---

### Task 1: Extend Pure Grid and Aspect-Crop Rules

**Files:**
- Modify: `grid-slicing-rules.js`
- Modify: `tools/check-grid-slicing-rules.js`

**Interfaces:**
- Consumes: existing `createEvenBands`, `applyUniformGap`, `getSliceRegions`, and even-gap invariant.
- Produces:
  - `normalizeGridSpec(rows, columns) -> { rows, columns }`
  - `createGridLayout(width, height, rows, columns, gap = 0) -> { spec, horizontalBands, verticalBands, regions }`
  - `resolveAspectRatio(value, context) -> number`
  - `getCellCrop(region, aspectRatio, transform) -> Crop`
  - `getCommonOutputSize(crops, aspectRatio) -> { width, height }`
  - `normalizeCellTransforms(regions, transforms) -> CellTransform[]`

- [ ] **Step 1: Write failing rule tests**

Append assertions that use the real exported API:

```js
assert.deepEqual(Rules.normalizeGridSpec(0, 9), { rows: 1, columns: 5 });
assert.deepEqual(Rules.normalizeGridSpec(3, 4), { rows: 3, columns: 4 });

const layout = Rules.createGridLayout(1200, 900, 3, 4, 10);
assert.equal(layout.regions.length, 12);
assert.deepEqual(layout.regions[0], {
  key: "r1-c1", row: 1, column: 1, x: 0, y: 0, width: 295, height: 295,
});
assert.equal(layout.horizontalBands.every((band) => (band.end - band.start) % 2 === 0), true);

const square = Rules.getCellCrop(
  { key: "r1-c1", row: 1, column: 1, x: 0, y: 0, width: 400, height: 300 },
  1,
  { key: "r1-c1", centerX: 0.75, centerY: 0.5, zoom: 2 },
);
assert.deepEqual(square, {
  key: "r1-c1", row: 1, column: 1,
  x: 225, y: 75, width: 150, height: 150,
  centerX: 0.75, centerY: 0.5, zoom: 2,
});

assert.deepEqual(Rules.getCommonOutputSize([
  { width: 800, height: 450 },
  { width: 640, height: 360 },
], 16 / 9), { width: 640, height: 360 });
```

- [ ] **Step 2: Run the rule test and verify the missing API failure**

Run: `node tools/check-grid-slicing-rules.js`

Expected: FAIL with `TypeError: Rules.normalizeGridSpec is not a function`.

- [ ] **Step 3: Implement grid and crop calculations**

Add focused pure helpers and export them:

```js
const MAX_GRID_SIZE = 5;
const CELL_ZOOM_MIN = 1;
const CELL_ZOOM_MAX = 8;

function normalizeGridSpec(rowsValue, columnsValue) {
  return {
    rows: clamp(Math.round(Number(rowsValue) || 1), 1, MAX_GRID_SIZE),
    columns: clamp(Math.round(Number(columnsValue) || 1), 1, MAX_GRID_SIZE),
  };
}

function createGridLayout(widthValue, heightValue, rowsValue, columnsValue, gapValue = 0) {
  const width = normalizeLength(widthValue);
  const height = normalizeLength(heightValue);
  const spec = normalizeGridSpec(rowsValue, columnsValue);
  const horizontalBands = createEvenBands(height, spec.rows - 1, gapValue, "h");
  const verticalBands = createEvenBands(width, spec.columns - 1, gapValue, "v");
  const regions = getSliceRegions(width, height, verticalBands, horizontalBands)
    .map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
  return { spec, horizontalBands, verticalBands, regions };
}

function resolveAspectRatio(value, context = {}) {
  const ratios = { "16:9": 16 / 9, "9:16": 9 / 16, "3:4": 3 / 4, "4:3": 4 / 3, "1:1": 1 };
  if (ratios[value]) return ratios[value];
  const rows = Math.max(1, Number(context.rows) || 1);
  const columns = Math.max(1, Number(context.columns) || 1);
  return (normalizeLength(context.width) / columns) / (normalizeLength(context.height) / rows);
}

function normalizeCellTransform(region, transform = {}) {
  return {
    key: region.key,
    centerX: clamp(Number(transform.centerX) || 0.5, 0, 1),
    centerY: clamp(Number(transform.centerY) || 0.5, 0, 1),
    zoom: clamp(Number(transform.zoom) || 1, CELL_ZOOM_MIN, CELL_ZOOM_MAX),
  };
}

function getCellCrop(region, aspectRatioValue, transformValue = {}) {
  const ratio = Math.max(0.0001, Number(aspectRatioValue) || 1);
  const transform = normalizeCellTransform(region, transformValue);
  const fitWidth = Math.min(region.width, region.height * ratio);
  const fitHeight = fitWidth / ratio;
  const width = fitWidth / transform.zoom;
  const height = fitHeight / transform.zoom;
  const desiredX = region.x + transform.centerX * region.width - width / 2;
  const desiredY = region.y + transform.centerY * region.height - height / 2;
  return {
    key: region.key,
    row: region.row,
    column: region.column,
    x: clamp(desiredX, region.x, region.x + region.width - width),
    y: clamp(desiredY, region.y, region.y + region.height - height),
    width,
    height,
    ...transform,
  };
}

function getCommonOutputSize(crops, aspectRatioValue) {
  const ratio = Math.max(0.0001, Number(aspectRatioValue) || 1);
  const maxWidth = Math.floor(Math.min(...crops.map((crop) => crop.width)));
  const maxHeight = Math.floor(Math.min(...crops.map((crop) => crop.height)));
  let height = Math.min(maxHeight, Math.floor(maxWidth / ratio));
  let width = Math.floor(height * ratio);
  if (width < 1 || height < 1) throw new Error("Grid crop output is too small.");
  return { width, height };
}
```

Implement `normalizeCellTransforms` by indexing provided transforms by `key`, preserving matching cells, and defaulting new cells to `{ centerX: 0.5, centerY: 0.5, zoom: 1 }`.

- [ ] **Step 4: Run focused and syntax checks**

Run: `node --check grid-slicing-rules.js && node tools/check-grid-slicing-rules.js`

Expected: PASS with `Grid slicing rules checks passed`.

- [ ] **Step 5: Commit the pure-rule change**

```bash
git add grid-slicing-rules.js tools/check-grid-slicing-rules.js
git commit -m "feat: add grid editor crop rules"
```

---

### Task 2: Add the Two-Stage Grid Menu and Atomic Direct Slicing

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-gallery-grid-slicing.js`
- Create: `tools/check-canvas-grid-editor.js`

**Interfaces:**
- Consumes: `GridSlicingRules.createGridLayout`, `loadImageElement`, `canvasToPngBlob`, `uploadCanvasImageFile`, `addCanvasImage`, `getCanvasGalleryActiveImage`.
- Produces:
  - `openCanvasGridMenu(sourceNode)`
  - `closeCanvasGridMenu()`
  - `selectCanvasGridSpec(sourceNode, spec)`
  - `createCanvasDirectGridSlices(sourceNode, spec) -> Promise<HTMLElement[]>`
  - `persistCanvasGridCrops(image, crops, options) -> Promise<GridOutputImage[]>`
  - `findCanvasGridImageBlockPoint(sourceNode, spec, nodeSize) -> { x, y }`
  - `placeCanvasGridImageNodes(sourceNode, images, spec) -> HTMLElement[]`

- [ ] **Step 1: Write failing static/menu tests**

Create `tools/check-canvas-grid-editor.js` with `extractFunction` copied from the existing focused canvas checks, then assert:

```js
const galleryRender = extractFunction(script, "renderCanvasGalleryNode");
assert.ok(galleryRender.includes("openCanvasGridMenu"));
assert.ok(!galleryRender.includes("openCanvasGalleryGridSlicer(node)"));

const menu = extractFunction(script, "ensureCanvasGridMenuMarkup");
["2×2", "3×3", "4×4", "5×5", "自定义", "仅裁剪", "创建格子"]
  .forEach((label) => assert.ok(menu.includes(label), `Missing menu label ${label}`));

const direct = extractFunction(script, "createCanvasDirectGridSlices");
assert.ok(direct.includes("GridSlicingRules.createGridLayout"));
assert.ok(direct.includes("persistCanvasGridCrops"));
assert.ok(direct.includes("placeCanvasGridImageNodes"));
assert.ok(direct.indexOf("persistCanvasGridCrops") < direct.indexOf("placeCanvasGridImageNodes"));
```

Update the old gallery slicing check so the hover button contract points to `openCanvasGridMenu` rather than the full-screen modal.

- [ ] **Step 2: Run the focused check and verify it fails**

Run: `node tools/check-canvas-grid-editor.js`

Expected: FAIL because `ensureCanvasGridMenuMarkup` and `createCanvasDirectGridSlices` do not exist.

- [ ] **Step 3: Implement menu state and markup**

Add a single transient state object and one reusable menu element:

```js
let canvasGridMenuState = null;

function openCanvasGridMenu(sourceNode) {
  const active = getCanvasGalleryActiveImage(sourceNode);
  if (!active) return false;
  const menu = ensureCanvasGridMenuMarkup();
  canvasGridMenuState = { sourceNode, active, spec: null, view: "presets" };
  renderCanvasGridMenu();
  positionCanvasGridMenu(menu, sourceNode.querySelector(".canvas-gallery-slice-toggle"));
  menu.hidden = false;
  return true;
}

function closeCanvasGridMenu() {
  const menu = document.querySelector("#canvasGridMenu");
  if (menu) menu.hidden = true;
  canvasGridMenuState = null;
}
```

`ensureCanvasGridMenuMarkup` must render preset buttons with `data-grid-rows` and `data-grid-columns`, a custom row/column view with selects limited to1–5, and an action view with `data-grid-action="direct"` and `data-grid-action="editor"`. Stop pointer, wheel, and click propagation at the menu root.

- [ ] **Step 4: Implement shared crop persistence**

Use one renderer that finishes all uploads before returning:

```js
async function persistCanvasGridCrops(image, crops, { sourceName, outputSize = null } = {}) {
  const createdAt = new Date().toISOString();
  const settled = await Promise.allSettled(crops.map(async (crop) => {
    const width = outputSize?.width || Math.max(1, Math.round(crop.width));
    const height = outputSize?.height || Math.max(1, Math.round(crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(
      image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height,
    );
    const blob = await canvasToPngBlob(canvas, "宫格切片导出失败。");
    const stem = String(sourceName || "grid-image").replace(/\.[^.]+$/, "");
    const name = `${stem}-r${String(crop.row).padStart(2, "0")}-c${String(crop.column).padStart(2, "0")}.png`;
    const savedUrl = await uploadCanvasImageFile(new File([blob], name, { type: "image/png" }));
    return { id: createId(), name, src: savedUrl, savedUrl, createdAt, width, height };
  }));
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) throw failed.reason || new Error("宫格切片保存失败。");
  return settled.map((result) => result.value);
}
```

- [ ] **Step 5: Implement direct slicing and row/column placement**

`createCanvasDirectGridSlices` must load the snapshot, call `createGridLayout(width, height, rows, columns, 0)`, persist all crops, and only then call `placeCanvasGridImageNodes`. Place each image at:

```js
{
  x: block.x + (column - 1) * (nodeWidth + 24),
  y: block.y + (row - 1) * (nodeHeight + 24),
}
```

Use a block-level overlap check before creating any node; shift the whole block down until it clears existing node boxes. Set status to `已裁切并创建 N 个独立图片节点。` after success.

- [ ] **Step 6: Add focused menu and direct-slice styles**

Add `.canvas-grid-menu`, `.canvas-grid-menu-panel`, `.canvas-grid-menu-option`, `.canvas-grid-menu-back`, and `.canvas-grid-menu-custom` styles. Use the current dark/yellow canvas theme, an absolute/fixed popup above nodes, 44px minimum action height, visible keyboard focus, and `z-index` above canvas nodes but below confirmation overlays.

- [ ] **Step 7: Run focused checks**

Run: `node --check script.js && node tools/check-canvas-gallery-grid-slicing.js && node tools/check-canvas-grid-editor.js`

Expected: all three commands exit0.

- [ ] **Step 8: Commit the menu and direct-slice path**

```bash
git add script.js styles.css tools/check-canvas-gallery-grid-slicing.js tools/check-canvas-grid-editor.js
git commit -m "feat: add direct canvas grid slicing"
```

---

### Task 3: Create and Render the Persistent Grid Editor Node

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-grid-editor.js`

**Interfaces:**
- Consumes: menu-selected `{ rows, columns }`, current gallery image snapshot, `GridSlicingRules.createGridLayout`, `createCanvasNode`, `connectCanvasNodes`.
- Produces:
  - `createCanvasGridEditorState(options) -> GridEditorState`
  - `addCanvasGridEditorNode(sourceNode, options) -> HTMLElement`
  - `renderCanvasGridEditorNode(node, state)`
  - `getCanvasGridEditorState(node) -> GridEditorState`
  - `setCanvasGridEditorState(node, state, { save = true } = {})`

- [ ] **Step 1: Add failing node contract tests**

Extend `tools/check-canvas-grid-editor.js`:

```js
const addEditor = extractFunction(script, "addCanvasGridEditorNode");
assert.ok(addEditor.includes('createCanvasNode("grid-editor")'));
assert.ok(addEditor.includes("connectCanvasNodes"));

const renderEditor = extractFunction(script, "renderCanvasGridEditorNode");
["canvas-grid-editor-toolbar", "canvas-grid-editor-cells", "canvas-grid-editor-edit", "canvas-grid-editor-output"]
  .forEach((className) => assert.ok(renderEditor.includes(className)));

const createState = extractFunction(script, "createCanvasGridEditorState");
assert.ok(createState.includes("sourceSrc"));
assert.ok(createState.includes("horizontalBands"));
assert.ok(createState.includes("verticalBands"));
assert.ok(createState.includes("cellTransforms"));
```

- [ ] **Step 2: Run the focused check and verify it fails**

Run: `node tools/check-canvas-grid-editor.js`

Expected: FAIL because `addCanvasGridEditorNode` is missing.

- [ ] **Step 3: Implement the normalized editor state**

Store a versioned JSON value in `node.dataset.gridEditorState`:

```js
function createCanvasGridEditorState({ source, sourceNodeId, width, height, rows, columns } = {}) {
  const layout = GridSlicingRules.createGridLayout(width, height, rows, columns, 0);
  return {
    version: 1,
    sourceNodeId: String(sourceNodeId || ""),
    sourceSrc: source.savedUrl || source.src || source.url || "",
    sourceName: source.name || "宫格来源.png",
    sourceWidth: width,
    sourceHeight: height,
    rows: layout.spec.rows,
    columns: layout.spec.columns,
    aspect: "match",
    uniformGap: 0,
    horizontalBands: layout.horizontalBands,
    verticalBands: layout.verticalBands,
    cellTransforms: GridSlicingRules.normalizeCellTransforms(layout.regions, []),
    editing: false,
    collapsed: false,
  };
}
```

`getCanvasGridEditorState` must parse safely and normalize missing arrays. `setCanvasGridEditorState` must update the dataset, rerender, refresh connections, and schedule save only when `save` is true.

- [ ] **Step 4: Implement node creation and source snapshot connection**

`addCanvasGridEditorNode` must load source dimensions before creation, find a non-overlapping point to the source right, render the node, place it, add `{ from: sourceId, to: editorId, toPort: "input" }` through `connectCanvasNodes`, and select it. The editor state must not read future gallery active-image changes.

- [ ] **Step 5: Render toolbar and cell preview**

Render:

```html
<div class="canvas-grid-editor-toolbar">
  <button class="canvas-grid-editor-aspect">比例 匹配</button>
  <button class="canvas-grid-editor-grid">网格 3×3</button>
  <button class="canvas-grid-editor-edit">编辑</button>
  <button class="canvas-grid-editor-output">输出图集</button>
  <button class="canvas-grid-editor-clear">清空</button>
  <button class="canvas-grid-editor-collapse">折叠</button>
</div>
<div class="canvas-grid-editor-cells"></div>
<div class="canvas-grid-editor-status" aria-live="polite"></div>
```

For each region, render a `.canvas-grid-editor-cell[data-cell-key]` containing the same source image. Apply crop preview with an inner image transform derived from the exact `getCellCrop` rectangle; do not use `object-fit: cover` without the crop coordinates.

- [ ] **Step 6: Add editor node styles**

Style `.canvas-node-grid-editor` as a resizable canvas node with minimum width420px and maximum width1600px. Use CSS grid for cells, preserve the current row/column layout, clip every cell, give editor controls their own pointer surface, and ensure pointer events inside cells do not start canvas-node drag.

- [ ] **Step 7: Run focused checks**

Run: `node --check script.js && node tools/check-canvas-grid-editor.js`

Expected: PASS.

- [ ] **Step 8: Commit the editor-node shell**

```bash
git add script.js styles.css tools/check-canvas-grid-editor.js
git commit -m "feat: add canvas grid editor node"
```

---

### Task 4: Implement Grid, Gap, Ratio, Pan, Zoom, Clear, and Collapse Editing

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-grid-editor.js`

**Interfaces:**
- Consumes: `GridEditorState`, `GridSlicingRules.moveBand`, `resizeBandEdge`, `setBandGap`, `applyUniformGap`, `getCellCrop`.
- Produces:
  - `setCanvasGridEditorSpec(node, rows, columns)`
  - `setCanvasGridEditorAspect(node, aspect)`
  - `setCanvasGridEditorUniformGap(node, gap)`
  - `setCanvasGridEditorBandGap(node, axis, id, gap)`
  - `startCanvasGridEditorBandDrag(event, node)`
  - `startCanvasGridEditorCellPan(event, node, key)`
  - `setCanvasGridEditorCellZoom(node, key, zoom)`
  - `clearCanvasGridEditor(node)`
  - `setCanvasGridEditorCollapsed(node, collapsed)`

- [ ] **Step 1: Add failing interaction contract tests**

```js
const aspect = extractFunction(script, "setCanvasGridEditorAspect");
assert.ok(aspect.includes("normalizeCellTransforms"));
assert.ok(aspect.includes("scheduleCanvasSave"));

const uniformGap = extractFunction(script, "setCanvasGridEditorUniformGap");
assert.ok(uniformGap.includes("GridSlicingRules.applyUniformGap"));

const bandDrag = extractFunction(script, "startCanvasGridEditorBandDrag");
assert.ok(bandDrag.includes("GridSlicingRules.moveBand"));
assert.ok(bandDrag.includes("GridSlicingRules.resizeBandEdge"));

const cellPan = extractFunction(script, "startCanvasGridEditorCellPan");
assert.ok(cellPan.includes("centerX"));
assert.ok(cellPan.includes("centerY"));
```

- [ ] **Step 2: Run and verify the missing interaction failure**

Run: `node tools/check-canvas-grid-editor.js`

Expected: FAIL on the first missing interaction function.

- [ ] **Step 3: Implement grid and ratio menus**

Reuse the same preset/custom grid menu data. Grid changes rebuild equal bands with the current uniform gap and preserve transforms only for cell keys still present. Aspect changes update one state value, normalize every transform against the new crops, and rerender all cells.

- [ ] **Step 4: Implement line and gap editing**

In edit mode, render one overlay band per horizontal/vertical band using source percentages. Pointer coordinates must map through the editor preview rect to source pixels. Middle drag calls `moveBand`; edge drag calls `resizeBandEdge`. Uniform-gap input normalizes to even and applies to every band; selected-line input calls `setBandGap` for one band.

On pointerup, write one undo/save checkpoint rather than saving every pointermove. During pointermove, rerender without scheduling persistence.

- [ ] **Step 5: Implement per-cell pan and zoom**

Selected-cell panning converts pointer deltas to normalized region-space deltas:

```js
next.centerX = Math.max(0, Math.min(1, start.centerX - deltaX / regionDisplayWidth / start.zoom));
next.centerY = Math.max(0, Math.min(1, start.centerY - deltaY / regionDisplayHeight / start.zoom));
```

Wheel and slider zoom use0.05 increments clamped to1–8. Preserve the selected cell center, call `getCellCrop` to clamp visible source bounds, and commit the final transform on wheel debounce or slider change.

- [ ] **Step 6: Implement clear confirmation and collapse**

First clear click changes button text to `再次点击清空` for4.5seconds. The second click writes this explicit empty state and rerenders an empty-source panel:

```js
{
  ...state,
  sourceNodeId: "",
  sourceSrc: "",
  sourceName: "",
  sourceWidth: 0,
  sourceHeight: 0,
  horizontalBands: [],
  verticalBands: [],
  cellTransforms: [],
  editing: false,
}
```

Collapse toggles `state.collapsed`, hides the cells/status body, updates `aria-expanded`, and saves the node.

- [ ] **Step 7: Add selected/edit/collapsed styles**

Add visible selected-cell borders, yellow gap bands, edge hit targets, edit cursor states, cell zoom control, invalid-cell state, and compact collapsed node styling. Controls must remain keyboard reachable and show focus outlines.

- [ ] **Step 8: Run focused checks**

Run: `node --check script.js && node tools/check-grid-slicing-rules.js && node tools/check-canvas-grid-editor.js`

Expected: PASS.

- [ ] **Step 9: Commit interactions**

```bash
git add script.js styles.css tools/check-canvas-grid-editor.js
git commit -m "feat: add grid editor interactions"
```

---

### Task 5: Output an Atomic, Equal-Size Gallery From the Editor

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-grid-editor.js`

**Interfaces:**
- Consumes: `getCanvasGridEditorState`, `GridSlicingRules.getSliceRegions`, `getCellCrop`, `getCommonOutputSize`, `persistCanvasGridCrops`, `createCanvasGridSliceGallery`.
- Produces: `outputCanvasGridEditorGallery(node) -> Promise<HTMLElement|null>`.

- [ ] **Step 1: Add failing output contract tests**

```js
const output = extractFunction(script, "outputCanvasGridEditorGallery");
assert.ok(output.includes("GridSlicingRules.getCellCrop"));
assert.ok(output.includes("GridSlicingRules.getCommonOutputSize"));
assert.ok(output.includes("persistCanvasGridCrops"));
assert.ok(output.includes("createCanvasGridSliceGallery"));
assert.ok(output.indexOf("persistCanvasGridCrops") < output.indexOf("createCanvasGridSliceGallery"));
```

- [ ] **Step 2: Run and verify the missing output failure**

Run: `node tools/check-canvas-grid-editor.js`

Expected: FAIL because `outputCanvasGridEditorGallery` is missing.

- [ ] **Step 3: Implement output calculation**

Load the snapshot source, derive current regions from saved bands, resolve the selected aspect, map each region plus its keyed transform through `getCellCrop`, and call `getCommonOutputSize`. Disable the output button while running.

- [ ] **Step 4: Persist all PNGs before creating the gallery**

Pass the common `{ width, height }` to `persistCanvasGridCrops`. After every upload resolves, call `createCanvasGridSliceGallery(editorNode, images)` so the result is placed to the editor's right. On rejection, keep the node and state, re-enable output, and show `输出失败：<message>` without a partial gallery.

- [ ] **Step 5: Verify focused output checks**

Run: `node --check script.js && node tools/check-canvas-grid-editor.js`

Expected: PASS.

- [ ] **Step 6: Commit editor output**

```bash
git add script.js tools/check-canvas-grid-editor.js
git commit -m "feat: output grid editor galleries"
```

---

### Task 6: Add Serialization, Restore, Copy/Paste, Undo, and Node Output Contracts

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-grid-editor.js`

**Interfaces:**
- Consumes: existing `serializeCanvasNode`, `restoreCanvasBoard`, `pasteCanvasNodes`, connection `idMap`, and snapshot undo.
- Produces:
  - serialized node kind `grid-editor`
  - `gridEditorState` field
  - `remapCanvasGridEditorState(state, idMap)`

- [ ] **Step 1: Add failing persistence tests**

Assert exact branch support:

```js
const serialize = extractFunction(script, "serializeCanvasNode");
assert.ok(serialize.includes('base.kind === "grid-editor"'));
assert.ok(serialize.includes("gridEditorState"));

const kind = extractFunction(script, "getCanvasNodeKind");
assert.ok(kind.includes('canvas-node-grid-editor'));

const createKind = extractFunction(script, "getCanvasCreateKindFromSerialized");
assert.ok(createKind.includes('"grid-editor"'));

const remap = extractFunction(script, "remapCanvasGridEditorState");
assert.ok(remap.includes("sourceNodeId"));
```

- [ ] **Step 2: Run and verify the persistence failure**

Run: `node tools/check-canvas-grid-editor.js`

Expected: FAIL because serialization does not recognize `grid-editor`.

- [ ] **Step 3: Add kind, serialization, and restore branches**

Serialize a normalized snapshot that does not reopen transient edit mode:

```js
base.gridEditorState = { ...getCanvasGridEditorState(node), editing: false };
```

Add `grid-editor` to `getCanvasCreateKindFromSerialized`, recognize `.canvas-node-grid-editor` in `getCanvasNodeKind`, and call `renderCanvasGridEditorNode(node, item.gridEditorState)` during restore and paste.

- [ ] **Step 4: Remap copied source identity**

If `state.sourceNodeId` belongs to the copied selection, replace it with `idMap.get(sourceNodeId)`; otherwise keep the snapshot URL but set `sourceNodeId` to the still-existing external source or an empty string. Internal/external connections continue through the generic connection copy code.

- [ ] **Step 5: Define node output and sizing behavior**

`getCanvasNodeOutput` returns `{ type: "grid-editor", name: "宫格编辑节点" }` only while a source snapshot exists; it does not expose unrendered cells as image references. Add grid editor limits to `getCanvasNodeMinWidth`, resize maximums, `applyCanvasNodeSize`, and `getCanvasNodeBodyHeight` so save/restore and manual resizing remain stable.

- [ ] **Step 6: Run persistence and existing history checks**

Run: `node tools/check-canvas-grid-editor.js && node tools/check-canvas-gallery-history.js && node tools/check-canvas-shell-history-theme.js`

Expected: PASS.

- [ ] **Step 7: Commit persistence support**

```bash
git add script.js tools/check-canvas-grid-editor.js
git commit -m "feat: persist canvas grid editor nodes"
```

---

### Task 7: Add Real Browser Coverage and Remove the Obsolete Modal Path

**Files:**
- Create: `tools/check-canvas-grid-editor-ui.js`
- Modify: `tools/check-canvas-gallery-grid-slicing-ui.js`
- Modify: `tools/check-canvas-gallery-grid-slicing.js`
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete menu, direct slicing, editor interactions, output, and persistence APIs.
- Produces: browser-level proof of both branches and a single current grid interaction path.

- [ ] **Step 1: Write the failing browser scenario**

Create a Playwright check that:

1. Intercepts `/api/canvas/boards`, `/api/upload-image`, and generated `/test-output/*.png` URLs.
2. Creates a 1200×900 four-color source gallery in the page.
3. Opens the grid menu, chooses2×2 then “仅裁剪”, and asserts four standalone image nodes appear in row-major positions while the source remains unchanged.
4. Reopens the menu, chooses3×3 then “创建格子”, and asserts one connected `canvas-node-grid-editor` appears with nine cells.
5. Changes aspect to3:4 and checks every cell's computed crop ratio.
6. Enters edit mode, sets uniform gap to12, sets one line to20, drags a line, pans one cell, and zooms it to1.5.
7. Collapses and expands the node, then outputs a gallery.
8. Loads every uploaded PNG and asserts all nine editor outputs have identical dimensions.
9. Serializes/restores the board and compares rows, columns, bands, aspect, transforms, snapshot URL, collapsed state, and source connection.
10. Asserts no page errors and saves `artifacts/canvas-grid-editor-ui.png`.

- [ ] **Step 2: Run and verify the browser test fails before final wiring**

Run with the configured Playwright runtime:

```powershell
$env:NODE_PATH='C:\Users\Administrator\AppData\Local\OpenAI\Codex\runtimes\cua_node\23828fd353da361d\bin\node_modules'
$env:GRID_SLICING_APP_URL='http://127.0.0.1:3099'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe'
node .\tools\check-canvas-grid-editor-ui.js
```

Expected: FAIL on the first incomplete menu/editor interaction assertion.

- [ ] **Step 3: Wire menu actions and close behaviors**

Connect direct/editor menu actions, Escape, outside click, active-node deletion, and board restore cleanup. Ensure menu buttons stop canvas pan/drag and focus returns to the source toggle after close.

- [ ] **Step 4: Remove obsolete full-screen modal code and CSS**

After the new browser scenario passes through node creation and output, remove the unused `canvasGridSlicerState`, `ensureCanvasGalleryGridSlicerMarkup`, modal open/render/drag/pan/generate functions, and `.canvas-grid-slicer*` styles. Keep shared pure rules, crop persistence, gallery creation, and placement helpers. Update the legacy checks so they no longer require the modal.

- [ ] **Step 5: Add checks to the project command**

Add `node tools/check-canvas-grid-editor.js` after `check-canvas-gallery-grid-slicing.js` in the `check` script. Keep the browser test as an explicit UI command because the base package has no Playwright dependency.

- [ ] **Step 6: Run the new browser check to green**

Run the PowerShell command from Step2.

Expected: `Canvas grid editor UI checks passed: ...\artifacts\canvas-grid-editor-ui.png`.

- [ ] **Step 7: Run full regression checks**

Run:

```powershell
npm run check
git diff --check -- grid-slicing-rules.js script.js styles.css package.json tools/check-grid-slicing-rules.js tools/check-canvas-gallery-grid-slicing.js tools/check-canvas-gallery-grid-slicing-ui.js tools/check-canvas-grid-editor.js tools/check-canvas-grid-editor-ui.js
```

Expected: exit0, all focused checks report pass, and `git diff --check` prints no whitespace errors.

- [ ] **Step 8: Commit browser coverage and old-path cleanup**

```bash
git add grid-slicing-rules.js script.js styles.css package.json tools/check-grid-slicing-rules.js tools/check-canvas-gallery-grid-slicing.js tools/check-canvas-gallery-grid-slicing-ui.js tools/check-canvas-grid-editor.js tools/check-canvas-grid-editor-ui.js
git commit -m "test: verify canvas grid editor workflow"
```

---

## Final Verification Checklist

- [ ] `node tools/check-grid-slicing-rules.js` passes.
- [ ] `node tools/check-canvas-gallery-grid-slicing.js` passes with the new menu contract.
- [ ] `node tools/check-canvas-grid-editor.js` passes.
- [ ] `node tools/check-canvas-grid-editor-ui.js` passes against the running local app.
- [ ] `npm run check` exits0.
- [ ] Direct slicing creates only standalone image nodes after all uploads succeed.
- [ ] Grid editor output creates equal-size gallery images after all uploads succeed.
- [ ] Source gallery current image/history remain unchanged in both branches.
- [ ] Saved/restored and copied editor nodes preserve editing state and valid connections.
- [ ] No unrelated dirty-worktree changes are staged or overwritten.
