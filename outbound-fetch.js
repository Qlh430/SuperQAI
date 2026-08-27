const net = require("net");
const { execFile } = require("child_process");

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

function createProxyAwareFetch({
  fetchImpl,
  proxyUrl = "",
  noProxy = "",
  createProxyDispatcher,
  loadUndici = () => require("undici"),
  discoverProxy = discoverProxyUrl,
  env = process.env,
  platform = process.platform,
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

  return async (url, options = {}) => {
    let parsed;
    try {
      parsed = new URL(typeof url === "string" || url instanceof URL ? url : url.url);
    } catch {
      return directFetch(url, options);
    }
    if (!/^https?:$/.test(parsed.protocol) || matchesNoProxy(parsed.hostname, noProxyPatterns)) {
      return directFetch(url, options);
    }

    const resolvedProxyUrl = await resolveProxy();
    if (!resolvedProxyUrl) return directFetch(url, options);

    if (!undici && (!fetchImpl || !createProxyDispatcher)) undici = loadUndici();
    const activeFetch = fetchImpl || undici.fetch;
    const createDispatcher = createProxyDispatcher || ((value) => new undici.ProxyAgent(value));
    const getDispatcher = (value) => {
      let activeDispatcher = dispatchers.get(value);
      if (!activeDispatcher) {
        activeDispatcher = createDispatcher(value);
        dispatchers.set(value, activeDispatcher);
      }
      return activeDispatcher;
    };
    const requestThroughProxy = (dispatcher) => activeFetch(url, {
      ...options,
      dispatcher: options.dispatcher || dispatcher,
    });
    const dispatcher = getDispatcher(resolvedProxyUrl);
    try {
      return await requestThroughProxy(dispatcher);
    } catch (error) {
      if (options.dispatcher || !isProxyPreconnectFailure(error)) throw error;

      dispatchers.delete(resolvedProxyUrl);
      try {
        await dispatcher?.close?.();
      } catch {
        // A failed proxy tunnel may already be closed.
      }
      if (String(proxyUrl || "").trim().toLowerCase() === "auto") proxyResolution = undefined;
      const retryProxyUrl = await resolveProxy();
      if (!retryProxyUrl) throw error;
      return requestThroughProxy(getDispatcher(retryProxyUrl));
    }
  };
}

module.exports = {
  DEFAULT_LOCAL_PROXY_PORTS,
  createProxyAwareFetch,
  discoverProxyUrl,
  isLoopbackPortOpen,
  normalizeNoProxyList,
  normalizeProxyUrl,
  parseWindowsProxyServer,
  readWindowsSystemProxy,
  matchesNoProxy,
};
