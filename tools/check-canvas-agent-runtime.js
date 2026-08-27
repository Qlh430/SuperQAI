const assert = require("node:assert/strict");
const runtime = require("../canvas-agent-runtime");

const skill = runtime.parseSkillDocument(`---
name: ecommerce-image-set
description: 根据选中的产品图创建三张电商套图
canvas:
  category: ecommerce
  icon: shopping-cart
  required_selection: image
  approval: before-paid-generation
  tools:
    - create_image_node
    - create_gallery_node
    - connect_nodes
    - arrange_nodes
    - run_canvas_node
---
# 电商套图

先读取产品图，再生成主图、卖点图和场景图。
`, "skills/ecommerce-image-set/SKILL.md");

const posterSkill = runtime.parseSkillDocument(`---
name: poster-design
description: 根据目标创建活动海报
canvas:
  category: design
  icon: monitor
  required_selection: none
  approval: before-paid-generation
  tools:
    - create_text_node
    - create_image_node
    - run_canvas_node
---
# 海报设计

分析目标后创建海报所需的文字和图片节点。
`, "skills/poster-design/SKILL.md");

assert.equal(skill.id, "ecommerce-image-set");
assert.equal(skill.name, "ecommerce-image-set");
assert.equal(skill.description, "根据选中的产品图创建三张电商套图");
assert.equal(skill.canvas.category, "ecommerce");
assert.equal(skill.canvas.required_selection, "image");
assert.deepEqual(skill.canvas.tools, [
  "create_image_node",
  "create_gallery_node",
  "connect_nodes",
  "arrange_nodes",
  "run_canvas_node",
]);
assert.match(skill.instructions, /先读取产品图/);

const initial = runtime.buildResponsesRequest({
  skill_id: skill.id,
  prompt: "帮我做一套粉色运动鞋电商图",
  canvas: { id: "board-1", selected_node_ids: ["1"], nodes: [{ id: "1", kind: "image" }] },
  vision_images: ["data:image/jpeg;base64,abc"],
  step: 0,
}, {
  model: "gpt-5.6-terra",
  reasoningEffort: "medium",
  skills: [skill],
});

assert.equal(initial.model, "gpt-5.6-terra");
assert.deepEqual(initial.reasoning, { effort: "medium" });
assert.equal(initial.store, true);
assert.equal(initial.tools.length, 5);
assert.deepEqual(initial.tools.map((tool) => tool.name), skill.canvas.tools);
assert.equal(initial.input[0].role, "user");
assert.equal(initial.input[0].content[0].type, "input_text");
assert.equal(initial.input[0].content[1].type, "input_image");
assert.equal(initial.input[0].content[1].image_url, "data:image/jpeg;base64,abc");
assert.match(initial.instructions, /ecommerce-image-set/);

const automatic = runtime.buildResponsesRequest({
  skill_mode: "auto",
  skill_id: "",
  prompt: "你好",
  canvas: { nodes: [], selected_node_ids: [] },
  step: 0,
}, {
  model: "gpt-5.6-terra",
  reasoningEffort: "medium",
  skills: [skill, posterSkill],
});
assert.deepEqual(new Set(automatic.tools.map((tool) => tool.name)), new Set([
  "create_text_node",
  "create_image_node",
  "create_gallery_node",
  "connect_nodes",
  "arrange_nodes",
  "run_canvas_node",
  "activate_canvas_skill",
]));
assert.match(automatic.instructions, /可选业务 Skill 路由目录/);
assert.match(automatic.instructions, /普通交流/);
assert.match(automatic.instructions, /poster-design/);
assert.equal(automatic.instructions.includes(posterSkill.instructions), false);

const continuation = runtime.buildResponsesRequest({
  skill_id: skill.id,
  previous_response_id: "resp-1",
  tool_outputs: [
    { call_id: "call-1", output: { ok: true, node_id: "2" } },
    { call_id: "call-2", output: { ok: false, error: "node missing" } },
  ],
  step: 1,
}, {
  model: "gpt-5.6-terra",
  reasoningEffort: "low",
  skills: [skill],
  forceStateless: true,
  transcript: [{
    role: "assistant",
    content: "",
    tool_calls: [{ call_id: "call-1", name: "create_image_node", arguments: { prompt: "主图" } }],
  }],
});

assert.equal(continuation.previous_response_id, undefined);
assert.equal(continuation.input.length, 3);
assert.equal(continuation.input[0].type, "function_call");
assert.deepEqual(continuation.input[1], {
  type: "function_call_output",
  call_id: "call-1",
  output: JSON.stringify({ ok: true, node_id: "2" }),
});
assert.deepEqual(continuation.reasoning, { effort: "low" });

const replay = runtime.buildResponsesRequest({
  skill_mode: "auto",
  prompt: "创建标题",
  canvas: { nodes: [] },
  tool_outputs: [{ call_id: "call-replay", output: { ok: true, node_id: "8" } }],
  step: 1,
}, {
  model: "fallback-model",
  reasoningEffort: "medium",
  skills: [posterSkill],
  forceStateless: true,
  transcript: [{
    role: "assistant",
    content: "先创建文字节点",
    tool_calls: [{ call_id: "call-replay", name: "create_text_node", arguments: { content: "标题" } }],
  }],
});
assert.equal(replay.previous_response_id, undefined);
assert.equal(replay.input[0].role, "user");
assert.equal(replay.input[1].role, "assistant");
assert.equal(replay.input[2].type, "function_call");
assert.equal(replay.input[3].type, "function_call_output");

