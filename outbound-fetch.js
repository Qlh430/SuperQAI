const net = require("net");
const { execFile } = require("child_process");
const { createOutboundRoutePolicy, normalizeRouteMode } = require("./outbound-route-policy");

const DEFAULT_NO_PROXY = [
  "localhost",
  "127.0.0.1",
  "::1",
  ".local",
];

const DEFAULT_LOCAL_PROXY_PORTS = [
  7890,
  7897,
  10809,
  10808,
  1080,
  2080,
  3080,
  8888,
  8080,
];

function normalizeNoProxyList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "auto") return "";
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || !parsed.port) return "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parseWindowsProxyServer(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.includes("=")) return normalizeProxyUrl(raw);
  const entries = Object.fromEntries(
    raw
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        return separator > 0
          ? [entry.slice(0, separator).trim().toLowerCase(), entry.slice(separator + 1).trim()]
          : ["", ""];
      })
      .filter(([key, proxy]) => key && proxy),
  );
  return normalizeProxyUrl(entries.https || entries.http || entries.proxy || "");
}

function readRegistryValue(name) {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        name,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 1500 },
      (error, stdout) => resolve(error ? "" : String(stdout || "")),
    );
  });
}

async function readWindowsSystemProxy() {
  const enabledOutput = await readRegistryValue("ProxyEnable");
  if (!/ProxyEnable\s+REG_DWORD\s+0x1(?:\s|$)/i.test(enabledOutput)) return "";
  const serverOutput = await readRegistryValue("ProxyServer");
  const match = serverOutput.match(/ProxyServer\s+REG_\w+\s+(.+?)\s*$/im);
  return parseWindowsProxyServer(match?.[1] || "");
}

function isLoopbackPortOpen(port, timeoutMs = 180) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function firstEnvironmentProxy(env = {}) {
  return [
    env.HTTPS_PROXY,
    env.https_proxy,
    env.HTTP_PROXY,
    env.http_proxy,
    env.ALL_PROXY,
    env.all_proxy,
  ]
    .map(normalizeProxyUrl)
    .find(Boolean) || "";
}

async function discoverProxyUrl({
  configuredProxyUrl = "auto",
  env = process.env,
  platform = process.platform,
  readSystemProxyImpl = readWindowsSystemProxy,
  isPortOpen = isLoopbackPortOpen,
  commonPorts = DEFAULT_LOCAL_PROXY_PORTS,
} = {}) {
  const configured = String(configuredProxyUrl || "").trim();
  if (configured && configured.toLowerCase() !== "auto") return normalizeProxyUrl(configured);

  const environmentProxy = firstEnvironmentProxy(env);
  if (environmentProxy) return environmentProxy;

  if (platform === "win32") {
    const systemProxy = normalizeProxyUrl(await readSystemProxyImpl());
    if (systemProxy) return systemProxy;
  }

  const ports = [...new Set(commonPorts.map(Number).filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))];
  const availability = await Promise.all(ports.map((port) => isPortOpen(port)));
  const availableIndex = availability.findIndex(Boolean);
  return availableIndex >= 0 ? `http://127.0.0.1:${ports[availableIndex]}` : "";
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function isPrivateHost(hostname) {
  const value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return value === "localhost"
    || value === "::1"
    || value.startsWith("fc")
    || value.startsWith("fd")
    || value.startsWith("fe80:")
    || isPrivateIpv4(value);
}

function matchesNoProxy(hostname, patterns) {
  const host = String(hostname || "").toLowerCase();
  if (isPrivateHost(host)) return true;
  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    const clean = pattern.replace(/^\*\./, ".");
    if (clean.startsWith(".")) return host === clean.slice(1) || host.endsWith(clean);
    return host === clean;
  });
}

function isProxyPreconnectFailure(error) {
  const chain = [];
  const visited = new Set();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = current.cause;
  }
  const codes = chain.map((item) => String(item?.code || "").toUpperCase());
  const message = chain.map((item) => String(item?.message || "")).join(" ");
  return codes.includes("UND_ERR_CONNECT_TIMEOUT")
    || /client network socket disconnected before secure tls connection was established/i.test(message)
    || /socket disconnected before secure tls connection was established/i.test(message);
}

