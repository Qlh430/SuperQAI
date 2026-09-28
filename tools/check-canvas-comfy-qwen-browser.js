"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}

(async () => {
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({
      path: path.resolve(__dirname, "..", "canvas-comfy-qwen-ui.js"),
    });
    const result = await page.evaluate(() => {
      const ui = globalThis.CanvasComfyQwenUi;
      let angle = { horizontal: 0, vertical: 0, zoom: 5 };
      let hintCount = 0;
      let saveCount = 0;
      const node = {};
      const area = ui.createQwenAngleFields({
        document,
        node,
        angle,
        getAngle: () => ({ ...angle }),
        setAngle: (_node, next) => {
          angle = { ...next };
        },
        describeHorizontal: (value) => `H${value}`,
        describeVertical: (value) => `V${value}`,
        describeZoom: (value) => `Z${value}`,
        onHint: () => {
          hintCount += 1;
        },
        onSave: () => {
          saveCount += 1;
        },
      });
      document.body.append(area);

      const horizontal = area.querySelector(".canvas-comfy-qwen-horizontal");
      horizontal.value = "90";
      horizontal.dispatchEvent(new Event("input", { bubbles: true }));
      const valueText = area.querySelector('[data-qwen-value="horizontal"]').textContent;
      const labelText = area.querySelector('[data-qwen-label="horizontal"]').textContent;

      const point = ui.getSvgPoint({
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 260, height: 170 }),
        viewBox: { baseVal: { width: 260, height: 170 } },
      }, { clientX: 140, clientY: 105 });

      return {
        areaClass: area.className,
        numberFields: area.querySelectorAll('input[type="number"][data-qwen-key]').length,
        rangeFields: area.querySelectorAll('input[type="range"][data-qwen-key]').length,
        angle,
        valueText,
        labelText,
        hintCount,
        saveCount,
        point,
      };
    });

    assert.equal(result.areaClass, "canvas-comfy-qwen-angle");
    assert.equal(result.numberFields, 3);
    assert.equal(result.rangeFields, 3);
    assert.equal(result.angle.horizontal, "90");
    assert.equal(result.valueText, "90°");
    assert.equal(result.labelText, "H90");
    assert.equal(result.hintCount, 1);
    assert.equal(result.saveCount, 1);
    assert.deepEqual(result.point, { x: 130, y: 85 });
    console.log("Canvas ComfyUI Qwen browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
