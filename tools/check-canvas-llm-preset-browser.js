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
      path: path.resolve(__dirname, "..", "canvas-llm-preset-ui.js"),
    });
    const result = await page.evaluate(() => {
      const ui = globalThis.CanvasLlmPresetUi;
      const host = document.createElement("div");
      document.body.append(host);

      const list = document.createElement("div");
      const addToggle = document.createElement("button");
      addToggle.className = "canvas-llm-preset-add";
      list.append(addToggle);
      host.append(list);
      const applied = [];
      const deleted = [];
      const statuses = [];
      ui.renderPresetChips({
        document,
        list,
        presets: [
          { label: "默认", text: "default prompt", source: "default" },
          { label: "自定义", text: "custom prompt", source: "custom" },
        ],
        onApply: (preset) => applied.push(preset.label),
        onDelete: (preset) => deleted.push(preset.label),
        onStatus: (message) => statuses.push(message),
      });

      list.querySelector(".canvas-llm-preset-chip").click();
      const firstDelete = list.querySelector(".canvas-llm-preset-delete");
      firstDelete.click();
      const confirming = firstDelete.closest(".canvas-llm-preset-item").classList.contains("is-confirming");
      firstDelete.click();

      let saved = null;
      const editor = ui.createPresetEditor({
        document,
        onStatus: (message) => statuses.push(message),
        onSave: (preset) => {
          saved = preset;
        },
      });
      host.append(editor);
      const nameInput = editor.querySelector(".canvas-llm-preset-name");
      const textInput = editor.querySelector(".canvas-llm-preset-text");
      nameInput.value = "  镜头  ";
      textInput.value = "  缓慢推近  ";
      editor.querySelector(".canvas-llm-preset-save").click();

      const bar = ui.createPresetBar({
        document,
        renderList: (target) => {
          target.append(document.createElement("span"));
        },
        resetDeleteConfirm: () => {},
        createEditor: () => editor,
      });
      host.append(bar);
      const barToggle = bar.querySelector(".canvas-llm-preset-add");
      barToggle.click();

      return {
        applied,
        deleted,
        statuses,
        saved,
        confirming,
        chipCount: list.querySelectorAll(".canvas-llm-preset-chip").length,
        editorHidden: editor.hidden,
        editorOpen: barToggle.classList.contains("is-open"),
        barEditing: bar.classList.contains("is-editing"),
        nameCleared: nameInput.value === "",
        textCleared: textInput.value === "",
      };
    });

    assert.deepEqual(result.applied, ["默认"]);
    assert.deepEqual(result.deleted, ["默认"]);
    assert.equal(result.confirming, true);
    assert.deepEqual(result.saved, { label: "镜头", text: "缓慢推近" });
    assert.equal(result.chipCount, 2);
    assert.equal(result.editorHidden, false);
    assert.equal(result.editorOpen, true);
    assert.equal(result.barEditing, true);
    assert.equal(result.nameCleared, true);
    assert.equal(result.textCleared, true);
    assert.equal(
      result.statuses.some((message) => message.includes("再次点击确认删除")),
      true,
    );
    console.log("Canvas LLM preset browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
