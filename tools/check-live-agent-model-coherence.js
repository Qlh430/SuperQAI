"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");
const { createSystemDb } = require("../system-db");

function provider(id, sortOrder, modelIds, metadata = {}) {
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
      capabilities: ["llm.chat", "llm.tools"],
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

    const resolver = createCapabilityResolver({ store });
    const chatCatalog = store.publicModelsForCapability("llm.chat")
      .map((item) => `${item.providerId}:${item.id}`);
    const agentCatalog = resolver.listCandidates({ intent: "llm.tools" })
      .map((item) => `${item.provider.id}:${item.model.id}`);
    assert.deepEqual(agentCatalog, chatCatalog, "Agent and chat must follow the same Store order");
    assert.deepEqual(agentCatalog, ["primary:agent-a", "primary:agent-b", "secondary:agent-c"]);

    const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const handlerStart = serverSource.indexOf("async function handleCanvasAgentTurn");
    const handlerEnd = serverSource.indexOf("async function handleCanvasAgentCancel", handlerStart);
    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "Canvas Agent handler must exist");
    const activeHandler = serverSource.slice(handlerStart, handlerEnd);
    assert.match(activeHandler, /canvasAgentProviderBridge\.runTurn/);
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
