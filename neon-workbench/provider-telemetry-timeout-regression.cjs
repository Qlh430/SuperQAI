"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  createProviderTelemetryService,
  classifyProviderUsageError,
} = require("../host-sources/app/provider-telemetry-service");

test("Agent timeout, network failure, and user cancellation remain distinct in telemetry", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-telemetry-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "history.json");
  const provider = { id: "isolated-provider", name: "Isolated provider" };
  const service = createProviderTelemetryService({
    filePath,
    fs,
    providerStore: { listInternal: () => [provider] },
    now: () => Date.parse("2026-11-10T08:00:00.000Z"),
  });

  const timeout = service.recordUsageEvent(provider, {
    kind: "agent",
    model: "gpt-6.1-sol",
    success: false,
    latencyMs: 90_004,
    httpStatus: 0,
    code: "UPSTREAM_TIMEOUT",
    stage: "total",
    message: "UPSTREAM_TIMEOUT 等待模型生成超时。",
  });
  const network = service.recordUsageEvent(provider, {
    kind: "agent",
    success: false,
    latencyMs: 1_204,
    httpStatus: 0,
    code: "UPSTREAM_UNAVAILABLE",
    message: "fetch failed",
  });
  const cancelled = service.recordUsageEvent(provider, {
    kind: "agent",
    success: false,
    latencyMs: 3_800,
    httpStatus: 0,
    code: "REQUEST_ABORTED",
    message: "Canvas Agent request was cancelled.",
  });

  assert.equal(classifyProviderUsageError("UPSTREAM_TIMEOUT", 0, "UPSTREAM_TIMEOUT"), "timeout");
  assert.equal(timeout.errorCategory, "timeout");
  assert.equal(timeout.code, "UPSTREAM_TIMEOUT");
  assert.equal(timeout.stage, "total");
  assert.equal(network.errorCategory, "network");
  assert.equal(cancelled.errorCategory, "cancelled");
  assert.equal(service.readHistory().usage[provider.id].length, 3);
});
