const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../canvas-agent-runtime");
const { collectPortablePackageManifest } = require("./portable-package-manifest");

const ROOT = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
// Server configuration and its defaults moved into server-config.js; the entry
// file only re-exports the values, so config-level assertions read that file.
const serverConfig = fs.readFileSync(path.join(ROOT, "server-config.js"), "utf8");
const skillHttpApi = fs.readFileSync(path.join(ROOT, "skill-http-api.js"), "utf8");
const canvasAgentHttpApi = fs.readFileSync(path.join(ROOT, "canvas-agent-http-api.js"), "utf8");
const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
const portableBuild = fs.readFileSync(path.join(ROOT, "build-portable.bat"), "utf8");
const portableManifest = collectPortablePackageManifest(ROOT);
const skillsDirectory = path.join(ROOT, "skills");

assert.match(server, /require\("\.\/canvas-agent-runtime"\)/);
assert.match(server, /require\("\.\/canvas-agent-router"\)/);
assert.match(server, /require\("\.\/canvas-agent-provider-bridge"\)/);
assert.match(serverConfig, /CANVAS_AGENT_MODEL\s*=\s*env\.CANVAS_AGENT_MODEL\s*\|\|\s*"gpt-5\.6-sol"/);
assert.match(server, /CANVAS_AGENT_REASONING_EFFORT/);
assert.match(server, /CANVAS_AGENT_API_URL/);
assert.match(server, /CANVAS_AGENT_API_KEY/);
assert.match(skillHttpApi, /\/api\/canvas-agent\/skills/);
assert.match(server, /require\("\.\/canvas-agent-http-api"\)/);
assert.match(canvasAgentHttpApi, /pathname === "\/api\/canvas-agent\/turn"[\s\S]{0,80}req\.method === "POST"/);
assert.match(skillHttpApi, /async function handleAgentCatalog/);
assert.doesNotMatch(skillHttpApi, /handleAgentCatalog[\s\S]{0,260}\bmodel:\s*CANVAS_AGENT_MODEL/);
assert.match(skillHttpApi, /const agentSettings = agentModelSettings\.get\(\)/);
assert.match(skillHttpApi, /configured:\s*candidates\.length\s*>\s*0/);
assert.match(skillHttpApi, /availableCount:\s*candidates\.length/);
assert.match(canvasAgentHttpApi, /async function handleTurn/);
const activeTurnSource = canvasAgentHttpApi.slice(
  canvasAgentHttpApi.indexOf("async function handleTurn"),
  canvasAgentHttpApi.indexOf("async function handleCancel"),
);
assert.match(activeTurnSource, /canvasAgentProviderBridge\.runTurn/);
assert.match(activeTurnSource, /agentModelSettings\.getRoute\(\)/);
assert.match(
  activeTurnSource,
  /candidateOrder:\s*prioritizeSessionCandidateOrder\(agentRoute\.candidateOrder,\s*session\)/,
);
assert.match(activeTurnSource, /forceFallback:\s*true/);
assert.doesNotMatch(activeTurnSource, /scopedPayload\.(?:providerId|modelId)/);
assert.match(activeTurnSource, /AGENT_MODEL_SETTINGS_UNAVAILABLE/);
assert.match(activeTurnSource, /agentSettingsUnavailable[\s\S]{0,220}error\.safeMessage/);
assert.doesNotMatch(activeTurnSource, /getCanvasAgentCandidates|executeSequentialFailover|runCanvasAgentCandidate/);
assert.doesNotMatch(activeTurnSource, /readCanvasAgentRouteHistory|getAdaptiveAgentAttemptPolicy|canvasAgentHalfOpenRoutes/);
assert.match(serverConfig, /CANVAS_AGENT_MAX_SESSIONS\s*=\s*100/);
assert.match(canvasAgentHttpApi, /requestedBoardId\s*=\s*String\(payload\.board_id\s*\|\|\s*payload\.canvas\?\.id/);
assert.match(canvasAgentHttpApi, /session\.boardId\s*!==\s*requestedBoardId/);
assert.match(canvasAgentHttpApi, /activeSkillId:\s*requestedActiveSkillId/);
assert.match(canvasAgentHttpApi, /session\.activeSkillId\s*!==\s*requestedActiveSkillId/);
assert.match(canvasAgentHttpApi, /active_skill_id:\s*String\(session\?\.activeSkillId/);
assert.match(
  canvasAgentHttpApi,
  /const skillSession\s*=\s*Boolean\(session\.activeSkillId\s*\|\|\s*session\.autoSkillId\s*\|\|\s*scopedPayload\.skill_id\)/,
  "Skill sessions must survive a final no-tool turn so the UI can enforce missing deliverables",
);
assert.match(canvasAgentHttpApi, /!turn\.tool_calls\.length\s*&&\s*!skillSession/);
assert.match(server, /LEGACY_PROVIDER_ADMIN_PATHS[\s\S]*"\/api\/settings\/agent-candidates"/);
assert.match(server, /handleRetiredProviderControlPlane/);
assert.doesNotMatch(activeTurnSource, /canvasAgentHalfOpenRoutes|CANVAS_AGENT_ROUTE_HISTORY|agentRouting|readSettingsFile/);

const providerBridge = fs.readFileSync(path.join(ROOT, "canvas-agent-provider-bridge.js"), "utf8");
assert.match(providerBridge, /executor\.stream\(request,\s*input\.onDelta\)/);
assert.match(providerBridge, /getProviderTaskRequirements/);
assert.match(providerBridge, /preferredProviderId/);
assert.match(providerBridge, /preferredModelId/);
assert.match(providerBridge, /"llm\.chat\.vision"/);
assert.match(providerBridge, /candidateOrder/);
assert.doesNotMatch(providerBridge, /health|circuit|half.?open|EWMA|routeHistory/i);

assert.match(envExample, /^CANVAS_AGENT_API_URL=/m);
assert.match(envExample, /^CANVAS_AGENT_API_KEY=/m);
assert.match(envExample, /^CANVAS_AGENT_MODEL=gpt-5\.6-sol$/m);
assert.match(envExample, /^CANVAS_AGENT_REASONING_EFFORT=medium$/m);
assert.match(envExample, /^CANVAS_AGENT_CONNECT_TIMEOUT_SECONDS=4$/m);
assert.match(envExample, /^CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS=30$/m);
assert.match(envExample, /^CANVAS_AGENT_ATTEMPT_TIMEOUT_SECONDS=45$/m);
assert.match(envExample, /^CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS=90$/m);

["agent-model-settings.js", "skill-registry.js", "canvas-agent-capabilities.js", "canvas-agent-core.js", "canvas-agent-skill-contract.js", "canvas-agent-broker.js", "canvas-agent-mcp-protocol.js", "canvas-agent-mcp-server.js", "canvas-agent-tool-adapters.js", "canvas-agent-conversation.js", "canvas-agent-conversation-store.js", "canvas-agent-router.js", "canvas-agent-llm-connectors.js", "canvas-agent-model-adapters.js", "canvas-agent-runtime.js", "canvas-agent-provider-bridge.js", "canvas-agent-ui.js", "canvas-agent.css"].forEach((filename) => {
assert.ok(portableManifest.files.includes(filename), `portable manifest should include ${filename}`);
});
assert.match(portableBuild, /(?:copy-portable-runtime|build-electron-portable)\.js/i, "portable build should use the shared runtime copier");
assert.deepEqual(portableManifest.directories, ["assets", "bundled-skills", "workflows", "skills", "desktop", "runtime", "node_modules/electron/dist"]);

const catalog = runtime.loadCanvasSkills(skillsDirectory);
assert.equal(catalog.core.id, "canvas-agent-core");
assert.equal(catalog.core.canvas.hidden, true);
assert.match(catalog.core.instructions, /修改后生成/);
assert.match(catalog.core.instructions, /新建并生成/);
assert.doesNotMatch(catalog.core.instructions, /直接再生成|三选一/);
const skills = catalog.business;
assert.deepEqual(skills.map((skill) => skill.id).sort(), [
  "analysis",
  "code",
  "describe-image",
  "ecommerce-image-set",
  "edit-image",
  "generate-image",
  "image-to-video",
  "poster-design",
  "product-refinement",
  "remove-background",
  "rewrite",
  "social-media-pack",
  "upscale-image",
  "writing",
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
