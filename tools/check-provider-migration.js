"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { migrateLegacyAgentProviders, migrateLegacyProviders, normalizeBaseUrl } = require("../provider-migration");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");
const { createSystemDb } = require("../system-db");

function createFixture(rootName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), rootName));
  const db = createSystemDb({ dbPath: path.join(root, "system.sqlite") });
  db.migrate();
  const vault = createProviderSecretVault({ dataDir: root });
  const store = createProviderStore({ db, vault });
  return { root, db, store };
}

function closeFixture(fixture) {
  fixture.db.close();
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

(() => {
  assert.throws(() => normalizeBaseUrl("ftp://api.example.test"), /HTTP or HTTPS/i);

  const fixture = createFixture("aios-provider-migration-");
  const legacySettingsFile = path.join(fixture.root, "settings.json");
  fs.writeFileSync(legacySettingsFile, JSON.stringify({ preserved: true }), "utf8");
  let snapshotCalls = 0;

  try {
    const input = {
      db: fixture.db,
      store: fixture.store,
      settingsProviders: [{
        id: "settings-primary",
        name: "Settings Provider",
        baseUrl: "https://API.EXAMPLE.test/v1/",
        protocol: "openai",
        apiKey: "sk-shared",
        enabled: true,
        models: [{ id: "chat-model", protocol: "openai", capabilities: ["chat", "vision"] }],
      }],
      environmentProviders: [{
        id: "environment-duplicate",
        name: "Environment Provider",
        baseUrl: "https://api.example.test/v1",
        protocol: "openai",
        apiKey: "sk-shared",
        models: [
          { id: "chat-model", protocol: "openai", capabilities: ["chat", "tools"] },
          { id: "image-model", protocol: "openai-images", capabilities: ["generation", "edit"] },
        ],
      }],
      createSnapshot() {
        snapshotCalls += 1;
        return { path: path.join(fixture.root, `snapshot-${snapshotCalls}`) };
      },
    };

    const first = migrateLegacyProviders(input);
    assert.equal(first.migrated, 1);
    assert.equal(first.skipped, 1);
    assert.deepEqual(first.providerIds, ["settings-primary"]);
    assert.equal(first.snapshotId, "snapshot-1");
    assert.equal(snapshotCalls, 1);

    const providers = fixture.store.listInternal();
    assert.equal(providers.length, 1);
    assert.equal(providers[0].name, "Settings Provider", "settings values win during deduplication");
    assert.equal(providers[0].apiKey, "sk-shared");
    assert.deepEqual(providers[0].models.map((model) => model.id), ["chat-model", "image-model"]);
    assert.deepEqual(providers[0].models[0].capabilities.sort(), ["llm.chat", "llm.chat.vision", "llm.tools"]);
    assert.deepEqual(providers[0].models[1].capabilities.sort(), ["image.edit", "image.generate"]);
    assert.equal(fs.existsSync(legacySettingsFile), true, "legacy settings remain available for rollback");

    const second = migrateLegacyProviders(input);
    assert.deepEqual(second, {
      migrated: 0,
      skipped: 2,
      providerIds: ["settings-primary"],
      snapshotId: "snapshot-1",
    });
    assert.equal(snapshotCalls, 1, "idempotent startup must not create another migration snapshot");
    assert.equal(fixture.store.listInternal().length, 1);
  } finally {
    closeFixture(fixture);
  }

  const agentUpgradeFixture = createFixture("aios-provider-agent-upgrade-");
  let agentUpgradeSnapshots = 0;
  try {
    migrateLegacyProviders({
      db: agentUpgradeFixture.db,
      store: agentUpgradeFixture.store,
      environmentProviders: [{
        id: "environment-chat",
        name: "Environment Chat",
        baseUrl: "https://agent.example.test/v1",
        protocol: "openai",
        source: "environment",
        apiKey: "fake-agent-key",
        models: [{ id: "chat-model", protocol: "openai", capabilities: ["chat", "vision"] }],
      }],
      createSnapshot: () => ({ id: "initial-provider-snapshot" }),
    });
    const upgradeInput = {
      db: agentUpgradeFixture.db,
      store: agentUpgradeFixture.store,
      agentProvider: {
        id: "canvas-agent-env-fallback",
        name: "Canvas Agent API",
        baseUrl: "https://agent.example.test/v1",
        protocol: "openai-responses",
        source: "environment",
        apiKey: "fake-agent-key",
        models: [{
          id: "response-model",
          protocol: "openai-responses",
          capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
        }],
      },
      createSnapshot: () => ({ id: `agent-upgrade-${++agentUpgradeSnapshots}` }),
    };
    const upgraded = migrateLegacyAgentProviders(upgradeInput);
    assert.equal(upgraded.updated, 1);
    assert.equal(agentUpgradeSnapshots, 1);
    const upgradedProvider = agentUpgradeFixture.store.listInternal()[0];
    assert.deepEqual(upgradedProvider.models.map((model) => model.id), ["chat-model", "response-model"]);
    assert.equal(upgradedProvider.models[0].capabilities.includes("llm.tools"), true);
    assert.equal(upgradedProvider.models[1].protocol, "openai-responses");
    assert.equal(migrateLegacyAgentProviders(upgradeInput).updated, 0);
    assert.equal(agentUpgradeSnapshots, 1);
  } finally {
    closeFixture(agentUpgradeFixture);
  }

  const rollbackFixture = createFixture("aios-provider-migration-rollback-");
  let rollbackSnapshotCalls = 0;
  try {
    assert.throws(() => migrateLegacyProviders({
      db: rollbackFixture.db,
      store: rollbackFixture.store,
      settingsProviders: [
        {
          id: "valid-first",
          name: "Valid First",
          baseUrl: "https://valid.example.test",
          protocol: "openai",
          apiKey: "sk-valid",
          models: [],
        },
        {
          id: "broken-second",
          name: "Broken Second",
          baseUrl: "",
          protocol: "openai",
          apiKey: "sk-broken",
          models: [],
        },
      ],
      environmentProviders: [],
      createSnapshot() {
        rollbackSnapshotCalls += 1;
        return { path: path.join(rollbackFixture.root, "rollback-snapshot") };
      },
    }), /baseUrl|required/i);
    assert.equal(rollbackSnapshotCalls, 1);
    assert.deepEqual(rollbackFixture.store.listInternal(), [], "partial imports roll back as one transaction");
    assert.equal(rollbackFixture.db.getSetting("providers.migration.v1"), null);
  } finally {
    closeFixture(rollbackFixture);
  }

  console.log("Provider migration checks passed.");
})();