function classifyOutboundFailureStage(error) {
  const chain = [];
  const visited = new Set();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = current.cause;
  }
  const codes = chain.map((item) => String(item?.code || "").toUpperCase());
  const message = chain.map((item) => String(item?.message || "")).join(" ").toLowerCase();
  if (codes.some((code) => ["ENOTFOUND", "EAI_AGAIN"].includes(code))) return "dns";
  if (/proxy|tunnel/.test(message)) return "proxy-connect";
  if (/tls|ssl|certificate|secure socket/.test(message)) return "tls";
  if (codes.some((code) => code.includes("HEADERS_TIMEOUT")) || /first byte|headers timeout/.test(message)) return "first-byte";
  if (codes.some((code) => ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ETIMEDOUT"].includes(code))) return "connect";
  if (codes.some((code) => ["ECONNRESET", "UND_ERR_SOCKET"].includes(code)) || /socket|network|fetch failed/.test(message)) return "interrupted";
  if (/abort/.test(message) || String(error?.name || "").toLowerCase() === "aborterror") return "aborted";
  return "unknown";
}

function normalizeOutboundRequest(value, { method = "GET", configuredProxyUrl = "" } = {}) {
  const provided = value && typeof value === "object";
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  const legacyForcedProxy = !provided
    && Boolean(String(configuredProxyUrl || "").trim())
    && String(configuredProxyUrl || "").trim().toLowerCase() !== "auto";
  const requestClass = String(value?.requestClass || "").trim().toLowerCase();
  return {
    mode: provided ? normalizeRouteMode(value.mode) : legacyForcedProxy ? "proxy" : "auto",
    requestClass: ["idempotent", "billable", "single", "legacy"].includes(requestClass)
      ? requestClass
      : ["GET", "HEAD"].includes(normalizedMethod) ? "idempotent" : legacyForcedProxy ? "legacy" : "single",
    purpose: String(value?.purpose || "").trim().toLowerCase(),
    providerId: String(value?.providerId || "").trim(),
  };
}

function isAbortFailure(error, signal) {
  return Boolean(signal?.aborted)
    || String(error?.name || "").toLowerCase() === "aborterror"
    || /\babort(?:ed)?\b/i.test(String(error?.message || ""));
}

function isDefinitelyPreSubmissionFailure(error) {
  const chain = [];
  const visited = new Set();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = current.cause;
  }
  const codes = chain.map((item) => String(item?.code || "").toUpperCase());
  const message = chain.map((item) => String(item?.message || "")).join(" ");
  return codes.some((code) => [
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "UND_ERR_CONNECT_TIMEOUT",
  ].includes(code))
    || /proxy connect|proxy tunnel|tunnel connection failed/i.test(message)
    || /before secure tls connection was established/i.test(message);
}

