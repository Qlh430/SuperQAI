"use strict";

const { createProxyAwareFetch } = require("./outbound-fetch");
const { createProtocolRegistry, joinProtocolUrl } = require("./provider-protocol-registry");
const { providerHasHost, geminiImageConfig, serializedImages, usesGenerationImageEdit, normalizeImageResultData } = require("./media-image-contract");
const { isQuotaRejection } = require("./provider-response-errors");

const DEFAULT_TIMEOUTS = Object.freeze({
  connectTimeoutMs: 20_000,
  firstEventTimeoutMs: 45_000,
  totalTimeoutMs: 120_000,
});

class ProtocolEngineError extends Error {
  constructor({ code, providerId = "", modelId = "", retryable = false, fallbackAllowed = false, safeMessage, stage = "" }) {
    super(safeMessage);
    this.name = "ProtocolEngineError";
    this.code = code;
    this.providerId = providerId;
    this.modelId = modelId;
    this.retryable = Boolean(retryable);
    if (fallbackAllowed) this.fallbackAllowed = true;
    this.safeMessage = safeMessage;
    if (stage) this.stage = stage;
  }
}

function positiveTimeout(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function timeoutCause(stage) {
  const error = new Error(`Upstream ${stage} timeout`);
  error.code = "PROTOCOL_ENGINE_TIMEOUT";
  error.stage = stage;
  return error;
}

function truncate(value, maxLength = 2_000) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function redact(value, secrets = []) {
  let text = truncate(value);
  for (const secret of secrets.map(String).filter(Boolean)) {
    text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|pk|key)-[A-Za-z0-9._-]{4,}/gi, "[REDACTED]")
    .replace(/("?(?:api[_-]?key|wallet[_-]?key|authorization)"?\s*[:=]\s*")([^"]+)(")/gi, "$1[REDACTED]$3");
}

function errorForStatus(status, detail, provider, model) {
  const numericStatus = Number(status || 0);
  const quotaRejected = isQuotaRejection(numericStatus, detail);
  // Moderation rejections are about the request content, not the account or the
  // platform, so another candidate must not be asked to produce the same output.
  const contentRejected = /content[_ -]?policy|content[_ -]?filter|moderation|safety[_ -]?system|blocked by|敏感|违规|内容安全/i
    .test(String(detail || ""));
  let code = "UPSTREAM_PROTOCOL";
  let retryable = false;
  if ([401, 403].includes(numericStatus)) code = "UPSTREAM_AUTH";
  else if (numericStatus === 429) {
    code = "UPSTREAM_RATE_LIMIT";
    retryable = true;
  } else if (numericStatus >= 500 || numericStatus === 408) {
    code = "UPSTREAM_UNAVAILABLE";
    retryable = true;
  }
  const safeDetail = redact(detail, [provider?.apiKey, provider?.api_key, provider?.walletKey, provider?.wallet_api_key]);
  return new ProtocolEngineError({
    code: quotaRejected ? "UPSTREAM_QUOTA_EXHAUSTED" : code,
    providerId: String(provider?.id || ""),
    modelId: modelIdOf(model),
    retryable: quotaRejected ? false : retryable,
    // A received 4xx response is a definitive rejection: the provider never
    // accepted the request, so another configured candidate may still serve
    // the turn — unless the rejection was about the content itself. Transport
    // failures keep their own unknown-submission handling.
    fallbackAllowed: quotaRejected || (!contentRejected && numericStatus >= 400 && numericStatus < 500),
    safeMessage: `上游服务返回 HTTP ${numericStatus}${safeDetail ? `：${safeDetail}` : ""}`,
  });
}

function normalizeError(error, provider, model, options = {}) {
  if (error instanceof ProtocolEngineError) return error;
  if (error?.code === "PROTOCOL_ENGINE_TIMEOUT") {
    return new ProtocolEngineError({
      code: "UPSTREAM_TIMEOUT",
      providerId: String(provider?.id || ""),
      modelId: modelIdOf(model),
      retryable: true,
      stage: error.stage || "total",
      safeMessage: `上游服务${error.stage === "connect" ? "连接" : error.stage === "first-event" ? "首个事件" : "总请求"}超时。`,
    });
  }
  if (error?.name === "AbortError" || error?.code === "REQUEST_ABORTED") {
    const aborted = new ProtocolEngineError({
      code: "REQUEST_ABORTED",
      providerId: String(provider?.id || ""),
      modelId: modelIdOf(model),
      retryable: false,
      safeMessage: "请求已取消。",
    });
    aborted.name = "AbortError";
    aborted.cancelledByUser = true;
    if (["not_submitted", "unknown", "submitted"].includes(error?.submissionState)) aborted.submissionState = error.submissionState;
    return aborted;
  }
  const detail = redact(error?.safeMessage || error?.message || "上游服务不可用", [provider?.apiKey, provider?.api_key, provider?.walletKey, provider?.wallet_api_key]);
  const explicitCode = String(error?.code || "").trim();
  const requestIntent = String(options.intent || error?.intent || "").trim();
  const serviceLabel = requestIntent.startsWith("image.") ? "图片服务" : "模型服务";
  return Object.assign(new ProtocolEngineError({
    code: error?.submissionState === "not_submitted" ? "UPSTREAM_NOT_SUBMITTED" : explicitCode || "UPSTREAM_UNAVAILABLE",
    providerId: String(provider?.id || ""),
    modelId: modelIdOf(model),
    retryable: error?.retryable !== false,
    fallbackAllowed: error?.fallbackAllowed === true,
    stage: String(error?.stage || ""),
    safeMessage: error?.submissionState === "not_submitted"
      ? `未能连接${serviceLabel}，请求尚未提交；请检查 API 地址和网络线路后重试。（${String(error?.stage || "connect")}）`
      : detail || "上游服务不可用。",
  }), ["not_submitted", "unknown", "submitted"].includes(error?.submissionState) ? { submissionState: error.submissionState } : {});
}

function modelIdOf(model) {
  return String(typeof model === "string"
    ? model
    : model?.metadata?.upstreamModel || model?.id || model?.model || model?.name || "").trim();
}

// Some OpenAI-compatible gateways reject function tools unless the request
// pins `reasoning_effort: "none"` (APIMart's gpt-5.6-terra does exactly that).
// Remembering the pair lets later turns send the accepted shape immediately.
const toolReasoningNoneKeys = new Set();

function toolReasoningKey(provider, model) {
  return `${String(provider?.id || "")}\n${modelIdOf(model)}`;
}

function requiresToolReasoningNone(detail) {
  const text = String(detail || "");
  return /reasoning[_ ]effort/i.test(text) && /\bnone\b/i.test(text);
}

function needsToolReasoningNone(provider, model, input) {
  return Boolean(
    Array.isArray(input?.tools)
    && input.tools.length
    && toolReasoningNoneKeys.has(toolReasoningKey(provider, model)),
  );
}

// A non-streaming request whose reply nevertheless arrives as Server-Sent
// Events still has to be decoded: relays such as APIMart's chat gateway switch
// to SSE whenever the `stream` field is absent.
const STREAM_KIND_BY_PARSE = Object.freeze({
  "openai-chat": "openai-sse",
  "openai-responses": "responses-sse",
  "anthropic-message": "anthropic-sse",
  "anthropic-messages": "anthropic-sse",
  "gemini-content": "gemini-sse",
});

function eventStreamKindFor(request, response, text) {
  if (request?.stream) return request.stream;
  if (!(parseKindForStream(request?.parse))) return "";
  const contentType = String(response?.headers?.get?.("content-type") || "");
  const head = String(text || "").slice(0, 200);
  const looksLikeEvents = /text\/event-stream/i.test(contentType) || /^\s*(?:event:|data:)/i.test(head);
  return looksLikeEvents ? parseKindForStream(request?.parse) : "";
}

function parseKindForStream(parse) {
  return STREAM_KIND_BY_PARSE[String(parse || "")] || "";
}

function streamToolCalls(state) {
  return [...state.toolMap.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call], index) => ({
      id: call.id || `call-${index + 1}`,
      name: call.name,
      arguments: call.arguments,
    }))
    .filter((call) => call.name);
}

