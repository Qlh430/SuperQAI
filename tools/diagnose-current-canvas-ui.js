const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { backup, DatabaseSync } = require("node:sqlite");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BOARD_IDS = [
  "55f3dd62-ab98-4836-acc4-c79061a81b34",
  "544a8769-7103-4058-8fc4-9b2816e3d5a0",
  "7c60e688-16b7-4936-a39a-f0757becf03e",
  "214e424b-23af-4507-a53a-29c6fa7721b4",
  "84968af8-9a3b-44d6-8e06-300cbd0e07e6",
];

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
    http.get({ hostname: "127.0.0.1", port, path: pathname }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let data;
        try { data = JSON.parse(body || "{}"); } catch { data = body; }
        resolve({ status: response.statusCode, data });
      });
    }).once("error", reject);
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await requestJson(port, "/api/models")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Snapshot server did not start.");
}

async function state(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")];
    const summaries = nodes.filter((node) => node.classList.contains("canvas-node-virtual-summary"));
    const primitive = globalThis.canvasPrimitiveLayer?.getDiagnostics?.() || {};
    return ({
    boardId: canvasState.activeBoardId,
    title: canvasState.activeBoardTitle,
    transform: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
    resident: canvasVirtualStore.size,
    mounted: nodes.length,
    fullNodes: nodes.length - summaries.length,
    summaryNodes: summaries.length,
    mountedVisible: nodes
      .filter((node) => getComputedStyle(node).visibility !== "hidden").length,
    mountedImages: document.querySelectorAll("#canvasPlane .canvas-node img").length,
    lodPage: canvasPagedStore.lodPage ? {
      mode: canvasPagedStore.lodPage.mode,
      level: canvasPagedStore.lodPage.lodLevel,
      lodNodes: canvasPagedStore.lodPage.lodNodes?.length || 0,
      revision: canvasPagedStore.lodPage.boardRevision,
    } : null,
    hasPrimitiveClass: document.querySelector("#infiniteCanvas")?.classList.contains("has-primitive-lod"),
    panelOpen: !document.querySelector("#canvasBoardPanel")?.hidden,
    storeGeneration: canvasPagedStore.activeGeneration,
    sourceGeneration: canvasViewportDataSource.generation,
    blankMountedNodes: nodes.filter((node) => !(
      node.textContent.trim()
      || node.querySelector("img,canvas,video,audio,input,textarea,select,button")
    )).length,
    incompleteSemanticNodes: summaries.filter((node) => (
      node.dataset.previewComplete !== "true"
      || !node.querySelector(".canvas-node-virtual-type")?.textContent.trim()
      || !node.querySelector(".canvas-node-virtual-title")?.textContent.trim()
      || !node.querySelector(".canvas-node-virtual-status")?.textContent.trim()
      || !node.querySelector("img,.canvas-node-virtual-icon")
    )).map((node) => node.dataset.id),
    primitiveSemanticCards: Number(primitive.semanticCardCount || 0),
    primitiveBlankCards: Number(primitive.blankCardCount || 0),
    nodeSamples: nodes.slice(0, 5).map((node) => ({
      id: node.dataset.id,
      className: node.className,
      text: node.innerText.slice(0, 80),
      visibility: getComputedStyle(node).visibility,
      opacity: getComputedStyle(node).opacity,
      childCount: node.childElementCount,
      imageCount: node.querySelectorAll("img").length,
    })),
    });
  });
}

(async () => {
  const sourceJsonFile = path.join(ROOT, "data", "canvas-boards.json");
  const sourceDatabaseFile = path.join(ROOT, "data", "canvas.db");
  const sourceJsonHash = hashFile(sourceJsonFile);
  const sourceDatabaseHash = hashFile(sourceDatabaseFile);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "current-canvas-diagnostic-"));
  const databaseFile = path.join(directory, "canvas.db");
  const legacyFile = path.join(directory, "canvas-boards.json");
  fs.copyFileSync(sourceJsonFile, legacyFile);
  const source = new DatabaseSync(sourceDatabaseFile, { readOnly: true });
  try {
    await backup(source, databaseFile);
  } finally {
    source.close();
  }
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      CANVAS_DB_FILE: databaseFile,
      CANVAS_LEGACY_FILE: legacyFile,
      CANVAS_BACKUP_DIR: path.join(directory, "backups"),
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const diagnostics = [];
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  let browser;
  try {
    await waitForServer(port);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH
        || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const page = await browser.newPage({ viewport: { width: 2047, height: 1273 } });
    const viewportResponses = [];
    page.on("response", async (response) => {
      if (!response.url().includes("/viewport?")) return;
      try {
        const data = await response.json();
        viewportResponses.push({
          url: response.url(),
          status: response.status(),
          mode: data.mode,
          lodLevel: data.lodLevel,
          nodes: data.nodes?.length || 0,
          lodNodes: data.lodNodes?.length || 0,
          revision: data.boardRevision,
          generation: data.generation,
        });
      } catch {}
    });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.locator("#infiniteCanvas").waitFor({ state: "visible" });
    await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
    for (const boardId of BOARD_IDS) {
      await page.locator("#canvasHistoryButton").click();
      await page.locator(`[data-board-id="${boardId}"]`).click();
      await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
      await page.waitForFunction((id) => canvasState.activeBoardId === id, boardId);
      await page.waitForTimeout(250);
      const opened = await state(page);
      assert.equal(opened.blankMountedNodes, 0, `${opened.title} has blank mounted nodes`);
      assert.deepEqual(opened.incompleteSemanticNodes, [], `${opened.title} has incomplete summaries`);
      assert.equal(opened.primitiveBlankCards, 0, `${opened.title} has blank aggregate cards`);
      assert.ok(
        opened.mountedVisible > 0 || opened.primitiveSemanticCards > 0,
        `${opened.title} has no visible semantic content`,
      );
      console.log(`after open: ${JSON.stringify(opened)}`);
    }
    await page.locator("#canvasHistoryButton").click();
    await page.waitForTimeout(250);
    console.log(`with history: ${JSON.stringify(await state(page))}`);
    console.log(`viewport responses: ${JSON.stringify(viewportResponses)}`);
    await page.screenshot({
      path: process.env.CANVAS_DIAGNOSTIC_SCREENSHOT || path.join(directory, "current-canvas.png"),
    });
    const finalState = await state(page);
    assert.equal(finalState.boardId, BOARD_IDS.at(-1));
    assert.equal(finalState.lodPage, null, "detail-scale current canvas retained a LOD page");
    assert.equal(finalState.hasPrimitiveClass, false, "detail-scale current canvas retained primitive rendering");
    assert.ok(finalState.mountedVisible > 0, "detail-scale current canvas has no visible node content");
    assert.equal(hashFile(sourceJsonFile), sourceJsonHash, "historical canvas JSON changed during diagnostic");
    assert.equal(hashFile(sourceDatabaseFile), sourceDatabaseHash, "formal canvas database changed during diagnostic");
    console.log("Current canvas detail diagnostic passed.");
  } catch (error) {
    console.error(`server diagnostics: ${diagnostics.join("")}`);
    throw error;
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
