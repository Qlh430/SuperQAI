# Canvas Semantic Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every canvas retain meaningful, fast-loading node information below 65% zoom while preserving the existing high-detail image interaction and the 50,000-node performance guarantee.

**Architecture:** Keep full nodes unchanged at high zoom, add a pure semantic-preview descriptor for lightweight DOM cards, and reserve density aggregation for viewports containing more than 800 candidates. Use 60%/65% hysteresis plus atomic level replacement to avoid blank frames; dense LOD tiles render meaningful screen-space aggregate cards instead of anonymous blue rectangles.

**Tech Stack:** Node.js 24, CommonJS/UMD browser modules, native DOM/CSS, SQLite materialized LOD tiles, existing image resource manager and media scheduler, Node `assert`, Playwright.

## Global Constraints

- At every zoom below 65%, each visible node or aggregate must show a representative thumbnail or type icon, plus type, title, and key status; empty shells and anonymous color blocks are forbidden.
- Only a viewport with more than 800 candidate nodes may aggregate; a low scale by itself must not discard individual node semantics.
- Preview images never promote directly to the original after thumbnail failure; type/title/status remain visible before, during, and after image loading.
- Existing `image-loading-rules.js`, `canvasDetailReady`, original-image promotion thresholds, crop, mask, download, lightbox, and original-view behavior remain unchanged for full nodes.
- Full-node mounting stays within the existing 8ms frame budget; at most 220 ordinary nodes may be full at once, detailed DOM stays at or below 800 nodes, and transitions stay at or below 80 nodes.
- The 50,000-node guarantee, logical lack of a hard board limit, 96MB resident model budget, and 1,200-connection page limit remain intact.
- Existing canvas JSON/SQLite schemas, node coordinates, dimensions, connections, revisions, unknown fields, save, undo, and serialization semantics remain compatible.
- Formal canvas data is read-only during verification. Browser fixtures use temporary JSON/SQLite paths and are removed in `finally` blocks.
- Preserve unrelated dirty changes in `script.js`, `styles.css`, `index.html`, `package.json`, and all other workspace files; stage only files belonging to the current task.

---

### Task 1: Pure semantic preview and zoom-level rules

**Files:**
- Create: `canvas-preview-rules.js`
- Create: `tools/check-canvas-preview-rules.js`
- Modify: `canvas-spatial-rules.js:44-49`
- Modify: `canvas-virtualization-rules.js:93-98`
- Modify: `tools/check-canvas-spatial-rules.js`
- Modify: `tools/check-canvas-virtualization-rules.js`

**Interfaces:**
- Produces: `CanvasPreviewRules.describeNode(model) -> { kind, typeLabel, title, status, icon, imageSource }`.
- Produces: `CanvasPreviewRules.describeAggregate(tile) -> { kind, typeLabel, title, status, icon, count }`.
- Produces: `chooseNodeLevel({ scale, visibleCount, pinned, previousLevel }) -> "full" | "compact" | "overview"` with 60%/65% hysteresis.
- Changes: `chooseLodLevel(scale, candidateCount)` returns LOD only when `candidateCount > 800`.

- [ ] **Step 1: Write failing rule tests**

Add exact boundary assertions before implementation:

```js
assert.equal(spatial.chooseLodLevel(0.09, 186), 0);
assert.equal(spatial.chooseLodLevel(0.05, 800), 0);
assert.ok(spatial.chooseLodLevel(0.64, 801) > 0);

assert.equal(rules.chooseNodeLevel({ scale: 0.64, visibleCount: 100, previousLevel: "compact" }), "compact");
assert.equal(rules.chooseNodeLevel({ scale: 0.65, visibleCount: 100, previousLevel: "compact" }), "full");
assert.equal(rules.chooseNodeLevel({ scale: 0.62, visibleCount: 100, previousLevel: "full" }), "full");
assert.equal(rules.chooseNodeLevel({ scale: 0.59, visibleCount: 100, previousLevel: "full" }), "compact");
assert.equal(rules.chooseNodeLevel({ scale: 0.09, visibleCount: 186 }), "overview");
assert.equal(rules.chooseNodeLevel({ scale: 0.74, visibleCount: 300 }), "compact");
assert.equal(rules.chooseNodeLevel({ scale: 0.74, visibleCount: 801 }), "overview");
```

