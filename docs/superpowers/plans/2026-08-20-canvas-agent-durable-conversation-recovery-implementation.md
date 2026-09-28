# Canvas Agent Durable Conversation And Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent 对话按画布连续保存，并在上游丢失 Responses 状态时自动重建工具调用上下文，不重复执行已完成或付费工具。

**Architecture:** 新增一个浏览器/Node 共用的会话规范化模块和一个 Node 文件存储模块；服务端以 `board_id` 提供会话读写接口。Agent 每次运行携带当前画布的有界 transcript，工具续接始终由服务端 transcript 重建，不依赖 `previous_response_id`；画布模块只分发身份切换事件，不把消息塞进撤销栈或渲染循环。

**Tech Stack:** 原生浏览器 JavaScript、Node.js HTTP/文件存储、OpenAI Responses/Chat Completions 兼容协议、Node `assert`、Playwright。

## Global Constraints

- 一张画布只有一条连续 Agent 会话，同一画布发送消息只追加、不自动清空。
- 会话权威记录与画布节点 JSON 分开保存，以稳定 `board_id` 关联。
- 不显示模型名、API Key、`call_id`、trace id、HTTP 状态或英文上游错误。
- 工具续接不依赖 `previous_response_id`；线路切换后仍能用同一 transcript 继续。
- 已完成工具不得重复执行；已提交的付费工具不得自动盲重试。
- Agent 会话 I/O 不进入画布撤销栈、节点渲染循环或画布自动保存载荷。
- 不增加第三方运行时依赖。

---

### Task 1: 会话领域模型与持久化存储

**Files:**
- Create: `canvas-agent-conversation.js`
- Create: `canvas-agent-conversation-store.js`
- Create: `tools/check-canvas-agent-conversation.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `CanvasAgentConversation.create(boardId)`、`normalize(value, boardId)`、`appendItems(value, items)`、`markInterrupted(value)`、`buildTranscript(value)`。
- Produces: `createCanvasAgentConversationStore({ filePath })` with `get(boardId)`、`upsert(record, expectedRevision)`、`remove(boardId)`。

- [x] **Step 1: 写会话模型失败测试**

在 `tools/check-canvas-agent-conversation.js` 用真实模块断言画布隔离、追加顺序、运行中状态恢复和 transcript 有界：

```js
const assert = require("node:assert/strict");
const Conversation = require("../canvas-agent-conversation");

const empty = Conversation.create("board-a");
const appended = Conversation.appendItems(empty, [
  { id: "u1", role: "user", text: "生成苹果", status: "completed" },
  { id: "t1", role: "tool", text: "已创建图片节点", toolName: "create_image_node", nodeId: "63", status: "completed" },
  { id: "a1", role: "assistant", text: "节点已经创建。", status: "completed" },
]);
assert.equal(appended.boardId, "board-a");
assert.deepEqual(appended.items.map((item) => item.id), ["u1", "t1", "a1"]);
assert.match(JSON.stringify(Conversation.buildTranscript(appended)), /生成苹果/);
assert.match(JSON.stringify(Conversation.buildTranscript(appended)), /63/);
assert.equal(Conversation.normalize(appended, "board-b").boardId, "board-b");

