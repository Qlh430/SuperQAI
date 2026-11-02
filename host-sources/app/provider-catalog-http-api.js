"use strict";

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createProviderCatalogHttpApi({
  getPublicProviderModelCatalog,
  providerExecutionHttpStatus,
  readCatalogIdentity,
  sendJson,
} = {}) {
  for (const [name, dependency] of Object.entries({
    getPublicProviderModelCatalog,
    providerExecutionHttpStatus,
    readCatalogIdentity,
    sendJson,
  })) {
    if (!dependency) throw new TypeError(`Provider catalog HTTP API requires ${name}.`);
  }

  function sendProviderModelCatalog(res, capability, options = {}) {
    try {
      const catalog = getPublicProviderModelCatalog(capability);
      if (!options.image) {
        sendJson(res, 200, catalog);
        return;
      }
      const resolutions = Object.fromEntries(catalog.models.map((model) => [model.id, model.resolutions]));
      const platforms = Object.fromEntries(catalog.models.map((model) => [model.id, model.platform]));
      const families = Object.fromEntries(catalog.models.map((model) => [model.id, model.family]));
      const prices = Object.fromEntries(catalog.models.filter((model) => model.price).map((model) => [model.id, model.price]));
      const candidates = catalog.models.map((model, order) => ({
        id: model.id,
        providerId: model.providerId,
        providerName: model.providerName,
        providerProtocol: model.providerProtocol,
        providerHost: model.providerHost,
        modelProtocol: model.modelProtocol,
        model: model.modelId,
        label: model.displayName || model.id,
        enabled: true,
        hasApiKey: true,
        hasBaseUrl: true,
        capabilities: [
          ...(model.capabilities.includes("image.generate") ? ["generation"] : []),
          ...(model.capabilities.includes("image.edit") ? ["edit"] : []),
        ],
        state: model.state,
        successRate: model.successRate,
        latencyMs: model.latencyMs,
        lastUsedAt: model.lastUsedAt,
        order,
        platform: model.platform,
        family: model.family,
        parameterOverrides: model.parameterOverrides || {},
        resolutions: model.resolutions,
      }));
      const identity = readCatalogIdentity();
      sendJson(res, 200, {
        ...catalog,
        instanceId: identity.instanceId,
        revision: identity.revision,
        resolutions,
        platforms,
        families,
        prices,
        candidates,
      });
    } catch (error) {
      sendJson(res, providerExecutionHttpStatus(error), {
        error: String(error?.safeMessage || error?.message || "模型目录暂时不可用。"),
        code: String(error?.code || "PROVIDER_SUBSYSTEM_LOCKED"),
      });
    }
  }

  function sendProviderVideoModelCatalog(res) {
    try {
      const catalog = getPublicProviderModelCatalog("video.generate");
      const models = catalog.models.map((model) => ({
        ...model,
        displayName: `${model.modelId} · ${model.providerName}`,
      }));
      const resolutions = Object.fromEntries(models.map((model) => [model.id, model.resolutions]));
      const platforms = Object.fromEntries(models.map((model) => [model.id, model.platform]));
      const ratios = Object.fromEntries(models.map((model) => [model.id, model.ratios]));
      const durations = Object.fromEntries(models.filter((model) => model.duration).map((model) => [model.id, model.duration]));
      const candidates = models.map((model, order) => ({
        id: model.id,
        providerId: model.providerId,
        providerName: model.providerName,
        providerProtocol: model.providerProtocol,
        providerHost: model.providerHost,
        modelProtocol: model.modelProtocol,
        model: model.modelId,
        label: model.displayName,
        enabled: true,
        capabilities: ["video"],
        state: model.state,
        order,
        platform: model.platform,
        resolutions: model.resolutions,
        ratios: model.ratios,
        duration: model.duration,
      }));
      const identity = readCatalogIdentity();
      sendJson(res, 200, {
        ...catalog,
        models,
        labels: Object.fromEntries(models.map((model) => [model.id, model.displayName])),
        instanceId: identity.instanceId,
        revision: identity.revision,
        resolutions,
        platforms,
        ratios,
        durations,
        candidates,
      });
    } catch (error) {
      sendJson(res, providerExecutionHttpStatus(error), {
        error: String(error?.safeMessage || error?.message || "模型目录暂时不可用。"),
        code: String(error?.code || "PROVIDER_SUBSYSTEM_LOCKED"),
      });
    }
  }

  async function handle(req, res) {
    if (req?.method !== "GET") return false;
    const requestPath = requestPathname(req);
    if (requestPath === "/api/models") {
      sendProviderModelCatalog(res, "llm.chat");
      return true;
    }
    if (requestPath === "/api/vision-models") {
      sendProviderModelCatalog(res, "llm.chat.vision");
      return true;
    }
    if (requestPath === "/api/image-models") {
      sendProviderModelCatalog(res, "image.generate", { image: true });
      return true;
    }
    if (requestPath === "/api/video-models") {
      sendProviderVideoModelCatalog(res);
      return true;
    }
    return false;
  }

  return Object.freeze({
    handle,
    sendProviderModelCatalog,
    sendProviderVideoModelCatalog,
  });
}

module.exports = { createProviderCatalogHttpApi };
