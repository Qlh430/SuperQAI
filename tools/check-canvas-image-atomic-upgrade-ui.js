const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BOARD_ID = "atomic-image-upgrade-board";
const NODE_ID = "atomic-image-upgrade-node";
const ORIGINAL_PATH = "/__atomic-upgrade-original.svg";
const FAIL_PATH = "/__atomic-upgrade-fail.svg";
const CANCEL_PATH = "/__atomic-upgrade-cancel.svg";
const ORIGINAL_A_PATH = "/__atomic-upgrade-original-a.svg";
const ORIGINAL_B_PATH = "/__atomic-upgrade-original-b.svg";
const THUMBNAIL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23006cff'/%3E%3C/svg%3E";

function svg(size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestStatus(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.once("error", reject);
  });
}

async function waitForServer(port, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if (await requestStatus(port, "/api/models") === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Atomic image test server did not start.\n${diagnostics.join("")}`);
}

function createBoard() {
  return {
    id: BOARD_ID,
    title: "Atomic image upgrade",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    viewport: { x: 440, y: 240, scale: 0.55 },
    nodes: [{
      id: NODE_ID,
      kind: "image",
      uploadOnly: true,
      imageSrc: ORIGINAL_PATH,
      imageName: "atomic-upgrade.svg",
      x: 0,
      y: 0,
      width: 420,
      height: 420,
    }],
    connections: [],
  };
}

async function installImageRoutes(page) {
  await page.route("**/api/image-thumbnails?**", async (route) => {
    const source = new URL(route.request().url()).searchParams.get("source") || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ item: { source, thumbnailUrl: THUMBNAIL, width: 1600, height: 1600 } }),
    });
  });
  const routes = [
    [ORIGINAL_PATH, 500, 1600, "#e53e3e", 200],
    [FAIL_PATH, 500, 0, "", 503],
    [CANCEL_PATH, 800, 1400, "#805ad5", 200],
    [ORIGINAL_A_PATH, 800, 1200, "#dd6b20", 200],
    [ORIGINAL_B_PATH, 120, 1800, "#38a169", 200],
  ];
  for (const [pathname, delay, size, color, status] of routes) {
    await page.route(`**${pathname}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (status !== 200) {
        await route.fulfill({ status, contentType: "text/plain", body: "original unavailable" });
        return;
      }
      await route.fulfill({ status, contentType: "image/svg+xml", body: svg(size, color) });
    });
  }
}

