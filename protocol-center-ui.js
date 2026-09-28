(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsProtocolCenter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CAPABILITIES = Object.freeze([
    ["llm.chat", "对话"], ["llm.chat.vision", "识图"], ["llm.tools", "工具"],
    ["image.generate", "生图"], ["image.edit", "修图"], ["video.generate", "视频"], ["audio.generate", "音频"],
  ].map(([id, label]) => ({ id, label })));
  const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const listFor = (catalog, scope) => scope === "platform" ? catalog.platformProtocols : catalog.modelProtocols;
  const scopeLabel = scope => scope === "platform" ? "平台协议" : "模型协议";
  const presentationLabel = (protocol, scope) => scope === "model"
    ? protocol.modelLabel || protocol.label || protocol.id
    : protocol.label || protocol.id;

  function normalizeCatalog(data = {}) {
    const legacy = Array.isArray(data.protocols) ? data.protocols : [];
    const normalize = (entries, scope) => entries.filter(item => item && item.id && item.id !== "apimart").map(item => ({
      ...item, scope, builtin: item.builtin !== false, runtimeProtocol: item.runtimeProtocol || item.id,
      modelLabel: item.modelLabel || item.label || item.id,
      displayGroup: item.displayGroup || (item.builtin === false ? "自定义" : "其他"),
      capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
      compatiblePlatformProtocols: Array.isArray(item.compatiblePlatformProtocols) ? item.compatiblePlatformProtocols : [],
      operations: Array.isArray(item.operations) ? item.operations : Object.entries(item.operations || {}).map(([intent, operation]) => ({ intent, ...operation })),
    }));
    return {
      platformProtocols: normalize(Array.isArray(data.platformProtocols) ? data.platformProtocols : legacy, "platform"),
      modelProtocols: normalize(Array.isArray(data.modelProtocols) ? data.modelProtocols : legacy, "model"),
      capabilities: Array.isArray(data.capabilities) && data.capabilities.length ? data.capabilities : CAPABILITIES,
      editable: Array.isArray(data.platformProtocols) && Array.isArray(data.modelProtocols),
    };
  }

  function protocolOptions(catalog, selected, scope) {
    const normalizedSelected = selected === "apimart"
      ? (scope === "platform" ? "openai" : "openai-images")
      : selected;
    const entries = [...listFor(catalog, scope)];
    if (normalizedSelected && !entries.some(item => item.id === normalizedSelected)) entries.unshift({ id: normalizedSelected, label: `${normalizedSelected}（当前配置，目录中不可用）` });
    if (!entries.length) entries.push({ id: normalizedSelected || "openai", label: normalizedSelected || "OpenAI 兼容" });
    return entries.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === normalizedSelected ? "selected" : ""}>${escapeHtml(presentationLabel(item, scope))}${item.builtin === false ? " · 自定义" : ""}</option>`).join("");
  }

  function modelProfilesForPlatform(catalog, platformProtocol) {
    const platform = catalog.platformProtocols.find(item => item.id === platformProtocol);
    const platformRuntime = platform?.runtimeProtocol || platformProtocol;
    return catalog.modelProtocols.filter((model) => {
      const compatible = model.compatiblePlatformProtocols || [];
      return compatible.length
        ? compatible.includes(platformRuntime)
        : (model.runtimeProtocol || model.id) === platformRuntime;
    });
  }

  function createProtocolCenter(options) {
    const { root, request, render, notify } = options;
    let catalog = normalizeCatalog();
    let routeVersion = 0;
    const state = { scope: "platform", selectedId: "", draft: null, error: "", saving: false, routeBusy: false, routeResult: null, routeError: "", intent: "llm.chat", providerId: "", modelId: "" };
    const providers = () => options.getProviders() || [];
    const selected = () => listFor(catalog, state.scope).find(item => item.id === state.selectedId) || listFor(catalog, state.scope)[0];
    const capabilityLabel = id => catalog.capabilities.find(item => item.id === id)?.label || id;
    const badge = (text, kind = "") => `<span class="settings-protocol-badge ${kind}">${escapeHtml(text)}</span>`;
    const displayLabel = protocol => presentationLabel(protocol, state.scope);
    const platformLabel = id => {
      const platform = catalog.platformProtocols.find(item => item.id === id || item.runtimeProtocol === id);
      return platform ? presentationLabel(platform, "platform") : id;
    };
    const adapterLabel = protocol => protocol.adapterId
      ? platformLabel(protocol.adapterId)
      : protocol.runtimeProtocol;

    function setCatalog(data) {
      catalog = normalizeCatalog(data);
      if (!listFor(catalog, state.scope).some(item => item.id === state.selectedId)) state.selectedId = listFor(catalog, state.scope)[0]?.id || "";
      clearRoute();
    }

    function clearRoute() { routeVersion += 1; state.routeResult = null; state.routeError = ""; }

    function supportedMarkup(protocol) {
      return `<div class="settings-protocol-support" aria-label="支持能力">${catalog.capabilities.map(item => `<span class="${protocol.capabilities.includes(item.id) ? "supported" : "unsupported"}" title="${escapeHtml(item.id)}">${protocol.capabilities.includes(item.id) ? "✓" : "—"} ${escapeHtml(item.label)}</span>`).join("")}</div>`;
    }

    function detailsMarkup(protocol) {
      if (!protocol) return '<div class="settings-provider-empty"><h3>暂时没有协议</h3><p>点击刷新读取协议目录。</p></div>';
      const operations = protocol.operations || [];
      const operationCatalog = protocol.operationCatalog || [];
      const auth = protocol.auth;
      const isCli = protocol.connectionType === "cli";
      const isPlatform = state.scope === "platform";
      const compatiblePlatforms = protocol.compatiblePlatformProtocols || [];
      const operationStatusLabel = status => ({
        implemented: "已接入执行器",
        "legacy-profile": "旧配置兼容",
        "catalog-only": "仅目录，尚未接入执行器",
      })[status] || status || "目录项";
      const operationCatalogMarkup = !isPlatform && operationCatalog.length
        ? `<h4>完整能力目录</h4><div class="settings-protocol-table-wrap"><table class="settings-protocol-table"><thead><tr><th>目录项</th><th>请求路径</th><th>状态</th><th>允许参数</th></tr></thead><tbody>${operationCatalog.map(operation => `<tr><td>${escapeHtml(operation.label || operation.id || operation.intent || "目录项")}${operation.intent ? ` <small>${escapeHtml(operation.intent)}</small>` : ""}</td><td><code>${escapeHtml(operation.method || "")} ${escapeHtml(operation.path || "专用适配器")}</code></td><td>${escapeHtml(operationStatusLabel(operation.status))}</td><td>${operation.parameters?.length ? escapeHtml(operation.parameters.join(", ")) : "由适配器处理"}</td></tr>`).join("")}</tbody></table></div>`
        : "";
      return `<article class="settings-protocol-details">
        <header><div><p>${isPlatform ? `协议 ID · ${escapeHtml(protocol.id)}` : `模型 Profile · ${escapeHtml(displayLabel(protocol))}`}</p><h3>${escapeHtml(displayLabel(protocol))}</h3><span>${escapeHtml(protocol.summary || "使用已接入的运行协议处理请求。")}</span></div>${badge(protocol.builtin ? "内置" : "自定义")}</header>
        <div class="settings-protocol-status">${badge(protocol.runnable === false ? "执行暂不可用" : "运行适配已接入", protocol.runnable === false ? "warning" : "ready")}${badge(`${Number(protocol.usageCount) || 0} 处引用`)}</div>
        ${protocol.limitation ? `<p class="settings-protocol-note settings-protocol-limitation">${escapeHtml(protocol.limitation)}</p>` : ""}
        ${isPlatform ? "" : `<h4>支持能力</h4>${supportedMarkup(protocol)}`}
        <dl class="settings-protocol-facts"><div><dt>${isPlatform ? "运行协议" : "执行适配器"}</dt><dd><code>${escapeHtml(isPlatform ? protocol.runtimeProtocol : adapterLabel(protocol))}</code></dd></div>${isPlatform ? `<div><dt>${isCli ? "连接" : "鉴权"}</dt><dd>${isCli ? "本机 dreamina CLI 登录" : auth ? `${escapeHtml(auth.type || "协议鉴权")}${auth.header ? ` · <code>${escapeHtml(auth.header)}</code>` : ""}` : "由专用适配器处理"}</dd></div><div><dt>模型列表</dt><dd>${isCli ? "由本机 CLI 连接处理" : protocol.models?.path ? `<code>GET ${escapeHtml(protocol.models.path)}</code>` : "由专用适配器处理，或手动添加模型"}</dd></div>` : `<div><dt>兼容平台</dt><dd>${compatiblePlatforms.length ? compatiblePlatforms.map(id => `<code title="${escapeHtml(id)}">${escapeHtml(platformLabel(id))}</code>`).join("、") : "与同一运行协议的平台配套使用"}</dd></div><div><dt>职责</dt><dd>请求路径、请求体与响应解析</dd></div>`}</dl>
        ${isPlatform
          ? '<h4>执行映射</h4><p class="settings-protocol-note">平台协议不定义模型请求路径、请求体或响应解析；这些内容由模型协议负责。</p>'
          : `<h4>执行映射</h4><div class="settings-protocol-table-wrap"><table class="settings-protocol-table"><thead><tr><th>能力</th><th>请求路径</th><th>处理方式</th><th>允许参数</th></tr></thead><tbody>${operations.map(operation => `<tr><td>${escapeHtml(capabilityLabel(operation.intent))}</td><td><code>${escapeHtml(operation.method || "")} ${escapeHtml(operation.path || "专用适配器")}</code></td><td>${escapeHtml(operation.mode || "request")}</td><td>${operation.parameters?.length ? escapeHtml(operation.parameters.join(", ")) : "由适配器处理"}</td></tr>`).join("") || '<tr><td colspan="4">当前模型协议尚未接入可执行映射。</td></tr>'}</tbody></table></div>`}
        ${operationCatalogMarkup}
        <p class="settings-protocol-note">${isCli ? "即梦通过本机 dreamina CLI 执行；不需要 Base URL 或 API Key。" : isPlatform ? "平台协议统一管理 Base URL、鉴权和模型目录。" : "模型协议只定义请求路径、参数和响应解析；保存时会检查其与平台是否兼容。"}</p>
        <footer>${!protocol.builtin ? `<button type="button" class="settings-primary-button" data-protocol-edit>编辑协议</button><button type="button" class="settings-danger-button" data-protocol-delete ${protocol.usageCount > 0 ? 'disabled title="请先在 API 设置中解除引用"' : ""}>删除协议</button>${protocol.usageCount > 0 ? '<span>解除引用后可删除。</span>' : ""}` : '<span>内置协议只读，可基于它新建自定义协议。</span>'}</footer>
      </article>`;
    }

    function editorMarkup() {
      const draft = state.draft;
      const runtimes = listFor(catalog, state.scope).filter(item => item.builtin && item.runnable !== false);
      const runtime = runtimes.find(item => item.id === draft.runtimeProtocol);
      const locked = draft.usageCount > 0;
      const declarative = state.scope === "platform" ? declarativeJsonFor(draft, runtime) : "";
      return `<form class="settings-protocol-form" data-protocol-form>
        <header><p>${draft.editing ? "EDIT PROTOCOL" : "CUSTOM PROTOCOL"}</p><h3>${draft.editing ? "编辑" : "新建"}${scopeLabel(state.scope)}</h3><span>${state.scope === "platform" ? "平台协议只管理连接、鉴权、请求头和模型目录。" : "模型协议定义请求路径、响应解析与模型能力。"}</span></header>
        <div class="settings-provider-fields"><label><span>协议 ID</span><input name="id" value="${escapeHtml(draft.id)}" pattern="[a-z][a-z0-9._-]{1,63}" minlength="2" maxlength="64" placeholder="例如 team-openai" ${draft.editing ? "readonly" : ""} required /></label><label><span>显示名称</span><input name="label" value="${escapeHtml(draft.label)}" maxlength="120" required /></label><label class="wide"><span>说明</span><textarea name="summary" rows="3" maxlength="500">${escapeHtml(draft.summary)}</textarea></label><label class="wide"><span>继承运行协议</span><select name="runtimeProtocol" data-protocol-runtime ${locked ? "disabled" : ""}>${runtimes.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.runtimeProtocol ? "selected" : ""}>${escapeHtml(presentationLabel(item, state.scope))}</option>`).join("")}</select></label>${state.scope === "platform" ? `<label class="wide"><span>DX OS 平台协议 JSON</span><textarea name="protocolJson" data-protocol-json rows="14" spellcheck="false">${escapeHtml(declarative)}</textarea><small>声明平台连接、鉴权、请求头和模型目录；保存前会校验 JSON 与安全路径。</small></label>` : ""}</div>
        ${state.scope === "model" ? `<fieldset class="settings-protocol-capabilities"><legend>允许的模型能力</legend><div class="settings-capability-list">${catalog.capabilities.map(item => `<label class="settings-capability-chip"><input type="checkbox" data-protocol-capability="${escapeHtml(item.id)}" ${draft.capabilities.includes(item.id) ? "checked" : ""} ${locked || !runtime?.capabilities.includes(item.id) ? "disabled" : ""} /><span>${escapeHtml(item.label)}</span></label>`).join("")}</div><p>${locked ? "此协议已被引用，可修改名称和说明；能力与运行协议需先解除引用。" : "至少保留一种能力，可限定为运行协议支持能力的子集。"}</p></fieldset>` : ""}
        ${state.error ? `<p class="settings-protocol-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        <footer><button type="button" class="settings-secondary-button" data-protocol-cancel ${state.saving ? "disabled" : ""}>取消</button><button type="submit" class="settings-primary-button" ${state.saving ? "disabled" : ""}>${state.saving ? "保存中…" : "保存协议"}</button></footer>
      </form>`;
    }

    function declarativeJsonFor(draft, runtime) {
      const value = draft?.schemaVersion || draft?.kind || draft?.executor || draft?.auth || draft?.headers || draft?.models
        ? {
          schemaVersion: draft.schemaVersion || "dx-protocol/v2",
          kind: draft.kind || "provider",
          executor: draft.executor || { type: "declarative", engine: ">=1.0.0" },
          ...(draft.auth !== undefined ? { auth: draft.auth } : runtime?.auth ? { auth: runtime.auth } : {}),
          ...(draft.headers !== undefined ? { headers: draft.headers } : runtime?.headers ? { headers: runtime.headers } : { headers: {} }),
          ...(draft.models !== undefined ? { models: draft.models } : runtime?.models?.path ? { models: { method: "GET", path: runtime.models.path, response: { data: "$.data", id: "$.id", name: "$.name" } } } : {}),
        }
        : {
          schemaVersion: "dx-protocol/v2",
          kind: "provider",
          executor: { type: "declarative", engine: ">=1.0.0" },
          auth: runtime?.auth || { type: "none" },
          headers: runtime?.headers || {},
          models: runtime?.models?.path ? { method: "GET", path: runtime.models.path, response: { data: "$.data", id: "$.id", name: "$.name" } } : { method: "GET", path: "/v1/models", response: { data: "$.data", id: "$.id", name: "$.name" } },
        };
      return JSON.stringify(value, null, 2);
    }

    function parseDeclarativeJson(form) {
      if (state.scope !== "platform") return {};
      const field = form.elements.protocolJson;
      if (!field) return {};
      const text = String(field.value || "").trim();
      if (!text) throw new Error("请填写平台协议 JSON。 ");
      let value;
      try { value = JSON.parse(text); } catch (error) { throw new Error(`平台协议 JSON 无效：${error.message}`); }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("平台协议 JSON 必须是对象。 ");
      return value;
    }

    function reasonLabel(reason) {
      return ({ "pinned-selection": "按指定服务或模型选择", "administrator-order": "按管理员配置顺序选择", "health-priority": "按当前可用性优先选择", "adapter-unavailable": "运行适配暂不可用", "missing-capability": "模型缺少所需能力", "unsupported-operation": "运行协议不支持此能力", "incompatible-protocols": "模型协议与平台协议不兼容", "missing-api-key": "尚未配置密钥", "provider-disabled": "提供商未启用", "model-disabled": "模型未启用" })[reason] || reason || "按当前配置匹配";
    }

    function candidateMarkup(candidate) {
      return `<div class="settings-route-candidate"><strong>${escapeHtml(candidate.providerName || candidate.providerId)} / ${escapeHtml(candidate.modelName || candidate.modelId)}</strong><span>平台：${escapeHtml(candidate.platformProtocol)} → 模型：${escapeHtml(candidate.modelProtocol)} → 运行：${escapeHtml(candidate.runtimeProtocol)}</span><code>${escapeHtml(candidate.operation?.method || "")} ${escapeHtml(candidate.operation?.path || "专用适配器")}</code><small>${escapeHtml(reasonLabel(candidate.reason))}</small></div>`;
    }

    function routeResultMarkup() {
      if (state.routeError) return `<p class="settings-protocol-error" role="alert">${escapeHtml(state.routeError)}</p>`;
      const result = state.routeResult;
      if (!result) return "";
      return `<div class="settings-route-result" data-protocol-route-result role="status"><strong class="${result.ok ? "settings-route-ok" : "settings-route-warning"}">${result.ok ? "配置检查通过" : "配置检查未通过"}</strong><p>本次检查未向上游发送请求，不代表实际调用成功。自动回退：${result.autoFallback ? "已启用" : "已关闭"}。</p>${result.selected ? candidateMarkup(result.selected) : '<p>没有符合条件的可用路由。</p>'}${result.candidates?.length > 1 ? `<details><summary>其他候选（${result.candidates.length - 1}）</summary>${result.candidates.filter(candidate => candidate.providerId !== result.selected?.providerId || candidate.modelId !== result.selected?.modelId).map(candidateMarkup).join("")}</details>` : ""}${result.issues?.length ? `<details open><summary>配置问题（${result.issues.length}）</summary><ul>${result.issues.map(issue => `<li><strong>${escapeHtml(issue.providerName || issue.providerId)} / ${escapeHtml(issue.modelName || issue.modelId)}</strong><span>${escapeHtml(reasonLabel(issue.reason))}${issue.missingCapabilities?.length ? `；缺少：${issue.missingCapabilities.map(id => `${escapeHtml(capabilityLabel(id))} (${escapeHtml(id)})`).join("、")}` : ""}</span></li>`).join("")}</ul></details>` : ""}</div>`;
    }

    function routeMarkup() {
      const provider = providers().find(item => item.id === state.providerId);
      return `<section class="settings-protocol-route"><header><div><h3>路由检查</h3><p>按已保存的提供商、模型和能力检查执行选择，不会生成内容或访问上游。</p></div>${badge("只读")}</header><form data-protocol-route-form><div class="settings-provider-fields"><label><span>请求能力</span><select name="intent">${catalog.capabilities.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.intent ? "selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(item.id)}</option>`).join("")}</select></label><label><span>提供商</span><select name="providerId" data-protocol-route-provider><option value="">按配置自动选择</option>${providers().map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.providerId ? "selected" : ""}>${escapeHtml(item.name || item.id)}${item.enabled === false ? "（未启用）" : ""}</option>`).join("")}</select></label><label><span>模型</span><select name="modelId" ${provider ? "" : "disabled"}><option value="">按能力自动选择</option>${(provider?.models || []).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.modelId ? "selected" : ""}>${escapeHtml(item.displayName || item.id)}</option>`).join("")}</select></label><button type="submit" class="settings-primary-button" ${state.routeBusy || !catalog.editable ? "disabled" : ""}>${state.routeBusy ? "检查中…" : "检查路由"}</button></div></form>${routeResultMarkup()}</section>`;
    }

    function sidebarMarkup(protocols, active) {
      const groups = new Map();
      for (const protocol of protocols) {
        const group = protocol.displayGroup || (protocol.builtin ? "其他" : "自定义");
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(protocol);
      }
      return [...groups.entries()].map(([group, entries]) => `<section class="settings-protocol-group"><h3>${escapeHtml(group)}</h3>${entries.map(item => `<div class="settings-provider-item ${active?.id === item.id && !state.draft ? "active" : ""}"><button type="button" data-protocol-select="${escapeHtml(item.id)}" aria-pressed="${active?.id === item.id && !state.draft}"><span><strong>${escapeHtml(displayLabel(item))}</strong><small>${escapeHtml(item.id)} · ${item.builtin ? "内置" : "自定义"}</small></span></button></div>`).join("")}</section>`).join("");
    }

    function markup() {
      const protocols = listFor(catalog, state.scope);
      const active = selected();
      return `<section class="settings-page settings-protocol-page" data-settings-section="protocols"><header><p>PROTOCOL CENTER</p><h2>协议中心</h2><span>查看真实接口映射，复用协议配置，检查模型如何被选择。</span></header><div class="settings-protocol-toolbar"><div class="settings-segmented" role="group" aria-label="协议范围">${["platform", "model"].map(scope => `<button type="button" data-protocol-scope="${scope}" aria-pressed="${state.scope === scope}" class="${state.scope === scope ? "active" : ""}">${scopeLabel(scope)}</button>`).join("")}</div><button type="button" class="settings-secondary-button" data-protocol-refresh>刷新</button><button type="button" class="settings-primary-button" data-protocol-new ${!catalog.editable || state.saving ? "disabled" : ""}>新建${scopeLabel(state.scope)}</button></div><p class="settings-protocol-explanation">${state.scope === "platform" ? "平台协议定义服务连接、鉴权和模型目录。" : "模型协议定义单个模型可执行的请求与能力。"}${catalog.editable ? "" : " 当前服务仅提供基础协议目录。"}</p><div class="settings-provider-workspace settings-protocol-workspace"><aside class="settings-provider-sidebar"><div class="settings-provider-sidebar-heading"><div><strong>${scopeLabel(state.scope)}</strong><span>${protocols.length} 个协议</span></div></div><div class="settings-provider-list">${sidebarMarkup(protocols, active)}</div></aside><div class="settings-provider-editor">${state.draft ? editorMarkup() : detailsMarkup(active)}</div></div>${routeMarkup()}</section>`;
    }

    function readDraft() {
      const form = root.querySelector("[data-protocol-form]");
      if (!form) return state.draft;
      return { ...state.draft, id: form.elements.id.value.trim(), label: form.elements.label.value.trim(), summary: form.elements.summary.value.trim(), runtimeProtocol: form.elements.runtimeProtocol.value, capabilities: state.scope === "model" ? [...form.querySelectorAll("[data-protocol-capability]:checked")].map(input => input.dataset.protocolCapability) : [], ...(state.scope === "platform" && form.elements.protocolJson ? { protocolJson: form.elements.protocolJson.value } : {}) };
    }

    async function refresh() {
      const data = await request("/api/protocols");
      setCatalog(data);
      options.onCatalog(data);
    }

    async function onClick(event) {
      const button = event.target.closest("[data-protocol-scope], [data-protocol-select], [data-protocol-new], [data-protocol-edit], [data-protocol-delete], [data-protocol-cancel], [data-protocol-refresh]");
      if (!button) return false;
      if (state.saving) return true;
      try {
        if (button.hasAttribute("data-protocol-scope")) { state.scope = button.dataset.protocolScope; state.selectedId = listFor(catalog, state.scope)[0]?.id || ""; state.draft = null; state.error = ""; }
        else if (button.hasAttribute("data-protocol-select")) { state.selectedId = button.dataset.protocolSelect; state.draft = null; state.error = ""; }
        else if (button.hasAttribute("data-protocol-new")) {
          const active = selected();
          const runtime = listFor(catalog, state.scope).find(item => item.builtin && item.runnable !== false && item.id === active?.runtimeProtocol) || listFor(catalog, state.scope).find(item => item.builtin && item.runnable !== false);
          if (!runtime) throw new Error("没有可继承的运行协议。");
          state.draft = { id: "", label: "", summary: "", scope: state.scope, runtimeProtocol: runtime.id, capabilities: state.scope === "model" ? [...runtime.capabilities] : [] }; state.error = "";
        } else if (button.hasAttribute("data-protocol-edit")) { const active = selected(); if (active && !active.builtin) state.draft = { ...active, capabilities: [...active.capabilities], editing: true }; state.error = ""; }
        else if (button.hasAttribute("data-protocol-cancel")) { state.draft = null; state.error = ""; }
        else if (button.hasAttribute("data-protocol-refresh")) { await refresh(); }
        else if (button.hasAttribute("data-protocol-delete")) {
          const active = selected();
          if (!active || active.builtin || active.usageCount > 0) return true;
          if (!globalThis.confirm?.(`删除自定义协议“${active.label || active.id}”？`)) return true;
          await request(`/api/protocols/custom/${encodeURIComponent(active.id)}`, { method: "DELETE" });
          await refresh(); notify("协议已删除");
        }
      } catch (error) { notify(error.message); }
      render(); return true;
    }

    function onChange(event) {
      if (event.target.matches("[data-protocol-runtime]")) {
        state.draft = readDraft();
        state.draft.capabilities = state.scope === "model" ? [...(listFor(catalog, state.scope).find(item => item.id === state.draft.runtimeProtocol)?.capabilities || [])] : [];
        state.error = ""; render(); return true;
      }
      if (event.target.closest("[data-protocol-route-form]")) {
        if (state.draft) state.draft = readDraft();
        const form = event.target.closest("form");
        state.intent = form.elements.intent.value; state.providerId = form.elements.providerId.value;
        state.modelId = event.target.matches("[data-protocol-route-provider]") ? "" : form.elements.modelId.value;
        clearRoute(); render(); return true;
      }
      return false;
    }

    async function onSubmit(event) {
      const isEdit = event.target.matches("[data-protocol-form]");
      if (!isEdit && !event.target.matches("[data-protocol-route-form]")) return false;
      event.preventDefault();
      if (isEdit) {
        if (state.saving) return true;
        state.draft = readDraft();
        if (state.scope === "model" && !state.draft.capabilities.length) { state.error = "至少选择一种运行协议支持的能力。"; render(); return true; }
        state.saving = true; state.error = ""; render();
        try {
          const { id, label, summary, scope, runtimeProtocol, capabilities } = state.draft;
          const declarative = parseDeclarativeJson(root.querySelector("[data-protocol-form]"));
          const data = await request("/api/protocols/custom", { method: "POST", body: { id, label, summary, scope, runtimeProtocol, ...(scope === "model" ? { capabilities } : {}), ...(scope === "platform" ? declarative : {}) } });
          state.selectedId = data.protocol?.id || id;
          await refresh(); state.draft = null; notify("协议已保存，可在 API 设置中选择");
        } catch (error) { state.error = error.message; }
        finally { state.saving = false; render(); }
      } else {
        if (state.routeBusy) return true;
        if (state.draft) state.draft = readDraft();
        const form = event.target;
        const body = { intent: form.elements.intent.value, ...(form.elements.providerId.value ? { providerId: form.elements.providerId.value } : {}), ...(form.elements.modelId.value ? { modelId: form.elements.modelId.value } : {}) };
        state.routeBusy = true; clearRoute(); render();
        const version = routeVersion;
        try { const result = await request("/api/protocols/route-test", { method: "POST", body }); if (version === routeVersion) state.routeResult = result; }
        catch (error) { if (version === routeVersion) state.routeError = error.message; }
        finally { state.routeBusy = false; render(); }
      }
      return true;
    }

    return { setCatalog, clearRoute, markup, onClick, onChange, onSubmit };
  }

  return Object.freeze({ normalizeCatalog, protocolOptions, modelProfilesForPlatform, createProtocolCenter });
});
