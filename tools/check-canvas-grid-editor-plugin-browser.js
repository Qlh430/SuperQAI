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
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

const ARTIFACT_DIR = path.join(__dirname, "..", "artifacts");
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, "canvas-grid-editor-plugin.png");
const BOARD_TITLE = "宫格编辑插件验证";

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-grid-editor-plugin-"));
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
  server.stdout.on("data", (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-5_000);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-5_000);
  });

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
    const page = await browser.newPage({ viewport: { width: 1720, height: 1080 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    const uploadedPngs = new Map();
    let uploadIndex = 0;
    const savedOperations = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/canvas/boards**", async (route) => {
      const request = route.request();
      const method = request.method();
      const pathname = new URL(request.url()).pathname;
      const suffix = pathname.startsWith("/api/canvas/boards")
        ? pathname.slice("/api/canvas/boards".length)
        : pathname;
      if (method === "GET" && !suffix) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ boards: [], trash: [] }),
        });
        return;
      }
      if (method === "POST" && !suffix) {
        const board = request.postDataJSON() || {};
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ board, boards: [board], trash: [], revision: 0 }),
        });
        return;
      }
      if (method === "POST" && suffix.endsWith("/operations")) {
        const payload = request.postDataJSON() || {};
        const operations = Array.isArray(payload.operations) ? payload.operations : [];
        savedOperations.push(...operations);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            boardRevision: Number(payload.baseRevision || 0) + 1,
            results: operations.map((operation) => ({
              operationId: operation.operationId,
              status: "applied",
              entityRevision: Number(payload.baseRevision || 0) + 1,
            })),
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/upload-image", async (route) => {
      uploadIndex += 1;
      const url = `/test-output/grid-editor-plugin-${uploadIndex}.png`;
      uploadedPngs.set(url, route.request().postDataBuffer());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url }) });
    });
    await page.route("**/test-output/*.png", async (route) => {
      const url = new URL(route.request().url()).pathname;
      const body = uploadedPngs.get(url);
      await route.fulfill({ status: body ? 200 : 404, contentType: "image/png", body: body || Buffer.alloc(0) });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasBoardNew").click();
    await page.locator("#canvasNameInput").fill(BOARD_TITLE);
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator("#canvasEditorScreen").waitFor();
    await page.waitForSelector("#canvasPlane", { state: "attached" });
    await page.waitForFunction(() => Boolean(window.AiOsCanvasNodePlugins?.get?.("grid-editor")));

    const pluginState = await page.evaluate(() => {
      const plugins = window.AiOsCanvasNodePlugins;
      const registry = window.AiOsCanvasNodeRegistry;
      return {
        ids: (plugins?.list?.() || []).map((plugin) => plugin.id).sort(),
        hasGridEditor: Boolean(plugins?.get?.("grid-editor")),
        unresolvedCatalogPlugins: registry
          ? registry.listNodes()
            .filter((definition) => definition.pluginId && !plugins?.get?.(definition.pluginId))
            .map((definition) => definition.pluginId)
            .sort()
          : ["registry-unavailable"],
      };
    });
    assert.equal(pluginState.hasGridEditor, true, "the grid editor plugin must register before the canvas runtime renders nodes");
    assert.ok(pluginState.ids.includes("grid-editor"), "the grid editor plugin must appear in the browser plugin list");
    assert.deepEqual(pluginState.unresolvedCatalogPlugins, [], "every catalog plugin id must resolve to a registered plugin");

    const editorId = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ef4444";
      context.fillRect(0, 0, 600, 450);
      context.fillStyle = "#22c55e";
      context.fillRect(600, 0, 600, 450);
      context.fillStyle = "#3b82f6";
      context.fillRect(0, 450, 600, 450);
      context.fillStyle = "#f59e0b";
      context.fillRect(600, 450, 600, 450);
      const src = canvas.toDataURL("image/png");
      const source = addCanvasImage(src, "grid-editor-plugin-source.png", { x: 120, y: 130 });
      const editor = await addCanvasGridEditorNode(source, {
        source: { src, savedUrl: src, name: "grid-editor-plugin-source.png" },
        rows: 3,
        columns: 3,
      });
      scheduleAgentCanvasAutoFocus([editor]);
      return editor.dataset.id;
    });

    const editor = page.locator(`.canvas-node-grid-editor[data-id="${editorId}"]`);
    await editor.waitFor({ state: "visible" });
    await page.waitForFunction(() => (
      document.querySelectorAll(".canvas-node-grid-editor .canvas-grid-editor-cell").length === 9
    ));
    assert.equal(await editor.locator(".canvas-grid-editor-toolbar").count(), 1);
    assert.equal(await editor.locator(".canvas-grid-editor-cell").count(), 9);
    assert.equal(await editor.locator(".canvas-grid-editor-band").count(), 4);
    assert.equal(await page.evaluate(() => {
      const node = document.querySelector(".canvas-node-grid-editor");
      return canvasState.connections.filter((item) => item.to === node.dataset.id).length;
    }), 1);

    await editor.locator(".canvas-grid-editor-aspect").click();
    await editor.locator("[data-grid-editor-aspect='3:4']").click();
    const cropRatios = await editor.locator(".canvas-grid-editor-cell").evaluateAll((cells) => (
      cells.map((cell) => {
        const crop = JSON.parse(cell.dataset.crop);
        return crop.width / crop.height;
      })
    ));
    assert.ok(cropRatios.every((ratio) => Math.abs(ratio - 0.75) < 0.0001));

    await editor.locator(".canvas-grid-editor-edit").click();
    await editor.locator(".canvas-grid-editor-uniform-gap").fill("12");
    await editor.locator(".canvas-grid-editor-uniform-gap").press("Tab");
    assert.deepEqual(await editor.evaluate((node) => {
      const state = JSON.parse(node.dataset.gridEditorState);
      return {
        uniformGap: state.uniformGap,
        horizontal: state.horizontalBands.map((band) => band.end - band.start),
        vertical: state.verticalBands.map((band) => band.end - band.start),
      };
    }), { uniformGap: 12, horizontal: [12, 12], vertical: [12, 12] });

    const firstVertical = editor.locator(".canvas-grid-editor-band.is-vertical").first();
    await firstVertical.locator("[data-band-edge='move']").click({ position: { x: 1, y: 30 } });
    await editor.locator(".canvas-grid-editor-band-gap").fill("20");
    await editor.locator(".canvas-grid-editor-band-gap").press("Tab");
    assert.equal(await editor.evaluate((node) => {
      const state = JSON.parse(node.dataset.gridEditorState);
      const band = state.verticalBands.find((item) => item.id === state.selectedBand.id);
      return band.end - band.start;
    }), 20);

    const selectedFrame = editor.locator(".canvas-grid-editor-cell-frame").first();
    await selectedFrame.click();
    await editor.locator(".canvas-grid-editor-zoom").evaluate((input) => {
      input.value = "1.5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const editedState = await editor.evaluate((node) => JSON.parse(node.dataset.gridEditorState));
    assert.equal(editedState.aspect, "3:4");
    assert.equal(editedState.cellTransforms.find((item) => item.key === editedState.selectedCellKey).zoom, 1.5);

    await editor.locator(".canvas-grid-editor-collapse").click();
    assert.equal(await editor.locator(".canvas-grid-editor-body").isHidden(), true);
    await editor.locator(".canvas-grid-editor-collapse").click();
    assert.equal(await editor.locator(".canvas-grid-editor-body").isVisible(), true);

    await editor.locator(".canvas-grid-editor-output").click();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(".canvas-node-gallery-container"))
        .some((node) => {
          try {
            return JSON.parse(node.dataset.galleryContainer || "{}").title === "裁切图集";
          } catch {
            return false;
          }
        })
    ));
    await page.waitForFunction(() => (
      document.querySelector(".canvas-node-grid-editor")?.dataset.gridEditorOutputting !== "true"
    ));
    const outputMembers = await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll(".canvas-node-gallery-container"))
        .find((candidate) => {
          try {
            return JSON.parse(candidate.dataset.galleryContainer || "{}").title === "裁切图集";
          } catch {
            return false;
          }
        });
      const container = JSON.parse(node?.dataset.galleryContainer || "{}");
      let gallery = null;
      try {
        gallery = JSON.parse(node?.dataset.gallery || "{}");
      } catch {
        gallery = null;
      }
      return container.members || gallery?.members || [];
    });
    assert.equal(outputMembers.length, 9);
    assert.ok(outputMembers.every((member) => Number(member.width) > 0 && Number(member.height) > 0));
    assert.equal(uploadedPngs.size, 9);

    const persisted = await page.evaluate(() => {
      const board = serializeCanvasBoard();
      const editorItem = board.nodes.find((item) => item.kind === "grid-editor");
      const connection = board.connections.find((item) => item.to === editorItem.id);
      restoreCanvasBoard(board);
      const restoredNode = document.querySelector(`.canvas-node-grid-editor[data-id="${editorItem.id}"]`);
      return {
        before: editorItem.gridEditorState,
        after: JSON.parse(restoredNode.dataset.gridEditorState),
        connection,
        restoredConnection: canvasState.connections.find((item) => item.to === editorItem.id),
        cellCount: restoredNode.querySelectorAll(".canvas-grid-editor-cell").length,
      };
    });
    assert.equal(persisted.cellCount, 9);
    assert.deepEqual(persisted.after, { ...persisted.before, editing: false });
    assert.deepEqual(persisted.restoredConnection, persisted.connection);

    await page.evaluate(() => saveCanvasBoardNow());
    await page.waitForTimeout(650);
    assert.ok(
      savedOperations.some((operation) => (
        operation.type === "node.upsert" && operation.after?.kind === "grid-editor"
      )),
      "the grid editor node must be persisted through the canvas operation stream",
    );
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(" | ")}`);
    console.log(`Canvas grid editor plugin browser checks passed: ${SCREENSHOT_PATH}`);
  } finally {
    await browser?.close();
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
