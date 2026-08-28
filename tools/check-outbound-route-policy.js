const assert = require("node:assert/strict");
const {
  createOutboundRoutePolicy,
  getRouteKey,
  normalizeRouteMode,
  sanitizeRouteState,
} = require("../outbound-route-policy");

let currentTime = 1_000;
const policy = createOutboundRoutePolicy({
  now: () => currentTime,
  ttlMs: 10_000,
  failureThreshold: 2,
});

assert.equal(normalizeRouteMode("", "https://api.hyhawang.com"), "direct");
assert.equal(normalizeRouteMode("AUTO", "https://api.hyhawang.com"), "auto");
assert.equal(normalizeRouteMode("", "https://api.example.com"), "auto");
assert.equal(normalizeRouteMode("proxy", "https://api.example.com"), "proxy");
assert.equal(
  getRouteKey("https://API.Example.com/v1/models?token=secret"),
  "https://api.example.com:443",
);
assert.notEqual(
  getRouteKey("https://api.hyhawang.com/v1/models"),
  getRouteKey("https://chatimage2-img3.shyfai.cn/a.png"),
);

assert.deepEqual(
  policy.choose({
    url: "https://api.hyhawang.com/v1/models",
    mode: "direct",
    proxyAvailable: true,
  }),
  { route: "direct", alternate: null, reason: "forced" },
);
assert.equal(
  policy.choose({ url: "https://api.example.com/v1/models", mode: "proxy", proxyAvailable: false }).route,
  "unavailable",
);

policy.record({
  url: "https://cdn.example/image.png?signature=must-not-persist",
  route: "proxy",
  ok: false,
  latencyMs: 15_000,
  stage: "first-byte",
});
policy.record({
  url: "https://cdn.example/image.png?signature=must-not-persist",
  route: "direct",
  ok: true,
  latencyMs: 800,
  stage: "complete",
});
assert.equal(
  policy.choose({ url: "https://cdn.example/other.png", mode: "auto", proxyAvailable: true }).route,
  "direct",
);

policy.record({
  url: "https://overseas.example/v1/models",
  route: "direct",
  ok: false,
  latencyMs: 5_000,
  stage: "connect",
});
policy.record({
  url: "https://overseas.example/v1/models",
  route: "proxy",
  ok: true,
  latencyMs: 700,
  stage: "complete",
});
assert.equal(
  policy.choose({ url: "https://overseas.example/v1/chat", mode: "auto", proxyAvailable: true }).route,
  "proxy",
);

const snapshot = policy.snapshot();
assert.equal(JSON.stringify(snapshot).includes("image.png"), false);
assert.equal(JSON.stringify(snapshot).includes("must-not-persist"), false);
assert.equal(JSON.stringify(snapshot).includes("apiKey"), false);

currentTime += 11_000;
assert.equal(
  policy.choose({ url: "https://overseas.example/v1/chat", mode: "auto", proxyAvailable: true }).route,
  "direct",
  "expired observations should return auto mode to its direct-first default",
);

assert.deepEqual(policy.resetRuntime(), { version: 1, hosts: {} });
assert.deepEqual(
  sanitizeRouteState({
    version: 1,
    hosts: {
      "https://safe.example:443": {
        preferred: "direct",
        direct: {
          successes: 1,
          failures: 0,
          consecutiveFailures: 0,
          latencyMs: 200,
          lastStage: "complete",
          updatedAt: 1,
          apiKey: "must-not-leak",
        },
      },
      "https://unsafe.example/path?secret=1": { preferred: "proxy" },
    },
  }),
  {
    version: 1,
    hosts: {
      "https://safe.example:443": {
        preferred: "direct",
        direct: {
          successes: 1,
          failures: 0,
          consecutiveFailures: 0,
          latencyMs: 200,
          lastStage: "complete",
          updatedAt: 1,
        },
      },
    },
  },
);

console.log("Outbound route policy checks passed.");
