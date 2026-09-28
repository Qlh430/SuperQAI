"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  LEGACY_APIMART_PLATFORM_MIGRATION_KEY,
  migrateLegacyAgentProviders,
  migrateLegacyApimartPlatforms,
  migrateLegacyMediaProviders,
  migrateLegacyMediaModelProfiles,
  migrateLegacyProviders,
  normalizeBaseUrl,
} = require("../provider-migration");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
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

  const mediaUpgradeFixture = createFixture("aios-provider-media-upgrade-");
  let mediaUpgradeSnapshots = 0;
  try {
    [
      {
        id: "standard-images",
        name: "Standard Images",
        baseUrl: "https://images.example.test/v1",
        protocol: "openai",
        source: "environment",
        apiKey: "fake-image-key",
        models: [{ id: "gpt-image", protocol: "openai", capabilities: ["image.generate", "image.edit"] }],
      },
      {
        id: "apimart-images",
        name: "APIMart Images",
        baseUrl: "https://api.apimart.example/v1",
        protocol: "apimart",
        source: "environment",
        apiKey: "fake-apimart-key",
        models: [
          { id: "gpt-image-2", protocol: "openai", capabilities: ["image.generate", "image.edit"] },
          { id: "midjourney", protocol: "openai", capabilities: ["image.generate"] },
        ],
      },
      {
        id: "grsai-images",
        name: "GRSAI Images",
        baseUrl: "https://grsai.example/v1/api/generate",
        protocol: "openai-images",
        source: "environment",
        apiKey: "fake-grsai-key",
        models: [{ id: "nano-banana-pro-grsai", protocol: "openai-images", capabilities: ["image.generate", "image.edit"], metadata: { upstreamModel: "nano-banana-pro" } }],
      },
    ].forEach((provider) => mediaUpgradeFixture.store.save(provider));

    // Simulate rows written by the old application: current saves already
    // normalize these inherited protocols before the migration runs.
    for (const id of ["standard-images", "apimart-images"]) {
      const record = mediaUpgradeFixture.db.getProviderRecord(id);
      mediaUpgradeFixture.db.saveProviderRecord({ ...record, models: record.models.map(model => ({ ...model, modelProtocol: "openai" })) });
    }

    const input = {
      db: mediaUpgradeFixture.db,
      store: mediaUpgradeFixture.store,
      localVideoProvider: {
        id: "local-comfyui",
        name: "Local ComfyUI",
        baseUrl: "http://127.0.0.1:8188",
        protocol: "comfyui",
        source: "local",
        enabled: true,
        models: [{ id: "minimax-h3", protocol: "comfyui", capabilities: ["video.generate"] }],
      },
      createSnapshot: () => ({ id: `media-upgrade-${++mediaUpgradeSnapshots}` }),
    };
    assert.equal(migrateLegacyMediaProviders(input).updated, 4);
    assert.equal(mediaUpgradeSnapshots, 1);
    const upgraded = mediaUpgradeFixture.store.listInternal();
    assert.equal(upgraded.find((provider) => provider.id === "standard-images").models[0].protocol, "openai-images");
    assert.deepEqual(upgraded.find((provider) => provider.id === "apimart-images").models.map((model) => model.protocol), ["openai-images", "midjourney"]);
    assert.equal(upgraded.find((provider) => provider.id === "grsai-images").models[0].protocol, "image-relay");
    assert.equal(upgraded.find((provider) => provider.id === "grsai-images").models[0].metadata.upstreamModel, "nano-banana-pro");
    assert.equal(upgraded.find((provider) => provider.id === "local-comfyui").models[0].capabilities[0], "video.generate");
    assert.equal(migrateLegacyMediaProviders(input).updated, 0);
    assert.equal(mediaUpgradeSnapshots, 1);
  } finally {
    closeFixture(mediaUpgradeFixture);
  }

  const mediaModelProfileFixture = createFixture("aios-provider-media-model-profile-");
  let mediaModelProfileSnapshots = 0;
  try {
    mediaModelProfileFixture.store.save({
      id: "apimart-images",
      name: "APIMart Images",
      baseUrl: "https://api.apimart.ai/v1",
      protocol: "apimart",
      source: "environment",
      apiKey: "fake-apimart-key",
      models: [
        {
          id: "gpt-image-2-apimart",
          displayName: "gpt-image-2-apimart",
          protocol: "openai-images",
          capabilities: ["image.generate", "image.edit"],
          metadata: { upstreamModel: "gpt-image-2", resolutions: ["1", "2", "4"] },
        },
        {
          id: "midjourney",
          displayName: "midjourney",
          protocol: "apimart",
          capabilities: ["image.generate"],
          metadata: { platform: "midjourney", family: "midjourney" },
        },
      ],
    });
    // A historical GRSAI row can contain the legacy image-relay model profile
    // under an OpenAI platform. It must not prevent the APIMart-only cleanup.
    mediaModelProfileFixture.store.save({
      id: "grsai-images",
      name: "GRSAI Images",
      baseUrl: "https://grsai.example/v1/api/generate",
      protocol: "openai",
      source: "environment",
      apiKey: "fake-grsai-key",
      models: [{
        id: "gpt-image-2-grsai",
        displayName: "gpt-image-2-grsai",
        protocol: "image-relay",
        capabilities: ["image.generate"],
        metadata: { upstreamModel: "gpt-image-2" },
      }],
    });
    const strictMediaModelStore = createProviderStore({
      db: mediaModelProfileFixture.db,
      vault: createProviderSecretVault({ dataDir: mediaModelProfileFixture.root }),
      registry: createProtocolRegistry(),
    });
    mediaModelProfileFixture.db.setSetting("providers.media-bridge.v1", { completed: true, version: 1 });
    const input = {
      db: mediaModelProfileFixture.db,
      store: strictMediaModelStore,
      createSnapshot: () => ({ id: `media-model-profile-${++mediaModelProfileSnapshots}` }),
    };

    assert.equal(migrateLegacyMediaModelProfiles(input).updated, 1, "v2 migration must run even when the v1 bridge already completed");
    assert.equal(mediaModelProfileSnapshots, 1);
    const apimart = strictMediaModelStore.listInternal()[0];
    assert.deepEqual(apimart.models.map((model) => model.id), ["gpt-image-2", "midjourney"]);
    assert.deepEqual(apimart.models.map((model) => model.displayName), ["gpt-image-2", "midjourney"]);
    assert.deepEqual(apimart.models.map((model) => model.protocol), ["openai-images", "midjourney"]);
    assert.deepEqual(apimart.models[0].metadata.legacyModelIds, ["gpt-image-2-apimart"]);
    assert.equal(apimart.models[0].metadata.upstreamModel, "gpt-image-2");
    assert.equal(strictMediaModelStore.listInternal().find((provider) => provider.id === "grsai-images").models[0].id, "gpt-image-2-grsai");
    assert.equal(migrateLegacyMediaModelProfiles(input).updated, 0);
    assert.equal(mediaModelProfileSnapshots, 1, "idempotent startup must not create another v2 snapshot");
  } finally {
    closeFixture(mediaModelProfileFixture);
  }

  const legacyApimartPlatformFixture = createFixture("aios-legacy-apimart-platform-");
  let legacyApimartPlatformSnapshots = 0;
  try {
    legacyApimartPlatformFixture.store.save({
      id: "legacy-apimart",
      name: "Legacy APIMart",
      baseUrl: "https://api.apimart.ai/v1",
      protocol: "apimart",
      source: "environment",
      apiKey: "fake-apimart-key",
      models: [
        {
          id: "gpt-image-2",
          displayName: "GPT Image 2",
          protocol: "openai-images",
          capabilities: ["image.generate", "image.edit"],
          metadata: { family: "gpt-image" },
        },
        {
          id: "mj-v7",
          displayName: "Midjourney V7",
          protocol: "midjourney",
          capabilities: ["image.generate"],
          metadata: { family: "midjourney" },
        },
        {
          id: "gemini-3-pro-image",
          displayName: "Gemini Image",
          protocol: "gemini",
          capabilities: ["image.generate", "image.edit"],
          metadata: { family: "gemini" },
        },
      ],
    });
    const input = {
      db: legacyApimartPlatformFixture.db,
      store: legacyApimartPlatformFixture.store,
      createSnapshot: () => ({ id: `legacy-apimart-platform-${++legacyApimartPlatformSnapshots}` }),
    };

    const migrated = migrateLegacyApimartPlatforms(input);
    assert.equal(migrated.updated, 1);
    assert.equal(migrated.snapshotId, "legacy-apimart-platform-1");
    assert.equal(legacyApimartPlatformSnapshots, 1);
    assert.deepEqual(migrated.providerIds, ["legacy-apimart"]);
    assert.equal(legacyApimartPlatformFixture.db.getSetting(LEGACY_APIMART_PLATFORM_MIGRATION_KEY).completed, true);

    const provider = legacyApimartPlatformFixture.store.listInternal()[0];
    assert.equal(provider.protocol, "openai");
    assert.equal(provider.metadata.legacyPlatformProtocol, "apimart");
    assert.deepEqual(provider.models.map(model => ({
      id: model.id,
      displayName: model.displayName,
      protocol: model.protocol,
      capabilities: model.capabilities,
      metadata: model.metadata,
    })), [
      {
        id: "gpt-image-2",
        displayName: "GPT Image 2",
        protocol: "openai-images",
        capabilities: ["image.generate", "image.edit"],
        metadata: { family: "gpt-image" },
      },
      {
        id: "mj-v7",
        displayName: "Midjourney V7",
        protocol: "midjourney",
        capabilities: ["image.generate", "image.edit"],
        metadata: { family: "midjourney" },
      },
      {
        id: "gemini-3-pro-image",
        displayName: "Gemini Image",
        protocol: "gemini",
        capabilities: ["image.generate", "image.edit"],
        metadata: { family: "gemini" },
      },
    ]);
    assert.equal(migrateLegacyApimartPlatforms(input).updated, 0);
    assert.equal(legacyApimartPlatformSnapshots, 1, "restarting must not create another APIMart migration snapshot");

    const engine = createProtocolEngine({
      registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters() }),
      outboundFetch: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    });
    assert.equal(engine.describeExecution(provider, provider.models[0], "image.generate").runtimeProtocol, "apimart");
    assert.equal(engine.describeExecution(provider, provider.models[1], "image.generate").runtimeProtocol, "midjourney");
    assert.equal(engine.describeExecution(provider, provider.models[2], "image.generate").runtimeProtocol, "gemini");
  } finally {
    closeFixture(legacyApimartPlatformFixture);
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
