const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BOARD_ID = "legacy-paged-roundtrip";
const FAR_NODE_ID = "far-text";
const EDITED_TEXT = "分页保存后的远端节点";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let data = {};
        try { data = JSON.parse(body || "{}"); } catch { data = body; }
        resolve({ status: response.statusCode, data });
      });
    });
    request.once("error", reject);
  });
}

async function waitForServer(port, diagnostics) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await requestJson(port, "/api/models");
      if (response.status === 200) return;
    } catch {
      // Server may still be opening the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Canvas test server did not start.\n${diagnostics.join("")}`);
}

async function openBoard(page) {
  await page.locator("#infiniteCanvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
  await page.locator("#canvasHistoryButton").click();
  await page.locator(`[data-board-id="${BOARD_ID}"]`).click({ timeout: 10_000 });
  await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction((nodeId) => Boolean(
    globalThis.canvasVirtualStore?.get(nodeId)
      && document.querySelector(`#canvasPlane .canvas-node[data-id="${nodeId}"] .canvas-text`),
  ), FAR_NODE_ID, { timeout: 20_000 });
}

(async () => {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-paged-roundtrip-"));
  const legacyFile = path.join(directory, "canvas-boards.json");
  const databaseFile = path.join(directory, "canvas.db");
  const backupDirectory = path.join(directory, "backups");
  const legacyBoard = {
    id: BOARD_ID,
    title: "旧画布分页往返",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    viewport: { x: -49_700, y: 120, scale: 1 },
    nodes: [
      { id: "near-text", kind: "text", x: 0, y: 0, width: 280, height: 180, text: "近端节点" },
      {
        id: FAR_NODE_ID,
        kind: "text",
        x: 50_000,
        y: 100,
        width: 320,
        height: 200,
        text: "迁移前的远端节点",
        futureField: { preserved: true, version: 9 },
      },
    ],
    connections: [{ id: "far-link", from: "near-text", to: FAR_NODE_ID, futureEdgeField: "preserved" }],
  };
  fs.writeFileSync(legacyFile, JSON.stringify([legacyBoard], null, 2));

  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      CANVAS_DB_FILE: databaseFile,
      CANVAS_LEGACY_FILE: legacyFile,
      CANVAS_BACKUP_DIR: backupDirectory,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  let browser;
  try {
    await waitForServer(port, diagnostics);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH
        || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    const operationBodies = [];
    const canvasResponses = [];
    const missingResponses = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location();
        if (String(location.url || "").endsWith("/favicon.ico")) return;
        pageErrors.push(`console: ${message.text()} @ ${location.url || "unknown"}:${location.lineNumber || 0}`);
      }
    });
    page.on("requestfailed", (request) => {
      missingResponses.push(`${request.url()} (${request.failure()?.errorText || "failed"})`);
    });
    page.on("response", (response) => {
      if (response.status() === 404) missingResponses.push(response.url());
      if (!response.url().includes("/api/canvas/boards")) return;
      canvasResponses.push({ status: response.status(), url: response.url() });
    });
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("/operations")) return;
      try { operationBodies.push(request.postDataJSON()); } catch {}
    });

    const appUrl = `http://127.0.0.1:${port}`;
    await page.goto(appUrl, { waitUntil: "networkidle", timeout: 30_000 });
    try {
      await openBoard(page);
    } catch (error) {
      const state = await page.evaluate(() => ({
        boardPanelText: document.querySelector("#canvasBoardPanel")?.textContent?.trim(),
        loadingText: document.querySelector("#canvasBoardLoading")?.textContent?.trim(),
        statusText: document.querySelector("#canvasStatus")?.textContent?.trim(),
        storeSize: globalThis.canvasVirtualStore?.size,
        mountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
        activeBoardId: typeof canvasState === "object" ? canvasState.activeBoardId : "unavailable",
        viewport: typeof canvasState === "object"
          ? { x: canvasState.x, y: canvasState.y, scale: canvasState.scale }
          : null,
      }));
      console.error(JSON.stringify({ state, canvasResponses, pageErrors, diagnostics }, null, 2));
      throw error;
    }

    const beforeEdit = await page.evaluate((nodeId) => ({
      residentModels: canvasVirtualStore.size,
      mountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
      futureField: canvasVirtualStore.get(nodeId)?.futureField,
    }), FAR_NODE_ID);
    assert.equal(beforeEdit.residentModels, 1, "opening a far viewport should not hydrate the near node");
    assert.ok(beforeEdit.mountedNodes <= 800, `mounted node budget exceeded: ${beforeEdit.mountedNodes}`);
    assert.deepEqual(beforeEdit.futureField, { preserved: true, version: 9 });

    await page.evaluate(async ({ nodeId, text }) => {
      const editor = document.querySelector(`#canvasPlane .canvas-node[data-id="${nodeId}"] .canvas-text`);
      editor.textContent = text;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      scheduleCanvasSave();
      await flushCanvasOperations();
    }, { nodeId: FAR_NODE_ID, text: EDITED_TEXT });
    const metaAfterEdit = await requestJson(port, `/api/canvas/boards/${BOARD_ID}/meta`);
    assert.equal(metaAfterEdit.status, 200);
    assert.equal(
      metaAfterEdit.data.connectionCount,
      legacyBoard.connections.length,
      "saving a paged viewport deleted a connection whose remote endpoint was not resident",
    );
    assert.ok(operationBodies.length >= 1, "editing should send an incremental operation batch");
    operationBodies.forEach((body) => {
      assert.equal(body.board, undefined);
      assert.equal(body.nodes, undefined);
      assert.equal(body.connections, undefined);
      assert.ok(Array.isArray(body.operations));
      assert.ok(body.operations.length <= 500);
    });

    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    await openBoard(page);
    const afterReload = await page.evaluate((nodeId) => ({
      text: document.querySelector(`#canvasPlane .canvas-node[data-id="${nodeId}"] .canvas-text`)?.textContent,
      futureField: canvasVirtualStore.get(nodeId)?.futureField,
      residentModels: canvasVirtualStore.size,
      mountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
    }), FAR_NODE_ID);
    assert.equal(afterReload.text, EDITED_TEXT);
    assert.deepEqual(afterReload.futureField, { preserved: true, version: 9 });
    assert.ok(afterReload.residentModels < legacyBoard.nodes.length);
    assert.ok(afterReload.mountedNodes <= 800);
    assert.ok(
      canvasResponses.every((response) => response.status >= 200 && response.status < 300),
      `canvas API failure: ${JSON.stringify(canvasResponses)}`,
    );
    assert.deepEqual(pageErrors, [], `unexpected 404 responses: ${missingResponses.join(", ")}`);
    assert.ok(fs.readdirSync(backupDirectory).some((name) => name.includes(".bak-")));
    console.log("Canvas paged migration and round-trip UI checks passed.");
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