Create descriptor assertions covering image, gallery, group, text, ComfyUI, generator, LLM, media, unknown legacy nodes, and aggregates. Every result must satisfy:

```js
const descriptor = preview.describeNode(model);
assert.ok(descriptor.icon || descriptor.imageSource);
assert.ok(descriptor.typeLabel.trim());
assert.ok(descriptor.title.trim());
assert.ok(descriptor.status.trim());
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node .\tools\check-canvas-preview-rules.js
node .\tools\check-canvas-spatial-rules.js
node .\tools\check-canvas-virtualization-rules.js
```

Expected: the preview module is missing, low-scale 186-node LOD is nonzero, and the hysteresis assertions fail.

- [ ] **Step 3: Implement the pure descriptor module**

Use a UMD wrapper and bounded strings. The implementation selects `thumbnailSrc` first, then existing result/image/gallery/group fields, and never copies base64 or full payloads into aggregate descriptors:

```js
const KIND_META = Object.freeze({
  image: { label: "图片", icon: "图" },
  upload: { label: "上传图片", icon: "图" },
  gallery: { label: "图集", icon: "集" },
  group: { label: "图片组", icon: "组" },
  text: { label: "文字", icon: "文" },
  comfy: { label: "ComfyUI", icon: "流" },
  llm: { label: "LLM", icon: "AI" },
  "minimax-h3": { label: "H3 视频", icon: "影" },
  video: { label: "视频", icon: "影" },
  "video-output": { label: "视频结果", icon: "影" },
  audio: { label: "音频", icon: "音" },
  loop: { label: "循环", icon: "循" },
});

function describeNode(model = {}) {
  const kind = String(model.kind || "unknown");
  const meta = KIND_META[kind] || { label: kind === "unknown" ? "旧节点" : kind, icon: "节" };
  return {
    kind,
    typeLabel: meta.label,
    title: nodeTitle(model, meta.label).slice(0, 80),
    status: nodeStatus(model, meta.label).slice(0, 48),
    icon: meta.icon,
    imageSource: nodeImageSource(model),
  };
}
```

- [ ] **Step 4: Implement count-only density LOD and hysteresis**

Use these exact boundaries:

```js
function chooseLodLevel(scale, candidateCount) {
  const safeCount = Math.max(0, finite(candidateCount));
  if (safeCount <= 800) return 0;
  return Math.max(1, Math.ceil(Math.log2(Math.max(1, safeCount / 400))));
}

function chooseNodeLevel({ scale, visibleCount, pinned, previousLevel } = {}) {
  if (pinned) return "full";
  if (finiteNumber(visibleCount) > 800) return "overview";
  const value = finiteNumber(scale, 1);
  if (value < 0.3) return "overview";
  if (finiteNumber(visibleCount) > 220) return "compact";
  if (previousLevel === "full" && value >= 0.6) return "full";
  return value >= 0.65 ? "full" : "compact";
}
```

- [ ] **Step 5: Run focused tests and commit**

Run the three commands from Step 2. Expected: all print their `passed` messages.

Commit only the six Task 1 files with message `feat: add canvas semantic zoom rules`.

---

### Task 2: Stable virtualizer level changes and bounded clustering

**Files:**
- Modify: `canvas-virtualizer.js:8-205`
- Modify: `tools/check-canvas-virtualizer.js`

**Interfaces:**
- Consumes: `chooseNodeLevel({ previousLevel })` from Task 1.
- Adds constructor callback: `replace(id, currentElement, fromLevel, toLevel) -> Element | null`.
- Keeps: `mount(id, level)`, `unmount(id, element)`, `FRAME_BUDGET_MS`.
- Produces diagnostics: `replaced`, `transitioned`, `clustered`, and `remaining` in `afterFlush(detail)`.

- [ ] **Step 1: Write failing virtualizer tests**

Add fake-frame tests proving:

```js
viewport = { width: 500, height: 500, x: 0, y: 0, scale: 0.64 };
virtualizer.flushNow();
assert.equal(store.getMountedLevel("a"), "compact");
viewport.scale = 0.65;
virtualizer.flushNow();
assert.equal(store.getMountedLevel("a"), "full");
viewport.scale = 0.62;
virtualizer.flushNow();
assert.equal(store.getMountedLevel("a"), "full");
viewport.scale = 0.59;
virtualizer.flushNow();
assert.equal(store.getMountedLevel("a"), "compact");
assert.ok(replacements.every((item) => item.oldWasPresentDuringReplace));
```

Use 800 and 801 visible models at both 0.09 and 0.74 scales. Assert 800 are not clustered, 801 are bounded to at most 800 representatives, and pinned models survive clustering.

- [ ] **Step 2: Run the test and verify RED**

Run: `node .\tools\check-canvas-virtualizer.js`

Expected: hysteresis flaps at the old threshold, no replacement adapter is called, and 801 models at 0.74 exceed the DOM cap.

- [ ] **Step 3: Pass previous level and replace atomically**

Calculate desired levels with the mounted level:

```js
const previousLevel = this.store.getMountedLevel(id);
desired.set(id, this.rules.chooseNodeLevel({
  scale: viewport.scale,
  visibleCount: visibleIds.length,
  pinned: this.pinnedIds.has(id),
  previousLevel,
}));
```

When only the level changes, call `replaceAdapter` while the old element is still mounted. Store the returned element before releasing the old element. Default to the existing unmount/mount sequence only when no replacement adapter was supplied. Limit animated replacements to 80 per flush; later replacements remain generation-bound and frame-budgeted.

- [ ] **Step 4: Cluster by density, not scale**

Return all IDs when `ids.length <= 800`. Above 800, bucket by screen-space position at the current scale, preserve pinned IDs, then select nearest representatives until the 800-item cap. Do not make `scale >= 0.3` bypass the cap.

- [ ] **Step 5: Run focused tests and commit**

Run: `node .\tools\check-canvas-virtualizer.js`

Expected: `Canvas virtualizer checks passed.`

Commit Task 2 files with message `feat: stabilize canvas virtual level transitions`.

---

### Task 3: Meaningful DOM previews with nonblocking thumbnail fallback

**Files:**
- Modify: `index.html` near the canvas module script tags
- Modify: `build-portable.bat` canvas module copy list
- Modify: `package.json` canvas syntax/focused checks
- Modify: `image-resource-manager.js:20-145`
- Modify: `script.js:10900-11010`
- Modify: `styles.css:13920-13975`
- Modify: `tools/check-image-resource-manager.js`
- Modify: `tools/check-canvas-virtualization-integration.js`
- Create: `tools/check-canvas-semantic-zoom-ui.js`

**Interfaces:**
- Loads `canvas-preview-rules.js` before `script.js`.
- Extends `ImageResourceManager.observe(img, source, { allowOriginalFallback })` without changing the default `true` behavior.
- Produces DOM contract: `.canvas-node-virtual-summary-card`, `.canvas-node-virtual-type`, `.canvas-node-virtual-title`, `.canvas-node-virtual-status`, `.canvas-node-virtual-icon`, and optional `.canvas-node-virtual-summary-image`.
- Produces state attributes: `data-preview-complete="true"` and `data-preview-image-state="none|loading|ready|error"`.

- [ ] **Step 1: Create the failing mixed-node browser fixture**

Create a temporary legacy board with image, gallery, group, text, ComfyUI, generator, LLM, video, and unknown nodes. Use one valid data-URI image and one deliberately failing `/missing-semantic-preview.png` source. At 9%, 35%, 55%, and 64%, assert every mounted summary has all semantic fields and either an image or icon:

