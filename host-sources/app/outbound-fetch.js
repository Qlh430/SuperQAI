const net = require("net");
const dns = require("dns");
const tls = require("tls");
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
const PROXY_PROTOCOLS = new Set(["http:", "https:", "socks5:", "socks5h:"]);
const DEFAULT_PROXY_PROBE_TIMEOUT_MS = 900;
const SOCKET_READ_BUFFERS = new WeakMap();

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
    if (!PROXY_PROTOCOLS.has(parsed.protocol) || !parsed.hostname || !parsed.port) return "";
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
  const httpProxy = normalizeProxyUrl(entries.https || entries.http || entries.proxy || "");
  if (httpProxy) return httpProxy;
  const socksProxy = String(entries.socks || "").trim();
  return socksProxy ? normalizeProxyUrl(`socks5h://${socksProxy.replace(/^[a-z][a-z\d+.-]*:\/\//i, "")}`) : "";
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

function environmentProxyCandidates(env = {}) {
  return [...new Set([
    env.HTTPS_PROXY,
    env.https_proxy,
    env.HTTP_PROXY,
    env.http_proxy,
    env.ALL_PROXY,
    env.all_proxy,
  ]
    .map(normalizeProxyUrl)
    .filter(Boolean))];
}

async function discoverProxyUrl({
  configuredProxyUrl = "auto",
  env = process.env,
  platform = process.platform,
  readSystemProxyImpl = readWindowsSystemProxy,
  isPortOpen = isLoopbackPortOpen,
  commonPorts = DEFAULT_LOCAL_PROXY_PORTS,
  targetUrl = "",
  probeProxy = probeProxyTunnel,
  excludedProxyUrls = [],
} = {}) {
  const configured = String(configuredProxyUrl || "").trim();
  if (configured && configured.toLowerCase() !== "auto") return normalizeProxyUrl(configured);

  const fromEnvironment = await firstUsableProxy(environmentProxyCandidates(env), { targetUrl, probeProxy, excludedProxyUrls });
  if (fromEnvironment) return fromEnvironment;

  if (platform === "win32") {
    const fromSystem = await firstUsableProxy([await readSystemProxyImpl()], { targetUrl, probeProxy, excludedProxyUrls });
    if (fromSystem) return fromSystem;
  }

  const ports = [...new Set(commonPorts.map(Number).filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))];
  const availability = await Promise.all(ports.map((port) => isPortOpen(port)));
  const availablePorts = ports.filter((_, index) => availability[index]);
  const httpProxy = await firstUsableProxy(
    availablePorts.map((port) => `http://127.0.0.1:${port}`),
    { targetUrl, probeProxy, excludedProxyUrls },
  );
  if (httpProxy) return httpProxy;
  return firstUsableProxy(
    availablePorts.map((port) => `socks5h://127.0.0.1:${port}`),
    { targetUrl, probeProxy, excludedProxyUrls },
  );
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

function defaultPortForProtocol(protocol) {
  return protocol === "https:" ? 443 : 80;
}

