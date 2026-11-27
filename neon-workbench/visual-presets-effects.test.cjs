"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { compileGeneratorComposer } = require("./visual-presets-build.cjs");

const compiled = compileGeneratorComposer(__dirname);
const context = {};
vm.runInNewContext(compiled.slice(0, compiled.indexOf("(function installFloraGeneratorComposer")), context);
const { FloraVisualPresets: runtime, FloraVisualPresetConfig: config } = context;

function nodeFor(selection) {
  const node = { dataset: { floraKind: "generator" } };
  runtime.hydrate(node, selection);
  return node;
}

const historicalSelection = {
  characterDesign: {
    gender: "gender-male",
    age: "age-elder-65-plus",
    era: "era-modern",
    "LOOK-COSTUME": "LOOK-COSTUME-14",
    "HAIR-TYPE": "HAIR-TYPE-06",
    "HAIR-COLOR": "HAIR-COLOR-13",
  },
  stylePreset: "D03",
};

test("a selection contributes only its own compiled runtime effect", () => {
  assert.equal(runtime.buildPrompt(nodeFor({ characterDesign: { gender: "gender-male" } })), "性别：男性。");
  assert.equal(runtime.buildPrompt(nodeFor({}), "原文"), "原文");
  for (const { id, type, group, runtimeEffectPrompt } of config.presets) {
    assert.equal(typeof runtimeEffectPrompt, "string", id);
    const multi = config.categories[0].groups.some(item => item.id === group && item.selectionMode === "multi");
    const selection = type === "character"
      ? { characterDesign: { [group]: multi ? [id] : id } }
      : ["camera", "lens", "focalLength", "aperture"].includes(group)
        ? { cameraControl: { [group]: id } }
        : { [group]: id };
    assert.equal(runtime.buildPrompt(nodeFor(selection)), runtimeEffectPrompt, id);
  }
});

test("API, Qwen and Flux receive byte-identical preset text", async () => {
  const route = sandbox();
  const own = "主提示";
  const expected = runtime.buildPrompt(nodeFor(historicalSelection), own);
  route.setInputs([{ type: "image", url: "/output/source.png", name: "上游" }]);
  await route.run({ selection: historicalSelection, own });
  await route.run({ selection: historicalSelection, own, engine: "comfyui" });
  await route.run({ selection: historicalSelection, own, engine: "comfyui", comfyMode: "flux2-klein-edit" });
  assert.deepEqual(route.requests.map(({ path, body }) => [path, body.prompt]), [
    ["/api/image-jobs", expected + "\n\nAspect ratio: 1:1. Generate a high-detail image while keeping the requested aspect ratio."],
    ["/offline/qwen", expected],
    ["/offline/flux", expected],
  ]);
});

