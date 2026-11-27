"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const output = path.resolve(__dirname, "../.design/camera-preview-quality-20261118");
fs.mkdirSync(output, { recursive: true });

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const imageResponses = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.url().includes("/visual-presets/originals/camera/")) {
      imageResponses.push({ url: response.url(), status: response.status() });
    }
  });
  await page.route("**/api/**", route => route.fulfill({ json: {
    authenticated: false,
    boards: [],
    projects: [],
    resources: [],
    records: [],
    models: [],
    imageModels: [],
    providers: [],
    preferences: {},
    settings: {},
  } }));
  await page.routeWebSocket("**/*", socket => socket.close());
  try {
    await page.goto("http://127.0.0.1:33200/", { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-comfy"]);
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      document.body.append(surface);
      surface.append(document.querySelector("#canvasView"));
      document.querySelector("#canvasView").hidden = false;
      document.querySelector("#canvasView").classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      canvasState.activeBoardId = "qa-camera-preview-only";
      showCanvasEditor();
      const node = addCanvasApiNode({ x: 280, y: 80 }, { prompt: "摄像机预览检查" });
      node.dataset.boardId = canvasState.activeBoardId;
      syncCanvasNodeModel(node);
      CanvasFloraNodeShell.mount(node);
      selectCanvasNode(node);
      FloraGeneratorComposer.mount(node, node.querySelector(".flora-node-shell"));
    });

    const entries = page.locator(".flora-visual-presets-entries");
    await entries.waitFor();
    await page.locator('[data-preset-entry="cameraControl"]').click();
    const picker = page.locator(".flora-visual-presets-picker:popover-open");
    await picker.waitFor();
    assert.deepEqual(await picker.locator("[data-preset-tab]").allTextContents(), ["相机", "镜头", "焦距", "光圈"]);

    await picker.locator('[data-preset-tab="camera"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 6);
    const cameraPlaceholder = await picker.locator(".flora-visual-presets-camera-preview .flora-visual-presets-placeholder").textContent();

    await picker.locator('[data-preset-tab="lens"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 7,
      "Panavision 选项继续保留");
    const lensPlaceholder = await picker.locator(".flora-visual-presets-camera-preview .flora-visual-presets-placeholder").textContent();

    const cases = [
      ["focalLength", "focal-35", "camera_focal_35mm.png", 1376, 768],
      ["focalLength", "focal-50", "camera_focal_50mm.png", 1672, 941],
      ["focalLength", "focal-85", "camera_focal_85mm.png", 1672, 941],
      ["aperture", "aperture-f1-4", "camera_aperture_f1.4.png", 1672, 941],
      ["aperture", "aperture-f2-8", "camera_aperture_f2_8.png", 1672, 941],
      ["aperture", "aperture-f4", "camera_aperture_f4.png", 1672, 941],
      ["aperture", "aperture-f8", "camera_aperture_f8.png", 1672, 941],
    ];
    const loaded = [];
    for (const [tab, id, file, width, height] of cases) {
      await picker.locator(`[data-preset-tab="${tab}"]`).click();
      await picker.locator(`[data-preset-id="${id}"]`).click();
      await page.waitForFunction(expected => {
        const image = document.querySelector(".flora-visual-presets-camera-preview img");
        const preset = window.FloraVisualPresetConfig.presets.find(item => item.id === expected.id);
        return image?.currentSrc.endsWith(preset?.previewSource || "__missing__")
          && image.complete && image.dataset.previewQuality === "original"
          && image.naturalWidth === expected.width && image.naturalHeight === expected.height;
      }, { id, width, height });
      const image = await picker.locator(".flora-visual-presets-camera-preview img").evaluate(element => ({
        src: new URL(element.currentSrc).pathname,
        width: element.naturalWidth,
        height: element.naturalHeight,
        quality: element.dataset.previewQuality,
      }));
      assert.deepEqual(image, {
        src: `/visual-presets/originals/camera/${tab === "focalLength" ? "focal-length" : "aperture"}/${file}`,
        width,
        height,
        quality: "original",
      });
      assert.equal(await picker.locator(`[data-preset-id="${id}"]`).getAttribute("aria-pressed"), "true");

      const listThumbnail = await picker.locator(`[data-preset-id="${id}"] img`).evaluate(element => ({
        src: new URL(element.currentSrc).pathname,
        width: element.naturalWidth,
        height: element.naturalHeight,
      }));
      assert.match(listThumbnail.src, /\.webp$/);
      assert.ok(listThumbnail.width <= 480, JSON.stringify(listThumbnail));
      assert.ok(image.width > listThumbnail.width, JSON.stringify({ image, listThumbnail }));
      loaded.push({ id, ...image, listThumbnail });
    }

    await picker.locator('[data-preset-tab="focalLength"]').click();
    for (const id of ["focal-35", "focal-50", "focal-85"]) {
      await picker.locator(`[data-preset-id="${id}"]`).click();
    }
    await page.waitForFunction(() => {
      const image = document.querySelector(".flora-visual-presets-camera-preview img");
      return image?.currentSrc.endsWith("camera_focal_85mm.png")
        && image.complete && image.naturalWidth === 1672;
    });

    const viewports = [];
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      viewports.push(await picker.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const image = element.querySelector(".flora-visual-presets-camera-preview img");
        return {
          viewport: innerWidth,
          left: rect.left,
          right: rect.right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          imageWidth: image?.naturalWidth || 0,
          imageHeight: image?.naturalHeight || 0,
        };
      }));
    }
    assert.ok(viewports.every(item => item.left >= 0 && item.right <= item.viewport
      && item.scrollWidth <= item.clientWidth + 1), JSON.stringify(viewports));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await picker.locator('[data-preset-tab="focalLength"]').click();
    await picker.locator('[data-preset-id="focal-50"]').click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".flora-visual-presets-camera-preview img");
      return image?.currentSrc.endsWith("camera_focal_50mm.png")
        && image.complete && image.naturalWidth === 1672 && image.naturalHeight === 941;
    });
    await picker.locator(".flora-visual-presets-camera-preview img").evaluate(image => image.decode());
    await page.screenshot({ path: path.join(output, "camera-preview-after-live.png") });

    assert.ok(imageResponses.length >= cases.length);
    assert.ok(imageResponses.every(response => response.status === 200), JSON.stringify(imageResponses));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      loaded,
      imageResponses,
      cameraPlaceholder,
      lensPlaceholder,
      viewports,
      errors,
      screenshot: path.join(output, "camera-preview-after-live.png"),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
