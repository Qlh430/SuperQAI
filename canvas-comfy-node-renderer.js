(function initCanvasComfyNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasComfyNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasComfyNodeRenderer() {
  "use strict";

  // 图片生成的 ComfyUI 模型只保留 Qwen-image2.1：它按输入自动走「图像编辑」或
  // 「生图」，放大 / 扩图 / 换角度 / 抠图 / 裁剪都搬到节点工具栏，不再混进模型列表。
  const COMFY_MODES = [
    { value: "qwen-image21", label: "Qwen-image2.1" },
  ];
  // 比例：取值必须是工作流 ResolutionSelector 的下拉值，标签用短写法（与 API 版同款）。
  const COMFY_ASPECT_RATIOS = [
    { value: "1:1 (Square)", label: "1:1" },
    { value: "2:3 (Portrait Photo)", label: "2:3" },
    { value: "3:2 (Photo)", label: "3:2" },
    { value: "3:4 (Portrait Standard)", label: "3:4" },
    { value: "4:3 (Standard)", label: "4:3" },
    { value: "9:16 (Portrait Widescreen)", label: "9:16" },
    { value: "16:9 (Widescreen)", label: "16:9" },
    { value: "21:9 (Ultrawide)", label: "21:9" },
  ];
  // 分辨率按「长边」定档（与 API 面板同一口径），提交给工作流的却是总像素：工作流
  // 的 ResolutionSelector 只认 megapixels，所以每档要按当前比例换算（1:1 时 1K≈1 MP）。
  const COMFY_RESOLUTION_TIERS = [
    { tier: "1", longEdge: 1024 },
    { tier: "2", longEdge: 2048 },
    { tier: "4", longEdge: 3840, note: "显存占用大" },
  ];
  const DEFAULT_COMFY_MODE = "qwen-image21";
  const DEFAULT_ASPECT_RATIO = "1:1 (Square)";
  const DEFAULT_COMFY_TIER = "1";

  function normalizeComfyAspectRatio(value) {
    const text = String(value || "");
    return COMFY_ASPECT_RATIOS.some((item) => item.value === text) ? text : DEFAULT_ASPECT_RATIO;
  }

  function parseComfyAspectRatio(value) {
    const match = /(\d+)\s*:\s*(\d+)/.exec(String(value || ""));
    const width = match ? Number(match[1]) : 1;
    const height = match ? Number(match[2]) : 1;
    return width > 0 && height > 0 ? { width, height } : { width: 1, height: 1 };
  }

  function findComfyTier(value) {
    const text = String(value ?? "").trim();
    return COMFY_RESOLUTION_TIERS.find((item) => item.tier === text) || null;
  }

  // 档位 + 比例 → 总像素（MP，两位小数）。工作流按比例保持宽高比、总像素取该值。
  function comfyMegapixelsFor(aspectRatio, tier) {
    const spec = findComfyTier(tier) || COMFY_RESOLUTION_TIERS[0];
    const { width, height } = parseComfyAspectRatio(aspectRatio);
    const longEdge = spec.longEdge;
    const shortEdge = longEdge * (Math.min(width, height) / Math.max(width, height));
    // 取到百万分之一并向下取整：工作流那边是把每条边向上取到 32 的倍数，
    // 稍有超量就会把 2048 顶成 2080（实测 2 位小数的 2.36 会出 1184×2112），
    // 所以提交值必须略小于名义面积，才落在 1024/1152/2048 这条网格上。
    return Math.floor(((longEdge * shortEdge) / 1e6) * 1e6) / 1e6;
  }

  // 档位 + 比例 → 宽高预览（长边固定、短边按比例、取 32 的倍数，和 ResolutionSelector
  // 的 multiple=32 一致），用于档位按钮的悬停提示。
  // 与工作流同一套尺寸算法（用一次真实出图反推并核对过）：拿总像素按比例算短边、
  // 向上取到 32 的倍数，长边再按比例回推并取整。
  function comfyPixelSizeForMegapixels(megapixels, aspectRatio) {
    const { width, height } = parseComfyAspectRatio(aspectRatio);
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    const area = Number(megapixels) * 1e6;
    const ceil32 = (value) => Math.max(32, Math.round(Math.ceil(value / 32) * 32));
    const shortEdge = ceil32(Math.sqrt(area * (short / long)));
    const longEdge = ceil32(shortEdge * (long / short));
    return width >= height ? `${longEdge}×${shortEdge}` : `${shortEdge}×${longEdge}`;
  }

  function comfyPixelSizeFor(aspectRatio, tier) {
    return comfyPixelSizeForMegapixels(comfyMegapixelsFor(aspectRatio, tier), aspectRatio);
  }

  // 老节点只有像素档（0.5~4 MP）时按长边就近归档，避免打开就跳档。
  function comfyTierForMegapixels(aspectRatio, megapixels) {
    const pixels = Number(megapixels);
    if (!Number.isFinite(pixels) || pixels <= 0) return DEFAULT_COMFY_TIER;
    const { width, height } = parseComfyAspectRatio(aspectRatio);
    const longEdge = Math.sqrt(pixels * 1e6 * (Math.max(width, height) / Math.min(width, height)));
    return COMFY_RESOLUTION_TIERS
      .reduce((best, spec) => Math.abs(Math.log(longEdge) - Math.log(spec.longEdge)) < Math.abs(Math.log(longEdge) - Math.log(best.longEdge)) ? spec : best, COMFY_RESOLUTION_TIERS[0])
      .tier;
  }

  // 像素档下拉就是「分辨率」那一栏：三个档位，取值随比例换算成工作流要的 MP。
  function syncComfyMegapixelOptions(node, aspectSelect, megapixelsSelect) {
    const aspect = normalizeComfyAspectRatio(aspectSelect?.value || node.dataset.comfyAspectRatio);
    const savedTier = findComfyTier(node.dataset.comfyTier);
    const tier = (savedTier ? savedTier.tier : comfyTierForMegapixels(aspect, node.dataset.comfyMegapixels));
    node.dataset.comfyTier = tier;
    const previous = megapixelsSelect.value;
    megapixelsSelect.replaceChildren(...COMFY_RESOLUTION_TIERS.map((spec) => {
      const option = document.createElement("option");
      option.value = String(comfyMegapixelsFor(aspect, spec.tier));
      option.textContent = `${spec.tier}K`;
      option.dataset.reason = [`${spec.tier}K`, `约 ${comfyPixelSizeFor(aspect, spec.tier)}`, spec.note || ""].filter(Boolean).join(" · ");
      return option;
    }));
    const next = String(comfyMegapixelsFor(aspect, tier));
    megapixelsSelect.value = next;
    node.dataset.comfyMegapixels = next;
    return { tier, previous, next };
  }

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

    const { mode = "", resolution = "", padding = null, qwenAngle = null, aspectRatio = "", megapixels = "", tier = "" } = options;
    const previousMode = node.querySelector(".canvas-comfy-mode")?.value || node.dataset.comfyMode || mode || DEFAULT_COMFY_MODE;
    const previousResolution = normalizeCanvasComfyResolution(
      node.querySelector(".canvas-comfy-resolution")?.value || node.dataset.comfyResolution || resolution || "2048",
    );
    const previousAspectRatio = normalizeComfyAspectRatio(
      node.querySelector(".canvas-comfy-aspect")?.value || node.dataset.comfyAspectRatio || aspectRatio,
    );
    const previousMegapixels = String(
      node.querySelector(".canvas-comfy-megapixels")?.value || node.dataset.comfyMegapixels || megapixels || "",
    );
    // 档位是分辨率那一栏的真值；老节点只存了像素档时按长边就近归档。
    const previousTier = findComfyTier(tier)?.tier
      || findComfyTier(node.dataset.comfyTier)?.tier
      || comfyTierForMegapixels(previousAspectRatio, previousMegapixels);
    const previousQwenAngle = normalizeCanvasComfyQwenAngle(qwenAngle || {
      horizontal: node.querySelector(".canvas-comfy-qwen-horizontal")?.value || node.dataset.comfyQwenHorizontal,
      vertical: node.querySelector(".canvas-comfy-qwen-vertical")?.value || node.dataset.comfyQwenVertical,
      zoom: node.querySelector(".canvas-comfy-qwen-zoom")?.value || node.dataset.comfyQwenZoom,
    });
    node.innerHTML = "";
    node.dataset.canvasNodeType = "comfy";
    node.dataset.comfyMode = COMFY_MODES.some((item) => item.value === previousMode) ? previousMode : DEFAULT_COMFY_MODE;
    node.dataset.comfyAspectRatio = previousAspectRatio;
    node.dataset.comfyMegapixels = previousMegapixels;
    node.dataset.comfyTier = previousTier;
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
    modeLabel.textContent = "模型";
    const modeSelect = document.createElement("select");
    modeSelect.className = "canvas-node-model canvas-comfy-mode";
    COMFY_MODES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      modeSelect.append(option);
    });
    modeSelect.value = COMFY_MODES.some((item) => item.value === previousMode) ? previousMode : DEFAULT_COMFY_MODE;
    modeSelect.addEventListener("change", () => {
      node.dataset.comfyMode = modeSelect.value;
      updateCanvasComfyHint(node);
      scheduleCanvasSave?.();
    });

    const aspectSelect = document.createElement("select");
    // 参数弹层按 .canvas-node-size / .canvas-node-resolution 分「比例 / 分辨率」两栏，
    // 比例用独立类名，避免和生成节点的尺寸控件串线。
    aspectSelect.className = "canvas-comfy-aspect";
    COMFY_ASPECT_RATIOS.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      aspectSelect.append(option);
    });
    aspectSelect.value = previousAspectRatio;
    aspectSelect.setAttribute("aria-label", "选择画面比例");
    const aspectField = document.createElement("label");
    aspectField.className = "canvas-comfy-field canvas-comfy-aspect-field";
    const aspectLabel = document.createElement("span");
    aspectLabel.textContent = "比例";
    aspectField.append(aspectLabel, aspectSelect);
    aspectSelect.addEventListener("change", () => {
      node.dataset.comfyAspectRatio = aspectSelect.value;
      // 分辨率档跟着比例换算：同一个 2K，16:9 与 1:1 提交的 MP 不是一个数。
      syncComfyMegapixelOptions(node, aspectSelect, megapixelsSelect);
      updateCanvasComfyHint(node);
      scheduleCanvasSave?.();
    });

    const megapixelsSelect = document.createElement("select");
    megapixelsSelect.className = "canvas-node-resolution canvas-comfy-megapixels";
    megapixelsSelect.setAttribute("aria-label", "选择输出分辨率");
    syncComfyMegapixelOptions(node, aspectSelect, megapixelsSelect);
    const megapixelsField = document.createElement("label");
    megapixelsField.className = "canvas-comfy-field canvas-comfy-megapixels-field";
    const megapixelsLabel = document.createElement("span");
    megapixelsLabel.textContent = "分辨率";
    megapixelsField.append(megapixelsLabel, megapixelsSelect);
    megapixelsSelect.addEventListener("change", () => {
      node.dataset.comfyMegapixels = megapixelsSelect.value;
      const selected = COMFY_RESOLUTION_TIERS.find((spec) => String(comfyMegapixelsFor(aspectSelect.value, spec.tier)) === megapixelsSelect.value);
      if (selected) node.dataset.comfyTier = selected.tier;
      updateCanvasComfyHint(node);
      scheduleCanvasSave?.();
    });

    const run = document.createElement("button");
    run.className = "canvas-node-run canvas-comfy-run";
    run.type = "button";
    run.textContent = "执行";
    run.addEventListener("click", () => runCanvasComfyNode?.(node));
    modeField.append(modeLabel, modeSelect);
    const actionRow = document.createElement("div");
    actionRow.className = "canvas-comfy-action-row";
    actionRow.append(megapixelsField, run);
    controls.append(modeField, aspectField, actionRow);

    const hint = document.createElement("p");
    hint.className = "canvas-comfy-hint";
    const inputSummary = document.createElement("section");
    inputSummary.className = "canvas-comfy-input-summary";
    inputSummary.append(refs, hint);

    // 扩图与换角度的参数面板不再常驻节点：它们由工具栏的对应工具按需挂载。
    node.append(inputPort, outputPort, bar, inputSummary, controls, createCanvasResizeHandle());
    updateCanvasNodeRefs(node);
    updateCanvasComfyHint(node);
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({
    render,
    COMFY_MODES,
    COMFY_ASPECT_RATIOS,
    COMFY_RESOLUTION_TIERS,
    DEFAULT_COMFY_MODE,
    DEFAULT_COMFY_TIER,
    DEFAULT_MEGAPIXELS: String(comfyMegapixelsFor(DEFAULT_ASPECT_RATIO, DEFAULT_COMFY_TIER)),
    normalizeComfyAspectRatio,
    comfyMegapixelsFor,
    comfyPixelSizeFor,
    comfyPixelSizeForMegapixels,
    comfyTierForMegapixels,
  });
});
