const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function extractFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = script.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < script.length; index += 1) {
    if (script[index] === "{") depth += 1;
    if (script[index] === "}") depth -= 1;
    if (depth === 0) return script.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

assert.match(html, /canvas-scene-layer\.js[^>]*><\/script>[\s\S]*script\.js/);
assert.doesNotMatch(html, /canvas-primitive-layer\.js/);
assert.match(script, /id="canvasSceneLayer" class="canvas-scene-layer"/);
assert.match(styles, /\.infinite-canvas\.has-scene-layer \.canvas-scene-layer/);
assert.doesNotMatch(extractFunction("mountCanvasVirtualNode"), /mountCanvasVirtualSummary/);
assert.doesNotMatch(extractFunction("requestCanvasViewportPage"), /renderCanvasPrimitiveLayer/);
assert.match(extractFunction("requestCanvasViewportPage"), /renderCanvasSceneLayer/);
assert.match(extractFunction("applyCanvasTransformNow"), /reprojectCanvasSceneLayer/);

console.log("Canvas seamless zoom UI checks passed.");
