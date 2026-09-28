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
  return left.configuredOrder - right.configuredOrder
    || left.healthRank - right.healthRank
    || left.providerCapabilityOrder - right.providerCapabilityOrder
    || left.providerSortOrder - right.providerSortOrder
    || left.modelCapabilityOrder - right.modelCapabilityOrder
    || left.modelSortOrder - right.modelSortOrder
    || compareText(left.provider.id, right.provider.id)
    || compareText(left.model.id, right.model.id);
}

function candidateKey(providerId, modelId) {
  return `${String(providerId || "").trim()}\n${String(modelId || "").trim()}`;
}

function normalizeCandidateOrder(value) {
  const output = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const providerId = String(item?.providerId || "").trim();
    const modelId = String(item?.modelId || "").trim();
    const key = candidateKey(providerId, modelId);
    if (!providerId || !modelId || seen.has(key)) continue;
    seen.add(key);
    output.push({ providerId, modelId });
  }
  return output;
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

function createCapabilityResolver({ store, candidateHealth = null } = {}) {
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
      candidateOrder: normalizeCandidateOrder(query.candidateOrder),
    };
  }

  function listCandidates(query = {}) {
    const normalized = normalizedQuery(query);
    const pinned = Boolean(normalized.preferredProviderId || normalized.preferredModelId);
    const orderByKey = new Map(normalized.candidateOrder.map((item, index) => [candidateKey(item.providerId, item.modelId), index]));
    const ordered = orderByKey.size > 0;
    const output = [];
    const providers = store.listInternal().filter(provider => provider?.enabled
      && (!normalized.preferredProviderId || provider.id === normalized.preferredProviderId));
    const exactMatch = providers.some(provider => (provider.models || []).some(model => model.id === normalized.preferredModelId));
    for (const provider of providers) {
      const models = Array.isArray(provider.models) ? provider.models : [];
      for (const model of models) {
        const configuredOrder = orderByKey.get(candidateKey(provider.id, model.id));
        if (ordered && configuredOrder === undefined) continue;
        if (normalized.preferredModelId && model.id !== normalized.preferredModelId
          && (exactMatch || !Array.isArray(model.metadata?.legacyModelIds) || !model.metadata.legacyModelIds.includes(normalized.preferredModelId))) continue;
        const capabilities = new Set(Array.isArray(model.capabilities) ? model.capabilities : []);
        if (!normalized.mustAll.every((capability) => capabilities.has(capability))) continue;
        if (normalized.anyOf.length && !normalized.anyOf.some((capability) => capabilities.has(capability))) continue;
        let health = null;
        if (!pinned && !ordered && typeof candidateHealth === "function") {
          try {
            health = candidateHealth({ provider, model, intent: normalized.intent }) || null;
          } catch {
            health = null;
          }
        }
        const healthRanked = Number.isFinite(Number(health?.rank));
        output.push({
          provider,
          model,
          intent: normalized.intent,
          reason: pinned ? "pinned-selection" : healthRanked ? "health-priority" : "administrator-order",
          health: healthRanked ? { ...health, rank: Number(health.rank) } : null,
          healthRanked,
          healthRank: healthRanked ? Number(health.rank) : 0,
          configuredOrder: configuredOrder ?? Number.MAX_SAFE_INTEGER,
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
      reason: pinned ? "pinned-selection" : selected.reason,
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
