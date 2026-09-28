"use strict";

const assert = require("node:assert/strict");
const rules = require("../canvas-gallery-rules.js");

assert.equal(rules.suggestedColumns(1), 1);
assert.equal(rules.suggestedColumns(4), 2);
assert.equal(rules.suggestedColumns(9), 3);
assert.equal(rules.suggestedColumns(16), 4);
assert.equal(rules.suggestedColumns(17), 5);
assert.equal(rules.minimumWidthForColumns(3, 16), 336);

const freeGrid = rules.freeGridLayout({
  members: Array.from({ length: 5 }, (_, index) => ({
    id: `gallery-${index}`,
    width: 1000,
    height: 1000,
  })),
  width: 420,
  height: 220,
  layoutMode: "manual",
});
assert.equal(freeGrid.columns, 3);
assert.equal(freeGrid.rows, 2);
assert.equal(freeGrid.width, 420);
assert.equal(freeGrid.height, freeGrid.minHeight);
assert.ok(freeGrid.cellWidth >= 96);

const verticalGrid = rules.freeGridLayout({
  members: Array.from({ length: 5 }, (_, index) => ({
    id: `vertical-${index}`,
    width: 1000,
    height: 1000,
  })),
  width: 420,
  height: 600,
  layoutMode: "manual",
  resizeAxis: "height",
});
assert.equal(verticalGrid.columns, 2);
assert.equal(verticalGrid.height, verticalGrid.minHeight);

assert.deepEqual(rules.containerLayout(1, 10), {
  columns: 1,
  rows: 1,
  cellSize: 120,
  gap: 16,
  width: 120,
  minHeight: 68,
});
assert.equal(rules.shouldRenderMemberOutput(1), false);
assert.equal(rules.shouldRenderMemberOutput(2), true);
assert.deepEqual(
  rules.memberColumnIndices([
    { id: "wide-a", width: 1600, height: 800 },
    { id: "tall", width: 800, height: 1600 },
    { id: "wide-b", width: 1600, height: 800 },
    { id: "square", width: 1000, height: 1000 },
  ], 2),
  [0, 1, 0, 0],
);

console.log("Canvas gallery rules checks passed.");
