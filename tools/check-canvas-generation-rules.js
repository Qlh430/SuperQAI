"use strict";

const assert = require("node:assert/strict");
const rules = require("../canvas-generation-rules.js");

function node(...classes) {
  const values = new Set(classes);
  return {
    classList: {
      contains: (value) => values.has(value),
    },
  };
}

assert.equal(rules.FAMILIES.image.api, "generator");
assert.equal(rules.FAMILIES.image.comfyui, "comfy");
assert.equal(rules.FAMILIES.video.api, "video-api");
assert.equal(rules.FAMILIES.video.comfyui, "minimax-h3");
assert.deepEqual(rules.ENGINES.map((engine) => engine.id), ["api", "comfyui"]);

assert.equal(rules.getFamily(node("canvas-node-generator")), "image");
assert.equal(rules.getFamily(node("canvas-node-comfy")), "image");
assert.equal(rules.getFamily(node("canvas-node-video-api")), "video");
assert.equal(rules.getFamily(node("canvas-node-minimax-h3")), "video");
assert.equal(rules.getFamily(node("canvas-node-image")), "");

assert.equal(rules.getEngine(node("canvas-node-generator")), "api");
assert.equal(rules.getEngine(node("canvas-node-comfy")), "comfyui");
assert.equal(rules.getEngine(node("canvas-node-video-api")), "api");
assert.equal(rules.getEngine(node("canvas-node-minimax-h3")), "comfyui");

assert.equal(rules.getImplementation(node("canvas-node-generator")), "generator");
assert.equal(rules.getImplementation(node("canvas-node-comfy")), "comfy");
assert.equal(rules.getImplementation(node("canvas-node-video-api")), "video-api");
assert.equal(rules.getImplementation(node("canvas-node-minimax-h3")), "minimax-h3");
assert.equal(rules.getImplementation(node("canvas-node-image")), "");
assert.equal(rules.getImplementation(null), "");

console.log("Canvas generation rules checks passed.");
