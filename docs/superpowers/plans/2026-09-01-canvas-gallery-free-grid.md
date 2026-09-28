# Canvas Gallery Free Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace count-based gallery columns with a resizable, size-driven gallery grid that preserves member order, minimum thumbnail size, and existing connection behavior.

**Architecture:** Derive gallery rows, columns, cell size, and minimum node dimensions from the persisted node width/height plus the member count. Persist only the node dimensions and ordered members. The existing resize handler delegates gallery nodes to a gallery-specific sizing function that clamps to the calculated minimum and updates the node height when appended members need another row.

**Tech Stack:** Vanilla JavaScript DOM, CSS Grid, existing canvas virtual store, existing Node assertion checks.

## Global Constraints

- Keep `galleryContainer.members` as the single stable visual order.
- Do not persist derived column count for new layouts.
- Keep images uncropped and preserve source ratios with `object-fit: contain`.
- Keep existing member output handles, aggregate gallery ports, connection deletion, undo, and connected-image-to-gallery remapping working.
- Do not alter unrelated dirty-worktree files.

---

### Task 1: Add pure size-driven grid calculations

**Files:**
- Modify: `script.js:6389-6448`
- Modify: `tools/check-canvas-gallery-container-operations.js`

**Interfaces:**
- Produces `getCanvasGalleryFreeGridLayout({ count, width, height, gap })` returning `{ columns, rows, cellWidth, cellHeight, contentWidth, contentHeight, minWidth, minHeight, width, height }`.
- Produces `getCanvasGalleryContainerRenderState(value, size)` using the persisted size instead of `value.columns`.

- [ ] **Step 1: Write failing layout tests**

