const assert = require("assert");
const {
  createProxyAwareFetch,
  discoverProxyUrl,
  normalizeProxyUrl,
  parseWindowsProxyServer,
} = require("../outbound-fetch");

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
  assert.strictEqual(calls[0].options.dispatcher, dispatcher, "auto-discovered proxy should handle external requests");
  assert.strictEqual(calls[1].options.dispatcher, undefined, "local requests should bypass auto discovery and proxying");

  console.log("outbound proxy auto-discovery checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
