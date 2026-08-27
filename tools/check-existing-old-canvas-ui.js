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

function nonEmptyBoards(boards) {
  return boards.filter((board) => (
    !board.deletedAt && Array.isArray(board.nodes) && board.nodes.length > 0
  ));
}

function selectBoards(nonEmpty) {
  assert.ok(nonEmpty.length > 0, "No non-empty historical canvases are available for verification.");
  const requestedId = String(process.env.CANVAS_TEST_BOARD_ID || "").trim();
  if (requestedId) {
    const requested = nonEmpty.find((board) => String(board.id) === requestedId);
    assert.ok(requested, `Requested historical canvas is unavailable: ${requestedId}`);
    return [requested];
  }
  const bySize = [...nonEmpty].sort((a, b) => b.nodes.length - a.nodes.length)[0];
  const byVariety = [...nonEmpty].sort((a, b) => (
    new Set(b.nodes.map((node) => node.kind)).size - new Set(a.nodes.map((node) => node.kind)).size
  ))[0];
  const byAge = [...nonEmpty].sort((a, b) => (
    new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0)
  ))[0];
  const savedDetailViewport = nonEmpty.find((board) => String(board.title || "") === "苹果")
    || nonEmpty.find((board) => (
      board.nodes.length <= 800 && Number(board.viewport?.scale || 1) >= 0.3
    ));
  return [...new Map(
    [
      nonEmpty.find((board) => /NILLKIN/i.test(String(board.title || ""))),
      savedDetailViewport,
      nonEmpty.find((board) => String(board.title || "") === "画布 17"),
      bySize,
      byVariety,
      byAge,
    ]
      .filter(Boolean)
      .map((board) => [String(board.id), board]),
  ).values()];
}

async function readCanvasUi(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")];
    const summaries = nodes.filter((node) => node.classList.contains("canvas-node-virtual-summary"));
    const sceneDiagnostics = globalThis.canvasSceneLayer?.getDiagnostics?.() || {};
    const viewportRect = document.querySelector("#infiniteCanvas")?.getBoundingClientRect();
    const visibleImages = nodes.flatMap((node) => (
      [...node.querySelectorAll("img")].filter((image) => {
        const rect = image.getBoundingClientRect();
        return Boolean(
          viewportRect
          && rect.width > 0
          && rect.height > 0
          && rect.left < viewportRect.right
          && rect.right > viewportRect.left
          && rect.top < viewportRect.bottom
          && rect.bottom > viewportRect.top
        );
      })
    ));
    const failedImages = visibleImages.filter((image) => (
      image.dataset.imageQuality === "error"
      || (image.hasAttribute("src") && image.complete && image.naturalWidth === 0)
    ));
    return {
      activeBoardId: canvasState.activeBoardId,
      activeBoardTitle: canvasState.activeBoardTitle,
      scale: canvasState.scale,
      residentModels: canvasVirtualStore.size,
      mountedNodes: nodes.length,
      fullNodes: nodes.length - summaries.length,
      summaryNodes: summaries.length,
      primitiveLod: Boolean(canvasPagedStore.scenePage),
      primitiveBlankCards: Number(sceneDiagnostics.aggregateCardCount || 0),
      primitiveSemanticCards: Number(sceneDiagnostics.aggregateCardCount || 0),
      sceneVisualNodes: Number(sceneDiagnostics.visualNodeCount || 0),
      status: document.querySelector("#canvasStatus")?.textContent?.trim() || "",
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
      imageStates: summaries.reduce((states, node) => {
        const state = node.dataset.previewImageState || "none";
        states[state] = (states[state] || 0) + 1;
        return states;
      }, {}),
      mountedImages: nodes.filter((node) => node.querySelector("img")).length,
      brokenImages: failedImages.length,
      unloadedVisibleImages: visibleImages.filter((image) => (
        ["", "unloaded"].includes(image.dataset.imageQuality || "") && !image.hasAttribute("src")
      )).length,
      brokenImageDetails: failedImages.map((image) => {
        const node = image.closest(".canvas-node");
        return {
            nodeId: node?.dataset.id || "",
            kind: node?.dataset.kind || "",
            src: image.currentSrc || image.src || "",
            previewState: node?.dataset.previewImageState || "",
            html: image.outerHTML.slice(0, 500),
        };
      }),
      levels: summaries.reduce((levels, node) => {
        const level = node.dataset.virtualLevel || "unknown";
        levels[level] = (levels[level] || 0) + 1;
        return levels;
      }, {}),
    };
  });
}

