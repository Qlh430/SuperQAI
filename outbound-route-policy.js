const ROUTE_MODES = new Set(["auto", "direct", "proxy"]);
const ROUTES = ["direct", "proxy"];
const ROUTE_KEY_PATTERN = /^https?:\/\/[^/?#]+:\d+$/i;

function normalizeRouteMode(value, baseUrl = "") {
  const mode = String(value || "").trim().toLowerCase();
  if (ROUTE_MODES.has(mode)) return mode;
  try {
    if (new URL(baseUrl).hostname.toLowerCase() === "api.hyhawang.com") return "direct";
  } catch {
    // An incomplete provider URL keeps the general automatic default.
  }
  return "auto";
}

function getRouteKey(value) {
  const url = value instanceof URL ? value : new URL(value);
  const protocol = String(url.protocol || "").toLowerCase();
  if (!["http:", "https:"].includes(protocol)) throw new TypeError("Only HTTP(S) routes are supported.");
  const port = url.port || (protocol === "https:" ? "443" : "80");
  return `${protocol}//${url.hostname.toLowerCase()}:${port}`;
}

function sanitizeRouteState(value) {
  const hosts = {};
  for (const [key, entry] of Object.entries(value?.hosts || {})) {
    if (!ROUTE_KEY_PATTERN.test(key) || !entry || typeof entry !== "object") continue;
    const normalized = {};
    for (const route of ROUTES) {
      if (!entry[route] || typeof entry[route] !== "object") continue;
      normalized[route] = sanitizeSample(entry[route]);
    }
    if (ROUTES.includes(entry.preferred) && normalized[entry.preferred]) {
      normalized.preferred = entry.preferred;
    }
    hosts[key.toLowerCase()] = normalized;
  }
  return { version: 1, hosts };
}

function sanitizeSample(value) {
  return {
    successes: toNonNegativeNumber(value.successes),
    failures: toNonNegativeNumber(value.failures),
    consecutiveFailures: toNonNegativeNumber(value.consecutiveFailures),
    latencyMs: toNonNegativeNumber(value.latencyMs),
    lastStage: String(value.lastStage || "unknown").slice(0, 40),
    updatedAt: toNonNegativeNumber(value.updatedAt),
  };
}

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function updateSample(previous = {}, sample = {}) {
  const current = sanitizeSample(previous);
  const latency = toNonNegativeNumber(sample.latencyMs);
  return {
    successes: current.successes + Number(Boolean(sample.ok)),
    failures: current.failures + Number(!sample.ok),
    consecutiveFailures: sample.ok ? 0 : current.consecutiveFailures + 1,
    latencyMs: latency
      ? Math.round(current.latencyMs ? current.latencyMs * 0.7 + latency * 0.3 : latency)
      : current.latencyMs,
    lastStage: String(sample.stage || "unknown").slice(0, 40),
    updatedAt: toNonNegativeNumber(sample.at),
  };
}

function routeScore(sample, failureThreshold) {
  if (!sample || sample.consecutiveFailures >= failureThreshold) return Number.POSITIVE_INFINITY;
  const total = sample.successes + sample.failures;
  const failureRate = total ? sample.failures / total : 1;
  const latency = sample.latencyMs || 60_000;
  return sample.consecutiveFailures * 1_000_000 + failureRate * 100_000 + latency;
}

function pickPreferred(host, failureThreshold) {
  return ROUTES
    .filter((route) => host[route])
    .filter((route) => Number.isFinite(routeScore(host[route], failureThreshold)))
    .sort((left, right) => routeScore(host[left], failureThreshold) - routeScore(host[right], failureThreshold))[0] || "";
}

function bestHealthyRoute(host, currentTime, ttlMs, proxyAvailable, failureThreshold) {
  const preferred = String(host?.preferred || "");
  if (!ROUTES.includes(preferred) || (preferred === "proxy" && !proxyAvailable)) return "";
  const sample = host[preferred];
  if (!sample || sample.consecutiveFailures >= failureThreshold) return "";
  // Keep a last-known successful route through idle periods. Read-only discovery
  // can probe an alternative if it becomes slow; TTL should expire failures,
  // rather than repeatedly send new requests back to a known blocked route.
  return currentTime - Number(sample.updatedAt || 0) <= ttlMs
    || (sample.successes > 0 && sample.consecutiveFailures === 0) ? preferred : "";
}

function createOutboundRoutePolicy({
  now = () => Date.now(),
  ttlMs = 5 * 60_000,
  failureThreshold = 2,
  initialState,
} = {}) {
  let state = sanitizeRouteState(initialState);
  const effectiveTtlMs = Math.max(1, Number(ttlMs || 0));
  const effectiveFailureThreshold = Math.max(1, Number(failureThreshold || 0));

  function choose({ url, mode = "auto", proxyAvailable = false } = {}) {
    const normalizedMode = normalizeRouteMode(mode);
    if (normalizedMode === "direct") return { route: "direct", alternate: null, reason: "forced" };
    if (normalizedMode === "proxy") {
      return proxyAvailable
        ? { route: "proxy", alternate: null, reason: "forced" }
        : { route: "unavailable", alternate: null, reason: "forced" };
    }

    const host = state.hosts[getRouteKey(url)] || {};
    const currentTime = Number(now());
    let preferred = bestHealthyRoute(
      host,
      currentTime,
      effectiveTtlMs,
      Boolean(proxyAvailable),
      effectiveFailureThreshold,
    );
    if (!preferred) {
      const isOpen = (sample) => Number(sample?.consecutiveFailures || 0) >= effectiveFailureThreshold
        && currentTime - Number(sample?.updatedAt || 0) <= effectiveTtlMs;
      const directOpen = isOpen(host.direct);
      const proxyOpen = isOpen(host.proxy);
      preferred = directOpen && proxyAvailable && !proxyOpen ? "proxy" : "direct";
    }
    return {
      route: preferred,
      alternate: proxyAvailable ? (preferred === "direct" ? "proxy" : "direct") : null,
      reason: host.preferred && preferred === host.preferred ? "history" : "default",
    };
  }

  function record({ url, route, ok, latencyMs = 0, stage = "unknown" } = {}) {
    if (!ROUTES.includes(route)) return snapshot();
    const key = getRouteKey(url);
    const host = state.hosts[key] ||= {};
    host[route] = updateSample(host[route], {
      ok: Boolean(ok),
      latencyMs,
      stage,
      at: Number(now()),
    });
    const preferred = pickPreferred(host, effectiveFailureThreshold);
    if (preferred) host.preferred = preferred;
    else delete host.preferred;
    return snapshot();
  }

  function snapshot() {
    return sanitizeRouteState(state);
  }

  function resetRuntime() {
    state = { version: 1, hosts: {} };
    return snapshot();
  }

  return Object.freeze({ choose, record, snapshot, resetRuntime });
}

module.exports = {
  ROUTE_MODES,
  createOutboundRoutePolicy,
  getRouteKey,
  normalizeRouteMode,
  sanitizeRouteState,
};
