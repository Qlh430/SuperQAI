# Canvas Agent MCP Unified Tool Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MCP `tools/list` and `tools/call` the only tool contract and execution path for the built-in Canvas Agent while preserving model failover, Skills, approvals, per-board isolation, and canvas performance.

**Architecture:** Canonical MCP Tool definitions live in the existing capability registry. A small protocol-compliant JSON-RPC 2.0 module and an in-process canvas MCP session sit between the Agent UI and the existing Broker. Provider-specific request shapes are produced only by LLM Connectors derived from the same MCP tools; the Broker remains the final validation and execution boundary.

**Tech Stack:** Vanilla JavaScript UMD/CommonJS, Node.js `assert` check scripts, browser in-process transport, MCP protocol version `2025-11-25`, existing Canvas Agent Broker and tool adapters.

**Implementation Status:** Completed on 2026-08-21. Full `npm run check`, browser Agent verification, portable dependency verification, and independent code review passed. The shared dirty worktree was intentionally left uncommitted.

## Global Constraints

- MCP is the only model-visible tool contract; no duplicate provider-owned JSON Schema.
- Built-in calls use an in-process transport: no HTTP, WebSocket, polling, or canvas hot-path listeners.
- Every model-originated canvas action reaches the Broker only through MCP `tools/call`.
- `boardId`, `runId`, scope, and authorization are trusted host context and never model arguments.
- Paid generation, deletion, and bulk overwrite keep the existing confirmation flow.
- Conversation, authorization, run state, and MCP scope remain isolated by current `boardId`.
- Keep the existing model high-availability router and hide model names in the frontend.
- Do not add the MCP SDK to the browser bundle; implement only the approved stable subset and verify its wire objects against the MCP schema shape.
- Do not commit or clean the shared dirty worktree.

---

### Task 1: Make MCP Tools the canonical capability contract

**Files:**
- Modify: `canvas-agent-capabilities.js`
- Modify: `canvas-agent-broker.js`
- Modify: `canvas-agent-runtime.js`
- Modify: `canvas-agent-core.js`
- Test: `tools/check-canvas-agent-mcp-capabilities.js`
- Test: `tools/check-canvas-agent-capabilities.js`

**Interfaces:**
- Produces: `getMcpTools(capabilityIds): McpTool[]`
- Produces: `toResponsesTool(mcpTool)` and `toChatTool(mcpTool)` provider mappings in runtime.
- Preserves: `getToolDefinitions(capabilityIds)` as a temporary Responses-compatible derivative, not a second schema.

- [ ] **Step 1: Write the failing MCP capability test**

```js
const assert = require("node:assert/strict");
const capabilities = require("../canvas-agent-capabilities");

const [tool] = capabilities.getMcpTools(["node.text.create"]);
assert.equal(tool.name, "create_text_node");
assert.equal(tool.title, "创建文字节点");
assert.equal(tool.inputSchema.additionalProperties, false);
assert.equal(tool.outputSchema.properties.ok.type, "boolean");
assert.deepEqual(Object.keys(tool.annotations).sort(), [
  "destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint",
]);
assert.equal("parameters" in tool, false);
assert.equal("type" in tool, false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/check-canvas-agent-mcp-capabilities.js`  
Expected: FAIL because `getMcpTools` does not exist.

- [ ] **Step 3: Convert each capability tool to MCP shape**

```js
const MCP_TOOL_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string" },
    code: { type: ["string", "null"] },
    error: { type: ["string", "null"] },
  },
  required: ["ok", "tool"],
  additionalProperties: true,
});

function defineCapability(id, toolName, description, risk, properties, maxTargets = 1) {
  const destructive = typeof risk === "function" || risk === "destructive" || risk === "bulk-overwrite";
  return Object.freeze({
    id,
    risk,
    maxTargets,
    tool: Object.freeze({
      name: toolName,
      title: description.replace(/[。.!！]+$/, ""),
      description,
      inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze(properties),
        required: Object.freeze(Object.keys(properties)),
        additionalProperties: false,
      }),
      outputSchema: MCP_TOOL_OUTPUT_SCHEMA,
      annotations: Object.freeze({
        readOnlyHint: false,
        destructiveHint: destructive,
        idempotentHint: false,
        openWorldHint: risk === "paid",
      }),
    }),
  });
}
```

Add explicit short Chinese titles through a title map so titles remain useful and are not long descriptions. Change Broker schema validation from `capability.tool.parameters` to `capability.tool.inputSchema`. Derive provider mappings from MCP tools inside runtime.

- [ ] **Step 4: Run capability, Broker, runtime, and model-contract checks**