```js
const summaries = [...document.querySelectorAll(".canvas-node-virtual-summary")];
assert.ok(summaries.length > 0);
assert.equal(summaries.filter((node) => node.dataset.previewComplete !== "true").length, 0);
assert.equal(summaries.filter((node) => !node.querySelector(".canvas-node-virtual-type")?.textContent.trim()).length, 0);
assert.equal(summaries.filter((node) => !node.querySelector(".canvas-node-virtual-title")?.textContent.trim()).length, 0);
assert.equal(summaries.filter((node) => !node.querySelector(".canvas-node-virtual-status")?.textContent.trim()).length, 0);
assert.equal(summaries.filter((node) => !node.querySelector("img,.canvas-node-virtual-icon")).length, 0);
```

At 65%, 74%, 100%, and 160%, assert full nodes exist and the current detail image/lightbox controls remain present. Track requests to the failing original URL and assert a failed preview never assigns that URL directly to `img.src`.

- [ ] **Step 2: Run the browser test and verify RED**

Run: `node .\tools\check-canvas-semantic-zoom-ui.js`

Expected: 9% enters primitive LOD or overview summaries lack semantic fields; the failed thumbnail falls back to the original URL.

- [ ] **Step 3: Wire the preview module and preserve packaging**

Add this ordered script before `canvas-virtualizer.js` and `script.js`:

```html
<script src="./canvas-preview-rules.js?v=20260826-semantic-zoom"></script>
```

Add the same file to the portable copy list and add `node --check canvas-preview-rules.js` plus `node tools/check-canvas-preview-rules.js` to the focused canvas check.

- [ ] **Step 4: Prevent summary failures from promoting originals**

Keep `allowOriginalFallback` defaulting to `true` for all existing callers. Store it in `ImageResourceManager.options`; `handleIntersections` and thumbnail-error handling pass the stored value to `showThumbnail`. Semantic preview images call:

```js
createDeferredThumbnail(descriptor.imageSource, descriptor.title, {
  allowOriginalFallback: false,
});
```

When thumbnail generation or loading fails, set `data-preview-image-state="error"`; never remove the already-rendered type icon, type, title, or status.

- [ ] **Step 5: Render semantic content before creating the image**

Build the fallback DOM synchronously, then append the optional deferred image. Use `textContent`, not HTML interpolation, for model strings:

```js
const descriptor = window.CanvasPreviewRules.describeNode(model);
const card = document.createElement("span");
card.className = "canvas-node-virtual-summary-card";
const icon = document.createElement("span");
icon.className = "canvas-node-virtual-icon";
icon.textContent = descriptor.icon;
const type = document.createElement("span");
type.className = "canvas-node-virtual-type";
type.textContent = descriptor.typeLabel;
const title = document.createElement("strong");
title.className = "canvas-node-virtual-title";
title.textContent = descriptor.title;
const status = document.createElement("span");
status.className = "canvas-node-virtual-status";
status.textContent = descriptor.status;
card.append(icon, type, title, status);
node.append(card);
node.dataset.previewComplete = "true";
```

- [ ] **Step 6: Add stable, readable preview styling**

Keep the outer geometry unchanged. Give the image the main area and place a high-contrast semantic gradient/card over it; overview cards emphasize icon and title. Animate only `opacity` and a maximum 4px `translateY` for 140ms, disable it under `prefers-reduced-motion`, and suppress it when more than 80 replacements are active. Do not animate dimensions, box-shadow blur, filters, or canvas-plane transforms.

- [ ] **Step 7: Implement the runtime replacement adapter**

Add `replaceCanvasVirtualNode(id, current, fromLevel, toLevel)` to synchronize a departing full node, mount the target level before removing the old element, transfer selection state, and remove the old node in the same frame or after the bounded 140ms transition. A failed target mount leaves the old element and its store entry intact.

- [ ] **Step 8: Run focused tests and commit**

Run:

```powershell
node .\tools\check-image-resource-manager.js
node .\tools\check-canvas-virtualization-integration.js
node .\tools\check-canvas-semantic-zoom-ui.js
node --check .\script.js
```

Expected: all checks pass, the mixed board has zero empty previews at every sub-65% scale, and failed preview images do not promote originals.

Commit only Task 3 files with message `feat: render meaningful canvas previews`.

---

### Task 4: Meaningful dense aggregate cards

