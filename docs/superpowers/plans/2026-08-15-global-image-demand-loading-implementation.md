# Global Image Demand Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all image-heavy lists and the infinite canvas load lightweight thumbnails first, promote only explicitly viewed canvas images to originals at 160%/300ms, and remove canvas-only lightbox interactions.

**Architecture:** Add a small pure rule module, a persistent thumbnail registry/store on the existing Node server, and a browser image-resource manager backed by a one-at-a-time thumbnail Worker. Existing original URL fields remain canonical; history lists use intersection-based thumbnails while the canvas uses coordinate-based visibility and a delayed detail-quality controller. Canvas viewport writes are animation-frame coalesced and saved without producing content undo snapshots.

**Tech Stack:** Node.js 18+, CommonJS, browser JavaScript, Web Worker, `createImageBitmap`, `OffscreenCanvas`, `IntersectionObserver`, existing HTML/CSS/Node regression checks.

## Global Constraints

- Thumbnail longest side is exactly `768px`; output format is WebP at quality `0.76`.
- Canvas detail promotion requires `scale >= 1.6` and `300ms` without pan/zoom input.
- Thumbnail generation concurrency is exactly one; original canvas promotion concurrency is at most two.
- Original URLs remain the only values used by download, crop, mask, connection output, serialization, and generation requests.
- Do not preload original images for closed panels or offscreen items.
- Do not add native image-processing dependencies; keep the portable Windows package compatible.
- Preserve existing user changes in `index.html`, `script.js`, `server.js`, `styles.css`, and `package.json`; edit only feature-related regions.

## File Structure

- Create `image-loading-rules.js`: pure geometry and quality-selection rules shared by browser code and Node tests.
- Create `image-thumbnail-store.js`: safe persistent registry and `output/thumbnails/` storage primitives.
- Create `image-resource-manager.js`: intersection observation, thumbnail lookup/generation queue, canvas original queue, and element lifecycle.
- Create `image-thumbnail-worker.js`: one-image decode/downscale/WebP conversion worker.
- Create `tools/check-image-loading-rules.js`: deterministic rule tests.
- Create `tools/check-image-thumbnail-store.js`: filesystem safety, deduplication, and registry recovery tests.
- Create `tools/check-image-resource-manager.js`: static contract checks for deferred loading and queue limits.
- Create `tools/check-global-image-demand-loading.js`: integration regression checks across history, canvas, preview removal, and viewport saving.
- Modify `server.js`: thumbnail API routes and safe nested `/output/` serving.
- Modify `script.js`: resource-manager setup and integration into history, chat, canvas, refs, and viewport behavior.
- Modify `styles.css`: unloaded/loading/error image states and stable placeholders.
- Modify `index.html`: load the three browser modules before `script.js` and update cache keys.
- Modify `package.json`: include all new checks in `npm run check`.

---

### Task 1: Pure image-loading rules

**Files:**
- Create: `image-loading-rules.js`
- Create: `tools/check-image-loading-rules.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `ImageLoadingRules.DETAIL_SCALE`, `DETAIL_IDLE_MS`, `THUMBNAIL_MAX_SIDE`, `THUMBNAIL_QUALITY`, `getCanvasVisibleRect(viewport, transform, margin)`, `rectsIntersect(a, b)`, `chooseCanvasImageQuality(input)`, and `shouldGenerateThumbnail(metadata)`.
- Consumes: no project globals.

- [ ] **Step 1: Write the failing rule test**

```js
const assert = require("assert");
const rules = require("../image-loading-rules");

