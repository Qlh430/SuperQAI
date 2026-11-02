"use strict";

/**
 * Legacy settings-file owner.
 *
 * The provider system has its own database-backed store, but older settings
 * files are still migrated and exposed for compatibility. This module owns
 * that file format and keeps the HTTP composition root free of storage rules.
 */
function createServerSettingsService({
  crypto,
  fs,
  settingsFile,
  dataDir,
  getSystemProviders,
  normalizeProviderBaseUrl,
  normalizeRouteMode,
  normalizeImageResolutions,
  normalizeImagePlatform,
  normalizeImageModelFamily,
  normalizeModelPrice,
  normalizeAgentRouting,
} = {}) {
  for (const [name, dependency] of Object.entries({
    crypto,
    fs,
    getSystemProviders,
    normalizeProviderBaseUrl,
    normalizeRouteMode,
    normalizeImageResolutions,
    normalizeImagePlatform,
    normalizeImageModelFamily,
    normalizeModelPrice,
    normalizeAgentRouting,
  })) {
    if (!dependency) throw new TypeError(`Server settings service requires ${name}.`);
  }

  function getDefaultSettings() {
    return {
      providers: [],
      agentRouting: normalizeAgentRouting(),
      canvas: {
        keepAspect: false,
        controlBarBottom: false,
        disconnectMenu: false,
      },
      appearance: {
        theme: "system",
        palette: "yellow-black",
        animations: true,
      },
      storage: {
        autoSave: true,
        intervalMinutes: 5,
        dataDirectory: dataDir,
      },
    };
  }

  function readSettingsFile() {
    const defaults = getDefaultSettings();
    try {
      if (!fs.existsSync(settingsFile)) return defaults;
      const value = JSON.parse(fs.readFileSync(settingsFile, "utf8") || "{}");
      return normalizeSettings(value, defaults);
    } catch {
      return defaults;
    }
  }

  function writeSettingsFile(settings) {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  }

  function normalizeSettings(value, previous = getDefaultSettings()) {
    const defaults = getDefaultSettings();
    const previousProviders = new Map([...(previous.providers || []), ...getSystemProviders()].map((provider) => [provider.id, provider]));
    const providers = (Array.isArray(value?.providers) ? value.providers : previous.providers || []).map((provider, index) => {
      const id = String(provider.id || crypto.randomUUID());
      const old = previousProviders.get(id) || {};
      const submittedKey = String(provider.apiKey || "").trim();
      const models = Array.isArray(provider.models) ? provider.models : old.models || [];
      const baseUrl = normalizeProviderBaseUrl(provider.baseUrl || old.baseUrl || "");
      return {
        id,
        name: String(provider.name || old.name || `API ${index + 1}`).trim() || `API ${index + 1}`,
        baseUrl,
        networkMode: normalizeRouteMode(provider.networkMode || old.networkMode, baseUrl),
        rechargeUrl: String(provider.rechargeUrl || old.rechargeUrl || "").trim(),
        apiKey: submittedKey && !submittedKey.includes("\u2022\u2022\u2022\u2022") ? submittedKey : String(old.apiKey || ""),
        enabled: provider.enabled !== false,
        importedSystem: Boolean(provider.importedSystem || provider.managed || old.importedSystem),
        models: models.map((model) => {
          const legacyCapabilities = model.type === "chat"
            ? ["text", "vision"]
            : model.type === "image"
              ? ["generation", "edit"]
              : [];
          const capabilities = Array.isArray(model.capabilities) ? model.capabilities : legacyCapabilities;
          const resolutions = normalizeImageResolutions(model.resolutions, model.id);
          const platform = normalizeImagePlatform(model.platform, model.id);
          const family = normalizeImageModelFamily(model.family, model.id);
          return {
            id: String(model.id || "").trim(),
            alias: String(model.alias || "").trim(),
            capabilities: [...new Set(capabilities.filter((item) => ["text", "vision", "generation", "edit"].includes(item)))],
            resolutions,
            platform,
            family: platform === "google" || platform === "midjourney" ? family : "",
            price: normalizeModelPrice(model.price ?? old.models?.find((item) => item.id === model.id)?.price),
          };
        }).filter((model) => model.id),
      };
    });
    const appearance = { ...defaults.appearance, ...(previous.appearance || {}), ...(value?.appearance || {}) };
    if (!["light", "dark", "system"].includes(appearance.theme)) appearance.theme = defaults.appearance.theme;
    if (!["yellow-black", "red-blue", "mustard-blue"].includes(appearance.palette)) appearance.palette = defaults.appearance.palette;

    return {
      providers,
      agentRouting: normalizeAgentRouting({
        ...(previous.agentRouting || defaults.agentRouting),
        ...(value?.agentRouting || {}),
      }),
      canvas: { ...defaults.canvas, ...(previous.canvas || {}), ...(value?.canvas || {}) },
      appearance,
      storage: {
        ...defaults.storage,
        ...(previous.storage || {}),
        ...(value?.storage || {}),
        dataDirectory: dataDir,
        intervalMinutes: Math.max(1, Math.min(120, Number(value?.storage?.intervalMinutes ?? previous.storage?.intervalMinutes ?? 5) || 5)),
      },
    };
  }

  function maskApiKey(key) {
    const value = String(key || "");
    if (!value) return "";
    if (value.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    return `${value.slice(0, 4)}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${value.slice(-4)}`;
  }

  function sanitizeSettings(settings) {
    return {
      ...settings,
      providers: (settings.providers || []).map((provider) => ({
        ...provider,
        apiKey: "",
        apiKeyMasked: maskApiKey(provider.apiKey),
        hasApiKey: Boolean(provider.apiKey),
      })),
    };
  }

  function getSettingsResponse(settings, imageCatalogMetadata = {}) {
    const sanitized = sanitizeSettings(settings);
    const systemProviders = getSystemProviders();
    sanitized.providers = sanitized.providers.map((provider) => {
      const systemProvider = systemProviders.find((item) => item.id === provider.id);
      if (!systemProvider || !provider.importedSystem) return provider;
      const existingModels = new Set((provider.models || []).map((model) => model.id));
      const missingModels = systemProvider.models.filter((model) => !existingModels.has(model.id));
      return missingModels.length ? { ...provider, models: [...provider.models, ...missingModels] } : provider;
    });
    const configuredIds = new Set(sanitized.providers.map((provider) => provider.id));
    return {
      ...sanitized,
      imageModelsInstanceId: String(imageCatalogMetadata.instanceId || ""),
      imageModelsRevision: Number(imageCatalogMetadata.revision || 0),
      providers: [
        ...systemProviders
          .filter((provider) => !configuredIds.has(provider.id))
          .map((provider) => ({
            ...provider,
            managed: false,
            importedSystem: true,
            hasApiKey: Boolean(provider.apiKey),
            apiKey: "",
            apiKeyMasked: maskApiKey(provider.apiKey),
          })),
        ...sanitized.providers,
      ],
    };
  }

  return Object.freeze({
    getDefaultSettings,
    getSettingsResponse,
    maskApiKey,
    normalizeSettings,
    readSettingsFile,
    sanitizeSettings,
    writeSettingsFile,
  });
}

module.exports = { createServerSettingsService };
