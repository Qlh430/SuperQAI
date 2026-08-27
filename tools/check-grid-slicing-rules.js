const assert = require("node:assert/strict");
const Rules = require("../grid-slicing-rules");

const vertical = Rules.createEvenBands(100, 1, 0, "v");
assert.deepEqual(vertical, [{ id: "v-1", start: 50, end: 50, override: false }]);
const fixedCenter = Rules.getBandCenter(vertical[0]);
let parityChanges = vertical;
[15, 14, 15, 0, 15].forEach((gap) => {
  parityChanges = Rules.applyUniformGap(100, parityChanges, gap);
  assert.equal(
    Rules.getBandCenter(parityChanges[0]),
    fixedCenter,
    `Changing the gap to ${gap}px must not move the original cut center`,
  );
  assert.equal(parityChanges[0].end - parityChanges[0].start, gap - (gap % 2));
});
const centeredOddBand = Rules.applyUniformGap(1152, Rules.createEvenBands(1152, 1, 0, "v"), 11)[0];
assert.deepEqual(
  { start: centeredOddBand.start, end: centeredOddBand.end },
  { start: 571, end: 581 },
  "Odd gaps should snap down to a symmetrical even-pixel band",
);
assert.deepEqual(
  Rules.getRegions(1152, [centeredOddBand]).map(({ size }) => size),
  [571, 571],
  "An even-pixel centered gap should leave equal integer source regions on both sides",
);
assert.deepEqual(Rules.createEvenBands(100, 0, 0, "v"), []);
assert.equal(Rules.createEvenBands(100, 9, 0, "v").length, 4, "Line count must be capped at four");
assert.equal(Rules.createEvenBands(3, 4, 0, "v").length, 2, "Tiny images must keep at least one pixel per region");
assert.deepEqual(Rules.getRegions(3, Rules.createEvenBands(3, 4, 0, "v")), [
  { start: 0, end: 1, size: 1 },
  { start: 1, end: 2, size: 1 },
  { start: 2, end: 3, size: 1 },
]);

const quarters = Rules.createEvenBands(100, 3, 0, "v");
assert.deepEqual(quarters.map((band) => band.start), [25, 50, 75]);
const uniform = Rules.applyUniformGap(100, quarters, 10);
assert.deepEqual(uniform.map(({ start, end, override }) => ({ start, end, override })), [
  { start: 20, end: 30, override: false },
  { start: 45, end: 55, override: false },
  { start: 70, end: 80, override: false },
]);

const custom = Rules.setBandGap(100, uniform, "v-2", 20);
assert.deepEqual(custom[1], { id: "v-2", start: 40, end: 60, override: true });
assert.equal(custom[0].override, false);
assert.equal(
  Rules.setBandGap(100, uniform, "v-2", 15)[1].end - Rules.setBandGap(100, uniform, "v-2", 15)[1].start,
  14,
  "Odd per-line gaps should snap down to an even pixel width",
);
const reset = Rules.applyUniformGap(100, custom, 6);
assert.ok(reset.every((band) => band.end - band.start === 6 && band.override === false));

const moved = Rules.moveBand(100, uniform, "v-2", 64);
assert.deepEqual(moved[1], { id: "v-2", start: 59, end: 69, override: true });
assert.ok(moved[1].start - moved[0].end >= 1);
assert.ok(moved[2].start - moved[1].end >= 1);

const leftEdge = Rules.resizeBandEdge(100, uniform, "v-2", "start", 38);
assert.deepEqual(leftEdge[1], { id: "v-2", start: 39, end: 55, override: true });
const rightEdge = Rules.resizeBandEdge(100, uniform, "v-2", "end", 66);
assert.deepEqual(rightEdge[1], { id: "v-2", start: 45, end: 65, override: true });

const constrained = Rules.setBandGap(20, Rules.createEvenBands(20, 4, 0, "v"), "v-2", 99);
const constrainedRegions = Rules.getRegions(20, constrained);
assert.ok(constrainedRegions.every((region) => region.size >= 1));
assert.ok(constrained.every((band, index) => index === 0 || band.start - constrained[index - 1].end >= 1));

