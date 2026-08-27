const assert = require("node:assert/strict");
const Verification = require("../canvas-agent-verification");

const pool = {
  candidates: [
    { providerId: "a", endpoint: "a.test", model: "gpt-5.6-terra", state: "ready" },
  ],
  discovered: [
    { providerId: "a2", endpoint: "a.test", model: "gpt-5.6-terra", state: "pending_verification" },
    { providerId: "b", endpoint: "b.test", model: "gpt-5.6-terra", state: "pending_verification" },
    { providerId: "c", endpoint: "c.test", model: "gpt-5.5", state: "pending_verification" },
    { providerId: "d", endpoint: "d.test", model: "image-only", state: "pending_verification" },
  ],
};

assert.deepEqual(
  Verification.selectAutoVerificationTargets(pool, {
    maxReadyEndpoints: 3,
    maxTargets: 3,
    attemptedKeys: new Set(),
  }).map((item) => item.endpoint),
  ["b.test", "c.test"],
  "automatic verification should fill distinct endpoints and prefer the current model",
);
assert.deepEqual(
  Verification.selectAutoVerificationTargets(pool, {
    maxReadyEndpoints: 3,
    maxTargets: 3,
    attemptedKeys: new Set(["b:gpt-5.6-terra"]),
  }).map((item) => item.endpoint),
  ["c.test"],
  "already attempted candidates should not loop",
);
const sameHostDifferentBasePaths = {
  candidates: [
    { providerId: "path-a", endpoint: "gateway.test", endpointIdentity: "https://gateway.test/openai/v1", model: "gpt-5.6-terra", state: "ready" },
  ],
  discovered: [
    { providerId: "path-b", endpoint: "gateway.test", endpointIdentity: "https://gateway.test/backup/v1", model: "gpt-5.6-terra", state: "pending_verification" },
  ],
};
assert.deepEqual(
  Verification.selectAutoVerificationTargets(sameHostDifferentBasePaths, {
    maxReadyEndpoints: 2,
    maxTargets: 2,
  }).map((item) => item.providerId),
  ["path-b"],
  "different API base paths on the same host should remain independently verifiable",
);
assert.notEqual(
  Verification.normalizeEndpoint("https://gateway.test/OpenAI/v1"),
  Verification.normalizeEndpoint("https://gateway.test/openai/v1"),
  "case-sensitive API paths must not be collapsed into one endpoint",
);
assert.equal(Verification.classifyVerificationQuality({ tools: true, latencyMs: 21598 }).label, "已验证 · 响应较慢");
assert.equal(Verification.classifyVerificationQuality({ tools: true, latencyMs: 4500 }).label, "Agent 已验证");
assert.equal(Verification.classifyVerificationQuality({ tools: false, latencyMs: 1000 }).label, "工具未通过");

console.log("Canvas agent verification policy checks passed.");
