# Canvas Gallery Aspect, Stack, and Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gallery covers follow the active image ratio, show up to five theme-aware layers, support cover-to-move gestures, and copy history images onto the canvas by dragging.

**Architecture:** Keep `galleryActiveImageId` as the source of truth and derive a CSS aspect-ratio variable from the active image's intrinsic dimensions. Separate cover gestures from history-image drag-copy gestures so moving the gallery can never create a copied image. Keep all behavior in the existing canvas module and extend its focused source-level regression check.

**Tech Stack:** Vanilla JavaScript, CSS custom properties, Node.js assertion checks, existing canvas persistence and Lucide icons.

## Global Constraints

- Keep the user-controlled gallery width and derive its media height from the active image ratio.
- Show at most five back layers.
- Moving the gallery starts after about 6px; a click without movement previews the active image.
- History drag always creates a new image node and never replaces an existing node.
- Theme colors must use `--accent` and `--accent-contrast`; do not hard-code purple.
- Do not stage or commit implementation files.

---

### Task 1: Lock the required behavior with regression checks

**Files:**
- Modify: `tools/check-canvas-gallery-history.js`

**Interfaces:**
- Consumes: source text from `script.js` and `styles.css`
- Produces: assertions for `syncCanvasGalleryAspectRatio`, five layers, cover movement, copy-only drop, and theme tokens

- [ ] **Step 1: Write failing assertions**

```js
const galleryRenderSource = extractFunction(SCRIPT_SOURCE, "renderCanvasGalleryImages");
const aspectSource = extractFunction(SCRIPT_SOURCE, "syncCanvasGalleryAspectRatio");
const coverGestureSource = extractFunction(SCRIPT_SOURCE, "bindCanvasGalleryCoverInteraction");
const dropSource = extractFunction(SCRIPT_SOURCE, "createCanvasImageFromGalleryDrop");

assert(galleryRenderSource.includes("Math.min(5"), "Gallery should render at most five back layers");
assert(galleryRenderSource.includes("syncCanvasGalleryAspectRatio"), "Cover load should sync the active image ratio");
assert(aspectSource.includes("--canvas-gallery-aspect-ratio"), "Active ratio should be exposed to CSS");
assert(coverGestureSource.includes("distance < 6"), "Cover movement should use a 6px activation threshold");
assert(coverGestureSource.includes("openCanvasGalleryPreview"), "A stationary cover click should preview");
assert(!dropSource.includes("replaceCanvasImageNode"), "History drag should never replace an existing image node");
assert.match(STYLE_SOURCE, /aspect-ratio:\s*var\(--canvas-gallery-aspect-ratio/);
assert.match(STYLE_SOURCE, /\.canvas-node-gallery\.canvas-gallery-frameless \.canvas-gallery-history-toggle b\s*\{[^}]*background:\s*var\(--accent\)/s);
assert(!STYLE_SOURCE.includes("rgba(124, 98, 244"), "Gallery history entry must not use a hard-coded purple shadow");
```

- [ ] **Step 2: Run the focused check and confirm failure**

Run: `node tools/check-canvas-gallery-history.js`

Expected: FAIL because the aspect-sync and cover-interaction functions do not exist yet.

### Task 2: Derive layout from the active image ratio

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Test: `tools/check-canvas-gallery-history.js`

**Interfaces:**
- Consumes: active `<img>` element and gallery node
- Produces: `syncCanvasGalleryAspectRatio(node, imageElement)` and `--canvas-gallery-aspect-ratio`

- [ ] **Step 1: Add the ratio synchronizer**

```js
function syncCanvasGalleryAspectRatio(node, imageElement) {
  const width = Number(imageElement?.naturalWidth || 0);
  const height = Number(imageElement?.naturalHeight || 0);
  if (!node || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  node.style.setProperty("--canvas-gallery-aspect-ratio", String(ratio));
  node.dataset.galleryAspectRatio = String(ratio);
  delete node.dataset.height;
  node.style.removeProperty("--canvas-node-media-height");
  scheduleCanvasConnectionRender({ trailing: false });
  scheduleCanvasSave();
  return true;
}
```

- [ ] **Step 2: Call it on cover load and cached image completion**

```js
const syncAspect = () => syncCanvasGalleryAspectRatio(node, image);
image.addEventListener("load", syncAspect, { once: true });
if (image.complete) syncAspect();
```

- [ ] **Step 3: Lock gallery resize to width-derived height**

In `beginCanvasNodeResize`, ignore vertical resize for gallery nodes and remove saved gallery height:

```js
if (node.classList.contains("canvas-node-gallery")) {
  delete node.dataset.height;
  node.style.removeProperty("--canvas-node-media-height");
} else {
  node.dataset.height = String(Math.round(height));
}
```

- [ ] **Step 4: Make CSS use the derived ratio**

```css
.canvas-node-gallery.canvas-gallery-frameless > .canvas-gallery-stack {
  height: auto;
  min-height: 0;
  aspect-ratio: var(--canvas-gallery-aspect-ratio, 1);
}

.canvas-node-gallery.canvas-gallery-frameless .canvas-gallery-cover img {
  object-fit: contain;
}
```

