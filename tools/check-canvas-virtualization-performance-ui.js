const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const APP_URL = process.env.CANVAS_VIRTUAL_APP_URL || "http://127.0.0.1:3099";
const NODE_COUNT = 3000;
const IMAGE_COUNT = 1500;
const PIXEL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%236d5dfc'/%3E%3C/svg%3E";

function createStressBoard() {
  const columns = 60;
  const nodes = Array.from({ length: NODE_COUNT }, (_, index) => {
    const common = {
      id: String(index + 1),
      x: (index % columns) * 420,
      y: Math.floor(index / columns) * 320,
      width: index % 2 ? 292 : 320,
      height: 240,
    };
    return index % 2 === 0
      ? { ...common, kind: "image", uploadOnly: true, imageSrc: PIXEL, imageName: `stress-${index + 1}.svg` }
      : { ...common, kind: "text", text: `stress text ${index + 1}` };
  });
  return {
    id: "virtual-stress-3000",
    title: "Virtual stress 3000",
    createdAt: "2026-08-25T00:00:00.000Z",
    viewport: { x: 80, y: 60, scale: 1 },
    nodes,
    connections: Array.from({ length: NODE_COUNT - 1 }, (_, index) => ({
      from: String(index + 1),
      to: String(index + 2),
    })),
  };
}

