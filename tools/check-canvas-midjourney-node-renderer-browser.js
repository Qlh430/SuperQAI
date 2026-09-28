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
      path: path.resolve(__dirname, "..", "canvas-midjourney-node-renderer.js"),
    });
    const result = await page.evaluate(() => {
      const renderer = globalThis.CanvasMidjourneyNodeRenderer;
      const calls = { run: 0, save: 0, status: 0, sync: 0, connectionRender: 0 };
      const makeField = (label, control) => {
        const field = document.createElement("label");
        field.className = "canvas-h3-field";
        const caption = document.createElement("span");
        caption.textContent = label;
        field.append(caption, control);
        return field;
      };
      const context = {
        document,
        CANVAS_MIDJOURNEY_OPERATIONS: [
          { id: "imagine", label: "生成" },
          { id: "edit", label: "编辑" },
          { id: "blend", label: "融合" },
        ],
        CANVAS_MIDJOURNEY_SPEEDS: ["fast", "relax", "turbo"],
        MIDJOURNEY_DEFAULT_OPTIONS: { version: "7", speed: "fast" },
        MIDJOURNEY_IMAGE_RATIOS: [
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
        ],
        MIDJOURNEY_STANDARD_VERSIONS: ["7", "8.2"],
        createCanvasH3Select(label, choices, value, datasetKey, node) {
          const select = document.createElement("select");
          choices.forEach(([choiceValue, choiceLabel]) => {
            const option = document.createElement("option");
            option.value = choiceValue;
            option.textContent = choiceLabel;
            select.append(option);
          });
          select.value = String(value);
          select.addEventListener("change", () => {
            node.dataset[datasetKey] = select.value;
          });
          return makeField(label, select);
        },
        createCanvasNodeBar(label) {
          const bar = document.createElement("div");
          bar.className = "canvas-node-bar";
          bar.textContent = label;
          return bar;
        },
        createCanvasPort(kind) {
          const port = document.createElement("span");
          port.className = "canvas-port";
          port.dataset.kind = kind;
          return port;
        },
        createCanvasResizeHandle() {
          const handle = document.createElement("span");
          handle.className = "canvas-resize-handle";
          return handle;
        },
        fillCanvasMidjourneyModelSelect(select, preferred) {
          const option = document.createElement("option");
          option.value = preferred || "midjourney";
          option.textContent = "Midjourney";
          select.append(option);
          select.value = option.value;
        },
        readCanvasMidjourneyOperation(node) {
          return node.querySelector(".canvas-midjourney-operation").value;
        },
        runCanvasMidjourneyNode() {
          calls.run += 1;
        },
        scheduleCanvasConnectionRender() {
          calls.connectionRender += 1;
        },
        scheduleCanvasSave() {
          calls.save += 1;
        },
        setCanvasNodeStatus() {
          calls.status += 1;
        },
        stopCanvasTextWheel() {},
        syncCanvasMidjourneyControls() {
          calls.sync += 1;
        },
      };

      const node = document.createElement("section");
      renderer.render(node, {
        operation: "edit",
        prompt: "paper crane",
        model: "midjourney",
        size: "16:9",
        version: "8.2",
        speed: "turbo",
      }, context);
      node.querySelector(".canvas-midjourney-prompt-input").value = "updated prompt";
      node.querySelector(".canvas-midjourney-prompt-input").dispatchEvent(new Event("input", { bubbles: true }));
      node.querySelector(".canvas-midjourney-operation").value = "blend";
      node.querySelector(".canvas-midjourney-operation").dispatchEvent(new Event("change", { bubbles: true }));
      node.querySelector(".canvas-midjourney-run").click();

      return {
        calls,
        operation: node.dataset.midjourneyOperation,
        prompt: node.dataset.midjourneyPrompt,
        model: node.dataset.midjourneyModel,
        size: node.dataset.midjourneySize,
        version: node.dataset.midjourneyVersion,
        speed: node.dataset.midjourneySpeed,
        options: [...node.querySelectorAll(".canvas-midjourney-operation option")].map((option) => option.value),
        controls: node.querySelectorAll(".canvas-midjourney-controls select").length,
        status: node.querySelector(".canvas-h3-status").textContent,
        hasResizeHandle: Boolean(node.querySelector(".canvas-resize-handle")),
        portKinds: [...node.querySelectorAll(".canvas-port")].map((port) => port.dataset.kind),
      };
    });

    assert.deepEqual(result.calls, { run: 1, save: 2, status: 1, sync: 2, connectionRender: 1 });
    assert.equal(result.operation, "blend");
    assert.equal(result.prompt, "updated prompt");
    assert.equal(result.model, "midjourney");
    assert.equal(result.size, "16:9");
    assert.equal(result.version, "8.2");
    assert.equal(result.speed, "turbo");
    assert.deepEqual(result.options, ["imagine", "edit", "blend"]);
    assert.equal(result.controls, 4);
    assert.equal(result.status, "选择操作即可生成");
    assert.equal(result.hasResizeHandle, true);
    assert.deepEqual(result.portKinds, ["input", "output"]);
    console.log("Canvas Midjourney node renderer browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
