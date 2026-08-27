const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { chromium } = require("playwright");
const {
  BOARD_ID,
  DATABASE_FILE,
  MANIFEST_FILE,
  PRESSURE_ROOT,
  removePressureRoot,
} = require("./generate-canvas-50000-fixture");

const ROOT = path.join(__dirname, "..");
const METRICS_FILE = path.join(PRESSURE_ROOT, "performance.json");

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestJson(port, pathname) {
  const startedAt = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let data;
        try { data = JSON.parse(body || "{}"); } catch { data = body; }
        resolve({
          status: response.statusCode,
          data,
          elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        });
      });
    });
    request.once("error", reject);
  });
}

async function waitForServer(port, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await requestJson(port, "/api/models");
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Canvas performance server did not start.\n${diagnostics.join("")}`);
}

async function openBoard(page) {
  await page.locator("#infiniteCanvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
  await page.locator("#canvasHistoryButton").click();
  await page.locator(`[data-board-id="${BOARD_ID}"]`).click({ timeout: 15_000 });
  await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction((boardId) => (
    typeof canvasState === "object"
      && canvasState.activeBoardId === boardId
      && (globalThis.canvasVirtualStore?.size > 0 || globalThis.canvasPagedStore?.scenePage)
  ), BOARD_ID, { timeout: 20_000 });
}

function readProcessRssMB(pid) {
  try {
    if (process.platform === "win32") {
      const value = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `(Get-Process -Id ${Number(pid)}).WorkingSet64`],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 },
      );
      return Number((Number(String(value).trim()) / 1024 / 1024).toFixed(2));
    }
    const status = fs.readFileSync(`/proc/${Number(pid)}/status`, "utf8");
    const kilobytes = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0);
    return Number((kilobytes / 1024).toFixed(2));
  } catch {
    return 0;
  }
}

async function measureOpen(page) {
  const startedAt = Date.now();
  await openBoard(page);
  const usableMs = Date.now() - startedAt;
  const visibility = await page.evaluate(async () => {
    const startedAt = performance.now();
    const waitUntil = (predicate, timeoutMs) => new Promise((resolve, reject) => {
      const deadline = performance.now() + timeoutMs;
      const check = () => {
        if (predicate()) return resolve(performance.now() - startedAt);
        if (performance.now() >= deadline) return reject(new Error("visibility timeout"));
        requestAnimationFrame(check);
      };
      check();
    });
    const textVisibleMs = await waitUntil(() => [...document.querySelectorAll("#canvasPlane .canvas-text")]
      .some((item) => item.textContent.trim()), 2_000);
    const thumbnailVisibleMs = await waitUntil(() => [...document.querySelectorAll("#canvasPlane img")]
      .some((item) => item.complete && item.naturalWidth > 0), 2_000);
    return { textVisibleMs, thumbnailVisibleMs };
  });
  return { usableMs, ...visibility };
}

async function scanScale(page, scale) {
  return page.evaluate(async (nextScale) => {
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
    const flush = canvasVirtualizer.flushNow();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")];
    const summaries = nodes.filter((node) => node.classList.contains("canvas-node-virtual-summary"));
    const scene = globalThis.canvasSceneLayer?.getDiagnostics?.() || {};
    const scheduler = globalThis.canvasMediaScheduler?.getDiagnostics?.() || {};
    const imageResources = globalThis.imageResources || {};
    return {
      scale: canvasState.scale,
      mode: canvasPagedStore.scenePage ? "scene" : "detail",
      candidateCount: Number(canvasPagedStore.scenePage?.candidateCount || nodes.length),
      residentModels: canvasVirtualStore.size,
      mountedNodes: nodes.length,
      fullNodes: nodes.length - summaries.length,
      summaryNodes: summaries.length,
      blankNodes: nodes.filter((node) => !(
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
      directOriginalPreviewIds: summaries.filter((node) => {
        const image = node.querySelector("img[data-original-src]");
        const source = image?.getAttribute("data-original-src") || "";
        return Boolean(
          image
          && source
          && !source.startsWith("data:")
          && !source.startsWith("blob:")
          && image.getAttribute("src") === source
        );
      }).map((node) => node.dataset.id),
      fullImageNodes: nodes.filter((node) => (
        !node.classList.contains("canvas-node-virtual-summary")
        && node.querySelector("img[data-canvas-original-src]")
      )).length,
      primitiveSemanticCards: Number(scene.aggregateCardCount || 0),
      primitiveBlankCards: Number(scene.aggregateCardCount || 0),
      sceneVisualNodes: Number(scene.visualNodeCount || 0),
      transitioned: Number(flush?.transitioned || 0),
      media: {
        queuedThumbnails: Number(scheduler.queuedThumbnails || 0),
        queuedOriginals: Number(scheduler.queuedOriginals || 0),
        runningThumbnails: Number(scheduler.runningThumbnails || 0),
        runningOriginals: Number(scheduler.runningOriginals || 0),
        resourceThumbnails: Number(imageResources.thumbnailActive || 0),
        resourceOriginals: Number(imageResources.originalActive || 0),
      },
    };
  }, scale);
}

async function scanDenseScene(page) {
  return page.evaluate(async () => {
    const viewport = document.querySelector("#infiniteCanvas");
    const scale = 0.12;
    const centerX = -1_997_500;
    const centerY = -1_997_500;
    canvasState.scale = scale;
    canvasState.x = (viewport?.clientWidth || 0) / 2 - centerX * scale;
    canvasState.y = (viewport?.clientHeight || 0) / 2 - centerY * scale;
    applyCanvasTransformNow();
    canvasViewportDataSource.lastFulfilled = null;
    const { mountRect } = canvasVirtualizer.getRects();
    await requestCanvasViewportPage({ ...mountRect, scale });
    canvasVirtualizer.flushNow();
    renderCanvasSceneLayer();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const page = canvasPagedStore.scenePage;
    const diagnostics = globalThis.canvasSceneLayer?.getDiagnostics?.() || {};
    const onscreen = (page?.visualNodes || []).find((node) => {
      const left = canvasState.x + Number(node[2]) * scale;
      const top = canvasState.y + Number(node[3]) * scale;
      const right = left + Number(node[4]) * scale;
      const bottom = top + Number(node[5]) * scale;
      return left < (viewport?.clientWidth || 0) && right > 0
        && top < (viewport?.clientHeight || 0) && bottom > 0;
    });
    const hit = onscreen ? globalThis.canvasSceneLayer?.hitTest?.(
      canvasState.x + (Number(onscreen[2]) + Number(onscreen[4]) / 2) * scale,
      canvasState.y + (Number(onscreen[3]) + Number(onscreen[5]) / 2) * scale,
    ) : null;
    return {
      mode: page?.mode || "",
      candidateCount: Number(page?.candidateCount || 0),
      visualNodeCount: Number(page?.visualNodes?.length || 0),
      titledNodeCount: Number(page?.visualNodes?.filter((node) => node[8]).length || 0),
      visualConnectionCount: Number(
        page?.visualConnectionCount
        || Math.floor(Number(page?.visualConnections?.length || 0) / 4),
      ),
      renderedConnectionCount: Number(diagnostics.connectionCount || 0),
      aggregateCardCount: Number(diagnostics.aggregateCardCount || 0),
      blankNodeCount: Number(diagnostics.blankNodeCount || 0),
      hitNodeId: String(hit?.id || ""),
      mountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
    };
  });
}

async function runPerformanceCheck() {
  assert.equal(fs.existsSync(MANIFEST_FILE), true, "Generate the 50,000-node fixture before the UI check.");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  assert.equal(manifest.boardId, BOARD_ID);
  assert.equal(fs.existsSync(DATABASE_FILE), true);
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
      CANVAS_DB_FILE: DATABASE_FILE,
      CANVAS_LEGACY_FILE: path.join(PRESSURE_ROOT, "no-legacy-canvas.json"),
      CANVAS_BACKUP_DIR: path.join(PRESSURE_ROOT, "backups"),
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  let browser;
  let succeeded = false;
  try {
    await waitForServer(port, diagnostics);
    const viewportSamples = [];
    const queryPaths = [
      `/api/canvas/boards/${BOARD_ID}/viewport?left=-4000&top=-2200&right=4000&bottom=2200&scale=1&nodeLimit=800&connectionLimit=1200`,
      `/api/canvas/boards/${BOARD_ID}/viewport?left=1999000&top=1999000&right=2002000&bottom=2002000&scale=0.2&nodeLimit=800&connectionLimit=1200`,
      `/api/canvas/boards/${BOARD_ID}/viewport?left=-2001000&top=-2001000&right=-1994000&bottom=-1994000&scale=0.12&nodeLimit=800&connectionLimit=1200`,
      `/api/canvas/boards/${BOARD_ID}/viewport?left=999999000&top=999999000&right=1000001000&bottom=1000001000&scale=1&nodeLimit=800&connectionLimit=1200`,
    ];
    for (let index = 0; index < 64; index += 1) {
      const response = await requestJson(port, queryPaths[index % queryPaths.length]);
      assert.equal(response.status, 200);
      assert.equal(response.data.engineVersion, "canvas-visual-fidelity-v2");
      assert.equal(Object.hasOwn(response.data, "lodNodes"), false);
      if (Number(response.data.candidateCount || 0) > 800) {
        assert.equal(response.data.mode, "scene");
        assert.ok(response.data.visualNodes.length > 0);
        assert.ok(response.data.visualNodes.length <= response.data.candidateCount);
        assert.equal(response.data.visualNodes.some((node) => node.aggregate === true), false);
      } else {
        assert.equal(response.data.mode, "detail");
      }
      viewportSamples.push(response.elapsedMs);
    }
    const farResponse = await requestJson(
      port,
      `/api/canvas/boards/${BOARD_ID}/viewport?left=999999900&top=999999900&right=1000000500&bottom=1000000500&scale=1&nodeLimit=800&connectionLimit=1200`,
    );
    assert.equal(farResponse.status, 200);
    assert.ok(farResponse.data.nodes.some((node) => node.id === "node-49999"));
    assert.deepEqual(
      farResponse.data.nodes.find((node) => node.id === "node-49999").futureField,
      { preserved: true, version: 50_000 },
    );

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH
        || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      globalThis.__canvasLongTasks = [];
      try {
        new PerformanceObserver((list) => {
          globalThis.__canvasLongTasks.push(...list.getEntries().map((entry) => entry.duration));
        }).observe({ type: "longtask", buffered: true });
      } catch {}
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      if (/favicon\.ico/.test(String(location.url || ""))) return;
      pageErrors.push(`console: ${message.text()}`);
    });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle", timeout: 30_000 });
    const cold = await measureOpen(page);
    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    const warm = await measureOpen(page);

    const zoomMatrix = [];
    for (const scale of [0.05, 0.09, 0.25, 0.55, 0.64, 0.65, 0.74, 1, 1.6]) {
      const snapshot = await scanScale(page, scale);
      assert.ok(snapshot.mountedNodes <= 800, JSON.stringify(snapshot));
      assert.ok(snapshot.residentModels <= 800, JSON.stringify(snapshot));
      assert.equal(snapshot.blankNodes, 0, JSON.stringify(snapshot));
      assert.equal(snapshot.primitiveBlankCards, 0, JSON.stringify(snapshot));
      assert.equal(snapshot.summaryNodes, 0, JSON.stringify(snapshot));
      assert.deepEqual(snapshot.incompleteSemanticNodes, [], JSON.stringify(snapshot));
      assert.deepEqual(snapshot.directOriginalPreviewIds, [], JSON.stringify(snapshot));
      assert.ok(snapshot.transitioned <= 80, JSON.stringify(snapshot));
      assert.ok(snapshot.media.runningThumbnails <= 6, JSON.stringify(snapshot));
      assert.ok(snapshot.media.runningOriginals <= 2, JSON.stringify(snapshot));
      assert.ok(snapshot.media.resourceThumbnails <= 1, JSON.stringify(snapshot));
      assert.ok(snapshot.media.resourceOriginals <= 2, JSON.stringify(snapshot));
      if (snapshot.mode === "scene") assert.ok(snapshot.sceneVisualNodes > 0, JSON.stringify(snapshot));
      else assert.ok(snapshot.fullNodes > 0, JSON.stringify(snapshot));
      zoomMatrix.push(snapshot);
    }
    assert.ok(
      zoomMatrix.filter((snapshot) => snapshot.scale >= 0.65)
        .some((snapshot) => snapshot.fullImageNodes > 0),
      JSON.stringify(zoomMatrix),
    );
    const denseScene = await scanDenseScene(page);
    assert.equal(denseScene.mode, "scene", JSON.stringify(denseScene));
    assert.ok(denseScene.candidateCount > 800, JSON.stringify(denseScene));
    assert.ok(denseScene.visualNodeCount > 0, JSON.stringify(denseScene));
    assert.equal(denseScene.titledNodeCount, denseScene.visualNodeCount, JSON.stringify(denseScene));
    assert.ok(denseScene.visualConnectionCount > 0, JSON.stringify(denseScene));
    assert.equal(denseScene.renderedConnectionCount, denseScene.visualConnectionCount, JSON.stringify(denseScene));
    assert.equal(denseScene.aggregateCardCount, 0, JSON.stringify(denseScene));
    assert.equal(denseScene.blankNodeCount, 0, JSON.stringify(denseScene));
    assert.ok(denseScene.hitNodeId, JSON.stringify(denseScene));
    assert.ok(denseScene.mountedNodes <= 800, JSON.stringify(denseScene));

    const interaction = await page.evaluate(async () => {
      const frameDurations = [];
      const inputResponses = [];
      globalThis.__canvasLongTasks = [];
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let previous = performance.now();
      for (let index = 0; index < 120; index += 1) {
        const inputStartedAt = performance.now();
        canvasState.x += index % 2 === 0 ? 3 : -2;
        canvasState.y += index % 3 === 0 ? 2 : -1;
        applyCanvasTransformNow();
        inputResponses.push(performance.now() - inputStartedAt);
        await new Promise((resolve) => requestAnimationFrame((timestamp) => {
          frameDurations.push(timestamp - previous);
          previous = timestamp;
          resolve();
        }));
      }
      const firstRequest = canvasViewportDataSource.request({
        left: 999_999_900, top: 999_999_900, right: 1_000_000_500, bottom: 1_000_000_500, scale: 1,
      });
      const secondRequest = canvasViewportDataSource.request({
        left: -4_000, top: -2_200, right: 4_000, bottom: 2_200, scale: 1,
      });
      await Promise.allSettled([firstRequest, secondRequest]);
      canvasVirtualizer.flushNow();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")];
      const blankNodeCount = nodes.filter((node) => {
        const hasContent = node.textContent.trim()
          || node.querySelector("img,canvas,video,audio,input,textarea,select,button");
        return !hasContent;
      }).length;
      return {
        frameDurations,
        inputResponses,
        detailedDomNodes: nodes.length,
        totalCanvasDom: document.querySelector("#infiniteCanvas")?.querySelectorAll("*").length || 0,
        canvasHeapMB: Number(((performance.memory?.usedJSHeapSize || 0) / 1024 / 1024).toFixed(2)),
        blankNodeCount,
        longestInteractionTaskMs: Math.max(0, ...(globalThis.__canvasLongTasks || [])),
        residentModels: canvasVirtualStore.size,
        activeGeneration: String(canvasPagedStore.activeGeneration || ""),
        requestGeneration: String(canvasViewportDataSource.generation || ""),
      };
    });
    assert.equal(interaction.activeGeneration, interaction.requestGeneration, "stale viewport response became active");
    const metrics = {
      ...manifest,
      coldUsableMs: cold.usableMs,
      warmUsableMs: warm.usableMs,
      viewportP95Ms: percentile(viewportSamples, 0.95),
      viewportP99Ms: percentile(viewportSamples, 0.99),
      panP95Ms: percentile(interaction.frameDurations, 0.95),
      panP99Ms: percentile(interaction.frameDurations, 0.99),
      inputResponseP95Ms: percentile(interaction.inputResponses, 0.95),
      longestInteractionTaskMs: Number(interaction.longestInteractionTaskMs.toFixed(2)),
      detailedDomNodes: interaction.detailedDomNodes,
      totalCanvasDom: interaction.totalCanvasDom,
      canvasHeapMB: interaction.canvasHeapMB,
      serverCanvasRssMB: readProcessRssMB(child.pid),
      textVisibleMs: Number(cold.textVisibleMs.toFixed(2)),
      thumbnailVisibleMs: Number(cold.thumbnailVisibleMs.toFixed(2)),
      blankNodeCount: interaction.blankNodeCount,
      residentModels: interaction.residentModels,
      denseScene,
      zoomMatrix,
      pageErrors,
    };
    assert.ok(metrics.coldUsableMs <= 2_000, JSON.stringify(metrics));
    assert.ok(metrics.warmUsableMs <= 1_000, JSON.stringify(metrics));
    assert.ok(metrics.viewportP95Ms <= 100, JSON.stringify(metrics));
    assert.ok(metrics.panP95Ms <= 20, JSON.stringify(metrics));
    assert.ok(metrics.panP99Ms <= 50, JSON.stringify(metrics));
    assert.ok(metrics.longestInteractionTaskMs <= 100, JSON.stringify(metrics));
    assert.ok(metrics.detailedDomNodes <= 800, JSON.stringify(metrics));
    assert.ok(metrics.totalCanvasDom <= 1_200, JSON.stringify(metrics));
    assert.ok(metrics.canvasHeapMB === 0 || metrics.canvasHeapMB <= 350, JSON.stringify(metrics));
    assert.ok(metrics.serverCanvasRssMB === 0 || metrics.serverCanvasRssMB <= 250, JSON.stringify(metrics));
    assert.ok(metrics.textVisibleMs <= 300, JSON.stringify(metrics));
    assert.ok(metrics.thumbnailVisibleMs <= 800, JSON.stringify(metrics));
    assert.equal(metrics.blankNodeCount, 0, JSON.stringify(metrics));
    assert.deepEqual(metrics.pageErrors, [], JSON.stringify(metrics));
    fs.writeFileSync(METRICS_FILE, `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(`Canvas 50,000 performance checks passed: ${JSON.stringify(metrics)}`);
    succeeded = true;
    return metrics;
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    if (!succeeded) removePressureRoot();
  }
}

if (require.main === module) {
  runPerformanceCheck().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { METRICS_FILE, percentile, runPerformanceCheck };
