"use strict";

const assert = require("node:assert/strict");
const rules = require("../canvas-comfy-rules.js");

assert.deepEqual(rules.normalizePadding({
  left: 203,
  top: "5",
  right: 1599,
  bottom: -20,
}), {
  left: 200,
  top: 8,
  right: 1600,
  bottom: 0,
});

assert.deepEqual(rules.normalizeQwenAngle({
  horizontal: 181,
  vertical: -31,
  zoom: 6.26,
}), {
  horizontal: 180,
  vertical: -30,
  zoom: 6.3,
});

assert.equal(rules.describeQwenHorizontal(0), "\u6b63\u9762");
assert.equal(rules.describeQwenHorizontal(90), "\u53f3\u4fa7\u9762");
assert.equal(rules.describeQwenVertical(30), "\u4fef\u89c6");
assert.equal(rules.describeQwenVertical(-30), "\u4ef0\u89c6");
assert.equal(rules.describeQwenZoom(8), "\u8fd1\u666f");
assert.equal(rules.describeQwenZoom(2), "\u8fdc\u666f");
assert.equal(rules.describeQwenZoom(5), "\u4e2d\u666f");

assert.equal(rules.isResolutionMode("upscale"), true);
assert.equal(rules.isResolutionMode("upscale2"), true);
assert.equal(rules.isResolutionMode("qwen-edit-angle"), false);
assert.equal(rules.normalizeResolution("8192"), "6144");
assert.equal(rules.normalizeResolution("4096"), "4096");
assert.equal(rules.normalizeResolution("invalid"), "2048");

const paddingNode = { dataset: {} };
const padding = rules.setPadding(paddingNode, { left: 8, top: 16, right: 24, bottom: 32 });
assert.deepEqual(padding, undefined);
assert.deepEqual(rules.getPadding(paddingNode), { left: 8, top: 16, right: 24, bottom: 32 });

const angleNode = { dataset: {} };
const angle = rules.setQwenAngle(angleNode, { horizontal: 45, vertical: 10, zoom: 4.2 });
assert.deepEqual(angle, { horizontal: 45, vertical: 10, zoom: 4.2 });
assert.deepEqual(rules.getQwenAngle(angleNode), { horizontal: 45, vertical: 10, zoom: 4.2 });

console.log("Canvas ComfyUI rules checks passed.");