function providerBaseUrl(provider) {
  return String(provider?.baseUrl || provider?.base_url || "").trim();
}

function providerApiKey(provider) {
  return String(provider?.apiKey || provider?.api_key || "").trim();
}

function providerCredential(provider, reference = "api_key") {
  return reference === "wallet_key"
    ? String(provider?.walletKey || provider?.wallet_api_key || "").trim()
    : providerApiKey(provider);
}

function addDefined(target, source, blocked = []) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value !== undefined && !blocked.includes(key)) target[key] = value;
  }
  return target;
}

function addAllowed(target, source, allowed = []) {
  const keys = new Set(allowed);
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null) target[key] = value;
  }
  return target;
}

function normalizedMessages(input = {}) {
  if (Array.isArray(input.messages) && input.messages.length) {
    return input.messages.map((message) => {
      const copy = { ...message };
      // Replaying an assistant turn that called no tools has to omit the field
      // entirely. Strict gateways answer `Invalid 'messages[N].tool_calls':
      // empty array.` when an empty array is sent instead.
      if (Array.isArray(copy.tool_calls) && !copy.tool_calls.filter(Boolean).length) delete copy.tool_calls;
      return copy;
    });
  }
  return [{ role: "user", content: String(input.prompt || "ping") }];
}

function contentAsText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");
  return content
    .map((part) => typeof part === "string" ? part : part?.text || part?.input_text || "")
    .filter(Boolean)
    .join("\n");
}

function withSystemMessage(messages, system) {
  if (!system || messages.some((message) => message.role === "system")) return messages;
  return [{ role: "system", content: system }, ...messages];
}

function openAiToolsToAnthropic(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool) => {
    const definition = tool?.function || tool;
    return {
      name: definition?.name,
      description: definition?.description,
      input_schema: definition?.parameters || definition?.input_schema || { type: "object", properties: {} },
    };
  }).filter((tool) => tool.name);
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function chatContentToAnthropic(content) {
  if (!Array.isArray(content)) return content;
  return content.flatMap((part) => {
    if (typeof part === "string") return [{ type: "text", text: part }];
    if (part?.type === "text" || part?.type === "input_text") {
      return [{ type: "text", text: String(part.text || part.input_text || "") }];
    }
    const imageUrl = part?.image_url?.url || part?.image_url || (part?.type === "input_image" ? part?.url : "");
    if (imageUrl) {
      const data = String(imageUrl).match(/^data:([^;]+);base64,(.+)$/);
      return [{
        type: "image",
        source: data
          ? { type: "base64", media_type: data[1], data: data[2] }
          : { type: "url", url: String(imageUrl) },
      }];
    }
    return [part];
  });
}

function chatMessagesToAnthropic(messages) {
  return (Array.isArray(messages) ? messages : []).filter((message) => message?.role !== "system").map((message) => {
    if (message?.role === "tool") {
      return {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: String(message.tool_call_id || message.call_id || ""),
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null),
        }],
      };
    }
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (message?.role === "assistant" && toolCalls.length) {
      const content = [];
      if (message.content) {
        const textParts = chatContentToAnthropic(message.content);
        content.push(...(Array.isArray(textParts) ? textParts : [{ type: "text", text: String(textParts) }]));
      }
      for (const toolCall of toolCalls) {
        const definition = toolCall?.function || toolCall;
        const id = String(toolCall?.id || toolCall?.call_id || "").trim();
        const name = String(definition?.name || "").trim();
        if (id && name) content.push({ type: "tool_use", id, name, input: parseJsonObject(definition?.arguments) });
      }
      return { role: "assistant", content };
    }
    return {
      role: message?.role === "assistant" ? "assistant" : "user",
      content: chatContentToAnthropic(message?.content),
    };
  });
}

function geminiParts(content) {
  if (!Array.isArray(content)) return [{ text: contentAsText(content) }];
  const parts = [];
  for (const part of content) {
    if (typeof part === "string") parts.push({ text: part });
    else if (part?.type === "text" || part?.type === "input_text") parts.push({ text: String(part.text || part.input_text || "") });
    else if (part?.inlineData || part?.inline_data) parts.push({ inlineData: part.inlineData || part.inline_data });
    else if (part?.image_url?.url?.startsWith("data:")) {
      const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  }
  return parts.length ? parts : [{ text: "" }];
}

function openAiToolsToResponses(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool) => {
    const definition = tool?.function || tool;
    const output = {
      type: "function",
      name: String(definition?.name || ""),
    };
    if (definition?.description !== undefined) output.description = definition.description;
    if (definition?.parameters !== undefined) output.parameters = definition.parameters;
    if (definition?.strict !== undefined) output.strict = definition.strict;
    return output;
  }).filter((tool) => tool.name);
}

function chatContentToResponses(content) {
  if (!Array.isArray(content)) return content;
  return content.flatMap((part) => {
    if (typeof part === "string") return [{ type: "input_text", text: part }];
    if (part?.type === "text" || part?.type === "input_text") {
      return [{ type: "input_text", text: String(part.text || part.input_text || "") }];
    }
    if (part?.type === "image_url" || part?.type === "input_image") {
      const imageUrl = part?.image_url?.url || part?.image_url || part?.url;
      return imageUrl ? [{ type: "input_image", image_url: String(imageUrl) }] : [];
    }
    return [part];
  });
}

function chatMessagesToResponses(messages) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    if (message?.role === "system") return [];
    if (message?.role === "tool") {
      const callId = String(message.tool_call_id || message.call_id || "").trim();
      return callId ? [{
        type: "function_call_output",
        call_id: callId,
        output: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null),
      }] : [];
    }

    const output = [];
    if (message?.content !== undefined && message.content !== null && message.content !== "") {
      output.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: chatContentToResponses(message.content),
      });
    }
    if (message?.role === "assistant") {
      for (const toolCall of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        const definition = toolCall?.function || toolCall;
        const callId = String(toolCall?.id || toolCall?.call_id || "").trim();
        const name = String(definition?.name || "").trim();
        if (!callId || !name) continue;
        output.push({
          type: "function_call",
          call_id: callId,
          name,
          arguments: typeof definition?.arguments === "string"
            ? definition.arguments
            : JSON.stringify(definition?.arguments || {}),
        });
      }
    }
    return output;
  });
}

function imageUploadPart(value, index) {
  if (value?.blob instanceof Blob) {
    return { blob: value.blob, filename: String(value.filename || `image-${index + 1}.png`) };
  }
  if (value instanceof Blob) return { blob: value, filename: `image-${index + 1}.png` };
  const source = typeof value === "string"
    ? value
    : String(value?.data || value?.b64_json || value?.url || "");
  const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("Image edit input must be a Blob or base64 data URL prepared by the media bridge.");
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const extension = match[1].split("/").pop()?.replace(/[^a-z0-9]/gi, "") || "png";
  return {
    blob: new Blob([bytes], { type: match[1] }),
    filename: String(value?.filename || `image-${index + 1}.${extension}`),
  };
}

