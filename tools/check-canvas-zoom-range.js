const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

function extractFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyStart = script.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < script.length; index += 1) {
    if (script[index] === "{") depth += 1;
    if (script[index] === "}") {
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

assert.match(script, /const CANVAS_SCALE_MIN = 0\.05;/);
assert.match(script, /const CANVAS_SCALE_MAX = 5;/);

const normalizeSource = extractFunction("normalizeCanvasScale");
const scaleContext = {};
vm.runInNewContext(`
  const CANVAS_SCALE_MIN = 0.05;
  const CANVAS_SCALE_MAX = 5;
  ${normalizeSource}
  this.normalizeCanvasScale = normalizeCanvasScale;
`, scaleContext);

assert.strictEqual(scaleContext.normalizeCanvasScale(0.01), 0.05);
assert.strictEqual(scaleContext.normalizeCanvasScale(0.05), 0.05);
assert.strictEqual(scaleContext.normalizeCanvasScale(2.5), 2.5);
assert.strictEqual(scaleContext.normalizeCanvasScale(4), 4);
assert.strictEqual(scaleContext.normalizeCanvasScale(5), 5);
assert.strictEqual(scaleContext.normalizeCanvasScale(6), 5);
assert.strictEqual(scaleContext.normalizeCanvasScale(undefined), 1);
assert.strictEqual(scaleContext.normalizeCanvasScale("invalid"), 1);

const wheelBlock = extractBlock('viewport.addEventListener("wheel"', '}, { passive: false });');
assert.match(wheelBlock, /normalizeCanvasScale\(canvasState\.scale \* factor\)/);
assert.doesNotMatch(wheelBlock, /Math\.max\(0\.25/);

const middlePanBlock = extractBlock(
  'viewport.addEventListener("pointerdown", (event) => {\n    if (event.button !== 1) return;',
  '}, { capture: true });',
);
assert.match(middlePanBlock, /event\.stopImmediatePropagation\(\)/);
assert.match(middlePanBlock, /beginCanvasPan\(event\)/);
assert.match(script, /viewport\.addEventListener\("auxclick", \(event\) => \{\s*if \(event\.button === 1\) event\.preventDefault\(\);\s*\}, \{ capture: true \}\);/);
assert.match(extractFunction("beginCanvasPan"), /event\.button !== 0 && event\.button !== 1/);
assert.match(script, /中键拖动画布/);

assert.match(extractFunction("restoreCanvasBoard"), /restoreCanvasBoardVirtually\(board\)/);
assert.match(extractFunction("restoreCanvasBoardVirtually"), /prepareCanvasBoardRestoreFinalState\(board, context\)/);
assert.match(extractFunction("prepareCanvasBoardRestoreFinalState"), /canvasState\.scale = normalizeCanvasScale\(board\.viewport\?\.scale, 1\);/);
assert.match(extractFunction("resetCanvasView"), /canvasState\.scale = 1;/);

console.log("Canvas zoom range checks passed.");
