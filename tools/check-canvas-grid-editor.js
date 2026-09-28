const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("../grid-slicing-rules.js");
const CanvasGridEditorRules = require("../canvas-grid-editor-rules.js");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const galleryRenderer = fs.readFileSync(path.join(root, "canvas-gallery-node-renderer.js"), "utf8");
const gridEditorRenderer = require("../canvas-grid-editor-node-renderer.js");

assert.equal(typeof gridEditorRenderer.render, "function", "the grid editor renderer must expose render");

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

const galleryRender = extractFunction(galleryRenderer, "render");
assert.ok(!galleryRender.includes("openCanvasCropWorkbench"), "A gallery header must not choose an arbitrary member for cropping");
assert.ok(extractFunction(script, "initializeCanvasBoard").includes("canvas-gallery-member"), "The shared crop workbench must be entered through the right-clicked gallery member");
assert.ok(!galleryRender.includes("openCanvasGridMenu"));
assert.ok(!galleryRender.includes("openCanvasGalleryGridSlicer(node)"));

assert.equal(script.indexOf("function ensureCanvasGridMenuMarkup"), -1, "The retired gallery menu must not shadow the workbench");
assert.equal(script.indexOf("function createCanvasDirectGridSlices"), -1, "Direct gallery slicing belongs to the workbench only");

const persist = extractFunction(script, "persistCanvasGridCrops");
assert.ok(persist.includes("Promise.allSettled"));
assert.ok(persist.includes("uploadCanvasImageFile"));

const addEditor = extractFunction(script, "addCanvasGridEditorNode");
assert.ok(addEditor.includes('createCanvasNode("grid-editor")'));
assert.ok(addEditor.includes("connectCanvasNodes"));

const renderEditor = gridEditorRenderer.render.toString();
["canvas-grid-editor-toolbar", "canvas-grid-editor-cells", "canvas-grid-editor-edit", "canvas-grid-editor-output"]
  .forEach((className) => assert.ok(renderEditor.includes(className)));

const createState = CanvasGridEditorRules.createState.toString();
assert.ok(createState.includes("sourceSrc"));
assert.ok(createState.includes("horizontalBands"));
assert.ok(createState.includes("verticalBands"));
assert.ok(createState.includes("cellTransforms"));

const normalizeState = CanvasGridEditorRules.normalizeState.toString();
assert.ok(normalizeState.includes("horizontalBands = layout.horizontalBands"));
assert.ok(normalizeState.includes("verticalBands = layout.verticalBands"));

const aspect = extractFunction(script, "setCanvasGridEditorAspect");
assert.ok(aspect.includes("normalizeCellTransforms"));
assert.ok(aspect.includes("scheduleCanvasSave"));

const uniformGap = extractFunction(script, "setCanvasGridEditorUniformGap");
assert.ok(uniformGap.includes("GridSlicingRules.applyUniformGap"));

const bandDrag = extractFunction(script, "startCanvasGridEditorBandDrag");
assert.ok(bandDrag.includes("GridSlicingRules.moveBand"));
assert.ok(bandDrag.includes("GridSlicingRules.resizeBandEdge"));

const cellPan = extractFunction(script, "startCanvasGridEditorCellPan");
assert.ok(cellPan.includes("centerX"));
assert.ok(cellPan.includes("centerY"));

const output = extractFunction(script, "outputCanvasGridEditorGallery");
assert.ok(output.includes("GridSlicingRules.getCellCrop"));
assert.ok(output.includes("GridSlicingRules.getCommonOutputSize"));
assert.ok(output.includes("persistCanvasGridCrops"));
assert.ok(output.includes("createCanvasGridSliceGallery"));
assert.ok(output.indexOf("persistCanvasGridCrops") < output.indexOf("createCanvasGridSliceGallery"));
assert.ok(output.includes("assertCanvasCropPersistenceComplete"), "grid-editor must verify every persisted crop before creating an output gallery");

const serialize = extractFunction(script, "serializeCanvasNode");
assert.ok(serialize.includes('base.kind === "grid-editor"'));
assert.ok(serialize.includes("gridEditorState"));

const kind = extractFunction(script, "getCanvasNodeKind");
assert.ok(kind.includes("canvas-node-grid-editor"));

const createKind = extractFunction(script, "getCanvasCreateKindFromSerialized");
assert.ok(createKind.includes('"grid-editor"'));

const remap = extractFunction(script, "remapCanvasGridEditorState");
assert.ok(remap.includes("sourceNodeId"));

console.log("Canvas grid editor static checks passed");
