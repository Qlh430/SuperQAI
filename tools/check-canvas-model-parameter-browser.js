"use strict";

// Browser coverage for the API generation node's protocol parameter panel.
//
// The node must not pin one model's protocol defaults onto "自动选择": the
// concrete model is only resolved at submit time, so the runtime is not allowed
// to carry a stored Flux step count (or GPT Image output format) into whichever
// model wins. Once an exact model is chosen the panel has to reflect that
// model's protocol and drop the fields the node's own selectors already own.

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

function catalogModel(id, platform, modelProtocol, capabilities = ["image.generate", "image.edit"]) {
  return catalogModelWithResolutions(id, platform, modelProtocol, ["1", "2", "4"], capabilities);
}

function catalogModelWithResolutions(id, platform, modelProtocol, resolutions, capabilities = ["image.generate", "image.edit"]) {
  return {
    id,
    modelId: id,
    displayName: `${id} · Test Site`,
    providerId: "test-site",
    providerName: "Test Site",
    providerProtocol: "openai-compatible",
    modelProtocol,
    capabilities,
    platform,
    resolutions,
    parameterOverrides: {},
    state: "online",
    providerSortOrder: 0,
    modelSortOrder: 0,
  };
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-model-parameters-"));
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
      AI_OS_SKIP_ENV_FILE: "1",
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
    },
  });
  server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });
  server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });

  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`${baseUrl}/api/system/ready`);
        if (response.ok && (await response.json()).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    const models = [
      // GPT Image 2 ships with an undeclared ladder, which is how a provider
      // row normally looks. The node still has to offer the platform ladder.
      catalogModelWithResolutions("gpt-image-2", "openai", "openai-images", []),
      catalogModel("flux-dev", "openai", "openai-images"),
      catalogModel("gemini-3-pro-image", "google", "gemini"),
      catalogModel("midjourney-v8", "midjourney", "midjourney"),
    ];
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
        instanceId: "canvas-model-parameters",
        revision: 1,
        defaultModel: "gpt-image-2",
        labels: Object.fromEntries(models.map((model) => [model.id, model.displayName])),
        platforms: Object.fromEntries(models.map((model) => [model.id, model.platform])),
        families: Object.fromEntries(models.map((model) => [model.id, model.modelProtocol])),
        resolutions: Object.fromEntries(models.map((model) => [model.id, model.resolutions])),
        prices: {},
        models,
        candidates: models.map((model, order) => ({
          id: model.id,
          providerId: model.providerId,
          providerName: model.providerName,
          providerProtocol: model.providerProtocol,
          modelProtocol: model.modelProtocol,
          model: model.modelId,
          label: model.displayName,
          enabled: true,
          hasApiKey: true,
          hasBaseUrl: true,
          capabilities: ["generation", "edit"],
          selected: order === 0,
          state: "online",
          order,
          platform: model.platform,
          family: model.modelProtocol,
          parameterOverrides: {},
          resolutions: model.resolutions,
        })),
      }),
    }));

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();

    const observed = await page.evaluate(async () => {
      await createNewCanvasBoard("模型参数协议验证");
      const node = addCanvasApiNode({ x: 160, y: 160 });
      const select = node.querySelector(".canvas-node-model");
      const container = node.querySelector(".canvas-model-options");

      const entries = () => Array.from(container.querySelectorAll("[data-canvas-model-param]"))
        .map((control) => control.dataset.canvasModelParam);

      const apply = (model, selection, stored = {}) => {
        select.value = model;
        select.dataset.modelSelection = selection;
        node.dataset.modelSelection = selection;
        node.dataset.canvasModel = model;
        node.dataset.canvasModelParameters = JSON.stringify(stored);
        syncCanvasModelParameterOptions(node, model);
        return {
          hidden: container.hidden,
          fields: entries(),
          stored: node.dataset.canvasModelParameters,
        };
      };

      const automatic = apply("flux-dev", "auto", { steps: 30, guidance_scale: 3.5 });
      // Switching back to an exact model must restore the values the node kept
      // while the picker was on automatic, so this pass reseeds nothing.
      select.value = "flux-dev";
      select.dataset.modelSelection = "exact";
      node.dataset.modelSelection = "exact";
      node.dataset.canvasModel = "flux-dev";
      syncCanvasModelParameterOptions(node, "flux-dev");
      const automaticAfterExact = {
        hidden: container.hidden,
        fields: entries(),
        stored: node.dataset.canvasModelParameters,
      };
      const fluxExact = apply("flux-dev", "exact", { seed: 42 });
      const gptExact = apply("gpt-image-2", "exact", { quality: "high", background: "transparent" });
      const geminiExact = apply("gemini-3-pro-image", "exact");
      const midjourneyExact = apply("midjourney-v8", "exact");

      // The resolution ladder the node offers for GPT Image 2 must come from the
      // platform protocol, not from the API 接入's (usually empty) declaration.
      apply("gpt-image-2", "exact");
      const resolutionOptions = Array.from(node.querySelectorAll(".canvas-node-resolution option"))
        .map((option) => ({ value: option.value, disabled: option.disabled }));

      apply("flux-dev", "auto", { steps: 30, guidance_scale: 3.5, negativePrompt: "blur" });
      const automaticParams = getCanvasImageProtocolParams(node, "flux-dev");
      const fluxParams = (() => {
        select.dataset.modelSelection = "exact";
        node.dataset.modelSelection = "exact";
        node.dataset.canvasModelParameters = JSON.stringify({ steps: 30, guidance_scale: 3.5, negativePrompt: "blur" });
        return getCanvasImageProtocolParams(node, "flux-dev");
      })();

      return {
        automatic,
        automaticAfterExact,
        fluxExact,
        gptExact,
        geminiExact,
        midjourneyExact,
        resolutionOptions,
        automaticParams,
        fluxParams,
      };
    });

    assert.deepEqual(observed.automatic.fields, [], "自动选择 must not render one model's protocol fields");
    assert.equal(observed.automatic.hidden, true, "自动选择 hides the protocol panel");
    assert.match(observed.automatic.stored, /"steps":30/, "自动选择 must keep the saved values for a later exact pick");

    assert.deepEqual(
      observed.automaticAfterExact.fields,
      ["steps", "guidance_scale", "seed", "negativePrompt"],
      "switching back to an exact Flux model restores its protocol fields",
    );
    assert.match(observed.automaticAfterExact.stored, /"steps":30/, "the saved Flux values return with the exact model");
    assert.deepEqual(observed.fluxExact.fields, ["steps", "guidance_scale", "seed", "negativePrompt"]);
    assert.deepEqual(
      observed.gptExact.fields,
      [],
      "background and output format stay in the API 设置 defaults instead of the node",
    );
    assert.deepEqual(observed.geminiExact.fields, [], "Gemini uses the node ratio and resolution selectors");
    assert.deepEqual(observed.midjourneyExact.fields, [], "Midjourney keeps its dedicated node controls");

    const enabledLevels = observed.resolutionOptions.filter((option) => !option.disabled).map((option) => option.value);
    assert.ok(
      enabledLevels.includes("1") && enabledLevels.includes("2"),
      `an undeclared API ladder must still offer 1K and 2K, received ${JSON.stringify(observed.resolutionOptions)}`,
    );

    assert.deepEqual(
      observed.automaticParams,
      {},
      "自动选择 must not submit a stored model's protocol defaults",
    );
    assert.deepEqual(
      observed.fluxParams,
      { steps: 30, guidance_scale: 3.5, negativePrompt: "blur" },
      "an exact Flux model submits its stored protocol values",
    );
    assert.deepEqual(browserErrors, [], `the canvas reported page errors: ${browserErrors.join(" | ")}`);
    console.log("Canvas model parameter browser checks passed.");
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
