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

const ROOT = path.resolve(__dirname, "..");

async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    timer.unref?.();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

(async () => {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-llm-lazy-"));
  let serverOutput = "";
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
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
        if (response.ok && (await response.json()).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      if (String(location.url || "").endsWith("/favicon.ico")) return;
      pageErrors.push(`console: ${message.text()} @ ${location.url || "unknown"}:${location.lineNumber || 0}`);
    });

    await page.route("**/canvas-llm-preset-ui.js*", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "/* delayed intentionally by the lazy-loading regression */",
    }));

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#aiOsDesktop:not([hidden])").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#canvasBoardNew").click();
    await page.locator("#canvasNameInput").fill("LLM Lazy Presets");
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator("#canvasEditorScreen").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean(window.CanvasLlmNodeRenderer?.render) && !window.CanvasLlmPresetUi,
      null,
      { timeout: 30_000 },
    );

    const created = await page.evaluate(() => {
      let error = "";
      let node = null;
      try {
        node = addCanvasLlmNode({ x: 420, y: 260 }, {
          prompt: "按画面描述生成一段文案",
          model: "gpt-4.1-mini",
        });
      } catch (caught) {
        error = String(caught?.message || caught);
      }
      return {
        error,
        id: node?.dataset?.id || "",
        hasPrompt: Boolean(node?.querySelector(".canvas-llm-prompt")),
        hasPresetBar: Boolean(node?.querySelector(".canvas-llm-presets")),
      };
    });
    assert.equal(created.error, "", "a missing preset UI must not fail LLM node rendering");
    assert.ok(created.id, "the LLM node must still be created");
    assert.equal(created.hasPrompt, true, "the LLM node body must render without the optional preset UI");
    assert.equal(created.hasPresetBar, false, "the preset bar must stay absent until its module arrives");

    await page.addScriptTag({
      path: path.join(ROOT, "canvas-llm-preset-ui.js"),
    });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ai-os-module-load-progress", {
        detail: { componentId: "canvas-node-llm", status: "loaded" },
      }));
    });
    await page.waitForFunction((nodeId) => {
      const node = document.querySelector(`#canvasPlane .canvas-node-llm[data-id="${nodeId}"]`);
      return Boolean(node?.querySelector(".canvas-llm-presets .canvas-llm-preset-list"));
    }, created.id, { timeout: 10_000 });

    const restored = await page.evaluate((nodeId) => {
      const node = document.querySelector(`#canvasPlane .canvas-node-llm[data-id="${nodeId}"]`);
      const presetBar = node?.querySelector(".canvas-llm-presets");
      const controls = node?.querySelector(".canvas-llm-controls");
      return {
        presetBar: Boolean(presetBar),
        beforeControls: Boolean(
          presetBar
          && controls
          && presetBar.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
        chips: presetBar?.querySelectorAll(".canvas-llm-preset-chip").length || 0,
      };
    }, created.id);
    assert.equal(restored.presetBar, true);
    assert.equal(restored.beforeControls, true);
    assert.ok(restored.chips > 0, "default preset chips must appear after the module arrives");
    assert.deepEqual(pageErrors, [], "late LLM preset loading must not create page errors");
    console.log("Canvas LLM lazy preset browser checks passed.");
  } finally {
    await browser?.close();
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
