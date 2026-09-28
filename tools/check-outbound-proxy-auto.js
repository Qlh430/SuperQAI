const assert = require("assert");
const http = require("node:http");
const net = require("node:net");
const dns = require("node:dns");
const {
  createProxyAwareFetch,
  discoverProxyUrl,
  normalizeProxyUrl,
  parseWindowsProxyServer,
  probeProxyTunnel,
} = require("../outbound-fetch");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(Number(server.address().port));
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function createSocks5Server({ tunnelPort = 0, rejectTunnel = false } = {}) {
  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let stage = "greeting";
    const consume = (size) => {
      const value = buffer.subarray(0, size);
      buffer = buffer.subarray(size);
      return value;
    };
    const parse = () => {
      while (true) {
        if (stage === "greeting") {
          if (buffer.length < 2) return;
          const methodsLength = Number(buffer[1]);
          if (buffer.length < methodsLength + 2 || buffer[0] !== 0x05) {
            if (buffer[0] !== 0x05) socket.destroy();
            return;
          }
          consume(methodsLength + 2);
          socket.write(Buffer.from([0x05, 0x00]));
          stage = "request";
        }
        if (stage === "request") {
          if (buffer.length < 4) return;
          const addressType = Number(buffer[3]);
          const addressLength = addressType === 0x01 ? 4 : addressType === 0x04 ? 16 : addressType === 0x03
            ? Number(buffer[4]) + 1
            : 0;
          const requestLength = 4 + addressLength + 2;
          if (!addressLength || buffer.length < requestLength) return;
          consume(requestLength);
          if (rejectTunnel) {
            socket.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
            return;
          }
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
          stage = "tunnel";
          if (!tunnelPort) return;
          const upstream = net.createConnection({ host: "127.0.0.1", port: tunnelPort });
          upstream.once("connect", () => {
            socket.removeListener("data", onData);
            if (buffer.length) upstream.write(buffer);
            socket.pipe(upstream).pipe(socket);
          });
          upstream.once("error", () => socket.destroy());
          return;
        }
        return;
      }
    };
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      parse();
    };
    socket.on("data", onData);
  });
}

