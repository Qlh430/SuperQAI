"use strict";

const DefaultImageResolutionRules = require("./image-resolution-rules");
const { summarizeProviderCatalogHealth } = require("./provider-catalog-health");

function normalizeModelPrice(value) {
  const price = String(value || "").trim()
    .replace(/^￥\s*/, "")
    .replace(/\s+/g, "")
    .replace(/[—–-]/g, "~");
  if (!price) return "";
  if (!/^\$?\d+(?:\.\d+)?(?:~\$?\d+(?:\.\d+)?)?$/.test(price)) return "";
  return price.slice(0, 40);
}

function makeCustomModelClientId(providerId, modelId) {
  return `custom:${providerId}:${Buffer.from(String(modelId)).toString("base64url")}`;
}

function catalogImagePresentation(model, imageCatalog) {
  if (!imageCatalog || typeof imageCatalog.catalogImageResolutions !== "function") {
    throw new TypeError("Image catalog presentation requires the image model catalog.");
  }
  const jimeng = String(model?.providerProtocol || "").trim().toLowerCase() === "cli:jimeng";
  return {
    providerProtocol: model.providerProtocol,
    providerHost: model.providerHost,
    modelProtocol: model.modelProtocol,
    resolutions: imageCatalog.catalogImageResolutions(model, jimeng),
    platform: jimeng ? "jimeng" : String(model.platform || ""),
    family: jimeng
      ? imageCatalog.normalizeJimengImageFamily("", model.modelId || model.id)
      : String(model.family || ""),
    price: normalizeModelPrice(model.price),
    parameterOverrides: model.parameterOverrides && typeof model.parameterOverrides === "object" && !Array.isArray(model.parameterOverrides)
      ? { ...model.parameterOverrides }
      : {},
  };
}

function catalogVideoPresentation(model, imageResolutionRules = DefaultImageResolutionRules) {
  const jimeng = String(model?.providerProtocol || "").trim().toLowerCase() === "cli:jimeng";
  const modelId = String(model?.modelId || model?.id || "").trim();
  const ladder = jimeng ? imageResolutionRules.videoDurationRangeFor(modelId) : null;
  return {
    providerProtocol: model.providerProtocol,
    providerHost: model.providerHost,
    modelProtocol: model.modelProtocol,
    resolutions: jimeng
      ? imageResolutionRules.videoResolutionsFor(modelId)
      : Array.isArray(model.resolutions) ? [...model.resolutions] : [],
    ratios: jimeng
      ? imageResolutionRules.videoRatiosFor(modelId)
      : Array.isArray(model.ratios) ? [...model.ratios] : [],
    duration: ladder ? { min: ladder.min, max: ladder.max } : null,
    platform: jimeng ? "jimeng" : String(model.platform || ""),
  };
}

function providerExecutionHttpStatus(error) {
  if (["PINNED_MODEL_UNAVAILABLE", "MODEL_CAPABILITY_UNAVAILABLE", "INVALID_MODEL_CAPABILITY"].includes(error?.code)) return 400;
  if (["PROVIDER_VAULT_KEY_MISSING", "PROVIDER_VAULT_KEY_INVALID", "PROVIDER_SUBSYSTEM_LOCKED", "UPSTREAM_UNAVAILABLE"].includes(error?.code)) return 503;
  if (error?.code === "UPSTREAM_TIMEOUT") return 504;
  if (error?.code === "UPSTREAM_RATE_LIMIT") return 429;
  if (String(error?.code || "").startsWith("UPSTREAM_")) return 502;
  return 500;
}

function findPublicProviderCatalogModel(models, requestedModel, providerId = "") {
  if (!requestedModel) return null;
  const candidates = (Array.isArray(models) ? models : []).filter((model) => !providerId || model.providerId === providerId);
  return candidates.find((model) => model.id === requestedModel || model.modelId === requestedModel)
    || candidates.find((model) => model.legacyIds?.includes(requestedModel))
    || null;
}

