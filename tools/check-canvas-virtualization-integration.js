const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const portable = fs.readFileSync(path.join(root, "build-portable.bat"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.match(
  html,
  /canvas-engine-contract\.js[^>]*><\/script>[\s\S]*canvas-virtualization-rules\.js[^>]*><\/script>[\s\S]*canvas-virtual-store\.js[^>]*><\/script>[\s\S]*canvas-scene-layer\.js[^>]*><\/script>[\s\S]*canvas-virtualizer\.js[^>]*><\/script>[\s\S]*script\.js/,
  "virtualization modules must load before script.js",
);

[
  "canvas-engine-contract.js",
  "canvas-virtualization-rules.js",
  "canvas-virtual-store.js",
  "canvas-scene-layer.js",
  "canvas-virtualizer.js",
].forEach((name) => {
  assert.match(portable, new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`), `portable build must copy ${name}`);
  assert.match(pkg.scripts.check, new RegExp(`node --check ${name.replace(/\./g, "\\.")}`), `npm check must syntax-check ${name}`);
});

[
  "check-canvas-virtualization-rules.js",
  "check-canvas-virtual-store.js",
  "check-canvas-scene-layer.js",
  "check-canvas-virtualizer.js",
  "check-canvas-virtualization-integration.js",
].forEach((name) => {
  assert.match(pkg.scripts.check, new RegExp(`node tools/${name.replace(/\./g, "\\.")}`), `npm check must run ${name}`);
});

assert.match(script, /const canvasVirtualStore\s*=/);
assert.match(script, /const canvasVirtualizer\s*=/);
assert.match(script, /function mountCanvasVirtualNode\(/);
assert.match(script, /function replaceCanvasVirtualNode\(/);
assert.match(script, /let canvasSceneLayer\s*=/);
assert.match(script, /function renderCanvasSceneLayer\(/);
assert.match(script, /canvasPagedStore\.scenePage/);
assert.doesNotMatch(script, /mountCanvasVirtualSummary/);
assert.doesNotMatch(script, /canvas-node-virtual-summary/);
assert.doesNotMatch(styles, /canvas-node-virtual-summary/);
assert.match(script, /function unmountCanvasVirtualNode\(/);
assert.match(script, /function syncMountedCanvasModels\(/);
assert.match(script, /function restoreCanvasBoardVirtually\(/);
assert.match(script, /function ensureCanvasNodeMounted\(/);
assert.match(script, /function pinCanvasNode\(/);
assert.match(script, /function unpinCanvasNode\(/);
assert.match(script, /function removeCanvasNodeModels\(/);
assert.match(
  script,
  /plane\.addEventListener\("focusin",[\s\S]*?pinCanvasNode\([\s\S]*?plane\.addEventListener\("focusout",[\s\S]*?unpinCanvasNode\(/,
  "focused controls must pin their virtual node until focus leaves",
);
assert.match(
  script,
  /function setCanvasImageNodeGenerationState\([\s\S]*?if \(active\)[\s\S]*?pinCanvasNode\([\s\S]*?unpinCanvasNode\(/,
  "running image jobs must pin their node until the job settles",
);

assert.match(styles, /\.canvas-scene-layer/);
assert.match(styles, /\.has-scene-layer/);
assert.match(styles, /\.canvas-plane\s*\{[\s\S]*?width:\s*1px;[\s\S]*?height:\s*1px;/);
assert.match(styles, /\.canvas-connections\s*\{[\s\S]*?width:\s*1px;[\s\S]*?height:\s*1px;/);

console.log("Canvas virtualization integration checks passed.");
