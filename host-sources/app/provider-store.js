"use strict";

const { inferModelConfiguration, normalizeProviderBaseUrl, canonicalJimengImageModelId } = require("./provider-model-rules");

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw codedError("invalid_provider_input", `${label} is required.`);
  return text;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => requiredText(value, "capability")))];
}

function isMaskedSecret(value) {
  const text = String(value ?? "");
  return text.includes("••••") || /^\*+$/.test(text) || /^.{0,4}\*{4,}.{0,4}$/.test(text);
}

function isCliProtocol(registry, protocol) {
  return registry?.getBuiltin?.(protocol)?.connectionType === "cli";
}

function publicModel(model) {
  return {
    id: model.id,
    displayName: model.displayName || model.id,
    protocol: model.modelProtocol,
    capabilities: [...model.capabilities],
    sortOrder: model.sortOrder,
    capabilitySort: { ...model.capabilitySort },
    metadata: { ...model.metadata },
  };
}

function materializeModelCapabilities(model, provider, inferConfiguration = inferModelConfiguration) {
  if (!model || !Array.isArray(model.capabilities) || model.capabilities.length > 0 || model.metadata?.capabilitiesExplicit === true) {
    return model;
  }
  const inferred = inferConfiguration(
    { ...model, capabilities: undefined },
    { protocol: provider?.providerProtocol, baseUrl: provider?.baseUrl },
  );
  return { ...model, capabilities: uniqueStrings(inferred.capabilities) };
}

function materializeProviderModels(provider, inferConfiguration = inferModelConfiguration) {
  const models = Array.isArray(provider?.models) ? provider.models : [];
  return models.map(model => materializeModelCapabilities(model, provider, inferConfiguration));
}

