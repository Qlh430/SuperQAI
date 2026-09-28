"use strict";

const { inferModelConfiguration, normalizeProviderBaseUrl } = require("./provider-model-rules");
const { contractFor, capabilitiesFor } = require("./protocol-contracts");

const VERSION_PREFIXES = ["/api/v3", "/v1beta", "/v2", "/v1"];

const PROTOCOL_ALIASES = Object.freeze({
  "openai-compatible": "openai",
  "openai-chat": "openai",
  "openai-image": "openai-images",
  "gemini-chat": "gemini",
  "gemini-image": "gemini",
  "gemini-generations": "openai-images",
  "anthropic-chat": "anthropic",
  responses: "openai-responses",
  images: "openai-images",
  google: "gemini",
  midjourney: "midjourney",
  "apimart-midjourney": "midjourney",
});

// Platform protocols own the connection: Base URL, authentication and model
// discovery. Model profiles own only the API request and response shape. The
// runtime IDs below are retained so existing saved configurations keep working.
const COMPATIBLE_MODEL_PROTOCOLS = Object.freeze({
  openai: ["openai", "openai-responses", "openai-images", "video-adapter", "audio-adapter"],
  anthropic: ["anthropic"],
  gemini: ["gemini"],
  // `apimart` remains listed for old saved model profiles. New Midjourney
  // models use the dedicated profile below, which fixes their task endpoint.
  apimart: ["midjourney", "apimart", "openai", "openai-responses", "openai-images", "anthropic", "gemini"],
  runninghub: ["runninghub"],
  "image-relay": ["image-relay"],
  comfyui: ["comfyui"],
  "cli:jimeng": ["cli:jimeng"],
});

const OPENAI_CHAT_PARAMETERS = Object.freeze([
  "temperature", "top_p", "max_tokens", "max_completion_tokens", "stop",
  "presence_penalty", "frequency_penalty", "seed", "response_format",
  "logprobs", "top_logprobs", "n", "parallel_tool_calls", "tool_choice", "user",
]);
const OPENAI_IMAGE_PARAMETERS = Object.freeze([
  "size", "quality", "n", "response_format", "output_format", "output_compression",
  "background", "moderation", "user", "aspect_ratio", "image_size",
  "steps", "guidance_scale", "seed", "negative_prompt",
]);
const OPENAI_MODEL_OPERATIONS = Object.freeze({
  "llm.chat": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat", parameters: OPENAI_CHAT_PARAMETERS },
  "llm.chat.stream": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat", stream: "openai-sse", parameters: OPENAI_CHAT_PARAMETERS },
  "llm.chat.vision": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat", parameters: OPENAI_CHAT_PARAMETERS },
  "llm.tools": { method: "POST", path: "/v1/chat/completions", body: "openai-chat", parse: "openai-chat", parameters: OPENAI_CHAT_PARAMETERS },
  "image.generate": { method: "POST", path: "/v1/images/generations", body: "openai-image", parse: "openai-image", parameters: OPENAI_IMAGE_PARAMETERS },
  "image.edit": { method: "POST", path: "/v1/images/edits", body: "openai-image-edit", parse: "openai-image", parameters: OPENAI_IMAGE_PARAMETERS },
});
const OPENAI_OPERATION_CATALOG = Object.freeze([
  { id: "chat.completions", label: "Chat Completions", intent: "llm.chat", method: "POST", path: "/v1/chat/completions", mode: "request", parameters: OPENAI_CHAT_PARAMETERS, status: "implemented" },
  { id: "chat.completions.stream", label: "流式 Chat Completions", intent: "llm.chat.stream", method: "POST", path: "/v1/chat/completions", mode: "stream", parameters: OPENAI_CHAT_PARAMETERS, status: "implemented" },
  { id: "chat.completions.vision", label: "视觉输入", intent: "llm.chat.vision", method: "POST", path: "/v1/chat/completions", mode: "request", parameters: OPENAI_CHAT_PARAMETERS, status: "implemented" },
  { id: "chat.completions.tools", label: "工具调用", intent: "llm.tools", method: "POST", path: "/v1/chat/completions", mode: "request", parameters: OPENAI_CHAT_PARAMETERS, status: "implemented" },
  { id: "chat.completions.structured", label: "结构化输出", intent: "llm.chat", method: "POST", path: "/v1/chat/completions", mode: "request", parameters: ["response_format"], status: "implemented" },
  { id: "responses.create", label: "Responses", method: "POST", path: "/v1/responses", mode: "request", parameters: ["temperature", "top_p", "max_output_tokens", "reasoning", "reasoning_effort", "text", "truncation", "user"], status: "legacy-profile" },
  { id: "responses.stream", label: "流式 Responses", method: "POST", path: "/v1/responses", mode: "stream", parameters: ["temperature", "top_p", "max_output_tokens", "reasoning", "reasoning_effort", "text", "truncation", "user"], status: "legacy-profile" },
  { id: "images.generations", label: "图片生成", intent: "image.generate", method: "POST", path: "/v1/images/generations", mode: "request", parameters: OPENAI_IMAGE_PARAMETERS, status: "implemented" },
  { id: "images.edits", label: "图片编辑", intent: "image.edit", method: "POST", path: "/v1/images/edits", mode: "request", parameters: OPENAI_IMAGE_PARAMETERS, status: "implemented" },
  { id: "videos.create", label: "视频", method: "POST", path: "/v1/videos", mode: "request", parameters: ["seconds", "size", "quality", "prompt"], status: "catalog-only" },
  { id: "audio.speech", label: "语音合成", method: "POST", path: "/v1/audio/speech", mode: "request", parameters: ["voice", "response_format", "speed"], status: "catalog-only" },
  { id: "audio.transcriptions", label: "音频转写", method: "POST", path: "/v1/audio/transcriptions", mode: "request", parameters: ["language", "prompt", "response_format", "temperature"], status: "catalog-only" },
  { id: "embeddings.create", label: "Embeddings", method: "POST", path: "/v1/embeddings", mode: "request", parameters: ["encoding_format", "dimensions", "user"], status: "catalog-only" },
  { id: "files.list", label: "文件列表", method: "GET", path: "/v1/files", mode: "request", parameters: ["purpose", "limit", "after", "order"], status: "catalog-only" },
  { id: "files.upload", label: "文件上传", method: "POST", path: "/v1/files", mode: "request", parameters: ["purpose"], status: "catalog-only" },
  { id: "moderations.create", label: "Moderation", method: "POST", path: "/v1/moderations", mode: "request", parameters: [], status: "catalog-only" },
  { id: "batches.create", label: "批处理", method: "POST", path: "/v1/batches", mode: "request", parameters: ["endpoint", "completion_window", "metadata"], status: "catalog-only" },
]);

