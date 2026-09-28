"use strict";

const assert = require("node:assert/strict");

const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function abortableNever(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

(async () => {
  const captured = [];
  const responseQueue = [];
  const outboundFetch = async (url, options = {}) => {
    captured.push({ url: String(url), options });
    const next = responseQueue.shift();
    if (typeof next === "function") return next(url, options);
    if (!next) throw new Error(`No fake response queued for ${url}`);
    return next;
  };
  const registry = createProtocolRegistry();
  const engine = createProtocolEngine({ registry, outboundFetch });
  const input = { messages: [{ role: "user", content: "hi" }] };

  const openaiProvider = {
    id: "openai-main",
    baseUrl: "https://api.example.test/v1",
    protocol: "openai",
    apiKey: "sk-test-secret",
  };
  const openaiModel = { id: "gpt-test", protocol: "openai" };
  const request = engine.buildRequest(openaiProvider, openaiModel, "llm.chat", input, { temperature: 0.2 });
  assert.equal(request.url, "https://api.example.test/v1/chat/completions");
  assert.equal(request.headers.authorization, "Bearer sk-test-secret");
  assert.equal(request.body.model, "gpt-test");
  assert.equal(request.body.temperature, 0.2);
  assert.equal(engine.buildRequest(openaiProvider, openaiModel, "llm.chat", input, { unsupported_parameter: "must-not-leak" }).body.unsupported_parameter, undefined);
  const overriddenRequest = engine.buildRequest(openaiProvider, { id: "gpt-test", protocol: "openai", metadata: { parameterOverrides: { temperature: 0.7, top_p: 0.4 } } }, "llm.chat", input, { temperature: 0.2 });
  assert.equal(overriddenRequest.body.temperature, 0.2);
  assert.equal(overriddenRequest.body.top_p, 0.4);

  responseQueue.push(jsonResponse({ choices: [{ message: { content: "ok" } }], usage: null }));
  assert.deepEqual(await engine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, {}), {
    text: "ok",
    usage: null,
  });
  assert.equal(captured.at(-1).options.outbound.providerId, "openai-main");
  assert.equal(captured.at(-1).options.outbound.requestClass, "billable");

  responseQueue.push(() => {
    throw Object.assign(new Error("fetch failed"), {
      submissionState: "not_submitted",
      stage: "connect",
    });
  });
  await assert.rejects(
    engine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, {}),
    (error) => /未能连接模型服务/.test(error.safeMessage),
  );
  responseQueue.push(() => {
    throw Object.assign(new Error("fetch failed"), {
      submissionState: "not_submitted",
      stage: "connect",
    });
  });
  await assert.rejects(
    engine.execute(openaiProvider, { id: "gpt-image-2", protocol: "openai" }, "image.generate", { prompt: "poster" }, {}, {}),
    (error) => /未能连接图片服务/.test(error.safeMessage),
  );

  responseQueue.push(jsonResponse({
    id: "reasoning-1",
    model: "gpt-test",
    choices: [{
      message: {
        content: "",
        reasoning_content: "先检查画布，再决定调用哪个工具。",
        tool_calls: [{
          id: "call-reasoning",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"poster"}' },
        }],
      },
    }],
    usage: null,
  }));
  const reasoningResult = await engine.execute(openaiProvider, openaiModel, "llm.tools", {
    messages: [{ role: "user", content: "设计一张海报" }],
    tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
  }, {}, {});
  assert.equal(reasoningResult.reasoningContent, "先检查画布，再决定调用哪个工具。");
  assert.deepEqual(reasoningResult.toolCalls, [{
    id: "call-reasoning",
    name: "lookup",
    arguments: '{"q":"poster"}',
  }]);

  const reasoningReplay = engine.buildRequest(openaiProvider, openaiModel, "llm.tools", {
    messages: [
      { role: "user", content: "设计一张海报" },
      {
        role: "assistant",
        content: null,
        reasoning_content: "先检查画布，再决定调用哪个工具。",
        tool_calls: [{
          id: "call-reasoning",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"poster"}' },
        }],
      },
      { role: "tool", tool_call_id: "call-reasoning", content: '{"ok":true}' },
    ],
    tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
  }, {});
  assert.equal(
    reasoningReplay.body.messages[1].reasoning_content,
    "先检查画布，再决定调用哪个工具。",
    "assistant reasoning_content must be replayed on tool continuation requests",
  );

  const apimartChatProvider = {
    id: "apimart-chat",
    baseUrl: "https://api.apimart.ai/v1",
    protocol: "openai",
    apiKey: "sk-apimart-test",
  };
  // Tool fields are only valid together. A greeting turn selects no canvas
  // tools, and a strict gateway answers `Invalid value for 'tool_choice':
  // 'tool_choice' is only allowed when 'tools' are specified.` when the field
  // still travels, so it has to be dropped with the tools.
  const toolLessRequest = engine.buildRequest(openaiProvider, openaiModel, "llm.tools", {
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    toolChoice: "auto",
  }, { parallel_tool_calls: true });
  assert.equal("tool_choice" in toolLessRequest.body, false, "tool_choice must not be sent without tools");
  assert.equal("tools" in toolLessRequest.body, false, "an empty tools array must not be sent");
  assert.equal("parallel_tool_calls" in toolLessRequest.body, false, "parallel_tool_calls must not be sent without tools");

  const toolRequest = engine.buildRequest(openaiProvider, openaiModel, "llm.tools", {
    messages: [{ role: "user", content: "hi" }],
    tools: [{ type: "function", function: { name: "create_text_node", parameters: { type: "object" } } }],
    toolChoice: "auto",
  }, { parallel_tool_calls: false });
  assert.equal(toolRequest.body.tools.length, 1);
  assert.equal(toolRequest.body.tool_choice, "auto");
  assert.equal(toolRequest.body.parallel_tool_calls, false);

  const replayedRequest = engine.buildRequest(openaiProvider, openaiModel, "llm.tools", {
    messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好！有什么需要我帮忙的吗？", tool_calls: [] },
    ],
    tools: [{ type: "function", function: { name: "create_text_node", parameters: { type: "object" } } }],
    toolChoice: "auto",
  }, {});
  assert.equal(
    "tool_calls" in replayedRequest.body.messages[1],
    false,
    "a replayed assistant turn without tool calls must omit tool_calls",
  );

  const apimartChatModel = { id: "gpt-5.5", protocol: "openai" };
  const apimartChatRequest = engine.buildRequest(apimartChatProvider, apimartChatModel, "llm.chat", input, {});
  assert.equal(apimartChatRequest.body.stream, false, "APIMart chat tests must explicitly request JSON instead of the gateway default SSE stream");
  responseQueue.push((_url, options) => {
    const body = JSON.parse(options.body);
    return body.stream === false
      ? jsonResponse({ choices: [{ message: { content: "apimart-json-ok" } }] })
      : new Response("data: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  assert.deepEqual(await engine.execute(apimartChatProvider, apimartChatModel, "llm.chat", input, {}, {}), {
    text: "apimart-json-ok",
    usage: null,
  });

  const overriddenExecutionModel = {
    id: "gpt-test",
    protocol: "openai",
    metadata: { parameterOverrides: { temperature: 0.7, top_p: 0.4 } },
  };
  responseQueue.push(jsonResponse({ choices: [{ message: { content: "override-ok" } }], usage: null }));
  await engine.execute(openaiProvider, overriddenExecutionModel, "llm.chat", input, {}, {});
  const overriddenExecutionBody = JSON.parse(captured.at(-1).options.body);
  assert.equal(overriddenExecutionBody.temperature, 0.7);
  assert.equal(overriddenExecutionBody.top_p, 0.4);

  const anthropicProvider = { id: "claude", baseUrl: "https://api.anthropic.com", protocol: "anthropic", apiKey: "ant-test" };
  const anthropicModel = { id: "claude-test", protocol: "anthropic" };
  const anthropicRequest = engine.buildRequest(
    anthropicProvider,
    anthropicModel,
    "llm.chat",
    { system: "system", messages: input.messages },
    {},
  );
  assert.equal(anthropicRequest.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropicRequest.headers["x-api-key"], "ant-test");
  assert.equal(anthropicRequest.headers["anthropic-version"], "2023-06-01");
  assert.equal(anthropicRequest.body.system, "system");
  assert.equal(anthropicRequest.body.max_tokens, 1024);
  const anthropicToolRequest = engine.buildRequest(anthropicProvider, anthropicModel, "llm.tools", {
    system: "agent-system",
    messages: [
      { role: "user", content: "create" },
      { role: "assistant", content: null, tool_calls: [{ id: "call-a", function: { name: "create_text_node", arguments: '{"content":"title"}' } }] },
      { role: "tool", tool_call_id: "call-a", content: '{"ok":true}' },
    ],
    tools: [{ type: "function", function: { name: "create_text_node", parameters: { type: "object" } } }],
  }, { max_tokens: 2048 });
  assert.deepEqual(anthropicToolRequest.body.messages, [
    { role: "user", content: "create" },
    { role: "assistant", content: [{ type: "tool_use", id: "call-a", name: "create_text_node", input: { content: "title" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call-a", content: '{"ok":true}' }] },
  ]);
  assert.deepEqual(anthropicToolRequest.body.tools, [{ name: "create_text_node", description: undefined, input_schema: { type: "object" } }]);
  responseQueue.push(jsonResponse({ content: [{ type: "text", text: "claude-ok" }], usage: { output_tokens: 1 } }));
  assert.deepEqual(await engine.execute(anthropicProvider, anthropicModel, "llm.chat", input, {}, {}), {
    text: "claude-ok",
    usage: { output_tokens: 1 },
  });

  const geminiProvider = { id: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", protocol: "gemini", apiKey: "gem-test" };
  const geminiModel = { id: "gemini-test", protocol: "gemini" };
  const geminiRequest = engine.buildRequest(
    geminiProvider,
    geminiModel,
    "llm.chat",
    input,
    {},
  );
  assert.equal(geminiRequest.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  assert.equal(geminiRequest.headers["x-goog-api-key"], "gem-test");
  assert.deepEqual(geminiRequest.body.contents[0].parts, [{ text: "hi" }]);
  responseQueue.push(jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }], usageMetadata: { candidatesTokenCount: 1 } }));
  assert.deepEqual(await engine.execute(geminiProvider, geminiModel, "llm.chat", input, {}, {}), {
    text: "gemini-ok",
    usage: { candidatesTokenCount: 1 },
  });
  const geminiImageRequest = engine.buildRequest(
    geminiProvider,
    { id: "gemini-image", protocol: "gemini" },
    "image.generate",
    { prompt: "paper forest" },
    { generationConfig: { imageConfig: { aspectRatio: "16:9", imageSize: "2K" } } },
  );
  assert.deepEqual(geminiImageRequest.body.contents, [{ role: "user", parts: [{ text: "paper forest" }] }]);
  assert.deepEqual(geminiImageRequest.body.generationConfig, {
    imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
    responseModalities: ["TEXT", "IMAGE"],
  });
  const geminiEditRequest = engine.buildRequest(
    geminiProvider,
    { id: "gemini-image", protocol: "gemini" },
    "image.edit",
    { prompt: "make it autumn", inputImages: ["data:image/png;base64,AA=="] },
    {},
  );
  assert.deepEqual(geminiEditRequest.body.contents[0].parts, [
    { text: "make it autumn" },
    { inlineData: { mimeType: "image/png", data: "AA==" } },
  ]);
  responseQueue.push(jsonResponse({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQ==" } }] } }],
    usageMetadata: { candidatesTokenCount: 2 },
  }));
  assert.deepEqual(
    await engine.execute(geminiProvider, { id: "gemini-image", protocol: "gemini" }, "image.generate", { prompt: "paper forest" }, {}, {}),
    { data: [{ b64_json: "AQ==", mime_type: "image/png" }], usage: { candidatesTokenCount: 2 } },
  );

  const responsesModel = { id: "gpt-response", protocol: "openai-responses" };
  const responsesRequest = engine.buildRequest(openaiProvider, responsesModel, "llm.chat", input, {});
  assert.equal(responsesRequest.url, "https://api.example.test/v1/responses");

  assert.throws(
    () => engine.buildRequest(geminiProvider, { id: "gpt-image-1", protocol: "openai-images" }, "image.generate", { prompt: "blocked" }),
    (error) => error.code === "incompatible_protocols",
  );
  const responsesToolRequest = engine.buildRequest(openaiProvider, responsesModel, "llm.tools", {
    system: "Canvas Agent system",
    messages: [
      { role: "user", content: [{ type: "text", text: "create" }, { type: "image_url", image_url: { url: "https://cdn.example.test/ref.png" } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "create_text_node", arguments: '{"content":"poster"}' } }] },
      { role: "tool", tool_call_id: "call-1", content: '{"ok":true}' },
    ],
    tools: [{ type: "function", function: { name: "create_text_node", description: "Create text", parameters: { type: "object" } } }],
  }, { max_tokens: 4096, reasoning_effort: "medium", parallel_tool_calls: false });
  assert.equal(responsesToolRequest.body.instructions, "Canvas Agent system");
  assert.equal(responsesToolRequest.body.max_output_tokens, 4096);
  assert.deepEqual(responsesToolRequest.body.reasoning, { effort: "medium" });
  assert.equal(responsesToolRequest.body.max_tokens, undefined);
  assert.equal(responsesToolRequest.body.reasoning_effort, undefined);
  assert.deepEqual(responsesToolRequest.body.tools, [{ type: "function", name: "create_text_node", description: "Create text", parameters: { type: "object" } }]);
  assert.deepEqual(responsesToolRequest.body.input, [
    { role: "user", content: [{ type: "input_text", text: "create" }, { type: "input_image", image_url: "https://cdn.example.test/ref.png" }] },
    { type: "function_call", call_id: "call-1", name: "create_text_node", arguments: '{"content":"poster"}' },
    { type: "function_call_output", call_id: "call-1", output: '{"ok":true}' },
  ]);
  responseQueue.push(jsonResponse({ output_text: "response-ok", usage: { output_tokens: 1 } }));
  assert.deepEqual(await engine.execute(openaiProvider, responsesModel, "llm.chat", input, {}, {}), {
    text: "response-ok",
    usage: { output_tokens: 1 },
  });

  const imageRequest = engine.buildRequest(
    openaiProvider,
    { id: "gpt-image-1", protocol: "openai-images" },
    "image.generate",
    { prompt: "paper kite" },
    { size: "1024x1024", quality: "high", n: 1, resolution: "2k", version: "7" },
  );
  assert.equal(imageRequest.url, "https://api.example.test/v1/images/generations");
  assert.equal(imageRequest.body.prompt, "paper kite");
  assert.equal(imageRequest.body.quality, "high");
  assert.equal(imageRequest.body.n, 1);
  assert.equal(imageRequest.body.resolution, undefined);
  assert.equal(imageRequest.body.version, undefined);
  const compatibleImageRequest = engine.buildRequest(
    openaiProvider,
    { id: "gemini-image-proxy", protocol: "openai-images" },
    "image.generate",
    { prompt: "proxy image" },
    { aspect_ratio: "1:1", image_size: "4K" },
  );
  assert.equal(compatibleImageRequest.body.aspect_ratio, "1:1");
  assert.equal(compatibleImageRequest.body.image_size, "4K");
  const fluxImageRequest = engine.buildRequest(
    openaiProvider,
    { id: "flux-pro-1.1", protocol: "openai-images" },
    "image.generate",
    { prompt: "flux landscape" },
    { size: "1536x1024", steps: 28, guidance_scale: 3.5, seed: 1234, negativePrompt: "blurry, low detail" },
  );
  assert.equal(fluxImageRequest.body.steps, 28);
  assert.equal(fluxImageRequest.body.guidance_scale, 3.5);
  assert.equal(fluxImageRequest.body.seed, 1234);
  assert.equal(fluxImageRequest.body.negative_prompt, "blurry, low detail");
  assert.equal(fluxImageRequest.body.negativePrompt, undefined);
  const aliasedImageRequest = engine.buildRequest(
    openaiProvider,
    { id: "gpt-image-2-ainb", protocol: "openai-images", metadata: { upstreamModel: "gpt-image-2" } },
    "image.generate",
    { prompt: "alias" },
    {},
  );
  assert.equal(aliasedImageRequest.body.model, "gpt-image-2");
  responseQueue.push(jsonResponse({ data: [{ url: "https://cdn.example.test/image.png" }] }));
  assert.deepEqual(await engine.execute(openaiProvider, { id: "gpt-image-1", protocol: "openai-images" }, "image.generate", { prompt: "paper kite" }, {}, {}), {
    data: [{ url: "https://cdn.example.test/image.png" }],
    usage: null,
  });

  responseQueue.push(jsonResponse({
    data: {
      result: {
        output: [
          { image_url: "https://cdn.example.test/nested-image.png" },
          { url: "https://cdn.example.test/nested-image.png" },
        ],
      },
    },
    usage: { images: 1 },
  }));
  assert.deepEqual(await engine.execute(openaiProvider, { id: "nested-image", protocol: "openai-images" }, "image.generate", { prompt: "nested" }, {}, {}), {
    data: [{ url: "https://cdn.example.test/nested-image.png" }],
    usage: { images: 1 },
  });

  responseQueue.push(jsonResponse({
    response: {
      outputs: [
        { image_base64: "AQ==", mime_type: "image/webp" },
        { b64_json: "AQ==", mime_type: "image/webp" },
      ],
    },
  }));
  assert.deepEqual(await engine.execute(openaiProvider, { id: "base64-image", protocol: "openai-images" }, "image.generate", { prompt: "base64" }, {}, {}), {
    data: [{ b64_json: "AQ==", mime_type: "image/webp" }],
    usage: null,
  });

  const editRequest = engine.buildRequest(
    openaiProvider,
    { id: "gpt-image-1", protocol: "openai-images" },
    "image.edit",
    {
      prompt: "autumn",
      inputImages: [{ blob: new Blob(["image-bytes"], { type: "image/png" }), filename: "tree.png" }],
    },
    { size: "1024x1024", n: 1, steps: 24, guidance_scale: 4.5, seed: 99, negativePrompt: "flat lighting" },
  );
  assert.equal(editRequest.url, "https://api.example.test/v1/images/edits");
  assert.equal(editRequest.headers["content-type"], undefined);
  assert.ok(editRequest.body instanceof FormData);
  assert.equal(editRequest.body.get("model"), "gpt-image-1");
  assert.equal(editRequest.body.get("prompt"), "autumn");
  assert.equal(editRequest.body.get("steps"), "24");
  assert.equal(editRequest.body.get("guidance_scale"), "4.5");
  assert.equal(editRequest.body.get("seed"), "99");
  assert.equal(editRequest.body.get("negative_prompt"), "flat lighting");
  assert.equal(editRequest.body.get("negativePrompt"), null);
  assert.equal(editRequest.body.getAll("image").length, 1);

  responseQueue.push(new Response([
    'data: {"choices":[{"delta":{"content":"hel"}}]}',
    'data: {"choices":[{"delta":{"content":"lo","tool_calls":[{"index":0,"id":"call-1","function":{"name":"clock","arguments":"{\\"zone\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"UTC\\"}"}}]}}],"usage":{"output_tokens":2}}',
    "data: [DONE]",
    "",
  ].join("\n\n"), { status: 200, headers: { "content-type": "text/event-stream" } }));
  const events = [];
  const streamed = await engine.stream(openaiProvider, openaiModel, "llm.chat", input, {}, (event) => events.push(event), {});
  assert.equal(streamed.text, "hello");
  assert.deepEqual(events.filter((event) => event.type === "text-delta").map((event) => event.text), ["hel", "lo"]);
  assert.deepEqual(streamed.toolCalls, [{ id: "call-1", name: "clock", arguments: '{"zone":"UTC"}' }]);
  assert.deepEqual(streamed.usage, { output_tokens: 2 });

  responseQueue.push(jsonResponse({
    choices: [{ message: { content: "", tool_calls: [{ id: "tool-1", function: { name: "lookup", arguments: "{}" } }] } }],
    usage: { total_tokens: 4 },
  }));
  assert.deepEqual(
    await engine.executeWithTools(openaiProvider, openaiModel, input.messages, "system", [{ type: "function", function: { name: "lookup" } }], {}),
    { content: "", toolCalls: [{ id: "tool-1", name: "lookup", arguments: "{}" }], usage: { total_tokens: 4 } },
  );

  responseQueue.push(jsonResponse({ data: [{ id: "gpt-a" }, { name: "gpt-b" }] }));
  assert.deepEqual(await engine.fetchModels(openaiProvider, {}), ["gpt-a", "gpt-b"]);

  responseQueue.push(jsonResponse({ error: { message: `invalid ${"sk-test-secret"} ${"x".repeat(3000)}` } }, 401));
  await assert.rejects(
    engine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, {}),
    (error) => error.code === "UPSTREAM_AUTH"
      && error.providerId === "openai-main"
      && error.retryable === false
      && !error.safeMessage.includes("sk-test-secret")
      && error.safeMessage.length < 2300,
  );

  const streamErrorEngine = createProtocolEngine({
    registry,
    outboundFetch: async () => jsonResponse({ error: { message: "stream auth denied sk-test-secret" } }, 401),
  });
  await assert.rejects(
    streamErrorEngine.stream(openaiProvider, openaiModel, "llm.chat", input, {}, () => {}, {}),
    (error) => error.code === "UPSTREAM_AUTH" && !error.safeMessage.includes("sk-test-secret"),
  );

  const verifyAttempts = [];
  const verifyRegistry = createProtocolRegistry({
    adapters: {
      apimart: {
        async fetchModels() {
          verifyAttempts.push("apimart");
          throw new Error("no model endpoint");
        },
      },
    },
  });
  const verifyEngine = createProtocolEngine({
    registry: verifyRegistry,
    outboundFetch: async () => {
      verifyAttempts.push("openai");
      return jsonResponse({ data: [{ id: "gpt-ok" }] });
    },
  });
  const legacyApimartVerification = await verifyEngine.verifyProtocol({
    id: "draft",
    baseUrl: "https://api.apimart.ai/v1",
    protocol: "apimart",
    apiKey: "fake-key",
  }, {});
  assert.equal(legacyApimartVerification.selectedProtocol, "openai");
  assert.equal(legacyApimartVerification.requestedProtocol, "apimart");
  assert.deepEqual(legacyApimartVerification.models, ["gpt-ok"]);
  assert.deepEqual(verifyAttempts, ["openai"]);

  const malformedApimartEngine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }),
    outboundFetch: async () => jsonResponse({ status: "ok" }),
  });
  await assert.rejects(
    malformedApimartEngine.fetchModels({ id: "malformed-apimart", baseUrl: "https://api.apimart.ai/v1", protocol: "apimart", apiKey: "fake-key" }, { verifyCatalog: true }),
    error => error.code === "UPSTREAM_PROTOCOL" && /模型目录/.test(error.safeMessage),
    "an HTTP 200 envelope without an OpenAI-compatible model directory must not verify as available",
  );

  const diagnosticCalls = [];
  const diagnosticEngine = createProtocolEngine({
    registry,
    outboundFetch: async (url) => {
      diagnosticCalls.push(String(url));
      if (String(url).includes("v1beta")) return jsonResponse({ error: "unsupported protocol" }, 404);
      return jsonResponse({ data: [{ id: "gpt-ok" }] });
    },
  });
  const diagnosticDraft = { id: "diagnostic", protocol: "gemini", baseUrl: "https://example.test/v1", apiKey: "fake-key" };
  const diagnostic = await diagnosticEngine.verifyProtocol(diagnosticDraft, { suggestAlternatives: true });
  assert.equal(diagnostic.available, false, "wrong selected protocol must not be reported available");
  assert.equal(diagnostic.selectedProtocol, "gemini", "suggestions must not silently switch protocol");
  assert.equal(diagnostic.recommendedProtocol, "openai", "recommend only a successfully probed directory");
  assert.equal(diagnosticDraft.protocol, "gemini");
  assert.ok(diagnosticCalls.length <= 4, "alternative detection must be bounded");
  const verified = await diagnosticEngine.verifyProtocol({ ...diagnosticDraft, protocol: "openai" }, { suggestAlternatives: true });
  assert.equal(verified.available, true);
  let authCalls = 0;
  const deniedEngine = createProtocolEngine({ registry, outboundFetch: async () => { authCalls++; return jsonResponse({ error: "denied fake-key" }, 401); } });
  const denied = await deniedEngine.verifyProtocol(diagnosticDraft, { suggestAlternatives: true });
  assert.equal(denied.available, false);
  assert.match(denied.guidance, /API Key/);
  assert.equal(denied.recommendedProtocol, undefined);
  assert.equal(authCalls, 1, "do not keep probing with rejected credentials");
  assert.ok(!JSON.stringify(denied).includes("fake-key"));
  const unrelatedJsonEngine = createProtocolEngine({ registry, outboundFetch: async () => jsonResponse({ status: "ok" }) });
  const unrelatedJson = await unrelatedJsonEngine.verifyProtocol({ ...diagnosticDraft, protocol: "openai" }, { suggestAlternatives: true });
  assert.equal(unrelatedJson.available, false, "an arbitrary JSON success response is not a model directory");
  assert.equal(unrelatedJson.recommendedProtocol, undefined);
  const emptyDirectoryEngine = createProtocolEngine({ registry, outboundFetch: async () => jsonResponse({ data: [] }) });
  const emptyDirectory = await emptyDirectoryEngine.verifyProtocol({ ...diagnosticDraft, protocol: "openai" }, { suggestAlternatives: true });
  assert.equal(emptyDirectory.available, true, "a valid empty directory remains supported");
  const wrongShape = await emptyDirectoryEngine.verifyProtocol(diagnosticDraft, { suggestAlternatives: true });
  assert.equal(wrongShape.available, false, "a different protocol's envelope is not accepted as Gemini");

  const cliCalls = [];
  let cliFailure = null;
  const cliProvider = { id: "jimeng-main", protocol: "cli:jimeng", baseUrl: "", source: "cli", cliTool: "jimeng" };
  const cliModel = { id: "my-image", protocol: "cli:jimeng", metadata: { upstreamModel: "jimeng-image" } };
  const cliService = {
    async models() { return ["jimeng-image", "jimeng-video"]; },
    async generate(request) {
      cliCalls.push(request);
      if (cliFailure) throw cliFailure;
      await request.onTaskSubmitted?.({ protocol: "cli:jimeng", providerId: request.providerId, modelId: request.modelId, baseUrl: "", taskId: "cli-task-1" });
      return { data: [{ url: "https://media.example.test/cli.png" }], task_id: "cli-task-1" };
    },
  };
  let cliHttpRequests = 0;
  const cliRegistry = createProtocolRegistry({ adapters: createMediaProtocolAdapters({ jimengCliService: cliService }) });
  const cliEngine = createProtocolEngine({
    registry: cliRegistry,
    outboundFetch: async () => { cliHttpRequests += 1; throw new Error("CLI must not use HTTP"); },
  });
  assert.deepEqual(await cliEngine.fetchModels(cliProvider), ["jimeng-image", "jimeng-video"]);
  assert.throws(() => cliEngine.buildRequest(cliProvider, cliModel, "image.generate"), error => error.code === "CLI_LOCAL_ONLY");
  assert.equal(cliEngine.describeExecution(cliProvider, cliModel, "image.generate").runnable, true);
  const cliSignal = new AbortController().signal;
  const cliMarkers = [];
  assert.deepEqual(await cliEngine.execute(cliProvider, cliModel, "image.edit", {
    prompt: "paper crane", inputImages: [{ blob: new Blob(["ref"], { type: "image/png" }) }],
  }, { size: "1:1" }, { signal: cliSignal, onTaskSubmitted: marker => cliMarkers.push(marker) }), {
    data: [{ url: "https://media.example.test/cli.png" }], task_id: "cli-task-1",
  });
  assert.equal(cliCalls[0].modelId, "jimeng-image");
  assert.equal(cliCalls[0].publicModelId, "my-image");
  assert.equal(cliCalls[0].signal, cliSignal);
  assert.deepEqual(cliCalls[0].references, ["data:image/png;base64,cmVm"]);
  assert.deepEqual(cliCalls[0].params, { size: "1:1" });
  assert.deepEqual(cliMarkers, [{ protocol: "cli:jimeng", providerId: "jimeng-main", modelId: "my-image", baseUrl: "", taskId: "cli-task-1" }]);
  await cliEngine.execute(cliProvider, cliModel, "image.generate", { prompt: "new image" });
  await cliEngine.execute(cliProvider, { id: "jimeng-video", protocol: "cli:jimeng" }, "video.generate", { prompt: "slow orbit" });
  assert.deepEqual(cliCalls.map(call => call.intent), ["image.edit", "image.generate", "video.generate"]);
  await cliEngine.execute(cliProvider, cliModel, "image.edit", {}, {}, { resumeTask: cliMarkers[0] });
  assert.equal(cliCalls.at(-1).resumeTask.taskId, "cli-task-1");
  const callsBeforeInvalid = cliCalls.length;
  for (const changed of [{ providerId: "other" }, { modelId: "other" }, { protocol: "jimeng-cli" }, { baseUrl: "https://other.test" }, { taskId: "" }]) {
    await assert.rejects(cliEngine.execute(cliProvider, cliModel, "image.generate", {}, {}, {
      resumeTask: { ...cliMarkers[0], ...changed },
    }), error => error.retryable === false && /配置|任务/.test(error.safeMessage));
  }
  await assert.rejects(cliEngine.execute(cliProvider, cliModel, "image.edit", { prompt: "missing reference" }), error => error.retryable === false);
  await assert.rejects(cliEngine.execute(cliProvider, cliModel, "llm.chat", input), error => error.retryable === false);
  assert.equal(cliCalls.length, callsBeforeInvalid);
  await assert.rejects(cliEngine.execute(cliProvider, cliModel, "image.generate", { prompt: "save marker" }, {}, {
    onTaskSubmitted() { throw new Error("private persistence error"); },
  }), error => error.code === "UPSTREAM_TASK_PENDING" && error.submissionState === "submitted"
    && !error.safeMessage.includes("private persistence error") && error.retryable === false);
  cliFailure = Object.assign(new Error("raw session_token=private-credential"), {
    code: "jimeng_cli_timeout", safeMessage: "即梦 CLI 请求超时。", submissionState: "unknown",
  });
  await assert.rejects(cliEngine.execute(cliProvider, cliModel, "image.generate", { prompt: "failure" }), error =>
    error.safeMessage === "即梦 CLI 请求超时。" && error.retryable === false && error.submissionState === "unknown");
  cliFailure = new Error("raw cookie=private-credential");
  await assert.rejects(cliEngine.execute(cliProvider, cliModel, "image.generate", { prompt: "failure" }), error =>
    !error.safeMessage.includes("private-credential") && error.retryable === false);
  cliFailure = Object.assign(new Error("cancelled"), { name: "AbortError", submissionState: "submitted" });
  await assert.rejects(cliEngine.execute(cliProvider, cliModel, "image.generate", { prompt: "abort" }), error =>
    error.code === "REQUEST_ABORTED" && error.submissionState === "submitted" && error.retryable === false);
  assert.equal(cliHttpRequests, 0);
  const missingCliEngine = createProtocolEngine({ registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }) });
  await assert.rejects(missingCliEngine.execute(cliProvider, cliModel, "image.generate", { prompt: "unavailable" }),
    error => error.code === "jimeng_cli_unavailable" && error.retryable === false);
  assert.equal(missingCliEngine.describeExecution(cliProvider, cliModel, "image.generate").runnable, false);
  const unavailableCliEngine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }),
    outboundFetch: async () => { cliHttpRequests += 1; throw new Error("CLI must not fall back to HTTP"); },
  });
  await assert.rejects(unavailableCliEngine.verifyProtocol(cliProvider), error =>
    error.code === "jimeng_cli_unavailable" && error.attempts.length === 1 && error.attempts[0].protocol === "cli:jimeng");
  assert.equal(cliHttpRequests, 0);

  const timeoutEngine = createProtocolEngine({
    registry,
    outboundFetch: (_url, options) => abortableNever(options.signal),
  });
  const externalAbortController = new AbortController();
  const externallyAborted = timeoutEngine.execute(
    openaiProvider,
    openaiModel,
    "llm.chat",
    input,
    {},
    { signal: externalAbortController.signal, totalTimeoutMs: 1000 },
  );
  externalAbortController.abort();
  await assert.rejects(
    externallyAborted,
    (error) => error.name === "AbortError" && error.code === "REQUEST_ABORTED" && error.retryable === false,
  );
  await assert.rejects(
    timeoutEngine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, { connectTimeoutMs: 10, firstEventTimeoutMs: 10, totalTimeoutMs: 60_000 }),
    (error) => error.code === "UPSTREAM_TIMEOUT" && error.stage === "connect",
  );

  // Waiting for a non-streaming reply is waiting for the answer to start, not
  // for a socket to open: the Canvas Agent budgets 4s of "connect" time while
  // its tool turns routinely need longer, and every reply slower than the dial
  // allowance used to be killed as a connection timeout.
  let slowReplyServed = false;
  const slowReplyEngine = createProtocolEngine({
    registry,
    outboundFetch: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      slowReplyServed = true;
      return jsonResponse({ choices: [{ message: { content: "slow-ok" } }] });
    },
  });
  assert.deepEqual(
    await slowReplyEngine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, {
      connectTimeoutMs: 10,
      firstEventTimeoutMs: 400,
      totalTimeoutMs: 60_000,
    }),
    { text: "slow-ok", usage: null },
    "a reply that outlives the connect allowance must still be delivered",
  );
  assert.equal(slowReplyServed, true);

  const stalledBody = { getReader: () => ({ read: () => new Promise(() => {}), cancel() {}, releaseLock() {} }) };
  const firstEventEngine = createProtocolEngine({
    registry,
    outboundFetch: async () => ({ ok: true, status: 200, headers: new Headers(), body: stalledBody }),
  });
  await assert.rejects(
    firstEventEngine.stream(openaiProvider, openaiModel, "llm.chat", input, {}, () => {}, { firstEventTimeoutMs: 10, totalTimeoutMs: 100 }),
    (error) => error.code === "UPSTREAM_TIMEOUT" && error.stage === "first-event",
  );

  let totalReadCount = 0;
  const totalBody = {
    getReader: () => ({
      read: () => {
        totalReadCount += 1;
        if (totalReadCount === 1) return Promise.resolve({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"started"}}]}\n\n') });
        return new Promise(() => {});
      },
      cancel() {},
      releaseLock() {},
    }),
  };
  const totalTimeoutEngine = createProtocolEngine({
    registry,
    outboundFetch: async () => ({ ok: true, status: 200, headers: new Headers(), body: totalBody }),
  });
  await assert.rejects(
    totalTimeoutEngine.stream(openaiProvider, openaiModel, "llm.chat", input, {}, () => {}, { firstEventTimeoutMs: 100, totalTimeoutMs: 15 }),
    (error) => error.code === "UPSTREAM_TIMEOUT" && error.stage === "total",
  );

  // A gateway that rejects function tools together with a reasoning budget must
  // get one adapted retry instead of failing the whole Agent turn.
  const gatewayProvider = { ...openaiProvider, id: "apimart-gateway", baseUrl: "https://api.apimart.ai/v1" };
  const gatewayModel = { id: "gpt-5.6-terra", protocol: "openai" };
  const gatewayBodies = [];
  const gatewayEngine = createProtocolEngine({
    registry,
    outboundFetch: async (url, options = {}) => {
      const body = JSON.parse(options.body);
      gatewayBodies.push(body);
      if (Array.isArray(body.tools) && body.tools.length && body.reasoning_effort !== "none") {
        return jsonResponse({
          error: {
            message: "Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions. "
              + "To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
          },
        }, 400);
      }
      return jsonResponse({ choices: [{ message: { content: "adapted-ok" } }], usage: null });
    },
  });
  const toolInput = {
    messages: [{ role: "user", content: "你好" }],
    tools: [{ type: "function", function: { name: "noop", parameters: { type: "object" } } }],
    toolChoice: "auto",
  };
  const adapted = await gatewayEngine.execute(gatewayProvider, gatewayModel, "llm.tools", toolInput, { reasoning_effort: "medium" }, {});
  assert.equal(adapted.text, "adapted-ok", "an adapted retry keeps the Agent turn alive");
  assert.equal(gatewayBodies.length, 2, "the gateway is retried exactly once");
  assert.equal(gatewayBodies[0].reasoning_effort, undefined, "the first attempt keeps the configured parameters");
  assert.equal(gatewayBodies[0].stream, false, "APIMart-style chat gateways are asked for a JSON body, not SSE");
  assert.equal(gatewayBodies[1].reasoning_effort, "none", "the retry sends the shape the gateway asked for");
  const remembered = await gatewayEngine.execute(gatewayProvider, gatewayModel, "llm.tools", toolInput, {}, {});
  assert.equal(remembered.text, "adapted-ok");
  assert.equal(gatewayBodies.length, 3, "later turns skip the rejected shape");
  assert.equal(gatewayBodies[2].reasoning_effort, "none", "later turns reuse the accepted shape");
  const plainChat = await gatewayEngine.execute(gatewayProvider, gatewayModel, "llm.chat", input, {}, {});
  assert.equal(plainChat.text, "adapted-ok");
  assert.equal(gatewayBodies[3].reasoning_effort, undefined, "plain chat turns are unchanged");
  assert.equal(gatewayBodies[3].tools, undefined, "plain chat turns stay tool-free");

  // A received 4xx is a definitive rejection: the candidate chain may continue.
  responseQueue.push(jsonResponse({ error: { message: "model not found" } }, 400));
  await assert.rejects(
    engine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, {}),
    (error) => error.code === "UPSTREAM_PROTOCOL" && error.retryable === false && error.fallbackAllowed === true,
  );

  // A relay that answers a non-streaming call with SSE still produced a reply.
  const sseEngine = createProtocolEngine({
    registry,
    outboundFetch: async () => new Response(
      'data: {"choices":[{"delta":{"content":"sse-ok"}}]}\n\n'
      + 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"lookup","arguments":"{\\"q\\":1}"}}]}}]}\n\n'
      + "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  });
  const recoveredSse = await sseEngine.execute(openaiProvider, { id: "gpt-sse", protocol: "openai" }, "llm.tools", {
    messages: [{ role: "user", content: "hi" }],
    tools: [{ type: "function", function: { name: "lookup" } }],
    toolChoice: "auto",
  }, {}, {});
  assert.equal(recoveredSse.text, "sse-ok", "an SSE reply to a JSON call is decoded instead of rejected");
  assert.deepEqual(recoveredSse.toolCalls, [{ id: "call-1", name: "lookup", arguments: '{"q":1}' }], "streamed tool calls survive decoding");

  const reasoningStreamEngine = createProtocolEngine({
    registry,
    outboundFetch: async () => new Response(
      'data: {"id":"reason-stream","choices":[{"delta":{"reasoning_content":"先推理"}}]}\n\n'
      + 'data: {"choices":[{"delta":{"reasoning_content":"，再回答"}}]}\n\n'
      + 'data: {"choices":[{"delta":{"content":"完成"}}]}\n\n'
      + "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  });
  const streamedReasoning = await reasoningStreamEngine.stream(
    openaiProvider,
    { id: "deepseek-reasoner", protocol: "openai" },
    "llm.chat",
    input,
    {},
    () => {},
    {},
  );
  assert.equal(streamedReasoning.text, "完成");
  assert.equal(streamedReasoning.reasoningContent, "先推理，再回答");

  assert.equal(JSON.stringify(captured).includes("No fake response"), false);
  console.log("Provider protocol engine checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
