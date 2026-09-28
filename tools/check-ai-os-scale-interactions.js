"use strict";

const fs = require("node:fs");
const path = require("node:path");
const display = require("../ai-os-display");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const shellStyles = fs.readFileSync(path.join(ROOT, "desktop-shell.css"), "utf8");
const browserSmoke = fs.readFileSync(path.join(ROOT, "tools/check-ai-os-browser.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const failures = [];

function expectSource(label, pattern, text = source) {
  if (!pattern.test(text)) failures.push(label);
}

function rejectSource(label, pattern, text = source) {
  if (pattern.test(text)) failures.push(label);
}

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function elementSourceById(markup, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\bid=["']${escapedId}["'][^>]*>`, "i").exec(markup);
  if (!opening) return "";
  const tagName = opening[1];
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(markup))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) return markup.slice(opening.index, tagPattern.lastIndex);
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
  }
  return "";
}

if (display.logicalDelta(150, 1.5) !== 100) {
  failures.push("display logicalDelta must convert 150 physical pixels to 100 logical pixels at 150%");
}
if (typeof display.currentScale !== "function") {
  failures.push("AiOsDisplay must provide currentScale for interaction normalization");
} else {
  if (display.currentScale({ dataset: { uiScale: "1.5" } }) !== 1.5) {
    failures.push("AiOsDisplay.currentScale must read the active root scale");
  }
  if (display.currentScale(null) !== 1) {
    failures.push("AiOsDisplay.currentScale must default a missing root to 1");
  }
}

expectSource(
  "toSystemDelta must delegate once to AiOsDisplay.logicalDelta/currentScale",
  /function toSystemDelta\(value\)\s*\{\s*return window\.AiOsDisplay\?\.logicalDelta\(value, window\.AiOsDisplay\.currentScale\(document\.documentElement\)\) \?\? value;\s*\}/,
);

expectSource("canvas wheel anchor must use logical viewport coordinates", /const before = screenToCanvas\(\s*toSystemDelta\(event\.clientX - rect\.left\),\s*toSystemDelta\(event\.clientY - rect\.top\),?\s*\)/);
expectSource("canvas wheel x offset must use one system delta", /canvasState\.x = toSystemDelta\(event\.clientX - rect\.left\) - before\.x \* canvasState\.scale;/);
expectSource("canvas wheel y offset must use one system delta", /canvasState\.y = toSystemDelta\(event\.clientY - rect\.top\) - before\.y \* canvasState\.scale;/);
expectSource("scene-layer pointer hit test must use logical viewport coordinates", /canvasSceneLayer\?\.hitTest\(\s*toSystemDelta\(event\.clientX - viewportRect\.left\),\s*toSystemDelta\(event\.clientY - viewportRect\.top\),?\s*\)/);

const pan = functionSource("beginCanvasPan");
expectSource("canvas pan x delta must use one system delta", /canvasState\.x = start\.offsetX \+ toSystemDelta\(moveEvent\.clientX - start\.x\);/, pan);
expectSource("canvas pan y delta must use one system delta", /canvasState\.y = start\.offsetY \+ toSystemDelta\(moveEvent\.clientY - start\.y\);/, pan);
rejectSource("canvas pan must reject a direct client x delta", /canvasState\.x = start\.offsetX \+ moveEvent\.clientX - start\.x;/, pan);
rejectSource("canvas pan must reject a direct client y delta", /canvasState\.y = start\.offsetY \+ moveEvent\.clientY - start\.y;/, pan);

const nodeDrag = functionSource("beginCanvasNodeDrag");
expectSource("node move x delta must use system delta before canvas zoom", /const deltaX = toSystemDelta\(moveEvent\.clientX - start\.x\) \/ canvasState\.scale;/, nodeDrag);
expectSource("node move y delta must use system delta before canvas zoom", /const deltaY = toSystemDelta\(moveEvent\.clientY - start\.y\) \/ canvasState\.scale;/, nodeDrag);

const nodeResize = functionSource("beginCanvasNodeResize");
expectSource("node resize x delta must use system delta before canvas zoom", /const deltaX = toSystemDelta\(moveEvent\.clientX - start\.x\) \/ canvasState\.scale;/, nodeResize);
expectSource("node resize y delta must use system delta before canvas zoom", /const deltaY = toSystemDelta\(moveEvent\.clientY - start\.y\) \/ canvasState\.scale;/, nodeResize);

