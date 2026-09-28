"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = fs.readFileSync(path.join(root, "module-manifest.js"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const rules = require("../canvas-geometry-rules");

assert.deepEqual(
  rules.normalizeRect({ left: 20, top: 30, right: 10, bottom: 5 }),
  { left: 10, top: 5, right: 20, bottom: 30 },
);
assert.equal(rules.normalizeRect(null), null);
assert.equal(rules.normalizeRect({ left: "bad", top: 0, right: 10, bottom: 10 }), null);

assert.deepEqual(
  rules.rectFromPointSize({ x: 12, y: 20 }, 120, 80),
  { left: 12, top: 20, right: 132, bottom: 100 },
);
assert.deepEqual(
  rules.rectFromPointSize({ x: 12, y: 20 }, 0, "bad", { fallbackWidth: 292, fallbackHeight: 180 }),
  { left: 12, top: 20, right: 304, bottom: 200 },
);
assert.deepEqual(
  rules.rectFromPoints({ x: 80, y: 40 }, { x: 20, y: 100 }),
  { left: 20, top: 40, right: 80, bottom: 100 },
);

assert.deepEqual(rules.rectCenter({ left: 10, top: 20, right: 30, bottom: 50 }), { x: 20, y: 35 });
assert.equal(rules.rectCenter(null), null);

const box = { left: 10, top: 20, right: 110, bottom: 120 };
assert.equal(rules.pointInRect({ x: 10, y: 20 }, box), true);
assert.equal(rules.pointInRect({ x: 110, y: 120 }, box), true);
assert.equal(rules.pointInRect({ x: 9, y: 20 }, box), false);
assert.equal(rules.pointInRect({ x: 10, y: 20 }, box, { inclusive: false }), false);
assert.equal(rules.pointInRect({ x: 30, y: 40 }, { left: 0, top: 0, right: 0, bottom: 0 }, { requireArea: true }), false);

assert.equal(rules.rectsIntersect(box, { left: 100, top: 40, right: 200, bottom: 80 }), true);
assert.equal(rules.rectsIntersect(box, { left: 110, top: 20, right: 200, bottom: 120 }), false);
assert.equal(rules.rectsIntersect(box, { left: 110, top: 20, right: 200, bottom: 120 }, { inclusive: true }), true);
assert.equal(rules.rectsIntersect(box, null), false);

assert.deepEqual(
  rules.unionRects([
    { left: 30, top: 40, right: 50, bottom: 60 },
    { left: 10, top: 80, right: 20, bottom: 90 },
    null,
  ]),
  { left: 10, top: 40, right: 50, bottom: 90 },
);
assert.equal(rules.unionRects([]), null);
assert.equal(Object.isFrozen(rules), true);

const viewIndex = html.indexOf("canvas-view-rules.js");
const connectionIndex = html.indexOf("canvas-connection-rules.js");
const geometryIndex = html.indexOf("canvas-geometry-rules.js");
const contractIndex = html.indexOf("canvas-engine-contract.js");
const runtimeIndex = html.indexOf("script.js");
assert.ok(viewIndex >= 0, "index.html must load canvas view rules");
assert.ok(connectionIndex > viewIndex, "connection rules must load after view rules");
assert.ok(geometryIndex > connectionIndex, "geometry rules must load after connection rules");
assert.ok(geometryIndex < contractIndex, "geometry rules must load before the engine contract");
assert.ok(geometryIndex < runtimeIndex, "geometry rules must load before the canvas runtime");
assert.ok(
  manifest.includes("./canvas-geometry-rules.js?v=20260924-canvas-geometry-rules"),
  "the canvas engine component must own the geometry rules module",
);
assert.match(script, /const CanvasGeometryRules = window\.CanvasGeometryRules/);
assert.match(script, /function getCanvasNodeCenter\([\s\S]*?CanvasGeometryRules\.rectCenter/);
assert.match(script, /function getCanvasNodeBox\([\s\S]*?CanvasGeometryRules\.rectFromPointSize/);
assert.match(script, /function getCanvasNodesBounds\([\s\S]*?CanvasGeometryRules\.unionRects/);
assert.match(script, /function beginCanvasMarquee\([\s\S]*?CanvasGeometryRules\.rectFromPoints/);
assert.match(script, /function selectCanvasNodesInScreenRect\([\s\S]*?CanvasGeometryRules\.rectsIntersect/);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node --check canvas-geometry-rules\.js/,
  "the canvas engine check must syntax-check the geometry rules",
);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node tools\/check-canvas-geometry-rules\.js/,
  "the canvas engine check must execute focused geometry rule tests",
);

console.log("Canvas geometry rule checks passed.");