Run: `node tools/check-canvas-agent-mcp-capabilities.js && node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-broker.js && node tools/check-canvas-agent-runtime.js`  
Expected: all checks print their passed message and exit 0.

---

### Task 2: Implement MCP JSON-RPC lifecycle and in-process canvas session

**Files:**
- Create: `canvas-agent-mcp-protocol.js`
- Create: `canvas-agent-mcp-server.js`
- Test: `tools/check-canvas-agent-mcp-protocol.js`
- Test: `tools/check-canvas-agent-mcp-server.js`

**Interfaces:**
- Produces: `createServer({ listTools, callTool })` with `handle(request, context)`.
- Produces: `createInMemoryClient({ server, contextProvider })` with `initialize()`, `listTools()`, `callTool(name, args, meta)`, and `close()`.
- Produces: `createCanvasMcpSession({ broker, getScope, getRunContext, getCapabilityIds })`.

- [ ] **Step 1: Write failing protocol lifecycle tests**

```js
const assert = require("node:assert/strict");
const MCP = require("../canvas-agent-mcp-protocol");

const server = MCP.createServer({
  listTools: () => [{ name: "canvas_echo", description: "Echo", inputSchema: { type: "object" } }],
  callTool: async ({ name, arguments: args }) => ({
    content: [{ type: "text", text: args.text }],
    structuredContent: { ok: true, tool: name, text: args.text },
    isError: false,
  }),
});
const client = MCP.createInMemoryClient({ server });
await assert.rejects(() => client.request("tools/list"), /not initialized/i);
const initialized = await client.initialize();
assert.equal(initialized.protocolVersion, "2025-11-25");
assert.equal((await client.listTools()).tools[0].name, "canvas_echo");
assert.equal((await client.callTool("canvas_echo", { text: "ok" })).structuredContent.text, "ok");
```

- [ ] **Step 2: Run protocol test and verify RED**

Run: `node tools/check-canvas-agent-mcp-protocol.js`  
Expected: FAIL because the protocol module does not exist.

- [ ] **Step 3: Implement the approved MCP subset**

```js
const PROTOCOL_VERSION = "2025-11-25";
const JSONRPC_VERSION = "2.0";

function protocolError(code, message, data) {
  return { jsonrpc: JSONRPC_VERSION, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function createServer({ listTools, callTool, name = "canvas-agent-mcp-server", version = "1.0.0" }) {
  let initialized = false;
  return Object.freeze({
    async handle(request, context) {
      const id = request?.id;
      const respond = (result) => ({ jsonrpc: JSONRPC_VERSION, id, result });
      const fail = (code, message, data) => ({ ...protocolError(code, message, data), id });
      if (!request || request.jsonrpc !== JSONRPC_VERSION || typeof request.method !== "string") {
        return fail(-32600, "Invalid Request");
      }
      if (request.method === "initialize") {
        return respond({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
        });
      }
      if (request.method === "notifications/initialized") {
        initialized = true;
        return undefined;
      }
      if (!initialized) return fail(-32002, "MCP client is not initialized.");
      if (request.method === "tools/list") return respond({ tools: await listTools(context) });
      if (request.method !== "tools/call") return fail(-32601, "Method not found");
      const toolName = String(request.params?.name || "");
      const tools = await listTools(context);
      if (!tools.some((tool) => tool.name === toolName)) return fail(-32602, "Unknown tool");
      try {
        return respond(await callTool({
          name: toolName,
          arguments: request.params?.arguments || {},
        }, context));
      } catch (error) {
        const output = { ok: false, tool: toolName, code: String(error?.code || "tool_failed"), error: String(error?.message || "Tool failed") };
        return respond({ content: [{ type: "text", text: output.error }], structuredContent: output, isError: true });
      }
    },
  });
}
```

Operational handler failures return `{ content, structuredContent, isError: true }`; malformed requests, unknown methods, unknown tools, and uninitialized calls return JSON-RPC errors. The in-memory client passes trusted context out of band without stringify/parse.

- [ ] **Step 4: Write failing canvas bridge tests**

```js
const session = CanvasMcp.createCanvasMcpSession({
  broker,
  getScope: () => scope,
  getRunContext: () => ({ boardId: "board-a", runId: "run-a" }),
  getCapabilityIds: () => ["node.text.create"],
});
const tools = await session.listTools();
assert.deepEqual(tools.tools.map((tool) => tool.name), ["create_text_node"]);
const result = await session.callTool({
  call_id: "call-a",
  name: "create_text_node",
  arguments: { content: "标题", x: null, y: null },
});
assert.equal(result.structuredContent.ok, true);
```