function buildOpenAiImageEditBody(modelId, input = {}, params = {}) {
  const images = Array.isArray(input.inputImages) ? input.inputImages : [];
  if (!images.length) throw new Error("Image edit requires at least one prepared input image.");
  const form = new FormData();
  form.append("model", modelId);
  form.append("prompt", String(input.prompt || ""));
  Object.entries(openAiImageParams(params)).forEach(([key, value]) => {
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  images.forEach((value, index) => {
    const image = imageUploadPart(value, index);
    form.append("image", image.blob, image.filename);
  });
  if (input.mask) {
    const mask = imageUploadPart(input.mask, 0);
    form.append("mask", mask.blob, mask.filename);
  }
  return form;
}

const OPENAI_IMAGE_PARAM_KEYS = new Set([
  "size",
  "quality",
  "n",
  "response_format",
  "output_format",
  "output_compression",
  "background",
  "moderation",
  "user",
  "aspect_ratio",
  "image_size",
  "steps",
  "guidance_scale",
  "seed",
  "negative_prompt",
  "negativePrompt",
]);

const OPENAI_CHAT_PARAM_KEYS = Object.freeze([
  "temperature",
  "top_p",
  "max_tokens",
  "max_completion_tokens",
  "stop",
  "presence_penalty",
  "frequency_penalty",
  "seed",
  "response_format",
  "logprobs",
  "top_logprobs",
  "n",
  "parallel_tool_calls",
  "tool_choice",
  "user",
]);

const OPENAI_RESPONSES_PARAM_KEYS = Object.freeze([
  "temperature",
  "top_p",
  "max_output_tokens",
  "reasoning",
  "text",
  "truncation",
  "parallel_tool_calls",
  "tool_choice",
  "user",
]);

function openAiImageParams(params = {}) {
  const normalized = { ...(params && typeof params === "object" && !Array.isArray(params) ? params : {}) };
  if (normalized.negativePrompt !== undefined && normalized.negative_prompt === undefined) {
    normalized.negative_prompt = normalized.negativePrompt;
  }
  delete normalized.negativePrompt;
  return Object.fromEntries(Object.entries(normalized).filter(([key, value]) => (
    value !== undefined && value !== null && OPENAI_IMAGE_PARAM_KEYS.has(key)
  )));
}

function effectiveModelParams(model, params = {}) {
  const overrides = model?.metadata?.parameterOverrides;
  const defaults = overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
  return { ...defaults, ...(params && typeof params === "object" && !Array.isArray(params) ? params : {}) };
}

function buildBody(kind, modelId, input = {}, params = {}, stream = false) {
  const messages = normalizedMessages(input);
  if (kind === "openai-chat") {
    const body = { model: modelId, messages: withSystemMessage(messages, input.system) };
    addAllowed(body, params, OPENAI_CHAT_PARAM_KEYS);
    // `tools`, `tool_choice` and `parallel_tool_calls` are only valid together:
    // strict gateways answer `Invalid value for 'tool_choice': 'tool_choice' is
    // only allowed when 'tools' are specified.` when the field travels alone,
    // and reject an empty `tools` array outright.
    const tools = (Array.isArray(input.tools) ? input.tools : []).filter(Boolean);
    if (tools.length) {
      body.tools = tools;
      if (input.toolChoice !== undefined && input.toolChoice !== "") body.tool_choice = input.toolChoice;
    } else {
      delete body.tool_choice;
      delete body.parallel_tool_calls;
      delete body.tools;
    }
    if (stream) body.stream = true;
    return body;
  }
  if (kind === "openai-responses") {
    const body = { model: modelId, input: chatMessagesToResponses(messages) };
    const systemMessage = messages.find((message) => message.role === "system");
    const instructions = input.system || contentAsText(systemMessage?.content);
    if (instructions) body.instructions = instructions;
    const tools = openAiToolsToResponses(input.tools);
    if (tools.length) body.tools = tools;
    const maxOutputTokens = params.max_output_tokens ?? params.max_tokens ?? params.maxTokens;
    if (maxOutputTokens !== undefined) body.max_output_tokens = maxOutputTokens;
    if (params.reasoning !== undefined) body.reasoning = params.reasoning;
    else if (params.reasoning_effort !== undefined) body.reasoning = { effort: params.reasoning_effort };
    addAllowed(body, params, OPENAI_RESPONSES_PARAM_KEYS);
    // Same rule as the chat branch: tool fields never travel without tools.
    if (!tools.length) {
      delete body.tool_choice;
      delete body.parallel_tool_calls;
      delete body.tools;
    }
    if (params.maxTokens !== undefined && body.max_output_tokens === undefined) body.max_output_tokens = params.maxTokens;
    if (params.reasoning_effort !== undefined && params.reasoning === undefined) body.reasoning = { effort: params.reasoning_effort };
    if (stream) body.stream = true;
    return body;
  }
  if (kind === "anthropic-messages") {
    const systemMessage = messages.find((message) => message.role === "system");
    const body = {
      model: modelId,
      max_tokens: params.max_tokens ?? params.maxTokens ?? 1024,
      messages: chatMessagesToAnthropic(messages),
    };
    const system = input.system || contentAsText(systemMessage?.content);
    if (system) body.system = system;
    const tools = openAiToolsToAnthropic(input.tools);
    if (tools.length) body.tools = tools;
    addDefined(body, params, ["max_tokens", "maxTokens", "signal", "connectTimeoutMs", "firstEventTimeoutMs", "totalTimeoutMs"]);
    if (stream) body.stream = true;
    return body;
  }
  if (kind === "gemini-content" || kind === "gemini-image") {
    const systemMessage = messages.find((message) => message.role === "system");
    const mediaParts = kind === "gemini-image"
      ? [
        { text: String(input.prompt || "") },
        ...geminiParts((Array.isArray(input.inputImages) ? input.inputImages : []).map((image) => ({
          type: "image_url",
          image_url: { url: typeof image === "string" ? image : image?.data || image?.url || "" },
        }))).filter((part) => part.text || part.inlineData),
      ]
      : null;
    const body = {
      contents: mediaParts
        ? [{ role: "user", parts: mediaParts }]
        : messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: geminiParts(message.content) })),
    };
    const system = input.system || contentAsText(systemMessage?.content);
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (kind === "gemini-image") {
      body.generationConfig = { ...(params.generationConfig || {}), responseModalities: ["TEXT", "IMAGE"], imageConfig: geminiImageConfig(params) };
    } else if (params.generationConfig) body.generationConfig = params.generationConfig;
    return body;
  }
  if (kind === "openai-image-edit") return buildOpenAiImageEditBody(modelId, input, params);
  if (kind === "openai-image") {
    return addDefined({ model: modelId, prompt: String(input.prompt || "") }, openAiImageParams(params));
  }
  throw new Error(`未知请求体类型：${kind}`);
}

function buildAuthHeaders(definition, apiKey) {
  const auth = definition?.auth || { type: "none" };
  if (!apiKey || auth.type === "none") return {};
  if (auth.type === "bearer") return { [auth.header || "authorization"]: `${auth.prefix || "Bearer "}${apiKey}` };
  return { [auth.header || "x-api-key"]: apiKey };
}

function normalizedToolCalls(value) {
  return (Array.isArray(value) ? value : []).map((call, index) => ({
    id: String(call?.id || `call-${index + 1}`),
    name: String(call?.function?.name || call?.name || ""),
    arguments: typeof call?.function?.arguments === "string"
      ? call.function.arguments
      : typeof call?.arguments === "string" ? call.arguments : JSON.stringify(call?.input || call?.arguments || {}),
  })).filter((call) => call.name);
}

