"use strict";

function redact(value, secrets = []) {
  let text = String(value || "").slice(0, 2_000);
  for (const secret of secrets.map(String).filter(Boolean)) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|pk|key)-[A-Za-z0-9._-]{4,}/gi, "[REDACTED]");
}

function selectionSummary(candidate) {
  return {
    providerId: candidate.provider.id,
    providerName: candidate.provider.name,
    modelId: candidate.model.id,
    modelName: candidate.model.displayName || candidate.model.id,
    reason: candidate.reason || "administrator-order",
  };
}

function safeFailure(error, candidate) {
  const safeMessage = redact(error?.safeMessage || error?.message || "上游服务不可用。", [
    candidate.provider.apiKey,
    candidate.provider.api_key,
    candidate.provider.walletKey,
    candidate.provider.wallet_api_key,
  ]);
  return {
    providerId: candidate.provider.id,
    modelId: candidate.model.id,
    code: String(error?.code || "UPSTREAM_UNAVAILABLE"),
    retryable: error?.retryable !== false,
    safeMessage,
  };
}

function safeExecutionError(error, candidate, attempts, emitted = false) {
  const failure = safeFailure(error, candidate);
  const wrapped = new Error(failure.safeMessage);
  wrapped.name = String(error?.name || "ProviderExecutionError");
  wrapped.code = failure.code;
  wrapped.providerId = failure.providerId;
  wrapped.modelId = failure.modelId;
  wrapped.retryable = failure.retryable;
  wrapped.safeMessage = failure.safeMessage;
  wrapped.attempts = [...attempts, failure];
  if (error?.stage) wrapped.stage = String(error.stage);
  if (emitted) wrapped.emitted = true;
  return wrapped;
}

function requestQuery(request = {}) {
  return {
    intent: request.intent,
    mustAll: request.mustAll,
    anyOf: request.anyOf,
    preferredProviderId: request.preferredProviderId,
    preferredModelId: request.preferredModelId,
  };
}

function shouldStopFallback(error) {
  return error?.name === "AbortError"
    || error?.code === "REQUEST_ABORTED"
    || error?.retryable === false;
}

function createProviderExecutor({ resolver, engine } = {}) {
  if (!resolver || typeof resolver.listCandidates !== "function" || typeof resolver.getAutoFallback !== "function") {
    throw new TypeError("Provider Executor requires a compatible Capability Resolver.");
  }
  if (!engine || typeof engine.execute !== "function" || typeof engine.stream !== "function" || typeof engine.executeWithTools !== "function") {
    throw new TypeError("Provider Executor requires a compatible Protocol Engine.");
  }

  function candidatesFor(request) {
    const candidates = resolver.listCandidates(requestQuery(request));
    const pinned = Boolean(request?.preferredProviderId || request?.preferredModelId);
    if (!candidates.length) resolver.resolve(requestQuery(request));
    return {
      pinned,
      candidates: pinned || !resolver.getAutoFallback() ? candidates.slice(0, 1) : candidates,
    };
  }

  async function execute(request = {}) {
    const { candidates } = candidatesFor(request);
    const attempts = [];
    for (const candidate of candidates) {
      try {
        const result = await engine.execute(
          candidate.provider,
          candidate.model,
          request.intent,
          request.input || {},
          request.params || {},
          request.options || {},
        );
        return { ...result, selection: selectionSummary(candidate), attempts };
      } catch (error) {
        const wrapped = safeExecutionError(error, candidate, attempts);
        attempts.push(wrapped.attempts.at(-1));
        if (shouldStopFallback(wrapped) || candidate === candidates.at(-1)) throw wrapped;
        request.onAttemptFailure?.(attempts.at(-1));
      }
    }
    throw new Error("没有可执行的模型候选项。");
  }

  async function stream(request = {}, onDelta) {
    const { candidates } = candidatesFor(request);
    const attempts = [];
    for (const candidate of candidates) {
      let emitted = false;
      try {
        const result = await engine.stream(
          candidate.provider,
          candidate.model,
          request.intent,
          request.input || {},
          request.params || {},
          (event) => {
            if (event?.type !== "done") emitted = true;
            onDelta?.(event);
          },
          request.options || {},
        );
        return { ...result, selection: selectionSummary(candidate), attempts };
      } catch (error) {
        const wrapped = safeExecutionError(error, candidate, attempts, emitted);
        attempts.push(wrapped.attempts.at(-1));
        if (shouldStopFallback(wrapped) || emitted || candidate === candidates.at(-1)) throw wrapped;
        request.onAttemptFailure?.(attempts.at(-1));
      }
    }
    throw new Error("没有可执行的模型候选项。");
  }

  async function executeWithTools(request = {}, tools = []) {
    const { candidates } = candidatesFor(request);
    const attempts = [];
    for (const candidate of candidates) {
      try {
        const input = request.input || {};
        const result = await engine.executeWithTools(
          candidate.provider,
          candidate.model,
          input.messages || [],
          input.system || "",
          tools,
          request.options || {},
        );
        return { ...result, selection: selectionSummary(candidate), attempts };
      } catch (error) {
        const wrapped = safeExecutionError(error, candidate, attempts);
        attempts.push(wrapped.attempts.at(-1));
        if (shouldStopFallback(wrapped) || candidate === candidates.at(-1)) throw wrapped;
        request.onAttemptFailure?.(attempts.at(-1));
      }
    }
    throw new Error("没有可执行的模型候选项。");
  }

  return Object.freeze({ execute, stream, executeWithTools });
}

module.exports = {
  createProviderExecutor,
};
