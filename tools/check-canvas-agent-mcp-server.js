"use strict";

const assert = require("node:assert/strict");
const CanvasAgentBroker = require("../canvas-agent-broker");
const CanvasAgentMcpServer = require("../canvas-agent-mcp-server");

async function main() {
  let currentBoardId = "board-a";
  let executions = 0;
  const broker = CanvasAgentBroker.createBroker({
    getCurrentBoardId: () => currentBoardId,
    adapters: {
      create_text_node: async (args) => {
        executions += 1;
        return { node_ids: [`text-${executions}`], content: args.content };
      },
    },
  });
  let scope = broker.beginRun({ boardId: "board-a", runId: "run-a" });
  let runContext = { boardId: "board-a", runId: "run-a" };
  let capabilityIds = ["node.text.create"];
  const session = CanvasAgentMcpServer.createCanvasMcpSession({
    broker,
    getScope: () => scope,
    getRunContext: () => runContext,
    getCapabilityIds: () => capabilityIds,
  });

  const tools = await session.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), ["create_text_node"]);
  assert.equal(tools.tools[0].inputSchema.additionalProperties, false);
  capabilityIds = ["node.delete"];
  const stableTools = await session.listTools();
  assert.deepEqual(stableTools, tools, "tools/list must remain stable while listChanged is false");

  const call = {
    call_id: "call-a",
    name: "create_text_node",
    arguments: { content: "标题", x: null, y: null },
  };
  const first = await session.callTool(call);
  const duplicate = await session.callTool(call);
  assert.equal(first.isError, false);
  assert.equal(first.structuredContent.ok, true);
  assert.equal(first.structuredContent.content, "标题");
  assert.deepEqual(duplicate.structuredContent, first.structuredContent);
  assert.equal(executions, 1, "MCP must preserve Broker idempotency");

  await assert.rejects(
    () => session.callTool({ call_id: "call-delete", name: "delete_nodes", arguments: { node_ids: [] } }),
    (error) => error.code === -32602,
  );

  currentBoardId = "board-b";
  runContext = { boardId: "board-b", runId: "run-b" };
  scope = broker.beginRun({ boardId: "board-b", runId: "run-b" });
  const stale = await session.callTool({ ...call, call_id: "call-stale" });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.code, "scope_expired");
  assert.equal(executions, 1, "a stale board call must not reach the adapter");

  session.close();
  console.log("Canvas agent MCP server checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