function parseResult(kind, payload) {
  if (kind === "openai-chat") {
    const message = payload?.choices?.[0]?.message || {};
    return {
      text: contentAsText(message.content || payload?.choices?.[0]?.text),
      reasoningContent: String(message.reasoning_content ?? message.reasoningContent ?? ""),
      usage: payload?.usage ?? null,
      toolCalls: normalizedToolCalls(message.tool_calls),
      responseId: String(payload?.id || ""),
      model: String(payload?.model || ""),
    };
  }
  if (kind === "openai-responses") {
    const output = Array.isArray(payload?.output) ? payload.output : [];
    const text = payload?.output_text || output.flatMap((item) => item?.content || []).map((part) => part?.text || part?.output_text || "").join("");
    const calls = output.filter((item) => item?.type === "function_call").map((item) => ({ id: item.call_id || item.id, name: item.name, arguments: item.arguments }));
    return {
      text: String(text || ""),
      usage: payload?.usage ?? null,
      toolCalls: normalizedToolCalls(calls),
      responseId: String(payload?.id || ""),
      model: String(payload?.model || ""),
    };
  }
  if (kind === "anthropic-message") {
    const blocks = Array.isArray(payload?.content) ? payload.content : [];
    const text = blocks.filter((block) => block?.type === "text").map((block) => block.text || "").join("");
    const calls = blocks.filter((block) => block?.type === "tool_use").map((block) => ({ id: block.id, name: block.name, input: block.input }));
    return { text, usage: payload?.usage ?? null, toolCalls: normalizedToolCalls(calls) };
  }
  if (kind === "gemini-content") {
    const parts = (payload?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []);
    return { text: parts.map((part) => part?.text || "").filter(Boolean).join("\n"), usage: payload?.usageMetadata ?? null, toolCalls: [] };
  }
  if (kind === "gemini-image") {
    const parts = (payload?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []);
    const data = parts.flatMap((part) => {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) return [{ b64_json: String(inline.data), mime_type: String(inline.mimeType || inline.mime_type || "image/png") }];
      if (part?.fileData?.fileUri || part?.file_data?.file_uri) {
        return [{ url: String(part?.fileData?.fileUri || part?.file_data?.file_uri) }];
      }
      return [];
    });
    return { data, usage: payload?.usageMetadata ?? null };
  }
  if (kind === "openai-image") return { data: normalizeImageResultData(payload), usage: payload?.usage ?? null };
  throw new Error(`未知响应类型：${kind}`);
}

function selectJsonPath(value, selector) {
  const parts = String(selector || "").replace(/^\$\.?/, "").split(".").filter(Boolean);
  let values = [value];
  for (const part of parts) {
    const wildcard = part.endsWith("[*]");
    const key = wildcard ? part.slice(0, -3) : part;
    values = values.flatMap(item => {
      const next = key ? item?.[key] : item;
      if (wildcard) return Array.isArray(next) ? next : [];
      return next === undefined ? [] : [next];
    });
  }
  return values.length === 1 ? values[0] : values;
}

