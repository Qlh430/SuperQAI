"use strict";

const assert = require("node:assert/strict");
const capabilities = require("../canvas-agent-capabilities");
const runtime = require("../canvas-agent-runtime");

const [textTool] = capabilities.getMcpTools(["node.text.create"]);
assert.equal(textTool.name, "create_text_node");
assert.equal(textTool.title, "创建文字节点");
assert.equal(textTool.inputSchema.type, "object");
assert.equal(textTool.inputSchema.additionalProperties, false);
assert.equal(textTool.outputSchema.properties.ok.type, "boolean");
assert.deepEqual(Object.keys(textTool.annotations).sort(), [
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
  "readOnlyHint",
]);
assert.equal("parameters" in textTool, false);
assert.equal("strict" in textTool, false);
assert.equal("type" in textTool, false);

const allTools = capabilities.getMcpTools(capabilities.CAPABILITY_REGISTRY.map((item) => item.id));
assert.equal(allTools.length, capabilities.CAPABILITY_REGISTRY.length);
assert.equal(new Set(allTools.map((tool) => tool.name)).size, allTools.length);
allTools.forEach((tool) => {
  assert.ok(tool.title);
  assert.ok(tool.description);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.ok(tool.outputSchema);
  assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
  assert.equal(typeof tool.annotations.destructiveHint, "boolean");
  assert.equal(typeof tool.annotations.idempotentHint, "boolean");
  assert.equal(typeof tool.annotations.openWorldHint, "boolean");
});

assert.equal(capabilities.getCapabilityByToolName("delete_nodes").tool.annotations.destructiveHint, true);
assert.equal(capabilities.getCapabilityByToolName("run_canvas_node").tool.annotations.openWorldHint, true);
assert.equal(capabilities.getCapabilityByToolName("create_text_node").tool.annotations.destructiveHint, false);

const [legacyTool] = capabilities.getToolDefinitions(["node.text.create"]);
assert.deepEqual(legacyTool, runtime.toResponsesTool(textTool));
assert.deepEqual(runtime.toChatTool(textTool), {
  type: "function",
  function: {
    name: legacyTool.name,
    description: legacyTool.description,
    strict: legacyTool.strict,
    parameters: legacyTool.parameters,
  },
});

console.log("Canvas agent MCP capability checks passed.");
