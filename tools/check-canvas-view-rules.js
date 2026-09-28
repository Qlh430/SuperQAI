"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = fs.readFileSync(path.join(root, "module-manifest.js"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const rules = require("../canvas-view-rules");

assert.equal(rules.SCALE_MIN, 0.05);
assert.equal(rules.SCALE_MAX, 5);
assert.deepEqual(rules.DEFAULT_VIEW, { x: 80, y: 60, scale: 1 });
assert.ok(Object.isFrozen(rules.DEFAULT_VIEW));

assert.equal(rules.normalizeScale(0.01), 0.05);
assert.equal(rules.normalizeScale(0.05), 0.05);
assert.equal(rules.normalizeScale(2.5), 2.5);
assert.equal(rules.normalizeScale(5), 5);
assert.equal(rules.normalizeScale(6), 5);
assert.equal(rules.normalizeScale("invalid"), 1);
assert.equal(rules.normalizeScale(undefined, 2), 2);

assert.deepEqual(
  rules.normalizeViewport({ x: "24", y: "invalid", scale: "0.02" }),
  { x: 24, y: 60, scale: 0.05 },
);
assert.deepEqual(
  rules.normalizeViewport(null, { x: 10, y: 20, scale: 0.5 }),
  { x: 10, y: 20, scale: 0.5 },
);

const viewport = { x: 120, y: -40, scale: 2 };
const world = rules.screenToCanvas({ x: 320, y: 160 }, viewport);
assert.deepEqual(world, { x: 100, y: 100 });
assert.deepEqual(rules.canvasToScreen(world, viewport), { x: 320, y: 160 });

assert.equal(rules.wheelDelta(12), 12);
assert.equal(rules.wheelDelta(3, 1), 48);
assert.equal(rules.wheelDelta(0.5, 2, 800), 400);
assert.equal(rules.wheelDelta("invalid"), 0);
assert.ok(rules.wheelZoomFactor(-120) > 1);
assert.ok(rules.wheelZoomFactor(120) < 1);
assert.ok(Math.abs(rules.wheelZoomFactor(-120) * rules.wheelZoomFactor(120) - 1) < 1e-12);

const anchor = { x: 480, y: 300 };
const beforeZoom = rules.screenToCanvas(anchor, viewport);
const zoomed = rules.zoomViewportAt(viewport, anchor, 1.75);
const afterZoom = rules.screenToCanvas(anchor, zoomed);
assert.ok(Math.abs(afterZoom.x - beforeZoom.x) < 1e-12);
assert.ok(Math.abs(afterZoom.y - beforeZoom.y) < 1e-12);
assert.equal(zoomed.scale, 3.5);

const clampedZoom = rules.zoomViewportAt(viewport, anchor, 100);
assert.equal(clampedZoom.scale, 5);
assert.ok(Math.abs(
  rules.screenToCanvas(anchor, clampedZoom).x
    - rules.screenToCanvas(anchor, viewport).x,
) < 1e-12);

assert.deepEqual(
  rules.panViewport(viewport, { x: -20, y: 15 }),
  { x: 100, y: -25, scale: 2 },
);
assert.equal(rules.gridBackgroundSize(0.05), 42.5);
assert.equal(rules.gridBackgroundSize(1), 34);
assert.equal(rules.gridBackgroundSize(5), 170);
assert.equal(rules.scaleLabel(1.234), "123%");

const viewRulesIndex = html.indexOf("canvas-view-rules.js");
const engineContractIndex = html.indexOf("canvas-engine-contract.js");
const runtimeIndex = html.indexOf("script.js");
assert.ok(viewRulesIndex >= 0, "index.html must load the canvas view rules");
assert.ok(viewRulesIndex < engineContractIndex, "canvas view rules must load before the engine contract");
assert.ok(viewRulesIndex < runtimeIndex, "canvas view rules must load before the canvas runtime");
assert.ok(
  manifest.includes("./canvas-view-rules.js?v=20260924-canvas-view-rules"),
  "the canvas engine component must own the view rules module",
);
assert.match(script, /const CanvasViewRules = window\.CanvasViewRules/);
assert.match(script, /function normalizeCanvasScale\([\s\S]*?CanvasViewRules\.normalizeScale/);
assert.match(script, /addEventListener\("wheel"[\s\S]*?CanvasViewRules\.zoomViewportAt/);
assert.match(script, /function screenToCanvas\([\s\S]*?CanvasViewRules\.screenToCanvas/);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node --check canvas-view-rules\.js/,
  "the canvas engine check must syntax-check the view rules",
);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node tools\/check-canvas-view-rules\.js/,
  "the canvas engine check must execute focused view rule tests",
);

console.log("Canvas view rule checks passed.");
