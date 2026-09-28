(function initCanvasH3NodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasH3NodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasH3NodeRenderer() {
  "use strict";

  function normalizePrevious(node, options, context) {
    const aspectRatios = context.MINIMAX_H3_ASPECT_RATIOS;
    const requestedAspectRatio = options.aspectRatio || node.dataset.minimaxH3AspectRatio || "16:9";
    return {
      prompt: options.prompt ?? node.querySelector(".canvas-h3-prompt")?.value ?? node.dataset.minimaxH3Prompt ?? "",
      aspectRatio: Object.hasOwn(aspectRatios, requestedAspectRatio) ? requestedAspectRatio : "16:9",
      megapixels: Number(options.megapixels ?? node.dataset.minimaxH3Megapixels ?? 0.6) === 1 ? 1 : 0.6,
      steps: Number(options.steps ?? node.dataset.minimaxH3Steps ?? 4) === 8 ? 8 : 4,
      duration: Math.max(5, Math.min(15, Number(options.duration ?? node.dataset.minimaxH3Duration ?? 12) || 12)),
      refImageSize: options.refImageSize || node.dataset.minimaxH3RefImageSize || "match",
      seed: options.seed ?? node.dataset.minimaxH3Seed ?? "",
    };
  }

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      CANVAS_GENERATION_FAMILIES,
      MINIMAX_H3_ASPECT_RATIOS,
      closeCanvasH3MentionMenu,
      createCanvasH3Number,
      createCanvasH3Select,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      handleCanvasH3MentionKeydown,
      renderCanvasMinimaxH3References,
      runCanvasMinimaxH3Node,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      stopCanvasTextWheel,
      syncCanvasMinimaxH3Prompt,
      updateCanvasH3MentionFromTextarea,
      updateCanvasH3ResolutionHint,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle
      || !CANVAS_GENERATION_FAMILIES || !MINIMAX_H3_ASPECT_RATIOS
      || !createCanvasH3Select || !createCanvasH3Number
      || !renderCanvasMinimaxH3References || !syncCanvasMinimaxH3Prompt
      || !updateCanvasH3ResolutionHint || !updateCanvasH3MentionFromTextarea
      || !handleCanvasH3MentionKeydown || !closeCanvasH3MentionMenu) {
      throw new Error("Canvas MiniMax H3 node renderer context is incomplete.");
    }

    const previous = normalizePrevious(node, options, context);
    node.innerHTML = "";
    node.dataset.minimaxH3Prompt = String(previous.prompt || "");
    node.dataset.minimaxH3AspectRatio = previous.aspectRatio;
    node.dataset.minimaxH3Megapixels = String(previous.megapixels);
    node.dataset.minimaxH3Steps = String(previous.steps);
    node.dataset.minimaxH3Duration = String(previous.duration);
    node.dataset.minimaxH3RefImageSize = previous.refImageSize;
    node.dataset.minimaxH3Seed = String(previous.seed ?? "");

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar(CANVAS_GENERATION_FAMILIES.video.label);
    const intro = document.createElement("div");
    intro.className = "canvas-h3-intro";
    intro.innerHTML = "<strong>文生视频 · 多模态参考生成</strong><span>最多 9 图 · 3 视频 · 3 音频</span>";

    const references = document.createElement("div");
    references.className = "canvas-h3-reference-grid";

    const promptLabel = document.createElement("label");
    promptLabel.className = "canvas-h3-field canvas-h3-prompt-field";
    const promptCaption = document.createElement("span");
    promptCaption.textContent = "视频描述";
    const prompt = document.createElement("textarea");
    prompt.className = "canvas-h3-prompt";
    prompt.rows = 6;
    prompt.placeholder = "描述镜头、人物、动作、对白和声音；可使用 <Picture 1>、<Video 1>、<Audio 1> 引用素材。";
    prompt.value = previous.prompt;
    prompt.setAttribute("aria-autocomplete", "list");
    prompt.setAttribute("aria-expanded", "false");
    if (stopCanvasTextWheel) prompt.addEventListener("wheel", stopCanvasTextWheel);
    prompt.addEventListener("compositionstart", () => {
      prompt.dataset.h3Composing = "true";
      closeCanvasH3MentionMenu(prompt);
    });
    prompt.addEventListener("compositionend", () => {
      prompt.dataset.h3Composing = "";
      updateCanvasH3MentionFromTextarea(node, prompt);
    });
    prompt.addEventListener("input", () => {
      node.dataset.minimaxH3Prompt = prompt.value;
      updateCanvasH3MentionFromTextarea(node, prompt);
      scheduleCanvasSave?.();
    });
    prompt.addEventListener("keydown", (event) => handleCanvasH3MentionKeydown(event, node, prompt));
    prompt.addEventListener("click", () => updateCanvasH3MentionFromTextarea(node, prompt));
    prompt.addEventListener("blur", () => globalThis.setTimeout(() => closeCanvasH3MentionMenu(prompt), 0));
    promptLabel.append(promptCaption, prompt);

    const controls = document.createElement("div");
    controls.className = "canvas-h3-controls";
    const aspectRatio = createCanvasH3Select("画幅", [
      ["1:1", "1:1 方形"],
      ["2:3", "2:3 竖版照片"],
      ["3:2", "3:2 横版照片"],
      ["3:4", "3:4 标准竖版"],
      ["4:3", "4:3 标准横版"],
      ["9:16", "9:16 竖屏"],
      ["16:9", "16:9 横屏"],
      ["21:9", "21:9 超宽屏"],
    ], previous.aspectRatio, "minimaxH3AspectRatio", node);
    const megapixels = createCanvasH3Select("分辨率", [
      ["0.6", "标准"],
      ["1", "高清"],
    ], String(previous.megapixels), "minimaxH3Megapixels", node);
    const resolutionHint = document.createElement("small");
    resolutionHint.className = "canvas-h3-resolution-hint";
    megapixels.append(resolutionHint);
    const steps = createCanvasH3Select("采样质量", [
      ["4", "快速 · 4 步"],
      ["8", "高质量 · 8 步"],
    ], String(previous.steps), "minimaxH3Steps", node);
    const refImageSize = createCanvasH3Select("参考图", [
      ["match", "匹配输出"],
      ["max", "最大保真"],
    ], previous.refImageSize, "minimaxH3RefImageSize", node);
    const duration = createCanvasH3Number("时长（秒）", previous.duration, 5, 15, 1, "minimaxH3Duration", node);
    const seed = createCanvasH3Number("种子（留空随机）", previous.seed, 0, Number.MAX_SAFE_INTEGER, 1, "minimaxH3Seed", node, true);
    controls.append(aspectRatio, megapixels, steps, refImageSize, duration, seed);
    [aspectRatio, megapixels].forEach((field) => {
      field.querySelector("select")?.addEventListener("change", () => updateCanvasH3ResolutionHint(node));
    });

    const footer = document.createElement("div");
    footer.className = "canvas-h3-footer";
    const status = document.createElement("span");
    status.className = "canvas-h3-status";
    status.textContent = "输入描述即可生成，参考素材可选";
    const run = document.createElement("button");
    run.type = "button";
    run.className = "canvas-h3-run";
    run.innerHTML = '<i data-lucide="play"></i><span>生成视频</span>';
    run.addEventListener("click", () => runCanvasMinimaxH3Node?.(node));
    footer.append(status);
    const actions = document.createElement("div");
    actions.className = "canvas-node-actions";
    actions.append(run);

    node.append(inputPort, outputPort, bar, intro, references, promptLabel, controls, actions, footer, createCanvasResizeHandle());
    updateCanvasH3ResolutionHint(node);
    renderCanvasMinimaxH3References(node);
    syncCanvasMinimaxH3Prompt(node);
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
