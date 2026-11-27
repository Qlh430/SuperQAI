"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const { compileGeneratorComposer } = require("./visual-presets-build.cjs");

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/camera-preview-interaction-fixture", route => route.fulfill({
      contentType: "text/html",
      body: '<div data-flora-kind="generator" style="position:fixed;bottom:32px;left:50%"><div id="presets"></div></div>',
    }));
    await page.goto("http://127.0.0.1:33200/camera-preview-interaction-fixture");
    await page.addStyleTag({ path: path.join(__dirname, "design-sources/flora-node-shell.css") });
    const source = compileGeneratorComposer(__dirname);
    const assignments = source.slice(0, source.indexOf("\n"));
    await page.addScriptTag({ content: assignments });
    await page.evaluate(() => {
      const preset = FloraVisualPresetConfig.presets.find(item => item.id === "CAM05");
      preset.previewSource += "?camera-failure-test";
      const missing = FloraVisualPresetConfig.presets.find(item => item.libraryId === "CAM01");
      missing.thumbnail = "";
      missing.previewSource = "";
    });
    await page.route(/\/camera-05\.png\?camera-failure-test$/, route => route.fulfill({ status: 404 }));
    await page.addScriptTag({ path: path.join(__dirname, "design-sources/visual-presets-runtime.js") });
    await page.evaluate(() => {
      const host = document.querySelector("#presets");
      FloraVisualPresets.mount(host.parentElement, host);
    });
    const open = () => page.locator('[data-preset-entry="cameraControl"]').click();
    const picker = page.locator(".flora-visual-presets-picker:popover-open");
    const tab = id => picker.locator(`[data-preset-tab="${id}"]`).click();
    const card = id => picker.locator(`[data-preset-id="${id}"]`);
    const preview = picker.locator(".flora-visual-presets-camera-preview");
    const list = picker.locator(".flora-visual-presets-list");
    const scrollResults = [];
    let slowRequest;
    await page.route("**/originals/cameras/camera-06.png", route => { slowRequest = route; });
    await open();
    for (const group of ["camera", "lens", "focalLength", "aperture"]) {
      await tab(group);
      const before = await list.evaluate(element => {
        element.scrollTop = element.scrollHeight;
        window.cameraTestList = element;
        window.cameraTestCard = element.lastElementChild;
        return element.scrollTop;
      });
      await list.locator("[data-preset-id]").last().click();
      const result = await list.evaluate(element => ({
        position: element.scrollTop,
        stable: element === window.cameraTestList && element.lastElementChild === window.cameraTestCard,
        selected: element.lastElementChild.getAttribute("aria-pressed"),
      }));
      assert(before > 0, `${group} fixture must have scrollable rows`);
      assert.deepEqual(result, { position: before, stable: true, selected: "true" }, group);
      scrollResults.push(group);
    }

    await tab("camera");
    await card("camera-leica").click();
    const waitImage = id => page.waitForFunction(expected => {
      const img = document.querySelector(".flora-visual-presets-camera-preview img");
      return img?.complete && img.naturalWidth > 0 && img.currentSrc.endsWith(expected);
    }, id);
    await waitImage("camera-02.png");
    await card("camera-arri").click();
    assert.equal(await card("camera-arri").getAttribute("aria-pressed"), "true");
    assert.match(await preview.locator("img").getAttribute("src"), /camera-02\.png$/);
    await card("CAM04").click();
    await waitImage("camera-04.png");
    assert(slowRequest);
    await slowRequest.continue();
    await page.waitForLoadState("networkidle");
    await waitImage("camera-04.png");

    await card("CAM05").click();
    const placeholder = preview.locator(".flora-visual-presets-placeholder");
    await placeholder.waitFor();
    assert.equal(await placeholder.textContent(), "高清预览加载失败");
    await card("camera-hasselblad").click();
    assert.equal(await placeholder.textContent(), "高清预览待补");
    await picker.locator('[data-preset-action="cancel"]').click();
    await open();
    await preview.locator("img").waitFor();
    assert.equal(await card("camera-hasselblad").getAttribute("aria-pressed"), "false");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ scrollResults, retainedFrame: true, currentRequestWins: true, errorPlaceholder: true, reopened: true }));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
