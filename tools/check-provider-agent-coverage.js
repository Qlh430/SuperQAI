"use strict";

const assert = require("node:assert/strict");

const { analyzeProviderAgentCoverage } = require("../provider-agent-coverage");

const registry = {
  describe(protocolId) {
    if (protocolId === "broken") return { runnable: false, capabilities: ["llm.chat", "llm.tools"], operations: [] };
    if (protocolId === "chat-only") return { runnable: true, capabilities: ["llm.chat"], operations: [{ intent: "llm.chat" }] };
    if (protocolId === "image") return { runnable: true, capabilities: ["image.generate"], operations: [{ intent: "image.generate" }] };
    return {
      runnable: true,
      capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
      operations: [{ intent: "llm.chat" }, { intent: "llm.chat.vision" }, { intent: "llm.tools" }],
    };
  },
};

const coverage = analyzeProviderAgentCoverage({
  provider: { id: "site-1", name: "Site One", enabled: true },
  registry,
  source: "saved",
  models: [
    { id: "agent-ready", protocol: "openai", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"] },
    { id: "agent-can-enable-tools", protocol: "openai", capabilities: ["llm.chat"] },
    { id: "agent-chat-only", protocol: "chat-only", capabilities: ["llm.chat"] },
    { id: "image-only", protocol: "image", capabilities: ["image.generate"] },
    { id: "text-embedding-3-large", type: "other", protocol: "openai", capabilities: [] },
    { id: "declared-but-broken", protocol: "broken", capabilities: ["llm.chat", "llm.tools"] },
  ],
});

assert.deepEqual(coverage.summary, { total: 4, ready: 1, configurable: 1, partial: 1, missing: 1, visionReady: 1, mediaTools: 1 });
assert.equal(coverage.providerId, "site-1");
assert.equal(coverage.source, "saved");
assert.equal(coverage.models.find(model => model.id === "agent-ready").state, "ready");
assert.deepEqual(coverage.models.find(model => model.id === "agent-ready").supportedAgentCapabilities, ["chat", "tools", "vision"]);
assert.equal(coverage.models.find(model => model.id === "agent-can-enable-tools").state, "configurable");
assert.match(coverage.models.find(model => model.id === "agent-can-enable-tools").reason, /协议支持工具调用.*当前配置/);
assert.equal(coverage.models.find(model => model.id === "agent-chat-only").state, "partial");
assert.deepEqual(coverage.models.find(model => model.id === "agent-chat-only").missingCapabilities, ["llm.tools"]);
assert.equal(coverage.models.find(model => model.id === "image-only").state, "tool");
assert.equal(coverage.models.find(model => model.id === "image-only").role, "image-tool");
assert.match(coverage.models.find(model => model.id === "image-only").reason, /Agent.*图片工具/);
assert.equal(coverage.models.find(model => model.id === "text-embedding-3-large").role, "excluded");
assert.equal(coverage.models.find(model => model.id === "text-embedding-3-large").state, "excluded");
assert.equal(coverage.models.find(model => model.id === "declared-but-broken").state, "missing");
assert.match(coverage.models.find(model => model.id === "declared-but-broken").reason, /协议.*不可执行/);

const empty = analyzeProviderAgentCoverage({ provider: { id: "empty", enabled: false }, registry, models: [] });
assert.deepEqual(empty.summary, { total: 0, ready: 0, configurable: 0, partial: 0, missing: 0, visionReady: 0, mediaTools: 0 });

const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
const realRegistry = createProtocolRegistry({ adapters: createMediaProtocolAdapters() });
const apimartProvider = { id: "apimart", name: "APIMart", baseUrl: "https://api.apimart.ai/v1", protocol: "openai" };
const screenshotCase = analyzeProviderAgentCoverage({
  provider: apimartProvider,
  registry: realRegistry,
  source: "live",
  models: [
    realRegistry.inferModelConfiguration({ id: "gpt-image-2" }, apimartProvider),
    realRegistry.inferModelConfiguration({ id: "midjourney" }, apimartProvider),
    realRegistry.inferModelConfiguration({ id: "gpt-5.6-terra" }, apimartProvider),
  ],
});
assert.deepEqual(screenshotCase.summary, { total: 1, ready: 1, configurable: 0, partial: 0, missing: 0, visionReady: 1, mediaTools: 2 });
assert.equal(screenshotCase.models.find(model => model.id === "gpt-5.6-terra").state, "ready");
assert.deepEqual(
  screenshotCase.models.filter(model => ["gpt-image-2", "midjourney"].includes(model.id)).map(model => model.state),
  ["tool", "tool"],
);

console.log("Provider Agent coverage checks passed.");