function createProxyAwareFetch({
  fetchImpl,
  proxyUrl = "",
  noProxy = "",
  createProxyDispatcher,
  loadUndici = () => require("undici"),
  discoverProxy = discoverProxyUrl,
  env = process.env,
  platform = process.platform,
  routePolicy = createOutboundRoutePolicy(),
  onRouteStateChange = null,
} = {}) {
  const directFetch = fetchImpl || globalThis.fetch;
  if (typeof directFetch !== "function") throw new TypeError("A fetch implementation is required.");

  const noProxyPatterns = [
    ...DEFAULT_NO_PROXY,
    ...normalizeNoProxyList(noProxy),
  ];
  let proxyResolution;
  let undici;
  const dispatchers = new Map();

  const resolveProxy = () => {
    if (!proxyResolution) {
      proxyResolution = Promise.resolve(discoverProxy({
        configuredProxyUrl: proxyUrl,
        env,
        platform,
      })).then(normalizeProxyUrl);
    }
    return proxyResolution;
  };

  const publishRouteState = (snapshot) => {
    if (typeof onRouteStateChange !== "function") return;
    try {
      onRouteStateChange(snapshot);
    } catch {
      // Telemetry persistence must never turn a successful request into a failure.
    }
  };

  const recordRoute = (details) => {
    if (!routePolicy?.record) return;
    publishRouteState(routePolicy.record(details));
  };

  const closeProxyDispatcher = async (resolvedProxyUrl) => {
    const dispatcher = dispatchers.get(resolvedProxyUrl);
    dispatchers.delete(resolvedProxyUrl);
    try {
      await dispatcher?.close?.();
    } catch {
      // A failed proxy tunnel may already be closed.
    }
  };

  return async (url, options = {}) => {
    let parsed;
    try {
      parsed = new URL(typeof url === "string" || url instanceof URL ? url : url.url);
    } catch {
      return directFetch(url, options);
    }
    const fetchOptions = { ...options };
    delete fetchOptions.outbound;
    if (!/^https?:$/.test(parsed.protocol) || matchesNoProxy(parsed.hostname, noProxyPatterns)) {
      return directFetch(url, fetchOptions);
    }

    if (fetchOptions.dispatcher) return directFetch(url, fetchOptions);

    const outbound = normalizeOutboundRequest(options.outbound, {
      method: fetchOptions.method,
      configuredProxyUrl: proxyUrl,
    });
    const resolvedProxyUrl = outbound.mode === "direct" ? "" : await resolveProxy();
    const decision = routePolicy?.choose
      ? routePolicy.choose({
        url: parsed,
        mode: outbound.mode,
        proxyAvailable: Boolean(resolvedProxyUrl),
        requestClass: outbound.requestClass,
      })
      : {
        route: resolvedProxyUrl ? "proxy" : "direct",
        alternate: null,
        reason: "legacy",
      };

    if (decision.route === "unavailable") {
      const error = new Error("代理线路不可用；请求尚未提交到图片接口。");
      error.code = "outbound_proxy_unavailable";
      error.stage = "proxy-connect";
      throw error;
    }

    if (!undici && (!fetchImpl || !createProxyDispatcher) && resolvedProxyUrl) undici = loadUndici();
    const activeProxyFetch = fetchImpl || undici?.fetch;
    const createDispatcher = createProxyDispatcher || ((value) => new undici.ProxyAgent(value));
    const getDispatcher = (value) => {
      let activeDispatcher = dispatchers.get(value);
      if (!activeDispatcher) {
        activeDispatcher = createDispatcher(value);
        dispatchers.set(value, activeDispatcher);
      }
      return activeDispatcher;
    };

    const requestRoute = async (route) => {
      const startedAt = Date.now();
      try {
        const response = route === "proxy"
          ? await activeProxyFetch(url, { ...fetchOptions, dispatcher: getDispatcher(resolvedProxyUrl) })
          : await directFetch(url, fetchOptions);
        recordRoute({ url: parsed, route, ok: true, latencyMs: Date.now() - startedAt, stage: "first-byte" });
        return response;
      } catch (error) {
        recordRoute({
          url: parsed,
          route,
          ok: false,
          latencyMs: Date.now() - startedAt,
          stage: classifyOutboundFailureStage(error),
        });
        throw error;
      }
    };

    if (outbound.requestClass === "billable") {
      try {
        return await requestRoute(decision.route);
      } catch (error) {
        if (!decision.alternate || !isDefinitelyPreSubmissionFailure(error) || isAbortFailure(error, fetchOptions.signal)) throw error;
        if (decision.route === "proxy") await closeProxyDispatcher(resolvedProxyUrl);
        return requestRoute(decision.alternate);
      }
    }

    if (outbound.requestClass === "single") {
      return requestRoute(decision.route);
    }

    if (outbound.requestClass === "legacy") {
      try {
        return await requestRoute(decision.route);
      } catch (error) {
        if (decision.route !== "proxy" || !isProxyPreconnectFailure(error)) throw error;
        await closeProxyDispatcher(resolvedProxyUrl);
        if (String(proxyUrl || "").trim().toLowerCase() === "auto") proxyResolution = undefined;
        const retryProxyUrl = await resolveProxy();
        if (!retryProxyUrl) throw error;
        return requestRoute("proxy");
      }
    }

    try {
      return await requestRoute(decision.route);
    } catch (error) {
      if (!decision.alternate || isAbortFailure(error, fetchOptions.signal)) throw error;
      if (decision.route === "proxy") await closeProxyDispatcher(resolvedProxyUrl);
      return requestRoute(decision.alternate);
    }
  };
}

module.exports = {
  DEFAULT_LOCAL_PROXY_PORTS,
  createProxyAwareFetch,
  classifyOutboundFailureStage,
  discoverProxyUrl,
  isLoopbackPortOpen,
  isDefinitelyPreSubmissionFailure,
  normalizeNoProxyList,
  normalizeOutboundRequest,
  normalizeProxyUrl,
  parseWindowsProxyServer,
  readWindowsSystemProxy,
  matchesNoProxy,
};
