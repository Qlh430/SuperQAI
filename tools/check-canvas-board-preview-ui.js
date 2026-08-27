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
  const repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
  try {
    await repository.ready();
    for (const [index, title] of ["测试2", "苹果", "画布 17", "NILLKIN", "画布 41"].entries()) {
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
            thumbnailSrc: `${PIXEL}#${index}`,
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
    page.on("request", (request) => {
      if (request.url().includes("/viewport?")) viewportRequests.push(request.url());
      if (request.resourceType() === "image" && !request.url().includes("/api/image-thumbnails")) {
        originalImageRequests.push(request.url());
      }
    });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.locator("#infiniteCanvas").waitFor({ state: "visible", timeout: 30_000 });
    await page.evaluate(() => document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed"));
    viewportRequests.length = 0;
    originalImageRequests.length = 0;
    await page.locator("#canvasHistoryButton").click();
    for (const title of ["测试2", "苹果", "画布 17", "NILLKIN", "画布 41"]) {
      const card = page.locator(".canvas-board-item", { hasText: title }).first();
      const image = card.locator(".canvas-board-preview img").first();
      await image.waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForFunction((element) => element.naturalWidth > 0, await image.elementHandle());
      assert.equal(await card.locator(".canvas-board-preview-empty").count(), 0);
    }
    assert.equal(viewportRequests.length, 0, "opening history must not load whole boards");
    assert.deepEqual(originalImageRequests, [], "history previews must not request original images");
  } catch (error) {
    throw new Error(`${error.stack || error}\n${diagnostics.join("")}`);
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("Canvas board preview UI checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
