"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}

async function reservePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-generator-split-"));
  let serverOutput = "";
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_AUTH_DISABLED: "true",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });
  server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });

  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`${baseUrl}/api/system/ready`);
        if (response.ok && (await response.json()).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.route("**/api/image-models", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        instanceId: "canvas-generator-split",
        revision: 1,
        defaultModel: "site-a-openai-image",
        labels: {
          "site-a-openai-image": "gpt-image-a · Site A",
          "site-b-google-image": "gemini-image-b · Site B",
        },
        platforms: {
          "site-a-openai-image": "openai",
          "site-b-google-image": "google",
        },
        resolutions: {
          "site-a-openai-image": ["1", "2"],
          "site-b-google-image": ["1", "2", "4"],
        },
        models: [
          {
            id: "site-a-openai-image",
            modelId: "gpt-image-a",
            displayName: "gpt-image-a · Site A",
            providerId: "site-a",
            providerName: "Site A",
            capabilities: ["image.generate", "image.edit"],
            platform: "openai",
            resolutions: ["1", "2"],
            state: "online",
            providerSortOrder: 0,
            modelSortOrder: 0,
          },
          {
            id: "site-b-google-image",
            modelId: "gemini-image-b",
            displayName: "gemini-image-b · Site B",
            providerId: "site-b",
            providerName: "Site B",
            capabilities: ["image.generate", "image.edit"],
            platform: "google",
            resolutions: ["1", "2", "4"],
            state: "online",
            providerSortOrder: 1,
            modelSortOrder: 0,
          },
        ],
      }),
    }));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    const state = await page.evaluate(async () => {
      await createNewCanvasBoard("独立生成节点验证");
      const image = addCanvasImageGeneratorNode({ x: 120, y: 140 });
      const video = addCanvasVideoGeneratorNode({ x: 560, y: 430 });
      const legacy = restoreCanvasBoardNode({
        id: "legacy-comfy-generator",
        kind: "image",
        engine: "comfyui",
        comfyWorkflow: "flux2-klein-edit",
        prompt: "保留旧提示词",
        x: 980,
        y: 140,
      }, canvasVirtualBoard || {}, { maxId: 0, legacyResults: [], migratedLegacyCount: 0 });
      return {
        generationMenu: Array.from(document.querySelectorAll("#canvasNodeMenu [data-canvas-menu-group='generate'] [data-canvas-node]")).map((item) => ({
          id: item.dataset.canvasNode,
          type: item.dataset.nodeType,
          text: item.textContent.trim(),
        })),
        retiredMenuEntries: ["generator", "comfy", "minimax-h3", "video-api"]
          .filter((kind) => document.querySelector(`#canvasNodeMenu [data-canvas-node="${kind}"]`)),
        image: {
          id: image.dataset.id,
          title: image.querySelector(".canvas-node-title")?.textContent,
          nodeType: image.dataset.canvasNodeType,
          hasApiClass: image.classList.contains("canvas-node-api"),
          hasPlatform: Boolean(image.querySelector(".canvas-node-platform")),
          hasModel: Boolean(image.querySelector(".canvas-node-model")),
          hasModelPicker: Boolean(image.querySelector(".image-model-picker-trigger")),
          modelPickerText: image.querySelector(".image-model-picker-trigger")?.textContent?.trim() || "",
          hasSize: Boolean(image.querySelector(".canvas-node-size")),
          hasRun: Boolean(image.querySelector(".canvas-node-run")),
          hasEngineSwitch: Boolean(image.querySelector(":scope > .canvas-engine-switch")),
          engineOptions: Array.from(image.querySelectorAll(":scope > .canvas-engine-switch [data-engine]")).map((item) => item.dataset.engine),
          hasComfyWorkflow: Boolean(image.querySelector(".canvas-node-comfy-workflow")),
          derivedPlatform: getImageModelPlatform(image.querySelector(".canvas-node-model")?.value),
          serialized: serializeCanvasNode(image),
        },
        video: {
          id: video.dataset.id,
          title: video.querySelector(".canvas-node-title")?.textContent,
          nodeType: video.dataset.canvasNodeType,
          hasApiVideo: Boolean(video.querySelector(".canvas-api-video-prompt-input")),
          hasRun: Boolean(video.querySelector(".canvas-api-video-run")),
          hasEngineSwitch: Boolean(video.querySelector(":scope > .canvas-engine-switch")),
          engineOptions: Array.from(video.querySelectorAll(":scope > .canvas-engine-switch [data-engine]")).map((item) => item.dataset.engine),
          serialized: serializeCanvasNode(video),
        },
        legacy: {
          kind: getCanvasNodeKind(legacy),
          nodeType: legacy.dataset.canvasNodeType,
          mode: legacy.querySelector(".canvas-comfy-mode")?.value,
          prompt: legacy.dataset.comfyPrompt,
        },
      };
    });
    const imageNode = page.locator(`#canvasPlane .canvas-node[data-id="${state.image.id}"]`);
    await imageNode.locator(".image-model-picker-trigger").click();
    await page.locator('.image-model-picker-row[data-model-id="site-b-google-image"] .image-model-picker-choice').click();
    const switchedModel = await page.evaluate((id) => {
      const api = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      const model = api?.querySelector(".canvas-node-model");
      return {
        model: model?.value || "",
        modelOptions: Array.from(model?.options || []).map((option) => option.value),
        platform: api?.dataset.canvasPlatform || "",
        pickerText: api?.querySelector(".image-model-picker-trigger")?.textContent?.trim() || "",
        serialized: api ? serializeCanvasNode(api) : null,
      };
    }, state.image.id);

    await imageNode.locator(".canvas-node-prompt").fill("保持图片提示词");
    await imageNode.locator('.canvas-engine-switch [data-engine="comfyui"]').click();
    await page.waitForFunction(
      (id) => document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`)?.classList.contains("canvas-node-comfy"),
      state.image.id,
      { timeout: 5_000 },
    );
    const imageComfy = await page.evaluate((id) => {
      const node = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      return {
        title: node.querySelector(".canvas-node-title")?.textContent || "",
        engine: node.dataset.canvasEngine || "",
        nodeType: node.dataset.canvasNodeType || "",
        hasWorkflow: Boolean(node.querySelector(".canvas-comfy-mode")),
        activeEngine: node.querySelector(".canvas-engine-option.is-active")?.dataset.engine || "",
        prompt: node.dataset.canvasGenerationPrompt || "",
        serialized: serializeCanvasNode(node),
      };
    }, state.image.id);
    await imageNode.locator('.canvas-engine-switch [data-engine="api"]').click();
    await page.waitForFunction(
      (id) => document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`)?.classList.contains("canvas-node-generator"),
      state.image.id,
      { timeout: 5_000 },
    );
    const imageApiBack = await page.evaluate((id) => {
      const node = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      return {
        title: node.querySelector(".canvas-node-title")?.textContent || "",
        prompt: node.querySelector(".canvas-node-prompt")?.value || "",
        activeEngine: node.querySelector(".canvas-engine-option.is-active")?.dataset.engine || "",
        serialized: serializeCanvasNode(node),
      };
    }, state.image.id);

    const videoNode = page.locator(`#canvasPlane .canvas-node[data-id="${state.video.id}"]`);
    await videoNode.locator(".canvas-api-video-prompt-input").fill("保持视频描述");
    await videoNode.locator('.canvas-engine-switch [data-engine="comfyui"]').click();
    await page.waitForFunction(
      (id) => document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`)?.classList.contains("canvas-node-minimax-h3"),
      state.video.id,
      { timeout: 5_000 },
    );
    const videoComfy = await page.evaluate((id) => {
      const node = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      return {
        title: node.querySelector(".canvas-node-title")?.textContent || "",
        engine: node.dataset.canvasEngine || "",
        nodeType: node.dataset.canvasNodeType || "",
        hasPrompt: Boolean(node.querySelector(".canvas-h3-prompt")),
        activeEngine: node.querySelector(".canvas-engine-option.is-active")?.dataset.engine || "",
        prompt: node.dataset.minimaxH3Prompt || "",
        serialized: serializeCanvasNode(node),
      };
    }, state.video.id);
    await videoNode.locator('.canvas-engine-switch [data-engine="api"]').click();
    await page.waitForFunction(
      (id) => document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`)?.classList.contains("canvas-node-video-api"),
      state.video.id,
      { timeout: 5_000 },
    );
    const videoApiBack = await page.evaluate((id) => {
      const node = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      return {
        title: node.querySelector(".canvas-node-title")?.textContent || "",
        prompt: node.querySelector(".canvas-api-video-prompt-input")?.value || "",
        activeEngine: node.querySelector(".canvas-engine-option.is-active")?.dataset.engine || "",
        serialized: serializeCanvasNode(node),
      };
    }, state.video.id);

    assert.deepEqual(state.generationMenu.slice(0, 2), [
      { id: "image-generator", type: "image", text: "图片生成" },
      { id: "video-generator", type: "video", text: "视频生成" },
    ]);
    assert.deepEqual(state.retiredMenuEntries, [], "the old four generation entries are gone");
    assert.equal(state.image.title, "图片生成");
    assert.equal(state.image.nodeType, "api");
    assert.equal(state.image.hasApiClass, true);
    assert.equal(state.image.hasPlatform, false);
    assert.equal(state.image.hasModel && state.image.hasModelPicker && state.image.hasSize && state.image.hasRun, true);
    assert.ok(state.image.modelPickerText.length > 0, "the combined model picker should name the active model and API site");
    assert.equal(state.image.hasEngineSwitch, true);
    assert.deepEqual(state.image.engineOptions, ["api", "comfyui"]);
    assert.equal(state.image.hasComfyWorkflow, false);
    assert.equal(state.image.serialized.engine, "api");
    assert.equal(state.image.serialized.platform, state.image.derivedPlatform);
    assert.equal(Object.hasOwn(state.image.serialized, "comfyWorkflow"), false);
    assert.deepEqual(switchedModel.modelOptions, ["site-a-openai-image", "site-b-google-image"]);
    assert.equal(switchedModel.model, "site-b-google-image");
    assert.equal(switchedModel.platform, "google");
    assert.match(switchedModel.pickerText, /gemini-image-b[\s\S]*Site B/);
    assert.equal(switchedModel.serialized.model, "site-b-google-image");
    assert.equal(switchedModel.serialized.platform, "google");
    assert.equal(imageComfy.title, "图片生成");
    assert.equal(imageComfy.engine, "comfyui");
    assert.equal(imageComfy.nodeType, "comfy");
    assert.equal(imageComfy.hasWorkflow, true);
    assert.equal(imageComfy.activeEngine, "comfyui");
    assert.equal(imageComfy.prompt, "保持图片提示词");
    assert.equal(imageComfy.serialized.kind, "comfy");
    assert.equal(imageComfy.serialized.canvasGenerationPrompt, "保持图片提示词");
    assert.equal(imageApiBack.title, "图片生成");
    assert.equal(imageApiBack.prompt, "保持图片提示词");
    assert.equal(imageApiBack.activeEngine, "api");
    assert.equal(imageApiBack.serialized.engine, "api");
    assert.equal(imageApiBack.serialized.prompt, "保持图片提示词");
    assert.equal(state.video.title, "视频生成");
    assert.equal(state.video.nodeType, "api");
    assert.equal(state.video.hasApiVideo && state.video.hasRun, true);
    assert.equal(state.video.hasEngineSwitch, true);
    assert.deepEqual(state.video.engineOptions, ["api", "comfyui"]);
    assert.equal(state.video.serialized.kind, "video-api");
    assert.equal(videoComfy.title, "视频生成");
    assert.equal(videoComfy.engine, "comfyui");
    assert.equal(videoComfy.nodeType, "comfyui");
    assert.equal(videoComfy.hasPrompt, true);
    assert.equal(videoComfy.activeEngine, "comfyui");
    assert.equal(videoComfy.prompt, "保持视频描述");
    assert.equal(videoComfy.serialized.kind, "minimax-h3");
    assert.equal(videoComfy.serialized.minimaxH3Prompt, "保持视频描述");
    assert.equal(videoApiBack.title, "视频生成");
    assert.equal(videoApiBack.prompt, "保持视频描述");
    assert.equal(videoApiBack.activeEngine, "api");
    assert.equal(videoApiBack.serialized.kind, "video-api");
    assert.equal(videoApiBack.serialized.apiVideoPrompt, "保持视频描述");
    assert.deepEqual(state.legacy, {
      kind: "comfy",
      nodeType: "comfy",
      mode: "flux2-klein-edit",
      prompt: "保留旧提示词",
    });
    assert.deepEqual(browserErrors, []);
    console.log("Canvas API and ComfyUI split browser checks passed.");
  } finally {
    await browser?.close();
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
