const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const agentUi = fs.readFileSync(path.join(__dirname, "..", "canvas-agent-ui.js"), "utf8");
const routing = fs.readFileSync(path.join(__dirname, "..", "image-model-routing.js"), "utf8");
const generatorNode = fs.readFileSync(path.join(__dirname, "..", "canvas-generator-node-renderer.js"), "utf8");

assert.match(script, /async function resolveCanvasImageFailoverCandidate\(/);
assert.match(script, /ensureCanvasImageModelsCurrent/);
assert.match(script, /canvasImageModelsRequiredRevision/);
assert.match(routing, /function isConfiguredCandidate\(/);
assert.match(routing, /function isHealthyCandidate\(/);
assert.match(routing, /api\.hyhawang\.com/);
assert.match(script, /selectFallbackCandidate/);
assert.match(script, /function isCanvasImageFailoverError\(/);
assert.match(script, /image_api_upstream_rejected/);
assert.match(script, /async function prepareCanvasImageNodeCandidate\(/);
assert.match(script, /CanvasImageModelRouting\?\.shouldReplaceCandidate/);
assert.match(script, /const IMAGE_JOBS_API_URL = "\/api\/image-jobs"/);
assert.match(script, /async function createCanvasImageJob\(/);
assert.match(script, /创建生图任务时连接中断[\s\S]{0,300}image_job_result_unknown/);
assert.match(script, /async function waitForCanvasImageJob\(/);
assert.match(script, /function resumeCanvasImageNodeJob\(/);
assert.match(script, /base\.imageJobId = node\.dataset\.imageJobId/);
assert.match(script, /item\.imageJobId[\s\S]{0,300}resumeCanvasImageNodeJob/);
assert.match(script, /job\.state\s*===\s*"sync_failed"/);
assert.match(script, /recoverCanvasImageJob/);
assert.match(script, /image_sync_failed/);
assert.match(script, /autoFailover:\s*true/);
assert.match(script, /fallback\s*\|\|=\s*\{\s*from:/);
assert.match(agentUi, /runCanvasImageEdit", node, \{ autoFailover: true \}/);
assert.match(generatorNode, /runCanvasImageEdit\(node, \{ autoFailover: true \}\)/);
assert.match(routing, /available\.find\(\(candidate\) => isHealthyCandidate/);

console.log("Canvas Agent image failover checks passed.");
