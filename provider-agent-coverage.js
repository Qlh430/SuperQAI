"use strict";

const AGENT_REQUIREMENTS = Object.freeze(["llm.chat", "llm.tools"]);
const MEDIA_ROLES = Object.freeze([
  { role: "image-tool", capabilityPrefix: "image.", label: "图片" },
  { role: "video-tool", capabilityPrefix: "video.", label: "视频" },
  { role: "audio-tool", capabilityPrefix: "audio.", label: "音频" },
]);

function protocolContract(registry, model = {}) {
  if (!registry || typeof registry.describe !== "function") return null;
  try {
    return registry.describe(model.protocol || model.modelProtocol, "model");
  } catch {
    return null;
  }
}

function includesOperation(contract, intent) {
  return Array.isArray(contract?.operations)
    && contract.operations.some(operation => operation?.intent === intent);
}

function supportsCapability(contract, capability) {
  return Array.isArray(contract?.capabilities)
    && contract.capabilities.includes(capability)
    && includesOperation(contract, capability);
}

function mediaRoleFor(capabilities) {
  return MEDIA_ROLES.find(item => [...capabilities].some(capability => capability.startsWith(item.capabilityPrefix))) || null;
}

function analyzeModel(model = {}, registry) {
  const capabilities = new Set(Array.isArray(model.capabilities) ? model.capabilities : []);
  const contract = protocolContract(registry, model);
  const contractCapabilities = new Set(Array.isArray(contract?.capabilities) ? contract.capabilities : []);
  const protocolRunnable = Boolean(contract && contract.runnable !== false);
  const mediaRole = mediaRoleFor(capabilities);
  const hasConfiguredLlmCapability = [...capabilities].some(capability => capability.startsWith("llm."));
  const isMainModel = hasConfiguredLlmCapability || (!mediaRole && String(model.type || "").toLowerCase() !== "other");

  if (!isMainModel && mediaRole) {
    const supportedMediaCapabilities = [...capabilities].filter(capability => (
      capability.startsWith(mediaRole.capabilityPrefix)
      && protocolRunnable
      && contractCapabilities.has(capability)
      && includesOperation(contract, capability)
    ));
    const available = supportedMediaCapabilities.length > 0;
    return {
      id: String(model.id || ""),
      displayName: String(model.displayName || model.id || ""),
      protocol: String(model.protocol || model.modelProtocol || ""),
      role: mediaRole.role,
      state: available ? "tool" : "missing",
      supportedAgentCapabilities: available ? [mediaRole.label.toLowerCase()] : [],
      missingCapabilities: [],
      reason: available
        ? `可由 Agent 作为${mediaRole.label}工具调用，不作为 Agent 主模型。`
        : `当前模型协议无法执行${mediaRole.label}请求，请检查模型协议配置。`,
    };
  }

  if (!isMainModel) {
    return {
      id: String(model.id || ""),
      displayName: String(model.displayName || model.id || ""),
      protocol: String(model.protocol || model.modelProtocol || ""),
      role: "excluded",
      state: "excluded",
      supportedAgentCapabilities: [],
      missingCapabilities: [],
      reason: "此模型用于嵌入、排序或其他专项任务，不参与 Agent 主模型覆盖率。",
    };
  }

  const hasChat = capabilities.has("llm.chat")
    && supportsCapability(contract, "llm.chat");
  const hasTools = capabilities.has("llm.tools")
    && supportsCapability(contract, "llm.tools");
  const hasVision = capabilities.has("llm.chat.vision")
    && supportsCapability(contract, "llm.chat.vision");
  const protocolHasTools = protocolRunnable && supportsCapability(contract, "llm.tools");

  let state = "missing";
  let reason = "此模型不具备 Agent 对话与工具调用能力。";
  if (!protocolRunnable) {
    reason = "模型协议当前不可执行，不能交给 Agent 使用。";
  } else if (hasChat && hasTools) {
    state = "ready";
    reason = hasVision ? "对话、工具和识图配置匹配；上游能力尚未实测。" : "对话与工具配置匹配；上游能力尚未实测。";
  } else if (hasChat && protocolHasTools) {
    state = "configurable";
    reason = "模型协议支持工具调用，但当前配置尚未启用；启用后可作为 Agent 主模型。";
  } else if (hasChat) {
    state = "partial";
    reason = "当前模型协议仅支持对话，不能执行 Agent 工具任务。";
  }

  const missingCapabilities = AGENT_REQUIREMENTS.filter(capability => (
    capability === "llm.chat" ? !hasChat : !hasTools
  ));
  return {
    id: String(model.id || ""),
    displayName: String(model.displayName || model.id || ""),
    protocol: String(model.protocol || model.modelProtocol || ""),
    role: "agent-main",
    state,
    supportedAgentCapabilities: [
      ...(hasChat ? ["chat"] : []),
      ...(hasTools ? ["tools"] : []),
      ...(hasVision ? ["vision"] : []),
    ],
    missingCapabilities,
    reason,
  };
}

function analyzeProviderAgentCoverage({ provider = {}, models = [], registry, source = "saved" } = {}) {
  const results = (Array.isArray(models) ? models : []).map(model => analyzeModel(model, registry));
  const mainModels = results.filter(model => model.role === "agent-main");
  return {
    providerId: String(provider.id || ""),
    providerName: String(provider.name || provider.id || ""),
    source: source === "live" ? "live" : "saved",
    checkedAt: new Date().toISOString(),
    summary: {
      total: mainModels.length,
      ready: mainModels.filter(model => model.state === "ready").length,
      configurable: mainModels.filter(model => model.state === "configurable").length,
      partial: mainModels.filter(model => model.state === "partial").length,
      missing: mainModels.filter(model => model.state === "missing").length,
      visionReady: mainModels.filter(model => model.state === "ready" && model.supportedAgentCapabilities.includes("vision")).length,
      mediaTools: results.filter(model => model.state === "tool").length,
    },
    models: results,
  };
}

module.exports = {
  AGENT_REQUIREMENTS,
  analyzeProviderAgentCoverage,
};
