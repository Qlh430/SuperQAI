"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  classifyProviderUsageError,
  createProviderTelemetryService,
  summarizeProviderUsageCapability,
} = require("../provider-telemetry-service");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-telemetry-"));
const filePath = path.join(root, "provider-runtime-history.json");
const now = Date.parse("2026-09-24T03:00:00.000Z");
const imageProvider = {
  id: "image-provider",
  name: "Image Provider",
  baseUrl: "https://image.example.test/v1",
  enabled: true,
  models: [{
    id: "image-model",
    capabilities: ["image.generate", "image.edit"],
  }],
};
const agentProvider = {
  id: "agent-provider",
  name: "Agent Provider",
  baseUrl: "https://agent.example.test/v1",
  enabled: true,
  models: [{
    id: "agent-model",
    capabilities: ["llm.chat", "llm.tools"],
  }],
};

try {
  const service = createProviderTelemetryService({
    filePath,
    fs,
    providerStore: {
      listInternal: () => [imageProvider, agentProvider],
    },
    now: () => now,
  });
  service.start();
  service.recordMonitoringSample(imageProvider, {
    state: "online",
    platformState: "online",
    latencyMs: 120,
    httpStatus: 200,
  }, "2026-09-24T02:59:00.000Z");
  service.recordUsageEvent(imageProvider, {
    kind: "image",
    model: "image-model",
    success: true,
    latencyMs: 240,
    httpStatus: 200,
    checkedAt: "2026-09-24T02:59:30.000Z",
  });
  service.recordUsageEvent(agentProvider, {
    kind: "agent",
    model: "agent-model",
    success: false,
    latencyMs: 80,
    httpStatus: 401,
    message: "invalid key",
    checkedAt: "2026-09-24T02:59:40.000Z",
  });

  const history = service.readHistory();
  assert.equal(history.providers["image-provider"].length, 1);
  assert.equal(history.usage["image-provider"].length, 1);
  assert.equal(history.usage["agent-provider"][0].errorCategory, "auth");

  const imageHealth = service.getHealthSnapshot("image").get("image-provider");
  assert.equal(imageHealth.state, "online");
  assert.equal(imageHealth.successRate, 100);
  assert.equal(imageHealth.latencyMs, 240);

  const agentHealth = service.getCandidateHealth({
    provider: agentProvider,
    intent: "llm.tools",
  });
  assert.equal(agentHealth.state, "account-limited");
  assert.equal(agentHealth.rank, 6);
  assert.equal(service.getUsageCapability("agent-provider").state, "auth-error");

  assert.equal(classifyProviderUsageError("insufficient balance", 402), "balance");
  assert.equal(classifyProviderUsageError("invalid key", 401), "auth");
  assert.equal(classifyProviderUsageError("too many requests", 429), "rate-limit");
  assert.equal(classifyProviderUsageError("upstream exploded", 503), "server");
  assert.equal(classifyProviderUsageError("fetch failed", 0), "network");
  assert.deepEqual(
    summarizeProviderUsageCapability([]),
    { state: "untested", kind: "", checkedAt: "", message: "" },
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("Provider telemetry service checks passed.");