assert.equal(rules.DETAIL_SCALE, 1.6);
assert.equal(rules.DETAIL_IDLE_MS, 300);
assert.deepEqual(
  rules.getCanvasVisibleRect({ width: 1000, height: 600 }, { x: 100, y: 50, scale: 2 }, 0),
  { left: -50, top: -25, right: 450, bottom: 275 },
);
assert.equal(rules.rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 9, top: 9, right: 20, bottom: 20 }), true);
assert.equal(rules.chooseCanvasImageQuality({ visible: false, scale: 3, detailReady: true }), "unloaded");
assert.equal(rules.chooseCanvasImageQuality({ visible: true, scale: 1.59, detailReady: true }), "thumbnail");
assert.equal(rules.chooseCanvasImageQuality({ visible: true, scale: 1.6, detailReady: false }), "thumbnail");
assert.equal(rules.chooseCanvasImageQuality({ visible: true, scale: 1.6, detailReady: true }), "original");
assert.equal(rules.shouldGenerateThumbnail({ width: 1200, height: 900, bytes: 800000 }), false);
assert.equal(rules.shouldGenerateThumbnail({ width: 2400, height: 900, bytes: 800000 }), true);
assert.equal(rules.shouldGenerateThumbnail({ width: 1200, height: 900, bytes: 2000000 }), true);
console.log("Image loading rule checks passed.");
```

- [ ] **Step 2: Run the rule test and verify failure**

Run: `node tools/check-image-loading-rules.js`

Expected: FAIL with `Cannot find module '../image-loading-rules'`.

- [ ] **Step 3: Implement the pure rule module**

```js
(function initImageLoadingRules(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ImageLoadingRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DETAIL_SCALE = 1.6;
  const DETAIL_IDLE_MS = 300;
  const THUMBNAIL_MAX_SIDE = 768;
  const THUMBNAIL_QUALITY = 0.76;

  function getCanvasVisibleRect(viewport, transform, margin = 240) {
    const scale = Math.max(0.01, Number(transform?.scale) || 1);
    const left = (-Number(transform?.x || 0)) / scale;
    const top = (-Number(transform?.y || 0)) / scale;
    const pad = Math.max(0, Number(margin) || 0) / scale;
    return {
      left: left - pad,
      top: top - pad,
      right: left + Math.max(0, Number(viewport?.width) || 0) / scale + pad,
      bottom: top + Math.max(0, Number(viewport?.height) || 0) / scale + pad,
    };
  }

  function rectsIntersect(a, b) {
    return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  }

  function chooseCanvasImageQuality({ visible, scale, detailReady }) {
    if (!visible) return "unloaded";
    return Number(scale) >= DETAIL_SCALE && detailReady ? "original" : "thumbnail";
  }

  function shouldGenerateThumbnail({ width, height, bytes }) {
    return Math.max(Number(width) || 0, Number(height) || 0) > 1600 || Number(bytes) > 1024 * 1024;
  }

  return { DETAIL_SCALE, DETAIL_IDLE_MS, THUMBNAIL_MAX_SIDE, THUMBNAIL_QUALITY, getCanvasVisibleRect, rectsIntersect, chooseCanvasImageQuality, shouldGenerateThumbnail };
});
```

- [ ] **Step 4: Wire and run the rule test**

Append `node tools/check-image-loading-rules.js` to the existing `check` script without removing any current checks.

Run: `node tools/check-image-loading-rules.js`

Expected: `Image loading rule checks passed.`

- [ ] **Step 5: Commit the rule unit**

```powershell
git add -- image-loading-rules.js tools/check-image-loading-rules.js package.json
git commit -m "test: define image demand loading rules"
```

### Task 2: Persistent thumbnail store and API

**Files:**
- Create: `image-thumbnail-store.js`
- Create: `tools/check-image-thumbnail-store.js`
- Modify: `server.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createThumbnailStore({ outputDir, dataFile, maxBytes })`.
- Produces: `store.lookup(source)`, `store.save({ source, buffer, mimeType, width, height, lightweight })`, `store.getFilePath(urlPath)`, `GET /api/image-thumbnails?source=...`, and `POST /api/image-thumbnails`.

- [ ] **Step 1: Write the failing store test**

Create a temporary directory under `tmp/check-image-thumbnails`, initialize the store, and assert:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createThumbnailStore, stableThumbnailKey } = require("../image-thumbnail-store");

const root = path.resolve(__dirname, "..", "tmp", "check-image-thumbnails");
fs.rmSync(root, { recursive: true, force: true });
const store = createThumbnailStore({
  outputDir: path.join(root, "output"),
  dataFile: path.join(root, "data", "image-thumbnails.json"),
  maxBytes: 2 * 1024 * 1024,
});
assert.equal(stableThumbnailKey("/output/a.png"), stableThumbnailKey("/output/a.png"));
assert.equal(store.lookup("/output/a.png"), null);
const saved = store.save({ source: "/output/a.png", buffer: Buffer.from("RIFFfakeWEBP"), mimeType: "image/webp", width: 768, height: 512 });
assert.match(saved.thumbnailUrl, /^\/output\/thumbnails\/[a-f0-9]{32}\.webp$/);
assert.equal(store.lookup("/output/a.png").thumbnailUrl, saved.thumbnailUrl);
assert.throws(() => store.save({ source: "../secret", buffer: Buffer.alloc(1), mimeType: "image/webp" }), /source/i);
assert.throws(() => store.save({ source: "/output/b.png", buffer: Buffer.alloc(3 * 1024 * 1024), mimeType: "image/webp" }), /large/i);
fs.writeFileSync(path.join(root, "data", "image-thumbnails.json"), "not-json");
const recovered = createThumbnailStore({ outputDir: path.join(root, "output"), dataFile: path.join(root, "data", "image-thumbnails.json") });
assert.equal(recovered.lookup("/output/a.png"), null);
fs.rmSync(root, { recursive: true, force: true });
console.log("Image thumbnail store checks passed.");
```

