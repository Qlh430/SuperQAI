const crypto = require("node:crypto");

const DEFAULT_POLICY = Object.freeze({
  connectTimeoutMs: 4000,
  firstEventTimeoutMs: 10000,
  attemptTimeoutMs: 45000,
  totalTimeoutMs: 90000,
  failureThreshold: 2,
  shortCircuitMs: 2 * 60 * 1000,
  longCircuitMs: 15 * 60 * 1000,
  historyLimit: 50,
});

const ROUTE_CAPABILITIES = new Set(["text", "vision", "tools"]);
const FAILOVER_CATEGORIES = new Set(["network", "timeout", "rate-limit", "server", "protocol", "auth", "balance", "busy"]);

function getProviderTaskRequirements(input = {}) {
  return {
    intent: "llm.tools",
    mustAll: input.needsVision ? ["llm.chat.vision", "llm.tools"] : ["llm.tools"],
  };
}

function normalizeAgentRouting(value = {}) {
  const candidateOrder = [];
  const seen = new Set();
  (Array.isArray(value?.candidateOrder) ? value.candidateOrder : []).forEach((item) => {
    const id = String(item || "").trim();
    if (!id || seen.has(id) || candidateOrder.length >= 256) return;
    seen.add(id);
    candidateOrder.push(id);
  });
  return {
    primaryCandidateId: String(value?.primaryCandidateId || "").trim(),
    candidateOrder,
  };
}

function normalizeAgentCandidate(input = {}) {
  const providerId = String(input.providerId || input.provider?.id || "").trim();
  const model = String(input.model || input.modelId || "").trim();
  const apiKey = String(input.apiKey || "").trim();
  const baseUrl = normalizeAgentBaseUrl(input.baseUrl || input.url || "");
  const protocol = String(input.protocol || "responses").toLowerCase() === "chat" ? "chat" : "responses";
  const adapterId = normalizeModelAdapterId(input.adapterId || input.adapter, protocol);
  const capabilities = [...new Set((Array.isArray(input.capabilities) ? input.capabilities : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => ROUTE_CAPABILITIES.has(item)))];
  const selectionId = String(input.selectionId || "").trim()
    || makeCandidateSelectionId(providerId, baseUrl, model, apiKey);
  const id = String(input.id || "").trim() || makeCandidateId(selectionId, adapterId);
  return {
    ...input,
    id,
    providerId,
    model,
    apiKey,
    baseUrl,
    protocol,
    adapterId,
    selectionId,
    capabilities,
    responsesUrl: `${baseUrl}/responses`,
    chatCompletionsUrl: `${baseUrl}/chat/completions`,
    enabled: input.enabled !== false,
  };
}

function normalizeModelAdapterId(value, protocol = "responses") {
  const explicit = String(value || "").trim().toLowerCase();
  if (explicit) return explicit;
  return String(protocol || "responses").toLowerCase() === "chat"
    ? "openai-chat"
    : "openai-responses";
}

function normalizeAgentBaseUrl(value) {
  let url = String(value || "").trim().replace(/\/+$/, "");
  url = url.replace(/\/(?:responses|chat\/completions|models)$/i, "").replace(/\/+$/, "");
  if (url && !/\/v\d+(?:beta\d*)?$/i.test(url)) url += "/v1";
  return url;
}

