"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");
const { createSystemDb } = require("../system-db");
const { createAgentModelSettingsService } = require("../agent-model-settings");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-capability-backfill-"));
const db = createSystemDb({ dbPath: path.join(root, "system.sqlite") });

try {
  db.migrate();
  const store = createProviderStore({
    db,
    vault: createProviderSecretVault({ dataDir: root }),
  });
  store.save({
    id: "legacy-openai",
    name: "旧 OpenAI 兼容站点",
    baseUrl: "https://legacy.example/v1",
    protocol: "openai",
    apiKey: "legacy-key",
    models: [
      { id: "gpt-5.6-terra", capabilities: [] },
      { id: "text-embedding-3-large", capabilities: [] },
      { id: "manual-empty", capabilities: [], metadata: { capabilitiesExplicit: true } },
    ],
  });

  const provider = store.getPublic("legacy-openai");
  assert.deepEqual(
    provider.models.find(model => model.id === "gpt-5.6-terra").capabilities,
    ["llm.chat", "llm.chat.vision", "llm.tools"],
    "legacy unannotated LLMs must be available to Agent and the LLM node",
  );
  assert.deepEqual(
    provider.models.find(model => model.id === "text-embedding-3-large").capabilities,
    [],
    "non-LLM models must not receive chat capabilities",
  );
  assert.deepEqual(
    provider.models.find(model => model.id === "manual-empty").capabilities,
    [],
    "an explicitly empty capability selection must remain empty",
  );
  assert.equal(
    store.publicModelsForCapability("llm.chat.vision").some(model => model.id === "gpt-5.6-terra"),
    true,
    "the vision model catalog must include the recovered legacy model",
  );
  const agentSettings = createAgentModelSettingsService({ db, store });
  assert.equal(
    agentSettings.listModels().some(model => model.modelId === "gpt-5.6-terra"),
    true,
    "Agent settings must include the recovered multimodal model",
  );
  console.log("Provider capability backfill checks passed.");
} finally {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}
