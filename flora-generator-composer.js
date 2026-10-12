(function installFloraGeneratorComposer(root) {
  "use strict";

  const mounted = new Map();
  const enginePickers = new WeakMap();
  const COMPOSER_KINDS = new Set(["generator", "video-api", "minimax-h3", "llm", "audio-generator", "text"]);
  // 底排要在一行里放下生成方式/模型/参数入口与生成方式分段控件：
  // 带分段控件的 MiniMax H3 放宽到 960，其余节点保持 760。
  const COMPOSER_MAX_WIDTH = 760;
  const COMPOSER_WIDE_MAX_WIDTH = 960;

  function composerPanelWidth(viewportWidth, { wide = false } = {}) {
    const limit = wide ? COMPOSER_WIDE_MAX_WIDTH : COMPOSER_MAX_WIDTH;
    return Math.min(limit, Math.max(0, viewportWidth - 32));
  }

  let selectedIds = null;
  let globalListenersBound = false;
  // The composer panel is positioned relative to its node, so its own screen
  // rect can be derived from the painted viewport plus the node's world
  // geometry. getBoundingClientRect() here would force a reflow of the whole
  // plane on every pan/zoom frame; this projection does not touch layout.
  let viewportOrigin = { left: 0, top: 0 };

  function refreshViewportOrigin() {
    const viewport = document.getElementById("infiniteCanvas");
    if (!viewport?.getBoundingClientRect) return;
    const rect = viewport.getBoundingClientRect();
    if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
      viewportOrigin = { left: rect.left, top: rect.top };
    }
  }

  function projectShellRect(node, shell, dimensions) {
    const view = root.CanvasAppliedViewport;
    if (!view || !(Number(view.scale) > 0)) return null;
    const worldX = Number(node.dataset.x);
    const worldY = Number(node.dataset.y);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;
    const width = Number(dimensions?.width) || shell.offsetWidth;
    const height = Number(dimensions?.height) || shell.offsetHeight;
    if (!(width > 0) || !(height > 0)) return null;
    const scale = Number(view.scale);
    const left = viewportOrigin.left + Number(view.x) + worldX * scale;
    const top = viewportOrigin.top + Number(view.y) + worldY * scale;
    const paintedWidth = width * scale;
    const paintedHeight = height * scale;
    return {
      left,
      top,
      width: paintedWidth,
      height: paintedHeight,
      right: left + paintedWidth,
      bottom: top + paintedHeight,
    };
  }

  function sourceOutsidePanel(node, selector, panel) {
    return Array.from(node.querySelectorAll(selector)).find((element) => !panel.contains(element))
      || panel.querySelector(selector);
  }

  function put(element, destination) {
    if (element && destination && element.parentElement !== destination) destination.append(element);
  }

  function createSection(className, label) {
    const section = document.createElement("section");
    section.className = className;
    section.setAttribute("aria-label", label);
    return section;
  }

  function mountEnginePicker(node) {
    node.querySelectorAll(".canvas-engine-switch").forEach((group) => {
      const buttons = Array.from(group.querySelectorAll(".canvas-engine-option[data-engine]"));
      if (!buttons.length) return;
      let state = enginePickers.get(group);
      if (!state) {
        const picker = document.createElement("select");
        picker.className = "flora-generation-mode";
        picker.setAttribute("aria-label", "生成方式");
        picker.title = "生成方式";
        buttons.forEach((button) => {
          const option = document.createElement("option");
          option.value = button.dataset.engine;
          option.textContent = option.value === "api" ? "API生成" : "ComfyUI生成";
          picker.append(option);
        });
        const stopPointer = (event) => event.stopPropagation();
        const change = (event) => {
          event.stopPropagation();
          const button = Array.from(group.querySelectorAll(".canvas-engine-option[data-engine]"))
            .find((candidate) => candidate.dataset.engine === picker.value);
          if (button && !button.disabled) button.click();
          else picker.value = group.dataset.engine || "api";
        };
        for (const type of ["pointerdown", "click", "dblclick"]) picker.addEventListener(type, stopPointer);
        picker.addEventListener("change", change);
        state = { picker, originalLabel: group.getAttribute("aria-label") };
        enginePickers.set(group, state);
        group.append(picker);
        group.dataset.floraEnginePicker = "true";
        group.setAttribute("aria-label", "生成方式");
      }
      const value = group.dataset.engine || buttons.find((button) => button.classList.contains("is-active"))?.dataset.engine || "api";
      if (state.picker.value !== value) state.picker.value = value;
      buttons.forEach((button) => {
        const option = Array.from(state.picker.options).find((candidate) => candidate.value === button.dataset.engine);
        if (option && option.disabled !== button.disabled) option.disabled = button.disabled;
      });
    });
  }

  function unmountEnginePickers(node) {
    node?.querySelectorAll(".canvas-engine-switch").forEach((group) => {
      const state = enginePickers.get(group);
      if (!state) return;
      state.picker.remove();
      if (state.originalLabel === null) group.removeAttribute("aria-label");
      else group.setAttribute("aria-label", state.originalLabel);
      delete group.dataset.floraEnginePicker;
      enginePickers.delete(group);
    });
  }

  function addReferenceControl(state) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flora-generator-add-reference";
    button.setAttribute("aria-label", "添加参考素材");
    button.title = "添加参考素材";
    const icon = document.createElement("i");
    icon.dataset.lucide = "plus";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);

    const input = document.createElement("input");
    input.type = "file";
    input.className = "flora-generator-reference-input";
    input.accept = "image/*,video/*,audio/*,.txt,.md,.docx,.pdf";
    input.multiple = true;
    input.hidden = true;
    input.setAttribute("aria-label", "选择参考素材");
    state.referenceArea.append(button, input);
    state.addReference = button; state.referenceInput = input;
    const openPicker = (event) => {
      event.stopPropagation();
      input.click();
    };
    const upload = (event) => {
      event.stopPropagation();
      const files = Array.from(input.files || []);
      input.value = "";
      if (files.length) root.dispatchEvent(new CustomEvent("flora-generator-reference-upload", {
        detail: { node: state.node, files },
      }));
    };
    button.addEventListener("click", openPicker);
    input.addEventListener("change", upload);
    state.cleanups.push(() => button.removeEventListener("click", openPicker));
    state.cleanups.push(() => input.removeEventListener("change", upload));
  }

  function ensureResult(state) {
    if (state.node.dataset.floraKind !== "generator") {
      const media = state.resultArea?.querySelector("video[src], audio[src], .canvas-llm-output");
      const ready = media && (media.matches(".canvas-llm-output") ? Boolean(media.textContent) : Boolean(media.getAttribute("src")) && !media.closest(".canvas-media-shell")?.hidden);
      if (state.placeholder && state.placeholder.hidden !== Boolean(ready)) state.placeholder.hidden = Boolean(ready);
      return;
    }
    const { node, resultArea } = state;
    let result = sourceOutsidePanel(node, ".canvas-node-result", state.panel);
    if (!result) {
      result = document.createElement("div");
      result.className = "canvas-node-result";
      result.hidden = true;
      state.createdResult = true;
    } else if (result !== state.result) {
      state.createdResult = false;
    }
    put(result, resultArea);
    state.result = result;
    if (node.dataset.resultSrc && !result.querySelector("img")) {
      const image = document.createElement("img");
      image.alt = "生成结果";
      image.src = node.dataset.resultSrc;
      result.append(image);
    }
    if (node.dataset.resultSrc && result.hidden) result.hidden = false;
    const hasImage = Boolean(result.querySelector("img") && !result.hidden);
    if (state.placeholder && state.placeholder.hidden !== hasImage) state.placeholder.hidden = hasImage;
    root.CanvasFloraNodeShell?.syncImagePreview?.(node);
  }

  function syncStatus(state) {
    const native = state.node.querySelector(":scope > .canvas-node-footer > .canvas-node-status")
      || state.nativeStatus || state.node.querySelector(".canvas-node-bar-status, .canvas-node-status, .canvas-h3-status, .canvas-audio-generator-status");
    const nativeText = native?.textContent?.trim() || "";
    const tone = native?.dataset.state || (/失败|错误|不可用/.test(nativeText) ? "failed" : "idle");
    // The composer keeps no permanent status row: the run button already carries
    // the busy state, and progress or completion copy only pushed the panel
    // down. Guidance and failures keep their words so nothing is lost.
    const showText = tone === "failed"
      || /^(?:请输入|请选择|请先|请连接|请上传|请检查|请重试|请重新)/.test(nativeText)
      || /不支持|不可用|不符合|已移除|无法|不能/.test(nativeText);
    const text = showText && nativeText !== "待完成" ? nativeText : "";
    if (state.status.textContent !== text) state.status.textContent = text;
    if (state.status.hidden !== !text) state.status.hidden = !text;
    if (state.status.dataset.state !== tone) state.status.dataset.state = tone;
    const run = state.actions.querySelector(".canvas-node-run");
    if (run) {
      const busy = String(run.getAttribute("aria-busy") === "true"
        || (run.disabled && (state.node.classList.contains("canvas-node-comfy")
          || state.node.dataset.floraKind !== "generator" && /正在|提交|生成中|处理中/.test(text))));
      if (state.panel.getAttribute("aria-busy") !== busy) state.panel.setAttribute("aria-busy", busy);
      const price = run.querySelector(".canvas-run-price")?.textContent?.trim();
      if (price !== undefined && state.price.textContent !== price) state.price.textContent = price;
      if (state.price.hidden !== !state.price.textContent) state.price.hidden = !state.price.textContent;
      const noun = ({ llm: "文本", text: "文本", "video-api": "视频", "minimax-h3": "视频", "audio-generator": "音频" })[state.node.dataset.floraKind] || "图片";
      const label = busy === "true" ? `正在生成${noun}` : `生成${noun}`;
      if (run.getAttribute("aria-label") !== label) run.setAttribute("aria-label", label);
      if (run.title !== label) run.title = label;
      const iconName = busy === "true" ? "loader-circle" : "arrow-up";
      const current = run.querySelector(".flora-generator-run-icon");
      if (current?.dataset.runIcon !== iconName) {
        current?.remove();
        const icon = document.createElement("i");
        icon.className = "flora-generator-run-icon";
        icon.dataset.lucide = iconName;
        icon.dataset.runIcon = iconName;
        icon.setAttribute("aria-hidden", "true");
        run.append(icon);
        root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      }
    }
  }

  function placePanel(state) {
    if (state.panel.hidden || !state.node.isConnected || !state.shell.isConnected) return;
    if (state.expanded) {
      root.FloraGeneratorParameters?.reposition?.(state.node);
      state.modelPicker?.reposition?.();
      return;
    }
    bindPlaneObserver(state);
    if (!(state.shellWidth > 0) || !(state.shellHeight > 0)) {
      state.shellWidth = state.shell.offsetWidth;
      state.shellHeight = state.shell.offsetHeight;
    }
    const shellRect = projectShellRect(state.node, state.shell, state) || state.shell.getBoundingClientRect();
    const scale = shellRect.width / (state.shellWidth || shellRect.width) || 1;
    const viewportWidth = Math.max(32, root.innerWidth || document.documentElement.clientWidth);
    const viewportHeight = Math.max(32, root.innerHeight || document.documentElement.clientHeight);
    // 带生成方式分段控件的操作区（MiniMax H3）要宽一些，最下面那排参数与生成方式
    // 才能排在同一行。宽度按节点类型判定，不能等控件搬进底排后再猜；窗口确实放不下
    // 时仍回落到可用宽度，交给 CSS 换行。
    const width = composerPanelWidth(viewportWidth, { wide: state.node.dataset.floraKind === "minimax-h3" });
    // 操作区属于节点：横向始终以节点为中心，绝不因为贴边而滑离节点。
    // 靠边时由 requestReveal 平移画布让位，见 canvas 的 flora-generator-reveal。
    const left = shellRect.left + shellRect.width / 2 - width / 2;
    const top = shellRect.bottom + 16;
    const maxHeight = Math.max(80, viewportHeight - top - 16);
    const properties = {
      "--flora-composer-left": `${(left - shellRect.left) / scale}px`,
      "--flora-composer-top": `${(top - shellRect.top) / scale}px`,
      "--flora-composer-width": `${width}px`,
      "--flora-composer-max-height": `${maxHeight}px`,
      "--flora-composer-counter-scale": String(1 / scale),
    };
    for (const [name, value] of Object.entries(properties)) {
      if (state.node.style.getPropertyValue(name) !== value) state.node.style.setProperty(name, value);
    }
    state.composerProperties = properties;
    root.FloraGeneratorParameters?.reposition?.(state.node);
    state.modelPicker?.reposition?.();
  }

  function schedulePlace(state) {
    if (state.panel.hidden || !state.node.isConnected) return;
    if (state.placementFrame != null) return;
    state.placementFrame = root.requestAnimationFrame(() => {
      state.placementFrame = null;
      placePanel(state);
    });
  }

  function isSelected(state) {
    if (selectedIds !== null) {
      return selectedIds.length === 1 && selectedIds[0] === String(state.node.dataset.id || "");
    }
    const selected = document.querySelectorAll(".canvas-node.is-selected, .canvas-node.selected");
    return selected.length === 1 && selected[0] === state.node;
  }

  function hasDetachedShell(state) {
    return state.node.isConnected && (!state.shell.isConnected || !state.node.contains(state.shell));
  }

  function syncOne(state) {
    if (!state.panel.isConnected) return;
    syncReferenceMaterials(state);
    placeH3ModeSwitch(state);
    syncH3ModeNote(state);
    syncComfyPrompt(state);
    ensureResult(state);
    syncStatus(state);
    const open = isSelected(state);
    if (!open && state.expanded) collapsePanel(state, false);
    if (state.panel.hidden === open) state.panel.hidden = !open;
    if (state.node.classList.contains("is-flora-composer-open") !== open) {
      state.node.classList.toggle("is-flora-composer-open", open);
    }
    if (!open) state.revealRequested = false;
    if (!open) {
      root.FloraGeneratorParameters?.close?.(state.node);
      state.modelPicker?.close?.();
    }
    if (open) schedulePlace(state);
  }

  const REFERENCE_TYPES = [
    { key: "image", label: "图片", icon: "image" },
    { key: "video", label: "视频", icon: "video" },
    { key: "audio", label: "音频", icon: "audio-lines" },
    { key: "text", label: "文本", icon: "text" },
  ];

  function referenceType(item) {
    return ["text", "llm"].includes(item?.type) ? "text" : item?.type;
  }

  function createReferencePreview(item, type, label) {
    if (type === "image" && item.url) {
      const image = document.createElement("img");
      image.loading = "lazy";
      image.decoding = "async";
      image.src = item.url;
      image.alt = label;
      image.addEventListener("error", () => image.classList.add("is-error"), { once: true });
      return image;
    }
    const icon = document.createElement("i");
    icon.dataset.lucide = type === "text" ? "text" : type === "video" ? "video" : type === "audio" ? "audio-lines" : "image";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function removeReference(state, item) {
    const sourceNodeId = String(item?.sourceNodeId || "");
    if (!sourceNodeId) return;
    root.CanvasReferenceBridge?.remove?.({
      targetNodeId: state.node.dataset.id,
      sourceNodeId,
      sourcePort: item.sourcePort || "output",
    });
  }

  function createReferenceCard(state, item, type, index) {
    const label = `${REFERENCE_TYPES.find(entry => entry.key === type)?.label || "参考"}${index + 1}`;
    const card = document.createElement("div");
    card.className = `flora-reference-card is-${type}`;
    card.dataset.referenceType = type;
    card.dataset.referenceKey = item.key || "";
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "canvas-ref-thumb flora-reference-thumb";
    if (type === "text") thumb.classList.add("flora-text-reference");
    thumb.title = type === "text"
      ? `${item.name || label}\n${String(item.text || "").slice(0, 400) || "暂无正文"}`
      : item.name || label;
    thumb.setAttribute("aria-label", `${label}：${item.name || label}`);
    thumb.append(createReferencePreview(item, type, label));
    const badge = document.createElement("span");
    badge.className = "flora-reference-index";
    // Text references use the section heading and tooltip for their identity;
    // leaving the tiny card itself icon-only keeps long document names out of
    // the compact material band.
    if (type === "text") badge.hidden = true;
    else badge.textContent = label;
    thumb.append(badge);
    card.append(thumb);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "flora-reference-remove";
    remove.title = `移除${label}`;
    remove.setAttribute("aria-label", `移除${label}`);
    const closeIcon = document.createElement("i");
    closeIcon.dataset.lucide = "x";
    closeIcon.setAttribute("aria-hidden", "true");
    remove.append(closeIcon);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeReference(state, item);
    });
    card.append(remove);
    return card;
  }

  function syncReferenceMaterials(state) {
    const refs = state.sources?.refs;
    // Native renderers still own the connection data and upload state. The
    // composer presents one compact, typed view so empty media columns never
    // create gaps in the operation area.
    if (refs) {
      refs.hidden = true;
      // The legacy list remains in the DOM for the host renderer, but must not
      // duplicate cards in the visible operation area or accessibility tree.
      if (refs.matches?.(".canvas-node-refs")) refs.replaceChildren();
    }
    const incoming = root.getCanvasIncomingReferenceMaterials?.(state.node.dataset.id) || [];
    const items = incoming.map(item => ({ ...item, referenceType: referenceType(item) }))
      .filter(item => REFERENCE_TYPES.some(entry => entry.key === item.referenceType));
    const signature = JSON.stringify(items.map(item => [item.key, item.referenceType, item.sourceNodeId, item.sourcePort, item.name, item.url, String(item.text || "").slice(0, 400)]));
    if (!state.referencesView) {
      state.referencesView = document.createElement("div");
      state.referencesView.className = "flora-reference-materials";
      state.referenceArea.prepend(state.referencesView);
    }
    if (signature !== state.referenceSignature) {
      state.referenceSignature = signature;
      state.referencesView.replaceChildren();
      const grouped = new Map(REFERENCE_TYPES.map(type => [type.key, []]));
      items.forEach(item => grouped.get(item.referenceType).push(item));
      const activeTypes = REFERENCE_TYPES.filter(type => grouped.get(type.key).length);
      if (!activeTypes.length) {
        state.referencesView.hidden = true;
      } else {
        state.referencesView.hidden = false;
        const multi = activeTypes.length > 1;
        for (const type of activeTypes) {
          const collection = document.createElement(multi ? "section" : "div");
          collection.className = `flora-reference-collection is-${type.key}`;
          if (multi) {
            collection.setAttribute("aria-label", `${type.label}参考`);
            const heading = document.createElement("span");
            heading.className = "flora-reference-collection-title";
            heading.textContent = type.label;
            collection.append(heading);
          }
          const list = document.createElement("div");
          list.className = "flora-reference-list";
          grouped.get(type.key).forEach((item, index) => list.append(createReferenceCard(state, item, type.key, index)));
          collection.append(list);
          state.referencesView.append(collection);
        }
        root.lucide?.createIcons?.({ root: state.referencesView, attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      }
    }
    placeReferenceAddButton(state);
    // 参考素材上限：图片生成（含 Qwen-image2.1）最多 8 张，H3 最多 9 张；
    // 到上限后收起加号入口，删掉任意一张才会重新出现。
    if (state.addReference) {
      const kind = state.node.dataset.floraKind;
      const limit = kind === "minimax-h3" ? 9 : kind === "generator" ? 8 : Infinity;
      const overLimit = items.length >= limit;
      if (state.addReference.hidden !== overLimit) state.addReference.hidden = overLimit;
      state.addReference.title = overLimit
        ? `最多 ${limit} 张参考素材，删除一张后可继续添加`
        : "添加参考素材";
    }
  }

  // The add button sits directly behind the material cards; host captions such
  // as the first-frame file name stay after it and never push it to the far end.
  function placeReferenceAddButton(state) {
    if (!state.addReference) return;
    if (state.referencesView?.parentElement === state.referenceArea) state.referencesView.after(state.addReference);
    else state.referenceArea.append(state.addReference);
    if (state.referenceInput) state.referenceArea.append(state.referenceInput);
  }

  // 生成方式选项排在参数区之后、发送按钮之前。
  function placeH3ModeSwitch(state) {
    if (state.node.dataset.floraKind !== "minimax-h3") return;
    const modeSwitch = state.sources?.controls?.querySelector?.(".canvas-h3-mode-switch")
      || state.node.querySelector(".canvas-h3-mode-switch");
    if (!modeSwitch || modeSwitch.parentElement === state.actions) return;
    state.actions.prepend(modeSwitch);
    // 底排内容变了，宽度按节点类型重算一次位置。
    schedulePlace(state);
  }

  function h3ModeNoteText(node) {
    const mode = node.dataset.minimaxH3Mode || "reference";
    if (mode === "reference") return "";
    const refs = root.getCanvasIncomingReferenceMaterials?.(node.dataset.id) || [];
    const counts = { image: 0, video: 0, audio: 0 };
    refs.forEach((item) => { if (counts[item.type] !== undefined) counts[item.type] += 1; });
    const total = counts.image + counts.video + counts.audio;
    if (mode === "text") {
      return total ? `文生视频不使用参考素材，已连接的 ${total} 个素材会被忽略。` : "";
    }
    if (mode === "first") {
      return counts.image ? `首帧模式只使用第一张图片作为首帧，其余 ${Math.max(0, total - 1)} 个素材会被忽略。` : "首帧模式需要连接一张图片作为首帧。";
    }
    return counts.image ? `首尾帧模式使用前两张图片作为首帧和尾帧，其余 ${Math.max(0, total - Math.min(2, counts.image))} 个素材会被忽略。` : "首尾帧模式需要连接两张图片作为首帧和尾帧。";
  }

  function syncH3ModeNote(state) {
    if (state.node.dataset.floraKind !== "minimax-h3") return;
    const text = h3ModeNoteText(state.node);
    if (!state.modeNote) {
      const note = document.createElement("p");
      note.className = "flora-generator-mode-note";
      state.modeNote = note;
    }
    if (state.modeNote.textContent !== text) state.modeNote.textContent = text;
    state.modeNote.hidden = !text;
    if (text && state.modeNote.parentElement !== state.promptArea) state.promptArea.prepend(state.modeNote);
    if (!text && state.modeNote.parentElement) state.modeNote.remove();
  }

  function canvasViewportBounds() {
    const viewport = document.getElementById("infiniteCanvas");
    const rect = viewport?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) return { left: rect.left, right: rect.right };
    return null;
  }

  // 让位时优先贴合画布视口；视口本身比操作区还窄时退回窗口范围，保证面板整体可见。
  function revealBounds(width) {
    const windowWidth = Math.max(32, root.innerWidth || document.documentElement.clientWidth);
    const viewport = canvasViewportBounds();
    if (viewport && viewport.right - viewport.left >= width + 32) return viewport;
    return { left: 0, right: windowWidth };
  }

  function requestReveal(state) {
    if (!state || state.expanded || state.revealRequested || !state.node.isConnected) return;
    state.revealRequested = true;
    // 让位是一次性动作，允许实测：视口原点可能因为宿主位移而失效，实测保证位移量准确。
    refreshViewportOrigin();
    const shellRect = state.shell.getBoundingClientRect();
    const top = shellRect.bottom + 16;
    const deltaY = (root.innerHeight || document.documentElement.clientHeight) - 16 - 160 - top;
    // 操作区不再横向夹取，节点靠边时改为平移画布，让操作区既贴着节点又完整可见。
    const windowWidth = Math.max(32, root.innerWidth || document.documentElement.clientWidth);
    const width = composerPanelWidth(windowWidth, { wide: state.node.dataset.floraKind === "minimax-h3" });
    const bounds = revealBounds(width);
    const centredLeft = shellRect.left + shellRect.width / 2 - width / 2;
    const margin = 16;
    let deltaX = 0;
    if (centredLeft + width > bounds.right - margin) deltaX = bounds.right - margin - (centredLeft + width);
    else if (centredLeft < bounds.left + margin) deltaX = bounds.left + margin - centredLeft;
    if (deltaY >= -0.5 && Math.abs(deltaX) < 0.5) return;
    root.dispatchEvent(new CustomEvent("flora-generator-reveal", {
      detail: { node: state.node, screenDeltaY: deltaY, screenDeltaX: deltaX },
    }));
  }

  function syncAll() {
    for (const state of mounted.values()) {
      if (hasDetachedShell(state)
        || (state.everInPlane && (!state.node.isConnected || !state.plane?.contains(state.node)))) {
        discardDetached(state);
      } else {
        syncOne(state);
      }
    }
  }

  function onSelectionChange(event) {
    selectedIds = Array.isArray(event.detail?.selectedIds)
      ? event.detail.selectedIds.map(String)
      : [];
    syncAll();
    if (selectedIds.length === 1) {
      for (const state of mounted.values()) {
        if (String(state.node.dataset.id || "") === selectedIds[0]) requestReveal(state);
      }
    }
  }

  function onBoardChange() {
    refreshViewportOrigin();
    selectedIds = [];
    syncAll();
  }

  function onResize() {
    refreshViewportOrigin();
    syncAll();
    for (const state of mounted.values()) schedulePlace(state);
  }

  function bindGlobalListeners() {
    if (globalListenersBound) return;
    refreshViewportOrigin();
    root.addEventListener("canvas:selectionchange", onSelectionChange);
    root.addEventListener("canvas:board-changed", onBoardChange);
    root.addEventListener("resize", onResize);
    globalListenersBound = true;
  }

  function releaseGlobalListeners() {
    if (mounted.size || !globalListenersBound) return;
    root.removeEventListener("canvas:selectionchange", onSelectionChange);
    root.removeEventListener("canvas:board-changed", onBoardChange);
    root.removeEventListener("resize", onResize);
    selectedIds = null;
    globalListenersBound = false;
  }

  function observe(state) {
    const observer = new MutationObserver((records) => {
      if (mounted.get(state.node) !== state) return;
      if (hasDetachedShell(state)) {
        discardDetached(state);
        return;
      }
      const newSource = records.some((record) => record.type === "childList"
        && !state.panel.contains(record.target)
        && Array.from(record.addedNodes).some((added) => added.nodeType === 1
          && (added.matches?.(".canvas-node-refs, .canvas-node-prompt, .canvas-node-controls, .canvas-node-run, .canvas-engine-switch")
            || added.querySelector?.(".canvas-node-refs, .canvas-node-prompt, .canvas-node-controls, .canvas-node-run, .canvas-engine-switch"))));
      if (newSource) composeSources(state);
      const nativeChange = records.some(({ target, attributeName }) => {
        if (target === state.node && attributeName === "style") {
          // Placement writes these five variables on the node for the existing
          // CSS contract. They are not native content changes, so do not feed
          // them back into a full composer sync on every viewport frame.
          const placementOnly = state.composerProperties
            && Object.entries(state.composerProperties).every(([name, value]) => state.node.style.getPropertyValue(name) === value);
          if (!placementOnly) schedulePlace(state);
          return false;
        }
        if (state.panel.contains(target)) {
          return Boolean(target.closest?.(".canvas-node-run") || target === state.nativeStatus || state.nativeStatus?.contains(target));
        }
        return true;
      });
      if (nativeChange) syncOne(state);
    });
    observer.observe(state.node, {
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "disabled", "aria-busy", "data-result-src", "data-state", "data-canvas-generation-prompt", "data-comfy-prompt", "data-minimax-h3-mode"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    state.cleanups.push(() => observer.disconnect());

    if (typeof root.ResizeObserver === "function") {
      const shellObserver = new root.ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!(rect?.width > 0) || !(rect?.height > 0)) return;
        state.shellWidth = rect.width;
        state.shellHeight = rect.height;
        if (!state.panel.hidden) schedulePlace(state);
      });
      shellObserver.observe(state.shell);
      state.cleanups.push(() => shellObserver.disconnect());
    }

    // placeCanvasNode mounts the shell before appending the node to #canvasPlane.
    // The microtask sees the completed append even when the panel is hidden.
    queueMicrotask(() => {
      if (mounted.get(state.node) !== state) return;
      if (!state.node.isConnected) {
        discardDetached(state);
      } else {
        bindPlaneObserver(state);
      }
    });
  }

  function bindPlaneObserver(state) {
    const plane = state.node.closest("#canvasPlane") || document.getElementById("canvasPlane");
    if (!plane) return;
    if (state.plane === plane) {
      if (plane.contains(state.node)) state.everInPlane = true;
      return;
    }
    state.planeObserver?.disconnect();
    state.plane = plane;
    state.everInPlane = plane.contains(state.node);
    const observer = new MutationObserver((records) => {
      if (mounted.get(state.node) !== state) return;
      if (hasDetachedShell(state)) {
        discardDetached(state);
        return;
      }
      if (!state.node.isConnected || !plane.contains(state.node)) {
        if (state.everInPlane) discardDetached(state);
        return;
      }
      state.everInPlane = true;
      if (records.some((record) => record.type === "attributes" || record.addedNodes.length)) {
        schedulePlace(state);
      }
    });
    observer.observe(plane, {
      // Canvas pan/zoom updates the plane's inline transform every frame.
      // That mutation does not change node attachment or panel ownership, but
      // observing it schedules a layout read for every mounted composer.
      // Keep class changes and child-list changes for lifecycle/layout updates;
      // transform placement is driven by the canvas viewport sync itself.
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
    });
    state.planeObserver = observer;
    state.cleanups.push(() => observer.disconnect());
  }

  function syncExpandButton(state) {
    const label = state.expanded ? "关闭放大操作区" : "放大操作区";
    state.expandButton.title = label;
    state.expandButton.setAttribute("aria-label", label);
    state.expandButton.setAttribute("aria-expanded", String(Boolean(state.expanded)));
    const icon = document.createElement("i");
    icon.dataset.lucide = state.expanded ? "x" : "maximize-2";
    icon.setAttribute("aria-hidden", "true");
    state.expandButton.replaceChildren(icon);
    root.lucide?.createIcons?.({ root: state.expandButton, attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  function collapsePanel(state, restoreFocus = true) {
    if (!state.expanded) return;
    root.FloraGeneratorParameters?.close?.(state.node);
    state.modelPicker?.close?.();
    state.expanded = false;
    if (state.dialog.open) state.dialog.close();
    state.panel.classList.remove("is-expanded");
    state.shell.append(state.panel);
    syncExpandButton(state);
    schedulePlace(state);
    if (restoreFocus && state.node.isConnected && !state.panel.hidden) state.expandButton.focus({ preventScroll: true });
  }

  function expandPanel(state) {
    if (state.expanded || !state.node.isConnected) return;
    root.FloraGeneratorParameters?.close?.(state.node);
    state.modelPicker?.close?.();
    if (!state.dialog) {
      const dialog = document.createElement("dialog");
      dialog.className = "flora-generator-expanded-dialog";
      dialog.id = `flora-generator-expanded-${state.node.dataset.id}`;
      dialog.setAttribute("aria-label", "放大生成操作区");
      state.expandButton.setAttribute("aria-controls", dialog.id);
      state.dialog = dialog;
      state.shell.append(dialog);
      dialog.addEventListener("cancel", event => { event.preventDefault(); collapsePanel(state); });
      dialog.addEventListener("close", () => { if (!dialog.open) collapsePanel(state); });
      dialog.addEventListener("click", event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) collapsePanel(state);
      });
      for (const type of ["pointerdown", "click", "dblclick", "wheel", "keydown"]) dialog.addEventListener(type, event => {
        event.stopPropagation();
        if (type === "keydown" && event.key === "Tab") {
          const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
            .filter(element => element.getClientRects().length && element.tabIndex >= 0);
          const first = focusable[0], last = focusable.at(-1);
          if (first && (!focusable.includes(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last)) {
            event.preventDefault(); (event.shiftKey ? last : first).focus();
          }
        }
        // The model menu is a child of this modal while open. Escape closes the
        // menu first, before the modal, and never reaches canvas shortcuts.
        if (type === "keydown" && event.key === "Escape" && state.modelPicker?.mount?.classList.contains("is-open")) {
          event.preventDefault(); state.modelPicker.close();
          state.modelPicker.mount.querySelector(".image-model-picker-trigger")?.focus();
        }
      });
    }
    state.expanded = true;
    state.panel.classList.add("is-expanded");
    state.dialog.append(state.panel);
    syncExpandButton(state);
    try { state.dialog.showModal(); }
    catch (error) { collapsePanel(state); throw error; }
    (state.panel.querySelector('textarea:not(:disabled):not([readonly])') || state.expandButton).focus({ preventScroll: true });
    schedulePlace(state);
  }

  function createPanel(state) {
    const panel = document.createElement("div");
    panel.className = "flora-generator-composer";
    panel.dataset.floraRegion = "generator-composer";
    panel.setAttribute("aria-label", "生成操作区");
    panel.hidden = true;
    const referenceArea = createSection("flora-generator-reference-area", "参考图");
    const promptArea = createSection("flora-generator-prompt-area", "提示词");
    const settings = createSection("flora-generator-settings", "生成参数");
    const actions = createSection("flora-generator-actions", "生成操作");
    const price = document.createElement("span");
    price.className = "flora-generator-cost";
    price.hidden = true;
    actions.append(price);
    const footer = document.createElement("div");
    footer.className = "flora-generator-footer";
    footer.append(settings, actions);
    const status = document.createElement("div");
    status.className = "flora-generator-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;
    panel.append(referenceArea, promptArea, footer, status);
    state.shell.append(panel);
    Object.assign(state, { panel, referenceArea, promptArea, settings, actions, status, price });
    const expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = "flora-generator-expand";
    expandButton.setAttribute("aria-haspopup", "dialog");
    state.expandButton = expandButton;
    panel.append(expandButton);
    syncExpandButton(state);
    const toggleExpand = event => { event.stopPropagation(); if (state.expanded) collapsePanel(state); else expandPanel(state); };
    expandButton.addEventListener("click", toggleExpand);
    state.cleanups.push(() => expandButton.removeEventListener("click", toggleExpand));

    const stopPointer = (event) => event.stopPropagation();
    for (const type of ["pointerdown", "click", "dblclick", "wheel"]) {
      panel.addEventListener(type, stopPointer);
      state.cleanups.push(() => panel.removeEventListener(type, stopPointer));
    }
    if (state.node.dataset.floraKind !== "audio-generator") addReferenceControl(state);
    const parametersOpen = () => state.modelPicker?.close?.();
    state.node.addEventListener("flora-generator-parameters-open", parametersOpen);
    state.cleanups.push(() => state.node.removeEventListener("flora-generator-parameters-open", parametersOpen));
    const workflowChange = () => queueMicrotask(() => syncComfyPrompt(state));
    state.node.addEventListener("change", workflowChange);
    state.cleanups.push(() => state.node.removeEventListener("change", workflowChange));
  }

  function syncComfyPrompt(state) {
    if (!state.comfyPrompt) return;
    // Qwen-image2.1 两种模式都用提示词：有参考图是图像编辑，没有参考图是文生图。
    // 占位符与 API 生图节点保持一致，操作区不留解释性文案。
    state.comfyPrompt.readOnly = false;
    state.comfyPrompt.placeholder = "输入本次生成要求，可连接文字或图片作为参考素材";
    // Restore assigns datasets after the native renderer has mounted.
    const saved = state.node.dataset.canvasGenerationPrompt ?? state.node.dataset.comfyPrompt ?? "";
    if (state.comfyPrompt.value !== saved) state.comfyPrompt.value = saved;
  }

  function composeSources(state) {
    const { node, shell, panel } = state;
    const content = shell.querySelector(":scope > .flora-node-content");
    const inputArea = content?.querySelector(":scope > .flora-node-input-area");
    const resultArea = content?.querySelector(":scope > .flora-node-result-area");
    const parameterTray = shell.querySelector(":scope > .flora-node-parameter-tray");
    state.origins = { inputArea, resultArea, parameterTray, content };
    state.resultArea = resultArea;
    // Text nodes keep their own editable surface instead of a result area, so
    // the panel must still mount when there is nothing to preview.
    if (!content && !resultArea) return;

    let refs = sourceOutsidePanel(node, ".canvas-node-refs, .canvas-llm-images, .canvas-h3-reference-grid, .canvas-audio-generator-refs", panel);
    if (!refs && node.dataset.floraKind === "video-api") {
      refs = document.createElement("div");
      refs.className = "canvas-node-refs";
      refs.hidden = true;
    }
    let prompt = sourceOutsidePanel(node, ".canvas-node-prompt, .canvas-api-video-prompt-input, .canvas-h3-prompt, .canvas-audio-generator-prompt", panel);
    if (prompt) prompt.classList.add("canvas-node-prompt");
    if (node.classList.contains("canvas-node-comfy") && !state.comfyPrompt) {
      if (!prompt) {
        prompt = document.createElement("textarea");
        prompt.className = "canvas-node-prompt";
        prompt.setAttribute("aria-label", "提示词");
      }
      state.comfyPrompt = prompt;
      const savePrompt = () => root.dispatchEvent(new CustomEvent("flora-generator-prompt-change", {
        detail: { node, prompt: prompt.value },
      }));
      prompt.addEventListener("input", savePrompt);
      state.cleanups.push(() => prompt.removeEventListener("input", savePrompt));
      syncComfyPrompt(state);
    }
    const engineSwitch = sourceOutsidePanel(node, ".canvas-engine-switch", panel);
    mountEnginePicker(node);
    const controls = sourceOutsidePanel(node, ".canvas-node-controls, .canvas-llm-controls, .canvas-api-video-controls, .canvas-h3-controls, .canvas-audio-generator-controls", panel);
    if (controls) controls.classList.add("canvas-node-controls");
    const run = sourceOutsidePanel(node, ".canvas-node-run, .canvas-h3-run, .canvas-audio-generator-run", panel);
    if (run) run.classList.add("canvas-node-run");
    const previous = state.sources || {};
    for (const [name, replacement] of Object.entries({ refs, prompt, engineSwitch, controls, run })) {
      if (replacement && previous[name] && previous[name] !== replacement && panel.contains(previous[name])) {
        previous[name].remove();
      }
    }
    if (engineSwitch && engineSwitch !== previous.engineSwitch) state.engineOrigin = {
      parent: engineSwitch.parentElement,
      next: engineSwitch.nextSibling,
    };
    if (run && run !== previous.run) state.runOrigin = {
      parent: run.parentElement,
      next: run.nextSibling,
    };
    state.sources = { refs, prompt, engineSwitch, controls, run };
    put(refs, state.referenceArea);
    placeReferenceAddButton(state);
    put(prompt, state.promptArea);
    if (engineSwitch && engineSwitch !== state.settings.firstElementChild) state.settings.prepend(engineSwitch);
    put(controls, state.settings);
    put(run, state.actions);
    placeH3ModeSwitch(state);
    if (node.classList.contains("canvas-node-comfy")) {
      for (const extra of node.querySelectorAll(".canvas-comfy-outpaint, .canvas-comfy-qwen-angle")) {
        // 扩图 / 换角度的参数面板归工具栏的工具面板所有，操作区不再收走它们。
        if (!extra.closest(".flora-generator-parameter-popover, .flora-node-tool-panel")) put(extra, controls);
      }
      // 参考行只留 API 版那样的「+」：模式（编辑/生图）由有没有参考图就能看出来，
      // 参数摘要已经在底排的「图片参数」入口上，摘要文字不再占参考行的位置。
      node.querySelector(".canvas-comfy-mode")?.setAttribute("aria-label", "选择模型");
    }
    if (["video-api", "minimax-h3"].includes(node.dataset.floraKind) && controls && !state.mediaParameters) {
      const extras = document.createElement("div");
      extras.className = "flora-media-parameters";
      for (const field of Array.from(controls.children)) {
        if (field.matches(".canvas-h3-resolution-hint")) { extras.append(field); continue; }
        if (!field.matches(".canvas-h3-field:not(.canvas-api-video-model-field)")) continue;
        // 模型是底排独立一项，不进入视频参数弹层；参考图与种子只保留取值字段。
        if (field.dataset.h3Param === "model") continue;
        extras.append(field);
      }
      if (extras.children.length) controls.append(extras);
      state.mediaParameters = extras;
    }
    if (node.dataset.floraKind === "llm" && controls) {
      const presets = node.querySelector(".canvas-llm-presets");
      if (presets && !presets.closest(".flora-generator-parameter-popover")) put(presets, controls);
    }
    root.FloraGeneratorParameters?.mount?.(node, controls);
    if (node.dataset.floraKind !== "generator") {
      const nativeResult = node.querySelector(".canvas-audio-generator-result");
      if (nativeResult) put(nativeResult, resultArea);
      state.supplementary ||= [];
      for (const supplementary of node.querySelectorAll(".canvas-api-video-reference, .canvas-audio-generator-disclosure")) {
        if (!state.supplementary.includes(supplementary)) state.supplementary.push(supplementary);
        put(supplementary, state.referenceArea);
      }
      if (!state.nativeStatus) state.nativeStatus = node.querySelector(".canvas-h3-status, .canvas-audio-generator-status");
      if (state.nativeStatus && !panel.contains(state.nativeStatus)) {
        state.nativeStatus.hidden = true;
        panel.append(state.nativeStatus);
      }
    }
    const modelSelect = node.querySelector(".canvas-node-model");
    if (["generator", "text", "llm"].includes(node.dataset.floraKind) && modelSelect && !modelSelect.classList.contains("canvas-comfy-mode") && state.modelSelect !== modelSelect) {
      state.modelSelect = modelSelect;
      state.modelPicker = root.enhanceCanvasImageModelSelect?.(modelSelect);
      state.modelPicker?.setPresentation?.("flora");
      const trigger = state.modelPicker?.mount?.querySelector(".image-model-picker-trigger");
      const modelOpen = () => root.FloraGeneratorParameters?.close?.(node);
      trigger?.addEventListener("click", modelOpen);
      state.cleanups.push(() => trigger?.removeEventListener("click", modelOpen));
    }
    let placeholder = resultArea?.querySelector(":scope > .flora-generator-placeholder") || null;
    if (resultArea && !placeholder) {
      placeholder = document.createElement("div");
      placeholder.className = "flora-generator-placeholder";
      const icon = document.createElement("i");
      icon.dataset.lucide = ({ llm: "text", "video-api": "video", "minimax-h3": "video", "audio-generator": "audio-lines" })[node.dataset.floraKind] || "image";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = "生成结果";
      placeholder.append(icon, label);
      resultArea.append(placeholder);
      root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    }
    state.placeholder = placeholder;
    ensureResult(state);
  }

  function dispose(state, restore) {
    collapsePanel(state, false);
    if (state.placementFrame != null) root.cancelAnimationFrame(state.placementFrame);
    state.cleanups.forEach((cleanup) => cleanup());
    root.FloraGeneratorParameters?.unmount?.(state.node);
    state.modelPicker?.close?.();
    if (restore) state.modelPicker?.setPresentation?.("canvas");
    else root.releaseCanvasImageModelPicker?.(state.modelSelect);
    if (restore) {
      const { refs, prompt, engineSwitch, controls, run } = state.sources || {};
      const { inputArea, parameterTray, content } = state.origins || {};
      run?.querySelector(".flora-generator-run-icon")?.remove();
      run?.removeAttribute("aria-label");
      run?.removeAttribute("title");
      if (run) {
        const parent = state.runOrigin?.parent;
        if (parent?.isConnected && parent !== state.actions) {
          if (state.runOrigin.next?.parentElement === parent) parent.insertBefore(run, state.runOrigin.next);
          else parent.append(run);
        } else if (controls) controls.append(run);
        else put(run, content);
      }
      if (refs) refs.hidden = false;
      put(refs, inputArea || content);
      put(prompt, inputArea || content);
      if (engineSwitch) {
        const parent = state.engineOrigin?.parent;
        if (parent?.isConnected && parent !== state.settings) {
          if (state.engineOrigin.next?.parentElement === parent) parent.insertBefore(engineSwitch, state.engineOrigin.next);
          else parent.append(engineSwitch);
        } else {
          put(engineSwitch, parameterTray || content);
        }
      }
      put(controls, parameterTray || content);
      for (const supplementary of state.supplementary || []) put(supplementary, inputArea || content);
      if (state.nativeStatus) { state.nativeStatus.hidden = false; put(state.nativeStatus, content); }
      if (state.createdResult && state.result?.parentElement === state.resultArea
        && !state.result.querySelector("img") && !state.node.dataset.resultSrc) {
        state.result.remove();
      }
      state.placeholder?.remove();
    }
    state.panel?.remove();
    state.dialog?.remove();
    state.node.classList.remove("is-flora-composer-open");
    for (const name of ["--flora-composer-left", "--flora-composer-top", "--flora-composer-width", "--flora-composer-max-height", "--flora-composer-counter-scale"]) {
      state.panel?.style.removeProperty(name);
      state.node.style.removeProperty(name);
    }
    state.composerProperties = null;
  }

  function discardDetached(state) {
    if (mounted.get(state.node) !== state) return;
    mounted.delete(state.node);
    dispose(state, false);
    releaseGlobalListeners();
  }

  function mount(node, shell) {
    if (!node || !shell || !COMPOSER_KINDS.has(node.dataset.floraKind)) return null;
    let state = mounted.get(node);
    if (state && state.shell !== shell) {
      dispose(state, false);
      mounted.delete(node);
      state = null;
    }
    if (!state) {
      state = { node, shell, cleanups: [], placementFrame: null };
      mounted.set(node, state);
      bindGlobalListeners();
      createPanel(state);
      composeSources(state);
      observe(state);
    } else {
      composeSources(state);
    }
    syncOne(state);
    bindPlaneObserver(state);
    if (isSelected(state)) requestReveal(state);
    return state.panel;
  }

  function sync(node) {
    const state = mounted.get(node);
    if (!state) return;
    if (hasDetachedShell(state) || (state.everInPlane && (!state.node.isConnected || !state.plane?.contains(state.node)))) discardDetached(state);
    else syncOne(state);
  }

  function syncViewport() {
    for (const state of mounted.values()) {
      if (state.panel.hidden || state.expanded || !state.node.isConnected) continue;
      schedulePlace(state);
    }
  }

  function unmount(node) {
    const state = mounted.get(node);
    if (!state) return;
    mounted.delete(node);
    dispose(state, state.shell.isConnected && node.contains(state.shell));
    releaseGlobalListeners();
  }

  root.FloraGeneratorComposer = Object.freeze({ mount, sync, syncViewport, unmount, mountEnginePicker, unmountEnginePickers });
})(typeof window !== "undefined" ? window : globalThis);
