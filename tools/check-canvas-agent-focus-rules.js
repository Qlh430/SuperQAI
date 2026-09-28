const assert = require("node:assert/strict");
const rules = require("../canvas-agent-focus-rules");

const one = rules.calculateFocusTransform({
  bounds: { left: 100, top: 200, right: 420, bottom: 460 },
  viewport: { width: 1400, height: 900 },
  currentScale: 0.41,
  targetCount: 1,
});
assert.equal(one.scale >= 0.65 && one.scale <= 1.25, true);
assert.equal(one.scale, 1.25, "small single nodes should use the readable maximum instead of staying at 41%");
assert.equal((260 * one.scale) / 900 >= 0.35, true);
assert.equal(Number.isFinite(one.x) && Number.isFinite(one.y), true);

const many = rules.calculateFocusTransform({
  bounds: { left: 0, top: 0, right: 1800, bottom: 1000 },
  viewport: { width: 1200, height: 800 },
  currentScale: 1.2,
  targetCount: 6,
});
assert.equal(many.scale <= 1, true);
assert.equal(many.visibleRatio >= 0.75, true);
assert.equal(1800 * many.scale <= 1200 * 0.88 + 0.001, true);
assert.equal(1000 * many.scale <= 800 * 0.88 + 0.001, true);

const invalid = rules.calculateFocusTransform({
  bounds: { left: NaN, top: Infinity, right: undefined, bottom: null },
  viewport: { width: 0, height: -1 },
  currentScale: NaN,
  targetCount: 0,
});
assert.equal([invalid.scale, invalid.x, invalid.y, invalid.visibleRatio].every(Number.isFinite), true);
assert.equal(invalid.scale > 0, true);

console.log("Canvas Agent focus rule checks passed.");
