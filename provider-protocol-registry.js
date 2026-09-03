"use strict";

const VERSION_PREFIXES = ["/api/v3", "/v1beta", "/v2", "/v1"];

const PROTOCOL_ALIASES = Object.freeze({
  "openai-compatible": "openai",
  responses: "openai-responses",
  images: "openai-images",
  google: "gemini",
  midjourney: "apimart",
  "apimart-midjourney": "apimart",
});

const DEFINITIONS = Object.freeze({
  openai: {
    id: "openai",
    label: "OpenAI 兼容",
    summary: "Chat Completions、视觉、工具调用和 SSE。",
    categories: ["llm", "vision", "tools"],
    auth: { type: "bearer", header: "authorization", prefix: "Bearer " },
    models: { path: "/v1/models", parse: "openai-models" },
    operations: {
      "llm.chat": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat" },
      "llm.chat.stream": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat", stream: "openai-sse" },
      "llm.chat.vision": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat" },
      "llm.tools": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat" },
    },
  },
  "openai-responses": {
    id: "openai-responses",
    label: "OpenAI Responses",
    summary: "OpenAI Responses API 与流式事件。",
    categories: ["llm", "vision", "tools", "responses"],
    auth: { type: "bearer", header: "authorization", prefix: "Bearer " },
    models: { path: "/v1/models", parse: "openai-models" },
    operations: {
      "llm.chat": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses" },
      "llm.chat.stream": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses", stream: "responses-sse" },
      "llm.chat.vision": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses" },
      "llm.tools": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses" },
    },
  },
  "openai-images": {
    id: "openai-images",
    label: "OpenAI Images",
    summary: "OpenAI 兼容图片生成与编辑。",
    categories: ["image"],
    auth: { type: "bearer", header: "authorization", prefix: "Bearer " },
    models: { path: "/v1/models", parse: "openai-models" },
    operations: {
      "image.generate": { method: "POST", path: "/v1/images/generations", body: "openai-image", parse: "openai-image" },
      "image.edit": { method: "POST", path: "/v1/images/edits", body: "openai-image-edit", parse: "openai-image" },
    },
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    summary: "Anthropic Messages API。",
    categories: ["llm", "vision", "tools"],
    auth: { type: "api-key-header", header: "x-api-key" },
    headers: { "anthropic-version": "2023-06-01" },
    models: { path: "/v1/models", parse: "anthropic-models" },
    operations: {
      "llm.chat": { method: "POST", path: "/v1/messages", body: "anthropic-messages", parse: "anthropic-message" },
      "llm.chat.stream": { method: "POST", path: "/v1/messages", body: "anthropic-messages", parse: "anthropic-message", stream: "anthropic-sse" },
      "llm.chat.vision": { method: "POST", path: "/v1/messages", body: "anthropic-messages", parse: "anthropic-message" },
      "llm.tools": { method: "POST", path: "/v1/messages", body: "anthropic-messages", parse: "anthropic-message" },
    },
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    summary: "Gemini generateContent 与模型目录。",
    categories: ["llm", "vision", "image"],
    auth: { type: "api-key-header", header: "x-goog-api-key" },
    models: { path: "/v1beta/models", parse: "gemini-models" },
    operations: {
      "llm.chat": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-content", parse: "gemini-content" },
      "llm.chat.stream": { method: "POST", path: "/v1beta/models/{model}:streamGenerateContent?alt=sse", body: "gemini-content", parse: "gemini-content", stream: "gemini-sse" },
      "llm.chat.vision": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-content", parse: "gemini-content" },
      "image.generate": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-image", parse: "gemini-content" },
    },
  },
  apimart: {
    id: "apimart",
    label: "APIMart / Midjourney",
    summary: "APIMart Midjourney 任务适配器。",
    categories: ["image"],
    adapterId: "apimart",
  },
  runninghub: {
    id: "runninghub",
    label: "RunningHub",
    summary: "RunningHub 工作流适配器。",
    categories: ["llm", "image", "video"],
    adapterId: "runninghub",
  },
  "image-relay": {
    id: "image-relay",
    label: "图片中转",
    summary: "现有图片中转协议适配器。",
    categories: ["image"],
    adapterId: "image-relay",
  },
  comfyui: {
    id: "comfyui",
    label: "ComfyUI",
    summary: "ComfyUI 本地工作流适配器。",
    categories: ["image", "video"],
    adapterId: "comfyui",
  },
  "video-adapter": {
    id: "video-adapter",
    label: "视频适配器",
    summary: "现有视频生成服务兼容层。",
    categories: ["video"],
    adapterId: "video-adapter",
  },
  "audio-adapter": {
    id: "audio-adapter",
    label: "音频适配器",
    summary: "现有音频服务兼容层。",
    categories: ["audio"],
    adapterId: "audio-adapter",
  },
});

