"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createSystemDb } = require("../system-db");
const { createProviderStore } = require("../provider-store");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
const { migrateLegacyCatalogModelIds, migrateLegacyMediaProviders, migrateLegacyMediaModelProfiles } = require("../provider-migration");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "provider-model-identity-"));
  const db = createSystemDb({ dbPath: path.join(directory, "system.sqlite") });
  db.migrate();
  const store = createProviderStore({ db, vault: createProviderSecretVault({ dataDir: directory }) });
  t.after(() => {
    db.close();
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const model = (id, metadata = {}) => ({
    id, displayName: `${id} 显示别名`, protocol: "image-relay",
    capabilities: ["image.generate", "image.edit"], metadata,
  });
  store.save({
    id: "grsai", name: "GRSAI", baseUrl: "https://grsai.example", protocol: "openai",
    apiKey: "test-key-only", enabled: true, models: [
      model("gpt-image-2-vip-grsai", { upstreamModel: "gpt-image-2-vip", parameterOverrides: { seed: 42 } }),
      model("gpt-image-2-grsai", { upstreamModel: "gpt-image-2" }),
      model("gpt-image-2", { parameterOverrides: { n: 2 } }),
      model("real-model-grsai"),
      model("literal-grsai", { upstreamModel: "literal-grsai" }),
      model("unrelated-grsai", { upstreamModel: "different-model" }),
    ],
  });
  store.save({
    id: "other", name: "Other", baseUrl: "https://other.example", protocol: "openai", enabled: true,
    models: [{ id: "gpt-image-2-vip", protocol: "openai", capabilities: ["image.generate"] }],
  });
  db.setSetting("providers.media-model-profiles.v2", { completed: true });
  return { db, store };
}

test("catalog IDs migrate independently of old profiles, preserving raw suffixes and encrypted settings", t => {
  const { db, store } = fixture(t);
  const before = db.getProviderRecord("grsai");
  let snapshots = 0;
  const input = { db, createSnapshot: () => {
    snapshots++;
    assert.equal(db.getProviderRecord("grsai").models[0].id, "gpt-image-2-vip-grsai");
    return { id: "pre-model-ids" };
  } };
  assert.equal(migrateLegacyCatalogModelIds(input).updated, 1);
  const after = db.getProviderRecord("grsai");
  assert.equal(after.encryptedApiKey, before.encryptedApiKey);
  assert.equal(after.providerProtocol, before.providerProtocol);
  assert.deepEqual(after.models.map(model => model.id), [
    "gpt-image-2-vip", "gpt-image-2", "real-model-grsai", "literal-grsai", "unrelated-grsai",
  ]);
  assert.deepEqual(after.models[0].metadata.legacyModelIds, ["gpt-image-2-vip-grsai"]);
  assert.deepEqual(after.models[0].metadata.parameterOverrides, { seed: 42 });
  assert.equal(after.models[0].modelProtocol, "image-relay");
  assert.deepEqual(after.models[1].metadata.parameterOverrides, { n: 2 }, "canonical configuration wins a collision");
  assert.deepEqual(after.models[1].metadata.legacyModelIds, ["gpt-image-2-grsai"]);
  assert.equal(store.getPublic("other").models[0].id, "gpt-image-2-vip");
  assert.equal(migrateLegacyCatalogModelIds(input).updated, 0);
  assert.equal(snapshots, 1);
});

test("failed backup leaves all old IDs untouched", t => {
  const { db } = fixture(t);
  const before = db.getProviderRecord("grsai");
  assert.throws(() => migrateLegacyCatalogModelIds({ db, createSnapshot: () => { throw new Error("backup failed"); } }), /backup failed/);
  assert.deepEqual(db.getProviderRecord("grsai"), before);
});

test("a database write failure rolls back renamed models and the migration marker", t => {
  const { db } = fixture(t);
  const before = db.getProviderRecord("grsai");
  const failingDb = {
    ...db,
    saveProviderRecord(provider) {
      db.saveProviderRecord(provider);
      throw new Error("simulated write failure");
    },
  };
  assert.throws(() => migrateLegacyCatalogModelIds({ db: failingDb, createSnapshot: () => ({ id: "backup" }) }), /simulated write failure/);
  assert.deepEqual(db.getProviderRecord("grsai"), before);
  assert.ok(!db.getSetting("providers.catalog-model-ids.v1")?.completed);
});

test("old pinned IDs resolve only within their provider and exact IDs win", t => {
  const { db, store } = fixture(t);
  migrateLegacyCatalogModelIds({ db, createSnapshot: () => ({ id: "backup" }) });
  const resolver = createCapabilityResolver({ store });
  const selected = resolver.resolve({ intent: "image.edit", preferredProviderId: "grsai", preferredModelId: "gpt-image-2-vip-grsai" });
  assert.equal(selected.model.id, "gpt-image-2-vip");
  assert.throws(() => resolver.resolve({ intent: "image.generate", preferredProviderId: "other", preferredModelId: "gpt-image-2-vip-grsai" }), /不可用/);
  const provider = store.getPublic("grsai");
  store.save({ ...provider, models: [...provider.models, { id: "gpt-image-2-vip-grsai", protocol: "openai", capabilities: ["image.generate"] }] });
  assert.equal(resolver.resolve({ intent: "image.generate", preferredProviderId: "grsai", preferredModelId: "gpt-image-2-vip-grsai" }).model.id, "gpt-image-2-vip-grsai");
});

test("relay sends the canonical ID verbatim, even for genuine upstream suffixes", async () => {
  const bodies = [];
  const engine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }),
    outboundFetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ data: [{ url: "https://images.example/result.png" }] }));
    },
  });
  const provider = { id: "relay", protocol: "image-relay", baseUrl: "https://relay.example" };
  for (const id of ["gpt-image-2-vip", "real-model-grsai"]) {
    await engine.execute(provider, { id, protocol: "image-relay" }, "image.generate", { prompt: "test" });
  }
  assert.deepEqual(bodies.map(body => body.model), ["gpt-image-2-vip", "real-model-grsai"]);
});

