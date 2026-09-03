"use strict";

const { assertCapability, normalizeCapabilityList } = require("./model-capabilities");

function resolverError(code, safeMessage, details = {}) {
  return Object.assign(new Error(safeMessage), { code, safeMessage, ...details });
}

function finiteOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "en");
}

function compareCandidate(left, right) {
  return left.providerCapabilityOrder - right.providerCapabilityOrder
    || left.providerSortOrder - right.providerSortOrder
    || left.modelCapabilityOrder - right.modelCapabilityOrder
    || left.modelSortOrder - right.modelSortOrder
    || compareText(left.provider.id, right.provider.id)
    || compareText(left.model.id, right.model.id);
}

function publicAlternative(candidate) {
  return {
    providerId: candidate.provider.id,
    providerName: candidate.provider.name,
    modelId: candidate.model.id,
    modelName: candidate.model.displayName || candidate.model.id,
    capabilities: [...candidate.model.capabilities],
  };
}

function createCapabilityResolver({ store } = {}) {
  if (!store || typeof store.listInternal !== "function" || typeof store.getAutoFallback !== "function") {
    throw new TypeError("Capability Resolver requires a compatible Provider Store.");
  }

  function normalizedQuery(query = {}) {
    const intent = assertCapability(query.intent, "intent");
    const mustAll = normalizeCapabilityList(query.mustAll, "mustAll capability");
    if (!mustAll.includes(intent)) mustAll.unshift(intent);
    const anyOf = normalizeCapabilityList(query.anyOf, "anyOf capability");
    return {
      intent,
      mustAll,
      anyOf,
      preferredProviderId: String(query.preferredProviderId || "").trim(),
      preferredModelId: String(query.preferredModelId || "").trim(),
    };
  }

  function listCandidates(query = {}) {
    const normalized = normalizedQuery(query);
    const output = [];
    for (const provider of store.listInternal()) {
      if (!provider?.enabled) continue;
      if (normalized.preferredProviderId && provider.id !== normalized.preferredProviderId) continue;
      for (const model of Array.isArray(provider.models) ? provider.models : []) {
        if (normalized.preferredModelId && model.id !== normalized.preferredModelId) continue;
        const capabilities = new Set(Array.isArray(model.capabilities) ? model.capabilities : []);
        if (!normalized.mustAll.every((capability) => capabilities.has(capability))) continue;
        if (normalized.anyOf.length && !normalized.anyOf.some((capability) => capabilities.has(capability))) continue;
        output.push({
          provider,
          model,
          intent: normalized.intent,
          reason: normalized.preferredProviderId || normalized.preferredModelId ? "pinned-selection" : "administrator-order",
          providerCapabilityOrder: finiteOrder(provider.capabilitySort?.[normalized.intent]),
          providerSortOrder: finiteOrder(provider.sortOrder),
          modelCapabilityOrder: finiteOrder(model.capabilitySort?.[normalized.intent]),
          modelSortOrder: finiteOrder(model.sortOrder),
        });
      }
    }
    output.sort(compareCandidate);
    return output;
  }

  function resolve(query = {}) {
    const normalized = normalizedQuery(query);
    const candidates = listCandidates(normalized);
    const pinned = Boolean(normalized.preferredProviderId || normalized.preferredModelId);
    if (!candidates.length) {
      const alternatives = pinned
        ? listCandidates({ intent: normalized.intent, mustAll: normalized.mustAll, anyOf: normalized.anyOf }).slice(0, 5).map(publicAlternative)
        : [];
      throw resolverError(
        pinned ? "PINNED_MODEL_UNAVAILABLE" : "MODEL_CAPABILITY_UNAVAILABLE",
        pinned
          ? "指定的提供商或模型不可用，或不具备所需能力。"
          : `没有已启用的模型具备能力 ${normalized.intent}。`,
        { intent: normalized.intent, missingCapabilities: [...normalized.mustAll], alternatives },
      );
    }
    const selected = candidates[0];
    return {
      ...selected,
      reason: pinned ? "pinned-selection" : "administrator-order",
      warnings: [],
      alternatives: candidates.slice(1, 6).map(publicAlternative),
    };
  }

  return Object.freeze({
    resolve,
    listCandidates,
    getAutoFallback: () => Boolean(store.getAutoFallback()),
  });
}

module.exports = {
  createCapabilityResolver,
};
