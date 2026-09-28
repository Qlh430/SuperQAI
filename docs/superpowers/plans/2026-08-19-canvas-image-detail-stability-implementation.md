# Canvas Image Detail Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep already-clear canvas images sharp during movement, load originals from 100% zoom, and use actual on-screen node size to request originals below 100%.

**Architecture:** Extend the existing pure image-quality rule with current resource quality and displayed pixel size. The canvas renderer supplies those values, while the existing 300ms idle gate continues to prevent new original-image loads during active movement.

**Tech Stack:** Browser JavaScript, CommonJS rule module, Node.js assertion checks, existing `npm run check` pipeline.

## Global Constraints

- The global detail threshold is exactly `1` (100%).
- The size-based threshold uses the existing `THUMBNAIL_MAX_SIDE` value of 768px.
- Already-loaded originals remain original during interaction when they still meet original-demand conditions.
- New or thumbnail-only images do not begin original loads until 300ms of idle time.
- Off-screen images remain unloaded.
- `canvasForceOriginal`, download, editing, API inputs, and serialized image URLs remain unchanged.
- Preserve all unrelated existing worktree changes.

---

### Task 1: Make Canvas Detail Quality Sticky and Size-Aware

**Files:**
- Modify: `tools/check-image-loading-rules.js:4-32`
- Modify: `tools/check-global-image-demand-loading.js:58-64`
- Modify: `image-loading-rules.js:6-38`
- Modify: `script.js:11595-11642`

**Interfaces:**
- Consumes: `THUMBNAIL_MAX_SIDE`, `canvasState.scale`, node rendered width/height, `img.dataset.imageQuality`, and the existing `canvasDetailReady` idle state.
- Produces: `chooseCanvasImageQuality({ visible, scale, detailReady, currentQuality, displayedMaxSide }) -> "unloaded" | "thumbnail" | "original"`.

- [x] **Step 1: Write failing pure-rule checks**

Replace the existing detail assertions in `tools/check-image-loading-rules.js` with:

```js
assert.equal(rules.DETAIL_SCALE, 1);
assert.equal(rules.DETAIL_IDLE_MS, 300);
assert.equal(rules.THUMBNAIL_MAX_SIDE, 768);
assert.equal(rules.THUMBNAIL_QUALITY, 0.76);

assert.equal(
  rules.chooseCanvasImageQuality({
    visible: false,
    scale: 3,
    detailReady: true,
    currentQuality: "original",
    displayedMaxSide: 1200,
  }),
  "unloaded",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.99,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 700,
  }),
  "thumbnail",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 1,
    detailReady: false,
    currentQuality: "thumbnail",
    displayedMaxSide: 700,
  }),
  "thumbnail",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 1,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 700,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 1,
    detailReady: false,
    currentQuality: "original",
    displayedMaxSide: 700,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.8,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 769,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.8,
    detailReady: false,
    currentQuality: "original",
    displayedMaxSide: 769,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.8,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 768,
  }),
  "thumbnail",
);
```

- [x] **Step 2: Write failing canvas-wiring checks**

Add to `tools/check-global-image-demand-loading.js` after the existing `updateCanvasImageQualities` assertions:

```js
const canvasQualityFunction = extractFunction("updateCanvasImageQualities");
assert.match(canvasQualityFunction, /displayedMaxSide:\s*Math\.max\(width, height\) \* canvasState\.scale/);
assert.match(canvasQualityFunction, /currentQuality:\s*img\.dataset\.imageQuality/);
const viewportInteractionFunction = extractFunction("markCanvasViewportInteraction");
assert.doesNotMatch(viewportInteractionFunction, /canvasState\.scale < rules\.DETAIL_SCALE/);
```

- [x] **Step 3: Run focused checks and verify RED**

Run:

```powershell
node tools/check-image-loading-rules.js
node tools/check-global-image-demand-loading.js
```

Expected: the rule check fails because `DETAIL_SCALE` is still 1.6, and the wiring check fails because displayed size/current quality are not passed yet.

- [x] **Step 4: Implement the size-aware sticky quality rule**

In `image-loading-rules.js`, change the threshold and function to:

```js
const DETAIL_SCALE = 1;

function chooseCanvasImageQuality({ visible, scale, detailReady, currentQuality, displayedMaxSide }) {
  if (!visible) return "unloaded";
  const needsOriginal = Number(scale) >= DETAIL_SCALE
    || Number(displayedMaxSide) > THUMBNAIL_MAX_SIDE;
  if (!needsOriginal) return "thumbnail";
  return Boolean(detailReady) || currentQuality === "original" ? "original" : "thumbnail";
}
```

- [x] **Step 5: Supply displayed size and current quality from the canvas**

In `updateCanvasImageQualities()` within `script.js`, extend the rule input to:

```js
const quality = rules.chooseCanvasImageQuality({
  visible,
  scale: canvasState.scale,
  detailReady: canvasDetailReady,
  currentQuality: img.dataset.imageQuality,
  displayedMaxSide: Math.max(width, height) * canvasState.scale,
});
```

In `markCanvasViewportInteraction()`, keep the 300ms timer but remove both scale-only early exits:

```js
function markCanvasViewportInteraction() {
  const rules = window.ImageLoadingRules;
  canvasDetailReady = false;
  clearTimeout(canvasDetailTimer);
  canvasDetailTimer = 0;
  scheduleCanvasImageQualityUpdate();
  if (!rules) return;
  canvasDetailTimer = window.setTimeout(() => {
    canvasDetailTimer = 0;
    if (document.body.classList.contains("canvas-overlay-open")) return;
    canvasDetailReady = true;
    scheduleCanvasImageQualityUpdate();
  }, rules.DETAIL_IDLE_MS);
}
```

- [x] **Step 6: Run focused checks and syntax validation to verify GREEN**

Run:

```powershell
node tools/check-image-loading-rules.js
node tools/check-global-image-demand-loading.js
node --check image-loading-rules.js
node --check script.js
```

Expected: all four commands exit 0; focused outputs report that image-loading and global-demand checks passed.

- [x] **Step 7: Run the complete project verification**

Run:

```powershell
npm run check
```

Expected: exit 0 with the new behavior checks and all existing checks passing.

- [x] **Step 8: Inspect the scoped diff without staging unrelated work**

Run:

```powershell
git diff --check -- image-loading-rules.js script.js tools/check-image-loading-rules.js tools/check-global-image-demand-loading.js
git status --short -- image-loading-rules.js script.js tools/check-image-loading-rules.js tools/check-global-image-demand-loading.js
```

Expected: no whitespace errors. Because `script.js` and related files already contain user-owned uncommitted work, leave the verified implementation in place without broad staging or committing those files.

- [x] **Step 9: Bust the long-lived browser cache for the changed scripts**

Add index assertions to `tools/check-global-image-demand-loading.js`, verify they fail with the old cache keys, then update `index.html` to load:

```html
<script src="./image-loading-rules.js?v=20260819-detail-stability"></script>
<script src="./script.js?v=20260819-detail-stability&vh=20260812-video-history-gallery&mj=20260806-hd"></script>
```

Run the focused check and the complete project check again. Expected: both exit 0, and a normal page refresh receives the new script URLs despite the one-year static cache policy.
