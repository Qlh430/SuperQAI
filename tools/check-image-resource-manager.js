const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const managerPath = path.join(root, "image-resource-manager.js");
const workerPath = path.join(root, "image-thumbnail-worker.js");
const manager = fs.existsSync(managerPath) ? fs.readFileSync(managerPath, "utf8") : "";
const worker = fs.existsSync(workerPath) ? fs.readFileSync(workerPath, "utf8") : "";
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const portableBuild = fs.readFileSync(path.join(root, "build-portable.bat"), "utf8");

assert.match(manager, /class ImageResourceManager/);
assert.match(manager, /new IntersectionObserver/);
assert.match(manager, /new MutationObserver/);
assert.match(manager, /releaseImage\(img\)/);
assert.match(manager, /this\.thumbnailConcurrency\s*=\s*6/);
assert.match(manager, /this\.originalConcurrency\s*=\s*2/);
assert.match(manager, /this\.requestVersions\s*=\s*new WeakMap/);
assert.match(manager, /this\.originalPromises\s*=\s*new WeakMap/);
assert.match(manager, /setAttribute\("data-original-src"/);
assert.match(manager, /showThumbnail\(img(?:,|\))/);
assert.match(manager, /showOriginal\(img\)/);
assert.match(manager, /beginImageRequest\(img, quality, source\)/);
assert.match(manager, /isCurrentImageRequest\(img, request\)/);
assert.match(manager, /hasDisplayedImage\(img\)/);
assert.match(manager, /preload\.decode/);
assert.match(manager, /imageUpgradePending/);
assert.match(manager, /imageQuality\s*===\s*"original"[\s\S]*showThumbnail/);
assert.match(manager, /addEventListener\(\"error\"/);
assert.match(manager, /fallbackToOriginal\(img\)/);
assert.match(manager, /fallbackToThumbnail\(img\)/);
assert.match(manager, /if \(!this\.hasDisplayedImage\(img\)\) img\.dataset\.imageQuality = "loading"/);
assert.match(manager, /registerCanvasImage\(img, source\)/);
assert.match(manager, /disconnect\(container\)/);
assert.match(manager, /failureBackoffMs\s*=\s*60_000/);
assert.match(manager, /allowOriginalFallback:\s*options\.allowOriginalFallback\s*!==\s*false/);
assert.match(manager, /showThumbnail\(img,\s*\{\s*allowOriginalFallback:/);
assert.match(manager, /if\s*\(allowOriginalFallback\)\s*\{\s*this\.fallbackToOriginal\(img\)/);
assert.match(manager, /new Worker\("\.\/image-thumbnail-worker\.js\?v=20260815-demand-loading"\)/);
assert.match(worker, /createImageBitmap/);
assert.match(worker, /OffscreenCanvas/);
assert.match(worker, /convertToBlob\(\{\s*type:\s*"image\/webp",\s*quality\s*\}\)/);
assert.match(
  html,
  /image-loading-rules\.js[^>]*><\/script>[\s\S]*image-resource-manager\.js[^>]*><\/script>[\s\S]*script\.js/,
);
["image-loading-rules.js", "image-resource-manager.js", "image-thumbnail-worker.js", "image-thumbnail-store.js"].forEach((name) => {
  assert.match(portableBuild, new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`), `Portable build must copy ${name}`);
});

console.log("Image resource manager checks passed.");
