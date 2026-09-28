"use strict";

const assert = require("node:assert/strict");

const {
  createProtocolRegistry,
  joinProtocolUrl,
} = require("../provider-protocol-registry");

(() => {
  const adapters = {
    apimart: { execute() {} },
    runninghub: { execute() {} },
    "image-relay": { execute() {} },
    comfyui: { execute() {} },
    "video-adapter": { execute() {} },
    "audio-adapter": { execute() {} },
    "jimeng-cli": { execute() {} },
  };
  const registry = createProtocolRegistry({ adapters });

  const expectedIds = [
    "openai",
    "openai-responses",
    "openai-images",
    "anthropic",
    "gemini",
    "midjourney",
    "runninghub",
    "image-relay",
    "comfyui",
    "video-adapter",
    "audio-adapter",
  ];
  const listed = registry.listPublic();
  assert.deepEqual(expectedIds.filter((id) => !listed.some((item) => item.id === id)), []);
  assert.equal(JSON.stringify(listed).includes("buildBody"), false);
  assert.equal(JSON.stringify(listed).includes("apiKey"), false);

  const platform = registry.listForScope("platform");
  assert.deepEqual(platform.map((item) => item.id), [
    "openai",
    "anthropic",
    "gemini",
    "runninghub",
    "comfyui",
    "cli:jimeng",
  ]);
  const retainedLegacyPlatforms = registry.listForScope("platform", { includeRuntimeIds: ["image-relay"] }).map((item) => item.id);
  assert.deepEqual(retainedLegacyPlatforms.filter(id => id !== "image-relay"), platform.map(item => item.id));
  assert.equal(retainedLegacyPlatforms.includes("image-relay"), true);
  assert.equal(platform.some((item) => item.id === "video-adapter"), false);
  assert.equal(platform.some((item) => item.id === "apimart"), false);
  assert.equal(registry.listForScope("model").some((item) => item.id === "apimart"), false);
  assert.equal(registry.listForScope("model").find((item) => item.id === "midjourney").label, "Midjourney 专用协议");
  assert.equal(registry.listForScope("model").find((item) => item.id === "midjourney").requiresApimartHostForOpenAi, true);
  assert.equal(registry.listForScope("model").find((item) => item.id === "gemini").requiresApimartHostForOpenAi, true);
  assert.deepEqual(registry.describe("midjourney").operations, [
    { intent: "image.generate", method: "POST", path: "/v1/midjourney/generations", mode: "task-or-result", parameters: [] },
    { intent: "image.edit", method: "POST", path: "/v1/midjourney/generations", mode: "task-or-result", parameters: [] },
  ]);
  assert.equal(registry.listForScope("model").find((item) => item.id === "video-adapter").label, "通用视频任务");
  assert.equal(registry.runtimeId("openai-responses"), "openai-responses");

  // A platform owns connection and authentication. A model profile owns the
  // endpoint/body/parser, and can only be selected when the two are compatible.
  const openAiProfiles = registry.listModelProfiles("openai");
  assert.deepEqual(openAiProfiles.map((item) => item.id), ["openai"]);
  assert.deepEqual(registry.describe("openai", "platform").operations, []);
  assert.deepEqual(registry.describe("openai", "model").operations.map((item) => item.intent), [
    "llm.chat",
    "llm.chat.stream",
    "llm.chat.vision",
    "llm.tools",
    "image.generate",
    "image.edit",
  ]);
  assert.ok(registry.describe("openai", "model").operationCatalog.some((item) => item.id === "responses.create"));
  assert.ok(registry.describe("openai", "model").operationCatalog.some((item) => item.id === "embeddings.create"));
  assert.equal(registry.listForScope("model").some((item) => item.id === "openai-images"), false);
  assert.equal(registry.listForScope("model", { includeRuntimeIds: ["openai-images"] }).some((item) => item.id === "openai-images"), true);
  assert.equal(registry.isCompatible("openai", "openai-images"), true);
  assert.equal(registry.isCompatible("apimart", "openai-images"), true);
  assert.equal(registry.isCompatible("apimart", "apimart"), false);
  assert.equal(registry.isCompatible("apimart", "midjourney"), false);
  assert.equal(registry.isCompatible("openai", "midjourney", { baseUrl: "https://api.apimart.ai/v1" }), true);
  assert.equal(registry.isCompatible("openai", "gemini", { baseUrl: "https://gateway.apib.ai/v1" }), true);
  assert.equal(registry.isCompatible("openai", "midjourney", { baseUrl: "https://relay.example.test/v1" }), false);
  assert.equal(registry.isCompatible("gemini", "openai-images"), false);
  assert.throws(() => registry.assertCompatible("gemini", "openai-images"), {
    code: "incompatible_protocols",
  });

  const jimeng = registry.presentation("cli:jimeng");
  assert.deepEqual(jimeng, {
    platformVisible: true,
    modelVisible: true,
    advanced: false,
    displayGroup: "即梦",
    modelLabel: "即梦图片与视频",
    connectionType: "cli",
  });
  assert.deepEqual(registry.describe("cli:jimeng").operations, [
    { intent: "image.generate", method: "CLI", path: "本机 dreamina CLI", mode: "local-cli", parameters: [] },
    { intent: "image.edit", method: "CLI", path: "本机 dreamina CLI", mode: "local-cli", parameters: [] },
    { intent: "video.generate", method: "CLI", path: "本机 dreamina CLI", mode: "local-cli", parameters: [] },
  ]);
  assert.equal(registry.describe("cli:jimeng").auth, null);

  const openai = registry.get("openai");
  assert.equal(openai.auth.type, "bearer");
  assert.equal(openai.operations["llm.chat"].path, "/v1/chat/completions");
  assert.equal(openai.operations["llm.chat.stream"].stream, "openai-sse");
  assert.ok(registry.describe("openai").operations.find(item => item.intent === "llm.chat").parameters.includes("temperature"));
  assert.equal(registry.get("does-not-exist"), null);

  assert.equal(registry.candidatesForBaseUrl("https://api.anthropic.com")[0], "anthropic");
  assert.equal(registry.candidatesForBaseUrl("https://generativelanguage.googleapis.com/v1beta")[0], "gemini");
  assert.equal(registry.candidatesForBaseUrl("https://api.apimart.ai/v1")[0], "openai");
  assert.equal(registry.candidatesForBaseUrl("http://127.0.0.1:8188")[0], "comfyui");
  assert.deepEqual(registry.candidatesForBaseUrl("https://unknown.example/v1", "anthropic"), ["anthropic", "openai"]);

  assert.equal(registry.inferModelProtocol({ id: "claude-3-7-sonnet" }), "anthropic");
  assert.equal(registry.inferModelProtocol({ id: "gemini-2.5-pro" }), "gemini");
  assert.equal(registry.inferModelProtocol({ id: "gpt-image-1", capabilities: ["image.generate"] }), "openai");
  assert.equal(registry.inferModelProtocol({ id: "midjourney-v7" }, { protocol: "apimart", baseUrl: "https://api.apimart.ai/v1" }), "midjourney");
  assert.equal(registry.inferModelProtocol({ id: "mj-v7" }, { protocol: "openai", baseUrl: "https://gateway.apib.ai/v1" }), "midjourney");
  assert.equal(registry.inferModelProtocol({ id: "imagen-4" }, { protocol: "openai", baseUrl: "https://api.apimart.ai/v1" }), "gemini");
  assert.equal(registry.inferModelProtocol({ id: "midjourney-v7" }, { protocol: "openai" }), "openai");
  assert.equal(registry.inferModelProtocol({ id: "midjourney-v7" }, { protocol: "gemini" }), "gemini");
  assert.equal(registry.inferModelProtocol({ id: "gpt-5" }), "openai");
  assert.equal(registry.getAdapter("apimart"), adapters.apimart);
  assert.equal(registry.getAdapter("openai"), null);
  assert.equal(listed.some(item => item.id === "apimart"), false);
  assert.equal(JSON.stringify(listed).includes("APIMart 旧版图片任务"), false);
  assert.equal(createProtocolRegistry().listPublic().find(item => item.id === "openai").runnable, true);

  assert.equal(joinProtocolUrl("https://api.example.test/v1", "/v1/chat/completions"), "https://api.example.test/v1/chat/completions");
  assert.equal(joinProtocolUrl("https://api.example.test/v2", "/v2/jobs"), "https://api.example.test/v2/jobs");
  assert.equal(joinProtocolUrl("https://api.example.test/v1beta", "/v1beta/models"), "https://api.example.test/v1beta/models");
  assert.equal(joinProtocolUrl("https://api.example.test/v1", "/v1beta/models"), "https://api.example.test/v1beta/models");
  assert.equal(joinProtocolUrl("https://api.example.test/relay/v1beta", "/v1/models"), "https://api.example.test/relay/v1/models");
  assert.equal(joinProtocolUrl("https://api.example.test/api/v3", "/api/v3/task"), "https://api.example.test/api/v3/task");
  assert.throws(() => joinProtocolUrl("ftp://api.example.test", "/v1/models"), /HTTP/i);

  console.log("Provider protocol registry checks passed.");
})();
