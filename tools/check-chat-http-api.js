"use strict";

const assert = require("node:assert/strict");
const { createChatHttpApi } = require("../chat-http-api");

function createHarness(overrides = {}) {
  const calls = [];
  const responses = [];
  const api = createChatHttpApi({
    getProviderSubsystemError: () => null,
    readJson: async (req) => req.body || {},
    sendJson: (_res, status, body) => responses.push({ status, body }),
    performWebSearch: async (query) => {
      calls.push(["search", query]);
      return [{ title: "source", url: "https://example.com", snippet: "result" }];
    },
    extractLatestUserText: (messages) => String(messages.at(-1)?.content || ""),
    buildDirectWeatherAnswer: () => "",
    formatUpstreamError: (error) => String(error?.message || error),
    buildChatCompletionMessages: (messages, results) => {
      calls.push(["messages", results.length]);
      return messages;
    },
    hasVisionMessage: () => false,
    getPublicProviderModelCatalog: () => ({
      models: [{ id: "chat-client", modelId: "chat-upstream", providerId: "provider-1" }],
    }),
    findPublicProviderCatalogModel: () => ({
      id: "chat-client",
      modelId: "chat-upstream",
      providerId: "provider-1",
    }),
    providerExecutor: {
      execute: async (request) => {
        calls.push(["execute", request]);
        return {
          text: "hello",
          usage: { total_tokens: 3 },
          selection: { providerId: "provider-1", modelId: "chat-upstream" },
          attempts: [{ ok: true }],
        };
      },
    },
    normalizeChatImageResponse: (data) => ({ ...data, normalized: true }),
    saveGeneratedImages: async () => [],
    providerExecutionHttpStatus: (error) => Number(error?.status || 500),
    ...overrides,
  });
  return { api, calls, responses };
}

async function post(harness, body) {
  const claimed = await harness.api.handle({
    method: "POST",
    url: "/api/chat",
    headers: { host: "localhost" },
    body,
  }, {});
  return { claimed, response: harness.responses.at(-1) };
}

(async () => {
  const normal = createHarness();
  const normalResult = await post(normal, {
    messages: [{ role: "user", content: "hello" }],
    web_search: true,
    model: "chat-client",
  });
  assert.equal(normalResult.claimed, true);
  assert.equal(normalResult.response.status, 200);
  assert.equal(normalResult.response.body.text, "hello");
  assert.equal(normalResult.response.body.selection.providerId, "provider-1");
  assert.equal(normalResult.response.body.web_search_results.length, 1);
  assert.equal(normal.calls.find(([name]) => name === "execute")[1].intent, "llm.chat");

  const weather = createHarness({
    buildDirectWeatherAnswer: () => "西安今天晴",
    providerExecutor: { execute: async () => { throw new Error("provider must not run"); } },
  });
  const weatherResult = await post(weather, {
    messages: [{ role: "user", content: "西安天气" }],
    web_search: true,
  });
  assert.equal(weatherResult.response.body.text, "西安今天晴");
  assert.equal(weatherResult.response.body.model, "direct-weather");

  const searchFailure = createHarness({
    performWebSearch: async () => { throw new Error("search offline"); },
  });
  const searchFailureResult = await post(searchFailure, {
    messages: [{ role: "user", content: "latest news" }],
    web_search: true,
  });
  assert.equal(searchFailureResult.response.body.web_search_error, "search offline");
  assert.equal(searchFailureResult.response.body.text, "hello");

  const providerFailure = createHarness({
    providerExecutor: {
      execute: async () => {
        throw Object.assign(new Error("upstream unavailable"), { code: "UPSTREAM_UNAVAILABLE", status: 503 });
      },
    },
  });
  const providerFailureResult = await post(providerFailure, {
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(providerFailureResult.response.status, 503);
  assert.equal(providerFailureResult.response.body.code, "UPSTREAM_UNAVAILABLE");

  const ignored = await normal.api.handle({ method: "GET", url: "/api/chat" }, {});
  assert.equal(ignored, false, "the component only owns POST /api/chat");

  console.log("Chat HTTP API checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