const marquee = functionSource("beginCanvasMarquee");
expectSource("marquee start x must be a logical local coordinate", /x: toSystemDelta\(event\.clientX - rect\.left\)/, marquee);
expectSource("marquee start y must be a logical local coordinate", /y: toSystemDelta\(event\.clientY - rect\.top\)/, marquee);
expectSource("marquee move x must be a logical local coordinate", /const currentX = toSystemDelta\(moveEvent\.clientX - rect\.left\);/, marquee);
expectSource("marquee move y must be a logical local coordinate", /const currentY = toSystemDelta\(moveEvent\.clientY - rect\.top\);/, marquee);
expectSource("marquee hit testing must use the rendered physical rectangle", /selectCanvasNodesInScreenRect\(box\.getBoundingClientRect\(\)\);/, marquee);
const marqueeSelection = functionSource("selectCanvasNodesInScreenRect");
expectSource("scene marquee must query rendered scene regions", /canvasSceneLayer\?\.getItemsInRect/, marqueeSelection);
rejectSource("scene marquee must not promote unloaded images into DOM", /ensureCanvasNodeMounted|loadCanvasSceneNode/, marqueeSelection);
expectSource("scene marquee selection must retain all hit IDs", /canvasState\.selectedIds = selectedIds;/, marqueeSelection);
const selectionFrame = functionSource("updateCanvasSelectionFrame");
expectSource("selection frame x geometry must normalize DOMRect differences", /const left = toSystemDelta\(Math\.min\(\.\.\.rects\.map\(\(rect\) => rect\.left\)\) - viewportRect\.left\) - 8;/, selectionFrame);
expectSource("selection frame y geometry must normalize DOMRect differences", /const top = toSystemDelta\(Math\.min\(\.\.\.rects\.map\(\(rect\) => rect\.top\)\) - viewportRect\.top\) - 8;/, selectionFrame);

const crop = functionSource("handleCanvasCropPointerDown");
expectSource("canvas image crop x delta must use system delta before canvas zoom", /const dx = toSystemDelta\(moveEvent\.clientX - startX\) \/ canvasState\.scale;/, crop);
expectSource("canvas image crop y delta must use system delta before canvas zoom", /const dy = toSystemDelta\(moveEvent\.clientY - startY\) \/ canvasState\.scale;/, crop);

