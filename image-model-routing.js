(function initCanvasImageModelRouting(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasImageModelRouting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasImageModelRouting() {
  const BLOCKED_STATES = new Set([
    "disabled",
    "offline",
    "connection-error",
    "account-limited",
    "auth-error",
    "balance-error",
  ]);
  const STATE_RANK = Object.freeze({
    online: 0,
    reachable: 1,
    slow: 2,
    unstable: 3,
    degraded: 4,
    unknown: 5,
    offline: 6,
    "connection-error": 7,
    "account-limited": 8,
    "auth-error": 9,
    "balance-error": 10,
    disabled: 11,
  });

  function getProviderTaskRequirements(input = {}) {
    const references = input.referenceImages ?? input.reference_images ?? input.inputImages ?? input.refs ?? [];
    const intent = Array.isArray(references) && references.length ? "image.edit" : "image.generate";
    return { intent, mustAll: [intent] };
  }

  function isConfiguredCandidate(candidate, options = {}) {
    const capabilities = new Set(Array.isArray(candidate?.capabilities) ? candidate.capabilities : []);
    return Boolean(candidate?.id && candidate.enabled !== false && candidate.hasApiKey !== false && candidate.hasBaseUrl)
      && (capabilities.has("generation") || capabilities.has("image.generate"))
      && (!options.requiresEdit || capabilities.has("edit") || capabilities.has("image.edit"));
  }

  function isHealthyCandidate(candidate, options = {}) {
    return isConfiguredCandidate(candidate, options)
      && !BLOCKED_STATES.has(String(candidate?.state || "unknown"))
      && !["unstable", "degraded"].includes(String(candidate?.state || "unknown"));
  }

  function isEligible(candidate, options = {}) {
    return isConfiguredCandidate(candidate, options);
  }

  function isPreferredImageProvider(candidate) {
    try {
      return new URL(String(candidate?.providerBaseUrl || "")).hostname.toLowerCase() === "api.hyhawang.com";
    } catch {
      return false;
    }
  }

  function normalizeModelName(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[\s_.:/\\-]+/g, "");
    if (normalized === "image2" || normalized === "gptimage2") return "gptimage2";
    return normalized;
  }

  function matchesRequestedModel(candidate, requestedModel) {
    const target = normalizeModelName(requestedModel);
    if (!target) return true;
    return [candidate?.id, candidate?.model, candidate?.family, candidate?.label, candidate?.alias]
      .some((value) => normalizeModelName(value) === target);
  }

  function rankCandidates(candidates, options = {}) {
    const preferredId = String(options.preferredId || "");
    const requestedModel = String(options.requestedModel || options.defaultModelFamily || "").trim();
    return (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => isConfiguredCandidate(candidate, options) && matchesRequestedModel(candidate, requestedModel))
      .map((candidate) => ({ ...candidate }))
      .sort((left, right) => Number(right.id === preferredId) - Number(left.id === preferredId)
        || Number(left.order || 0) - Number(right.order || 0)
        || String(left.id).localeCompare(String(right.id)));
  }

  function shouldReplaceCandidate(current, best) {
    if (!best?.id || String(best.id) === String(current?.id || "")) return false;
    if (!current?.id || !isConfiguredCandidate(current, { requiresEdit: false })) return true;
    return false;
  }

  function normalizeLatency(value) {
    const latency = Number(value);
    return latency > 0 ? latency : Number.MAX_SAFE_INTEGER;
  }

  function selectCandidate(candidates, options = {}) {
    return rankCandidates(candidates, options)[0] || null;
  }

  function selectFallbackCandidate(candidates, options = {}) {
    const excluded = new Set((Array.isArray(options.excludeIds) ? options.excludeIds : [])
      .map((value) => String(value || ""))
      .filter(Boolean));
    return rankCandidates(candidates, options)
      .find((candidate) => !excluded.has(String(candidate.id || ""))) || null;
  }

  function buildCandidateRecords(providers, _monitoring = {}, options = {}) {
    const makeClientId = typeof options.makeClientId === "function"
      ? options.makeClientId
      : (providerId, modelId) => `${providerId}:${modelId}`;
    return (Array.isArray(providers) ? providers : []).flatMap((provider, providerIndex) => {
      const providerId = String(provider?.id || "");
      return (Array.isArray(provider?.models) ? provider.models : []).flatMap((model, modelIndex) => {
        const capabilities = [...new Set(Array.isArray(model?.capabilities) ? model.capabilities.map(String) : [])];
        if (!capabilities.some((capability) => ["generation", "image.generate"].includes(capability))) return [];
        const modelId = String(model?.id || "");
        if (!providerId || !modelId) return [];
        return [{
          id: provider.importedSystem ? modelId : makeClientId(providerId, modelId),
          providerId,
          providerName: String(provider.name || "图片 API"),
          providerBaseUrl: String(provider.baseUrl || "").trim(),
          networkMode: ["auto", "direct", "proxy"].includes(String(provider.networkMode || "").trim().toLowerCase())
            ? String(provider.networkMode).trim().toLowerCase()
            : "auto",
          model: modelId,
          alias: String(model?.alias || ""),
          label: String(model?.alias || modelId),
          enabled: provider.enabled !== false,
          hasApiKey: provider.hasApiKey !== false && (Boolean(provider.hasApiKey) || Boolean(provider.apiKey)),
          hasBaseUrl: Boolean(String(provider.baseUrl || "").trim()),
          capabilities,
          state: "unknown",
          successRate: null,
          consecutiveFailures: 0,
          latencyMs: 0,
          lastImageSuccessAt: "",
          order: providerIndex * 1000 + modelIndex,
        }];
      });
    });
  }

  function getCandidateState(provider, latestSample, latestUsage) {
    if (provider?.enabled === false) return "disabled";
    let state = String(latestSample?.state || "unknown");
    const accountState = String(latestSample?.accountState || "");
    if (accountState === "balance-error" || state === "balance-error") return "balance-error";
    if (accountState === "auth-error" || state === "auth-error") return "account-limited";
    if (latestUsage && !latestUsage.success) {
      if (latestUsage.errorCategory === "balance") return "balance-error";
      if (latestUsage.errorCategory === "auth") return "account-limited";
      if (["server", "network"].includes(latestUsage.errorCategory)
        && !["offline", "connection-error"].includes(state)) state = "unstable";
    }
    return state;
  }

  function countTrailingFailures(events) {
    let count = 0;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.success) break;
      count += 1;
    }
    return count;
  }

  return Object.freeze({
    BLOCKED_STATES,
    getProviderTaskRequirements,
    normalizeModelName,
    matchesRequestedModel,
    isConfiguredCandidate,
    isHealthyCandidate,
    isEligible,
    rankCandidates,
    shouldReplaceCandidate,
    selectCandidate,
    selectFallbackCandidate,
    buildCandidateRecords,
  });
});
