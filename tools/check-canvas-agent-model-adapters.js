const assert = require("node:assert/strict");
const runtime = require("../canvas-agent-runtime");
const adapters = require("../canvas-agent-model-adapters");

const skill = runtime.parseSkillDocument(`---
name: adapter-contract-test
description: 验证模型适配器能够复用同一批画布工具
canvas:
  category: test
  tools:
    - create_text_node
---
# Adapter contract

收到明确要求时创建文字节点。
`, "adapter-contract-test/SKILL.md");

const payload = {
  skill_mode: "manual",
  skill_id: skill.id,
  prompt: "创建标题",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
};
const options = { model: "model-a", reasoningEffort: "low", skills: [skill] };

const responses = adapters.getModelAdapter("openai-responses");
const chat = adapters.getModelAdapter("openai-chat");
assert.equal(responses.id, "openai-responses");
assert.equal(chat.id, "openai-chat");
assert.deepEqual(adapters.listModelAdapters().map((item) => item.id), ["openai-responses", "openai-chat"]);

const responsesRequest = responses.buildRequest(payload, options);
const chatRequest = chat.buildRequest(payload, options);
assert.equal(responsesRequest.model, "model-a");
assert.equal(responsesRequest.tools[0].name, "create_text_node");
assert.equal(chatRequest.model, "model-a");
assert.equal(chatRequest.tools[0].function.name, "create_text_node");
assert.equal(responses.getEndpoint({ baseUrl: "https://one.test/v1", responsesUrl: "https://one.test/v1/responses" }), "https://one.test/v1/responses");
assert.equal(chat.getEndpoint({ baseUrl: "https://one.test/v1", chatCompletionsUrl: "https://one.test/v1/chat/completions" }), "https://one.test/v1/chat/completions");
assert.equal(responses.getHeaders({ apiKey: "secret" }).Authorization, "Bearer secret");
assert.equal(chat.getHeaders({ apiKey: "secret" })["Content-Type"], "application/json");

const expectedTurn = {
  response_id: "turn-1",
  model: "model-a",
  message: "开始执行",
  tool_calls: [{ call_id: "call-1", name: "create_text_node", arguments: { content: "标题" } }],
  usage: { total_tokens: 8 },
};
assert.deepEqual(responses.parseResponse({
  id: "turn-1",
  model: "model-a",
  output: [
    { type: "message", content: [{ type: "output_text", text: "开始执行" }] },
    { type: "function_call", call_id: "call-1", name: "create_text_node", arguments: "{\"content\":\"标题\"}" },
  ],
  usage: { total_tokens: 8 },
}), expectedTurn);
assert.deepEqual(chat.parseResponse({
  id: "turn-1",
  model: "model-a",
  choices: [{
    message: {
      content: "开始执行",
      tool_calls: [{ id: "call-1", function: { name: "create_text_node", arguments: "{\"content\":\"标题\"}" } }],
    },
  }],
  usage: { total_tokens: 8 },
}), { ...expectedTurn, reasoning_content: "" });

const probeTool = {
  name: "report_agent_probe",
  description: "Return a nonce.",
  parameters: {
    type: "object",
    properties: { nonce: { type: "string" } },
    required: ["nonce"],
    additionalProperties: false,
  },
};
const responsesProbe = responses.buildToolProbe({ model: "model-a", prompt: "report nonce", tool: probeTool });
const chatProbe = chat.buildToolProbe({ model: "model-a", prompt: "report nonce", tool: probeTool });
assert.equal(
  responsesProbe.tools[0].type,
  "function",
  "Responses tool verification must explicitly identify the function tool type for OpenAI-compatible gateways.",
);
assert.equal(responsesProbe.tools[0].name, "report_agent_probe");
assert.equal(responsesProbe.tool_choice.name, "report_agent_probe");
assert.equal(chatProbe.tool_choice.function.name, "report_agent_probe");
assert.equal(responses.buildVisionProbe({ model: "model-a", prompt: "see", imageUrl: "data:image/png;base64,abc" }).input[0].content[1].type, "input_image");
assert.equal(chat.buildVisionProbe({ model: "model-a", prompt: "see", imageUrl: "data:image/png;base64,abc" }).messages[0].content[1].type, "image_url");

assert.equal(adapters.resolveModelAdapter({ protocol: "responses" }).id, "openai-responses");
assert.equal(adapters.resolveModelAdapter({ protocol: "chat" }).id, "openai-chat");
assert.throws(
  () => adapters.registerModelAdapter({ id: "broken" }),
  /buildRequest/,
);

const customAdapter = {
  id: "contract-test",
  protocol: "custom",
  capabilities: ["text", "tools"],
  buildRequest: () => ({ custom: true }),
  getEndpoint: () => "https://custom.test/infer",
  getHeaders: () => ({ "Content-Type": "application/json" }),
  parseResponse: () => ({ response_id: "custom", message: "ok", tool_calls: [], usage: null }),
  consumeStream: async () => ({ response_id: "custom", message: "ok", tool_calls: [], usage: null }),
  buildToolProbe: () => ({ probe: "tool" }),
  buildVisionProbe: () => ({ probe: "vision" }),
};
adapters.registerModelAdapter(customAdapter);
assert.equal(adapters.resolveModelAdapter({ adapterId: "contract-test" }).id, "contract-test");
assert.equal(adapters.getModelAdapter("contract-test").buildRequest().custom, true);
assert.throws(() => adapters.registerModelAdapter(customAdapter), /already registered/);

console.log("Canvas agent model adapter checks passed.");
