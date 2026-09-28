(function initCanvasComfyOutpaintUi(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasComfyOutpaintUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasComfyOutpaintUi() {
  "use strict";

  function syncPaddingInputs(options = {}) {
    const node = options.node;
    if (!node || typeof options.getPadding !== "function") return;
    const padding = options.getPadding(node);
    node.querySelectorAll?.("[data-padding-side]").forEach((input) => {
      input.value = padding[input.dataset.paddingSide];
    });
  }

  function createOutpaintArea(options = {}) {
    const document = options.document || globalThis.document;
    const node = options.node;
    if (!document || !node) throw new Error("ComfyUI outpaint UI requires a document and node.");

    const area = document.createElement("section");
    area.className = "canvas-comfy-outpaint";
    area.innerHTML = `
      <div class="canvas-comfy-outpaint-head">
        <strong>扩展图片区域</strong>
        <span>从原图边缘向外拖动</span>
      </div>
      <div class="canvas-comfy-outpaint-preview">
        <div class="canvas-comfy-outpaint-frame">
          <div class="canvas-comfy-outpaint-image"><span>连接图片后预览</span></div>
          <button class="canvas-comfy-outpaint-handle is-top" type="button" data-comfy-outpaint-side="top" aria-label="从原图向上扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-right" type="button" data-comfy-outpaint-side="right" aria-label="从原图向右扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-bottom" type="button" data-comfy-outpaint-side="bottom" aria-label="从原图向下扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-left" type="button" data-comfy-outpaint-side="left" aria-label="从原图向左扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-top-left" type="button" data-comfy-outpaint-side="top-left" aria-label="从原图向左上扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-top-right" type="button" data-comfy-outpaint-side="top-right" aria-label="从原图向右上扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-bottom-right" type="button" data-comfy-outpaint-side="bottom-right" aria-label="从原图向右下扩展"></button>
          <button class="canvas-comfy-outpaint-handle is-bottom-left" type="button" data-comfy-outpaint-side="bottom-left" aria-label="从原图向左下扩展"></button>
        </div>
      </div>
      <div class="canvas-comfy-padding-grid">
        <label><span>上</span><input type="number" min="0" max="1600" step="8" data-padding-side="top"></label>
        <label><span>右</span><input type="number" min="0" max="1600" step="8" data-padding-side="right"></label>
        <label><span>下</span><input type="number" min="0" max="1600" step="8" data-padding-side="bottom"></label>
        <label><span>左</span><input type="number" min="0" max="1600" step="8" data-padding-side="left"></label>
      </div>
    `;
    const padding = options.getPadding?.(node) || {};
    area.querySelectorAll("[data-padding-side]").forEach((input) => {
      input.value = padding[input.dataset.paddingSide];
      input.addEventListener("input", () => {
        const next = options.getPadding?.(node) || {};
        next[input.dataset.paddingSide] = input.value;
        options.setPadding?.(node, options.normalizePadding?.(next) || next);
        options.onPreview?.(node);
        options.onHint?.(node);
        options.onSave?.();
      });
      input.addEventListener("change", () => syncPaddingInputs({
        node,
        getPadding: options.getPadding,
      }));
    });
    area.addEventListener("pointerdown", (event) => options.onPointerDown?.(event, node));
    return area;
  }

  return Object.freeze({
    createOutpaintArea,
    syncPaddingInputs,
  });
});
