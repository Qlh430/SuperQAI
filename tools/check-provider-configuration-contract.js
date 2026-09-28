"use strict";
const assert = require("node:assert/strict");
const { createProtocolRegistry, joinProtocolUrl } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const registry = createProtocolRegistry();
const relay = { baseUrl: "https://relay.example/v1", protocol: "openai" };
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
test("relay model names do not force native protocols", () => {
  assert.equal(registry.inferModelProtocol({ id: "gemini-2.5-pro" }, relay), "openai");
  assert.equal(registry.inferModelProtocol({ id: "claude-sonnet-4" }, relay), "openai");
  assert.equal(registry.inferModelProtocol({ id: "gemini-3-pro-image-preview" }, relay), "openai");
  assert.equal(registry.inferModelProtocol({ id: "nano-banana-pro" }, relay), "openai");
});
test("OpenAI-compatible sites accept a Gemini-named chat model with Chat Completions", () => {
  const model = registry.inferModelConfiguration({
    id: "gemini-3-pro-preview",
    protocol: "openai",
    capabilities: ["llm.chat"],
  }, relay);
  assert.equal(model.protocol, "openai");
  assert.deepEqual(model.capabilities, ["llm.chat"]);
});
test("native sites use matching profiles and reject cross-platform overrides", () => {
  assert.equal(registry.inferModelProtocol({ id: "gemini-3-pro-image-preview" }, { baseUrl: "https://generativelanguage.googleapis.com", protocol: "gemini" }), "gemini");
  assert.equal(registry.inferModelProtocol({ id: "gpt-5", protocol: "openai-responses" }, relay), "openai-responses");
  assert.throws(() => registry.inferModelProtocol({ id: "claude-sonnet-4", protocol: "anthropic" }, relay), error => error.code === "incompatible_protocols");
  assert.equal(registry.inferModelProtocol({ id: "gpt-image-2", protocol: "openai", capabilities: ["image.generate"] }, relay), "openai");
});
test("model protocols reject capabilities outside their request contract", () => {
  assert.throws(
    () => registry.inferModelConfiguration({ id: "gpt-image-1", protocol: "openai-images", capabilities: ["llm.chat"] }, relay),
    error => error.code === "invalid_protocol_capabilities",
  );
  assert.throws(
    () => registry.inferModelConfiguration({ id: "gpt-5", protocol: "openai-responses", capabilities: ["image.generate"] }, relay),
    error => error.code === "invalid_protocol_capabilities",
  );
});
test("mixed catalog derives capabilities instead of assigning chat to all", () => {
  const image = registry.inferModelConfiguration({ id: "gpt-image-2" }, relay);
  assert.deepEqual(image.capabilities, ["image.generate", "image.edit"]);
  assert.deepEqual(
    registry.inferModelConfiguration({ id: "gpt-5.6-terra" }, relay).capabilities,
    ["llm.chat", "llm.chat.vision", "llm.tools"],
    "an unannotated OpenAI-compatible LLM inherits the Agent capabilities supported by its model protocol",
  );
  assert.deepEqual(
    registry.inferModelConfiguration({ id: "gemini-2.5-pro" }, { baseUrl: "https://generativelanguage.googleapis.com", protocol: "gemini" }).capabilities,
    ["llm.chat", "llm.chat.vision"],
    "native Gemini inference is filtered to the capabilities its registered protocol actually implements",
  );
  assert.equal(registry.inferModelConfiguration({ id: "flux-schnell" }, relay).protocol, "openai");
  assert.deepEqual(registry.inferModelConfiguration({ id: "veo-3" }, relay).capabilities, ["video.generate"]);
  assert.deepEqual(registry.inferModelConfiguration({ id: "text-embedding-3-large" }, relay).capabilities, []);
  assert.deepEqual(
    registry.inferModelConfiguration({ id: "gpt-5.6-terra", capabilities: ["llm.chat"] }, relay).capabilities,
    ["llm.chat"],
    "an explicit user capability selection is never expanded silently",
  );
  assert.deepEqual(registry.inferModelConfiguration({ id: "gpt-5", capabilities: ["llm.chat.vision"] }, relay).capabilities, ["llm.chat.vision"]);
});
test("legacy APIMart platform aliases verify through the canonical OpenAI platform protocol", async () => {
  const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
  const engine = createProtocolEngine({ registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }), outboundFetch: async url => {
    assert.equal(url, "https://api.apimart.ai/v1/models");
    return new Response(JSON.stringify({ data: [{ id: "gpt-image-2" }] }));
  }});
  const result = await engine.verifyProtocol({ baseUrl: "https://api.apimart.ai/v1", protocol: "apimart", apiKey: "fake-key" });
  assert.equal(result.selectedProtocol, "openai");
  assert.equal(result.attempts.length, 1);
});
test("full endpoint pastes normalize across discovery and execution", () => {
  assert.equal(joinProtocolUrl(" https://relay.example/v1/chat/completions/ ", "/v1/models"), "https://relay.example/v1/models");
  assert.equal(joinProtocolUrl("https://relay.example/prefix/v1/images/generations", "/v1/images/edits"), "https://relay.example/prefix/v1/images/edits");
  assert.throws(() => joinProtocolUrl("https://relay.example/v1?token=bad", "/v1/models"), /查询参数/);
});
test("generic inherited site protocol can execute an image model", async () => {
  const engine = createProtocolEngine({ registry, outboundFetch: async (url, opts) => {
    assert.equal(url, "https://relay.example/v1/images/generations");
    assert.equal(JSON.parse(opts.body).model, "gpt-image-2");
    return new Response(JSON.stringify({ data: [{ url: "https://cdn.example/test.png" }] }));
  }});
  const result = await engine.execute(relay, { id: "gpt-image-2", protocol: "openai", capabilities: ["image.generate"] }, "image.generate", { prompt: "test" });
  assert.equal(result.data.length, 1);
});
test("saved models and network settings survive with trimmed or omitted secrets", () => {
  const { createProviderStore } = require("../provider-store");
  const { createProviderSecretVault } = require("../provider-secret-vault");
  const { createSystemDb } = require("../system-db");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-config-contract-"));
  const db = createSystemDb({ dbPath: path.join(dir, "system.sqlite") });
  try {
    db.migrate();
    const store = createProviderStore({ db, vault: createProviderSecretVault({ dataDir: dir }) });
    const saved = store.save({ id: "new", name: "New API", ...relay, baseUrl: "https://relay.example/v1/images/generations", networkMode: "proxy", apiKey: "  fake-new-key  ", models: [{ id: "gpt-image-2" }] });
    assert.equal(saved.baseUrl, relay.baseUrl);
    assert.equal(saved.metadata.networkMode, "proxy");
    assert.equal(saved.models[0].protocol, "openai");
    assert.ok(saved.models[0].capabilities.includes("image.generate"));
    assert.equal(store.reveal("new").apiKey, "fake-new-key");
    store.save({ id: "new", apiKey: "  " });
    assert.equal(store.reveal("new").apiKey, "fake-new-key");
    assert.equal(store.getPublic("new").metadata.networkMode, "proxy");
  } finally { db.close(); if(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir, { recursive:true, force:true }); }
});
(async () => { let failures = 0; for (const {name,fn} of tests) { try { await fn(); console.log(`PASS ${name}`); } catch(e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } } if(failures) process.exitCode=1; })();
