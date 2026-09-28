"use strict";

const assert = require("node:assert/strict");
const ui = require("../canvas-h3-controls-ui.js");

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "").toUpperCase();
    this.children = [];
    this.dataset = {};
    this.value = "";
    this.type = "";
    this.className = "";
    this.min = "";
    this.max = "";
    this.step = "";
    this.listeners = new Map();
  }

  append(...nodes) {
    this.children.push(...nodes.filter(Boolean));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    this.listeners.get(type)?.();
  }
}

const document = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
};

const selectChanges = [];
const selectField = ui.createSelectField({
  document,
  label: "画幅",
  choices: [["1:1", "方形"], ["16:9", "横屏"]],
  value: "16:9",
  onChange: (value) => selectChanges.push(value),
});
const select = selectField.children[1];
assert.equal(selectField.className, "canvas-h3-field");
assert.equal(select.children.length, 2);
assert.equal(select.value, "16:9");
select.value = "1:1";
select.emit("change");
assert.deepEqual(selectChanges, ["1:1"]);

const numberChanges = [];
const numberField = ui.createNumberField({
  document,
  label: "时长",
  value: 12,
  min: 5,
  max: 15,
  step: 1,
  onChange: (value) => numberChanges.push(value),
});
const number = numberField.children[1];
assert.equal(number.type, "number");
assert.equal(number.value, "12");
number.value = "99";
number.emit("change");
assert.equal(number.value, "15");
assert.deepEqual(numberChanges, ["15"]);

const blankChanges = [];
const blankField = ui.createNumberField({
  document,
  label: "种子",
  value: "",
  min: 0,
  max: Number.MAX_SAFE_INTEGER,
  step: 1,
  allowBlank: true,
  onChange: (value) => blankChanges.push(value),
});
const blankInput = blankField.children[1];
assert.equal(blankInput.value, "");
blankInput.value = "";
blankInput.emit("change");
assert.deepEqual(blankChanges, [""]);

const resolution = ui.calculateResolution({
  "16:9": [16, 9],
  "9:16": [9, 16],
}, "unknown", 0.6);
assert.equal(resolution.width % 32, 0);
assert.equal(resolution.height % 32, 0);
assert.ok(resolution.width > resolution.height);

console.log("Canvas H3 controls UI checks passed.");