const DEFINITIONS = Object.freeze({
  openai: {
    id: "openai",
    label: "OpenAI 兼容同步",
    displayGroup: "OpenAI",
    modelLabel: "OpenAI 模型协议",
    platformVisible: true,
    modelVisible: true,
    summary: "统一 OpenAI 兼容模型协议；平台协议只管理连接、鉴权和模型目录。",
    categories: ["llm", "vision", "tools"],
    auth: { type: "bearer", header: "authorization", prefix: "Bearer " },
    models: { path: "/v1/models", parse: "openai-models" },
    modelOperations: OPENAI_MODEL_OPERATIONS,
    // Keep the historical field available to internal callers and saved
    // integrations while the public contract uses `modelOperations`.
    operations: OPENAI_MODEL_OPERATIONS,
    operationCatalog: OPENAI_OPERATION_CATALOG,
  },
  "openai-responses": {
    id: "openai-responses",
    label: "OpenAI Responses",
    displayGroup: "OpenAI",
    modelLabel: "Responses",
    platformVisible: false,
    modelVisible: false,
    advanced: true,
    legacyModelProfile: true,
    summary: "OpenAI Responses API 与流式事件。",
    categories: ["llm", "vision", "tools", "responses"],
    auth: { type: "bearer", header: "authorization", prefix: "Bearer " },
    models: { path: "/v1/models", parse: "openai-models" },
    operations: {
      "llm.chat": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses", parameters: ["temperature", "top_p", "max_output_tokens", "max_tokens", "reasoning", "reasoning_effort", "text", "truncation", "user"] },
      "llm.chat.stream": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses", stream: "responses-sse", parameters: ["temperature", "top_p", "max_output_tokens", "max_tokens", "reasoning", "reasoning_effort", "text", "truncation", "user"] },
      "llm.chat.vision": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses", parameters: ["temperature", "top_p", "max_output_tokens", "reasoning", "reasoning_effort", "text", "user"] },
      "llm.tools": { method: "POST", path: "/v1/responses", body: "openai-responses", parse: "openai-responses", parameters: ["temperature", "top_p", "max_output_tokens", "reasoning", "reasoning_effort", "parallel_tool_calls", "tool_choice", "text", "user"] },
    },
  },
  "openai-images": {
    id: "openai-images",
    label: "OpenAI Images",
    displayGroup: "OpenAI",
    modelLabel: "图片生成与编辑",
    platformVisible: false,
    modelVisible: false,
    legacyModelProfile: true,
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
    label: "Anthropic Messages API",
    displayGroup: "Anthropic",
    modelLabel: "Messages",
    platformVisible: true,
    modelVisible: true,
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
    label: "Google Gemini API",
    displayGroup: "Google",
    modelLabel: "generateContent",
    requiresApimartHostForOpenAi: true,
    platformVisible: true,
    modelVisible: true,
    summary: "Gemini generateContent 与模型目录。",
    categories: ["llm", "vision", "image"],
    auth: { type: "api-key-header", header: "x-goog-api-key" },
    models: { path: "/v1beta/models", parse: "gemini-models" },
    operations: {
      "llm.chat": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-content", parse: "gemini-content" },
      "llm.chat.stream": { method: "POST", path: "/v1beta/models/{model}:streamGenerateContent?alt=sse", body: "gemini-content", parse: "gemini-content", stream: "gemini-sse" },
      "llm.chat.vision": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-content", parse: "gemini-content" },
      "image.generate": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-image", parse: "gemini-image" },
      "image.edit": { method: "POST", path: "/v1beta/models/{model}:generateContent", body: "gemini-image", parse: "gemini-image" },
    },
  },
  apimart: {
    id: "apimart",
    label: "内部异步图片运行时",
    displayGroup: "APIMart",
    modelLabel: "内部异步图片运行时",
    platformVisible: false,
    modelVisible: false,
    legacyPlatformProfile: true,
    legacyModelProfile: true,
    summary: "保留旧配置读取和异步媒体路由，不在 API 设置中展示。",
    categories: ["image"],
    auth: { type: "bearer", header: "authorization", prefix: "Bearer " },
    adapterId: "apimart",
  },
  midjourney: {
    id: "midjourney",
    label: "Midjourney 专用协议",
    displayGroup: "Midjourney",
    modelLabel: "Midjourney 专用协议",
    requiresApimartHostForOpenAi: true,
    platformVisible: false,
    modelVisible: true,
    summary: "Midjourney 的异步提交、任务轮询和图片结果解析。",
    categories: ["image"],
    adapterId: "apimart",
  },
  runninghub: {
    id: "runninghub",
    label: "RunningHub",
    displayGroup: "工作流",
    modelLabel: "RunningHub 工作流",
    platformVisible: true,
    modelVisible: true,
    summary: "RunningHub 工作流适配器。",
    categories: ["llm", "image", "video"],
    adapterId: "runninghub",
  },
  "image-relay": {
    id: "image-relay",
    label: "图片中转",
    displayGroup: "图片",
    modelLabel: "图片中转任务",
    platformVisible: false,
    modelVisible: false,
    legacyAdapter: true,
    summary: "现有图片中转协议适配器。",
    categories: ["image"],
    adapterId: "image-relay",
  },
  comfyui: {
    id: "comfyui",
    label: "ComfyUI",
    displayGroup: "工作流",
    modelLabel: "ComfyUI 工作流",
    platformVisible: true,
    modelVisible: true,
    summary: "ComfyUI 本地工作流适配器。",
    categories: ["image", "video"],
    adapterId: "comfyui",
  },
  "video-adapter": {
    id: "video-adapter",
    label: "通用视频生成 API",
    displayGroup: "视频",
    modelLabel: "通用视频任务",
    platformVisible: false,
    modelVisible: true,
    legacyModelProfile: true,
    summary: "现有视频生成服务兼容层。",
    categories: ["video"],
    adapterId: "video-adapter",
  },
  "audio-adapter": {
    id: "audio-adapter",
    label: "通用音频生成 API",
    displayGroup: "音频",
    modelLabel: "通用音频任务",
    platformVisible: false,
    modelVisible: true,
    legacyModelProfile: true,
    summary: "现有音频服务兼容层。",
    categories: ["audio"],
    adapterId: "audio-adapter",
  },
  "cli:jimeng": {
    id: "cli:jimeng",
    label: "即梦 CLI",
    modelLabel: "即梦图片与视频",
    summary: "本机官方 dreamina CLI；在此设备完成账户登录。",
    categories: ["image", "video"],
    adapterId: "jimeng-cli",
    connectionType: "cli",
    platformVisible: true,
    modelVisible: true,
    displayGroup: "即梦",
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
  const base = normalizeProviderBaseUrl(baseUrl);
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
  const endpointPrefix = VERSION_PREFIXES.find(prefix => suffix === prefix || suffix.startsWith(`${prefix}/`));
  for (const prefix of VERSION_PREFIXES) {
    if (pathname.endsWith(prefix) && endpointPrefix) {
      return `${base.slice(0, -prefix.length)}${suffix}`;
    }
  }
  return `${base}${suffix}`;
}

function inferFromModel(model, provider) {
  return normalizeProtocolId(inferModelConfiguration(model, provider).protocol, "openai");
}

function publicDefinition(definition, adapterMap, scope = "") {
  const definitionCapabilities = capabilitiesFor(definition, scope === "platform" ? "platform" : "model");
  return {
    id: definition.id,
    label: scope === "model" ? definition.modelLabel || definition.label : definition.label,
    modelLabel: definition.modelLabel || definition.label,
    summary: definition.summary,
    categories: [...(definition.categories || [])],
    capabilities: [...definitionCapabilities],
    runtimeProtocol: definition.id,
    platformVisible: Boolean(definition.platformVisible),
    modelVisible: Boolean(definition.modelVisible),
    requiresApimartHostForOpenAi: Boolean(definition.requiresApimartHostForOpenAi),
    advanced: Boolean(definition.advanced),
    legacyAdapter: Boolean(definition.legacyAdapter),
    displayGroup: definition.displayGroup || "其他",
    connectionType: definition.connectionType || "http",
    adapterId: definition.adapterId || "",
    runnable: !definition.adapterId || (typeof adapterMap.get(definition.adapterId)?.execute === "function" && adapterMap.get(definition.adapterId)?.available !== false),
    adapter: Boolean(definition.adapterId),
    compatiblePlatformProtocols: Object.entries(COMPATIBLE_MODEL_PROTOCOLS)
      .filter(([, modelProtocols]) => modelProtocols.includes(definition.id))
      .map(([platformProtocol]) => platformProtocol),
  };
}

function createProtocolRegistry({ adapters = {}, getCustomProtocols = () => [] } = {}) {
  const adapterMap = new Map(Object.entries(adapters || {}).map(([id, adapter]) => [normalizeProtocolId(id, id), adapter]));
  const custom = id => (getCustomProtocols() || []).find(item => item.id === String(id || "").trim().toLowerCase()) || null;
  const runtimeId = id => normalizeProtocolId(id) || normalizeProtocolId(custom(id)?.runtimeProtocol);
  const effectivePlatformDefinition = id => {
    const profile = custom(id);
    const runtime = normalizeProtocolId(profile?.runtimeProtocol || id);
    const base = DEFINITIONS[runtime];
    if (!base || profile?.scope !== "platform") return base || null;
    return {
      ...base,
      id: profile.id,
      runtimeProtocol: runtime,
      label: profile.label || base.label,
      summary: profile.summary || base.summary,
      auth: profile.auth || base.auth,
      headers: { ...(base.headers || {}), ...(profile.headers || {}) },
      models: profile.models || base.models,
      executor: profile.executor || base.executor,
      custom: true,
    };
  };
  const platformProtocolId = id => {
    const profile = custom(id);
    if (profile) return profile.scope === "platform" ? profile.id : "";
    const runtime = runtimeId(id);
    if (!runtime) return "";
    if (runtime === "apimart") return "openai";
    if (DEFINITIONS[runtime]?.platformVisible) return runtime;
    return Object.keys(COMPATIBLE_MODEL_PROTOCOLS).find(platform => COMPATIBLE_MODEL_PROTOCOLS[platform].includes(runtime)) || "";
  };
  const normalizePlatformProtocol = (id, fallback = "") => platformProtocolId(id) || fallback;
  const checkScope = (id, scope, { allowLegacy = true } = {}) => {
    const profile = custom(id);
    if (profile && profile.scope !== scope) throw Object.assign(new Error(`协议 ${id} 不适用于${scope === "platform" ? "平台" : "模型"}。`), { code: "invalid_protocol_scope" });
    const builtin = DEFINITIONS[normalizeProtocolId(id)];
    const visible = scope === "platform" ? "platformVisible" : "modelVisible";
    const legacyModelProfile = scope === "model" && allowLegacy && (builtin?.legacyModelProfile || builtin?.legacyAdapter);
    const legacyPlatformProfile = scope === "platform" && allowLegacy && (builtin?.legacyAdapter || builtin?.legacyPlatformProfile);
    if (builtin && !builtin[visible] && !legacyModelProfile && !legacyPlatformProfile) throw Object.assign(new Error(`协议 ${id} 不适用于${scope === "platform" ? "平台" : "模型"}。`), { code: "invalid_protocol_scope" });
    return profile;
  };
  const isApimartCompatibleProvider = provider => {
    let host = "";
    try { host = new URL(provider?.baseUrl || provider?.base_url || "").hostname.toLowerCase(); } catch {}
    return host === "apimart.ai"
      || host.endsWith(".apimart.ai")
      || host === "apib.ai"
      || host.endsWith(".apib.ai");
  };
  const isCompatible = (platformProtocol, modelProtocol, provider = null) => {
    const platformRuntime = runtimeId(platformProtocolId(platformProtocol));
    const modelRuntime = runtimeId(modelProtocol);
    if (!platformRuntime || !modelRuntime) return false;
    if ((COMPATIBLE_MODEL_PROTOCOLS[platformRuntime] || []).includes(modelRuntime)) return true;
    return platformRuntime === "openai"
      && ["gemini", "midjourney"].includes(modelRuntime)
      && isApimartCompatibleProvider(provider);
  };
  const compatiblePlatformsFor = modelProtocol => {
    const modelRuntime = runtimeId(modelProtocol);
    const platforms = Object.entries(COMPATIBLE_MODEL_PROTOCOLS)
      .filter(([, modelProtocols]) => modelProtocols.includes(modelRuntime))
      .map(([platformProtocol]) => platformProtocol);
    if (["gemini", "midjourney"].includes(modelRuntime) && !platforms.includes("openai")) platforms.push("openai");
    return platforms.filter(platformProtocol => platformProtocol !== "apimart");
  };
  const assertCompatible = (platformProtocol, modelProtocol, provider = null) => {
    if (isCompatible(platformProtocol, modelProtocol, provider)) return true;
    throw Object.assign(new Error("所选模型协议不兼容当前平台协议。请使用该平台支持的模型 profile。"), { code: "incompatible_protocols" });
  };
  function inferConfiguration(model, provider = {}) {
    const object = typeof model === "string" ? { id: model } : model || {};
    const profile = checkScope(object.protocol || object.modelProtocol, "model");
    const selectedPlatform = platformProtocolId(provider.protocol || provider.providerProtocol);
    const site = checkScope(selectedPlatform, "platform");
    const inferred = inferModelConfiguration(object, site ? { ...provider, protocol: site.runtimeProtocol, providerProtocol: site.runtimeProtocol } : provider);
    if (profile) {
      const capabilities = Array.isArray(object.capabilities) ? object.capabilities : profile.capabilities;
      if (capabilities.some(capability => !profile.capabilities.includes(capability))) throw Object.assign(new Error("模型能力超出所选自定义协议的支持范围。"), { code: "invalid_protocol_capabilities" });
      assertCompatible(selectedPlatform, profile.id, provider);
      return { ...inferred, protocol: profile.id, capabilities: [...capabilities] };
    }
    const protocol = normalizeProtocolId(inferred.protocol) || inferred.protocol;
    if (selectedPlatform) assertCompatible(selectedPlatform, protocol, provider);
    const modelProfile = custom(protocol);
    const runtimeDefinition = DEFINITIONS[runtimeId(protocol)];
    const supportedCapabilities = modelProfile?.scope === "model"
      ? modelProfile.capabilities
      : capabilitiesFor(runtimeDefinition);
    const explicitlyConfigured = Array.isArray(object.capabilities);
    const capabilities = (Array.isArray(inferred.capabilities) ? inferred.capabilities : [])
      .filter(capability => supportedCapabilities.includes(capability));
    if (explicitlyConfigured && capabilities.length !== inferred.capabilities.length) {
      throw Object.assign(new Error("模型能力超出所选模型协议的支持范围。"), { code: "invalid_protocol_capabilities" });
    }
    return { ...inferred, protocol, capabilities };
  }

  return Object.freeze({
    get(protocolId) {
      return DEFINITIONS[runtimeId(protocolId)] || null;
    },
    getEffectivePlatform: effectivePlatformDefinition,
    getBuiltin: protocolId => DEFINITIONS[normalizeProtocolId(protocolId)] || null,
    getCustom: custom,
    runtimeId,
    platformProtocolId,
    normalizePlatformProtocol,
    checkScope,
    isCompatible,
    assertCompatible,
    compatiblePlatformsFor,
    presentation(protocolId) {
      const definition = DEFINITIONS[runtimeId(protocolId)];
      if (!definition) return null;
      return {
        platformVisible: Boolean(definition.platformVisible),
        modelVisible: Boolean(definition.modelVisible),
        advanced: Boolean(definition.advanced),
        displayGroup: definition.displayGroup || "其他",
        modelLabel: definition.modelLabel || definition.label,
        connectionType: definition.connectionType || "http",
      };
    },
    describe(protocolId, requestedScope = "") {
      const customProfile = custom(protocolId);
      const definition = DEFINITIONS[runtimeId(protocolId)];
      if (!definition) return null;
      const scope = requestedScope || customProfile?.scope || "model";
      const effectiveDefinition = customProfile?.scope === "platform" ? effectivePlatformDefinition(protocolId) : definition;
      return {
        id: protocolId,
        runtimeProtocol: definition.id,
        adapterId: definition.adapterId || "",
        ...contractFor(effectiveDefinition, adapterMap.get(definition.adapterId), scope),
        ...(customProfile?.scope === "platform" ? {
          schemaVersion: customProfile.schemaVersion,
          kind: customProfile.kind,
          executor: customProfile.executor,
          auth: customProfile.auth,
          headers: customProfile.headers,
          models: customProfile.models,
        } : {}),
      };
    },
    listPublic() {
      return Object.values(DEFINITIONS)
        .filter(definition => definition.id !== "apimart")
        .map(definition => publicDefinition(definition, adapterMap));
    },
    listForScope(scope, { includeAdvanced = true, includeRuntimeIds = [], includeInternal = false } = {}) {
      const visible = scope === "platform" ? "platformVisible" : "modelVisible";
      const retained = new Set(includeRuntimeIds.map(id => runtimeId(id)));
      return Object.values(DEFINITIONS)
        .filter(definition => definition.id !== "apimart" || includeInternal)
        .filter(definition => definition[visible] || retained.has(definition.id))
        .filter(definition => includeAdvanced || !definition.advanced || retained.has(definition.id))
        .map(definition => publicDefinition(definition, adapterMap, scope));
    },
    listModelProfiles(platformProtocol, { includeAdvanced = true, includeRuntimeIds = [] } = {}) {
      const retained = new Set(includeRuntimeIds.map(id => runtimeId(id)));
      return Object.values(DEFINITIONS)
        .filter(definition => definition.modelVisible || retained.has(definition.id))
        .filter(definition => !definition.legacyModelProfile || retained.has(definition.id))
        .filter(definition => isCompatible(platformProtocol, definition.id))
        .filter(definition => includeAdvanced || !definition.advanced)
        .map(definition => publicDefinition(definition, adapterMap, "model"));
    },
    candidatesForBaseUrl(baseUrl, currentProtocol = "") {
      let raw = "";
      try { raw = new URL(baseUrl).hostname.toLowerCase(); } catch {}
      const candidates = [];
      if (raw === "api.anthropic.com") candidates.push("anthropic");
      if (raw === "generativelanguage.googleapis.com") candidates.push("gemini");
      if (raw === "apimart.ai" || raw.endsWith(".apimart.ai")) candidates.push("openai");
      if (raw === "apib.ai") candidates.push("openai");
      if (/runninghub/.test(raw)) candidates.push("runninghub");
      if (/^https?:\/\/(?:127\.0\.0\.1|localhost):8188(?:\/|$)/i.test(String(baseUrl))) candidates.push("comfyui");
      const current = platformProtocolId(currentProtocol);
      if (custom(current)) return [current];
      if (current) candidates.push(current);
      candidates.push("openai");
      return [...new Set(candidates)];
    },
    inferModelProtocol(model, provider) {
      const inferred = inferConfiguration(model, provider);
      return runtimeId(inferred.protocol) || inferred.protocol;
    },
    inferModelConfiguration(model, provider) {
      return inferConfiguration(model, provider);
    },
    getAdapter(protocolId) {
      const definition = DEFINITIONS[runtimeId(protocolId)];
      return definition?.adapterId ? adapterMap.get(definition.adapterId) || null : null;
    },
  });
}

module.exports = {
  createProtocolRegistry,
  joinProtocolUrl,
  normalizeProtocolId,
};
