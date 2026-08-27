const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const STYLE_SOURCE = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyMarker = source.indexOf(") {", start);
  assert.notStrictEqual(bodyMarker, -1, `Missing function body for ${name}`);
  const bodyStart = bodyMarker + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

let nextId = 0;
const dataContext = {
  createId: () => `legacy-${++nextId}`,
};
vm.runInNewContext([
  extractFunction(SCRIPT_SOURCE, "normalizeCanvasGalleryImages"),
  extractFunction(SCRIPT_SOURCE, "resolveCanvasGalleryActiveImage"),
].join("\n"), dataContext);

const normalized = JSON.parse(JSON.stringify(dataContext.normalizeCanvasGalleryImages([
  { src: "/old.png", name: "旧图" },
  { id: "new-id", src: "/new.png", savedUrl: "/saved.png", createdAt: "2026-07-29T00:00:00.000Z" },
])));
assert.deepStrictEqual(normalized, [
  { id: "legacy-1", src: "/old.png", name: "旧图", savedUrl: "/old.png", createdAt: "" },
  { id: "new-id", src: "/new.png", savedUrl: "/saved.png", createdAt: "2026-07-29T00:00:00.000Z", name: "生成图 2" },
]);
assert.strictEqual(
  dataContext.resolveCanvasGalleryActiveImage(normalized, "legacy-1").id,
  "legacy-1",
  "A saved active image should remain active",
);
assert.strictEqual(
  dataContext.resolveCanvasGalleryActiveImage(normalized, "missing").id,
  "new-id",
  "A missing active image should fall back to the newest image",
);
assert.strictEqual(
  dataContext.resolveCanvasGalleryActiveImage([], "missing"),
  null,
  "An empty gallery should not produce an active image",
);

const renderSource = extractFunction(SCRIPT_SOURCE, "renderCanvasGalleryNode");
const outputSource = extractFunction(SCRIPT_SOURCE, "getCanvasNodeOutput");
const appendSource = extractFunction(SCRIPT_SOURCE, "appendCanvasGenerationToGallery");
const removeSource = extractFunction(SCRIPT_SOURCE, "removeCanvasGalleryImage");
const historySource = extractFunction(SCRIPT_SOURCE, "renderCanvasGalleryHistory");
const galleryImagesSource = extractFunction(SCRIPT_SOURCE, "renderCanvasGalleryImages");
const aspectSource = extractFunction(SCRIPT_SOURCE, "syncCanvasGalleryAspectRatio");
const coverGestureSource = extractFunction(SCRIPT_SOURCE, "bindCanvasGalleryCoverInteraction");
const historyDragSource = extractFunction(SCRIPT_SOURCE, "bindCanvasGalleryItemDrag");
const dropSource = extractFunction(SCRIPT_SOURCE, "createCanvasImageFromGalleryDrop");
const canvasPanSource = extractFunction(SCRIPT_SOURCE, "beginCanvasPan");
const nodeMenuSource = extractFunction(SCRIPT_SOURCE, "showCanvasNodeMenu");
const nodeBarSource = extractFunction(SCRIPT_SOURCE, "createCanvasNodeBar");
const galleryNodeDeleteSource = extractFunction(SCRIPT_SOURCE, "requestCanvasGalleryNodeDelete");
const galleryImageDeleteSource = extractFunction(SCRIPT_SOURCE, "requestCanvasGalleryImageDelete");
const deleteConfirmSource = extractFunction(SCRIPT_SOURCE, "requestCanvasDeleteConfirmation");
const deleteUndoSource = extractFunction(SCRIPT_SOURCE, "showCanvasDeleteUndo");

const copyCalls = [];
const copiedNode = { dataset: {}, offsetWidth: 200, offsetHeight: 100 };
const copyContext = {
  addCanvasImage: (src, name, point) => {
    copyCalls.push({ type: "add", src, name, point });
    return copiedNode;
  },
  updateCanvasNodePosition: (node) => copyCalls.push({ type: "position", node }),
  selectCanvasNode: (node) => copyCalls.push({ type: "select", node }),
  scheduleCanvasSave: () => copyCalls.push({ type: "save" }),
  setCanvasStatus: (message) => copyCalls.push({ type: "status", message }),
};
vm.runInNewContext(dropSource, copyContext);
copyContext.createCanvasImageFromGalleryDrop(
  { src: "/copy.png", savedUrl: "/saved-copy.png", name: "历史图片" },
  { x: 500, y: 300 },
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(copyCalls[0])),
  { type: "add", src: "/saved-copy.png", name: "历史图片", point: { x: 500, y: 300 } },
  "History drag should add a new image node from the saved image URL",
);
assert.strictEqual(copiedNode.dataset.x, "400", "Copied image should be centered horizontally on the drop point");
assert.strictEqual(copiedNode.dataset.y, "250", "Copied image should be centered vertically on the drop point");
assert(copyCalls.some((call) => call.type === "select"), "The copied image node should become selected");
assert(copyCalls.some((call) => call.type === "save"), "The copied image node should be saved");

