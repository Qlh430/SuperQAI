const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../canvas-agent-runtime");

const ROOT = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
const portableBuild = fs.readFileSync(path.join(ROOT, "build-portable.bat"), "utf8");
const skillsDirectory = path.join(ROOT, "skills");

assert.match(server, /require\("\.\/canvas-agent-runtime"\)/);
assert.match(server, /require\("\.\/canvas-agent-router"\)/);
assert.match(server, /require\("\.\/canvas-agent-llm-connectors"\)/);
assert.match(server, /CANVAS_AGENT_MODEL\s*=\s*process\.env\.CANVAS_AGENT_MODEL\s*\|\|\s*"gpt-5\.6-terra"/);
assert.match(server, /CANVAS_AGENT_REASONING_EFFORT/);
assert.match(server, /CANVAS_AGENT_API_URL/);
assert.match(server, /CANVAS_AGENT_API_KEY/);
assert.match(server, /GET[\s\S]*\/api\/canvas-agent\/skills/);
assert.match(server, /POST[\s\S]*\/api\/canvas-agent\/turn/);
assert.match(server, /async function handleCanvasAgentSkills/);
assert.doesNotMatch(server, /handleCanvasAgentSkills[\s\S]{0,260}\bmodel:\s*CANVAS_AGENT_MODEL/);
assert.match(server, /configured:\s*getCanvasAgentCandidates\(\{\},\s*\{\s*includeCircuitOpen:\s*true\s*\}\)\.length\s*>\s*0/);
assert.match(server, /async function handleCanvasAgentTurn/);
assert.match(server, /CanvasAgentLlmConnectors\.resolveLlmConnector/);
const runCandidateSource = server.slice(
  server.indexOf("async function runCanvasAgentCandidate"),
  server.indexOf("function normalizeCanvasAgentConversationContext"),
);
assert.match(runCandidateSource, /CanvasAgentLlmConnectors\.resolveLlmConnector\(candidate\)/);
assert.match(runCandidateSource, /adapter\.buildRequest/);
assert.match(runCandidateSource, /adapter\.getEndpoint/);
assert.match(runCandidateSource, /adapter\.getHeaders/);
assert.match(runCandidateSource, /adapter\.consumeStream/);
assert.match(runCandidateSource, /adapter\.parseResponse/);
assert.doesNotMatch(runCandidateSource, /candidate\.protocol\s*===/);
assert.match(server, /function getCanvasAgentCandidates/);
assert.match(server, /function queueCanvasAgentRouteEvent/);
assert.match(server, /function flushCanvasAgentRouteEvents/);
assert.match(server, /agentRoutes/);
assert.match(server, /agentCapabilities/);
assert.match(server, /CANVAS_AGENT_ROUTE_HISTORY_FILE/);
assert.doesNotMatch(server, /flushCanvasAgentRouteEvents[\s\S]{0,900}PROVIDER_MONITORING_FILE/);
assert.match(server, /CANVAS_AGENT_CONNECT_TIMEOUT_MS/);
assert.match(server, /CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS/);
assert.match(server, /CANVAS_AGENT_ATTEMPT_TIMEOUT_MS/);
assert.match(server, /CANVAS_AGENT_TOTAL_TIMEOUT_MS/);
assert.match(server, /CANVAS_AGENT_MAX_SESSIONS\s*=\s*100/);
assert.match(server, /requestedBoardId\s*=\s*String\(payload\.board_id\s*\|\|\s*payload\.canvas\?\.id/);
assert.match(server, /session\.boardId\s*!==\s*requestedBoardId/);
assert.match(server, /activeSkillId:\s*initialActiveSkillId/);
assert.match(server, /session\.activeSkillId\s*!==\s*requestedActiveSkillId/);
assert.match(server, /active_skill_id:\s*session\.activeSkillId/);
assert.match(server, /canvasAgentHalfOpenRoutes/);
assert.match(server, /function acquireCanvasAgentHalfOpenLease/);
assert.match(server, /CANVAS_AGENT_ATTEMPT_TIMEOUT_SECONDS\s*\|\|\s*45/);
assert.match(server, /CANVAS_AGENT_USE_SETTINGS_PROVIDERS/);
assert.match(server, /CANVAS_AGENT_ROUTE_HISTORY_ENABLED/);
assert.match(server, /Object\.entries\(capability\s*\|\|\s*\{\}\)[\s\S]{0,120}value\s*!==\s*undefined/);
assert.match(server, /agentRouting:\s*CanvasAgentRouter\.normalizeAgentRouting/);
assert.match(server, /GET[\s\S]*\/api\/settings\/agent-candidates/);
assert.match(server, /function buildCanvasAgentCandidatePool/);
assert.match(server, /routing:\s*settings\.agentRouting/);
assert.match(server, /primaryCandidateId/);
const candidatePoolSource = server.slice(
  server.indexOf("function buildCanvasAgentCandidatePool"),
  server.indexOf("function queueCanvasAgentRouteEvent"),
);
assert.match(candidatePoolSource, /selectionId/);
assert.match(candidatePoolSource, /id:\s*item\.id,\s*selectionId:\s*item\.selectionId/);
assert.match(candidatePoolSource, /rankBySelectionId\.get\(left\.selectionId\)/);
assert.match(candidatePoolSource, /configuredOrder/);
assert.match(candidatePoolSource, /unavailableConfiguredCandidateIds/);
assert.match(candidatePoolSource, /needsReconfiguration/);
assert.match(candidatePoolSource, /routing\.candidateOrder/);
assert.match(server, /canvasAgentModelDiscoveryCache/);
assert.match(server, /async function refreshCanvasAgentModelDiscovery/);
assert.match(server, /requestUrl\.searchParams\.get\("refresh"\)/);
assert.match(server, /endpoint:\s*getCanvasAgentEndpointLabel/);
assert.match(server, /providerName:\s*candidate\.providerName/);
assert.match(server, /getCanvasAgentProviderModels/);
assert.match(server, /function getCanvasAgentDiscoveryTargets/);
assert.match(server, /getCanvasAgentProviderModels\(provider,\s*discoveryTargets\)/);
assert.doesNotMatch(candidatePoolSource, /apiKey/);
assert.match(server, /agentRouting:\s*CanvasAgentRouter\.normalizeAgentRouting\(\{/);

assert.match(envExample, /^CANVAS_AGENT_API_URL=/m);
assert.match(envExample, /^CANVAS_AGENT_API_KEY=/m);
assert.match(envExample, /^CANVAS_AGENT_MODEL=gpt-5\.6-terra$/m);
assert.match(envExample, /^CANVAS_AGENT_REASONING_EFFORT=medium$/m);
assert.match(envExample, /^CANVAS_AGENT_CONNECT_TIMEOUT_SECONDS=4$/m);
assert.match(envExample, /^CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS=10$/m);
assert.match(envExample, /^CANVAS_AGENT_ATTEMPT_TIMEOUT_SECONDS=45$/m);
assert.match(envExample, /^CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS=90$/m);

["canvas-agent-capabilities.js", "canvas-agent-core.js", "canvas-agent-broker.js", "canvas-agent-mcp-protocol.js", "canvas-agent-mcp-server.js", "canvas-agent-tool-adapters.js", "canvas-agent-conversation.js", "canvas-agent-conversation-store.js", "canvas-agent-router.js", "canvas-agent-llm-connectors.js", "canvas-agent-model-adapters.js", "canvas-agent-runtime.js", "canvas-agent-ui.js", "canvas-agent.css"].forEach((filename) => {
  assert.match(portableBuild, new RegExp(`\\b${filename.replaceAll(".", "\\.")}\\b`), `portable build should copy ${filename}`);
});
assert.match(portableBuild, /for %%D in \([^\r\n]*\bskills\b[^\r\n]*\) do \(/);

const catalog = runtime.loadCanvasSkills(skillsDirectory);
assert.equal(catalog.core.id, "canvas-agent-core");
assert.equal(catalog.core.canvas.hidden, true);
const skills = catalog.business;
assert.deepEqual(skills.map((skill) => skill.id).sort(), [
  "ecommerce-image-set",
  "image-to-video",
  "poster-design",
  "product-refinement",
  "social-media-pack",
]);

skills.forEach((skill) => {
  assert.ok(skill.description.length >= 10, `${skill.id} should have a useful description`);
  assert.ok(skill.instructions.length >= 120, `${skill.id} should contain an executable workflow`);
  assert.ok(skill.canvas.capabilities.length >= 2, `${skill.id} should declare its capabilities`);
  assert.ok(skill.canvas.label.length >= 2, `${skill.id} should have a user-facing label`);
});

const ecommerce = skills.find((skill) => skill.id === "ecommerce-image-set");
assert.equal(ecommerce.canvas.required_selection, "image");
assert.deepEqual(ecommerce.canvas.capabilities, [
  "node.image.create",
  "node.gallery.create",
  "node.update",
  "node.connect",
  "node.arrange",
  "node.run",
]);
assert.match(ecommerce.instructions, /三张/);
assert.match(ecommerce.instructions, /主图/);
assert.match(ecommerce.instructions, /卖点图/);
assert.match(ecommerce.instructions, /场景图/);

console.log("Canvas agent server checks passed.");
