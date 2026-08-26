const assert = require("node:assert/strict");
const rules = require("../canvas-spatial-rules");

assert.deepEqual(
  rules.normalizeBounds({ left: 10, top: 20, right: -5, bottom: 8 }),
  { left: -5, top: 8, right: 10, bottom: 20 },
);
assert.deepEqual(
  rules.normalizeBounds({ left: "not-a-number", top: null, right: 20, bottom: 30 }),
  { left: 0, top: 0, right: 20, bottom: 30 },
);

const padded = rules.padRtreeBounds({
  left: 1_000_000_000,
  top: -20,
  right: 1_000_000_320,
  bottom: 220,
});
assert.ok(padded.left < 1_000_000_000);
assert.ok(padded.right > 1_000_000_320);
assert.ok(padded.top < -20);
assert.ok(padded.bottom > 220);

assert.deepEqual(
  rules.getConnectionBounds(
    { left: -10, top: 0, right: 20, bottom: 30 },
    { left: 100, top: 90, right: 140, bottom: 120 },
  ),
  { left: 5, top: 15, right: 120, bottom: 105 },
);

assert.equal(rules.chooseLodLevel(1, 100), 0);
assert.equal(rules.chooseLodLevel(0.09, 186), 0);
assert.equal(rules.chooseLodLevel(0.05, 800), 0);
assert.ok(rules.chooseLodLevel(0.64, 801) > 0);
assert.ok(rules.chooseLodLevel(0.05, 50_000) > 0);
assert.deepEqual(
  rules.getTileAddress(2, -1, 1025),
  { level: 2, tileX: -1, tileY: 1, tileSize: 1024 },
);

console.log("Canvas spatial rule checks passed.");
