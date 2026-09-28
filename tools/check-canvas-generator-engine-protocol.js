const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("script.js", "utf8");
const rendererSource = fs.readFileSync("canvas-generator-node-renderer.js", "utf8");
const comfyRendererSource = fs.readFileSync("canvas-comfy-node-renderer.js", "utf8");

function extractFunction(name, target = source) {
  const start = target.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = target.indexOf("\nfunction ", start + 10);
  return target.slice(start, next >= 0 ? next : target.length);
}

const render = extractFunction("renderCanvasImageNode");
const renderer = extractFunction("render", rendererSource);
const apiRender = extractFunction("renderCanvasApiNode");
const apiAdd = extractFunction("addCanvasApiNode");
const comfyRender = extractFunction("renderCanvasComfyNode");
const comfyRenderer = extractFunction("render", comfyRendererSource);
const comfyAdd = extractFunction("addCanvasComfyNode");
const run = extractFunction("runCanvasImageEdit");
const serialize = extractFunction("serializeCanvasNode");
const legacyMigration = extractFunction("isLegacyCanvasComfyGenerator");
const restore = extractFunction("restoreCanvasBoardNode");
const paste = extractFunction("pasteCanvasNodes");
const agentCreate = extractFunction("createAgentCanvasNode");

assert.match(source, /data-canvas-node="image-generator"[^>]*data-node-type="image"/);
assert.match(source, /<span>图片生成<\/span>/);
assert.match(source, /data-canvas-node="video-generator"[^>]*data-node-type="video"/);
assert.match(source, /<span>视频生成<\/span>/);
assert.doesNotMatch(source, /data-canvas-node="(?:generator|comfy|minimax-h3|video-api)"/);
assert.match(apiAdd, /renderCanvasApiNode/);
assert.match(apiRender, /canvas-node-generator/);
assert.match(apiRender, /canvas-node-api/);
assert.match(apiRender, /canvasEngine.*api|canvasEngine.*=.*["']api["']/s);
assert.match(render, /CanvasGeneratorNodeRenderer/);
assert.doesNotMatch(renderer, /canvas-node-engine/);
assert.doesNotMatch(renderer, /canvas-node-comfy-workflow/);
assert.doesNotMatch(renderer, /syncEngineControls/);
assert.doesNotMatch(renderer, /canvas-node-platform/);
assert.doesNotMatch(renderer, /fillCanvasNodePlatformSelect/);
assert.match(renderer, /fillCanvasNodeModelSelect\([^)]*[,)]/);
assert.match(renderer, /getImageModelPlatform/);
assert.match(comfyAdd, /canvasNodeType.*comfy|canvas-node-comfy/);
assert.match(comfyRender, /CanvasComfyNodeRenderer/);
assert.match(comfyRenderer, /CANVAS_GENERATION_FAMILIES\.image\.label/);
assert.doesNotMatch(comfyRenderer, /canvas-node-engine/);
assert.match(source, /function addCanvasImageGeneratorNode[\s\S]{0,220}addCanvasApiNode/);
assert.match(source, /function addCanvasVideoGeneratorNode[\s\S]{0,220}addCanvasApiVideoNode/);
assert.match(source, /function switchCanvasGenerationEngine/);
assert.match(source, /CANVAS_GENERATION_FAMILIES\s*=\s*Object\.freeze/);
assert.match(run, /comfyui/);
assert.match(run, /runCanvasComfyNode/);
assert.match(serialize, /base\.engine\s*=\s*["']api["']/);
assert.match(serialize, /base\.platform/);
assert.doesNotMatch(serialize, /base\.comfyWorkflow/);
assert.doesNotMatch(serialize, /querySelector\(["']\.canvas-node-engine/);
assert.match(restore, /item\.platform/);
assert.match(restore, /item\.comfyWorkflow/);
assert.match(legacyMigration, /item\.engine/);
assert.match(legacyMigration, /comfyui/);
assert.match(restore, /legacyComfyGenerator/);
assert.match(restore, /renderCanvasComfyNode/);
assert.match(paste, /item\.platform/);
assert.match(paste, /legacyComfyGenerator/);
assert.match(paste, /renderCanvasComfyNode/);
assert.match(agentCreate, /effectiveKind/);
assert.match(agentCreate, /args\.engine[\s\S]*comfyui/);
assert.match(agentCreate, /addCanvasComfyNode/);

console.log("canvas generator engine protocol checks passed");
