"use strict";

const assert = require("node:assert/strict");

const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");

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

  responseQueue.push(jsonResponse({ choices: [{ message: { content: "ok" } }], usage: null }));
  assert.deepEqual(await engine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, {}), {
    text: "ok",
    usage: null,
  });
  assert.equal(captured.at(-1).options.outbound.providerId, "openai-main");
  assert.equal(captured.at(-1).options.outbound.requestClass, "billable");

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

  const responsesModel = { id: "gpt-response", protocol: "openai-responses" };
  const responsesRequest = engine.buildRequest(openaiProvider, responsesModel, "llm.chat", input, {});
  assert.equal(responsesRequest.url, "https://api.example.test/v1/responses");
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
    { size: "1024x1024" },
  );
  assert.equal(imageRequest.url, "https://api.example.test/v1/images/generations");
  assert.equal(imageRequest.body.prompt, "paper kite");
  responseQueue.push(jsonResponse({ data: [{ url: "https://cdn.example.test/image.png" }] }));
  assert.deepEqual(await engine.execute(openaiProvider, { id: "gpt-image-1", protocol: "openai-images" }, "image.generate", { prompt: "paper kite" }, {}, {}), {
    data: [{ url: "https://cdn.example.test/image.png" }],
    usage: null,
  });

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
  const verified = await verifyEngine.verifyProtocol({
    id: "draft",
    baseUrl: "https://api.apimart.ai/v1",
    protocol: "apimart",
    apiKey: "fake-key",
  }, {});
  assert.deepEqual(verifyAttempts, ["apimart", "openai"]);
  assert.equal(verified.selectedProtocol, "openai");
  assert.deepEqual(verified.models, ["gpt-ok"]);
  assert.deepEqual(verified.attempts.map((item) => item.protocol), ["apimart", "openai"]);

  const timeoutEngine = createProtocolEngine({
    registry,
    outboundFetch: (_url, options) => abortableNever(options.signal),
  });
  await assert.rejects(
    timeoutEngine.execute(openaiProvider, openaiModel, "llm.chat", input, {}, { connectTimeoutMs: 10, totalTimeoutMs: 100 }),
    (error) => error.code === "UPSTREAM_TIMEOUT" && error.stage === "connect",
  );

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

  assert.equal(JSON.stringify(captured).includes("No fake response"), false);
  console.log("Provider protocol engine checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
