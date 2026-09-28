(function initCanvasNoteNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasNoteNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasNoteNodeRenderer() {
  "use strict";

  const COLORS = ["yellow", "pink", "orange", "green", "blue", "purple"];
  const COLOR_LABELS = {
    yellow: "黄色",
    pink: "粉色",
    orange: "橙色",
    green: "绿色",
    blue: "蓝色",
    purple: "紫色",
  };
  const PLACEHOLDER = "写点什么…";

  function normalizeColor(value) {
    const color = String(value || "").trim().toLowerCase();
    return COLORS.includes(color) ? color : "yellow";
  }

  function syncText(node) {
    const text = node?.querySelector?.(".canvas-note-text");
    if (!text) return "";
    const value = String(text.textContent || "");
    node.dataset.noteText = value;
    text.dataset.empty = value.trim() ? "false" : "true";
    return value;
  }

  function markColor(node) {
    const color = normalizeColor(node?.dataset.noteColor);
    node.dataset.noteColor = color;
    node.querySelectorAll("[data-note-swatch]").forEach((swatch) => {
      swatch.classList.toggle("is-active", swatch.dataset.noteSwatch === color);
    });
  }

  function setColor(node, color, context = {}) {
    if (!node?.classList?.contains("canvas-node-note")) return;
    node.dataset.noteColor = normalizeColor(color);
    markColor(node);
    context.syncCanvasNodeModel?.(node);
    context.scheduleCanvasSave?.();
  }

  function createPalette(node, context) {
    const document = context?.document || globalThis.document;
    const palette = document.createElement("div");
    palette.className = "canvas-note-palette";
    palette.setAttribute("role", "toolbar");
    palette.setAttribute("aria-label", "便签颜色");
    palette.addEventListener("pointerdown", (event) => event.stopPropagation());
    palette.addEventListener("dblclick", (event) => event.stopPropagation());
    COLORS.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "canvas-note-swatch";
      swatch.dataset.noteSwatch = color;
      swatch.dataset.noteColor = color;
      swatch.title = `便签颜色：${COLOR_LABELS[color]}`;
      swatch.setAttribute("aria-label", `便签颜色：${COLOR_LABELS[color]}`);
      swatch.addEventListener("click", (event) => {
        event.stopPropagation();
        setColor(node, color, context);
      });
      palette.append(swatch);
    });
    const divider = document.createElement("span");
    divider.className = "canvas-note-palette-divider";
    divider.setAttribute("aria-hidden", "true");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "canvas-note-remove";
    remove.title = "删除便签";
    remove.setAttribute("aria-label", "删除便签");
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      context?.deleteCanvasNodes?.([node]);
    });
    palette.append(divider, remove);
    return palette;
  }

  function positionPalette(node, context) {
    const document = context?.document || globalThis.document;
    const palette = node?.querySelector?.(".canvas-note-palette");
    if (!palette) return;
    const viewport = document.querySelector("#infiniteCanvas");
    if (!viewport) return;
    const top = viewport.getBoundingClientRect().top;
    const nodeTop = node.getBoundingClientRect().top;
    node.classList.toggle("is-palette-below", nodeTop - palette.offsetHeight - 14 < top);
  }

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      createCanvasPort,
      createCanvasResizeHandle,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      stopCanvasTextWheel,
    } = context;
    if (!document || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas note node renderer context is incomplete.");
    }

    const content = String(options?.text ?? "");
    node.dataset.noteColor = normalizeColor(options?.color);
    node.innerHTML = "";
    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const body = document.createElement("div");
    body.className = "canvas-note-body";
    const label = document.createElement("span");
    label.className = "canvas-note-label";
    label.textContent = "便签";
    const text = document.createElement("div");
    text.className = "canvas-note-text";
    text.contentEditable = "true";
    text.spellcheck = false;
    text.dataset.placeholder = PLACEHOLDER;
    text.textContent = content;
    text.dataset.empty = content.trim() ? "false" : "true";
    text.addEventListener("pointerdown", (event) => event.stopPropagation());
    if (stopCanvasTextWheel) text.addEventListener("wheel", stopCanvasTextWheel);
    text.addEventListener("input", () => syncText(node));
    text.addEventListener("blur", () => {
      syncText(node);
      scheduleCanvasSave?.();
    });
    body.append(label, text);
    node.append(inputPort, outputPort, createPalette(node, context), body, createCanvasResizeHandle());
    node.addEventListener("pointerenter", () => positionPalette(node, context));
    node.addEventListener("focusin", () => positionPalette(node, context));
    syncText(node);
    markColor(node);
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({
    normalizeColor,
    syncText,
    markColor,
    setColor,
    render,
  });
});