const boundaryMenu = { hidden: true, offsetWidth: 236, offsetHeight: 200, style: {} };
const boundaryViewport = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
};
const boundaryContext = {
  canvasState: {},
  document: {
    querySelector: (selector) => selector === "#canvasNodeMenu" ? boundaryMenu : boundaryViewport,
  },
  screenToCanvas: (x, y) => ({ x, y }),
};
vm.runInNewContext(nodeMenuSource, boundaryContext);
boundaryContext.showCanvasNodeMenu({ clientX: 790, clientY: 580 });
assert.strictEqual(boundaryMenu.hidden, false, "Node menu should become visible");
assert.strictEqual(boundaryMenu.style.left, "542px", "Node menu should stay inside the right edge");
assert.strictEqual(boundaryMenu.style.top, "380px", "Node menu should flip above a bottom-edge click");
assert.strictEqual(boundaryMenu.style.transform, "translate(10px, -10px)", "An upward menu should keep a gap from the pointer");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(boundaryContext.canvasState.menuPoint)),
  { x: 790, y: 580 },
  "Boundary correction must not change the canvas insertion point",
);

assert(renderSource.includes("canvas-gallery-stack"), "Gallery nodes should render a stacked cover");
assert(renderSource.includes("canvas-gallery-history-panel"), "Gallery nodes should render a history panel");
assert(renderSource.includes('classList.toggle("canvas-gallery-frameless"'), "A gallery with images should become frameless");
assert(renderSource.includes('data-lucide="images"'), "Gallery history should use a functional image-stack icon");
assert(
  renderSource.includes("requestAnimationFrame") && renderSource.includes("lucide?.createIcons"),
  "Gallery icons should hydrate after the dynamic node is attached",
);
["download", "trash-2"].forEach((icon) => {
  assert(historySource.includes(`data-lucide="${icon}"`), `Missing gallery history icon: ${icon}`);
});
assert(!historySource.includes('data-lucide="expand"'), "Gallery history should not keep a separate preview action");
assert(SCRIPT_SOURCE.includes("galleryActiveImageId"), "Gallery active image ID should be persisted");
assert(outputSource.includes("getCanvasGalleryActiveImage"), "Gallery output should read the active image");
assert(outputSource.includes('type: "image"'), "Gallery output should be one image");
assert(appendSource.includes("setCanvasGalleryActiveImage"), "New images should become active");
assert(removeSource.includes("resolveCanvasGalleryActiveImage"), "Deleting the active image should fall back");
assert(galleryImagesSource.includes("Math.min(5"), "Gallery should render at most five back layers");
assert(galleryImagesSource.includes("syncCanvasGalleryAspectRatio"), "Cover load should sync the active image ratio");
assert(aspectSource.includes("--canvas-gallery-aspect-ratio"), "Active ratio should be exposed to CSS");
assert(coverGestureSource.includes("distance < 6"), "Cover movement should use a 6px activation threshold");
assert(!coverGestureSource.includes("openCanvasGalleryPreview"), "A stationary cover click should only select the canvas node");
assert(historyDragSource.includes("isCanvasClientPoint"), "History drag should only copy inside the canvas");
assert(historyDragSource.includes("isClientPointInsideElement"), "History drag should use stable coordinate boundaries");
assert(!historyDragSource.includes("document.elementFromPoint"), "History drag should not depend on pointer-capture hit testing");
assert(historyDragSource.includes('"mousedown"'), "History items should start a dedicated mouse drag gesture");
assert(historyDragSource.includes('window.addEventListener("mousemove"'), "Mouse drag should continue after leaving the history panel");
assert(!dropSource.includes("replaceCanvasImageNode"), "History drag should never replace an existing image node");
assert(!canvasPanSource.includes("start.nodes"), "Canvas panning should not read node-drag state");
assert(nodeMenuSource.includes("offsetHeight"), "Node menu placement should measure its rendered height");
assert(nodeBarSource.includes("requestCanvasGalleryNodeDelete"), "Gallery node deletion should require confirmation");
assert(historySource.includes("requestCanvasGalleryImageDelete"), "Gallery image deletion should require confirmation");
assert(galleryNodeDeleteSource.includes("deleteCanvasNodes"), "Confirmed gallery deletion should remove the node");
assert(galleryImageDeleteSource.includes("removeCanvasGalleryImage"), "Confirmed history deletion should remove the image");
assert(deleteConfirmSource.includes("canvasDeleteConfirm"), "Delete confirmation should use the dedicated dialog");
assert(deleteConfirmSource.includes("aria-hidden"), "Delete confirmation visibility should be accessible");
assert(deleteUndoSource.includes("undoCanvasChange"), "Delete feedback should provide a working undo action");
assert(deleteUndoSource.includes("10000"), "Quick delete undo should remain available for ten seconds");
assert(deleteUndoSource.includes("canvasDeleteUndoCountdown"), "Delete feedback should update a visible countdown");
assert(deleteUndoSource.includes("setInterval"), "Delete feedback countdown should update while visible");
assert(SCRIPT_SOURCE.includes('id="canvasDeleteUndoCountdown">10</b>'), "Delete feedback should render the countdown value");
assert(SCRIPT_SOURCE.includes("删除整个图集？"), "Gallery delete confirmation should explain the target");
assert(SCRIPT_SOURCE.includes("删除这张图片？"), "History delete confirmation should explain the target");
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-gallery\.canvas-gallery-frameless\s*\{[^}]*background:\s*transparent/s,
  "Frameless galleries should not draw an outer card",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-gallery-history-item > \.canvas-gallery-history-select\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  "History cards should use the full preview width instead of the legacy thumbnail column",
);