function createSocketConnection({ host, port, timeoutMs = DEFAULT_PROXY_PROBE_TIMEOUT_MS, signal }) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const socket = net.createConnection({ host, port: Number(port) });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
      if (error) {
        socket.destroy();
        reject(error);
      } else {
        socket.on("error", () => {});
        resolve(socket);
      }
    };
    const onConnect = () => finish();
    const onError = (error) => finish(error);
    const onAbort = () => finish(signal.reason || new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(new Error(`Proxy connection timed out after ${timeoutMs} ms.`)), timeoutMs);
    socket.once("connect", onConnect);
    socket.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function upgradeSocketToTls(socket, { host, timeoutMs = DEFAULT_PROXY_PROBE_TIMEOUT_MS, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      socket.destroy();
      signal.throwIfAborted();
    }
    const secureSocket = tls.connect({
      socket,
      servername: host,
      ALPNProtocols: ["http/1.1"],
    });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      secureSocket.removeListener("secureConnect", onConnect);
      secureSocket.removeListener("error", onError);
      if (error) {
        secureSocket.destroy();
        reject(error);
      } else {
        secureSocket.on("error", () => {});
        resolve(secureSocket);
      }
    };
    const onConnect = () => finish();
    const onError = (error) => finish(error);
    const onAbort = () => finish(signal.reason || new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(new Error(`Proxy TLS negotiation timed out after ${timeoutMs} ms.`)), timeoutMs);
    secureSocket.once("secureConnect", onConnect);
    secureSocket.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function readSocketBytes(socket, size, { timeoutMs = DEFAULT_PROXY_PROBE_TIMEOUT_MS, signal }) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    let buffer = SOCKET_READ_BUFFERS.get(socket) || Buffer.alloc(0);
    SOCKET_READ_BUFFERS.delete(socket);
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("end", onEnd);
      if (error) {
        reject(error);
        return;
      }
      const value = buffer.subarray(0, size);
      const extra = buffer.subarray(size);
      if (extra.length) SOCKET_READ_BUFFERS.set(socket, extra);
      resolve(value);
    };
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (buffer.length >= size) finish();
    };
    const onError = (error) => finish(error);
    const onEnd = () => finish(new Error("Proxy closed the connection during handshake."));
    const onAbort = () => finish(signal.reason || new DOMException("Aborted", "AbortError"));
    timer = setTimeout(() => finish(new Error(`Proxy handshake timed out after ${timeoutMs} ms.`)), timeoutMs);
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (buffer.length >= size) finish();
  });
}

function readSocketHeaders(socket, { timeoutMs = DEFAULT_PROXY_PROBE_TIMEOUT_MS, signal, maxBytes = 16 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let buffer = SOCKET_READ_BUFFERS.get(socket) || Buffer.alloc(0);
    SOCKET_READ_BUFFERS.delete(socket);
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("end", onEnd);
      if (error) {
        reject(error);
        return;
      }
      const headerEnd = buffer.indexOf("\r\n\r\n");
      const value = buffer.subarray(0, headerEnd + 4);
      const extra = buffer.subarray(headerEnd + 4);
      if (extra.length) SOCKET_READ_BUFFERS.set(socket, extra);
      resolve(value);
    };
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (buffer.length > maxBytes) {
        finish(new Error("Proxy response headers are too large."));
      } else if (buffer.indexOf("\r\n\r\n") >= 0) {
        finish();
      }
    };
    const onError = (error) => finish(error);
    const onEnd = () => finish(new Error("Proxy closed the connection during handshake."));
    const onAbort = () => finish(signal.reason || new DOMException("Aborted", "AbortError"));
    timer = setTimeout(() => finish(new Error(`Proxy handshake timed out after ${timeoutMs} ms.`)), timeoutMs);
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (buffer.indexOf("\r\n\r\n") >= 0) finish();
  });
}

function proxyAuthorizationHeader(proxy) {
  if (!proxy.username && !proxy.password) return "";
  const user = decodeURIComponent(proxy.username || "");
  const password = decodeURIComponent(proxy.password || "");
  return `Proxy-Authorization: Basic ${Buffer.from(`${user}:${password}`).toString("base64")}\r\n`;
}

function socksCredentials(proxy) {
  if (!proxy.username && !proxy.password) return null;
  const username = Buffer.from(decodeURIComponent(proxy.username || ""), "utf8");
  const password = Buffer.from(decodeURIComponent(proxy.password || ""), "utf8");
  if (!username.length || username.length > 255 || password.length > 255) {
    throw new Error("SOCKS proxy credentials must be between 1 and 255 bytes.");
  }
  return { username, password };
}

async function getSocksTargetAddress(host, remoteDns) {
  const cleanHost = String(host || "").replace(/^\[|\]$/g, "");
  const version = net.isIP(cleanHost);
  if (remoteDns || !version) {
    const domain = Buffer.from(cleanHost, "utf8");
    if (!domain.length || domain.length > 255) throw new Error("SOCKS target hostname is invalid.");
    return Buffer.concat([Buffer.from([0x03, domain.length]), domain]);
  }
  if (version === 4) {
    return Buffer.concat([Buffer.from([0x01]), Buffer.from(cleanHost.split(".").map(Number))]);
  }
  return Buffer.concat([Buffer.from([0x04]), ipv6ToBuffer(cleanHost)]);
}

