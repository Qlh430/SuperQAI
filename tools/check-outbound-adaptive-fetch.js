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

function imageResponse({ failBody = false } = {}) {
  const bytes = Buffer.from("image-bytes");
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/png", "content-length": String(bytes.length) }),
    arrayBuffer: async () => {
      if (failBody) throw Object.assign(new Error("socket closed while downloading body"), { code: "ECONNRESET" });
      return bytes;
    },
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

  const proxyCandidates = ["http://127.0.0.1:7890", "http://127.0.0.1:7897"];
  const proxyRoutes = [];
  const rotatingPolicy = createOutboundRoutePolicy({ failureThreshold: 1 });
  rotatingPolicy.record({ url: "https://retry-proxy.example/models", route: "direct", ok: false, stage: "connect" });
  const rotatingProxyFetch = createProxyAwareFetch({
    proxyUrl: "auto",
    discoverProxy: async ({ excludedProxyUrls = [] }) => (
      proxyCandidates.find((candidate) => !excludedProxyUrls.includes(candidate)) || ""
    ),
    createProxyDispatcher: (url) => ({ url }),
    fetchImpl: async (_url, options = {}) => {
      proxyRoutes.push(options.dispatcher?.url || "direct");
      if (options.dispatcher?.url === proxyCandidates[0]) {
        throw Object.assign(new Error("first proxy tunnel failed"), { code: "UND_ERR_CONNECT_TIMEOUT" });
      }
      if (!options.dispatcher) {
        throw Object.assign(new Error("direct connection failed"), { code: "UND_ERR_CONNECT_TIMEOUT" });
      }
      return response(200);
    },
    routePolicy: rotatingPolicy,
  });
  assert.equal((await rotatingProxyFetch("https://retry-proxy.example/models", {
    outbound: { mode: "auto", requestClass: "idempotent" },
  })).ok, true);
  assert.deepEqual(
    proxyRoutes,
    proxyCandidates,
    "an automatic proxy failure should discard that candidate and try the next verified proxy before direct fallback",
  );

  const billableProxyRoutes = [];
  const billableProxyFetch = createProxyAwareFetch({
    proxyUrl: "auto",
    discoverProxy: async ({ excludedProxyUrls = [] }) => (
      proxyCandidates.find((candidate) => !excludedProxyUrls.includes(candidate)) || ""
    ),
    createProxyDispatcher: (url) => ({ url }),
    fetchImpl: async (_url, options = {}) => {
      billableProxyRoutes.push(options.dispatcher?.url || "direct");
      if (!options.dispatcher || options.dispatcher.url === proxyCandidates[0]) {
        throw Object.assign(new Error("connection failed before request submission"), { code: "UND_ERR_CONNECT_TIMEOUT" });
      }
      return response(200);
    },
    routePolicy: createOutboundRoutePolicy(),
  });
  assert.equal((await billableProxyFetch("https://paid-retry-proxy.example/v1/images/generations", {
    method: "POST",
    body: "{}",
    outbound: { mode: "auto", requestClass: "billable" },
  })).ok, true);
  assert.deepEqual(
    billableProxyRoutes,
    ["direct", ...proxyCandidates],
    "a billable request may rotate automatic proxies only after a proven pre-submission failure",
  );

  for (const requestClass of ["single", "legacy", "billable"]) {
    const submittedRoutes = [];
    const onceOnlyFetch = createProxyAwareFetch({
      proxyUrl: "auto",
      discoverProxy: async ({ excludedProxyUrls = [] }) => (
        proxyCandidates.find((candidate) => !excludedProxyUrls.includes(candidate)) || ""
      ),
      createProxyDispatcher: (url) => ({ url }),
      fetchImpl: async (_url, options) => {
        submittedRoutes.push(options.dispatcher.url);
        throw Object.assign(new Error("socket closed after sending request"), { code: "ECONNRESET" });
      },
    });
    await assert.rejects(onceOnlyFetch("https://uncertain-submit.example/generate", {
      method: "POST",
      body: "{}",
      outbound: { mode: "proxy", requestClass },
    }), /socket closed after sending request/);
    assert.deepEqual(submittedRoutes, [proxyCandidates[0]], `${requestClass} must not rotate proxies after uncertain submission`);
  }

  let bodyAttempts = 0;
  const bodyFallbackFetch = createProxyAwareFetch({
    fetchImpl: async (_url, options = {}) => {
      bodyAttempts += 1;
      return imageResponse({ failBody: !options.dispatcher });
    },
    proxyUrl: "http://127.0.0.1:7890",
    createProxyDispatcher: () => dispatcher,
    routePolicy: createOutboundRoutePolicy(),
  });
  const bodyFallbackResponse = await bodyFallbackFetch("https://overseas.example/body.png", {
    outbound: { mode: "auto", requestClass: "idempotent", purpose: "image-download", maxBytes: 1024 },
  });
  assert.equal(Buffer.from(await bodyFallbackResponse.arrayBuffer()).toString(), "image-bytes");
  assert.equal(bodyAttempts, 2, "a failed image body download must switch routes, not stop at received headers");

  const circuitPolicy = createOutboundRoutePolicy({ failureThreshold: 2 });
  circuitPolicy.record({ url: "https://circuit.example/image.png", route: "direct", ok: false, stage: "connect" });
  circuitPolicy.record({ url: "https://circuit.example/image.png", route: "direct", ok: false, stage: "connect" });
  assert.equal(
    circuitPolicy.choose({ url: "https://circuit.example/image.png", mode: "auto", proxyAvailable: true }).route,
    "proxy",
    "an open direct-route circuit must probe the unsampled proxy route",
  );

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
