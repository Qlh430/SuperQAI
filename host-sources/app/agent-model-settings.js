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

  function getRoute() {
    const current = snapshot();
    const available = new Set(current.models.map(selectionKey));
    const requested = current.configured
      ? [current.settings.primary, ...current.settings.candidates]
      : current.models.map(item => ({ providerId: item.providerId, modelId: item.modelId }));
    const candidateOrder = requested.filter(item => item && available.has(selectionKey(item)));
    if (current.configured && !candidateOrder.length) {
      throw codedError(
        "AGENT_MODEL_SETTINGS_UNAVAILABLE",
        "Agent 主模型和候选模型当前都不可用，请在 Agent 设置中重新选择。",
        503,
      );
    }
    return {
      configured: current.configured,
      candidateOrder,
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
