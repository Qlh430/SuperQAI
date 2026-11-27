"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { compileGeneratorComposer } = require("./visual-presets-build.cjs");
const { installFixedStageRouting } = require("./test-fixtures/fixed-stage-routing.cjs");

async function verifyCardToggle(page, picker, jobs) {
  const evidence = process.env.AI_OS_PRESET_TOGGLE_EVIDENCE;
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const screenshot = async filename => {
    if (!evidence) return;
    await page.mouse.move(40, 120);
    await picker.evaluate(async panel => {
      const body = panel.querySelector(".flora-visual-presets-picker-body");
      const { top, bottom } = body.getBoundingClientRect();
      const visibleImages = [...body.querySelectorAll("img")].filter(image => {
        const rect = image.getBoundingClientRect();
        return rect.bottom > top && rect.top < bottom;
      });
      await Promise.allSettled(visibleImages.map(image => image.decode()));
    });
    await picker.screenshot({ path: path.join(evidence, filename), animations: "disabled" });
  };
  const open = category => page.locator(`[data-preset-entry="${category}"]:visible`).click();
  const tab = id => picker.locator(`[data-preset-tab="${id}"]`).click();
  const card = id => picker.locator(`[data-preset-id="${id}"]`);
  const tag = id => picker.locator(`[data-preset-tag="${id}"]`);
  const clear = id => picker.locator(`[data-clear-preset="${id}"]`).click();
  const save = () => picker.locator('[data-preset-action="save"]').click();
  const selection = () => page.evaluate(() => FloraVisualPresets.serialize(window.rolePresetNode));
  const assertSelection = async (id, selected) => {
    assert.equal(await card(id).getAttribute("aria-pressed"), String(selected), id);
    assert.equal((await card(id).getAttribute("class")).split(/\s+/).includes("is-selected"), selected, id);
    assert.equal(await tag(id).count(), selected ? 1 : 0, id);
  };

  await open("characterDesign");
  await card("era-modern").click();
  await card("gender-male").click();
  await assertSelection("gender-male", true);
  await card("gender-male").click();
  await assertSelection("gender-male", false);
  await assertSelection("era-modern", true);
  await screenshot("01-single-deselected.png");
  await save();
  await open("characterDesign");
  await assertSelection("gender-male", false);
  await assertSelection("era-modern", true);
  await save();

  await page.evaluate(async () => {
    const node = window.rolePresetNode;
    node.querySelector(".canvas-node-prompt").value = "预设取消验收";
    node.dataset.canvasSize = "1:1";
    node.dataset.canvasResolution = "1";
    await runCanvasImageEdit(node);
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].prompt.split("\n\nAspect ratio:")[0], "预设取消验收\n\n时代：现代。");

  await open("characterDesign");
  await card("gender-male").click();
  await card("gender-female").click();
  await assertSelection("gender-male", false);
  await assertSelection("gender-female", true);
  await clear("gender-female");
  await assertSelection("gender-female", false);
  await assertSelection("era-modern", true);

  await tab("look");
  const hat = "LOOK-ACCESSORY-02", hairAccessory = "LOOK-ACCESSORY-03";
  await card(hat).click();
  await card(hairAccessory).click();
  await assertSelection(hat, true);
  await assertSelection(hairAccessory, true);
  await card(hat).click();
  await assertSelection(hat, false);
  await assertSelection(hairAccessory, true);
  await screenshot("02-multi-deselected.png");
  await save();
  await open("characterDesign");
  await tab("look");
  await assertSelection(hat, false);
  await assertSelection(hairAccessory, true);
  await clear(hairAccessory);
  await assertSelection(hairAccessory, false);
  await card("LOOK-ACCESSORY-01").click();
  await card("LOOK-ACCESSORY-01").click();
  await assertSelection("LOOK-ACCESSORY-01", false);
  await save();

  for (const [category, tabId, id] of [
    ["stylePreset", "2d", "D03"],
    ["filterPreset", "general", "FG02"],
    ["functionPreset", "", "FN02"],
    ["cameraControl", "camera", "camera-leica"],
    ["cameraControl", "lens", "lens-panavision-primo"],
    ["cameraControl", "focalLength", "focal-24"],
    ["cameraControl", "aperture", "aperture-f8"],
  ]) {
    await open(category);
    if (tabId) await tab(tabId);
    await card(id).click();
    await assertSelection(id, true);
    await card(id).click();
    await assertSelection(id, false);
    await save();
    assert.deepEqual((await selection()).characterDesign, { era: "era-modern" });
  }

  await open("characterDesign");
  await card("era-modern").click();
  await assertSelection("era-modern", false);
  await save();
  assert.deepEqual(await selection(), {});
  return { cancelledPrompt: jobs[0].prompt, allClear: true };
}

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const jobs = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await installFixedStageRouting(page);
    if (process.argv.includes("--source")) {
      const body = compileGeneratorComposer(__dirname);
      await page.route(/\/flora-generator-composer\.js(?:\?|$)/, route => route.fulfill({ contentType: "text/javascript", body }));
    }
    await page.route("**/api/**", route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/image-models") return route.fulfill({ json: {
        models: [{ id: "gpt-image-2", displayName: "gpt-image-2" }],
        defaultModel: "gpt-image-2", platforms: { "gpt-image-2": "openai" },
        resolutions: { "gpt-image-2": ["1"] },
      } });
      if (pathname === "/api/image-jobs" && route.request().method() === "POST") {
        jobs.push(route.request().postDataJSON());
        return route.fulfill({ status: 400, json: { error: "隔离验收，不触发真实生成" } });
      }
      return route.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], preferences: {}, settings: {} } });
    });
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.goto("http://127.0.0.1:33200/", { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-comfy"]);
      await loadImageModels();
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      document.body.append(surface);
      const view = document.querySelector("#canvasView");
      surface.append(view);
      view.hidden = false;
      view.classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      canvasState.activeBoardId = "qa-gender-era-prompt";
      showCanvasEditor();
      const node = addCanvasApiNode({ x: 280, y: 80 }, { prompt: "视觉预设验证" });
      node.dataset.boardId = canvasState.activeBoardId;
      syncCanvasNodeModel(node);
      CanvasFloraNodeShell.mount(node);
      selectCanvasNode(node);
      FloraGeneratorComposer.mount(node, node.querySelector(".flora-node-shell"));
      window.rolePresetNode = node;
    });

    const cardSelector = id => `[data-preset-id="${id}"]`;
    const open = () => page.locator('[data-preset-entry="characterDesign"]:visible').click();
    const picker = page.locator(".flora-visual-presets-picker:popover-open");
    if (process.argv.includes("--toggle-only")) {
      const result = await verifyCardToggle(page, picker, jobs);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify(result));
      return;
    }
    await open();
    assert.deepEqual(await picker.locator('[data-preset-group="gender"]').evaluateAll(cards => cards.map(card => card.dataset.presetId)), ["gender-male", "gender-female"]);
    assert.equal(await picker.locator('[data-preset-group="era"]').count(), 15);
    await picker.locator('[data-preset-action="cancel"]').click();
    const legacy = await page.evaluate(() => {
      const node = window.rolePresetNode;
      FloraVisualPresets.hydrate(node, { characterDesign: { gender: "gender-nonbinary", era: "era-1920s" } });
      return FloraVisualPresets.serialize(node).characterDesign;
    });
    assert.deepEqual(legacy, { gender: "gender-nonbinary", era: "era-1920s" });
    const cases = [
      ["gender-male", "正方形写实人像，单个成年主角，纯白摄影棚背景、正面头肩照，素色上衣。", /性别：男性。/],
      ["gender-female", "正方形写实人像，单个成年主角，纯白摄影棚背景、正面头肩照，素色上衣。", /性别：女性。/],
      ["era-modern", "正方形写实电影场景，一条城市主街的广角环境照，主要呈现建筑、街道和光线。", /时代：现代。/],
      ["era-wasteland", "正方形写实电影场景，一条城市主街的广角环境照，主要呈现建筑、街道和光线。", /末日废土时期/],
      ["era-medieval", "正方形写实电影场景，一条城市主街的广角环境照，主要呈现建筑、街道和光线。", /欧洲中世纪/],
      ["era-cyberpunk", "正方形写实电影场景，一条城市主街的广角环境照，主要呈现建筑、街道和光线。", /近未来赛博时代/],
    ];
    const probes = [];
    for (const [id, basePrompt, expected] of cases) {
      await page.evaluate(() => FloraVisualPresets.write(window.rolePresetNode, {}));
      await open();
      await picker.locator(cardSelector(id)).click();
      assert.equal(await picker.locator(cardSelector(id)).getAttribute("aria-pressed"), "true");
      await picker.locator('[data-preset-action="save"]').click();
      const saved = await page.evaluate(() => FloraVisualPresets.serialize(window.rolePresetNode));
      assert.equal(saved.characterDesign[id.startsWith("gender-") ? "gender" : "era"], id);
      await page.evaluate(async ({ saved, basePrompt }) => {
        const node = window.rolePresetNode;
        FloraVisualPresets.hydrate(node, JSON.parse(JSON.stringify(saved)));
        node.querySelector(".canvas-node-prompt").value = basePrompt;
        node.dataset.canvasSize = "1:1";
        node.dataset.canvasResolution = "1";
        await runCanvasImageEdit(node);
      }, { saved, basePrompt });
      assert.equal(jobs.length, probes.length + 1, `${id} should send exactly one request`);
      const job = jobs.at(-1);
      assert.match(job.prompt, expected);
      assert.doesNotMatch(job.prompt, /\[AI OS 视觉预设\]/);
      assert.deepEqual(job.reference_images, []);
      probes.push({ id, prompt: job.prompt });
    }

    const reset = () => page.evaluate(() => FloraVisualPresets.hydrate(window.rolePresetNode, {}));
    const openCategory = category => page.locator(`[data-preset-entry="${category}"]:visible`).click();
    const tab = id => picker.locator(`[data-preset-tab="${id}"]`).click();
    const card = id => picker.locator(cardSelector(id));
    const save = () => picker.locator('[data-preset-action="save"]').click();
    const restore = () => page.evaluate(() => {
      const node = window.rolePresetNode;
      FloraVisualPresets.hydrate(node, JSON.parse(JSON.stringify(FloraVisualPresets.serialize(node))));
    });
    const assertEffects = async ids => {
      const { actual, expected } = await page.evaluate(ids => ({
        actual: FloraVisualPresets.buildPrompt(window.rolePresetNode),
        expected: ids.map(id => FloraVisualPresetConfig.presets.find(preset => preset.id === id).runtimeEffectPrompt).join("\n"),
      }), ids);
      assert.equal(actual, expected);
      return actual;
    };
    const switches = [
      ["characterDesign", "basic", "gender-male", "gender-female"],
      ["characterDesign", "basic", "era-modern", "era-medieval"],
      ["characterDesign", "hair", "HAIR-COLOR-13", "HAIR-COLOR-01"],
      ["cameraControl", "camera", "camera-hasselblad", "camera-leica"],
      ["cameraControl", "lens", "lens-panavision-primo", "lens-zeiss-ultra-prime"],
      ["cameraControl", "focalLength", "focal-24", "focal-85"],
      ["cameraControl", "aperture", "aperture-f1-4", "aperture-f8"],
    ];
    for (const [category, tabId, first, second] of switches) {
      await reset();
      await openCategory(category);
      await tab(tabId);
      await card(first).click();
      await card(second).click();
      assert.equal(await card(first).getAttribute("aria-pressed"), "false", first);
      assert.equal(await card(second).getAttribute("aria-pressed"), "true", second);
      await save();
      await restore();
      await assertEffects([second]);
    }

    await reset();
    await openCategory("stylePreset");
    await tab("2d");
    await card("D03").click();
    await save();
    const qVersionPrompt = await assertEffects(["D03"]);
    await openCategory("characterDesign");
    await tab("character-style");
    await card("STYLE-RENDER-01").click();
    await save();
    await restore();
    const afterSwitchPrompt = await assertEffects(["STYLE-RENDER-01"]);
    await openCategory("stylePreset");
    await tab("2d");
    assert.equal(await card("D03").getAttribute("aria-pressed"), "false");
    await card("D03").click();
    await save();
    await restore();
    await assertEffects(["D03"]);
    await openCategory("characterDesign");
    await tab("character-style");
    assert.equal(await card("STYLE-RENDER-01").getAttribute("aria-pressed"), "false");
    await save();

    for (const [tabId, first, second] of [
      ["look", "LOOK-ACCESSORY-02", "LOOK-ACCESSORY-03"],
      ["face", "FACE-MARK-04", "FACE-MARK-05"],
    ]) {
      await reset();
      await openCategory("characterDesign");
      await tab(tabId);
      await card(first).click();
      await card(second).click();
      assert.equal(await card(first).getAttribute("aria-pressed"), "true", first);
      assert.equal(await card(second).getAttribute("aria-pressed"), "true", second);
      await save();
      await restore();
      await assertEffects([first, second]);
      await openCategory("characterDesign");
      await tab(tabId);
      await card(first).click();
      await save();
      await assertEffects([second]);
      await openCategory("characterDesign");
      await tab(tabId);
      await picker.locator(`[data-clear-preset="${second}"]`).click();
      await save();
      await assertEffects([]);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ probes, switches, qVersionPrompt, afterSwitchPrompt, multi: ["LOOK-ACCESSORY", "FACE-MARK"] }));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
