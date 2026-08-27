const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ui = fs.readFileSync(path.join(ROOT, "canvas-agent-ui.js"), "utf8");
const router = fs.readFileSync(path.join(ROOT, "canvas-agent-router.js"), "utf8");
const runtime = fs.readFileSync(path.join(ROOT, "canvas-agent-runtime.js"), "utf8");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const mainScript = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const portable = fs.readFileSync(path.join(ROOT, "build-portable.bat"), "utf8");
const mcpProtocol = fs.readFileSync(path.join(ROOT, "canvas-agent-mcp-protocol.js"), "utf8");
const mcpServer = fs.readFileSync(path.join(ROOT, "canvas-agent-mcp-server.js"), "utf8");

assert.doesNotMatch(ui, /addEventListener\(["'](?:pointermove|wheel|mousemove)["']/);
assert.doesNotMatch(ui, /setInterval\(/);
assert.match(ui, /collectCanvasAgentVisionImages/);
assert.match(ui, /slice\(0,\s*3\)/);
assert.match(ui, /256\s*\*\s*1024/);
assert.match(ui, /requestAnimationFrame/);
assert.match(router, /historyLimit:\s*50/);
assert.match(runtime, /1024\s*\*\s*1024/);
assert.match(server, /CANVAS_AGENT_MAX_SESSIONS\s*=\s*100/);
assert.match(server, /CANVAS_AGENT_SESSION_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
assert.match(server, /transcript\.slice\(-36\)/);
assert.match(server, /setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,160}flushCanvasAgentRouteEvents/);
assert.doesNotMatch(server, /queueCanvasAgentRouteEvent[\s\S]{0,600}writeProviderMonitoringFile/);
assert.match(mainScript, /activeSettingsTab\s*===\s*"agent-models"/);
assert.doesNotMatch(mainScript, /if\s*\(activeSettingsTab\s*===\s*"api"\)\s*\{[^}]*loadAgentRoutingCandidates/);
assert.match(server, /Math\.min\(4,\s*queue\.length\)/);
assert.match(portable, /canvas-agent-router\.js/);
assert.match(portable, /canvas-agent-mcp-protocol\.js/);
assert.match(portable, /canvas-agent-mcp-server\.js/);
assert.match(portable, /canvas-agent-llm-connectors\.js/);
assert.doesNotMatch(mcpProtocol, /\bfetch\s*\(|WebSocket|setInterval\s*\(|addEventListener\s*\(\s*["'](?:pointermove|wheel|mousemove)/);
assert.doesNotMatch(mcpServer, /\bfetch\s*\(|WebSocket|setInterval\s*\(|addEventListener\s*\(\s*["'](?:pointermove|wheel|mousemove)/);

console.log("Canvas agent performance checks passed.");