test("historical seven choices contribute seven independent attribute lines", () => {
  const node = nodeFor(historicalSelection);
  const prompt = runtime.buildPrompt(node, "创作角色");
  assert.doesNotMatch(prompt, /女孩|淡粉白|爱心|心形|星光|16:9|玻璃幕墙|广场|公共交通|黑色|多视窗|\/visual-presets\//);
  const ids = [...Object.values(historicalSelection.characterDesign), historicalSelection.stylePreset];
  const expected = ids.map(id => config.presets.find(preset => preset.id === id).runtimeEffectPrompt);
  assert.equal(prompt, ["创作角色", expected.join("\n")].join("\n\n"));
  const legacyPrompt = "创作角色\n\n[AI OS 视觉预设]\n旧版附加属性\n[/AI OS 视觉预设]";
  assert.equal(runtime.buildPrompt(node, legacyPrompt), prompt);
  runtime.hydrate(node, {});
  assert.equal(runtime.buildPrompt(node, legacyPrompt), "创作角色");
});

test("all option IDs resolve with preview production text excluded from executable data", () => {
  assert.equal(config.presets.length, 500);
  assert.equal(new Set(config.presets.map(preset => preset.id)).size, 500);
  assert.equal(config.presets.filter(preset => !preset.hiddenFromPicker).length, 498);
  assert.equal(config.library.length, 439);
  const archive = JSON.parse(fs.readFileSync(path.join(__dirname, "design-sources/visual-preset-library.json"), "utf8"));
  for (const entry of archive.entries) {
    assert.equal(typeof entry.previewGenerationPrompt, "string", entry.id);
    assert.equal(Object.hasOwn(entry, "prompt"), false, entry.id);
    const compiledEntry = config.library.find(row => row.id === entry.id);
    assert.equal(Object.hasOwn(compiledEntry, "previewGenerationPrompt"), false, entry.id);
    assert.equal(Object.hasOwn(compiledEntry, "prompt"), false, entry.id);
  }
  for (const preset of config.presets) {
    assert.doesNotMatch(preset.runtimeEffectPrompt, /预览缩略图|多视窗、畸形肢体|\/visual-presets\//, preset.id);
    assert.equal(Object.hasOwn(preset, "promptPositive"), false, preset.id);
  }
});

test("empty choices are compatible stable IDs, clear their group and produce no effect", () => {
  const selection = {
    characterDesign: {
      "LOOK-ACCESSORY": ["LOOK-ACCESSORY-02", "LOOK-ACCESSORY-01"],
      "FACE-MARK": ["FACE-MARK-05", "FACE-MARK-01", "FACE-MARK-09"],
    },
    filterPreset: "filter-original",
  };
  const node = nodeFor(selection);
  const restored = runtime.serialize(node);
  assert.equal(restored.filterPreset, "filter-original");
  assert.deepEqual(Array.from(restored.characterDesign["LOOK-ACCESSORY"]), ["LOOK-ACCESSORY-01"]);
  assert.deepEqual(Array.from(restored.characterDesign["FACE-MARK"]), ["FACE-MARK-09"]);
  assert.equal(runtime.requiresImageReference(node), false);
  assert.equal(runtime.buildPrompt(nodeFor({ filterPreset: "filter-original" }), "主提示"), "主提示");
  assert.doesNotMatch(runtime.buildPrompt(node, "主提示"), /空状态图标|直接复制|无痣|雀斑/);
});

test("negative constraints are distinct from the positive prompt", () => {
  const node = nodeFor({ characterDesign: { age: "age-child-6-12" } });
  assert.doesNotMatch(runtime.buildPrompt(node, "主提示"), /视觉限制|避免成人化面部特征/);
  assert.equal(runtime.buildNegativePrompt(node), "避免成人化面部特征");
});

test("legacy style conflicts resolve to the previously effective library style", () => {
  const node = nodeFor({ stylePreset: "D03", characterDesign: { "STYLE-RENDER": "STYLE-RENDER-01" } });
  assert.doesNotMatch(runtime.buildPrompt(node), /写实摄影|金鱼鳞片/);
  assert.equal(runtime.serialize(node).characterDesign["STYLE-RENDER"], undefined);
  const renderingOnly = nodeFor({ characterDesign: { "STYLE-RENDER": "STYLE-RENDER-01" } });
  assert.match(runtime.buildPrompt(renderingOnly), /写实摄影/);
});

test("filters and functions contribute their own effects in isolation and together", () => {
  const normal = nodeFor({ filterPreset: "FG11" });
  assert.equal(runtime.requiresImageReference(normal), true);
  const retouch = runtime.buildPrompt(normal);
  assert.match(retouch, /^滤镜效果：赛博朋克影调/);
  assert.doesNotMatch(retouch, /自行车|骑车|公路|雪山|16:9/);
  const combined = nodeFor({ stylePreset: "D03", filterPreset: "FG11", functionPreset: "FN02" });
  const converted = runtime.buildPrompt(combined, "为同组人物创作多机位图");
  assert.match(converted, /九宫格/);
  assert.match(converted, /赛博朋克|蓝青/);
  assert.doesNotMatch(converted, /后期处理.*主体身份与构图|不出现.*多人物|不出现.*多视窗/);
});

test("function preset semantics survive grouping and preserve all 12 outputs", () => {
  const meanings = [/全景/, /九宫格/, /校正|校光/, /正面.*头部/, /正面.*侧面.*背面/, /头像.*正面.*侧面.*背面/,
    /拆解/, /人物设计/, /场景设计/, /道具设计/, /三秒后|3秒后/, /五秒前|5秒前/];
  for (const [i, expected] of meanings.entries()) {
    const id = "FN" + String(i + 1).padStart(2, "0");
    const node = nodeFor({ functionPreset: id, characterDesign: { "HAIR-TYPE": "HAIR-TYPE-06" } });
    const prompt = runtime.buildPrompt(node, "设计我描述的对象");
    assert.match(prompt, expected, id);
    assert.doesNotMatch(prompt, /16:9|长枪|冒险者|地中海小镇|滑板运动员|谷桥|禁止多视图|不出现文字、数字、水印/, id);
  }
});

test("compiled effects fail closed and every stable option is selectable via its field", () => {
  const { extendPresets } = require("./visual-presets-build.cjs");
  assert.throws(() => extendPresets([], [{ id: "unfinished", prompt: "preview only" }], ""), /缺少独立运行时效果/);
  const groups = new Map(config.categories.find(category => category.id === "characterDesign").groups
    .map(group => [group.id, group.selectionMode]));
  for (const preset of config.presets) {
    const selection = preset.type === "character" ? {
      characterDesign: { [preset.group]: groups.get(preset.group) === "multi" ? [preset.id] : preset.id },
    } : ["camera", "lens", "focalLength", "aperture"].includes(preset.group)
      ? { cameraControl: { [preset.group]: preset.id } } : { [preset.group]: preset.id };
    const node = nodeFor(selection);
    assert.equal(runtime.requiresImageReference(node), !!preset.requiresReference, preset.id);
    assert.equal(runtime.buildNegativePrompt(node), preset.runtimeNegativePrompt, preset.id);
  }
  const aliases = nodeFor({ stylePreset: "R01", filterPreset: "FG01", cameraControl: { camera: "CAM01", lens: "LEN02" } });
  const saved = runtime.serialize(aliases);
  assert.equal(saved.stylePreset, "style-documentary-cinematic");
  assert.equal(saved.filterPreset, "filter-original");
  assert.equal(saved.cameraControl.camera, "camera-hasselblad");
  assert.equal(saved.cameraControl.lens, "lens-zeiss-ultra-prime");
  for (const id of ["gender-androgynous", "gender-nonbinary"]) {
    assert.equal(runtime.serialize(nodeFor({ characterDesign: { gender: id } })).characterDesign.gender, id);
  }
});

test("role combinations preserve clothing category, hair axes and explicit multi-subject requests", () => {
  const build = (selection, base) => runtime.buildPrompt(nodeFor(selection), base);
  const elders = {
    gender: "gender-male", age: "age-elder-65-plus", "LOOK-COSTUME": "LOOK-COSTUME-14",
    "HAIR-TYPE": "HAIR-TYPE-06", "HAIR-COLOR": "HAIR-COLOR-13",
  };
  const male = build({ characterDesign: elders });
  assert.match(male, /性别：男性。[\s\S]+洛丽塔[\s\S]+绿色/);
  assert.doesNotMatch(male, /黑色|蓬裙|少女|蕾丝/);
  const female = build({ characterDesign: { gender: "gender-female", "LOOK-COSTUME": "LOOK-COSTUME-14" } });
  assert.match(female, /女性[\s\S]+洛丽塔/);
  const street = build({ characterDesign: { gender: "gender-male", "LOOK-COSTUME": "LOOK-COSTUME-11" } });
  assert.match(street, /男性[\s\S]+街头/);
  assert.doesNotMatch(street, /荧光卫衣|拼色裤|球鞋/);
  const noClothes = build({ characterDesign: { age: elders.age, "HAIR-TYPE": "HAIR-TYPE-07", "HAIR-COLOR": elders["HAIR-COLOR"] } });
  assert.doesNotMatch(noClothes, /服装风格|洛丽塔|黑色|长发|中分/);
  assert.match(noClothes, /顺直[\s\S]+绿色/);
  const child = build({ characterDesign: {
    age: "age-child-6-12", "BODY-HEIGHT": "BODY-HEIGHT-03", "BODY-SHAPE": "BODY-SHAPE-01",
    "BODY-POSE": "BODY-POSE-01", "STYLE-PERSONALITY": "STYLE-PERSONALITY-14",
  } }, "两个角色站立");
  assert.match(child, /两个角色[\s\S]+儿童[\s\S]+高挑[\s\S]+松弛慵懒/);
  assert.doesNotMatch(child, /成年|性感|多人物|无拼图/);
});

test("styles and optics retain distinctive qualities without examples", () => {
  const byId = new Map(config.presets.map(preset => [preset.id, preset]));
  for (const [id, expected] of [
    ["D03", /Q版二维/], ["M17", /美式印刷漫画.*网点/], ["STYLE-RENDER-01", /写实摄影/],
    ["D11", /油彩|油画/], ["style-3d-concept", /三维|3D/], ["style-documentary-cinematic", /纪实电影/], ["M05", /沙金|沙岩/],
    ["camera-hasselblad", /中画幅/], ["camera-leica", /胶片纪实/], ["camera-arri", /高光.*滚降/],
    ["lens-hawk-class-x", /横向耀斑/], ["lens-zeiss-ultra-prime", /微对比/], ["lens-panavision-primo", /柔和高光/],
    ["focal-24", /广角/], ["focal-35", /自然视角/], ["aperture-f1-4", /浅景深/], ["aperture-f4", /中等景深/],
  ]) {
    const preset = byId.get(id);
    assert.ok(preset, id);
    assert.match(preset.runtimeEffectPrompt, expected, id);
    assert.doesNotMatch(preset.runtimeEffectPrompt, /16:9|咖啡馆|花园|托腮|雪山|白裙|金鱼|骑车|女孩|长枪/, id);
  }
});

const hostSource = fs.readFileSync(path.join(__dirname, "design-sources/script-before-save-bridge.js"), "utf8");
function hostFunction(name) {
  const start = new RegExp("^((?:async )?function " + name + "\\()", "m").exec(hostSource);
  assert.ok(start, name);
  const remainder = hostSource.slice(start.index + start[0].length);
  const end = /\r?\n(?:async )?function \w+\(/.exec(remainder);
  assert.ok(end, name);
  return start[0] + remainder.slice(0, end.index);
}

function sandbox() {
  const requests = [];
  let inputs = [];
  const noOp = () => {};
  const window = {
    FloraVisualPresets: runtime,
    AiOsModelParameters: require("../host-sources/app/model-parameter-controls.js"),
  };
  const env = {
    window,
    getCanvasImagePendingDependency: () => null,
    CanvasGenerationSound: { arm: noOp },
    syncCanvasPromptFromTextInputs: noOp,
    getCanvasIncomingTexts: () => [],
    getCanvasIncomingItems: () => inputs,
    getCanvasIncomingLoopRefs: () => [],
    getCanvasImageReferenceSignature: () => "unchanged",
    getCanvasNodeRefOrder: () => [],
    getCanvasImageRequestSummary: () => "1:1",
    setCanvasNodeStatus: noOp,
    setCanvasImageDependencyState: noOp,
    setCanvasImageNodeGenerationState: noOp,
    syncCanvasNodeResolutionState: () => ({ supported: true }),
    getCanvasOutputSize: () => "1024x1024",
    getCanvasImageResolution: () => "1k",
    getCanvasImageQuality: () => "auto",
    getCanvasResolutionLabel: () => "1K",
    getCanvasSizeLabel: () => "1:1",
    supportsSeparateImageResolution: () => true,
    isGptImage2LikeModel: model => model === "gpt-image-2",
    canvasModelParameterDescriptor: model => ({
      id: model, protocol: "openai-images", capabilities: ["image.generate"],
    }),
    isMidjourneyModel: () => false,
    getImageModelPlatform: () => "openai",
    prepareOpenAIEditRefs: async refs => refs,
    assertCanvasImageReferencesCurrent: noOp,
    createCanvasImageJob: async request => {
      requests.push({ path: "/api/image-jobs", body: JSON.parse(JSON.stringify(request)) });
      return { id: "offline-job" };
    },
    waitForCanvasImageJob: async () => ({ state: "completed", result: {} }),
    extractImages: () => [],
    commitCanvasImageJobResult: () => ({ ok: true }),
    CANVAS_IMAGE_JOB_ACTIVE_STATES: new Set(),
    refreshCanvasDownstreamNodes: noOp,
    createId: () => "offline",
    applyCanvasRefOrder: (_node, refs) => refs,
    QWEN_IMAGE21_API_URL: "/offline/qwen",
    FLUX2_KLEIN_EDIT_API_URL: "/offline/flux",
    SHOE_SWAP_API_URL: "",
    UPSCALE_API_URL: "",
    OUTPAINT_API_URL: "",
    RUNNINGHUB_OUTPAINT_API_URL: "",
    QWEN_EDIT_ANGLE_API_URL: "",
    COMFY_REMOVE_BACKGROUND_API_URL: "",
    fetch: async (url, init) => {
      requests.push({ path: url, body: JSON.parse(init.body) });
      return { ok: false, status: 400, json: async () => ({ error: "离线拦截" }) };
    },
  };
  vm.runInNewContext([
    "getCanvasGenerationPrompt", "getCanvasPromptWithResolution", "getCanvasIncomingRefs",
    "getCanvasImageProtocolParams", "isCanvasImageAutomaticSelection", "readCanvasModelParameters",
    "captureCanvasImageHistorySnapshot", "captureCanvasComfyHistorySnapshot",
    "getCanvasVisualPresetReferenceError", "runCanvasImageEdit", "runCanvasComfyQwen21Node", "runCanvasComfyNode",
  ].map(hostFunction).join("\n"), env);
  return {
    requests, setInputs: refs => { inputs = refs; },
    async run({selection, own = "", model = "gpt-image-2", auto = false, engine = "api",
      comfyMode = "qwen-image21", imageSrc = "", previousResult = "", modelParams = {}}) {
      const node = nodeFor(selection);
      Object.assign(node.dataset, {
        id: "offline-node", comfyPrompt: own, canvasEngine: engine, comfyMode, comfyMegapixels: "2",
        comfyAspectRatio: "4:3", imageSrc, resultSrc: previousResult, modelSelection: auto ? "auto" : "exact",
        canvasModelParameters: JSON.stringify(modelParams),
      });
      node.querySelector = selector => ({
        ".canvas-node-prompt": { value: own },
        ".canvas-node-model": { value: model, dataset: {} },
      })[selector] || null;
      return env.runCanvasImageEdit(node);
    },
  };
}

test("API request keeps optical hints and image references in separate fields", async () => {
  const route = sandbox();
  await route.run({ selection: historicalSelection });
  const original = route.requests.at(-1).body;
  assert.deepEqual(original.reference_images, []);
  assert.equal(original.model, "gpt-image-2");
  assert.equal(original.size, "1024x1024");
  assert.equal(original.n, 1);
  assert.equal(original.resolution, "1k");
  assert.equal(original.quality, "auto");
  assert.match(original.prompt, /Aspect ratio: 1:1\./);
  assert.match(original.prompt, /性别：男性。[\s\S]+整体风格：Q版二维/);
  await route.run({ selection: historicalSelection, previousResult: "/output/previous.png" });
  assert.deepEqual(route.requests.at(-1).body.reference_images, []);
  await route.run({ selection: historicalSelection, imageSrc: "/output/source.png" });
  assert.deepEqual(route.requests.at(-1).body.reference_images, [{ name: "当前图片", url: "/output/source.png" }]);
  route.setInputs([{ type: "image", url: "/output/linked.png", originalUrl: "/output/original.png" }]);
  await route.run({ selection: {
    stylePreset: "M17", cameraControl: { camera: "camera-hasselblad", lens: "lens-hawk-class-x", focalLength: "focal-24", aperture: "aperture-f1-4" },
  } });
  const combined = route.requests.at(-1).body;
  assert.equal(combined.reference_images[0].url, "/output/linked.png");
  assert.equal(combined.reference_images[0].originalUrl, "/output/original.png");
  assert.equal(Object.hasOwn(combined, "focalLength"), false);
  assert.equal(Object.hasOwn(combined, "aperture"), false);
  assert.match(combined.prompt, /经典美式印刷漫画[\s\S]+中画幅[\s\S]+横向耀斑[\s\S]+24mm[\s\S]+浅景深/);
  assert.doesNotMatch(combined.prompt, /\/visual-presets\/|咖啡馆|白裙/);
});

test("filter contracts distinguish no selection, original and a real effect", async () => {
  const route = sandbox();
  for (const filterPreset of ["filter-original", "filter-soft-film", "filter-cinematic-light", "filter-hdr", "FG11", "filter-vintage"]) {
    const selection = { filterPreset };
    const count = route.requests.length;
    route.setInputs([]);
    const result = await route.run({ selection, own: "主体文本" });
    if (filterPreset === "filter-original") {
      assert.ok(result.ok);
      assert.doesNotMatch(route.requests.at(-1).body.prompt, /滤镜效果|复制|基准图|视觉预设/);
    } else {
      assert.equal(result.code, "preset_reference_required");
      assert.equal(route.requests.length, count);
      await route.run({ selection, imageSrc: "/output/retouch.png" });
      assert.match(route.requests.at(-1).body.prompt, /滤镜效果：/);
      assert.doesNotMatch(route.requests.at(-1).body.prompt, /后期处理.*主体身份与构图/);
      assert.doesNotMatch(route.requests.at(-1).body.prompt, /骑车|雪山|山路|16:9/);
    }
  }
});

test("only a fixed model with a native negative field receives preset negatives", async () => {
  const route = sandbox();
  const selection = { characterDesign: { age: "age-child-6-12" } };
  await route.run({ selection, model: "gpt-image-2" });
  assert.equal(route.requests.at(-1).body.negativePrompt, undefined);
  assert.doesNotMatch(route.requests.at(-1).body.prompt, /视觉限制|避免成人化/);
  await route.run({ selection, model: "flux-dev", auto: true });
  assert.equal(route.requests.at(-1).body.negativePrompt, undefined);
  await route.run({ selection, model: "flux-dev", modelParams: { negativePrompt: "自定负向内容", steps: 24 } });
  assert.equal(route.requests.at(-1).body.negativePrompt, "自定负向内容；避免成人化面部特征");
  assert.equal(route.requests.at(-1).body.steps, 24);
  assert.doesNotMatch(route.requests.at(-1).body.prompt, /自定负向内容|避免成人化/);
});

test("actual Qwen and Flux request functions consume sanitized prompts only", async () => {
  const route = sandbox();
  await route.run({ selection: historicalSelection, engine: "comfyui", previousResult: "/output/prev.png" });
  const qwen = route.requests.at(-1);
  assert.equal(qwen.path, "/offline/qwen");
  assert.deepEqual(qwen.body.images, []);
  assert.equal(qwen.body.aspect_ratio, "4:3");
  assert.equal(qwen.body.megapixels, 2);
  assert.match(qwen.body.prompt, /整体风格：Q版二维/);
  assert.equal(Object.hasOwn(qwen.body, "negative_prompt"), false);
  const missing = await route.run({ selection: { filterPreset: "FG11" }, engine: "comfyui" });
  assert.equal(missing.code, "preset_reference_required");
  assert.equal(route.requests.length, 1);
  route.setInputs([{ type: "image", url: "/output/linked.png", originalUrl: "/output/original.png", name: "上游" }]);
  await route.run({ selection: { stylePreset: "D03", filterPreset: "FG11", functionPreset: "FN02" }, engine: "comfyui", own: "转换画面" });
  assert.deepEqual(route.requests.at(-1).body.images, ["/output/linked.png"]);
  assert.doesNotMatch(route.requests.at(-1).body.prompt, /后期处理|16:9|雪山|女孩/);
  await route.run({ selection: { stylePreset: "D03", filterPreset: "FG11", functionPreset: "FN02" },
    engine: "comfyui", comfyMode: "flux2-klein-edit", own: "转换画面" });
  const flux = route.requests.at(-1);
  assert.equal(flux.path, "/offline/flux");
  assert.equal(flux.body.image, "/output/original.png");
  assert.match(flux.body.prompt, /Q版二维[\s\S]+蓝青[\s\S]+九宫格/);
  assert.doesNotMatch(flux.body.prompt, /后期处理|16:9|雪山|女孩/);
});


