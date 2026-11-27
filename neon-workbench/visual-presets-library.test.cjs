"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const libraryPath = path.join(__dirname, "design-sources/visual-preset-library.json");
assert.ok(fs.existsSync(libraryPath), "439 项预设目录应由来源任务清单生成");
const library = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
const { validateLibrary } = require("./visual-presets-library.cjs");
const { extendCategories, extendPresets } = require("./visual-presets-build.cjs");
const baseCategories = JSON.parse(fs.readFileSync(path.join(__dirname,
  "design-sources/visual-preset-categories.json"), "utf8"));
const categories = extendCategories(baseCategories, library.entries).categories;

const result = validateLibrary(library);
assert.equal(result.total, 439);
assert.deepEqual(result.counts, {
  style: 80,
  preset: 30,
  camera: 12,
  character: 317,
});
assert.equal(result.duplicateIds.length, 0);
assert.equal(result.invalidEntries.length, 0);
assert.equal(library.entries.find(entry => entry.id === "FG01").legacyId, "filter-original");
assert.equal(library.entries.find(entry => entry.id === "FG05").legacyId, "filter-soft-film");
assert.equal(library.entries.find(entry => entry.id === "FG07").legacyId, "filter-cinematic-light");
assert.deepEqual(categories.find(category => category.id === "characterDesign").tabs.map(tab => tab.label),
  ["基础", "妆容与穿搭", "五官", "体型", "发型", "风格"]);
assert.deepEqual(categories.find(category => category.id === "stylePreset").tabs.map(tab => tab.label),
  ["真人风格", "MV 风格", "2D 风格", "3D 风格"]);
assert.deepEqual(categories.find(category => category.id === "filterPreset").tabs.map(tab => tab.label),
  ["通用", "人像质感"]);
assert.deepEqual(categories.find(category => category.id === "cameraControl").tabs.map(tab => tab.label),
  ["相机", "镜头", "焦距", "光圈"]);
assert.equal(categories.find(category => category.id === "functionPreset").tabs, undefined);
assert.deepEqual(categories.find(category => category.id === "filterPreset").tabs.map(tab => tab.presetTags), [["general"], ["portrait"]]);
assert.deepEqual(categories.find(category => category.id === "cameraControl").tabs.slice(0, 4).map(tab => tab.groups[0].id),
  ["camera", "lens", "focalLength", "aperture"]);
assert.equal(library.entries.find(entry => entry.id === "R01").name, "电影感");
assert.equal(library.entries.find(entry => entry.id === "FN10").assetStatus, "missing");
assert.ok(["completed", "failed", "submitted", "processing", "pending"].includes(
  library.entries.find(entry => entry.id === "FN10").taskStatus),
"image session status is read-only source data");
assert.equal(library.entries.find(entry => entry.id === "CAM01").assetStatus, "missing");
assert.equal(library.entries.find(entry => entry.id === "FG02").requiresReference, true);
assert.equal(library.entries.find(entry => entry.id === "FP01").requiresReference, true);
assert.match(library.entries.find(entry => entry.id === "CAM01").previewGenerationPrompt, /微暖但不偏黄/);
assert.match(library.entries.find(entry => entry.id === "CAM01").previewGenerationPrompt, /身份、面容、发型、表情/);
assert.match(library.entries.find(entry => entry.id === "LOOK-COSTUME-01").previewGenerationPrompt, /不出现文字/);
assert.equal(library.entries.find(entry => entry.id === "LOOK-COSTUME-01").groupLabel, "服装风格");
assert.equal(library.entries.find(entry => entry.id === "LOOK-ACCESSORY-01").selectionMode, "multi");
assert.equal(library.entries.find(entry => entry.id === "FACE-MARK-01").selectionMode, "multi");
assert.deepEqual(library.entries.find(entry => entry.id === "LOOK-PALETTE-01").paletteColors,
  ["#FFFFFF", "#F8F8F8", "#F1F1F1", "#E8E8E8"]);
assert.equal(library.entries.find(entry => entry.id === "STYLE-LIGHT-01").needsLabelConfirmation, true);
assert.ok(library.entries.every(entry => entry.previewGenerationPrompt.trim().length > 0), "保留全部预览制作提示词");
assert.ok(library.entries.every(entry => entry.previewPath.startsWith("/visual-presets/")), "预览路径必须是应用内相对 URL");
const knownIds = new Set(JSON.parse(fs.readFileSync(path.join(__dirname,
  "design-sources/visual-presets.json"), "utf8")).presets.map(preset => preset.id));
assert.ok(library.entries.every(entry => !entry.legacyId || knownIds.has(entry.legacyId)),
  "稳定 ID 别名必须指向现有预设，不得虚构");
const { effects } = JSON.parse(fs.readFileSync(path.join(__dirname, "design-sources/visual-preset-effects.json"), "utf8"));
const runtimePresets = extendPresets(
  JSON.parse(fs.readFileSync(path.join(__dirname, "design-sources/visual-presets.json"), "utf8")).presets,
  library.entries,
  path.join(__dirname, "public/visual-presets"),
  null,
  null,
  effects,
);
assert.equal(runtimePresets.filter(preset => preset.group === "stylePreset").length, 80);
assert.equal(runtimePresets.filter(preset => preset.group === "filterPreset").length, 18);
assert.equal(runtimePresets.filter(preset => preset.group === "functionPreset").length, 12);

console.log("visual-presets-library contract passed");
