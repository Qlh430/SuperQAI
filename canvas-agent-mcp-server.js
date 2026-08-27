(function initCanvasAgentMcpServer(root, factory) {
  const protocol = typeof module === "object" && module.exports
    ? require("./canvas-agent-mcp-protocol")
    : root?.CanvasAgentMcpProtocol;
  const capabilities = typeof module === "object" && module.exports
    ? require("./canvas-agent-capabilities")
    : root?.CanvasAgentCapabilities;
  const api = factory(protocol, capabilities);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentMcpServer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentMcpServerApi(
  CanvasAgentMcpProtocol,
  CanvasAgentCapabilities,
) {
  "use strict";

  if (!CanvasAgentMcpProtocol) throw new Error("CanvasAgentMcpProtocol is required before CanvasAgentMcpServer.");
  if (!CanvasAgentCapabilities) throw new Error("CanvasAgentCapabilities is required before CanvasAgentMcpServer.");

  function createCanvasMcpSession(options = {}) {
    if (!options.broker || typeof options.broker.execute !== "function") {
      throw new TypeError("Canvas MCP session requires a Broker.");
    }
    const getScope = typeof options.getScope === "function" ? options.getScope : () => null;
    const getRunContext = typeof options.getRunContext === "function" ? options.getRunContext : () => ({});
    const getCapabilityIds = typeof options.getCapabilityIds === "function"
      ? options.getCapabilityIds
      : () => CanvasAgentCapabilities.CAPABILITY_REGISTRY.map((item) => item.id);
    const sessionScope = getScope();
    const initialRun = getRunContext() || {};
    const sessionRun = Object.freeze({
      boardId: String(initialRun.boardId || ""),
      runId: String(initialRun.runId || ""),
    });
    const sessionTools = Object.freeze([...CanvasAgentCapabilities.getMcpTools(getCapabilityIds())]);

    const server = CanvasAgentMcpProtocol.createServer({
      name: "canvas-agent-mcp-server",
      version: "1.0.0",
      listTools: () => sessionTools,
      callTool: async (params, context = {}) => {
        assertSessionActive();
        const output = await options.broker.execute(sessionScope, {
          call_id: String(context.callId || ""),
          name: params.name,
          arguments: params.arguments || {},
          board_id: sessionRun.boardId,
          run_id: sessionRun.runId,
        });
        return toCallToolResult(output, params.name);
      },
    });
    const client = CanvasAgentMcpProtocol.createInMemoryClient({
      server,
      contextProvider: (meta = {}) => Object.freeze({ callId: String(meta.callId || "") }),
    });
    let ready = null;

    function ensureInitialized() {
      if (!ready) ready = client.initialize();
      return ready;
    }

    function assertSessionActive() {
      const currentRun = getRunContext() || {};
      if (
        getScope() === sessionScope
        && String(currentRun.boardId || "") === sessionRun.boardId
        && String(currentRun.runId || "") === sessionRun.runId
      ) return;
      const error = new Error("当前画布已改变，旧任务已安全停止。");
      error.code = "scope_expired";
      throw error;
    }

    return Object.freeze({
      async initialize() {
        return ensureInitialized();
      },
      async listTools() {
        await ensureInitialized();
        return client.listTools();
      },
      async callTool(call = {}) {
        await ensureInitialized();
        return client.callTool(call.name, call.arguments || {}, { callId: call.call_id });
      },
      close() {
        ready = null;
        client.close();
      },
    });
  }

  function toCallToolResult(output, toolName) {
    const structuredContent = output && typeof output === "object"
      ? { ...output }
      : { ok: true, tool: String(toolName || ""), result: output };
    if (typeof structuredContent.ok !== "boolean") structuredContent.ok = true;
    if (!structuredContent.tool) structuredContent.tool = String(toolName || "");
    const isError = structuredContent.ok === false;
    const text = isError
      ? String(structuredContent.error || "画布操作没有完成。")
      : String(structuredContent.message || "画布操作已完成。");
    return {
      content: [{ type: "text", text }],
      structuredContent,
      isError,
    };
  }

  return Object.freeze({ createCanvasMcpSession, toCallToolResult });
});