**Files:**
- Modify: `canvas-primitive-layer.js`
- Modify: `tools/check-canvas-primitive-layer.js`
- Modify: `canvas-db-worker.js:730-785`
- Modify: `tools/check-canvas-repository-operations.js`

**Interfaces:**
- Consumes: `CanvasPreviewRules.describeAggregate(tile)` in the browser and CommonJS test.
- Adds page diagnostic: `candidateCount` on both detail and LOD viewport responses.
- Adds primitive diagnostics: `semanticCardCount`, `blankCardCount`, and `aggregateNodeCount`.

- [ ] **Step 1: Write failing aggregate tests**

Extend repository tests to assert 800 candidates return `mode: "detail"`, 801 return `mode: "lod"`, and both pages expose the exact `candidateCount`. Extend the primitive fake context to capture `fillText` and assert every tile draws icon, type/title, count, and status with zero blank cards.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --disable-warning=ExperimentalWarning .\tools\check-canvas-repository-operations.js
node .\tools\check-canvas-primitive-layer.js
```

Expected: `candidateCount` is missing and primitive output only contains the old faint `count · dominantType` label.

- [ ] **Step 3: Return bounded density diagnostics**

Include only the numeric `candidateCount` in both query modes. Keep `lodNodes` unchanged so the database schema, materialized tile size, preview ID cap, and update costs remain unchanged.

- [ ] **Step 4: Draw high-contrast screen-space aggregate cards**

Use aggregate descriptors to draw a rounded card with a type icon badge, representative type/title, node count, and status. Text stays in screen pixels and is clipped to the tile screen bounds; if a tile is too small, draw icon plus count rather than an empty rectangle. Set `blankCardCount` only when icon/title/status/count are all absent, which must remain zero.

- [ ] **Step 5: Run focused tests and commit**

Run the two commands from Step 2. Expected: both checks pass and primitive diagnostics report zero blank cards.

Commit Task 4 files with message `feat: make dense canvas overview meaningful`.

---

### Task 5: Cross-board legacy compatibility and image-failure matrix

**Files:**
- Modify: `tools/check-existing-old-canvas-ui.js`
- Modify: `tools/diagnose-current-canvas-ui.js`
- Modify: `package.json`

**Interfaces:**
- Reuses: semantic DOM contract from Task 3 and primitive diagnostics from Task 4.
- Produces per-board diagnostics: board ID/title, scale, node kinds, mounted summaries, mounted images, semantic fallbacks, blank previews, primitive blank cards, API errors, and node/connection counts.

- [ ] **Step 1: Make the existing test fail on every affected board class**

Replace the four-board-only selector with two layers:

1. Open every non-empty historical board at 9% and 55%.
2. Run the full 5%, 15%, 25%, 35%, 45%, 55%, 60%, 64%, 65%, 74%, 100%, 160% matrix on named NILLKIN and 苹果 boards when present, plus the largest, oldest, and most kind-diverse boards.

At each sub-65% scale assert:

```js
assert.equal(result.blankMountedNodes, 0, `${result.title} @ ${result.scale}`);
assert.equal(result.incompleteSemanticNodes, 0, `${result.title} @ ${result.scale}`);
assert.equal(result.primitiveBlankCards, 0, `${result.title} @ ${result.scale}`);
```

At 65% and above assert full nodes and existing image detail controls. For every board, compare `/meta` node count, connection count, and viewport against the legacy source and verify the original JSON SHA-256 never changes.

- [ ] **Step 2: Run the old-canvas test and verify RED**

Run: `node .\tools\check-existing-old-canvas-ui.js`

Expected: the NILLKIN 9% board reports old primitive cards or incomplete semantic previews before the implementation is complete.

- [ ] **Step 3: Add reusable browser diagnostics**

Update `diagnose-current-canvas-ui.js` to report semantic field counts, image states, aggregate diagnostics, active virtual levels, and direct-original preview requests without mutating the board. Keep its exact node/connection snapshot comparison.

- [ ] **Step 4: Register the focused compatibility command**

Add `check:canvas-semantic-zoom` to `package.json` containing pure rules, virtualizer, primitive layer, semantic browser UI, and existing-old-canvas UI checks. Do not replace or remove existing checks.

- [ ] **Step 5: Run compatibility tests and commit**

Run:

```powershell
npm run check:canvas-semantic-zoom
node .\tools\check-canvas-paged-roundtrip-ui.js
```

Expected: every non-empty old board passes at 9% and 55%; the representative matrix passes; source hashes and exact metadata remain unchanged; temporary directories are absent after exit.

Commit Task 5 files with message `test: cover semantic zoom across old canvases`.

---

### Task 6: 50,000-node performance, high-detail regression, and cleanup

**Files:**
- Modify: `tools/check-canvas-50000-performance-ui.js`
- Modify: `tools/run-canvas-50000-soak.js`
- Modify: `tools/check-global-image-demand-loading.js`
- Modify: `tools/check-image-loading-rules.js`

**Interfaces:**
- Reads: `CanvasVirtualizer.afterFlush` diagnostics, `CanvasPrimitiveLayer.getDiagnostics()`, image request log, resident model count, DOM count, heap, server RSS, and frame timings.
- Preserves existing thresholds: viewport P95 ≤75ms, pan P95 ≤20ms, pan P99 ≤50ms, longest interaction task ≤100ms, detailed DOM ≤800, canvas DOM ≤1,200, heap ≤350MB when available, server RSS ≤250MB when available.

- [ ] **Step 1: Extend performance assertions before changing production code further**

At 5%, 9%, 55%, 64%, 65%, 74%, 100%, and 160%, collect:

```js
{
  blankSemanticNodes,
  primitiveBlankCards,
  mountedNodes,
  transitionNodes,
  thumbnailRequests,
  originalPreviewRequests,
  frameDurations,
}
```

Assert blank counts and `originalPreviewRequests` are zero, mounted/transition counts stay bounded, and thumbnail requests are proportional to visible representatives rather than all 50,000 models. Keep the existing performance thresholds unchanged.

- [ ] **Step 2: Verify the extended test fails before the final integration**

Run:

```powershell
node --disable-warning=ExperimentalWarning .\tools\generate-canvas-50000-fixture.js
node .\tools\check-canvas-50000-performance-ui.js
```

Expected before completion: at least the new semantic diagnostics or multi-scale assertions fail.

- [ ] **Step 3: Verify high-detail image behavior remains unchanged**

Run existing image-loading rules and browser demand-loading checks. Assert full nodes still request thumbnail first, promote to original only at the existing `DETAIL_SCALE = 1` after `DETAIL_IDLE_MS = 300`, and lightbox/crop/mask/download paths still use canonical originals.

- [ ] **Step 4: Run the complete focused regression set**

Run:

```powershell
npm run check:canvas-fast
npm run check:canvas-browser-core
npm run check:canvas-semantic-zoom
node .\tools\check-canvas-paged-roundtrip-ui.js
node .\tools\check-global-image-demand-loading.js
node .\tools\check-image-loading-rules.js
node --disable-warning=ExperimentalWarning .\tools\generate-canvas-50000-fixture.js
node .\tools\check-canvas-50000-performance-ui.js
node --disable-warning=ExperimentalWarning .\tools\run-canvas-50000-soak.js --minutes=3
```

Expected: every command exits 0; 50,000-node metrics remain within all existing limits; semantic blank counts and preview-original requests are zero.

- [ ] **Step 5: Remove temporary pressure data and inspect formal boards read-only**

Invoke `removePressureRoot()` from the existing fixture helper after the performance and three-minute soak checks. Assert the pressure root, temporary databases, and browser artifacts created by this plan are gone. Query formal board metadata and `PRAGMA quick_check` without saving or applying operations; compare NILLKIN, 苹果, 画布 17, largest, oldest, and most diverse boards with their pre-test node/connection counts.

- [ ] **Step 6: Final diff review and commit**

Run `git diff --check` on the files changed by this plan and inspect `git status --short` to confirm no unrelated dirty files are staged. Commit Task 6 test changes with message `test: verify semantic zoom at 50000 nodes`.
