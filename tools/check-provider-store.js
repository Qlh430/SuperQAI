"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createProviderStore } = require("../provider-store");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createSystemDb, SCHEMA_VERSION } = require("../system-db");

function providerInput(overrides = {}) {
  return {
    id: "openai-main",
    name: "OpenAI Main",
    baseUrl: "https://api.example.test/v1",
    protocol: "openai",
    source: "api",
    apiKey: "sk-private",
    walletKey: "wallet-private",
    capabilities: { "llm.chat": 0, "image.generate": 1 },
    metadata: { region: "lan" },
    models: [
      {
        id: "gpt-tools",
        displayName: "GPT Tools",
        protocol: "openai",
        capabilities: ["llm.chat", "llm.tools"],
      },
      {
        id: "gpt-image",
        displayName: "GPT Image",
        protocol: "openai-images",
        capabilities: ["image.generate", "image.edit"],
      },
    ],
    ...overrides,
  };
}

(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-store-"));
  const db = createSystemDb({ dbPath: path.join(root, "system.sqlite") });

  try {
    assert.equal(SCHEMA_VERSION, 4);
    assert.deepEqual(db.migrate(), { schemaVersion: 4 });

    db.insertUser({
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      passwordHash: "hash-a",
    });
    db.insertUser({
      id: "user-b",
      username: "bob",
      displayName: "Bob",
      passwordHash: "hash-b",
    });

    const vault = createProviderSecretVault({ dataDir: root });
    const store = createProviderStore({ db, vault, registry: createProtocolRegistry() });
    assert.equal(store.getAutoFallback(), true);

    const saved = store.save(providerInput());
    assert.equal(saved.id, "openai-main");
    assert.equal(saved.hasApiKey, true);
    assert.equal(saved.apiKeyMasked, "sk-p••••vate");
    assert.equal(Object.hasOwn(saved, "apiKey"), false);
    assert.equal(Object.hasOwn(saved, "walletKey"), false);
    assert.equal(Object.hasOwn(saved, "encryptedApiKey"), false);

    const raw = db.getProviderRecord("openai-main");
    assert.match(raw.encryptedApiKey, /^aiosenc:v1:/);
    assert.match(raw.encryptedWalletKey, /^aiosenc:v1:/);
    assert.notEqual(raw.encryptedApiKey, "sk-private");
    assert.deepEqual(raw.models.map((model) => model.id), ["gpt-tools", "gpt-image"]);
    assert.equal(db.hasEncryptedProviderSecrets(), 2);

    assert.throws(
      () => store.save(providerInput({
        id: "invalid-image-capability",
        name: "Invalid Image Capability",
        models: [{ id: "gpt-image-invalid", protocol: "openai-images", capabilities: ["llm.chat"] }],
      })),
      (error) => error.code === "invalid_protocol_capabilities",
    );
    assert.equal(store.getPublic("invalid-image-capability"), null);

    const jimeng = store.save({
      id: "jimeng-local",
      name: "即梦（本地 CLI）",
      protocol: "cli:jimeng",
      source: "cli",
      cliTool: "jimeng",
      models: [
        { id: "jimeng-image", capabilities: ["image.generate"] },
        { id: "jimeng-video" },
        { id: "5.0" },
        { id: "seedance2.5" },
      ],
    });
    assert.equal(jimeng.baseUrl, "");
    assert.equal(jimeng.source, "cli");
    assert.equal(jimeng.cliTool, "jimeng");
    assert.equal(jimeng.hasApiKey, false);
    assert.equal(jimeng.models[0].protocol, "cli:jimeng");
    assert.deepEqual(jimeng.models[1].capabilities, ["video.generate"]);
    assert.equal(jimeng.models[1].protocol, "cli:jimeng");
    // A Dreamina image model saved under its bare CLI version is upgraded to the
    // name the client publishes, and the previous name stays resolvable. A
    // Seedance video name is already final and is left alone.
    assert.deepEqual(jimeng.models.map((model) => model.id), ["jimeng-image", "jimeng-video", "jimeng-5.0", "seedance2.5"]);
    assert.deepEqual(jimeng.models[2].capabilities, ["image.generate", "image.edit"]);
    assert.deepEqual(jimeng.models[2].metadata.legacyModelIds, ["5.0"]);
    assert.equal(jimeng.models[3].metadata.legacyModelIds, undefined);
    assert.throws(
      () => store.save({ id: "bad-http", name: "Bad", protocol: "openai", baseUrl: "", models: [] }),
      /baseUrl/i,
    );

    store.save({
      id: "openai-main",
      name: "Renamed Provider",
      apiKey: "",
      walletKey: saved.apiKeyMasked,
    });
    assert.equal(store.reveal("openai-main").apiKey, "sk-private");
    assert.equal(store.reveal("openai-main").walletKey, "wallet-private");
    assert.equal(store.getPublic("openai-main").name, "Renamed Provider");

    store.save({ id: "openai-main", clearWalletKey: true });
    assert.equal(store.reveal("openai-main").walletKey, "");
    assert.equal(store.reveal("openai-main").apiKey, "sk-private");

    store.save(providerInput({
      id: "anthropic-secondary",
      name: "Anthropic Secondary",
      baseUrl: "https://anthropic.example.test",
      protocol: "anthropic",
      apiKey: "sk-ant-private",
      walletKey: "",
      models: [{
        id: "claude-chat",
        displayName: "Claude Chat",
        protocol: "anthropic",
        capabilities: ["llm.chat"],
      }],
    }));

    store.reorderProviders(["anthropic-secondary", "openai-main", "jimeng-local"]);
    assert.deepEqual(store.listPublic().map((provider) => provider.id), ["anthropic-secondary", "openai-main", "jimeng-local"]);
    store.reorderModels("openai-main", ["gpt-image", "gpt-tools"]);
    assert.deepEqual(store.getPublic("openai-main").models.map((model) => model.id), ["gpt-image", "gpt-tools"]);

    // Legacy records may contain a model protocol in the platform column.
    // Public reads must expose the canonical platform while preserving the
    // image model profile on the model row.
    db.saveProviderRecord({
      id: "legacy-image-platform",
      name: "Legacy Image Platform",
      baseUrl: "https://legacy.example.test",
      providerProtocol: "openai-images",
      source: "api",
      models: [{
        id: "gpt-image-1",
        displayName: "GPT Image 1",
        modelProtocol: "openai-images",
        capabilities: ["image.generate"],
      }],
    });
    const legacyPublic = store.getPublic("legacy-image-platform");
    assert.equal(legacyPublic.protocol, "openai", "model protocol aliases must never leak as platform protocol");
    assert.equal(legacyPublic.models[0].protocol, "openai-images", "image model profile must be preserved");
    assert.deepEqual(store.repairProtocolAssignments(), ["legacy-image-platform"]);
    assert.equal(db.getProviderRecord("legacy-image-platform").providerProtocol, "openai");

    assert.deepEqual(
      store.publicModelsForCapability("llm.tools").map((model) => model.id),
      ["gpt-tools"],
    );
    const catalogModel = store.publicModelsForCapability("llm.tools")[0];
    assert.equal(Object.hasOwn(catalogModel, "baseUrl"), false);
    assert.equal(Object.hasOwn(catalogModel, "protocol"), false);
    assert.equal(Object.hasOwn(catalogModel, "apiKeyMasked"), false);

    store.setEnabled("openai-main", false);
    assert.deepEqual(store.publicModelsForCapability("llm.tools"), []);
    store.setEnabled("openai-main", true);

    store.setAutoFallback(false);
    assert.equal(store.getAutoFallback(), false);
    assert.deepEqual(db.getProviderSettings(), { autoFallback: false });

    db.setUserPreferences("user-a", { appearance: { theme: "dark", animations: "reduced" } });
    db.setUserPreferences("user-a", { canvas: { theme: "light" } });
    assert.deepEqual(db.getUserPreferences("user-a"), {
      appearance: { theme: "dark", animations: "reduced" },
      canvas: { theme: "light" },
    });
    db.replaceUserPreferences("user-a", { appearance: { theme: "light", scale: 1.25, animations: "full" } });
    assert.deepEqual(db.getUserPreferences("user-a"), {
      appearance: { theme: "light", scale: 1.25, animations: "full" },
    }, "replacement writes purge retired preference groups instead of deep-merging them");
    assert.deepEqual(db.getUserPreferences("user-b"), {});

    const beforeRejectedSave = store.getPublic("openai-main");
    assert.throws(
      () => store.save({
        id: "openai-main",
        name: "Must Not Persist",
        models: [
          { id: "duplicate", protocol: "openai", capabilities: ["llm.chat"] },
          { id: "duplicate", protocol: "openai", capabilities: ["llm.chat"] },
        ],
      }),
      /duplicate/i,
    );
    assert.deepEqual(store.getPublic("openai-main"), beforeRejectedSave);

    db.saveProviderRecord({
      id: "corrupt-provider",
      name: "Corrupt Provider",
      baseUrl: "https://corrupt.example.test",
      providerProtocol: "openai",
      encryptedApiKey: "aiosenc:v1:AAAA",
      enabled: true,
      sortOrder: 99,
      models: [],
    });
    const validation = store.validateSecrets();
    assert.deepEqual(validation.invalidProviderIds, ["corrupt-provider"]);
    assert.equal(db.getProviderRecord("corrupt-provider").enabled, false);
    assert.equal(JSON.stringify(validation).includes("sk-private"), false);

    assert.equal(store.remove("anthropic-secondary"), true);
    assert.equal(db.getProviderRecord("anthropic-secondary"), null);
    assert.equal(store.remove("anthropic-secondary"), false);

    assert.deepEqual(db.quickCheck(), { ok: true, result: "ok" });
    console.log("Provider store checks passed.");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
