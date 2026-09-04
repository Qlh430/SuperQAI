"use strict";

const { createProxyAwareFetch } = require("./outbound-fetch");
const { createProtocolRegistry, joinProtocolUrl } = require("./provider-protocol-registry");

const DEFAULT_TIMEOUTS = Object.freeze({
  connectTimeoutMs: 20_000,
  firstEventTimeoutMs: 45_000,
  totalTimeoutMs: 120_000,
});

class ProtocolEngineError extends Error {
  constructor({ code, providerId = "", modelId = "", retryable = false, safeMessage, stage = "" }) {
    super(safeMessage);
    this.name = "ProtocolEngineError";
    this.code = code;
    this.providerId = providerId;
    this.modelId = modelId;
    this.retryable = Boolean(retryable);
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
    code,
    providerId: String(provider?.id || ""),
    modelId: modelIdOf(model),
    retryable,
    safeMessage: `上游服务返回 HTTP ${numericStatus}${safeDetail ? `：${safeDetail}` : ""}`,
  });
}

function normalizeError(error, provider, model) {
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
    return aborted;
  }
  const detail = redact(error?.message || "上游服务不可用", [provider?.apiKey, provider?.api_key, provider?.walletKey, provider?.wallet_api_key]);
  const explicitCode = String(error?.code || "").trim();
  return new ProtocolEngineError({
    code: explicitCode || "UPSTREAM_UNAVAILABLE",
    providerId: String(provider?.id || ""),
    modelId: modelIdOf(model),
    retryable: error?.retryable !== false,
    stage: String(error?.stage || ""),
    safeMessage: detail || "上游服务不可用。",
  });
}

function modelIdOf(model) {
  return String(typeof model === "string"
    ? model
    : model?.metadata?.upstreamModel || model?.id || model?.model || model?.name || "").trim();
}

function providerBaseUrl(provider) {
  return String(provider?.baseUrl || provider?.base_url || "").trim();
}

function providerApiKey(provider) {
  return String(provider?.apiKey || provider?.api_key || "").trim();
}

function addDefined(target, source, blocked = []) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value !== undefined && !blocked.includes(key)) target[key] = value;
  }
  return target;
}

function normalizedMessages(input = {}) {
  if (Array.isArray(input.messages) && input.messages.length) return input.messages.map((message) => ({ ...message }));
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
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || !OPENAI_IMAGE_PARAM_KEYS.has(key)) return;
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
]);

function openAiImageParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([key, value]) => (
    value !== undefined && value !== null && OPENAI_IMAGE_PARAM_KEYS.has(key)
  )));
}