```js
assert.deepEqual(
  JSON.parse(JSON.stringify(context.getCanvasGalleryFreeGridLayout({ count: 5, width: 420, height: 300 }))),
  { columns: 3, rows: 2, cellWidth: 120, cellHeight: 120, contentWidth: 392, contentHeight: 256, minWidth: 152, minHeight: 204, width: 420, height: 300 },
);
assert.equal(context.getCanvasGalleryFreeGridLayout({ count: 5, width: 170, height: 300 }).columns, 1);
assert.equal(context.getCanvasGalleryFreeGridLayout({ count: 5, width: 420, height: 170 }).height >= 300, true);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: failure because `getCanvasGalleryFreeGridLayout` does not exist and current count-based layout returns derived columns.

- [ ] **Step 3: Implement the minimal layout helpers**

```js
function getCanvasGalleryFreeGridLayout({ count, width, height, gap = 16 }) {
  const memberCount = Math.max(0, Number(count) || 0);
  const minCell = 96;
  const chromeHeight = 68;
  const padding = 32;
  const requestedWidth = Math.max(minCell + padding, Number(width) || minCell + padding);
  const columns = Math.max(1, Math.floor((requestedWidth - padding + gap) / (minCell + gap)));
  const rows = Math.max(1, Math.ceil(Math.max(1, memberCount) / columns));
  const cellWidth = Math.max(minCell, (requestedWidth - padding - gap * (columns - 1)) / columns);
  const contentHeight = rows * minCell + gap * (rows - 1);
  const minHeight = chromeHeight + padding + contentHeight;
  return { columns, rows, cellWidth, cellHeight: minCell, minWidth: minCell + padding, minHeight, width: requestedWidth, height: Math.max(Number(height) || minHeight, minHeight) };
}
```

Use shared constants for the 16px member inset, 16px member gap, 30px footer, and 38px header so the returned minimum dimensions and the rendered CSS always agree.

- [ ] **Step 4: Update render-state callers**

Pass `node.dataset.width` and `node.dataset.height` into `getCanvasGalleryContainerRenderState`, and remove write-back of derived `columns` from `renderCanvasGalleryContainerNode`.

- [ ] **Step 5: Run focused test and verify it passes**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: `Canvas gallery container operations checks passed`.

### Task 2: Render a stable row-first adaptive grid

**Files:**
- Modify: `script.js:6451-6535`
- Modify: `styles.css:15000-15155`
- Modify: `tools/check-canvas-gallery-container-ui.js`

**Interfaces:**
- Consumes the Task 1 layout object.
- Produces CSS custom properties `--canvas-gallery-container-columns`, `--canvas-gallery-container-cell-width`, `--canvas-gallery-container-cell-height`, and `--canvas-gallery-container-gap`.

- [ ] **Step 1: Write failing rendering assertions**

```js
assert.match(script, /grid-template-columns:\s*repeat\(var\(--canvas-gallery-container-columns/);
assert.match(script, /members\.forEach\(\(member, index\)/);
assert.doesNotMatch(script, /getCanvasGalleryContainerMemberColumnIndices\(members/);
assert.match(styles, /object-fit:\s*contain/);
```

- [ ] **Step 2: Run focused UI check and verify it fails**

Run: `node tools/check-canvas-gallery-container-ui.js`

Expected: failure because current rendering creates shortest-height columns rather than a row-first grid.

- [ ] **Step 3: Implement row-first DOM rendering**

Replace column wrapper creation and `getCanvasGalleryContainerMemberColumnIndices` placement with direct member insertion into `.canvas-gallery-container-members` in `members` array order. Set the custom properties from Task 1 and keep the existing per-member preview, output-port, click, hover, and member-drag bindings unchanged.

- [ ] **Step 4: Update adaptive CSS**

```css
.canvas-gallery-container-members {
  display: grid;
  grid-template-columns: repeat(var(--canvas-gallery-container-columns), minmax(0, 1fr));
  grid-auto-rows: var(--canvas-gallery-container-cell-height);
  gap: var(--canvas-gallery-container-gap);
}
.canvas-gallery-member-preview,
.canvas-gallery-member-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

Keep the existing member hover transform and output-port anchor; adjust only the grid and image-fit rules.

- [ ] **Step 5: Run focused UI and operation checks**

Run: `node tools/check-canvas-gallery-container-ui.js; node tools/check-canvas-gallery-container-operations.js`

Expected: both checks pass and retain the connection-port assertions.

### Task 3: Make gallery resizing bidirectional and persist automatic growth

**Files:**
- Modify: `script.js:15211-15268`
- Modify: `script.js:15284-15303`
- Modify: `tools/check-canvas-gallery-container-operations.js`

**Interfaces:**
- Produces `getCanvasGalleryContainerSizeForRequest(node, requestedWidth, requestedHeight)` returning a clamped `{ width, height, layout }`.
- `beginCanvasNodeResize` uses this helper for `.canvas-node-gallery-container` before applying dimensions.

- [ ] **Step 1: Write failing resize tests**

```js
assert.deepEqual(
  JSON.parse(JSON.stringify(context.getCanvasGalleryContainerSizeForRequest(node, 180, 120))),
  { width: 152, height: 476, layout: { columns: 1, rows: 4 } },
);
assert.equal(context.getCanvasGalleryContainerSizeForRequest(node, 560, 220).layout.columns, 4);
assert.equal(context.getCanvasGalleryContainerSizeForRequest(node, 560, 220).height >= 220, true);
```

- [ ] **Step 2: Run focused operation check and verify it fails**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: failure because gallery nodes currently discard `dataset.height` during resize.

- [ ] **Step 3: Implement gallery-specific clamp and resize path**

For gallery nodes, preserve both `dataset.width` and `dataset.height`. On every pointer move, calculate the requested dimensions, clamp them through `getCanvasGalleryContainerSizeForRequest`, write both values, call `applyCanvasNodeSize`, re-render the gallery with the same members, and schedule immediate connection rendering.

- [ ] **Step 4: Persist append-driven height growth**

After `appendCanvasGalleryMember`, `appendCanvasGenerationToGallery`, crop result creation, and connected-image absorption, calculate the required gallery height. If it grows, update `dataset.height`, call `applyCanvasNodeSize`, and include the gallery node before/after values in the existing undo/save operation.

- [ ] **Step 5: Verify connection and undo behavior**

Add assertions that resizing an image-containing gallery preserves a `member-output:<id>` connection, that the connection endpoint function still resolves the member port, and that a resize produces one `node.upsert` undo operation.

- [ ] **Step 6: Run focused checks**

Run: `node tools/check-canvas-gallery-container-operations.js; node tools/check-canvas-gallery-container-ui.js`

Expected: both pass.

### Task 4: Verify regressions across the canvas

**Files:**
- Modify: `tools/check-canvas-gallery-container-operations.js`

- [ ] **Step 1: Run the gallery regressions**

Run: `node tools/check-canvas-gallery-container-operations.js; node tools/check-canvas-paged-store.js`

Expected: both pass.

- [ ] **Step 2: Run the full suite**

Run: `npm run check`

Expected: exit code 0.

- [ ] **Step 3: Inspect the changed files**

Run: `git diff --check -- script.js styles.css tools/check-canvas-gallery-container-operations.js tools/check-canvas-gallery-container-ui.js`

Expected: exit code 0; line-ending warnings are acceptable, but no whitespace errors.