function makeCandidateSelectionId(providerId, baseUrl, model, apiKey) {
  const keyFingerprint = crypto.createHash("sha1").update(String(apiKey || "")).digest("hex").slice(0, 12);
  return `agent-choice-${crypto.createHash("sha1")
    .update(`${providerId}\n${baseUrl}\n${model}\n${keyFingerprint}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function makeCandidateId(selectionId, adapterId) {
  return `agent-${crypto.createHash("sha1")
    .update(`${selectionId}\n${adapterId}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function getRequiredAgentCapabilities(payload = {}) {
  const required = ["text"];
  if (Array.isArray(payload.vision_images) && payload.vision_images.length) required.push("vision");
  required.push("tools");
  return required;
}

function buildAgentCandidates(options = {}) {
  const providers = Array.isArray(options.providers) ? options.providers : [];
  const capabilityRegistry = options.capabilityRegistry && typeof options.capabilityRegistry === "object"
    ? options.capabilityRegistry
    : {};
  const required = getRequiredAgentCapabilities(options.payload);
  const candidates = [];
  providers.forEach((provider) => {
    if (!provider || provider.enabled === false || !provider.baseUrl || !provider.apiKey) return;
    (Array.isArray(provider.models) ? provider.models : []).forEach((model) => {
      const modelId = String(model?.id || "").trim();
      if (!modelId) return;
      const registryKey = `${provider.id}:${modelId}`;
      const verified = capabilityRegistry[registryKey] || {};
      const capabilities = new Set((Array.isArray(model.capabilities) ? model.capabilities : [])
        .map((item) => String(item || "").toLowerCase())
        .filter((item) => ROUTE_CAPABILITIES.has(item)));
      if (verified.text === false || verified.tools === false || verified.vision === false && required.includes("vision")) return;
      if (verified.text === true) capabilities.add("text");
      if (verified.vision === true) capabilities.add("vision");
      if (verified.tools === true) capabilities.add("tools");
      if (required.includes("vision") && verified.vision !== true) return;
      if (!capabilities.has("text")) return;
      if (!required.every((capability) => capabilities.has(capability))) return;
      const preferredProtocol = verified.protocol === "responses" ? "responses" : "chat";
      [preferredProtocol, preferredProtocol === "responses" ? "chat" : "responses"].forEach((protocol) => {
        candidates.push(normalizeAgentCandidate({
          providerId: String(provider.id || ""),
          model: modelId,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          protocol,
          capabilities: [...capabilities],
          source: provider.source || "settings",
        }));
      });
    });
  });
  const fallbacks = Array.isArray(options.fallbacks)
    ? options.fallbacks
    : options.fallback ? [options.fallback] : [];
  fallbacks.forEach((fallback) => {
    if (!fallback?.apiKey || !fallback?.model || !fallback?.baseUrl) return;
    const providerId = String(fallback.providerId || fallback.id || "").trim();
    const modelId = String(fallback.model || "").trim();
    const verified = capabilityRegistry[`${providerId}:${modelId}`] || {};
    if (verified.text !== true || verified.tools !== true) return;
    if (required.includes("vision") && verified.vision !== true) return;
    candidates.push(normalizeAgentCandidate({
      ...fallback,
      capabilities: ["text", "tools", ...(verified.vision === true ? ["vision"] : [])],
    }));
  });
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!required.every((capability) => candidate.capabilities.includes(capability))) return false;
    const fingerprint = crypto.createHash("sha1").update(candidate.apiKey).digest("hex").slice(0, 12);
    const key = `${candidate.baseUrl}\n${candidate.model}\n${candidate.adapterId}\n${fingerprint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankAgentCandidates(candidates, history = {}, options = {}) {
  const now = Number(options.now ?? Date.now());
  const routing = normalizeAgentRouting(options.routing);
  const configuredOrder = new Map(routing.candidateOrder.map((selectionId, index) => [selectionId, index]));
  const requiredCapabilities = Array.isArray(options.requiredCapabilities)
    ? options.requiredCapabilities.map((item) => String(item || "").toLowerCase())
    : [];
  return (Array.isArray(candidates) ? candidates : [])
    .map(normalizeAgentCandidate)
    .filter((candidate) => candidate.enabled && candidate.baseUrl && candidate.apiKey && candidate.model)
    .filter((candidate) => requiredCapabilities.every((capability) => candidate.capabilities.includes(capability)))
    .filter((candidate) => Number(history[candidate.id]?.circuitOpenUntil || 0) <= now)
    .map((candidate, index) => ({
      candidate,
      index,
      preferred: routing.primaryCandidateId
        && (candidate.selectionId === routing.primaryCandidateId || candidate.id === routing.primaryCandidateId) ? 0 : 1,
      configuredRank: configuredOrder.has(candidate.selectionId)
        ? configuredOrder.get(candidate.selectionId)
        : Number.MAX_SAFE_INTEGER,
      score: getCandidateScore(history[candidate.id], now),
    }))
    .sort((left, right) => left.preferred - right.preferred
      || left.configuredRank - right.configuredRank
      || left.score - right.score
      || left.index - right.index)
    .map((item) => item.candidate);
}

function orderAgentCandidatesByEndpointDiversity(candidates = []) {
  const firstByEndpoint = [];
  const repeatedEndpoints = [];
  const seenEndpoints = new Set();
  (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
    const endpoint = normalizeAgentBaseUrl(candidate?.baseUrl || candidate?.url || "");
    if (seenEndpoints.has(endpoint)) repeatedEndpoints.push(candidate);
    else {
      seenEndpoints.add(endpoint);
      firstByEndpoint.push(candidate);
    }
  });
  return [...firstByEndpoint, ...repeatedEndpoints];
}

function getAdaptiveAgentAttemptPolicy(candidate = {}, health = {}, policy = {}) {
  const observedFirstEventMs = positiveNumber(health.ewmaFirstEventMs)
    || positiveNumber(health.ewmaLatencyMs)
    || positiveNumber(candidate.firstEventMs)
    || positiveNumber(candidate.latencyMs);
  const connectTimeoutMs = observedFirstEventMs
    ? Math.max(8000, Math.min(30000, Math.ceil(observedFirstEventMs * 1.5 + 1000)))
    : Math.max(10000, positiveNumber(policy.connectTimeoutMs));
  return {
    ...policy,
    connectTimeoutMs,
  };
}

function getCandidateScore(health = {}, now = Date.now()) {
  const successes = Math.max(0, Number(health.successes || 0));
  const failures = Math.max(0, Number(health.failures || 0));
  const total = successes + failures;
  const latency = positiveNumber(health.ewmaFirstEventMs)
    || positiveNumber(health.ewmaLatencyMs)
    || 5000;
  const adjustedFailureRate = (failures + 1) / (total + 4);
  const samplePenalty = total ? 1 / Math.sqrt(total) : 1;
  const lastSuccessAt = Math.max(0, Number(health.lastSuccessAt || 0));
  const staleDays = lastSuccessAt ? Math.max(0, Number(now) - lastSuccessAt) / 86_400_000 : 0;
  return adjustedFailureRate * 100_000
    + Math.max(0, Number(health.consecutiveFailures || 0)) * 50_000
    + samplePenalty * 20_000
    + Math.min(10_000, staleDays * 250)
    + Math.min(5_000, latency * 0.1);
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isAgentRouteHalfOpen(health = {}, now = Date.now()) {
  const circuitOpenUntil = Math.max(0, Number(health.circuitOpenUntil || 0));
  return circuitOpenUntil > 0 && circuitOpenUntil <= Number(now);
}

function classifyAgentRouteError(error = {}) {
  const explicit = String(error.category || "").trim().toLowerCase();
  if ([...FAILOVER_CATEGORIES, "auth", "balance", "task", "tool", "cancelled", "request"].includes(explicit)) {
    return explicit;
  }
  if (error.name === "AbortError" && error.cancelledByUser) return "cancelled";
  const code = String(error.code || "").toUpperCase();
  if (["FIRST_EVENT_TIMEOUT", "CONNECT_TIMEOUT", "ATTEMPT_TIMEOUT", "TOTAL_TIMEOUT", "ETIMEDOUT"].includes(code)) {
    return "timeout";
  }
  if (["INVALID_AGENT_RESPONSE", "INVALID_AGENT_ADAPTER", "INVALID_JSON", "INVALID_SSE", "STREAM_TRUNCATED"].includes(code)) {
    return "protocol";
  }
  const status = Math.max(0, Number(error.httpStatus || error.status || 0));
  const message = String(error.message || error || "").toLowerCase();
  if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|invalid[^\n]*key|鉴权|无权限/.test(message)) return "auth";
  if (/insufficient|balance|quota|credit|billing|余额|欠费/.test(message)) return "balance";
  if (status === 429 || /rate.?limit|too many requests|限流/.test(message)) return "rate-limit";
  if (status >= 500) return "server";
  if (/timeout|timed out|超时/.test(message)) return "timeout";
  if (!status && /network|fetch failed|connect|socket|dns|tls|econn|enotfound/.test(message)) return "network";
  if (/no tool call found|function call output|previous_response_id|unknown response|response[^\n]*not found/.test(message)) return "protocol";
  if (/invalid[^\n]*(?:json|response|stream)|non-json|empty response|malformed/.test(message)) return "protocol";
  return "request";
}

function formatAgentVerificationError(error = {}, options = {}) {
  const category = classifyAgentRouteError(error);
  const timeoutSeconds = Math.max(1, Math.round(Number(options.timeoutMs || DEFAULT_POLICY.attemptTimeoutMs) / 1000));
  if (category === "timeout") {
    return `模型响应超时：接口已连接，但本次推理在 ${timeoutSeconds} 秒内没有完成。可以重试或改用其他模型。`;
  }
  if (category === "auth") return "API 鉴权失败：请检查此接口的 Key 和模型权限。";
  if (category === "balance") return "API 余额或额度不足：请充值或改用其他接口。";
  if (category === "rate-limit" || category === "busy") return "接口当前限流或繁忙：可以稍后重试或验证其他接口。";
  if (category === "network") return "无法连接模型接口：请检查接口地址、网络或反向代理状态。";
  if (category === "server") return "服务商暂时异常：可以稍后重试或验证其他接口。";
  if (category === "protocol") return "接口已响应，但返回格式或工具调用协议不兼容。";
  const message = String(error?.message || error || "").trim();
  return message || "Agent 真实调用验证失败。";
}

function shouldFailoverAgentError(error) {
  return FAILOVER_CATEGORIES.has(classifyAgentRouteError(error));
}

function updateAgentRouteHealth(previous = {}, event = {}, options = {}) {
  const policy = { ...DEFAULT_POLICY, ...options };
  const at = Math.max(0, Number(event.at || Date.now()));
  const next = {
    successes: Math.max(0, Number(previous.successes || 0)),
    failures: Math.max(0, Number(previous.failures || 0)),
    consecutiveFailures: Math.max(0, Number(previous.consecutiveFailures || 0)),
    ewmaFirstEventMs: positiveNumber(previous.ewmaFirstEventMs),
    ewmaLatencyMs: positiveNumber(previous.ewmaLatencyMs),
    circuitOpenUntil: Math.max(0, Number(previous.circuitOpenUntil || 0)),
    lastSuccessAt: Math.max(0, Number(previous.lastSuccessAt || 0)),
    lastFailureAt: Math.max(0, Number(previous.lastFailureAt || 0)),
    lastErrorCategory: String(previous.lastErrorCategory || ""),
  };
  if (event.success) {
    next.successes += 1;
    next.consecutiveFailures = 0;
    next.circuitOpenUntil = 0;
    next.lastSuccessAt = at;
    next.lastErrorCategory = "";
    next.ewmaFirstEventMs = updateEwma(next.ewmaFirstEventMs, event.firstEventMs);
    next.ewmaLatencyMs = updateEwma(next.ewmaLatencyMs, event.latencyMs);
    return next;
  }

  const category = String(event.category || classifyAgentRouteError(event)).toLowerCase();
  next.failures += 1;
  next.consecutiveFailures += 1;
  next.lastFailureAt = at;
  next.lastErrorCategory = category;
  next.ewmaLatencyMs = updateEwma(next.ewmaLatencyMs, event.latencyMs);
  const configurationFailure = category === "auth" || category === "balance";
  if (configurationFailure || next.consecutiveFailures >= policy.failureThreshold) {
    next.circuitOpenUntil = at + (configurationFailure ? policy.longCircuitMs : policy.shortCircuitMs);
  }
  return next;
}

function updateEwma(previous, sample) {
  const value = positiveNumber(sample);
  if (!value) return positiveNumber(previous);
  const old = positiveNumber(previous);
  return old ? Math.round(old * 0.7 + value * 0.3) : Math.round(value);
}

async function executeSequentialFailover(options = {}) {
  const {
    candidates = [],
    runAttempt,
    signal,
    onStatus = () => {},
    now = Date.now,
  } = options;
  if (typeof runAttempt !== "function") throw new TypeError("Canvas Agent runAttempt must be a function.");
  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  const startedAt = now();
  const failures = [];
  for (let index = 0; index < candidates.length; index += 1) {
    if (signal?.aborted) throw makeCancelledError();
    const remainingMs = policy.totalTimeoutMs - (now() - startedAt);
    if (remainingMs <= 0) break;
    const candidate = candidates[index];
    if (index > 0) onStatus({ stage: "recovering" });
    try {
      return await runAttempt(candidate, {
        signal,
        policy: {
          ...policy,
          attemptTimeoutMs: Math.max(1, Math.min(policy.attemptTimeoutMs, remainingMs)),
        },
      });
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError" && error?.cancelledByUser) throw makeCancelledError();
      if (!shouldFailoverAgentError(error)) throw error;
      failures.push({
        candidateId: String(candidate?.id || ""),
        category: classifyAgentRouteError(error),
        error,
      });
    }
  }
  const aggregate = new Error("所有可用服务暂时不可用，任务已保存，请稍后重试。");
  aggregate.name = "CanvasAgentUnavailableError";
  aggregate.category = "unavailable";
  aggregate.failures = failures;
  throw aggregate;
}

function makeCancelledError() {
  const error = new Error("Canvas Agent request was cancelled.");
  error.name = "AbortError";
  error.category = "cancelled";
  error.cancelledByUser = true;
  return error;
}

module.exports = {
  DEFAULT_POLICY,
  getProviderTaskRequirements,
  normalizeAgentRouting,
  normalizeAgentBaseUrl,
  normalizeModelAdapterId,
  normalizeAgentCandidate,
  getRequiredAgentCapabilities,
  buildAgentCandidates,
  rankAgentCandidates,
  orderAgentCandidatesByEndpointDiversity,
  getAdaptiveAgentAttemptPolicy,
  isAgentRouteHalfOpen,
  classifyAgentRouteError,
  formatAgentVerificationError,
  shouldFailoverAgentError,
  updateAgentRouteHealth,
  executeSequentialFailover,
};
