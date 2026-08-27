const assert = require("assert");
const { createProxyAwareFetch, normalizeNoProxyList } = require("../outbound-fetch");

async function main() {
  const calls = [];
  const directFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true };
  };
  const dispatcher = { kind: "proxy" };
  const proxyFetch = createProxyAwareFetch({
    fetchImpl: directFetch,
    proxyUrl: "http://127.0.0.1:7890",
    noProxy: "localhost,127.0.0.1,::1,.local",
    createProxyDispatcher: () => dispatcher,
  });

  await proxyFetch("https://api.apimart.ai/v1/balance");
  assert.strictEqual(calls[0].options.dispatcher, dispatcher, "external HTTPS requests should use the configured proxy");

  await proxyFetch("http://127.0.0.1:8188/prompt");
  assert.strictEqual(calls[1].options.dispatcher, undefined, "loopback requests must bypass the proxy");

  await proxyFetch("http://192.168.1.53:8188/prompt");
  assert.strictEqual(calls[2].options.dispatcher, undefined, "private LAN requests must bypass the proxy");

  await proxyFetch("https://service.local/v1/models");
  assert.strictEqual(calls[3].options.dispatcher, undefined, "NO_PROXY suffixes must bypass the proxy");

  assert.deepStrictEqual(
    normalizeNoProxyList(" localhost, 127.0.0.1 ,, .local "),
    ["localhost", "127.0.0.1", ".local"],
  );

  console.log("outbound proxy checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
