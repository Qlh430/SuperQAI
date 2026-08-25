const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const SOURCE_FILE = path.join(ROOT, "data", "canvas-boards.json");

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

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
        let data;
        try { data = JSON.parse(body || "{}"); } catch { data = body; }
        resolve({ status: response.statusCode, data });
      });
    });
    request.once("error", reject);
  });
}

async function waitForServer(port, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await requestJson(port, "/api/models")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Old-canvas verification server did not start.\n${diagnostics.join("")}`);
}

function selectBoards(boards) {
  const nonEmpty = boards.filter((board) => (
    !board.deletedAt && Array.isArray(board.nodes) && board.nodes.length > 0
  ));
  assert.ok(nonEmpty.length > 0, "No non-empty historical canvases are available for verification.");
  const bySize = [...nonEmpty].sort((a, b) => b.nodes.length - a.nodes.length)[0];
  const byVariety = [...nonEmpty].sort((a, b) => (
    new Set(b.nodes.map((node) => node.kind)).size - new Set(a.nodes.map((node) => node.kind)).size
  ))[0];
  const byAge = [...nonEmpty].sort((a, b) => (
    new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0)
  ))[0];
  return [...new Map([bySize, byVariety, byAge].map((board) => [String(board.id), board])).values()];
}

async function openBoard(page, board) {
  await page.locator("#canvasHistoryButton").click();
  await page.locator(`[data-board-id="${board.id}"]`).click({ timeout: 15_000 });
  await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction(({ boardId, nodeCount }) => (
    typeof canvasState === "object"
      && canvasState.activeBoardId === boardId
      && (nodeCount === 0 || globalThis.canvasVirtualStore?.size > 0 || globalThis.canvasPagedStore?.lodPage)
  ), { boardId: String(board.id), nodeCount: board.nodes.length }, { timeout: 30_000 });
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")];
    return {
      activeBoardId: canvasState.activeBoardId,
      activeBoardTitle: canvasState.activeBoardTitle,
      residentModels: canvasVirtualStore.size,
      mountedNodes: nodes.length,
      primitiveLod: Boolean(canvasPagedStore.lodPage),
      status: document.querySelector("#canvasStatus")?.textContent?.trim() || "",
      blankMountedNodes: nodes.filter((node) => !(
        node.textContent.trim()
        || node.querySelector("img,canvas,video,audio,input,textarea,select,button")
      )).length,
      mountedImages: nodes.filter((node) => node.querySelector("img")).length,
    };
  });
}

(async () => {
  assert.equal(fs.existsSync(SOURCE_FILE), true, `Historical canvas file is missing: ${SOURCE_FILE}`);
  const sourceHash = hashFile(SOURCE_FILE);
  const value = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8").replace(/^\uFEFF/, ""));
  const boards = Array.isArray(value) ? value : (Array.isArray(value.boards) ? value.boards : []);
  const selected = selectBoards(boards);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "existing-old-canvas-ui-"));
  const legacyFile = path.join(directory, "canvas-boards.json");
  const databaseFile = path.join(directory, "canvas.db");
  const backupDirectory = path.join(directory, "backups");
  fs.copyFileSync(SOURCE_FILE, legacyFile);
  const copiedHash = hashFile(legacyFile);
  assert.equal(copiedHash, sourceHash);
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
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
    const canvasApiErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/canvas/") && response.status() >= 400) {
        canvasApiErrors.push({ status: response.status(), url: response.url() });
      }
    });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.locator("#infiniteCanvas").waitFor({ state: "visible", timeout: 30_000 });
    await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
    const results = [];
    for (const board of selected) {
      const opened = await openBoard(page, board);
      assert.equal(opened.activeBoardId, String(board.id));
      assert.equal(opened.activeBoardTitle, String(board.title || "未命名画布"));
      assert.ok(opened.residentModels > 0 || opened.primitiveLod);
      assert.ok(opened.mountedNodes <= 800);
      assert.equal(opened.blankMountedNodes, 0);
      const meta = await requestJson(port, `/api/canvas/boards/${encodeURIComponent(board.id)}/meta`);
      assert.equal(meta.status, 200);
      assert.equal(meta.data.nodeCount, board.nodes.length);
      assert.equal(meta.data.connectionCount, Array.isArray(board.connections) ? board.connections.length : 0);
      assert.deepEqual(meta.data.viewport, board.viewport || { x: 0, y: 0, scale: 1 });
      results.push({
        id: String(board.id),
        title: String(board.title || ""),
        sourceNodes: board.nodes.length,
        sourceConnections: Array.isArray(board.connections) ? board.connections.length : 0,
        mountedNodes: opened.mountedNodes,
        residentModels: opened.residentModels,
        mountedImages: opened.mountedImages,
        primitiveLod: opened.primitiveLod,
      });
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(canvasApiErrors, []);
    assert.equal(hashFile(legacyFile), copiedHash, "copied historical JSON changed during migration");
    assert.equal(hashFile(SOURCE_FILE), sourceHash, "original historical JSON changed during verification");
    assert.ok(fs.readdirSync(backupDirectory).filter((name) => name.includes(".bak-")).length >= selected.length);
    console.log(`Existing old canvas UI checks passed: ${JSON.stringify(results)}`);
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
    assert.equal(fs.existsSync(directory), false, "old-canvas verification copy was not removed");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
