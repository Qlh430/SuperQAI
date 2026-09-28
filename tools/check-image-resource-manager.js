const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { collectPortablePackageManifest } = require("./portable-package-manifest");

const root = path.resolve(__dirname, "..");
const managerPath = path.join(root, "image-resource-manager.js");
const workerPath = path.join(root, "image-thumbnail-worker.js");
const manager = fs.existsSync(managerPath) ? fs.readFileSync(managerPath, "utf8") : "";
const worker = fs.existsSync(workerPath) ? fs.readFileSync(workerPath, "utf8") : "";
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const portableBuild = fs.readFileSync(path.join(root, "build-portable.bat"), "utf8");
const portableManifest = collectPortablePackageManifest(root);

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
assert.match(manager, /imagePaintQuality/);
assert.match(manager, /canvas-image-original-ready/);
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
assert.match(html, /image-resource-manager\.js\?v=20260827-raster-refresh/);
["image-loading-rules.js", "image-resource-manager.js", "image-thumbnail-worker.js", "image-thumbnail-store.js"].forEach((name) => {
  assert.ok(portableManifest.files.includes(name), `Portable manifest must include ${name}`);
});
assert.match(portableBuild, /(?:copy-portable-runtime|build-electron-portable)\.js/i, "Portable build must use the shared runtime copier");

let removalObserverCallback = null;
class FakeMutationObserver {
  constructor(callback) {
    removalObserverCallback = callback;
  }

  observe() {}
}
const managerWindow = {
  document: { documentElement: {} },
};
vm.runInNewContext(manager, {
  window: managerWindow,
  document: managerWindow.document,
  MutationObserver: FakeMutationObserver,
});
assert.equal(typeof removalObserverCallback, "function", "the manager must watch removed image nodes");
const retainedImage = {
  isConnected: true,
  matches: () => true,
  querySelectorAll: () => [],
};
const removedWrapper = {
  nodeType: 1,
  matches: () => false,
  querySelectorAll: () => [retainedImage],
};
const releasedImages = [];
managerWindow.imageResources.releaseImage = (image) => releasedImages.push(image);
managerWindow.imageResources.releaseRemovedNode(removedWrapper);
assert.deepEqual(releasedImages, [], "a picture reattached during a gallery rerender must not be unloaded by the deferred removal observer");
retainedImage.isConnected = false;
managerWindow.imageResources.releaseRemovedNode(removedWrapper);
assert.deepEqual(releasedImages, [retainedImage], "a genuinely removed picture must still release its deferred resource");

console.log("Image resource manager checks passed.");