function buildBody(kind, modelId, input = {}, params = {}, stream = false) {
  const messages = normalizedMessages(input);
  if (kind === "openai-chat") {
    const body = { model: modelId, messages: withSystemMessage(messages, input.system) };
    addDefined(body, params, ["signal", "connectTimeoutMs", "firstEventTimeoutMs", "totalTimeoutMs"]);
    if (Array.isArray(input.tools)) body.tools = input.tools;
    if (input.toolChoice !== undefined) body.tool_choice = input.toolChoice;
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
    addDefined(body, params, [
      "max_output_tokens",
      "max_tokens",
      "maxTokens",
      "reasoning",
      "reasoning_effort",
      "signal",
      "connectTimeoutMs",
      "firstEventTimeoutMs",
      "totalTimeoutMs",
    ]);
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
      body.generationConfig = { ...(params.generationConfig || {}), responseModalities: ["TEXT", "IMAGE"] };
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
  if (kind === "openai-image") return { data: payload?.data || payload?.images || [], usage: payload?.usage ?? null };
  throw new Error(`未知响应类型：${kind}`);
}

function parseModels(kind, payload) {
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

  function resolve(provider, model) {
    const modelProtocol = model?.protocol || model?.modelProtocol;
    const providerProtocol = provider?.protocol || provider?.providerProtocol;
    const protocolId = String(modelProtocol || providerProtocol || registry.inferModelProtocol(model) || "openai").toLowerCase();
    const definition = registry.get(protocolId);
    if (!definition) {
      throw new ProtocolEngineError({
        code: "UPSTREAM_PROTOCOL",
        providerId: String(provider?.id || ""),
        modelId: modelIdOf(model),
        safeMessage: `不支持协议：${redact(protocolId)}`,
      });
    }
    return { protocolId: definition.id, definition, adapter: registry.getAdapter(definition.id) };
  }

  function buildRequest(provider, model, intent, input = {}, params = {}) {
    const { protocolId, definition, adapter } = resolve(provider, model);
    if (adapter) {
      if (typeof adapter.buildRequest === "function") return adapter.buildRequest({ provider, model, intent, input, params });
      return { protocolId, adapter: true, intent, provider, model, input, params };
    }
    const operation = definition.operations?.[intent];
    if (!operation) {
      throw new ProtocolEngineError({
        code: "UPSTREAM_PROTOCOL",
        providerId: String(provider?.id || ""),
        modelId: modelIdOf(model),
        safeMessage: `协议 ${protocolId} 不支持能力 ${redact(intent)}。`,
      });
    }
    const modelId = modelIdOf(model);
    const endpoint = String(operation.path).replace("{model}", encodeURIComponent(modelId));
    const body = buildBody(operation.body, modelId, input, params, Boolean(operation.stream));
    const multipart = body instanceof FormData;
    return {
      protocolId,
      intent,
      url: joinProtocolUrl(providerBaseUrl(provider), endpoint),
      method: operation.method || "POST",
      headers: {
        accept: operation.stream ? "text/event-stream" : "application/json",
        ...(!multipart ? { "content-type": "application/json" } : {}),
        ...(definition.headers || {}),
        ...buildAuthHeaders(definition, providerApiKey(provider)),
      },
      body,
      parse: operation.parse,
      stream: operation.stream || "",
    };
  }

  async function openResponse(request, provider, model, options = {}, requestClass = "billable") {
    const scope = createRequestScope(options);
    const connectTimeoutMs = positiveTimeout(options.connectTimeoutMs, DEFAULT_TIMEOUTS.connectTimeoutMs);
    try {
      const response = await raceOperation(networkFetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET"
          ? undefined
          : request.body instanceof FormData ? request.body : JSON.stringify(request.body),
        signal: scope.signal,
        outbound: {
          requestClass,
          purpose: request.method === "GET" ? "model-discovery" : "model-execution",
          providerId: String(provider?.id || ""),
        },
      }), scope, connectTimeoutMs, "connect");
      return { response, scope };
    } catch (error) {
      scope.cleanup();
      throw normalizeError(error, provider, model);
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
      throw normalizeError(error, provider, model);
    }
    throw errorForStatus(response?.status, detail, provider, model);
  }

  async function execute(provider, model, intent, input = {}, params = {}, options = {}) {
    const { adapter } = resolve(provider, model);
    if (adapter) {
      if (typeof adapter.execute !== "function") throw normalizeError(new Error("协议适配器不支持执行。"), provider, model);
      try {
        return await adapter.execute({ provider, model, intent, input, params, options, fetch: networkFetch });
      } catch (error) {
        throw normalizeError(error, provider, model);
      }
    }
    const request = buildRequest(provider, model, intent, input, params);
    const { response, scope } = await openResponse(request, provider, model, options);
    try {
      await ensureSuccess(response, scope, provider, model);
      const text = await readText(response, scope);
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
      const wrappedPayload = payload?.data
        && !Array.isArray(payload.data)
        && typeof payload.data === "object"
        && !payload.choices
        && !payload.candidates
        ? payload.data
        : payload;
      const parsed = parseResult(request.parse, wrappedPayload);
      if (Object.hasOwn(parsed, "data")) return parsed;
      return {
        text: parsed.text,
        usage: parsed.usage,
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
    let toolDeltas = [];
    if (streamKind === "openai-sse") {
      const delta = payload?.choices?.[0]?.delta || {};
      text = typeof delta.content === "string" ? delta.content : "";
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

  async function stream(provider, model, intent, input = {}, params = {}, onDelta, options = {}) {
    const { definition, adapter } = resolve(provider, model);
    if (adapter) {
      if (typeof adapter.stream === "function") {
        try {
          return await adapter.stream({ provider, model, intent, input, params, onDelta, options, fetch: networkFetch });
        } catch (error) {
          throw normalizeError(error, provider, model);
        }
      }
      const result = await execute(provider, model, intent, input, params, options);
      if (result?.text) onDelta?.({ type: "text-delta", text: result.text });
      return {
        text: result?.text || "",
        usage: result?.usage ?? null,
        toolCalls: result?.toolCalls || [],
        ...(result?.responseId ? { responseId: result.responseId } : {}),
        ...(result?.model ? { model: result.model } : {}),
      };
    }
    const requestedIntent = definition.operations?.[`${intent}.stream`] ? `${intent}.stream` : intent;
    const request = buildRequest(provider, model, requestedIntent, input, params);
    if (!request.stream) {
      const result = await execute(provider, model, intent, input, params, options);
      if (result?.text) onDelta?.({ type: "text-delta", text: result.text });
      return {
        text: result?.text || "",
        usage: result?.usage ?? null,
        toolCalls: result?.toolCalls || [],
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
      const state = { text: "", usage: null, toolMap: new Map() };
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
      const toolCalls = [...state.toolMap.entries()].sort(([a], [b]) => a - b).map(([, call], index) => ({
        id: call.id || `call-${index + 1}`,
        name: call.name,
        arguments: call.arguments,
      })).filter((call) => call.name);
      onDelta?.({ type: "done", usage: state.usage, toolCalls });
      return { text: state.text, usage: state.usage, toolCalls };
    } catch (error) {
      try { await reader?.cancel?.(); } catch {}
      throw normalizeError(error, provider, model);
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
    const { definition, adapter } = resolve(provider, null);
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
    if (!definition.models?.path) throw new Error(`协议 ${definition.id} 没有模型目录接口。`);
    const request = {
      method: "GET",
      url: joinProtocolUrl(providerBaseUrl(provider), definition.models.path),
      headers: { accept: "application/json", ...(definition.headers || {}), ...buildAuthHeaders(definition, providerApiKey(provider)) },
    };
    const { response, scope } = await openResponse(request, provider, null, options, "idempotent");
    try {
      await ensureSuccess(response, scope, provider, null);
      const text = await readText(response, scope);
      let payload;
      try { payload = text ? JSON.parse(text) : {}; }
      catch { throw new Error("模型目录返回的不是有效 JSON。"); }
      return parseModels(definition.models.parse, payload);
    } catch (error) {
      throw normalizeError(error, provider, null);
    } finally {
      scope.cleanup();
    }
  }

  async function verifyProtocol(draftProvider, options = {}) {
    const candidates = registry.candidatesForBaseUrl(providerBaseUrl(draftProvider), draftProvider?.protocol || draftProvider?.providerProtocol);
    const attempts = [];
    let lastError = null;
    for (const protocol of candidates) {
      try {
        const models = await fetchModels({ ...draftProvider, protocol, providerProtocol: protocol }, options);
        attempts.push({ protocol, ok: true });
        return { selectedProtocol: protocol, models, attempts };
      } catch (error) {
        const normalized = normalizeError(error, draftProvider, null);
        attempts.push({ protocol, ok: false, code: normalized.code, message: normalized.safeMessage });
        lastError = normalized;
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