Also assert that an unlisted tool rejects with JSON-RPC `-32602`, a changed board returns a tool result with `isError: true` and `code: "scope_expired"`, and the same `runId/callId` executes once.

- [ ] **Step 5: Run bridge test and verify RED**

Run: `node tools/check-canvas-agent-mcp-server.js`  
Expected: FAIL because the canvas MCP server module does not exist.

- [ ] **Step 6: Implement the Broker-backed canvas MCP session**

```js
function createCanvasMcpSession(options = {}) {
  const server = MCP.createServer({
    listTools: () => Capabilities.getMcpTools(options.getCapabilityIds()),
    callTool: async (params, context) => {
      const run = options.getRunContext();
      const output = await options.broker.execute(options.getScope(), {
        call_id: context.callId,
        name: params.name,
        arguments: params.arguments || {},
        board_id: run.boardId,
        run_id: run.runId,
      });
      return toCallToolResult(output);
    },
  });
  return createAutoInitializingSession(server, options);
}
```

- [ ] **Step 7: Run both MCP suites and verify GREEN**

Run: `node tools/check-canvas-agent-mcp-protocol.js && node tools/check-canvas-agent-mcp-server.js`  
Expected: both checks pass with exit 0.

---

### Task 3: Route the browser Agent exclusively through MCP

**Files:**
- Modify: `index.html`
- Modify: `canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-performance.js`
- Test: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: `window.CanvasAgentMcpServer.createCanvasMcpSession(...)`.
- Removes: direct UI call to `state.broker.execute(...)`.

- [ ] **Step 1: Change static UI assertions before production code**

```js
assert.match(ui, /CanvasAgentMcpServer\.createCanvasMcpSession/);
assert.match(ui, /state\.mcp\.callTool\(call\)/);
assert.doesNotMatch(ui, /state\.broker\.execute\(/);
assert.ok(mcpProtocolIndex > brokerIndex);
assert.ok(mcpServerIndex > mcpProtocolIndex);
assert.ok(uiIndex > mcpServerIndex);
```

- [ ] **Step 2: Run UI test and verify RED**

Run: `node tools/check-canvas-agent-ui.js`  
Expected: FAIL because MCP scripts/session are not integrated.

- [ ] **Step 3: Load MCP modules and create one lazy in-process session**

```js
const CanvasAgentMcpServer = window.CanvasAgentMcpServer;
// state.mcp is created after the Broker and reads current scope/run via closures.
state.mcp = CanvasAgentMcpServer.createCanvasMcpSession({
  broker: state.broker,
  getScope: () => state.scope,
  getRunContext: () => ({
    boardId: state.currentRun?.boardId || "",
    runId: state.currentRun?.id || "",
  }),
  getCapabilityIds: getCanvasAgentAllowedCapabilityIds,
});
```

Replace the direct Broker call with `state.mcp.callTool(call)`, then use `structuredContent` as the existing normalized output. Invalidate the MCP session when the board changes, the user stops, a run finishes, or the Agent resets. A new run reconnects lazily.

- [ ] **Step 4: Run UI, browser, Broker, and performance checks**

Run: `node tools/check-canvas-agent-ui.js && node tools/check-canvas-agent-browser.js && node tools/check-canvas-agent-broker.js && node tools/check-canvas-agent-performance.js`  
Expected: all pass; performance test finds no MCP HTTP/polling/hot-path listener.

---

### Task 4: Reframe Model Adapters as LLM Connectors

**Files:**
- Create: `canvas-agent-llm-connectors.js`
- Modify: `canvas-agent-model-adapters.js`
- Modify: `server.js`
- Create: `tools/check-canvas-agent-llm-connectors.js`
- Modify: `tools/check-canvas-agent-model-adapters.js`
- Modify: `tools/check-canvas-agent-server.js`
- Modify: `tools/check-custom-image-resolution-config.js`

**Interfaces:**
- Produces: `registerLlmConnector`, `getLlmConnector`, `resolveLlmConnector`, `listLlmConnectors`, `normalizeLlmConnectorId`.
- Preserves: old Model Adapter exports as compatibility aliases only.

- [ ] **Step 1: Write failing LLM Connector contract test**

```js
const connectors = require("../canvas-agent-llm-connectors");
const responses = connectors.getLlmConnector("openai-responses");
const chat = connectors.getLlmConnector("openai-chat");
assert.equal(responses.buildRequest(payload, options).tools[0].name, "create_text_node");
assert.equal(chat.buildRequest(payload, options).tools[0].function.name, "create_text_node");
assert.equal(typeof responses.executeCanvasTool, "undefined");
assert.equal(typeof chat.executeCanvasTool, "undefined");
```

- [ ] **Step 2: Run connector test and verify RED**

