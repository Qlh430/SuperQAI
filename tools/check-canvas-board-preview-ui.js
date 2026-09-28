const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { createCanvasRepository } = require("../canvas-repository");

const ROOT = path.resolve(__dirname, "..");
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function createRemoteLegacyImageServer() {
  return http.createServer((request, response) => {
    if (request.url !== "/legacy.png") {
      response.writeHead(404);
      response.end();
      return;
    }
    // Deliberately omit Access-Control-Allow-Origin: legacy provider images
    // can render in <img>, but cannot be fetched by the thumbnail worker.
    response.writeHead(200, { "Content-Type": "image/png" });
    response.end(Buffer.from(PIXEL.split(",")[1], "base64"));
  });
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path: pathname }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(body || "{}") }));
    }).once("error", reject);
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await requestJson(port, "/api/models")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Canvas board preview server did not start.");
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-board-preview-ui-"));
  const dbPath = path.join(directory, "canvas.db");
  const legacyFile = path.join(directory, "canvas-boards.json");
  fs.writeFileSync(legacyFile, "[]");
  const remoteLegacyServer = createRemoteLegacyImageServer();
  const remoteLegacyPort = await listen(remoteLegacyServer);
  const remoteLegacyImage = `http://127.0.0.1:${remoteLegacyPort}/legacy.png`;
  const repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
  try {
    await repository.ready();
    for (const [index, title] of ["测试2", "苹果", "画布 17", "NILLKIN", "画布 41", "跨域旧图"].entries()) {
      const boardId = `preview-${index}`;
      await repository.createBoard({ id: boardId, title });
      await repository.applyOperations({
        boardId,
        baseRevision: 0,
        operations: [{
          operationId: `preview-node-${index}`,
          type: "node.upsert",
          entityId: `image-${index}`,
          after: {
            id: `image-${index}`,
            kind: "image",
            x: index * 400,
            y: 0,
            width: 320,
            height: 240,
            thumbnailSrc: title === "跨域旧图" ? remoteLegacyImage : `${PIXEL}#${index}`,
          },
        }],
      });
    }
  } finally {
    await repository.close();
  }

  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: directory,
      CANVAS_DB_FILE: dbPath,
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
  let browser;
  try {
    await waitForServer(port);
    const listed = await requestJson(port, "/api/canvas/boards");
    assert.equal(listed.status, 200);
    assert.ok(listed.data.boards.every((board) => board.previewImages.length === 1));
    assert.ok(listed.data.boards.every((board) => !Object.hasOwn(board, "nodes")));

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH
        || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const viewportRequests = [];
    const originalImageRequests = [];
    const failedImageRequests = [];
    page.on("request", (request) => {
      if (request.url().includes("/viewport?")) viewportRequests.push(request.url());
      if (request.resourceType() === "image" && !request.url().includes("/api/image-thumbnails")) {
        originalImageRequests.push(request.url());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && (/thumbnail|image|canvas/.test(response.url()))) {
        failedImageRequests.push({ status: response.status(), url: response.url() });
      }
    });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });
    // 计数要在打开画布库之前清零：卡片一挂上 DOM，缩略图/原图的请求就会立刻发出去，
    // 等 #canvasLibraryScreen 可见再清零会把它们一起抹掉，断言就变成了看运气。
    viewportRequests.length = 0;
    originalImageRequests.length = 0;
    await page.locator('[data-ai-app="canvas"]').evaluate((element) => element.click());
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
    for (const title of ["测试2", "苹果", "画布 17", "NILLKIN", "画布 41", "跨域旧图"]) {
      const card = page.locator(".canvas-board-item", { hasText: title }).first();
      const image = card.locator(".canvas-board-preview img").first();
      await card.scrollIntoViewIfNeeded();
      await image.waitFor({ state: "visible", timeout: 10_000 });
      try {
        await page.waitForFunction((element) => element.naturalWidth > 0, await image.elementHandle(), { timeout: 12_000 });
      } catch (error) {
        const details = await image.evaluate((element) => ({ src: element.currentSrc || element.src, complete: element.complete, naturalWidth: element.naturalWidth }));
        throw new Error(`Preview image did not load for ${title}: ${JSON.stringify({ details, failedImageRequests })}\n${error.message}`);
      }
      assert.equal(await card.locator(".canvas-board-preview-empty").count(), 0);
    }
    assert.equal(viewportRequests.length, 0, "opening history must not load whole boards");
    assert.deepEqual(
      originalImageRequests.filter((url) => !url.startsWith(`http://127.0.0.1:${remoteLegacyPort}/legacy.png`)),
      [],
      "history previews must only fall back to an original when its thumbnail cannot be created",
    );
    // 跨域旧图必须还能看见。这里直接看卡片自己解析出来的地址和解码结果，
    // 不去数网络请求：图可能命中 HTTP 缓存（worker 先 fetch 过一次），
    // 那样浏览器根本不会再发一次请求，数请求会把正常情况判成失败。
    const crossOriginPreview = page.locator(".canvas-board-item", { hasText: "跨域旧图" }).first().locator(".canvas-board-preview img").first();
    const crossOriginState = await crossOriginPreview.evaluate((element) => ({
      src: element.currentSrc || element.src,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      error: element.closest(".canvas-board-preview")?.classList.contains("is-error") || element.classList.contains("is-error"),
    }));
    assert.ok(
      crossOriginState.src.startsWith(`http://127.0.0.1:${remoteLegacyPort}/legacy.png`),
      `a cross-origin legacy image must fall back to its original URL — saw ${JSON.stringify(crossOriginState)}`,
    );
    assert.ok(
      crossOriginState.naturalWidth > 0 && crossOriginState.naturalHeight > 0,
      `a cross-origin legacy image must remain visible when the thumbnail worker is denied CORS access — saw ${JSON.stringify(crossOriginState)}`,
    );
  } catch (error) {
    throw new Error(`${error.stack || error}\n${diagnostics.join("")}`);
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await new Promise((resolve) => remoteLegacyServer.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("Canvas board preview UI checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
