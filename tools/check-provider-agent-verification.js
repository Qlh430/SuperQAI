"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const providerApi = fs.readFileSync(path.join(ROOT, "provider-http-api.js"), "utf8");
const providerBridge = fs.readFileSync(path.join(ROOT, "canvas-agent-provider-bridge.js"), "utf8");
const settingsUi = fs.readFileSync(path.join(ROOT, "system-settings-ui.js"), "utf8");

// The dedicated Agent verification control plane is retired. Manual model tests
// now pass through the same protocol engine used by live Agent turns.
assert.match(server, /LEGACY_PROVIDER_ADMIN_PATHS[\s\S]*"\/api\/settings\/providers\/agent-verify"/);
assert.match(server, /provider_control_plane_retired/);
assert.match(providerApi, /"\/api\/providers\/test"\s*:\s*"llm\.chat"/);
assert.match(providerApi, /"\/api\/providers\/test-vision"\s*:\s*"llm\.chat\.vision"/);
assert.match(providerApi, /engine\.execute\(provider, model, intent/);

assert.match(providerBridge, /getProviderTaskRequirements/);
assert.match(providerBridge, /executor\.stream\(request,\s*input\.onDelta\)/);
assert.match(providerBridge, /preferredProviderId/);
assert.match(providerBridge, /preferredModelId/);
assert.doesNotMatch(providerBridge, /verification|health|circuit|half.?open|EWMA/i);

assert.doesNotMatch(settingsUi, /agent-verify|Agent 实测|Agent 模型/);
assert.doesNotMatch(settingsUi, /setInterval\([\s\S]{0,160}(?:provider|agent)/i);

console.log("Provider Agent verification retirement checks passed.");
