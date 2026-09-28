"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = fs.readFileSync(path.join(root, "module-manifest.js"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const rules = require("../canvas-connection-rules");

assert.equal(rules.connectionId({ id: "edge:saved" }), "edge:saved");
assert.equal(
  rules.connectionId({ from: "source", to: "target" }),
  "edge:source:target:input",
);
assert.equal(
  rules.connectionId({ from: "gallery", fromPort: "member-output:member-a", to: "image", toPort: "prompt" }),
  "edge:gallery:member-output:member-a:image:prompt",
);
assert.deepEqual(
  rules.normalizeConnection({ from: "a", to: "b" }),
  { from: "a", to: "b", id: "edge:a:b:input" },
);
assert.equal(
  rules.connectionKey({ from: "a", fromPort: "output", to: "b", toPort: "input" }, 3),
  "a:output->b:input:3",
);

assert.equal(
  rules.pathData({ x: 0, y: 10 }, { x: 40, y: 20 }),
  "M 0 10 C 80 10, -40 20, 40 20",
);
assert.equal(
  rules.pathData({ x: 0, y: 0 }, { x: 400, y: 100 }),
  "M 0 0 C 180 0, 220 100, 400 100",
);
assert.equal(
  rules.pathData({ x: "invalid", y: null }, { x: "80", y: "40" }),
  "M 0 0 C 80 0, 0 40, 80 40",
);

const node = {
  holds: null,
  contains(value) { return value === this.holds; },
};
assert.equal(rules.resolveDropPort(node, null, "input", "input"), "input");
const ordinaryInputPort = { dataset: { canvasPort: "input" } };
const ordinaryInput = { closest() { return ordinaryInputPort; } };
node.holds = ordinaryInputPort;
assert.equal(rules.resolveDropPort(node, ordinaryInput, "input", "input"), "input");
const memberInputPort = { dataset: { canvasPort: "member-input:image-a" } };
const memberInput = { closest() { return memberInputPort; } };
node.holds = memberInputPort;
assert.equal(
  rules.resolveDropPort(node, memberInput, "input", "input"),
  "member-input:image-a",
);
const outsideInputPort = { dataset: { canvasPort: "member-input:image-b" } };
const outsidePort = { closest() { return outsideInputPort; } };
node.holds = ordinaryInputPort;
assert.equal(rules.resolveDropPort(node, outsidePort, "input", "input"), "input");

const viewIndex = html.indexOf("canvas-view-rules.js");
const connectionIndex = html.indexOf("canvas-connection-rules.js");
const contractIndex = html.indexOf("canvas-engine-contract.js");
const runtimeIndex = html.indexOf("script.js");
assert.ok(viewIndex >= 0, "index.html must load canvas view rules");
assert.ok(connectionIndex > viewIndex, "connection rules must load after view rules");
assert.ok(connectionIndex < contractIndex, "connection rules must load before the engine contract");
assert.ok(connectionIndex < runtimeIndex, "connection rules must load before the canvas runtime");
assert.ok(
  manifest.includes("./canvas-connection-rules.js?v=20260924-canvas-connection-rules"),
  "the canvas engine component must own the connection rules module",
);
assert.match(script, /const CanvasConnectionRules = window\.CanvasConnectionRules/);
assert.match(script, /function getCanvasConnectionId\([\s\S]*?CanvasConnectionRules\.connectionId/);
assert.match(script, /function getCanvasConnectionPathData\([\s\S]*?CanvasConnectionRules\.pathData/);
assert.match(
  script,
  /function resolveCanvasConnectionDropPort\([\s\S]*?CanvasConnectionRules\.resolveDropPort/,
);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node --check canvas-connection-rules\.js/,
  "the canvas engine check must syntax-check the connection rules",
);
assert.match(
  packageJson.scripts["check:canvas-engine-contract"],
  /node tools\/check-canvas-connection-rules\.js/,
  "the canvas engine check must execute focused connection rule tests",
);

console.log("Canvas connection rule checks passed.");
