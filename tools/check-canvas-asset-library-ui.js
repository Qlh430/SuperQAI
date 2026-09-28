"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(script, /const CANVAS_ASSET_DRAG_TYPE = "application\/x-ai-os-asset"/);
assert.match(script, /window\.CanvasAssetBridge\s*=\s*\{/);
assert.match(script, /getCurrentContext:\s*\(\)\s*=>\s*\(\{\s*projectId:\s*canvasState\.activeProjectId/);
assert.match(script, /boardId:\s*canvasState\.activeBoardId/);
assert.match(script, /node\.dataset\.assetId\s*=\s*String\(asset\.id/);
assert.match(script, /base\.assetId\s*=\s*node\.dataset\.assetId/);
assert.match(script, /if \(item\.assetId\) node\.dataset\.assetId = String\(item\.assetId\)/);
assert.match(script, /new CustomEvent\("ai-os-canvas-asset-drop"/);
assert.match(script, /addCanvasVideoNode\(point, \{[^\n]*assetId: normalized\.id/);
assert.match(script, /addCanvasAudioNode\(point, \{[^\n]*assetId: normalized\.id/);

assert.equal(fs.existsSync(path.join(root, "canvas-asset-library.js")), true, "asset library controller must exist");
assert.equal(fs.existsSync(path.join(root, "canvas-asset-library.css")), true, "asset library stylesheet must exist");
const library = fs.readFileSync(path.join(root, "canvas-asset-library.js"), "utf8");
assert.match(index, /canvas-asset-library\.css/);
assert.match(index, /canvas-asset-library\.js/);
for (const selector of [
  "canvasAssetLibraryButton",
  "canvasAssetLibraryPanel",
  "canvasAssetSearch",
  "canvasAssetImport",
  "canvasAssetInput",
  "canvasAssetGrid",
  "canvasAssetStatus",
]) assert.match(library, new RegExp(selector), `missing ${selector}`);
for (const scope of ["mine", "project", "public", "shared", "favorites"]) {
  assert.match(library, new RegExp(`data-asset-scope=.[\\\"']?${scope}`), `missing ${scope} scope`);
}
for (const kind of ["all", "image", "video", "audio"]) {
  assert.match(library, new RegExp(`data-asset-kind=.[\\\"']?${kind}`), `missing ${kind} kind`);
}
assert.match(library, /requestId/);
assert.match(library, /pendingActions/, "repeat engagement clicks are guarded while requests are pending");
assert.match(library, /application\/x-ai-os-asset/);
assert.match(library, /setData\(ASSET_DRAG_TYPE,\s*JSON\.stringify\(\{\s*assetId:\s*asset\.id\s*\}\)\)/, "drag payload contains only the asset id");
assert.doesNotMatch(library, /dataTransfer\.setData\("text\/plain"/, "asset drag must not leak names or URLs through fallback payloads");
assert.match(library, /\/api\/assets\/import/);
assert.match(library, /dataAssetShare|data-asset-share/, "asset owners can open sharing controls");
assert.match(library, /dataAssetLike|data-asset-like/, "public assets expose likes");
assert.match(library, /dataAssetFavorite|data-asset-favorite/, "readable assets expose favorites");
assert.match(library, /dataAssetUnpublish|data-asset-unpublish/, "administrators can unpublish public curation");
assert.match(library, /openAssetShareDialog/, "asset sharing reuses the system share dialog");
assert.match(library, /\/like/);
assert.match(library, /\/favorite/);
assert.match(library, /\/share/);

console.log("Canvas asset library UI contract checks passed.");
