"use strict";

const { summarizeProviderCatalogHealth } = require("./provider-catalog-health");

const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_TTL_MS = 2_000;
const DEFAULT_MAX_SAMPLES = 9_000;
const DEFAULT_MAX_USAGE_EVENTS = 12_000;

function normalizeRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeHistory(value) {
  const source = normalizeRecord(value);
  return {
    ...source,
    providers: normalizeRecord(source.providers),
    usage: normalizeRecord(source.usage),
  };
}

function classifyProviderUsageError(message, httpStatus = 0) {
  const value = String(message || "").toLowerCase();
  if (/insufficient|balance|quota|credit|billing|\u4f59\u989d|\u989d\u5ea6|\u6b20\u8d39/.test(value)) return "balance";
  if (httpStatus === 401 || httpStatus === 403 || /upstream_auth|authentication|authorization|unauthorized|forbidden|invalid.*key|\u9274\u6743/.test(value)) return "auth";
  if (httpStatus === 429 || /rate.?limit|too many requests/.test(value)) return "rate-limit";
  if (httpStatus >= 500) return "server";
  if (!httpStatus || /timeout|network|fetch failed|connect/.test(value)) return "network";
  return "request";
}

function summarizeProviderUsageCapability(events) {
  const items = Array.isArray(events) ? events.filter(Boolean) : [];
  const latest = items.at(-1);
  if (!latest) return { state: "untested", kind: "", checkedAt: "", message: "" };
  if (latest.success) {
    return {
      state: "verified",
      kind: String(latest.kind || ""),
      checkedAt: String(latest.checkedAt || ""),
      message: "",
    };
  }
  const stateMap = {
    balance: "balance-error",
    auth: "auth-error",
    "rate-limit": "rate-limited",
    network: "unstable",
    server: "unstable",
    request: "rejected",
  };
  return {
    state: stateMap[latest.errorCategory] || "failed",
    kind: String(latest.kind || ""),
    checkedAt: String(latest.checkedAt || ""),
    message: String(latest.message || ""),
  };
}

