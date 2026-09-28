(function initCanvasMidjourneyNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasMidjourneyNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasMidjourneyNodeRenderer() {
  "use strict";

  function normalizePrevious(node, options, context) {
    const {
      CANVAS_MIDJOURNEY_OPERATIONS,
      CANVAS_MIDJOURNEY_SPEEDS,
      MIDJOURNEY_DEFAULT_OPTIONS,
    } = context;
    const previous = {
      operation: options.operation ?? node.dataset.midjourneyOperation ?? "imagine",
      prompt: options.prompt ?? node.querySelector(".canvas-midjourney-prompt-input")?.value ?? node.dataset.midjourneyPrompt ?? "",
      model: options.model ?? node.querySelector(".canvas-midjourney-model")?.value ?? node.dataset.midjourneyModel ?? "",
      size: options.size ?? node.dataset.midjourneySize ?? "1:1",
      version: String(options.version ?? node.dataset.midjourneyVersion ?? MIDJOURNEY_DEFAULT_OPTIONS.version),
      speed: options.speed ?? node.dataset.midjourneySpeed ?? MIDJOURNEY_DEFAULT_OPTIONS.speed,
    };
    return {
      ...previous,
      operation: CANVAS_MIDJOURNEY_OPERATIONS.some((item) => item.id === previous.operation)
        ? previous.operation
        : "imagine",
      speed: CANVAS_MIDJOURNEY_SPEEDS.includes(previous.speed)
        ? previous.speed
        : MIDJOURNEY_DEFAULT_OPTIONS.speed,
    };
  }

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      CANVAS_MIDJOURNEY_OPERATIONS,
      CANVAS_MIDJOURNEY_SPEEDS,
      MIDJOURNEY_DEFAULT_OPTIONS,
      MIDJOURNEY_IMAGE_RATIOS,
      MIDJOURNEY_STANDARD_VERSIONS,
      createCanvasH3Select,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      fillCanvasMidjourneyModelSelect,
      readCanvasMidjourneyOperation,
      runCanvasMidjourneyNode,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      setCanvasNodeStatus,
      stopCanvasTextWheel,
      syncCanvasMidjourneyControls,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle
      || !CANVAS_MIDJOURNEY_OPERATIONS || !CANVAS_MIDJOURNEY_SPEEDS
      || !MIDJOURNEY_DEFAULT_OPTIONS || !MIDJOURNEY_IMAGE_RATIOS
      || !MIDJOURNEY_STANDARD_VERSIONS || !createCanvasH3Select
      || !fillCanvasMidjourneyModelSelect || !readCanvasMidjourneyOperation
      || !syncCanvasMidjourneyControls) {
      throw new Error("Canvas Midjourney node renderer context is incomplete.");
    }

    const previous = normalizePrevious(node, options, context);
    node.innerHTML = "";
    node.dataset.midjourneyOperation = previous.operation;
    node.dataset.midjourneyPrompt = String(previous.prompt || "");
    node.dataset.midjourneySize = String(previous.size || "1:1");
    node.dataset.midjourneyVersion = String(previous.version || MIDJOURNEY_DEFAULT_OPTIONS.version);
    node.dataset.midjourneySpeed = previous.speed;

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar("Midjourney");

    const operationField = document.createElement("label");
    operationField.className = "canvas-h3-field canvas-midjourney-operation-field";
    const operationCaption = document.createElement("span");
    operationCaption.textContent = "操作";
    const operationSelect = document.createElement("select");
    operationSelect.className = "canvas-midjourney-operation";
    CANVAS_MIDJOURNEY_OPERATIONS.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      operationSelect.append(option);
    });
    operationSelect.value = previous.operation;
    operationSelect.addEventListener("change", () => {
      node.dataset.midjourneyOperation = readCanvasMidjourneyOperation(node);
      syncCanvasMidjourneyControls(node);
      setCanvasNodeStatus?.(node, "参数已更新");
      scheduleCanvasSave?.();
    });
    operationField.append(operationCaption, operationSelect);

    const promptField = document.createElement("label");
    promptField.className = "canvas-h3-field canvas-midjourney-prompt";
    const promptCaption = document.createElement("span");
    promptCaption.textContent = "提示词";
    const prompt = document.createElement("textarea");
    prompt.className = "canvas-midjourney-prompt-input";
    prompt.rows = 4;
    prompt.placeholder = "描述画面，可写 Midjourney 参数之外的风格词。";
    prompt.value = previous.prompt;
    if (stopCanvasTextWheel) prompt.addEventListener("wheel", stopCanvasTextWheel);
    prompt.addEventListener("input", () => {
      if (prompt.readOnly) return;
      node.dataset.midjourneyPrompt = prompt.value;
      scheduleCanvasSave?.();
    });
    promptField.append(promptCaption, prompt);

    const modelField = document.createElement("label");
    modelField.className = "canvas-h3-field canvas-midjourney-model-field";
    const modelCaption = document.createElement("span");
    modelCaption.textContent = "模型";
    const modelSelect = document.createElement("select");
    modelSelect.className = "canvas-midjourney-model";
    fillCanvasMidjourneyModelSelect(modelSelect, previous.model);
    node.dataset.midjourneyModel = modelSelect.value;
    modelSelect.addEventListener("change", () => {
      node.dataset.midjourneyModel = modelSelect.value;
      scheduleCanvasSave?.();
    });
    modelField.append(modelCaption, modelSelect);

    const reference = document.createElement("p");
    reference.className = "canvas-midjourney-reference";

    const controls = document.createElement("div");
    controls.className = "canvas-h3-controls canvas-midjourney-controls";
    const sizeField = createCanvasH3Select(
      "比例",
      MIDJOURNEY_IMAGE_RATIOS.map((item) => [item.value, item.label]),
      previous.size,
      "midjourneySize",
      node,
    );
    sizeField.querySelector("select")?.classList.add("canvas-node-size", "canvas-midjourney-size");
    const versionField = createCanvasH3Select(
      "版本",
      MIDJOURNEY_STANDARD_VERSIONS.map((value) => [value, `V${value}`]),
      previous.version,
      "midjourneyVersion",
      node,
    );
    const speedField = createCanvasH3Select(
      "速度",
      CANVAS_MIDJOURNEY_SPEEDS.map((value) => [value, value]),
      node.dataset.midjourneySpeed,
      "midjourneySpeed",
      node,
    );
    controls.append(modelField, sizeField, versionField, speedField);

    const actions = document.createElement("div");
    actions.className = "canvas-node-actions";
    const run = document.createElement("button");
    run.type = "button";
    run.className = "canvas-node-run canvas-midjourney-run";
    run.innerHTML = '<i data-lucide="wand-sparkles"></i><span>生成图片</span>';
    run.addEventListener("click", () => runCanvasMidjourneyNode?.(node));
    actions.append(run);

    const footer = document.createElement("div");
    footer.className = "canvas-h3-footer";
    const status = document.createElement("span");
    status.className = "canvas-h3-status";
    status.textContent = "选择操作即可生成";
    footer.append(status);

    node.append(inputPort, outputPort, bar, operationField, promptField, reference, controls, actions, footer, createCanvasResizeHandle());
    syncCanvasMidjourneyControls(node);
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