Run: `node tools/check-canvas-agent-llm-connectors.js`  
Expected: FAIL because the connector module does not exist.

- [ ] **Step 3: Move the canonical registry and keep a compatibility shim**

```js
// canvas-agent-model-adapters.js
const connectors = require("./canvas-agent-llm-connectors");
module.exports = Object.freeze({
  ...connectors,
  normalizeModelAdapterId: connectors.normalizeLlmConnectorId,
  registerModelAdapter: connectors.registerLlmConnector,
  getModelAdapter: connectors.getLlmConnector,
  resolveModelAdapter: connectors.resolveLlmConnector,
  listModelAdapters: connectors.listLlmConnectors,
});
```

Update `server.js` to require `CanvasAgentLlmConnectors` and use Connector method names. No Connector receives Broker, MCP session, board scope, or canvas adapter references.

- [ ] **Step 4: Run connector, runtime, endpoint, and failover tests**

Run: `node tools/check-canvas-agent-llm-connectors.js && node tools/check-canvas-agent-model-adapters.js && node tools/check-canvas-agent-runtime.js && node tools/check-canvas-agent-server.js && node tools/check-canvas-agent-endpoint.js && node tools/check-canvas-agent-failover-endpoint.js`  
Expected: all pass and both model protocols expose tools derived from MCP.

---

### Task 5: Package, document, and run the complete regression gate

**Files:**
- Modify: `package.json`
- Modify: `build-portable.bat`
- Modify: `tools/check-portable-package.js`
- Modify: `tools/check-canvas-agent-server.js`
- Modify: `tools/check-canvas-agent-performance.js`
- Modify: `docs/superpowers/specs/2026-08-21-canvas-agent-mcp-tool-protocol-design.md`

**Interfaces:**
- Packages: protocol, canvas MCP server, LLM Connector, and compatibility shim.
- Verification: `npm run check` includes all new focused checks.

- [ ] **Step 1: Make packaging checks fail first**

Add these required filenames before changing the build list:

```js
[
  "canvas-agent-mcp-protocol.js",
  "canvas-agent-mcp-server.js",
  "canvas-agent-llm-connectors.js",
].forEach((filename) => assert.match(portableBuild, new RegExp(filename.replaceAll(".", "\\."))));
```

- [ ] **Step 2: Run packaging check and verify RED**

Run: `node tools/check-canvas-agent-server.js`  
Expected: FAIL because the new files are not in `build-portable.bat` yet.

- [ ] **Step 3: Add files and checks to the build/test manifests**

Add all three new JavaScript files to `build-portable.bat`, update portable verifier requirements, and insert these commands into `npm run check`:

```json
"node --check canvas-agent-mcp-protocol.js",
"node --check canvas-agent-mcp-server.js",
"node --check canvas-agent-llm-connectors.js",
"node tools/check-canvas-agent-mcp-capabilities.js",
"node tools/check-canvas-agent-mcp-protocol.js",
"node tools/check-canvas-agent-mcp-server.js",
"node tools/check-canvas-agent-llm-connectors.js"
```

- [ ] **Step 4: Run focused syntax and Agent suites**

Run: `node --check canvas-agent-mcp-protocol.js && node --check canvas-agent-mcp-server.js && node --check canvas-agent-llm-connectors.js && node --check canvas-agent-ui.js && node --check server.js && node tools/check-canvas-agent-mcp-capabilities.js && node tools/check-canvas-agent-mcp-protocol.js && node tools/check-canvas-agent-mcp-server.js && node tools/check-canvas-agent-llm-connectors.js && node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-broker.js && node tools/check-canvas-agent-runtime.js && node tools/check-canvas-agent-server.js && node tools/check-canvas-agent-ui.js && node tools/check-canvas-agent-performance.js`  
Expected: every command exits 0.

- [ ] **Step 5: Run the full project verification**

Run: `npm run check`  
Expected: exit 0 with every existing and new check passing.

- [ ] **Step 6: Inspect the final diff without committing**

Run: `git diff -- canvas-agent-capabilities.js canvas-agent-broker.js canvas-agent-runtime.js canvas-agent-core.js canvas-agent-mcp-protocol.js canvas-agent-mcp-server.js canvas-agent-ui.js canvas-agent-llm-connectors.js canvas-agent-model-adapters.js server.js index.html package.json build-portable.bat tools docs/superpowers/specs/2026-08-21-canvas-agent-mcp-tool-protocol-design.md docs/superpowers/plans/2026-08-21-canvas-agent-mcp-tool-protocol-implementation.md`  
Expected: only the approved MCP/LLM Connector integration and its tests/docs appear; do not stage or commit.
