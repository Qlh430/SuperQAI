(function initCanvasAgentMcpProtocol(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentMcpProtocol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentMcpProtocol() {
  "use strict";

  const JSONRPC_VERSION = "2.0";
  const PROTOCOL_VERSION = "2025-11-25";
  const ERROR_CODES = Object.freeze({
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    NOT_INITIALIZED: -32002,
  });

  class McpProtocolError extends Error {
    constructor(input = {}) {
      super(String(input.message || "MCP protocol error."));
      this.name = "McpProtocolError";
      this.code = Number(input.code || ERROR_CODES.INTERNAL_ERROR);
      if (input.data !== undefined) this.data = input.data;
    }
  }

  function createServer(options = {}) {
    if (typeof options.listTools !== "function") throw new TypeError("MCP server requires listTools().");
    if (typeof options.callTool !== "function") throw new TypeError("MCP server requires callTool().");
    const serverName = String(options.name || "canvas-agent-mcp-server");
    const serverVersion = String(options.version || "1.0.0");
    let initializeReceived = false;
    let initialized = false;
    let closed = false;

    async function handle(request, context = {}) {
      if (closed) return createErrorResponse(request?.id ?? null, ERROR_CODES.INTERNAL_ERROR, "MCP server is closed.");
      if (!isPlainObject(request) || request.jsonrpc !== JSONRPC_VERSION || typeof request.method !== "string") {
        return createErrorResponse(request?.id ?? null, ERROR_CODES.INVALID_REQUEST, "Invalid Request");
      }
      const hasId = Object.prototype.hasOwnProperty.call(request, "id");
      const id = hasId ? request.id : null;

      if (request.method === "initialize") {
        if (
          !hasId
          || !isPlainObject(request.params)
          || typeof request.params.protocolVersion !== "string"
          || !isPlainObject(request.params.capabilities)
          || !isPlainObject(request.params.clientInfo)
          || typeof request.params.clientInfo.name !== "string"
          || typeof request.params.clientInfo.version !== "string"
        ) {
          return createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "initialize requires request parameters.");
        }
        initializeReceived = true;
        return createResultResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: serverName, version: serverVersion },
        });
      }

      if (request.method === "notifications/initialized") {
        if (initializeReceived) initialized = true;
        return undefined;
      }

      if (!initialized) {
        return hasId
          ? createErrorResponse(id, ERROR_CODES.NOT_INITIALIZED, "MCP client is not initialized.")
          : undefined;
      }

      if (request.method === "tools/list") {
        if (!hasId) return undefined;
        try {
          const tools = await options.listTools(context);
          if (!Array.isArray(tools)) throw new TypeError("MCP listTools() must return an array.");
          return createResultResponse(id, { tools });
        } catch (error) {
          return createErrorResponse(id, ERROR_CODES.INTERNAL_ERROR, getSafeErrorMessage(error));
        }
      }

      if (request.method === "tools/call") {
        if (!hasId) return undefined;
        const params = request.params;
        if (!isPlainObject(params) || typeof params.name !== "string" || !params.name.trim()) {
          return createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "tools/call requires a tool name.");
        }
        if (params.arguments !== undefined && !isPlainObject(params.arguments)) {
          return createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, "tools/call arguments must be an object.");
        }
        try {
          const tools = await options.listTools(context);
          if (!Array.isArray(tools) || !tools.some((tool) => tool?.name === params.name)) {
            return createErrorResponse(id, ERROR_CODES.INVALID_PARAMS, `Unknown tool: ${params.name}`);
          }
          try {
            const result = await options.callTool({
              name: params.name,
              arguments: params.arguments || {},
              ...(isPlainObject(params._meta) ? { _meta: params._meta } : {}),
            }, context);
            return createResultResponse(id, normalizeCallToolResult(result, params.name));
          } catch (error) {
            return createResultResponse(id, createToolErrorResult(params.name, error));
          }
        } catch (error) {
          return createErrorResponse(id, ERROR_CODES.INTERNAL_ERROR, getSafeErrorMessage(error));
        }
      }

      return hasId
        ? createErrorResponse(id, ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${request.method}`)
        : undefined;
    }

    return Object.freeze({
      handle,
      close() {
        closed = true;
        initialized = false;
      },
    });
  }

  function createInMemoryClient(options = {}) {
    if (!options.server || typeof options.server.handle !== "function") {
      throw new TypeError("In-memory MCP client requires a server.");
    }
    const contextProvider = typeof options.contextProvider === "function" ? options.contextProvider : () => ({});
    let nextRequestId = 1;
    let initialization = null;
    let closed = false;

    async function request(method, params = {}, meta = {}) {
      if (closed) throw new Error("MCP client is closed.");
      const requestId = nextRequestId++;
      const response = await options.server.handle({
        jsonrpc: JSONRPC_VERSION,
        id: requestId,
        method: String(method || ""),
        params: isPlainObject(params) ? params : {},
      }, contextProvider(meta, method));
      if (!response) throw new McpProtocolError({ code: ERROR_CODES.INTERNAL_ERROR, message: "MCP server returned no response." });
      if (response.error) throw new McpProtocolError(response.error);
      return response.result;
    }

    async function notify(method, params = {}, meta = {}) {
      if (closed) throw new Error("MCP client is closed.");
      await options.server.handle({
        jsonrpc: JSONRPC_VERSION,
        method: String(method || ""),
        params: isPlainObject(params) ? params : {},
      }, contextProvider(meta, method));
    }

    async function initialize() {
      if (initialization) return initialization;
      initialization = request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "canvas-agent-host", version: "1.0.0" },
      }).then(async (result) => {
        if (!isPlainObject(result) || result.protocolVersion !== PROTOCOL_VERSION) {
          throw new McpProtocolError({
            code: ERROR_CODES.INVALID_PARAMS,
            message: `Unsupported MCP protocol version: ${String(result?.protocolVersion || "missing")}`,
          });
        }
        if (!isPlainObject(result.capabilities) || !isPlainObject(result.serverInfo)) {
          throw new McpProtocolError({ code: ERROR_CODES.INVALID_PARAMS, message: "MCP initialize result is malformed." });
        }
        await notify("notifications/initialized");
        return result;
      }).catch((error) => {
        initialization = null;
        throw error;
      });
      return initialization;
    }

    return Object.freeze({
      initialize,
      request,
      async listTools() {
        return request("tools/list", {});
      },
      async callTool(name, args = {}, meta = {}) {
        return request("tools/call", { name: String(name || ""), arguments: isPlainObject(args) ? args : {} }, meta);
      },
      close() {
        closed = true;
        initialization = null;
        options.server.close?.();
      },
    });
  }

  function normalizeCallToolResult(result, toolName) {
    const normalized = isPlainObject(result) ? { ...result } : {};
    const structuredContent = isPlainObject(normalized.structuredContent)
      ? normalized.structuredContent
      : { ok: normalized.isError !== true, tool: toolName, result: normalized.structuredContent ?? null };
    const content = Array.isArray(normalized.content) && normalized.content.length
      ? normalized.content
      : [{ type: "text", text: normalized.isError ? "画布操作没有完成。" : "画布操作已完成。" }];
    return {
      content,
      structuredContent,
      isError: normalized.isError === true,
    };
  }

  function createToolErrorResult(toolName, error) {
    const output = {
      ok: false,
      tool: String(toolName || ""),
      code: String(error?.code || "tool_failed"),
      error: getSafeErrorMessage(error),
    };
    return {
      content: [{ type: "text", text: output.error }],
      structuredContent: output,
      isError: true,
    };
  }

  function createResultResponse(id, result) {
    return { jsonrpc: JSONRPC_VERSION, id, result };
  }

  function createErrorResponse(id, code, message, data) {
    return {
      jsonrpc: JSONRPC_VERSION,
      id,
      error: {
        code,
        message: String(message || "MCP protocol error."),
        ...(data === undefined ? {} : { data }),
      },
    };
  }

  function getSafeErrorMessage(error) {
    return String(error?.message || "画布操作没有完成。").slice(0, 320);
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  return Object.freeze({
    JSONRPC_VERSION,
    PROTOCOL_VERSION,
    ERROR_CODES,
    McpProtocolError,
    createServer,
    createInMemoryClient,
  });
});
