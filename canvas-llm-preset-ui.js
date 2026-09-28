(function initCanvasLlmPresetUi(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasLlmPresetUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasLlmPresetUi() {
  "use strict";

  const DEFAULT_DELETE_CONFIRM_MS = 2400;

  function resetPresetDeleteConfirm(list, options = {}) {
    const clearTimer = typeof options.clearTimeout === "function"
      ? options.clearTimeout
      : globalThis.clearTimeout;
    list?.querySelectorAll?.(".canvas-llm-preset-item.is-confirming").forEach((item) => {
      clearTimer?.(item._canvasLlmDeleteTimer);
      item._canvasLlmDeleteTimer = 0;
      item.classList.remove("is-confirming");
      const remove = item.querySelector?.(".canvas-llm-preset-delete");
      const label = item.dataset?.presetLabel || "";
      if (remove) {
        remove.textContent = "×";
        remove.title = label ? `删除预设标签：${label}` : "删除预设标签";
        remove.setAttribute?.("aria-label", remove.title);
      }
    });
  }

  function renderPresetChips(options = {}) {
    const document = options.document || globalThis.document;
    const list = options.list;
    if (!document || !list) return;
    const presets = Array.isArray(options.presets) ? options.presets : [];
    const confirmDelay = Number.isFinite(options.confirmDelay)
      ? Math.max(0, options.confirmDelay)
      : DEFAULT_DELETE_CONFIRM_MS;
    const setTimer = typeof options.setTimeout === "function"
      ? options.setTimeout
      : globalThis.setTimeout;
    const clearTimer = typeof options.clearTimeout === "function"
      ? options.clearTimeout
      : globalThis.clearTimeout;
    const resetDeleteConfirm = () => resetPresetDeleteConfirm(list, { clearTimeout: clearTimer });
    const addToggle = list.querySelector?.(".canvas-llm-preset-add");
    list.innerHTML = "";

    presets.forEach((preset) => {
      const item = document.createElement("span");
      item.className = "canvas-llm-preset-item";
      item.dataset.presetLabel = preset.label;

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "canvas-llm-preset-chip";
      chip.textContent = preset.label;
      chip.title = preset.text;
      chip.addEventListener("click", () => {
        resetDeleteConfirm();
        options.onApply?.(preset);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "canvas-llm-preset-delete";
      remove.textContent = "×";
      remove.title = `删除预设标签：${preset.label}`;
      remove.setAttribute("aria-label", `删除预设标签：${preset.label}`);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        if (item.classList.contains("is-confirming")) {
          clearTimer?.(item._canvasLlmDeleteTimer);
          options.onDelete?.(preset);
          return;
        }
        resetDeleteConfirm();
        item.classList.add("is-confirming");
        remove.textContent = "确认";
        remove.title = `再次点击确认删除：${preset.label}`;
        remove.setAttribute("aria-label", remove.title);
        item._canvasLlmDeleteTimer = setTimer?.(
          () => resetPresetDeleteConfirm(list, { clearTimeout: clearTimer }),
          confirmDelay,
        );
        options.onStatus?.(`再次点击确认删除：${preset.label}`);
      });

      item.append(chip, remove);
      list.append(item);
    });

    if (addToggle) list.append(addToggle);
  }

  function createPresetEditor(options = {}) {
    const document = options.document || globalThis.document;
    if (!document) throw new Error("Canvas LLM preset editor requires a document.");

    const editor = document.createElement("div");
    editor.className = "canvas-llm-preset-editor";
    editor.hidden = true;

    const row = document.createElement("div");
    row.className = "canvas-llm-preset-editor-row";

    const nameInput = document.createElement("input");
    nameInput.className = "canvas-llm-preset-name";
    nameInput.type = "text";
    nameInput.maxLength = 12;
    nameInput.placeholder = "提示词标签命名";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "canvas-llm-preset-save";
    save.textContent = "添加";

    const textInput = document.createElement("textarea");
    textInput.className = "canvas-llm-preset-text";
    textInput.rows = 5;
    textInput.placeholder = "预设提示词填写区";
    if (typeof options.stopWheel === "function") {
      textInput.addEventListener("wheel", options.stopWheel);
    }

    save.addEventListener("click", () => {
      const label = nameInput.value.trim();
      const text = textInput.value.trim();
      if (!label || !text) {
        options.onStatus?.("请先填写标签名和预设提示词。");
        return;
      }
      const handled = options.onSave?.({ label, text });
      if (handled === false) return;
      nameInput.value = "";
      textInput.value = "";
    });

    row.append(nameInput, save);
    editor.append(row, textInput);
    return editor;
  }

  function createPresetBar(options = {}) {
    const document = options.document || globalThis.document;
    if (!document) throw new Error("Canvas LLM preset bar requires a document.");

    const wrap = document.createElement("section");
    wrap.className = "canvas-llm-presets";
    wrap.setAttribute("aria-label", "预设提示词");
    ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "dragstart"].forEach((type) => {
      wrap.addEventListener(type, (event) => event.stopPropagation());
    });

    const list = document.createElement("div");
    list.className = "canvas-llm-preset-list";
    options.renderList?.(list);

    const addToggle = document.createElement("button");
    addToggle.type = "button";
    addToggle.className = "canvas-llm-preset-add";
    addToggle.textContent = "+";
    addToggle.title = "添加预设提示词";
    addToggle.setAttribute("aria-label", "添加预设提示词");
    addToggle.setAttribute("aria-expanded", "false");
    list.append(addToggle);

    const editor = typeof options.createEditor === "function"
      ? options.createEditor()
      : createPresetEditor({ document });
    addToggle.addEventListener("click", () => {
      options.resetDeleteConfirm?.(list);
      editor.hidden = !editor.hidden;
      addToggle.classList.toggle("is-open", !editor.hidden);
      wrap.classList.toggle("is-editing", !editor.hidden);
      addToggle.setAttribute("aria-expanded", String(!editor.hidden));
      if (!editor.hidden) editor.querySelector?.(".canvas-llm-preset-name")?.focus?.();
    });

    wrap.append(list, editor);
    return wrap;
  }

  return Object.freeze({
    resetPresetDeleteConfirm,
    renderPresetChips,
    createPresetEditor,
    createPresetBar,
  });
});
