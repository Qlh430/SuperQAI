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

const BOARD_TITLE = "便签与右键菜单验证";
const NOTE_TEXT = "右键空白处可以新建节点";
const ARTIFACT_DIR = path.join(__dirname, "..", "artifacts", "canvas-note-menu");

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-note-menu-"));
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
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasBoardNew").click();
    await page.locator("#canvasNameInput").fill(BOARD_TITLE);
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator("#canvasEditorScreen").waitFor();
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    assert.deepEqual(
      await page.evaluate(() => (window.AiOsCanvasNodePlugins?.list?.() || [])
        .map((plugin) => plugin.id)
        .sort()),
      ["asset-collection", "audio", "comfy", "director3d", "gallery", "generator", "grid-editor", "llm", "loop", "midjourney", "minimax-h3", "note", "text", "upload", "video", "video-api", "video-output"],
      "the browser must load every low-risk canvas node plugin",
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const registry = window.AiOsCanvasNodeRegistry;
        const plugins = window.AiOsCanvasNodePlugins;
        if (!registry || !plugins) return [];
        return registry.listNodes()
          .filter((definition) => definition.pluginId)
          .map((definition) => definition.pluginId)
          .filter((pluginId) => !plugins.get(pluginId))
          .sort();
      }),
      [],
      "every catalog node that declares a pluginId must resolve to a registered plugin",
    );

    const menu = page.locator("#canvasNodeMenu");
    const contextMenu = page.locator("#canvasContextMenu");
    const note = page.locator("#canvasPlane .canvas-node-note").first();
    const noteCount = () => page.locator("#canvasPlane .canvas-node-note").count();
    const statusText = () => page.locator(".canvas-status span:last-child").textContent();
    // Right-clicking a note's editable text must keep the native menu, so the
    // canvas menu checks always target a provably empty spot on the plane.
    const blankPoint = () => page.evaluate(() => {
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")]
        .map((node) => node.getBoundingClientRect());
      // Stay clear of the floating status pill in the top-left corner.
      for (let y = viewport.top + 190; y < viewport.bottom - 90; y += 45) {
        for (let x = viewport.left + 90; x < viewport.right - 70; x += 45) {
          const occupied = nodes.some((rect) =>
            x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12);
          if (!occupied) return { x, y };
        }
      }
      return { x: viewport.right - 80, y: viewport.top + 80 };
    });
    const rightClickBlank = async () => {
      const point = await blankPoint();
      await page.mouse.click(point.x, point.y, { button: "right" });
      await contextMenu.waitFor({ state: "visible", timeout: 3_000 });
      return point;
    };

    // --- Right-click opens the canvas actions menu ---------------------------
    assert.equal(await contextMenu.isVisible(), false, "the canvas actions menu starts hidden");
    await rightClickBlank();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "canvas-context-menu.png") });
    assert.deepEqual(
      await contextMenu.locator("[data-canvas-action]").evaluateAll((buttons) => buttons.map((button) => ({
        action: button.dataset.canvasAction,
        label: button.querySelector("span")?.textContent || "",
        shortcut: button.querySelector("kbd")?.textContent || "",
      }))),
      [
        { action: "upload", label: "上传", shortcut: "" },
        { action: "add-node", label: "添加节点", shortcut: "" },
        { action: "undo", label: "撤销", shortcut: "Ctrl+Z" },
        { action: "redo", label: "重做", shortcut: "Shift+Ctrl+Z" },
        { action: "copy-all", label: "复制所有节点", shortcut: "" },
        { action: "paste", label: "粘贴", shortcut: "Ctrl+V" },
      ],
      "the canvas actions menu must match the DX OS entry list",
    );
    assert.equal(
      await contextMenu.locator('[data-canvas-action="copy-all"]').isDisabled(),
      true,
      "copying is unavailable while the canvas is empty",
    );
    assert.equal(
      await contextMenu.locator('[data-canvas-action="paste"]').isDisabled(),
      true,
      "pasting is unavailable before anything is copied",
    );

    // 上传 opens the image picker straight from the context menu.
    const fixture = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1677ca";
      ctx.fillRect(0, 0, 320, 240);
      return canvas.toDataURL().split(",")[1];
    });
    const chooserPromise = page.waitForEvent("filechooser");
    await contextMenu.locator('[data-canvas-action="upload"]').click();
    const chooser = await chooserPromise;
    assert.equal(chooser.isMultiple(), true, "上传 must accept the same image picker as the canvas toolbar");
    await chooser.setFiles({ name: "右键上传验证.png", mimeType: "image/png", buffer: Buffer.from(fixture, "base64") });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#canvasPlane .canvas-node img")]
        .some((img) => img.complete && img.naturalWidth > 0),
    null, { timeout: 10_000 });
    await contextMenu.waitFor({ state: "hidden", timeout: 3_000 });

    // --- 添加节点 reveals the grouped create menu ----------------------------
    await rightClickBlank();
    await contextMenu.locator('[data-canvas-action="add-node"]').click();
    await menu.waitFor({ state: "visible", timeout: 3_000 });
    assert.equal(await contextMenu.isVisible(), false, "picking 添加节点 closes the actions menu");
    assert.deepEqual(
      await menu.locator(".canvas-menu-group-label").allTextContents(),
      ["添加卡片", "生成节点", "工具与输出"],
      "the create menu must group its entries",
    );
    assert.equal(
      await menu.locator(".canvas-menu-group").first().locator("button").first().getAttribute("data-canvas-node"),
      "note",
      "the sticky note must lead the card group",
    );

    // Double-click still opens the same grouped create menu.
    const dismissPoint = await blankPoint();
    await page.mouse.click(dismissPoint.x, dismissPoint.y);
    await menu.waitFor({ state: "hidden", timeout: 3_000 });
    const dblPoint = await blankPoint();
    await page.mouse.dblclick(dblPoint.x, dblPoint.y);
    await menu.waitFor({ state: "visible", timeout: 3_000 });
    assert.equal(await menu.isVisible(), true, "double-clicking blank canvas must still open the create menu");
    await page.keyboard.press("Escape");
    const secondDismissPoint = await blankPoint();
    await page.mouse.click(secondDismissPoint.x, secondDismissPoint.y);
    await menu.waitFor({ state: "hidden", timeout: 3_000 });

    // --- Create a sticky note from the create menu ---------------------------
    const notePoint = await blankPoint();
    await page.mouse.dblclick(notePoint.x, notePoint.y);
    await menu.waitFor({ state: "visible", timeout: 3_000 });
    await menu.locator('[data-canvas-node="note"]').click();
    await note.waitFor({ state: "visible", timeout: 3_000 });
    assert.equal(await menu.isVisible(), false, "creating a node closes the menu");

    const created = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-note");
      return {
        kind: getCanvasNodeKind(node),
        label: node.querySelector(".canvas-note-label")?.textContent || "",
        color: node.dataset.noteColor,
        swatches: node.querySelectorAll(".canvas-note-swatch").length,
        placeholder: node.querySelector(".canvas-note-text")?.dataset.placeholder || "",
        empty: node.querySelector(".canvas-note-text")?.dataset.empty || "",
        serialized: serializeCanvasNode(node),
      };
    });
    assert.equal(created.kind, "note", "sticky notes must serialize as their own kind");
    assert.equal(created.label, "便签");
    assert.equal(created.color, "yellow");
    assert.equal(created.swatches, 6, "the note palette must offer six colors");
    assert.equal(created.placeholder, "写点什么…");
    assert.equal(created.empty, "true");
    assert.equal(created.serialized.kind, "note");
    assert.equal(created.serialized.noteColor, "yellow");

    // --- The palette follows hover and repaints the card ---------------------
    assert.equal(
      await page.evaluate(() => Boolean(document.activeElement?.closest?.(".canvas-node-note"))),
      true,
      "a fresh note keeps its editor focused",
    );
    const awayPoint = await blankPoint();
    await page.mouse.click(awayPoint.x, awayPoint.y);
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector("#canvasPlane .canvas-node-note .canvas-note-palette")).opacity === "0",
    null, { timeout: 800 });
    assert.equal(
      await page.evaluate(() => Boolean(document.activeElement?.closest?.(".canvas-node-note"))),
      false,
      "clicking the blank canvas must blur the note editor so the palette hides at once",
    );
    await note.hover();
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector("#canvasPlane .canvas-node-note .canvas-note-palette")).opacity === "1",
    null, { timeout: 3_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "sticky-note-palette.png") });
    await note.locator('.canvas-note-swatch[data-note-color="purple"]').click();
    const recolored = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-note");
      return {
        color: node.dataset.noteColor,
        background: getComputedStyle(node).backgroundColor,
        active: node.querySelector(".canvas-note-swatch.is-active")?.dataset.noteSwatch || "",
        serializedColor: serializeCanvasNode(node).noteColor,
      };
    });
    assert.equal(recolored.color, "purple");
    assert.equal(recolored.active, "purple");
    assert.equal(recolored.serializedColor, "purple");
    assert.equal(recolored.background, "rgb(227, 221, 250)", "the card must repaint with the chosen color");

    // --- Typing persists the note text ---------------------------------------
    await note.locator(".canvas-note-text").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(NOTE_TEXT);
    await page.waitForFunction((expected) => {
      const node = document.querySelector("#canvasPlane .canvas-node-note");
      return node.querySelector(".canvas-note-text").textContent === expected;
    }, NOTE_TEXT, { timeout: 3_000 });
    await page.evaluate(() => document.activeElement?.blur?.());
    const typed = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-note");
      return {
        serialized: serializeCanvasNode(node),
        empty: node.querySelector(".canvas-note-text").dataset.empty,
      };
    });
    assert.equal(typed.serialized.text, NOTE_TEXT);
    assert.equal(typed.empty, "false", "a filled note must drop its placeholder");

    // --- Notes survive a reload ----------------------------------------------
    await page.evaluate(() => saveCanvasBoardNow());
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator(".canvas-board-item").filter({ hasText: BOARD_TITLE }).first().click();
    await page.locator("#canvasEditorScreen").waitFor();
    await note.waitFor({ state: "visible", timeout: 5_000 });
    const restored = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-note");
      return {
        kind: getCanvasNodeKind(node),
        color: node.dataset.noteColor,
        text: node.querySelector(".canvas-note-text")?.textContent || "",
      };
    });
    assert.deepEqual(restored, { kind: "note", color: "purple", text: NOTE_TEXT });

    // --- 复制所有节点 / 粘贴 / 撤销 from the actions menu ---------------------
    const nodesBeforeCopy = await page.locator("#canvasPlane .canvas-node").count();
    await rightClickBlank();
    await contextMenu.locator('[data-canvas-action="copy-all"]').click();
    assert.equal(await statusText(), `已复制 ${nodesBeforeCopy} 个节点。`);
    await rightClickBlank();
    await contextMenu.locator('[data-canvas-action="paste"]').click();
    await page.waitForFunction((expected) =>
      document.querySelectorAll("#canvasPlane .canvas-node").length === expected, nodesBeforeCopy * 2, { timeout: 5_000 });
    assert.match(await statusText(), /^已粘贴 \d+ 个节点。$/);
    const notesAfterPaste = await noteCount();
    await rightClickBlank();
    await contextMenu.locator('[data-canvas-action="undo"]').click();
    assert.equal(await statusText(), "已撤销上一步操作。");
    assert.ok(await noteCount() < notesAfterPaste, "撤销 must roll the paste back");

    // --- The palette trash button deletes the note ---------------------------
    await page.evaluate(() => bringCanvasNodeToFront(document.querySelector("#canvasPlane .canvas-node-note")));
    await note.hover();
    await note.locator(".canvas-note-remove").click();
    await page.waitForFunction(() => !document.querySelector("#canvasPlane .canvas-node-note"), null, { timeout: 3_000 });
    assert.equal(await note.count(), 0, "the note palette must be able to delete its card");
    assert.deepEqual(browserErrors, []);
    console.log("Canvas sticky note and right-click menu browser checks passed.");
  } finally {
    await browser?.close();
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
