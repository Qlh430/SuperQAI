"use strict";

const assert = require("node:assert/strict");

const { createCanvasAgentProviderBridge } = require("../canvas-agent-provider-bridge");
const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createProviderExecutor } = require("../provider-executor");

function provider(id, modelId) {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example/v1`,
    apiKey: `fake-${id}`,
    enabled: true,
    sortOrder: id === "primary" ? 0 : 1,
    capabilitySort: {},
    models: [{
      id: modelId,
      displayName: modelId,
      protocol: "openai",
      capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
      sortOrder: 0,
      capabilitySort: {},
    }],
  };
}

(async () => {
  const directCalls = [];
  const directExecutor = {
    async stream(request, onDelta) {
      directCalls.push(request);
      onDelta({ type: "text-delta", text: "正在处理" });
      return {
        text: "完成",
        reasoningContent: "先判断需要创建文本节点。",
        toolCalls: [{ id: "call-1", name: "create_text_node", arguments: '{"content":"海报"}' }],
        usage: { total_tokens: 9 },
        selection: { providerId: "primary", modelId: "agent-primary" },
        attempts: [],
      };
    },
  };
  const directBridge = createCanvasAgentProviderBridge({ executor: directExecutor });
  const controller = new AbortController();
  const deltas = [];
  const direct = await directBridge.runTurn({
    messages: [{ role: "user", content: "创建海报" }],
    system: "你是画布 Agent",
    tools: [{ type: "function", function: { name: "create_text_node", parameters: { type: "object" } } }],
    needsVision: false,
    providerId: "primary",
    modelId: "agent-primary",
    candidateOrder: [
      { providerId: "primary", modelId: "agent-primary" },
      { providerId: "secondary", modelId: "agent-secondary" },
    ],
    forceFallback: true,
    signal: controller.signal,
    onDelta: (event) => deltas.push(event),
  });
  assert.equal(directCalls[0].intent, "llm.tools");
  assert.deepEqual(directCalls[0].mustAll.sort(), ["llm.chat", "llm.chat.vision", "llm.tools"]);
  assert.equal(directCalls[0].preferredProviderId, "primary");
  assert.equal(directCalls[0].preferredModelId, "agent-primary");
  assert.deepEqual(directCalls[0].candidateOrder, [
    { providerId: "primary", modelId: "agent-primary" },
    { providerId: "secondary", modelId: "agent-secondary" },
  ]);
  assert.equal(directCalls[0].forceFallback, true);
  assert.equal(directCalls[0].options.signal, controller.signal);
  assert.deepEqual(directCalls[0].input.tools, [{ type: "function", function: { name: "create_text_node", parameters: { type: "object" } } }]);
  assert.deepEqual(deltas, [{ type: "text-delta", text: "正在处理" }]);
  assert.deepEqual(direct.turn.tool_calls, [{ call_id: "call-1", name: "create_text_node", arguments: { content: "海报" } }]);
  assert.equal(direct.turn.message, "完成");
  assert.equal(direct.turn.reasoning_content, "先判断需要创建文本节点。");

  const providers = [provider("primary", "agent-primary"), provider("secondary", "agent-secondary")];
  const store = {
    listInternal: () => providers,
    getAutoFallback: () => true,
  };
  const attempts = [];
  let failPrimary = true;
  const engine = {
    async execute() { throw new Error("execute should not be used"); },
    async executeWithTools() { throw new Error("executeWithTools should not be used"); },
    async stream(selectedProvider, selectedModel, _intent, _input, _params, onDelta) {
      attempts.push(selectedProvider.id);
      if (selectedProvider.id === "primary" && failPrimary) {
        throw Object.assign(new Error("primary unavailable"), { code: "UPSTREAM_UNAVAILABLE", retryable: true });
      }
      onDelta({ type: "text-delta", text: selectedProvider.id });
      return { text: selectedProvider.id, toolCalls: [], usage: null };
    },
  };
  const executor = createProviderExecutor({ resolver: createCapabilityResolver({ store }), engine });
  const bridge = createCanvasAgentProviderBridge({ executor });

  const fallback = await bridge.runTurn({
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    candidateOrder: [
      { providerId: "primary", modelId: "agent-primary" },
      { providerId: "secondary", modelId: "agent-secondary" },
    ],
    forceFallback: true,
  });
  assert.equal(fallback.selection.providerId, "secondary");
  assert.deepEqual(attempts, ["primary", "secondary"]);

  attempts.length = 0;
  await assert.rejects(
    bridge.runTurn({
      messages: [{ role: "user", content: "pinned" }],
      tools: [],
      providerId: "primary",
      modelId: "agent-primary",
    }),
    (error) => error.code === "UPSTREAM_UNAVAILABLE",
  );
  assert.deepEqual(attempts, ["primary"]);

  failPrimary = false;
  console.log("Canvas Agent Provider bridge checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
