"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const server = require("./server-source").readServerSource();
const providerApi = fs.readFileSync(path.join(ROOT, "provider-http-api.js"), "utf8");
const providerBridge = fs.readFileSync(path.join(ROOT, "canvas-agent-provider-bridge.js"), "utf8");
const settingsUi = fs.readFileSync(path.join(ROOT, "system-settings-ui.js"), "utf8");
const telemetryService = fs.readFileSync(path.join(ROOT, "provider-telemetry-service.js"), "utf8");

// Legacy Agent verification stays retired. The new provider subsystem exposes
// a zero-cost coverage check and live Agent turns feed runtime health back into
// the shared fallback order.
assert.match(server, /LEGACY_PROVIDER_ADMIN_PATHS[\s\S]*"\/api\/settings\/providers\/agent-verify"/);
assert.match(server, /provider_control_plane_retired/);
assert.match(providerApi, /"\/api\/providers\/test"\s*:\s*"llm\.chat"/);
assert.match(providerApi, /"\/api\/providers\/test-vision"\s*:\s*"llm\.chat\.vision"/);
assert.match(providerApi, /engine\.execute\(provider, model, intent/);
assert.match(providerApi, /"\/api\/providers\/agent-coverage"/);
assert.match(providerApi, /analyzeProviderAgentCoverage/);

assert.match(providerBridge, /getProviderTaskRequirements/);
assert.match(providerBridge, /executor\.stream\(request,\s*input\.onDelta\)/);
assert.match(providerBridge, /preferredProviderId/);
assert.match(providerBridge, /preferredModelId/);
assert.doesNotMatch(providerBridge, /verification|health|circuit|half.?open|EWMA/i);

assert.match(settingsUi, /data-agent-coverage/);
assert.match(settingsUi, /检查已选模型/);
assert.match(settingsUi, /拉取模型并检查/);
assert.match(settingsUi, /不会调用模型或产生费用/);
assert.doesNotMatch(settingsUi, /setInterval\([\s\S]{0,160}(?:provider|agent)/i);
assert.match(telemetryService, /function createProviderTelemetryService/);
assert.match(telemetryService, /function recordUsageEvent/);
assert.match(server, /onAttemptResult[\s\S]{0,600}providerTelemetryService\.recordUsageEvent/);
assert.match(server, /kind:\s*value\s*===\s*"llm\.tools"\s*\?\s*"agent"/);

console.log("Provider Agent coverage and runtime health checks passed.");