assert.deepEqual(Rules.getRegions(100, uniform), [
  { start: 0, end: 20, size: 20 },
  { start: 30, end: 45, size: 15 },
  { start: 55, end: 70, size: 15 },
  { start: 80, end: 100, size: 20 },
]);

const slices = Rules.getSliceRegions(
  100,
  80,
  Rules.createEvenBands(100, 1, 10, "v"),
  Rules.createEvenBands(80, 1, 8, "h"),
);
assert.deepEqual(slices.map(({ row, column, x, y, width, height }) => ({ row, column, x, y, width, height })), [
  { row: 1, column: 1, x: 0, y: 0, width: 45, height: 36 },
  { row: 1, column: 2, x: 55, y: 0, width: 45, height: 36 },
  { row: 2, column: 1, x: 0, y: 44, width: 45, height: 36 },
  { row: 2, column: 2, x: 55, y: 44, width: 45, height: 36 },
]);

assert.deepEqual(Rules.getSliceRegions(7, 5, [], []), [
  { row: 1, column: 1, x: 0, y: 0, width: 7, height: 5 },
]);
assert.deepEqual(Rules.getSliceRegions(1, 4, Rules.createEvenBands(1, 4), []), [
  { row: 1, column: 1, x: 0, y: 0, width: 1, height: 4 },
]);
assert.equal(
  Rules.getSliceRegions(100, 100, Rules.createEvenBands(100, 4), Rules.createEvenBands(100, 4)).length,
  25,
  "Four lines in each direction should create the maximum 25 slices",
);

assert.deepEqual(Rules.normalizeGridSpec(0, 9), { rows: 1, columns: 5 });
assert.deepEqual(Rules.normalizeGridSpec(3, 4), { rows: 3, columns: 4 });

const layout = Rules.createGridLayout(1200, 900, 3, 4, 10);
assert.equal(layout.regions.length, 12);
assert.deepEqual(layout.regions[0], {
  key: "r1-c1",
  row: 1,
  column: 1,
  x: 0,
  y: 0,
  width: 295,
  height: 295,
});
assert.equal(
  layout.horizontalBands.every((band) => (band.end - band.start) % 2 === 0),
  true,
  "Every generated gap must preserve the even-pixel invariant",
);

assert.equal(Rules.resolveAspectRatio("16:9"), 16 / 9);
assert.equal(
  Rules.resolveAspectRatio("match", { width: 1200, height: 900, rows: 3, columns: 4 }),
  1,
);

const square = Rules.getCellCrop(
  { key: "r1-c1", row: 1, column: 1, x: 0, y: 0, width: 400, height: 300 },
  1,
  { key: "r1-c1", centerX: 0.75, centerY: 0.5, zoom: 2 },
);
assert.deepEqual(square, {
  key: "r1-c1",
  row: 1,
  column: 1,
  x: 225,
  y: 75,
  width: 150,
  height: 150,
  centerX: 0.75,
  centerY: 0.5,
  zoom: 2,
});

assert.deepEqual(
  Rules.normalizeCellTransforms(
    layout.regions.slice(0, 2),
    [{ key: "r1-c1", centerX: 0.2, centerY: 0.7, zoom: 1.5 }],
  ),
  [
    { key: "r1-c1", centerX: 0.2, centerY: 0.7, zoom: 1.5 },
    { key: "r1-c2", centerX: 0.5, centerY: 0.5, zoom: 1 },
  ],
);

assert.deepEqual(Rules.getCommonOutputSize([
  { width: 800, height: 450 },
  { width: 640, height: 360 },
], 16 / 9), { width: 640, height: 360 });

assert.throws(() => Rules.getRegions(4, [{ id: "x", start: 0, end: 3 }]), /invalid/i);
console.log("Grid slicing rules checks passed");
