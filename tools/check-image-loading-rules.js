const assert = require("assert");
const rules = require("../image-loading-rules");

assert.equal(rules.DETAIL_SCALE, 2);
assert.equal(rules.DETAIL_IDLE_MS, 300);
assert.equal(rules.THUMBNAIL_MAX_SIDE, 640);
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

const choose = (options) => rules.chooseCanvasImageQuality({ visible: true, scale: 1, detailReady: true, currentQuality: "thumbnail", displayedMaxSide: 700, ...options });
assert.equal(choose({}), "thumbnail", "default 100% must not download originals");
assert.equal(choose({ scale: 1.99, displayedMaxSide: 1200 }), "thumbnail");
assert.equal(choose({ scale: 2, displayedMaxSide: 640 }), "thumbnail", "small gallery members stay cheap");
assert.equal(choose({ scale: 2, displayedMaxSide: 640.000001 }), "thumbnail", "subpixel rounding must not upgrade an exact 640px preview");
assert.equal(choose({ scale: 2, displayedMaxSide: 641 }), "original");
assert.equal(choose({ scale: 2, detailReady: false }), "thumbnail", "pause originals during interaction");
assert.equal(choose({ scale: 3, currentQuality: "unloaded" }), "thumbnail", "first paint always uses a preview");
assert.equal(choose({ scale: 3, currentQuality: "loading" }), "thumbnail");
assert.equal(choose({ visible: false, currentQuality: "original" }), "unloaded");
assert.equal(choose({ scale: 3, currentQuality: "original", detailReady: false }), "original");

assert.equal(rules.shouldGenerateThumbnail({ width: 1024, height: 768, bytes: 100000 }), true);
assert.equal(rules.shouldGenerateThumbnail({ width: 640, height: 480, bytes: 100000 }), false);
assert.equal(rules.shouldGenerateThumbnail({ width: 640, height: 480, bytes: 2000000 }), true);
console.log("Image loading rule checks passed.");
