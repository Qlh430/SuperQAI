const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const GridSlicingRules = require("../grid-slicing-rules");
const CanvasCropRules = require("../canvas-crop-rules");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const imageToolbar = fs.readFileSync(path.join(root, "canvas-image-toolbar.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const paramsStart = source.indexOf("(", start);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === "(") paramsDepth += 1;
    if (source[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) {
      bodyStart = source.indexOf("{", index);
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `Missing body for function ${name}`);
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
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const markup = extractFunction(script, "ensureCanvasCropWorkbenchMarkup");
const open = extractFunction(script, "openCanvasCropWorkbench");
const output = extractFunction(script, "createCanvasCropResultContainer");
["比例裁切", "自由裁切", "宫格裁切", "1:1", "9:16", "16:9"]
  .forEach((label) => assert.ok(markup.includes(label), `Missing workbench label ${label}`));
assert.ok(open.includes("memberId"));
assert.ok(output.includes("persistCanvasGridCrops"));
assert.ok(output.includes("createCanvasGalleryContainerWithSourceConnection"));
assert.ok(extractFunction(script, "outputCanvasCropWorkbench").includes("state.error"), "Invalid output must stay in the workbench with an error");
assert.match(styles, /\.canvas-crop-workbench\s*\{[^}]*position:\s*fixed/s);
assert.match(
  styles,
  /\.canvas-crop-workbench\s*\{[^}]*z-index:\s*10000/s,
  "the crop workbench must stay above the immersive canvas window layer",
);
assert.match(styles, /\.canvas-crop-workbench-frame\s*\{[^}]*cursor:\s*move/s);
assert.match(extractFunction(script, "startCanvasCropWorkbenchFreeRectDrag"), /updateCanvasCropWorkbenchPreviewGeometry\(/, "free-crop dragging must update preview geometry in place");
assert.doesNotMatch(extractFunction(script, "startCanvasCropWorkbenchFreeRectDrag"), /renderCanvasCropWorkbench\(\)/, "free-crop dragging must not rebuild the preview image");
assert.match(extractFunction(script, "startCanvasCropWorkbenchCellPan"), /updateCanvasCropWorkbenchPreviewGeometry\(/, "grid-cell panning must update preview geometry in place");
assert.doesNotMatch(extractFunction(script, "startCanvasCropWorkbenchCellPan"), /renderCanvasCropWorkbench\(\)/, "grid-cell panning must not rebuild the preview image");
assert.match(extractFunction(script, "renderCanvasCropWorkbenchPreview"), /updateCanvasCropWorkbenchPreviewGeometry\(\);/, "grid-cell zooming must update existing preview geometry without recreating thumbnails");
assert.match(styles, /\.canvas-crop-workbench-panel\s*\{[^}]*background:\s*#[0-9a-f]{6}/is, "the crop panel must use an opaque solid background");
assert.match(styles, /\.canvas-crop-workbench-controls\s*>\s*div\[hidden\]\s*\{[^}]*display:\s*none\s*!important/is, "only controls for the active crop mode may be visible");
assert.match(
  imageToolbar,
  /\["crop", "裁剪图片", "crop", onCrop\]/,
  "the selected image toolbar must expose the crop action",
);
assert.match(
  imageToolbar,
  /data-image-action="crop"[\s\S]*?canvas-node-image[\s\S]*?canvas-node-gallery-container/,
  "the toolbar must show crop for image nodes and gallery members only",
);
assert.match(
  script,
  /onCrop:\s*\(node, image\) => openCanvasCropWorkbench\(/,
  "the application must open the shared crop workbench from the image toolbar",
);

const openRuntime = new Function(`
  let canvasCropWorkbenchState = null;
  function setCanvasStatus() {}
  function getCanvasGalleryContainerMembers(node) { return node.members; }
  function getCanvasNodeOutput() { return null; }
  function loadImageElement() { return Promise.resolve({ width: 1, height: 1 }); }
  function createCanvasCropWorkbenchState(sourceNode, member) { return { sourceNode, memberId: member.id, source: member }; }
  function ensureCanvasCropWorkbenchMarkup() { return { hidden: true, querySelector() { return { focus() {} }; } }; }
  function renderCanvasCropWorkbench() {}
  ${extractFunction(script, "getCanvasCropWorkbenchSource")}
  ${extractFunction(script, "openCanvasCropWorkbench").replace(/^function openCanvasCropWorkbench/, "async function openCanvasCropWorkbench")}
  return async (sourceNode, memberId) => ({ opened: await openCanvasCropWorkbench(sourceNode, memberId), state: canvasCropWorkbenchState });
`);
const nonFirstMember = { id: "second", savedUrl: "/output/second.png", width: 1200, height: 900 };
const openedPromise = openRuntime()({
  members: [{ id: "first", savedUrl: "/output/first.png", width: 800, height: 800 }, nonFirstMember],
  classList: { contains: (className) => className === "canvas-node" || className === "canvas-node-gallery-container" },
}, "second");

const runtime = {
  createCanvasCropWorkbenchState: CanvasCropRules.createWorkbenchState,
  resolveCanvasCropWorkbenchAspectRatio: CanvasCropRules.resolveAspectRatio,
  getCanvasCropWorkbenchRatioCrop: CanvasCropRules.getRatioCrop,
  getCanvasCropWorkbenchGridCrops: CanvasCropRules.getGridCrops,
  validateCanvasCropWorkbenchCrops: CanvasCropRules.validateCrops,
};

const state = runtime.createCanvasCropWorkbenchState({ id: "source" }, {
  id: "member",
  savedUrl: "/output/original.png",
  width: 4032,
  height: 3024,
});
const ratioCrop = runtime.getCanvasCropWorkbenchRatioCrop(state);
assert.deepEqual(
  { x: ratioCrop.x, y: ratioCrop.y, width: ratioCrop.width, height: ratioCrop.height },
  { x: 504, y: 0, width: 3024, height: 3024 },
  "Ratio cropping must use recorded original dimensions, never a thumbnail's natural size",
);

Object.keys({ "1:1": 1, "4:3": 1, "3:4": 1, "3:2": 1, "2:3": 1, "16:9": 1, "9:16": 1 }).forEach((ratio) => {
  state.mode = "ratio";
  state.aspectRatio = ratio;
  const result = runtime.validateCanvasCropWorkbenchCrops(state);
  assert.equal(result.valid, true, `${ratio} must produce a valid pixel crop`);
  assert.ok(result.crops[0].width >= 1 && result.crops[0].height >= 1);
});

state.mode = "free";
state.freeRect = { x: 0.999, y: 0.999, width: 0.001, height: 0.001 };
const free = runtime.validateCanvasCropWorkbenchCrops(state);
assert.equal(free.valid, true);
assert.ok(free.crops.every((crop) => crop.width >= 1 && crop.height >= 1), "Free crops must be at least 1×1 pixels");

state.mode = "grid";
state.rows = 2;
state.columns = 3;
state.aspectRatio = "1:1";
state.cellTransforms = [];
const grid = runtime.validateCanvasCropWorkbenchCrops(state);
assert.equal(grid.valid, true);
assert.equal(grid.crops.length, 6);
assert.ok(grid.crops.every((crop) => crop.width >= 1 && crop.height >= 1), "Every grid cell must be at least 1×1 pixels");
assert.deepEqual(
  grid.crops.map(({ x, y, width, height }) => ({ x, y, width, height })),
  [
    { x: 0, y: 0, width: 1344, height: 1512 },
    { x: 1344, y: 0, width: 1344, height: 1512 },
    { x: 2688, y: 0, width: 1344, height: 1512 },
    { x: 0, y: 1512, width: 1344, height: 1512 },
    { x: 1344, y: 1512, width: 1344, height: 1512 },
    { x: 2688, y: 1512, width: 1344, height: 1512 },
  ],
  "A default grid must split the original image without re-centering or ratio cropping each cell",
);

state.rows = 1;
state.columns = 2;
state.aspectRatio = "16:9";
state.cellTransforms = [
  { key: "r1-c1", centerX: 0.5, centerY: 0.1, zoom: 2 },
  { key: "r1-c2", centerX: 0.5, centerY: 0.9, zoom: 2 },
];
const transformedCells = runtime.getCanvasCropWorkbenchGridCrops(state);
assert.ok(transformedCells[0].y < transformedCells[1].y, "Cell transforms must remain isolated by cell id");

state.mode = "free";
state.freeRect = { x: 0.5, y: 0.5, width: 0, height: 0 };
const invalidFree = runtime.validateCanvasCropWorkbenchCrops(state);
assert.equal(invalidFree.valid, false);
assert.match(invalidFree.error, /至少为 1×1/);

const missingDimensions = runtime.validateCanvasCropWorkbenchCrops({ ...state, sourceWidth: 0, sourceHeight: 0 });
assert.equal(missingDimensions.valid, false);
assert.match(missingDimensions.error, /缺少原图尺寸/);

const outputFailureRuntime = new Function(`
  let canvasCropWorkbenchState = { busy: false, error: "" };
  let renderCount = 0;
  function validateCanvasCropWorkbenchCrops() {
    return { valid: false, crops: [], error: "裁切区域无效：第 1 行第 1 列必须至少为 1×1 像素。" };
  }
  function renderCanvasCropWorkbench() { renderCount += 1; }
  async ${extractFunction(script, "outputCanvasCropWorkbench")}
  return async () => {
    const result = await outputCanvasCropWorkbench();
    return { result, state: canvasCropWorkbenchState, renderCount };
  };
`);

const outputBridgeRuntime = new Function(`
  let canvasCropWorkbenchState = { busy: false, sourceNode: { id: "source" }, source: { id: "member", savedUrl: "/output/original.png" }, mode: "grid", error: "" };
  let bridgeArgs = null;
  let closed = 0;
  function validateCanvasCropWorkbenchCrops() { return { valid: true, crops: [{ row: 1, column: 1, x: 0, y: 0, width: 1, height: 1 }], error: "" }; }
  function renderCanvasCropWorkbench() {}
  function loadImageElement() { return Promise.resolve({ width: 1, height: 1 }); }
  async function createCanvasCropResultContainer(...args) { bridgeArgs = args; return { id: "result" }; }
  function closeCanvasCropWorkbench() { closed += 1; }
  function setCanvasStatus() {}
  async ${extractFunction(script, "outputCanvasCropWorkbench")}
  return async () => ({ result: await outputCanvasCropWorkbench(), bridgeArgs, closed });
`);

(async () => {
  const opened = await openedPromise;
  assert.equal(opened.opened, true);
  assert.equal(opened.state.memberId, "second", "The workbench must resolve an active non-first member by id");
  assert.equal(opened.state.source.savedUrl, "/output/second.png");
  const result = await outputFailureRuntime()();
  assert.equal(result.result, null);
  assert.match(result.state.error, /至少为 1×1/);
  assert.equal(result.renderCount, 1, "Invalid output must render the error without closing the workbench");
  const bridge = await outputBridgeRuntime()();
  assert.deepEqual(bridge.result, { id: "result" });
  assert.equal(bridge.bridgeArgs[0].id, "source");
  assert.equal(bridge.bridgeArgs[1].id, "member");
  assert.equal(bridge.bridgeArgs[3], "grid");
  assert.equal(bridge.closed, 1, "Successful output must use the result-container bridge before closing");
  console.log("Canvas crop workbench checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
