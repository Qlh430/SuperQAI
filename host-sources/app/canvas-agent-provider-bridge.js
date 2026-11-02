"use strict";

const crypto = require("node:crypto");
const { getProviderTaskRequirements } = require("./canvas-agent-router");

function normalizeToolArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeToolCalls(toolCalls) {
  return (Array.isArray(toolCalls) ? toolCalls : []).map((toolCall, index) => ({
    call_id: String(toolCall?.id || toolCall?.call_id || `call_${index + 1}`),
    name: String(toolCall?.name || toolCall?.function?.name || ""),
    arguments: normalizeToolArguments(toolCall?.arguments ?? toolCall?.function?.arguments),
  })).filter((toolCall) => toolCall.name);
}

function createCanvasAgentProviderBridge({ executor } = {}) {
  if (!executor || typeof executor.stream !== "function") {
    throw new TypeError("Canvas Agent Provider bridge requires an executor with stream().");
  }

  async function runTurn(input = {}) {
    const requirements = getProviderTaskRequirements({ needsVision: Boolean(input.needsVision) });
    if (!requirements.mustAll.includes("llm.chat.vision")) requirements.mustAll.push("llm.chat.vision");

    const request = {
      intent: requirements.intent,
      mustAll: requirements.mustAll,
      preferredProviderId: String(input.providerId || "").trim(),
      preferredModelId: String(input.modelId || "").trim(),
      candidateOrder: Array.isArray(input.candidateOrder) ? input.candidateOrder : [],
      forceFallback: input.forceFallback === true,
      input: (() => {
        const tools = Array.isArray(input.tools) ? input.tools.filter(Boolean) : [];
        return {
          messages: Array.isArray(input.messages) ? input.messages : [],
          system: String(input.system || ""),
          tools,
          // Strict gateways reject `tool_choice` when no tools are sent, so an
          // empty tool list must not fall back to "auto".
          toolChoice: tools.length ? (input.toolChoice || "auto") : "",
        };
      })(),
      params: {
        max_tokens: 4096,
        ...(input.params && typeof input.params === "object" ? input.params : {}),
      },
      options: {
        ...(input.options && typeof input.options === "object" ? input.options : {}),
        signal: input.signal,
      },
      onAttemptFailure: input.onAttemptFailure,
    };

    const result = await executor.stream(request, input.onDelta);
    return {
      turn: {
        response_id: String(result?.responseId || `agent_${crypto.randomUUID()}`),
        message: String(result?.text || ""),
        ...(result?.reasoningContent
          ? { reasoning_content: String(result.reasoningContent) }
          : {}),
        tool_calls: normalizeToolCalls(result?.toolCalls),
        usage: result?.usage || null,
      },
      selection: result?.selection || null,
      attempts: Array.isArray(result?.attempts) ? result.attempts : [],
    };
  }

  return Object.freeze({ runTurn });
}

module.exports = {
  createCanvasAgentProviderBridge,
  normalizeToolArguments,
  normalizeToolCalls,
};
