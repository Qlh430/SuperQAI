(function initCanvasH3NodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasH3NodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasH3NodeRenderer() {
  "use strict";

  const COMMERCE_SLOTS = [
    ["opening_scene", "开场场景", "视频开场画面、人物出镜或商品展示场景"],
    ["product_main", "商品主体", "商品整体外观"],
    ["product_angles", "商品其它角度", "商品不同角度、侧面或背面"],
    ["product_details", "商品细节", "商品局部、材质、结构或功能细节"],
  ];
  const COMMERCE_ASPECT_LABELS = {
    "1:1": "方形", "2:3": "竖屏", "3:2": "横屏", "3:4": "竖屏",
    "4:3": "横屏", "9:16": "竖屏", "16:9": "横屏", "21:9": "超宽屏",
  };

  function normalizePrevious(node, options, context) {
    const aspectRatios = context.MINIMAX_H3_ASPECT_RATIOS;
    const requestedAspectRatio = options.aspectRatio || node.dataset.minimaxH3AspectRatio || "16:9";
    return {
      prompt: options.prompt ?? node.querySelector(".canvas-h3-prompt")?.value ?? node.dataset.minimaxH3Prompt ?? "",
      modelId: options.modelId ?? node.dataset.minimaxH3Model ?? "minimax-h3",
      aspectRatio: Object.hasOwn(aspectRatios, requestedAspectRatio) ? requestedAspectRatio : "16:9",
      megapixels: Number(options.megapixels ?? node.dataset.minimaxH3Megapixels ?? 0.6) === 1 ? 1 : 0.6,
      // The deployed H3 workflow is the 8-step distilled graph, so 8 is the
      // matching default; the 4-step option stays for a faster draft.
      steps: Number(options.steps ?? node.dataset.minimaxH3Steps ?? 8) === 4 ? 4 : 8,
      duration: Math.max(5, Math.min(15, Number(options.duration ?? node.dataset.minimaxH3Duration ?? 12) || 12)),
      refImageSize: options.refImageSize || node.dataset.minimaxH3RefImageSize || "match",
      // 种子不再提供界面入口：新建、恢复与复制一律回到随机，已保存的具体种子不再沿用。
      seed: "",
      mode: options.mode ?? node.dataset.minimaxH3Mode ?? "reference",
      commercePromptA: options.commercePromptA ?? node.dataset.h3CommercePromptA ?? "",
      commercePromptB: options.commercePromptB ?? node.dataset.h3CommercePromptB ?? "",
      commerceAspectRatio: options.commerceAspectRatio ?? node.dataset.h3CommerceAspectRatio ?? "9:16",
      commerceMegapixels: options.commerceMegapixels ?? node.dataset.h3CommerceMegapixels ?? 0.6,
      commerceImages: Array.isArray(options.commerceImages)
        ? options.commerceImages
        : parseCommerceImageRefs(node.dataset.h3CommerceImages),
    };
  }

  function parseCommerceImageRefs(value) {
    try {
      const parsed = JSON.parse(String(value || "[]"));
      return Array.isArray(parsed) ? parsed.slice(0, 4).map(item => item && typeof item === "object" ? { ...item } : null) : [];
    } catch {
      return [];
    }
  }

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      CANVAS_GENERATION_FAMILIES,
      MINIMAX_H3_LOCAL_MODELS,
      MINIMAX_H3_ASPECT_RATIOS,
      closeCanvasH3MentionMenu,
      createCanvasH3Number,
      createCanvasH3Select,
      calculateCanvasH3Resolution,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      displayCanvasH3PromptReferences,
      handleCanvasH3MentionKeydown,
      renderCanvasMinimaxH3References,
      renderCanvasH3PromptHighlight,
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
      || !renderCanvasMinimaxH3References || !renderCanvasH3PromptHighlight || !syncCanvasMinimaxH3Prompt
      || !updateCanvasH3ResolutionHint || !updateCanvasH3MentionFromTextarea
      || !handleCanvasH3MentionKeydown || !closeCanvasH3MentionMenu) {
      throw new Error("Canvas MiniMax H3 node renderer context is incomplete.");
    }

    const previous = normalizePrevious(node, options, context);
    node.innerHTML = "";
    node.dataset.minimaxH3Prompt = displayCanvasH3PromptReferences(previous.prompt);
    node.dataset.minimaxH3Model = String(previous.modelId || "minimax-h3");
    node.dataset.minimaxH3AspectRatio = previous.aspectRatio;
    node.dataset.minimaxH3Megapixels = String(previous.megapixels);
    node.dataset.minimaxH3Steps = String(previous.steps);
    node.dataset.minimaxH3Duration = String(previous.duration);
    node.dataset.minimaxH3RefImageSize = previous.refImageSize;
    node.dataset.minimaxH3Seed = String(previous.seed ?? "");
    node.dataset.minimaxH3Mode = String(previous.mode || "reference");
    node.dataset.h3CommercePromptA = String(previous.commercePromptA || "");
    node.dataset.h3CommercePromptB = String(previous.commercePromptB || "");
    node.dataset.h3CommerceImages = JSON.stringify(previous.commerceImages);
    delete node.dataset.h3CommerceDisplayOrder;
    node.dataset.h3CommerceAspectRatio = Object.hasOwn(MINIMAX_H3_ASPECT_RATIOS, previous.commerceAspectRatio) ? previous.commerceAspectRatio : "9:16";
    node.dataset.h3CommerceMegapixels = Number(previous.commerceMegapixels) === 1 ? "1" : "0.6";

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
    const promptEditor = document.createElement("div");
    promptEditor.className = "canvas-h3-prompt-editor";
    const promptHighlight = document.createElement("div");
    promptHighlight.className = "canvas-h3-prompt-highlight";
    promptHighlight.setAttribute("aria-hidden", "true");
    const prompt = document.createElement("textarea");
    prompt.className = "canvas-h3-prompt";
    prompt.rows = 6;
    prompt.placeholder = "描述镜头、人物、动作、对白和声音；输入 @ 可选择 图片1、视频1、音频1。";
    prompt.value = displayCanvasH3PromptReferences(previous.prompt);
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
      renderCanvasH3PromptHighlight(prompt);
      updateCanvasH3MentionFromTextarea(node, prompt);
      scheduleCanvasSave?.(node);
    });
    prompt.addEventListener("scroll", () => {
      promptHighlight.scrollTop = prompt.scrollTop;
      promptHighlight.scrollLeft = prompt.scrollLeft;
    });
    prompt.addEventListener("keydown", (event) => handleCanvasH3MentionKeydown(event, node, prompt));
    prompt.addEventListener("click", () => updateCanvasH3MentionFromTextarea(node, prompt));
    prompt.addEventListener("blur", () => globalThis.setTimeout(() => closeCanvasH3MentionMenu(prompt), 0));
    promptEditor.append(promptHighlight, prompt);
    promptLabel.append(promptCaption, promptEditor);

    const commercePrompts = document.createElement("div");
    commercePrompts.className = "canvas-h3-commerce-prompts";
    commercePrompts.dataset.nodeId = String(node.dataset.id || "");
    commercePrompts.hidden = true;
    commercePrompts.setAttribute("aria-label", "H3 带货双段提示词");
    const commercePromptA = createCommercePrompt(document, {
      key: "A",
      value: previous.commercePromptA,
      node,
      scheduleCanvasSave,
      stopCanvasTextWheel,
    });
    const commercePromptB = createCommercePrompt(document, {
      key: "B",
      value: previous.commercePromptB,
      node,
      scheduleCanvasSave,
      stopCanvasTextWheel,
    });
    commercePrompts.append(commercePromptA.field, commercePromptB.field);
    const commerceImages = document.createElement("div");
    commerceImages.className = "canvas-h3-commerce-images";
    commerceImages.dataset.nodeId = String(node.dataset.id || "");
    commerceImages.setAttribute("aria-label", "H3 带货四张参考图片");
    renderCommerceImages(document, node, commerceImages, previous.commerceImages);
    bindCommerceImageSwap(node, commerceImages);
    node.__h3CommercePrompts = { a: commercePromptA.textarea, b: commercePromptB.textarea };
    node.__h3CommerceImagesHost = commerceImages;

    const controls = document.createElement("div");
    controls.className = "canvas-h3-controls";
    const modelChoices = (Array.isArray(MINIMAX_H3_LOCAL_MODELS) && MINIMAX_H3_LOCAL_MODELS.length
      ? MINIMAX_H3_LOCAL_MODELS
      : [["minimax-h3", "MiniMax H3"]]);
    const model = createCanvasH3Select("模型", modelChoices, previous.modelId, "minimaxH3Model", node);
    const syncCommerceMode = () => {
      const commerce = node.dataset.minimaxH3Model === "h3-commerce";
      promptLabel.hidden = commerce;
      intro.hidden = commerce;
      references.hidden = commerce;
      commercePrompts.hidden = !commerce;
      commerceImages.hidden = !commerce;
      controls.querySelectorAll(".canvas-h3-field[data-h3-param]:not([data-h3-param=\"model\"])")
        .forEach(field => { field.hidden = field.dataset.h3Param.startsWith("commerce") ? !commerce : commerce; });
      modeSwitch.hidden = commerce;
      node.classList.toggle("is-h3-commerce", commerce);
      scheduleCanvasConnectionRender?.();
    };
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
    const commerceAspect = createCanvasH3Select("画幅", Object.entries(COMMERCE_ASPECT_LABELS).map(([ratio, label]) => [ratio, `${ratio} ${label}`]), node.dataset.h3CommerceAspectRatio, "h3CommerceAspectRatio", node);
    const commerceResolution = createCanvasH3Select("分辨率", [["0.6", "0.6 MP"], ["1", "1.0 MP"]], node.dataset.h3CommerceMegapixels, "h3CommerceMegapixels", node);
    commerceAspect.dataset.h3Param = "commerceAspectRatio";
    commerceResolution.dataset.h3Param = "commerceMegapixels";
    const updateCommerceResolutions = () => {
      for (const option of commerceResolution.querySelector("select").options) {
        // Node 115 uses a 1024² pixel budget per MP and 32-pixel alignment.
        const { width, height } = calculateCanvasH3Resolution(node.dataset.h3CommerceAspectRatio, option.value);
        const mp = (width * height / (1024 * 1024)).toFixed(2);
        option.textContent = `${width} × ${height} px（约 ${mp} MP）`;
      }
    };
    commerceAspect.querySelector("select").addEventListener("change", updateCommerceResolutions);
    updateCommerceResolutions();
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
    // 生成方式：全能参考走多样参考工作流，文生视频/首帧/首尾帧走文图首尾帧工作流。
    const modeSwitch = document.createElement("div");
    modeSwitch.className = "canvas-h3-mode-switch";
    modeSwitch.setAttribute("role", "radiogroup");
    modeSwitch.setAttribute("aria-label", "生成方式");
    const H3_MODE_OPTIONS = [
      ["reference", "全能参考"],
      ["text", "文生视频"],
      ["first", "首帧"],
      ["last", "首尾帧"],
    ];
    const syncModeSwitch = () => {
      const current = node.dataset.minimaxH3Mode || "reference";
      modeSwitch.querySelectorAll("[data-h3-mode]").forEach((button) => {
        const active = button.dataset.h3Mode === current;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-checked", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    };
    H3_MODE_OPTIONS.forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "canvas-h3-mode";
      button.dataset.h3Mode = value;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      button.textContent = label;
      button.addEventListener("click", () => {
        if (node.dataset.minimaxH3Mode === value) return;
        node.dataset.minimaxH3Mode = value;
        syncModeSwitch();
        node.dispatchEvent(new CustomEvent("canvas-h3-mode-change", { bubbles: true, detail: { node, mode: value } }));
        scheduleCanvasSave?.(node);
      });
      modeSwitch.append(button);
    });
    syncModeSwitch();
    // 操作区按 data-h3-param 分组：模型留在底排，视频参数进弹层，
    // 参考图与种子只保留取值字段。
    model.dataset.h3Param = "model";
    aspectRatio.dataset.h3Param = "aspectRatio";
    megapixels.dataset.h3Param = "megapixels";
    steps.dataset.h3Param = "steps";
    refImageSize.dataset.h3Param = "refImageSize";
    duration.dataset.h3Param = "duration";
    seed.dataset.h3Param = "seed";
    controls.append(model, aspectRatio, megapixels, steps, refImageSize, duration, seed, commerceAspect, commerceResolution, modeSwitch);
    model.querySelector("select")?.addEventListener("change", syncCommerceMode);
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

    node.append(inputPort, outputPort, bar, intro, references, promptLabel, commercePrompts, commerceImages, controls, actions, footer, createCanvasResizeHandle());
    syncCommerceMode();
    updateCanvasH3ResolutionHint(node);
    renderCanvasMinimaxH3References(node);
    renderCanvasH3PromptHighlight(prompt);
    syncCanvasMinimaxH3Prompt(node);
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  function createCommercePrompt(document, { key, value, node, scheduleCanvasSave, stopCanvasTextWheel }) {
    const field = document.createElement("label");
    field.className = "canvas-h3-field canvas-h3-commerce-prompt-field";
    const caption = document.createElement("span");
    caption.textContent = `提示词 ${key}`;
    const textarea = document.createElement("textarea");
    textarea.className = `canvas-h3-commerce-prompt canvas-h3-commerce-prompt-${key.toLowerCase()}`;
    textarea.dataset.promptPart = key.toLowerCase();
    textarea.rows = 5;
    textarea.placeholder = `输入 H3 带货第 ${key === "A" ? "一" : "二"} 段完整提示词`;
    textarea.value = String(value || "");
    textarea.setAttribute("aria-label", `H3 带货提示词 ${key}`);
    if (stopCanvasTextWheel) textarea.addEventListener("wheel", stopCanvasTextWheel);
    textarea.addEventListener("input", () => {
      node.dataset[key === "A" ? "h3CommercePromptA" : "h3CommercePromptB"] = textarea.value;
      scheduleCanvasSave?.(node);
    });
    field.append(caption, textarea);
    return { field, textarea };
  }

  function renderCommerceImages(document, node, host, values) {
    const images = Array.from({ length: 4 }, (_, index) => values[index] || null);
    node.dataset.h3CommerceImages = JSON.stringify(images);
    host.replaceChildren();
    COMMERCE_SLOTS.forEach(([id, name, description], index) => {
      const slot = document.createElement("div");
      slot.className = "canvas-h3-commerce-slot";
      slot.dataset.slot = String(index);
      slot.dataset.slotId = id;
      const label = document.createElement("span");
      label.className = "canvas-h3-commerce-slot-label";
      label.textContent = name;
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "flora-generator-add-reference canvas-h3-commerce-slot-choose";
      choose.title = description;
      choose.setAttribute("aria-label", `${images[index]?.url ? "替换" : "添加"}${name}`);
      if (images[index]?.url) {
        const image = document.createElement("img");
        image.src = String(images[index].url);
        image.alt = name;
        image.addEventListener("error", () => {
          if (image.isConnected) showCommerceSlotError(node, index, "原图加载失败");
        });
        image.loading = "lazy";
        image.draggable = false;
        choose.append(image);
      } else {
        choose.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i>';
      }
      choose.addEventListener("click", () => node.dispatchEvent(new CustomEvent("flora-h3-commerce-slot-picker", {
        bubbles: true,
        detail: { node, slot: index, anchor: choose },
      })));
      const file = document.createElement("input");
      file.type = "file";
      file.hidden = true;
      file.accept = "image/png,image/jpeg,image/webp";
      file.setAttribute("aria-label", `上传${name}`);
      file.addEventListener("change", () => {
        const selected = file.files?.[0];
        file.value = "";
        if (selected) node.dispatchEvent(new CustomEvent("flora-h3-commerce-slot-upload", {
          bubbles: true,
          detail: { node, slot: index, file: selected },
        }));
      });
      const error = document.createElement("small");
      error.className = "canvas-h3-commerce-slot-error";
      error.setAttribute("role", "status");
      error.hidden = true;
      slot.append(choose, file, label, error);
      if (images[index]) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "canvas-h3-commerce-slot-remove";
        remove.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';
        remove.setAttribute("aria-label", `删除${name}`);
        remove.addEventListener("click", () => node.dispatchEvent(new CustomEvent("flora-h3-commerce-slot-remove", {
          bubbles: true, detail: { node, slot: index },
        })));
        slot.append(remove);
      }
      host.append(slot);
    });
    globalThis.lucide?.createIcons?.({ root: host, attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  function showCommerceSlotError(node, index, message) {
    const error = node.__h3CommerceImagesHost?.querySelector(`[data-slot="${index}"] .canvas-h3-commerce-slot-error`);
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function bindCommerceImageSwap(node, host) {
    let drag;
    let suppressClick = false;
    const move = (card, target) => {
      if (!host.contains(card) || !host.contains(target) || card === target || !card.querySelector("img")) return;
      const to = Number(target.dataset.slot);
      node.dispatchEvent(new CustomEvent("flora-h3-commerce-slot-swap", {
        bubbles: true, detail: { node, from: Number(card.dataset.slot), to },
      }));
      host.querySelector(`[data-slot="${to}"] .canvas-h3-commerce-slot-choose`)?.focus({ preventScroll: true });
    };
    const clearMarks = () => {
      for (const card of host.children) card.classList.remove("is-dragging", "is-drop-target");
    };
    const finish = (event, commit) => {
      if (drag?.id !== event.pointerId) return;
      const { card, target, moved } = drag;
      drag = null;
      clearMarks();
      if (!moved) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (commit && target) move(card, target);
    };
    host.addEventListener("dragstart", event => event.preventDefault());
    host.addEventListener("click", event => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    host.addEventListener("pointerdown", event => {
      const button = event.target.closest(".canvas-h3-commerce-slot-choose");
      if (event.button !== 0 || !button?.querySelector("img") || drag) return;
      drag = { id: event.pointerId, card: button.parentElement, x: event.clientX, y: event.clientY, moved: false };
      button.setPointerCapture(event.pointerId);
      event.stopPropagation();
    });
    host.addEventListener("pointermove", event => {
      if (drag?.id !== event.pointerId || (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6)) return;
      drag.moved = true;
      event.preventDefault();
      clearMarks();
      drag.card.classList.add("is-dragging");
      const target = host.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest(".canvas-h3-commerce-slot");
      drag.target = target && host.contains(target) && target !== drag.card ? target : null;
      drag.target?.classList.add("is-drop-target");
    });
    host.addEventListener("pointerup", event => finish(event, true));
    host.addEventListener("pointercancel", event => finish(event, false));
    host.addEventListener("lostpointercapture", event => finish(event, false));
    host.addEventListener("keydown", event => {
      const button = event.target.closest(".canvas-h3-commerce-slot-choose");
      if (!button || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const right = event.key === "ArrowRight";
      const card = button.parentElement;
      const target = right ? card.nextElementSibling : card.previousElementSibling;
      if (target) move(card, target);
    });
  }

  function setCommerceImages(node, refs, context = {}) {
    const host = node?.__h3CommerceImagesHost
      || node?.querySelector?.(".canvas-h3-commerce-images")
      || (node?.dataset?.id && (context.document || globalThis.document)?.querySelector?.(
        `.canvas-h3-commerce-images[data-node-id="${String(node.dataset.id).replace(/"/g, '\\"')}"]`,
      ));
    if (!host) throw new Error("H3 带货素材槽未加载。");
    renderCommerceImages(context.document || globalThis.document, node, host, refs);
    context.scheduleCanvasSave?.(node);
  }

  return Object.freeze({ render, setCommerceImages, showCommerceSlotError });
});

