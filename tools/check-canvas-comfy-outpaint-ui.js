"use strict";

const assert = require("node:assert/strict");
const ui = require("../canvas-comfy-outpaint-ui.js");

function createInput(side) {
  const listeners = new Map();
  return {
    value: "",
    dataset: { paddingSide: side },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    emit(type) {
      listeners.get(type)?.();
    },
  };
}

const inputs = ["top", "right", "bottom", "left"].map(createInput);
let pointerDownHandler = null;
const area = {
  className: "",
  hidden: false,
  innerHTML: "",
  querySelectorAll(selector) {
    return selector === "[data-padding-side]" ? inputs : [];
  },
  addEventListener(type, listener) {
    if (type === "pointerdown") pointerDownHandler = listener;
  },
};
const document = {
  createElement(tagName) {
    assert.equal(tagName, "section");
    return area;
  },
};

const node = {
  querySelectorAll(selector) {
    return selector === "[data-padding-side]" ? inputs : [];
  },
};
let padding = { top: 8, right: 16, bottom: 24, left: 32 };
let previewCount = 0;
let hintCount = 0;
let saveCount = 0;
let pointerNode = null;

const created = ui.createOutpaintArea({
  document,
  node,
  getPadding: () => ({ ...padding }),
  setPadding: (_node, next) => {
    padding = { ...next };
  },
  normalizePadding: (next) => Object.fromEntries(
    Object.entries(next).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]),
  ),
  onPreview: () => {
    previewCount += 1;
  },
  onHint: () => {
    hintCount += 1;
  },
  onSave: () => {
    saveCount += 1;
  },
  onPointerDown: (_event, targetNode) => {
    pointerNode = targetNode;
  },
});

assert.equal(created, area);
assert.equal(created.className, "canvas-comfy-outpaint");
assert.match(created.innerHTML, /data-comfy-outpaint-side="top-left"/);
assert.match(created.innerHTML, /data-padding-side="right"/);
assert.deepEqual(inputs.map((input) => input.value), [8, 16, 24, 32]);

inputs[0].value = "128";
inputs[0].emit("input");
assert.equal(padding.top, 128);
assert.equal(previewCount, 1);
assert.equal(hintCount, 1);
assert.equal(saveCount, 1);

padding = { top: 48, right: 64, bottom: 80, left: 96 };
inputs[0].emit("change");
assert.deepEqual(inputs.map((input) => input.value), [48, 64, 80, 96]);

pointerDownHandler?.();
assert.equal(pointerNode, node);

const syncInputs = ["top", "right", "bottom", "left"].map(createInput);
const syncNode = {
  querySelectorAll() {
    return syncInputs;
  },
};
ui.syncPaddingInputs({
  node: syncNode,
  getPadding: () => ({ top: 1, right: 2, bottom: 3, left: 4 }),
});
assert.deepEqual(syncInputs.map((input) => input.value), [1, 2, 3, 4]);

console.log("Canvas ComfyUI outpaint UI checks passed.");
