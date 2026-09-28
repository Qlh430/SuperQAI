const assert = require("node:assert/strict");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");
const { createProxyAwareFetch } = require("../outbound-fetch");
const { createOutboundRoutePolicy } = require("../outbound-route-policy");

const proxyUrl = "http://127.0.0.1:7890";
const discovery = { mode: "auto", requestClass: "idempotent", purpose: "model-discovery" };
const connectError = () => Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });

function streamedResponse(signal, text = "models") {
  return new Response(new ReadableStream({
    start(controller) {
      const abort = () => { clearTimeout(timer); controller.error(signal.reason); };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        controller.enqueue(Buffer.from(text));
        controller.close();
      }, 40);
      signal?.addEventListener("abort", abort, { once: true });
    },
  }));
}

test("discovery bounds stalled direct latency, preserves the winning body, and remembers proxy", async () => {
  const policy = createOutboundRoutePolicy();
  const calls = [];
  const fetch = createProxyAwareFetch({
    proxyUrl,
    routePolicy: policy,
    routeHedgeDelayMs: 25,
    createProxyDispatcher: () => ({}),
    fetchImpl: async (_url, options) => {
      calls.push(options);
      if (!options.dispatcher) {
        await delay(1_200, null, { signal: options.signal });
        throw connectError();
      }
      return streamedResponse(options.signal);
    },
  });
  const startedAt = performance.now();
  assert.equal(await (await fetch("https://latency.example/v1/models", { outbound: discovery })).text(), "models");
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 500, `discovery waited ${Math.round(elapsed)} ms for the stalled route`);
  assert.equal(calls[0].signal.aborted, true, "only the losing request is aborted");
  assert.equal(calls[1].signal.aborted, false, "successful body must remain readable");
  assert.equal(policy.snapshot().hosts["https://latency.example:443"].direct, undefined, "loser cancellation is not a network failure");
  calls.length = 0;
  assert.equal(await (await fetch("https://latency.example/v1/models", { outbound: discovery })).text(), "models");
  assert.equal(calls.length, 1, "the remembered fast route needs no duplicate request");
  assert.ok(calls[0].dispatcher);
  console.log(`Stalled direct discovery completed in ${Math.round(elapsed)} ms (direct timeout: 1200 ms).`);
});

test("a proxy 503 does not beat the usable direct response", async () => {
  const policy = createOutboundRoutePolicy();
  const fetch = createProxyAwareFetch({
    proxyUrl, routePolicy: policy, routeHedgeDelayMs: 10,
    createProxyDispatcher: () => ({}),
    fetchImpl: async (_url, options) => {
      if (options.dispatcher) return new Response("proxy unavailable", { status: 503 });
      await delay(60, null, { signal: options.signal });
      return new Response("models");
    },
  });
  assert.equal(await (await fetch("https://status.example/v1/models", { outbound: discovery })).text(), "models");
  assert.equal(policy.snapshot().hosts["https://status.example:443"].proxy?.failures, 1);
});

test("cancellation stops both discovery routes without poisoning route history", async () => {
  const controller = new AbortController();
  const policy = createOutboundRoutePolicy();
  const signals = [];
  const fetch = createProxyAwareFetch({
    proxyUrl, routePolicy: policy, routeHedgeDelayMs: 10,
    createProxyDispatcher: () => ({}),
    fetchImpl: async (_url, options) => {
      signals.push(options.signal);
      if (signals.length === 2) controller.abort(new DOMException("Stopped", "AbortError"));
      await delay(100, null, { signal: options.signal });
      return new Response("models");
    },
  });
  const stop = setTimeout(() => controller.abort(new DOMException("Stopped", "AbortError")), 70);
  try {
    await assert.rejects(fetch("https://cancel.example/models", { outbound: discovery, signal: controller.signal }), { name: "AbortError" });
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal.aborted));
    assert.deepEqual(policy.snapshot().hosts, {});
  } finally { clearTimeout(stop); }
});

test("POST and ordinary GET requests do not hedge", async () => {
  for (const [url, options] of [
    ["https://paid.example/generate", { method: "POST", body: "{}", outbound: { ...discovery, requestClass: "billable" } }],
    ["https://paid.example/generate", { method: "POST", body: "{}", outbound: discovery }],
    [new Request("https://paid.example/generate", { method: "POST", body: "{}" }), { outbound: discovery }],
    ["https://ordinary.example/data", { outbound: { mode: "auto", requestClass: "idempotent" } }],
  ]) {
    let attempts = 0;
    const fetch = createProxyAwareFetch({
      proxyUrl, routeHedgeDelayMs: 5, createProxyDispatcher: () => ({}),
      fetchImpl: async () => { attempts += 1; await delay(35); return new Response("ok"); },
    });
    await fetch(url, options);
    assert.equal(attempts, 1);
  }
});

test("automatic proxy discovery recovers after a cached missing proxy", async () => {
  let now = 1_000;
  let found = "";
  const fetch = createProxyAwareFetch({
    proxyUrl: "auto", now: () => now,
    discoverProxy: async () => found,
    createProxyDispatcher: () => ({}),
    fetchImpl: async () => new Response("ok"),
  });
  const options = { outbound: { ...discovery, mode: "proxy" } };
  await assert.rejects(fetch("https://recovery.example/models", options), { code: "outbound_proxy_unavailable" });
  found = proxyUrl;
  now += 1_001;
  assert.equal((await fetch("https://recovery.example/models", options)).status, 200);
});

