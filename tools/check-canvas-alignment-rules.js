"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = fs.readFileSync(path.join(root, "module-manifest.js"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const rules = require("../canvas-alignment-rules");

assert.equal(rules.DEFAULT_THRESHOLD, 8);
assert.equal(rules.normalizeRect({ left: 20, top: 30, right: 10, bottom: 5 }).left, 10);
assert.equal(rules.normalizeRect(null), null);

const aligned = rules.alignRect({
  movingRect: { left: 104, top: 104, right: 204, bottom: 204 },
  candidateRects: [{ left: 100, top: 100, right: 200, bottom: 200 }],
  threshold: 8,
});
assert.equal(aligned.deltaX, -4);
assert.equal(aligned.deltaY, -4);
assert.equal(aligned.x.position, 100);
assert.equal(aligned.y.position, 100);
assert.equal(aligned.x.movingEdge, "left");
assert.equal(aligned.x.targetEdge, "left");

const centerAligned = rules.alignRect({
  movingRect: { left: 116, top: 50, right: 216, bottom: 150 },
  candidateRects: [{ left: 100, top: 40, right: 300, bottom: 160 }],
  threshold: 8,
});
assert.equal(centerAligned.deltaX, 0);
assert.equal(centerAligned.x, null, "center alignment outside the threshold must not snap");

const centerPriority = rules.alignRect({
  movingRect: { left: 104, top: 50, right: 204, bottom: 150 },
  candidateRects: [{ left: 100, top: 80, right: 208, bottom: 180 }],
  threshold: 8,
});
assert.equal(centerPriority.x.position, 154);
assert.equal(centerPriority.x.movingEdge, "center");
assert.equal(centerPriority.x.targetEdge, "center");

const complementary = rules.alignRect({
  movingRect: { left: 50, top: 50, right: 150, bottom: 150 },
  candidateRects: [{ left: 154, top: 50, right: 254, bottom: 150 }],
  threshold: 8,
});
assert.equal(complementary.deltaX, 4);
assert.equal(complementary.x.movingEdge, "right");
assert.equal(complementary.x.targetEdge, "left");

const noMatch = rules.alignRect({
  movingRect: { left: 0, top: 0, right: 100, bottom: 100 },
  candidateRects: [{ left: 120, top: 120, right: 220, bottom: 220 }],
  threshold: 8,
});
assert.equal(noMatch.deltaX, 0);
assert.equal(noMatch.deltaY, 0);
assert.equal(noMatch.x, null);
assert.equal(noMatch.y, null);
assert.equal(Object.isFrozen(rules), true);

const rulesIndex = html.indexOf("canvas-alignment-rules.js");
const geometryIndex = html.indexOf("canvas-geometry-rules.js");
const runtimeIndex = html.indexOf("script.js");
assert.ok(rulesIndex >= 0, "index.html must load the alignment rules");
assert.ok(rulesIndex > geometryIndex, "alignment rules must load after geometry rules");
assert.ok(rulesIndex < runtimeIndex, "alignment rules must load before the canvas runtime");
assert.ok(
  manifest.includes("./canvas-alignment-rules.js?v=20260928-node-alignment"),
  "the canvas engine component must own the alignment rules module",
);
assert.match(script, /const CanvasAlignmentRules = window\.CanvasAlignmentRules/);
assert.match(script, /function beginCanvasNodeDrag[\s\S]*?CanvasAlignmentRules\.alignRect/);
assert.match(script, /function beginCanvasSceneSelectionDrag[\s\S]*?CanvasAlignmentRules\.alignRect/);
assert.match(script, /function showCanvasAlignmentGuides/);
assert.match(script, /function hideCanvasAlignmentGuides/);
assert.match(script, /id="canvasAlignmentGuides"/);
assert.match(styles, /\.canvas-alignment-guides/);
assert.match(styles, /\.canvas-alignment-guide\.vertical/);
assert.match(styles, /\.canvas-alignment-guide\.horizontal/);

assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node --check canvas-alignment-rules\.js/,
  "the canvas engine check must syntax-check the alignment rules",
);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node tools\/check-canvas-alignment-rules\.js/,
  "the canvas engine check must execute focused alignment rule tests",
);

console.log("Canvas alignment rule checks passed.");
