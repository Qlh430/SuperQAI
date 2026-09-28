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
      path: path.resolve(__dirname, "..", "canvas-video-api-node-renderer.js"),
    });
    const result = await page.evaluate(() => {
      const renderer = globalThis.CanvasVideoApiNodeRenderer;
      const calls = {
        connectionRender: 0,
        controls: 0,
        prompt: 0,
        run: 0,
        runButton: 0,
        save: 0,
        watch: [],
      };
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
        CANVAS_GENERATION_FAMILIES: { video: { label: "视频生成" } },
        createCanvasH3Number(label, value, min, max, step, datasetKey, node) {
          const input = document.createElement("input");
          input.type = "number";
          input.min = String(min);
          input.max = String(max);
          input.step = String(step);
          input.value = String(value);
          input.addEventListener("change", () => {
            node.dataset[datasetKey] = input.value;
          });
          return makeField(label, input);
        },
        createCanvasH3Select(label, _choices, value, datasetKey, node) {
          const select = document.createElement("select");
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
        fillCanvasApiVideoModelSelect(select, preferred) {
          const option = document.createElement("option");
          option.value = preferred || "video-model";
          option.textContent = "Video Model";
          select.append(option);
          select.value = option.value;
        },
        runCanvasApiVideoNode() {
          calls.run += 1;
        },
        scheduleCanvasConnectionRender() {
          calls.connectionRender += 1;
        },
        scheduleCanvasSave() {
          calls.save += 1;
        },
        stopCanvasTextWheel() {},
        syncCanvasApiVideoControls() {
          calls.controls += 1;
        },
        syncCanvasApiVideoPrompt(node) {
          calls.prompt += 1;
          node.dataset.apiVideoPrompt = node.querySelector(".canvas-api-video-prompt-input").value;
        },
        syncCanvasApiVideoRunButton(node) {
          calls.runButton += 1;
          node.querySelector(".canvas-api-video-run").textContent = node.dataset.apiVideoTaskId ? "继续查询视频" : "生成视频";
        },
        watchCanvasApiVideoTask(node, delay) {
          calls.watch.push([node.dataset.apiVideoTaskId, delay]);
        },
      };

      const node = document.createElement("section");
      renderer.render(node, {
        prompt: "opening shot",
        model: "video-model",
        ratio: "16:9",
        resolution: "1080p",
        duration: "6",
        taskId: "task-1",
      }, context);
      const prompt = node.querySelector(".canvas-api-video-prompt-input");
      prompt.value = "updated shot";
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
      const model = node.querySelector(".canvas-api-video-model");
      model.value = "video-model";
      model.dispatchEvent(new Event("change", { bubbles: true }));
      node.querySelector(".canvas-api-video-run").click();

      return {
        calls,
        prompt: node.dataset.apiVideoPrompt,
        model: node.dataset.apiVideoModel,
        ratio: node.dataset.apiVideoRatio,
        resolution: node.dataset.apiVideoResolution,
        duration: node.dataset.apiVideoDuration,
        taskId: node.dataset.apiVideoTaskId,
        status: node.querySelector(".canvas-h3-status").textContent,
        runLabel: node.querySelector(".canvas-api-video-run").textContent,
        controls: node.querySelectorAll(".canvas-api-video-controls select, .canvas-api-video-controls input").length,
        ports: [...node.querySelectorAll(".canvas-port")].map((port) => port.dataset.kind),
        hasResizeHandle: Boolean(node.querySelector(".canvas-resize-handle")),
      };
    });

    assert.deepEqual(result.calls, {
      connectionRender: 1,
      controls: 2,
      prompt: 1,
      run: 1,
      runButton: 1,
      save: 2,
      watch: [["task-1", 2000]],
    });
    assert.equal(result.prompt, "updated shot");
    assert.equal(result.model, "video-model");
    assert.equal(result.ratio, "16:9");
    assert.equal(result.resolution, "1080p");
    assert.equal(result.duration, "6");
    assert.equal(result.taskId, "task-1");
    assert.equal(result.status, "输入描述即可生成");
    assert.equal(result.runLabel, "继续查询视频");
    assert.equal(result.controls, 4);
    assert.deepEqual(result.ports, ["input", "output"]);
    assert.equal(result.hasResizeHandle, true);
    console.log("Canvas API video node renderer browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
