"use strict";

/**
 * 文件与共享卡片缩略图的浏览器检查。
 *
 * 用户报的是「文件里为什么没有缩略图显示」，这件事只有在真实浏览器里才能
 * 说清楚：卡片上的图片要真的取到服务端生成的 WebP 缩略图，画出来，并且把
 * 底下的类型图标让位。所以这里起一个隔离数据目录的服务端，塞一张真实的
 * PNG，注册成资源，再开 Chrome 打开「文件与共享」看卡片。
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const IMAGE_NAME = "resource-preview-probe.png";
const IMAGE_URL = `/output/${IMAGE_NAME}`;
const IMAGE_TITLE = "缩略图验证图";
const CHAT_TITLE = "缩略图验证对话";
const BOARD_ID = "resource-preview-board";
const BOARD_TITLE = "缩略图验证画布";

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
  }
}

/** 等服务端真的退出，否则它手里的 sqlite 文件会让临时目录删不掉。 */
function stopServer(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

function removeDirectory(dir, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (attempt === attempts) {
        console.warn(`leftover temp directory: ${dir} (${error.code})`);
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

async function run() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-resource-preview-"));
  const outputDir = path.join(dataDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const sharp = require(path.join(ROOT, "node_modules", "sharp"));
  const png = await sharp({
    create: { width: 960, height: 640, channels: 3, background: { r: 26, g: 92, b: 168 } },
  }).png().toBuffer();
  fs.writeFileSync(path.join(outputDir, IMAGE_NAME), png);

  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_AUTH_DISABLED: "0",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.sqlite"),
      AI_OS_OUTPUT_DIR: outputDir,
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
  });
  const origin = `http://127.0.0.1:${port}`;

  async function request(url, cookie = "", body) {
    const response = await fetch(new URL(url, origin), {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes.toString());
    } catch {
      data = null;
    }
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
  }

  const failures = [];
  async function check(name, fn) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }

  let browser = null;
  try {
    let ready = false;
    for (let index = 0; index < 400; index += 1) {
      try {
        if ((await request("/api/auth/session")).status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* the server is still starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "isolated server starts");
    assert.equal((await request("/api/auth/bootstrap", "", { username: "preview-host", password: "preview-host-password" })).status, 201);
    const host = (await request("/api/auth/login", "", { username: "preview-host", password: "preview-host-password" })).cookie;
    assert.ok(host, "the host session is available");

    const imageResource = await request("/api/resources", host, {
      type: "image",
      title: IMAGE_TITLE,
      refType: "output_media",
      refId: IMAGE_URL,
      metadata: { url: IMAGE_URL },
    });
    assert.equal(imageResource.status, 201, "the image resource is registered");
    const imageResourceId = imageResource.data.resource.id;

    const chatResource = await request("/api/resources", host, {
      type: "chat",
      title: CHAT_TITLE,
      refType: "history_chat",
      refId: "preview-chat-1",
      metadata: {},
    });
    assert.equal(chatResource.status, 201, "the chat resource is registered");
    const chatResourceId = chatResource.data.resource.id;

    // 画布封面走的是另一条路：资源只存画布 id，图要从画布仓库的节点预览里取。
    assert.equal((await request("/api/canvas/boards", host, { id: BOARD_ID, title: BOARD_TITLE })).status, 201, "the board is created");
    const seeded = await request(`/api/canvas/boards/${BOARD_ID}/operations`, host, {
      baseRevision: 0,
      operations: [{
        operationId: "preview-node",
        type: "node.upsert",
        entityId: "preview-node",
        after: {
          id: "preview-node",
          kind: "image",
          x: 0,
          y: 0,
          width: 320,
          height: 320,
          imageSrc: IMAGE_URL,
          resultSrc: IMAGE_URL,
        },
      }],
    });
    assert.equal(seeded.status, 200, `the board seed succeeded: ${JSON.stringify(seeded.data)}`);
    const canvasResource = await request("/api/resources", host, {
      type: "canvas",
      title: BOARD_TITLE,
      refType: "canvas",
      refId: BOARD_ID,
      metadata: {},
    });
    assert.equal(canvasResource.status, 201, "the canvas resource is registered");
    const canvasResourceId = canvasResource.data.resource.id;

    const list = await request("/api/resources", host);
    const imageEntry = list.data.resources.find((entry) => entry.resource.id === imageResourceId);
    const chatEntry = list.data.resources.find((entry) => entry.resource.id === chatResourceId);
    const canvasEntry = list.data.resources.find((entry) => entry.resource.id === canvasResourceId);

    await check("接口：图片资源带回缩略图地址", async () => {
      assert.equal(imageEntry?.preview?.kind, "image");
      assert.equal(imageEntry?.preview?.url, IMAGE_URL);
      assert.equal(imageEntry?.preview?.local, true);
      assert.match(list.data.resources.find((entry) => entry.resource.id === imageResourceId).preview.url, /^\/output\//);
    });

    await check("接口：对话资源没有缩略图可给", async () => {
      assert.equal(chatEntry?.preview, null);
    });

    await check("接口：画布资源从画布仓库取出封面", async () => {
      assert.equal(canvasEntry?.preview?.kind, "image", "画布卡片要拿到封面");
      assert.equal(canvasEntry?.preview?.url, IMAGE_URL);
      assert.equal(canvasEntry?.preview?.local, true);
      assert.equal(canvasEntry?.stats?.nodeCount, 1, "画布资源要带上节点数");
    });

    const playwright = loadPlaywright();
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--host-resolver-rules=MAP ai-os-preview.test 127.0.0.1", "--no-proxy-server"],
    });
    const browserOrigin = `http://ai-os-preview.test:${port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: host.split("=", 1)[0], value: host.slice(host.indexOf("=") + 1), url: browserOrigin }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && /\/api\/resources|\/api\/image-thumbnails|\/output\//.test(response.url())) {
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });

    await page.goto(browserOrigin);
    await page.locator("#aiOsDesktop:not([hidden])").waitFor();
    await page.locator('[data-ai-app="shared"]').click();
    await page.locator("#aiOsSharedWindow:not([hidden])").waitFor();
    await page.locator(`.ai-os-resource-card[data-resource-id="${imageResourceId}"]`).waitFor();

    await check("界面：图片卡真的画出了缩略图", async () => {
      await page.waitForFunction((id) => {
        const card = document.querySelector(`.ai-os-resource-card[data-resource-id="${id}"]`);
        const image = card?.querySelector("img[data-resource-preview-src]");
        return Boolean(image && image.naturalWidth > 0);
      }, imageResourceId, { timeout: 20000 });
      const state = await page.evaluate((id) => {
        const card = document.querySelector(`.ai-os-resource-card[data-resource-id="${id}"]`);
        const shell = card.querySelector(".ai-os-resource-preview");
        const image = shell.querySelector("img[data-resource-preview-src]");
        const fallback = shell.querySelector(".ai-os-resource-fallback");
        return {
          hasPreview: shell.getAttribute("data-has-preview"),
          ready: shell.classList.contains("is-preview-ready"),
          failed: shell.classList.contains("is-preview-failed"),
          loadedSrc: image.getAttribute("src") || "",
          naturalWidth: image.naturalWidth,
          fallbackDisplay: fallback ? getComputedStyle(fallback).display : "missing",
          objectFit: getComputedStyle(image).objectFit,
        };
      }, imageResourceId);
      assert.equal(state.hasPreview, "true", "卡片标记了有预览");
      assert.equal(state.ready, true, "加载完成后标记 ready");
      assert.equal(state.failed, false, "没有走失败兜底");
      assert.ok(state.naturalWidth > 0, "图片真的解码出来了");
      assert.equal(state.fallbackDisplay, "none", "类型图标让位给缩略图");
      assert.equal(state.objectFit, "cover", "缩略图铺满卡片预览区");
      assert.match(state.loadedSrc, /^\/output\/thumbnails\//, "卡片走的是服务端 WebP 缩略图，不是原图");
    });

    await check("界面：没有缩略图的资源仍然显示类型图标", async () => {
      const state = await page.evaluate((id) => {
        const card = document.querySelector(`.ai-os-resource-card[data-resource-id="${id}"]`);
        const shell = card.querySelector(".ai-os-resource-preview");
        const fallback = shell.querySelector(".ai-os-resource-fallback");
        return {
          hasPreview: shell.getAttribute("data-has-preview"),
          images: shell.querySelectorAll("img[data-resource-preview-src]").length,
          fallbackDisplay: fallback ? getComputedStyle(fallback).display : "missing",
          iconCount: card.querySelectorAll("svg").length,
        };
      }, chatResourceId);
      assert.equal(state.hasPreview, null, "对话卡没有预览标记");
      assert.equal(state.images, 0, "对话卡不放图片");
      assert.notEqual(state.fallbackDisplay, "none", "类型图标仍然可见");
      assert.ok(state.iconCount > 0, "类型图标渲染成了 svg");
    });

    await check("界面：画布卡的封面也画出来了", async () => {
      await page.locator('[data-resource-filter="canvas"]').click();
      await page.locator(`.ai-os-resource-card[data-resource-id="${canvasResourceId}"]`).waitFor();
      await page.waitForFunction((id) => {
        const card = document.querySelector(`.ai-os-resource-card[data-resource-id="${id}"]`);
        const image = card?.querySelector("img[data-resource-preview-src]");
        return Boolean(image && image.naturalWidth > 0);
      }, canvasResourceId, { timeout: 20000 });
      const state = await page.evaluate((id) => {
        const card = document.querySelector(`.ai-os-resource-card[data-resource-id="${id}"]`);
        const shell = card.querySelector(".ai-os-resource-preview");
        const image = shell.querySelector("img[data-resource-preview-src]");
        return {
          ready: shell.classList.contains("is-preview-ready"),
          failed: shell.classList.contains("is-preview-failed"),
          naturalWidth: image?.naturalWidth || 0,
          loadedSrc: image?.getAttribute("src") || "",
        };
      }, canvasResourceId);
      assert.equal(state.ready, true, "画布卡加载完成后标记 ready");
      assert.equal(state.failed, false, "画布卡没有走失败兜底");
      assert.ok(state.naturalWidth > 0, "画布封面真的解码出来了");
      assert.match(state.loadedSrc, /^\/output\/thumbnails\//, "画布卡走的是服务端 WebP 缩略图");
    });

    await check("界面：画布卡标出节点数", async () => {
      const state = await page.evaluate((id) => {
        const card = document.querySelector(`.ai-os-resource-card[data-resource-id="${id}"]`);
        return {
          meta: card?.querySelector("p")?.textContent || "",
        };
      }, canvasResourceId);
      assert.match(state.meta, /无限画布 · 1 个节点/, `卡片的第二行要标出节点数：${state.meta}`);
      const artifactDir = path.join(ROOT, "artifacts", "library-thumbnails");
      fs.mkdirSync(artifactDir, { recursive: true });
      const cardBox = await page.locator(`.ai-os-resource-card[data-resource-id="${canvasResourceId}"]`).boundingBox();
      await page.screenshot({
        path: path.join(artifactDir, "canvas-card-node-count.png"),
        ...(cardBox ? { clip: cardBox } : {}),
      });
      await page.locator('[data-resource-filter="all"]').click();
    });

    await check("界面：打开图片卡进入原图预览，不启动 AI 生图", async () => {
      const card = page.locator(`.ai-os-resource-card[data-resource-id="${imageResourceId}"]`);
      await card.locator("[data-open-resource]").click();
      await page.locator("#lightbox:not([hidden])").waitFor();
      const state = await page.evaluate(() => {
        const image = document.querySelector("#lightboxImage");
        const labels = [...document.querySelectorAll(".ai-os-app-window [data-window-label]")]
          .filter((node) => !node.closest("[hidden]"))
          .map((node) => node.textContent.trim());
        return {
          src: image?.getAttribute("src") || "",
          alt: image?.getAttribute("alt") || "",
          naturalWidth: image?.naturalWidth || 0,
          labels,
        };
      });
      assert.equal(state.src, IMAGE_URL, "灯箱加载的是资源原图");
      assert.equal(state.alt, `${IMAGE_TITLE} - 图片预览`, "灯箱为图片提供可读名称");
      assert.ok(state.naturalWidth > 0, "原图真的解码出来了");
      assert.ok(!state.labels.includes("AI 生图"), "打开图片没有启动 AI 生图应用");
      await page.locator("#lightboxClose").click();
    });

    await check("界面：打开共享窗口没有前端报错", async () => {
      assert.deepEqual(errors, []);
    });

    const artifactDir = path.join(ROOT, "artifacts", "library-thumbnails");
    fs.mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "shared-window.png") });
    await context.close();
  } finally {
    await browser?.close().catch(() => {});
    await stopServer(child);
    removeDirectory(dataDir);
  }

  if (failures.length) {
    console.error(`resource preview browser: ${failures.length} failure(s)`);
    process.exitCode = 1;
  } else {
    console.log("resource preview browser: all checks passed");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