- [ ] **Step 5: Run the focused check**

Run: `node tools/check-canvas-gallery-history.js`

Expected: ratio assertions pass; later gesture/style assertions may still fail.

### Task 3: Render five visible theme-aware layers and compact history entry

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Test: `tools/check-canvas-gallery-history.js`

**Interfaces:**
- Consumes: gallery image count and `--gallery-stack-layer`
- Produces: up to five visual back layers and a compact themed history control

- [ ] **Step 1: Increase the rendered layer cap**

```js
const layerCount = Math.min(5, Math.max(0, images.length - 1));
```

- [ ] **Step 2: Strengthen layer separation**

```css
.canvas-node-gallery.canvas-gallery-frameless .canvas-gallery-stack-layer {
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--line));
  transform:
    translate(calc(var(--gallery-stack-layer) * 6px), calc(var(--gallery-stack-layer) * 6px))
    scale(calc(1 - var(--gallery-stack-layer) * 0.006));
  transform-origin: top left;
}
```

- [ ] **Step 3: Compact and theme the history entry**

```css
.canvas-node-gallery.canvas-gallery-frameless .canvas-gallery-history-toggle {
  right: -8px;
  bottom: 12px;
  width: 42px;
  min-width: 42px;
  height: 42px;
  border-color: color-mix(in srgb, var(--accent) 34%, var(--line));
  border-radius: 14px;
}

.canvas-node-gallery.canvas-gallery-frameless .canvas-gallery-history-toggle b {
  min-width: 19px;
  height: 19px;
  background: var(--accent);
  color: var(--accent-contrast, #202020);
  box-shadow: 0 4px 10px color-mix(in srgb, var(--accent) 34%, transparent);
}
```

- [ ] **Step 4: Run the focused check**

Run: `node tools/check-canvas-gallery-history.js`

Expected: five-layer and theme-token assertions pass.

### Task 4: Separate cover movement from history drag-copy

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Test: `tools/check-canvas-gallery-history.js`

**Interfaces:**
- Consumes: cover pointer events, gallery node selection, history image payload
- Produces: `bindCanvasGalleryCoverInteraction(cover, node, index)` and copy-only history drop

- [ ] **Step 1: Bind the cover to node movement**

Create `bindCanvasGalleryCoverInteraction` with these exact states:

```js
let start = null;
let moved = false;
let suppressClick = false;
```

On pointer movement, return while `distance < 6`; after activation update all selected node `dataset.x` and `dataset.y` values using `canvasState.scale`. On pointer release, save moved positions. On click, consume `suppressClick` after a drag; otherwise call `openCanvasGalleryPreview(node, index)`.

- [ ] **Step 2: Use the cover binding instead of image-copy binding**

```js
bindCanvasGalleryCoverInteraction(cover, node, Number(cover.dataset.galleryIndex));
```

- [ ] **Step 3: Restrict history drag release to the canvas**

```js
function isCanvasClientPoint(clientX, clientY) {
  const viewport = document.querySelector("#infiniteCanvas");
  const rect = viewport?.getBoundingClientRect();
  return Boolean(rect
    && clientX >= rect.left && clientX <= rect.right
    && clientY >= rect.top && clientY <= rect.bottom);
}
```

The history handler calls `createCanvasImageFromGalleryDrop` only when movement occurred, the point is inside the canvas, and the release point is outside the source gallery/history panel.

- [ ] **Step 4: Make drop copy-only**

```js
const node = addCanvasImage(src, image.name || "图集图片", point);
node.dataset.imageSrc = src;
setCanvasStatus("已从图集复制为图片节点。");
```

Remove the target lookup and `replaceCanvasImageNode` branch from `createCanvasImageFromGalleryDrop`.

- [ ] **Step 5: Add drag affordance**

```css
.canvas-gallery-history-select {
  cursor: grab;
}

.canvas-gallery-history-item.is-dragging .canvas-gallery-history-select {
  cursor: grabbing;
}
```

- [ ] **Step 6: Run the focused check**

Run: `node tools/check-canvas-gallery-history.js`

Expected: PASS with `Canvas gallery history checks passed.`

### Task 5: Full verification and visual QA

**Files:**
- Modify if needed: `script.js`, `styles.css`, `tools/check-canvas-gallery-history.js`

**Interfaces:**
- Consumes: completed gallery behavior
- Produces: passing project checks and visual evidence

- [ ] **Step 1: Run syntax and full regression checks**

Run: `npm run check`

Expected: exit code 0 and all existing check scripts pass.

- [ ] **Step 2: Verify in the running canvas**

Use a gallery with square, landscape, and portrait history images. Confirm:

```text
square cover remains square
switching active history image updates the cover ratio
six or more images show five back layers
cover drag moves the gallery without preview
cover click opens preview
history badge follows the active theme
history drag creates a separate image node without changing the active image
```

- [ ] **Step 3: Inspect the working tree**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; only intended working-tree files are modified. Do not stage or commit them.