function createProviderCatalogService({
  providerStore,
  telemetryService,
  getProviderSubsystemError = () => null,
  imageResolutionRules = DefaultImageResolutionRules,
  imageCatalog,
} = {}) {
  if (!providerStore || typeof providerStore.publicModelsForCapability !== "function") {
    throw new TypeError("Provider catalog service requires a compatible Provider Store.");
  }
  if (!telemetryService || typeof telemetryService.getHealthSnapshot !== "function") {
    throw new TypeError("Provider catalog service requires a compatible telemetry service.");
  }
  if (!imageResolutionRules
    || typeof imageResolutionRules.videoDurationRangeFor !== "function"
    || typeof imageResolutionRules.videoResolutionsFor !== "function"
    || typeof imageResolutionRules.videoRatiosFor !== "function") {
    throw new TypeError("Provider catalog service requires image resolution rules.");
  }
  if (!imageCatalog
    || typeof imageCatalog.catalogImageResolutions !== "function"
    || typeof imageCatalog.normalizeJimengImageFamily !== "function") {
    throw new TypeError("Provider catalog service requires the image model catalog.");
  }

  function getPublicProviderModelCatalog(capability) {
    const subsystemError = getProviderSubsystemError?.();
    if (subsystemError) {
      throw Object.assign(new Error("模型服务凭据暂时锁定，请从包含 Provider 主密钥的完整备份恢复。"), {
        code: String(subsystemError.code || "PROVIDER_SUBSYSTEM_LOCKED"),
      });
    }
    const storedModels = providerStore.publicModelsForCapability(capability);
    const providerHealth = telemetryService.getHealthSnapshot();
    const idCounts = storedModels.reduce(
      (counts, model) => counts.set(model.id, (counts.get(model.id) || 0) + 1),
      new Map(),
    );
    const models = storedModels.map((model) => {
      const duplicateId = idCounts.get(model.id) > 1;
      const health = providerHealth.get(model.providerId)
        || summarizeProviderCatalogHealth({ id: model.providerId, enabled: true }, { providers: {}, usage: {} });
      return {
        id: capability === "image.generate" || duplicateId
          ? makeCustomModelClientId(model.providerId, model.id)
          : model.id,
        modelId: model.id,
        displayName: `${model.id} · ${model.providerName}`,
        legacyIds: (model.legacyModelIds || []).flatMap((id) => [
          id,
          makeCustomModelClientId(model.providerId, id),
        ]),
        providerId: model.providerId,
        providerName: model.providerName,
        capabilities: [...model.capabilities],
        ...(capability === "video.generate" ? {
          providerProtocol: model.providerProtocol,
          providerHost: model.providerHost,
          modelProtocol: model.modelProtocol,
        } : {}),
        providerSortOrder: model.providerSortOrder,
        modelSortOrder: model.modelSortOrder,
        state: health.state,
        successRate: health.successRate,
        latencyMs: health.latencyMs,
        lastUsedAt: health.lastUsedAt,
        healthRank: health.rank,
        ...(capability === "image.generate" ? catalogImagePresentation(model, imageCatalog) : {}),
        ...(capability === "video.generate" ? catalogVideoPresentation(model, imageResolutionRules) : {}),
      };
    }).sort((left, right) => capability === "image.generate"
      ? left.healthRank - right.healthRank
        || left.providerSortOrder - right.providerSortOrder
        || left.modelSortOrder - right.modelSortOrder
      : left.providerSortOrder - right.providerSortOrder
        || left.modelSortOrder - right.modelSortOrder);
    return {
      defaultModel: models[0]?.id || "",
      models,
      labels: Object.fromEntries(models.map((model) => [model.id, model.displayName || model.id])),
    };
  }

  function start() {
    return Object.freeze({ ok: true, component: "provider-catalog-service" });
  }

  return Object.freeze({
    start,
    getPublicProviderModelCatalog,
    findPublicProviderCatalogModel,
    catalogImagePresentation: (model) => catalogImagePresentation(model, imageCatalog),
    catalogVideoPresentation: (model) => catalogVideoPresentation(model, imageResolutionRules),
    providerExecutionHttpStatus,
    makeCustomModelClientId,
    normalizeModelPrice,
  });
}

module.exports = {
  catalogImagePresentation,
  catalogVideoPresentation,
  createProviderCatalogService,
  findPublicProviderCatalogModel,
  makeCustomModelClientId,
  normalizeModelPrice,
  providerExecutionHttpStatus,
};
