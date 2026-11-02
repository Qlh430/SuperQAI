"use strict";

/**
 * Pure request-shaping rules for image providers.
 *
 * This module owns model aliases, upstream model mapping, size normalization,
 * GPT Image compatibility parameters and Nano Banana image options. It performs
 * no settings reads, filesystem access or network calls.
 */
function createImageProviderRequestRules({
  imageResolutionRules,
  getImageModelFamily,
  resolveCustomModel,
  ainbImageModelAlias = "",
  clseImageModelAlias = "",
  clseImageUpstreamModel = "",
  apimartImageModelAlias = "",
  apimartImageUpstreamModel = "",
  midjourneyImageModelAlias = "",
  grsaiImageModels = [],
} = {}) {
  for (const [name, dependency] of Object.entries({
    imageResolutionRules,
    getImageModelFamily,
    resolveCustomModel,
  })) {
    if (!dependency) throw new TypeError(`Image provider request rules require ${name}.`);
  }

  const aliases = Object.freeze({
    ainb: String(ainbImageModelAlias || "").trim().toLowerCase(),
    clse: String(clseImageModelAlias || "").trim().toLowerCase(),
    apimart: String(apimartImageModelAlias || "").trim().toLowerCase(),
    apimartUpstream: String(apimartImageUpstreamModel || "").trim().toLowerCase(),
    midjourney: String(midjourneyImageModelAlias || "").trim().toLowerCase(),
  });
  const grsaiModels = new Set(
    (Array.isArray(grsaiImageModels) ? grsaiImageModels : [])
      .map((model) => String(model || "").trim().toLowerCase())
      .filter(Boolean),
  );

  function normalizeMidjourneyOptions({ version = "7", niji = false, speed = "fast", style = "raw", stylize = 100, hd = false } = {}) {
    const standardVersions = new Set(["8.2", "8.1", "7", "6.1", "5.2", "5.1"]);
    const nijiVersions = new Set(["7", "6"]);
    const speeds = new Set(["relax", "fast", "turbo"]);
    const styles = new Set(["raw", "standard"]);
    if (typeof niji !== "boolean" && niji !== undefined) throw new Error("Midjourney niji must be boolean.");
    if (typeof hd !== "boolean" && hd !== undefined) throw new Error("Midjourney hd must be boolean.");
    const normalizedNiji = Boolean(niji);
    const normalizedVersion = String(version || "7");
    const normalizedSpeed = String(speed || "fast").toLowerCase();
    const normalizedStyle = String(style || "raw").toLowerCase();
    const normalizedStylize = Number(stylize ?? 100);
    const normalizedHd = Boolean(hd);
    const versions = normalizedNiji ? nijiVersions : standardVersions;
    if (!versions.has(normalizedVersion)) throw new Error("Unsupported Midjourney version for the selected mode: " + normalizedVersion);
    if (normalizedHd && (normalizedNiji || !["8.2", "8.1"].includes(normalizedVersion))) throw new Error("Midjourney HD is only supported for V8.1 and V8.2 in standard mode.");
    if (!speeds.has(normalizedSpeed)) throw new Error("Unsupported Midjourney speed: " + normalizedSpeed);
    if (!styles.has(normalizedStyle)) throw new Error("Unsupported Midjourney style: " + normalizedStyle);
    if (!Number.isInteger(normalizedStylize) || normalizedStylize < 0 || normalizedStylize > 1000) throw new Error("Midjourney stylize must be an integer from 0 to 1000.");
    const normalized = {
      version: normalizedVersion,
      niji: normalizedNiji,
      speed: normalizedSpeed,
      style: normalizedStyle,
      stylize: normalizedStylize,
    };
    if (normalizedHd) normalized.hd = true;
    return normalized;
  }

  function normalizeMidjourneySize(size) {
    const value = String(size || "1:1").trim().toLowerCase();
    if (/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value)) return value;
    const normalized = normalizeApimartSize(value);
    return normalized === "auto" ? "1:1" : normalized;
  }

  function normalizeApimartSize(size) {
    const value = String(size || "").trim().toLowerCase();
    const ratios = new Set(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"]);
    if (ratios.has(value)) return value;
    const pixels = value.match(/^(\d{2,5})x(\d{2,5})$/);
    if (!pixels) return "1:1";
    const width = Number(pixels[1]);
    const height = Number(pixels[2]);
    return closestAspectRatio(width, height);
  }

  function closestAspectRatio(width, height) {
    const candidates = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"];
    const ratio = width / height;
    let best = "1:1";
    let bestDiff = Infinity;
    for (const candidate of candidates) {
      const [w, h] = candidate.split(":").map(Number);
      const diff = Math.abs(ratio - (w / h));
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    return best;
  }

  function isAinbImageModel(model) {
    return Boolean(aliases.ainb) && String(model || "").trim().toLowerCase() === aliases.ainb;
  }

  function isClseImageModel(model) {
    return Boolean(aliases.clse) && String(model || "").trim().toLowerCase() === aliases.clse;
  }

  function isApimartImageModel(model) {
    const value = String(model || "").trim().toLowerCase();
    return Boolean(value) && (value === aliases.apimart || value === aliases.apimartUpstream);
  }

  function isMidjourneyImageModel(model) {
    return Boolean(aliases.midjourney) && String(model || "").trim().toLowerCase() === aliases.midjourney;
  }

  function isGrsaiImageModel(model) {
    return grsaiModels.has(String(model || "").trim().toLowerCase());
  }

  function isGptImage2LikeModel(model) {
    return String(model || "").toLowerCase().includes("gpt-image-2");
  }

  function isGptImage2RequestModel(model, upstreamModel = "") {
    return isGptImage2LikeModel(model)
      || isGptImage2LikeModel(upstreamModel)
      || getImageModelFamily(model) === "gpt-image-2";
  }

  function getGrsaiUpstreamImageModel(model) {
    const value = String(model || "").toLowerCase();
    const upstreamAliases = {
      "gpt-image-2-vip-grsai": "gpt-image-2-vip",
      "gpt-image-2-grsai": "gpt-image-2",
      "nano-banana-pro-grsai": "nano-banana-pro",
      "nano-banana-2-grsai": "nano-banana-2",
    };
    return upstreamAliases[value] || String(model || "").replace(/-grsai$/i, "");
  }

  function getUpstreamImageModel(model) {
    if (isAinbImageModel(model) || isApimartImageModel(model)) return "gpt-image-2";
    if (isClseImageModel(model)) return clseImageUpstreamModel;
    if (isGrsaiImageModel(model)) return getGrsaiUpstreamImageModel(model);
    const customModel = resolveCustomModel(model, "generation") || resolveCustomModel(model, "edit");
    if (customModel) return customModel.model.id;
    return model;
  }

  function getLegacyEnvironmentUpstreamModel(model) {
    if (isAinbImageModel(model) || isApimartImageModel(model)) return "gpt-image-2";
    if (isClseImageModel(model)) return clseImageUpstreamModel;
    if (isGrsaiImageModel(model)) return getGrsaiUpstreamImageModel(model);
    return String(model || "");
  }

  function getGrsaiImageParams(model, size, resolution = "") {
    const upstream = getGrsaiUpstreamImageModel(model).toLowerCase();
    if (upstream.startsWith("nano-banana")) {
      return {
        aspectRatio: normalizeApimartSize(size),
        imageSize: getNanoBananaImageSize(size, resolution),
      };
    }

    return {
      aspectRatio: normalizeGptImage2RequestSize(String(size || "").toLowerCase() === "auto" ? "1:1" : size, resolution || "4k"),
    };
  }

  function normalizeGptImage2Quality(quality, resolution, isGpt2Request = false) {
    if (!isGpt2Request) return quality || "auto";
    const requested = String(quality || "").trim().toLowerCase();
    if (["low", "medium", "high"].includes(requested)) return requested;
    const rank = getImageResolutionRank(resolution);
    if (rank >= 4) return "high";
    if (rank >= 2) return "medium";
    return "auto";
  }

  function normalizeGptImage2RequestSize(size, resolution = "1k") {
    const text = String(size || "auto").trim().toLowerCase();
    if (!text || text === "auto") return "auto";
    const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
    if (pixels) return Number(pixels[1]) + "x" + Number(pixels[2]);
    const ratio = parseAspectRatio(text);
    if (!ratio) return "";
    return getGptImage2SizeByRatio(ratio, resolution);
  }

  function shouldSendGptImage2CompatHints() {
    return false;
  }

  function isOfficialOpenAIUrl(url = "") {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "api.openai.com" || host.endsWith(".openai.com");
    } catch {
      return false;
    }
  }

  function getGptImage2CompatHints(size, resolution, requestSize) {
    const aspectRatio = normalizeGptImage2AspectRatio(size) || normalizeGptImage2AspectRatio(requestSize) || "1:1";
    const imageSize = normalizeGptImage2ResolutionLabel(resolution, requestSize);
    return {
      aspect_ratio: aspectRatio,
      resolution: imageSize.toLowerCase(),
      image_size: imageSize,
    };
  }

  function normalizeGptImage2AspectRatio(size) {
    const text = String(size || "").trim().toLowerCase();
    const ratio = parseAspectRatio(text);
    if (ratio) return ratio.width + ":" + ratio.height;
    const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
    if (!pixels) return "";
    const width = Number(pixels[1]);
    const height = Number(pixels[2]);
    const divisor = gcd(width, height);
    return (width / divisor) + ":" + (height / divisor);
  }

  function normalizeGptImage2ResolutionLabel(resolution, requestSize) {
    const level = getImageResolutionRank(resolution);
    if (level >= 4) return "4K";
    if (level >= 2) return "2K";
    const pixels = String(requestSize || "").match(/(\d{2,5})x(\d{2,5})/);
    if (pixels) {
      const longEdge = Math.max(Number(pixels[1]), Number(pixels[2]));
      if (longEdge >= 3000) return "4K";
      if (longEdge >= 1800) return "2K";
    }
    return "1K";
  }

  function gcd(a, b) {
    let x = Math.abs(Math.round(Number(a) || 0));
    let y = Math.abs(Math.round(Number(b) || 0));
    while (y) {
      const next = x % y;
      x = y;
      y = next;
    }
    return x || 1;
  }

  function parseAspectRatio(value) {
    const match = String(value || "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return null;
    return { width, height };
  }

  function getGptImage2SizeByRatio(ratio, resolution = "1k") {
    const dimensions = getGptImage2DimensionsByRatio(ratio, resolution);
    return isValidGptImage2Dimensions(dimensions) ? dimensions.width + "x" + dimensions.height : "";
  }

  function getGptImage2DimensionsByRatio(ratio, resolution = "1k") {
    const compatibility = imageResolutionRules.getCompatibility({
      platform: "openai",
      ratio: `${ratio?.width || 0}:${ratio?.height || 0}`,
      resolution,
      configuredResolutions: ["1", "2", "4"],
    });
    const pixels = String(compatibility.requestedSize || "").match(/^(\d+)x(\d+)$/);
    return pixels ? { width: Number(pixels[1]), height: Number(pixels[2]) } : null;
  }

  function isValidGptImage2Dimensions(dimensions) {
    if (!dimensions) return false;
    return imageResolutionRules.validateOpenAiDimensions(dimensions.width, dimensions.height).supported;
  }

  function getImageResolutionRank(value) {
    const normalized = String(value || "1").toLowerCase().replace(/px$/, "").replace(/k$/, "");
    if (normalized === "0.5" || normalized === "512") return 0.5;
    if (normalized === "4") return 4;
    if (normalized === "2") return 2;
    return 1;
  }

  function getImageResponseFormat(model, provider = null, upstreamModel = "") {
    if (provider?.custom && !isOfficialOpenAIUrl(provider.url || provider.baseUrl)) return "";
    return isGptImage2RequestModel(model, upstreamModel) ? "b64_json" : "url";
  }

  function getOpenAIEditMaskRef(refs) {
    return (Array.isArray(refs) ? refs : []).find((ref) => ref && (ref.openaiMaskUrl || ref.maskUrl));
  }

  function ensurePngFilename(filename) {
    const value = String(filename || "openai-edit-mask.png");
    return /\.png$/i.test(value) ? value : value.replace(/\.[^.]+$/, "") + ".png";
  }

  function normalizeGrsaiGptImageSize(size, maxLongEdge) {
    const text = String(size || "").trim().toLowerCase();
    const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
    if (pixels) {
      const width = Math.max(1, Number(pixels[1]));
      const height = Math.max(1, Number(pixels[2]));
      const scale = Math.min(1, maxLongEdge / Math.max(width, height));
      return `${Math.max(1, Math.round(width * scale))}x${Math.max(1, Math.round(height * scale))}`;
    }

    const ratio = normalizeApimartSize(size);
    const [w = 1, h = 1] = String(ratio === "auto" ? "1:1" : ratio).split(":").map(Number);
    const factor = maxLongEdge / Math.max(w || 1, h || 1);
    return `${Math.max(1, Math.round((w || 1) * factor))}x${Math.max(1, Math.round((h || 1) * factor))}`;
  }

  function getImageResponseModel(requestedModel, upstreamModel) {
    if (isAinbImageModel(requestedModel)) return ainbImageModelAlias;
    if (isClseImageModel(requestedModel)) return clseImageModelAlias;
    if (isApimartImageModel(requestedModel)) return apimartImageModelAlias;
    if (isGrsaiImageModel(requestedModel)) return requestedModel;
    if (resolveCustomModel(requestedModel, "generation") || resolveCustomModel(requestedModel, "edit")) return requestedModel;
    return upstreamModel || requestedModel;
  }

  function isNanoBananaProModel(model) {
    return String(model || "").toLowerCase() === "nano-banana-pro";
  }

  function getNanoBananaImageSize(size, resolution = "", model = "") {
    if (!supportsNanoBananaImageSize(model)) return "";
    const text = `${resolution || ""} ${size || ""}`.toLowerCase();
    if (text.includes("512")) return "512";
    if (text.includes("4k")) return "4K";
    if (text.includes("2k")) return "2K";
    const edges = text.split("x").map((item) => Number.parseInt(item, 10)).filter(Boolean);
    const longEdge = edges.length ? Math.max(...edges) : 0;
    if (longEdge >= 3000) return "4K";
    if (longEdge >= 1800) return "2K";
    return "1K";
  }

  function supportsNanoBananaImageSize(model) {
    return getImageModelFamily(model) !== "gemini-2.5-flash-image";
  }

  function getNanoBananaImageOptions(model, size, resolution) {
    const options = {
      aspect_ratio: normalizeImageAspectRatio(size),
    };
    const imageSize = getNanoBananaImageSize(size, resolution, model);
    if (imageSize) options.image_size = imageSize;
    return options;
  }

  function normalizeImageAspectRatio(size) {
    return normalizeApimartSize(size);
  }

  return Object.freeze({
    ensurePngFilename,
    getGptImage2CompatHints,
    getGrsaiImageParams,
    getGrsaiUpstreamImageModel,
    getImageResponseFormat,
    getImageResponseModel,
    getLegacyEnvironmentUpstreamModel,
    getNanoBananaImageOptions,
    getNanoBananaImageSize,
    getOpenAIEditMaskRef,
    getUpstreamImageModel,
    isAinbImageModel,
    isApimartImageModel,
    isClseImageModel,
    isGptImage2LikeModel,
    isGptImage2RequestModel,
    isGrsaiImageModel,
    isMidjourneyImageModel,
    isNanoBananaProModel,
    isOfficialOpenAIUrl,
    normalizeApimartSize,
    normalizeGptImage2AspectRatio,
    normalizeGptImage2Quality,
    normalizeGptImage2RequestSize,
    normalizeGptImage2ResolutionLabel,
    normalizeGrsaiGptImageSize,
    normalizeImageAspectRatio,
    normalizeMidjourneyOptions,
    normalizeMidjourneySize,
    shouldSendGptImage2CompatHints,
  });
}

module.exports = { createImageProviderRequestRules };
