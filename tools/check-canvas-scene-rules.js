const assert = require("node:assert/strict");
const { selectVisibleSprites } = require("../canvas-scene-rules");

const separated = Array.from({ length: 801 }, (_, index) => ({
  id: `node-${index}`,
  kind: index % 2 ? "text" : "image",
  x: index * 200,
  y: 0,
  width: 120,
  height: 100,
  zOrder: index,
  previewSource: index % 2 ? "" : `/thumb-${index}.webp`,
  title: `完整节点 ${index}`,
}));
const separatedResult = selectVisibleSprites(separated, {
  bounds: { left: -1, top: -1, right: 161_000, bottom: 200 },
  scale: 0.11,
  maxTexturedSprites: 200,
});
assert.equal(separatedResult.visualNodes.length, 801, "visible geometry must never be truncated");
assert.equal(separatedResult.texturedNodeIds.length, 200);
assert.deepEqual(
  separatedResult.visualNodes.map((node) => node.id),
  separated.map((node) => node.id),
  "separated geometry and z-order must remain stable",
);
assert.equal(separatedResult.visualNodes[0].title, "完整节点 0");

const overlapping = Array.from({ length: 50_000 }, (_, index) => ({
  id: `overlap-${index}`,
  kind: "image",
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  zOrder: index,
  previewSource: `/thumb-${index}.webp`,
}));
const overlapResult = selectVisibleSprites(overlapping, {
  bounds: { left: -10, top: -10, right: 400, bottom: 300 },
  scale: 0.11,
});
assert.equal(overlapResult.visualNodes.length, 1);
assert.equal(overlapResult.visualNodes[0].id, "overlap-49999", "top z-order node must survive occlusion");

const subpixel = selectVisibleSprites([
  { id: "bottom", x: 0, y: 0, width: 1, height: 1, zOrder: 1 },
  { id: "top", x: 0, y: 0, width: 1, height: 1, zOrder: 2 },
], {
  bounds: { left: 0, top: 0, right: 10, bottom: 10 },
  scale: 0.05,
});
assert.deepEqual(subpixel.visualNodes.map((node) => node.id), ["top"]);

const dense = Array.from({ length: 5_000 }, (_, index) => ({
  id: `dense-${index}`,
  kind: "image",
  x: (index % 100) * 42,
  y: Math.floor(index / 100) * 34,
  width: 320,
  height: 220,
  zOrder: index,
  title: `dense ${index}`,
}));
const denseResult = selectVisibleSprites(dense, {
  bounds: { left: -20, top: -20, right: 4_600, bottom: 2_000 },
  scale: 0.12,
});
assert.equal(denseResult.visualNodes.length, 5_000, "partially visible dense sprites must not be truncated");
assert.equal(denseResult.visualNodes.at(-1).id, "dense-4999");

console.log("Canvas scene rule checks passed.");