async function openBoard(page, boardId) {
  await page.locator("#infiniteCanvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
  await page.locator("#canvasHistoryButton").click();
  await page.locator(`[data-board-id="${boardId}"]`).click({ timeout: 15_000 });
  await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction((id) => (
    typeof canvasState === "object"
    && String(canvasState.activeBoardId || "") === String(id)
    && (typeof canvasVirtualStore === "object" ? canvasVirtualStore.size : 0) > 0
  ), boardId, { timeout: 30_000 });
}

async function centerNodeAtScale(page, nodeId, scale) {
  await page.evaluate(async ({ id, nextScale }) => {
    const viewport = document.querySelector("#infiniteCanvas");
    const model = typeof canvasVirtualStore === "object" ? canvasVirtualStore.get(id) : null;
    if (!viewport || !model) throw new Error(`Canvas node is unavailable: ${id}`);
    const width = Number(model.width || 420);
    const height = Number(model.height || 420);
    canvasState.scale = nextScale;
    canvasState.x = viewport.clientWidth / 2 - (Number(model.x || 0) + width / 2) * nextScale;
    canvasState.y = viewport.clientHeight / 2 - (Number(model.y || 0) + height / 2) * nextScale;
    applyCanvasTransformNow();
    canvasVirtualizer.flushNow();
    scheduleCanvasImageQualityUpdate();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { id: nodeId, nextScale: scale });
}

async function waitForThumbnail(page, nodeId) {
  await page.waitForFunction((id) => {
    const img = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"] img[data-canvas-original-src]`);
    return Boolean(img?.hasAttribute("src") && img.dataset.imageQuality === "thumbnail" && img.naturalWidth > 0);
  }, nodeId, { timeout: 15_000 });
}

async function sampleUpgrade(page, { nodeId = NODE_ID, duration = 1_500, start }) {
  return page.evaluate(async ({ id, waitMs, startSource }) => {
    const current = () => document.querySelector(
      `#canvasPlane .canvas-node[data-id="${id}"] img[data-canvas-original-src]`,
    );
    const samples = [];
    const observerRecords = [];
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes") {
          observerRecords.push({ attribute: record.attributeName, value: record.target.getAttribute(record.attributeName) });
        }
      });
    });
    const initial = current();
    if (initial) observer.observe(initial, { attributes: true, attributeFilter: ["src", "data-image-quality", "data-requested-quality"] });
    const timer = setInterval(() => {
      const img = current();
      samples.push({
        mounted: Boolean(img),
        hasSrc: Boolean(img?.hasAttribute("src")),
        src: img?.getAttribute("src") || "",
        quality: img?.dataset.imageQuality || "",
        requestedQuality: img?.dataset.requestedQuality || "",
        naturalWidth: Number(img?.naturalWidth || 0),
      });
    }, 10);
    if (startSource === "zoom") {
      const viewport = document.querySelector("#infiniteCanvas");
      const node = current()?.closest(".canvas-node");
      const nodeX = Number(node?.dataset.x || 0);
      const nodeY = Number(node?.dataset.y || 0);
      const width = Number(node?.dataset.renderedWidth || node?.dataset.width || 420);
      const height = Number(node?.dataset.renderedHeight || node?.dataset.height || 420);
      canvasState.scale = 2.17;
      canvasState.x = viewport.clientWidth / 2 - (nodeX + width / 2) * canvasState.scale;
      canvasState.y = viewport.clientHeight / 2 - (nodeY + height / 2) * canvasState.scale;
      scheduleCanvasTransform();
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    clearInterval(timer);
    observer.disconnect();
    const final = current();
    return {
      samples,
      observerRecords,
      emptySamples: samples.filter((item) => item.mounted && !item.hasSrc).length,
      finalQuality: final?.dataset.imageQuality || "",
      finalRequestedQuality: final?.dataset.requestedQuality || "",
      finalSrc: final?.getAttribute("src") || "",
      finalNaturalWidth: Number(final?.naturalWidth || 0),
    };
  }, { id: nodeId, waitMs: duration, startSource: start });
}

async function resetVisibleThumbnail(page, source) {
  await page.evaluate(({ id, nextSource, thumbnail }) => {
    const img = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"] img[data-canvas-original-src]`);
    if (!img) throw new Error("Atomic image node is not mounted.");
    img.setAttribute("data-original-src", nextSource);
    img.setAttribute("data-canvas-original-src", nextSource);
    img.src = thumbnail;
    img.dataset.imageQuality = "thumbnail";
    img.dataset.requestedQuality = "thumbnail";
    delete img.dataset.fallbackStage;
  }, { id: NODE_ID, nextSource: source, thumbnail: THUMBNAIL });
  await waitForThumbnail(page, NODE_ID);
}