function normalizeProtocolId(value, fallback = "") {
  const key = String(value || "").trim().toLowerCase();
  const normalized = PROTOCOL_ALIASES[key] || key;
  return DEFINITIONS[normalized] ? normalized : fallback;
}

function joinProtocolUrl(baseUrl, endpoint) {
  const rawEndpoint = String(endpoint || "").trim();
  if (/^https?:\/\//i.test(rawEndpoint)) return new URL(rawEndpoint).toString();
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("Base URL 必须是有效的 HTTP(S) 地址。");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Base URL 只允许 HTTP 或 HTTPS。");
  }
  let suffix = `/${rawEndpoint.replace(/^\/+/, "")}`;
  const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  for (const prefix of VERSION_PREFIXES) {
    if (pathname.endsWith(prefix) && (suffix === prefix || suffix.startsWith(`${prefix}/`))) {
      suffix = suffix.slice(prefix.length) || "/";
      break;
    }
  }
  return `${base}${suffix}`;
}

function inferFromModel(model) {
  const explicit = normalizeProtocolId(model?.protocol || model?.modelProtocol);
  if (explicit) return explicit;
  const id = String(model?.id || model?.model || model?.name || "").toLowerCase();
  const capabilities = Array.isArray(model?.capabilities) ? model.capabilities.map(String) : [];
  if (id.includes("claude")) return "anthropic";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("midjourney") || /^mj[-_]/.test(id)) return "apimart";
  if (id.includes("image") || capabilities.some((item) => item.startsWith("image."))) return "openai-images";
  return "openai";
}

function publicDefinition(definition) {
  return {
    id: definition.id,
    label: definition.label,
    summary: definition.summary,
    categories: [...(definition.categories || [])],
    capabilities: [...(definition.categories || [])],
    runtimeProtocol: definition.id,
    runnable: true,
    adapter: Boolean(definition.adapterId),
  };
}

function createProtocolRegistry({ adapters = {} } = {}) {
  const adapterMap = new Map(Object.entries(adapters || {}).map(([id, adapter]) => [normalizeProtocolId(id, id), adapter]));

  return Object.freeze({
    get(protocolId) {
      return DEFINITIONS[normalizeProtocolId(protocolId)] || null;
    },
    listPublic() {
      return Object.values(DEFINITIONS).map(publicDefinition);
    },
    candidatesForBaseUrl(baseUrl, currentProtocol = "") {
      const raw = String(baseUrl || "").toLowerCase();
      const candidates = [];
      if (/anthropic\.com/.test(raw)) candidates.push("anthropic");
      if (/generativelanguage\.googleapis\.com|googleapis\.com.*gemini/.test(raw)) candidates.push("gemini");
      if (/apimart|midjourney/.test(raw)) candidates.push("apimart");
      if (/runninghub/.test(raw)) candidates.push("runninghub");
      if (/^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::8188)(?:\/|$)/.test(raw)) candidates.push("comfyui");
      const current = normalizeProtocolId(currentProtocol);
      if (current) candidates.push(current);
      candidates.push("openai");
      return [...new Set(candidates)];
    },
    inferModelProtocol(model) {
      return inferFromModel(model);
    },
    getAdapter(protocolId) {
      const definition = DEFINITIONS[normalizeProtocolId(protocolId)];
      return definition?.adapterId ? adapterMap.get(definition.adapterId) || null : null;
    },
  });
}

module.exports = {
  createProtocolRegistry,
  joinProtocolUrl,
  normalizeProtocolId,
};