function createProviderStore({ db, vault, registry } = {}) {
  const requiredDbMethods = [
    "listProviderRecords",
    "getProviderRecord",
    "saveProviderRecord",
    "deleteProviderRecord",
    "reorderProviderRecords",
    "reorderProviderModelRecords",
    "getProviderSettings",
    "setProviderSettings",
  ];
  if (!db || requiredDbMethods.some((method) => typeof db[method] !== "function")) {
    throw new TypeError("Provider Store requires a compatible system database.");
  }
  if (!vault || typeof vault.encrypt !== "function" || typeof vault.decrypt !== "function") {
    throw new TypeError("Provider Store requires a compatible secret vault.");
  }

  function decryptedMask(encrypted) {
    if (!encrypted) return "";
    try {
      return vault.mask(vault.decrypt(encrypted));
    } catch {
      return "••••";
    }
  }

  function canonicalPlatformProtocol(protocol) {
    const value = String(protocol || "").trim();
    return registry?.platformProtocolId?.(value) || value;
  }

  function toPublic(provider) {
    if (!provider) return null;
    const protocol = canonicalPlatformProtocol(provider.providerProtocol);
    const models = materializeProviderModels(provider, registry?.inferModelConfiguration || inferModelConfiguration);
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      protocol,
      source: provider.source,
      cliTool: provider.cliTool,
      enabled: provider.enabled,
      sortOrder: provider.sortOrder,
      capabilitySort: { ...provider.capabilitySort },
      metadata: { ...provider.metadata },
      hasApiKey: Boolean(provider.encryptedApiKey),
      apiKeyMasked: decryptedMask(provider.encryptedApiKey),
      models: models.map(publicModel),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  function normalizeModels(models, providerProtocol, baseUrl) {
    if (!Array.isArray(models)) throw codedError("invalid_provider_models", "models must be an array.");
    const ids = new Set();
    return models.map((model, index) => {
      const requestedId = requiredText(model?.id, "model id");
      // A Dreamina image model is published as "jimeng-5.0", so a row saved with
      // the bare version is upgraded here. The previous name is kept as a legacy
      // id, which is how a canvas node that still refers to it keeps resolving.
      const canonicalId = canonicalPlatformProtocol(providerProtocol) === "cli:jimeng"
        ? canonicalJimengImageModelId(requestedId)
        : "";
      const id = canonicalId || requestedId;
      if (ids.has(id)) throw codedError("duplicate_provider_model", `Duplicate model id: ${id}`);
      ids.add(id);
      const inferred = (registry?.inferModelConfiguration || inferModelConfiguration)({ ...model, id }, { protocol: providerProtocol, baseUrl });
      const legacyModelIds = [...new Set([
        ...(Array.isArray(model.metadata?.legacyModelIds) ? model.metadata.legacyModelIds : []),
        ...(id !== requestedId ? [requestedId] : []),
      ])];
      return {
        id,
        displayName: String(model.displayName ?? id).trim() || id,
        modelProtocol: inferred.protocol,
        capabilities: uniqueStrings(inferred.capabilities),
        sortOrder: Number.isSafeInteger(Number(model.sortOrder)) && Number(model.sortOrder) >= 0
          ? Number(model.sortOrder)
          : index,
        capabilitySort: isObject(model.capabilitySort) ? { ...model.capabilitySort } : {},
        metadata: {
          ...(isObject(model.metadata) ? model.metadata : {}),
          ...(legacyModelIds.length ? { legacyModelIds } : {}),
        },
      };
    });
  }

  function repairProtocolAssignments() {
    const repairedProviderIds = [];
    for (const existing of db.listProviderRecords()) {
      const protocol = canonicalPlatformProtocol(existing.providerProtocol);
      if (protocol === existing.providerProtocol) continue;
      // Migration must not re-run strict model compatibility inference on
      // legacy rows. Only the platform column is repaired; model profiles,
      // secrets, and capabilities remain byte-for-byte under DB validation.
      db.saveProviderRecord({
        ...existing,
        providerProtocol: protocol,
        models: existing.models || [],
      });
      repairedProviderIds.push(existing.id);
    }
    return repairedProviderIds;
  }

  function nextSortOrder() {
    const records = db.listProviderRecords();
    return records.length ? Math.max(...records.map((provider) => provider.sortOrder)) + 1 : 0;
  }

  function nextEncryptedSecret({ value, clear, current }) {
    if (clear) return "";
    if (value === undefined || value === null || value === "" || isMaskedSecret(value)) return current || "";
    if (typeof value !== "string") throw codedError("invalid_provider_secret", "Provider secret must be a string.");
    const clean = value.trim();
    return clean ? vault.encrypt(clean) : current || "";
  }

  function save(input = {}) {
    const id = requiredText(input.id, "provider id");
    const existing = db.getProviderRecord(id);
    const requestedProtocol = requiredText(input.providerProtocol ?? input.protocol ?? existing?.providerProtocol, "provider protocol");
    // APIMart is represented by the OpenAI platform in the public settings
    // contract, but its asynchronous image adapter still needs to be selected
    // at execution time. Preserve that runtime identity when a caller saves the
    // legacy protocol explicitly, including local APIMart-compatible relays
    // that cannot be recognized from their hostname.
    const legacyApimartPlatform = (registry?.runtimeId?.(requestedProtocol) || requestedProtocol).toLowerCase() === "apimart";
    let protocol = registry?.platformProtocolId?.(requestedProtocol) || requestedProtocol;
    protocol = registry?.checkScope(protocol, "platform")?.id || protocol;
    const cliProtocol = isCliProtocol(registry, protocol);
    const metadata = { ...(existing?.metadata || {}), ...(isObject(input.metadata) ? input.metadata : {}) };
    if (legacyApimartPlatform) metadata.legacyPlatformProtocol = "apimart";
    const networkMode = String((input.networkMode ?? metadata.networkMode ?? metadata.legacyNetworkMode) || "auto").trim().toLowerCase();
    if (!["auto", "direct", "proxy"].includes(networkMode)) throw codedError("invalid_provider_input", "网络线路必须是自动、直连或代理。");
    metadata.networkMode = networkMode;
    const baseUrl = cliProtocol
      ? ""
      : normalizeProviderBaseUrl(requiredText(input.baseUrl ?? existing?.baseUrl, "provider baseUrl"));
    const models = normalizeModels(input.models === undefined ? existing?.models || [] : input.models, protocol, baseUrl);
    const record = {
      id,
      name: requiredText(input.name ?? existing?.name, "provider name"),
      baseUrl,
      providerProtocol: protocol,
      source: cliProtocol ? "cli" : requiredText(input.source ?? existing?.source ?? "api", "provider source"),
      cliTool: cliProtocol ? "jimeng" : input.cliTool === undefined ? existing?.cliTool || null : String(input.cliTool || "").trim() || null,
      encryptedApiKey: cliProtocol ? "" : nextEncryptedSecret({
        value: input.apiKey,
        clear: input.clearApiKey === true,
        current: existing?.encryptedApiKey,
      }),
      encryptedWalletKey: cliProtocol ? "" : nextEncryptedSecret({
        value: input.walletKey,
        clear: input.clearWalletKey === true,
        current: existing?.encryptedWalletKey,
      }),
      enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
      sortOrder: Number.isSafeInteger(Number(input.sortOrder)) && Number(input.sortOrder) >= 0
        ? Number(input.sortOrder)
        : existing?.sortOrder ?? nextSortOrder(),
      capabilitySort: isObject(input.capabilitySort)
        ? { ...input.capabilitySort }
        : isObject(input.capabilities)
          ? { ...input.capabilities }
          : { ...(existing?.capabilitySort || {}) },
      metadata,
      models,
    };
    return toPublic(db.saveProviderRecord(record));
  }

  function reveal(providerId) {
    const provider = db.getProviderRecord(providerId);
    if (!provider) throw codedError("provider_not_found", "Provider was not found.");
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      protocol: provider.providerProtocol,
      source: provider.source,
      cliTool: provider.cliTool,
      enabled: provider.enabled,
      sortOrder: provider.sortOrder,
      capabilitySort: { ...provider.capabilitySort },
      metadata: { ...provider.metadata },
      apiKey: provider.encryptedApiKey ? vault.decrypt(provider.encryptedApiKey) : "",
      walletKey: provider.encryptedWalletKey ? vault.decrypt(provider.encryptedWalletKey) : "",
      models: materializeProviderModels(provider, registry?.inferModelConfiguration || inferModelConfiguration).map(publicModel),
    };
  }

  function validateSecrets() {
    const invalidProviderIds = [];
    for (const provider of db.listProviderRecords()) {
      try {
        if (provider.encryptedApiKey) vault.decrypt(provider.encryptedApiKey);
        if (provider.encryptedWalletKey) vault.decrypt(provider.encryptedWalletKey);
      } catch (error) {
        if (["PROVIDER_VAULT_KEY_MISSING", "PROVIDER_VAULT_KEY_INVALID"].includes(error?.code)) throw error;
        invalidProviderIds.push(provider.id);
        db.saveProviderRecord({ ...provider, enabled: false });
      }
    }
    return { ok: invalidProviderIds.length === 0, invalidProviderIds };
  }

  function setEnabled(providerId, enabled) {
    const provider = db.getProviderRecord(providerId);
    if (!provider) throw codedError("provider_not_found", "Provider was not found.");
    return toPublic(db.saveProviderRecord({ ...provider, enabled: Boolean(enabled) }));
  }

  function remove(providerId) {
    return db.deleteProviderRecord(providerId);
  }

  function reorderProviders(providerIds) {
    return db.reorderProviderRecords(providerIds).map(toPublic);
  }

  function reorderModels(providerId, modelIds) {
    return toPublic(db.reorderProviderModelRecords(providerId, modelIds));
  }

  function publicModelsForCapability(capability) {
    const requiredCapability = requiredText(capability, "capability");
    const output = [];
    for (const provider of db.listProviderRecords()) {
      if (!provider.enabled) continue;
      let providerHost = "";
      try { providerHost = new URL(String(provider.baseUrl || "")).hostname.toLowerCase(); } catch {}
      for (const model of materializeProviderModels(provider, registry?.inferModelConfiguration || inferModelConfiguration)) {
        if (!model.capabilities.includes(requiredCapability)) continue;
        output.push({
          id: model.id,
          displayName: model.displayName || model.id,
          providerId: provider.id,
          providerName: provider.name,
          providerProtocol: String(provider.providerProtocol || ""),
          providerHost,
          modelProtocol: String(model.modelProtocol || ""),
          capabilities: [...model.capabilities],
          providerSortOrder: provider.sortOrder,
          modelSortOrder: model.sortOrder,
          resolutions: Array.isArray(model.metadata?.resolutions) ? [...model.metadata.resolutions] : [],
          platform: String(model.metadata?.platform || ""),
          family: String(model.metadata?.family || ""),
          price: String(model.metadata?.price || ""),
          parameterOverrides: isObject(model.metadata?.parameterOverrides)
            ? { ...model.metadata.parameterOverrides }
            : {},
          legacyModelIds: Array.isArray(model.metadata?.legacyModelIds) ? [...model.metadata.legacyModelIds] : [],
        });
      }
    }
    return output;
  }

  return Object.freeze({
    listPublic: () => db.listProviderRecords().map(toPublic),
    getPublic: (providerId) => toPublic(db.getProviderRecord(providerId)),
    reveal,
    validateSecrets,
    listInternal: () => db.listProviderRecords().map((provider) => reveal(provider.id)),
    save,
    setEnabled,
    remove,
    reorderProviders,
    reorderModels,
    repairProtocolAssignments,
    getAutoFallback: () => db.getProviderSettings().autoFallback,
    setAutoFallback: (enabled) => db.setProviderSettings({ autoFallback: Boolean(enabled) }).autoFallback,
    publicModelsForCapability,
  });
}

module.exports = {
  createProviderStore,
};
