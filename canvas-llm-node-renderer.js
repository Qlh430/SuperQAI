(function initCanvasLlmNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasLlmNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasLlmNodeRenderer() {
  "use strict";

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      createCanvasLlmPresetBar,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      defaultModel,
      fillCanvasLlmModelSelect,
      getCanvasLlmImages,
      renderCanvasLlmImages,
      runCanvasLlmNode,
      scheduleCanvasConnectionRender,
      selectCanvasNode,
      stopCanvasTextWheel,
      syncCanvasLlmPromptState,
      updateCanvasNodeRefs,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas LLM node renderer context is incomplete.");
    }

    const prompt = String(options?.prompt || "");
    const model = String(options?.model || "");
    const images = Array.isArray(options?.images) ? options.images : [];
    const output = String(options?.output || "");
    const previousPrompt = node.querySelector(".canvas-llm-prompt")?.value || node.dataset.llmPrompt || prompt;
    const previousModel = node.querySelector(".canvas-llm-model")?.value
      || node.dataset.llmModel || model || defaultModel || "";
    const previousOutput = node.dataset.llmOutput || output || "";
    const previousImages = images.length ? images : getCanvasLlmImages?.(node) || [];
    node.innerHTML = "";
    node.dataset.llmPrompt = previousPrompt;
    node.dataset.llmModel = previousModel;
    node.dataset.llmImages = JSON.stringify(previousImages);
    node.dataset.llmOutput = previousOutput;

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar("LLM语言节点");

    const imageStrip = document.createElement("div");
    imageStrip.className = "canvas-llm-images";
    renderCanvasLlmImages?.(node, imageStrip);

    const upload = document.createElement("button");
    upload.type = "button";
    upload.className = "canvas-llm-upload";
    upload.textContent = "＋ 上传图片";
    upload.addEventListener("click", (event) => {
      event.stopPropagation();
      selectCanvasNode?.(node);
      document.querySelector("#canvasNodeImageInput")?.click();
    });

    const promptBox = document.createElement("textarea");
    promptBox.className = "canvas-node-prompt canvas-llm-prompt";
    promptBox.rows = 4;
    promptBox.placeholder = "输入要让模型回答或反推图片的要求...";
    promptBox.value = previousPrompt;
    if (stopCanvasTextWheel) promptBox.addEventListener("wheel", stopCanvasTextWheel);
    promptBox.addEventListener("input", () => {
      node.dataset.llmPrompt = promptBox.value;
    });
    let presetBar = null;
    try {
      presetBar = createCanvasLlmPresetBar?.(node, promptBox) || null;
    } catch (error) {
      // Preset controls are optional and must not block the LLM node itself.
      console.warn("Canvas LLM preset bar failed to render.", error);
    }

    const controls = document.createElement("div");
    controls.className = "canvas-llm-controls";
    const select = document.createElement("select");
    select.className = "canvas-node-model canvas-llm-model";
    fillCanvasLlmModelSelect?.(select, previousModel);
    select.addEventListener("change", () => {
      node.dataset.llmModel = select.value;
    });
    const run = document.createElement("button");
    run.className = "canvas-node-run canvas-llm-run";
    run.type = "button";
    run.textContent = "生成文字";
    run.addEventListener("click", () => runCanvasLlmNode?.(node));
    controls.append(select, run);

    node.append(
      inputPort,
      outputPort,
      bar,
      imageStrip,
      upload,
      promptBox,
      ...(presetBar ? [presetBar] : []),
      controls,
      createCanvasResizeHandle(),
    );
    updateCanvasNodeRefs?.(node);
    syncCanvasLlmPromptState?.(node);
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
