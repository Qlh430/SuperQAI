"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createProviderExecutor } = require("../provider-executor");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
const { createMediaProviderBridge } = require("../media-provider-bridge");

const reference = "data:image/png;base64,AQ==";
const image = { data: [{ url: "https://cdn.example/secondary.png" }] };
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status });

function fixture({ protocol = "openai", reject, autoFallback = true, primaryCapabilities = ["image.generate", "image.edit"] } = {}) {
  const providers = ["primary", "secondary"].map((id, index) => ({
    id, name: id, baseUrl: `https://${id}.${!index && protocol === "apimart" ? "apimart.ai" : "example"}/v1`,
    protocol: index || protocol === "apimart" ? "openai" : protocol,
    apiKey: `${id}-private-key`, enabled: true, sortOrder: index,
    models: [{
      id: "gpt-image-2",
      protocol: index || ["openai", "apimart"].includes(protocol) ? "openai-images" : protocol,
      capabilities: index ? ["image.generate", "image.edit"] : primaryCapabilities,
    }],
  }));
  const calls = [];
  const engine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters({ wait: async () => {}, maxPolls: 2 }) }),
    outboundFetch: async (url, options) => {
      const provider = new URL(url).hostname.split(".")[0];
      calls.push({ provider, url, options });
      return provider === "primary" ? reject(url, options) : json(image);
    },
  });
  const resolver = createCapabilityResolver({
    store: { listInternal: () => providers, getAutoFallback: () => autoFallback },
  });
  const executor = createProviderExecutor({ resolver, engine });
  return { calls, bridge: createMediaProviderBridge({ executor }), executor };
}

for (const protocol of ["openai", "apimart", "image-relay"]) {
  for (const status of [400, 402, 403, 429, 200]) {
    test(`${protocol}: explicit quota rejection (${status}) selects the next compatible image model`, async () => {
      const { bridge, calls } = fixture({
        protocol,
        reject: () => json({
          success: false,
          error: { code: "insufficient_quota", message: "余额不足 primary-private-key" },
        }, status),
      });
      const result = await bridge.editImage({
        prompt: "dark background", inputImages: [reference], size: "16:9", resolution: "2k",
      });
      assert.equal(result.selection.providerId, "secondary");
      assert.deepEqual(calls.map(call => call.provider), ["primary", "secondary"]);
      const fallbackRequest = calls[1].options.body;
      assert.ok(fallbackRequest instanceof FormData);
      assert.equal(fallbackRequest.get("prompt"), "dark background");
      assert.deepEqual(Buffer.from(await fallbackRequest.get("image").arrayBuffer()), Buffer.from([1]));
      assert.equal(result.attempts[0].code, "UPSTREAM_QUOTA_EXHAUSTED");
      assert.equal(result.attempts[0].retryable, false, "no retry on the same depleted account");
      assert.equal(result.attempts[0].fallbackAllowed, true, "a different account may accept the request");
      assert.equal(JSON.stringify(result).includes("primary-private-key"), false);
    });
  }
}

for (const options of [
  { preferred: { providerId: "primary", modelId: "gpt-image-2" } },
  { autoFallback: false },
]) {
  test(`quota rejection respects ${options.preferred ? "fixed selection" : "disabled fallback"}`, async () => {
    const { bridge, calls } = fixture({
      ...options,
      reject: () => json({ error: { code: "insufficient_quota", message: "Insufficient balance" } }, 402),
    });
    await assert.rejects(bridge.generateImage({ prompt: "test", ...options.preferred }), error => (
      error.code === "UPSTREAM_QUOTA_EXHAUSTED" && error.attempts.length === 1
    ));
    assert.deepEqual(calls.map(call => call.provider), ["primary"]);
  });
}

test("automatic image editing excludes generation-only models", async () => {
  const { bridge, calls } = fixture({
    primaryCapabilities: ["image.generate"],
    reject: () => { throw new Error("generation-only model must not receive image editing"); },
  });
  const result = await bridge.editImage({ prompt: "test", inputImages: [reference] });
  assert.equal(result.selection.providerId, "secondary");
  assert.deepEqual(calls.map(call => call.provider), ["secondary"]);
});

for (const protocol of ["openai", "apimart"]) {
  test(`${protocol}: uncertain submission does not switch account`, async () => {
    const { bridge, calls } = fixture({
      protocol,
      reject: () => { throw Object.assign(new Error("socket closed after submit"), { code: "ECONNRESET" }); },
    });
    await assert.rejects(bridge.generateImage({ prompt: "test" }), error => error.submissionState === "unknown");
    assert.equal(calls.length, 1);
  });
}

test("quota error during task polling never submits a second generation", async () => {
  const { bridge, calls } = fixture({
    protocol: "apimart",
    reject: (_url, options) => options.method === "POST"
      ? json({ task_id: "already-paid" })
      : json({ error: { code: "insufficient_quota", message: "Insufficient balance" } }, 402),
  });
  await assert.rejects(bridge.generateImage({ prompt: "test" }), error => (
    error.code === "UPSTREAM_TASK_PENDING" && error.submissionState === "submitted"
  ));
  assert.equal(calls.filter(call => call.options.method === "POST").length, 1);
  assert.ok(calls.every(call => call.provider === "primary"));
});

test("a quota error alongside an accepted array task never switches provider", async () => {
  const { bridge, calls } = fixture({
    protocol: "apimart",
    reject: () => json({
      success: false,
      error: { code: "insufficient_quota", message: "Insufficient balance" },
      data: [{ task_id: "already-paid" }],
    }),
  });
  await assert.rejects(bridge.generateImage({ prompt: "test" }));
  assert.deepEqual(calls.map(call => call.provider), ["primary"]);
});

for (const [name, payload, status] of [
  ["invalid prompt mentioning a balance", { error: { code: "invalid_prompt", message: "Invalid prompt" }, prompt: "insufficient balance" }, 400],
  ["ordinary forbidden response", { error: { message: "Access forbidden" } }, 403],
]) {
  test(`${name} is not reclassified as quota exhaustion`, async () => {
    const { bridge, calls } = fixture({ reject: () => json(payload, status) });
    const result = await bridge.generateImage({ prompt: "test" });
    assert.equal(result.selection.providerId, "secondary", "a definitive rejection moves on to the next compatible account");
    assert.equal(calls.length, 2);
    assert.notEqual(result.attempts?.[0]?.code, "UPSTREAM_QUOTA_EXHAUSTED", "an ordinary rejection keeps its own error code");
  });
}

test("a moderation rejection never retries the same prompt on another account", async () => {
  const { bridge, calls } = fixture({
    reject: () => json({ error: { code: "content_policy_violation", message: "Your request was rejected by the content filter." } }, 400),
  });
  await assert.rejects(
    bridge.generateImage({ prompt: "test" }),
    error => error.code !== "UPSTREAM_QUOTA_EXHAUSTED" && error.fallbackAllowed !== true,
  );
  assert.deepEqual(calls.map(call => call.provider), ["primary"]);
});

test("successful output mentioning quota is not mistaken for a rejection", async () => {
  const { bridge, calls } = fixture({
    reject: () => json({ ...image, message: "quota low" }),
  });
  const result = await bridge.generateImage({ prompt: "test" });
  assert.equal(result.selection.providerId, "primary");
  assert.equal(calls.length, 1);
});
