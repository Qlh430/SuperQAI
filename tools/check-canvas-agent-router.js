const assert = require("node:assert/strict");
const Router = require("../canvas-agent-router");

async function main() {
  const now = 1_800_000_000_000;
  const candidates = [
    {
      id: "terra-slow",
      providerId: "p1",
      model: "gpt-5.6-terra",
      baseUrl: "https://one.test/v1",
      apiKey: "a",
      capabilities: ["text", "vision", "tools"],
    },
    {
      id: "terra-fast",
      providerId: "p2",
      model: "gpt-5.6-terra",
      baseUrl: "https://two.test/v1/chat/completions",
      apiKey: "b",
      capabilities: ["text", "vision", "tools"],
    },
    {
      id: "fallback",
      providerId: "p3",
      model: "qwen-fast",
      baseUrl: "https://three.test/v1",
      apiKey: "c",
      capabilities: ["text", "vision", "tools"],
    },
  ].map(Router.normalizeAgentCandidate);

  assert.equal(candidates[0].responsesUrl, "https://one.test/v1/responses");
  assert.equal(candidates[0].chatCompletionsUrl, "https://one.test/v1/chat/completions");
  assert.equal(candidates[0].adapterId, "openai-responses");
  assert.equal(Router.normalizeAgentCandidate({
    providerId: "chat-provider",
    model: "chat-model",
    baseUrl: "https://chat.test/v1",
    apiKey: "key",
    protocol: "chat",
  }).adapterId, "openai-chat");
  assert.equal(Router.normalizeAgentCandidate({
    providerId: "custom-provider",
    model: "custom-model",
    baseUrl: "https://custom.test/v1",
    apiKey: "key",
    protocol: "custom",
    adapterId: "vendor-native",
  }).adapterId, "vendor-native");
  assert.equal(candidates[1].baseUrl, "https://two.test/v1");
  assert.deepEqual(
    Router.getRequiredAgentCapabilities({ vision_images: ["https://image.test/a.png"] }),
    ["text", "vision", "tools"],
  );
  assert.deepEqual(Router.getRequiredAgentCapabilities({}), ["text", "tools"]);
  assert.deepEqual(Router.normalizeAgentRouting({}), { primaryCandidateId: "", candidateOrder: [] });
  assert.deepEqual(Router.normalizeAgentRouting({ mode: "speed", preferredModel: "gpt-5.6-terra" }), { primaryCandidateId: "", candidateOrder: [] });
  assert.deepEqual(Router.normalizeAgentRouting({
    primaryCandidateId: " route-stable ",
    candidateOrder: [" route-stable ", " backup-b ", "", "backup-b", "backup-c"],
  }), {
    primaryCandidateId: "route-stable",
    candidateOrder: ["route-stable", "backup-b", "backup-c"],
  });
  assert.equal(Router.normalizeAgentRouting({
    candidateOrder: Array.from({ length: 300 }, (_, index) => `route-${index}`),
  }).candidateOrder.length, 256);

  const builtCandidates = Router.buildAgentCandidates({
    providers: [{
      id: "configured-terra",
      name: "Configured",
      baseUrl: "https://configured.test/v1",
      apiKey: "configured-key",
      enabled: true,
      models: [{ id: "gpt-5.6-terra", capabilities: [] }],
    }, {
      id: "fallback-provider",
      name: "Fallback",
      baseUrl: "https://fallback.test/v1",
      apiKey: "fallback-key",
      enabled: true,
      models: [
        { id: "qwen-fast", capabilities: ["text", "vision"] },
        { id: "image-only", capabilities: ["generation"] },
      ],
    }, {
      id: "unverified-tools",
      name: "Unverified tools",
      baseUrl: "https://unverified.test/v1",
      apiKey: "unverified-key",
      enabled: true,
      models: [{ id: "unverified-text-model", capabilities: ["text", "vision"] }],
    }],
    fallbacks: [{
      id: "env-terra",
      providerId: "env",
      model: "gpt-5.6-terra",
      baseUrl: "https://env.test/v1/responses",
      apiKey: "env-key",
      protocol: "responses",
      capabilities: ["text", "vision", "tools"],
    }, {
      id: "env-terra-chat",
      providerId: "env",
      model: "gpt-5.6-terra",
      baseUrl: "https://env.test/v1/chat/completions",
      apiKey: "env-key",
      protocol: "chat",
      capabilities: ["text", "vision", "tools"],
    }],
    payload: { vision_images: ["https://image.test/a.png"] },
    preferredModel: "gpt-5.6-terra",
    capabilityRegistry: {
      "configured-terra:gpt-5.6-terra": { protocol: "chat", text: true, tools: true, vision: true },
      "fallback-provider:qwen-fast": { protocol: "chat", tools: true, vision: true },
      "unverified-tools:unverified-text-model": { protocol: "chat", text: true, tools: true, vision: "untested" },
    },
  });
  assert.deepEqual(builtCandidates.map((item) => item.model), [
    "gpt-5.6-terra",
    "gpt-5.6-terra",
    "qwen-fast",
    "qwen-fast",
  ]);
  assert.equal(builtCandidates[0].protocol, "chat");
  assert.equal(builtCandidates[1].protocol, "responses");
  assert.equal(builtCandidates[2].protocol, "chat");
  assert.equal(builtCandidates[3].protocol, "responses");
  assert.deepEqual(builtCandidates.map((item) => item.adapterId), [
    "openai-chat",
    "openai-responses",
    "openai-chat",
    "openai-responses",
  ]);
  assert.equal(builtCandidates.some((item) => item.model === "image-only"), false);
  assert.equal(builtCandidates.some((item) => item.providerId === "unverified-tools"), false);
  assert.equal(builtCandidates.some((item) => item.providerId === "env"), false);

  const verifiedEnvironmentFallback = Router.buildAgentCandidates({
    providers: [],
    fallbacks: [{
      providerId: "env",
      model: "gpt-5.6-terra",
      baseUrl: "https://env.test/v1",
      apiKey: "env-key",
      protocol: "chat",
      capabilities: ["text", "vision", "tools"],
    }],
    capabilityRegistry: {
      "env:gpt-5.6-terra": { text: true, tools: true, vision: true, protocol: "chat" },
    },
    payload: {},
  });
  assert.equal(verifiedEnvironmentFallback.length, 1);
  assert.equal(verifiedEnvironmentFallback[0].providerId, "env");

  const unverifiedPreferred = Router.buildAgentCandidates({
    providers: [{
      id: "unverified-preferred",
      baseUrl: "https://preferred.test/v1",
      apiKey: "preferred-key",
      enabled: true,
      models: [{ id: "gpt-5.6-terra", capabilities: [] }],
    }],
    preferredModel: "gpt-5.6-terra",
    payload: {},
  });
  assert.deepEqual(unverifiedPreferred, []);

  const ranked = Router.rankAgentCandidates(candidates, {
    "terra-slow": { successes: 4, failures: 2, ewmaFirstEventMs: 9000, consecutiveFailures: 0 },
    "terra-fast": { successes: 9, failures: 0, ewmaFirstEventMs: 800, consecutiveFailures: 0 },
    fallback: { successes: 20, failures: 0, ewmaFirstEventMs: 300, consecutiveFailures: 0 },
  }, { routing: { primaryCandidateId: candidates[1].selectionId }, now });
  assert.equal(ranked[0].id, "terra-fast");

  const policyCandidates = [
    { id: "fast-but-flaky", providerId: "speed", model: "fast", baseUrl: "https://speed.test/v1", apiKey: "speed-key", capabilities: ["text", "tools"] },
    { id: "slower-stable", providerId: "stable", model: "stable", baseUrl: "https://stable.test/v1", apiKey: "stable-key", capabilities: ["text", "tools"] },
  ].map(Router.normalizeAgentCandidate);
  const policyHistory = {
    "fast-but-flaky": { successes: 6, failures: 4, ewmaFirstEventMs: 400, consecutiveFailures: 0 },
    "slower-stable": { successes: 10, failures: 0, ewmaFirstEventMs: 1200, consecutiveFailures: 0 },
  };
  assert.equal(Router.rankAgentCandidates(policyCandidates, policyHistory, { routing: {}, now })[0].id, "slower-stable");
  assert.equal(Router.rankAgentCandidates(policyCandidates, policyHistory, {
    routing: { primaryCandidateId: policyCandidates[0].selectionId },
    now,
  })[0].id, "fast-but-flaky");
  assert.equal(Router.rankAgentCandidates(policyCandidates, {
    ...policyHistory,
    "fast-but-flaky": { ...policyHistory["fast-but-flaky"], circuitOpenUntil: now + 10_000 },
  }, {
    routing: { primaryCandidateId: policyCandidates[0].selectionId },
    now,
  })[0].id, "slower-stable");
  assert.equal(Router.rankAgentCandidates(candidates, {
    "terra-fast": { successes: 9, failures: 0, ewmaFirstEventMs: 800, consecutiveFailures: 0 },
    fallback: { successes: 20, failures: 0, ewmaFirstEventMs: 300, consecutiveFailures: 0 },
  }, { routing: {}, now })[0].id, "fallback");

  const savedOrder = [candidates[0].selectionId, candidates[1].selectionId, candidates[2].selectionId];
  const changedHealth = {
    "terra-slow": { successes: 1, failures: 8, ewmaFirstEventMs: 9000, consecutiveFailures: 1 },
    "terra-fast": { successes: 20, failures: 0, ewmaFirstEventMs: 200, consecutiveFailures: 0 },
    fallback: { successes: 30, failures: 0, ewmaFirstEventMs: 100, consecutiveFailures: 0 },
  };
  assert.deepEqual(
    Router.rankAgentCandidates(candidates, changedHealth, {
      routing: { primaryCandidateId: candidates[0].selectionId, candidateOrder: savedOrder },
      now,
    }).map((item) => item.selectionId),
    savedOrder,
    "saved Agent routes should keep their configured order even when health scores change",
  );
  assert.deepEqual(
    Router.rankAgentCandidates(candidates, {
      ...changedHealth,
      "terra-slow": { ...changedHealth["terra-slow"], circuitOpenUntil: now + 10_000 },
    }, {
      routing: { primaryCandidateId: candidates[0].selectionId, candidateOrder: savedOrder },
      now,
    }).map((item) => item.selectionId),
    savedOrder.slice(1),
    "a circuit-open route should be skipped without rewriting the saved order",
  );

  const circuitHistory = {
    "terra-fast": {
      successes: 9,
      failures: 2,
      ewmaFirstEventMs: 800,
      consecutiveFailures: 2,
      circuitOpenUntil: now + 10_000,
    },
  };
  assert.equal(
    Router.rankAgentCandidates(candidates, circuitHistory, { preferredModel: "gpt-5.6-terra", now })
      .some((item) => item.id === "terra-fast"),
    false,
  );
  assert.equal(
    Router.rankAgentCandidates(candidates, circuitHistory, { preferredModel: "gpt-5.6-terra", now: now + 10_001 })
      .some((item) => item.id === "terra-fast"),
    true,
  );

  const firstFailure = Router.updateAgentRouteHealth(
    {},
    { success: false, category: "timeout", at: now, latencyMs: 10_000 },
    { failureThreshold: 2 },
  );
  const opened = Router.updateAgentRouteHealth(
    firstFailure,
    { success: false, category: "timeout", at: now + 1, latencyMs: 10_000 },
    { failureThreshold: 2 },
  );
  assert.ok(opened.circuitOpenUntil > now);
  assert.equal(opened.consecutiveFailures, 2);
  const recovered = Router.updateAgentRouteHealth(
    opened,
    { success: true, at: now + 20_000, firstEventMs: 500, latencyMs: 900 },
    { failureThreshold: 2 },
  );
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.circuitOpenUntil, 0);
  assert.equal(recovered.ewmaFirstEventMs, 500);

  assert.equal(Router.classifyAgentRouteError({ httpStatus: 429, message: "rate limit" }), "rate-limit");
  assert.equal(Router.classifyAgentRouteError({ httpStatus: 401, message: "bad key" }), "auth");
  assert.equal(Router.classifyAgentRouteError({ httpStatus: 503, message: "down" }), "server");
  assert.equal(Router.classifyAgentRouteError({ code: "FIRST_EVENT_TIMEOUT" }), "timeout");
  assert.equal(Router.classifyAgentRouteError({ code: "INVALID_AGENT_RESPONSE" }), "protocol");
  assert.equal(Router.classifyAgentRouteError({ code: "INVALID_AGENT_ADAPTER" }), "protocol");
  assert.equal(Router.classifyAgentRouteError({
    httpStatus: 400,
    message: "No tool call found for function call output with call_id call_123",
  }), "protocol");
  assert.equal(Router.classifyAgentRouteError({ category: "task" }), "task");
  assert.equal(
    Router.formatAgentVerificationError(
      Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }),
      { timeoutMs: 45_000 },
    ),
    "模型响应超时：接口已连接，但本次推理在 45 秒内没有完成。可以重试或改用其他模型。",
  );
  assert.equal(Router.shouldFailoverAgentError({ httpStatus: 503 }), true);
  assert.equal(Router.shouldFailoverAgentError({ httpStatus: 401 }), true);
  assert.equal(Router.shouldFailoverAgentError({ category: "balance" }), true);
  assert.equal(Router.shouldFailoverAgentError({ category: "busy" }), true);
  assert.equal(Router.shouldFailoverAgentError({ category: "tool" }), false);
  assert.equal(Router.shouldFailoverAgentError({ name: "AbortError", cancelledByUser: true }), false);
  assert.equal(Router.isAgentRouteHalfOpen({
    circuitOpenUntil: now - 1,
    consecutiveFailures: 1,
    lastErrorCategory: "auth",
  }, now), true);

  assert.deepEqual(
    Router.orderAgentCandidatesByEndpointDiversity([
      { id: "a-chat", baseUrl: "https://a.test/v1" },
      { id: "a-responses", baseUrl: "https://a.test/v1" },
      { id: "b-chat", baseUrl: "https://b.test/v1" },
      { id: "c-chat", baseUrl: "https://c.test/v1" },
      { id: "b-responses", baseUrl: "https://b.test/v1" },
    ]).map((item) => item.id),
    ["a-chat", "b-chat", "c-chat", "a-responses", "b-responses"],
    "failover should try a different endpoint before retrying another model or protocol on the same endpoint",
  );
  assert.deepEqual(
    Router.getAdaptiveAgentAttemptPolicy({}, { ewmaFirstEventMs: 5000 }, {
      connectTimeoutMs: 4000,
      firstEventTimeoutMs: 10000,
      attemptTimeoutMs: 45000,
    }),
    { connectTimeoutMs: 8500, firstEventTimeoutMs: 10000, attemptTimeoutMs: 45000 },
  );
  assert.equal(
    Router.getAdaptiveAgentAttemptPolicy({}, { ewmaFirstEventMs: 21598 }, {
      connectTimeoutMs: 4000,
      firstEventTimeoutMs: 10000,
      attemptTimeoutMs: 45000,
    }).connectTimeoutMs,
    30000,
    "very slow verification results must remain capped",
  );
  assert.equal(
    Router.getAdaptiveAgentAttemptPolicy({}, {}, {
      connectTimeoutMs: 4000,
      firstEventTimeoutMs: 10000,
      attemptTimeoutMs: 45000,
    }).connectTimeoutMs,
    10000,
    "unmeasured reverse proxies need enough time to return buffered headers",
  );

  const statuses = [];
  const attempts = [];
  const result = await Router.executeSequentialFailover({
    candidates: [{ id: "slow" }, { id: "fast" }],
    runAttempt: async (candidate) => {
      attempts.push(candidate.id);
      if (candidate.id === "slow") {
        const error = new Error("first event timeout");
        error.code = "FIRST_EVENT_TIMEOUT";
        throw error;
      }
      return { candidateId: candidate.id, turn: { message: "ok", tool_calls: [] } };
    },
    onStatus: (event) => statuses.push(event.stage),
  });
  assert.equal(result.candidateId, "fast");
  assert.deepEqual(attempts, ["slow", "fast"]);
  assert.deepEqual(statuses, ["recovering"]);

  let budgetClock = 0;
  const observedAttemptBudgets = [];
  const budgetResult = await Router.executeSequentialFailover({
    candidates: [{ id: "budget-first" }, { id: "budget-second" }],
    policy: { attemptTimeoutMs: 80, totalTimeoutMs: 100 },
    now: () => budgetClock,
    runAttempt: async (candidate, attempt) => {
      observedAttemptBudgets.push(attempt.policy.attemptTimeoutMs);
      if (candidate.id === "budget-first") {
        budgetClock = 70;
        throw Object.assign(new Error("temporary failure"), { httpStatus: 503 });
      }
      return { candidateId: candidate.id, turn: { message: "within budget", tool_calls: [] } };
    },
  });
  assert.equal(budgetResult.candidateId, "budget-second");
  assert.deepEqual(observedAttemptBudgets, [80, 30]);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => Router.executeSequentialFailover({
      candidates: [{ id: "unused" }],
      signal: controller.signal,
      runAttempt: async () => ({ ok: true }),
    }),
    (error) => error.name === "AbortError" && Router.shouldFailoverAgentError(error) === false,
  );

  await assert.rejects(
    () => Router.executeSequentialFailover({
      candidates: [{ id: "bad-task" }, { id: "must-not-run" }],
      runAttempt: async (candidate) => {
        if (candidate.id === "must-not-run") throw new Error("unexpected second attempt");
        throw Object.assign(new Error("missing image"), { category: "task" });
      },
    }),
    /missing image/,
  );

  console.log("Canvas agent router checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
