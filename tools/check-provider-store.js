"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createProviderStore } = require("../provider-store");
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
    assert.equal(SCHEMA_VERSION, 2);
    assert.deepEqual(db.migrate(), { schemaVersion: 2 });

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
    const store = createProviderStore({ db, vault });
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

    store.reorderProviders(["anthropic-secondary", "openai-main"]);
    assert.deepEqual(store.listPublic().map((provider) => provider.id), ["anthropic-secondary", "openai-main"]);
    store.reorderModels("openai-main", ["gpt-image", "gpt-tools"]);
    assert.deepEqual(store.getPublic("openai-main").models.map((model) => model.id), ["gpt-image", "gpt-tools"]);

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
