const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8").replace(/\r\n?/g, "\n");

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

const viewRules = require("../canvas-view-rules");
assert.strictEqual(viewRules.normalizeScale(0.01), 0.05);
assert.strictEqual(viewRules.normalizeScale(0.05), 0.05);
assert.strictEqual(viewRules.normalizeScale(2.5), 2.5);
assert.strictEqual(viewRules.normalizeScale(4), 4);
assert.strictEqual(viewRules.normalizeScale(5), 5);
assert.strictEqual(viewRules.normalizeScale(6), 5);
assert.strictEqual(viewRules.normalizeScale(undefined), 1);
assert.strictEqual(viewRules.normalizeScale("invalid"), 1);
assert.match(script, /const CanvasViewRules = window\.CanvasViewRules/);
assert.match(extractFunction("normalizeCanvasScale"), /CanvasViewRules\.normalizeScale/);

const wheelBlock = extractBlock('viewport.addEventListener("wheel"', '}, { passive: false });');
assert.match(wheelBlock, /CanvasViewRules\.wheelDelta\(/);
assert.match(wheelBlock, /CanvasViewRules\.zoomViewportAt\(/);
assert.match(wheelBlock, /CanvasViewRules\.wheelZoomFactor\(/);
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

const panListeners = new Map();
let panTransformCalls = 0;
let panSaveCalls = 0;
const panContext = {
  canvasState: { x: 40, y: 60 },
  window: {
    addEventListener(type, handler) { panListeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (panListeners.get(type) === handler) panListeners.delete(type);
    },
  },
  scheduleCanvasTransform() { panTransformCalls += 1; },
  scheduleCanvasViewportSave() { panSaveCalls += 1; },
};
vm.runInNewContext(`${extractFunction("beginCanvasPan")}; this.beginCanvasPan = beginCanvasPan;`, panContext);
const panTarget = {
  captured: null,
  released: null,
  setPointerCapture(pointerId) { this.captured = pointerId; },
  releasePointerCapture(pointerId) { this.released = pointerId; },
};
panContext.beginCanvasPan({
  button: 1,
  buttons: 4,
  pointerId: 17,
  clientX: 200,
  clientY: 160,
  currentTarget: panTarget,
  preventDefault() {},
});
assert.strictEqual(panTarget.captured, 17, "middle-button canvas pan must capture its pointer");
panListeners.get("pointermove")({ pointerId: 18, buttons: 4, clientX: 300, clientY: 260 });
assert.strictEqual(panTransformCalls, 0, "an unrelated pointer must not move the canvas");
panListeners.get("pointermove")({ pointerId: 17, buttons: 0, clientX: 300, clientY: 260 });
assert.strictEqual(panTransformCalls, 0, "a released middle button must stop the pan instead of following later mouse movement");
assert.strictEqual(panSaveCalls, 1, "losing the middle-button state must finalize the pan once");
assert.strictEqual(panTarget.released, 17, "finalizing a pan must release the captured pointer");
assert.strictEqual(panListeners.has("pointermove"), false, "a finalized pan must remove its move listener");

assert.match(extractFunction("restoreCanvasBoard"), /restoreCanvasBoardVirtually\(board\)/);
assert.match(extractFunction("restoreCanvasBoardVirtually"), /prepareCanvasBoardRestoreFinalState\(board, context\)/);
assert.match(
  extractFunction("prepareCanvasBoardRestoreFinalState"),
  /CanvasViewRules\.normalizeViewport\(board\.viewport\)/,
);
assert.match(extractFunction("resetCanvasView"), /CanvasViewRules\.DEFAULT_VIEW/);
assert.match(extractFunction("screenToCanvas"), /CanvasViewRules\.screenToCanvas/);

console.log("Canvas zoom range checks passed.");