- [ ] **Step 2: Run the store test and verify failure**

Run: `node tools/check-image-thumbnail-store.js`

Expected: FAIL with `Cannot find module '../image-thumbnail-store'`.

- [ ] **Step 3: Implement the thumbnail store**

Implement `stableThumbnailKey(source)` using SHA-256 truncated to 32 lowercase hex characters. `createThumbnailStore` must:

```js
function normalizeSource(source) {
  const value = String(source || "").trim();
  if (!value || value.includes("\0") || value.startsWith("../") || value.startsWith("..\\")) throw new Error("Invalid thumbnail source.");
  return value;
}

function save({ source, buffer, mimeType, width = 0, height = 0, lightweight = false }) {
  const normalized = normalizeSource(source);
  if (lightweight) return persist(normalized, { source: normalized, thumbnailUrl: normalized, width, height, lightweight: true, updatedAt: Date.now() });
  if (!["image/webp", "image/jpeg"].includes(mimeType)) throw new Error("Unsupported thumbnail type.");
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxBytes) throw new Error("Thumbnail is empty or too large.");
  const extension = mimeType === "image/jpeg" ? ".jpg" : ".webp";
  const filename = `${stableThumbnailKey(normalized)}${extension}`;
  fs.writeFileSync(path.join(thumbnailsDir, filename), buffer);
  return persist(normalized, { source: normalized, thumbnailUrl: `/output/thumbnails/${filename}`, width: Number(width) || 0, height: Number(height) || 0, lightweight: false, updatedAt: Date.now() });
}
```

Registry writes must use a temporary sibling file plus `fs.renameSync`. `lookup` must remove stale non-lightweight entries whose files no longer exist.

- [ ] **Step 4: Add server routes and safe nested output serving**

At server startup create:

```js
const THUMBNAIL_REGISTRY_FILE = path.join(DATA_DIR, "image-thumbnails.json");
const thumbnailStore = createThumbnailStore({ outputDir: OUTPUT_DIR, dataFile: THUMBNAIL_REGISTRY_FILE, maxBytes: 2 * 1024 * 1024 });
```

Route before the generic GET fallback:

```js
if (req.url.startsWith("/api/image-thumbnails")) {
  await handleImageThumbnails(req, res);
  return;
}
```

`GET` decodes the `source` query and returns `{ item: thumbnailStore.lookup(source) }`. `POST` reads at most 2MB, reads `X-Source-Url`, `X-Image-Width`, `X-Image-Height`, and `X-Thumbnail-Lightweight`, then returns `{ item: thumbnailStore.save(...) }`. Reject other methods with 405.

Replace basename-only output resolution with:

```js
function resolveOutputPath(urlPath) {
  const relative = decodeURIComponent(String(urlPath || "").replace(/^\/output\//, "")).replace(/\\/g, "/");
  const filePath = path.resolve(OUTPUT_DIR, relative);
  const prefix = `${path.resolve(OUTPUT_DIR)}${path.sep}`;
  return filePath.startsWith(prefix) ? filePath : "";
}
```

`serveOutput` must call `resolveOutputPath` and return 403 when it returns an empty string.

