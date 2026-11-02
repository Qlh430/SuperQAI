"use strict";

const CanvasAgentRuntime = require("./canvas-agent-runtime");

const REQUIRED_METHODS = Object.freeze([
  "buildRequest",
  "getEndpoint",
  "getHeaders",
  "parseResponse",
  "consumeStream",
  "buildToolProbe",
  "buildVisionProbe",
]);

const CONNECTOR_ALIASES = Object.freeze({
  responses: "openai-responses",
  "openai-response": "openai-responses",
  "openai-responses": "openai-responses",
  chat: "openai-chat",
  "chat-completions": "openai-chat",
  "openai-chat-completions": "openai-chat",
  "openai-chat": "openai-chat",
});

const registry = new Map();

function normalizeLlmConnectorId(value, fallbackProtocol = "") {
  const raw = String(value || fallbackProtocol || "responses").trim().toLowerCase();
  return CONNECTOR_ALIASES[raw] || raw;
}

function registerLlmConnector(input, options = {}) {
  if (!input || typeof input !== "object") throw new TypeError("Canvas Agent LLM Connector must be an object.");
  const id = normalizeLlmConnectorId(input.id);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw new TypeError(`Canvas Agent LLM Connector has an invalid id: ${id || "(empty)"}.`);
  }
  REQUIRED_METHODS.forEach((method) => {
    if (typeof input[method] !== "function") {
      throw new TypeError(`Canvas Agent LLM Connector ${id} requires ${method}().`);
    }
  });
  if (registry.has(id) && options.replace !== true) {
    throw new Error(`Canvas Agent LLM Connector ${id} is already registered.`);
  }
  const connector = Object.freeze({
    ...input,
    id,
    protocol: String(input.protocol || id).trim().toLowerCase(),
    capabilities: Object.freeze([...new Set((Array.isArray(input.capabilities) ? input.capabilities : [])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean))]),
  });
  registry.set(id, connector);
  return connector;
}

function getLlmConnector(id) {
  const normalizedId = normalizeLlmConnectorId(id);
  const connector = registry.get(normalizedId);
  if (connector) return connector;
  const error = new Error(`Canvas Agent LLM Connector is not registered: ${normalizedId || "(empty)"}.`);
  error.code = "INVALID_AGENT_CONNECTOR";
  throw error;
}

function resolveLlmConnector(candidate = {}) {
  return getLlmConnector(candidate.connectorId || candidate.adapterId || candidate.adapter || candidate.protocol || "responses");
}

function listLlmConnectors() {
  return [...registry.values()];
}

function getOpenAiHeaders(candidate = {}) {
  return {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${String(candidate.apiKey || "")}`,
  };
}

function buildResponsesToolProbe({ model, prompt, tool }) {
  const functionTool = {
    type: "function",
    ...tool,
  };
  return {
    model: String(model || ""),
    input: [{
      role: "user",
      content: [{ type: "input_text", text: String(prompt || "") }],
    }],
    // OpenAI-compatible Responses gateways require this discriminator too.
    // Without it, some return: "Unsupported tool type: None".
    tools: [functionTool],
    tool_choice: { type: "function", name: String(functionTool.name || "") },
    max_output_tokens: 128,
    reasoning: { effort: "low" },
  };
}

function buildResponsesVisionProbe({ model, prompt, imageUrl }) {
  return {
    model: String(model || ""),
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: String(prompt || "") },
        { type: "input_image", image_url: String(imageUrl || "") },
      ],
    }],
    max_output_tokens: 64,
    reasoning: { effort: "low" },
  };
}

function buildChatToolProbe({ model, prompt, tool }) {
  return {
    model: String(model || ""),
    messages: [{ role: "user", content: String(prompt || "") }],
    tools: [{ type: "function", function: tool }],
    tool_choice: { type: "function", function: { name: String(tool?.name || "") } },
    max_tokens: 128,
  };
}

function buildChatVisionProbe({ model, prompt, imageUrl }) {
  return {
    model: String(model || ""),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: String(prompt || "") },
        { type: "image_url", image_url: { url: String(imageUrl || "") } },
      ],
    }],
    max_tokens: 64,
  };
}

registerLlmConnector({
  id: "openai-responses",
  protocol: "responses",
  capabilities: ["text", "vision", "tools", "streaming"],
  buildRequest: (payload, options) => CanvasAgentRuntime.buildResponsesRequest(payload, options),
  getEndpoint: (candidate = {}) => String(candidate.responsesUrl || `${String(candidate.baseUrl || "").replace(/\/+$/, "")}/responses`),
  getHeaders: getOpenAiHeaders,
  parseResponse: (data) => CanvasAgentRuntime.extractResponsesTurn(data),
  consumeStream: (stream, callbacks) => CanvasAgentRuntime.consumeResponsesStream(stream, callbacks),
  buildToolProbe: buildResponsesToolProbe,
  buildVisionProbe: buildResponsesVisionProbe,
});

registerLlmConnector({
  id: "openai-chat",
  protocol: "chat",
  capabilities: ["text", "vision", "tools", "streaming"],
  buildRequest: (payload, options) => CanvasAgentRuntime.buildChatCompletionsRequest(payload, options),
  getEndpoint: (candidate = {}) => String(candidate.chatCompletionsUrl || `${String(candidate.baseUrl || "").replace(/\/+$/, "")}/chat/completions`),
  getHeaders: getOpenAiHeaders,
  parseResponse: (data) => CanvasAgentRuntime.extractChatCompletionsTurn(data),
  consumeStream: (stream, callbacks) => CanvasAgentRuntime.consumeChatCompletionsStream(stream, callbacks),
  buildToolProbe: buildChatToolProbe,
  buildVisionProbe: buildChatVisionProbe,
});

module.exports = Object.freeze({
  REQUIRED_METHODS,
  normalizeLlmConnectorId,
  registerLlmConnector,
  getLlmConnector,
  resolveLlmConnector,
  listLlmConnectors,
});