test("resuming a migrated model keeps the already-submitted task without a POST", async () => {
  const methods = [];
  const engine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }),
    outboundFetch: async (_url, options) => {
      methods.push(options.method || "GET");
      return new Response(JSON.stringify({ status: "succeeded", data: [{ url: "https://images.example/result.png" }] }));
    },
  });
  const provider = { id: "relay", protocol: "image-relay", baseUrl: "https://relay.example" };
  const model = { id: "gpt-image-2", protocol: "image-relay", metadata: { legacyModelIds: ["gpt-image-2-grsai"] } };
  const result = await engine.execute(provider, model, "image.generate", { prompt: "test" }, {}, {
    resumeTask: { protocol: "image-relay", providerId: "relay", modelId: "gpt-image-2-grsai", baseUrl: provider.baseUrl, taskId: "already-paid" },
  });
  assert.equal(result.data[0].url, "https://images.example/result.png");
  assert.deepEqual(methods, ["GET"]);
});

test("first-time startup migrations never fabricate upstream mappings for real suffix IDs", t => {
  const { db, store } = fixture(t);
  store.save({
    id: "genuine", name: "Genuine", baseUrl: "https://models.example", protocol: "openai", enabled: true,
    models: ["genuine-grsai", "genuine-apimart", "genuine"].map(id => ({
      id, protocol: "openai", capabilities: ["image.generate"], metadata: {},
    })),
  });
  db.setSetting("providers.media-model-profiles.v2", {});
  const input = { db, store, createSnapshot: () => ({ id: "backup" }) };
  migrateLegacyMediaProviders(input);
  migrateLegacyMediaModelProfiles(input);
  migrateLegacyCatalogModelIds(input);
  const models = store.getPublic("genuine").models;
  assert.deepEqual(models.map(model => model.id), ["genuine-grsai", "genuine-apimart", "genuine"]);
  assert.ok(models.every(model => !model.metadata.upstreamModel), "only recorded legacy mappings are authoritative");
});

test("an exact ID across eligible providers wins over a higher-priority provider alias", () => {
  const resolver = createCapabilityResolver({ store: {
    getAutoFallback: () => true,
    listInternal: () => [
      { id: "alias-provider", enabled: true, sortOrder: 0, models: [{ id: "genuine", capabilities: ["image.generate"], metadata: { legacyModelIds: ["genuine-grsai"] } }] },
      { id: "exact-provider", enabled: true, sortOrder: 1, models: [{ id: "genuine-grsai", capabilities: ["image.generate"] }] },
    ],
  } });
  assert.equal(resolver.resolve({ intent: "image.generate", preferredModelId: "genuine-grsai" }).provider.id, "exact-provider");
});
