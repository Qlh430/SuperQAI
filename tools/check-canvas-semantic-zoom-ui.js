const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BOARD_ID = "semantic-zoom-fixture";
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mP8z8AARAwMjAEAHQIBf4JxgQAAAABJRU5ErkJggg==";

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
      response.on("end", () => resolve({
        status: response.statusCode,
        data: JSON.parse(body || "{}"),
      }));
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
  throw new Error(`Semantic zoom server did not start.\n${diagnostics.join("")}`);
}

function fixtureBoard() {
  const common = (id, kind, x, y, extra = {}) => ({
    id: String(id),
    kind,
    x,
    y,
    width: 320,
    height: 240,
    ...extra,
  });
  return {
    id: BOARD_ID,
    title: "语义缩放混合节点",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    viewport: { x: 80, y: 80, scale: 0.55 },
    connections: [],
    nodes: [
      common(1, "image", 0, 0, { imageName: "有效图片", imageSrc: PIXEL, status: "已完成" }),
      common(2, "gallery", 360, 0, {
        galleryTitle: "产品图集",
        galleryActiveImageId: "g1",
        galleryImages: [{ id: "g1", name: "图集主图", src: PIXEL, savedUrl: PIXEL }],
      }),
      common(3, "group", 720, 0, {
        groupTitle: "参考图片组",
        groupImages: [{ name: "组图", src: PIXEL, savedUrl: PIXEL }],
      }),
      common(4, "text", 0, 300, { text: "始终可辨识的文字节点", status: "已编辑" }),
      common(5, "comfy", 360, 300, { title: "Comfy 放大工作流", comfyMode: "upscale2", state: "待执行" }),
      common(6, "generator", 720, 300, { title: "产品图生成", prompt: "红色产品摄影", status: "等待生成" }),
      common(7, "llm", 0, 600, { llmPrompt: "生成产品卖点", runtimeStatus: "已就绪" }),
      common(8, "video", 360, 600, { mediaName: "视频素材", status: "等待上传" }),
      common(9, "legacy-widget", 720, 600, { name: "旧版控制节点", state: "兼容模式" }),
      common(10, "image", 1080, 300, {
        imageName: "故障图片回退",
        imageSrc: "/missing-semantic-preview.png",
        status: "源图不可用",
      }),
    ],
  };
}

async function openBoard(page) {
  await page.goto(page.url(), { waitUntil: "networkidle", timeout: 30_000 });
  await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(`[data-board-id="${BOARD_ID}"]`).click({ timeout: 15_000 });
  await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction((boardId) => (
    canvasState.activeBoardId === boardId && (canvasVirtualStore.size > 0 || canvasPagedStore.lodPage)
  ), BOARD_ID, { timeout: 30_000 });
}

async function setScale(page, scale) {
  await page.evaluate(async (nextScale) => {
    canvasState.scale = nextScale;
    applyCanvasTransformNow();
    canvasViewportDataSource.lastFulfilled = null;
    const { mountRect } = canvasVirtualizer.getRects();
    await requestCanvasViewportPage({ ...mountRect, scale: nextScale });
    canvasVirtualizer.flushNow();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, scale);
}

async function semanticSnapshot(page) {
  return page.evaluate(() => {
    const summaries = [...document.querySelectorAll("#canvasPlane .canvas-node-virtual-summary")];
    const incomplete = summaries.filter((node) => (
      node.dataset.previewComplete !== "true"
      || !node.querySelector(".canvas-node-virtual-type")?.textContent.trim()
      || !node.querySelector(".canvas-node-virtual-title")?.textContent.trim()
      || !node.querySelector(".canvas-node-virtual-status")?.textContent.trim()
      || !node.querySelector("img,.canvas-node-virtual-icon")
    ));
    return {
      scale: canvasState.scale,
      summaries: summaries.length,
      incomplete: incomplete.map((node) => node.dataset.id),
      primitive: Boolean(canvasPagedStore.lodPage),
      primitiveClass: document.querySelector("#infiniteCanvas")?.classList.contains("has-primitive-lod") || false,
      directOriginalPreviewIds: summaries
        .filter((node) => {
          const image = node.querySelector("img[data-original-src]");
          const original = image?.getAttribute("data-original-src") || "";
          return image
            && !original.startsWith("data:")
            && !original.startsWith("blob:")
            && image.getAttribute("src") === original;
        })
        .map((node) => node.dataset.id),
      failedFallback: summaries.find((node) => node.dataset.id === "10")?.dataset.previewImageState || "",
      fullNodes: document.querySelectorAll("#canvasPlane .canvas-node:not(.canvas-node-virtual-summary)").length,
    };
  });
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-semantic-zoom-"));
  const legacyFile = path.join(directory, "canvas-boards.json");
  const databaseFile = path.join(directory, "canvas.db");
  const backupDirectory = path.join(directory, "backups");
  fs.writeFileSync(legacyFile, `${JSON.stringify([fixtureBoard()], null, 2)}\n`);
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
      IMAGE_JOBS_FILE: path.join(directory, "image-jobs.json"),
      CANVAS_AGENT_ROUTE_HISTORY_FILE: path.join(directory, "agent-routes.json"),
      CANVAS_AGENT_CONVERSATIONS_FILE: path.join(directory, "agent-conversations.json"),
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
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await openBoard(page);

    const lowSnapshots = [];
    for (const scale of [0.09, 0.35, 0.55, 0.64]) {
      await setScale(page, scale);
      await page.waitForTimeout(250);
      const snapshot = await semanticSnapshot(page);
      lowSnapshots.push(snapshot);
      assert.equal(snapshot.primitive, false, `small board entered primitive LOD at ${scale}`);
      assert.ok(snapshot.summaries > 0, `no summaries mounted at ${scale}`);
      assert.deepEqual(snapshot.incomplete, [], `incomplete summaries at ${scale}`);
      assert.deepEqual(snapshot.directOriginalPreviewIds, [], `preview promoted original at ${scale}`);
    }
    assert.equal(lowSnapshots.at(-1).failedFallback, "error");

    for (const scale of [0.65, 0.74, 1, 1.6]) {
      await setScale(page, scale);
      const snapshot = await semanticSnapshot(page);
      assert.ok(snapshot.fullNodes > 0, `full nodes missing at ${scale}`);
      const fullImage = await page.locator('#canvasPlane .canvas-node[data-id="1"]:not(.canvas-node-virtual-summary)').count();
      assert.equal(fullImage, 1, `full image node missing at ${scale}`);
      assert.equal(await page.locator('#canvasPlane .canvas-node[data-id="1"] img[data-canvas-original-src]').count(), 1);
    }

    const meta = await requestJson(port, `/api/canvas/boards/${BOARD_ID}/meta`);
    assert.equal(meta.status, 200);
    assert.equal(meta.data.nodeCount, 10);
    assert.equal(meta.data.connectionCount, 0);
    assert.deepEqual(pageErrors, []);
    console.log(`Canvas semantic zoom UI checks passed: ${JSON.stringify({ lowSnapshots })}`);
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    const resolved = path.resolve(directory);
    if (resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
    assert.equal(fs.existsSync(directory), false, "semantic zoom fixture was not removed");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
