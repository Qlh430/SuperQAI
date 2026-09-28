"use strict";

// Pure image-model rules shared by the settings catalog, the canvas catalog
// and the provider catalog. This module owns no settings readers or I/O.

const RESOLUTION_ORDER = Object.freeze(["512", "1", "2", "4"]);
const JIMENG_FAMILIES = Object.freeze(["jimeng-3", "jimeng-5", "jimeng-5-pro"]);

function createImageModelRules({ midjourneyImageModelAlias = "midjourney" } = {}) {
  const midjourneyAlias = String(midjourneyImageModelAlias || "").trim().toLowerCase();

  function isMidjourneyModelId(modelId = "") {
    return Boolean(midjourneyAlias)
      && String(modelId || "").trim().toLowerCase() === midjourneyAlias;
  }

  function normalizeImageResolutionValue(item) {
    const value = String(item || "").toLowerCase().replace(/px$/, "").replace(/k$/, "");
    if (value === "0.5" || value === "512") return "512";
    if (RESOLUTION_ORDER.slice(1).includes(value)) return value;
    return "";
  }

  function sortImageResolutions(values) {
    return [...new Set(values.map(normalizeImageResolutionValue).filter(Boolean))]
      .sort((left, right) => RESOLUTION_ORDER.indexOf(left) - RESOLUTION_ORDER.indexOf(right));
  }

  function normalizeImageResolutions(value, modelId = "") {
    if (isMidjourneyModelId(modelId)) return [];
    const items = Array.isArray(value) ? value : ["1", "2", "4"];
    const normalized = sortImageResolutions([
      ...new Set(items.map(normalizeImageResolutionValue).filter(Boolean)),
    ]);
    return normalized.length ? normalized : ["1"];
  }

  function inferImagePlatform(modelId = "") {
    if (isMidjourneyModelId(modelId)) return "midjourney";
    const value = String(modelId || "").toLowerCase();
    return value.includes("nano-banana") || value.includes("gemini") ? "google" : "openai";
  }

  function normalizeImagePlatform(value, modelId = "") {
    if (isMidjourneyModelId(modelId)) return "midjourney";
    const platform = String(value || "").toLowerCase();
    if (["openai", "google", "jimeng"].includes(platform)) return platform;
    return inferImagePlatform(modelId);
  }

  // Dreamina names its image models by version (published as jimeng-5.0Pro) and
  // its video models by Seedance name. A bare version is still recognised for a
  // catalog saved before the prefix existed.
  function isJimengImageModelId(modelId = "") {
    return /^(?:jimeng[-_ ]?)?\d+(?:\.\d+)+(?:pro)?$/i.test(String(modelId || "").trim());
  }

  function isJimengImageFamily(value) {
    return JIMENG_FAMILIES.includes(String(value || "").trim().toLowerCase());
  }

  function normalizeJimengImageFamily(value, modelId = "") {
    // The stored family is already canonical, so it wins over the raw model id;
    // reading "jimeng-3" as a version would silently promote it to the 5.x ladder.
    const stored = String(value || "").trim().toLowerCase();
    if (isJimengImageFamily(stored)) return stored;
    const raw = String(value || modelId || "").trim().toLowerCase();
    if (raw.includes("pro")) return "jimeng-5-pro";
    const match = raw.match(/(\d+)\s*\.\s*(\d+)/);
    const major = match ? Number(match[1]) : 5;
    return major <= 3 ? "jimeng-3" : "jimeng-5";
  }

  function jimengImageResolutionLevels(value) {
    const family = normalizeJimengImageFamily(value);
    if (family === "jimeng-3") return ["1", "2"];
    if (family === "jimeng-5-pro") return ["1", "2", "4"];
    return ["2", "4"];
  }

  function isJimengCatalogModel(model) {
    return String(model?.providerProtocol || "").trim().toLowerCase() === "cli:jimeng"
      || String(model?.platform || "").trim().toLowerCase() === "jimeng";
  }

  function normalizeImageModelFamily(value, modelId = "") {
    if (isMidjourneyModelId(modelId)) return "midjourney";
    // A CLI model owns its own ladder, and its published id can carry a version
    // that also matches a Gemini name ("jimeng-3.1"), so it is decided before
    // any name heuristic below.
    if (isJimengImageModelId(modelId) || isJimengImageModelId(value) || isJimengImageFamily(value)) {
      return normalizeJimengImageFamily(value, modelId);
    }
    const raw = String(value || modelId || "").toLowerCase();
    if (raw.includes("gpt-image-2")) return "gpt-image-2";
    if (raw.includes("3.1-flash-lite") || raw.includes("flash-lite-image")) return "gemini-3.1-flash-lite-image";
    if (raw.includes("3.1") || raw.includes("nano-banana-2")) return "gemini-3.1-flash-image";
    if (raw.includes("3-pro") || raw.includes("3 pro") || raw.includes("nano-banana-pro")) return "gemini-3-pro-image";
    if (raw.includes("2.5") || raw === "nano-banana") return "gemini-2.5-flash-image";
    return inferImagePlatform(modelId) === "google" ? "gemini-3.1-flash-image" : "openai-image";
  }

  function defaultImageResolutionsForModel(modelId, modelConfig = null) {
    const config = modelConfig && typeof modelConfig === "object" ? modelConfig : {};
    if (isMidjourneyModelId(modelId)) return [];
    if (isJimengImageModelId(modelId)) return jimengImageResolutionLevels(modelId);
    const platform = config.platform
      ? normalizeImagePlatform(config.platform, modelId)
      : inferImagePlatform(modelId);
    if (platform === "midjourney") return [];
    if (platform === "jimeng") return jimengImageResolutionLevels(modelId);
    if (platform === "google") {
      const family = config.family
        ? normalizeImageModelFamily(config.family, modelId)
        : normalizeImageModelFamily("", modelId);
      if (family === "gemini-3.1-flash-image") return ["512", "1", "2", "4"];
      if (family === "gemini-2.5-flash-image" || family === "gemini-3.1-flash-lite-image") return ["1"];
      return ["1", "2", "4"];
    }
    return ["1", "2", "4"];
  }

  // A provider row usually leaves the quality ladder unset. Derive the ladder
  // the saved platform and family actually accept so a canvas node can offer
  // 2K and 4K again.
  function catalogImageResolutions(model, jimeng = false) {
    const modelId = String(model?.modelId || model?.id || "");
    if (jimeng) return jimengImageResolutionLevels(modelId);
    const declared = sortImageResolutions(Array.isArray(model?.resolutions) ? model.resolutions : []);
    if (declared.length) return declared;
    const protocol = String(model?.modelProtocol || "").trim().toLowerCase();
    const platform = String(model?.platform || "").trim().toLowerCase();
    if (protocol === "midjourney" || platform === "midjourney") return [];
    return defaultImageResolutionsForModel(modelId, model);
  }

  return Object.freeze({
    normalizeImageResolutions,
    normalizeImageResolutionValue,
    sortImageResolutions,
    normalizeImagePlatform,
    inferImagePlatform,
    isJimengImageModelId,
    normalizeJimengImageFamily,
    isJimengImageFamily,
    jimengImageResolutionLevels,
    isJimengCatalogModel,
    normalizeImageModelFamily,
    defaultImageResolutionsForModel,
    catalogImageResolutions,
  });
}

module.exports = { createImageModelRules, RESOLUTION_ORDER };
