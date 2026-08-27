"use strict";

const assert = require("node:assert/strict");
const MCP = require("../canvas-agent-mcp-protocol");

async function main() {
  const contexts = [];
  const server = MCP.createServer({
    listTools: (context) => {
      contexts.push(context);
      return [{
        name: "canvas_echo",
        title: "Echo",
        description: "Echo text.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      }];
    },
    callTool: async (params, context) => {
      contexts.push(context);
      if (params.arguments.text === "fail") {
        const error = new Error("请换一段文字后重试。");
        error.code = "echo_failed";
        throw error;
      }
      const output = { ok: true, tool: params.name, text: params.arguments.text };
      return {
        content: [{ type: "text", text: output.text }],
        structuredContent: output,
        isError: false,
      };
    },
  });
  const client = MCP.createInMemoryClient({
    server,
    contextProvider: (meta) => ({ trusted: true, callId: meta?.callId || "" }),
  });

  const malformedInitialize = await server.handle({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {},
  }, {});
  assert.equal(malformedInitialize.error.code, MCP.ERROR_CODES.INVALID_PARAMS);

  await assert.rejects(
    () => client.request("tools/list"),
    (error) => error.code === MCP.ERROR_CODES.NOT_INITIALIZED,
  );

  const initialized = await client.initialize();
  assert.equal(initialized.protocolVersion, "2025-11-25");
  assert.equal(initialized.serverInfo.name, "canvas-agent-mcp-server");
  assert.deepEqual(initialized.capabilities, { tools: { listChanged: false } });

  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ["canvas_echo"]);

  const success = await client.callTool("canvas_echo", { text: "ok" }, { callId: "call-ok" });
  assert.equal(success.isError, false);
  assert.equal(success.structuredContent.text, "ok");
  assert.equal(contexts.at(-1).trusted, true);
  assert.equal(contexts.at(-1).callId, "call-ok");

  const toolFailure = await client.callTool("canvas_echo", { text: "fail" }, { callId: "call-fail" });
  assert.equal(toolFailure.isError, true);
  assert.equal(toolFailure.structuredContent.code, "echo_failed");
  assert.match(toolFailure.content[0].text, /换一段文字/);

  await assert.rejects(
    () => client.callTool("missing_tool", {}),
    (error) => error.code === MCP.ERROR_CODES.INVALID_PARAMS,
  );
  await assert.rejects(
    () => client.request("resources/list"),
    (error) => error.code === MCP.ERROR_CODES.METHOD_NOT_FOUND,
  );

  const invalid = await server.handle(null, {});
  assert.equal(invalid.error.code, MCP.ERROR_CODES.INVALID_REQUEST);
  client.close();
  await assert.rejects(() => client.listTools(), /closed/i);

  const incompatibleClient = MCP.createInMemoryClient({
    server: {
      handle: async (request) => request.method === "initialize"
        ? {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "1900-01-01",
              capabilities: { tools: {} },
              serverInfo: { name: "incompatible", version: "1" },
            },
          }
        : undefined,
    },
  });
  await assert.rejects(
    () => incompatibleClient.initialize(),
    (error) => error.code === MCP.ERROR_CODES.INVALID_PARAMS && /protocol version/i.test(error.message),
  );

  console.log("Canvas agent MCP protocol checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
