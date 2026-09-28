"use strict";

const assert = require("node:assert/strict");

const { createAgentModelSettingsService } = require("../agent-model-settings");

function model(id, capabilities) {
  return { id, displayName: id, protocol: "openai", capabilities, sortOrder: 0, capabilitySort: {}, metadata: {} };
}

(() => {
  const saved = new Map();
  const db = {
    getSetting: key => saved.get(key) || null,
    setSetting: (key, value) => { saved.set(key, value); return value; },
  };
  const providers = [
    {
      id: "primary-platform",
      name: "主平台",
      enabled: true,
      sortOrder: 0,
      models: [
        model("vision-agent", ["llm.chat", "llm.chat.vision", "llm.tools"]),
        model("text-only", ["llm.chat", "llm.tools"]),
      ],
    },
    {
      id: "backup-platform",
      name: "备用平台",
      enabled: true,
      sortOrder: 1,
      models: [model("backup-agent", ["llm.chat", "llm.chat.vision", "llm.tools"])],
    },
  ];
  const store = { listInternal: () => providers };
  const service = createAgentModelSettingsService({ db, store });

  assert.deepEqual(service.get().models.map(item => `${item.providerId}:${item.modelId}`), [
    "primary-platform:vision-agent",
    "backup-platform:backup-agent",
  ], "only chat + vision + tools models belong in Agent settings");
  assert.equal(service.get().configured, false);
  assert.deepEqual(service.getRoute().candidateOrder, [
    { providerId: "primary-platform", modelId: "vision-agent" },
    { providerId: "backup-platform", modelId: "backup-agent" },
  ], "an unconfigured installation keeps a compatible automatic fallback");

  const configured = service.save({
    primary: { providerId: "backup-platform", modelId: "backup-agent" },
    candidates: [
      { providerId: "primary-platform", modelId: "vision-agent" },
      { providerId: "primary-platform", modelId: "vision-agent" },
      { providerId: "backup-platform", modelId: "backup-agent" },
    ],
  });
  assert.deepEqual(configured.settings, {
    primary: { providerId: "backup-platform", modelId: "backup-agent" },
    candidates: [{ providerId: "primary-platform", modelId: "vision-agent" }],
  });
  assert.deepEqual(service.getRoute().candidateOrder, [
    { providerId: "backup-platform", modelId: "backup-agent" },
    { providerId: "primary-platform", modelId: "vision-agent" },
  ]);
  assert.throws(
    () => service.save({ primary: { providerId: "primary-platform", modelId: "text-only" }, candidates: [] }),
    error => error.code === "invalid_agent_model",
  );

  providers[1].enabled = false;
  const degraded = service.get();
  assert.equal(degraded.configured, true);
  assert.deepEqual(degraded.unavailable, [{ providerId: "backup-platform", modelId: "backup-agent", role: "primary" }]);
  assert.deepEqual(service.getRoute().candidateOrder, [
    { providerId: "primary-platform", modelId: "vision-agent" },
  ], "a saved compatible candidate takes over when the primary disappears");

  providers[0].enabled = false;
  assert.throws(
    () => service.getRoute(),
    error => error.code === "AGENT_MODEL_SETTINGS_UNAVAILABLE" && error.statusCode === 503,
    "a configured Agent must not silently escape to models outside the saved primary and candidates",
  );

  console.log("Agent model settings checks passed.");
})();
