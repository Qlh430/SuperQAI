(function exposeImageResolutionRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ImageResolutionRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createImageResolutionRules() {
  "use strict";

  const OPENAI_MIN_PIXELS = 655360;
  const OPENAI_MAX_PIXELS = 8294400;
  const OPENAI_MAX_EDGE = 3840;
  const OPENAI_LEVELS = ["1", "2", "4"];
  const GOOGLE_LEVELS = {
    "gemini-3.1-flash-image": ["512", "1", "2", "4"],
    "gemini-3-pro-image": ["1", "2", "4"],
    "gemini-2.5-flash-image": ["1"],
    "gemini-3.1-flash-lite-image": ["1"],
  };
  const GOOGLE_RATIOS = {
    "gemini-3.1-flash-image": ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"],
    default: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
  };
  const RESOLUTION_ORDER = ["512", "1", "2", "4"];

  function normalizeFamily(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.includes("gpt-image-2")) return "gpt-image-2";
    if (raw.includes("3.1-flash-lite") || raw.includes("flash-lite-image")) return "gemini-3.1-flash-lite-image";
    if (raw.includes("3-pro") || raw.includes("3 pro") || raw.includes("nano-banana-pro")) return "gemini-3-pro-image";
    if (raw.includes("2.5") || raw === "nano-banana") return "gemini-2.5-flash-image";
    if (raw.includes("3.1") || raw.includes("nano-banana-2")) return "gemini-3.1-flash-image";
    return raw;
  }

  function normalizeResolutionLevel(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/px$/, "").replace(/k$/, "");
    if (raw === "auto") return "auto";
    if (raw === "0.5" || raw === "512") return "512";
    if (OPENAI_LEVELS.includes(raw)) return raw;
    return "";
  }

  function parseResolutionChoice(value) {
    const raw = String(value || "").trim().toLowerCase();
    const exact = raw.match(/^exact:(\d{2,5})x(\d{2,5})$/);
    if (exact) {
      const exactSize = `${Number(exact[1])}x${Number(exact[2])}`;
      return { type: "exact", value: `exact:${exactSize}`, level: "4", exactSize };
    }
    const level = normalizeResolutionLevel(raw);
    return {
      type: level === "auto" ? "auto" : "standard",
      value: level,
      level,
      exactSize: "",
    };
  }

  function parseRatio(value) {
    const raw = String(value || "").trim().toLowerCase();
    const ratio = raw.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (ratio) {
      const width = Number(ratio[1]);
      const height = Number(ratio[2]);
      if (width > 0 && height > 0) return { width, height, label: `${ratio[1]}:${ratio[2]}` };
    }
    return null;
  }

  function parsePixelSize(value) {
    const match = String(value || "").trim().toLowerCase().match(/^(\d{2,5})x(\d{2,5})$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  function roundImageEdge(value) {
    return Math.max(16, Math.floor(Number(value || 0) / 16) * 16);
  }

  function getOpenAiStandardDimensions(ratio, level) {
    if (!ratio || !OPENAI_LEVELS.includes(level)) return null;
    const landscape = ratio.width >= ratio.height;
    if (level === "1") {
      const shortEdge = 1024;
      return landscape
        ? { width: roundImageEdge((shortEdge * ratio.width) / ratio.height), height: shortEdge }
        : { width: shortEdge, height: roundImageEdge((shortEdge * ratio.height) / ratio.width) };
    }
    const longEdge = level === "4" ? 3840 : 2048;
    return landscape
      ? { width: longEdge, height: roundImageEdge((longEdge * ratio.height) / ratio.width) }
      : { width: roundImageEdge((longEdge * ratio.width) / ratio.height), height: longEdge };
  }

  function validateOpenAiDimensions(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
      return { supported: false, reason: "图片宽高必须是正整数" };
    }
    if (w > OPENAI_MAX_EDGE || h > OPENAI_MAX_EDGE) {
      return { supported: false, reason: `OpenAI 图片最长边不能超过 ${OPENAI_MAX_EDGE}px` };
    }
    if (w % 16 !== 0 || h % 16 !== 0) {
      return { supported: false, reason: "OpenAI 图片宽高都必须是 16px 的倍数" };
    }
    if (Math.max(w, h) / Math.min(w, h) > 3) {
      return { supported: false, reason: "OpenAI 图片长短边比例不能超过 3:1" };
    }
    const pixels = w * h;
    if (pixels < OPENAI_MIN_PIXELS) {
      return { supported: false, reason: `OpenAI 图片总像素不能少于 ${OPENAI_MIN_PIXELS.toLocaleString("en-US")}` };
    }
    if (pixels > OPENAI_MAX_PIXELS) {
      return { supported: false, reason: `OpenAI 图片总像素不能超过 ${OPENAI_MAX_PIXELS.toLocaleString("en-US")}` };
    }
    return { supported: true, reason: "" };
  }

  function getOpenAiAlternative(ratio, dimensions) {
    if (!ratio || !dimensions) return null;
    const scale = Math.min(
      1,
      OPENAI_MAX_EDGE / Math.max(dimensions.width, dimensions.height),
      Math.sqrt(OPENAI_MAX_PIXELS / (dimensions.width * dimensions.height)),
    );
    if (!(scale < 1)) return null;
    const width = roundImageEdge(dimensions.width * scale);
    const height = roundImageEdge(dimensions.height * scale);
    if (!validateOpenAiDimensions(width, height).supported) return null;
    const exactSize = `${width}x${height}`;
    const square = ratio.width === ratio.height;
    return {
      value: `exact:${exactSize}`,
      exactSize,
      label: square ? `最大方图 ${width}×${height}` : `最大兼容尺寸 ${width}×${height}`,
    };
  }

  function normalizeConfiguredResolutions(values) {
    const source = Array.isArray(values) && values.length ? values : OPENAI_LEVELS;
    return [...new Set(source.map(normalizeResolutionLevel).filter((item) => RESOLUTION_ORDER.includes(item)))]
      .sort((a, b) => RESOLUTION_ORDER.indexOf(a) - RESOLUTION_ORDER.indexOf(b));
  }

  function unsupportedResult(level, reason, alternative = null) {
    return { supported: false, requestedSize: null, level, reason, alternative };
  }

  function getOpenAiCompatibility(input, choice, configured) {
    const level = choice.level;
    if (level !== "auto" && !configured.includes(level)) {
      return unsupportedResult(level, `${formatResolutionLabel(level)} 未在此 API 接入中启用`);
    }
    if (choice.type === "exact") {
      const dimensions = parsePixelSize(choice.exactSize);
      const validation = validateOpenAiDimensions(dimensions?.width, dimensions?.height);
      return validation.supported
        ? { supported: true, requestedSize: choice.exactSize, level, reason: "", alternative: null }
        : unsupportedResult(level, validation.reason);
    }

    const rawRatio = String(input.ratio || "auto").trim().toLowerCase();
    const pixelSize = parsePixelSize(rawRatio);
    if (pixelSize) {
      const validation = validateOpenAiDimensions(pixelSize.width, pixelSize.height);
      return validation.supported
        ? { supported: true, requestedSize: `${pixelSize.width}x${pixelSize.height}`, level, reason: "", alternative: null }
        : unsupportedResult(level, validation.reason);
    }

    if (rawRatio === "auto" || !rawRatio) {
      if (choice.type === "auto") {
        return { supported: true, requestedSize: "auto", level: "auto", reason: "", alternative: null };
      }
      return unsupportedResult(level, "OpenAI Auto 无法保证具体输出档位，请选择“自动尺寸”");
    }
    const ratio = parseRatio(rawRatio);
    if (!ratio) return unsupportedResult(level, "无法识别当前图片比例");
    const dimensions = getOpenAiStandardDimensions(ratio, level);
    const validation = validateOpenAiDimensions(dimensions?.width, dimensions?.height);
    if (validation.supported) {
      return {
        supported: true,
        requestedSize: `${dimensions.width}x${dimensions.height}`,
        level,
        reason: "",
        alternative: null,
      };
    }
    const alternative = level === "4" ? getOpenAiAlternative(ratio, dimensions) : null;
    const reason = alternative
      ? `OpenAI ${ratio.label} 无法生成标准 4K；请选择建议的精确尺寸或切换兼容画幅`
      : validation.reason;
    return unsupportedResult(level, reason, alternative);
  }

  function getGoogleCompatibility(input, choice, configured) {
    const level = choice.level;
    const family = normalizeFamily(input.family) || "gemini-3.1-flash-image";
    if (!configured.includes(level)) {
      return unsupportedResult(level, `${formatResolutionLabel(level)} 未在此 API 接入中启用`);
    }
    const supportedLevels = GOOGLE_LEVELS[family] || ["1"];
    if (!supportedLevels.includes(level)) {
      const available = supportedLevels.map(formatResolutionLabel).join(" / ");
      return unsupportedResult(level, `该模型仅支持 ${available}`);
    }
    const rawRatio = String(input.ratio || "auto").trim().toLowerCase();
    if (rawRatio !== "auto") {
      const ratios = GOOGLE_RATIOS[family] || GOOGLE_RATIOS.default;
      if (!ratios.includes(rawRatio)) {
        return unsupportedResult(level, `该模型不支持 ${rawRatio} 画幅`);
      }
    }
    return {
      supported: true,
      requestedSize: level === "512" ? "512" : `${level}K`,
      level,
      reason: "",
      alternative: null,
    };
  }

  function getCompatibility(input = {}) {
    const platform = String(input.platform || "").trim().toLowerCase();
    const choice = parseResolutionChoice(input.resolution || "1");
    const configured = normalizeConfiguredResolutions(input.configuredResolutions);
    if (!choice.value) return unsupportedResult("", "无法识别当前分辨率");
    if (platform === "openai") return getOpenAiCompatibility(input, choice, configured);
    if (platform === "google") return getGoogleCompatibility(input, choice, configured);
    if (choice.type !== "auto" && choice.type !== "exact" && !configured.includes(choice.level)) {
      return unsupportedResult(choice.level, `${formatResolutionLabel(choice.level)} 未在此 API 接入中启用`);
    }
    return {
      supported: true,
      requestedSize: choice.exactSize || String(input.ratio || "auto"),
      level: choice.level,
      reason: "",
      alternative: null,
    };
  }

  function formatResolutionLabel(value) {
    const level = normalizeResolutionLevel(value);
    if (level === "auto") return "自动尺寸";
    return level === "512" ? "512" : `${level}K`;
  }

  function getDisabledChoiceLabel(platform, family, ratio, level, reason) {
    const base = formatResolutionLabel(level);
    if (platform === "openai" && ratio && ratio !== "auto") return `${base}（${ratio} 不支持）`;
    if (platform === "google") {
      const supported = GOOGLE_LEVELS[family] || ["1"];
      if (supported.length === 1) return `${base}（该模型仅支持 ${formatResolutionLabel(supported[0])}）`;
      if (reason.includes("画幅")) return `${base}（${ratio} 不支持）`;
    }
    return `${base}（不可用）`;
  }

  function getResolutionChoices(input = {}) {
    const platform = String(input.platform || "").trim().toLowerCase();
    const family = normalizeFamily(input.family) || (platform === "google" ? "gemini-3.1-flash-image" : "");
    const ratio = String(input.ratio || "auto").trim().toLowerCase();
    const configured = normalizeConfiguredResolutions(input.configuredResolutions);
    const choices = [];

    if (platform === "openai" && ratio === "auto") {
      choices.push({ value: "auto", label: "自动尺寸", disabled: false, reason: "", level: "auto" });
    }

    for (const level of configured) {
      const compatibility = getCompatibility({
        ...input,
        platform,
        family,
        ratio,
        resolution: level,
        configuredResolutions: configured,
      });
      choices.push({
        value: level,
        label: compatibility.supported
          ? formatResolutionLabel(level)
          : getDisabledChoiceLabel(platform, family, ratio, level, compatibility.reason),
        disabled: !compatibility.supported,
        reason: compatibility.reason,
        level,
      });
      if (compatibility.alternative) {
        choices.push({
          value: compatibility.alternative.value,
          label: compatibility.alternative.label,
          disabled: false,
          reason: "",
          level,
          exactSize: compatibility.alternative.exactSize,
        });
      }
    }
    return choices;
  }

  return {
    getCompatibility,
    getResolutionChoices,
    normalizeFamily,
    parseResolutionChoice,
    validateOpenAiDimensions,
  };
});
