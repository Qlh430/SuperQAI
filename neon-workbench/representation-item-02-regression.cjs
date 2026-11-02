const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
function test(name, run) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

const ROOT = path.join(__dirname, "design-sources");
const host = fs.readFileSync(path.join(ROOT, "canvas-representation-host.js"), "utf8");
const scene = fs.readFileSync(path.join(ROOT, "canvas-scene-layer.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "neon-canvas-surface.css"), "utf8");
const floraCss = fs.readFileSync(path.join(ROOT, "flora-node-shell.css"), "utf8");
const bridge = fs.readFileSync(path.join(ROOT, "script-before-save-bridge.js"), "utf8");

function mustHave(source, value, message) {
  assert.ok(source.includes(value), message || `missing ${value}`);
}

test("Item 02 shares one visual identity projection between Light and local Scene", () => {
  mustHave(host, "CanvasRepresentationVisualIdentity", "host must expose the shared model visual identity projection");
  mustHave(host, "canvas-light-icon", "Light must render a compact icon");
  mustHave(host, "canvas-light-kind", "Light must render the node kind label");
  mustHave(host, "canvas-light-tag", "Light must render the optional node tag");
  mustHave(host, "canvas-light-status", "Light must render the basic status");
  mustHave(host, "nodeColor", "Light identity must carry node color");
  mustHave(host, "groupColor", "Light identity must carry group color");
  mustHave(host, "setAttribute('data-lucide',visual.icon)", "Light must consume the projected icon");
  mustHave(host, "status:visual.status", "Scene rows must consume the projected status");
  mustHave(host, "tag:visual.tag", "Scene rows must consume the projected tag");
});

test("Item 02 Canvas Scene paints identity, status and semantic color without Full DOM", () => {
  mustHave(scene, "drawNodeIcon", "Canvas Scene must paint a compact icon");
  mustHave(scene, "node.icon", "Canvas Scene must consume the projected icon");
  mustHave(scene, "node.status", "Canvas Scene must consume the projected status");
  mustHave(scene, "node.nodeColor", "Canvas Scene must consume node color");
  mustHave(scene, "node.groupColor", "Canvas Scene must consume group color");
  mustHave(scene, "node.kindLabel", "Canvas Scene must consume the node kind label");
  assert.doesNotMatch(scene, /createElement\(["']article["']\)/, "Canvas Scene must not create Full DOM nodes");
});

test("Item 02 Light styles keep identity visible and bounded", () => {
  for (const selector of [".canvas-light-node", ".canvas-light-icon", ".canvas-light-title", ".canvas-light-kind", ".canvas-light-tag", ".canvas-light-status"]) {
    mustHave(css, selector, `missing ${selector} style`);
  }
  mustHave(css, "--canvas-light-color", "Light must use the model color through a semantic custom property");
  mustHave(css, "[data-visual-state=\"selected\"]", "Light selected state must remain visible");
});

test("normal Canvas and Light outlines ignore semantic node colors", () => {
  assert.doesNotMatch(scene, /const nodeColor = node\.nodeColor \|\| node\.groupColor;\s*context\.strokeStyle = nodeColor/, "Canvas normal outline must use a neutral surface token");
  assert.doesNotMatch(css, /border:\s*1px solid color-mix\(in srgb, var\(--canvas-light-color\)/, "Light normal outline must not mix in node/group color");
  assert.doesNotMatch(css, /background:\s*color-mix\(in srgb, var\(--canvas-neon-card\) 94%, var\(--canvas-light-color\) 6%\)/, "Light normal card surface must stay neutral");
  mustHave(css, "border: 1px solid var(--canvas-neon-border)", "Light's native body surface must use the neutral border token");
});

test("all representations reserve colored outlines for interaction states", () => {
  mustHave(host, "dataset.visualState", "Light must expose the mapped visual state");
  mustHave(scene, "node.visualState", "Canvas must consume the mapped visual state");
  for (const state of ["selected", "focused", "connecting"]) mustHave(css, `data-visual-state=\"${state}\"`, `Light ${state} state must be explicitly styled`);
  mustHave(css, "data-visual-state=\"hover\"", "Light hover must be a separate quiet state");
  mustHave(css, ".canvas-light-status[data-state=\"running\"]", "running must be conveyed by status, not the card outline");
  mustHave(css, ".canvas-light-status[data-state=\"failed\"]", "error must be conveyed by status, not the card outline");
  mustHave(floraCss, ".flora-node-shell[data-state~=\"hover\"] .flora-node-card", "Full hover must retain its quiet neutral treatment");
  mustHave(floraCss, ".canvas-node[data-flora-node=\"true\"].is-connecting) .flora-node-card", "Full selected state must retain the product emphasis color");
});

test("Canvas, Light and Full consume one body-first visual geometry contract", () => {
  mustHave(bridge, "resolveNodeVisualGeometry", "the shared visual geometry resolver must be exposed");
  mustHave(bridge, "outerBounds", "the resolver must expose visible body bounds");
  mustHave(bridge, "identityBounds", "the resolver must expose floating identity bounds");
  mustHave(bridge, "headerBounds", "the resolver must expose the external Flora title band");
  mustHave(bridge, "tagBounds", "the resolver must expose the external tag bounds");
  mustHave(bridge, "contentBounds", "the resolver must expose content bounds");
  mustHave(bridge, "mediaBounds", "the resolver must expose media bounds");
  mustHave(bridge, "statusBounds", "the resolver must expose an overlay status region");
  mustHave(bridge, "borderRadius", "the resolver must expose the node radius");
  mustHave(host, "geometry?.outerBounds", "Light must position its visible body from shared bounds");
  mustHave(host, "dataset.hasBodySurface", "Light must only paint a surface where Full already has one");
  assert.doesNotMatch(host, /canvas-light-card/, "Light must not introduce a common card wrapper");
  mustHave(host, "canvas-light-media", "Light media must remain directly positioned in the body bounds");
  mustHave(host, "canvas-light-status", "Light status must overlay the body without allocating a footer row");
  mustHave(scene, "resolveNodeVisualGeometry", "Canvas Scene must use shared geometry");
  mustHave(scene, "geometry?.mediaBounds", "Canvas media must draw inside the shared media bounds");
  mustHave(scene, "drawContain(context, texture", "Canvas media must preserve Full's contain behavior");
  mustHave(scene, "geometry?.bodySurface", "Canvas must only paint the native node surface when Full has one");
  mustHave(css, ".canvas-light-node[data-has-body-surface=\"true\"]::before", "Light surface must be conditional and match the native body");
  mustHave(css, "border: 0", "the transparent Light root must not gain a whole-node border");
  mustHave(floraCss, "--flora-node-header-height", "Full shell must keep the same authoritative header band");
});
