"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  classifyProviderUsageError,
  summarizeProviderUsageCapability,
} = require("../provider-telemetry-service");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const TELEMETRY_SOURCE = fs.readFileSync(path.join(ROOT, "provider-telemetry-service.js"), "utf8");

assert.match(
  SERVER_SOURCE,
  /"\/api\/settings\/providers\/runtime"/,
  "the retired runtime route must stay explicitly blocked",
);
assert.doesNotMatch(
  SERVER_SOURCE,
  /function handleProviderRuntime|function probeProviderRuntimeStatus|function runProviderMonitoringSweep/,
  "retired runtime probing must not remain in the server entry point",
);
assert.match(TELEMETRY_SOURCE, /function classifyProviderUsageError/);
assert.match(TELEMETRY_SOURCE, /function summarizeProviderUsageCapability/);

assert.equal(classifyProviderUsageError("Insufficient account balance", 401), "balance");
assert.equal(classifyProviderUsageError("invalid key", 401), "auth");
assert.equal(classifyProviderUsageError("too many requests", 429), "rate-limit");
assert.equal(classifyProviderUsageError("upstream exploded", 503), "server");
assert.equal(classifyProviderUsageError("fetch failed", 0), "network");

assert.deepEqual(
  summarizeProviderUsageCapability([]),
  { state: "untested", kind: "", checkedAt: "", message: "" },
);
assert.equal(
  summarizeProviderUsageCapability([{
    success: false,
    kind: "image",
    errorCategory: "balance",
    message: "insufficient",
  }]).state,
  "balance-error",
);
assert.equal(
  summarizeProviderUsageCapability([{
    success: true,
    kind: "agent",
    checkedAt: "2026-09-24T03:00:00.000Z",
  }]).state,
  "verified",
);

console.log("Provider runtime metrics checks passed.");
