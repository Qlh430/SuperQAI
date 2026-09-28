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
      path: path.resolve(__dirname, "..", "canvas-comfy-node-renderer.js"),
    });
    const result = await page.evaluate(() => {
      const renderer = globalThis.CanvasComfyNodeRenderer;
      const calls = { hint: 0, outpaint: 0, refs: 0, run: 0, save: 0, connections: 0 };
      const context = {
        document,
        CANVAS_GENERATION_FAMILIES: { image: { label: "图片生成" } },
        createCanvasComfyOutpaintArea() {
          const area = document.createElement("section");
          area.className = "canvas-comfy-outpaint-area";
          return area;
        },
        createCanvasComfyQwenAngleFields() {
          const area = document.createElement("section");
          area.className = "canvas-comfy-qwen-angle";
          return area;
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
        isCanvasComfyResolutionMode(mode) {
          return !["remove-background", "qwen-edit-angle"].includes(mode);
        },
        normalizeCanvasComfyPadding(value) {
          return {
            left: Number(value.left || 0),
            top: Number(value.top || 0),
            right: Number(value.right || 0),
            bottom: Number(value.bottom || 0),
          };
        },
        normalizeCanvasComfyQwenAngle(value) {
          return {
            horizontal: Number(value.horizontal || 0),
            vertical: Number(value.vertical || 0),
            zoom: Number(value.zoom || 1),
          };
        },
        normalizeCanvasComfyResolution(value) {
          return String(value || "2048");
        },
        runCanvasComfyNode() {
          calls.run += 1;
        },
        scheduleCanvasConnectionRender() {
          calls.connections += 1;
        },
        scheduleCanvasSave() {
          calls.save += 1;
        },
        setCanvasComfyPadding(node, value) {
          node.dataset.comfyOutpaintLeft = String(value.left);
          node.dataset.comfyOutpaintTop = String(value.top);
          node.dataset.comfyOutpaintRight = String(value.right);
          node.dataset.comfyOutpaintBottom = String(value.bottom);
        },
        setCanvasComfyQwenAngle(node, value) {
          node.dataset.comfyQwenHorizontal = String(value.horizontal);
          node.dataset.comfyQwenVertical = String(value.vertical);
          node.dataset.comfyQwenZoom = String(value.zoom);
        },
        setCanvasComfyResolutionFieldVisible(_node, field, select, mode) {
          field.hidden = !["upscale", "upscale2", "shoe-swap", "outpaint", "outpaint2", "flux2-klein-edit"].includes(mode);
          select.disabled = field.hidden;
        },
        syncCanvasComfyResolutionOptions(_modeSelect, resolutionSelect, node) {
          resolutionSelect.innerHTML = "";
          ["2048", "4096"].forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = `${value}px`;
            resolutionSelect.append(option);
          });
          resolutionSelect.value = node.dataset.comfyResolution || "2048";
        },
        updateCanvasComfyHint() {
          calls.hint += 1;
        },
        updateCanvasComfyOutpaintPreview() {
          calls.outpaint += 1;
        },
        updateCanvasNodeRefs() {
          calls.refs += 1;
        },
      };

      const node = document.createElement("section");
      node.dataset.comfyResolution = "2048";
      renderer.render(node, { mode: "upscale2", resolution: "2048" }, context);
      const mode = node.querySelector(".canvas-comfy-mode");
      mode.value = "outpaint";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      const outpaintVisible = !node.querySelector(".canvas-comfy-outpaint-area").hidden;
      mode.value = "qwen-edit-angle";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      const qwenVisible = !node.querySelector(".canvas-comfy-qwen-angle").hidden;
      node.querySelector(".canvas-comfy-run").click();

      return {
        calls,
        nodeType: node.dataset.canvasNodeType,
        mode: node.dataset.comfyMode,
        modeOptions: [...mode.options].map((option) => option.value),
        outpaintVisible,
        qwenVisible,
        runLabel: node.querySelector(".canvas-comfy-run").textContent,
        ports: [...node.querySelectorAll(".canvas-port")].map((port) => port.dataset.kind),
        hasResizeHandle: Boolean(node.querySelector(".canvas-resize-handle")),
      };
    });

    assert.deepEqual(result.calls, { hint: 3, outpaint: 3, refs: 1, run: 1, save: 2, connections: 1 });
    assert.equal(result.nodeType, "comfy");
    assert.equal(result.mode, "qwen-edit-angle");
    assert.deepEqual(result.modeOptions, [
      "upscale",
      "upscale2",
      "shoe-swap",
      "outpaint",
      "outpaint2",
      "flux2-klein-edit",
      "qwen-edit-angle",
      "remove-background",
    ]);
    assert.equal(result.outpaintVisible, true);
    assert.equal(result.qwenVisible, true);
    assert.equal(result.runLabel, "执行");
    assert.deepEqual(result.ports, ["input", "output"]);
    assert.equal(result.hasResizeHandle, true);
    console.log("Canvas ComfyUI node renderer browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
