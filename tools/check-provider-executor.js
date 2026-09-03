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
  const executor = createProviderExecutor({ resolver, engine });

  const executed = await executor.execute({ intent: "llm.chat", input: { prompt: "hi" } });
  assert.equal(executed.text, "secondary-ok");
  assert.equal(executed.selection.providerId, "secondary");
  assert.deepEqual(calls, ["execute:primary:primary-chat:llm.chat", "execute:secondary:secondary-chat:llm.chat"]);
  assert.equal(executed.attempts.length, 1);
  assert.equal(JSON.stringify(executed.attempts).includes("primary-secret"), false);

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
  state.autoFallback = true;

  calls.length = 0;
  const streamedEvents = [];
  const streamed = await executor.stream({ intent: "llm.chat", input: { prompt: "hi" } }, (event) => streamedEvents.push(event));
  assert.equal(streamed.text, "secondary-stream");
  assert.deepEqual(calls, ["stream:primary:primary-chat:llm.chat", "stream:secondary:secondary-chat:llm.chat"]);
  assert.deepEqual(streamedEvents.map((event) => event.text), ["secondary-stream"]);

  calls.length = 0;
  const partialEvents = [];
  await assert.rejects(
    executor.stream({ intent: "llm.chat", input: { emitBeforeFailure: true } }, (event) => partialEvents.push(event)),
    (error) => error.code === "UPSTREAM_UNAVAILABLE" && error.emitted === true,
  );
  assert.deepEqual(calls, ["stream:primary:primary-chat:llm.chat"]);
  assert.deepEqual(partialEvents.map((event) => event.text), ["partial"]);

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