function ipv6ToBuffer(value) {
  const [head = "", tail = ""] = String(value || "").split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (!String(value).includes("::") && missing !== 0)) {
    throw new Error("SOCKS target IPv6 address is invalid.");
  }
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  const buffer = Buffer.alloc(16);
  groups.forEach((group, index) => {
    const number = Number.parseInt(group || "0", 16);
    if (!Number.isInteger(number) || number < 0 || number > 0xffff) {
      throw new Error("SOCKS target IPv6 address is invalid.");
    }
    buffer.writeUInt16BE(number, index * 2);
  });
  return buffer;
}

function buildProxyTarget(targetUrl) {
  const target = targetUrl instanceof URL ? targetUrl : new URL(targetUrl);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Proxy checks require an HTTP(S) target.");
  const port = Number(target.port || defaultPortForProtocol(target.protocol));
  const hostname = String(target.hostname || "").replace(/^\[|\]$/g, "");
  if (!hostname || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Proxy check target is invalid.");
  }
  return {
    protocol: target.protocol,
    hostname,
    port,
    authority: `${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`,
  };
}

async function openHttpProxyTunnel(proxyUrl, targetUrl, options = {}) {
  const proxy = new URL(proxyUrl);
  const target = buildProxyTarget(targetUrl);
  let socket = await createSocketConnection({
    host: proxy.hostname,
    port: Number(proxy.port || defaultPortForProtocol(proxy.protocol)),
    ...options,
  });
  try {
    if (proxy.protocol === "https:") {
      socket = await upgradeSocketToTls(socket, { host: proxy.hostname, ...options });
    }
    socket.write(
      `CONNECT ${target.authority} HTTP/1.1\r\n`
      + `Host: ${target.authority}\r\n`
      + "Proxy-Connection: keep-alive\r\n"
      + proxyAuthorizationHeader(proxy)
      + "\r\n",
    );
    const headers = await readSocketHeaders(socket, options);
    const status = Number(String(headers).match(/^HTTP\/\d\.\d\s+(\d{3})\b/i)?.[1] || 0);
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP proxy tunnel was rejected with status ${status || "unknown"}.`);
    }
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function resolveSocks5Target(host, remoteDns, { signal, timeoutMs = DEFAULT_PROXY_PROBE_TIMEOUT_MS } = {}) {
  if (remoteDns || net.isIP(host)) return host;
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    let settled = false;
    const finish = (error, address) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(address);
    };
    const onAbort = () => finish(signal.reason || new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(new Error("SOCKS proxy target DNS lookup timed out.")), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve().then(() => dns.promises.lookup(host)).then(
      (resolved) => finish(null, resolved.address),
      (error) => finish(error),
    );
  });
}

async function openSocks5Tunnel(proxyUrl, targetOptions, options = {}) {
  const proxy = new URL(proxyUrl);
  const target = targetOptions?.hostname
    ? {
      hostname: String(targetOptions.hostname).replace(/^\[|\]$/g, ""),
      port: Number(targetOptions.port || defaultPortForProtocol(targetOptions.protocol)),
    }
    : buildProxyTarget(targetOptions);
  if (!target.hostname || !Number.isInteger(target.port) || target.port <= 0 || target.port > 65535) {
    throw new Error("SOCKS proxy target is invalid.");
  }
  const socket = await createSocketConnection({
    host: proxy.hostname,
    port: Number(proxy.port || 1080),
    ...options,
  });
  try {
    const credentials = socksCredentials(proxy);
    socket.write(Buffer.from(credentials ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));
    const greeting = await readSocketBytes(socket, 2, options);
    if (greeting[0] !== 0x05 || greeting[1] === 0xff) throw new Error("SOCKS proxy does not accept supported authentication.");
    if (greeting[1] === 0x02) {
      if (!credentials) throw new Error("SOCKS proxy requires credentials.");
      socket.write(Buffer.concat([
        Buffer.from([0x01, credentials.username.length]),
        credentials.username,
        Buffer.from([credentials.password.length]),
        credentials.password,
      ]));
      const auth = await readSocketBytes(socket, 2, options);
      if (auth[0] !== 0x01 || auth[1] !== 0x00) throw new Error("SOCKS proxy rejected credentials.");
    } else if (greeting[1] !== 0x00) {
      throw new Error("SOCKS proxy selected an unsupported authentication method.");
    }
    const remoteDns = proxy.protocol === "socks5h:";
    const targetHost = await resolveSocks5Target(target.hostname, remoteDns, options);
    const address = await getSocksTargetAddress(targetHost, remoteDns);
    socket.write(Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00]),
      address,
      Buffer.from([(target.port >> 8) & 0xff, target.port & 0xff]),
    ]));
    const reply = await readSocketBytes(socket, 4, options);
    if (reply[0] !== 0x05 || reply[1] !== 0x00) {
      throw new Error(`SOCKS proxy tunnel was rejected with code ${Number(reply[1] || 0)}.`);
    }
    const addressLength = reply[3] === 0x01 ? 4 : reply[3] === 0x04 ? 16 : reply[3] === 0x03
      ? Number((await readSocketBytes(socket, 1, options))[0])
      : 0;
    if (!addressLength) throw new Error("SOCKS proxy returned an invalid address type.");
    await readSocketBytes(socket, addressLength + 2, options);
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function probeProxyTunnel(proxyUrl, targetUrl, options = {}) {
  if (!targetUrl) return true;
  const normalized = normalizeProxyUrl(proxyUrl);
  if (!normalized) return false;
  try {
    const socket = normalized.startsWith("socks5:")
      || normalized.startsWith("socks5h:")
      ? await openSocks5Tunnel(normalized, targetUrl, options)
      : await openHttpProxyTunnel(normalized, targetUrl, options);
    socket.destroy();
    return true;
  } catch {
    return false;
  }
}

async function firstUsableProxy(candidates, { targetUrl, probeProxy = probeProxyTunnel, excludedProxyUrls = [] } = {}) {
  const excluded = new Set(excludedProxyUrls.map(normalizeProxyUrl).filter(Boolean));
  for (const candidate of candidates.map(normalizeProxyUrl).filter(Boolean)) {
    if (excluded.has(candidate)) continue;
    if (!targetUrl || await probeProxy(candidate, targetUrl)) return candidate;
  }
  return "";
}

function isSocksProxyUrl(value) {
  return /^socks5h?:\/\//i.test(String(value || ""));
}

function createSocksProxyDispatcher(proxyUrl, undici, { connectTimeoutMs = 10_000 } = {}) {
  if (!undici?.Agent) throw new Error("SOCKS5 proxy support requires Undici Agent.");
  return new undici.Agent({
    connect: (options, callback) => {
      let settled = false;
      const controller = new AbortController();
      const timeoutMs = Math.max(1, Number(connectTimeoutMs) || 10_000);
      const timer = setTimeout(() => controller.abort(new Error("SOCKS proxy connection timed out.")), timeoutMs);
      const finish = (error, socket) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // No API bytes can be sent until this connector hands its socket to Undici.
        const failure = error ? Object.assign(new Error("SOCKS proxy connection failed.", { cause: error }), {
          code: "OUTBOUND_PROXY_CONNECT_FAILED",
        }) : null;
        callback(failure, socket);
      };
      const target = {
        hostname: String(options.hostname || options.host || "").replace(/^\[|\]$/g, ""),
        port: Number(options.port || defaultPortForProtocol(options.protocol)),
        protocol: options.protocol,
      };
      const connectionOptions = { signal: controller.signal, timeoutMs };
      openSocks5Tunnel(proxyUrl, target, connectionOptions).then((socket) => (
        options.protocol === "https:"
          ? upgradeSocketToTls(socket, { host: options.servername || target.hostname, ...connectionOptions })
          : socket
      )).then((socket) => finish(null, socket), (error) => finish(error));
    },
  });
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
    maxBytes: Math.max(1, Number(value?.maxBytes) || 64 * 1024 * 1024),
  };
}

async function consumeImageDownloadResponse(response, maxBytes) {
  if (!response?.ok) return response;
  if (!response.body?.getReader && typeof response.arrayBuffer !== "function") return response;
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error(`Image download exceeds ${maxBytes} bytes.`);
  let buffer;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) throw new Error(`Image download exceeds ${maxBytes} bytes.`);
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    buffer = Buffer.concat(chunks, total);
  } else {
    buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(`Image download exceeds ${maxBytes} bytes.`);
  }
  if (typeof Response === "function") {
    return new Response(buffer, {
      status: Number(response.status || 200),
      statusText: String(response.statusText || ""),
      headers: response.headers,
    });
  }
  return { ...response, arrayBuffer: async () => buffer };
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
    "OUTBOUND_PROXY_CONNECT_FAILED",
  ].includes(code))
    || /proxy connect|proxy tunnel|tunnel connection failed/i.test(message)
    || /before secure tls connection was established/i.test(message);
}

function raceReadOnlyRoutes({ requestRoute, primary, alternate, signal, delayMs, isUsableResponse = (response) => Number(response?.status || 200) < 500 }) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const attempts = [primary, alternate].map((route) => ({ route, controller: new AbortController() }));
    let finished = false;
    let timer;
    const discard = (response) => {
      try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
    };
    const finish = (winner, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      for (const attempt of attempts) {
        if (attempt === winner) continue;
        attempt.controller.abort(new DOMException("Another read-only route completed", "AbortError"));
        discard(attempt.response);
      }
      if (winner) resolve(winner.response);
      else reject(error);
    };
    const onAbort = () => finish(null, signal.reason);
    const completeIfExhausted = () => {
      if (attempts.every((attempt) => attempt.settled)) {
        // An HTTP error is still more useful to the caller than a transport error.
        finish(attempts.find((attempt) => attempt.response), attempts[1].error || attempts[0].error);
      }
    };
    const start = (attempt) => {
      if (finished || attempt.started) return;
      attempt.started = true;
      const attemptSignal = signal
        ? AbortSignal.any([signal, attempt.controller.signal])
        : attempt.controller.signal;
      requestRoute(attempt.route, attemptSignal).then((response) => {
        attempt.settled = true;
        attempt.response = response;
        if (finished) return discard(response);
        if (isUsableResponse(response)) return finish(attempt);
        start(attempts[1]);
        completeIfExhausted();
      }, (error) => {
        attempt.settled = true;
        attempt.error = error;
        if (finished) return;
        if (signal?.aborted) return onAbort();
        start(attempts[1]);
        completeIfExhausted();
      });
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => start(attempts[1]), delayMs);
    start(attempts[0]);
  });
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
  now = () => Date.now(),
  proxyCacheTtlMs = 30_000,
  missingProxyCacheTtlMs = 1_000,
  routeHedgeDelayMs = 250,
  imageRouteHedgeDelayMs = 1000,
  proxyConnectTimeoutMs = 10_000,
} = {}) {
  const directFetch = fetchImpl || globalThis.fetch;
  if (typeof directFetch !== "function") throw new TypeError("A fetch implementation is required.");

  const noProxyPatterns = [
    ...DEFAULT_NO_PROXY,
    ...normalizeNoProxyList(noProxy),
  ];
  const automaticProxy = !String(proxyUrl || "").trim() || String(proxyUrl).trim().toLowerCase() === "auto";
  let undici;
  const dispatchers = new Map();
  const proxyResolutions = new Map();
  const rejectedProxiesByTarget = new Map();

  const proxyTargetKey = (targetUrl) => {
    try {
      const target = targetUrl instanceof URL ? targetUrl : new URL(targetUrl);
      return target.origin.toLowerCase();
    } catch {
      return "";
    }
  };

  const rejectedProxyUrls = (targetKey) => {
    const rejected = rejectedProxiesByTarget.get(targetKey);
    if (!rejected) return [];
    const currentTime = Number(now());
    for (const [value, expiresAt] of rejected) {
      if (currentTime >= expiresAt) rejected.delete(value);
    }
    if (!rejected.size) rejectedProxiesByTarget.delete(targetKey);
    return [...rejected.keys()];
  };

  const resolveProxy = (targetUrl, { refresh = false } = {}) => {
    const targetKey = proxyTargetKey(targetUrl);
    let entry = proxyResolutions.get(targetKey);
    if (automaticProxy && (refresh || !entry || Number(now()) >= entry.expiresAt)) {
      proxyResolutions.delete(targetKey);
      entry = undefined;
    }
    if (!entry) {
      entry = { promise: null, expiresAt: Number.POSITIVE_INFINITY };
      proxyResolutions.set(targetKey, entry);
      const resolution = Promise.resolve().then(() => discoverProxy({
        configuredProxyUrl: proxyUrl,
        env,
        platform,
        targetUrl: String(targetUrl || ""),
        excludedProxyUrls: rejectedProxyUrls(targetKey),
      })).then(normalizeProxyUrl).then((value) => {
        const rejected = automaticProxy && value && rejectedProxyUrls(targetKey).includes(value);
        const resolvedValue = rejected ? "" : value;
        if (proxyResolutions.get(targetKey)?.promise === resolution) {
          if (automaticProxy && rejected) {
            // Never retain a discovery result that just failed for this target.
            entry.expiresAt = Number(now());
          } else {
            const ttl = resolvedValue ? proxyCacheTtlMs : missingProxyCacheTtlMs;
            entry.expiresAt = automaticProxy
              ? Number(now()) + Math.max(1, Number(ttl) || 1)
              : Number.POSITIVE_INFINITY;
          }
        }
        return resolvedValue;
      }, (error) => {
        if (proxyResolutions.get(targetKey)?.promise === resolution) proxyResolutions.delete(targetKey);
        throw error;
      });
      entry.promise = resolution;
    }
    return entry.promise;
  };

  const invalidateProxy = (targetUrl, failedProxyUrl) => {
    if (!automaticProxy) return;
    const targetKey = proxyTargetKey(targetUrl);
    const normalized = normalizeProxyUrl(failedProxyUrl);
    if (normalized) {
      const rejected = rejectedProxiesByTarget.get(targetKey) || new Map();
      rejected.set(normalized, Number(now()) + Math.max(1, Number(proxyCacheTtlMs) || 1));
      rejectedProxiesByTarget.set(targetKey, rejected);
    }
    proxyResolutions.delete(targetKey);
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

  const closeProxyDispatcher = (resolvedProxyUrl, dispatcher) => {
    if (!dispatcher) return;
    if (dispatchers.get(resolvedProxyUrl) === dispatcher) dispatchers.delete(resolvedProxyUrl);
    try {
      // Graceful close can wait for unrelated response bodies; fallback must not.
      Promise.resolve(dispatcher?.close?.()).catch(() => {});
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
      method: fetchOptions.method || url?.method,
      configuredProxyUrl: proxyUrl,
    });
    // A failed redirected connection cannot prove the original POST was unsubmitted.
    // Return redirects to the protocol layer instead of silently replaying paid work.
    if (outbound.requestClass === "billable") fetchOptions.redirect = "manual";
    const requestSignal = fetchOptions.signal || url?.signal;
    let resolvedProxyUrl = outbound.mode === "direct" ? "" : await resolveProxy(parsed);
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
      error.submissionState = "not_submitted";
      throw error;
    }

    if (!undici && (!fetchImpl || !createProxyDispatcher || isSocksProxyUrl(resolvedProxyUrl)) && resolvedProxyUrl) undici = loadUndici();
    const activeProxyFetch = fetchImpl || undici?.fetch;
    const createDispatcher = createProxyDispatcher || ((value) => (
      isSocksProxyUrl(value)
        ? createSocksProxyDispatcher(value, undici, { connectTimeoutMs: proxyConnectTimeoutMs })
        : new undici.ProxyAgent(value)
    ));
    const getDispatcher = (value) => {
      let activeDispatcher = dispatchers.get(value);
      if (!activeDispatcher) {
        activeDispatcher = createDispatcher(value);
        dispatchers.set(value, activeDispatcher);
      }
      return activeDispatcher;
    };

    const requestRoute = async (route, signal = requestSignal, { retryAutomaticProxy = true } = {}) => {
      const startedAt = Date.now();
      let dispatcher;
      try {
        signal?.throwIfAborted();
        const routeOptions = signal ? { ...fetchOptions, signal } : fetchOptions;
        if (route === "proxy") dispatcher = getDispatcher(resolvedProxyUrl);
        let response = route === "proxy"
          ? await activeProxyFetch(url, { ...routeOptions, dispatcher })
          : await directFetch(url, routeOptions);
        if (outbound.purpose === "image-download") {
          response = await consumeImageDownloadResponse(response, outbound.maxBytes);
        }
        if (signal?.aborted) {
          try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
          signal.throwIfAborted();
        }
        recordRoute({
          url: parsed,
          route,
          ok: Number(response?.status || 200) < (outbound.purpose === "image-download" ? 400 : 500),
          latencyMs: Date.now() - startedAt,
          stage: outbound.purpose === "image-download" ? "complete" : "first-byte",
        });
        return response;
      } catch (error) {
        if (outbound.requestClass === "billable") {
          error.submissionState = isDefinitelyPreSubmissionFailure(error) ? "not_submitted" : "unknown";
          error.stage = classifyOutboundFailureStage(error);
        }
        if (isAbortFailure(error, signal)) throw error;
        if (route === "proxy") {
          invalidateProxy(parsed, resolvedProxyUrl);
          closeProxyDispatcher(resolvedProxyUrl, dispatcher);
        }
        recordRoute({
          url: parsed,
          route,
          ok: false,
          latencyMs: Date.now() - startedAt,
          stage: classifyOutboundFailureStage(error),
        });
        if (route === "proxy" && automaticProxy && retryAutomaticProxy
          && (outbound.requestClass === "idempotent"
            || (outbound.requestClass === "billable" && isDefinitelyPreSubmissionFailure(error)))) {
          const failedProxyUrl = resolvedProxyUrl;
          const retryProxyUrl = await resolveProxy(parsed, { refresh: true });
          if (retryProxyUrl && retryProxyUrl !== failedProxyUrl) {
            resolvedProxyUrl = retryProxyUrl;
            return requestRoute("proxy", signal, { retryAutomaticProxy: false });
          }
        }
        throw error;
      }
    };

    if (outbound.requestClass === "billable") {
      try {
        return await requestRoute(decision.route);
      } catch (error) {
        if (!isDefinitelyPreSubmissionFailure(error) || isAbortFailure(error, fetchOptions.signal)) throw error;
        if (decision.route === "proxy") {
          const retryProxyUrl = await resolveProxy(parsed, { refresh: true });
          if (retryProxyUrl) {
            resolvedProxyUrl = retryProxyUrl;
            try { return await requestRoute("proxy"); }
            catch (retryError) {
              if (!isDefinitelyPreSubmissionFailure(retryError) || isAbortFailure(retryError, fetchOptions.signal)) throw retryError;
              error = retryError;
            }
          }
        }
        if (!decision.alternate) throw error;
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
        const retryProxyUrl = await resolveProxy(parsed, { refresh: true });
        if (!retryProxyUrl) throw error;
        resolvedProxyUrl = retryProxyUrl;
        return requestRoute("proxy");
      }
    }

    const method = String(fetchOptions.method || url?.method || "GET").toUpperCase();
    if (outbound.requestClass === "idempotent" && ["model-discovery", "image-download"].includes(outbound.purpose)
      && ["GET", "HEAD"].includes(method) && decision.alternate) {
      const isImageDownload = outbound.purpose === "image-download";
      // Image routes finish only after the entire bounded body is received.
      // A stalled body must not use the whole deadline before trying the other route.
      return raceReadOnlyRoutes({
        requestRoute, primary: decision.route, alternate: decision.alternate,
        signal: requestSignal,
        delayMs: isImageDownload
          ? Math.max(1, Number(imageRouteHedgeDelayMs) || 1000)
          : Math.max(1, Number(routeHedgeDelayMs) || 250),
        ...(isImageDownload ? { isUsableResponse: (response) => Number(response?.status || 200) < 400 } : {}),
      });
    }

    try {
      return await requestRoute(decision.route);
    } catch (error) {
      if (!decision.alternate || isAbortFailure(error, fetchOptions.signal)) throw error;
      return requestRoute(decision.alternate);
    }
  };
}

module.exports = {
  DEFAULT_LOCAL_PROXY_PORTS,
  createProxyAwareFetch,
  classifyOutboundFailureStage,
  consumeImageDownloadResponse,
  discoverProxyUrl,
  isLoopbackPortOpen,
  isDefinitelyPreSubmissionFailure,
  normalizeNoProxyList,
  normalizeOutboundRequest,
  normalizeProxyUrl,
  parseWindowsProxyServer,
  probeProxyTunnel,
  readWindowsSystemProxy,
  matchesNoProxy,
};
