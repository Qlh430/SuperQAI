"use strict";
const { MODEL_CAPABILITIES, assertCapability } = require("./model-capabilities");
const { CAPABILITY_LABELS, capabilitiesFor } = require("./protocol-contracts");
const SETTINGS_KEY = "custom_protocols";
function failure(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
const SAFE_HEADER = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,96}$/;
const SAFE_SELECTOR = /^\$(?:\.[A-Za-z_][A-Za-z0-9_-]*)*(?:\[\*\])?$/;

function normalizeDeclarativePlatform(value) {
  const hasDeclarative = ["schemaVersion", "kind", "executor", "auth", "headers", "models"].some(key => Object.hasOwn(value, key));
  if (!hasDeclarative) return {};
  if (value.schemaVersion !== "dx-protocol/v2") throw failure("invalid_protocol_schema", "平台协议 schemaVersion 必须为 dx-protocol/v2。");
  if (value.kind !== "provider") throw failure("invalid_protocol_kind", "平台协议 kind 必须为 provider。");
  const executor = value.executor || {};
  if (executor.type !== "declarative") throw failure("invalid_protocol_executor", "平台协议 executor.type 必须为 declarative。");
  const executorEngine = String(executor.engine || ">=1.0.0").trim();
  if (!/^>=\d+\.\d+\.\d+$/.test(executorEngine)) throw failure("invalid_protocol_executor", "executor.engine 必须是类似 >=1.0.0 的版本约束。");
  const output = { schemaVersion: "dx-protocol/v2", kind: "provider", executor: { type: "declarative", engine: executorEngine } };
  if (value.auth !== undefined) {
    const auth = value.auth;
    if (!auth || typeof auth !== "object" || Array.isArray(auth)) throw failure("invalid_protocol_auth", "auth 必须是对象。");
    const type = String(auth.type || "none").trim().toLowerCase();
    if (!["none", "bearer", "api-key-header"].includes(type)) throw failure("invalid_protocol_auth", "auth.type 只支持 none、bearer 或 api-key-header。");
    const header = String(auth.header || (type === "api-key-header" ? "x-api-key" : "authorization")).trim();
    if (type !== "none" && !SAFE_HEADER.test(header)) throw failure("invalid_protocol_auth", "auth.header 不是有效的 HTTP Header 名称。");
    const prefix = String(auth.prefix ?? (type === "bearer" ? "Bearer " : "")).slice(0, 40);
    const credentialRef = String(auth.credentialRef || "api_key").trim().toLowerCase();
    if (!["api_key", "wallet_key"].includes(credentialRef) && type !== "none") throw failure("invalid_protocol_auth", "auth.credentialRef 只支持 api_key 或 wallet_key。");
    output.auth = { type, ...(type !== "none" ? { header, prefix, credentialRef } : {}) };
  }
  if (value.headers !== undefined) {
    if (!value.headers || typeof value.headers !== "object" || Array.isArray(value.headers)) throw failure("invalid_protocol_headers", "headers 必须是对象。");
    const headers = {};
    for (const [key, raw] of Object.entries(value.headers)) {
      if (!SAFE_HEADER.test(key)) throw failure("invalid_protocol_headers", `headers 包含无效名称：${key}`);
      const text = String(raw ?? "");
      if (text.length > 500) throw failure("invalid_protocol_headers", `headers.${key} 过长。`);
      headers[key] = text;
    }
    output.headers = headers;
  }
  if (value.models !== undefined) {
    const models = value.models;
    if (!models || typeof models !== "object" || Array.isArray(models)) throw failure("invalid_protocol_models", "models 必须是对象。");
    const method = String(models.method || "GET").trim().toUpperCase();
    const path = String(models.path || "").trim();
    if (method !== "GET" || !path || /^https?:\/\//i.test(path) || !path.startsWith("/")) throw failure("invalid_protocol_models", "models 目前只支持相对 GET 路径。");
    const response = models.response && typeof models.response === "object" ? models.response : { data: "$.data" };
    const data = String(response.data || "$.data").trim();
    const id = String(response.id || "$.id").trim();
    const name = String(response.name || "$.name").trim();
    if (![data, id, name].every(selector => SAFE_SELECTOR.test(selector))) throw failure("invalid_protocol_models", "models.response 只支持安全的 JSON 路径选择器。");
    output.models = { method, path, response: { data, id, name } };
  }
  return output;
}
function validateCustomProtocol(input, registry) {
  const value = input && typeof input === "object" ? input : {};
  const allowed = ["id", "label", "summary", "scope", "runtimeProtocol", "capabilities", "schemaVersion", "kind", "executor", "auth", "headers", "models"];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw failure("invalid_protocol_field", "协议只支持名称、说明、范围、继承协议和能力配置。");
  const id = String(value.id || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{1,63}$/.test(id)) throw failure("invalid_protocol_id", "协议 ID 请使用 2–64 位字母、数字、点、下划线或短横线，以字母开头。");
  if (registry.getBuiltin(id)) throw failure("protocol_id_reserved", "不能覆盖内置协议。");
  const runtimeProtocol = registry.getBuiltin(String(value.runtimeProtocol || ""))?.id;
  if (!runtimeProtocol) throw failure("invalid_runtime_protocol", "请选择一个内置运行协议作为基础。");
  if (!["platform", "model"].includes(value.scope)) throw failure("invalid_protocol_scope", "协议范围必须为平台或模型。");
  registry.checkScope(runtimeProtocol, value.scope, { allowLegacy: false });
  const label = String(value.label || "").trim();
  if (!label || label.length > 120) throw failure("invalid_protocol_label", "协议名称为必填项，最多 120 个字符。");
  const capabilities = value.scope === "model"
    ? (() => {
      const supported = capabilitiesFor(registry.getBuiltin(runtimeProtocol));
      const requested = value.capabilities === undefined ? supported : value.capabilities;
      if (!Array.isArray(requested) || !requested.length || requested.some(capability => !supported.includes(capability))) throw failure("invalid_protocol_capabilities", "能力必须处于继承协议的支持范围，且至少选择一项。");
      return [...new Set(requested)];
    })()
    : [];
  const declarative = value.scope === "platform" ? normalizeDeclarativePlatform(value) : {};
  return { id, label, summary: String(value.summary || "").trim().slice(0,500), scope:value.scope, runtimeProtocol, ...(value.scope === "model" ? { capabilities } : {}), ...declarative };
}
function createProtocolCenter({ db, store, registry, resolver, engine } = {}) {
  if (!db?.getSetting || !store?.listPublic || !registry?.describe || !resolver?.listCandidates || !engine?.describeExecution) throw new TypeError("Protocol center requires storage, registry and the active routing/execution engines.");
  const custom = () => db.getSetting(SETTINGS_KEY) || [];
  function usageCount(id, scope) {
    return store.listPublic().reduce((count, provider) => count + (scope === "platform" ? Number(String(provider.protocol).toLowerCase() === id) : provider.models.filter(model => String(model.protocol).toLowerCase() === id).length), 0);
  }
  function describe(item, scope, builtin) {
    const contract = registry.describe(item.runtimeProtocol || item.id, scope);
    const capabilities = !builtin && scope === "model" ? item.capabilities : contract.capabilities;
    const supportsOperation = operation => {
      const capability = operation.intent === "llm.chat.stream" ? "llm.chat" : operation.intent;
      return capability && capabilities.includes(capability);
    };
    return { ...contract, ...item, id:item.id, scope, builtin, capabilities,
      compatiblePlatformProtocols: scope === "model"
        ? registry.compatiblePlatformsFor?.(item.id) || item.compatiblePlatformProtocols || []
        : [],
      operations: contract.operations.filter(supportsOperation), usageCount:usageCount(item.id,scope) };
  }
  function list() {
    const providers = store.listPublic();
    const usedPlatformIds = providers.map(provider => provider.protocol || provider.providerProtocol);
    const usedModelIds = providers.flatMap(provider => (provider.models || []).map(model => model.protocol || model.modelProtocol));
    return {
      protocols:registry.listPublic(),
      platformProtocols:[...registry.listForScope("platform", { includeRuntimeIds: usedPlatformIds }).map(item => describe(item,"platform",true)), ...custom().filter(item => item.scope === "platform").map(item => describe(item,"platform",false))],
      modelProtocols:[...registry.listForScope("model", { includeRuntimeIds: usedModelIds }).map(item => describe(item,"model",true)), ...custom().filter(item => item.scope === "model").map(item => describe(item,"model",false))],
      capabilities:MODEL_CAPABILITIES.map(id=>({id,label:CAPABILITY_LABELS[id]})),
    };
  }
  function save(input) {
    const entry = validateCustomProtocol(input,registry);
    const entries = custom();
    const existing = entries.find(item=>item.id===entry.id);
    const capabilitiesChanged = Boolean(existing && entry.scope === "model" && JSON.stringify([...(entry.capabilities || [])].sort()) !== JSON.stringify([...(existing.capabilities || [])].sort()));
    if (existing && usageCount(existing.id,existing.scope) && (entry.scope !== existing.scope || entry.runtimeProtocol !== existing.runtimeProtocol || capabilitiesChanged)) throw failure("protocol_in_use", "该协议正在使用中；请新建协议并切换相关配置后再修改运行方式。",409);
    db.setSetting(SETTINGS_KEY,[...entries.filter(item=>item.id!==entry.id),entry]);
    return describe(entry,entry.scope,false);
  }
  function remove(id) {
    const existing = custom().find(item=>item.id===id);
    if (!existing) throw failure("protocol_not_found","自定义协议不存在。",404);
    if (usageCount(id,existing.scope)) throw failure("protocol_in_use","协议正被站点或模型使用，请先切换这些配置。",409);
    db.setSetting(SETTINGS_KEY,custom().filter(item=>item.id!==id));
    return true;
  }
  function summary(provider, model, reason, intent) {
    let execution;
    try { execution = engine.describeExecution(provider,model,intent); }
    catch (error) { execution = { runnable:false, reason:error?.code === "incompatible_protocols" ? "incompatible-protocols" : "unsupported-operation", runtimeProtocol:"", operation:null }; }
    return { providerId:provider.id, providerName:provider.name, modelId:model.id, modelName:model.displayName||model.id,
      platformProtocol:provider.protocol||provider.providerProtocol, modelProtocol:model.protocol||model.modelProtocol,
      runtimeProtocol:execution.runtimeProtocol, capabilities:[...(model.capabilities||[])],
      operation:execution.operation||null, runnable:execution.runnable, reason:execution.runnable ? reason : execution.reason||"unsupported-operation" };
  }
  function routeTest(input = {}) {
    const intent = assertCapability(input.intent);
    const query = { intent, preferredProviderId:String(input.providerId||input.preferredProviderId||""), preferredModelId:String(input.modelId||input.preferredModelId||"") };
    const candidates = resolver.listCandidates(query).map(candidate=>summary(candidate.provider,candidate.model,candidate.reason,intent));
    const issues = [];
    for (const provider of store.listPublic()) {
      if (query.preferredProviderId && provider.id!==query.preferredProviderId) continue;
      for (const model of provider.models||[]) {
        if (query.preferredModelId && model.id!==query.preferredModelId) continue;
        const missingCapabilities = (model.capabilities||[]).includes(intent) ? [] : [intent];
        const described = summary(provider,model,"administrator-order",intent);
        if (!provider.enabled || missingCapabilities.length || !described.runnable) issues.push({...described,missingCapabilities,reason:!provider.enabled ? "provider-disabled" : missingCapabilities.length ? "missing-capability" : described.reason});
      }
    }
    const selected = candidates[0]||null;
    return { ok:Boolean(selected?.runnable), intent, selected, candidates, issues, autoFallback:resolver.getAutoFallback(), readOnly:true };
  }
  return Object.freeze({list,save,remove,routeTest});
}
module.exports = { createProtocolCenter, validateCustomProtocol, CAPABILITY_LABELS };
