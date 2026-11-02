"use strict";
const { MODEL_CAPABILITIES } = require("./model-capabilities");
const CAPABILITY_LABELS = Object.freeze({ "llm.chat": "对话", "llm.chat.vision": "识图", "llm.tools": "工具", "image.generate": "生图", "image.edit": "修图", "video.generate": "视频", "audio.generate": "音频" });
const ADAPTER_CAPABILITIES = Object.freeze({
  apimart: ["image.generate", "image.edit"], "image-relay": ["image.generate", "image.edit"],
  comfyui: ["video.generate"], runninghub: ["llm.chat", "image.generate", "image.edit", "video.generate"],
  "video-adapter": ["video.generate"], "audio-adapter": ["audio.generate"],
  "jimeng-cli": ["image.generate", "image.edit", "video.generate"],
});
function operationsFor(definition, scope = "model") {
  if (!definition) return {};
  if (scope === "platform") return definition.platformOperations || {};
  return definition.modelOperations || definition.operations || {};
}
function operationCatalogFor(definition, scope = "model") {
  if (!definition || scope === "platform") return [];
  if (Array.isArray(definition.operationCatalog)) return definition.operationCatalog.map(operation => ({ ...operation, parameters: Array.isArray(operation.parameters) ? [...operation.parameters] : [] }));
  return Object.entries(operationsFor(definition, scope)).map(([intent, operation]) => ({ id: intent, label: intent, intent, ...operation, parameters: Array.isArray(operation.parameters) ? [...operation.parameters] : [] }));
}
function capabilitiesFor(definition, scope = "model") {
  if (scope === "platform") return Array.isArray(definition?.platformCapabilities) ? [...definition.platformCapabilities] : [];
  return definition?.adapterId ? [...(ADAPTER_CAPABILITIES[definition.adapterId] || [])]
    : Object.keys(operationsFor(definition, scope)).filter(key => MODEL_CAPABILITIES.includes(key));
}
function operationFor(definition, intent) {
  const operation = operationsFor(definition, "model")?.[intent];
  if (operation) return {
    method: operation.method || "POST",
    path: operation.path,
    mode: operation.stream ? "stream" : "request",
    parameters: Array.isArray(operation.parameters) ? [...operation.parameters] : [],
  };
  if (!capabilitiesFor(definition).includes(intent)) return null;
  const adapter = definition?.adapterId;
  if (adapter === "apimart") return { method: "POST", path: definition?.id === "midjourney" ? "/v1/midjourney/generations" : "/v1/images/generations", mode: "task-or-result", parameters: [] };
  if (adapter === "image-relay") return { method: "POST", path: "/v1/api/generate", mode: "task-or-result", parameters: [] };
  if (adapter === "comfyui") return { method: "POST", path: "已配置的本机工作流", mode: "workflow", parameters: [] };
  if (adapter === "jimeng-cli") return { method: "CLI", path: "本机 dreamina CLI", mode: "local-cli", parameters: [] };
  return { method: "POST", path: "站点 Base URL", mode: "custom-adapter", parameters: [] };
}
function executionModeFor(mode) {
  const value = String(mode || "request").toLowerCase();
  if (value === "stream") return "stream";
  if (["task-or-result", "async-task", "poll"].includes(value)) return "async-task";
  if (["local-cli", "cli"].includes(value)) return "cli";
  if (value === "workflow") return "workflow";
  return "sync";
}
function contractFor(definition, adapter, scope = "model") {
  const capabilities = capabilitiesFor(definition, scope);
  const generic = ["runninghub", "video-adapter", "audio-adapter"].includes(definition?.adapterId);
  const localCli = definition?.connectionType === "cli";
  // Capabilities describe what a model can do. Operations describe how that
  // capability is executed, so operation variants such as `llm.chat.stream`
  // must remain visible even though they are not selectable capabilities.
  const declaredOperations = Object.keys(operationsFor(definition, "model"));
  const operationIntents = scope === "platform"
    ? []
    : [...new Set([...declaredOperations, ...capabilities])];
  const operations = operationIntents
    .map(intent => {
      const operation = operationFor(definition, intent);
      return operation ? { intent, ...operation } : null;
    })
    .filter(Boolean);
  const executionModes = [...new Set(operations.map(operation => executionModeFor(operation.mode)))];
  return {
    capabilities,
    auth: definition?.auth ? { type: definition.auth.type, header: definition.auth.header } : localCli || definition?.adapterId === "comfyui" ? null : { type: "bearer", header: "authorization" },
    models: definition?.models ? { path: definition.models.path } : definition?.adapterId === "apimart" ? { path: "/v1/models" } : null,
    operations,
    executionModes,
    asyncTask: executionModes.includes("async-task"),
    asyncTaskContract: executionModes.includes("async-task") ? {
      submit: "提交一次任务并取得 task_id",
      status: "按 task_id 查询状态，不重复提交",
      result: "任务完成后解析媒体或结果",
      failure: "将失败状态归一化并保留任务上下文",
      resume: "保留 provider、model、baseUrl 和 task_id 后继续查询",
    } : null,
    operationCatalog: operationCatalogFor(definition, scope),
    runnable: !definition?.adapterId || (typeof adapter?.execute === "function" && adapter.available !== false),
    limitation: generic ? "通用转发接口；需要站点支持当前请求格式，未包含该厂商的全部专用接口。" : "",
  };
}
module.exports = { CAPABILITY_LABELS, capabilitiesFor, operationFor, contractFor };