assert.throws(
  () => runtime.buildResponsesRequest({ skill_id: skill.id, prompt: "x", step: 12 }, { model: "m", skills: [skill] }),
  /12/,
);
assert.throws(
  () => runtime.buildResponsesRequest({ skill_id: "missing", prompt: "x", step: 0 }, { model: "m", skills: [skill] }),
  /missing/,
);
assert.throws(
  () => runtime.parseSkillDocument("# no frontmatter", "broken/SKILL.md"),
  /frontmatter/,
);

const turn = runtime.extractResponsesTurn({
  id: "resp-2",
  model: "gpt-5.6-terra",
  output: [
    {
      type: "message",
      content: [
        { type: "output_text", text: "我会先建立三个生成节点。" },
        { type: "output_text", text: "然后依次生成。" },
      ],
    },
    { type: "function_call", call_id: "call-a", name: "create_image_node", arguments: "{\"prompt\":\"主图\"}" },
  ],
});

assert.equal(turn.response_id, "resp-2");
assert.equal(turn.model, "gpt-5.6-terra");
assert.equal(turn.message, "我会先建立三个生成节点。\n然后依次生成。");
assert.deepEqual(turn.tool_calls, [
  { call_id: "call-a", name: "create_image_node", arguments: { prompt: "主图" } },
]);

assert.equal(
  runtime.normalizeResponsesApiUrl("https://api.openai.com/v1/chat/completions"),
  "https://api.openai.com/v1/responses",
);
assert.equal(runtime.normalizeResponsesApiUrl("https://example.com/v1"), "https://example.com/v1/responses");

assert.equal(runtime.selectAgentReasoningEffort({ prompt: "你好", step: 0 }, "medium"), "low");
assert.equal(runtime.selectAgentReasoningEffort({ skill_mode: "manual", skill_id: skill.id, prompt: "创建套图", step: 0 }, "medium"), "medium");
assert.equal(runtime.selectAgentReasoningEffort({ tool_outputs: [{ call_id: "c", output: "ok" }], step: 1 }, "medium"), "medium");

const chat = runtime.buildChatCompletionsRequest({
  skill_mode: "auto",
  prompt: "创建一张海报",
  canvas: { nodes: [] },
  vision_images: ["https://example.com/reference.png"],
  step: 0,
}, {
  model: "qwen-fast",
  reasoningEffort: "low",
  skills: [posterSkill],
});
assert.equal(chat.model, "qwen-fast");
assert.equal(chat.stream, true);
assert.equal(chat.messages[0].role, "system");
assert.equal(chat.messages[1].role, "user");
assert.equal(chat.messages[1].content[1].type, "image_url");
assert.equal(chat.tools[0].type, "function");
assert.equal(typeof chat.tools[0].function.parameters, "object");
assert.equal(chat.parallel_tool_calls, false);

const chatTurn = runtime.extractChatCompletionsTurn({
  id: "chat-1",
  model: "qwen-fast",
  usage: { total_tokens: 12 },
  choices: [{
    message: {
      content: "完成",
      tool_calls: [{
        id: "chat-call-1",
        type: "function",
        function: { name: "create_text_node", arguments: "{\"content\":\"标题\"}" },
      }],
    },
  }],
});
assert.equal(chatTurn.response_id, "chat-1");
assert.equal(chatTurn.message, "完成");
assert.deepEqual(chatTurn.tool_calls, [{
  call_id: "chat-call-1",
  name: "create_text_node",
  arguments: { content: "标题" },
}]);

function makeSseStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      events.forEach((event) => controller.enqueue(encoder.encode(`data: ${event}\n\n`)));
      controller.close();
    },
  });
}

async function runStreamChecks() {
  let responsesFirstEvents = 0;
  const responsesTurn = await runtime.consumeResponsesStream(makeSseStream([
    JSON.stringify({ type: "response.created", response: { id: "resp-stream", model: "gpt-test" } }),
    JSON.stringify({ type: "response.output_text.delta", delta: "你" }),
    JSON.stringify({ type: "response.output_text.delta", delta: "好" }),
    JSON.stringify({
      type: "response.completed",
      response: {
        id: "resp-stream",
        model: "gpt-test",
        output: [{ type: "message", content: [{ type: "output_text", text: "你好" }] }],
      },
    }),
    "[DONE]",
  ]), {
    onFirstEvent: () => { responsesFirstEvents += 1; },
  });
  assert.equal(responsesFirstEvents, 1);
  assert.equal(responsesTurn.response_id, "resp-stream");
  assert.equal(responsesTurn.message, "你好");

  let chatFirstEvents = 0;
  const streamedChatTurn = await runtime.consumeChatCompletionsStream(makeSseStream([
    JSON.stringify({ id: "chat-stream", model: "qwen-fast", choices: [{ delta: { content: "已" } }] }),
    JSON.stringify({
      id: "chat-stream",
      model: "qwen-fast",
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call-stream", function: { name: "create_text_node", arguments: "{\"content\":" } }] } }],
    }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"标题\"}" } }] } }] }),
    "[DONE]",
  ]), {
    onFirstEvent: () => { chatFirstEvents += 1; },
  });
  assert.equal(chatFirstEvents, 1);
  assert.equal(streamedChatTurn.message, "已");
  assert.deepEqual(streamedChatTurn.tool_calls, [{
    call_id: "call-stream",
    name: "create_text_node",
    arguments: { content: "标题" },
  }]);
}

runStreamChecks()
  .then(() => console.log("Canvas agent runtime checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
