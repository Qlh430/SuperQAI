const assert = require("node:assert/strict");
const { createProxyAwareFetch } = require("../outbound-fetch");
const { createOutboundRoutePolicy } = require("../outbound-route-policy");

function response(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
  };
}

async function main() {
  const dispatcher = { route: "proxy" };
  const calls = [];
  const snapshots = [];
  const policy = createOutboundRoutePolicy();
  const adaptiveFetch = createProxyAwareFetch({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return response(401);
    },
    proxyUrl: "http://127.0.0.1:7890",
    createProxyDispatcher: () => dispatcher,
    routePolicy: policy,
    onRouteStateChange: (snapshot) => snapshots.push(snapshot),
  });

  await adaptiveFetch("https://api.hyhawang.com/v1/models", {
    outbound: { mode: "direct", requestClass: "idempotent" },
  });
  assert.equal(calls[0].options.dispatcher, undefined);
  assert.equal(calls[0].options.outbound, undefined, "routing metadata must not leak to native fetch");

  await adaptiveFetch("https://new-host.example/v1/models", {
    outbound: { mode: "auto", requestClass: "idempotent" },
  });
  assert.equal(calls[1].options.dispatcher, undefined, "unknown auto hosts should start direct");
  assert.equal(snapshots.length >= 2, true);

  let fallbackAttempts = 0;
  const fallbackFetch = createProxyAwareFetch({
    fetchImpl: async (_url, options = {}) => {
      fallbackAttempts += 1;
      if (!options.dispatcher) throw Object.assign(new Error("direct connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });
      return response(200);
    },
    proxyUrl: "http://127.0.0.1:7890",
    createProxyDispatcher: () => dispatcher,
    routePolicy: createOutboundRoutePolicy(),
  });
  const fallbackResponse = await fallbackFetch("https://overseas.example/image.png", {
    outbound: { mode: "auto", requestClass: "idempotent", purpose: "image-download" },
  });
  assert.equal(fallbackResponse.ok, true);
  assert.equal(fallbackAttempts, 2, "idempotent downloads may switch from direct to proxy");

  let billableAttempts = 0;
  const billableFetch = createProxyAwareFetch({
    fetchImpl: async () => {
      billableAttempts += 1;
      throw Object.assign(new Error("socket closed after submit"), { code: "ECONNRESET" });
    },
    proxyUrl: "http://127.0.0.1:7890",
    createProxyDispatcher: () => dispatcher,
    routePolicy: createOutboundRoutePolicy(),
  });
  await assert.rejects(
    billableFetch("https://paid.example/v1/images/generations", {
      method: "POST",
      body: "{}",
      outbound: { mode: "auto", requestClass: "billable" },
    }),
    /socket closed after submit/,
  );
  assert.equal(billableAttempts, 1, "billable POST must never switch route after dispatch");

  let preSubmitAttempts = 0;
  const preSubmitFetch = createProxyAwareFetch({
    fetchImpl: async (_url, options = {}) => {
      preSubmitAttempts += 1;
      if (!options.dispatcher) {
        throw Object.assign(new Error("connect timed out before a socket was established"), {
          code: "UND_ERR_CONNECT_TIMEOUT",
        });
      }
      return response(200);
    },
    proxyUrl: "http://127.0.0.1:7890",
    createProxyDispatcher: () => dispatcher,
    routePolicy: createOutboundRoutePolicy(),
  });
  assert.equal((await preSubmitFetch("https://paid.example/v1/images/generations", {
    method: "POST",
    body: "{}",
    outbound: { mode: "auto", requestClass: "billable" },
  })).ok, true);
  assert.equal(preSubmitAttempts, 2, "a proven pre-submission connect failure may switch route once");

  let forcedCalls = 0;
  const noProxyFetch = createProxyAwareFetch({
    fetchImpl: async () => {
      forcedCalls += 1;
      return response(200);
    },
    proxyUrl: "auto",
    discoverProxy: async () => "",
    routePolicy: createOutboundRoutePolicy(),
  });
  await assert.rejects(
    noProxyFetch("https://paid.example/v1/images/generations", {
      method: "POST",
      outbound: { mode: "proxy", requestClass: "billable" },
    }),
    (error) => error.code === "outbound_proxy_unavailable",
  );
  assert.equal(forcedCalls, 0);

  console.log("Outbound adaptive fetch checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
