const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function extractFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyMarker = script.indexOf(") {", start);
  assert.notStrictEqual(bodyMarker, -1, `Missing body for ${name}`);
  const bodyStart = bodyMarker + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < script.length; index += 1) {
    const char = script[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return script.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function extractBlock(startText, endText) {
  const start = script.indexOf(startText);
  assert.notStrictEqual(start, -1, `Missing block ${startText}`);
  const end = script.indexOf(endText, start);
  assert.notStrictEqual(end, -1, `Missing block end ${endText}`);
  return script.slice(start, end + endText.length);
}

assert.match(extractFunction("createDeferredThumbnail"), /imageResources\.observe/);
assert.doesNotMatch(extractFunction("renderImageHistory"), /<img\s+src=/);
assert.match(extractFunction("renderImageHistory"), /createDeferredThumbnail/);
assert.doesNotMatch(extractFunction("renderUnifiedHistory"), /<img\s+src=/);
assert.match(extractFunction("renderUnifiedHistory"), /createDeferredThumbnail/);
assert.doesNotMatch(extractFunction("createCanvasBoardPreview"), /img\.src\s*=\s*image/);
assert.match(extractFunction("createCanvasBoardPreview"), /createDeferredThumbnail/);
assert.match(extractFunction("getCanvasBoardPreviewImages"), /Array\.isArray\(node\.galleryImages\)/);
assert.match(extractFunction("addMessage"), /createDeferredThumbnail/);
assert.match(extractFunction("updateCanvasNodeRefs"), /createDeferredThumbnail/);
assert.match(extractFunction("renderCanvasGalleryHistory"), /createDeferredThumbnail/);

assert.match(extractFunction("registerCanvasDetailImage"), /registerCanvasImage/);
assert.match(extractFunction("updateCanvasImageQualities"), /getCanvasVisibleRect/);
assert.match(extractFunction("updateCanvasImageQualities"), /chooseCanvasImageQuality/);
const canvasQualityFunction = extractFunction("updateCanvasImageQualities");
assert.match(canvasQualityFunction, /displayedMaxSide:\s*Math\.max\(width, height\) \* canvasState\.scale/);
assert.match(canvasQualityFunction, /currentQuality:\s*img\.dataset\.imageQuality/);
const viewportInteractionFunction = extractFunction("markCanvasViewportInteraction");
assert.doesNotMatch(viewportInteractionFunction, /canvasState\.scale < rules\.DETAIL_SCALE/);
assert.match(extractFunction("markCanvasViewportInteraction"), /DETAIL_IDLE_MS/);
const scheduleMediaFunction = extractFunction("scheduleCanvasMediaImage");
assert.doesNotMatch(scheduleMediaFunction, /window\.imageResources\.unload\(img\)/);
assert.doesNotMatch(scheduleMediaFunction, /abort[\s\S]*unload\(img\)/);
assert.match(scheduleMediaFunction, /dataset\.requestedQuality\s*===\s*quality/);
assert.match(scheduleMediaFunction, /quality === "thumbnail" && img\.dataset\.imageQuality === "original"/);
assert.doesNotMatch(
  extractFunction("renderCanvasImageNode"),
  /addEventListener\("click",\s*\(\)\s*=>\s*openPreview/,
);
assert.doesNotMatch(extractFunction("updateCanvasGenerationResult"), /openPreview/);
assert.doesNotMatch(extractFunction("bindCanvasGalleryCoverInteraction"), /openCanvasGalleryPreview/);
assert.doesNotMatch(extractFunction("renderCanvasGalleryHistory"), /canvas-gallery-history-preview/);
assert.match(extractFunction("startCanvasImageCrop"), /imageResources\?\.showOriginal/);
assert.match(extractFunction("applyCanvasImageCrop"), /await loadImageElement\(source\)/);
assert.match(extractFunction("applyCanvasImageCrop"), /ctx\.drawImage\(sourceImage/);

const wheelBlock = extractBlock('viewport.addEventListener("wheel"', '}, { passive: false });');
assert.match(wheelBlock, /scheduleCanvasTransform\(\)/);
assert.match(wheelBlock, /scheduleCanvasViewportSave\(\)/);
assert.doesNotMatch(wheelBlock, /scheduleCanvasSave\(\)/);
assert.match(extractFunction("scheduleCanvasTransform"), /requestAnimationFrame/);
assert.match(extractFunction("scheduleCanvasViewportSave"), /saveCanvasBoardNow/);
assert.doesNotMatch(extractFunction("scheduleCanvasViewportSave"), /recordCanvasUndoCheckpoint/);
assert.doesNotMatch(extractFunction("beginCanvasPan"), /scheduleCanvasSave\(\)/);

assert.match(styles, /\.deferred-image:not\(\[src\]\)/);
assert.match(styles, /#canvasPlane img\[data-canvas-original-src\][\s\S]*content-visibility:\s*visible/);
assert.match(index, /image-loading-rules\.js\?v=20260819-detail-stability/);
assert.match(index, /styles\.css\?v=20260827-atomic-image/);
assert.match(index, /image-resource-manager\.js\?v=20260827-atomic-image/);
assert.match(index, /script\.js\?v=20260827-atomic-image&vh=20260812-video-history-gallery&mj=20260806-hd/);

console.log("Global image demand loading checks passed.");