assert.match(
  STYLE_SOURCE,
  /\.canvas-node-gallery\.canvas-gallery-frameless > \.canvas-gallery-stack\s*\{[^}]*aspect-ratio:\s*var\(--canvas-gallery-aspect-ratio/s,
  "Frameless gallery covers should follow the active image ratio",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-gallery\.canvas-gallery-frameless \.canvas-gallery-history-toggle b\s*\{[^}]*background:\s*var\(--accent\)/s,
  "Gallery history count should use the active theme color",
);
assert(
  !STYLE_SOURCE.includes("rgba(124, 98, 244") && !STYLE_SOURCE.includes("#7c62f4"),
  "Gallery history entry must not use hard-coded purple styling",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-gallery\.is-gallery-history-open\s*\{[^}]*z-index:\s*70/s,
  "An open gallery history panel should raise its owning node above neighboring nodes",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-delete-confirm-card\s*\{[^}]*background:\s*#fff/s,
  "The light delete dialog should use an opaque surface",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-delete-confirm-copy p\s*\{[^}]*color:\s*#5f6368/s,
  "The light delete dialog description should have readable contrast",
);
assert.match(
  STYLE_SOURCE,
  /:root\[data-theme="dark"\] \.canvas-delete-confirm-card\s*\{[^}]*background:\s*#1c1c1e/s,
  "The dark delete dialog should use an opaque surface",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-delete-undo\s*\{[^}]*transform:\s*translateX\(-50%\)/s,
  "Delete undo feedback should be centered from its midpoint",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-delete-undo-copy strong\s*\{[^}]*color:\s*#fff/s,
  "Delete undo feedback title should remain readable on the dark surface",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-gallery\.canvas-gallery-frameless \.canvas-gallery-history-toggle\s*\{[^}]*bottom:\s*28px[^}]*justify-content:\s*center/s,
  "The compact history control should be centered and lifted above the resize handle",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-gallery\.canvas-gallery-frameless \.canvas-gallery-stack-layer,\s*\.canvas-node-gallery\.canvas-gallery-frameless \.canvas-gallery-cover\s*\{[^}]*border-radius:\s*clamp\(16px,\s*4cqw,\s*24px\)/s,
  "Frameless gallery corners should use the reduced radius",
);
assert.match(
  SCRIPT_SOURCE,
  /viewport\.addEventListener\("pointerdown",\s*\(event\)\s*=>\s*\{\s*if \(!event\.target\.closest\("\.canvas-gallery-history-panel, \.canvas-gallery-history-toggle"\)\)\s*\{\s*closeCanvasGalleryHistoryPanels\(\)/s,
  "Clicking blank canvas space should close gallery history",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-gallery-history-close\s*\{[^}]*border-radius:\s*50%[^}]*background:\s*color-mix/s,
  "Gallery history close should have a circular backing surface",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-gallery-history-close\s*\{[^}]*place-items:\s*center[^}]*line-height:\s*0/s,
  "Gallery history close should center its icon without text baseline offset",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-gallery-history-close svg\s*\{[^}]*display:\s*block[^}]*margin:\s*0[^}]*transform:\s*none/s,
  "Gallery history close icon should sit exactly at the center of its circle",
);
assert.match(
  STYLE_SOURCE,
  /#canvasNodeMenu\s*\{[^}]*max-height:\s*calc\(100% - 24px\)[^}]*overflow-y:\s*auto/s,
  "The double-click node menu should remain scrollable in a short viewport",
);

[
  ".canvas-gallery-stack",
  ".canvas-gallery-stack-layer",
  ".canvas-gallery-cover",
  ".canvas-gallery-history-toggle",
  ".canvas-gallery-history-panel",
  ".canvas-gallery-history-item.is-active",
  ".canvas-gallery-history-item > .canvas-gallery-history-select",
  ".canvas-gallery-history-action svg",
  ".canvas-gallery-history-remove",
  ".canvas-delete-confirm",
  ".canvas-delete-confirm-card",
  ".canvas-delete-undo",
  ".canvas-delete-undo-action",
].forEach((selector) => {
  assert(STYLE_SOURCE.includes(selector), `Missing gallery history style: ${selector}`);
});

console.log("Canvas gallery history checks passed.");
