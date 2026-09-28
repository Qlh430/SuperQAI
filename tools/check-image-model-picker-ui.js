"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const picker = fs.readFileSync(path.join(root, "image-model-picker.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert(html.includes('id="imageModelPickerMount"'), "image workspace needs a picker mount");
assert(html.includes('class="image-model-source"'), "native select must remain as the form-compatible source");
assert(html.indexOf("image-model-picker.js") < html.indexOf("script.js"), "picker module must load before the application script");

for (const token of [
  "createSelectPicker",
  'role", "dialog"',
  'role", "listbox"',
  'aria-haspopup", "dialog"',
  "推荐",
  "最近",
  "收藏",
  "API 设置",
  "document.body.append(popover)",
  "function destroy()",
]) {
  assert(picker.includes(token), `picker runtime is missing ${token}`);
}

const canvasRunStart = script.indexOf("async function runCanvasImageEdit");
const canvasRunEnd = script.indexOf("async function runCanvasLlmNode", canvasRunStart);
const canvasRun = script.slice(canvasRunStart, canvasRunEnd);
assert(canvasRun.includes('modelSelection === "auto"'), "canvas generator needs explicit automatic selection semantics");
assert(canvasRun.includes('...(!automaticSelection ? { model: activeModel } : {})'), "automatic canvas requests must omit the pinned model");
assert(script.includes('base.modelSelection ='), "canvas persistence must preserve automatic versus exact selection");

for (const token of [
  "initializeImageModelPicker",
  "refreshImageModelPickers",
  "enhanceCanvasImageModelSelect",
  "modelSelection",
]) {
  assert(script.includes(token), `application integration is missing ${token}`);
}

for (const selector of [
  ".image-model-picker",
  ".image-model-picker-popover",
  ".image-model-picker-search",
  ".image-model-provider-group",
  ".image-model-picker-row",
  ".canvas-node-controls .image-model-picker",
  ':root[data-theme="dark"] .image-model-picker-popover',
]) {
  assert(styles.includes(selector), `picker styles are missing ${selector}`);
}

console.log("Image model picker UI checks passed.");

const start = script.indexOf("function fillCanvasNodeModelSelect(");
const end = script.indexOf("\nfunction refreshCanvasImageModelSelects(", start);
const modelContext = vm.createContext({
  window: { ImageModelPicker: require("../image-model-picker") },
  imageModelCatalog: [
    { id: "first:model" },
    { id: "second:model", legacyIds: ["second:model-grsai"] },
  ],
  imageModelInput: { value: "first:model" },
  getCanvasImageModels: () => [{ value: "first:model", label: "first" }, { value: "second:model", label: "second" }],
  getImageModelPlatform: () => "openai",
  document: { createElement: () => ({}) },
});
vm.runInContext(script.slice(start, end), modelContext);
const select = { innerHTML: "", dataset: {}, append() {} };
assert.equal(modelContext.fillCanvasNodeModelSelect(select, "second:model-grsai"), "second:model", "an old pinned canvas node must not switch to the first provider");
