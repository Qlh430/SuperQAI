"use strict";

const assert = require("node:assert/strict");

const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createProviderExecutor } = require("../provider-executor");

function createFixture() {
  const state = { autoFallback: true };
  const providers = [
    {
      id: "primary",
      name: "Primary",
      baseUrl: "https://primary.example/v1",
      protocol: "openai",
      apiKey: "primary-secret",
      enabled: true,
      sortOrder: 0,
      capabilitySort: {},
      metadata: {},
      models: [{ id: "primary-chat", protocol: "openai", capabilities: ["llm.chat", "llm.tools"], sortOrder: 0, capabilitySort: {} }],
    },
    {
      id: "secondary",
      name: "Secondary",
      baseUrl: "https://secondary.example/v1",
      protocol: "openai",
      apiKey: "secondary-secret",
      enabled: true,
      sortOrder: 1,
      capabilitySort: {},
      metadata: {},
      models: [{ id: "secondary-chat", protocol: "openai", capabilities: ["llm.chat", "llm.tools"], sortOrder: 0, capabilitySort: {} }],
    },
  ];
  const store = {
    listInternal: () => providers.map((provider) => ({ ...provider, models: provider.models.map((model) => ({ ...model })) })),
    getAutoFallback: () => state.autoFallback,
  };
  return { state, resolver: createCapabilityResolver({ store }) };
}