async function openBoard(page, board) {
  try {
    await page.waitForFunction((boardId) => (
      Array.isArray(canvasState?.boards)
        && canvasState.boards.some((item) => String(item.id) === String(boardId))
    ), String(board.id), { timeout: 20_000 });
  } catch (error) {
    const runtime = await page.evaluate(() => ({
      boardCount: typeof canvasState === "object" && Array.isArray(canvasState.boards)
        ? canvasState.boards.length
        : -1,
      boardIds: typeof canvasState === "object" && Array.isArray(canvasState.boards)
        ? canvasState.boards.slice(0, 5).map((item) => item.id)
        : [],
      status: document.querySelector("#canvasStatus")?.textContent || "",
      contract: Boolean(globalThis.CanvasEngineContract),
      sceneLayer: Boolean(globalThis.CanvasSceneLayer),
    }));
    throw new Error(`${error.message}\nHistorical canvas runtime: ${JSON.stringify(runtime)}`);
  }
  await page.locator("#canvasHistoryButton").click();
  await page.locator(`[data-board-id="${board.id}"]`).click({ timeout: 15_000 });
  await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction(({ boardId, nodeCount }) => (
    typeof canvasState === "object"
      && canvasState.activeBoardId === boardId
      && (nodeCount === 0 || globalThis.canvasVirtualStore?.size > 0 || globalThis.canvasPagedStore?.scenePage)
  ), { boardId: String(board.id), nodeCount: board.nodes.length }, { timeout: 30_000 });
  await page.waitForTimeout(150);
  return readCanvasUi(page);
}

