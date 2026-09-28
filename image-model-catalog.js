"use strict";

// Image model catalog: resolves saved models, assembles the canvas-facing
// candidate list and delegates family/platform/ladder decisions to the shared
// pure rules module. The kernel injects the settings readers.
//
// Keeping this out of server.js means a new model family or resolution ladder
// ships with the image generation component instead of the platform core.

const { createImageModelRules, RESOLUTION_ORDER } = require("./image-model-rules");

function createImageModelCatalog({
  imageResolutionRules,
  imageModelRouting,
  readSettings,
  buildSettingsResponse,
  readTelemetryHistory,
  makeCustomModelClientId,
  midjourneyImageModelAlias,
  systemModelLabels = {},
} = {}) {
  for (const [name, dependency] of Object.entries({
    imageResolutionRules,
    imageModelRouting,
    readSettings,
    buildSettingsResponse,
    readTelemetryHistory,
    makeCustomModelClientId,
  })) {
    if (!dependency) throw new TypeError(`Image model catalog requires ${name}.`);
  }
  if (typeof imageResolutionRules.getCompatibility !== "function") {
    throw new TypeError("Image model catalog requires image resolution rules.");
  }
  if (typeof imageModelRouting.buildCandidateRecords !== "function") {
    throw new TypeError("Image model catalog requires canvas image model routing.");
  }
  const imageModelRules = createImageModelRules({ midjourneyImageModelAlias });
  const {
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
  } = imageModelRules;

  function savedImageModelRows(modelId) {
    return (readSettings().providers || [])
      .flatMap((provider) => provider.models || [])
      .filter((model) => model.id === modelId && model.capabilities?.includes("generation"));
  }

  function getImageModelFamily(modelId) {
    const customModel = resolveCustomModel(modelId, "generation") || resolveCustomModel(modelId, "edit");
    if (customModel) return normalizeImageModelFamily(customModel.model.family, customModel.model.id);
    const matches = savedImageModelRows(modelId);
    if (matches.length) return normalizeImageModelFamily(matches[matches.length - 1].family, modelId);
    return normalizeImageModelFamily("", modelId);
  }

  function getImageModelPlatform(modelId) {
    const customModel = resolveCustomModel(modelId, "generation") || resolveCustomModel(modelId, "edit");
    if (customModel) return normalizeImagePlatform(customModel.model.platform, customModel.model.id);
    const matches = savedImageModelRows(modelId);
    if (matches.length) return normalizeImagePlatform(matches[matches.length - 1].platform, modelId);
    return inferImagePlatform(modelId);
  }

  function getConfiguredImageResolutions(modelId, modelConfig = null) {
    const matches = modelConfig ? [modelConfig] : savedImageModelRows(modelId);
    const familyDefaults = getDefaultImageResolutionsForModel(modelId);
    if (!matches.length) return familyDefaults;
    const configured = normalizeImageResolutions(matches[matches.length - 1].resolutions);
    return configured.filter((item) => familyDefaults.includes(item)).length
      ? configured.filter((item) => familyDefaults.includes(item))
      : familyDefaults.slice(0, 1);
  }

  function validateImageOutputRequest(modelId, size, resolution, catalogModel = null) {
    // A CLI model never stores its ladder in the provider row: the version that
    // names the model already decides which quality flags Dreamina accepts, so
    // the ladder is always derived here and a stale saved value cannot narrow it.
    const jimeng = isJimengCatalogModel(catalogModel) || isJimengImageModelId(catalogModel?.modelId || modelId);
    const platform = jimeng
      ? "jimeng"
      : normalizeImagePlatform(catalogModel?.platform, catalogModel?.modelId || modelId);
    const family = normalizeImageModelFamily(catalogModel?.family, catalogModel?.modelId || modelId);
    const configuredResolutions = jimeng
      ? jimengImageResolutionLevels(catalogModel?.modelId || modelId)
      : Array.isArray(catalogModel?.resolutions)
        ? catalogModel.resolutions
        : platform === "google"
          ? family === "gemini-3.1-flash-image" ? ["512", "1", "2", "4"]
            : family === "gemini-2.5-flash-image" || family === "gemini-3.1-flash-lite-image" ? ["1"]
              : ["1", "2", "4"]
          : platform === "midjourney" ? [] : ["1", "2", "4"];
    return imageResolutionRules.getCompatibility({
      platform,
      family,
      providerProtocol: String(catalogModel?.providerProtocol || ""),
      providerHost: String(catalogModel?.providerHost || ""),
      ratio: String(size || "auto").trim().toLowerCase(),
      resolution: String(resolution || "auto").trim().toLowerCase(),
      configuredResolutions,
    });
  }

  // A provider row usually leaves the quality ladder unset, and publishing an
  // empty list makes the client fall back to its single 1K default. The shared
  // rules module derives the ladder the saved platform and family accept.
  const catalogImageResolutions = imageModelRules.catalogImageResolutions;

  function getDefaultImageResolutionsForModel(modelId, modelConfig = null) {
    if (modelConfig) return imageModelRules.defaultImageResolutionsForModel(modelId, modelConfig);
    return imageModelRules.defaultImageResolutionsForModel(modelId, {
      platform: getImageModelPlatform(modelId),
      family: getImageModelFamily(modelId),
    });
  }

  function getCustomModelEntries(capability) {
    return (readSettings().providers || []).flatMap((provider) => {
      if (!provider.enabled || !provider.baseUrl || !provider.apiKey) return [];
      return provider.models
        .filter((model) => model.capabilities?.includes(capability))
        .map((model) => ({
          clientId: provider.importedSystem ? model.id : makeCustomModelClientId(provider.id, model.id),
          label: model.alias || (provider.importedSystem ? getSystemImageModelLabel(model.id) : model.id + " \u00b7 " + provider.name),
          provider,
          model,
        }));
    });
  }

  function getSystemImageModelLabel(modelId) {
    const labels = systemModelLabels && typeof systemModelLabels === "object" ? systemModelLabels : {};
    return labels[String(modelId || "").toLowerCase()] || modelId;
  }

  function resolveCustomModel(clientId, capability) {
    return getCustomModelEntries(capability).find((item) => item.clientId === clientId) || null;
  }

  function isStaticModelEnabled(modelId, capability) {
    const overrides = (readSettings().providers || [])
      .filter((provider) => provider.importedSystem)
      .flatMap((provider) => provider.models)
      .filter((model) => model.id === modelId);
    return !overrides.length || overrides.some((model) => model.capabilities?.includes(capability));
  }

  function getImageModelCandidates() {
    const providers = buildSettingsResponse(readSettings()).providers;
    const records = imageModelRouting.buildCandidateRecords(
      providers,
      readTelemetryHistory(),
      { makeClientId: makeCustomModelClientId },
    ).map((record) => {
      const provider = providers.find((item) => item.id === record.providerId);
      const model = provider?.models?.find((item) => item.id === record.model) || null;
      return {
        ...record,
        platform: normalizeImagePlatform(model?.platform, model?.id || record.model),
        family: normalizeImageModelFamily(model?.family, model?.id || record.model),
        resolutions: getConfiguredImageResolutions(model?.id || record.model, model),
      };
    });
    const ranked = imageModelRouting.rankCandidates(records);
    const rankedIds = new Set(ranked.map((item) => item.id));
    const ordered = [...ranked, ...records.filter((item) => !rankedIds.has(item.id))];
    return [...new Map(ordered.map((item) => [item.id, item])).values()];
  }

  function start() {
    return Object.freeze({ ok: true, component: "image-model-catalog" });
  }

  return Object.freeze({
    start,
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
    getImageModelFamily,
    getImageModelPlatform,
    getConfiguredImageResolutions,
    validateImageOutputRequest,
    catalogImageResolutions,
    getDefaultImageResolutionsForModel,
    getCustomModelEntries,
    getSystemImageModelLabel,
    resolveCustomModel,
    isStaticModelEnabled,
    getImageModelCandidates,
  });
}

module.exports = { createImageModelCatalog, RESOLUTION_ORDER };