function createProviderTelemetryService({
  filePath,
  fs,
  providerStore,
  retentionMs = DEFAULT_RETENTION_MS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxSamples = DEFAULT_MAX_SAMPLES,
  maxUsageEvents = DEFAULT_MAX_USAGE_EVENTS,
  now = Date.now,
} = {}) {
  if (!String(filePath || "").trim()) throw new TypeError("Provider telemetry service requires filePath.");
  if (!fs || typeof fs.existsSync !== "function" || typeof fs.readFileSync !== "function" || typeof fs.writeFileSync !== "function") {
    throw new TypeError("Provider telemetry service requires a filesystem implementation.");
  }
  if (!providerStore || typeof providerStore.listInternal !== "function") {
    throw new TypeError("Provider telemetry service requires a compatible Provider Store.");
  }

  let healthCache = { expiresAt: 0, byProviderId: new Map(), agentByProviderId: new Map() };

  function invalidateHealthCache() {
    healthCache = { expiresAt: 0, byProviderId: new Map(), agentByProviderId: new Map() };
  }

  function readHistory() {
    try {
      if (!fs.existsSync(filePath)) return normalizeHistory({});
      return normalizeHistory(JSON.parse(fs.readFileSync(filePath, "utf8") || "{}"));
    } catch {
      return normalizeHistory({});
    }
  }

  function writeHistory(value) {
    fs.writeFileSync(filePath, JSON.stringify(normalizeHistory(value), null, 2));
    invalidateHealthCache();
  }

  function recordMonitoringSample(provider, status, checkedAt = new Date(now()).toISOString()) {
    if (!provider?.id || !status?.state) return null;
    const history = readHistory();
    const cutoff = now() - Math.max(0, Number(retentionMs) || DEFAULT_RETENTION_MS);
    const items = Array.isArray(history.providers[provider.id]) ? history.providers[provider.id] : [];
    const item = {
      providerId: provider.id,
      name: String(provider.name || provider.baseUrl || "API"),
      baseUrl: String(provider.baseUrl || "").replace(/\/+$/, ""),
      state: String(status.state),
      platformState: String(status.platformState || status.state || ""),
      balanceState: String(status.balanceState || ""),
      message: String(status.message || "").slice(0, 240),
      accountState: String(status.accountState || ""),
      latencyMs: Math.max(0, Number(status.latencyMs || 0)),
      httpStatus: Math.max(0, Number(status.httpStatus || 0)),
      checkedAt,
    };
    history.providers[provider.id] = items
      .filter((entry) => {
        const time = Date.parse(entry?.checkedAt || "");
        return Number.isFinite(time) && time >= cutoff;
      })
      .concat(item)
      .slice(-Math.max(1, Number(maxSamples) || DEFAULT_MAX_SAMPLES));
    writeHistory(history);
    return item;
  }

  function recordUsageEvent(provider, event) {
    if (!provider?.id || !event?.kind) return null;
    const history = readHistory();
    const checkedAt = event.checkedAt || new Date(now()).toISOString();
    const cutoff = now() - Math.max(0, Number(retentionMs) || DEFAULT_RETENTION_MS);
    const items = Array.isArray(history.usage[provider.id]) ? history.usage[provider.id] : [];
    const item = {
      providerId: provider.id,
      kind: ["image", "agent"].includes(event.kind) ? event.kind : "chat",
      model: String(event.model || ""),
      success: Boolean(event.success),
      latencyMs: Math.max(0, Number(event.latencyMs || 0)),
      httpStatus: Math.max(0, Number(event.httpStatus || 0)),
      errorCategory: event.success ? "" : classifyProviderUsageError(event.message, event.httpStatus),
      message: event.success ? "" : String(event.message || "").slice(0, 240),
      checkedAt,
    };
    history.usage[provider.id] = items
      .filter((entry) => {
        const time = Date.parse(entry?.checkedAt || "");
        return Number.isFinite(time) && time >= cutoff;
      })
      .concat(item)
      .slice(-Math.max(1, Number(maxUsageEvents) || DEFAULT_MAX_USAGE_EVENTS));
    writeHistory(history);
    return item;
  }

  function getUsageCapability(providerId) {
    const history = readHistory();
    return summarizeProviderUsageCapability(history.usage[String(providerId || "")] || []);
  }

  function getHealthSnapshot(kind = "image") {
    const at = now();
    if (healthCache.expiresAt <= at) {
      const history = readHistory();
      const providers = providerStore.listInternal();
      const byProviderId = new Map(providers.map((provider) => [provider.id, summarizeProviderCatalogHealth(provider, history)]));
      const agentByProviderId = new Map(providers.map((provider) => [
        provider.id,
        summarizeProviderCatalogHealth(provider, history, { kind: "agent" }),
      ]));
      healthCache = {
        expiresAt: at + Math.max(0, Number(cacheTtlMs) || DEFAULT_CACHE_TTL_MS),
        byProviderId,
        agentByProviderId,
      };
    }
    return kind === "agent" ? healthCache.agentByProviderId : healthCache.byProviderId;
  }

  function getCandidateHealth({ provider, intent } = {}) {
    const value = String(intent || "");
    if (!["image.generate", "image.edit", "llm.tools"].includes(value)) return null;
    const kind = value === "llm.tools" ? "agent" : "image";
    return getHealthSnapshot(kind).get(provider?.id)
      || summarizeProviderCatalogHealth(provider, { providers: {}, usage: {} }, { kind });
  }

  function start() {
    readHistory();
  }

  return Object.freeze({
    start,
    readHistory,
    classifyUsageError: classifyProviderUsageError,
    summarizeUsageCapability: summarizeProviderUsageCapability,
    recordMonitoringSample,
    recordUsageEvent,
    getUsageCapability,
    getHealthSnapshot,
    getCandidateHealth,
    invalidateHealthCache,
  });
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_MAX_SAMPLES,
  DEFAULT_MAX_USAGE_EVENTS,
  DEFAULT_RETENTION_MS,
  classifyProviderUsageError,
  summarizeProviderUsageCapability,
  createProviderTelemetryService,
};
