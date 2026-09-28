"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProxyAwareFetch } = require("../outbound-fetch");
const { createImageSyncService } = require("../image-sync-service");
const { createOutboundRoutePolicy } = require("../outbound-route-policy");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");
const outbound = { mode: "auto", requestClass: "idempotent", purpose: "image-download", maxBytes: 1024 };
const base = { proxyUrl: "http://127.0.0.1:7890", createProxyDispatcher: () => ({}), imageRouteHedgeDelayMs: 10 };

test("a stalled image body uses the other route before the overall deadline", async () => {
  const policy = createOutboundRoutePolicy();
  const attempts = [];
  const fetch = createProxyAwareFetch({ ...base, routePolicy: policy,
    fetchImpl: async (_url, options) => {
      attempts.push(options);
      return new Response(new ReadableStream({
        start(controller) {
          const onAbort = () => { clearTimeout(timer); controller.error(options.signal.reason); };
          const timer = setTimeout(() => {
            options.signal.removeEventListener("abort", onAbort);
            controller.enqueue(PNG); controller.close();
          }, options.dispatcher ? 20 : 1500);
          options.signal.addEventListener("abort", onAbort, { once: true });
        },
      }), { headers: { "content-type": "image/png" } });
    },
  });
  const result = await fetch("https://download.example/image.png", { outbound, signal: AbortSignal.timeout(400) });
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), PNG);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].signal.aborted, true);
  assert.equal(attempts[1].signal.aborted, false);
  assert.equal(policy.snapshot().hosts["https://download.example:443"].preferred, "proxy");
  assert.equal(policy.snapshot().hosts["https://download.example:443"].direct, undefined);
});

test("an HTTP error cannot beat a complete image from the other route", async () => {
  const policy = createOutboundRoutePolicy();
  const fetch = createProxyAwareFetch({ ...base, routePolicy: policy,
    fetchImpl: async (_url, options) => {
      if (!options.dispatcher) return new Response("denied on this route", { status: 403 });
      await delay(20, null, { signal: options.signal });
      return new Response(PNG);
    },
  });
  const result = await fetch("https://status.example/image.png", { outbound, signal: AbortSignal.timeout(400) });
  assert.equal(result.status, 200);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), PNG);
  assert.equal(policy.snapshot().hosts["https://status.example:443"].direct.failures, 1);
});

test("cancelling a download stops both routes", async () => {
  const signals = [];
  const controller = new AbortController();
  const fetch = createProxyAwareFetch({ ...base,
    fetchImpl: async (_url, options) => {
      signals.push(options.signal);
      if (signals.length === 2) controller.abort(new Error("download cancelled"));
      await delay(1000, null, { signal: options.signal });
      return new Response(PNG);
    },
  });
  const timer = setTimeout(() => controller.abort(new Error("download cancelled")), 100);
  try {
    await assert.rejects(fetch("https://cancel.example/image.png", { outbound, signal: controller.signal }));
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal.aborted));
  } finally { clearTimeout(timer); }
});

test("explicit routes and image POSTs stay single requests", async () => {
  for (const options of [
    { outbound: { ...outbound, mode: "direct" } },
    { outbound: { ...outbound, mode: "proxy" } },
    { method: "POST", body: "{}", outbound },
    { method: "POST", body: "{}", outbound: { ...outbound, requestClass: "billable" } },
  ]) {
    let attempts = 0;
    const fetch = createProxyAwareFetch({ ...base, fetchImpl: async () => { attempts++; await delay(30); return new Response(PNG); } });
    await fetch("https://single.example/image.png", options);
    assert.equal(attempts, 1);
  }
});

test("an active large-image download may take longer than fifteen seconds", async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-download-budget-"));
  try {
    let attempts = 0;
    const service = createImageSyncService({ outputDir, delaysMs: [0],
      fetchImpl: async (_url, options) => {
        attempts++;
        await delay(16_000, null, { signal: options.signal });
        return new Response(PNG, { headers: { "content-type": "image/png" } });
      },
    });
    const result = await service.syncResponse({ data: [{ url: "https://slow.example/large.png" }] });
    assert.equal(result.ok, true);
    assert.equal(attempts, 1);
    assert.deepEqual(fs.readFileSync(path.join(outputDir, path.basename(result.data[0].local_url))), PNG);
  } finally {
    assert.ok(path.resolve(outputDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
