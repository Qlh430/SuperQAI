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
assert.equal(routing.selectCandidate(candidates, { preferredId: "offline" }).id, "offline");
assert.equal(routing.selectCandidate(candidates, { requiresEdit: true }).id, "offline");
assert.equal(routing.selectCandidate([{ ...candidates[0] }]).id, "offline");
assert.equal(routing.selectCandidate([{ ...candidates[1], hasBaseUrl: false }]), null);
assert.equal(routing.isConfiguredCandidate(candidates[0]), true);
assert.equal(routing.isHealthyCandidate(candidates[0]), false);
assert.deepEqual(candidates.map((item) => item.id), ["offline", "fast", "preferred"]);

const ranked = routing.rankCandidates([
  { ...candidates[1], id: "unstable", state: "unstable", successRate: 100, latencyMs: 100, order: 0 },
  { ...candidates[1], id: "healthy", state: "online", successRate: 92, latencyMs: 1500, order: 1 },
]);
assert.deepEqual(ranked.map((item) => item.id), ["unstable", "healthy"], "runtime health must not override administrator order");

const timeoutRegression = routing.rankCandidates([
  {
    ...candidates[1],
    id: "timed-out-history",
    state: "unstable",
    successRate: 66.7,
    consecutiveFailures: 1,
    latencyMs: 49553,
    lastImageSuccessAt: "2026-08-24T07:59:48.288Z",
    order: 0,
  },
  {
    ...candidates[1],
    id: "healthy-untried",
    state: "online",
    successRate: null,
    consecutiveFailures: 0,
    latencyMs: 901,
    lastImageSuccessAt: "",
    order: 1,
  },
]);
assert.deepEqual(timeoutRegression.map((item) => item.id), ["timed-out-history", "healthy-untried"]);
assert.equal(routing.shouldReplaceCandidate(timeoutRegression[0], timeoutRegression[1]), false);
assert.equal(routing.shouldReplaceCandidate({ ...timeoutRegression[0], hasBaseUrl: false }, timeoutRegression[1]), true);

const preferredHostRegression = routing.rankCandidates([
  {
    ...candidates[1],
    id: "hyhawang-unhealthy",
    providerBaseUrl: "https://api.hyhawang.com/v1",
    state: "offline",
    latencyMs: 100,
    order: 0,
  },
  {
    ...candidates[1],
    id: "healthy-other",
    providerBaseUrl: "https://other.example/v1",
    state: "online",
    latencyMs: 900,
    order: 1,
  },
]);
assert.deepEqual(preferredHostRegression.map((item) => item.id), ["hyhawang-unhealthy", "healthy-other"]);

const equallyHealthyPreferredHost = routing.rankCandidates([
  {
    ...candidates[1],
    id: "healthy-other",
    providerBaseUrl: "https://other.example/v1",
    state: "online",
    latencyMs: 100,
    order: 0,
  },
  {
    ...candidates[1],
    id: "healthy-hyhawang",
    providerBaseUrl: "https://api.hyhawang.com/v1",
    state: "online",
    latencyMs: 900,
    order: 1,
  },
]);
assert.deepEqual(equallyHealthyPreferredHost.map((item) => item.id), ["healthy-other", "healthy-hyhawang"]);

const mixedModels = [
  {
    ...candidates[1],
    id: "custom:image2-stable",
    providerId: "stable-image2",
    model: "gpt-image-2",
    family: "openai",
    latencyMs: 1200,
    successRate: 100,
    order: 0,
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
    order: 1,
  },
  {
    ...candidates[1],
    id: "custom:gemini",
    providerId: "gemini",
    model: "gemini-3-pro-image-preview",
    alias: "Gemini 3 Pro Image",
    family: "gemini",
    latencyMs: 200,
    order: 2,
  },
];

assert.equal(routing.selectCandidate(mixedModels, { defaultModelFamily: "gpt-image-2" }).providerId, "stable-image2");
assert.equal(routing.selectCandidate(mixedModels, { requestedModel: "Gemini 3 Pro Image" }).providerId, "gemini");
assert.equal(routing.selectCandidate(mixedModels, { requestedModel: "gemini_3-pro.image preview" }).providerId, "gemini");
assert.equal(routing.selectCandidate(mixedModels, { requestedModel: "missing-model" }), null);
assert.equal(routing.matchesRequestedModel(mixedModels[0], "image2"), true);
assert.equal(routing.matchesRequestedModel(mixedModels[2], "gpt-image-2"), false);

const fallback = routing.selectFallbackCandidate([
  { ...mixedModels[0], id: "quota", state: "balance-error", latencyMs: 20, order: 0 },
  { ...mixedModels[0], id: "primary", state: "online", latencyMs: 100, order: 1 },
  { ...mixedModels[0], id: "backup", state: "online", latencyMs: 180, order: 2 },
  { ...mixedModels[2], id: "other-model", latencyMs: 10, order: 3 },
], {
  requestedModel: "gpt-image-2",
  excludeIds: ["primary"],
});

assert.equal(fallback?.id, "backup");
assert.equal(
  routing.shouldReplaceCandidate(
    { ...mixedModels[0], id: "degraded", state: "degraded", order: 0 },
    { ...mixedModels[0], id: "healthy", state: "online", order: 1 },
  ),
  true,
  "a rejected/degraded candidate must be replaceable during preflight",
);

const monitoringIgnored = routing.buildCandidateRecords([
  {
    id: "ordered-provider",
    name: "Ordered",
    baseUrl: "https://ordered.example/v1",
    enabled: true,
    hasApiKey: true,
    models: [{ id: "ordered-model", capabilities: ["image.generate", "image.edit"] }],
  },
], {
  providers: { "ordered-provider": [{ state: "offline", latencyMs: 999999 }] },
  usage: { "ordered-provider": [{ kind: "image", model: "ordered-model", success: false }] },
});
assert.equal(monitoringIgnored[0].state, "unknown");
assert.equal(monitoringIgnored[0].consecutiveFailures, 0);
assert.equal(monitoringIgnored[0].latencyMs, 0);

console.log("Image model routing checks passed.");
