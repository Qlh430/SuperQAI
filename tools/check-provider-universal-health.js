"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = require("./server-source").readServerSource();
const TELEMETRY_SOURCE = fs.readFileSync(path.join(ROOT, "provider-telemetry-service.js"), "utf8");
const CATALOG_HEALTH_SOURCE = fs.readFileSync(path.join(ROOT, "provider-catalog-health.js"), "utf8");

assert.match(SERVER_SOURCE, /createProviderTelemetryService/);
assert.match(SERVER_SOURCE, /candidateHealth:\s*providerTelemetryService\.getCandidateHealth/);
assert.doesNotMatch(SERVER_SOURCE, /function getProviderMonitoringDashboard|function probeProviderRuntimeStatus/);

assert.match(TELEMETRY_SOURCE, /recordMonitoringSample/);
assert.match(TELEMETRY_SOURCE, /recordUsageEvent/);
assert.match(TELEMETRY_SOURCE, /getCandidateHealth/);
assert.match(TELEMETRY_SOURCE, /summarizeProviderCatalogHealth/);
assert.match(CATALOG_HEALTH_SOURCE, /balance-error/);
assert.match(CATALOG_HEALTH_SOURCE, /account-limited/);
assert.match(CATALOG_HEALTH_SOURCE, /rate-limited/);
assert.match(CATALOG_HEALTH_SOURCE, /connection-error/);

console.log("Provider universal health checks passed.");
