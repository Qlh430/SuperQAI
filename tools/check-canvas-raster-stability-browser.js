"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
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

let BASE_URL = process.env.AI_OS_TEST_BASE_URL || "";

(async () => {
  let server;
  let dataDir;
  let serverOutput = "";
  if (!BASE_URL) {
    const probe = http.createServer();
    await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-raster-stability-"));
    BASE_URL = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
      cwd: path.resolve(__dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_DATA_DIR: dataDir, CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false" },
    });
    server.stdout.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-4000); });
    server.stderr.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-4000); });
  }
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  let browser;
  try {
    if (server) {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (server.exitCode !== null) break;
        try { if ((await fetch(`${BASE_URL}/`)).ok) { ready = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, `The isolated canvas test server must start. ${serverOutput}`);
    }
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (server) {
      const account = { username: "raster-test", displayName: "Raster test", password: "isolated-raster-test-password" };
      assert.ok((await page.request.post(`${BASE_URL}/api/auth/bootstrap`, { data: account })).ok());
      assert.ok((await page.request.post(`${BASE_URL}/api/auth/login`, { data: account })).ok());
    }
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    const result = await page.evaluate(async () => {
      const plane = document.querySelector("#canvasPlane");
      if (!plane) throw new Error("Canvas plane is missing.");
      const changes = [];
      applyCanvasTransformNow();
      beginCanvasRasterInteraction();
      canvasDetailReady = true;
      const observer = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.attributeName === "style") changes.push({ willChange: getComputedStyle(plane).willChange, transform: plane.style.transform });
        });
      });
      observer.observe(plane, { attributes: true, attributeFilter: ["style"] });
      scheduleCanvasRasterRefresh("browser-stability-contract");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      observer.disconnect();
      return {
        changes,
        finalWillChange: getComputedStyle(plane).willChange,
        state: plane.dataset.rasterState,
        reason: plane.dataset.rasterRefreshReason,
        epoch: Number(plane.dataset.rasterRefreshEpoch || 0),
      };
    });

    assert.equal(result.state, "ready", "the settled refresh must complete");
    assert.equal(result.reason, "browser-stability-contract");
    assert.ok(result.epoch >= 1, "the refresh epoch must advance");
    assert.match(result.finalWillChange, /transform/);
    assert.equal(
      result.changes.some((value) => !/translateZ\(0(?:px)?\)/.test(value.transform)),
      false,
      `the canvas compositor layer was dropped during an idle refresh: ${JSON.stringify(result.changes)}`,
    );

    assert.ok(result.changes.some((value) => value.willChange === "auto"), "idle refresh must release the stale raster for a painted frame");
    await page.locator('[data-ai-app="canvas"]').click();
    await page.evaluate(() => {
      document.querySelector("#canvasLibraryScreen").hidden = true;
      document.querySelector("#canvasEditorScreen").hidden = false;
      const plane = document.querySelector("#canvasPlane");
      window.__canvasGestureWillChange = [];
      window.__canvasGestureObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.attributeName === "style") {
            window.__canvasGestureWillChange.push({ willChange: getComputedStyle(plane).willChange, transform: plane.style.transform });
          }
        });
      });
      window.__canvasGestureObserver.observe(plane, { attributes: true, attributeFilter: ["style"] });
    });
    const viewport = await page.locator("#infiniteCanvas").boundingBox();
    assert.ok(viewport, "the canvas viewport must be visible for the gesture check");
    const centerX = viewport.x + viewport.width / 2;
    const centerY = viewport.y + viewport.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 80, centerY + 32, { steps: 6 });
    await page.mouse.up();
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(700);
    const gestureChanges = await page.evaluate(() => {
      window.__canvasGestureObserver?.disconnect();
      return window.__canvasGestureWillChange || [];
    });
    assert.equal(
      gestureChanges.some((value) => !/translateZ\(0(?:px)?\)/.test(value.transform)),
      false,
      `real pan/zoom gestures dropped the canvas compositor layer: ${JSON.stringify(gestureChanges)}`,
    );

    const sceneToDetail = await page.evaluate(async () => {
      clearCanvasPlane();
      canvasState.activeBoardId = "render-continuity-fixture";
      canvasState.activeBoardTitle = "Render continuity fixture";
      canvasState.activeBoardPersisted = true;
      canvasState.x = 0;
      canvasState.y = 0;
      canvasState.scale = 1;
      canvasVirtualBoard = {
        id: canvasState.activeBoardId,
        title: canvasState.activeBoardTitle,
        viewport: { x: 0, y: 0, scale: 1 },
      };
      canvasVirtualRestoreContext = { maxId: 0, legacyResults: [], migratedLegacyCount: 0 };
      setCanvasAppScreen("editor");
      applyCanvasTransformNow();

      const bounds = { left: -200, top: -200, right: 1200, bottom: 900 };
      canvasPagedStore.applyViewportPage({
        mode: "scene",
        generation: "1",
        boardRevision: 1,
        bounds,
        truncated: true,
        visualNodes: [["continuity-node", "text", 80, 80, 280, 180, 1, "", "场景层"]],
        visualConnections: [],
        texturedNodeIds: [],
      });
      renderCanvasSceneLayer();
      canvasVirtualizer.flushNow();

      const sample = () => ({
        sceneVisible: document.querySelector("#infiniteCanvas")?.classList.contains("has-scene-layer") || false,
        mountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
      });
      const before = sample();
      const originalRequest = canvasViewportDataSource.request;
      canvasViewportDataSource.request = async () => {
        const detailPage = {
          mode: "detail",
          generation: "2",
          boardRevision: 1,
          bounds,
          truncated: false,
          nodes: [{
            id: "continuity-node",
            kind: "text",
            x: 80,
            y: 80,
            width: 280,
            height: 180,
            text: "编辑节点",
          }],
          connections: [],
        };
        canvasPagedStore.applyViewportPage(detailPage);
        return detailPage;
      };
      try {
        await requestCanvasViewportPage(bounds);
        const immediate = sample();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const nextFrame = sample();
        return { before, immediate, nextFrame };
      } finally {
        canvasViewportDataSource.request = originalRequest;
      }
    });
    assert.equal(sceneToDetail.before.sceneVisible, true, "the scene fixture must be visible before switching modes");
    assert.equal(sceneToDetail.before.mountedNodes, 0, "scene mode must not keep duplicate DOM nodes");
    assert.equal(
      sceneToDetail.immediate.sceneVisible || sceneToDetail.immediate.mountedNodes > 0,
      true,
      `scene-to-detail switching exposed a blank frame: ${JSON.stringify(sceneToDetail)}`,
    );
    assert.ok(sceneToDetail.nextFrame.mountedNodes > 0, "the editable node must mount after switching to detail mode");

    const overlayContinuity = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node");
      const plane = document.querySelector("#canvasPlane");
      if (!node || !plane) throw new Error("The continuity fixture did not leave a mounted node.");
      const img = document.createElement("img");
      const source = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      img.src = source;
      img.setAttribute("data-original-src", source);
      img.setAttribute("data-canvas-original-src", source);
      img.dataset.imageQuality = "original";
      img.dataset.requestedQuality = "original";
      node.append(img);
      plane.style.willChange = "transform";

      setActiveTool("image");
      const whileOverlayOpen = {
        hasSource: img.hasAttribute("src"),
        willChange: getComputedStyle(plane).willChange,
      };
      setActiveTool("canvas");
      const immediatelyAfterClose = {
        hasSource: img.hasAttribute("src"),
        willChange: getComputedStyle(plane).willChange,
      };
      return { whileOverlayOpen, immediatelyAfterClose };
    });
    assert.equal(
      overlayContinuity.whileOverlayOpen.hasSource,
      true,
      `opening a translucent tool overlay discarded the canvas image: ${JSON.stringify(overlayContinuity)}`,
    );
    assert.equal(
      overlayContinuity.immediatelyAfterClose.hasSource,
      true,
      `closing a tool overlay exposed an empty image frame: ${JSON.stringify(overlayContinuity)}`,
    );
    assert.match(overlayContinuity.whileOverlayOpen.willChange, /transform/);
    assert.match(overlayContinuity.immediatelyAfterClose.willChange, /transform/);

    const gridContinuity = await page.evaluate(() => {
      const viewport = document.querySelector("#infiniteCanvas");
      canvasState.scale = 0.151;
      applyCanvasTransformNow();
      const aboveThreshold = getComputedStyle(viewport).backgroundImage;
      canvasState.scale = 0.149;
      applyCanvasTransformNow();
      const belowThreshold = getComputedStyle(viewport).backgroundImage;
      return { aboveThreshold, belowThreshold };
    });
    assert.notEqual(gridContinuity.aboveThreshold, "none", "the grid fixture must be visible above 15% zoom");
    assert.notEqual(
      gridContinuity.belowThreshold,
      "none",
      `crossing 15% zoom removed the entire canvas background: ${JSON.stringify(gridContinuity)}`,
    );

    const lowZoomConnectionVisibility = await page.evaluate(async () => {
      canvasState.scale = 0.149;
      canvasState.x += 8;
      scheduleCanvasTransform();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return getComputedStyle(document.querySelector("#canvasConnections")).visibility;
    });
    assert.notEqual(
      lowZoomConnectionVisibility,
      "hidden",
      "low-zoom panning hid every existing connection and made the graph blink",
    );
    if (server) await require("./check-canvas-motion-regressions")(page);
    if (server) await require("./check-canvas-node-front-browser")(page);
    assert.deepEqual(errors, [], "Canvas interaction must not throw page errors.");
    console.log("Canvas raster stability browser checks passed.");
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await exited;
    }
    if (dataDir && path.resolve(dataDir).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
