(function installFloraGeneratorParameters(root) {
  "use strict";
  const mounted = new WeakMap();
  let nextId = 0;

  function icon(name) {
    const element = document.createElement("i");
    element.dataset.lucide = name;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function labelFor(option) {
    const text = option?.textContent?.trim() || "";
    if (option?.value === "auto") return "自适应";
    if (option?.value === "custom") return "自定义";
    return text;
  }

  // Older image APIs encode ratio and quality in a single pixel-size option.
  // Project that existing catalog into two groups without inventing API sizes.
  function presetProjection(size, resolution) {
    if (!size || (resolution && !resolution.hidden && !resolution.disabled)) return null;
    if (!Array.from(size.options).some(option => /^\d+x\d+$/.test(option.value))) return null;
    const entries = Array.from(size.options).map(option => {
      const label = labelFor(option), pixels = option.value.match(/^(\d+)x(\d+)$/);
      let ratio = option.value === "auto" ? "auto" : option.value === "custom" || /^自定义/.test(label) ? "custom" : label.match(/\d+\s*:\s*\d+/)?.[0].replace(/\s/g, "");
      if (!ratio && pixels) {
        const gcd = (a, b) => b ? gcd(b, a % b) : a;
        const divisor = gcd(Number(pixels[1]), Number(pixels[2]));
        ratio = `${Number(pixels[1]) / divisor}:${Number(pixels[2]) / divisor}`;
      }
      return { option, ratio: ratio || option.value, level: pixels && ratio !== "custom" ? label.match(/(\d+(?:\.\d+)?)\s*K/i)?.[1] || "1" : null };
    });
    const selected = entries.find(entry => entry.option.value === size.value);
    const ratios = [...new Set(entries.map(entry => entry.ratio))];
    const levels = [...new Set(entries.map(entry => entry.level).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    const available = entries.filter(entry => !entry.option.disabled);
    const pickRatio = ratio => available.find(entry => entry.ratio === ratio && entry.level === selected?.level)
      || available.find(entry => entry.ratio === ratio);
    const pickLevel = level => available.find(entry => entry.ratio === selected?.ratio && entry.level === level);
    return {
      selectedSize: selected?.ratio,
      selectedResolution: selected?.level,
      sizes: ratios.map(ratio => ({ value: ratio, label: ratio === "auto" ? "自适应" : ratio === "custom" ? "自定义" : ratio, disabled: !pickRatio(ratio), reason: !pickRatio(ratio) ? "当前模型不支持此比例" : "" })),
      resolutions: levels.map(level => ({ value: level, label: `${level}K`, disabled: !pickLevel(level), reason: !pickLevel(level) ? selected?.ratio === "auto" ? "自适应尺寸由模型决定分辨率" : selected?.ratio === "custom" ? "自定义尺寸请填写宽高" : `当前模型没有${selected?.ratio || "此比例"}的${level}K预设` : "" })),
      choose(kind, value) {
        if (size.disabled) return;
        const entry = kind === "size" ? pickRatio(value) : pickLevel(value);
        if (!entry) return;
        size.value = entry.option.value;
        size.dispatchEvent(new Event("change", { bubbles: true }));
      },
    };
  }

  function position(state) {
    if (!state.popup.matches(":popover-open")) return;
    const width = Math.max(32, root.innerWidth), height = Math.max(32, root.innerHeight);
    const anchor = state.trigger.getBoundingClientRect();
    state.popup.style.width = `${Math.min(480, width - 32)}px`;
    state.popup.style.maxHeight = `${height - 32}px`;
    const popupHeight = state.popup.getBoundingClientRect().height;
    const above = anchor.top - popupHeight - 8;
    const below = anchor.bottom + 8;
    const top = above >= 16 ? above : below + popupHeight <= height - 16 ? below : Math.max(16, height - popupHeight - 16);
    state.popup.style.left = `${Math.max(16, Math.min(anchor.left, width - state.popup.offsetWidth - 16))}px`;
    state.popup.style.top = `${top}px`;
  }

  function close(node, restoreFocus = false) {
    const state = mounted.get(node);
    if (!state) return;
    if (state.popup.matches(":popover-open")) state.popup.hidePopover();
    state.trigger.setAttribute("aria-expanded", "false");
    if (state.settings?.popup.matches(':popover-open')) state.settings.popup.hidePopover();
    state.settings?.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) state.trigger.focus();
  }

  function renderChoices(state, select, section, kind) {
    const available = Boolean(select && !select.hidden && !select.disabled);
    section.hidden = !available;
    if (!available) return;
    const options = Array.from(select.options).map(option => ({ value: option.value, label: labelFor(option), disabled: option.disabled, reason: option.dataset.reason }));
    renderChoiceOptions(state, section, kind, options, select.value, value => {
      const option = Array.from(select.options).find(option => option.value === value);
      if (select.disabled || !option || option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function renderChoiceOptions(state, section, kind, options, selected, choose) {
    section.hidden = false;
    const grid = section.querySelector(".flora-generator-parameter-choices");
    const signature = JSON.stringify(options.map(option => [option.value, option.label, option.disabled, option.reason]));
    if (grid.dataset.signature !== signature) {
      const focused = grid.contains(document.activeElement) ? document.activeElement?.dataset.paramValue : null;
      grid.replaceChildren();
      grid.dataset.signature = signature;
      for (const option of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "flora-generator-parameter-choice";
        button.dataset.paramKind = kind;
        button.dataset.paramValue = option.value;
        button.disabled = option.disabled;
        button.title = option.reason || option.label;
        if (kind === "size") {
          const ratio = option.label.match(/(\d+)\s*:\s*(\d+)/);
          const shape = option.value === "auto" ? "scan" : option.value === "custom" ? "ruler"
            : ratio && Number(ratio[1]) > Number(ratio[2]) ? "rectangle-horizontal"
              : ratio && Number(ratio[1]) < Number(ratio[2]) ? "rectangle-vertical" : "square";
          button.append(icon(shape));
        }
        const text = document.createElement("span");
        text.textContent = option.label;
        button.append(text);
        button.addEventListener("click", () => {
          if (button.disabled) return;
          // Read the current handler; selection may change without rebuilding.
          grid.chooseValue(option.value);
          sync(state.node);
        });
        grid.append(button);
      }
      root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      if (focused !== null) Array.from(grid.children).find(button => button.dataset.paramValue === focused)?.focus();
    }
    grid.chooseValue = choose;
    for (const button of grid.children) button.setAttribute("aria-pressed", String(button.dataset.paramValue === selected));
  }

  function h3FieldText(node, param, selector = "select") {
    const field = node.querySelector(`.canvas-h3-field[data-h3-param="${param}"]`);
    const control = field?.querySelector(selector);
    if (!control) return "";
    return selector === "select" ? control.selectedOptions?.[0]?.textContent?.trim() || "" : String(control.value || "").trim();
  }

  // 视频参数入口显示参数摘要，模型留在底排自己一项，避免入口看起来像模型列表。
  function h3ParameterSummary(node) {
    const aspect = h3FieldText(node, "aspectRatio").split(/\s+/)[0] || "";
    const quality = h3FieldText(node, "megapixels");
    const steps = h3FieldText(node, "steps").match(/\d+/)?.[0] || "";
    const duration = h3FieldText(node, "duration", "input");
    return [
      aspect,
      quality,
      steps ? `${steps}步` : "",
      duration ? `${duration}秒` : "",
    ].filter(Boolean).join(" · ");
  }

  function sync(node) {
    const state = mounted.get(node);
    if (!state) return;
    // ComfyUI 图片生成节点的「比例 / 像素档」用同一套两栏结构，
    // 只是类名不同，避免和 API 生成节点的尺寸控件互相覆盖。
    const size = node.querySelector(".canvas-node-size") || node.querySelector(".canvas-comfy-aspect");
    const resolution = node.querySelector(".canvas-node-resolution");
    const presets = presetProjection(size, resolution);
    const sizeLabel = presets ? presets.sizes.find(option => option.value === presets.selectedSize)?.label || "尺寸" : size ? labelFor(size.selectedOptions[0]) || "尺寸" : "";
    const resolutionLabel = presets ? presets.selectedResolution ? `${presets.selectedResolution}K` : "" : resolution && !resolution.hidden && !resolution.disabled ? resolution.selectedOptions[0]?.textContent?.trim() : "";
    const hasExtras = state.extras.some(element => !element.hidden && getComputedStyle(element).display !== "none"
      && !element.matches(".canvas-node-resolution-help, .canvas-custom-size-field"));
    const h3Caption = node.dataset.floraKind === "minimax-h3" ? h3ParameterSummary(node) : "";
    const videoCaption = node.dataset.floraKind === "video-api" ? [node.dataset.apiVideoRatio, node.dataset.apiVideoResolution, node.dataset.apiVideoDuration ? `${node.dataset.apiVideoDuration}秒` : ""].filter(Boolean).join(" · ") : "";
    const caption = [sizeLabel, resolutionLabel].filter(Boolean).join(" · ") || videoCaption || h3Caption || "参数";
    if (state.caption.textContent !== caption) state.caption.textContent = caption;
    state.trigger.setAttribute("aria-label", `${state.label}，当前：${caption}`);
    state.trigger.title = `${state.label}：${caption}`;
    state.trigger.disabled = !(size && !size.disabled || resolution && !resolution.disabled || hasExtras);
    if (presets && !size.hidden && !size.disabled) {
      for (const kind of ["size", "resolution"]) {
        renderChoiceOptions(state, kind === "size" ? state.sizeSection : state.resolutionSection, kind,
          kind === "size" ? presets.sizes : presets.resolutions,
          kind === "size" ? presets.selectedSize : presets.selectedResolution,
          value => presetProjection(node.querySelector(".canvas-node-size"), node.querySelector(".canvas-node-resolution"))?.choose(kind, value));
      }
    } else {
      renderChoices(state, size, state.sizeSection, "size");
      renderChoices(state, resolution, state.resolutionSection, "resolution");
    }
    state.advancedTitle.hidden = !hasExtras;
    if (state.settings) {
      const available = !state.settings.container.hidden;
      state.settings.trigger.hidden = !available;
      if (!available && state.settings.popup.matches(':popover-open')) state.settings.popup.hidePopover();
      position(state.settings);
    }
    position(state);
  }

  function section(label) {
    const element = document.createElement("section");
    element.className = "flora-generator-parameter-section";
    element.setAttribute("aria-label", label);
    const title = document.createElement("span");
    title.className = "flora-generator-parameter-label";
    title.textContent = label;
    const choices = document.createElement("div");
    choices.className = "flora-generator-parameter-choices";
    element.append(title, choices);
    return element;
  }

  function mount(node, controls) {
    if (!controls) return null;
    const existing = mounted.get(node);
    if (existing?.controls === controls) { sync(node); return existing; }
    if (existing) unmount(node);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "flora-generator-parameter-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    const caption = document.createElement("span");
    trigger.append(caption, icon("chevron-down"));
    const popup = document.createElement("div");
    popup.className = "flora-generator-parameter-popover";
    popup.id = `flora-generator-parameters-${++nextId}`;
    popup.setAttribute("popover", "auto");
    popup.setAttribute("role", "dialog");
    const parameterLabel = ({ llm: "文本参数", "audio-generator": "音频参数", "video-api": "视频参数", "minimax-h3": "视频参数" })[node.dataset.floraKind] || "图片参数";
    popup.setAttribute("aria-label", parameterLabel);
    trigger.setAttribute("aria-controls", popup.id);
    const header = document.createElement("div");
    header.className = "flora-generator-parameter-header";
    const title = document.createElement("strong");
    title.textContent = parameterLabel;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "flora-generator-parameter-close";
    dismiss.setAttribute("aria-label", `关闭${parameterLabel}`);
    dismiss.title = `关闭${parameterLabel}`;
    dismiss.append(icon("x"));
    header.append(title, dismiss);
    const sizeSection = section("选择比例");
    const resolutionSection = section("选择分辨率");
    const advancedTitle = document.createElement("span");
    advancedTitle.className = "flora-generator-parameter-label";
    advancedTitle.textContent = "高级参数";
    popup.append(header, sizeSection, resolutionSection, advancedTitle);
    const sources = Array.from(controls.querySelectorAll(".canvas-node-size, .canvas-node-resolution, .canvas-comfy-aspect, .canvas-comfy-megapixels"));
    for (const source of sources) source.classList.add("flora-generator-parameter-source");
    const midjourney = controls.querySelector('.canvas-midjourney-options');
    const separateMidjourney = Boolean(midjourney && root.FloraMidjourneySettings);
    const extras = Array.from(controls.children).filter(element => element.matches(".canvas-custom-size-field, .canvas-node-resolution-help, .canvas-midjourney-options, .canvas-node-model-parameters, .canvas-model-options, .canvas-comfy-outpaint, .canvas-comfy-qwen-angle, .flora-media-parameters, .canvas-audio-generator-parameters, .canvas-llm-presets") && !(separateMidjourney && element === midjourney));
    for (const element of extras) popup.append(element);
    controls.append(trigger, popup);
    const state = { node, controls, trigger, caption, popup, sizeSection, resolutionSection, advancedTitle, sources, extras, label: parameterLabel };
    mounted.set(node, state);
    if (separateMidjourney) {
      const gear = document.createElement('button'); gear.type = 'button'; gear.className = 'flora-generator-parameter-trigger flora-midjourney-settings-trigger';
      gear.dataset.floraMidjourneySettings = ''; gear.hidden = midjourney.hidden; gear.title = 'Midjourney 设置';
      gear.setAttribute('aria-label', 'Midjourney 设置'); gear.setAttribute('aria-haspopup', 'dialog'); gear.setAttribute('aria-expanded', 'false'); gear.append(icon('settings'));
      const settings = document.createElement('div'); settings.className = 'flora-generator-parameter-popover flora-midjourney-settings-popover'; settings.id = `flora-midjourney-settings-${++nextId}`;
      settings.setAttribute('popover', 'auto'); settings.setAttribute('role', 'dialog'); settings.setAttribute('aria-label', 'Midjourney 设置'); gear.setAttribute('aria-controls', settings.id);
      const heading = header.cloneNode(true); heading.querySelector('strong').textContent = 'Midjourney 设置';
      const exit = heading.querySelector('button'); exit.setAttribute('aria-label', '关闭 Midjourney 设置'); exit.title = '关闭 Midjourney 设置';
      settings.append(heading, midjourney); controls.append(gear, settings);
      state.settings = { trigger: gear, popup: settings, container: midjourney };
      gear.addEventListener('click', () => {
        if (settings.matches(':popover-open')) { settings.hidePopover(); gear.setAttribute('aria-expanded', 'false'); return; }
        close(node); node.dispatchEvent(new CustomEvent('flora-generator-parameters-open', { bubbles: true }));
        settings.showPopover(); position(state.settings); settings.querySelector('select, input, button')?.focus();
      });
      exit.addEventListener('click', () => { settings.hidePopover(); gear.setAttribute('aria-expanded', 'false'); gear.focus(); });
      settings.addEventListener('toggle', event => gear.setAttribute('aria-expanded', String(event.newState === 'open')));
      settings.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); settings.hidePopover(); gear.setAttribute('aria-expanded', 'false'); gear.focus(); } });
    }
    trigger.addEventListener("click", () => {
      if (popup.matches(":popover-open")) close(node);
      else {
        node.dispatchEvent(new CustomEvent("flora-generator-parameters-open", { bubbles: true }));
        sync(node);
        popup.showPopover();
        trigger.setAttribute("aria-expanded", "true");
        position(state);
        const selected = popup.querySelector('.flora-generator-parameter-choice[aria-pressed="true"]:not(:disabled)');
        (selected || dismiss).focus();
      }
    });
    dismiss.addEventListener("click", () => close(node, true));
    popup.addEventListener("toggle", event => trigger.setAttribute("aria-expanded", String(event.newState === "open")));
    popup.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(node, true); }
    });
    const changed = () => queueMicrotask(() => { if (mounted.get(node) === state) sync(node); });
    node.addEventListener("change", changed);
    state.changed = changed;
    const observer = new MutationObserver(changed);
    for (const source of sources) observer.observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden", "selected"] });
    state.observer = observer;
    sync(node);
    root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    return state;
  }

  function unmount(node) {
    const state = mounted.get(node);
    if (!state) return;
    close(node);
    mounted.delete(node);
    state.observer.disconnect();
    node.removeEventListener("change", state.changed);
    for (const source of state.sources) source.classList.remove("flora-generator-parameter-source");
    for (const element of state.extras) state.controls.append(element);
    if (state.settings) { state.controls.append(state.settings.container); state.settings.trigger.remove(); state.settings.popup.remove(); }
    state.trigger.remove();
    state.popup.remove();
  }

  root.FloraGeneratorParameters = Object.freeze({ mount, sync, close, unmount, reposition(node) { const state = mounted.get(node); if (state) { position(state); if (state.settings) position(state.settings); } } });
})(typeof window !== "undefined" ? window : globalThis);