(async () => {
  const { state, resolver } = createFixture();
  const calls = [];
  const engine = {
    async execute(provider, model, intent) {
      calls.push(`execute:${provider.id}:${model.id}:${intent}`);
      if (provider.id === "primary") {
        const error = new Error(`failed with ${provider.apiKey}`);
        error.code = "UPSTREAM_UNAVAILABLE";
        error.retryable = true;
        error.safeMessage = `failed with ${provider.apiKey}`;
        throw error;
      }
      return { text: "secondary-ok", usage: null };
    },
    async stream(provider, model, intent, input, params, onDelta) {
      calls.push(`stream:${provider.id}:${model.id}:${intent}`);
      if (input.cancel) {
        throw Object.assign(new Error("Request cancelled"), {
          name: "AbortError",
          code: "REQUEST_ABORTED",
          retryable: false,
        });
      }
      if (provider.id === "primary") {
        if (input.emitBeforeFailure) onDelta({ type: "text-delta", text: "partial" });
        const error = new Error("stream failed primary-secret");
        error.code = "UPSTREAM_UNAVAILABLE";
        error.retryable = true;
        throw error;
      }
      onDelta({ type: "text-delta", text: "secondary-stream" });
      return { text: "secondary-stream", usage: null, toolCalls: [] };
    },
    async executeWithTools(provider, model) {
      calls.push(`tools:${provider.id}:${model.id}`);
      if (provider.id === "primary") throw Object.assign(new Error("tool route failed primary-secret"), { code: "UPSTREAM_UNAVAILABLE", retryable: true });
      return { content: "tool-ok", toolCalls: [], usage: null };
    },
  };
  const attemptResults = [];
  const executor = createProviderExecutor({ resolver, engine, onAttemptResult: event => attemptResults.push(event) });

  const executed = await executor.execute({ intent: "llm.chat", input: { prompt: "hi" } });
  assert.equal(executed.text, "secondary-ok");
  assert.equal(executed.selection.providerId, "secondary");
  assert.deepEqual(calls, ["execute:primary:primary-chat:llm.chat", "execute:secondary:secondary-chat:llm.chat"]);
  assert.equal(executed.attempts.length, 1);
  assert.equal(JSON.stringify(executed.attempts).includes("primary-secret"), false);
  assert.deepEqual(attemptResults.slice(0, 2).map(event => ({
    providerId: event.provider.id,
    modelId: event.model.id,
    intent: event.intent,
    success: event.success,
    code: event.error?.code || "",
  })), [
    { providerId: "primary", modelId: "primary-chat", intent: "llm.chat", success: false, code: "UPSTREAM_UNAVAILABLE" },
    { providerId: "secondary", modelId: "secondary-chat", intent: "llm.chat", success: true, code: "" },
  ]);
  assert.ok(attemptResults.slice(0, 2).every(event => Number.isFinite(event.latencyMs) && event.latencyMs >= 0));

  calls.length = 0;
  const nonRetryableExecutor = createProviderExecutor({
    resolver,
    engine: {
      ...engine,
      async execute(provider, model, intent) {
        calls.push(`execute:${provider.id}:${model.id}:${intent}`);
        throw Object.assign(new Error("submitted task outcome is unknown"), {
          code: "UPSTREAM_TASK_PENDING",
          retryable: false,
        });
      },
    },
  });
  await assert.rejects(
    nonRetryableExecutor.execute({ intent: "llm.chat", input: { prompt: "hi" } }),
    (error) => error.code === "UPSTREAM_TASK_PENDING" && error.retryable === false,
  );
  assert.deepEqual(calls, ["execute:primary:primary-chat:llm.chat"]);

  // A provider that definitively rejects the request (HTTP 4xx) never billed it,
  // so the Agent must keep going down its configured candidate list instead of
  // failing the whole turn.
  calls.length = 0;
  const rejectedShapeExecutor = createProviderExecutor({
    resolver,
    engine: {
      ...engine,
      async execute(provider, model) {
        calls.push(`execute:${provider.id}:${model.id}`);
        if (provider.id === "primary") {
          throw Object.assign(new Error("上游服务返回 HTTP 400"), {
            code: "UPSTREAM_PROTOCOL",
            retryable: false,
            fallbackAllowed: true,
          });
        }
        return { text: "candidate-ok", usage: null };
      },
    },
  });
  const rejectedShape = await rejectedShapeExecutor.execute({ intent: "llm.tools", input: { prompt: "hi" } });
  assert.equal(rejectedShape.text, "candidate-ok", "a rejected request shape falls back to the next candidate");
  assert.equal(rejectedShape.selection.providerId, "secondary");
  assert.deepEqual(calls, ["execute:primary:primary-chat", "execute:secondary:secondary-chat"]);

  calls.length = 0;
  await assert.rejects(
    executor.execute({ intent: "llm.chat", preferredProviderId: "primary", input: { prompt: "hi" } }),
    (error) => error.code === "UPSTREAM_UNAVAILABLE" && error.attempts.length === 1,
  );
  assert.deepEqual(calls, ["execute:primary:primary-chat:llm.chat"]);

  calls.length = 0;
  const pinnedSuccessEngine = { ...engine, execute: async (provider, model) => ({ text: `${provider.id}:${model.id}`, usage: null }) };
  const pinnedSuccess = await createProviderExecutor({ resolver, engine: pinnedSuccessEngine }).execute({
    intent: "llm.chat",
    preferredProviderId: "secondary",
    preferredModelId: "secondary-chat",
  });
  assert.equal(pinnedSuccess.selection.reason, "pinned-selection");

  calls.length = 0;
  state.autoFallback = false;
  await assert.rejects(
    executor.execute({ intent: "llm.chat", input: { prompt: "hi" } }),
    (error) => error.attempts.length === 1,
  );
  assert.deepEqual(calls, ["execute:primary:primary-chat:llm.chat"]);
  calls.length = 0;
  const forcedAgentFallback = await executor.execute({
    intent: "llm.chat",
    forceFallback: true,
    candidateOrder: [
      { providerId: "primary", modelId: "primary-chat" },
      { providerId: "secondary", modelId: "secondary-chat" },
    ],
    input: { prompt: "agent" },
  });
  assert.equal(forcedAgentFallback.selection.providerId, "secondary");
  assert.deepEqual(calls, ["execute:primary:primary-chat:llm.chat", "execute:secondary:secondary-chat:llm.chat"]);
  state.autoFallback = true;

  calls.length = 0;
  const streamedEvents = [];
  const streamed = await executor.stream({ intent: "llm.chat", input: { prompt: "hi" } }, (event) => streamedEvents.push(event));
  assert.equal(streamed.text, "secondary-stream");
  assert.deepEqual(calls, ["stream:primary:primary-chat:llm.chat", "stream:secondary:secondary-chat:llm.chat"]);
  assert.deepEqual(streamedEvents.map((event) => event.text), ["secondary-stream"]);

  calls.length = 0;
  const compatibilityInputs = [];
  const compatibilityExecutor = createProviderExecutor({
    resolver,
    engine: {
      ...engine,
      async stream(provider, model, intent, input) {
        calls.push(`stream:${provider.id}:${model.id}:${intent}`);
        compatibilityInputs.push(input.messages);
        if (compatibilityInputs.length === 1) {
          throw Object.assign(new Error("The reasoning_content in the thinking mode must be passed back to the API."), {
            code: "UPSTREAM_PROTOCOL",
            retryable: false,
          });
        }
        return { text: "compatibility-ok", usage: null, toolCalls: [] };
      },
    },
  });
  const compatibilityResult = await compatibilityExecutor.stream({
    intent: "llm.tools",
    input: {
      messages: [
        { role: "user", content: "continue" },
        {
          role: "assistant",
          content: "",
          reasoning_content: "provider-private reasoning",
          tool_calls: [{
            id: "call-compatible",
            type: "function",
            function: { name: "lookup", arguments: "{\"q\":\"poster\"}" },
          }],
        },
        { role: "tool", tool_call_id: "call-compatible", content: "{\"ok\":true}" },
      ],
    },
  });
  assert.equal(compatibilityResult.text, "compatibility-ok");
  assert.deepEqual(calls, ["stream:primary:primary-chat:llm.tools", "stream:primary:primary-chat:llm.tools"]);
  assert.equal(compatibilityInputs[0][1].reasoning_content, "provider-private reasoning");
  assert.equal(
    compatibilityInputs[1].some((message) => Object.hasOwn(message, "reasoning_content") || Array.isArray(message.tool_calls)),
    false,
    "a reasoning replay retry must remove provider-private reasoning and native tool history",
  );
  assert.ok(
    compatibilityInputs[1].some((message) => (
      message.role === "user"
      && /\[工具结果 call-compatible\]/.test(String(message.content || ""))
    )),
    "the compatible retry must preserve the tool result as ordinary text",
  );

  calls.length = 0;
  const partialEvents = [];
  await assert.rejects(
    executor.stream({ intent: "llm.chat", input: { emitBeforeFailure: true } }, (event) => partialEvents.push(event)),
    (error) => error.code === "UPSTREAM_UNAVAILABLE" && error.emitted === true,
  );
  assert.deepEqual(calls, ["stream:primary:primary-chat:llm.chat"]);
  assert.deepEqual(partialEvents.map((event) => event.text), ["partial"]);

  calls.length = 0;
  await assert.rejects(
    executor.stream({ intent: "llm.chat", input: { cancel: true } }, () => {}),
    (error) => error.name === "AbortError" && error.code === "REQUEST_ABORTED",
  );
  assert.deepEqual(calls, ["stream:primary:primary-chat:llm.chat"]);

  calls.length = 0;
  const toolResult = await executor.executeWithTools({ intent: "llm.tools", input: { messages: [], system: "system" } }, [{ type: "function", function: { name: "lookup" } }]);
  assert.equal(toolResult.content, "tool-ok");
  assert.equal(toolResult.selection.providerId, "secondary");
  assert.deepEqual(calls, ["tools:primary:primary-chat", "tools:secondary:secondary-chat"]);

  console.log("Provider executor checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
