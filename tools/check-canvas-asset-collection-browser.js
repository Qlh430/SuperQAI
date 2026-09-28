"use strict";

// Browser coverage for the unified material node (素材 / 素材合集).
//
// Pure rules live in tools/check-canvas-asset-collection.js and the reference
// caps in tools/check-canvas-asset-collection-connections.js. This check drives
// the real canvas: the create menu offers one material entry instead of separate
// picture/video/audio imports, one node holds mixed uploads, the mix survives a
// board reload, and removing a member stays undoable.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
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

async function reservePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

const BOARD_TITLE = "素材节点验证";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42isom"), Buffer.alloc(64)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(96)]);
const ARTIFACTS_DIR = path.resolve(__dirname, "..", "artifacts");

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-assets-"));
  let serverOutput = "";
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_AUTH_DISABLED: "true",
      AI_OS_SKIP_ENV_FILE: "1",
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
    },
  });
  server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });
  server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });

  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`${baseUrl}/api/system/ready`);
        if (response.ok && (await response.json()).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await openBoard(page, baseUrl);

    // --- the create menu keeps a single material entry ------------------------
    const menu = page.locator("#canvasNodeMenu");
    const createPoint = await blankPoint(page);
    await page.mouse.dblclick(createPoint.x, createPoint.y);
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    for (const stale of ["image", "video", "audio", "gallery", "video-output"]) {
      assert.equal(
        await menu.locator(`[data-canvas-node="${stale}"]`).count(),
        0,
        `the create menu must not offer the legacy ${stale} entry`,
      );
    }
    assert.equal(await menu.locator('[data-canvas-node="asset"]').count(), 1, "素材 replaces the three import buttons");
    assert.equal(await menu.locator('[data-canvas-node="asset-collection"]').count(), 1, "素材合集 replaces the two output nodes");

    // --- one node collects a picture, a video and an audio file ---------------
    await menu.locator('[data-canvas-node="asset"]').click();
    const node = page.locator("#canvasPlane .canvas-node-asset-collection").first();
    await node.waitFor({ state: "visible", timeout: 5_000 });
    await node.locator(".canvas-assets-empty").waitFor({ state: "visible", timeout: 5_000 });
    assert.match(await node.locator(".canvas-node-title").textContent(), /素材/);
    const emptyMetrics = await node.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.equal(Math.round(emptyMetrics.width), 292, "the empty material node keeps the standard node width");
    assert.ok(
      emptyMetrics.height >= 280 && emptyMetrics.height <= 286,
      `the empty material node keeps the standard node height, received ${emptyMetrics.height}`,
    );

    await node.locator(".canvas-assets-empty").click();
    await page.locator("#canvasNodeAssetInput").setInputFiles([
      { name: "封面.png", mimeType: "image/png", buffer: PNG },
      { name: "镜头.mp4", mimeType: "video/mp4", buffer: MP4 },
      { name: "配音.mp3", mimeType: "audio/mpeg", buffer: MP3 },
    ]);
    await page.waitForFunction(
      () => document.querySelectorAll("#canvasPlane .canvas-node-asset-collection .canvas-assets-item").length === 3,
      null,
      { timeout: 30_000 },
    );
    assert.equal(await node.locator(".canvas-assets-empty").count(), 0, "the empty state gives way to the members");
    const kinds = (await node.locator(".canvas-assets-kind").allTextContents()).map((text) => text.trim()).sort();
    assert.deepEqual(kinds, ["图片", "视频", "音频"]);
    assert.equal(await node.locator('.canvas-assets-visual img[src^="/output/"]').count(), 1);
    assert.equal(await node.locator('.canvas-assets-visual video[src^="/output/"]').count(), 1);
    assert.equal(await node.locator('.canvas-assets-visual audio[src^="/output/"]').count(), 1);
    assert.equal(await node.locator(".canvas-assets-member-port").count(), 3, "every member exposes its own output port");
    assert.equal(
      String(await node.locator(":scope > .canvas-node-footer .canvas-node-status").textContent()).trim(),
      "已就绪 · 共 3 个素材",
      "the status band reports what the collection holds",
    );

    // --- removing a member is one undoable step -------------------------------
    const beforeRemoval = await readMembers(page);
    await node.locator(".canvas-assets-item").first().locator(".canvas-assets-item-actions button").click();
    await page.waitForFunction(
      (expected) => document.querySelectorAll("#canvasPlane .canvas-node-asset-collection .canvas-assets-item").length === expected,
      2,
      { timeout: 5_000 },
    );
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+z");
    try {
      await page.waitForFunction(
        (expected) => document.querySelectorAll("#canvasPlane .canvas-node-asset-collection .canvas-assets-item").length === expected,
        3,
        { timeout: 5_000 },
      );
    } catch (error) {
      const status = await page.locator(".canvas-status").textContent();
      throw new Error(`${error.message} :: status=${status?.replace(/\s+/g, " ").trim()}`);
    }
    assert.deepEqual(
      (await readMembers(page)).map((member) => member.id),
      beforeRemoval.map((member) => member.id),
      "undo must restore the removed member in its original position",
    );

    // --- a mixed collection refuses a picture-only generator -------------------
    const secondPoint = await blankPoint(page);
    await page.mouse.dblclick(secondPoint.x, secondPoint.y);
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    await menu.locator('[data-canvas-node="image-generator"]').click();
    const generator = page.locator("#canvasPlane .canvas-node-image").first();
    await generator.waitFor({ state: "visible", timeout: 5_000 });

    const mainOutput = page.locator('#canvasPlane .canvas-node-asset-collection > .canvas-port-output[data-canvas-port="output"]');
    await mainOutput.dispatchEvent("click");
    await generator.locator(":scope > .canvas-port-input").dispatchEvent("click");
    await page.waitForFunction(
      () => document.querySelector(".canvas-status")?.textContent?.includes("不支持的素材类型"),
      null,
      { timeout: 5_000 },
    );
    assert.equal(
      await generator.locator(".canvas-node-refs .canvas-ref-thumb").count(),
      0,
      "a collection holding audio must not quietly drop it into a picture generator",
    );

    // A single material can still be wired on its own: that is how a mixed
    // collection feeds a picture-only generator without losing the video/audio.
    const imagePort = page.locator(
      '#canvasPlane .canvas-node-asset-collection .canvas-assets-item:has(.canvas-assets-kind.is-image) .canvas-assets-member-port',
    ).first();
    await imagePort.dispatchEvent("click");
    await generator.locator(":scope > .canvas-port-input").dispatchEvent("click");
    await page.waitForFunction(
      () => document.querySelectorAll("#canvasPlane .canvas-node-image .canvas-node-refs .canvas-ref-thumb").length === 1,
      null,
      { timeout: 5_000 },
    );

    // --- the same collection feeds the video generator by material kind --------
    const thirdPoint = await blankPoint(page);
    await page.mouse.dblclick(thirdPoint.x, thirdPoint.y);
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    await menu.locator('[data-canvas-node="video-generator"]').click();
    const videoGenerator = page.locator("#canvasPlane .canvas-node-video-api").first();
    await videoGenerator.waitFor({ state: "visible", timeout: 5_000 });
    await videoGenerator.locator('.canvas-engine-switch [data-engine="comfyui"]').click();
    const h3 = page.locator("#canvasPlane .canvas-node-minimax-h3").first();
    await h3.waitFor({ state: "visible", timeout: 5_000 });
    await mainOutput.dispatchEvent("click");
    await h3.locator(":scope > .canvas-port-input").dispatchEvent("click");
    await page.waitForFunction(
      () => document.querySelectorAll("#canvasPlane .canvas-node-minimax-h3 .canvas-h3-reference-collection.is-images .canvas-h3-reference-item").length === 1,
      null,
      { timeout: 5_000 },
    );
    const referenceHeads = await h3.locator(".canvas-h3-reference-collection .canvas-h3-reference-head span").allTextContents();
    assert.deepEqual(referenceHeads.map((text) => text.trim()), ["1/9", "1/3", "1/3"],
      "the video generator reads pictures, video and audio from one collection");

    // Visual evidence: the member grid, the type badges, the per-member ports and
    // the wired generators all have to read as one node on the canvas.
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await node.screenshot({ path: path.join(ARTIFACTS_DIR, "canvas-asset-collection.png") });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "canvas-asset-collection-canvas.png") });

    // Appending to a collection that is already wired to a generator must still
    // reach it; an early capacity exit used to drop the new member instead.
    await node.locator(".canvas-assets-upload").click();
    await page.locator("#canvasNodeAssetInput").setInputFiles([
      { name: "补图.png", mimeType: "image/png", buffer: PNG },
    ]);
    await page.waitForFunction(
      () => document.querySelectorAll("#canvasPlane .canvas-node-asset-collection .canvas-assets-item").length === 4,
      null,
      { timeout: 20_000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll("#canvasPlane .canvas-node-minimax-h3 .canvas-h3-reference-collection.is-images .canvas-h3-reference-item").length === 2,
      null,
      { timeout: 5_000 },
    );

    // --- a single picture uses the old picture-node shell and its replace action
    const singlePoint = await blankPoint(page);
    await page.mouse.dblclick(singlePoint.x, singlePoint.y);
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    await menu.locator('[data-canvas-node="asset"]').click();
    const singleNode = page.locator("#canvasPlane .canvas-node-asset-collection").last();
    await singleNode.waitFor({ state: "visible", timeout: 5_000 });
    await singleNode.locator(".canvas-assets-empty").click();
    await page.locator("#canvasNodeAssetInput").setInputFiles([
      { name: "单图.png", mimeType: "image/png", buffer: PNG },
    ]);
    await singleNode.locator(".canvas-image-upload.has-image").waitFor({ state: "visible", timeout: 20_000 });
    assert.equal(await singleNode.locator(".canvas-assets-actions").count(), 0, "the picture node does not keep the add-material overlay");
    assert.equal(await singleNode.locator(".canvas-assets-upload").count(), 0, "the toolbar replace action is the only picture replacement entry");

    await singleNode.locator(".canvas-image-upload img").click();
    const replaceButton = page.locator('.canvas-image-toolbar [data-image-action="replace"]');
    await replaceButton.waitFor({ state: "visible", timeout: 5_000 });
    await replaceButton.click();
    await page.locator("#canvasNodeImageInput").setInputFiles([
      { name: "替换图.png", mimeType: "image/png", buffer: PNG },
    ]);
    await page.waitForFunction(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-asset-collection:has(.canvas-image-upload)");
      const state = JSON.parse(node?.dataset.assetCollection || "{}");
      return state.members?.length === 1 && state.members[0]?.name === "替换图.png";
    }, null, { timeout: 20_000 });
    await singleNode.screenshot({ path: path.join(ARTIFACTS_DIR, "canvas-asset-single-image.png") });

    // --- the mix and its order survive a reload -------------------------------
    const beforeReload = await readMembers(page);
    await page.waitForTimeout(1_200);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    const boardItem = page.locator("#canvasBoardList .canvas-board-item").first();
    await boardItem.waitFor({ state: "visible", timeout: 10_000 });
    await boardItem.click();
    await page.locator("#canvasEditorScreen").waitFor({ state: "visible", timeout: 10_000 });
    const restored = page.locator("#canvasPlane .canvas-node-asset-collection").first();
    await restored.waitFor({ state: "visible", timeout: 10_000 });
    const afterReload = await readMembers(page);
    assert.deepEqual(
      afterReload.map((member) => member.id),
      beforeReload.map((member) => member.id),
      "member order and identity must survive a board reload",
    );
    assert.deepEqual(
      afterReload.map((member) => [member.kind, member.src]),
      beforeReload.map((member) => [member.kind, member.src]),
      "member type badges and media addresses must survive a board reload",
    );

    assert.deepEqual(browserErrors, [], `the canvas reported page errors: ${browserErrors.join(" | ")}`);
    console.log("Canvas asset collection browser checks passed.");
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(server);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function readMembers(page) {
  return page.evaluate(() => {
    const node = document.querySelector("#canvasPlane .canvas-node-asset-collection");
    const stored = JSON.parse(node.dataset.assetCollection || "{}");
    return (stored.members || []).map((member) => ({
      id: String(member.id),
      kind: String(member.kind),
      src: String(member.src),
    }));
  });
}

async function openBoard(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('[data-ai-app="canvas"]').click();
  await page.locator("#canvasBoardNew").click();
  await page.locator("#canvasNameInput").fill(BOARD_TITLE);
  await page.locator("#canvasNameForm button[type=submit]").click();
  await page.locator("#canvasEditorScreen").waitFor({ state: "visible" });
}

async function blankPoint(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
    const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")]
      .map((node) => node.getBoundingClientRect());
    for (let y = viewport.top + 190; y < viewport.bottom - 90; y += 45) {
      for (let x = viewport.left + 90; x < viewport.right - 70; x += 45) {
        const occupied = nodes.some((rect) =>
          x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12);
        if (!occupied) return { x, y };
      }
    }
    return { x: viewport.right - 80, y: viewport.top + 80 };
  });
}