const desktopHtml = elementSourceById(html, "aiOsDesktop");
if (!desktopHtml) failures.push("scaled desktop root must have a balanced element boundary");
expectSource("authenticated lightbox must be structurally contained by the scaled desktop root", /id="lightbox"/, desktopHtml);
if ((html.match(/id="lightbox"/g) || []).length !== 1) failures.push("authenticated lightbox must have exactly one DOM instance");
const cropWorkbench = functionSource("ensureCanvasCropWorkbenchMarkup");
expectSource("crop workbench must mount inside the scaled desktop root", /\(document\.querySelector\("#aiOsDesktop"\) \|\| document\.body\)\.append\(workbench\);/, cropWorkbench);
rejectSource("crop workbench must not mount directly on body", /document\.body\.append\(workbench\);/, cropWorkbench);
expectSource("top-layer dialogs derive their size from the logical viewport", /\.ai-os-dialog\s*\{[^}]*calc\(var\(--system-viewport-width\)\s*-\s*32px\)[^}]*transform:\s*scale\(var\(--system-scale\)\)/s, shellStyles);
for (const [label, pattern] of [
  ["lightbox image", /\.lightbox img\s*\{[^}]*max-width:\s*min\(1100px,\s*calc\(var\(--system-viewport-width\)\s*-\s*84px\)\)[^}]*max-height:\s*calc\(var\(--system-viewport-height\)\s*-\s*84px\)/s],
  ["lightbox comparison", /\.lightbox-compare\s*\{[^}]*width:\s*min\(1420px,\s*calc\(var\(--system-viewport-width\)\s*-\s*84px\)\)[^}]*height:\s*min\(920px,\s*calc\(var\(--system-viewport-height\)\s*-\s*84px\)\)/s],
  ["mask editor", /\.canvas-mask-dialog\s*\{[^}]*width:\s*min\(1040px,\s*calc\(var\(--system-viewport-width\)\s*-\s*72px\)\)/s],
  ["crop workbench", /\.canvas-crop-workbench-panel\s*\{[^}]*max-height:\s*min\(820px,\s*calc\(var\(--system-viewport-height\)\s*-\s*48px\)\)/s],
]) expectSource(`${label} must use scaled-root percentages instead of physical viewport units`, pattern, styles);
const maskEditor = functionSource("openCanvasMaskEditor");
expectSource("mask editor must mount inside the scaled desktop root", /\(document\.querySelector\("#aiOsDesktop"\) \|\| document\.body\)\.append\(modal\);/, maskEditor);
expectSource("mask image pan x must use one system delta", /view\.x = panStart\.viewX \+ toSystemDelta\(event\.clientX - panStart\.x\);/, maskEditor);
expectSource("mask image pan y must use one system delta", /view\.y = panStart\.viewY \+ toSystemDelta\(event\.clientY - panStart\.y\);/, maskEditor);
expectSource("mask zoom focus x must use one system delta", /x: toSystemDelta\(event\.clientX - rect\.left\)/, maskEditor);
expectSource("mask zoom focus y must use one system delta", /y: toSystemDelta\(event\.clientY - rect\.top\)/, maskEditor);
expectSource("mask default zoom center must use logical DOMRect dimensions", /const point = focus \|\| \{ x: toSystemDelta\(rect\.width\) \/ 2, y: toSystemDelta\(rect\.height\) \/ 2 \};/, maskEditor);
expectSource("mask brush cursor x must use one system delta", /brushCursor\.style\.left = toSystemDelta\(event\.clientX - rect\.left\) \+ "px";/, maskEditor);
expectSource("mask brush cursor y must use one system delta", /brushCursor\.style\.top = toSystemDelta\(event\.clientY - rect\.top\) \+ "px";/, maskEditor);
expectSource("mask brush size must derive from logical rendered dimensions", /const displayScale = Math\.min\(toSystemDelta\(rect\.width\) \/ Math\.max\(1, width\), toSystemDelta\(rect\.height\) \/ Math\.max\(1, height\)\) \|\| 1;/, maskEditor);

const previewPan = functionSource("startPreviewPan");
expectSource("preview image pan x must use one system delta", /previewState\.x = previewState\.originX \+ toSystemDelta\(moveEvent\.clientX - previewState\.startX\);/, previewPan);
expectSource("preview image pan y must use one system delta", /previewState\.y = previewState\.originY \+ toSystemDelta\(moveEvent\.clientY - previewState\.startY\);/, previewPan);
rejectSource("preview pan must reject a direct client x delta", /previewState\.x = previewState\.originX \+ moveEvent\.clientX - previewState\.startX;/, previewPan);
rejectSource("preview pan must reject a direct client y delta", /previewState\.y = previewState\.originY \+ moveEvent\.clientY - previewState\.startY;/, previewPan);
const previewWheel = functionSource("handlePreviewWheel");
expectSource("preview zoom anchor x must use one system delta", /const pointerX = toSystemDelta\(event\.clientX - \(rect\.left \+ rect\.width \/ 2\)\);/, previewWheel);
expectSource("preview zoom anchor y must use one system delta", /const pointerY = toSystemDelta\(event\.clientY - \(rect\.top \+ rect\.height \/ 2\)\);/, previewWheel);

for (const [name, label] of [
  ["handleOutpaintHandlePointerDown", "outpaint"],
  ["handleOutpaint2HandlePointerDown", "second outpaint"],
]) {
  const body = functionSource(name);
  expectSource(`${label} x delta must use system delta before editor scale`, /const dx = toSystemDelta\(moveEvent\.clientX - startX\) \/ scale;/, body);
  expectSource(`${label} y delta must use system delta before editor scale`, /const dy = toSystemDelta\(moveEvent\.clientY - startY\) \/ scale;/, body);
}

