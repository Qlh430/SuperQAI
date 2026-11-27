const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = __dirname;
const sourceDir = path.join(rootDir, "design-sources");

const categories = JSON.parse(
  fs.readFileSync(path.join(sourceDir, "visual-preset-categories.json"), "utf8"),
);
const presets = JSON.parse(
  fs.readFileSync(path.join(sourceDir, "visual-presets.json"), "utf8"),
);
const source = fs.readFileSync(
  path.join(sourceDir, "visual-presets-runtime.js"),
  "utf8",
);

assert.deepEqual(
  categories.categories.map((category) => category.id),
  ["characterDesign", "stylePreset", "filterPreset", "cameraControl"],
);
assert.deepEqual(
  categories.categories.find((category) => category.id === "cameraControl").tabs.map((tab) => tab.id),
  ["camera", "lens", "focalLength", "aperture"],
);
assert.ok(presets.presets.some((preset) => preset.id === "style-natural-lifestyle"));
assert.equal(new Set(presets.presets.map(preset => preset.id)).size, presets.presets.length);
for (const preset of presets.presets) {
  for (const key of ["id", "type", "group", "subgroup", "name", "thumbnail", "description",
    "selectionMode", "promptPositive", "promptNegative", "order", "tags"]) {
    assert.ok(Object.hasOwn(preset, key), `${preset.id} 缺少 ${key}`);
  }
}

const fakeWindow = {
  FloraVisualPresetConfig: {
    ...categories,
    presets: presets.presets.map(({ promptPositive, promptNegative, ...preset }) => ({
      ...preset, runtimeEffectPrompt: promptPositive, runtimeNegativePrompt: promptNegative,
    })),
  },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
      this.bubbles = init?.bubbles;
    }
  },
};
vm.runInNewContext(source, { window: fakeWindow, globalThis: fakeWindow });

assert.equal(typeof fakeWindow.FloraVisualPresets.buildPrompt, "function");
assert.equal(typeof fakeWindow.FloraVisualPresets.serialize, "function");

const node = {
  dataset: {
    floraKind: "generator",
    floraVisualPresets: JSON.stringify({
      stylePreset: "style-natural-lifestyle",
      cameraControl: {
        camera: "camera-hasselblad",
        focalLength: "focal-50",
        aperture: "aperture-f2-8",
      },
    }),
  },
  dispatchEvent() {},
};

const serialized = fakeWindow.FloraVisualPresets.serialize(node);
assert.equal(serialized.stylePreset, "style-natural-lifestyle");
assert.equal(serialized.cameraControl.focalLength, "focal-50");

const prompt = fakeWindow.FloraVisualPresets.buildPrompt(node, "主提示");
assert.doesNotMatch(prompt, /\[AI OS 视觉预设\]/);
assert.match(prompt, /自然生活方式/);
assert.match(prompt, /50mm/);
assert.equal(
  fakeWindow.FloraVisualPresets.buildPrompt(node, "主提示\n\n[AI OS 视觉预设]\n旧内容\n[/AI OS 视觉预设]"),
  prompt,
);

const agentNode = { dataset: { floraKind: "generator" }, dispatchEvent() {} };
const lookup = fakeWindow.FloraVisualPresets.queryCatalog({ name: "男性", offset: 0 });
assert.equal(lookup.items[0].name, "男性");
assert.equal(lookup.items[0].group, "gender");
assert.equal(Object.hasOwn(lookup.items[0], "runtimeEffectPrompt"), false);
const agentIds = [lookup.items[0].id, "style-natural-lifestyle", "focal-50"];
assert.deepEqual(Array.from(fakeWindow.FloraVisualPresets.updateSelection(agentNode, { add: agentIds, remove: [] })), agentIds);
assert.match(fakeWindow.FloraVisualPresets.buildPrompt(agentNode, "主提示"), /男性/);
const beforeInvalid = agentNode.dataset.floraVisualPresets;
assert.throws(() => fakeWindow.FloraVisualPresets.updateSelection(agentNode, { add: ["not-a-preset"], remove: agentIds }), /不存在/);
assert.equal(agentNode.dataset.floraVisualPresets, beforeInvalid);
const editedPresets = fakeWindow.FloraVisualPresets.updateSelection(agentNode, { add: ["style-minimal-commercial"], remove: ["focal-50"] });
assert.deepEqual(Array.from(editedPresets), [lookup.items[0].id, "style-minimal-commercial"]);

