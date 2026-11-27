"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { installFixedStageRouting } = require("./test-fixtures/fixed-stage-routing.cjs");

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
    const errors = [];
    const evidence = process.env.AI_OS_VIEWER_EVIDENCE;
    const capture = name => evidence && page.screenshot({ path: path.join(evidence, name + ".png") });
    if (evidence) fs.mkdirSync(evidence, { recursive: true });
    page.on("pageerror", error => errors.push(error.message));
    await installFixedStageRouting(page);
    if (process.argv.includes("--source")) {
      const read = name => fs.readFileSync(path.join(__dirname, "design-sources", name), "utf8");
      const { ensureCanvasNavigationBridge } = await import("./component-deploy.mjs");
      const script = [ensureCanvasNavigationBridge(read("script-before-save-bridge.js")), read("canvas-script-production.js"), read("canvas-asset-entry.js")].join("\n");
      for (const [name, type, body] of [
        ["script.js", "text/javascript", script],
        ["flora-node-shell.js", "text/javascript", read("flora-node-shell.js")],
        ["flora-node-shell.css", "text/css", read("flora-node-shell.css")],
      ]) await page.route(new RegExp("/" + name.replaceAll(".", "\\.") + "(?:\\?|$)"), route => route.fulfill({ contentType: type, body }));
    }
    await page.route("**/api/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/assets/qa-original") return route.fulfill({ json: {
        asset: { id: "qa-original", kind: "image", mimeType: "image/png",
          url: "/output/qa-viewer-original.png", thumbnailUrl: "/output/thumbnails/qa-viewer-small.svg" },
      } });
      if (url.pathname === "/api/assets/resolve") {
        const src = url.searchParams.get("url");
        return route.fulfill({ json: { asset: { id: "asset:" + src, mimeType: "image/svg+xml", name: src.split("/").at(-1) } } });
      }
      return route.fulfill({ json: { authenticated: false, boards: [], nodes: [], connections: [], resources: [], models: [], settings: {} } });
    });
    await page.routeWebSocket("**/*", socket => socket.close());
    // A high-resolution raster and a separately addressable thumbnail.
    const raster = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 4096;
      canvas.height = 3072;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#195d7a"; ctx.fillRect(0, 0, 4096, 3072);
      ctx.fillStyle = "#ffe1a0"; ctx.fillRect(500, 500, 3000, 2000);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const png = Buffer.from(raster, "base64");
    await page.route("**/output/qa-viewer-original.png", async route => {
      if (route.request().headers().range) return route.fulfill({
        status: 206, contentType: "image/png",
        headers: { "content-range": `bytes 0-0/${png.length}` }, body: png.subarray(0, 1),
      });
      return route.fulfill({ contentType: "image/png", body: png });
    });
    await page.route("**/output/thumbnails/qa-viewer-small.svg", route => route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="red"/></svg>',
    }));
    await page.route("**/output/qa-viewer-*.svg", async route => {
      const url = new URL(route.request().url());
      const value = Number(url.pathname.match(/viewer-(\d+)/)?.[1] || 0);
      if (value === 12) await new Promise(resolve => setTimeout(resolve, 250));
      const fill = ["#36576b", "#956347", "#634f75"][value % 3];
      const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${1240 + value}" height="860" viewBox="0 0 1240 860"><rect width="1240" height="860" fill="${fill}"/><circle cx="620" cy="405" r="233" fill="#efe7da"/><text text-anchor="middle" x="620" y="438" font-size="88" font-family="sans-serif" fill="#152026">${value}</text></svg>`;
      if (route.request().headers().range === "bytes=0-0") {
        return route.fulfill({ status: 206, contentType: "image/svg+xml",
          headers: { "content-length": "1", "content-range": `bytes 0-0/${Buffer.byteLength(body)}` }, body: body[0] });
      }
      await route.fulfill({ contentType: "image/svg+xml", headers: { "content-length": String(Buffer.byteLength(body)) }, body: route.request().method() === "HEAD" ? "" : body });
    });
    await page.goto("http://127.0.0.1:33200/", { waitUntil: "networkidle" });
    const mount = () => page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-comfy"]);
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      document.body.append(surface);
      const view = document.querySelector("#canvasView");
      surface.append(view);
      view.hidden = false;
      view.classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      canvasState.activeBoardId = "qa-image-viewer";
      showCanvasEditor();
      function nodeWithHistory(x, values, current) {
        const node = addCanvasApiNode({ x, y: 120 }, { prompt: "当前编辑草稿" });
        node.dataset.boardId = canvasState.activeBoardId;
        const entries = values.map(value => ({
          id: `imgjob_qa${value}:0`, kind: "image", src: `/output/qa-viewer-${value}.svg`, model: value % 2 ? "gpt-image-2" : "",
          createdAt: value % 2 ? "2026-11-19T04:05:06Z" : undefined,
        })).map(item => item.id === "imgjob_qa4:0" ? {
          ...item, assetId: "qa-original", src: "/output/thumbnails/qa-viewer-small.svg",
        } : item.id === "imgjob_qa15:0" ? {
          ...item, src: "/output/thumbnails/qa-viewer-small.svg", actualSize: { width: 4096, height: 3072 },
        } : item);
        const currentItem = entries.find(item => item.id === `imgjob_qa${current}:0`);
        FloraGenerationHistory.hydrate(node, entries, currentItem?.id);
        applyCanvasGenerationHistoryItem(node, currentItem || { kind: "image", src: `/output/qa-viewer-${current}.svg` });
        FloraVisualPresets.hydrate(node, { characterDesign: { gender: "gender-female" } });
        CanvasFloraNodeShell.mount(node);
        return node;
      }
      const main = nodeWithHistory(190, [...Array(18)].map((_, i) => i + 1), 4);
      const peer = nodeWithHistory(725, [91, 92], 91);
      const plain = nodeWithHistory(1020, [], 99);
      const unmatched = nodeWithHistory(1200, [81, 82], 89);
      window.qaViewerNodes = { main, peer, plain, unmatched };
      selectCanvasNode(main);
    });
    const open = name => page.evaluate(name => {
      const node = window.qaViewerNodes[name];
      openCanvasImageOriginalPreview(node, node.querySelector(".canvas-node-result img"));
    }, name);
    const read = name => page.evaluate(name => serializeCanvasNode(window.qaViewerNodes[name]), name);
    await mount();
    const original = await read("main");
    await open("main");
    if (process.argv.includes("--before")) {
      await page.locator("#lightboxImage").evaluate(img => img.decode());
      await capture("01-before");
      return;
    }
    const viewer = page.getByRole("dialog", { name: "图片查看器", exact: true });
    const image = viewer.locator(".canvas-image-viewer-image");
    const details = viewer.getByRole("complementary", { name: "图片信息", exact: true });
    const rail = viewer.getByRole("navigation", { name: "节点历史图片", exact: true });
    const thumb = index => rail.getByRole("button", { name: `查看第${index}张历史图片`, exact: true });
    const close = () => viewer.getByRole("button", { name: "关闭预览", exact: true }).click();
    const info = viewer.getByRole("button", { name: /^(显示|隐藏)图片信息$/ });
    const zoomValue = viewer.getByRole("button", { name: "以 100% 查看" });
    const stage = viewer.locator(".canvas-image-viewer-stage");
    const waitMetadata = text => details.getByText(text, { exact: true }).waitFor({ timeout: 2500 });
    await viewer.waitFor({ timeout: 2500 });
    assert.equal(await rail.getByRole("button").count(), 18);
    await waitMetadata("imgjob_qa4");
    assert.equal(await thumb(4).getAttribute("aria-current"), "true");
    await image.waitFor();
    assert.equal(await zoomValue.innerText(), "100%", "初次打开为原像素比例");
    await waitMetadata("4096 × 3072");
    assert.match(await image.getAttribute("src"), /qa-viewer-original\.png$/);
    assert.equal((await image.boundingBox()).width, 4096);
    await viewer.getByRole("button", { name: "适应窗口" }).click();
    const fittedPicture = await image.boundingBox();
    const viewport = await stage.boundingBox();
    assert.ok(fittedPicture.width <= viewport.width + 1 && fittedPicture.height <= viewport.height + 1);
    await zoomValue.click();
    assert.equal(await zoomValue.innerText(), "100%");
    await viewer.getByRole("button", { name: "放大", exact: true }).click();
    const geometry = () => stage.evaluate(el => {
      const picture = el.querySelector(".canvas-image-viewer-image");
      return { stage: el.getBoundingClientRect().toJSON(), image: picture.getBoundingClientRect().toJSON(), transform: picture.style.transform };
    });
    const originalGeometry = await geometry();
    await info.click();
    assert.equal(await details.isVisible(), false);
    assert.deepEqual(await geometry(), originalGeometry, "隐藏信息栏时图片几何和变换不变");
    await info.click();
    await waitMetadata("4096 × 3072");
    assert.deepEqual(await geometry(), originalGeometry, "显示信息栏时图片几何和变换不变");
    const originalDownload = page.waitForEvent("download");
    await viewer.getByRole("button", { name: "下载图片", exact: true }).click();
    assert.deepEqual(fs.readFileSync(await (await originalDownload).path()), png, "放大后下载仍是逐字节相同的原文件");
    await capture("02-after");
    await thumb(5).click();
    await waitMetadata("imgjob_qa5");
    await waitMetadata("gpt-image-2");
    await waitMetadata("1245 × 860");
    assert.match(await image.getAttribute("src"), /qa-viewer-5/);
    const downloaded = page.waitForEvent("download");
    await viewer.getByRole("button", { name: "下载图片", exact: true }).click();
    assert.match((await downloaded).suggestedFilename(), /qa-viewer-5|图片|素材/);
    await capture("03-history");
    await info.click();
    assert.equal(await details.isVisible(), false);
    await capture("04-info-hidden");
    await close();
    await open("main");
    assert.equal(await details.isVisible(), false);
    await info.click();
    await waitMetadata("imgjob_qa4");

    const scroll = rail.locator(".canvas-image-viewer-thumbnails");
    await thumb(18).scrollIntoViewIfNeeded();
    assert.ok(await scroll.evaluate(el => el.scrollTop) > 0);
    const duringLoad = await thumb(12).evaluate(card => {
      card.click();
      const stage = document.querySelector(".canvas-image-viewer-stage");
      return { url: stage.querySelector(".canvas-image-viewer-image")?.getAttribute("src"), canvas: stage.querySelectorAll("canvas").length, busy: stage.getAttribute("aria-busy") };
    });
    assert.deepEqual(duringLoad, { url: "/output/qa-viewer-original.png", canvas: 0, busy: "true" });
    await thumb(13).click();
    await waitMetadata("1253 × 860");
    await page.waitForTimeout(300);
    assert.match(await image.getAttribute("src"), /qa-viewer-13/);
    await viewer.getByRole("button", { name: "以 100% 查看", exact: true }).click();
    await viewer.getByRole("button", { name: "放大", exact: true }).click();
    const initial = await image.getAttribute("style");
    const box = await stage.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(style =>
      document.querySelector(".canvas-image-viewer-image")?.getAttribute("style") !== style, initial);
    const zoomed = await image.getAttribute("style");
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2 + 35, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(await image.getAttribute("style"), zoomed);
    const pannedGeometry = await geometry();
    await info.click();
    assert.deepEqual(await geometry(), pannedGeometry);
    await info.click();
    assert.deepEqual(await geometry(), pannedGeometry);
    await viewer.getByRole("button", { name: "缩小", exact: true }).click();
    await page.keyboard.press("ArrowRight");
    await waitMetadata("imgjob_qa14");
    assert.equal(await details.getByText("gpt-image-2", { exact: true }).count(), 0);
    assert.equal(await zoomValue.innerText(), "115%", "历史切换保留手动缩放倍率");
    await thumb(15).click();
    await stage.getByText(/原图.*(?:缺失|无法)/).waitFor();
    assert.equal(await image.count(), 0);
    assert.equal(await stage.locator("canvas").count(), 0);
    assert.equal(await details.getByText("4096 × 3072", { exact: true }).count(), 0);
    await page.keyboard.press("Escape");
    await viewer.waitFor({ state: "hidden" });
    const after = await read("main");
    assert.equal(after.prompt, original.prompt);
    assert.equal(after.currentGenerationId, original.currentGenerationId);
    assert.deepEqual(after.visualPresets, original.visualPresets);
    assert.deepEqual(after.generationHistory, original.generationHistory);

    await open("peer");
    assert.equal(await rail.getByRole("button").count(), 2);
    await waitMetadata("imgjob_qa91");
    await close();
    await open("plain");
    assert.equal(await rail.isVisible(), false);
    await waitMetadata("1339 × 860");
    await close();
    await open("unmatched");
    assert.equal(await rail.getByRole("button").count(), 2);
    await waitMetadata("1329 × 860");
    assert.equal(await rail.locator('[aria-current="true"]').count(), 0);
    await close();

    await page.evaluate(() => AiOsMediaPreview.openImage({ url: "/output/qa-viewer-99.svg", title: "素材查看" }));
    assert.equal(await viewer.count(), 0);
    assert.equal(await page.locator("#lightbox").isVisible(), true);
    await page.locator("#lightboxClose").click();
    await page.reload({ waitUntil: "networkidle" });
    await mount();
    await open("main");
    await waitMetadata("imgjob_qa4");
    assert.equal(await rail.getByRole("button").count(), 18);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await stage.evaluate(el => el.clientWidth) > 100);
    const toolbar = viewer.locator(".canvas-image-viewer-toolbar");
    assert.ok(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth));
    await capture("05-mobile");
    await close();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => selectCanvasNode(window.qaViewerNodes.peer));
    await page.getByRole("button", { name: "删除节点", exact: true }).click();
    await page.waitForFunction(() => !window.qaViewerNodes.peer.isConnected);
    assert.equal(await page.evaluate(() => window.qaViewerNodes.main.isConnected), true);
    assert.deepEqual(errors, []);
    console.log("canvas image viewer: 4096×3072 original, 100% default, stable overlay at zoom and pan, byte-identical download, history and missing-original cases passed");
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