expectSource("canvas point conversion must normalize the local x coordinate once", /return screenToCanvas\(toSystemDelta\(clientX - rect\.left\), toSystemDelta\(clientY - rect\.top\)\);/, functionSource("getCanvasPointFromClient"));
for (const [name, label] of [
  ["showCanvasConnectMenu", "connect menu"],
  ["showCanvasNodeMenu", "node menu"],
]) {
  const body = functionSource(name);
  expectSource(`${label} x must use one system delta`, /const localX = toSystemDelta\(event\.clientX - rect\.left\);/, body);
  expectSource(`${label} y must use one system delta`, /const localY = toSystemDelta\(event\.clientY - rect\.top\);/, body);
}
expectSource("image menu x must use one system delta", /menu\.style\.left = `\$\{toSystemDelta\(event\.clientX - rect\.left\)\}px`;/, functionSource("showCanvasImageMenu"));
expectSource("image menu y must use one system delta", /menu\.style\.top = `\$\{toSystemDelta\(event\.clientY - rect\.top\)\}px`;/, functionSource("showCanvasImageMenu"));
expectSource("board menu x must use one system delta", /menu\.style\.left = `\$\{toSystemDelta\(clientX - rect\.left\)\}px`;/, functionSource("showCanvasBoardMenu"));
expectSource("board menu y must use one system delta", /menu\.style\.top = `\$\{toSystemDelta\(clientY - rect\.top\)\}px`;/, functionSource("showCanvasBoardMenu"));

// These paths already normalize a physical delta by a physical DOMRect dimension.
// Applying toSystemDelta as well would divide by the system scale twice.
expectSource("free crop drag must retain DOMRect ratio normalization", /\(moveEvent\.clientX - startX\) \/ Math\.max\(1, bounds\.width\)/, functionSource("startCanvasCropWorkbenchFreeRectDrag"));
expectSource("crop cell pan must retain DOMRect ratio normalization", /\(moveEvent\.clientX - startX\) \/ Math\.max\(1, bounds\.width\) \/ start\.zoom/, functionSource("startCanvasCropWorkbenchCellPan"));
expectSource("grid cell pan must retain DOMRect ratio normalization", /deltaX \/ Math\.max\(1, rect\.width\) \/ start\.zoom/, functionSource("startCanvasGridEditorCellPan"));
expectSource("Comfy outpaint must retain visual DOMRect normalization", /\(moveEvent\.clientX - startX\) \/ visualScaleX/, functionSource("handleCanvasComfyOutpaintDrag"));
rejectSource("free crop drag must not double-divide a DOMRect ratio", /toSystemDelta\(moveEvent\.clientX - startX\) \/ Math\.max\(1, bounds\.width\)/, functionSource("startCanvasCropWorkbenchFreeRectDrag"));
rejectSource("Comfy outpaint must not double-divide its visual DOMRect ratio", /toSystemDelta\(moveEvent\.clientX - startX\) \/ visualScaleX/, functionSource("handleCanvasComfyOutpaintDrag"));

expectSource("browser smoke must choose 150% after opening settings", /data-ai-app="settings"[\s\S]*data-settings-scale="1\.5"/, browserSmoke);
expectSource("browser smoke must assert a 1.5 desktop matrix", /assertScaleMatrix\(page, 1\.5\)/, browserSmoke);
expectSource("browser smoke must drag a titlebar by 150 physical pixels", /dragBy\(page, chatTitlebar, 150, 0\)/, browserSmoke);
expectSource("browser smoke must assert a roughly 100px logical window delta", /assertApprox\(chatAfterX - chatBeforeX, 100, 3/, browserSmoke);
expectSource("browser smoke must pan the canvas by a measured physical delta", /dragBy\(page, canvasViewport, 150, 75, "middle"\)/, browserSmoke);
expectSource("browser smoke must assert inverse-scaled canvas x", /assertApprox\(canvasAfter\.x - canvasBefore\.x, 100, 3/, browserSmoke);
expectSource("browser smoke must assert inverse-scaled canvas y", /assertApprox\(canvasAfter\.y - canvasBefore\.y, 50, 3/, browserSmoke);
expectSource("browser smoke must restore 100%", /data-settings-scale="1"[\s\S]*assertScaleMatrix\(page, 1\)/, browserSmoke);
if (packageJson.scripts?.["check:scale-interactions"] !== "node tools/check-ai-os-scale-interactions.js") {
  failures.push("package scripts must expose check:scale-interactions");
}

if (failures.length) {
  console.error("AI OS scale interaction checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("AI OS scale interaction checks passed.");
}
