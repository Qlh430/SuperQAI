const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const portable = fs.readFileSync(path.join(root, "build-portable.bat"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

assert.match(
  html,
  /canvas-paged-store\.js[\s\S]*canvas-viewport-data-source\.js[\s\S]*canvas-virtualizer\.js[\s\S]*script\.js/,
);
assert.match(script, /const canvasPagedStore\s*=/);
assert.match(script, /const canvasViewportDataSource\s*=/);
assert.match(script, /window\.canvasPagedStore\s*=\s*canvasPagedStore/);
assert.match(script, /window\.canvasViewportDataSource\s*=\s*canvasViewportDataSource/);
assert.match(script, /function stageCanvasOperation\(/);
assert.match(script, /async function flushCanvasOperations\(/);
assert.match(script, /function recordCanvasUndo\(/);
assert.match(script, /function undoCanvasCommand\(/);
assert.match(script, /function syncVisibleCanvasConnections\(/);
assert.match(script, /function getCanvasConnectionsForNode\(/);
assert.doesNotMatch(
  script,
  /async function saveCanvasBoardNow\(\)[\s\S]{0,900}serializeCanvasBoard\(\)/,
);
assert.doesNotMatch(
  script,
  /function recordCanvasUndo\([\s\S]{0,700}serializeCanvasBoard\(\)/,
);
assert.match(script, /activeBoardRevision/);
assert.match(script, /canvasViewportDataSource\.request/);
assert.match(portable, /canvas-paged-store\.js/);
assert.match(portable, /canvas-viewport-data-source\.js/);
assert.match(packageJson, /check-canvas-paged-integration\.js/);
assert.match(packageJson, /canvas-paged-store\.js/);
assert.match(packageJson, /canvas-viewport-data-source\.js/);

console.log("Canvas paged client integration checks passed.");