- [ ] **Step 5: Run store, syntax, and existing server checks**

Run:

```powershell
node tools/check-image-thumbnail-store.js
node --check image-thumbnail-store.js
node --check server.js
```

Expected: store check passes and both syntax checks exit 0.

- [ ] **Step 6: Commit the server unit**

```powershell
git add -- image-thumbnail-store.js tools/check-image-thumbnail-store.js server.js package.json
git commit -m "feat: persist generated image thumbnails"
```

### Task 3: Browser image resource manager and Worker

**Files:**
- Create: `image-resource-manager.js`
- Create: `image-thumbnail-worker.js`
- Create: `tools/check-image-resource-manager.js`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.ImageLoadingRules` and `/api/image-thumbnails`.
- Produces: global `window.imageResources` with `observe(img, source, options)`, `requestThumbnail(source)`, `showThumbnail(img)`, `showOriginal(img)`, `unload(img)`, `registerCanvasImage(img, source)`, and `disconnect(root)`.

- [ ] **Step 1: Write the failing browser-contract check**

Read the three browser files as text and assert:

```js
assert.match(manager, /class ImageResourceManager/);
assert.match(manager, /new IntersectionObserver/);
assert.match(manager, /thumbnailConcurrency\s*=\s*1/);
assert.match(manager, /originalConcurrency\s*=\s*2/);
assert.match(manager, /data-original-src/);
assert.match(manager, /showThumbnail\(img\)/);
assert.match(manager, /showOriginal\(img\)/);
assert.match(worker, /createImageBitmap/);
assert.match(worker, /OffscreenCanvas/);
assert.match(worker, /convertToBlob\(\{\s*type:\s*"image\/webp",\s*quality/);
assert.match(html, /image-loading-rules\.js[^>]*><\/script>[\s\S]*image-resource-manager\.js[^>]*><\/script>[\s\S]*script\.js/);
```

- [ ] **Step 2: Run the contract check and verify failure**

Run: `node tools/check-image-resource-manager.js`

Expected: FAIL because the manager and Worker files do not exist.

- [ ] **Step 3: Implement the thumbnail Worker**

The Worker receives `{ id, source, maxSide, quality }`, fetches the source with `cache: "force-cache"`, creates a bitmap, and posts either a lightweight result or a WebP Blob:

```js
self.onmessage = async (event) => {
  const { id, source, maxSide = 768, quality = 0.76 } = event.data || {};
  try {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    if (Math.max(width, height) <= 1600 && blob.size <= 1024 * 1024) {
      bitmap.close();
      self.postMessage({ id, source, width, height, bytes: blob.size, lightweight: true });
      return;
    }
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    canvas.getContext("2d", { alpha: true }).drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();
    const thumbnail = await canvas.convertToBlob({ type: "image/webp", quality });
    self.postMessage({ id, source, width, height, bytes: blob.size, lightweight: false, thumbnail });
  } catch (error) {
    self.postMessage({ id, source, error: error?.message || String(error) });
  }
};
```

- [ ] **Step 4: Implement the resource manager**

Use one `IntersectionObserver` with `rootMargin: "300px"`, a lookup Promise map keyed by original URL, a FIFO thumbnail queue with one active Worker job, and a FIFO original queue with two active image loads. Important behavior:

```js
observe(img, source, options = {}) {
  img.removeAttribute("src");
  img.setAttribute("data-original-src", source);
  img.dataset.imageQuality = "unloaded";
  img.classList.add("deferred-image");
  this.options.set(img, { unload: options.unload !== false, maxQuality: options.maxQuality || "thumbnail" });
  this.observer.observe(img);
  return img;
}

registerCanvasImage(img, source) {
  img.removeAttribute("src");
  img.setAttribute("data-original-src", source);
  img.setAttribute("data-canvas-original-src", source);
  img.dataset.imageQuality = "unloaded";
  img.dataset.requestedQuality = "unloaded";
  img.classList.add("deferred-image");
  this.options.set(img, { unload: true, maxQuality: "original", canvas: true });
  return img;
}

showThumbnail(img) {
  const source = img.getAttribute("data-original-src") || "";
  img.dataset.requestedQuality = "thumbnail";
  return this.requestThumbnail(source).then((item) => {
    if (!img.isConnected || img.dataset.requestedQuality !== "thumbnail") return;
    img.src = item?.thumbnailUrl || "";
    img.dataset.imageQuality = item?.thumbnailUrl ? "thumbnail" : "error";
  });
}

showOriginal(img) {
  const source = img.getAttribute("data-original-src") || "";
  img.dataset.requestedQuality = "original";
  return this.enqueueOriginal(img, source);
}

unload(img) {
  img.dataset.requestedQuality = "unloaded";
  img.removeAttribute("src");
  img.dataset.imageQuality = "unloaded";
}

disconnect(root) {
  root?.querySelectorAll?.("img[data-original-src]").forEach((img) => {
    this.observer.unobserve(img);
    this.options.delete(img);
    this.unload(img);
  });
}
```

The manager must merge duplicate lookup/generation Promises, apply a 60-second failure backoff, upload Worker results to `POST /api/image-thumbnails`, and expose `window.imageResources = new ImageResourceManager()`.

- [ ] **Step 5: Load browser modules before the main script**

Add before `script.js`:

```html
<script src="./image-loading-rules.js?v=20260815-demand-loading"></script>
<script src="./image-resource-manager.js?v=20260815-demand-loading"></script>
```

The Worker is loaded dynamically from `./image-thumbnail-worker.js?v=20260815-demand-loading`.

- [ ] **Step 6: Run manager contract and syntax checks**

Run:

```powershell
node tools/check-image-resource-manager.js
node --check image-resource-manager.js
node --check image-thumbnail-worker.js
```

Expected: contract check passes and both syntax checks exit 0.

- [ ] **Step 7: Commit the browser resource unit**

```powershell
git add -- image-resource-manager.js image-thumbnail-worker.js tools/check-image-resource-manager.js index.html package.json
git commit -m "feat: add deferred image resource manager"
```

### Task 4: History, board preview, chat, and reference integration

**Files:**
- Modify: `script.js`
- Create: `tools/check-global-image-demand-loading.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.imageResources.observe(img, originalUrl, { unload, maxQuality })`.
- Produces: `createDeferredThumbnail(source, alt, options)` and thumbnail-only history/list rendering.

- [ ] **Step 1: Write failing integration assertions**

The check must extract the named functions and assert:

```js
assert.match(extractFunction("createDeferredThumbnail"), /imageResources\.observe/);
assert.doesNotMatch(extractFunction("renderImageHistory"), /<img\s+src=/);
assert.match(extractFunction("renderImageHistory"), /createDeferredThumbnail/);
assert.doesNotMatch(extractFunction("renderUnifiedHistory"), /<img\s+src=/);
assert.match(extractFunction("renderUnifiedHistory"), /createDeferredThumbnail/);
assert.doesNotMatch(extractFunction("createCanvasBoardPreview"), /img\.src\s*=\s*image/);
assert.match(extractFunction("createCanvasBoardPreview"), /createDeferredThumbnail/);
assert.match(extractFunction("addMessage"), /createDeferredThumbnail/);
assert.match(extractFunction("updateCanvasNodeRefs"), /createDeferredThumbnail/);
```

- [ ] **Step 2: Run the integration check and verify failure**

Run: `node tools/check-global-image-demand-loading.js`

Expected: FAIL because `createDeferredThumbnail` and integrations are absent.

- [ ] **Step 3: Add the shared DOM helper**

```js
function createDeferredThumbnail(source, alt = "", options = {}) {
  const img = document.createElement("img");
  img.alt = alt;
  img.draggable = options.draggable === true;
  if (source && window.imageResources) window.imageResources.observe(img, source, { unload: options.unload !== false, maxQuality: "thumbnail" });
  else if (source) {
    img.loading = "lazy";
    img.decoding = "async";
    img.src = source;
  }
  return img;
}
```

- [ ] **Step 4: Convert all list and small-card renderers**

Replace direct original `src` writes in these functions with `createDeferredThumbnail`:

- `renderImageHistory`
- `renderUnifiedHistory`
- `createCanvasBoardPreview`
- `renderCanvasGalleryHistory`
- `updateCanvasNodeRefs`
- `renderCanvasLlmImages`
- `renderCanvasMinimaxH3References`
- `addMessage`

Keep each original URL in closures and dataset fields. History clicks must continue to call `renderImages(record.images, ...)` or the appropriate main renderer, so the explicitly opened main workspace loads originals.

- [ ] **Step 5: Run integration and affected existing checks**

Run:

```powershell
node tools/check-global-image-demand-loading.js
node tools/check-image-history-management.js
node tools/check-canvas-gallery-history.js
node tools/check-minimax-h3-video.js
node --check script.js
```

Expected: every check exits 0.

- [ ] **Step 6: Commit the history/list integration**

```powershell
git add -- script.js tools/check-global-image-demand-loading.js package.json
git commit -m "perf: defer history and reference images"
```

### Task 5: Canvas visibility, detail promotion, and preview removal

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-global-image-demand-loading.js`

**Interfaces:**
- Consumes: `ImageLoadingRules.getCanvasVisibleRect`, `rectsIntersect`, `chooseCanvasImageQuality`, and `imageResources.registerCanvasImage/showThumbnail/showOriginal/unload`.
- Produces: `registerCanvasDetailImage(img, source)`, `scheduleCanvasImageQualityUpdate(options)`, `updateCanvasImageQualities()`, and `markCanvasViewportInteraction()`.

- [ ] **Step 1: Extend failing canvas assertions**

```js
assert.match(extractFunction("registerCanvasDetailImage"), /registerCanvasImage/);
assert.match(extractFunction("updateCanvasImageQualities"), /getCanvasVisibleRect/);
assert.match(extractFunction("updateCanvasImageQualities"), /chooseCanvasImageQuality/);
assert.match(extractFunction("markCanvasViewportInteraction"), /DETAIL_IDLE_MS/);
assert.doesNotMatch(extractFunction("renderCanvasImageNode"), /addEventListener\("click",\s*\(\)\s*=>\s*openPreview/);
assert.doesNotMatch(extractFunction("updateCanvasGenerationResult"), /openPreview/);
assert.doesNotMatch(extractFunction("bindCanvasGalleryCoverInteraction"), /openCanvasGalleryPreview/);
assert.doesNotMatch(extractFunction("renderCanvasGalleryHistory"), /canvas-gallery-history-preview/);
```

- [ ] **Step 2: Run the integration check and verify failure**

Run: `node tools/check-global-image-demand-loading.js`

Expected: FAIL on missing canvas quality functions and remaining preview hooks.

- [ ] **Step 3: Register detail-capable canvas images**

```js
function registerCanvasDetailImage(img, source) {
  if (!img || !source) return img;
  img.alt ||= "画布图片";
  img.draggable = false;
  if (window.imageResources) window.imageResources.registerCanvasImage(img, source);
  else {
    img.loading = "lazy";
    img.decoding = "async";
    img.src = source;
  }
  scheduleCanvasImageQualityUpdate();
  return img;
}
```

Use this helper for ordinary canvas input images, legacy result images, generated result images, and the active gallery cover. Keep history-panel and reference images on `createDeferredThumbnail`, because they must never promote in place.

- [ ] **Step 4: Implement coordinate-based quality updates**

Use the viewport dimensions and node datasets:

```js
function updateCanvasImageQualities() {
  canvasImageQualityFrame = 0;
  const viewport = document.querySelector("#infiniteCanvas");
  if (!viewport || !document.querySelector("#canvasView.active")) return;
  const visibleRect = ImageLoadingRules.getCanvasVisibleRect(
    { width: viewport.clientWidth, height: viewport.clientHeight },
    canvasState,
    280,
  );
  document.querySelectorAll("#canvasPlane img[data-canvas-original-src]").forEach((img) => {
    const node = img.closest(".canvas-node");
    if (!node) return;
    const x = Number(node.dataset.x || 0);
    const y = Number(node.dataset.y || 0);
    const width = Number(node.dataset.width || node.offsetWidth || 320);
    const height = Number(node.dataset.height || node.offsetHeight || 320);
    const visible = ImageLoadingRules.rectsIntersect(visibleRect, { left: x, top: y, right: x + width, bottom: y + height });
    const quality = ImageLoadingRules.chooseCanvasImageQuality({ visible, scale: canvasState.scale, detailReady: canvasDetailReady });
    if (quality === "original") window.imageResources?.showOriginal(img);
    else if (quality === "thumbnail") window.imageResources?.showThumbnail(img);
    else window.imageResources?.unload(img);
  });
}
```

Reads of `offsetWidth/offsetHeight` are fallbacks only; cache measured dimensions into node datasets from the existing ResizeObserver to avoid repeated layout work.

- [ ] **Step 5: Add the 300ms detail timer and lifecycle calls**

`markCanvasViewportInteraction()` sets `canvasDetailReady = false`, immediately schedules thumbnail/unload updates, clears the previous timer, and sets a new timer using `ImageLoadingRules.DETAIL_IDLE_MS`. On timer completion it confirms `canvasState.scale >= 1.6`, sets `canvasDetailReady = true`, and schedules another update.

Call it from wheel, pan move, reset, board restore, tool activation, and node placement. Clear timers and unload canvas originals when leaving the canvas tool or clearing the plane.

- [ ] **Step 6: Remove canvas-only preview behavior**

- Delete click-to-`openPreview` handlers from normal canvas result images.
- Make gallery cover click only select the node after drag-threshold handling.
- Remove the gallery-history expand button and its handler.
- Keep downloads, cropping, masking, double-click replacement, online image preview, and non-canvas lightbox behavior.

- [ ] **Step 7: Add stable deferred-image styles**

```css
.deferred-image:not([src]),
.deferred-image[data-image-quality="unloaded"],
.deferred-image[data-image-quality="loading"] {
  background: color-mix(in srgb, var(--surface, #f4f4f4) 88%, transparent);
}

.deferred-image[data-image-quality="error"] {
  opacity: 0.55;
}

#canvasPlane img[data-canvas-original-src] {
  contain: paint;
  content-visibility: auto;
}
```

- [ ] **Step 8: Run canvas integration and existing gallery checks**

Run:

```powershell
node tools/check-global-image-demand-loading.js
node tools/check-canvas-gallery-history.js
node tools/check-canvas-gallery-grid-slicing.js
node tools/check-image-preview-presentation.js
node --check script.js
```

Expected: all checks pass; the general image preview check confirms non-canvas previews remain.

- [ ] **Step 9: Commit the canvas image controller**

```powershell
git add -- script.js styles.css tools/check-global-image-demand-loading.js
git commit -m "perf: virtualize canvas image quality"
```

### Task 6: Animation-frame viewport updates and lightweight saving

**Files:**
- Modify: `script.js`
- Modify: `tools/check-global-image-demand-loading.js`

**Interfaces:**
- Consumes: `applyCanvasTransformNow()` and `markCanvasViewportInteraction()` from Task 5.
- Produces: `scheduleCanvasTransform()`, `scheduleCanvasViewportSave()`, and viewport changes that do not call `recordCanvasUndoCheckpoint()`.

- [ ] **Step 1: Add failing viewport assertions**

```js
const wheelBlock = extractBlock('viewport.addEventListener("wheel"');
assert.match(wheelBlock, /scheduleCanvasTransform\(\)/);
assert.match(wheelBlock, /scheduleCanvasViewportSave\(\)/);
assert.doesNotMatch(wheelBlock, /scheduleCanvasSave\(\)/);
assert.match(extractFunction("scheduleCanvasTransform"), /requestAnimationFrame/);
assert.match(extractFunction("scheduleCanvasViewportSave"), /saveCanvasBoardNow/);
assert.doesNotMatch(extractFunction("scheduleCanvasViewportSave"), /recordCanvasUndoCheckpoint/);
assert.doesNotMatch(extractFunction("beginCanvasPan"), /scheduleCanvasSave\(\)/);
```

- [ ] **Step 2: Run the integration check and verify failure**

Run: `node tools/check-global-image-demand-loading.js`

Expected: FAIL because wheel and pan still use the generic content-save path.

- [ ] **Step 3: Split immediate transform from scheduling**

Rename the current DOM-writing body to `applyCanvasTransformNow()` and add:

```js
function scheduleCanvasTransform() {
  if (canvasTransformFrame) return;
  canvasTransformFrame = requestAnimationFrame(() => {
    canvasTransformFrame = 0;
    applyCanvasTransformNow();
    scheduleCanvasImageQualityUpdate();
  });
}

function applyCanvasTransform() {
  scheduleCanvasTransform();
}
```

Use `applyCanvasTransformNow()` only for initial restore/reset paths that require synchronous state before the next operation.

- [ ] **Step 4: Add viewport-only persistence**

```js
function scheduleCanvasViewportSave() {
  if (canvasState.isRestoring) return;
  canvasState.hasUnsavedChanges = true;
  clearTimeout(canvasViewportSaveTimer);
  canvasViewportSaveTimer = setTimeout(() => {
    canvasViewportSaveTimer = 0;
    saveCanvasBoardNow();
  }, 300);
}
```

This function must not call `recordCanvasUndoCheckpoint`. Wheel input calls it after updating state. Pan calls it once on pointerup. The wheel handler calls `markCanvasViewportInteraction()` and `scheduleCanvasTransform()`; it never calls `scheduleCanvasSave()`.

- [ ] **Step 5: Run focused and full syntax checks**

Run:

```powershell
node tools/check-global-image-demand-loading.js
node tools/check-canvas-shell-history-theme.js
node --check script.js
```

Expected: all checks pass.

- [ ] **Step 6: Commit the viewport performance unit**

```powershell
git add -- script.js tools/check-global-image-demand-loading.js
git commit -m "perf: coalesce canvas viewport updates"
```

### Task 7: Full verification, cache keys, and portable-package guard

**Files:**
- Modify: `index.html`
- Modify: `package.json`
- Modify: `tools/check-global-image-demand-loading.js`
- Verify: `build-portable.bat`
- Verify: `tools/check-portable-package.js`

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: final cache-busted application and regression coverage included in `npm run check`.

- [ ] **Step 1: Finalize cache keys and asset checks**

Set CSS and main script cache keys to include `20260815-demand-loading`. Assert that `index.html` loads, in order:

```text
image-loading-rules.js
image-resource-manager.js
script.js
```

Extend the portable-package checker/build file list if it enumerates JavaScript assets so it includes:

```text
image-loading-rules.js
image-resource-manager.js
image-thumbnail-worker.js
image-thumbnail-store.js
```

- [ ] **Step 2: Run all deterministic checks**

Run: `npm run check`

Expected: exit 0 and all existing plus four new image-demand-loading checks pass.

- [ ] **Step 3: Inspect the exact diff and preserve unrelated changes**

Run:

```powershell
git diff --check
git diff -- image-loading-rules.js image-thumbnail-store.js image-resource-manager.js image-thumbnail-worker.js server.js script.js styles.css index.html package.json tools/check-image-loading-rules.js tools/check-image-thumbnail-store.js tools/check-image-resource-manager.js tools/check-global-image-demand-loading.js
```

Expected: no whitespace errors; no pre-existing feature blocks are removed.

- [ ] **Step 4: Browser network and interaction verification**

Start the local server and verify in a browser:

1. Open image history: only visible cards request `/api/image-thumbnails` or `/output/thumbnails/*`.
2. Scroll: later cards resolve on demand; closed panels make no image requests.
3. Click one history card: only the opened main result requests its original URL.
4. Open a large canvas: offscreen nodes have no `src`; visible nodes show thumbnails.
5. Zoom to 159%: no canvas original requests.
6. Zoom to 160% and keep moving: no original promotion.
7. Stop for at least 300ms: visible canvas detail images promote to originals.
8. Zoom out or pan away: images return to thumbnail/unloaded states.
9. Click canvas image and gallery cover: no lightbox opens; node selection and dragging work.
10. Online-image preview, crop, mask, download, and generated-image display still use originals.

- [ ] **Step 5: Final commit if the worktree permits isolated staging**

```powershell
git add -- image-loading-rules.js image-thumbnail-store.js image-resource-manager.js image-thumbnail-worker.js server.js script.js styles.css index.html package.json tools/check-image-loading-rules.js tools/check-image-thumbnail-store.js tools/check-image-resource-manager.js tools/check-global-image-demand-loading.js
git commit -m "perf: load site images on demand"
```

If these tracked files contained unrelated uncommitted user changes before execution and isolated hunk staging cannot be guaranteed, do not create this final commit; report the verified working-tree changes instead.
