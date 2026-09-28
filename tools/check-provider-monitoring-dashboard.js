"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const CLIENT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const TELEMETRY_SOURCE = fs.readFileSync(path.join(ROOT, "provider-telemetry-service.js"), "utf8");

assert.match(
  SERVER_SOURCE,
  /LEGACY_PROVIDER_ADMIN_PATHS[\s\S]*"\/api\/settings\/providers\/monitoring"/,
  "the retired monitoring route must stay explicitly blocked",
);
assert.match(SERVER_SOURCE, /provider_control_plane_retired/);
assert.doesNotMatch(
  SERVER_SOURCE,
  /function handleProviderMonitoring|function getProviderMonitoringDashboard|function buildProviderMonitoringTrend/,
  "retired monitoring UI handlers must not remain in the server entry point",
);
assert.doesNotMatch(SERVER_SOURCE, /providerMonitoringStartupTimer\s*=\s*setTimeout/);
assert.doesNotMatch(CLIENT_SOURCE, /\binitializeSettingsCenter\(\);/, "retired monitoring settings must not initialize");

assert.match(TELEMETRY_SOURCE, /function recordMonitoringSample/);
assert.match(TELEMETRY_SOURCE, /function getHealthSnapshot/);
assert.match(TELEMETRY_SOURCE, /retentionMs/);
assert.match(TELEMETRY_SOURCE, /maxSamples/);

console.log("Provider monitoring dashboard checks passed.");
