(function initCanvasComfyNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasComfyNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasComfyNodeRenderer() {
  "use strict";

  const COMFY_MODES = [
    { value: "upscale", label: "图片放大" },
    { value: "upscale2", label: "图片放大2" },
    { value: "shoe-swap", label: "换鞋" },
    { value: "outpaint", label: "扩图 · Z-Image" },
    { value: "outpaint2", label: "扩图2 · RunningHub" },
    { value: "flux2-klein-edit", label: "Flux2 Klein 图片编辑" },
    { value: "qwen-edit-angle", label: "Qwen Edit 角度切换" },
    { value: "remove-background", label: "抠图 · ComfyUI" },
  ];

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      CANVAS_GENERATION_FAMILIES,
      createCanvasComfyOutpaintArea,
      createCanvasComfyQwenAngleFields,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      isCanvasComfyResolutionMode,
      normalizeCanvasComfyPadding,
      normalizeCanvasComfyQwenAngle,
      normalizeCanvasComfyResolution,
      runCanvasComfyNode,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      setCanvasComfyPadding,
      setCanvasComfyQwenAngle,
      setCanvasComfyResolutionFieldVisible,
      syncCanvasComfyResolutionOptions,
      updateCanvasComfyHint,
      updateCanvasComfyOutpaintPreview,
      updateCanvasNodeRefs,
    } = context;
    const missing = Object.entries({
      document,
      CANVAS_GENERATION_FAMILIES,
      createCanvasComfyOutpaintArea,
      createCanvasComfyQwenAngleFields,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      isCanvasComfyResolutionMode,
      normalizeCanvasComfyPadding,
      normalizeCanvasComfyQwenAngle,
      normalizeCanvasComfyResolution,
      runCanvasComfyNode,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      setCanvasComfyPadding,
      setCanvasComfyQwenAngle,
      setCanvasComfyResolutionFieldVisible,
      syncCanvasComfyResolutionOptions,
      updateCanvasComfyHint,
      updateCanvasComfyOutpaintPreview,
      updateCanvasNodeRefs,
    }).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) {
      throw new Error(`Canvas ComfyUI node renderer context is incomplete: ${missing.join(", ")}`);
    }

    const { mode = "", resolution = "", padding = null, qwenAngle = null } = options;
    const previousMode = node.querySelector(".canvas-comfy-mode")?.value || node.dataset.comfyMode || mode || "upscale2";
    const previousResolution = normalizeCanvasComfyResolution(
      node.querySelector(".canvas-comfy-resolution")?.value || node.dataset.comfyResolution || resolution || "2048",
    );
    const previousQwenAngle = normalizeCanvasComfyQwenAngle(qwenAngle || {
      horizontal: node.querySelector(".canvas-comfy-qwen-horizontal")?.value || node.dataset.comfyQwenHorizontal,
      vertical: node.querySelector(".canvas-comfy-qwen-vertical")?.value || node.dataset.comfyQwenVertical,
      zoom: node.querySelector(".canvas-comfy-qwen-zoom")?.value || node.dataset.comfyQwenZoom,
    });
    node.innerHTML = "";
    node.dataset.canvasNodeType = "comfy";
    node.dataset.comfyMode = previousMode;
    if (isCanvasComfyResolutionMode(previousMode)) node.dataset.comfyResolution = previousResolution;
    else delete node.dataset.comfyResolution;
    const previousPadding = normalizeCanvasComfyPadding(padding || {
      left: node.dataset.comfyOutpaintLeft,
      top: node.dataset.comfyOutpaintTop,
      right: node.dataset.comfyOutpaintRight,
      bottom: node.dataset.comfyOutpaintBottom,
    });
    setCanvasComfyPadding(node, previousPadding);
    setCanvasComfyQwenAngle(node, previousQwenAngle);

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar(CANVAS_GENERATION_FAMILIES.image.label);

    const refs = document.createElement("div");
    refs.className = "canvas-node-refs";

    const controls = document.createElement("div");
    controls.className = "canvas-node-controls canvas-comfy-controls";
    const modeField = document.createElement("label");
    modeField.className = "canvas-comfy-field canvas-comfy-mode-field";
    const modeLabel = document.createElement("span");
    modeLabel.textContent = "工作流";
    const modeSelect = document.createElement("select");
    modeSelect.className = "canvas-node-model canvas-comfy-mode";
    COMFY_MODES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      modeSelect.append(option);
    });
    modeSelect.value = COMFY_MODES.some((item) => item.value === previousMode) ? previousMode : "upscale2";
    modeSelect.addEventListener("change", () => {
      node.dataset.comfyMode = modeSelect.value;
      syncCanvasComfyResolutionOptions(modeSelect, resolutionSelect, node);
      setCanvasComfyResolutionFieldVisible(node, resolutionField, resolutionSelect, modeSelect.value);
      outpaintArea.hidden = !["outpaint", "outpaint2"].includes(modeSelect.value);
      qwenAngleArea.hidden = modeSelect.value !== "qwen-edit-angle";
      updateCanvasComfyOutpaintPreview(node);
      updateCanvasComfyHint(node);
      scheduleCanvasSave?.();
    });

    const resolutionSelect = document.createElement("select");
    resolutionSelect.className = "canvas-node-resolution canvas-comfy-resolution";
    const resolutionField = document.createElement("label");
    resolutionField.className = "canvas-comfy-field canvas-comfy-resolution-field";
    const resolutionLabel = document.createElement("span");
    resolutionLabel.textContent = "输出尺寸";
    resolutionSelect.value = previousResolution;
    syncCanvasComfyResolutionOptions(modeSelect, resolutionSelect, node);
    setCanvasComfyResolutionFieldVisible(node, resolutionField, resolutionSelect, modeSelect.value);
    resolutionSelect.addEventListener("change", () => {
      if (isCanvasComfyResolutionMode(modeSelect.value)) node.dataset.comfyResolution = resolutionSelect.value;
      else delete node.dataset.comfyResolution;
      updateCanvasComfyHint(node);
      scheduleCanvasSave?.();
    });

    const run = document.createElement("button");
    run.className = "canvas-node-run canvas-comfy-run";
    run.type = "button";
    run.textContent = "执行";
    run.addEventListener("click", () => runCanvasComfyNode?.(node));
    modeField.append(modeLabel, modeSelect);
    resolutionField.append(resolutionLabel, resolutionSelect);
    const actionRow = document.createElement("div");
    actionRow.className = "canvas-comfy-action-row";
    actionRow.append(resolutionField, run);
    controls.append(modeField, actionRow);

    const hint = document.createElement("p");
    hint.className = "canvas-comfy-hint";
    const inputSummary = document.createElement("section");
    inputSummary.className = "canvas-comfy-input-summary";
    inputSummary.append(refs, hint);

    const outpaintArea = createCanvasComfyOutpaintArea(node);
    outpaintArea.hidden = !["outpaint", "outpaint2"].includes(modeSelect.value);
    const qwenAngleArea = createCanvasComfyQwenAngleFields(node, previousQwenAngle);
    qwenAngleArea.hidden = modeSelect.value !== "qwen-edit-angle";

    node.append(inputPort, outputPort, bar, inputSummary, outpaintArea, qwenAngleArea, controls, createCanvasResizeHandle());
    updateCanvasNodeRefs(node);
    updateCanvasComfyOutpaintPreview(node);
    updateCanvasComfyHint(node);
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
