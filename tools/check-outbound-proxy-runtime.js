const assert = require("assert");
const { createProxyAwareFetch } = require("../outbound-fetch");

async function main() {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => {
    calls.push("node-global");
    return { ok: true };
  };
  try {
    const proxyFetch = createProxyAwareFetch({
      proxyUrl: "http://127.0.0.1:7890",
      loadUndici: () => ({
        fetch: async () => {
          calls.push("package-undici");
          return { ok: true };
        },
        ProxyAgent: class ProxyAgent {},
      }),
    });
    await proxyFetch("https://api.apimart.ai/v1/balance");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepStrictEqual(
    calls,
    ["package-undici"],
    "proxy requests must use the same Undici implementation as ProxyAgent",
  );

  const transientCalls = [];
  const createdDispatchers = [];
  let transientAttempt = 0;
  const retryingProxyFetch = createProxyAwareFetch({
    fetchImpl: async (url, options = {}) => {
      transientCalls.push({ url: String(url), dispatcher: options.dispatcher });
      transientAttempt += 1;
      if (transientAttempt === 1) {
        const error = new TypeError("fetch failed");
        error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
        throw error;
      }
      return { ok: true };
    },
    proxyUrl: "http://127.0.0.1:7890",
    createProxyDispatcher: () => {
      const dispatcher = {
        id: createdDispatchers.length + 1,
        close: async () => {},
      };
      createdDispatchers.push(dispatcher);
      return dispatcher;
    },
  });
  await retryingProxyFetch("https://api.apimart.ai/v1/images/generations", {
    method: "POST",
    body: JSON.stringify({ prompt: "grape" }),
  });
  assert.strictEqual(transientCalls.length, 2, "pre-connect proxy failures should retry once");
  assert.strictEqual(createdDispatchers.length, 2, "retry should rebuild the proxy tunnel");
  assert.notStrictEqual(transientCalls[0].dispatcher, transientCalls[1].dispatcher, "retry must use a fresh dispatcher");
  console.log("outbound proxy runtime checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
