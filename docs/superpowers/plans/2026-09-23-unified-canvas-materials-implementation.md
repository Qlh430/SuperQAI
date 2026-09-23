# Unified Canvas Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one unified 素材 entry and a mixed-media 素材合集 node that accepts imported and generated image, video, and audio assets while preserving legacy canvas nodes.

**Architecture:** Keep existing `image`, `video`, `audio`, `gallery-container`, and `video-output` contracts readable. Add a small pure rules module for asset normalization, MIME detection, deduplication, stable time sorting, and output compatibility; use a new `asset-collection` node in the browser layer for the new UI and persistence. Route new generator outputs into a connected asset collection, creating one beside the generator when absent.

**Tech Stack:** Vanilla JavaScript, DOM rendering in `script.js`, CSS in `styles.css`, Node.js check scripts, existing canvas serialization and connection APIs.

## Global Constraints

- Existing legacy nodes remain readable and writable; no automatic migration of existing image galleries or video output history.
- Asset members store metadata and existing media URLs only; never copy media bytes into the node document.
- New asset members use `kind: "image" | "video" | "audio"` and are displayed in descending `createdAt` order with stable insertion order for ties.
- Unsupported media and unsupported connections produce explicit UI/status errors; no silent dropping.
- New code must use ASCII source text where possible and preserve the repository’s existing browser-only global conventions.

---

### Task 1: Add the pure asset collection contract

**Files:**
- Create: `canvas-asset-collection-rules.js`
- Create: `tools/check-canvas-asset-collection.js`
- Modify: `package.json` scripts section

**Interfaces:**
- Produces `CanvasAssetCollectionRules.normalizeMember(input, fallback)`.
- Produces `CanvasAssetCollectionRules.normalizeMembers(members)`.
- Produces `CanvasAssetCollectionRules.appendMember(members, input)`.
- Produces `CanvasAssetCollectionRules.getOutput(members)`.
- Produces `CanvasAssetCollectionRules.detectKind({ mimeType, url, name })`.
- Produces `CanvasAssetCollectionRules.canConnect(kind, targetKind)`.

- [ ] **Step 1: Write the failing check**

Create `tools/check-canvas-asset-collection.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const Rules = require("../canvas-asset-collection-rules");

assert.equal(Rules.detectKind({ mimeType: "video/mp4" }), "video");
assert.equal(Rules.detectKind({ mimeType: "audio/mpeg" }), "audio");
assert.equal(Rules.detectKind({ mimeType: "image/png" }), "image");

const members = Rules.normalizeMembers([
  { id: "old", kind: "image", src: "/output/old.png", createdAt: "2026-09-23T00:00:00.000Z" },
  { id: "new", kind: "video", src: "/output/new.mp4", createdAt: "2026-09-23T00:00:01.000Z" },
]);
assert.deepEqual(members.map((member) => member.id), ["new", "old"]);
assert.equal(Rules.appendMember(members, {
  kind: "video",
  src: "/output/new.mp4",
  savedUrl: "/output/new.mp4",
}).length, 2);
assert.deepEqual(Rules.getOutput(members).assets.map((asset) => asset.kind), ["video", "image"]);
assert.equal(Rules.canConnect("audio", "image"), false);
assert.equal(Rules.canConnect("audio", "video-generator"), true);
console.log("canvas asset collection rules: ok");
```

- [ ] **Step 2: Run the check and verify the expected failure**

Run: `node tools/check-canvas-asset-collection.js`

Expected: FAIL with `Cannot find module '../canvas-asset-collection-rules'`.

- [ ] **Step 3: Implement the minimal rules module**

Implement a UMD-compatible module with:

```js
const KINDS = new Set(["image", "video", "audio"]);

function detectKind({ mimeType = "", url = "", name = "" } = {}) {
  const value = `${mimeType} ${url} ${name}`.toLowerCase();
  if (value.includes("video") || /\.(mp4|webm|mov|m4v)(?:$|\?)/.test(value)) return "video";
  if (value.includes("audio") || /\.(mp3|wav|m4a|aac|ogg|flac)(?:$|\?)/.test(value)) return "audio";
  if (value.includes("image") || /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/.test(value)) return "image";
  return "";
}

function normalizeMember(input = {}, fallback = {}) {
  const src = String(input.src || input.url || fallback.src || "").trim();
  const savedUrl = String(input.savedUrl || input.downloadUrl || src).trim();
  const kind = KINDS.has(input.kind) ? input.kind : detectKind({
    mimeType: input.mimeType || fallback.mimeType,
    url: src,
    name: input.name || fallback.name,
  });
  if (!kind || !src) return null;
  return {
    id: String(input.id || fallback.id || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    kind,
    name: String(input.name || fallback.name || "素材"),
    src,
    savedUrl,
    mimeType: String(input.mimeType || fallback.mimeType || ""),
    createdAt: String(input.createdAt || fallback.createdAt || new Date().toISOString()),
    duration: Number.isFinite(Number(input.duration)) ? Number(input.duration) : 0,
    source: String(input.source || fallback.source || "output"),
    sourceNodeId: String(input.sourceNodeId || fallback.sourceNodeId || ""),
    promptSummary: String(input.promptSummary || fallback.promptSummary || ""),
  };
}
```

Use a deterministic fallback tie-breaker from the original array index, remove duplicate members by `savedUrl || src`, sort by `createdAt` descending, and return `{ type: "assets", assets }` from `getOutput`.

- [ ] **Step 4: Run the check and verify it passes**

Run: `node tools/check-canvas-asset-collection.js`

Expected: exit code `0` and `canvas asset collection rules: ok`.

- [ ] **Step 5: Add the check to the project validation script**

Add `node tools/check-canvas-asset-collection.js` to the existing main check command after the other canvas rules checks, without removing any existing check.

- [ ] **Step 6: Commit the pure contract**

Run:

```powershell
git add canvas-asset-collection-rules.js tools/check-canvas-asset-collection.js package.json
git commit -m "feat: add mixed canvas asset collection rules"
```

### Task 2: Add the unified menu entry and asset node creation

**Files:**
- Modify: `script.js` in the canvas menu markup, menu click handler, file input handlers, and node creation helpers
- Modify: `styles.css` for the empty/material node base layout
- Test: `tools/check-canvas-asset-collection.js`

**Interfaces:**
- Consumes `CanvasAssetCollectionRules`.
- Produces `addCanvasAssetCollection(point, options)`.
- Produces `addCanvasMaterialPlaceholder(point)`.
- Produces `fillCanvasAssetCollectionFromFile(node, file)`.

- [ ] **Step 1: Extend the failing check for creation contracts**

Add a source-level assertion to the check script that `script.js` contains exactly one `data-canvas-node="asset"` menu button, contains `addCanvasAssetCollection`, and no longer contains menu buttons with `data-canvas-node="upload"`, `"video"`, `"audio"`, or `"video-output"`.

Run: `node tools/check-canvas-asset-collection.js`

Expected: FAIL because the existing menu still contains the old entries.

- [ ] **Step 2: Replace only the new-menu entries**

Change the add-card menu to:

```html
<button type="button" data-canvas-node="asset">
  <span class="canvas-menu-icon"><i data-lucide="paperclip"></i></span>
  <span>素材</span>
</button>
```

Change the tools/output menu to:

```html
<button type="button" data-canvas-node="asset-collection">
  <span class="canvas-menu-icon"><i data-lucide="layers-3"></i></span>
  <span>素材合集</span>
</button>
```

Leave the connect menu’s legacy choices intact so old connection workflows continue to function.

- [ ] **Step 3: Add the unified node constructors**

Implement:

