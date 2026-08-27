const assert = require("node:assert/strict");
const routing = require("../image-model-routing");

const candidates = [
  {
    id: "offline",
    enabled: true,
    hasApiKey: true,
    hasBaseUrl: true,
    capabilities: ["generation", "edit"],
    state: "offline",
    successRate: 100,
    consecutiveFailures: 0,
    latencyMs: 100,
    order: 0,
  },
  {
    id: "fast",
    enabled: true,
    hasApiKey: true,
    hasBaseUrl: true,
    capabilities: ["generation", "edit"],
    state: "online",
    successRate: 98,
    consecutiveFailures: 0,
    latencyMs: 900,
    lastImageSuccessAt: "2026-08-24T02:00:00.000Z",
    order: 1,
  },
  {
    id: "preferred",
    enabled: true,
    hasApiKey: true,
    hasBaseUrl: true,
    capabilities: ["generation"],
    state: "unknown",
    successRate: 100,
    consecutiveFailures: 0,
    latencyMs: 1200,
    order: 2,
  },
];

assert.equal(routing.selectCandidate(candidates, { preferredId: "preferred" }).id, "preferred");
assert.equal(routing.selectCandidate(candidates, { preferredId: "offline" }).id, "fast");
assert.equal(routing.selectCandidate(candidates, { requiresEdit: true }).id, "fast");
assert.equal(routing.selectCandidate([{ ...candidates[0] }]), null);
assert.equal(routing.selectCandidate([{ ...candidates[1], hasBaseUrl: false }]), null);
assert.deepEqual(candidates.map((item) => item.id), ["offline", "fast", "preferred"]);

const ranked = routing.rankCandidates([
  { ...candidates[1], id: "unstable", state: "unstable", successRate: 100, latencyMs: 100 },
  { ...candidates[1], id: "healthy", state: "online", successRate: 92, latencyMs: 1500 },
]);
assert.deepEqual(ranked.map((item) => item.id), ["healthy", "unstable"]);

const timeoutRegression = routing.rankCandidates([
  {
    ...candidates[1],
    id: "timed-out-history",
    state: "unstable",
    successRate: 66.7,
    consecutiveFailures: 1,
    latencyMs: 49553,
    lastImageSuccessAt: "2026-08-24T07:59:48.288Z",
  },
  {
    ...candidates[1],
    id: "healthy-untried",
    state: "online",
    successRate: null,
    consecutiveFailures: 0,
    latencyMs: 901,
    lastImageSuccessAt: "",
  },
]);
assert.deepEqual(timeoutRegression.map((item) => item.id), ["healthy-untried", "timed-out-history"]);
assert.equal(routing.shouldReplaceCandidate(timeoutRegression[1], timeoutRegression[0]), true);
assert.equal(routing.shouldReplaceCandidate(timeoutRegression[0], { ...timeoutRegression[0], id: "another-online", latencyMs: 300 }), false);

const mixedModels = [
  {
    ...candidates[1],
    id: "custom:image2-stable",
    providerId: "stable-image2",
    model: "gpt-image-2",
    family: "openai",
    latencyMs: 1200,
    successRate: 100,
  },
  {
    ...candidates[1],
    id: "custom:image2-fast",
    providerId: "fast-image2",
    model: "gpt-image-2",
    family: "openai",
    state: "unstable",
    latencyMs: 300,
    successRate: 80,
    consecutiveFailures: 2,
  },
  {
    ...candidates[1],
    id: "custom:gemini",
    providerId: "gemini",
    model: "gemini-3-pro-image-preview",
    alias: "Gemini 3 Pro Image",
    family: "gemini",
    latencyMs: 200,
  },
];

assert.equal(routing.selectCandidate(mixedModels, { defaultModelFamily: "gpt-image-2" }).providerId, "stable-image2");
assert.equal(routing.selectCandidate(mixedModels, { requestedModel: "Gemini 3 Pro Image" }).providerId, "gemini");
assert.equal(routing.selectCandidate(mixedModels, { requestedModel: "gemini_3-pro.image preview" }).providerId, "gemini");
assert.equal(routing.selectCandidate(mixedModels, { requestedModel: "missing-model" }), null);
assert.equal(routing.matchesRequestedModel(mixedModels[0], "image2"), true);
assert.equal(routing.matchesRequestedModel(mixedModels[2], "gpt-image-2"), false);

const fallback = routing.selectFallbackCandidate([
  { ...mixedModels[0], id: "quota", state: "balance-error", latencyMs: 20 },
  { ...mixedModels[0], id: "primary", latencyMs: 100 },
  { ...mixedModels[0], id: "backup", latencyMs: 180 },
  { ...mixedModels[2], id: "other-model", latencyMs: 10 },
], {
  requestedModel: "gpt-image-2",
  excludeIds: ["primary"],
});

assert.equal(fallback?.id, "backup");

console.log("Image model routing checks passed.");