async function setScale(page, scale) {
  await page.evaluate(async (nextScale) => {
    const viewport = document.querySelector("#infiniteCanvas");
    const screenX = (viewport?.clientWidth || 0) / 2;
    const screenY = (viewport?.clientHeight || 0) / 2;
    const anchorX = (screenX - canvasState.x) / canvasState.scale;
    const anchorY = (screenY - canvasState.y) / canvasState.scale;
    canvasState.scale = nextScale;
    canvasState.x = screenX - anchorX * nextScale;
    canvasState.y = screenY - anchorY * nextScale;
    applyCanvasTransformNow();
    canvasViewportDataSource.lastFulfilled = null;
    const { mountRect } = canvasVirtualizer.getRects();
    await requestCanvasViewportPage({ ...mountRect, scale: nextScale });
    canvasVirtualizer.flushNow();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, scale);
  await page.waitForFunction(() => {
    const viewportRect = document.querySelector("#infiniteCanvas")?.getBoundingClientRect();
    if (!viewportRect) return false;
    return [...document.querySelectorAll("#canvasPlane .canvas-node img")].every((image) => {
      const rect = image.getBoundingClientRect();
      const visible = rect.width > 0
        && rect.height > 0
        && rect.left < viewportRect.right
        && rect.right > viewportRect.left
        && rect.top < viewportRect.bottom
        && rect.bottom > viewportRect.top;
      return !visible
        || !["", "unloaded"].includes(image.dataset.imageQuality || "")
        || image.hasAttribute("src");
    });
  }, null, { timeout: 5_000 });
  return readCanvasUi(page);
}

(async () => {
  assert.equal(fs.existsSync(SOURCE_FILE), true, `Historical canvas file is missing: ${SOURCE_FILE}`);
  const sourceHash = hashFile(SOURCE_FILE);
  const value = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8").replace(/^\uFEFF/, ""));
  const boards = Array.isArray(value) ? value : (Array.isArray(value.boards) ? value.boards : []);
  const allBoards = nonEmptyBoards(boards);
  const selected = selectBoards(allBoards);
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
    const listedBeforeOpen = await requestJson(port, "/api/canvas/boards");
    assert.equal(listedBeforeOpen.status, 200);
    assert.ok(
      listedBeforeOpen.data.boards.some((item) => String(item.id) === String(allBoards[0].id)),
      `Historical board missing from storage list: ${allBoards[0].id}`,
    );
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
    for (const board of allBoards) {
      const opened = await openBoard(page, board);
      assert.equal(opened.activeBoardId, String(board.id));
      assert.equal(opened.activeBoardTitle, String(board.title || "未命名画布"));
      assert.ok(opened.residentModels > 0 || opened.primitiveLod);
      assert.ok(opened.mountedNodes <= 800);
      const scales = [];
      for (const scale of [0.09, 0.55]) {
        const snapshot = await setScale(page, scale);
        assert.equal(snapshot.primitiveLod, false, `${board.title} @ ${scale} entered primitive LOD below 801 candidates`);
        assert.ok(snapshot.mountedNodes > 0, `${board.title} @ ${scale} mounted no content`);
        assert.equal(snapshot.summaryNodes, 0, `${board.title} @ ${scale} rendered a summary shell`);
        assert.equal(snapshot.blankMountedNodes, 0, `${board.title} @ ${scale} has blank nodes`);
        assert.equal(snapshot.unloadedVisibleImages, 0, `${board.title} @ ${scale} has unloaded visible images`);
        assert.equal(
          snapshot.brokenImages,
          0,
          `${board.title} @ ${scale} has broken images: ${JSON.stringify(snapshot.brokenImageDetails)}`,
        );
        assert.deepEqual(snapshot.incompleteSemanticNodes, [], `${board.title} @ ${scale} has incomplete semantic nodes`);
        assert.equal(snapshot.primitiveBlankCards, 0, `${board.title} @ ${scale} has blank aggregate cards`);
        scales.push(snapshot);
      }
      const meta = await requestJson(port, `/api/canvas/boards/${encodeURIComponent(board.id)}/meta`);
      console.log(`old canvas diagnostic: ${JSON.stringify({
        id: board.id,
        title: board.title,
        sourceNodes: board.nodes.length,
        sourceConnections: Array.isArray(board.connections) ? board.connections.length : 0,
        metaStatus: meta.status,
        metaNodes: meta.data?.nodeCount,
        metaConnections: meta.data?.connectionCount,
        scans: scales.map((snapshot) => ({
          scale: snapshot.scale,
          mountedNodes: snapshot.mountedNodes,
          summaryNodes: snapshot.summaryNodes,
          mountedImages: snapshot.mountedImages,
          unloadedVisibleImages: snapshot.unloadedVisibleImages,
          imageStates: snapshot.imageStates,
          levels: snapshot.levels,
        })),
      })}`);
      assert.equal(meta.status, 200);
      assert.equal(meta.data.nodeCount, board.nodes.length);
      assert.equal(meta.data.connectionCount, Array.isArray(board.connections) ? board.connections.length : 0);
      assert.deepEqual(meta.data.viewport, board.viewport || { x: 0, y: 0, scale: 1 });
      results.push({
        id: String(board.id),
        title: String(board.title || ""),
        sourceNodes: board.nodes.length,
        sourceConnections: Array.isArray(board.connections) ? board.connections.length : 0,
        scans: scales,
      });
    }
    assert.deepEqual(pageErrors, [], `Historical canvas browser errors: ${pageErrors.join(" | ")}`);
    assert.deepEqual(canvasApiErrors, [], `Historical canvas API errors: ${JSON.stringify(canvasApiErrors)}`);
    const matrix = [];
    for (const board of selected) {
      await openBoard(page, board);
      const snapshots = [];
      for (const scale of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.6, 0.64, 0.65, 0.74, 1, 1.6]) {
        const snapshot = await setScale(page, scale);
        assert.equal(snapshot.primitiveLod, false, `${board.title} @ ${scale} incorrectly entered dense-scene mode`);
        assert.equal(snapshot.blankMountedNodes, 0, `${board.title} @ ${scale} has blank mounted nodes`);
        assert.equal(snapshot.unloadedVisibleImages, 0, `${board.title} @ ${scale} has unloaded visible images`);
        assert.equal(snapshot.primitiveBlankCards, 0, `${board.title} @ ${scale} has blank aggregate cards`);
        assert.equal(snapshot.summaryNodes, 0, `${board.title} @ ${scale} rendered a summary shell`);
        assert.equal(snapshot.mountedNodes, snapshot.fullNodes, `${board.title} @ ${scale} did not keep complete nodes`);
        assert.ok(snapshot.fullNodes > 0, `${board.title} @ ${scale} has no full-detail nodes`);
        assert.equal(
          snapshot.brokenImages,
          0,
          `${board.title} @ ${scale} has broken images: ${JSON.stringify(snapshot.brokenImageDetails)}`,
        );
        snapshots.push(snapshot);
      }
      matrix.push({ id: String(board.id), title: String(board.title || ""), snapshots });
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(canvasApiErrors, []);
    assert.equal(hashFile(legacyFile), copiedHash, "copied historical JSON changed during migration");
    assert.equal(hashFile(SOURCE_FILE), sourceHash, "original historical JSON changed during verification");
    assert.ok(fs.readdirSync(backupDirectory).filter((name) => name.includes(".bak-")).length >= allBoards.length);
    console.log(`Existing old canvas UI checks passed: ${JSON.stringify({ scannedBoards: results.length, matrixBoards: matrix.map((item) => item.title) })}`);
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