async function main() {
  assert.strictEqual(
    normalizeProxyUrl("127.0.0.1:7890"),
    "http://127.0.0.1:7890",
    "host:port proxy values should be normalized",
  );
  assert.strictEqual(
    parseWindowsProxyServer("http=127.0.0.1:8080;https=127.0.0.1:10809"),
    "http://127.0.0.1:10809",
    "Windows per-protocol proxy settings should prefer the HTTPS proxy",
  );

  const explicit = await discoverProxyUrl({
    configuredProxyUrl: "http://10.0.0.5:3128",
    env: { HTTPS_PROXY: "http://127.0.0.1:9999" },
    platform: "win32",
    readSystemProxyImpl: async () => "http://127.0.0.1:7890",
    isPortOpen: async () => true,
  });
  assert.strictEqual(explicit, "http://10.0.0.5:3128", "explicit configuration should win");

  const fromEnv = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: { HTTPS_PROXY: "127.0.0.1:7897" },
    platform: "win32",
    readSystemProxyImpl: async () => "http://127.0.0.1:7890",
    isPortOpen: async () => true,
  });
  assert.strictEqual(fromEnv, "http://127.0.0.1:7897", "standard proxy environment variables should be reused");

  const fromSystem = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: {},
    platform: "win32",
    readSystemProxyImpl: async () => "127.0.0.1:10809",
    isPortOpen: async () => true,
  });
  assert.strictEqual(fromSystem, "http://127.0.0.1:10809", "Windows system proxy should be reused");

  const fromPortScan = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: {},
    platform: "win32",
    readSystemProxyImpl: async () => "",
    commonPorts: [7890, 7897, 10809],
    isPortOpen: async (port) => port === 10809,
  });
  assert.strictEqual(fromPortScan, "http://127.0.0.1:10809", "a listening common local proxy port should be discovered");

  const probeCalls = [];
  const skipsWrongProtocol = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: {},
    platform: "win32",
    readSystemProxyImpl: async () => "",
    commonPorts: [1080, 7890, 7897],
    targetUrl: "https://api.example.com/v1/models",
    isPortOpen: async () => true,
    probeProxy: async (proxyUrl, targetUrl) => {
      probeCalls.push({ proxyUrl, targetUrl });
      return proxyUrl.endsWith(":7897");
    },
  });
  assert.strictEqual(
    skipsWrongProtocol,
    "http://127.0.0.1:7897",
    "auto discovery should skip open ports that fail the HTTP proxy handshake",
  );
  assert.deepStrictEqual(
    probeCalls.map((entry) => entry.proxyUrl),
    ["http://127.0.0.1:1080", "http://127.0.0.1:7890", "http://127.0.0.1:7897"],
    "candidate ports should be validated in order until a usable proxy is found",
  );

  const invalidEnvironmentProxy = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: { HTTPS_PROXY: "127.0.0.1:1080" },
    platform: "linux",
    targetUrl: "https://api.example.com/v1/models",
    probeProxy: async () => false,
    commonPorts: [],
  });
  assert.strictEqual(
    invalidEnvironmentProxy,
    "",
    "an environment proxy that cannot establish a target tunnel should not be selected",
  );

  const fallbackEnvironmentProxy = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: {
      HTTPS_PROXY: "http://127.0.0.1:1080",
      ALL_PROXY: "socks5h://127.0.0.1:1081",
    },
    platform: "linux",
    targetUrl: "https://api.example.com/v1/models",
    commonPorts: [],
    probeProxy: async (proxyUrl) => proxyUrl === "socks5h://127.0.0.1:1081",
  });
  assert.strictEqual(
    fallbackEnvironmentProxy,
    "socks5h://127.0.0.1:1081",
    "a stale environment proxy must not prevent the next configured proxy from being selected",
  );

  const target = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("through socks");
  });
  const targetPort = await listen(target);
  const socksProxy = createSocks5Server({ tunnelPort: targetPort });
  const socksPort = await listen(socksProxy);
  try {
    const socksUrl = `socks5h://127.0.0.1:${socksPort}`;
    assert.strictEqual(
      await probeProxyTunnel(socksUrl, "https://api.example.com/v1/models"),
      true,
      "the SOCKS5 handshake should establish a target tunnel",
    );
    const socksDiscovery = await discoverProxyUrl({
      configuredProxyUrl: "auto",
      env: {},
      platform: "linux",
      commonPorts: [socksPort],
      targetUrl: "https://api.example.com/v1/models",
    });
    assert.strictEqual(
      socksDiscovery,
      socksUrl,
      "a SOCKS5 listener should be identified as SOCKS, not used as an HTTP proxy",
    );
    const socksFetch = createProxyAwareFetch({
      proxyUrl: socksDiscovery,
    });
    const response = await socksFetch(`http://socks-target.test:${targetPort}/health`, {
      outbound: { mode: "proxy", requestClass: "idempotent" },
    });
    assert.strictEqual(await response.text(), "through socks", "SOCKS5 discovery must create a working dispatcher");
  } finally {
    await close(socksProxy);
    await close(target);
  }

  let submittedPosts = 0;
  const redirectTarget = http.createServer((request, response) => {
    if (request.method === "POST") submittedPosts++;
    response.writeHead(307, { location: "/redirected" });
    response.end();
  });
  const redirectPort = await listen(redirectTarget);
  const redirectProxy = createSocks5Server({ tunnelPort: redirectPort });
  const redirectProxyPort = await listen(redirectProxy);
  try {
    const redirectFetch = createProxyAwareFetch({ proxyUrl: `socks5h://127.0.0.1:${redirectProxyPort}` });
    const result = await redirectFetch(`http://socks-target.test:${redirectPort}/generate`, {
      method: "POST",
      body: "{}",
      outbound: { mode: "proxy", requestClass: "billable" },
    });
    assert.equal(result.status, 307, "billable redirects must be returned without resending the POST");
    await result.text();
    assert.equal(submittedPosts, 1, "a redirected billable request must be sent exactly once");
  } finally {
    await close(redirectProxy);
    await close(redirectTarget);
  }

  const dnsProxy = createSocks5Server();
  const dnsSockets = new Set();
  dnsProxy.on("connection", (socket) => {
    dnsSockets.add(socket);
    socket.on("close", () => dnsSockets.delete(socket));
  });
  const dnsProxyPort = await listen(dnsProxy);
  const originalLookup = dns.promises.lookup;
  let lookupStarted = false;
  let dnsWatchdog;
  try {
    dns.promises.lookup = async () => { lookupStarted = true; return new Promise(() => {}); };
    const dnsProbe = probeProxyTunnel(`socks5://127.0.0.1:${dnsProxyPort}`, "https://dns-target.test", { timeoutMs: 40 });
    assert.equal(await Promise.race([
      dnsProbe,
      new Promise((_, reject) => {
        dnsWatchdog = setTimeout(() => reject(new Error("local SOCKS DNS lookup exceeded the proxy probe deadline")), 500);
      }),
    ]), false);
    assert.equal(lookupStarted, true, "the test must cover local DNS rather than remote SOCKS DNS");
  } finally {
    dns.promises.lookup = originalLookup;
    clearTimeout(dnsWatchdog);
    for (const socket of dnsSockets) socket.destroy();
    await close(dnsProxy);
  }

  for (const rejectTunnel of [true, false]) {
    const failingProxy = createSocks5Server({ rejectTunnel });
    const activeSockets = new Set();
    failingProxy.on("connection", (socket) => {
      activeSockets.add(socket);
      socket.on("close", () => activeSockets.delete(socket));
    });
    const failingPort = await listen(failingProxy);
    let watchdog;
    try {
      const failingFetch = createProxyAwareFetch({
        proxyUrl: `socks5h://127.0.0.1:${failingPort}`,
        proxyConnectTimeoutMs: 50,
      });
      const result = failingFetch("https://socks-target.test/generate", {
        method: "POST",
        body: "{}",
        outbound: { mode: "proxy", requestClass: "billable" },
      });
      await assert.rejects(Promise.race([
        result,
        new Promise((_, reject) => {
          watchdog = setTimeout(() => reject(new Error("SOCKS TLS connection exceeded its connection deadline")), 600);
        }),
      ]), (error) => {
        assert.equal(error.submissionState, "not_submitted",
          "SOCKS negotiation rejection and a stalled TLS handshake both happen before API submission");
        return true;
      });
    } finally {
      clearTimeout(watchdog);
      for (const socket of activeSockets) socket.destroy();
      await close(failingProxy);
    }
  }

  const noProxy = await discoverProxyUrl({
    configuredProxyUrl: "auto",
    env: {},
    platform: "linux",
    commonPorts: [7890],
    isPortOpen: async () => false,
  });
  assert.strictEqual(noProxy, "", "auto mode should fall back to a direct connection");

  const calls = [];
  const dispatcher = { kind: "auto-proxy" };
  const autoFetch = createProxyAwareFetch({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return { ok: true };
    },
    proxyUrl: "auto",
    discoverProxy: async () => "http://127.0.0.1:7897",
    createProxyDispatcher: () => dispatcher,
  });
  await autoFetch("https://api.apimart.ai/v1/models");
  await autoFetch("http://127.0.0.1:3099/api/models");
  await autoFetch("https://api.apimart.ai/v1/models", {
    outbound: { mode: "proxy", requestClass: "idempotent" },
  });
  assert.strictEqual(calls[0].options.dispatcher, undefined, "auto mode should start unknown external hosts through direct access");
  assert.strictEqual(calls[1].options.dispatcher, undefined, "local requests should bypass auto discovery and proxying");
  assert.strictEqual(calls[2].options.dispatcher, dispatcher, "forced proxy mode should use the auto-discovered proxy");

  console.log("outbound proxy auto-discovery checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
