(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AiOsModelParameters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TEMPERATURE = { key: "temperature", label: "随机程度", type: "number", min: 0, max: 2, step: "any" };
  const MAX_TOKENS = { key: "max_tokens", label: "回复长度上限", type: "number", min: 1, max: 1000000, step: 1 };
  const MAX_OUTPUT_TOKENS = { ...MAX_TOKENS, key: "max_output_tokens" };
  const IMAGE_SIZE = { key: "size", label: "图片尺寸", type: "select", options: ["1024x1024", "1536x1024", "1024x1536", "auto"] };
  const IMAGE_QUALITY = { key: "quality", label: "图片质量", type: "select", options: ["auto", "low", "medium", "high"] };
  const IMAGE_BACKGROUND = { key: "background", label: "背景", type: "select", options: ["auto", "opaque", "transparent"] };
  const IMAGE_OUTPUT_FORMAT = { key: "output_format", label: "输出格式", type: "select", options: ["png", "jpeg", "webp"] };
  const IMAGE_STEPS = { key: "steps", label: "生成步数", type: "number", min: 1, max: 200, step: 1 };
  const IMAGE_GUIDANCE = { key: "guidance_scale", label: "引导强度", type: "number", min: 0, max: 30, step: "any" };
  const IMAGE_SEED = { key: "seed", label: "随机种子", type: "number", min: 0, max: 2147483647, step: 1 };
  const IMAGE_NEGATIVE_PROMPT = { key: "negativePrompt", label: "负向提示", type: "text" };
  const RELAY_SIZE = { key: "size", label: "图片尺寸", type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] };
  const RELAY_RESOLUTION = { key: "resolution", label: "分辨率", type: "select", options: ["1K", "2K", "4K"] };
  const GEMINI_ASPECT_RATIO = { key: "aspect_ratio", label: "画面比例", type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] };
  const GEMINI_IMAGE_SIZE = { key: "image_size", label: "图片分辨率", type: "select", options: ["1K", "2K", "4K"] };
  const MIDJOURNEY_VERSION = { key: "version", label: "版本", type: "select", options: ["8.2", "8.1", "7", "6.1", "5.2"] };
  const MIDJOURNEY_MODE = { key: "mode", label: "模式", type: "select", options: ["standard", "niji"] };
  const MIDJOURNEY_SPEED = { key: "speed", label: "速度", type: "select", options: ["relax", "fast", "turbo"] };
  const MIDJOURNEY_QUALITY = { key: "quality", label: "画质", type: "select", options: ["sd", "hd"] };
  const MIDJOURNEY_STYLE = { key: "style", label: "风格", type: "select", options: ["raw", "standard"] };
  const MIDJOURNEY_STYLIZE = { key: "stylize", label: "风格化", type: "number", min: 0, max: 1000, step: 1 };
  const OPTION_LABELS = {
    auto: "自动", low: "低", medium: "中", high: "高",
    opaque: "不透明", transparent: "透明", png: "PNG", jpeg: "JPEG", webp: "WebP",
    standard: "标准", niji: "Niji", relax: "Relax", fast: "Fast", turbo: "Turbo",
    sd: "SD", hd: "HD", raw: "Raw",
  };

  function protocolOf(model) {
    return String(model?.protocol || model?.adapterId || model?.metadata?.protocol || model?.metadata?.adapterId || "").toLowerCase();
  }

  function capabilitiesOf(model) {
    const source = Array.isArray(model?.capabilities) ? model.capabilities : [];
    return source.map((item) => String(typeof item === "string" ? item : item?.id || item?.kind || "").toLowerCase());
  }

  function modelIdOf(model) {
    return [model?.id, model?.model, model?.modelId, model?.name, model?.displayName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function modelFamilyOf(model) {
    return String(model?.family || model?.metadata?.family || "").toLowerCase();
  }

  function isMidjourney(model, protocol = protocolOf(model)) {
    return protocol === "midjourney"
      || protocol === "apimart-midjourney"
      || /(?:^|[:_-])midjourney(?:$|[:_-])|^mj(?:[-_]|$)/i.test(modelIdOf(model));
  }

  function isFlux(model) {
    return /flux/i.test(modelIdOf(model)) || /flux/i.test(modelFamilyOf(model));
  }

  function isGptImage(model) {
    return /gpt-image/i.test(modelIdOf(model)) || /gpt-image/i.test(modelFamilyOf(model));
  }

  function isGptImage2(model) {
    return /gpt-image-2/i.test(modelIdOf(model)) || /gpt-image-2/i.test(modelFamilyOf(model));
  }

  function cloneFields(fields) {
    return fields.map((field) => ({
      ...field,
      ...(Array.isArray(field.options) ? { options: field.options.slice() } : {}),
    }));
  }

  function fieldsForModel(model) {
    const protocol = protocolOf(model);
    const capabilities = capabilitiesOf(model);
    const hasImage = capabilities.some((item) => item.startsWith("image.") || item === "generation" || item === "edit");
    const hasLlm = capabilities.some((item) => item.startsWith("llm."));

    if ((isMidjourney(model, protocol) || protocol === "apimart-midjourney") && hasImage) {
      return cloneFields([
        MIDJOURNEY_VERSION,
        MIDJOURNEY_MODE,
        MIDJOURNEY_SPEED,
        MIDJOURNEY_QUALITY,
        MIDJOURNEY_STYLE,
        MIDJOURNEY_STYLIZE,
      ]);
    }
    if (protocol === "gemini" && hasImage && !hasLlm) {
      return cloneFields([GEMINI_ASPECT_RATIO, GEMINI_IMAGE_SIZE]);
    }
    if (protocol === "cli:jimeng" && hasImage) {
      return cloneFields([
        { key: "size", label: "画面比例", type: "select", options: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
        { key: "resolution", label: "图片分辨率", type: "select", options: ["1K", "2K", "4K"] },
      ]);
    }
    if ((protocol === "openai-images" || protocol === "openai") && hasImage && !hasLlm) {
      if (isFlux(model)) return cloneFields([IMAGE_SIZE, IMAGE_STEPS, IMAGE_GUIDANCE, IMAGE_SEED, IMAGE_NEGATIVE_PROMPT]);
      if (isGptImage(model)) return cloneFields([IMAGE_SIZE, IMAGE_QUALITY, IMAGE_BACKGROUND, IMAGE_OUTPUT_FORMAT]);
      return cloneFields([IMAGE_SIZE, IMAGE_QUALITY, IMAGE_BACKGROUND]);
    }
    if (protocol === "image-relay" && hasImage) {
      const relayFields = /nano-banana/i.test(String(model?.id || ""))
        ? [RELAY_SIZE, RELAY_RESOLUTION]
        : [];
      return cloneFields(relayFields);
    }
    if (!hasLlm) return [];
    if (protocol === "openai" || protocol === "openai-chat") return [{ ...TEMPERATURE }, { ...MAX_TOKENS }];
    if (protocol === "openai-responses") return [{ ...TEMPERATURE }, { ...MAX_OUTPUT_TOKENS }];
    if (protocol === "anthropic") return [{ ...MAX_TOKENS }];
    return [];
  }

  function canvasFieldsForModel(model, options = {}) {
    const protocol = protocolOf(model);
    // 自动选择 has no fixed model yet: the runtime picks one at submit time, so
    // rendering (and then submitting) one model's protocol defaults would send
    // that model's parameters to whichever model actually wins.
    if (options.automatic === true) return [];
    const fields = fieldsForModel(model);
    if (isMidjourney(model, protocol) || protocol === "image-relay" || protocol === "cli:jimeng") return [];
    if (protocol === "gemini") return fields.filter((field) => !["aspect_ratio", "image_size"].includes(field.key));
    // The canvas node stays as lean as the size/resolution selectors it already
    // owns. Size is driven by those selectors, GPT Image quality by the
    // resolution selector (4K 高 / 2K 中 / 其余 自动), and background plus output
    // format stay in the API 设置 defaults instead of every node.
    return fields.filter((field) => !["size", "background", "output_format"].includes(field.key)
      && !(isGptImage2(model) && field.key === "quality"));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function originalOverrides(model) {
    const value = model?.metadata?.parameterOverrides;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function displayedValue(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function optionLabel(value) {
    if (OPTION_LABELS[value]) return OPTION_LABELS[value];
    return /^\d+x\d+$/i.test(value) ? value.replace("x", "×") : value;
  }

  function validStoredNumber(value, field) {
    if (value === undefined || value === null || value === "") return true;
    if (typeof value !== "number" && typeof value !== "string") return false;
    if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return false;
    const number = Number(value);
    if (!Number.isFinite(number) || number < field.min || number > field.max) return false;
    return field.step !== 1 || Number.isInteger(number);
  }

  function renderField(field, value) {
    const displayed = displayedValue(value);
    const common = `data-model-param="${escapeHtml(field.key)}" data-param-original="${escapeHtml(displayed)}"`;
    let control;
    if (field.type === "select") {
      const options = field.options || [];
      const legacy = displayed && !options.includes(displayed);
      const items = [{ value: "", label: "使用平台默认" }]
        .concat(legacy ? [{ value: displayed, label: `已保存：${displayed}` }] : [])
        .concat(options.map((option) => ({ value: option, label: optionLabel(option) })));
      control = `<select ${common}>${items.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === displayed ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
    } else if (field.type === "number") {
      control = validStoredNumber(value, field)
        ? `<input type="number" ${common} value="${escapeHtml(displayed)}" min="${field.min}" max="${field.max}" step="${field.step}">`
        : `<input type="text" value="" disabled aria-label="${escapeHtml(field.label)}已保留原有设置"><small>已保留原有设置</small>`;
    } else {
      control = `<input type="text" ${common} value="${escapeHtml(displayed)}" autocomplete="off">`;
    }
    return `<label><span>${escapeHtml(field.label)}</span>${control}</label>`;
  }

  function markup(model) {
    const fields = fieldsForModel(model);
    const overrides = originalOverrides(model);
    const known = new Set(fields.map((field) => field.key));
    const hasAdditional = Object.keys(overrides).some((key) => !known.has(key));
    const body = fields.length
      ? `<div class="settings-model-parameters">${fields.map((field) => renderField(field, overrides[field.key])).join("")}</div>`
      : "<p>此协议暂无可安全编辑的参数。</p>";
    const hint = hasAdditional ? "<p>现有的其他默认参数仍会保留。</p>" : "";
    return `<details class="settings-model-defaults"><summary>默认参数</summary>${body}${hint}</details>`;
  }

  function controlsIn(row) {
    return Array.from(row?.querySelectorAll?.("[data-model-param]") || []);
  }

  function descriptorMap(model) {
    return new Map(fieldsForModel(model).map((field) => [field.key, field]));
  }

  function parseEdited(control, field) {
    const raw = String(control.value ?? "");
    if (raw === "") return undefined;
    if (field.type !== "number") return raw;
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`${field.label}请输入有效数字。`);
    if (number < field.min || number > field.max) throw new Error(`${field.label}请输入 ${field.min} 到 ${field.max} 范围内的数字。`);
    if (field.step === 1 && !Number.isInteger(number)) throw new Error(`${field.label}请输入整数。`);
    return number;
  }

  function validate(row, model) {
    const fields = descriptorMap(model);
    for (const control of controlsIn(row)) {
      const key = control?.dataset?.modelParam;
      const field = fields.get(key);
      if (!field) continue;
      const raw = String(control.value ?? "");
      const original = String(control.dataset?.paramOriginal ?? "");
      if (raw !== original) parseEdited(control, field);
    }
    return true;
  }

  function read(row, model) {
    validate(row, model);
    const result = { ...originalOverrides(model) };
    const fields = descriptorMap(model);
    for (const control of controlsIn(row)) {
      const key = control?.dataset?.modelParam;
      const field = fields.get(key);
      if (!field) continue;
      const raw = String(control.value ?? "");
      const original = String(control.dataset?.paramOriginal ?? "");
      if (raw === original) continue;
      if (raw === "") delete result[key];
      else result[key] = parseEdited(control, field);
    }
    return result;
  }

  return { fieldsForModel, canvasFieldsForModel, markup, read, validate };
});
