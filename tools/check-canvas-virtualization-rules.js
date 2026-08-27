const assert = require("node:assert/strict");
const rules = require("../canvas-virtualization-rules");

assert.equal(rules.DEFAULT_CELL_SIZE, 768);
assert.equal(rules.MOUNT_OVERSCAN_PX, 640);
assert.equal(rules.RETAIN_OVERSCAN_PX, 960);
assert.equal(rules.FRAME_BUDGET_MS, 8);

const index = new rules.GridSpatialIndex({ cellSize: 768 });
index.upsert("a", { left: -900, top: -100, right: -100, bottom: 300 });
index.upsert("b", { left: 100, top: 100, right: 420, bottom: 360 });
index.upsert("wide", { left: 700, top: 700, right: 900, bottom: 900 });
assert.deepEqual([...index.query({ left: -1000, top: -200, right: 0, bottom: 400 })], ["a"]);
assert.deepEqual([...index.query({ left: 760, top: 760, right: 800, bottom: 800 })], ["wide"]);

index.upsert("a", { left: 2000, top: 2000, right: 2300, bottom: 2300 });
assert.deepEqual([...index.query({ left: -1000, top: -200, right: 0, bottom: 400 })], []);
assert.deepEqual([...index.query({ left: 1900, top: 1900, right: 2400, bottom: 2400 })], ["a"]);

index.remove("b");
assert.equal(index.has("b"), false);
assert.deepEqual([...index.query({ left: 0, top: 0, right: 500, bottom: 500 })], []);

assert.deepEqual(
  rules.getViewportCanvasRect({ width: 1000, height: 600 }, { x: 100, y: 50, scale: 2 }, 200),
  { left: -150, top: -125, right: 550, bottom: 375 },
);

assert.deepEqual(
  rules.getNodeRect({ x: -20, y: 30, width: 0, height: 0, kind: "image" }),
  { left: -20, top: 30, right: 300, bottom: 270 },
);
assert.deepEqual(
  rules.getNodeRect({ x: 10, y: 20, width: 500, height: 400, kind: "text" }),
  { left: 10, top: 20, right: 510, bottom: 420 },
);

assert.equal(
  rules.rectsIntersect(
    { left: 0, top: 0, right: 10, bottom: 10 },
    { left: 9, top: 9, right: 20, bottom: 20 },
  ),
  true,
);
assert.equal(
  rules.rectsIntersect(
    { left: 0, top: 0, right: 10, bottom: 10 },
    { left: 10, top: 10, right: 20, bottom: 20 },
  ),
  false,
);

assert.deepEqual(
  rules.getConnectionBounds(
    { x: -100, y: 50 },
    { x: 300, y: -200 },
  ),
  { left: -100, top: -200, right: 300, bottom: 50 },
);

for (const scale of [0.05, 0.11, 0.25, 0.55, 0.64, 0.65, 0.74, 1, 5]) {
  assert.equal(rules.chooseNodeLevel({ scale, candidateCount: 94 }), "full");
  assert.equal(rules.chooseNodeLevel({ scale, candidateCount: 800 }), "full");
}
assert.equal(rules.chooseNodeLevel({ scale: 0.11, candidateCount: 801 }), "scene");
assert.equal(rules.chooseNodeLevel({ scale: 0.11, candidateCount: 50_000, pinned: true }), "full");

// Keep the existing adapter input compatible while callers migrate to candidateCount.
assert.equal(rules.chooseNodeLevel({ scale: 0.05, visibleCount: 186 }), "full");
assert.equal(rules.chooseNodeLevel({ scale: 1, visibleCount: 801 }), "scene");

console.log("Canvas virtualization rule checks passed.");
