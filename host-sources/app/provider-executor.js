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
    ...(error?.fallbackAllowed === true ? { fallbackAllowed: true } : {}),
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
  if (failure.fallbackAllowed) wrapped.fallbackAllowed = true;
  wrapped.safeMessage = failure.safeMessage;
  wrapped.attempts = [...attempts, failure];
  if (error?.stage) wrapped.stage = String(error.stage);
  if (["not_submitted", "unknown", "submitted"].includes(error?.submissionState)) wrapped.submissionState = error.submissionState;
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
    candidateOrder: request.candidateOrder,
  };
}

function reasoningReplayFailure(error) {
  return /reasoning_content|thinking mode/i.test(String(
    error?.safeMessage || error?.message || error || "",
  ));
}

function contentAsText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");
  return content
    .map((part) => typeof part === "string" ? part : part?.text || part?.input_text || "")
    .filter(Boolean)
    .join("\n");
}

/**
 * Thinking gateways tie assistant reasoning state to the exact model that
 * produced it. When a tool turn is retried after a model switch, replaying the
 * previous model's native reasoning/tool history is invalid. Keep the useful
 * text and tool results, but remove provider-private continuation state.
 */
function flattenToolHistory(input = {}) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  return {
    ...input,
    messages: messages.flatMap((message) => {
      const role = String(message?.role || "").toLowerCase();
      if (role === "assistant") {
        const content = contentAsText(message.content);
        const callLines = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
          .map((call) => {
            const name = String(call?.function?.name || call?.name || "").trim();
            if (!name) return "";
            const args = typeof call?.function?.arguments === "string"
              ? call.function.arguments
              : JSON.stringify(call?.arguments ?? call?.function?.arguments ?? {});
            return `[历史工具调用] ${name} ${args}`;
          })
          .filter(Boolean);
        const flattened = [content, ...callLines].filter(Boolean).join("\n");
        return flattened ? [{ role: "assistant", content: flattened }] : [];
      }
      if (role === "tool") {
        const callId = String(message.tool_call_id || message.call_id || "").trim();
        const content = contentAsText(message.content);
        return callId || content
          ? [{ role: "user", content: `[工具结果${callId ? ` ${callId}` : ""}]\n${content}` }]
          : [];
      }
      return [message];
    }),
  };
}

function shouldStopFallback(error) {
  return error?.name === "AbortError"
    || error?.code === "REQUEST_ABORTED"
    || ["unknown", "submitted"].includes(error?.submissionState)
    || (error?.retryable === false && error?.fallbackAllowed !== true);
}

function createProviderExecutor({ resolver, engine, onAttemptResult = null } = {}) {
  if (!resolver || typeof resolver.listCandidates !== "function" || typeof resolver.getAutoFallback !== "function") {
    throw new TypeError("Provider Executor requires a compatible Capability Resolver.");
  }
  if (!engine || typeof engine.execute !== "function" || typeof engine.stream !== "function" || typeof engine.executeWithTools !== "function") {
    throw new TypeError("Provider Executor requires a compatible Protocol Engine.");
  }

  function reportAttempt(candidate, request, startedAt, success, error = null) {
    if (typeof onAttemptResult !== "function") return;
    try {
      onAttemptResult({
        provider: candidate.provider,
        model: candidate.model,
        intent: request.intent,
        success,
        latencyMs: Math.max(0, Date.now() - startedAt),
        error,
      });
    } catch {
      // Monitoring must never change the result of a provider request.
    }
  }

  function candidatesFor(request) {
    const candidates = resolver.listCandidates(requestQuery(request));
    const pinned = Boolean(request?.preferredProviderId || request?.preferredModelId);
    if (!candidates.length) resolver.resolve(requestQuery(request));
    return {
      pinned,
      candidates: pinned || (!request?.forceFallback && !resolver.getAutoFallback()) ? candidates.slice(0, 1) : candidates,
    };
  }

  async function execute(request = {}) {
    const { candidates } = candidatesFor(request);
    const attempts = [];
    for (const candidate of candidates) {
      const startedAt = Date.now();
      let attemptInput = request.input || {};
      let reasoningRetried = false;
      try {
        while (true) {
          try {
            const result = await engine.execute(
              candidate.provider,
              candidate.model,
              request.intent,
              attemptInput,
              request.params || {},
              request.options || {},
            );
            reportAttempt(candidate, request, startedAt, true);
            return { ...result, selection: selectionSummary(candidate), attempts };
          } catch (error) {
            if (!reasoningRetried && reasoningReplayFailure(error)) {
              reasoningRetried = true;
              attemptInput = flattenToolHistory(attemptInput);
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        const wrapped = safeExecutionError(error, candidate, attempts);
        reportAttempt(candidate, request, startedAt, false, wrapped);
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
      const startedAt = Date.now();
      let attemptInput = request.input || {};
      let reasoningRetried = false;
      try {
        while (true) {
          try {
            const result = await engine.stream(
              candidate.provider,
              candidate.model,
              request.intent,
              attemptInput,
              request.params || {},
              (event) => {
                if (event?.type !== "done") emitted = true;
                onDelta?.(event);
              },
              request.options || {},
            );
            reportAttempt(candidate, request, startedAt, true);
            return { ...result, selection: selectionSummary(candidate), attempts };
          } catch (error) {
            if (!emitted && !reasoningRetried && reasoningReplayFailure(error)) {
              reasoningRetried = true;
              attemptInput = flattenToolHistory(attemptInput);
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        const wrapped = safeExecutionError(error, candidate, attempts, emitted);
        reportAttempt(candidate, request, startedAt, false, wrapped);
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
      const startedAt = Date.now();
      let attemptInput = request.input || {};
      let reasoningRetried = false;
      try {
        while (true) {
          try {
            const result = await engine.executeWithTools(
              candidate.provider,
              candidate.model,
              attemptInput.messages || [],
              attemptInput.system || "",
              tools,
              request.options || {},
            );
            reportAttempt(candidate, request, startedAt, true);
            return { ...result, selection: selectionSummary(candidate), attempts };
          } catch (error) {
            if (!reasoningRetried && reasoningReplayFailure(error)) {
              reasoningRetried = true;
              attemptInput = flattenToolHistory(attemptInput);
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        const wrapped = safeExecutionError(error, candidate, attempts);
        reportAttempt(candidate, request, startedAt, false, wrapped);
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
