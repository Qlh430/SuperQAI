(function initCanvasGeneratorNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGeneratorNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGeneratorNodeRenderer() {
  "use strict";

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      CANVAS_GENERATION_FAMILIES,
      MIDJOURNEY_DEFAULT_OPTIONS,
      applyCanvasNodeSize,
      canvasImageModelPickers,
      canvasState,
      createCanvasCustomSizeField,
      createCanvasMidjourneyOptions,
      createCanvasModelParameterOptions,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      createCanvasResultDownload,
      enhanceCanvasImageModelSelect,
      fillCanvasNodeModelSelect,
      fillCanvasNodeResolutionSelect,
      fillCanvasNodeSizeSelect,
      getImageModelPlatform,
      imageModelInput,
      imageResolutionInput,
      imageSizeInput,
      readCanvasModelParameters,
      registerCanvasDetailImage,
      rememberConcreteImageResolution,
      runCanvasImageEdit,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      selectCanvasNode,
      stopCanvasTextWheel,
      syncCanvasMidjourneyOptions,
      syncCanvasModelParameterOptions,
      syncCanvasNodeResolutionState,
      syncCanvasCustomSizeField,
      uniqueCanvasImageName,
      updateCanvasNodeRefs,
      updateCanvasNodeResolutionAvailability,
      updateCanvasRunButtonLabel,
    } = context;
    if (!document || !CANVAS_GENERATION_FAMILIES || !MIDJOURNEY_DEFAULT_OPTIONS
      || !canvasImageModelPickers || !canvasState || !imageModelInput
      || !imageSizeInput || !imageResolutionInput || !createCanvasNodeBar
      || !createCanvasPort || !createCanvasResizeHandle || !createCanvasResultDownload
      || !createCanvasCustomSizeField || !createCanvasMidjourneyOptions
      || !createCanvasModelParameterOptions || !enhanceCanvasImageModelSelect
      || !fillCanvasNodeModelSelect || !fillCanvasNodeResolutionSelect
      || !fillCanvasNodeSizeSelect || !getImageModelPlatform
      || !readCanvasModelParameters || !registerCanvasDetailImage
      || !rememberConcreteImageResolution || !scheduleCanvasConnectionRender
      || !scheduleCanvasSave || !selectCanvasNode || !stopCanvasTextWheel
      || !syncCanvasMidjourneyOptions || !syncCanvasModelParameterOptions
      || !syncCanvasNodeResolutionState || !syncCanvasCustomSizeField
      || !uniqueCanvasImageName
      || !updateCanvasNodeRefs || !updateCanvasNodeResolutionAvailability
      || !updateCanvasRunButtonLabel) {
      throw new Error("Canvas image generator node renderer context is incomplete.");
    }

    const { src = "", name = CANVAS_GENERATION_FAMILIES.image.label, reusableImage = null } = options;
    const previousModelSelect = node.querySelector(".canvas-node-model");
    const previousModelPicker = previousModelSelect ? canvasImageModelPickers.get(previousModelSelect) : null;
    const previousPrompt = Object.hasOwn(options, "prompt")
      ? String(options.prompt ?? "")
      : node.querySelector(".canvas-node-prompt")?.value || "";
    const previousModel = previousModelSelect?.value || node.dataset.canvasModel || imageModelInput.value || "";
    const previousPlatform = node.dataset.canvasPlatform || getImageModelPlatform(previousModel) || "openai";
    const previousModelSelection = previousModelSelect?.dataset.modelSelection
      || node.dataset.modelSelection
      || imageModelInput.dataset.modelSelection
      || "auto";
    const previousSize = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || imageSizeInput.value || "1024x1024";
    const previousResolution = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || imageResolutionInput.value || "1";
    const previousMidjourney = {
      version: node.querySelector(".canvas-midjourney-version")?.value || node.dataset.canvasMidjourneyVersion || MIDJOURNEY_DEFAULT_OPTIONS.version,
      mode: node.querySelector(".canvas-midjourney-mode")?.value || node.dataset.canvasMidjourneyMode || MIDJOURNEY_DEFAULT_OPTIONS.mode,
      speed: node.querySelector(".canvas-midjourney-speed")?.value || node.dataset.canvasMidjourneySpeed || MIDJOURNEY_DEFAULT_OPTIONS.speed,
      quality: node.querySelector(".canvas-midjourney-quality")?.value || node.dataset.canvasMidjourneyQuality || MIDJOURNEY_DEFAULT_OPTIONS.quality,
      style: node.querySelector(".canvas-midjourney-style")?.value || node.dataset.canvasMidjourneyStyle || MIDJOURNEY_DEFAULT_OPTIONS.style,
      stylize: Number(node.querySelector(".canvas-midjourney-stylize")?.value || node.dataset.canvasMidjourneyStylize || MIDJOURNEY_DEFAULT_OPTIONS.stylize),
    };
    const previousModelParameters = readCanvasModelParameters(node);
    const resolvedName = uniqueCanvasImageName(node, name || "图片");
    previousModelPicker?.destroy?.();
    if (previousModelSelect) canvasImageModelPickers.delete(previousModelSelect);
    node.innerHTML = "";
    node.dataset.imageSrc = src || "";
    node.dataset.imageName = resolvedName;
    node.dataset.originalSrc = src || "";
    delete node.dataset.maskSrc;
    delete node.dataset.maskName;
    delete node.dataset.openaiMaskSrc;
    delete node.dataset.openaiMaskName;
    delete node.dataset.maskBaseSrc;
    delete node.dataset.maskBaseName;
    node.dataset.canvasModel = previousModel;
    node.dataset.canvasEngine = "api";
    node.dataset.canvasPlatform = previousPlatform;
    node.dataset.modelSelection = previousModelSelection;
    node.dataset.canvasSize = previousSize;
    node.dataset.canvasResolution = previousResolution;
    node.dataset.canvasMidjourneyVersion = previousMidjourney.version;
    node.dataset.canvasMidjourneyMode = previousMidjourney.mode;
    node.dataset.canvasMidjourneySpeed = previousMidjourney.speed;
    node.dataset.canvasMidjourneyQuality = previousMidjourney.quality;
    node.dataset.canvasMidjourneyStyle = previousMidjourney.style;
    node.dataset.canvasMidjourneyStylize = String(previousMidjourney.stylize);
    node.classList.toggle("canvas-node-frameless", Boolean(src));
    node.classList.toggle("canvas-node-generator", !src);
    node.classList.toggle("canvas-node-api", !src);
    if (src) delete node.dataset.canvasNodeType;
    else node.dataset.canvasNodeType = "api";
    delete node.dataset.comfyWorkflow;
    delete node.dataset.comfyMode;
    delete node.dataset.comfyResolution;

    const outputPort = createCanvasPort("output");
    const media = document.createElement("div");
    media.className = `canvas-image-upload${src ? " has-image" : ""}`;
    media.hidden = !src && Boolean(node.dataset.resultSrc);
    media.title = src ? "单击显示图片操作，双击查看原图" : "双击上传图片";
    if (src) {
      const reusableSource = String(reusableImage?.getAttribute?.("data-original-src") || "");
      const img = reusableImage && reusableSource === String(src)
        ? reusableImage
        : document.createElement("img");
      img.alt = resolvedName;
      img.addEventListener("load", scheduleCanvasConnectionRender);
      if (img !== reusableImage) registerCanvasDetailImage(img, src);
      media.append(img);
    } else {
      const title = document.createElement("strong");
      title.textContent = "上传图片";
      const hint = document.createElement("span");
      hint.textContent = "点击选择，或把图片拖进画布";
      media.append(title, hint);
    }
    media.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectCanvasNode(node);
      document.querySelector("#canvasNodeImageInput")?.click();
    });

    const refs = document.createElement("div");
    refs.className = "canvas-node-refs";

    const result = document.createElement("div");
    result.className = "canvas-node-result";
    result.hidden = !node.dataset.resultSrc;
    if (node.dataset.resultSrc) {
      const resultImg = document.createElement("img");
      resultImg.alt = "生成结果";
      resultImg.addEventListener("load", scheduleCanvasConnectionRender);
      registerCanvasDetailImage(resultImg, node.dataset.resultSrc);
      result.append(resultImg);
      result.append(createCanvasResultDownload(node));
    }

    const bar = createCanvasNodeBar(resolvedName, { editable: true });
    const hasIncoming = canvasState.connections.some((item) => item.to === node.dataset.id);
    if (src) {
      if (hasIncoming) {
        node.append(createCanvasPort("input"), outputPort, bar, media, refs, createCanvasResizeHandle());
        updateCanvasNodeRefs(node);
      } else {
        node.append(outputPort, bar, media, createCanvasResizeHandle());
      }
      applyCanvasNodeSize(node);
      scheduleCanvasConnectionRender();
      return;
    }

    const inputPort = createCanvasPort("input");
    const prompt = document.createElement("textarea");
    prompt.className = "canvas-node-prompt";
    prompt.rows = 3;
    prompt.placeholder = "输入生成提示词，连接文字节点后会自动填充";
    prompt.value = previousPrompt;
    prompt.addEventListener("wheel", stopCanvasTextWheel);

    const controls = document.createElement("div");
    controls.className = "canvas-node-controls";
    const model = document.createElement("select");
    model.className = "canvas-node-model";
    fillCanvasNodeModelSelect(model, previousModel);
    model.dataset.modelSelection = previousModelSelection;
    node.dataset.canvasModel = model.value;
    node.dataset.canvasPlatform = getImageModelPlatform(model.value) || previousPlatform;
    const size = document.createElement("select");
    size.className = "canvas-node-size";
    fillCanvasNodeSizeSelect(size, previousSize, model.value);
    const customSizeField = createCanvasCustomSizeField(node, previousSize);
    const resolution = document.createElement("select");
    resolution.className = "canvas-node-resolution";
    fillCanvasNodeResolutionSelect(resolution, previousResolution, model.value, size.value);
    const run = document.createElement("button");
    run.className = "canvas-node-run";
    run.type = "button";
    updateCanvasRunButtonLabel(run, model.value);
    run.addEventListener("click", () => runCanvasImageEdit(node, { autoFailover: true }));
    const syncApiControls = () => {
      node.dataset.canvasEngine = "api";
      node.dataset.canvasNodeType = "api";
      node.dataset.canvasModel = model.value;
      node.dataset.canvasPlatform = getImageModelPlatform(model.value) || previousPlatform;
      model.dataset.platform = node.dataset.canvasPlatform;
      fillCanvasNodeSizeSelect(size, node.dataset.canvasSize || previousSize, model.value);
      node.dataset.canvasSize = size.value;
      fillCanvasNodeResolutionSelect(resolution, node.dataset.canvasResolution || previousResolution, model.value, size.value);
      node.dataset.canvasResolution = resolution.value;
      updateCanvasNodeResolutionAvailability(node);
      syncCanvasMidjourneyOptions(node, model.value);
      syncCanvasModelParameterOptions(node, model.value, previousModelParameters);
      updateCanvasRunButtonLabel(run, model.value);
      scheduleCanvasSave();
    };
    model.addEventListener("change", () => {
      const nextModel = model.value;
      node.dataset.canvasModel = nextModel;
      node.dataset.canvasPlatform = getImageModelPlatform(nextModel) || node.dataset.canvasPlatform || previousPlatform;
      model.dataset.platform = node.dataset.canvasPlatform;
      node.dataset.modelSelection = model.dataset.modelSelection || "exact";
      fillCanvasNodeSizeSelect(size, node.dataset.canvasSize, nextModel);
      node.dataset.canvasSize = size.value;
      syncCanvasCustomSizeField(node);
      const resolutionSize = size.value === "custom" ? node.dataset.canvasSize : size.value;
      fillCanvasNodeResolutionSelect(resolution, node.dataset.canvasResolution, nextModel, resolutionSize);
      node.dataset.canvasResolution = resolution.value;
      updateCanvasNodeResolutionAvailability(node);
      syncCanvasMidjourneyOptions(node, nextModel);
      syncCanvasModelParameterOptions(node, nextModel);
      updateCanvasRunButtonLabel(run, nextModel);
    });
    size.addEventListener("change", () => {
      node.dataset.canvasSize = size.value;
      syncCanvasCustomSizeField(node);
      const resolutionSize = size.value === "custom" ? node.dataset.canvasSize : size.value;
      fillCanvasNodeResolutionSelect(resolution, node.dataset.canvasResolution || resolution.value, model.value, resolutionSize);
      node.dataset.canvasResolution = resolution.value;
      updateCanvasNodeResolutionAvailability(node);
      updateCanvasRunButtonLabel(run, model.value);
    });
    resolution.addEventListener("change", () => {
      node.dataset.canvasResolution = resolution.value;
      rememberConcreteImageResolution(resolution);
      updateCanvasRunButtonLabel(run, model.value);
      syncCanvasNodeResolutionState(node);
    });
    const resolutionHelp = document.createElement("small");
    resolutionHelp.className = "canvas-node-resolution-help";
    resolutionHelp.hidden = true;
    const midjourneyOptions = createCanvasMidjourneyOptions(node, previousMidjourney);
    const modelOptions = createCanvasModelParameterOptions(node);
    controls.append(model, size, resolution, run, customSizeField, resolutionHelp, midjourneyOptions, modelOptions);
    enhanceCanvasImageModelSelect(model);

    node.append(inputPort, outputPort, bar, refs, prompt, controls, createCanvasResizeHandle());
    updateCanvasNodeResolutionAvailability(node);
    syncCanvasMidjourneyOptions(node, model.value, previousMidjourney);
    syncCanvasModelParameterOptions(node, model.value, previousModelParameters);
    syncApiControls();
    updateCanvasNodeRefs(node);
    scheduleCanvasConnectionRender();
  }

  return Object.freeze({ render });
});
