"use strict";

const assert = require("node:assert/strict");
const { summarizeProviderCatalogHealth } = require("../provider-catalog-health");

const provider = { id: "apib", enabled: true };
const empty = summarizeProviderCatalogHealth(provider, { providers: {}, usage: {} });
assert.deepEqual(empty, {
  state: "unknown",
  rank: 3,
  successRate: null,
  latencyMs: null,
  lastUsedAt: "",
});

const healthy = summarizeProviderCatalogHealth(provider, {
  providers: {
    apib: [{ state: "reachable", latencyMs: 900, checkedAt: "2026-09-06T01:00:00.000Z" }],
  },
  usage: {
    apib: [
      { kind: "chat", success: false, latencyMs: 100, checkedAt: "2026-09-06T01:10:00.000Z" },
      { kind: "image", success: false, errorCategory: "network", latencyMs: 4000, checkedAt: "2026-09-06T01:20:00.000Z" },
      { kind: "image", success: true, latencyMs: 820, checkedAt: "2026-09-06T01:30:00.000Z" },
    ],
  },
});
assert.equal(healthy.state, "online");
assert.equal(healthy.rank, 0);
assert.equal(healthy.successRate, 50);
assert.equal(healthy.latencyMs, 820);
assert.equal(healthy.lastUsedAt, "2026-09-06T01:30:00.000Z");

const limited = summarizeProviderCatalogHealth(provider, {
  providers: { apib: [{ state: "online", latencyMs: 700, checkedAt: "2026-09-06T02:00:00.000Z" }] },
  usage: {
    apib: [{
      kind: "image",
      success: false,
      errorCategory: "auth",
      latencyMs: 120,
      checkedAt: "2026-09-06T02:01:00.000Z",
    }],
  },
});
assert.equal(limited.state, "account-limited");
assert.equal(limited.rank, 6);
assert.equal(limited.successRate, 0);

const disabled = summarizeProviderCatalogHealth({ id: "apib", enabled: false }, {
  providers: { apib: [{ state: "online", latencyMs: 700 }] },
  usage: {},
});
assert.equal(disabled.state, "disabled");
assert.equal(disabled.rank, 8);

const separatedUsage = {
  providers: { apib: [{ state: "reachable", latencyMs: 600, checkedAt: "2026-09-06T03:00:00.000Z" }] },
  usage: {
    apib: [
      { kind: "image", success: true, latencyMs: 700, checkedAt: "2026-09-06T03:01:00.000Z" },
      { kind: "chat", success: true, latencyMs: 120, checkedAt: "2026-09-06T03:01:30.000Z" },
      { kind: "agent", success: false, errorCategory: "balance", latencyMs: 80, checkedAt: "2026-09-06T03:02:00.000Z" },
    ],
  },
};
assert.equal(summarizeProviderCatalogHealth(provider, separatedUsage).state, "online", "image routing keeps image health");
assert.equal(summarizeProviderCatalogHealth(provider, separatedUsage, { kind: "chat" }).state, "online", "ordinary chat keeps its own health");
const agentLimited = summarizeProviderCatalogHealth(provider, separatedUsage, { kind: "agent" });
assert.equal(agentLimited.state, "balance-error", "Agent routing sees Agent-specific balance failures");
assert.equal(agentLimited.rank, 6);
assert.equal(agentLimited.successRate, 0);

assert.equal(JSON.stringify(healthy).includes("apiKey"), false);
assert.equal(JSON.stringify(healthy).includes("baseUrl"), false);

console.log("Image model catalog presentation checks passed.");
