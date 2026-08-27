const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const uiPath = path.join(ROOT, "canvas-agent-ui.js");
const cssPath = path.join(ROOT, "canvas-agent.css");
assert.ok(fs.existsSync(uiPath), "canvas-agent-ui.js should exist");
assert.ok(fs.existsSync(cssPath), "canvas-agent.css should exist");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const ui = fs.readFileSync(uiPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const mainScript = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

const renderMessageSource = ui.slice(
  ui.indexOf("function renderCanvasAgentMessage"),
  ui.indexOf("function showCanvasAgentWaiting"),
);
assert.match(renderMessageSource, /role\s*===\s*"user"[\s\S]{0,120}setAttribute\("aria-label",\s*"用户消息"\)/);
assert.match(renderMessageSource, /if\s*\(role\s*!==\s*"user"\)[\s\S]{0,80}message\.append\(label\)/);
assert.doesNotMatch(renderMessageSource, /role\s*===\s*"user"\s*\?\s*"你"/);

const userMessageRule = css.match(/\.canvas-agent-message\.is-user\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(userMessageRule, /width:\s*fit-content/);
assert.match(userMessageRule, /min-width:\s*88px/);
assert.match(userMessageRule, /max-width:\s*82%/);
assert.match(userMessageRule, /border:\s*1px\s+solid/);
assert.match(userMessageRule, /border-radius:\s*14px\s+14px\s+5px\s+14px/);
assert.match(userMessageRule, /color:\s*#(?:2b2b2f|2c2c30)/i);
assert.doesNotMatch(userMessageRule, /var\(--accent/);
const darkUserMessageRule = css.match(/:root\[data-theme="dark"\]\s+\.canvas-agent-message\.is-user\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(darkUserMessageRule, /background:\s*rgba\(255,\s*255,\s*255,/);
assert.match(darkUserMessageRule, /color:\s*#(?:ededf0|f0f0f2)/i);

const coreIndex = html.indexOf("./canvas-agent-core.js");
const brokerIndex = html.indexOf("./canvas-agent-broker.js");
const mcpProtocolIndex = html.indexOf("./canvas-agent-mcp-protocol.js");
const mcpServerIndex = html.indexOf("./canvas-agent-mcp-server.js");
const conversationIndex = html.indexOf("./canvas-agent-conversation.js");
const scriptIndex = html.indexOf("./script.js");
const adaptersIndex = html.indexOf("./canvas-agent-tool-adapters.js");
const uiIndex = html.indexOf("./canvas-agent-ui.js");
assert.ok(coreIndex >= 0, "canvas agent core should be loaded in index.html");
assert.ok(brokerIndex > coreIndex, "canvas agent Broker should load after core");
assert.ok(mcpProtocolIndex > brokerIndex, "MCP protocol should load after the Broker");
assert.ok(mcpServerIndex > mcpProtocolIndex, "canvas MCP server should load after the protocol");
assert.ok(conversationIndex > mcpServerIndex, "conversation helpers should load after MCP modules");
assert.ok(conversationIndex > coreIndex, "canvas agent conversation helpers should load after core");
assert.ok(scriptIndex > conversationIndex, "main canvas script should load after conversation helpers");
assert.ok(scriptIndex > coreIndex, "main canvas script should load after canvas agent core");
assert.ok(adaptersIndex > scriptIndex, "tool adapters should load after the main canvas API");
assert.ok(uiIndex > adaptersIndex, "canvas agent UI should load after tool adapters");
assert.match(html, /<link[^>]+href="\.\/canvas-agent\.css/);
assert.match(html, /canvas-agent\.css\?v=20260824-agent-image-choice/);
assert.match(html, /canvas-agent-ui\.js\?v=20260824-agent-image-choice/);
assert.match(mainScript, /function ensureCanvasBoardIdentity/);
assert.match(mainScript, /canvas:board-changed/);

[
  "canvasAgentPanel",
  "canvasAgentToggle",
  "canvasAgentSkills",
  "canvasAgentMessages",
  "canvasAgentForm",
  "canvasAgentPrompt",
  "canvasAgentStop",
  "canvasAgentApprove",
  "canvasAgentDecline",
  "canvasAgentContext",
  "canvasAgentSkillBook",
  "canvasAgentSkillPopover",
  "canvasAgentMentionPopover",
  "canvasAgentAttach",
  "canvasAgentFileInput",
].forEach((id) => assert.match(
  ui,
  new RegExp(`(?:id=["']${id}["']|\\.id\\s*=\\s*["']${id}["'])`),
  `UI should create #${id}`,
));

assert.doesNotMatch(ui, /switch\s*\(name\)/);
assert.match(ui, /CanvasAgentBroker\.createBroker/);
assert.match(ui, /CanvasAgentMcpServer\.createCanvasMcpSession/);
assert.match(ui, /CanvasAgentToolAdapters\.create/);
assert.match(ui, /state\.mcp\.callTool\(call\)/);
assert.doesNotMatch(ui, /state\.broker\.execute\(/);
assert.match(ui, /CanvasAgentCore\.buildApprovalPlan/);
assert.match(ui, /paidAllowances:\s*state\.currentRun\.paidAllowances/);
assert.match(ui, /CanvasAgentCore\.consumePaidAllowances/);
assert.match(ui, /authorizedCalls/);
assert.match(ui, /active_skill_id:\s*state\.currentRun\.activeSkillId/);
assert.match(ui, /activated_skill_id/);
assert.match(ui, /callIds/);
assert.match(ui, /code:\s*["']user_declined["']/);
assert.match(ui, /function declineCanvasAgentTools/);
assert.doesNotMatch(ui, /approvedPaidTools\s*=/);
assert.match(ui, /AbortController/);
assert.match(ui, /Accept:\s*["']application\/x-ndjson/);
assert.match(ui, /function readCanvasAgentEventStream/);
assert.match(ui, /buffer\.length\s*>\s*MAX_AGENT_EVENT_LINE_CHARS/);
assert.match(ui, /reader\.cancel\(\)/);
assert.match(ui, /reader\.releaseLock/);
assert.match(ui, /AGENT_STAGE_ARIA_LABELS/);
assert.match(ui, /run_id:\s*runId/);
assert.match(ui, /completedToolOutputs:\s*new Map\(\)/);
assert.match(ui, /getCanvasAgentToolExecutionKey/);
assert.match(ui, /const uncompletedCalls = calls\.filter/);
assert.match(ui, /buildApprovalPlan\(uncompletedCalls/);
assert.match(ui, /function getCanvasAgentToolCallFingerprint/);
assert.match(ui, /function getCompletedCanvasAgentToolCall/);
assert.match(ui, /code:\s*"call_id_conflict"/);
assert.match(ui, /status\s*=\s*"stopped"/);
assert.match(ui, /localStorage\.setItem/);
assert.match(ui, /paidAllowances:\s*\{\s*\.\.\.\(state\.currentRun\.paidAllowances/);
assert.match(ui, /interrupted/);
assert.match(ui, /\/api\/canvas-agent\/skills/);
assert.match(ui, /\/api\/canvas-agent\/turn/);
assert.match(ui, /\/api\/canvas-agent\/cancel/);
assert.match(ui, /\/api\/canvas-agent\/conversation/);
assert.match(ui, /CanvasAgentConversation/);
assert.match(ui, /addEventListener\("canvas:board-changed"/);
assert.match(ui, /ensureCanvasBoardIdentity/);
assert.match(ui, /buildTranscript/);
assert.match(ui, /conversation_context:/);
assert.match(ui, /board_id:/);
assert.match(ui, /function loadCanvasAgentConversation/);
assert.match(ui, /function saveCanvasAgentConversation/);
assert.match(ui, /function getCanvasAgentUserFacingError/);
assert.match(ui, /function isCanvasAgentRecoverableError/);
assert.match(ui, /failed to fetch\|networkerror\|load failed/i);
assert.match(ui, /function tryCanvasAgentDirectImageFallback/);
assert.match(ui, /CanvasAgentCore\.parseDirectImageFallbackIntent/);
const initialRunSource = ui.slice(
  ui.indexOf("async function startCanvasAgentRun"),
  ui.indexOf("async function tryCanvasAgentDirectImageFallback"),
);
assert.ok(
  initialRunSource.lastIndexOf("await handleCanvasAgentTurn(turn, runId)") > initialRunSource.indexOf("handleCanvasAgentFailure(error, runId)"),
  "direct-image fallback must only wrap acquisition of the initial LLM turn",
);
assert.match(ui, /summarizeCanvasBoard\(window\.serializeCanvasBoard\(\), selectedIds\)/);
assert.match(ui, /terminalToolRun/);
assert.match(ui, /name:\s*["']generate_image_to_gallery["']/);
assert.match(ui, /state\.mcp\.callTool\(call\)/);
assert.match(ui, /data-agent-continue/);
assert.doesNotMatch(ui, /id="canvasAgentNew"/);
assert.doesNotMatch(ui, /resetCanvasAgentRun\(\{\s*keepMessages:\s*false\s*\}\)/);
assert.match(ui, /function cancelCanvasAgentServerRun/);
assert.match(ui, /state\.broker\.invalidate/);
assert.match(ui, /keepalive:\s*true/);
assert.match(
  ui,
  /setCanvasAgentOpen\(localStorage\.getItem\(PANEL_STORAGE_KEY\)\s*===\s*"true",\s*false\)/,
  "the Agent panel should be collapsed until the user has explicitly opened it",
);
assert.match(ui, /function showCanvasAgentWaiting/);
assert.match(ui, /function removeCanvasAgentWaiting/);
assert.match(ui, /function isCanvasAgentRunActive/);
assert.match(ui, /function createCanvasAgentAbortError/);
assert.match(ui, /data-run-id/);
assert.match(ui, /aria-label",\s*"Agent 正在回应"/);
assert.match(ui, /panel\.inert\s*=\s*!open/);
assert.match(ui, /panel\.setAttribute\("aria-hidden",\s*String\(!open\)\)/);
assert.doesNotMatch(ui, /setCanvasAgentStatus\("Agent 正在处理…"\)/);
assert.doesNotMatch(ui, /canvasAgentModel/);
assert.match(ui, /generate_image_to_gallery:\s*"生成图片并创建图集"/);
assert.match(ui, /request_image_node_choice:\s*"定位相关生图节点"/);
assert.match(ui, /focus_canvas_nodes:\s*"定位画布节点"/);
assert.match(ui, /organize_canvas_nodes:\s*"整理画布节点"/);
assert.match(ui, /crop_canvas_image:\s*"裁切图片"/);
assert.match(ui, /open_canvas_mask_editor:\s*"打开遮罩编辑器"/);
assert.match(ui, /data-agent-image-choice/);
assert.match(ui, /function showCanvasAgentImageChoice/);
assert.match(ui, /function chooseCanvasAgentImageAction/);
assert.match(ui, /decision_required/);
assert.match(ui, /run_canvas_node:\s*1/);
assert.doesNotMatch(ui, /gpt-5\.6-terra/);
assert.doesNotMatch(ui, /setInterval\([^)]*(?:provider|health)/i);
assert.match(ui, /vision_images/);
assert.match(ui, /canvas\.toBlob/);
const visionCompression = ui.slice(ui.indexOf("function compressCanvasAgentImage"), ui.indexOf("function addCanvasAgentMessage"));
assert.doesNotMatch(visionCompression, /toDataURL/);
assert.match(ui, /window\.serializeCanvasBoard/);
assert.doesNotMatch(ui, /selectCanvasAgentSkill\(state\.skills\[0\]\.id\)/);
assert.doesNotMatch(ui, /请先选择一个 Skill/);
assert.doesNotMatch(ui, /这个 Skill 需要先/);
assert.match(ui, /skill_mode:\s*skill\s*\?\s*"manual"\s*:\s*"auto"/);
assert.match(ui, /addEventListener\("canvas:selectionchange"/);
assert.match(ui, /CanvasAgentCore\.normalizeAgentReferences/);
assert.match(ui, /data-agent-context-key/);
assert.match(ui, /mentionedNodeIds:\s*new Set\(\)/);
assert.match(ui, /excludedNodeIds:\s*new Set\(\)/);
assert.match(ui, /attachCanvasAgentFiles/);
assert.match(ui, /window\.uploadCanvasImageFile/);
assert.match(ui, /window\.addCanvasImage/);
assert.match(mainScript, /new CustomEvent\("canvas:selectionchange"/);
assert.match(mainScript, /selectedIds:\s*getSelectedCanvasNodes\(\)\.map/);
assert.match(mainScript, /type:\s*"grid-editor"[\s\S]{0,180}url:\s*state\.sourceSrc/);
assert.match(mainScript, /SETTINGS_AGENT_CANDIDATES_API_URL/);
assert.match(mainScript, /function loadAgentRoutingCandidates/);
assert.match(mainScript, /data-settings-tab="agent-models"/);
assert.match(mainScript, /data-settings-panel="agent-models"/);
assert.match(mainScript, /function renderAgentModelSettings/);
assert.match(mainScript, /当前主模型/);
assert.match(mainScript, /备用顺序/);
assert.match(mainScript, /待验证/);
assert.match(mainScript, /data-settings-action="set-agent-primary"/);
assert.match(mainScript, /data-settings-action="clear-agent-primary"/);
assert.doesNotMatch(mainScript, /data-settings-agent-routing/);
assert.doesNotMatch(mainScript, /速度优先|均衡推荐|稳定优先/);
assert.match(mainScript, /data-settings-action="refresh-agent-candidates"/);
assert.match(mainScript, /item\.endpoint/);
assert.match(mainScript, /data-agent-candidate-verify/);
assert.match(mainScript, /function scheduleAgentAutoVerification/);
assert.match(mainScript, /agentAutoVerificationActive/);
assert.match(mainScript, /function isAgentModelsSettingsVisible/);
assert.match(mainScript, /function beginAgentAutoVerificationSession/);
assert.match(mainScript, /function stopAgentAutoVerificationSession/);
assert.match(mainScript, /agentAutoVerificationAbortController\?\.abort\(\)/);
assert.match(mainScript, /options\.verificationEpoch !== agentAutoVerificationEpoch/);
assert.match(mainScript, /CanvasAgentVerification\.selectAutoVerificationTargets/);
assert.match(mainScript, /refresh:\s*true/);
assert.match(mainScript, /agentRouting/);
assert.match(mainScript, /function snapshotAgentRoutingDraft/);
assert.match(mainScript, /candidateOrder/);
assert.match(mainScript, /needsReconfiguration/);
assert.match(mainScript, /需要在这台电脑重新设置 API/);
const imageGenerationSource = mainScript.slice(
  mainScript.indexOf("async function generateAgentCanvasImageToGallery"),
  mainScript.indexOf("function requestAgentImageNodeChoice"),
);
assert.match(
  imageGenerationSource,
  /await ensureCanvasAgentImageModelCandidate\([\s\S]*?\);\s*assertCanvasAgentContext\(context\);\s*if \(!candidate\)/,
  "the active board must be rechecked after asynchronous image-model discovery and before creating nodes",
);
const saveSettingsSource = mainScript.slice(
  mainScript.indexOf("async function saveSettingsCenter"),
  mainScript.indexOf("function getActiveSettingsProvider"),
);
assert.match(saveSettingsSource, /snapshotAgentRoutingDraft/);
assert.match(styles, /\.agent-routing-card/);
assert.match(styles, /\.agent-candidate-row/);
const settingsClickSource = mainScript.slice(
  mainScript.indexOf("async function handleSettingsClick"),
  mainScript.indexOf("async function toggleSettingsProviderKeyVisibility"),
);
assert.ok(
  settingsClickSource.indexOf('closest("[data-agent-candidate-verify]")')
    < settingsClickSource.indexOf('closest("[data-provider-id]")'),
  "Agent verification must be handled before the generic provider selector",
);

assert.match(css, /\.canvas-agent-panel/);
assert.match(css, /\.canvas-workspace\.canvas-agent-open\s+\.infinite-canvas/);
assert.match(css, /@media\s*\(max-width:\s*900px\)/);
assert.match(css, /:root\[data-theme="dark"\]\s+\.canvas-agent-panel/);
assert.match(css, /\.canvas-agent-context/);
assert.match(css, /\.canvas-agent-popover/);
assert.match(css, /\.canvas-agent-form\.is-drag-over/);
assert.match(css, /\.canvas-agent-waiting-bars/);
assert.match(css, /\.canvas-agent-waiting-bar/);
assert.match(css, /\.canvas-agent-image-choice/);
assert.match(css, /\.canvas-agent-image-choice-actions/);
assert.match(css, /@keyframes\s+canvasAgentWaitingBar/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /\.canvas-agent-panel\s*\{[\s\S]*?pointer-events:\s*none;/);
assert.match(css, /\.canvas-workspace\.canvas-agent-open\s+\.canvas-agent-panel\s*\{[\s\S]*?pointer-events:\s*auto;/);

const compactCss = css.replace(/\s+/g, " ");
assert.match(
  compactCss,
  /\.canvas-agent-panel\s*>\s*\*\s*\{[^}]*min-width:\s*0;/,
  "panel grid children should be allowed to shrink inside the fixed-width panel",
);
assert.match(
  compactCss,
  /\.canvas-agent-skills\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;/,
  "skills should use a contained vertical list instead of widening the panel",
);
assert.match(
  compactCss,
  /\.canvas-agent-skill\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/,
  "skill cards should fit the available panel width",
);

console.log("Canvas agent UI checks passed.");
