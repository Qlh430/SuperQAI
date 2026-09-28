"use strict";

/**
 * Proves the component contract on a real render: an optional canvas node
 * component can be switched off and the canvas application still boots.
 *
 * The frontend kernel reads its disabled list from
 * window.__AI_OS_DISABLED_COMPONENTS__ before any component script runs, so the
 * page is loaded once with the node components enabled and once with them
 * disabled. The disabled pass asserts the node-owned globals are gone while the
 * shared canvas engine stays intact.
 */

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

const DISABLED_NODE_COMPONENTS = [
  "canvas-node-minimax-h3",
  "canvas-node-comfy",
  "canvas-node-llm",
  "canvas-node-gallery",
  "canvas-node-grid-editor",
  "canvas-node-midjourney",
  "canvas-node-video-api",
];

// Globals owned by the components above. None of them may be required by the
// canvas runtime itself, so every one of them has to disappear from the page.
const PRUNED_GLOBALS = [
  "CanvasH3ControlsUi",
  "CanvasH3NodeRenderer",
  "CanvasComfyRules",
  "CanvasComfyOutpaintUi",
  "CanvasComfyQwenUi",
  "CanvasComfyNodeRenderer",
  "CanvasLlmPresetRules",
  "CanvasLlmPresetUi",
  "CanvasLlmNodeRenderer",
  "CanvasGalleryNodeRenderer",
  "CanvasGridEditorNodeRenderer",
  "CanvasMidjourneyNodeRenderer",
  "CanvasVideoApiNodeRenderer",
];

// Globals owned by the shared canvas engine and app spine. They must survive,
// otherwise the canvas would only look prunable.
const REQUIRED_GLOBALS = [
  "AiOsKernel",
  "CanvasViewRules",
  "CanvasConnectionRules",
  "CanvasGenerationRules",
  "CanvasGalleryRules",
  "CanvasGridEditorRules",
  "CanvasTheme",
  "ImageOutputRules",
];

async function bootCanvas(page, baseUrl, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('[data-ai-app="canvas"]').click();
  await page.locator("#canvasBoardNew").click();
  await page.locator("#canvasNameInput").fill(label);
  await page.locator("#canvasNameForm button[type=submit]").click();
  await page.locator("#canvasEditorScreen").waitFor();
  return errors;
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-pruning-"));
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

    const baseline = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const baselineErrors = await bootCanvas(baseline, baseUrl, "组件裁剪基线");
    const baselineGlobals = await baseline.evaluate(
      (names) => Object.fromEntries(names.map((name) => [name, typeof window[name] !== "undefined"])),
      [...PRUNED_GLOBALS, ...REQUIRED_GLOBALS],
    );
    for (const name of PRUNED_GLOBALS) {
      assert.equal(baselineGlobals[name], true, `${name} must load while its component is enabled`);
    }
    for (const name of REQUIRED_GLOBALS) {
      assert.equal(baselineGlobals[name], true, `${name} must always load`);
    }
    assert.deepEqual(baselineErrors, [], "the baseline canvas must boot without page errors");
    await baseline.close();

    const pruned = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pruned.addInitScript((ids) => {
      window.__AI_OS_DISABLED_COMPONENTS__ = ids;
    }, DISABLED_NODE_COMPONENTS);
    const prunedErrors = await bootCanvas(pruned, baseUrl, "组件裁剪验证");
    const prunedGlobals = await pruned.evaluate(
      (names) => Object.fromEntries(names.map((name) => [name, typeof window[name] !== "undefined"])),
      [...PRUNED_GLOBALS, ...REQUIRED_GLOBALS],
    );
    for (const name of PRUNED_GLOBALS) {
      assert.equal(
        prunedGlobals[name],
        false,
        `${name} must not load once its node component is disabled`,
      );
    }
    for (const name of REQUIRED_GLOBALS) {
      assert.equal(prunedGlobals[name], true, `${name} must survive the node component pruning`);
    }
    const stillUsable = await pruned.evaluate(() => ({
      editorVisible: Boolean(document.getElementById("canvasEditorScreen")),
      canUndo: typeof window.undoCanvasChange === "function",
    }));
    assert.equal(stillUsable.editorVisible, true, "the canvas editor must still render");
    assert.equal(stillUsable.canUndo, true, "canvas commands must stay wired after pruning");
    assert.deepEqual(prunedErrors, [], "pruning node components must not break the canvas boot");

    console.log("Canvas component pruning browser checks passed.");
  } finally {
    await browser?.close();
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