```js
function addCanvasMaterialPlaceholder(point) {
  return addCanvasAssetCollection(point, { title: "素材", emptyMode: "upload" });
}

function addCanvasAssetCollection(point, options = {}) {
  const node = createCanvasNode("asset-collection");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasAssetCollectionNode(node, {
    title: options.title || "素材合集",
    emptyMode: options.emptyMode || "collection",
    members: options.members || [],
    activeMemberId: options.activeMemberId || "",
  });
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  if (!options.deferSave) scheduleCanvasSave();
  return node;
}
```

Add one hidden multi-purpose input element or reuse the existing node media inputs through a `data-canvas-asset-input` marker. Accept `image/*`, `video/*`, and `audio/*`; route the selected file to the active `asset-collection` node.

- [ ] **Step 4: Implement type detection and upload handling**

Use `Rules.detectKind({ mimeType: file.type, name: file.name })`. Upload images through `uploadCanvasImageFile`; upload video/audio through the existing media upload path used by `fillCanvasMediaNode`. Add the returned URL as a member with `source: "upload"` and the active board/node IDs.

For the first member render the single preview state. For the second and later members render collection state without changing `node.dataset.id`.

- [ ] **Step 5: Run the check and verify it passes**

Run: `node tools/check-canvas-asset-collection.js`

Expected: exit code `0`.

- [ ] **Step 6: Commit the menu and creation path**

Run:

```powershell
git add script.js styles.css tools/check-canvas-asset-collection.js
git commit -m "feat: add unified canvas material entry"
```

### Task 3: Render and persist mixed asset collections

**Files:**
- Modify: `script.js` in node-kind normalization, serialization, restore, clipboard paste, output lookup, and asset collection rendering
- Modify: `styles.css` for mixed media cards and type labels
- Test: `tools/check-canvas-asset-collection.js`

**Interfaces:**
- Consumes `Rules.normalizeMembers` and `Rules.getOutput`.
- Produces `renderCanvasAssetCollectionNode(node, options)`.
- Produces `getCanvasAssetCollectionMembers(node)`.
- Produces `setCanvasAssetCollectionMembers(node, members, activeMemberId)`.
- Produces `getCanvasAssetCollectionOutput(node)`.

- [ ] **Step 1: Add failing persistence assertions**

Extend the check script to assert `script.js` contains:

```js
assetCollection: {
asset-collection
getCanvasAssetCollectionOutput
```

Run: `node tools/check-canvas-asset-collection.js`

Expected: FAIL until serialization and restore paths are added.

- [ ] **Step 2: Add the node render contract**

Render:

```js
function renderCanvasAssetCollectionNode(node, options = {}) {
  const members = Rules.normalizeMembers(options.members || []);
  node.innerHTML = "";
  node.dataset.assetCollection = JSON.stringify({
    title: options.title || "素材合集",
    mode: members.length > 1 ? "collection" : "single",
    members,
    activeMemberId: options.activeMemberId || members[0]?.id || "",
  });
  node.classList.add("canvas-node-asset-collection");
  // render input/output ports, editable title, upload empty state,
  // media cards and resize handle
}
```

Each card must have a type badge, an accessible name, and type-specific content:

- image: `<img>` plus preview/download action;
- video: muted `<video>` thumbnail plus play/download action;
- audio: audio icon, name, duration and `<audio controls>`.

Use `createdAt` ordering from the rules module and render a selected member as the main preview when one exists.

- [ ] **Step 3: Add serialization and restore support**

Add `asset-collection` to `getCanvasCreateKindFromSerialized` and the node kind allow-list. In serialize/restore/paste paths, persist and restore:

```js
assetCollection: {
  title,
  mode,
  members,
  activeMemberId
}
```

Do not convert legacy `gallery-container` or `video-output` records during restore.

- [ ] **Step 4: Add output and connection contracts**

Return:

```js
{
  type: "assets",
  assets: getCanvasAssetCollectionMembers(node)
}
```

Update connection compatibility so an `asset-collection` source is accepted by image generation when it contains image assets and by video generation when it contains image/video/audio assets. Reject a requested media type when no compatible member exists and display the existing connection status message area.

- [ ] **Step 5: Run static checks**

Run:

```powershell
node --check canvas-asset-collection-rules.js
node tools/check-canvas-asset-collection.js
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit persistence and rendering**

Run:

```powershell
git add script.js styles.css tools/check-canvas-asset-collection.js
git commit -m "feat: render and persist mixed canvas asset collections"
```

### Task 4: Route generated results into asset collections

**Files:**
- Modify: `script.js` in image result append, video output creation, output extraction, and asset insertion bridge
- Test: `tools/check-canvas-asset-collection.js`

**Interfaces:**
- Produces `getOrCreateCanvasAssetCollectionForNode(sourceNode, options)`.
- Produces `appendCanvasAssetToCollection(sourceNode, asset, options)`.
- Keeps `appendCanvasGenerationToGallery` as the legacy image-gallery path for existing `gallery-container` nodes.

- [ ] **Step 1: Add failing source-level result routing assertions**

Assert the source contains `appendCanvasAssetToCollection`, `source: "generation"`, and that `getOrCreateCanvasVideoOutput` no longer creates `addCanvasVideoOutputNode` for a new result path.

Run: `node tools/check-canvas-asset-collection.js`

Expected: FAIL.

- [ ] **Step 2: Implement collection lookup and append**

Implement lookup by connected `asset-collection` first. If none exists, create one to the right of the source and connect its input. Normalize the asset with `source: "generation"` or `source: "output"`, `sourceNodeId`, prompt summary, MIME type, duration, and created timestamp. Deduplicate by saved URL/source URL, update the node, refresh connected nodes, and schedule the existing canvas save.

- [ ] **Step 3: Route new image results**

When an image generator has a connected `asset-collection`, append the image there. When only a legacy gallery is connected, preserve `appendCanvasGenerationToGallery`. When no result target exists, create an `asset-collection` for the new result rather than a new legacy gallery.

- [ ] **Step 4: Route new video results**

Change the new-result path used by `getOrCreateCanvasVideoOutput`/video completion to prefer or create `asset-collection`. Keep `video-output` rendering and history for restored legacy nodes, but do not create it for newly completed generation tasks.

- [ ] **Step 5: Verify no duplicate writes**

Run: `node tools/check-canvas-asset-collection.js`

Expected: exit code `0`, including duplicate append assertions for image and video URLs.

- [ ] **Step 6: Commit generated-result routing**

Run:

```powershell
git add script.js tools/check-canvas-asset-collection.js
git commit -m "feat: collect generated canvas media in asset collections"
```

### Task 5: Browser smoke test and regression verification

**Files:**
- Modify: `tools/check-canvas-agent-ui.js` only if the existing browser harness needs a selector update
- Create: `tools/check-canvas-asset-collection-browser.js`

**Interfaces:**
- Browser test starts the existing local app and checks the visible menu and node states without requiring an API key.

- [ ] **Step 1: Write the browser smoke test**

Open the canvas page, open the blank-canvas context menu, assert visible text `素材` and `素材合集`, assert old import/output buttons are absent from the menu, click `素材`, and assert a node with `.canvas-node-asset-collection` and the title `素材` appears.

- [ ] **Step 2: Run the browser smoke test**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-asset-collection-browser.js`

Expected: exit code `0` with a screenshot/artifact path and no page errors.

- [ ] **Step 3: Run focused static regressions**

Run:

```powershell
node --check script.js
node --check canvas-asset-collection-rules.js
node tools/check-canvas-asset-collection.js
node tools/check-canvas-gallery-history.js
node tools/check-canvas-video-history.js
node tools/check-canvas-generator-layout.js
```

Expected: all commands exit `0`.

- [ ] **Step 4: Inspect the diff**

Run:

```powershell
git diff HEAD~4..HEAD --check
git status --short
```

Expected: no whitespace errors; unrelated pre-existing modifications remain untouched.

- [ ] **Step 5: Commit the smoke test**

Run:

```powershell
git add tools/check-canvas-asset-collection-browser.js
git commit -m "test: verify unified canvas asset entry"
```