async function runControlled(page, appUrl) {
  await installImageRoutes(page);
  await page.goto(appUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await openBoard(page, BOARD_ID);
  await centerNodeAtScale(page, NODE_ID, 0.55);
  await waitForThumbnail(page, NODE_ID);

  const upgraded = await sampleUpgrade(page, { start: "zoom", duration: 1_500 });
  assert.equal(upgraded.emptySamples, 0, `upgrade exposed ${upgraded.emptySamples} mounted samples without src`);
  assert.equal(upgraded.finalQuality, "original");
  assert.equal(upgraded.finalNaturalWidth, 1600);

  await resetVisibleThumbnail(page, FAIL_PATH);
  const failedPromise = page.evaluate((id) => {
    const img = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"] img[data-canvas-original-src]`);
    return imageResources.showOriginal(img);
  }, NODE_ID);
  const failedOriginal = await sampleUpgrade(page, { duration: 900 });
  await failedPromise;
  assert.equal(failedOriginal.emptySamples, 0);
  assert.equal(failedOriginal.finalQuality, "thumbnail");

  await resetVisibleThumbnail(page, CANCEL_PATH);
  const canceledOriginal = await page.evaluate(async ({ id, waitMs }) => {
    const current = () => document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"] img[data-canvas-original-src]`);
    const samples = [];
    const timer = setInterval(() => {
      const img = current();
      samples.push({ mounted: Boolean(img), hasSrc: Boolean(img?.hasAttribute("src")) });
    }, 10);
    scheduleCanvasMediaImage(current(), "original", 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    markCanvasViewportInteraction();
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    clearInterval(timer);
    const final = current();
    return {
      emptySamples: samples.filter((item) => item.mounted && !item.hasSrc).length,
      finalQuality: final?.dataset.imageQuality || "",
    };
  }, { id: NODE_ID, waitMs: 1_100 });
  assert.equal(canceledOriginal.emptySamples, 0);
  assert.ok(["thumbnail", "original"].includes(canceledOriginal.finalQuality));

  await resetVisibleThumbnail(page, ORIGINAL_A_PATH);
  const staleSource = await page.evaluate(async ({ id, a, b }) => {
    const img = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"] img[data-canvas-original-src]`);
    let bRequestedAt = 0;
    let aCommittedAfterB = false;
    const observer = new MutationObserver(() => {
      if (bRequestedAt && (img.getAttribute("src") || "").endsWith(a)) aCommittedAfterB = true;
    });
    observer.observe(img, { attributes: true, attributeFilter: ["src"] });
    const first = imageResources.showOriginal(img);
    await new Promise((resolve) => setTimeout(resolve, 50));
    img.setAttribute("data-original-src", b);
    img.setAttribute("data-canvas-original-src", b);
    bRequestedAt = performance.now();
    const second = imageResources.showOriginal(img);
    await Promise.allSettled([first, second]);
    await new Promise((resolve) => setTimeout(resolve, 900));
    observer.disconnect();
    return { finalSrc: img.getAttribute("src") || "", aCommittedAfterB };
  }, { id: NODE_ID, a: ORIGINAL_A_PATH, b: ORIGINAL_B_PATH });
  assert.match(staleSource.finalSrc, /original-b\.svg$/);
  assert.equal(staleSource.aCommittedAfterB, false);
}

async function runLive(page, appUrl, boardId) {
  await page.goto(appUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await openBoard(page, boardId);
  const targetId = await page.evaluate(() => {
    const model = serializeCanvasBoard().nodes.find((node) => (
      node?.kind === "image" && String(node.imageSrc || "").trim()
    ));
    return String(model?.id || "");
  });
  assert.ok(targetId, `Live canvas has no image node: ${boardId}`);
  await centerNodeAtScale(page, targetId, 0.55);
  await waitForThumbnail(page, targetId);
  const result = await sampleUpgrade(page, { nodeId: targetId, start: "zoom", duration: 2_000 });
  assert.equal(result.emptySamples, 0);
  assert.equal(result.finalQuality, "original");
  assert.ok(result.finalNaturalWidth > 0);
}

(async () => {
  const live = process.argv.includes("--live");
  const liveUrl = String(process.env.CANVAS_IMAGE_ATOMIC_APP_URL || "").trim();
  const liveBoardId = String(process.env.CANVAS_IMAGE_ATOMIC_BOARD_ID || "").trim();
  let directory = "";
  let child = null;
  let appUrl = liveUrl;
  const diagnostics = [];
  if (live) {
    assert.ok(appUrl, "CANVAS_IMAGE_ATOMIC_APP_URL is required in live mode.");
    assert.ok(liveBoardId, "CANVAS_IMAGE_ATOMIC_BOARD_ID is required in live mode.");
  } else {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-image-atomic-"));
    const legacyFile = path.join(directory, "canvas-boards.json");
    fs.writeFileSync(legacyFile, JSON.stringify({ boards: [createBoard()], trash: [] }), "utf8");
    const portProbe = http.createServer();
    const port = await listen(portProbe);
    await new Promise((resolve) => portProbe.close(resolve));
    child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        CANVAS_DB_FILE: path.join(directory, "canvas.db"),
        CANVAS_LEGACY_FILE: legacyFile,
        CANVAS_BACKUP_DIR: path.join(directory, "backups"),
        CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
        CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
    child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
    await waitForServer(port, diagnostics);
    appUrl = `http://127.0.0.1:${port}`;
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH
        || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    if (live) await runLive(page, appUrl, liveBoardId);
    else await runControlled(page, appUrl);
    assert.deepEqual(pageErrors, [], `Canvas image page errors: ${pageErrors.join(" | ")}`);
    console.log("Canvas image atomic upgrade UI checks passed.");
  } finally {
    await browser?.close();
    if (child?.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    if (directory) {
      const resolved = path.resolve(directory);
      if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
        fs.rmSync(resolved, { recursive: true, force: true });
      }
      assert.equal(fs.existsSync(directory), false, "Atomic image test files were not removed.");
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