(async () => {
  const board = createStressBoard();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--enable-precise-memory-info"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__virtualStressLongTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__virtualStressLongTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  });
  await page.route("**/api/canvas/boards", async (route) => {
    const payload = { boards: [board], trash: [], board };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#infiniteCanvas").waitFor({ state: "visible" });
    await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
    await page.locator("#canvasHistoryButton").click();
    const startedAt = Date.now();
    await page.locator('[data-board-id="virtual-stress-3000"]').click({ timeout: 5000 });
    await page.waitForFunction((count) => window.canvasVirtualStore?.size === count, NODE_COUNT, { timeout: 30_000 });
    await page.locator("#canvasPlane .canvas-node").first().waitFor({ state: "visible", timeout: 5000 });
    const firstVisibleMs = Date.now() - startedAt;
    await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
    await page.waitForTimeout(250);

    const metrics = await page.evaluate(async ({ nodeCount, imageCount, firstVisibleMsValue }) => {
      const time = (callback) => {
        const started = performance.now();
        const value = callback();
        return { duration: performance.now() - started, value };
      };
      const connectionRender = time(() => renderCanvasConnections());
      const serialization = time(() => serializeCanvasBoard());
      const panFrames = [];
      for (let index = 0; index < 90; index += 1) {
        const started = performance.now();
        canvasState.x += 5;
        scheduleCanvasTransform();
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        panFrames.push(performance.now() - started);
      }

      const farImageModel = canvasVirtualStore.get(String(nodeCount - 1));
      const farTextModel = canvasVirtualStore.get(String(nodeCount));
      canvasState.x = 120 - Number(farImageModel.x) * canvasState.scale;
      canvasState.y = 120 - Number(farImageModel.y) * canvasState.scale;
      applyCanvasTransformNow();
      canvasVirtualizer.flushNow();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      updateCanvasImageQualities();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const farImageNode = canvasVirtualStore.getMounted(String(nodeCount - 1));
      const farTextNode = canvasVirtualStore.getMounted(String(nodeCount));
      const farImage = farImageNode?.querySelector("img");
      const farText = farTextNode?.querySelector(".canvas-text");
      const farImageHasSrc = Boolean(farImage?.getAttribute("src"));
      const farTextContent = farText?.textContent || "";
      const saved = serialization.value;
      const normalMountedNodes = document.querySelectorAll("#canvasPlane .canvas-node").length;
      const normalCanvasDomElements = document.querySelectorAll("#canvasPlane *").length;
      const normalMountedImages = document.querySelectorAll("#canvasPlane img").length;
      const normalVisibleConnections = document.querySelectorAll("#canvasConnections .canvas-connection-path:not(.canvas-connection-temp)").length;

      canvasState.scale = 0.05;
      canvasState.x = 80;
      canvasState.y = 60;
      scheduleCanvasTransform();
      for (let index = 0; index < 45; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }
      const zoomOutConnectionRender = time(() => renderCanvasConnections());
      const zoomOutVirtualizerFlush = time(() => canvasVirtualizer.flushNow());
      const zoomOutImageQuality = time(() => updateCanvasImageQualities());
      const zoomOutTransformApply = time(() => applyCanvasTransformNow());
      const zoomOutPanFrames = [];
      for (let index = 0; index < 60; index += 1) {
        const started = performance.now();
        canvasState.x += 2;
        scheduleCanvasTransform();
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        zoomOutPanFrames.push(performance.now() - started);
      }
      zoomOutPanFrames.sort((a, b) => a - b);
      const zoomOutPercentile = (ratio) => zoomOutPanFrames[Math.min(
        zoomOutPanFrames.length - 1,
        Math.floor(zoomOutPanFrames.length * ratio),
      )] || 0;
      panFrames.sort((a, b) => a - b);
      const percentile = (ratio) => panFrames[Math.min(panFrames.length - 1, Math.floor(panFrames.length * ratio))] || 0;
      return {
        expectedNodes: nodeCount,
        expectedImages: imageCount,
        firstVisibleMs: firstVisibleMsValue,
        modelNodes: canvasVirtualStore.size,
        mountedNodes: normalMountedNodes,
        canvasDomElements: normalCanvasDomElements,
        mountedImages: normalMountedImages,
        visibleConnections: normalVisibleConnections,
        connectionRenderMs: connectionRender.duration,
        serializeMs: serialization.duration,
        serializedNodes: saved.nodes.length,
        serializedConnections: saved.connections.length,
        panP50Ms: percentile(0.5),
        panP95Ms: percentile(0.95),
        panMaxMs: Math.max(...panFrames),
        farImageMounted: Boolean(farImageNode),
        farImageHasSrc,
        farTextMounted: Boolean(farTextNode),
        farTextContent,
        zoomOutMountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
        zoomOutStoreMountedNodes: canvasVirtualStore.mountedSize,
        zoomOutCanvasDomElements: document.querySelectorAll("#canvasPlane *").length,
        zoomOutVisibleConnections: document.querySelectorAll("#canvasConnections .canvas-connection-path:not(.canvas-connection-temp)").length,
        zoomOutConnectionRenderMs: zoomOutConnectionRender.duration,
        zoomOutVirtualizerFlushMs: zoomOutVirtualizerFlush.duration,
        zoomOutImageQualityMs: zoomOutImageQuality.duration,
        zoomOutTransformApplyMs: zoomOutTransformApply.duration,
        zoomOutPanP95Ms: zoomOutPercentile(0.95),
        zoomOutPanMaxMs: Math.max(...zoomOutPanFrames),
        longestTaskMs: Math.max(0, ...window.__virtualStressLongTasks),
        heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null,
      };
    }, { nodeCount: NODE_COUNT, imageCount: IMAGE_COUNT, firstVisibleMsValue: firstVisibleMs });

    console.log(JSON.stringify(metrics, null, 2));
    assert.equal(metrics.modelNodes, NODE_COUNT);
    assert.ok(metrics.mountedNodes <= 220, `mounted node cap exceeded: ${metrics.mountedNodes}`);
    assert.equal(metrics.serializedNodes, NODE_COUNT);
    assert.equal(metrics.serializedConnections, NODE_COUNT - 1);
    assert.ok(metrics.visibleConnections > 0, "visible connections were not painted");
    assert.ok(metrics.firstVisibleMs <= 1000, `first visible content took ${metrics.firstVisibleMs}ms`);
    assert.ok(metrics.connectionRenderMs < 16, `visible connection render took ${metrics.connectionRenderMs.toFixed(2)}ms`);
    assert.ok(metrics.panP95Ms <= 20, `pan P95 took ${metrics.panP95Ms.toFixed(2)}ms`);
    assert.ok(metrics.zoomOutMountedNodes <= 800, `zoomed-out node cap exceeded: ${metrics.zoomOutMountedNodes}`);
    assert.ok(metrics.zoomOutVisibleConnections <= 400, `zoomed-out connection cap exceeded: ${metrics.zoomOutVisibleConnections}`);
    assert.ok(metrics.zoomOutCanvasDomElements <= 2500, `zoomed-out DOM cap exceeded: ${metrics.zoomOutCanvasDomElements}`);
    assert.ok(metrics.zoomOutConnectionRenderMs < 16, `zoomed-out connection render took ${metrics.zoomOutConnectionRenderMs.toFixed(2)}ms`);
    assert.ok(metrics.zoomOutPanP95Ms <= 20, `zoomed-out pan P95 took ${metrics.zoomOutPanP95Ms.toFixed(2)}ms`);
    assert.equal(metrics.farImageMounted, true);
    assert.equal(metrics.farImageHasSrc, true);
    assert.equal(metrics.farTextMounted, true);
    assert.equal(metrics.farTextContent, `stress text ${NODE_COUNT}`);
    assert.deepEqual(errors, []);
    console.log("Canvas virtualization 3000-node performance checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
