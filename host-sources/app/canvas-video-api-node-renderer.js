(function initCanvasVideoApiNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasVideoApiNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasVideoApiNodeRenderer() {
  "use strict";

  function normalizePrevious(node, options) {
    return {
      prompt: options.prompt ?? node.querySelector(".canvas-api-video-prompt")?.value ?? node.dataset.apiVideoPrompt ?? "",
      model: options.model ?? node.dataset.apiVideoModel ?? "",
      ratio: options.ratio ?? node.dataset.apiVideoRatio ?? "",
      resolution: options.resolution ?? node.dataset.apiVideoResolution ?? "",
      duration: options.duration ?? node.dataset.apiVideoDuration ?? "",
      taskId: options.taskId ?? node.dataset.apiVideoTaskId ?? "",
    };
  }

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      CANVAS_GENERATION_FAMILIES,
      createCanvasH3Number,
      createCanvasH3Select,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      fillCanvasApiVideoModelSelect,
      runCanvasApiVideoNode,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      stopCanvasTextWheel,
      syncCanvasApiVideoControls,
      syncCanvasApiVideoPrompt,
      syncCanvasApiVideoRunButton,
      watchCanvasApiVideoTask,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle
      || !CANVAS_GENERATION_FAMILIES || !createCanvasH3Select || !createCanvasH3Number
      || !fillCanvasApiVideoModelSelect || !syncCanvasApiVideoControls
      || !syncCanvasApiVideoPrompt || !syncCanvasApiVideoRunButton) {
      throw new Error("Canvas API video node renderer context is incomplete.");
    }

    const previous = normalizePrevious(node, options);
    node.innerHTML = "";
    node.dataset.apiVideoPrompt = String(previous.prompt || "");
    node.dataset.apiVideoModel = String(previous.model || "");
    node.dataset.apiVideoRatio = String(previous.ratio || "");
    node.dataset.apiVideoResolution = String(previous.resolution || "");
    node.dataset.apiVideoDuration = String(previous.duration || "");
    node.dataset.apiVideoTaskId = String(previous.taskId || "");

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar(CANVAS_GENERATION_FAMILIES.video.label);

    const promptField = document.createElement("label");
    promptField.className = "canvas-h3-field canvas-api-video-prompt";
    const promptCaption = document.createElement("span");
    promptCaption.textContent = "视频描述";
    const prompt = document.createElement("textarea");
    prompt.className = "canvas-api-video-prompt-input";
    prompt.rows = 5;
    prompt.placeholder = "描述镜头、人物、动作与画面节奏。";
    prompt.value = previous.prompt;
    if (stopCanvasTextWheel) prompt.addEventListener("wheel", stopCanvasTextWheel);
    prompt.addEventListener("input", () => {
      node.dataset.apiVideoPrompt = prompt.value;
      scheduleCanvasSave?.();
    });
    promptField.append(promptCaption, prompt);

    const modelField = document.createElement("label");
    modelField.className = "canvas-h3-field canvas-api-video-model-field";
    const modelCaption = document.createElement("span");
    modelCaption.textContent = "模型";
    const modelSelect = document.createElement("select");
    modelSelect.className = "canvas-api-video-model";
    fillCanvasApiVideoModelSelect(modelSelect, previous.model);
    modelSelect.addEventListener("change", () => {
      node.dataset.apiVideoModel = modelSelect.value;
      syncCanvasApiVideoControls(node);
      scheduleCanvasSave?.();
    });
    modelField.append(modelCaption, modelSelect);

    const reference = document.createElement("p");
    reference.className = "canvas-api-video-reference";

    const controls = document.createElement("div");
    controls.className = "canvas-h3-controls canvas-api-video-controls";
    const ratioField = createCanvasH3Select("画幅", [], previous.ratio, "apiVideoRatio", node);
    ratioField.classList.add("canvas-api-video-ratio-field");
    const resolutionField = createCanvasH3Select("清晰度", [], previous.resolution, "apiVideoResolution", node);
    resolutionField.querySelector("select")?.classList.add("canvas-api-video-resolution");
    const durationField = createCanvasH3Number(
      "时长（秒）", previous.duration || 4, 4, 15, 1, "apiVideoDuration", node,
    );
    durationField.classList.add("canvas-api-video-duration-field");
    const durationHint = document.createElement("small");
    durationHint.className = "canvas-api-video-duration-hint";
    durationField.append(durationHint);
    controls.append(modelField, ratioField, resolutionField, durationField);

    const actions = document.createElement("div");
    actions.className = "canvas-node-actions";
    const run = document.createElement("button");
    run.type = "button";
    run.className = "canvas-node-run canvas-api-video-run";
    run.addEventListener("click", () => runCanvasApiVideoNode?.(node));
    actions.append(run);

    const footer = document.createElement("div");
    footer.className = "canvas-h3-footer";
    const status = document.createElement("span");
    status.className = "canvas-h3-status";
    status.textContent = "输入描述即可生成";
    footer.append(status);

    node.append(inputPort, outputPort, bar, promptField, reference, controls, actions, footer, createCanvasResizeHandle());
    syncCanvasApiVideoRunButton(node);
    syncCanvasApiVideoControls(node);
    syncCanvasApiVideoPrompt(node);
    if (node.dataset.apiVideoTaskId) watchCanvasApiVideoTask?.(node, 2000);
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
