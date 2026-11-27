"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { installFixedStageRouting } = require("./test-fixtures/fixed-stage-routing.cjs");

const first = { prompt: "第一组，蓝色陶瓷茶壶", model: "gpt-image-2", size: "1:1", resolution: "1",
  presets: { characterDesign: { gender: "gender-male" }, stylePreset: "D03" } };
const second = { prompt: "第二组，橙色玻璃台灯", model: "flux-dev", size: "1536x1024", resolution: "1",
  presets: { characterDesign: { gender: "gender-female" } }, modelParameters: { negativePrompt: "不要文字", steps: 24 } };
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8uoAAAAASUVORK5CYII=", "base64");

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
    const jobs = [];
    const errors = [];
    let pendingBoardState;
    await installFixedStageRouting(page);
    if (process.argv.includes("--source")) {
      const read = name => fs.readFileSync(path.join(__dirname, "design-sources", name), "utf8");
      const script = ["script-before-save-bridge.js", "canvas-script-production.js", "canvas-asset-entry.js"].map(read).join("\n");
      await page.route(/\/script\.js(?:\?|$)/, route => route.fulfill({ contentType: "text/javascript", body: script }));
      await page.route(/\/flora-generation-history\.js(?:\?|$)/, route => route.fulfill({
        contentType: "text/javascript", body: read("flora-generation-history.js"),
      }));
    }
    await page.route("**/output/history-*.png", route => route.fulfill({ contentType: "image/png", body: pixel }));
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/image-models") return route.fulfill({ json: {
        models: [first.model, second.model].map(id => ({ id, displayName: id, providerProtocol: "openai-images", capabilities: ["image.generate"] })),
        defaultModel: first.model, platforms: { [first.model]: "openai", [second.model]: "openai" },
        resolutions: { [first.model]: ["1", "2"], [second.model]: ["1"] },
      } });
      if (pathname === "/api/image-jobs" && route.request().method() === "POST") {
        const request = route.request().postDataJSON();
        const id = `imgjob_history_${jobs.length + 1}`;
        const job = {
          id, boardId: request.board_id, nodeId: request.node_id, model: request.model, state: "running",
          result: { model: request.model, data: Array.from({ length: jobs.length ? 1 : 2 }, (_, i) => ({
            url: `/output/history-${id}-${i}.png`, width: 1024, height: 1024,
          })) },
        };
        jobs.push({ request, job });
        return route.fulfill({ status: 202, json: { job } });
      }
      if (pathname.startsWith("/api/image-jobs/")) {
        const job = jobs.find(row => pathname.endsWith(`/${row.job.id}`))?.job;
        if (job?.id === "imgjob_history_1" && !pendingBoardState) {
          pendingBoardState = await page.evaluate(() => serializeCanvasNode(window.qaImageNode));
        }
        return job ? route.fulfill({ json: { job: { ...job, state: "completed" } } })
          : route.fulfill({ status: 404, json: {} });
      }
      return route.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], preferences: {}, settings: {} } });
    });
    await page.routeWebSocket("**/*", socket => socket.close());
    page.on("pageerror", error => errors.push(error.message));

    async function mount(boardState) {
      await page.goto("http://127.0.0.1:33200/", { waitUntil: "networkidle" });
      await page.evaluate(async boardState => {
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
        canvasState.activeBoardId = "qa-image-history";
        showCanvasEditor();
        const node = boardState
          ? restoreCanvasBoardNode(boardState, { id: canvasState.activeBoardId }, { usedIds: new Set(), maxId: 0 })
          : addCanvasApiNode({ x: 300, y: 85 }, { prompt: "" });
        node.dataset.boardId = canvasState.activeBoardId;
        syncCanvasNodeModel(node);
        CanvasFloraNodeShell.mount(node);
        selectCanvasNode(node);
        FloraGeneratorComposer.mount(node, node.querySelector(".flora-node-shell"));
        window.qaImageNode = node;
        window.qaPeerNode = addCanvasApiNode({ x: 990, y: 100 }, { prompt: "独立节点原文" });
        selectCanvasNode(node);
      }, boardState);
    }

    const setInputs = options => page.evaluate(options => {
      const node = window.qaImageNode;
      node.querySelector(".canvas-node-prompt").value = options.prompt;
      const model = node.querySelector(".canvas-node-model");
      fillCanvasNodeModelSelect(model, options.model);
      model.value = options.model;
      model.dataset.modelSelection = node.dataset.modelSelection = "exact";
      model.dispatchEvent(new Event("change", { bubbles: true }));
      const size = node.querySelector(".canvas-node-size");
      fillCanvasNodeSizeSelect(size, options.size, options.model, options.resolution);
      size.dispatchEvent(new Event("change", { bubbles: true }));
      const resolution = node.querySelector(".canvas-node-resolution");
      resolution.value = options.resolution;
      resolution.dispatchEvent(new Event("change", { bubbles: true }));
      FloraVisualPresets.hydrate(node, options.presets);
      syncCanvasModelParameterOptions(node, options.model, options.modelParameters || {});
      FloraGeneratorComposer.sync(node);
    }, options);
    const submit = () => page.evaluate(() => runCanvasImageEdit(window.qaImageNode));
    const read = () => page.evaluate(() => serializeCanvasNode(window.qaImageNode));
    const readPeer = () => page.evaluate(() => serializeCanvasNode(window.qaPeerNode));
    const badge = page.locator(".flora-generation-history-badge:visible");
    const panel = page.getByRole("dialog", { name: "节点生成历史", exact: true });
    const close = () => panel.getByRole("button", { name: "关闭生成历史", exact: true }).click();
    const choice = i => panel.getByRole("button", { name: `选择第${i}条生成结果`, exact: true });
    const assertConfig = async expected => {
      const { prompt, model, size, resolution, visualPresets, modelParameters } = await read();
      assert.equal(prompt, expected.prompt);
      assert.equal(model, expected.model);
      assert.equal(size, expected.size);
      assert.equal(resolution, expected.resolution);
      assert.deepEqual(visualPresets.characterDesign, expected.presets.characterDesign);
      assert.equal(visualPresets.stylePreset, expected.presets.stylePreset || "");
      assert.deepEqual(modelParameters, expected.modelParameters || {});
    };

    await mount(null);
    await setInputs(first);
    const submittedFirst = await submit();
    assert.ok(submittedFirst.ok, JSON.stringify(submittedFirst));
    await setInputs(second);
    const submittedSecond = await submit();
    assert.ok(submittedSecond.ok, JSON.stringify(submittedSecond));
    const saved = await read();
    const pending = JSON.parse(pendingBoardState.imageJobSnapshot);
    assert.equal(pending.taskId, jobs[0].job.id);
    assert.equal(pending.snapshot.prompt, first.prompt);
    assert.equal(saved.imageJobSnapshot, undefined);
    assert.equal(saved.generationHistory.length, 3);
    assert.equal(saved.generationHistory[0].generationTaskId, saved.generationHistory[1].generationTaskId);
    assert.equal(Object.keys(saved.imageGenerationSnapshots).length, 2);
    assert.equal(saved.imageGenerationSnapshots.imgjob_history_1.submittedPrompt, jobs[0].request.prompt);
    assert.equal(saved.imageGenerationSnapshots.imgjob_history_2.submittedNegativePrompt, second.modelParameters.negativePrompt);
    await badge.click();
    await choice(1).click();
    await assertConfig(first);
    await choice(2).click();
    await assertConfig(first);
    await choice(3).click();
    await assertConfig(second);
    await close();

    await mount(saved);
    const peer = await readPeer();
    await badge.click();
    await choice(1).click();
    await assertConfig(first);
    await choice(3).click();
    await assertConfig(second);
    const action = (name, i) => panel.getByRole("button", { name: `${name}第${i}条生成结果`, exact: true });
    const download = page.waitForEvent("download");
    await action("下载", 1).click();
    await download;
    await assertConfig(second);
    await action("全屏查看", 1).click();
    await page.getByRole("button", { name: "关闭全屏预览", exact: true }).click();
    await assertConfig(second);
    await action("删除", 3).click();
    await assertConfig(second);
    assert.equal((await read()).generationHistory.length, 2);
    assert.deepEqual(await readPeer(), peer);
    await close();
    await page.evaluate(() => {
      const node = window.qaImageNode;
      const state = FloraGenerationHistory.serialize(node);
      FloraGenerationHistory.hydrate(node, state.generationHistory, state.currentGenerationId);
    });
    await badge.click();
    await choice(1).click();
    await panel.getByRole("status").getByText(/已从原任务恢复模型/).waitFor();
    const legacy = await read();
    assert.equal(legacy.model, first.model);
    assert.equal(legacy.prompt, second.prompt);
    assert.equal(legacy.visualPresets.characterDesign.gender, "gender-female");
    await close();
    assert.equal(jobs.length, 2);
    assert.deepEqual(errors, []);
    console.log("image history: two jobs, shared snapshot, reload and independent actions passed");
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
