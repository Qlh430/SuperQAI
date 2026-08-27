const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");

assert.match(server, /\/api\/settings\/providers\/agent-verify/);
assert.match(server, /async function handleProviderAgentVerify/);
assert.match(server, /report_agent_probe/);
assert.match(server, /crypto\.randomBytes/);
assert.match(server, /setCanvasAgentCapability/);
assert.match(server, /canvasAgentVerificationPromises\s*=\s*new Map/);
assert.match(server, /canvasAgentVerificationPromises\.get/);
assert.match(server, /canvasAgentVerificationPromises\.set/);
assert.match(server, /canvasAgentVerificationPromises\.delete/);
assert.match(server, /agentCapabilities/);
assert.match(server, /CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS/);
assert.match(server, /CANVAS_AGENT_VERIFICATION_TIMEOUT_MS\s*=\s*Math\.max\(CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS,\s*CANVAS_AGENT_ATTEMPT_TIMEOUT_MS\)/);
assert.match(server, /CANVAS_AGENT_VISION_PROBE_IMAGE/);
assert.match(server, /async function verifyProviderAgentVision/);
assert.match(server, /CanvasAgentLlmConnectors\.resolveLlmConnector/);
assert.match(server, /adapter\.buildToolProbe/);
assert.match(server, /adapter\.buildVisionProbe/);
assert.match(server, /adapter\.getEndpoint/);
assert.match(server, /adapter\.getHeaders/);
assert.match(server, /adapter\.parseResponse/);
const verificationSource = server.slice(
  server.indexOf("async function verifyProviderAgentVision"),
  server.indexOf("function classifyProviderRuntimeStatus"),
);
assert.match(verificationSource, /AbortSignal\.timeout\(CANVAS_AGENT_VERIFICATION_TIMEOUT_MS\)/);
assert.doesNotMatch(verificationSource, /AbortSignal\.timeout\(CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS\)/);
assert.match(verificationSource, /CanvasAgentRouter\.formatAgentVerificationError/);
assert.doesNotMatch(server, /vision:\s*model\.capabilities\?\.includes\("vision"\)\s*\?\s*"configured"/);
assert.doesNotMatch(server, /report_agent_probe[\s\S]{0,120}(?:create_|update_|run_canvas_node)/);

assert.match(script, /SETTINGS_PROVIDER_AGENT_VERIFY_API_URL/);
assert.match(script, /data-settings-action="verify-provider-agent"/);
assert.match(script, /async function verifyProviderAgent/);
assert.match(script, /Agent 实测/);
assert.match(script, /工具调用/);
assert.match(script, /CanvasAgentVerification\.classifyVerificationQuality/);
assert.match(script, /function isAgentVerificationRequestCurrent\(/);
const verifyProviderSource = script.slice(
  script.indexOf("async function verifyProviderAgent"),
  script.indexOf("async function refreshProviderRuntime"),
);
assert.match(
  verifyProviderSource,
  /providerAgentVerificationState\.set\(key, \{ \.\.\.data, draft: Boolean\(draftProvider && data\.draft\) \}\);[\s\S]{0,240}renderAgentModelSettings\(\);[\s\S]{0,360}loadAgentRoutingCandidates/,
  "a successful Agent verification should leave the loading state before the candidate pool refresh",
);
assert.match(verifyProviderSource, /options\.automatic/);
assert.match(verifyProviderSource, /isAgentVerificationRequestCurrent\(provider\.id, model\.id, requestSignature\)/);
assert.doesNotMatch(script, /setInterval\([\s\S]{0,120}agent-verify/i);

assert.match(server, /const draftAgentVerificationCache\s*=\s*new Map\(\)/);
assert.match(server, /function buildDraftAgentVerificationFingerprint\(/);
assert.match(server, /function normalizeDraftAgentVerificationProvider\(/);
assert.match(server, /async function promoteDraftAgentVerifications\(/);
assert.match(server, /normalizeDraftAgentVerificationProvider\(payload\.draftProvider, providerId, modelId\)/);
assert.match(server, /verifyProviderAgentCandidate\(provider, model, \{ persistResult: !hasDraftProvider \}\)/);
assert.match(server, /result\?\.state === "verified"/);
assert.match(server, /await promoteDraftAgentVerifications\(next\)/);

console.log("Provider Agent verification checks passed.");
