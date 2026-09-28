"use strict";

const assert = require("node:assert/strict");

const { MODEL_CAPABILITIES } = require("../model-capabilities");
const { createCapabilityResolver } = require("../provider-capability-resolver");

function fixtureStore() {
  const state = {
    autoFallback: true,
    providers: [
      {
        id: "primary",
        name: "Primary",
        baseUrl: "https://primary.example/v1",
        protocol: "openai",
        apiKey: "primary-secret",
        enabled: true,
        sortOrder: 0,
        capabilitySort: { "llm.chat": 0, "llm.tools": 0 },
        metadata: { metrics: { errorRate: 0 } },
        models: [
          { id: "primary-chat", protocol: "openai", capabilities: ["llm.chat"], sortOrder: 0, capabilitySort: {} },
          { id: "primary-tools", protocol: "openai", capabilities: ["llm.chat", "llm.tools"], sortOrder: 1, capabilitySort: { "llm.tools": 0 } },
        ],
      },
      {
        id: "secondary",
        name: "Secondary",
        baseUrl: "https://secondary.example/v1",
        protocol: "openai",
        apiKey: "secondary-secret",
        enabled: true,
        sortOrder: 1,
        capabilitySort: {},
        metadata: { metrics: { latencyMs: 1 } },
        models: [
          { id: "secondary-tools", protocol: "openai", capabilities: ["llm.chat", "llm.tools", "llm.chat.vision"], sortOrder: 0, capabilitySort: {} },
        ],
      },
      {
        id: "disabled",
        name: "Disabled",
        baseUrl: "https://disabled.example/v1",
        protocol: "openai",
        apiKey: "disabled-secret",
        enabled: false,
        sortOrder: -1,
        capabilitySort: { "llm.tools": -10 },
        metadata: { metrics: { errorRate: 0, latencyMs: 0 } },
        models: [
          { id: "disabled-tools", protocol: "openai", capabilities: ["llm.chat", "llm.tools"], sortOrder: 0, capabilitySort: {} },
        ],
      },
    ],
  };
  return {
    state,
    listInternal: () => state.providers.map((provider) => ({ ...provider, models: provider.models.map((model) => ({ ...model })) })),
    getAutoFallback: () => state.autoFallback,
  };
}

(() => {
  assert.deepEqual(MODEL_CAPABILITIES, [
    "llm.chat",
    "llm.chat.vision",
    "llm.tools",
    "image.generate",
    "image.edit",
    "video.generate",
    "audio.generate",
  ]);

  const store = fixtureStore();
  const resolver = createCapabilityResolver({ store });
  const toolCandidates = resolver.listCandidates({ intent: "llm.tools", mustAll: ["llm.tools"] });
  assert.deepEqual(toolCandidates.map((item) => item.model.id), ["primary-tools", "secondary-tools"]);
  assert.equal(toolCandidates.some((item) => item.provider.id === "disabled"), false);

  assert.equal(resolver.resolve({ intent: "llm.chat", mustAll: ["llm.chat"] }).model.id, "primary-chat");
  assert.equal(resolver.resolve({ intent: "llm.tools", preferredModelId: "secondary-tools" }).model.id, "secondary-tools");
  assert.equal(resolver.resolve({ intent: "llm.chat.vision", preferredProviderId: "secondary" }).model.id, "secondary-tools");
  assert.throws(
    () => resolver.resolve({ intent: "llm.chat.vision", mustAll: ["llm.chat.vision"], preferredProviderId: "primary" }),
    (error) => error.code === "PINNED_MODEL_UNAVAILABLE"
      && error.alternatives[0].modelId === "secondary-tools"
      && !JSON.stringify(error).includes("primary-secret"),
  );
  assert.throws(
    () => resolver.resolve({ intent: "video.generate" }),
    (error) => error.code === "MODEL_CAPABILITY_UNAVAILABLE",
  );

  store.state.providers[0].metadata.metrics = { errorRate: 1, latencyMs: 999_999, circuitOpen: true };
  store.state.providers[1].metadata.metrics = { errorRate: 0, latencyMs: 1, lastSuccessAt: new Date().toISOString() };
  assert.deepEqual(
    resolver.listCandidates({ intent: "llm.tools" }).map((item) => item.model.id),
    ["primary-tools", "secondary-tools"],
  );
  assert.equal(resolver.resolve({ intent: "llm.chat" }).model.id, "primary-chat");

  const resolved = resolver.resolve({ intent: "llm.chat" });
  assert.equal(resolved.reason, "administrator-order");
  assert.ok(Array.isArray(resolved.warnings));
  assert.ok(resolved.alternatives.length <= 5);
  assert.equal(JSON.stringify(resolved.alternatives).includes("secret"), false);
  assert.equal(resolver.getAutoFallback(), true);

  const healthResolver = createCapabilityResolver({
    store,
    candidateHealth: ({ provider, intent }) => intent === "llm.tools"
      ? { rank: provider.id === "secondary" ? 0 : 5, state: provider.id === "secondary" ? "online" : "unstable" }
      : null,
  });
  assert.deepEqual(
    healthResolver.listCandidates({ intent: "llm.tools" }).map((item) => item.model.id),
    ["secondary-tools", "primary-tools"],
    "unpinned automatic selection should prefer the healthier provider",
  );
  assert.equal(healthResolver.resolve({ intent: "llm.tools" }).reason, "health-priority");
  assert.equal(
    healthResolver.resolve({ intent: "llm.tools", preferredProviderId: "primary" }).model.id,
    "primary-tools",
    "an explicit provider selection must remain pinned even when another provider is healthier",
  );
  assert.deepEqual(
    healthResolver.listCandidates({
      intent: "llm.tools",
      mustAll: ["llm.chat", "llm.chat.vision", "llm.tools"],
      candidateOrder: [
        { providerId: "primary", modelId: "primary-tools" },
        { providerId: "secondary", modelId: "secondary-tools" },
      ],
    }).map(item => `${item.provider.id}:${item.model.id}`),
    ["secondary:secondary-tools"],
    "configured Agent routes are restricted to ordered multimodal candidates",
  );
  assert.deepEqual(
    healthResolver.listCandidates({
      intent: "llm.tools",
      candidateOrder: [
        { providerId: "primary", modelId: "primary-tools" },
        { providerId: "secondary", modelId: "secondary-tools" },
      ],
    }).map(item => `${item.provider.id}:${item.model.id}`),
    ["primary:primary-tools", "secondary:secondary-tools"],
    "saved Agent order takes precedence over live health ranking",
  );

  console.log("Provider capability resolver checks passed.");
})();
