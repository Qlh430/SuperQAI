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
      path: path.resolve(__dirname, "..", "canvas-h3-node-renderer.js"),
    });
    const result = await page.evaluate(() => {
      const renderer = globalThis.CanvasH3NodeRenderer;
      const calls = {
        closeMenu: 0,
        mentionUpdate: 0,
        references: 0,
        run: 0,
        connectionRender: 0,
        save: 0,
        syncPrompt: 0,
        resolutionHint: 0,
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
        MINIMAX_H3_ASPECT_RATIOS: {
          "1:1": [1, 1],
          "2:3": [2, 3],
          "3:2": [3, 2],
          "3:4": [3, 4],
          "4:3": [4, 3],
          "9:16": [9, 16],
          "16:9": [16, 9],
          "21:9": [21, 9],
        },
        closeCanvasH3MentionMenu() {
          calls.closeMenu += 1;
        },
        createCanvasH3Number(label, value, min, max, step, datasetKey, node, allowBlank) {
          const input = document.createElement("input");
          input.type = "number";
          input.min = String(min);
          input.max = String(max);
          input.step = String(step);
          input.value = value === "" && allowBlank ? "" : String(value);
          input.addEventListener("change", () => {
            node.dataset[datasetKey] = input.value;
          });
          return makeField(label, input);
        },
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
        handleCanvasH3MentionKeydown() {},
        renderCanvasMinimaxH3References(node) {
          calls.references += 1;
          node.querySelector(".canvas-h3-reference-grid").textContent = "references";
        },
        runCanvasMinimaxH3Node() {
          calls.run += 1;
        },
        scheduleCanvasConnectionRender() {
          calls.connectionRender += 1;
        },
        scheduleCanvasSave() {
          calls.save += 1;
        },
        stopCanvasTextWheel() {},
        syncCanvasMinimaxH3Prompt() {
          calls.syncPrompt += 1;
        },
        updateCanvasH3MentionFromTextarea() {
          calls.mentionUpdate += 1;
        },
        updateCanvasH3ResolutionHint(node) {
          calls.resolutionHint += 1;
          const hint = node.querySelector(".canvas-h3-resolution-hint");
          if (hint) hint.textContent = `${node.dataset.minimaxH3AspectRatio} ${node.dataset.minimaxH3Megapixels}`;
        },
      };

      const node = document.createElement("section");
      node.dataset.id = "h3";
      renderer.render(node, { prompt: "first shot" }, context);
      const prompt = node.querySelector(".canvas-h3-prompt");
      prompt.value = "updated shot";
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
      node.querySelector(".canvas-h3-run").click();
      const aspect = node.querySelector(".canvas-h3-controls select");
      aspect.value = "21:9";
      aspect.dispatchEvent(new Event("change", { bubbles: true }));

      return {
        calls,
        prompt: node.dataset.minimaxH3Prompt,
        aspectRatio: node.dataset.minimaxH3AspectRatio,
        megapixels: node.dataset.minimaxH3Megapixels,
        steps: node.dataset.minimaxH3Steps,
        duration: node.dataset.minimaxH3Duration,
        refImageSize: node.dataset.minimaxH3RefImageSize,
        seed: node.dataset.minimaxH3Seed,
        selectCount: node.querySelectorAll(".canvas-h3-controls select").length,
        numberCount: node.querySelectorAll('.canvas-h3-controls input[type="number"]').length,
        referenceText: node.querySelector(".canvas-h3-reference-grid").textContent,
        runLabel: node.querySelector(".canvas-h3-run").textContent,
        hint: node.querySelector(".canvas-h3-resolution-hint").textContent,
        hasResizeHandle: Boolean(node.querySelector(".canvas-resize-handle")),
      };
    });

    assert.deepEqual(result.calls, {
      closeMenu: 0,
      mentionUpdate: 1,
      references: 1,
      run: 1,
      connectionRender: 1,
      save: 1,
      syncPrompt: 1,
      resolutionHint: 2,
    });
    assert.equal(result.prompt, "updated shot");
    assert.equal(result.aspectRatio, "21:9");
    assert.equal(result.megapixels, "0.6");
    assert.equal(result.steps, "4");
    assert.equal(result.duration, "12");
    assert.equal(result.refImageSize, "match");
    assert.equal(result.seed, "");
    assert.equal(result.selectCount, 4);
    assert.equal(result.numberCount, 2);
    assert.equal(result.referenceText, "references");
    assert.match(result.runLabel, /生成视频/);
    assert.equal(result.hint, "21:9 0.6");
    assert.equal(result.hasResizeHandle, true);
    console.log("Canvas H3 node renderer browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
