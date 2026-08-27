const assert = require("assert");
const rules = require("../image-loading-rules");

assert.equal(rules.DETAIL_SCALE, 1);
assert.equal(rules.DETAIL_IDLE_MS, 300);
assert.equal(rules.THUMBNAIL_MAX_SIDE, 768);
assert.equal(rules.THUMBNAIL_QUALITY, 0.76);

assert.deepEqual(
  rules.getCanvasVisibleRect({ width: 1000, height: 600 }, { x: 100, y: 50, scale: 2 }, 0),
  { left: -50, top: -25, right: 450, bottom: 275 },
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

assert.equal(
  rules.chooseCanvasImageQuality({
    visible: false,
    scale: 3,
    detailReady: true,
    currentQuality: "original",
    displayedMaxSide: 1200,
  }),
  "unloaded",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.99,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 700,
  }),
  "thumbnail",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 1,
    detailReady: false,
    currentQuality: "thumbnail",
    displayedMaxSide: 700,
  }),
  "thumbnail",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 1,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 700,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 1,
    detailReady: false,
    currentQuality: "original",
    displayedMaxSide: 700,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.8,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 769,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.8,
    detailReady: false,
    currentQuality: "original",
    displayedMaxSide: 769,
  }),
  "original",
);
assert.equal(
  rules.chooseCanvasImageQuality({
    visible: true,
    scale: 0.8,
    detailReady: true,
    currentQuality: "thumbnail",
    displayedMaxSide: 768,
  }),
  "thumbnail",
);

assert.equal(rules.shouldGenerateThumbnail({ width: 1200, height: 900, bytes: 800000 }), false);
assert.equal(rules.shouldGenerateThumbnail({ width: 2400, height: 900, bytes: 800000 }), true);
assert.equal(rules.shouldGenerateThumbnail({ width: 1200, height: 900, bytes: 2000000 }), true);

console.log("Image loading rule checks passed.");
