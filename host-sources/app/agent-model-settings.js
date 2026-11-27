"use strict";

const AGENT_MODEL_SETTINGS_KEY = "agent_model_settings";
const AGENT_REQUIRED_CAPABILITIES = Object.freeze(["llm.chat", "llm.chat.vision", "llm.tools"]);

function codedError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, safeMessage: message, statusCode });
}

function selection(value) {
  const providerId = String(value?.providerId || "").trim();
  const modelId = String(value?.modelId || "").trim();
  return providerId && modelId ? { providerId, modelId } : null;
}

function selectionKey(value) {
  const normalized = selection(value);
  return normalized ? `${normalized.providerId}\n${normalized.modelId}` : "";
}

function normalizeStoredSettings(value = {}) {
  const primary = selection(value?.primary);
  const seen = new Set(primary ? [selectionKey(primary)] : []);
  const candidates = [];
  for (const item of Array.isArray(value?.candidates) ? value.candidates : []) {
    const normalized = selection(item);
    const key = selectionKey(normalized);
    if (!normalized || seen.has(key) || candidates.length >= 32) continue;
    seen.add(key);
    candidates.push(normalized);
  }
  return { primary, candidates };
}

function createAgentModelSettingsService({ db, store } = {}) {
  if (!db || typeof db.getSetting !== "function" || typeof db.setSetting !== "function") {
    throw new TypeError("Agent model settings require a compatible system database.");
  }
  if (!store || typeof store.listInternal !== "function") {
    throw new TypeError("Agent model settings require a compatible Provider Store.");
  }

  function listModels() {
    const output = [];
    for (const provider of store.listInternal()) {
      if (!provider?.enabled) continue;
      for (const model of Array.isArray(provider.models) ? provider.models : []) {
        const capabilities = new Set(Array.isArray(model.capabilities) ? model.capabilities : []);
        if (!AGENT_REQUIRED_CAPABILITIES.every(capability => capabilities.has(capability))) continue;
        output.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId: model.id,
          modelName: model.displayName || model.id,
          capabilities: [...model.capabilities],
        });
      }
    }
    return output;
  }

  function snapshot() {
    const settings = normalizeStoredSettings(db.getSetting(AGENT_MODEL_SETTINGS_KEY) || {});
    const models = listModels();
    const available = new Set(models.map(selectionKey));
    const unavailable = [];
    if (settings.primary && !available.has(selectionKey(settings.primary))) {
      unavailable.push({ ...settings.primary, role: "primary" });
    }
    settings.candidates.forEach(item => {
      if (!available.has(selectionKey(item))) unavailable.push({ ...item, role: "candidate" });
    });
    return {
      configured: Boolean(settings.primary),
      settings,
      models,
      unavailable,
    };
  }

  function save(value = {}) {
    const next = normalizeStoredSettings(value);
    if (!next.primary) throw codedError("invalid_agent_model", "请选择 Agent 主模型。");
    const available = new Set(listModels().map(selectionKey));
    const invalid = [next.primary, ...next.candidates].find(item => !available.has(selectionKey(item)));
    if (invalid) {
      throw codedError("invalid_agent_model", "所选模型不可用，或未同时支持对话、识图和工具调用。");
    }
    db.setSetting(AGENT_MODEL_SETTINGS_KEY, next);
    return snapshot();
  }

  function getRoute(options = {}) {
    const current = snapshot();
    const autoFallback = Boolean(store.getAutoFallback?.());
    const required = options.requiredCapabilities || AGENT_REQUIRED_CAPABILITIES;
    const available = new Set(store.listInternal().filter(provider => provider.enabled).flatMap(provider => (
      (provider.models || []).filter(model => required.every(capability => model.capabilities?.includes(capability)))
        .map(model => selectionKey({ providerId: provider.id, modelId: model.id }))
    )));
    const primary = selection(options.primary) || current.settings.primary
      || selection(current.models[0]);
    const requested = [primary, ...(autoFallback ? current.settings.candidates : [])];
    const candidateOrder = requested.filter(item => item && available.has(selectionKey(item)));
    const uniqueOrder = candidateOrder.filter((item, index) => candidateOrder.findIndex(other => selectionKey(item) === selectionKey(other)) === index);
    if (!uniqueOrder.length) {
      throw codedError(
        "AGENT_MODEL_SETTINGS_UNAVAILABLE",
        autoFallback
          ? "主模型与已配置候选均不可用或缺少任务所需能力，请检查模型设置。"
          : "主模型不可用或缺少任务所需能力；模型服务自动切换已关闭，请检查设置。",
        503,
      );
    }
    return {
      configured: current.configured,
      autoFallback,
      candidateOrder: uniqueOrder,
      unavailable: current.unavailable,
    };
  }

  return Object.freeze({
    get: snapshot,
    save,
    getRoute,
    listModels,
  });
}

module.exports = {
  AGENT_MODEL_SETTINGS_KEY,
  AGENT_REQUIRED_CAPABILITIES,
  createAgentModelSettingsService,
  normalizeStoredSettings,
  selectionKey,
};