function parseModels(kind, payload, spec = null) {
  if (spec?.response?.data) {
    const itemsValue = selectJsonPath(payload, spec.response.data);
    const items = Array.isArray(itemsValue) ? itemsValue : itemsValue ? [itemsValue] : [];
    const pick = (item, selector, fallback) => {
      const selected = selectJsonPath(item, selector);
      return String(Array.isArray(selected) ? selected[0] || "" : selected ?? fallback ?? "");
    };
    return items.map(item => pick(item, spec.response.id, item)).map((id, index) => id || String(items[index]?.name || items[index]?.model || "")).filter(Boolean);
  }
  let value = payload;
  if (value?.data && !Array.isArray(value.data) && typeof value.data === "object") value = value.data;
  if (kind === "gemini-models") {
    return (value?.models || []).map((model) => String(model?.name || model || "").replace(/^models\//, "")).filter(Boolean);
  }
  const items = Array.isArray(value?.data) ? value.data
    : Array.isArray(value?.models) ? value.models
      : Array.isArray(value?.list) ? value.list
        : Array.isArray(value) ? value : [];
  return items.map((model) => typeof model === "string" ? model : String(model?.id || model?.name || model?.model || "")).filter(Boolean);
}

function createRequestScope(options = {}) {
  const totalTimeoutMs = positiveTimeout(options.totalTimeoutMs, DEFAULT_TIMEOUTS.totalTimeoutMs);
  const controller = new AbortController();
  const deadline = Date.now() + totalTimeoutMs;
  let externalAbort = null;
  if (options.signal) {
    externalAbort = () => controller.abort(options.signal.reason || new Error("Request aborted"));
    if (options.signal.aborted) externalAbort();
    else options.signal.addEventListener("abort", externalAbort, { once: true });
  }
  const totalTimer = setTimeout(() => controller.abort(timeoutCause("total")), totalTimeoutMs);
  return {
    controller,
    signal: controller.signal,
    deadline,
    cleanup() {
      clearTimeout(totalTimer);
      if (externalAbort) options.signal?.removeEventListener("abort", externalAbort);
    },
  };
}

function raceOperation(promise, scope, timeoutMs, stage) {
  if (scope.signal.aborted) return Promise.reject(scope.signal.reason || timeoutCause("total"));
  const duration = Math.max(1, Math.min(timeoutMs, scope.deadline - Date.now()));
  const effectiveStage = scope.deadline - Date.now() <= timeoutMs ? "total" : stage;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      scope.signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, scope.signal.reason || timeoutCause("total"));
    const timer = setTimeout(() => finish(reject, timeoutCause(effectiveStage)), duration);
    scope.signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function createProtocolEngine({ registry = createProtocolRegistry(), fetchImpl, outboundFetch } = {}) {
  const networkFetch = typeof outboundFetch === "function"
    ? outboundFetch
    : createProxyAwareFetch({ fetchImpl: fetchImpl || globalThis.fetch });
  const modelOperationsFor = (definition) => definition?.modelOperations || definition?.operations || {};

  function resolve(provider, model) {
    const modelProtocol = model?.protocol || model?.modelProtocol;
    const configuredProviderProtocol = provider?.protocol || provider?.providerProtocol;
    const providerProtocol = registry.platformProtocolId?.(configuredProviderProtocol) || configuredProviderProtocol;
    registry.checkScope?.(providerProtocol, "platform");
    const normalizedModelProtocol = model
      ? String(registry.inferModelProtocol(model, provider) || modelProtocol || "").toLowerCase()
      : "";
    const normalizedProviderProtocol = String(providerProtocol || "").toLowerCase();
    const providerDefinition = registry.getEffectivePlatform?.(normalizedProviderProtocol) || registry.get(normalizedProviderProtocol);
    if (model) registry.assertCompatible?.(normalizedProviderProtocol, normalizedModelProtocol, provider);
    let knownApimartRoute = false;
    try {
      knownApimartRoute = (
        providerHasHost(provider, "apimart.ai")
        || providerHasHost(provider, "apib.ai")
        || String(provider?.metadata?.legacyPlatformProtocol || "").toLowerCase() === "apimart"
      )
        && normalizedModelProtocol === "openai-images";
    } catch {
      knownApimartRoute = false;
    }
    const providerAdapterProtocol = providerDefinition && registry.getAdapter(providerDefinition.runtimeProtocol || providerDefinition.id)
      && (normalizedModelProtocol === "openai-images" || normalizedModelProtocol === "apimart" || normalizedModelProtocol === "midjourney")
      ? providerDefinition.id
      : "";
    const protocolId = String(
      knownApimartRoute ? "apimart"
        : providerAdapterProtocol || normalizedModelProtocol || normalizedProviderProtocol || "openai",
    ).toLowerCase();
    const definition = registry.get(protocolId);
    if (!definition) {
      throw new ProtocolEngineError({
        code: "UPSTREAM_PROTOCOL",
        providerId: String(provider?.id || ""),
        modelId: modelIdOf(model),
        safeMessage: `不支持协议：${redact(protocolId)}`,
      });
    }
    return { protocolId: definition.id, modelProtocol: normalizedModelProtocol, definition, platformDefinition: providerDefinition, adapter: registry.getAdapter(definition.id) };
  }

  function describeExecution(provider, model, intent) {
    const { protocolId, modelProtocol, definition, platformDefinition, adapter } = resolve(provider, model);
    const custom = registry.getCustom?.(model?.protocol || model?.modelProtocol);
    const contract = registry.describe?.(protocolId, "model");
    let operation = contract?.operations.find(item => item.intent === intent) || null;
    if (operation) {
      operation = { ...operation };
      if (protocolId === "apimart" && (modelProtocol === "midjourney" || /midjourney|^mj(?:[-_]|$)/i.test(modelIdOf(model)))) operation.path = "/v1/midjourney/generations";
      if (protocolId === "openai-images" && intent === "image.edit" && usesGenerationImageEdit(model)) operation.path = "/v1/images/generations";
    }
    const available = contract ? contract.runnable : Boolean(modelOperationsFor(definition)[intent] || adapter);
    return { runtimeProtocol:protocolId, operation, runnable:Boolean(available && (operation || !contract) && (!custom || custom.capabilities.includes(intent))), reason:available ? "unsupported-operation" : "adapter-unavailable" };
  }

  function assertCustomIntent(provider, model, intent) {
    const custom = registry.getCustom?.(model?.protocol || model?.modelProtocol);
    const capability = intent === "llm.chat.stream" ? "llm.chat" : intent;
    if (custom && !custom.capabilities.includes(capability)) throw new ProtocolEngineError({ code:"UPSTREAM_PROTOCOL", providerId:provider?.id, modelId:modelIdOf(model), retryable:false, safeMessage:"自定义模型协议不支持请求的能力。" });
  }

  function buildRequest(provider, model, intent, input = {}, params = {}) {
    assertCustomIntent(provider, model, intent);
    const { protocolId, modelProtocol, definition, platformDefinition, adapter } = resolve(provider, model);
    const effectiveParams = effectiveModelParams(model, params);
    if (definition.connectionType === "cli") {
      throw new ProtocolEngineError({
        code: "CLI_LOCAL_ONLY",
        providerId: String(provider?.id || ""),
        modelId: modelIdOf(model),
        safeMessage: "即梦 CLI 通过本机命令执行，不构建 HTTP 请求。",
      });
    }
    if (adapter) {
      const executionModel = modelProtocol && modelProtocol !== String(model?.protocol || model?.modelProtocol || "").toLowerCase()
        ? { ...model, protocol: modelProtocol, modelProtocol }
        : model;
      if (typeof adapter.buildRequest === "function") return adapter.buildRequest({ provider, model: executionModel, intent, input, params: effectiveParams });
      return { protocolId, adapter: true, intent, provider, model: executionModel, input, params: effectiveParams };
    }
    const operation = modelOperationsFor(definition)[intent];
    if (!operation) {
      throw new ProtocolEngineError({
        code: "UPSTREAM_PROTOCOL",
        providerId: String(provider?.id || ""),
        modelId: modelIdOf(model),
        safeMessage: `协议 ${protocolId} 不支持能力 ${redact(intent)}。`,
      });
    }
    const modelId = modelIdOf(model);
    const generationEdit = ["openai", "openai-images"].includes(definition.id) && intent === "image.edit" && usesGenerationImageEdit(model);
    const endpoint = String(generationEdit ? "/v1/images/generations" : operation.path).replace("{model}", encodeURIComponent(modelId));
    let body;
    if (generationEdit) {
      const references = (Array.isArray(input.inputImages) ? input.inputImages : []).map(image => typeof image === "string" ? image : image?.data || image?.url).filter(Boolean);
      if (!references.length) throw new Error("Image edit requires at least one prepared input image.");
      if (input.mask) throw new Error("This image generation endpoint does not support masks.");
      body = { model: modelId, prompt: String(input.prompt || ""), ...openAiImageParams(effectiveParams), image: references };
    } else body = buildBody(operation.body, modelId, input, effectiveParams, Boolean(operation.stream));
    if (
      body
      && typeof body === "object"
      && !Array.isArray(body)
      && !(body instanceof FormData)
      && needsToolReasoningNone(provider, model, input)
    ) {
      body.reasoning_effort = "none";
    }
    // APIMart's OpenAI-compatible chat gateway defaults to SSE when the
    // `stream` field is omitted. The settings-page test expects a normal JSON
    // response so its parser can inspect the reply, and the Canvas Agent's
    // tool turns need the same treatment: their SSE body cannot be parsed as
    // the JSON completion the agent loop expects. Make that intent explicit
    // without changing streaming calls or other OpenAI-compatible providers.
    if (
      String(intent).startsWith("llm.")
      && definition.id === "openai"
      && !operation.stream
      && body
      && typeof body === "object"
      && !Array.isArray(body)
      && (providerHasHost(provider, "apimart.ai") || providerHasHost(provider, "apib.ai"))
      && body.stream === undefined
    ) {
      body.stream = false;
    }
    const apimartGemini = definition.id === "gemini"
      && (providerHasHost(provider, "apimart.ai") || providerHasHost(provider, "apib.ai"));
    const baseUrl = apimartGemini ? providerBaseUrl(provider).replace(/\/v1(?:beta)?$/i, "") : providerBaseUrl(provider);
    const multipart = body instanceof FormData;
    return {
      protocolId,
      intent,
      url: joinProtocolUrl(baseUrl, endpoint),
      method: operation.method || "POST",
      headers: {
        accept: operation.stream ? "text/event-stream" : "application/json",
        ...(!multipart ? { "content-type": "application/json" } : {}),
        ...(platformDefinition?.headers || {}),
        ...buildAuthHeaders(platformDefinition, providerCredential(provider, platformDefinition?.auth?.credentialRef)),
      },
      body,
      parse: operation.parse,
      stream: operation.stream || "",
    };
  }

  async function openResponse(request, provider, model, options = {}, requestClass = "billable") {
    const imageRequest = String(request.intent || "").startsWith("image.");
    const scope = createRequestScope(imageRequest ? { ...options, totalTimeoutMs: positiveTimeout(options.totalTimeoutMs, 300_000) } : options);
    const connectTimeoutMs = positiveTimeout(options.connectTimeoutMs, DEFAULT_TIMEOUTS.connectTimeoutMs);
    // A non-streaming reply is only handed over once the provider has finished
    // generating it, so waiting for its headers is a "when does the answer
    // start" budget, not a connection budget. Bounding it by the connect
    // timeout alone kills every reply that takes longer than the socket dial
    // allowance (the Canvas Agent asks for 4s there while its answers routinely
    // need 6s), so the first-answer allowance is honoured as a floor.
    const headerWaitMs = Math.max(
      connectTimeoutMs,
      positiveTimeout(options.firstEventTimeoutMs, DEFAULT_TIMEOUTS.firstEventTimeoutMs),
    );
    try {
      const response = await raceOperation(networkFetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET"
          ? undefined
          : request.body instanceof FormData ? request.body : JSON.stringify(request.body),
        signal: scope.signal,
        outbound: {
          mode: provider?.networkMode || provider?.metadata?.networkMode || provider?.metadata?.legacyNetworkMode || "auto",
          requestClass,
          purpose: request.method === "GET" ? "model-discovery" : "model-execution",
          providerId: String(provider?.id || ""),
        },
      // fetch resolves at response headers, which synchronous image APIs may
      // withhold until generation finishes. Socket connection limits live in
      // the transport; use the full image deadline while waiting for output.
      }), scope, imageRequest ? Math.max(1, scope.deadline - Date.now()) : headerWaitMs, imageRequest ? "total" : "connect");
      return { response, scope };
    } catch (error) {
      scope.cleanup();
      const normalized = normalizeError(error, provider, model, { intent: request.intent });
      if (imageRequest && normalized.submissionState !== "not_submitted") {
        normalized.submissionState = "unknown";
        normalized.retryable = false;
      }
      throw normalized;
    }
  }

  async function readText(response, scope) {
    return raceOperation(response.text(), scope, Math.max(1, scope.deadline - Date.now()), "total");
  }

  async function ensureSuccess(response, scope, provider, model) {
    if (response?.ok) return;
    let detail = "";
    try {
      detail = await readText(response, scope);
    } catch (error) {
      throw normalizeError(error, provider, model, { intent });
    }
    throw errorForStatus(response?.status, detail, provider, model);
  }

  // An upstream that rejects function tools together with a reasoning budget is
  // telling us the exact shape it accepts. Adapt once, remember it for this
  // provider+model, and only then let the candidate chain move on.
  async function withToolReasoningRetry(provider, model, input, run) {
    try {
      return await run();
    } catch (error) {
      const detail = String(error?.safeMessage || error?.message || "");
      if (
        error?.code !== "UPSTREAM_PROTOCOL"
        || !Array.isArray(input?.tools)
        || !input.tools.length
        || !requiresToolReasoningNone(detail)
      ) {
        throw error;
      }
      const key = toolReasoningKey(provider, model);
      if (toolReasoningNoneKeys.has(key)) throw error;
      toolReasoningNoneKeys.add(key);
      return run();
    }
  }

  async function executeOnce(provider, model, intent, input = {}, params = {}, options = {}) {
    assertCustomIntent(provider, model, intent);
    const { adapter, protocolId, modelProtocol } = resolve(provider, model);
    const effectiveParams = effectiveModelParams(model, params);
    if (options.resumeTask && (!adapter || options.resumeTask.protocol !== protocolId)) {
      throw new ProtocolEngineError({ code: "UPSTREAM_PROTOCOL", retryable: false, safeMessage: "原任务的 API 配置已变更，请恢复原配置后继续查询。" });
    }
    if (adapter) {
      if (typeof adapter.execute !== "function") throw normalizeError(new Error("协议适配器不支持执行。"), provider, model, { intent });
      try {
        const executionModel = modelProtocol && modelProtocol !== String(model?.protocol || model?.modelProtocol || "").toLowerCase()
          ? { ...model, protocol: modelProtocol, modelProtocol }
          : model;
        return await adapter.execute({ provider, model: executionModel, intent, input, params: effectiveParams, options, fetch: networkFetch });
      } catch (error) {
        throw normalizeError(error, provider, model, { intent });
      }
    }
    const prepareImages = intent.startsWith("image.")
      && (protocolId === "gemini" || (["openai", "openai-images"].includes(protocolId) && usesGenerationImageEdit(model)));
    const preparedInput = prepareImages ? { ...input, inputImages: await serializedImages(input) } : input;
    if (prepareImages && intent === "image.edit" && !preparedInput.inputImages.length) {
      throw new ProtocolEngineError({ code: "UPSTREAM_PROTOCOL", providerId: provider?.id, modelId: modelIdOf(model), safeMessage: "Image edit requires at least one prepared reference image." });
    }
    if (protocolId === "gemini" && prepareImages && preparedInput.inputImages.some(image => !/^data:[^;]+;base64,.+$/i.test(image))) {
      throw new ProtocolEngineError({ code: "UPSTREAM_PROTOCOL", providerId: provider?.id, modelId: modelIdOf(model), safeMessage: "Gemini reference images must be prepared as a Blob or base64 data URL." });
    }
    const request = buildRequest(provider, model, intent, preparedInput, params);
    const { response, scope } = await openResponse(request, provider, model, options);
    try {
      await ensureSuccess(response, scope, provider, model);
      const text = await readText(response, scope);
      // Some OpenAI-compatible relays answer a non-streaming call with an SSE
      // body anyway. Reading it as JSON would report "无法解析的数据" even though
      // the model replied, so decode the event stream when that is what arrived.
      const eventStreamKind = eventStreamKindFor(request, response, text);
      if (eventStreamKind) {
        const state = { text: "", reasoningContent: "", usage: null, toolMap: new Map() };
        for (const block of text.split(/\r?\n\r?\n/)) {
          const data = block.split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data || data === "[DONE]") continue;
          try {
            consumeStreamPayload(eventStreamKind, JSON.parse(data), state, null);
          } catch {
            // Provider keep-alives and non-JSON SSE events carry no result.
          }
        }
        if (state.text || state.toolMap.size || state.usage) {
          return {
            text: state.text,
            usage: state.usage,
            toolCalls: streamToolCalls(state),
            ...(state.reasoningContent ? { reasoningContent: state.reasoningContent } : {}),
          };
        }
      }
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new ProtocolEngineError({
          code: "UPSTREAM_PROTOCOL",
          providerId: String(provider?.id || ""),
          modelId: modelIdOf(model),
          safeMessage: "上游服务返回了无法解析的数据。",
        });
      }
      if (isQuotaRejection(response.status, payload)) {
        throw errorForStatus(response.status, text, provider, model);
      }
      const wrappedPayload = payload?.data
        && !Array.isArray(payload.data)
        && typeof payload.data === "object"
        && !payload.choices
        && !payload.candidates
        ? payload.data
        : payload;
      const parsed = parseResult(request.parse, request.parse === "openai-image" ? payload : wrappedPayload);
      if (Object.hasOwn(parsed, "data")) return parsed;
      return {
        text: parsed.text,
        usage: parsed.usage,
        ...(parsed.reasoningContent ? { reasoningContent: parsed.reasoningContent } : {}),
        ...(parsed.toolCalls?.length ? { toolCalls: parsed.toolCalls } : {}),
        ...(parsed.responseId ? { responseId: parsed.responseId } : {}),
        ...(parsed.model ? { model: parsed.model } : {}),
      };
    } catch (error) {
      throw normalizeError(error, provider, model);
    } finally {
      scope.cleanup();
    }
  }

  function consumeStreamPayload(streamKind, payload, state, onDelta) {
    let text = "";
    let reasoningContent = "";
    let toolDeltas = [];
    if (streamKind === "openai-sse") {
      const delta = payload?.choices?.[0]?.delta || {};
      text = typeof delta.content === "string" ? delta.content : "";
      reasoningContent = typeof delta.reasoning_content === "string"
        ? delta.reasoning_content
        : typeof delta.reasoningContent === "string" ? delta.reasoningContent : "";
      toolDeltas = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      if (payload?.usage) state.usage = payload.usage;
    } else if (streamKind === "responses-sse") {
      if (payload?.type === "response.output_text.delta") text = String(payload.delta || "");
      if (payload?.type === "response.function_call_arguments.delta") {
        toolDeltas = [{ index: payload.output_index || 0, id: payload.item_id, function: { name: payload.name, arguments: payload.delta } }];
      }
      if (payload?.response?.usage) state.usage = payload.response.usage;
    } else if (streamKind === "anthropic-sse") {
      if (payload?.type === "content_block_start" && payload?.content_block?.type === "tool_use") {
        toolDeltas = [{ index: payload.index || 0, id: payload.content_block.id, function: { name: payload.content_block.name, arguments: "" } }];
      }
      if (payload?.type === "content_block_delta") {
        text = String(payload?.delta?.text || "");
        if (payload?.delta?.partial_json) toolDeltas = [{ index: payload.index || 0, function: { arguments: payload.delta.partial_json } }];
      }
      if (payload?.usage) state.usage = payload.usage;
    } else if (streamKind === "gemini-sse") {
      const parsed = parseResult("gemini-content", payload);
      text = parsed.text;
      if (parsed.usage) state.usage = parsed.usage;
    }
    if (reasoningContent) state.reasoningContent = `${state.reasoningContent || ""}${reasoningContent}`;
    if (text) {
      state.text += text;
      onDelta?.({ type: "text-delta", text });
    }
    for (const delta of toolDeltas) {
      const index = Number(delta?.index || 0);
      const current = state.toolMap.get(index) || { id: "", name: "", arguments: "" };
      if (delta?.id) current.id = String(delta.id);
      if (delta?.function?.name) current.name = String(delta.function.name);
      if (delta?.function?.arguments) current.arguments += String(delta.function.arguments);
      state.toolMap.set(index, current);
      onDelta?.({ type: "tool-call-delta", index, id: current.id, name: current.name, argumentsDelta: String(delta?.function?.arguments || "") });
    }
  }

  async function execute(provider, model, intent, input = {}, params = {}, options = {}) {
    return withToolReasoningRetry(
      provider,
      model,
      input,
      () => executeOnce(provider, model, intent, input, params, options),
    );
  }

  async function stream(provider, model, intent, input = {}, params = {}, onDelta, options = {}) {
    return withToolReasoningRetry(
      provider,
      model,
      input,
      () => streamOnce(provider, model, intent, input, params, onDelta, options),
    );
  }

  async function streamOnce(provider, model, intent, input = {}, params = {}, onDelta, options = {}) {
    assertCustomIntent(provider, model, intent);
    const { definition, adapter, modelProtocol } = resolve(provider, model);
    const effectiveParams = effectiveModelParams(model, params);
    if (adapter) {
      if (typeof adapter.stream === "function") {
        try {
          const executionModel = modelProtocol && modelProtocol !== String(model?.protocol || model?.modelProtocol || "").toLowerCase()
            ? { ...model, protocol: modelProtocol, modelProtocol }
            : model;
          return await adapter.stream({ provider, model: executionModel, intent, input, params: effectiveParams, onDelta, options, fetch: networkFetch });
        } catch (error) {
          throw normalizeError(error, provider, model, { intent });
        }
      }
      const result = await execute(provider, model, intent, input, effectiveParams, options);
      if (result?.text) onDelta?.({ type: "text-delta", text: result.text });
      return {
        text: result?.text || "",
        usage: result?.usage ?? null,
        toolCalls: result?.toolCalls || [],
        ...(result?.reasoningContent ? { reasoningContent: result.reasoningContent } : {}),
        ...(result?.responseId ? { responseId: result.responseId } : {}),
        ...(result?.model ? { model: result.model } : {}),
      };
    }
    const requestedIntent = modelOperationsFor(definition)[`${intent}.stream`] ? `${intent}.stream` : intent;
    const request = buildRequest(provider, model, requestedIntent, input, effectiveParams);
    if (!request.stream) {
      const result = await execute(provider, model, intent, input, effectiveParams, options);
      if (result?.text) onDelta?.({ type: "text-delta", text: result.text });
      return {
        text: result?.text || "",
        usage: result?.usage ?? null,
        toolCalls: result?.toolCalls || [],
        ...(result?.reasoningContent ? { reasoningContent: result.reasoningContent } : {}),
        ...(result?.responseId ? { responseId: result.responseId } : {}),
        ...(result?.model ? { model: result.model } : {}),
      };
    }
    const { response, scope } = await openResponse(request, provider, model, options);
    let reader = null;
    try {
      await ensureSuccess(response, scope, provider, model);
      reader = response?.body?.getReader?.();
      if (!reader) throw new Error("上游流式响应没有可读取的数据体。");
      const decoder = new TextDecoder();
      const state = { text: "", reasoningContent: "", usage: null, toolMap: new Map() };
      const firstEventTimeoutMs = positiveTimeout(options.firstEventTimeoutMs, DEFAULT_TIMEOUTS.firstEventTimeoutMs);
      const firstEventDeadline = Date.now() + firstEventTimeoutMs;
      let sawEvent = false;
      let buffer = "";
      let done = false;
      const consumeEvent = (block) => {
        const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") return;
        sawEvent = true;
        try {
          consumeStreamPayload(request.stream, JSON.parse(data), state, onDelta);
        } catch {
          // Provider keep-alives and non-JSON SSE events are ignored.
        }
      };
      while (!done) {
        const remainingTotal = Math.max(1, scope.deadline - Date.now());
        const remainingFirst = Math.max(1, firstEventDeadline - Date.now());
        const read = await raceOperation(reader.read(), scope, sawEvent ? remainingTotal : Math.min(remainingFirst, remainingTotal), sawEvent ? "total" : "first-event");
        done = Boolean(read.done);
        if (read.value) buffer += decoder.decode(read.value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        for (const block of blocks) consumeEvent(block);
      }
      buffer += decoder.decode();
      if (buffer.trim()) consumeEvent(buffer);
      const toolCalls = streamToolCalls(state);
      onDelta?.({ type: "done", usage: state.usage, toolCalls });
      return {
        text: state.text,
        usage: state.usage,
        toolCalls,
        ...(state.reasoningContent ? { reasoningContent: state.reasoningContent } : {}),
      };
    } catch (error) {
      try { await reader?.cancel?.(); } catch {}
      throw normalizeError(error, provider, model, { intent });
    } finally {
      reader?.releaseLock?.();
      scope.cleanup();
    }
  }

  async function executeWithTools(provider, model, messages, system, tools, options = {}) {
    const result = await execute(provider, model, "llm.tools", {
      messages,
      system,
      tools,
      toolChoice: "auto",
    }, {}, options);
    return { content: result.text || "", toolCalls: result.toolCalls || [], usage: result.usage ?? null };
  }

  async function fetchModels(provider, options = {}) {
    const { definition, platformDefinition, adapter } = resolve(provider, null);
    if (adapter) {
      if (typeof adapter.fetchModels !== "function") {
        throw new ProtocolEngineError({
          code: "UPSTREAM_PROTOCOL",
          providerId: String(provider?.id || ""),
          safeMessage: `协议 ${definition.id} 没有模型目录接口。`,
        });
      }
      try {
        return await adapter.fetchModels({ provider, options, fetch: networkFetch });
      } catch (error) {
        throw normalizeError(error, provider, null);
      }
    }
    const modelsSpec = platformDefinition?.models || definition.models;
    if (!modelsSpec?.path) throw new Error(`协议 ${definition.id} 没有模型目录接口。`);
    const request = {
      method: modelsSpec.method || "GET",
      url: joinProtocolUrl(providerBaseUrl(provider), modelsSpec.path),
      headers: { accept: "application/json", ...(platformDefinition?.headers || definition.headers || {}), ...buildAuthHeaders(platformDefinition || definition, providerCredential(provider, platformDefinition?.auth?.credentialRef)) },
    };
    const { response, scope } = await openResponse(request, provider, null, options, "idempotent");
    try {
      await ensureSuccess(response, scope, provider, null);
      const text = await readText(response, scope);
      let payload;
      try { payload = text ? JSON.parse(text) : {}; }
      catch { throw new Error("模型目录返回的不是有效 JSON。"); }
      // Some OpenAI-compatible relays return an application-level error with
      // HTTP 200 (for example `{ code: 429, message: ... }`). Treat that as
      // a failed discovery request instead of silently parsing it as an empty
      // model list, otherwise verification appears successful and the user
      // cannot understand why no models were found.
      const serviceCode = Number(payload?.code ?? payload?.statusCode ?? payload?.error?.code ?? 0);
      const serviceFailure = payload?.success === false
        || (Number.isFinite(serviceCode) && serviceCode > 0 && ![200].includes(serviceCode));
      if (serviceFailure) {
        throw errorForStatus(serviceCode || 400, text, provider, null);
      }
      if (options.verifyCatalog === true) {
        const value = payload?.data && !Array.isArray(payload.data) && typeof payload.data === "object" ? payload.data : payload;
        const customData = modelsSpec.response?.data ? selectJsonPath(payload, modelsSpec.response.data) : undefined;
        const recognized = modelsSpec.response?.data
          ? customData != null
          : modelsSpec.parse === "gemini-models" ? Array.isArray(value?.models)
            : [value?.data, value?.models, value?.list, value].some(Array.isArray);
        if (!recognized) throw new ProtocolEngineError({ code: "UPSTREAM_PROTOCOL", providerId: String(provider?.id || ""), safeMessage: "接口返回的内容不是当前协议的模型目录。" });
      }
      return parseModels(modelsSpec.parse, payload, modelsSpec);
    } catch (error) {
      throw normalizeError(error, provider, null);
    } finally {
      scope.cleanup();
    }
  }

  async function verifyProtocol(draftProvider, options = {}) {
    // Diagnostics are opt-in: runtime callers retain strict verification and
    // the user's selected protocol is never silently replaced by a suggestion.
    if (options.suggestAlternatives === true) {
      const strictOptions = { ...options, suggestAlternatives: false, verifyCatalog: true, connectTimeoutMs: Math.min(positiveTimeout(options.connectTimeoutMs, 8_000), 8_000), totalTimeoutMs: Math.min(positiveTimeout(options.totalTimeoutMs, 10_000), 10_000) };
      try {
        return { ...await verifyProtocol(draftProvider, strictOptions), available: true };
      } catch (error) {
        const failure = normalizeError(error, draftProvider, null);
        if (failure.code === "REQUEST_ABORTED") throw failure;
        const requestedProtocol = String(draftProvider?.protocol || draftProvider?.providerProtocol || "");
        const selectedProtocol = registry.platformProtocolId?.(requestedProtocol) || requestedProtocol;
        const guidanceByCode = {
          UPSTREAM_AUTH: "请检查 API Key 是否正确、是否过期，以及是否拥有模型目录访问权限。",
          UPSTREAM_RATE_LIMIT: "服务请求过于频繁，请稍后重新验证。",
          UPSTREAM_TIMEOUT: "连接超时，请检查 Base URL 和网络线路，或稍后重试。",
        };
        const diagnostic = {
          available: false, selectedProtocol, requestedProtocol,
          code: failure.code, attempts: failure.attempts || [],
          guidance: guidanceByCode[failure.code] || "请检查 Base URL、网络线路和平台协议；站点可能未提供模型目录，可手动添加模型后测试。",
        };
        if (guidanceByCode[failure.code] || registry.get(selectedProtocol)?.connectionType === "cli") return diagnostic;
        const candidates = [...new Set([...registry.candidatesForBaseUrl(providerBaseUrl(draftProvider), ""), "openai", "gemini"])]
          .filter(protocol => protocol !== selectedProtocol).slice(0, 3);
        for (const protocol of candidates) {
          try {
            const result = await verifyProtocol({ ...draftProvider, protocol, providerProtocol: protocol }, { ...strictOptions, connectTimeoutMs: 3_000, totalTimeoutMs: 4_000 });
            // A generic 200/empty payload is not enough evidence to recommend
            // another protocol. Require a recognized, non-empty model catalog.
            if (!result.models?.length) continue;
            diagnostic.recommendedProtocol = protocol;
            diagnostic.attempts.push({ protocol, ok: true });
            diagnostic.guidance = "检测到可访问模型目录的协议，可切换后拉取模型；具体模型能力请使用测试确认。";
            break;
          } catch (alternativeError) {
            const normalized = normalizeError(alternativeError, draftProvider, null);
            if (normalized.code === "REQUEST_ABORTED") throw normalized;
            diagnostic.attempts.push({ protocol, ok: false, code: normalized.code });
            if (["UPSTREAM_AUTH", "UPSTREAM_RATE_LIMIT"].includes(normalized.code)) break;
          }
        }
        return diagnostic;
      }
    }
    const requestedProtocol = String(draftProvider?.protocol || draftProvider?.providerProtocol || "").trim();
    const selectedProtocol = registry.platformProtocolId?.(requestedProtocol) || requestedProtocol;
    const selectedDefinition = registry.get(selectedProtocol);
    // A selected platform protocol is an explicit contract. Never replace it
    // with a protocol inferred from the URL: that made a misconfigured Gemini,
    // Anthropic, or custom endpoint appear valid merely because OpenAI worked.
    // Candidate probing remains available only for an explicit auto-detect call.
    const explicitSelection = Boolean(selectedProtocol) && selectedProtocol !== "auto";
    const candidates = explicitSelection
      ? [selectedProtocol]
      : (selectedDefinition?.connectionType === "cli" ? [selectedProtocol] : registry.candidatesForBaseUrl(providerBaseUrl(draftProvider), ""));
    const attempts = [];
    let lastError = null;
    for (const protocol of candidates) {
      try {
        const models = await fetchModels({ ...draftProvider, protocol, providerProtocol: protocol }, options);
        attempts.push({ protocol, ok: true });
        return {
          selectedProtocol: protocol,
          models,
          attempts,
          requestedProtocol: requestedProtocol || "auto",
          protocolFallback: explicitSelection && protocol !== selectedProtocol,
        };
      } catch (error) {
        const normalized = normalizeError(error, draftProvider, null);
        attempts.push({ protocol, ok: false, code: normalized.code, message: normalized.safeMessage });
        lastError = normalized;
        if (["UPSTREAM_AUTH", "UPSTREAM_RATE_LIMIT"].includes(normalized.code)) {
          normalized.attempts = attempts;
          throw normalized;
        }
      }
    }
    if (lastError) {
      lastError.attempts = attempts;
      throw lastError;
    }
    throw new ProtocolEngineError({
      code: "UPSTREAM_PROTOCOL",
      providerId: String(draftProvider?.id || ""),
      safeMessage: "没有可验证的协议候选项。",
    });
  }

  return Object.freeze({
    describeExecution,
    buildRequest,
    execute,
    stream,
    executeWithTools,
    fetchModels,
    verifyProtocol,
  });
}

module.exports = {
  DEFAULT_TIMEOUTS,
  ProtocolEngineError,
  createProtocolEngine,
};
