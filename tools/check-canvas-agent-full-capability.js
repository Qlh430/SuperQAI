const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");

assert.match(source, /const CanvasAgentCanvasApi\s*=\s*Object\.freeze/);
[
  "getBoardId",
  "getNode",
  "getNodes",
  "createNode",
  "updateNode",
  "duplicateNodes",
  "moveNodes",
  "arrangeNodes",
  "connect",
  "disconnect",
  "setReferenceOrder",
  "group",
  "ungroup",
  "updateGallery",
  "updateGrid",
  "extractGrid",
  "focusNodes",
  "organizeNodes",
  "cropImage",
  "openMaskEditor",
  "runNode",
  "generateImageToGallery",
  "requestImageNodeChoice",
  "requestDesignBrief",
  "deleteNodes",
  "director3dApplyAnimation",
  "scheduleCheckpoint",
].forEach((name) => assert.match(source, new RegExp(`\\b${name}:`), `${name} must be exposed`));

assert.match(source, /function createCanvasOperationGuard/);
assert.match(source, /function generateAgentCanvasImageToGallery/);
assert.match(source, /function applyAgentCanvasDirector3d/);
assert.match(source, /function requestAgentImageNodeChoice/);
assert.match(source, /function requestAgentDesignBrief/);
assert.match(source, /function focusAgentCanvasNodesInViewport/);
assert.match(source, /function focusAgentCanvasNodes/);
assert.match(source, /function organizeAgentCanvasNodes/);
assert.match(source, /function cropAgentCanvasImage/);
assert.match(source, /function openAgentCanvasMaskEditor/);
assert.match(source, /decision_required:\s*true/);
assert.match(source, /current_prompt/);
assert.match(source, /suggested_prompt/);
assert.match(source, /generateImageToGallery:\s*generateAgentCanvasImageToGallery/);
assert.match(source, /resolveCanvasAgentImageModel/);
assert.match(source, /ensureCanvasAgentImageModelCandidate/);
assert.match(source, /canvasImageModelsLoadPromise/);
assert.match(source, /requestedModel:\s*explicitModel/);
assert.match(source, /defaultModelFamily:\s*"gpt-image-2"/);
assert.doesNotMatch(source, /preferredId:\s*String\(imageModelInput/);
assert.match(source, /runCanvasImageEdit\(node,\s*\{\s*guard,\s*autoFailover:\s*true\s*\}\)/);
assert.match(source, /gallery_node_id/);
assert.match(source, /already_present:\s*true/);
assert.match(source, /function findConnectedCanvasGallery/);
assert.match(source, /canvasState\.connections[\s\S]{0,240}from === sourceNode\.dataset\.id/);
assert.match(source, /function getSafeCanvasImageGenerationError/);
assert.match(source, /code:\s*"gallery_update_failed"/);
assert.match(source, /void saveImageHistory\(`画布编辑：\$\{prompt\}`/);
assert.match(source, /function assertCanvasAgentContext/);
assert.match(source, /function hasCanvasAgentNumber/);
assert.doesNotMatch(source, /Number\.isFinite\(Number\(args\.(?:x|y|start_x|start_y|uniform_gap)\)\)/);
assert.match(source, /args\.source_node_id[\s\S]{0,500}addCanvasImage\(/);
assert.match(source, /changes\.comfy_mode/);
assert.match(source, /changes\.comfy_padding/);
assert.match(source, /changes\.comfy_qwen_angle/);
assert.match(source, /args\.prompt[\s\S]{0,700}addCanvasText/);
assert.match(source, /output\.type === "text"[\s\S]{0,700}canvas-node-comfy/);
assert.match(source, /args\.add_node_ids[\s\S]{0,900}getCanvasNodeOutput/);
assert.match(source, /args\.active_image_id[\s\S]{0,700}activeImageId/);
assert.match(source, /galleryColumns/);
assert.match(source, /galleryGap/);
assert.match(source, /state\.rows\s*\*\s*state\.columns\s*>\s*maxTargets/);
assert.match(source, /node\.dataset\.boardId\s*=\s*String\(canvasState\.activeBoardId/);
assert.match(source, /runCanvasImageEdit\(node,\s*options\)/);
assert.match(source, /runCanvasLlmNode\(node,\s*options\)/);
assert.match(source, /runCanvasComfyNode\(node,\s*options\)/);
assert.match(source, /runCanvasMinimaxH3Node\(node,\s*options\)/);
assert.match(source, /outputCanvasGridEditorGallery\(node,\s*options\)/);
assert.ok((source.match(/guard\?\.assertActive\(\)/g) || []).length >= 16, "async result commits must be guarded repeatedly");
assert.doesNotMatch(source, /boardId:\s*node\.dataset\.boardId[\s\S]{0,120}serializeCanvasNode/);

console.log("Canvas agent full current-canvas capability checks passed.");