const textNode = {
  dataset: {
    floraKind: "text",
    floraVisualPresets: JSON.stringify({ stylePreset: "style-natural-lifestyle" }),
  },
};
assert.equal(fakeWindow.FloraVisualPresets.buildPrompt(textNode, "文本节点"), "文本节点");
for (const kind of ["upload", "video-api", "audio-generator", "minimax-h3"]) {
  const other = { dataset: { floraKind: kind } };
  fakeWindow.FloraVisualPresets.write(other, { stylePreset: "style-natural-lifestyle" });
  assert.equal(other.dataset.floraVisualPresets, undefined);
  assert.equal(fakeWindow.FloraVisualPresets.buildPrompt(other, "已有提示词"), "已有提示词");
}

let change;
node.dispatchEvent = event => { change = event; };
fakeWindow.FloraVisualPresets.write(node, { stylePreset: "style-minimal-commercial" });
assert.equal(change?.bubbles, true, "选择变更必须到达 window 的画布保存监听器");
change = null;
fakeWindow.FloraVisualPresets.hydrate(node, serialized);
assert.equal(change, null, "恢复画布不应再次触发保存");

fakeWindow.FloraVisualPresets.write(node, {
  characterDesign: { age: "focal-50" },
  stylePreset: "filter-hdr",
  cameraControl: { camera: "style-natural-lifestyle" },
});
assert.equal(fakeWindow.FloraVisualPresets.read(node).stylePreset, "");
assert.equal(fakeWindow.FloraVisualPresets.read(node).characterDesign.age, undefined);
assert.equal(fakeWindow.FloraVisualPresets.read(node).cameraControl.camera, "");

const { compileGeneratorComposer } = require("./visual-presets-build.cjs");
const compiled = compileGeneratorComposer(rootDir);
const install = compiled.indexOf("(function installFloraGeneratorComposer");
assert.ok(install > 0, "生产操作区脚本必须先装载配置与预设引擎");
const loadedWindow = {};
vm.runInNewContext(compiled.slice(0, install), { window: loadedWindow, globalThis: loadedWindow });
assert.equal(loadedWindow.FloraVisualPresetConfig.library.length, 439);
assert.equal(new Set(loadedWindow.FloraVisualPresetConfig.presets.map(preset => preset.id)).size,
  loadedWindow.FloraVisualPresetConfig.presets.length);
assert.ok(loadedWindow.FloraVisualPresetConfig.categories.some(category => category.id === "functionPreset"));
assert.equal(typeof loadedWindow.FloraVisualPresets.buildPrompt, "function");
assert.equal(Object.keys(loadedWindow.FloraVisualPresetConfig.previews).length, 0,
  "预览资源必须通过按需加载的本地静态 URL 获取，不得构建期内嵌");

const integratedNode = {
  dataset: { floraKind: "generator" },
  dispatchEvent() {},
};
loadedWindow.FloraVisualPresets.write(integratedNode, {
  stylePreset: "style-documentary-cinematic",
  filterPreset: "FG02",
  functionPreset: "FN01",
  characterDesign: { "LOOK-ACCESSORY": ["LOOK-ACCESSORY-02", "LOOK-ACCESSORY-03"] },
  cameraControl: { camera: "camera-hasselblad", lens: "lens-zeiss-ultra-prime" },
});
const integrated = loadedWindow.FloraVisualPresets.buildPrompt(integratedNode, "用户原始提示词");
assert.match(integrated, /用户原始提示词/);
assert.match(integrated, /纪实电影摄影/);
assert.match(integrated, /全景图|广角全景视角/);
assert.match(integrated, /柯达|暖色彩色负片/);
assert.match(integrated, /配饰：帽子。/);
assert.match(integrated, /发饰/);
assert.match(integrated, /中画幅数码成像/);
assert.match(integrated, /中心到边缘细节稳定/);
assert.equal(loadedWindow.FloraVisualPresets.serialize(integratedNode).cameraControl.lens, "lens-zeiss-ultra-prime");
assert.deepEqual(
  Array.from(loadedWindow.FloraVisualPresets.serialize(integratedNode).characterDesign["LOOK-ACCESSORY"]),
  ["LOOK-ACCESSORY-02", "LOOK-ACCESSORY-03"],
);
assert.equal(loadedWindow.FloraVisualPresets.requiresImageReference(integratedNode), true);
loadedWindow.FloraVisualPresets.write(integratedNode, { stylePreset: "style-documentary-cinematic" });
assert.equal(loadedWindow.FloraVisualPresets.requiresImageReference(integratedNode), false);

console.log("visual-presets-runtime contract passed");
