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
const focusRules = fs.readFileSync(path.join(ROOT, "canvas-agent-focus-rules.js"), "utf8");
const markdown = require("../canvas-agent-markdown");
const skillContract = require("../canvas-agent-skill-contract");

const renderMessageSource = ui.slice(
  ui.indexOf("function renderCanvasAgentMessage"),
  ui.indexOf("function showCanvasAgentWaiting"),
);
assert.doesNotMatch(
  ui,
  /node\.querySelector\("\.canvas-text"\)\.textContent\s*=/,
  "Agent node updates must preserve the text node's Markdown source contract",
);
assert.match(
  ui,
  /window\.setCanvasTextValue\(node,\s*String\(args\.content\)\)/,
  "Agent node updates must use the canvas text source setter",
);
assert.match(
  renderMessageSource,
  /role\s*===\s*"user"[\s\S]{0,320}setAttribute\([\s\S]{0,160}"aria-label",[\s\S]{0,180}"用户消息"/,
);
assert.match(renderMessageSource, /if\s*\(role\s*!==\s*"user"\)[\s\S]{0,80}message\.append\(label\)/);
assert.doesNotMatch(renderMessageSource, /role\s*===\s*"user"\s*\?\s*"你"/);
assert.match(renderMessageSource, /label\.className\s*=\s*"canvas-agent-message-label"/);
assert.match(renderMessageSource, /rendersMarkdown\s*=\s*role\s*===\s*"assistant"\s*\|\|\s*role\s*===\s*"user"/);
assert.match(renderMessageSource, /document\.createElement\(rendersMarkdown\s*\?\s*"div"\s*:\s*"p"\)/);
assert.match(renderMessageSource, /CanvasAgentMarkdown\.renderMarkdown\(rawText\)/);
assert.match(renderMessageSource, /content\.className\s*=\s*"canvas-agent-markdown"/);
assert.match(renderMessageSource, /options\.skillLabel/);
assert.match(renderMessageSource, /canvas-agent-message-skill/);
assert.match(renderMessageSource, /已加载专业流程/);

const renderedMarkdown = markdown.renderMarkdown([
  "## 品牌信息",
  "",
  "充电宝的品牌名称是什么？",
  "",
  "- **视觉风格**：写实 3D",
  "- 需要确认角色设计",
  "",
  "1. **主商品图**：上传正面图",
  "2. 确认画幅比例",
].join("\n"));
assert.match(renderedMarkdown, /<h2>品牌信息<\/h2>/);
assert.match(renderedMarkdown, /<ul><li><strong class="canvas-agent-md-title">视觉风格<\/strong>：写实 3D<\/li>/);
assert.match(renderedMarkdown, /<ol><li><strong class="canvas-agent-md-title">主商品图<\/strong>：上传正面图<\/li>/);
assert.match(markdown.renderMarkdown("```html\n<script>alert(1)</script>\n```"), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(markdown.renderMarkdown("<img src=x onerror=alert(1)>"), /<img/i);
assert.match(
  markdown.renderMarkdown("**充电宝**"),
  /<p><strong class="canvas-agent-md-title">充电宝<\/strong><\/p>/,
);

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
const userSkillRule = css.match(/\.canvas-agent-message\.is-user\s*>\s*\.canvas-agent-message-skill\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(userSkillRule, /display:\s*inline-flex/);
assert.match(userSkillRule, /max-width:\s*100%/);
assert.match(
  css,
  /\.canvas-agent-message\.is-user\s*>\s*\.canvas-agent-message-skill strong\s*\{[\s\S]{0,180}text-overflow:\s*ellipsis/,
);

const coreIndex = html.indexOf("./canvas-agent-core.js");
const focusRulesIndex = html.indexOf("./canvas-agent-focus-rules.js");
const brokerIndex = html.indexOf("./canvas-agent-broker.js");
const mcpProtocolIndex = html.indexOf("./canvas-agent-mcp-protocol.js");
const mcpServerIndex = html.indexOf("./canvas-agent-mcp-server.js");
const conversationIndex = html.indexOf("./canvas-agent-conversation.js");
const scriptIndex = html.indexOf("./script.js");
const adaptersIndex = html.indexOf("./canvas-agent-tool-adapters.js");
const uiIndex = html.indexOf("./canvas-agent-ui.js");
const markdownIndex = html.indexOf("./canvas-agent-markdown.js");
const skillContractIndex = html.indexOf("./canvas-agent-skill-contract.js");
assert.ok(coreIndex >= 0, "canvas agent core should be loaded in index.html");
assert.ok(focusRulesIndex >= 0 && focusRulesIndex < scriptIndex, "Agent focus rules should load before the main canvas script");
assert.match(focusRules, /calculateFocusTransform/);
assert.match(mainScript, /CanvasAgentFocusRules/);
assert.match(mainScript, /targetCoordinates/);
assert.match(mainScript, /canvasState\.scale\s*=\s*transform\.scale/);
assert.doesNotMatch(
  mainScript.slice(mainScript.indexOf("function focusAgentCanvasNodesInViewport"), mainScript.indexOf("function renderCanvasTextNode")),
  /setCanvasNodePoint|updateCanvasNodePosition/,
  "Agent focus must change the viewport, not node coordinates",
);
assert.ok(brokerIndex > coreIndex, "canvas agent Broker should load after core");
assert.ok(mcpProtocolIndex > brokerIndex, "MCP protocol should load after the Broker");
assert.ok(mcpServerIndex > mcpProtocolIndex, "canvas MCP server should load after the protocol");
assert.ok(conversationIndex > mcpServerIndex, "conversation helpers should load after MCP modules");
assert.ok(conversationIndex > coreIndex, "canvas agent conversation helpers should load after core");
assert.ok(skillContractIndex > coreIndex, "Skill contract rules should load after Agent core");
assert.ok(uiIndex > skillContractIndex, "Skill contract rules should load before Agent UI");
assert.ok(scriptIndex > conversationIndex, "main canvas script should load after conversation helpers");
assert.ok(scriptIndex > coreIndex, "main canvas script should load after canvas agent core");
assert.ok(adaptersIndex > scriptIndex, "tool adapters should load after the main canvas API");
assert.ok(markdownIndex > adaptersIndex && markdownIndex < uiIndex, "Agent Markdown renderer should load before the Agent UI");
assert.ok(uiIndex > adaptersIndex, "canvas agent UI should load after tool adapters");
assert.match(html, /<link[^>]+href="\.\/canvas-agent\.css/);
assert.match(html, /canvas-agent\.css\?v=20260928-skill-context/);
assert.match(html, /canvas-agent-core\.js\?v=20260920-director3d/);
assert.match(html, /canvas-agent-skill-contract\.js\?v=20260928-skill-manifest/);
assert.match(html, /canvas-agent-markdown\.js\?v=20260928-agent-resize/);
assert.match(html, /canvas-agent-ui\.js\?v=20260928-skill-manifest/);
assert.match(html, /agent=20260928-skill-manifest/, "script.js cache key should bump when the canvas agent API changes");
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
assert.match(ui, /CanvasAgentSkillContract/);
assert.match(ui, /function createCanvasAgentSkillContract/);
assert.match(ui, /function applyCanvasAgentSkillContractGuard/);
assert.match(ui, /function tryContinueCanvasAgentForSkillViolation/);
assert.match(ui, /function restoreCanvasAgentSkillContract/);
assert.match(ui, /skill_contract_retry:\s*true/);
assert.match(ui, /CanvasAgentSkillContract\.inspectCompletion/);
assert.match(ui, /CanvasAgentSkillContract\.buildToolViolationOutput/);
assert.match(ui, /finishCanvasAgentRun\("needs-revision"/);
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
assert.match(ui, /const lastRecoverableIndex = items\.reduce/);
assert.match(ui, /function removeCanvasAgentContinueActions/);
assert.match(ui, /recoverable:\s*item\.status === "recoverable" && index === lastRecoverableIndex/);
assert.match(ui, /completedToolOutputs:\s*new Map\(\)/);
assert.match(ui, /getCanvasAgentToolExecutionKey/);
assert.match(ui, /const uncompletedCalls = calls\.filter/);
assert.match(ui, /buildApprovalPlan\(uncompletedCalls/);
assert.match(ui, /function getCanvasAgentToolCallFingerprint/);
assert.match(ui, /function getCompletedCanvasAgentToolCall/);
assert.match(ui, /code:\s*"call_id_conflict"/);
assert.match(ui, /CanvasAgentCore\.shouldBlockCanvasToolForDiscussion/);
assert.match(ui, /code:\s*"discussion_only"/);
assert.match(ui, /status\s*=\s*"stopped"/);
assert.match(ui, /localStorage\.setItem/);
assert.match(ui, /paidAllowances:\s*\{\s*\.\.\.\(state\.currentRun\.paidAllowances/);
assert.match(ui, /skillContract:\s*restoreCanvasAgentSkillContract\(state\.currentRun\.skillContract\)/);
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
assert.match(ui, /function isCanvasAgentThinkingReplayError/);
assert.match(ui, /reasoning_content\|thinking mode/i);
assert.match(ui, /function scheduleCanvasAgentRecovery/);
assert.match(ui, /function resumeCanvasAgentRecovery/);
assert.match(ui, /CanvasAgentCore\.shouldAutoRecoverCanvasAgent/);
assert.match(ui, /CanvasAgentCore\.getCanvasAgentRecoveryDelay/);
assert.match(ui, /CanvasAgentCore\.getCanvasAgentRecoveryPaidAllowances/);
assert.match(ui, /CanvasAgentCore\.getSelectedImageEditGenerationAllowance/);
assert.match(ui, /function getSelectedCanvasImageReferenceNodeIds/);
assert.match(ui, /function normalizeCanvasAgentImageEditCall/);
assert.match(ui, /const initialPaidAllowances\s*=\s*selectedImageEditAllowance\s*\?\s*\{\s*generate_image_to_gallery:\s*selectedImageEditAllowance\s*\}\s*:\s*trustedPaidAllowances/);
assert.match(ui, /state\.recovery\?\.completedToolOutputs/);
assert.match(ui, /completedToolOutputs\.set\(fingerprint,\s*output\)/);
assert.match(ui, /网络波动，正在自动恢复/);
assert.match(ui, /failed to fetch\|networkerror\|load failed/i);
assert.match(ui, /function tryCanvasAgentDirectImageFallback/);
assert.match(ui, /CanvasAgentCore\.parseDirectImageFallbackIntent/);
assert.match(ui, /allowNewWithReusableGenerator:\s*true/);
assert.match(ui, /Number\(run\.paidAllowances\?\.generate_image_to_gallery\s*\|\|\s*0\)\s*<\s*1/);
const initialRunSource = ui.slice(
  ui.indexOf("async function startCanvasAgentRun"),
  ui.indexOf("async function tryCanvasAgentDirectImageFallback"),
);
assert.match(
  initialRunSource,
  /try\s*\{\s*await handleCanvasAgentTurn\(turn,\s*runId\);\s*\}\s*catch\s*\(error\)\s*\{[\s\S]{0,260}tryCanvasAgentDirectImageFallback\(error,\s*runId\)/,
  "an explicit image run must try the local image fallback when a tool-result continuation fails",
);
assert.match(ui, /summarizeCanvasBoard\(window\.serializeCanvasBoard\(\), selectedIds\)/);
assert.match(ui, /terminalToolRun/);
assert.match(ui, /result\.parameter_adjustment\?\.message/);
assert.match(ui, /parameterAdjustmentMessage[\s\S]{0,240}completedMessage/);
assert.match(ui, /name:\s*["']generate_image_to_gallery["']/);
assert.match(ui, /state\.mcp\.callTool\(call\)/);
assert.match(ui, /data-agent-continue/);
assert.match(ui, /action\.textContent\s*=\s*"重新尝试"/);
assert.doesNotMatch(ui, /action\.textContent\s*=\s*"继续任务"/);
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
assert.doesNotMatch(ui, /id="canvasAgentModel"/);
assert.doesNotMatch(ui, /id="canvasAgentModelsRefresh"/);
assert.doesNotMatch(ui, /modelSelectionsByBoard/);
assert.doesNotMatch(ui, /\.\.\.state\.currentRun\.modelSelection/);
assert.doesNotMatch(ui, /providerId:\s*scopedPayload\.providerId|modelId:\s*scopedPayload\.modelId/);
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
const imageChoiceSource = ui.slice(
  ui.indexOf("function showCanvasAgentImageChoice"),
  ui.indexOf("async function continueCanvasAgentWithToolOutputs"),
);
assert.match(imageChoiceSource, /\["update",\s*"修改后生成"/);
assert.match(imageChoiceSource, /\["new",\s*"新建并生成"/);
assert.doesNotMatch(imageChoiceSource, /\["rerun"|rerun:/);
assert.match(mainScript, /options:\s*\["update",\s*"new"\]/);
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
assert.match(
  ui,
  /addCanvasAgentMessage\("user",\s*prompt,\s*\{[\s\S]{0,180}skillLabel:\s*skill\?\.label\s*\|\|\s*""[\s\S]{0,100}skillSource:\s*skill\s*\?\s*"manual"\s*:\s*""/,
  "手动选择的 Skill 必须随用户消息写入会话记录",
);
assert.match(ui, /skillId:\s*item\.skillId/);
assert.equal(skillContract.classifySkillStage("ai-video-director", "跑一下这个故事脚本"), "script");
assert.equal(skillContract.classifySkillStage("ai-video-director", "根据脚本拆主镜头"), "general");
assert.match(ui, /skillLabel:\s*item\.skillLabel/);
assert.match(ui, /skillSource:\s*item\.skillSource/);
// 技能书只列用户自己安装的功能 Skill；系统 Skill 靠路由自动匹配，不需要用户手挑。
assert.match(ui, /state\.pickerSkills\s*=\s*Array\.isArray\(data\.pickerSkills\)/);
assert.match(ui, /state\.skills\.filter\(\(skill\)\s*=>\s*skill\.origin\s*===\s*"custom"\)/);
assert.match(ui, /const pickerSkills = Array\.isArray\(state\.pickerSkills\) \? state\.pickerSkills : \[\]/);
assert.match(ui, /const groupId = skill\.packageId \|\| "custom:standalone"/, "技能书必须按功能 Skill 安装包分组");
assert.match(ui, /dataset\.agentSkillGroup = group\.id/, "技能书必须渲染独立的分组容器");
assert.match(ui, /canvas-agent-skill-empty/);
assert.match(ui, /系统 Skill 会按需求自动匹配/);
assert.match(ui, /系统 Skill 会按你的需求自动匹配，不需要在这里选。/);
// 总闸门只留一句中文提示，不为它渲染工具步骤，也不写进会话记录。
const callBatchSource = ui.slice(
  ui.indexOf("async function executeCanvasAgentCallBatch"),
  ui.indexOf("function recordCanvasAgentRunToolResult"),
);
assert.match(callBatchSource, /const isSkillGate = call\.name === "activate_canvas_skill"/);
assert.match(callBatchSource, /const isCachedSkillReference = call\.name === "read_skill_reference"/);
assert.match(callBatchSource, /const step = isSkillGate \|\| isCachedSkillReference \? null : addCanvasAgentToolStep\(call\)/);
assert.equal(
  (callBatchSource.match(/[;{\n]\s*persistCanvasAgentToolResult\(/g) || []).length,
  0,
  "every persisted tool result must be guarded against the skill gate",
);
assert.equal(
  (callBatchSource.match(/if \(!isSkillGate && !isCachedSkillReference\) persistCanvasAgentToolResult\(/g) || []).length,
  3,
  "completed, conflict and blocked Skill-gate branches should skip cached references",
);
assert.match(callBatchSource, /CanvasAgentSkillContract\.inspectToolCall/, "节点写入前必须执行 Skill 契约闸门");
assert.equal(
  (callBatchSource.match(/if \(!isSkillGate && !cacheHit\) persistCanvasAgentToolResult\(/g) || []).length,
  1,
  "fresh tool results should still be persisted",
);
assert.match(callBatchSource, /output\?\.cached === true/);
assert.match(callBatchSource, /已启用专业流程：\$\{output\.activated_skill_label\}/);
assert.match(ui, /已匹配专业流程：\$\{String\(turn\?\.auto_skill_label/);
assert.match(ui, /addEventListener\("canvas:selectionchange"/);
assert.match(ui, /CanvasAgentCore\.normalizeAgentReferences/);
assert.match(ui, /data-agent-context-key/);
assert.match(ui, /mentionedNodeIds:\s*new Set\(\)/);
assert.match(ui, /excludedNodeIds:\s*new Set\(\)/);
assert.match(ui, /attachCanvasAgentFiles/);
assert.match(ui, /window\.uploadCanvasImageFile/);
assert.match(ui, /window\.addCanvasImage/);
assert.match(mainScript, /new CustomEvent\("canvas:selectionchange"/);
assert.match(mainScript, /selectedIds:\s*Array\.from\(canvasState\.selectedIds\)/);
assert.match(mainScript, /type:\s*"grid-editor"[\s\S]{0,180}url:\s*state\.sourceSrc/);
assert.match(mainScript, /function fillCanvasLlmModelSelect/);
const llmSelectSource = mainScript.slice(
  mainScript.indexOf("function fillCanvasLlmModelSelect"),
  mainScript.indexOf("function refreshCanvasLlmModelSelects"),
);
assert.match(llmSelectSource, /modelId/);
assert.doesNotMatch(llmSelectSource, /getModelDisplayName/);
const imageGenerationSource = mainScript.slice(
  mainScript.indexOf("async function generateAgentCanvasImageToGallery"),
  mainScript.indexOf("function requestAgentImageNodeChoice"),
);
assert.match(
  imageGenerationSource,
  /await ensureCanvasAgentImageModelCandidate\([\s\S]*?\);\s*assertCanvasAgentContext\(context\);\s*if \(!candidate\)/,
  "the active board must be rechecked after asynchronous image-model discovery and before creating nodes",
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
assert.match(css, /\.canvas-agent-markdown/);
assert.match(css, /\.canvas-agent-markdown h1/);
assert.match(css, /\.canvas-agent-markdown ul/);
assert.match(css, /\.canvas-agent-table-wrap/);
assert.match(css, /\.canvas-agent-md-title/);
assert.match(css, /\.canvas-agent-message > \.canvas-agent-message-label/);
assert.match(css, /\.canvas-agent-message\.is-user\s+\.canvas-agent-markdown/);
assert.doesNotMatch(css, /\.canvas-agent-message\s+strong\s*\{/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /\.canvas-agent-panel\s*\{[\s\S]*?pointer-events:\s*none;/);
assert.match(css, /\.canvas-workspace\.canvas-agent-open\s+\.canvas-agent-panel\s*\{[\s\S]*?pointer-events:\s*auto;/);
assert.match(ui, /id="canvasAgentResizeHandle"[\s\S]*?role="separator"[\s\S]*?aria-orientation="vertical"/);
assert.match(ui, /beginCanvasAgentPanelResize/);
assert.match(ui, /applyCanvasAgentPanelWidth/);
assert.match(ui, /PANEL_WIDTH_STORAGE_KEY/);
assert.match(css, /\.canvas-agent-resize-handle/);
assert.match(css, /--agent-panel-width/);
assert.match(css, /body\.canvas-agent-panel-resizing/);

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

const nodeBarSource = mainScript.slice(
  mainScript.indexOf("function createCanvasNodeBar"),
  mainScript.indexOf("function deleteSelectedCanvasNodes"),
);
assert.doesNotMatch(
  nodeBarSource,
  /bar\.append\(\s*editable\s*\?\s*bar\.querySelector/,
  "图片节点标题栏必须直接渲染名称，不能在未挂载时查询自己的子节点（会渲染出 null）",
);
assert.match(nodeBarSource, /bar\.append\(title, remove\);/);
assert.match(nodeBarSource, /if \(nameInput\) bar\.insertBefore\(nameInput, remove\);/);
assert.match(nodeBarSource, /title\.addEventListener\("click"/, "名称输入框只在点击名称时出现");
assert.match(nodeBarSource, /input\.hidden = true;/, "平时不应显示名称输入框");
assert.match(mainScript, /getCanvasImageGeneratorNodeIds:/, "Agent 需要能找回刚创建但还没出图的生图节点");
assert.match(mainScript, /canvasAgentSkillReferenceCache/);
assert.match(mainScript, /hasCachedSkillReference:/);
assert.match(mainScript, /cached:\s*true,\s*already_read:\s*true/);

const ensureImageSource = ui.slice(
  ui.indexOf("function recordCanvasAgentRunToolResult"),
  ui.indexOf("function ensureCanvasAgentMcpSession"),
);
assert.match(ensureImageSource, /function shouldEnsureCanvasAgentImageGeneration/);
assert.match(ensureImageSource, /CanvasAgentCore\.getDirectImageGenerationAllowance\(run\.prompt\)\s*>\s*0/);
assert.match(ensureImageSource, /name: "run_canvas_node"/, "只建节点时必须补一次真实生成");
assert.match(
  ensureImageSource,
  /if \(\/\[\?？\]\\s\*\$\/\.test\(String\(lastMessage \|\| ""\)\.trim\(\)\)\) return false;/,
  "Agent 还在提问时不得偷偷开始生成",
);
assert.match(
  ui.slice(ui.indexOf("async function handleCanvasAgentTurn"), ui.indexOf("function showCanvasAgentApproval")),
  /if \(!calls\.length\) \{\s*if \(await tryCanvasAgentEnsureImageGeneration\(runId, turn\.message\)\) return;/,
  "结束回合前必须确认明确的生图请求真的出过图",
);

console.log("Canvas agent UI checks passed.");
