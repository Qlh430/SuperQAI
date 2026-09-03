"use strict";

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

function createProviderStore({ db, vault } = {}) {
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

  function toPublic(provider) {
    if (!provider) return null;
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
      hasApiKey: Boolean(provider.encryptedApiKey),
      apiKeyMasked: decryptedMask(provider.encryptedApiKey),
      models: provider.models.map(publicModel),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  function normalizeModels(models, providerProtocol) {
    if (!Array.isArray(models)) throw codedError("invalid_provider_models", "models must be an array.");
    const ids = new Set();
    return models.map((model, index) => {
      const id = requiredText(model?.id, "model id");
      if (ids.has(id)) throw codedError("duplicate_provider_model", `Duplicate model id: ${id}`);
      ids.add(id);
      return {
        id,
        displayName: String(model.displayName ?? id).trim() || id,
        modelProtocol: requiredText(model.modelProtocol ?? model.protocol ?? providerProtocol, "model protocol"),
        capabilities: uniqueStrings(model.capabilities),
        sortOrder: Number.isSafeInteger(Number(model.sortOrder)) && Number(model.sortOrder) >= 0
          ? Number(model.sortOrder)
          : index,
        capabilitySort: isObject(model.capabilitySort) ? { ...model.capabilitySort } : {},
        metadata: isObject(model.metadata) ? { ...model.metadata } : {},
      };
    });
  }

  function nextSortOrder() {
    const records = db.listProviderRecords();
    return records.length ? Math.max(...records.map((provider) => provider.sortOrder)) + 1 : 0;
  }

  function nextEncryptedSecret({ value, clear, current }) {
    if (clear) return "";
    if (value === undefined || value === null || value === "" || isMaskedSecret(value)) return current || "";
    if (typeof value !== "string") throw codedError("invalid_provider_secret", "Provider secret must be a string.");
    return vault.encrypt(value);
  }

  function save(input = {}) {
    const id = requiredText(input.id, "provider id");
    const existing = db.getProviderRecord(id);
    const protocol = requiredText(input.providerProtocol ?? input.protocol ?? existing?.providerProtocol, "provider protocol");
    const models = input.models === undefined
      ? existing?.models || []
      : normalizeModels(input.models, protocol);
    const record = {
      id,
      name: requiredText(input.name ?? existing?.name, "provider name"),
      baseUrl: requiredText(input.baseUrl ?? existing?.baseUrl, "provider baseUrl"),
      providerProtocol: protocol,
      source: requiredText(input.source ?? existing?.source ?? "api", "provider source"),
      cliTool: input.cliTool === undefined ? existing?.cliTool || null : String(input.cliTool || "").trim() || null,
      encryptedApiKey: nextEncryptedSecret({
        value: input.apiKey,
        clear: input.clearApiKey === true,
        current: existing?.encryptedApiKey,
      }),
      encryptedWalletKey: nextEncryptedSecret({
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
      metadata: isObject(input.metadata) ? { ...input.metadata } : { ...(existing?.metadata || {}) },
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
      models: provider.models.map(publicModel),
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
      for (const model of provider.models) {
        if (!model.capabilities.includes(requiredCapability)) continue;
        output.push({
          id: model.id,
          displayName: model.displayName || model.id,
          providerId: provider.id,
          providerName: provider.name,
          capabilities: [...model.capabilities],
          providerSortOrder: provider.sortOrder,
          modelSortOrder: model.sortOrder,
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
    getAutoFallback: () => db.getProviderSettings().autoFallback,
    setAutoFallback: (enabled) => db.setProviderSettings({ autoFallback: Boolean(enabled) }).autoFallback,
    publicModelsForCapability,
  });
}

module.exports = {
  createProviderStore,
};