const interrupted = Conversation.markInterrupted(Conversation.appendItems(empty, [
  { id: "running", role: "tool", text: "正在生成", status: "running" },
]));
assert.equal(interrupted.items.at(-1).status, "recoverable");
```

- [x] **Step 2: 运行测试确认红灯**

Run: `node tools/check-canvas-agent-conversation.js`

Expected: FAIL with `Cannot find module '../canvas-agent-conversation'`。

- [x] **Step 3: 实现纯会话模块**

采用 UMD 导出并限制用户记录 200 项、模型 transcript 24 项：

```js
(function initCanvasAgentConversation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentConversation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  const MAX_ITEMS = 200;
  const MAX_TRANSCRIPT_ITEMS = 24;

  function create(boardId) {
    return { boardId: String(boardId || ""), conversationId: cryptoId(), revision: 0, items: [], updatedAt: new Date().toISOString() };
  }

  function normalize(value, boardId) {
    const source = value && typeof value === "object" ? value : {};
    return {
      boardId: String(boardId || source.boardId || ""),
      conversationId: String(source.conversationId || cryptoId()),
      revision: Math.max(0, Number(source.revision || 0)),
      items: (Array.isArray(source.items) ? source.items : []).slice(-MAX_ITEMS).map(normalizeItem).filter(Boolean),
      updatedAt: String(source.updatedAt || new Date().toISOString()),
    };
  }

  function appendItems(value, items) {
    const next = normalize(value, value?.boardId);
    next.items = [...next.items, ...(Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean)].slice(-MAX_ITEMS);
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function markInterrupted(value) {
    const next = normalize(value, value?.boardId);
    next.items = next.items.map((item) => item.status === "running" ? { ...item, status: "recoverable", text: item.text || "上次任务已中断，可以继续。" } : item);
    return next;
  }

  function buildTranscript(value) {
    return normalize(value, value?.boardId).items
      .filter((item) => ["user", "assistant", "tool"].includes(item.role) && item.text)
      .slice(-MAX_TRANSCRIPT_ITEMS)
      .map((item) => ({ role: item.role, content: item.text, tool_name: item.toolName || "", node_id: item.nodeId || "" }));
  }
```

`normalizeItem` 只保留 `id/role/text/status/toolName/nodeId/createdAt`，单项文本限制 12,000 字符；`cryptoId` 在浏览器优先 `crypto.randomUUID()`，Node 使用时间戳和随机串。

- [x] **Step 4: 写并实现原子文件存储测试**

测试使用 `fs.mkdtempSync` 创建临时目录，断言 revision 冲突拒绝、board A/B 隔离、删除只影响目标。实现时读取 `{ conversations: [] }`，写入采用同目录临时文件后 `renameSync`，并把记录再次交给 `Conversation.normalize`。

- [x] **Step 5: 运行定向检查确认绿灯**

Run: `node tools/check-canvas-agent-conversation.js && node --check canvas-agent-conversation-store.js`

Expected: `Canvas agent conversation checks passed.` 且语法检查退出码为 0。

### Task 2: 画布身份事件与会话 API

**Files:**
- Modify: `script.js`
- Modify: `server.js`
- Modify: `index.html`
- Create: `tools/check-canvas-agent-conversation-endpoint.js`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `window.ensureCanvasBoardIdentity(): { id: string, title: string }`。
- Produces: `canvas:board-changed` CustomEvent with `{ boardId, title }`。
- Produces: `GET/POST/DELETE /api/canvas-agent/conversation`。

- [x] **Step 1: 写端点和静态失败测试**

端点测试启动临时 app server，并使用 `CANVAS_AGENT_CONVERSATIONS_FILE` 指向临时文件：

```js
const created = await requestJson(port, "/api/canvas-agent/conversation", {
  method: "POST",
  body: { board_id: "board-a", expected_revision: 0, items: [{ id: "u1", role: "user", text: "你好" }] },
});
assert.equal(created.status, 200);
assert.equal(created.data.boardId, "board-a");

const loaded = await requestJson(port, "/api/canvas-agent/conversation?board_id=board-a");
assert.equal(loaded.data.items[0].text, "你好");
assert.equal((await requestJson(port, "/api/canvas-agent/conversation?board_id=board-b")).data.items.length, 0);
```

静态测试断言 `script.js` 存在 `ensureCanvasBoardIdentity` 和 `canvas:board-changed`，`index.html` 在 `script.js` 前加载 `canvas-agent-conversation.js`。

- [x] **Step 2: 运行测试确认红灯**

Run: `node tools/check-canvas-agent-conversation-endpoint.js`

Expected: FAIL because the conversation endpoint returns 404/405。

- [x] **Step 3: 实现画布身份与切换事件**

在 `script.js` 增加：

```js
function ensureCanvasBoardIdentity() {
  if (!canvasState.activeBoardId) {
    canvasState.activeBoardId = createId();
    canvasState.activeBoardTitle = normalizeCanvasBoardTitle(canvasState.activeBoardTitle) || `画布 ${canvasState.boards.length + 1}`;
    canvasState.activeBoardCreatedAt = new Date().toISOString();
    syncCanvasWorkspaceState();
  }
  return { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
}

function dispatchCanvasBoardChanged() {
  window.dispatchEvent(new CustomEvent("canvas:board-changed", { detail: {
    boardId: String(canvasState.activeBoardId || ""),
    title: String(canvasState.activeBoardTitle || ""),
  } }));
}
```

在画布创建、恢复完成和空白落地完成后调用 `dispatchCanvasBoardChanged()`。Agent 首次发消息时调用 `ensureCanvasBoardIdentity()`，保证消息与随后创建的节点共享同一个 ID。

- [x] **Step 4: 实现会话 API**

`server.js` 初始化 store，校验 `board_id` 长度为 1–120 且只包含字母、数字、下划线或连字符。POST 以 revision 防止旧页面覆盖新记录；GET 不存在时返回空记录；DELETE 仅移除目标记录。永久删除画布时同步 `store.remove(id)`，移入回收站不删除。

- [x] **Step 5: 加载浏览器共享模块并确认绿灯**

在 `index.html` 中把 `canvas-agent-conversation.js` 放在 `canvas-agent-core.js` 后、`script.js` 前，并更新资源版本。运行：

`node tools/check-canvas-agent-conversation-endpoint.js && node tools/check-canvas-agent-ui.js`

Expected: 两项均通过。

### Task 3: 无状态工具续接与自动恢复

**Files:**
- Modify: `canvas-agent-runtime.js`
- Modify: `server.js`
- Modify: `canvas-agent-router.js`
- Modify: `tools/check-canvas-agent-runtime.js`
- Modify: `tools/check-canvas-agent-endpoint.js`
- Modify: `tools/check-canvas-agent-failover-endpoint.js`

**Interfaces:**
- Consumes: `payload.conversation_context` and server `session.transcript`。
- Produces: every continuation request contains function call + output in `input/messages`, with no `previous_response_id` dependency。

- [x] **Step 1: 写状态丢失失败测试**

把 endpoint mock 设为：如果第二次请求包含 `previous_response_id`，返回截图中的 400；如果请求包含 transcript 内的 `function_call` 和 `function_call_output`，返回完成消息。断言：

```js
assert.equal(secondTurn.status, 200);
assert.equal(upstreamRequests[1].body.previous_response_id, undefined);
assert.deepEqual(upstreamRequests[1].body.input.map((item) => item.type), [
  "function_call",
  "function_call_output",
]);
assert.equal(upstreamRequests.filter((item) => item.body.input?.some((entry) => entry.type === "function_call_output")).length, 1);
```

再增加主 Responses 线路拒绝后，备用 Chat 线路收到同一 assistant tool call + tool output 并完成的测试。

- [x] **Step 2: 运行测试确认红灯**

Run: `node tools/check-canvas-agent-endpoint.js && node tools/check-canvas-agent-failover-endpoint.js`

Expected: FAIL because continuation still sends `previous_response_id` or the fallback transcript is incomplete。

- [x] **Step 3: 改为 transcript 续接**

`runCanvasAgentCandidate` 对任何 continuation 都组合：

```js
const transcript = [
  ...normalizeClientConversationContext(payload.conversation_context),
  ...session.transcript,
];
const effectivePayload = continuation && session.initialPayload
  ? { ...session.initialPayload, tool_outputs: payload.tool_outputs, step: payload.step, previous_response_id: "" }
  : { ...payload, previous_response_id: "" };
```

Responses 调用 `buildResponsesRequest(..., { transcript, forceStateless: continuation || transcript.length })`；Chat 调用 `buildChatCompletionsRequest(..., { transcript })`。初次请求只加入跨运行 conversation context，本次工具循环再加入 session transcript。

- [x] **Step 4: 把状态错配归为协议恢复错误**

在 `classifyAgentRouteError` 增加：

```js
if (/no tool call found|function call output|previous_response_id|unknown response|response.*not found/.test(message)) {
  return "protocol";
}
```

这样旧客户端或异常反代仍能进入故障转移；用户响应只返回稳定中文恢复信息，不透出上游原文。

- [x] **Step 5: 运行工具链检查确认绿灯**

Run: `node tools/check-canvas-agent-runtime.js && node tools/check-canvas-agent-endpoint.js && node tools/check-canvas-agent-failover-endpoint.js`

Expected: 所有检查通过，测试记录显示工具执行结果只产生一次。

### Task 4: 前端画布级连续会话

**Files:**
- Modify: `canvas-agent-ui.js`
- Modify: `canvas-agent.css`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: `CanvasAgentConversation`、conversation API、`canvas:board-changed`。
- Produces: `loadCanvasAgentConversation(boardId)`、`persistCanvasAgentConversation()`、`recordCanvasAgentItem(item)`、`renderCanvasAgentConversation()`。

- [x] **Step 1: 写连续消息和画布隔离失败测试**

浏览器 mock 按 `board_id` 保存记录。断言：

```js
await sendAgentMessage("第一条");
await sendAgentMessage("第二条");
assert.deepEqual(await page.locator(".canvas-agent-message.is-user p").allTextContents(), ["第一条", "第二条"]);
assert.match(JSON.stringify(turnRequests.at(-1).conversation_context), /第一条/);

await switchToBoard("board-b");
assert.equal(await page.getByText("第一条").count(), 0);
await switchToBoard("board-a");
await page.getByText("第一条").waitFor({ state: "visible" });
await page.reload();
await page.getByText("第二条").waitFor({ state: "visible" });
```

同时断言顶部不存在“新任务”按钮，接口失败卡片不包含 `call_id|trace|HTTP|No tool call found`。

- [x] **Step 2: 运行浏览器测试确认红灯**

Run: `$env:CANVAS_AGENT_TEST_URL='http://127.0.0.1:3194'; node tools/check-canvas-agent-browser.js`

Expected: FAIL because the second send clears the first message and no conversation API is called。

- [x] **Step 3: 实现当前画布会话控制器**

扩展 UI state：

```js
activeBoardId: "",
conversation: null,
conversationLoadToken: 0,
conversationAbortController: null,
conversationSavePromise: Promise.resolve(),
```

监听 `canvas:board-changed`，切换前停止当前运行并保存 checkpoint；新 load 使用递增 token，只有 token 与当前 `activeBoardId` 同时匹配才渲染。服务端失败时保留内存记录并显示非阻塞提示。

- [x] **Step 4: 发送时追加而非重置**

把：

```js
resetCanvasAgentRun({ keepMessages: false });
```

替换为只重置运行态的 helper：

```js
prepareCanvasAgentRun();
const board = window.ensureCanvasBoardIdentity();
state.activeBoardId = board.id;
recordCanvasAgentItem({ role: "user", text: prompt, status: "completed" });
```

请求增加 `board_id` 与 `conversation_context: CanvasAgentConversation.buildTranscript(state.conversation)`。Assistant 回复、工具步骤、失败、停止和恢复状态均记录到当前画布，且用 `run_id` 防止旧运行写入新画布。

- [x] **Step 5: 移除清空入口并实现可恢复提示**

从 header 删除 `#canvasAgentNew`。可恢复失败渲染中文 notice 和按钮：

```html
<article class="canvas-agent-recovery" data-run-id="...">
  <p>节点已保留，生成服务刚才没有接上。可以从这里继续。</p>
  <button type="button" data-agent-resume>继续</button>
</article>
```

继续动作创建新 `run_id`，携带当前 conversation context 和最新画布摘要，不重新执行已有工具输出。

- [x] **Step 6: 运行浏览器检查确认绿灯**

Run: `node tools/check-canvas-agent-ui.js` then browser check against port 3194。

Expected: 连续消息、画布隔离、刷新恢复、友好错误和既有等待动画全部通过。

### Task 5: 端到端可靠性与完整回归

**Files:**
- Verify: all modified files
- Modify: `docs/superpowers/plans/2026-08-20-canvas-agent-durable-conversation-recovery-implementation.md`

**Interfaces:**
- Consumes: Tasks 1–4。
- Produces: 可交付的测试证据与完成记录。

- [x] **Step 1: 启动隔离测试服务**

Run: `$env:PORT='3194'; $env:HOST='127.0.0.1'; node server.js`

Expected: 服务监听 3194，不打开可见窗口。

- [x] **Step 2: 运行真实浏览器验收**

Run: `$env:CANVAS_AGENT_TEST_URL='http://127.0.0.1:3194'; node tools/check-canvas-agent-browser.js`

Expected: `Canvas agent browser checks passed.`；截图包含同一画布两轮消息和恢复后的生成步骤。

- [x] **Step 3: 运行定向端点与协议检查**

Run: `node tools/check-canvas-agent-conversation.js && node tools/check-canvas-agent-conversation-endpoint.js && node tools/check-canvas-agent-endpoint.js && node tools/check-canvas-agent-failover-endpoint.js`

Expected: 全部退出码 0。

- [x] **Step 4: 运行完整回归**

Run: `npm run check`

Expected: 全部现有画布、图片、视频、Provider 和 Agent 检查通过。

- [x] **Step 5: 检查差异和工作区边界**

Run: `git diff --check`

Expected: 无空白错误；定向复核确认没有把会话放入 `serializeCanvasBoard()`、没有新增画布动画循环、没有暴露模型名或上游技术错误。

- [x] **Step 6: 更新计划完成状态**

将每个已完成步骤改为 `[x]`，保留测试命令和实际验收证据。当前工作区 `.git` 索引若继续受保护，则不执行 commit，不请求扩大权限，也不碰用户既有未提交修改。

## Completion Record

- `npm run check`：完整回归通过，包含会话模型、会话 API、无状态工具续接、路由故障转移和性能检查。
- 隔离服务 `127.0.0.1:3194` + `tools/check-canvas-agent-browser.js`：浏览器验收通过；测试结束后已关闭隔离服务。
- 浏览器覆盖：面板默认收起、节点选择上下文、等待条动画、停止、连续消息、技术错误脱敏、继续任务、工具幂等、画布切换恢复。
- `git diff --check`：目标已跟踪文件无空白错误；换行符仅有仓库既有的 LF/CRLF 提示。
- 会话保存在独立 `data/canvas-agent-conversations.json`，未加入 `serializeCanvasBoard()` 或画布渲染/撤销载荷。
- 当前工作区包含用户既有大量未提交修改，且 `.git` 索引受保护，因此未执行 commit。