test("automatic proxy discovery refreshes a cached address and rejected discovery", async () => {
  let now = 1_000;
  let found = proxyUrl;
  let discoveryError = true;
  const routes = [];
  const fetch = createProxyAwareFetch({
    proxyUrl: "auto", now: () => now,
    discoverProxy: async () => { if (discoveryError) { discoveryError = false; throw new Error("discovery failed"); } return found; },
    createProxyDispatcher: (url) => ({ url }),
    fetchImpl: async (_url, options) => { routes.push(options.dispatcher.url); return new Response("ok"); },
  });
  const options = { outbound: { ...discovery, mode: "proxy" } };
  await assert.rejects(fetch("https://recovery.example/models", options), /discovery failed/);
  await fetch("https://recovery.example/models", options);
  found = "http://127.0.0.1:7897";
  now += 30_001;
  await fetch("https://recovery.example/models", options);
  assert.deepEqual(routes, [proxyUrl, found]);
});

test("failed proxy invalidates discovery and does not block direct fallback on dispatcher close", async () => {
  let found = proxyUrl;
  const routes = [];
  const policy = createOutboundRoutePolicy();
  policy.record({ url: "https://close.example/models", route: "proxy", ok: true, latencyMs: 1 });
  const fetch = createProxyAwareFetch({
    proxyUrl: "auto", routePolicy: policy,
    discoverProxy: async () => found,
    createProxyDispatcher: (url) => ({ url, close: () => new Promise(() => {}) }),
    fetchImpl: async (_url, options) => {
      routes.push(options.dispatcher?.url || "direct");
      if (options.dispatcher?.url === proxyUrl) throw connectError();
      return new Response("ok");
    },
  });
  const request = fetch("https://close.example/models", { outbound: { mode: "auto", requestClass: "idempotent" } });
  let timeout;
  try {
    const response = await Promise.race([request, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("fallback blocked on dispatcher close")), 300); })]);
    assert.equal(response.status, 200);
  } finally { clearTimeout(timeout); }
  found = "http://127.0.0.1:7897";
  await fetch("https://close.example/models", { outbound: { ...discovery, mode: "proxy" } });
  assert.deepEqual(routes, [proxyUrl, "direct", found]);
});

test("a losing transport that finishes late cannot overwrite the winning route history", async () => {
  const policy = createOutboundRoutePolicy();
  const fetch = createProxyAwareFetch({
    proxyUrl, routePolicy: policy, routeHedgeDelayMs: 5,
    createProxyDispatcher: () => ({}),
    fetchImpl: async (_url, options) => {
      if (!options.dispatcher) await delay(60); // Deliberately ignores abort, as a custom transport may.
      return new Response("models");
    },
  });
  assert.equal(await (await fetch("https://late.example/models", { outbound: discovery })).text(), "models");
  await delay(90);
  assert.equal(policy.snapshot().hosts["https://late.example:443"].direct, undefined);
  assert.equal(policy.choose({ url: "https://late.example/models", proxyAvailable: true }).route, "proxy");
});

test("a failed racing proxy tunnel is retired before the next request", async () => {
  let created = 0;
  const policy = createOutboundRoutePolicy();
  policy.record({ url: "https://tunnel.example/models", route: "proxy", ok: true, latencyMs: 1 });
  const fetch = createProxyAwareFetch({
    proxyUrl, routePolicy: policy, routeHedgeDelayMs: 10,
    createProxyDispatcher: () => ({ id: ++created, close: async () => {} }),
    fetchImpl: async (_url, options) => {
      if (options.dispatcher?.id === 1) throw connectError();
      return new Response("models");
    },
  });
  assert.equal((await fetch("https://tunnel.example/models", { outbound: discovery })).status, 200);
  assert.equal((await fetch("https://tunnel.example/models", { outbound: { ...discovery, mode: "proxy" } })).status, 200);
  assert.equal(created, 2);
});

test("discovery returns a readable HTTP error when both routes are unusable", async () => {
  const fetch = createProxyAwareFetch({
    proxyUrl, routeHedgeDelayMs: 10, createProxyDispatcher: () => ({}),
    fetchImpl: async (_url, options) => {
      if (options.dispatcher) throw connectError();
      return new Response("service unavailable", { status: 503 });
    },
  });
  const response = await fetch("https://unavailable.example/models", { outbound: discovery, signal: AbortSignal.timeout(500) });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "service unavailable");
});

test("discovery rejects when both routes fail without starting a third attempt", async () => {
  let attempts = 0;
  const fetch = createProxyAwareFetch({
    proxyUrl, routeHedgeDelayMs: 10, createProxyDispatcher: () => ({}),
    fetchImpl: async () => { attempts += 1; throw connectError(); },
  });
  await assert.rejects(fetch("https://failed.example/models", { outbound: discovery, signal: AbortSignal.timeout(500) }), { code: "UND_ERR_CONNECT_TIMEOUT" });
  assert.equal(attempts, 2);
});
