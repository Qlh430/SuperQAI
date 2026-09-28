"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAgentModelSettingsService } = require("../agent-model-settings");
const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");
const { createSystemDb } = require("../system-db");

function provider(id, sortOrder, modelIds, metadata = {}, capabilities = ["llm.chat", "llm.chat.vision", "llm.tools"]) {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example.test/v1`,
    protocol: "openai",
    apiKey: `fake-${id}`,
    enabled: true,
    sortOrder,
    metadata,
    models: modelIds.map((modelId) => ({
      id: modelId,
      displayName: modelId,
      protocol: "openai",
      capabilities,
    })),
  };
}

(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-agent-coherence-"));
  const db = createSystemDb({ dbPath: path.join(root, "system.sqlite") });
  try {
    db.migrate();
    const store = createProviderStore({ db, vault: createProviderSecretVault({ dataDir: root }) });
    store.save(provider("secondary", 1, ["agent-c"]));
    store.save(provider("primary", 0, ["agent-a", "agent-b"], {
      monitoring: { state: "offline", ewmaLatencyMs: 999999, circuitOpen: true, halfOpen: true },
    }));
    store.save(provider("text-only", 2, ["chat-only"], {}, ["llm.chat", "llm.tools"]));

    const resolver = createCapabilityResolver({ store });
    const agentSettings = createAgentModelSettingsService({ db, store });
    const agentCatalog = agentSettings.listModels().map((item) => `${item.providerId}:${item.modelId}`);
    assert.deepEqual(agentCatalog, ["primary:agent-a", "primary:agent-b", "secondary:agent-c"]);
    assert.equal(agentCatalog.includes("text-only:chat-only"), false, "Agent excludes models without vision");
    assert.deepEqual(
      resolver.listCandidates({ intent: "llm.tools", mustAll: ["llm.chat", "llm.chat.vision", "llm.tools"] })
        .map(item => `${item.provider.id}:${item.model.id}`),
      agentCatalog,
      "Agent settings and runtime resolver must expose the same multimodal catalog",
    );

    const handlerSource = fs.readFileSync(path.join(__dirname, "..", "canvas-agent-http-api.js"), "utf8");
    const handlerStart = handlerSource.indexOf("async function handleTurn");
    const handlerEnd = handlerSource.indexOf("async function handleCancel", handlerStart);
    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "Canvas Agent handler must exist");
    const activeHandler = handlerSource.slice(handlerStart, handlerEnd);
    assert.match(activeHandler, /canvasAgentProviderBridge\.runTurn/);
    assert.match(activeHandler, /agentModelSettings\.getRoute\(\)/);
    assert.match(
      activeHandler,
      /candidateOrder:\s*prioritizeSessionCandidateOrder\(agentRoute\.candidateOrder,\s*session\)/,
    );
    assert.match(handlerSource, /pinnedProviderId/);
    assert.match(handlerSource, /pinnedModelId/);
    assert.match(activeHandler, /forceFallback:\s*true/);
    assert.doesNotMatch(activeHandler, /scopedPayload\.(?:providerId|modelId)/);
    assert.doesNotMatch(activeHandler, /getCanvasAgentCandidates|orderCanvasAgentCandidatesForSession/);
    assert.doesNotMatch(activeHandler, /readCanvasAgentRouteHistory|getAdaptiveAgentAttemptPolicy/);
    assert.doesNotMatch(activeHandler, /executeSequentialFailover|runCanvasAgentCandidate/);
    assert.doesNotMatch(activeHandler, /canvas-agent-verification|EWMA|circuit|half-open/i);

    console.log("Live Agent model coherence check passed.");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
