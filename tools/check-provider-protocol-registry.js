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
  };
  const registry = createProtocolRegistry({ adapters });

  const expectedIds = [
    "openai",
    "openai-responses",
    "openai-images",
    "anthropic",
    "gemini",
    "apimart",
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

  const openai = registry.get("openai");
  assert.equal(openai.auth.type, "bearer");
  assert.equal(openai.operations["llm.chat"].path, "/v1/chat/completions");
  assert.equal(openai.operations["llm.chat.stream"].stream, "openai-sse");
  assert.equal(registry.get("does-not-exist"), null);

  assert.equal(registry.candidatesForBaseUrl("https://api.anthropic.com")[0], "anthropic");
  assert.equal(registry.candidatesForBaseUrl("https://generativelanguage.googleapis.com/v1beta")[0], "gemini");
  assert.equal(registry.candidatesForBaseUrl("https://api.apimart.ai/v1")[0], "apimart");
  assert.equal(registry.candidatesForBaseUrl("http://127.0.0.1:8188")[0], "comfyui");
  assert.deepEqual(registry.candidatesForBaseUrl("https://unknown.example/v1", "anthropic"), ["anthropic", "openai"]);

  assert.equal(registry.inferModelProtocol({ id: "claude-3-7-sonnet" }), "anthropic");
  assert.equal(registry.inferModelProtocol({ id: "gemini-2.5-pro" }), "gemini");
  assert.equal(registry.inferModelProtocol({ id: "gpt-image-1", capabilities: ["image.generate"] }), "openai-images");
  assert.equal(registry.inferModelProtocol({ id: "gpt-5" }), "openai");
  assert.equal(registry.getAdapter("apimart"), adapters.apimart);
  assert.equal(registry.getAdapter("openai"), null);

  assert.equal(joinProtocolUrl("https://api.example.test/v1", "/v1/chat/completions"), "https://api.example.test/v1/chat/completions");
  assert.equal(joinProtocolUrl("https://api.example.test/v2", "/v2/jobs"), "https://api.example.test/v2/jobs");
  assert.equal(joinProtocolUrl("https://api.example.test/v1beta", "/v1beta/models"), "https://api.example.test/v1beta/models");
  assert.equal(joinProtocolUrl("https://api.example.test/api/v3", "/api/v3/task"), "https://api.example.test/api/v3/task");
  assert.throws(() => joinProtocolUrl("ftp://api.example.test", "/v1/models"), /HTTP/i);

  console.log("Provider protocol registry checks passed.");
})();
