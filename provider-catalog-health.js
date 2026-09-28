"use strict";

const STATE_RANK = Object.freeze({
  online: 0,
  reachable: 1,
  slow: 2,
  unknown: 3,
  unstable: 4,
  degraded: 4,
  "rate-limited": 5,
  "balance-error": 6,
  "account-limited": 6,
  "auth-error": 6,
  offline: 7,
  "connection-error": 7,
  disabled: 8,
});

function rankProviderCatalogState(state) {
  return STATE_RANK[String(state || "unknown").toLowerCase()] ?? STATE_RANK.unknown;
}

function latestByTime(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left?.checkedAt || "") || 0;
    const rightTime = Date.parse(right?.checkedAt || "") || 0;
    return leftTime - rightTime;
  }).at(-1) || null;
}

function summarizeProviderCatalogHealth(provider, history = {}, options = {}) {
  const providerId = String(provider?.id || "");
  const samples = Array.isArray(history?.providers?.[providerId]) ? history.providers[providerId].filter(Boolean) : [];
  const usageKind = ["chat", "agent"].includes(options.kind) ? options.kind : "image";
  const matchingUsage = (Array.isArray(history?.usage?.[providerId]) ? history.usage[providerId] : [])
    .filter((item) => item?.kind === usageKind);
  const latestSample = latestByTime(samples);
  const latestUsage = latestByTime(matchingUsage);
  let state = provider?.enabled === false ? "disabled" : String(latestSample?.state || "unknown");

  if (provider?.enabled !== false && latestSample && ["online", "reachable"].includes(state) && Number(latestSample.latencyMs || 0) >= 4000) {
    state = "slow";
  }
  if (provider?.enabled !== false && latestUsage) {
    if (latestUsage.success) state = Number(latestUsage.latencyMs || 0) >= 4000 ? "slow" : "online";
    else if (latestUsage.errorCategory === "balance") state = "balance-error";
    else if (latestUsage.errorCategory === "auth") state = "account-limited";
    else if (latestUsage.errorCategory === "rate-limit") state = "rate-limited";
    else if (["network", "server"].includes(latestUsage.errorCategory)) state = "unstable";
    else state = "degraded";
  }

  const successfulUsage = matchingUsage.filter((item) => item.success);
  const successRate = matchingUsage.length
    ? Math.round((successfulUsage.length / matchingUsage.length) * 1000) / 10
    : null;
  const latencyMs = Number(latestUsage?.latencyMs || latestSample?.latencyMs || 0) || null;
  return {
    state,
    rank: rankProviderCatalogState(state),
    successRate,
    latencyMs,
    lastUsedAt: String(latestUsage?.checkedAt || ""),
  };
}

module.exports = {
  STATE_RANK,
  rankProviderCatalogState,
  summarizeProviderCatalogHealth,
};
