"use strict";

// Browser coverage for the dedicated Midjourney canvas node.
//
// Endpoint routing, request bodies and the provider bridge contract live in
// tools/check-canvas-midjourney-node.js. This check drives the real canvas: the
// node has to be reachable from the create menu, its three operations have to
// gate the prompt and references the way Midjourney does, and the chosen
// parameters have to survive a board reload.

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

const BOARD_TITLE = "Midjourney 节点验证";
const PROMPT = "a paper crane on a rainy rooftop";

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-midjourney-"));
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

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await openBoard(page, baseUrl);

    // --- the node is reachable from 生成节点 --------------------------------
    const menu = page.locator("#canvasNodeMenu");
    const createPoint = await blankPoint(page);
    await page.mouse.dblclick(createPoint.x, createPoint.y);
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    await menu.locator('[data-canvas-node="midjourney"]').click();
    const node = page.locator("#canvasPlane .canvas-node-midjourney").first();
    await node.waitFor({ state: "visible", timeout: 5_000 });

    await assertNodeShape(node);
    const status = node.locator(".canvas-h3-status");
    assert.equal((await status.textContent()).trim(), "选择操作即可生成");

    // --- blend takes no prompt and still needs two references ----------------
    await node.locator(".canvas-midjourney-operation").selectOption("blend");
    await page.waitForFunction(() => document.querySelector("#canvasPlane .canvas-node-midjourney .canvas-midjourney-prompt")?.hidden === true);
    assert.equal(await node.locator(".canvas-midjourney-prompt").isVisible(), false, "blend hides the prompt box");
    assert.match(await node.locator(".canvas-midjourney-reference").textContent(), /连接 2-4 张图片作为融合素材/);

    // --- edit asks for a reference base image --------------------------------
    await node.locator(".canvas-midjourney-operation").selectOption("edit");
    assert.equal(await node.locator(".canvas-midjourney-prompt").isVisible(), true, "edit keeps the prompt box");
    assert.match(await node.locator(".canvas-midjourney-reference").textContent(), /连接至少 1 张图片作为编辑底图/);

    // --- imagine is the default and asks for an API 设置 entry ----------------
    await node.locator(".canvas-midjourney-operation").selectOption("imagine");
    assert.equal(await node.locator(".canvas-midjourney-operation").inputValue(), "imagine");
    await node.locator(".canvas-midjourney-prompt-input").fill(PROMPT);
    await node.locator(".canvas-midjourney-run").click();
    await page.waitForFunction(
      () => document.querySelector("#canvasPlane .canvas-node-midjourney .canvas-h3-status")?.textContent?.includes("API 设置"),
      null,
      { timeout: 15_000 },
    );
    assert.match(await status.textContent(), /请先在 API 设置里添加 Midjourney 接入/);
    assert.equal(await node.locator(".canvas-midjourney-model").isDisabled(), true, "without a Midjourney profile the model picker stays disabled");

    // Selecting a canvas node re-renders the Agent context band. That pass used
    // to run a document-wide lucide sweep, which replaced the icon inside the
    // node button between pointerdown and mouseup and swallowed the click.
    const iconSweep = await page.evaluate(() => ({
      agentPlaceholders: document.querySelectorAll("#canvasAgentPanel [data-lucide]:not(svg)").length,
      agentContextIcons: document.querySelectorAll("#canvasAgentPanel #canvasAgentContext svg").length,
      runIcon: Boolean(document.querySelector("#canvasPlane .canvas-node-midjourney .canvas-midjourney-run svg")),
    }));
    assert.equal(iconSweep.agentPlaceholders, 0, "the Agent context pass must convert its own icon placeholders");
    assert.ok(iconSweep.agentContextIcons >= 1, "the selected node still shows its Agent context chip icon");
    assert.equal(iconSweep.runIcon, true, "the Agent context pass must leave canvas node icons alone");

    // --- the chosen parameters survive a reload -----------------------------
    await node.locator(".canvas-midjourney-size").selectOption("16:9");
    await node.locator(".canvas-midjourney-controls select").nth(2).selectOption("8.2");
    await node.locator(".canvas-midjourney-controls select").nth(3).selectOption("turbo");
    await page.waitForTimeout(1_200);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    const boardItem = page.locator("#canvasBoardList .canvas-board-item").first();
    await boardItem.waitFor({ state: "visible", timeout: 10_000 });
    await boardItem.click();
    await page.locator("#canvasEditorScreen").waitFor({ state: "visible", timeout: 10_000 });
    const restored = page.locator("#canvasPlane .canvas-node-midjourney").first();
    await restored.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await restored.locator(".canvas-midjourney-operation").inputValue(), "imagine");
    assert.equal(await restored.locator(".canvas-midjourney-prompt-input").inputValue(), PROMPT);
    assert.equal(await restored.locator(".canvas-midjourney-size").inputValue(), "16:9");
    assert.equal(await restored.locator(".canvas-midjourney-controls select").nth(2).inputValue(), "8.2");
    assert.equal(await restored.locator(".canvas-midjourney-controls select").nth(3).inputValue(), "turbo");
    assert.match(await restored.locator(".canvas-node-title").textContent(), /Midjourney/);

    assert.deepEqual(browserErrors, [], `the canvas reported page errors: ${browserErrors.join(" | ")}`);
    console.log("Canvas Midjourney browser checks passed.");
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(server);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function openBoard(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('[data-ai-app="canvas"]').click();
  await page.locator("#canvasBoardNew").click();
  await page.locator("#canvasNameInput").fill(BOARD_TITLE);
  await page.locator("#canvasNameForm button[type=submit]").click();
  await page.locator("#canvasEditorScreen").waitFor({ state: "visible" });
}

async function blankPoint(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
    const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")]
      .map((node) => node.getBoundingClientRect());
    for (let y = viewport.top + 190; y < viewport.bottom - 90; y += 45) {
      for (let x = viewport.left + 90; x < viewport.right - 70; x += 45) {
        const occupied = nodes.some((rect) =>
          x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12);
        if (!occupied) return { x, y };
      }
    }
    return { x: viewport.right - 80, y: viewport.top + 80 };
  });
}

async function assertNodeShape(node) {
  assert.deepEqual(
    await node.locator(".canvas-midjourney-operation option").evaluateAll((options) => options.map((option) => option.value)),
    ["imagine", "edit", "blend"],
  );
  assert.equal(await node.locator(".canvas-midjourney-prompt-input").count(), 1);
  assert.equal(await node.locator(".canvas-midjourney-model").count(), 1);
  assert.match(await node.locator(".canvas-midjourney-model option").first().textContent(), /Midjourney/);
  assert.equal(await node.locator(".canvas-midjourney-size").inputValue(), "1:1");
  assert.match(await node.locator(".canvas-midjourney-reference").textContent(), /可连接 0-4 张图片作为参考图/);
  assert.equal(await node.locator(".canvas-node-run.canvas-midjourney-run").count(), 1);
}
