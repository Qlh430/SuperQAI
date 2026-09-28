(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsSystemSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const display = globalThis.AiOsDisplay || require("./ai-os-display");
  const protocolUi = globalThis.AiOsProtocolCenter || require("./protocol-center-ui");
  const modelParameters = globalThis.AiOsModelParameters || require("./model-parameter-controls");
  const modelTestUi = globalThis.AiOsModelTestUi || require("./model-test-ui");
  const comfyUi = globalThis.AiOsComfySettings || require("./comfyui-settings-ui");
  const localModelsUi = globalThis.AiOsLocalModels || require("./local-models-ui");
  const { THEMES, SCALES, DEFAULT_PREFERENCES, normalizePreferences, resolveTheme, applyPreferences } = display;
  const CAPABILITIES = Object.freeze([
    ["llm.chat", "对话"],
    ["llm.chat.vision", "识图"],
    ["llm.tools", "工具"],
    ["image.generate", "生图"],
    ["image.edit", "修图"],
    ["video.generate", "视频"],
    ["audio.generate", "音频"],
  ]);
  const APIMART_RECOMMENDED_PROVIDER = Object.freeze({
    name: "APIMart",
    baseUrl: "https://apib.ai",
    protocol: "openai",
    networkMode: "direct",
    recommendedPlatform: "apimart",
    registrationUrl: "https://apimart.ai/zh/register",
  });
  const SECTION_DEFINITIONS = Object.freeze([
    { id: "appearance", label: "外观", icon: "◐", group: "个人" },
    { id: "account", label: "账户", icon: "●", group: "个人" },
    { id: "system", label: "系统信息", icon: "⌁", group: "系统" },
    { id: "host", label: "主机管理", icon: "⌂", group: "管理", admin: true },
    { id: "providers", label: "API 设置", icon: "✦", group: "管理", admin: true },
    { id: "agent", label: "Agent 设置", icon: "◇", group: "管理", admin: true },
    { id: "skills", label: "Skill 管理", icon: "◈", group: "管理", admin: true },
    { id: "comfyui", label: "ComfyUI", icon: "↗", group: "管理", admin: true },
    { id: "models", label: "本地模型", icon: "▤", group: "管理", admin: true },
    { id: "protocols", label: "协议中心", icon: "⇄", group: "管理", admin: true },
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sectionIdsForRole(role) {
    return SECTION_DEFINITIONS.filter((section) => !section.admin || role === "superadmin").map((section) => section.id);
  }

  function testRouteForCapabilities(capabilities) {
    const active = new Set(Array.isArray(capabilities) ? capabilities : []);
    if (active.has("llm.chat")) return "/api/providers/test";
    if (active.has("image.generate")) return "/api/providers/test-image";
    if (active.has("video.generate")) return "/api/providers/test-video";
    if (active.has("audio.generate")) return "/api/providers/test-audio";
    if (active.has("llm.chat.vision")) return "/api/providers/test-vision";
    return "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function notifyProviderCatalogChanged(action, detail = {}) {
    if (typeof globalThis?.dispatchEvent !== "function" || typeof globalThis?.CustomEvent !== "function") return;
    globalThis.dispatchEvent(new globalThis.CustomEvent("ai-os-provider-catalog-changed", {
      detail: {
        action: String(action || "updated"),
        ...detail,
        at: Date.now(),
      },
    }));
  }

  function agentSelectionValue(value) {
    const providerId = String(value?.providerId || "").trim();
    const modelId = String(value?.modelId || "").trim();
    return providerId && modelId ? JSON.stringify([providerId, modelId]) : "";
  }

  function parseAgentSelectionValue(value) {
    try {
      const [providerId, modelId] = JSON.parse(String(value || ""));
      return String(providerId || "").trim() && String(modelId || "").trim()
        ? { providerId: String(providerId).trim(), modelId: String(modelId).trim() }
        : null;
    } catch {
      return null;
    }
  }

  function modelProtocolId(model) {
    return String(model?.protocol || model?.modelProtocol || "").trim();
  }

  // A Dreamina image model used to be saved under its bare version ("5.0"); the
  // client now publishes it as "jimeng-5.0". Both name the same local model, so a
  // saved row is still recognised instead of being offered as a new one.
  function jimengModelAliases(value) {
    const id = String(value || "").trim();
    if (!/^(?:jimeng[-_ ]?)?\d+(?:\.\d+)+(?:pro)?$/i.test(id)) return [id];
    const bare = id.replace(/^jimeng[-_ ]?/i, "");
    return [...new Set([id, bare, `jimeng-${bare}`])];
  }

  function modelDiscoverySelectionState(discoveredModels = [], savedModels = []) {
    const savedIds = new Set((savedModels || []).flatMap(model => jimengModelAliases(model?.id)).filter(Boolean));
    return (discoveredModels || []).map(model => ({
      id: String(model?.id || ""),
      selected: jimengModelAliases(model?.id).some(alias => savedIds.has(alias)),
    }));
  }

  function uniqueDiscoveredModels(discoveryModels = []) {
    const seenIds = new Set();
    return (discoveryModels || []).filter(model => {
      const id = String(model?.id || "");
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }

  function selectNewDiscoveredModels(discoveryModels = [], selectedIds = [], existingModels = []) {
    const selected = selectedIds instanceof Set
      ? new Set([...selectedIds].map(id => String(id)))
      : new Set((selectedIds || []).map(id => String(id)));
    const addedIds = new Set((existingModels || []).flatMap(model => jimengModelAliases(model?.id)).filter(Boolean));
    const additions = [];
    for (const model of discoveryModels || []) {
      const id = String(model?.id || "");
      if (!id || !selected.has(id) || addedIds.has(id)) continue;
      additions.push(model);
      for (const alias of jimengModelAliases(id)) addedIds.add(alias);
    }
    return additions;
  }

  function isApimartCompatibleHost(baseUrl) {
    try {
      const host = new URL(String(baseUrl || "")).hostname.toLowerCase();
      return host === "apimart.ai"
        || host.endsWith(".apimart.ai")
        || host === "apib.ai"
        || host.endsWith(".apib.ai");
    } catch {
      return false;
    }
  }

  function createRecommendedApimartProvider(existingProvider, id, apiKey) {
    const existing = existingProvider && typeof existingProvider === "object" ? existingProvider : {};
    return {
      ...existing,
      id: String(existing.id || id || "").trim(),
      name: String(existing.name || APIMART_RECOMMENDED_PROVIDER.name).trim(),
      baseUrl: String(existing.baseUrl || APIMART_RECOMMENDED_PROVIDER.baseUrl).trim(),
      protocol: APIMART_RECOMMENDED_PROVIDER.protocol,
      enabled: existing.enabled !== false,
      source: existing.source === "cli" ? "api" : existing.source || "api",
      cliTool: null,
      models: Array.isArray(existing.models) ? existing.models : [],
      metadata: {
        ...(existing.metadata || {}),
        networkMode: APIMART_RECOMMENDED_PROVIDER.networkMode,
        recommendedPlatform: APIMART_RECOMMENDED_PROVIDER.recommendedPlatform,
      },
      apiKey: String(apiKey || "").trim(),
    };
  }

  function normalizeProviderModels(provider, inferredModels = [], protocolCatalog = protocolUi.normalizeCatalog(), options = {}) {
    const compatibleProfilesFor = model => new Set(selectableModelProfiles(protocolCatalog, provider, modelProtocolId(model)).map(profile => profile.id));
    const inferredById = new Map((inferredModels || []).map(model => [model.id, model]));
    const models = [];
    const removed = [];
    for (const current of provider.models || []) {
      const inferred = inferredById.get(current.id);
      if (
        inferred
        && modelProtocolId(current) !== modelProtocolId(inferred)
        && compatibleProfilesFor(inferred).has(modelProtocolId(inferred))
      ) {
        models.push({
          ...current,
          ...inferred,
          displayName: current.displayName || inferred.displayName || inferred.id,
          sortOrder: current.sortOrder,
          metadata: current.metadata || {},
        });
        continue;
      }
      const selected = modelProtocolId(current);
      const compatible = compatibleProfilesFor(current);
      if (compatible.has(selected)) {
        models.push(current);
        continue;
      }
      if (inferred && compatibleProfilesFor(inferred).has(modelProtocolId(inferred))) {
        models.push({
          ...current,
          ...inferred,
          displayName: current.displayName || inferred.displayName || inferred.id,
          sortOrder: current.sortOrder,
          metadata: current.metadata || {},
        });
        continue;
      }
      removed.push(current.id);
    }
    if (options.includeInferred !== false) {
      for (const inferred of inferredModels || []) {
        if (!models.some(model => model.id === inferred.id) && compatibleProfilesFor(inferred).has(modelProtocolId(inferred))) {
          models.push({ ...inferred, displayName: inferred.displayName || inferred.id });
        }
      }
    }
    return { models, removed };
  }

  function selectableModelProfiles(protocolCatalog = protocolUi.normalizeCatalog(), providerOrPlatform = "", selected = "") {
    const provider = providerOrPlatform && typeof providerOrPlatform === "object"
      ? providerOrPlatform
      : { protocol: providerOrPlatform };
    const platformProtocol = String(provider?.protocol || provider?.providerProtocol || "").trim();
    const compatible = protocolUi.modelProfilesForPlatform(protocolCatalog, platformProtocol);
    const selectedId = String(selected || "").trim();
    const requiresApimartHost = platformProtocol.toLowerCase() === "openai" && !isApimartCompatibleHost(provider?.baseUrl);
    return compatible.filter((profile) => (
      (profile.modelVisible !== false || profile.id === selectedId)
      && (!requiresApimartHost || !profile.requiresApimartHostForOpenAi || profile.id === selectedId)
    ));
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = bytes;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
  }

  const UPDATE_STATUS_LABELS = Object.freeze({
    development: "开发模式",
    idle: "尚未检查",
    checking: "正在检查更新…",
    "up-to-date": "已是最新版本",
    unpublished: "暂无已发布更新",
    available: "发现新版本",
    downloading: "正在下载更新…",
    downloaded: "更新已下载",
    preparing: "正在准备更新…",
    ready: "更新已就绪",
    restarting: "正在重启…",
    updated: "更新完成",
    "rolled-back": "更新失败，已回滚",
    error: "更新未完成",
  });

  function normalizeUpdateComponent(value) {
    const id = String(value?.id || "");
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) return null;
    const previousHash = String(value?.previousHash || "");
    return {
      id,
      label: String(value?.label || id),
      version: String(value?.version || ""),
      previousVersion: String(value?.previousVersion || ""),
      canRollback: value?.canRollback === true || /^[a-f0-9]{64}$/i.test(previousHash),
    };
  }

  function normalizeUpdateStatus(value = {}) {
    const status = Object.hasOwn(UPDATE_STATUS_LABELS, value?.status) ? value.status : "idle";
    const progress = Math.min(1, Math.max(0, Number(value?.progress) || 0));
    const componentChangedCount = Number(value?.componentUpdate?.changedCount);
    const componentTotalCount = Number(value?.componentUpdate?.totalCount);
    const componentDownloadSize = Number(value?.componentUpdate?.downloadSize);
    const componentStateTotal = Number(value?.componentState?.total);
    const componentStateComponents = Array.isArray(value?.componentState?.components)
      ? value.componentState.components.map(normalizeUpdateComponent).filter(Boolean)
      : [];
    const componentState = Number.isSafeInteger(componentStateTotal) && componentStateTotal >= 0
      ? {
        total: componentStateTotal,
        updatedAt: String(value?.componentState?.updatedAt || ""),
        sourceRuntime: String(value?.componentState?.sourceRuntime || ""),
        manifestPresent: value?.componentState?.manifestPresent !== false,
        lastResultStatus: String(value?.componentState?.lastResult?.status || value?.componentState?.lastResultStatus || ""),
        components: componentStateComponents,
      }
      : null;
    const rollbackComponentId = String(value?.componentRollback?.componentId || "");
    const componentRollback = /^[a-z0-9][a-z0-9._-]{1,63}$/.test(rollbackComponentId)
      ? {
        componentId: rollbackComponentId,
        label: String(value.componentRollback.label || rollbackComponentId),
        sourceRuntime: String(value.componentRollback.sourceRuntime || ""),
        fromVersion: String(value.componentRollback.fromVersion || ""),
        toVersion: String(value.componentRollback.toVersion || ""),
      }
      : null;
    return {
      status,
      currentVersion: String(value?.currentVersion || "—"),
      availableVersion: String(value?.availableVersion || ""),
      notes: String(value?.notes || ""),
      size: Number.isFinite(Number(value?.size)) && Number(value.size) >= 0 ? Number(value.size) : null,
      fullSize: Number.isFinite(Number(value?.fullSize)) && Number(value.fullSize) >= 0 ? Number(value.fullSize) : null,
      componentUpdate: Number.isInteger(componentChangedCount) && componentChangedCount > 0
        ? {
          changedCount: componentChangedCount,
          totalCount: Number.isInteger(componentTotalCount) ? componentTotalCount : null,
          downloadSize: Number.isFinite(componentDownloadSize) && componentDownloadSize >= 0 ? componentDownloadSize : null,
          }
          : null,
      componentState,
      componentRollback,
      progress,
      error: String(value?.error || ""),
    };
  }

  function capabilityMarkup(model) {
    const active = new Set(Array.isArray(model?.capabilities) ? model.capabilities : []);
    return CAPABILITIES.map(([id, label]) => `
      <label class="settings-capability-chip">
        <input type="checkbox" data-model-capability="${escapeHtml(id)}" ${active.has(id) ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>`).join("");
  }

  function createSettingsApp(options = {}) {
    const host = options.root;
    if (!host || typeof host.querySelector !== "function") throw new TypeError("System settings requires a root element.");
    if (typeof options.request !== "function") throw new TypeError("System settings requires an authenticated request function.");
    const sessionProvider = typeof options.sessionProvider === "function" ? options.sessionProvider : () => null;
    const notify = typeof options.toast === "function" ? options.toast : () => {};
    const doc = options.document || host.ownerDocument;
    const media = options.media || globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    const updateBridge = options.hostBridge || globalThis.aiOsHost || null;
    const state = {
      section: "appearance",
      preferences: clone(DEFAULT_PREFERENCES),
      providers: [],
      protocols: [],
      protocolCatalog: protocolUi.normalizeCatalog(),
      selectedProviderId: "",
      draftProvider: null,
      autoFallback: true,
      health: null,
      backup: null,
      autostart: null,
      update: null,
      jimengCli: null,
      modelDiscovery: null,
      providerFeedback: null,
      agentCoverage: null,
      agentCoverageRevision: 0,
      agentModels: null,
      agentDraft: null,
      agentPrimaryOpen: false,
      agentSaving: false,
      skills: null,
      skillFilter: "all",
      skillGroupsOpen: {},
      skillBusyId: "",
      recommendationsOpen: false,
      providerRequestRevision: 0,
      protocolChangeRevision: 0,
      loading: false,
    };
    const comfySettings = comfyUi.create({ root: host, request: options.request, toast: notify, render });
    const localModels = localModelsUi.create({ root: host, request: options.request, notify, render });
    let unsubscribeUpdate = null;
    let destroyed = false;
    let cliRevision = 0;
    let cliPoll = null;
    let cliBusy = false;
    // Which button started the work, so a long read names itself instead of
    // leaving the panel looking frozen until the answer arrives.
    let cliAction = "";
    // The last authorization page handed to the browser, so one login attempt
    // opens exactly one tab.
    let cliAuthUrl = "";
    const modelTestDialog = modelTestUi.createModelTestDialog({
      root: host,
      request: options.request,
      onResult(result) {
        if (destroyed || selectedProvider()?.id !== result.providerId) return;
        const row = [...host.querySelectorAll("[data-provider-model]")].find(item => item.dataset.modelId === result.modelId);
        const status = row?.querySelector("[data-model-test-status]");
        if (!status) return;
        const label = result.mode === "image" ? "图片" : "对话";
        status.textContent = result.status === "succeeded"
          ? `${label}测试成功 · ${(result.elapsedMs / 1000).toFixed(1)} 秒`
          : result.status === "pending" ? "任务已提交，尚未返回最终图片"
            : `测试未通过：${result.message || "未返回可用结果"}`;
        status.dataset.kind = result.status === "succeeded" ? "success" : "warning";
      },
    });
    const protocolCenter = protocolUi.createProtocolCenter({
      root: host, request: options.request, render, notify,
      getProviders: () => state.providers,
      onCatalog: updateProtocolCatalog,
    });

    function updateProtocolCatalog(data) {
      state.protocols = Array.isArray(data?.protocols) ? data.protocols : [];
      state.protocolCatalog = protocolUi.normalizeCatalog(data);
      protocolCenter.setCatalog(data);
    }

    function session() { return sessionProvider() || {}; }
    function role() { return String(session()?.user?.role || "user"); }
    function isAdmin() { return role() === "superadmin"; }
    function visibleSections() { return SECTION_DEFINITIONS.filter((section) => !section.admin || isAdmin()); }
    function selectedProvider() {
      return state.draftProvider || state.providers.find((provider) => provider.id === state.selectedProviderId) || null;
    }
    function apiProviders() {
      return state.providers.filter(provider => String(provider?.protocol || "").toLowerCase() !== "comfyui");
    }

    async function initialize() {
      try {
        const data = await options.request("/api/preferences");
        state.preferences = normalizePreferences(data.preferences || data);
        applyPreferences(state.preferences, doc?.documentElement, media);
        render();
      } catch (error) {
        notify(error.message);
      }
    }

    async function load() {
      if (state.loading) return;
      state.loading = true;
      render();
      try {
        const requests = [options.request("/api/preferences"), options.request("/api/system/health")];
        if (isAdmin()) {
          requests.push(options.request("/api/providers"));
          requests.push(options.request("/api/protocols"));
          requests.push(options.request("/api/providers/auto-fallback"));
          requests.push(options.request("/api/system/backup/status"));
          requests.push(options.request("/api/providers/agent-settings"));
          requests.push(options.request("/api/skills"));
        }
        const [preferences, health, providers, protocols, fallback, backup, agentModels, skills] = await Promise.all(requests);
        state.preferences = normalizePreferences(preferences.preferences || preferences);
        state.health = health;
        if (isAdmin()) {
          state.providers = Array.isArray(providers?.providers) ? providers.providers : [];
          updateProtocolCatalog(protocols);
          state.autoFallback = fallback?.enabled !== false;
          state.backup = backup;
          state.agentModels = agentModels;
          state.agentDraft = clone(agentModels?.settings || { primary: null, candidates: [] });
          state.skills = skills || null;
          if (!state.selectedProviderId || !apiProviders().some((provider) => provider.id === state.selectedProviderId)) {
            state.selectedProviderId = apiProviders()[0]?.id || "";
            state.draftProvider = null;
          }
          if (options.hostBridge?.getAutostart) state.autostart = await options.hostBridge.getAutostart();
        }
        if (typeof updateBridge?.getUpdateStatus === "function") {
          try { state.update = normalizeUpdateStatus(await updateBridge.getUpdateStatus()); }
          catch (error) { state.update = normalizeUpdateStatus({ status: "error", error: error?.message || error }); }
        }
        applyPreferences(state.preferences, doc?.documentElement, media);
      } catch (error) {
        notify(error.message);
      } finally {
        state.loading = false;
        render();
      }
    }

    async function savePreferences(next) {
      try {
        const data = await options.request("/api/preferences", { method: "PATCH", body: normalizePreferences(next, state.preferences) });
        state.preferences = normalizePreferences(data.preferences || data);
        applyPreferences(state.preferences, doc?.documentElement, media);
        render();
      } catch (error) { notify(error.message); }
    }

    function navigationMarkup() {
      let previousGroup = "";
      return visibleSections().map((section) => {
        const heading = section.group !== previousGroup ? `<p>${escapeHtml(section.group)}</p>` : "";
        previousGroup = section.group;
        return `${heading}<button type="button" data-settings-nav="${section.id}" class="${state.section === section.id ? "active" : ""}"><i>${section.icon}</i><span>${section.label}</span></button>`;
      }).join("");
    }

    function appearanceMarkup() {
      const preference = state.preferences;
      const themeNames = { light: "浅色", dark: "深色", system: "自动" };
      const scaleNames = { 0.75: "更多空间", 1: "标准", 1.25: "较大文字", 1.5: "大文字", 1.75: "更大文字" };
      const scalePercentages = { 0.75: "75%", 1: "100%", 1.25: "125%", 1.5: "150%", 1.75: "175%" };
      return `<section class="settings-page" data-settings-section="appearance">
        <header><p>APPEARANCE</p><h2>外观</h2><span>你的显示偏好只保存在当前账号。</span></header>
        <div class="settings-theme-grid" role="radiogroup" aria-label="界面主题">
          ${THEMES.map((theme) => `<button type="button" data-settings-theme="${theme}" role="radio" aria-checked="${preference.appearance.theme === theme}" class="${preference.appearance.theme === theme ? "active" : ""}"><span class="settings-theme-preview ${theme}"><i></i><b></b></span><strong>${themeNames[theme]}</strong></button>`).join("")}
        </div>
        <article class="settings-card">
          <div class="settings-row"><div><strong>界面缩放</strong><span>调整菜单、窗口与设置内容的显示大小。</span></div></div>
          <div class="settings-scale-grid" role="radiogroup" aria-label="界面缩放">${SCALES.map((scale) => `<button type="button" data-settings-scale="${scale}" role="radio" aria-checked="${preference.appearance.scale === scale}" class="${preference.appearance.scale === scale ? "active" : ""}"><span class="settings-scale-preview" style="--scale-preview:${scale}"><span class="settings-scale-sample"><span class="settings-scale-sample-dots"><i></i><i></i><i></i></span><span class="settings-scale-sample-title">文字</span><span class="settings-scale-sample-lines"><i></i><i></i></span></span></span><strong>${scaleNames[scale]}</strong><span>${scalePercentages[scale]}</span></button>`).join("")}</div>
          <label class="settings-row settings-toggle-row"><div><strong>减少动态效果</strong><span>降低窗口和界面的动画幅度。</span></div><input type="checkbox" data-settings-animations ${preference.appearance.animations === "reduced" ? "checked" : ""} /><i></i></label>
        </article>
      </section>`;
    }

    function accountMarkup() {
      const user = session().user || {};
      const name = user.displayName || user.username || "当前账号";
      return `<section class="settings-page" data-settings-section="account">
        <header><p>ACCOUNT</p><h2>账户</h2><span>画布、文件、聊天和偏好均按账号隔离。</span></header>
        <article class="settings-account-hero"><i>${escapeHtml(name.slice(0, 1).toUpperCase())}</i><div><h3>${escapeHtml(name)}</h3><span>${isAdmin() ? "超级管理员" : "普通用户"} · ${escapeHtml(user.username || "")}</span></div></article>
        <article class="settings-card settings-detail-list">
          <div><span>登录账号</span><strong>${escapeHtml(user.username || "—")}</strong></div>
          <div><span>账户角色</span><strong>${isAdmin() ? "超级管理员" : "普通用户"}</strong></div>
          <div><span>数据范围</span><strong>个人数据 + 获准共享内容</strong></div>
        </article>
      </section>`;
    }

    function systemMarkup() {
      const health = state.health || {};
      return `<section class="settings-page" data-settings-section="system">
        <header><p>SYSTEM</p><h2>系统信息</h2><span>当前连接的中心主机与局域网服务状态。</span></header>
        <div class="settings-health-grid">
          <article><span>服务状态</span><strong>${health.ok ? "运行正常" : state.loading ? "正在检查…" : "需要检查"}</strong><small>${health.uptime ? `已运行 ${Math.floor(Number(health.uptime) / 60)} 分钟` : "—"}</small></article>
          <article><span>数据磁盘可用</span><strong>${formatBytes(health.freeBytes)}</strong><small>${escapeHtml(health.dataDir || "目录受保护")}</small></article>
          <article><span>局域网地址</span><strong>${escapeHtml(health.lanUrls?.[0] || (health.port ? `端口 ${health.port}` : "—"))}</strong><small>其他设备通过浏览器访问</small></article>
        </div>
        ${updateMarkup()}
      </section>`;
    }

    function componentStateMarkup(update, locked) {
      const components = update.componentState?.components || [];
      if (!components.length) return "";
      return `<details class="settings-component-state">
        <summary><span>组件版本与回滚</span><small>${components.length} 个组件</small></summary>
        <div class="settings-component-list">
          ${components.map((component) => `<div class="settings-component-row">
            <div><strong>${escapeHtml(component.label)}</strong><small>${escapeHtml(component.version || "版本未记录")}${component.previousVersion ? ` · 上一版 ${escapeHtml(component.previousVersion)}` : ""}</small></div>
            ${component.canRollback ? `<button type="button" data-component-rollback="${escapeHtml(component.id)}" ${locked ? "disabled" : ""}>回退</button>` : '<span class="settings-component-current">当前版本</span>'}
          </div>`).join("")}
        </div>
      </details>`;
    }

    function updateMarkup() {
      if (!updateBridge) return `<article class="settings-card settings-update-card settings-update-unavailable">
        <div class="settings-update-heading"><div><span>ONLINE UPDATE</span><h3>在线更新</h3></div><strong>需要桌面便携版</strong></div>
        <p>在线更新仅在桌面便携版中可用。当前浏览器可以继续连接主机，但不能替换正在运行的程序。</p>
      </article>`;
      const update = normalizeUpdateStatus(state.update || {});
      const percent = Math.round(update.progress * 100);
      const busy = ["checking", "downloading", "preparing", "restarting"].includes(update.status);
      const canDownload = update.status === "available";
      const canRestart = ["downloaded", "ready"].includes(update.status);
      const showProgress = ["downloading", "downloaded", "preparing", "ready"].includes(update.status);
      const checkLabel = update.status === "error" || update.status === "rolled-back" ? "重新检查" : "检查更新";
      const componentDetail = update.componentUpdate
        ? `<small>${update.componentUpdate.changedCount}${update.componentUpdate.totalCount ? `/${update.componentUpdate.totalCount}` : ""} 个变化组件${update.componentUpdate.downloadSize !== null ? ` · ${formatBytes(update.componentUpdate.downloadSize)}` : ""}</small>`
        : "";
      const componentStateDetail = update.componentState
        ? `<small>${update.componentState.total} 个活动组件${update.componentState.sourceRuntime ? ` · ${escapeHtml(update.componentState.sourceRuntime)}` : ""}</small>`
        : "";
      const lastRollback = update.componentState?.lastResultStatus === "rolled-back" && update.status !== "rolled-back"
        ? '<p class="settings-update-error" role="status">上次更新启动失败，已回滚到原组件版本。</p>'
        : "";
      const versionDetail = update.availableVersion
        ? `<span>可用版本</span><strong>${escapeHtml(update.availableVersion)}</strong>${componentDetail || (update.size !== null ? `<small>${formatBytes(update.size)}</small>` : "")}`
        : `<span>更新通道</span><strong>${update.status === "development" ? "源码开发环境" : "稳定版"}</strong>`;
      const componentRollbackMessage = update.componentRollback
        ? `<p class="settings-update-message">${escapeHtml(update.componentRollback.label)}：${escapeHtml(update.componentRollback.fromVersion)} → ${escapeHtml(update.componentRollback.toVersion)}，重启后应用。</p>`
        : "";
      const componentLocked = busy || update.status === "ready" || update.status === "development";
      return `<article class="settings-card settings-update-card" data-update-status="${escapeHtml(update.status)}">
        <div class="settings-update-heading"><div><span>ONLINE UPDATE</span><h3>在线更新</h3></div><strong>${escapeHtml(UPDATE_STATUS_LABELS[update.status])}</strong></div>
        <div class="settings-update-versions"><div><span>当前版本</span><strong>${escapeHtml(update.currentVersion)}</strong>${componentStateDetail}</div><div>${versionDetail}</div></div>
        ${update.status === "development" ? '<p class="settings-update-message">源码运行不会使用在线更新。请构建桌面便携版来验证发布更新。</p>' : ""}
        ${update.status !== "development" ? '<p class="settings-update-message">下载期间可继续使用；重启时会备份数据并完成更新。</p>' : ""}
        ${componentRollbackMessage}
        ${lastRollback}
        ${update.notes ? `<div class="settings-update-notes"><strong>版本说明</strong><p>${escapeHtml(update.notes)}</p></div>` : ""}
        ${showProgress ? `<div class="settings-update-progress"><div><span>${update.status === "downloading" ? "下载更新" : "准备安装"}</span><strong>${percent}%</strong></div><progress max="100" value="${percent}" aria-label="更新进度" aria-valuenow="${percent}">${percent}%</progress></div>` : ""}
        ${update.error ? `<p class="settings-update-error" role="alert">${escapeHtml(update.error)}</p>` : ""}
        ${componentStateMarkup(update, componentLocked)}
        <footer>
          ${update.status !== "development" && !canRestart ? `<button type="button" data-update-check ${busy ? "disabled" : ""}>${checkLabel}</button>` : ""}
          ${canDownload ? '<button type="button" class="settings-primary-button" data-update-download>下载并准备更新</button>' : ""}
          ${canRestart ? `<button type="button" class="settings-primary-button" data-update-restart>${update.componentRollback ? "重启并应用组件回退" : "重启并完成更新"}</button>` : ""}
        </footer>
      </article>`;
    }

    function setUpdateStatus(value) {
      state.update = normalizeUpdateStatus(value);
      render();
    }

    async function runUpdateAction(method, pendingStatus) {
      if (typeof updateBridge?.[method] !== "function") return;
      const previous = normalizeUpdateStatus(state.update || {});
      setUpdateStatus({ ...previous, status: pendingStatus, error: "" });
      try {
        const result = await updateBridge[method]();
        if (result && typeof result === "object") setUpdateStatus(result);
      } catch (error) {
        setUpdateStatus({ ...previous, status: "error", error: error?.message || String(error) });
      }
    }

    async function runComponentRollback(componentId) {
      if (typeof updateBridge?.rollbackComponent !== "function") return;
      const id = String(componentId || "");
      if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) return;
      const component = state.update?.componentState?.components?.find((item) => item.id === id);
      if (typeof globalThis.confirm === "function" && !globalThis.confirm(`回退“${component?.label || id}”并在重启后应用？`)) return;
      const previous = normalizeUpdateStatus(state.update || {});
      setUpdateStatus({ ...previous, status: "preparing", error: "", componentRollback: null });
      try {
        const result = await updateBridge.rollbackComponent(id);
        if (result && typeof result === "object") setUpdateStatus(result);
      } catch (error) {
        setUpdateStatus({ ...previous, status: "error", error: error?.message || String(error), componentRollback: null });
      }
    }

    function hostMarkup() {
      const snapshot = state.backup?.snapshots?.[0];
      return `<section class="settings-page" data-settings-section="host">
        <header><p>HOST COMPUTER</p><h2>主机管理</h2><span>这些设置会影响局域网内的所有账号。</span></header>
        <article class="settings-card">
          <label class="settings-row settings-toggle-row"><div><strong>开机自动启动</strong><span>登录 Windows 后自动运行主机服务；关闭不会停止当前服务。</span></div><input type="checkbox" data-host-autostart ${state.autostart?.enabled ? "checked" : ""} ${options.hostBridge ? "" : "disabled"} /><i></i></label>
          <div class="settings-row"><div><strong>系统备份</strong><span>${snapshot ? `最近备份：${new Date(snapshot.createdAt).toLocaleString("zh-CN")}` : "还没有备份"}</span></div><button type="button" class="settings-primary-button" data-host-backup>立即备份</button></div>
        </article>
      </section>`;
    }

    function compatibleModelProfiles(provider = selectedProvider(), selected = "") {
      return selectableModelProfiles(state.protocolCatalog, provider, selected);
    }

    async function inferProviderModels(provider, models) {
      return options.request("/api/providers/infer-protocols", {
        method: "POST",
        body: {
          baseUrl: provider.baseUrl,
          protocol: provider.protocol,
          models: (models || []).map(model => ({ id: model.id })),
        },
      });
    }

    function protocolOptions(selected, scope, provider = selectedProvider()) {
      if (scope !== "model") return protocolUi.protocolOptions({
        ...state.protocolCatalog,
        platformProtocols: state.protocolCatalog.platformProtocols.filter(protocol => protocol.id !== "comfyui" && protocol.runtimeProtocol !== "comfyui"),
      }, selected, scope);
      const modelProtocols = compatibleModelProfiles(provider, selected);
      const resolved = modelProtocols.some(protocol => protocol.id === selected)
        ? selected
        : modelProtocols[0]?.id || "";
      return protocolUi.protocolOptions({ ...state.protocolCatalog, modelProtocols }, resolved, scope);
    }

    function modelMarkup(model, index) {
      const category = discoveryCategory(model);
      const categoryLabel = { llm: "对话", image: "图像", video: "视频", audio: "音频", other: "其他" }[category];
      const profile = state.protocolCatalog.modelProtocols.find(item => item.id === modelProtocolId(model));
      const protocolLabel = profile?.modelLabel || profile?.label || modelProtocolId(model);
      return `<article class="settings-model-row settings-model-compact" data-provider-model data-model-id="${escapeHtml(model.id)}">
        <div class="settings-model-summary"><span class="settings-model-kind" data-kind="${category}">${categoryLabel}</span><div class="settings-model-identity"><strong data-model-summary-name>${escapeHtml(model.id)}</strong><small data-model-summary-protocol>${escapeHtml(protocolLabel)}</small></div><div class="settings-model-actions"><button type="button" data-model-test ${!testRouteForCapabilities(model.capabilities) ? "disabled" : ""}>测试</button><button type="button" data-model-remove aria-label="移除模型">移除</button></div></div>
        <div class="settings-model-test-status" data-model-test-status role="status" aria-live="polite"></div>
        <details class="settings-model-details"><summary>编辑配置<span>协议与默认参数</span></summary>
          <div class="settings-model-heading"><span class="settings-model-order">${index + 1}</span><label><span>模型 ID · 只读</span><input data-model-id-input value="${escapeHtml(model.id)}" readonly aria-label="模型 ID（只读）" title="与接口模型 ID 保持一致，不可修改；需要更换时请移除后重新添加。" /></label></div>
          <div class="settings-model-meta"><label><span>模型协议</span><select data-model-protocol>${protocolOptions(model.protocol || model.modelProtocol, "model", selectedProvider())}</select></label><div class="settings-model-actions"><button type="button" data-model-move="up" aria-label="上移模型" ${index === 0 ? "disabled" : ""}>↑ 上移</button><button type="button" data-model-move="down" aria-label="下移模型" ${index === (selectedProvider()?.models?.length || 0) - 1 ? "disabled" : ""}>↓ 下移</button></div></div>
          <div class="settings-capability-list">${capabilityMarkup(model)}</div>
          ${modelParameters.markup(model)}
        </details>
      </article>`;
    }

    function discoveryCategory(model) {
      const capabilities = new Set(Array.isArray(model?.capabilities) ? model.capabilities : []);
      if (["image.generate", "image.edit"].some(id => capabilities.has(id))) return "image";
      if (capabilities.has("video.generate")) return "video";
      if (capabilities.has("audio.generate")) return "audio";
      if (["llm.chat", "llm.chat.vision", "llm.tools"].some(id => capabilities.has(id))) return "llm";
      return "other";
    }

    function modelDiscoveryMarkup() {
      const discovery = state.modelDiscovery;
      if (!discovery?.models?.length) return "";
      const filter = discovery.filter || "all";
      const labels = { all: "全部", llm: "对话", image: "图片", video: "视频", audio: "音频", other: "其他" };
      const categoryCount = Object.fromEntries(Object.keys(labels).map(key => [key, key === "all" ? discovery.models.length : discovery.models.filter(model => discoveryCategory(model) === key).length]));
      const selectionById = new Map(modelDiscoverySelectionState(discovery.models, selectedProvider()?.models || []).map(item => [item.id, item.selected]));
      const selectedCount = [...selectionById.values()].filter(Boolean).length;
      // Every model from a local client shares one transport, so the tag would be
      // the same on every row; the platform selector above already says which one.
      const showProtocol = discovery.hideProtocol !== true;
      const kindLabels = { llm: "对话模型", image: "图片模型", video: "视频模型", audio: "音频模型", other: "其他能力" };
      return `<section class="settings-model-discovery" data-model-discovery>
        <header><div><strong>发现 ${discovery.models.length} 个模型</strong><span>选择要加入当前站点的模型</span></div><label class="settings-model-discovery-search"><span>搜索</span><input type="search" data-discovery-search value="${escapeHtml(discovery.query || "")}" placeholder="模型 ID 或名称" /></label></header>
        <nav class="settings-model-discovery-filters" aria-label="模型分类">${Object.entries(labels).map(([key, label]) => `<button type="button" data-discovery-filter="${key}" class="${filter === key ? "active" : ""}">${label}<small>${categoryCount[key]}</small></button>`).join("")}</nav>
        <div class="settings-model-discovery-grid">${discovery.models.map((model) => {
          const selected = selectionById.get(String(model?.id || ""));
          const savedStatus = selected ? '<span class="settings-discovered-model-status">已保存</span>' : "";
          // A catalog entry without a display name would print the same text twice,
          // so the second line describes the model instead of repeating its ID.
          const displayName = String(model.displayName || "").trim();
          const secondary = displayName && displayName !== model.id ? model.id : kindLabels[discoveryCategory(model)];
          return `<label class="settings-discovered-model" data-discovery-item data-category="${discoveryCategory(model)}" data-search-text="${escapeHtml([model.id, model.displayName || "", model.protocol || model.modelProtocol || ""].join(" ").toLowerCase())}"><input type="checkbox" data-discovered-model="${escapeHtml(model.id)}" ${selected ? "checked" : ""} /><span class="settings-discovered-model-copy"><strong>${escapeHtml(displayName || model.id)}</strong><small>${escapeHtml(secondary)}</small></span><em>${showProtocol ? `<span>${escapeHtml(model.protocol || model.modelProtocol || "")}</span>` : ""}${savedStatus}</em></label>`;
        }).join("")}</div>
        <footer><span data-discovery-selected>已选择 ${selectedCount} 个</span><div><button type="button" class="settings-model-discovery-add settings-primary-button" data-model-discovery-add${selectedCount === 0 ? " disabled" : ""}>加入所选模型</button><button type="button" class="settings-model-discovery-cancel settings-secondary-button" data-model-discovery-cancel>取消</button></div></footer>
      </section>`;
    }

    function applyDiscoveryFilter() {
      const section = host.querySelector("[data-model-discovery]");
      const discovery = state.modelDiscovery;
      if (!section || !discovery) return;
      const query = String(discovery.query || "").trim().toLowerCase();
      const filter = discovery.filter || "all";
      section.querySelectorAll("[data-discovery-item]").forEach(item => {
        const matchesCategory = filter === "all" || item.dataset.category === filter;
        const matchesQuery = !query || String(item.dataset.searchText || "").includes(query);
        item.hidden = !(matchesCategory && matchesQuery);
      });
      const selected = section.querySelectorAll("[data-discovered-model]:checked").length;
      const summary = section.querySelector("[data-discovery-selected]");
      if (summary) summary.textContent = `已选择 ${selected} 个`;
      const addButton = section.querySelector("[data-model-discovery-add]");
      if (addButton) addButton.disabled = selected === 0;
    }

    function providerSidebarMarkup() {
      const providers = apiProviders();
      return `<aside class="settings-provider-sidebar">
        <div class="settings-provider-sidebar-heading"><div><strong>提供商</strong><span>${providers.length} 个站点</span></div><button type="button" data-provider-new aria-label="新建提供商">＋</button></div>
        <div class="settings-provider-list">${providers.map((provider, index) => `<div class="settings-provider-item ${provider.id === state.selectedProviderId ? "active" : ""}"><button type="button" data-provider-select="${escapeHtml(provider.id)}"><i class="${provider.enabled ? "online" : ""}"></i><span><strong>${escapeHtml(provider.name)}</strong><small>${escapeHtml(provider.protocol)} · ${provider.models?.length || 0} 个模型</small></span></button><span><button type="button" data-provider-move="up" data-provider-id="${escapeHtml(provider.id)}" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-provider-move="down" data-provider-id="${escapeHtml(provider.id)}" ${index === providers.length - 1 ? "disabled" : ""}>↓</button></span></div>`).join("")}</div>
        <button type="button" class="settings-provider-recommendations" data-provider-recommendations><span>推荐 API 平台</span><small>快速填入已验证的预设</small></button>
        <label class="settings-provider-fallback"><span><strong>自动回退</strong><small>未指定模型时按此顺序尝试</small></span><input type="checkbox" data-provider-fallback ${state.autoFallback ? "checked" : ""} /><i></i></label>
      </aside>`;
    }

    function nextProviderId() {
      let index = state.providers.length + 1;
      while (state.providers.some((provider) => provider.id === `provider-${index}`)) index += 1;
      return `provider-${index}`;
    }

    function emptyProvider() {
      return { id: nextProviderId(), name: "新提供商", baseUrl: "", protocol: "openai", enabled: true, models: [] };
    }

    function recommendedApimartProvider() {
      return state.providers.find((provider) => (
        provider?.metadata?.recommendedPlatform === APIMART_RECOMMENDED_PROVIDER.recommendedPlatform
        || isApimartCompatibleHost(provider?.baseUrl)
      )) || null;
    }

    function providerRecommendationsMarkup() {
      if (!state.recommendationsOpen) return "";
      const existing = recommendedApimartProvider();
      const actionLabel = existing ? "更新并配置" : "保存并配置";
      return `<div class="settings-provider-recommendation-modal" role="presentation">
        <section class="settings-provider-recommendation-dialog" role="dialog" aria-modal="true" aria-labelledby="recommended-platform-title">
          <header><div><p>推荐 API 平台</p><h3 id="recommended-platform-title">快速配置常用服务</h3><span>选择预设后仅需填写 API Key。</span></div><button type="button" data-provider-recommendations-close aria-label="关闭">×</button></header>
          <article class="settings-recommended-platform-card" data-recommended-apimart>
            <div class="settings-recommended-platform-brand"><i>M</i><span><strong>APIMart</strong><small>OpenAI 兼容 · 中国大陆访问域名 · 直接连接</small></span></div>
            <p>保存后自动使用已配置的服务地址，不需要填写 Base URL。</p>
            <label><span>API Key</span><input type="password" data-apimart-api-key autocomplete="new-password" placeholder="${existing?.hasApiKey ? "留空则保持现有密钥" : "粘贴 API Key"}" /></label>
            <footer><a href="${APIMART_RECOMMENDED_PROVIDER.registrationUrl}" target="_blank" rel="noopener noreferrer">获取 API Key</a><button type="button" class="settings-primary-button" data-apimart-save>${actionLabel}</button></footer>
          </article>
        </section>
      </div>`;
    }

    function isJimengProvider(provider) { return provider?.protocol === "cli:jimeng"; }
    function jimengPanelMarkup(cli = {}) {
      const stateLabel = cli.signedIn ? "已登录" : (cli.state === "login-running" ? "登录中…" : (cli.state === "ready-signed-out" ? "未登录" : (cli.state === "missing" ? "不可用" : (cli.state || "检查中…"))));
      const loginLabel = cli.signedIn ? "切换账号" : "登录账号";
      return `<section class="settings-jimeng-cli" data-jimeng-cli-panel>
        <header><div><strong>即梦 CLI</strong><p>使用官方 dreamina 客户端登录，不需要填写 API Key。</p></div><em data-jimeng-cli-state>${escapeHtml(stateLabel)}</em></header>
        <div class="settings-jimeng-origin"><p><span>登录来源</span><strong data-jimeng-origin>${escapeHtml(cli.signedIn ? "复用本机官方客户端的登录" : "未检测到本机登录")}</strong></p><small>即梦不会在这里重新登录，也不会随安装包携带账号：客户端直接读取本机 Windows 凭据管理器中的官方登录态，换电脑后需要重新登录。</small></div>
        <dl><div><dt>版本</dt><dd data-jimeng-version>${escapeHtml(cli.version || "—")}</dd></div><div><dt>账户</dt><dd data-jimeng-account>${escapeHtml(cli.account || (cli.signedIn ? "已登录" : "未登录"))}</dd></div><div><dt>积分</dt><dd data-jimeng-credits>${escapeHtml(cli.credits == null ? "—" : String(cli.credits))}</dd></div></dl>
        <p class="settings-jimeng-message" data-jimeng-message role="status">${escapeHtml(cli.message || "")}</p>
        <div class="settings-jimeng-login" data-jimeng-login-box hidden>
          <p>打开下面的授权页面，确认登录后这里会自动完成。</p>
          <a data-jimeng-auth-link rel="noopener noreferrer" target="_blank"></a>
          <p class="settings-jimeng-user-code">用户码 <strong data-jimeng-user-code></strong></p>
        </div>
        <div class="settings-jimeng-actions"><button type="button" data-jimeng-login ${LOGIN_BLOCKED_STATES.has(cli.state) ? "disabled" : ""}>${escapeHtml(loginLabel)}</button><button type="button" data-jimeng-logout>退出登录</button><button type="button" data-jimeng-refresh>刷新状态</button><button type="button" data-jimeng-models>拉取模型</button></div>
      </section>`;
    }

    // A login needs a runnable client, and a login already in flight must not be
    // restarted: anything else would fail silently or cancel the pending approval.
    // A pending approval can still be re-opened (or abandoned) by the operator,
    // so only a client that cannot log in at all disables the button.
    const LOGIN_BLOCKED_STATES = new Set(["missing", "version-incompatible", "runtime-error"]);

    function stopCliSession() {
      cliRevision += 1;
      clearTimeout(cliPoll);
      cliPoll = null;
      cliBusy = false;
      cliAction = "";
      cliAuthUrl = "";
    }

    // The desktop host hands the vendor page to the operator's own browser,
    // which is where a device-code approval has to be completed. A page served
    // to an ordinary browser keeps the visible link instead: a popup opened
    // without a click is blocked there anyway.
    function openJimengAuthUrl(url) {
      const target = String(url || "").trim();
      if (!/^https:\/\/[^\s"'<>]+$/i.test(target)) return false;
      const host = window.aiOsHost;
      if (!host || typeof host.openExternal !== "function") return false;
      try { host.openExternal(target); } catch { return false; }
      return true;
    }

    function cliActive(revision) {
      return !destroyed && revision === cliRevision && state.section === "providers" && isJimengProvider(selectedProvider());
    }

    function updateCliPanel() {
      const panel = host.querySelector("[data-jimeng-cli-panel]");
      if (!panel) return;
      const cli = state.jimengCli || {};
      const labels = { "ready-signed-in": "已登录", "ready-signed-out": "未登录", "login-running": "登录中…", missing: "不可用", "version-incompatible": "版本过低", "login-failed": "登录失败", "runtime-error": "无法运行", error: "状态异常" };
      // Dreamina's user_credit report carries no account name, so a signed-in
      // session must not be labelled "未登录" just because the name is empty.
      const accountLabel = cli.account?.displayName || cli.account?.name || (typeof cli.account === "string" ? cli.account : "");
      const values = { "cli-state": labels[cli.state] || (cli.signedIn ? "已登录" : "检查中…"), origin: cli.signedIn ? "复用本机官方客户端的登录" : "未检测到本机登录", version: cli.version || "—", account: accountLabel || (cli.signedIn ? "已登录" : "未登录"), credits: cli.credits == null ? "—" : String(cli.credits), message: cli.message || "" };
      const waiting = cli.state === "login-running" && Boolean(cli.authUrl);
      const authBox = panel.querySelector("[data-jimeng-login-box]");
      if (authBox) authBox.hidden = !waiting;
      const authLink = panel.querySelector("[data-jimeng-auth-link]");
      if (authLink && waiting) {
        authLink.href = cli.authUrl;
        authLink.textContent = cli.authUrl;
      }
      // The authorization page is opened once per attempt, not on every poll.
      if (waiting && cli.authUrl !== cliAuthUrl) {
        cliAuthUrl = cli.authUrl;
        openJimengAuthUrl(cli.authUrl);
      }
      if (waiting) values["user-code"] = cli.userCode || "—";
      for (const [key, value] of Object.entries(values)) {
        const target = panel.querySelector(`[data-jimeng-${key}]`);
        if (target) target.textContent = value;
      }
      panel.querySelectorAll("button").forEach(button => { button.disabled = cliBusy; });
      // Reading the catalog starts six client processes, so the button says what
      // it is doing instead of looking unresponsive for the wait.
      const modelsButton = panel.querySelector("[data-jimeng-models]");
      if (modelsButton) modelsButton.textContent = cliBusy && cliAction === "models" ? "拉取中…" : "拉取模型";
      // Only a runnable client can carry out a login, so the button stays inert on
      // a missing or broken install. A signed-in account keeps it enabled: the same
      // action switches accounts instead of being refused.
      const loginButton = panel.querySelector("[data-jimeng-login]");
      loginButton.disabled = cliBusy || LOGIN_BLOCKED_STATES.has(cli.state);
      loginButton.textContent = cli.state === "login-running" ? "打开授权页" : cli.signedIn ? "切换账号" : "登录账号";
      panel.querySelector("[data-jimeng-logout]").disabled = cliBusy || cli.signedIn !== true;
    }

    function scheduleCliPoll(revision) {
      clearTimeout(cliPoll);
      if (!cliActive(revision) || state.jimengCli?.state !== "login-running") return;
      cliPoll = setTimeout(() => { cliPoll = null; runCliAction("login-status"); }, 1_500);
    }

    async function runCliAction(action) {
      if (cliBusy || destroyed || !isJimengProvider(selectedProvider())) return;
      const revision = cliRevision;
      const panel = host.querySelector("[data-jimeng-cli-panel]");
      if (!panel) return;
      cliBusy = true;
      cliAction = action;
      updateCliPanel();
      clearTimeout(cliPoll);
      try {
        const get = action === "status" || action === "login-status";
        const result = await options.request(`/api/jimeng-cli/${action}`, get ? undefined : { method: "POST", body: {} });
        if (!cliActive(revision)) return;
        if (result.status || result.cli) state.jimengCli = result.status || result.cli;
        if (action === "models") {
          const ids = result.models || result.status?.models || result.cli?.models || [];
          const configurations = result.modelConfigurations || (await options.request("/api/providers/infer-protocols", { method: "POST", body: { protocol: "cli:jimeng", baseUrl: "", models: ids.map(id => typeof id === "string" ? { id } : id) } })).models || [];
          if (!cliActive(revision)) return;
          // Picking models is the operator's decision, so the client's catalog is
          // offered as a checklist. Models already stored on the provider start
          // ticked, which is what makes adding a new one a single extra click.
          const provider = readProviderForm();
          const discovered = uniqueDiscoveredModels(configurations);
          state.draftProvider = { ...provider, models: provider.models };
          state.modelDiscovery = { models: discovered, platformProtocol: "cli:jimeng", filter: "all", query: "", hideProtocol: true };
          notify(`已读取 ${ids.length} 个模型，请选择要加入的模型`);
          render();
        }

      } catch (error) {
        if (cliActive(revision)) {
          state.jimengCli = { ...(state.jimengCli || {}), state: "error", message: error.message };
          notify(error.message);
        }
      } finally {
        if (cliActive(revision)) {
          cliBusy = false;
          cliAction = "";
          updateCliPanel();
          scheduleCliPoll(revision);
        }
      }
    }

    function enterCliProvider() {
      stopCliSession();
      state.jimengCli = null;
      if (state.section === "providers" && isJimengProvider(selectedProvider())) runCliAction("status");
    }

    function platformLabel(id) {
      return state.protocolCatalog.platformProtocols.find(item => item.id === id)?.label || id;
    }

    function providerFeedbackMarkup() {
      const feedback = state.providerFeedback;
      if (!feedback) return '<span>验证和拉取只在点击时访问上游。</span>';
      return `<span class="settings-provider-feedback" data-kind="${escapeHtml(feedback.kind)}">${escapeHtml(feedback.text)}</span>${feedback.recommendedProtocol ? `<button type="button" data-provider-use-protocol="${escapeHtml(feedback.recommendedProtocol)}">改用 ${escapeHtml(platformLabel(feedback.recommendedProtocol))}</button>` : ""}`;
    }

    function setProviderFeedback(feedback) {
      state.providerFeedback = feedback;
      const status = host.querySelector("[data-provider-status]");
      if (status) status.innerHTML = providerFeedbackMarkup();
      host.querySelectorAll("[data-provider-verify], [data-provider-sync]").forEach(button => { button.disabled = feedback?.kind === "busy"; });
    }

    function invalidateProviderFeedback() {
      state.providerRequestRevision += 1;
      state.protocolChangeRevision += 1;
      state.agentCoverageRevision += 1;
      state.agentCoverage = null;
      setProviderFeedback(null);
    }

    function providerRequestCurrent(revision) {
      return !destroyed && revision === state.providerRequestRevision && state.section === "providers";
    }

    function agentCoverageMarkup(provider) {
      const coverage = state.agentCoverage?.providerId === provider.id ? state.agentCoverage : null;
      const busy = coverage?.status === "busy";
      const result = coverage?.status === "ready" ? coverage.result : null;
      const summary = result?.summary;
      const sourceLabel = result?.source === "live" ? "站点实际列表" : "已选模型";
      const coverageLabel = model => {
        if (model.state === "ready") return "Agent 主模型";
        if (model.state === "configurable") return "可启用 Agent";
        if (model.state === "partial") return "仅支持对话";
        if (model.state === "tool") {
          if (model.role === "image-tool") return "Agent 图片工具";
          if (model.role === "video-tool") return "Agent 视频工具";
          if (model.role === "audio-tool") return "Agent 音频工具";
          return "Agent 媒体工具";
        }
        if (model.role === "excluded") return "其他模型";
        return "暂不可用";
      };
      const summaryMarkup = busy
        ? '<p data-agent-coverage-summary>正在检查模型的 Agent 执行能力…</p>'
        : coverage?.status === "error"
          ? `<p class="warning" data-agent-coverage-summary>${escapeHtml(coverage.message || "检查未完成，请稍后重试。")}</p>`
          : summary
            ? `<p data-agent-coverage-summary><strong>${summary.ready}/${summary.total}</strong> 个主模型配置匹配 · ${escapeHtml(sourceLabel)}${summary.configurable ? ` · ${summary.configurable} 个可启用 Agent` : ""}${summary.partial ? ` · ${summary.partial} 个仅支持对话` : ""}${summary.missing ? ` · ${summary.missing} 个暂不可用` : ""}${summary.mediaTools ? ` · ${summary.mediaTools} 个媒体工具模型` : ""} · 未进行上游实测</p>`
            : '<p data-agent-coverage-summary>配置检查，不会调用模型或产生费用。</p>';
      const query = String(coverage?.query || "").trim().toLowerCase();
      const filter = coverage?.filter || "all";
      const matches = (result?.models || []).filter(model => (
        (!query || String(model.id).toLowerCase().includes(query))
        && (filter === "all" || (filter === "main" ? model.role === "agent-main"
          : filter === "media" ? /-tool$/.test(model.role || "") : ["missing", "partial", "configurable"].includes(model.state)))
      ));
      const pageCount = Math.max(1, Math.ceil(matches.length / 30));
      const page = Math.max(0, Math.min(coverage?.page || 0, pageCount - 1));
      const modelsMarkup = result ? `<div class="settings-coverage-controls">
        <input type="search" data-coverage-search aria-label="搜索检查结果" placeholder="搜索模型" value="${escapeHtml(coverage.query || "")}">
        <select data-coverage-filter aria-label="模型分类">${[["all", "全部模型"], ["main", "Agent 主模型"], ["media", "媒体工具"], ["attention", "需检查"]].map(([id, label]) => `<option value="${id}" ${filter === id ? "selected" : ""}>${label}</option>`).join("")}</select>
      </div><div data-coverage-results><div class="settings-agent-coverage-models">${matches.slice(page * 30, (page + 1) * 30).map(model => `<div data-agent-coverage-model data-state="${escapeHtml(model.state)}"><i></i><span><strong>${escapeHtml(model.id)}</strong><small>${escapeHtml(model.reason)}</small></span><em>${escapeHtml(coverageLabel(model))}</em></div>`).join("") || "<p>没有匹配的模型。</p>"}</div>
      <div class="settings-coverage-pages"><span>共 ${matches.length} 个 · ${page + 1}/${pageCount} 页</span><button type="button" data-coverage-prev ${page === 0 ? "disabled" : ""} aria-label="上一页">‹</button><button type="button" data-coverage-next ${page + 1 >= pageCount ? "disabled" : ""} aria-label="下一页">›</button></div></div>` : "";
      return `<section class="settings-agent-coverage" data-agent-coverage>
        <header><div><strong>站点 Agent 覆盖率</strong><span>区分 Agent 主模型与图片、视频、音频工具模型</span></div><em>${state.autoFallback ? "自动回退已开启" : "自动回退未开启"}</em></header>
        ${summaryMarkup}${modelsMarkup}
        <footer><button type="button" data-agent-coverage-saved ${busy ? "disabled" : ""}>检查已选模型</button><button type="button" class="settings-primary-button" data-agent-coverage-live ${busy ? "disabled" : ""}>拉取模型并检查</button></footer>
      </section>`;
    }

    function updateCoverageResults() {
      const panel = host.querySelector("[data-agent-coverage]");
      if (!panel || !state.agentCoverage) return;
      const template = document.createElement("template");
      template.innerHTML = agentCoverageMarkup(selectedProvider());
      panel.querySelector("[data-coverage-results]")?.replaceWith(template.content.querySelector("[data-coverage-results]"));
    }

    function providerEditorMarkup() {
      const provider = selectedProvider();
      if (!provider) return `<div class="settings-provider-empty"><i>✦</i><h3>添加第一个 API</h3><p>一个提供商集中管理地址、协议、密钥和模型。</p><button type="button" class="settings-primary-button" data-provider-new>新建提供商</button></div>`;
      const isNew = !state.providers.some(item => item.id === provider.id);
      return `<form class="settings-provider-form" data-provider-form>
        <header><div><p>${isNew ? "NEW PROVIDER" : "MODEL PROVIDER"}</p><h3>${escapeHtml(provider.name || "新提供商")}</h3><span>${isJimengProvider(provider) ? "账户由本机官方 CLI 管理" : provider.apiKeyMasked ? `密钥已保存：${escapeHtml(provider.apiKeyMasked)}` : "密钥只保存在主机加密保险库中"}</span></div><label class="settings-inline-toggle"><input type="checkbox" name="enabled" ${provider.enabled !== false ? "checked" : ""} /><i></i><span>启用</span></label></header>
        <input type="hidden" name="id" value="${escapeHtml(provider.id)}" />
        <div class="settings-provider-fields">
          <label class="wide"><span>名称</span><input name="name" value="${escapeHtml(provider.name || "")}" required /></label>
          <label><span>平台协议</span><select name="protocol">${protocolOptions(provider.protocol, "platform")}</select></label>
          ${isJimengProvider(provider) ? "" : `<label><span>网络线路</span><select name="networkMode">${[["auto", "自动选择"], ["direct", "直接连接"], ["proxy", "使用本机代理"]].map(([value, label]) => `<option value="${value}" ${(provider.metadata?.networkMode || provider.metadata?.legacyNetworkMode || "auto") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="wide"><span>Base URL</span><input name="baseUrl" type="url" value="${escapeHtml(provider.baseUrl || "")}" placeholder="https://api.openai.com/v1" required /></label>
          <label class="wide"><span>API Key</span><input name="apiKey" type="password" value="" autocomplete="new-password" placeholder="${provider.hasApiKey || provider.apiKey ? "留空则保持现有密钥" : "粘贴密钥"}" /></label>`}
        </div>
        ${isJimengProvider(provider) ? jimengPanelMarkup(state.jimengCli || {}) : `<div class="settings-provider-toolbar"><button type="button" data-provider-verify ${state.providerFeedback?.kind === "busy" ? "disabled" : ""}>验证协议</button><button type="button" data-provider-sync ${state.providerFeedback?.kind === "busy" ? "disabled" : ""}>拉取模型</button><div class="settings-provider-status" data-provider-status role="status" aria-live="polite">${providerFeedbackMarkup()}</div></div>${agentCoverageMarkup(provider)}`}${modelDiscoveryMarkup()}
        <section class="settings-model-section"><div class="settings-model-title"><div><strong>已选模型</strong><span>${provider.models?.length || 0} 个</span></div><div><input data-new-model-id placeholder="输入模型 ID" aria-label="手动添加模型 ID" /><button type="button" data-model-add>添加</button></div></div><p class="settings-model-section-hint">对话、图片测试可输入内容并查看结果；发送后会调用所选 API，可能产生费用。</p>${(provider.models || []).map(modelMarkup).join("") || '<p class="settings-model-empty">还没有模型。可从站点拉取，或手动输入模型 ID。</p>'}</section>
        <footer><div>${isNew ? "保存后才会向所有账号开放已启用的模型。" : isJimengProvider(provider) ? "模型使用本机 CLI 登录的账户。" : "API Key 不会回填到浏览器。"}</div><span>${!isNew ? '<button type="button" class="settings-danger-button" data-provider-delete>删除</button>' : ""}<button type="submit" class="settings-primary-button">保存更改</button></span></footer>
      </form>`;
    }

    function providersMarkup() {
      if (!state.draftProvider && !apiProviders().some(provider => provider.id === state.selectedProviderId)) {
        state.selectedProviderId = apiProviders()[0]?.id || "";
        state.draftProvider = null;
      }
      return `<section class="settings-page settings-provider-page" data-settings-section="providers">
        <header><p>API SETTINGS</p><h2>API 设置</h2><span>配置 API 地址、密钥与模型，统一用于对话、Agent、图片、视频和音频。</span></header>
        <div class="settings-provider-workspace">${providerSidebarMarkup()}<div class="settings-provider-editor">${providerEditorMarkup()}</div></div>${providerRecommendationsMarkup()}
      </section>`;
    }

    function agentSettingsMarkup() {
      const data = state.agentModels || { models: [], settings: { primary: null, candidates: [] }, unavailable: [] };
      const draft = state.agentDraft || data.settings || { primary: null, candidates: [] };
      const models = Array.isArray(data.models) ? data.models : [];
      const primaryValue = agentSelectionValue(draft.primary);
      const primary = models.find(model => agentSelectionValue(model) === primaryValue) || null;
      const selectedKeys = new Set((draft.candidates || []).map(agentSelectionValue));
      const selectedCandidates = (draft.candidates || [])
        .map(item => models.find(model => agentSelectionValue(model) === agentSelectionValue(item)))
        .filter(Boolean);
      const availableModels = models.filter(model => (
        agentSelectionValue(model) !== primaryValue && !selectedKeys.has(agentSelectionValue(model))
      ));
      const unavailable = Array.isArray(data.unavailable) ? data.unavailable : [];
      const primaryOptionsMarkup = models.map(model => {
        const value = agentSelectionValue(model);
        return `<button type="button" role="option" data-agent-primary-option data-provider-id="${escapeHtml(model.providerId)}" data-model-id="${escapeHtml(model.modelId)}" aria-selected="${value === primaryValue}"><span><strong>${escapeHtml(model.modelId)}</strong><small>${escapeHtml(model.providerName)}</small></span><i aria-hidden="true">✓</i></button>`;
      }).join("");
      const candidateRow = (model, order) => {
        const value = agentSelectionValue(model);
        const selected = order >= 0;
        return `<div class="settings-agent-model-row${selected ? " is-selected" : ""}"><label><input type="checkbox" data-agent-candidate data-provider-id="${escapeHtml(model.providerId)}" data-model-id="${escapeHtml(model.modelId)}" ${selectedKeys.has(value) ? "checked" : ""} /><i></i><span><strong>${escapeHtml(model.modelId)}</strong><small>${escapeHtml(model.providerName)}</small></span></label>${selected ? `<b class="settings-agent-order" title="接管顺序">${order + 1}</b><span class="settings-agent-order-actions"><button type="button" data-agent-candidate-move="up" data-provider-id="${escapeHtml(model.providerId)}" data-model-id="${escapeHtml(model.modelId)}" aria-label="上移 ${escapeHtml(model.modelId)}" ${order === 0 ? "disabled" : ""}>↑</button><button type="button" data-agent-candidate-move="down" data-provider-id="${escapeHtml(model.providerId)}" data-model-id="${escapeHtml(model.modelId)}" aria-label="下移 ${escapeHtml(model.modelId)}" ${order === selectedCandidates.length - 1 ? "disabled" : ""}>↓</button></span>` : ""}</div>`;
      };
      const orderedMarkup = selectedCandidates.map((model, index) => candidateRow(model, index)).join("");
      const availableMarkup = availableModels.map(model => candidateRow(model, -1)).join("");
      return `<section class="settings-page settings-agent-page" data-settings-section="agent">
        <header><p>AGENT</p><h2>Agent 设置</h2><span>统一设置画布 Agent 使用的主模型和故障候选。</span></header>
        <article class="settings-agent-primary-card">
          <div class="settings-agent-primary-copy"><span>主模型</span><strong>${escapeHtml(primary?.modelId || "尚未选择")}</strong><small>${primary ? escapeHtml(primary.providerName) : "仅列出同时支持对话、识图和工具调用的模型"}</small></div>
          <div class="settings-agent-primary-field">
            <span id="settingsAgentPrimaryLabel">选择主模型</span>
            <button type="button" class="settings-agent-primary-trigger" data-agent-primary-toggle aria-haspopup="listbox" aria-expanded="${state.agentPrimaryOpen}" aria-labelledby="settingsAgentPrimaryLabel" ${models.length ? "" : "disabled"}>
              <span class="settings-agent-primary-value">${primary ? `<strong>${escapeHtml(primary.modelId)}</strong><small>${escapeHtml(primary.providerName)}</small>` : '<strong class="is-placeholder">选择主模型</strong>'}</span>
              <i aria-hidden="true">▾</i>
            </button>
            <div class="settings-agent-primary-menu" role="listbox" aria-labelledby="settingsAgentPrimaryLabel" data-agent-primary-menu ${state.agentPrimaryOpen ? "" : "hidden"}>${primaryOptionsMarkup || '<p class="settings-agent-primary-empty">没有符合要求的模型。</p>'}</div>
          </div>
        </article>
        <section class="settings-agent-candidates">
          <header><div><strong>候选模型</strong><span>主模型不可用时，按下面的序号依次接管。</span></div><em>${selectedCandidates.length} 个</em></header>
          <div class="settings-agent-model-list">
            <p class="settings-agent-group">接管顺序</p>
            ${orderedMarkup || '<p class="settings-agent-empty-row">还没有候选模型，勾选下面的模型即可加入接管顺序。</p>'}
            <p class="settings-agent-group">可选模型</p>
            ${availableMarkup || '<p class="settings-agent-empty-row">没有其他符合要求的多模态模型。</p>'}
          </div>
        </section>
        ${unavailable.length ? `<p class="settings-agent-warning">有 ${unavailable.length} 个已保存模型当前不可用，请重新选择并保存。</p>` : ""}
        <footer class="settings-agent-footer"><span>${models.length ? "所选模型必须具备对话、识图和工具调用能力。" : "请先在 API 设置中保存符合要求的多模态模型。"}</span><button type="button" class="settings-primary-button" data-agent-save ${!primaryValue || state.agentSaving ? "disabled" : ""}>${state.agentSaving ? "保存中…" : "保存 Agent 设置"}</button></footer>
      </section>`;
    }

    async function saveAgentSettings() {
      if (!state.agentDraft?.primary || state.agentSaving) return;
      state.agentSaving = true;
      render();
      try {
        const data = await options.request("/api/providers/agent-settings", { method: "POST", body: state.agentDraft });
        state.agentModels = data;
        state.agentDraft = clone(data.settings || { primary: null, candidates: [] });
        notify("Agent 设置已保存");
      } catch (error) {
        notify(error.message);
      } finally {
        state.agentSaving = false;
        render();
      }
    }

    // The Agent catalog is derived from saved providers, so API edits must
    // refresh it instead of waiting for a full page reload.
    async function reloadAgentModels() {
      if (!isAdmin()) return;
      try {
        const data = await options.request("/api/providers/agent-settings");
        state.agentModels = data;
        const available = new Set((data?.models || []).map(agentSelectionValue));
        const draft = state.agentDraft || data?.settings || { primary: null, candidates: [] };
        const primary = available.has(agentSelectionValue(draft.primary)) ? draft.primary : null;
        const primaryKey = agentSelectionValue(primary);
        const candidates = (draft.candidates || []).filter(item => (
          available.has(agentSelectionValue(item)) && agentSelectionValue(item) !== primaryKey
        ));
        state.agentDraft = { primary, candidates };
      } catch (error) {
        notify(error.message);
      }
    }

    const SKILL_FILTERS = Object.freeze([
      ["all", "全部"],
      ["system", "系统 Skill"],
      ["custom", "功能 Skill"],
    ]);

    function skillCardMarkup(skill) {
      // 与 DX OS 一致：文本类内置 Skill 属于「官方预设」，图像/视频等原子能力属于「系统能力」。
      const isPresetSkill = (item) => ["text", "general"].includes(String(item.category || "").toLowerCase());
      const busy = state.skillBusyId === skill.id;
      return `<article class="settings-skill-card${skill.enabled ? " is-enabled" : ""}" data-skill-card="${escapeHtml(skill.id)}">
        <header>
          <strong>${escapeHtml(skill.label)}</strong>
          ${skill.builtin
            ? `<em class="settings-skill-badge">${isPresetSkill(skill) ? "官方预设" : "系统能力"}</em>`
            : '<em class="settings-skill-badge is-custom">功能</em>'}
          <label class="settings-skill-toggle"><input type="checkbox" data-skill-toggle data-skill-id="${escapeHtml(skill.id)}" ${skill.enabled ? "checked" : ""} ${busy ? "disabled" : ""} /><i></i><span>启用</span></label>
        </header>
        <p>${escapeHtml(skill.description)}</p>
        <code>${escapeHtml(skill.id)}</code>
      </article>`;
    }

    function skillsMarkup() {
      const catalog = state.skills;
      if (!catalog) {
        return `<section class="settings-page settings-skill-page" data-settings-section="skills">
          <header><p>SKILLS</p><h2>Skill 管理</h2><span>控制画布 Agent 能自动调用哪些专业能力。</span></header>
          <p class="settings-skill-empty">Skill 目录读取中，请稍候…</p>
        </section>`;
      }
      const filter = SKILL_FILTERS.some(([id]) => id === state.skillFilter) ? state.skillFilter : "all";
      const groups = (catalog.groups || []).map(group => ({
        ...group,
        skills: (group.skills || []).filter(skill => (
          filter === "all" || (filter === "system" ? skill.origin === "system" : skill.origin === "custom")
        )),
      })).filter(group => group.skills.length);
      const counts = { all: catalog.totalCount || 0, system: catalog.systemCount || 0, custom: catalog.customCount || 0 };
      return `<section class="settings-page settings-skill-page" data-settings-section="skills">
        <header><p>SKILLS</p><h2>Skill 管理</h2><span>系统 Skill 默认启用；功能 Skill 按安装包分组，每一项都能单独启用。</span></header>
        <div class="settings-skill-toolbar">
          <div class="settings-skill-filters" role="tablist" aria-label="Skill 分类">${SKILL_FILTERS.map(([id, label]) => `<button type="button" role="tab" data-skill-filter="${id}" aria-selected="${filter === id}" class="${filter === id ? "active" : ""}">${label}<em>${counts[id]}</em></button>`).join("")}</div>
          <span>已启用 ${catalog.enabledCount || 0} / ${catalog.totalCount || 0}</span>
        </div>
        <div class="settings-skill-groups">
          ${groups.map(group => {
            const open = state.skillGroupsOpen?.[group.id] !== false;
            const groupBadge = group.kind === "custom" ? (group.standalone ? "单独添加" : "安装包") : "";
            return `<section class="settings-skill-group${open ? " is-open" : ""}" data-skill-group-panel="${escapeHtml(group.id)}" data-skill-group-kind="${escapeHtml(group.kind || "system")}">
              <button type="button" class="settings-skill-group-head" data-skill-group="${escapeHtml(group.id)}" aria-expanded="${open}">
                <span><strong>${escapeHtml(group.label)}</strong>${groupBadge ? `<b class="settings-skill-group-kind">${groupBadge}</b>` : ""}<em>${group.skills.length} 个 Skill</em></span>
                <small>${escapeHtml(group.description || "")}</small>
                <i aria-hidden="true">${open ? "⌃" : "⌄"}</i>
              </button>
              <div class="settings-skill-grid">${group.skills.map(skillCardMarkup).join("")}</div>
            </section>`;
          }).join("") || '<p class="settings-skill-empty">当前分类下没有 Skill。</p>'}
        </div>
        <p class="settings-skill-hint">Skill 只影响画布 Agent 的专业能力路由，不影响单节点手动操作。</p>
      </section>`;
    }

    async function toggleSkill(id, enabled, label) {
      if (!id || state.skillBusyId) return;
      state.skillBusyId = id;
      render();
      try {
        state.skills = await options.request("/api/skills/enabled", { method: "POST", body: { id, enabled } });
        notify(enabled ? `已启用「${label || id}」` : `已停用「${label || id}」`);
      } catch (error) {
        notify(error.message);
      } finally {
        state.skillBusyId = "";
        render();
      }
    }

    function pageMarkup() {
      if (!sectionIdsForRole(role()).includes(state.section)) state.section = "appearance";
      if (state.section === "appearance") return appearanceMarkup();
      if (state.section === "account") return accountMarkup();
      if (state.section === "system") return systemMarkup();
      if (state.section === "host" && isAdmin()) return hostMarkup();
      if (state.section === "providers" && isAdmin()) return providersMarkup();
      if (state.section === "agent" && isAdmin()) return agentSettingsMarkup();
      if (state.section === "skills" && isAdmin()) return skillsMarkup();
      if (state.section === "comfyui" && isAdmin()) return comfySettings.markup();
      if (state.section === "models" && isAdmin()) return localModels.markup();
      if (state.section === "protocols" && isAdmin()) return protocolCenter.markup();
      return appearanceMarkup();
    }

    function render() {
      modelTestDialog.close();
      const user = session().user || {};
      const name = user.displayName || user.username || "账户";
      host.innerHTML = `<div class="ai-os-settings-layout">
        <aside class="ai-os-settings-sidebar"><label class="settings-search"><svg class="settings-search-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.4"></circle><path d="M10.4 10.4 14 14"></path></svg><input type="search" placeholder="搜索设置" aria-label="搜索设置" /></label><div class="settings-user-card"><i>${escapeHtml(name.slice(0, 1).toUpperCase())}</i><span><strong>${escapeHtml(name)}</strong><small>${isAdmin() ? "超级管理员" : "普通用户"}</small></span></div><nav>${navigationMarkup()}</nav></aside>
        <main class="ai-os-settings-main">${state.loading ? '<div class="settings-loading-bar"></div>' : ""}${pageMarkup()}</main>
      </div>`;
    }

    // Keep the candidate list scroll position; picking a model moves its row
    // between groups, and a plain re-render would jump back to the top.
    function renderAgentList() {
      const list = host.querySelector(".settings-agent-model-list");
      const scrollTop = list?.scrollTop || 0;
      render();
      const next = host.querySelector(".settings-agent-model-list");
      if (next) next.scrollTop = scrollTop;
    }

    function readProviderForm() {
      const form = host.querySelector("[data-provider-form]");
      if (!form) return selectedProvider();
      const data = new FormData(form);
      const previous = selectedProvider() || {};
      const protocol = String(data.get("protocol") || "openai");
      const cli = protocol === "cli:jimeng";
      const models = [...form.querySelectorAll("[data-provider-model]")].map((row, index) => {
        const previousModel = previous.models?.find((model) => model.id === row.dataset.modelId) || {};
        const metadata = { ...(previousModel.metadata || {}) };
        const parameters = modelParameters.read(row, previousModel);
        if (Object.keys(parameters).length) metadata.parameterOverrides = parameters;
        else delete metadata.parameterOverrides;
        const capabilities = [...row.querySelectorAll("[data-model-capability]:checked")].map((input) => input.dataset.modelCapability);
        if (capabilities.length) delete metadata.capabilitiesExplicit;
        else metadata.capabilitiesExplicit = true;
        return {
          id: previousModel.id || row.dataset.modelId,
          displayName: previousModel.id || row.dataset.modelId,
          protocol: row.querySelector("[data-model-protocol]")?.value || data.get("protocol"),
          capabilities,
          sortOrder: index,
          metadata,
        };
      }).filter((model) => model.id);
      return {
        ...previous,
        id: String(data.get("id") || "").trim(),
        name: String(data.get("name") || "").trim(),
        baseUrl: cli ? "" : String(data.get("baseUrl") || "").trim(),
        protocol,
        metadata: { ...(previous.metadata || {}), networkMode: String(data.get("networkMode") || previous.metadata?.networkMode || "auto") },
        enabled: data.get("enabled") === "on",
        apiKey: cli ? "" : (String(data.get("apiKey") || "") || (state.draftProvider ? String(previous.apiKey || "") : "")),
        source: cli ? "cli" : (previous.source === "cli" ? "api" : previous.source || "api"),
        cliTool: cli ? "jimeng" : null,
        models,
      };
    }

    function validateModelParameterOverrides(form) {
      for (const row of form.querySelectorAll("[data-provider-model]")) {
        const model = selectedProvider()?.models?.find(item => item.id === row.dataset.modelId) || {};
        modelParameters.validate(row, model);
      }
    }

    async function reloadProviders(selectedId) {
      invalidateProviderFeedback();
      const data = await options.request("/api/providers");
      state.providers = Array.isArray(data.providers) ? data.providers : [];
      state.selectedProviderId = selectedId && apiProviders().some((provider) => provider.id === selectedId)
        ? selectedId
        : apiProviders()[0]?.id || "";
      state.draftProvider = null;
      state.modelDiscovery = null;
      updateProtocolCatalog(await options.request("/api/protocols"));
      await reloadAgentModels();
      render();
    }

    async function saveProvider(event) {
      event.preventDefault();
      const form = event.target;
      try { validateModelParameterOverrides(form); } catch (error) { notify(error.message); return; }
      const provider = readProviderForm();
      const creating = !state.providers.some(item => item.id === provider.id);
      try {
        const data = await options.request("/api/providers", { method: "POST", body: provider });
        notifyProviderCatalogChanged(creating ? "provider-created" : "provider-updated", {
          providerId: data.provider?.id || provider.id,
          catalogRevision: Number(data.catalogRevision) || 0,
        });
        notify(creating ? "提供商已创建" : "提供商已保存");
        await reloadProviders(data.provider?.id || provider.id);
      } catch (error) { notify(error.message); }
    }

    async function saveRecommendedApimart() {
      const apiKey = host.querySelector("[data-apimart-api-key]")?.value.trim();
      const existing = recommendedApimartProvider();
      if (!apiKey && !existing?.hasApiKey) {
        notify("请先填写 APIMart API Key");
        return;
      }
      const provider = createRecommendedApimartProvider(existing, nextProviderId(), apiKey || existing?.apiKey);
      const button = host.querySelector("[data-apimart-save]");
      if (button) {
        button.disabled = true;
        button.textContent = "正在保存…";
      }
      try {
        const data = await options.request("/api/providers", { method: "POST", body: provider });
        notifyProviderCatalogChanged(existing ? "provider-updated" : "provider-created", {
          providerId: data.provider?.id || provider.id,
          catalogRevision: Number(data.catalogRevision) || 0,
        });
        state.recommendationsOpen = false;
        notify(existing ? "APIMart 配置已更新" : "APIMart 已配置");
        await reloadProviders(data.provider?.id || provider.id);
      } catch (error) {
        notify(error.message);
        if (button?.isConnected) {
          button.disabled = false;
          button.textContent = existing ? "更新并配置" : "保存并配置";
        }
      }
    }

    async function verifyProvider() {
      state.protocolChangeRevision += 1;
      const revision = ++state.providerRequestRevision;
      const provider = readProviderForm();
      setProviderFeedback({ kind: "busy", text: `正在验证 ${platformLabel(provider.protocol)}…` });
      try {
        const result = await options.request("/api/providers/verify-protocol", { method: "POST", body: { provider, options: { suggestAlternatives: true } } });
        if (!providerRequestCurrent(revision)) return;
        if (result.available === false) {
          setProviderFeedback({ kind: "warning", text: `${platformLabel(provider.protocol)} 暂未验证通过。${result.guidance || "请检查地址、密钥和网络线路后重试。"}`, recommendedProtocol: result.recommendedProtocol });
          return;
        }
        const protocol = result.selectedProtocol || result.protocol || provider.protocol;
        state.draftProvider = { ...readProviderForm(), protocol, baseUrl: result.baseUrl || provider.baseUrl };
        const baseUrl = host.querySelector('[name="baseUrl"]');
        if (baseUrl) baseUrl.value = state.draftProvider.baseUrl;
        setProviderFeedback({ kind: "success", text: `${platformLabel(protocol)}可用，模型目录已连通。可拉取模型，具体能力请测试。` });
      } catch (error) {
        if (providerRequestCurrent(revision)) setProviderFeedback({ kind: "warning", text: `验证未完成，请检查地址、API Key 和网络线路后重试。${error.message || ""}` });
      }
    }

    async function syncModels() {
      const provider = readProviderForm();
      const revision = ++state.providerRequestRevision;
      setProviderFeedback({ kind: "busy", text: "正在拉取模型…" });
      try {
        const result = await options.request("/api/providers/models", { method: "POST", body: { provider } });
        if (!providerRequestCurrent(revision)) return;
        const platformProtocol = result.platformProtocol || provider.protocol;
        const inferredModels = result.modelConfigurations || (await options.request("/api/providers/infer-protocols", {
          method: "POST", body: { baseUrl: provider.baseUrl, protocol: platformProtocol, models: (result.models || []).map(id => ({ id })) },
        })).models;
        if (!providerRequestCurrent(revision)) return;
        const currentProvider = readProviderForm();
        const inferred = uniqueDiscoveredModels(inferredModels);
        const normalized = normalizeProviderModels({ ...currentProvider, protocol: platformProtocol }, inferred, state.protocolCatalog, { includeInferred: false });
        state.modelDiscovery = {
          models: inferred,
          platformProtocol,
          filter: "all",
          query: "",
        };
        state.draftProvider = { ...currentProvider, protocol: platformProtocol, models: normalized.models };
        setProviderFeedback({ kind: "success", text: `${platformLabel(platformProtocol)}可用，已读取 ${inferred.length} 个模型。已配置模型默认勾选。` });
        if (normalized.removed.length) notify(`已移除 ${normalized.removed.length} 个与当前平台不兼容的模型`);
        notify(`已读取 ${inferred.length} 个模型，请选择要加入的模型`);
        render();
      } catch (error) {
        if (providerRequestCurrent(revision)) setProviderFeedback({ kind: "warning", text: `暂未拉取到模型。请点击“验证协议”获取协议建议，或检查密钥和网络线路。${error.message || ""}` });
      }
    }

    async function checkAgentCoverage(refreshModels) {
      let provider;
      try { provider = readProviderForm(); }
      catch (error) { notify(error.message); return; }
      const revision = ++state.agentCoverageRevision;
      state.draftProvider = provider;
      state.agentCoverage = { providerId: provider.id, status: "busy" };
      render();
      try {
        const data = await options.request("/api/providers/agent-coverage", {
          method: "POST",
          body: { provider, refreshModels: Boolean(refreshModels) },
        });
        if (destroyed || revision !== state.agentCoverageRevision || selectedProvider()?.id !== provider.id) return;
        state.agentCoverage = { providerId: provider.id, status: "ready", result: data.coverage };
        render();
      } catch (error) {
        if (destroyed || revision !== state.agentCoverageRevision || selectedProvider()?.id !== provider.id) return;
        state.agentCoverage = {
          providerId: provider.id,
          status: "error",
          message: refreshModels
            ? `未能拉取并检查模型：${error.message || "请检查地址、密钥和网络线路。"}`
            : `未能检查已选模型：${error.message || "请检查模型配置。"}`,
        };
        render();
      }
    }

    function addDiscoveredModels() {
      const provider = readProviderForm();
      const discovery = state.modelDiscovery;
      if (!discovery) return;
      const selectedIds = new Set([...host.querySelectorAll("[data-discovered-model]:checked")].map(input => input.dataset.discoveredModel));
      const additions = selectNewDiscoveredModels(discovery.models, selectedIds, provider.models);
      state.draftProvider = { ...provider, protocol: discovery.platformProtocol || provider.protocol, models: [...provider.models, ...additions] };
      state.modelDiscovery = null;
      notify(`已加入 ${additions.length} 个模型`);
      render();
    }

    async function testModel(button) {
      let provider;
      try { provider = readProviderForm(); }
      catch (error) { notify(error.message); return; }
      const row = button.closest("[data-provider-model]");
      const modelId = row?.dataset.modelId;
      const model = provider.models.find((item) => item.id === modelId);
      if (modelTestUi.modesForModel(model).length) {
        modelTestDialog.open({ provider, model });
        return;
      }
      if (!modelId) return;
      notify("此模型暂不支持对话或图片测试；请先选择对应模型协议和能力。");
    }

    async function addModel(button) {
      const provider = readProviderForm();
      const id = host.querySelector("[data-new-model-id]")?.value.trim();
      if (!id || provider.models.some(model => model.id === id)) return;
      button.disabled = true;
      try {
        const inferred = await options.request("/api/providers/infer-protocols", { method: "POST", body: {
          baseUrl: provider.baseUrl, protocol: provider.protocol, models: [{ id }],
        } });
        const model = inferred.models?.find(model => model.id === id);
        if (!model) throw new Error("无法识别模型配置，请检查模型 ID。");
        state.draftProvider = { ...provider, models: [...provider.models, { ...model, displayName: id }] };
        render();
      } catch (error) { notify(error.message); button.disabled = false; }
    }

    async function reorderProviders(providerId, direction) {
      const visible = apiProviders().map(provider => provider.id);
      const index = visible.indexOf(providerId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= visible.length) return;
      const ids = state.providers.map(provider => provider.id);
      const from = ids.indexOf(visible[index]);
      const to = ids.indexOf(visible[target]);
      [ids[from], ids[to]] = [ids[to], ids[from]];
      try {
        const data = await options.request("/api/providers/reorder", { method: "POST", body: { providerIds: ids } });
        notifyProviderCatalogChanged("providers-reordered");
        state.providers = data.providers || state.providers;
        render();
      } catch (error) { notify(error.message); }
    }

    async function reorderModels(direction, button) {
      const provider = readProviderForm();
      const row = button.closest("[data-provider-model]");
      const index = provider.models.findIndex((model) => model.id === row?.dataset.modelId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= provider.models.length) return;
      [provider.models[index], provider.models[target]] = [provider.models[target], provider.models[index]];
      if (!state.draftProvider && state.providers.some((item) => item.id === provider.id)) {
        try {
          const data = await options.request("/api/providers/models/reorder", { method: "POST", body: { providerId: provider.id, modelIds: provider.models.map((model) => model.id) } });
          notifyProviderCatalogChanged("provider-models-reordered", { providerId: provider.id });
          state.providers = state.providers.map((item) => item.id === provider.id ? data.provider : item);
        } catch (error) { notify(error.message); return; }
      } else state.draftProvider = provider;
      render();
    }

    async function onClick(event) {
      const nav = event.target.closest("[data-settings-nav]");
      if (nav) {
        comfySettings.leave();
        localModels.leave();
        invalidateProviderFeedback(); stopCliSession(); state.agentPrimaryOpen = false; state.section = nav.dataset.settingsNav;
        if (state.section === "comfyui" && isAdmin()) { render(); await comfySettings.load(); }
        else if (state.section === "models" && isAdmin()) { render(); await localModels.load(); }
        else if (state.section === "agent" && isAdmin()) { render(); await reloadAgentModels(); render(); }
        else if (state.section === "skills" && isAdmin()) { render(); if (!state.skills) await load(); }
        else if (["providers", "protocols"].includes(state.section) && isAdmin() && !state.protocolCatalog.platformProtocols.length) await load();
        else render();
        return;
      }
      const primaryOption = event.target.closest("[data-agent-primary-option]");
      if (primaryOption) {
        const primary = { providerId: primaryOption.dataset.providerId, modelId: primaryOption.dataset.modelId };
        const candidates = (state.agentDraft?.candidates || []).filter(item => agentSelectionValue(item) !== agentSelectionValue(primary));
        state.agentDraft = { ...(state.agentDraft || { primary: null, candidates: [] }), primary, candidates };
        state.agentPrimaryOpen = false;
        render();
        return;
      }
      if (event.target.closest("[data-agent-primary-toggle]")) {
        state.agentPrimaryOpen = !state.agentPrimaryOpen;
        render();
        return;
      }
      if (state.agentPrimaryOpen && !event.target.closest(".settings-agent-primary-field")) {
        state.agentPrimaryOpen = false;
        render();
        return;
      }
      if (isAdmin() && state.section === "comfyui") {
        const form = host.querySelector("[data-comfy-form]");
        const action = event.target.closest("[data-comfy-test], [data-comfy-detect], [data-comfy-start], [data-comfy-stop], [data-comfy-refresh]");
        if (action && form) {
          const name = action.hasAttribute("data-comfy-test") ? "test" : action.hasAttribute("data-comfy-detect") ? "detect" : action.hasAttribute("data-comfy-start") ? "start" : action.hasAttribute("data-comfy-stop") ? "stop" : "refresh";
          await comfySettings.action(name, form);
          return;
        }
      }
      if (isAdmin() && state.section === "models" && await localModels.onClick(event)) return;
      if (isAdmin() && await protocolCenter.onClick(event)) return;
      const theme = event.target.closest("[data-settings-theme]")?.dataset.settingsTheme;
      if (theme) { await savePreferences({ ...state.preferences, appearance: { ...state.preferences.appearance, theme } }); return; }
      const componentRollback = event.target.closest("[data-component-rollback]");
      if (componentRollback) { await runComponentRollback(componentRollback.dataset.componentRollback); return; }
      if (event.target.closest("[data-update-check]")) { await runUpdateAction("checkForUpdates", "checking"); return; }
      if (event.target.closest("[data-update-download]")) { await runUpdateAction("downloadUpdate", "downloading"); return; }
      if (event.target.closest("[data-update-restart]")) { await runUpdateAction("restartToUpdate", "restarting"); return; }
      const scale = event.target.closest("[data-settings-scale]")?.dataset.settingsScale;
      if (scale) { await savePreferences({ ...state.preferences, appearance: { ...state.preferences.appearance, scale: Number(scale) } }); return; }
      const select = event.target.closest("[data-provider-select]");
      if (select) { invalidateProviderFeedback(); stopCliSession(); state.modelDiscovery = null; state.selectedProviderId = select.dataset.providerSelect; state.draftProvider = null; render(); if (isJimengProvider(selectedProvider())) enterCliProvider(); return; }
      if (event.target.closest("[data-provider-new]")) { invalidateProviderFeedback(); stopCliSession(); state.modelDiscovery = null; state.draftProvider = emptyProvider(); state.selectedProviderId = ""; render(); return; }
      if (event.target.closest("[data-provider-recommendations]")) { state.recommendationsOpen = true; render(); return; }
      if (event.target.closest("[data-provider-recommendations-close]")) { state.recommendationsOpen = false; render(); return; }
      if (event.target.closest("[data-apimart-save]")) { await saveRecommendedApimart(); return; }
      const providerMove = event.target.closest("[data-provider-move]");
      if (providerMove) { await reorderProviders(providerMove.dataset.providerId, providerMove.dataset.providerMove); return; }
      if (event.target.closest("[data-provider-verify]")) { await verifyProvider(); return; }
      const recommended = event.target.closest("[data-provider-use-protocol]");
      if (recommended) {
        const protocolSelect = host.querySelector('[name="protocol"]');
        const providerId = readProviderForm()?.id;
        protocolSelect.value = recommended.dataset.providerUseProtocol;
        await onChange({ target: protocolSelect });
        if (readProviderForm()?.id === providerId && state.section === "providers" && readProviderForm()?.protocol === recommended.dataset.providerUseProtocol) await verifyProvider();
        return;
      }
      if (event.target.closest("[data-provider-sync]")) { await syncModels(); return; }
      if (event.target.closest("[data-agent-coverage-saved]")) { await checkAgentCoverage(false); return; }
      if (event.target.closest("[data-agent-coverage-live]")) { await checkAgentCoverage(true); return; }
      if (event.target.closest("[data-agent-save]")) { await saveAgentSettings(); return; }
      const skillFilter = event.target.closest("[data-skill-filter]");
      if (skillFilter) { state.skillFilter = skillFilter.dataset.skillFilter || "all"; render(); return; }
      const skillGroup = event.target.closest("[data-skill-group]");
      if (skillGroup) {
        const id = skillGroup.dataset.skillGroup;
        const open = state.skillGroupsOpen?.[id] !== false;
        state.skillGroupsOpen = { ...(state.skillGroupsOpen || {}), [id]: !open };
        render();
        return;
      }
      const candidateMove = event.target.closest("[data-agent-candidate-move]");
      if (candidateMove) {
        const key = agentSelectionValue({ providerId: candidateMove.dataset.providerId, modelId: candidateMove.dataset.modelId });
        const candidates = [...(state.agentDraft?.candidates || [])];
        const index = candidates.findIndex(item => agentSelectionValue(item) === key);
        const target = candidateMove.dataset.agentCandidateMove === "up" ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < candidates.length) {
          [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
          state.agentDraft = { ...(state.agentDraft || {}), candidates };
          renderAgentList();
        }
        return;
      }
      if (event.target.closest("[data-coverage-next], [data-coverage-prev]") && state.agentCoverage) {
        state.agentCoverage.page = Math.max(0, (state.agentCoverage.page || 0) + (event.target.closest("[data-coverage-next]") ? 1 : -1));
        updateCoverageResults();
        return;
      }
      const discoveryFilter = event.target.closest("[data-discovery-filter]");
      if (discoveryFilter && state.modelDiscovery) {
        state.modelDiscovery.filter = discoveryFilter.dataset.discoveryFilter || "all";
        host.querySelectorAll("[data-discovery-filter]").forEach(button => button.classList.toggle("active", button === discoveryFilter));
        applyDiscoveryFilter();
        return;
      }
      if (event.target.closest("[data-model-discovery-add]")) { addDiscoveredModels(); return; }
      if (event.target.closest("[data-model-discovery-cancel]")) { state.modelDiscovery = null; render(); return; }

      // Signing in reuses whatever session the official client already holds, so
      // switching accounts has to go through the CLI relogin command.
      if (event.target.closest("[data-jimeng-login]")) {
        // While an approval is pending the click re-opens the page the client is
        // already waiting for, so an operator who closed the browser can get back
        // without starting a second device flow.
        if (state.jimengCli?.state === "login-running") {
          if (!openJimengAuthUrl(state.jimengCli.authUrl)) notify("请在下方授权链接中完成登录。");
          return;
        }
        await runCliAction(state.jimengCli?.signedIn ? "relogin" : "login");
        return;
      }
      if (event.target.closest("[data-jimeng-logout]")) { await runCliAction("logout"); return; }
      if (event.target.closest("[data-jimeng-refresh]")) { await runCliAction(state.jimengCli?.state === "login-running" ? "login-status" : "status"); return; }
      if (event.target.closest("[data-jimeng-models]")) { await runCliAction("models"); return; }
      const modelTest = event.target.closest("[data-model-test]");
      if (modelTest) { await testModel(modelTest); return; }
      const modelMove = event.target.closest("[data-model-move]");
      if (modelMove) { await reorderModels(modelMove.dataset.modelMove, modelMove); return; }
      const removeModel = event.target.closest("[data-model-remove]");
      if (removeModel) { const provider = readProviderForm(); const index = [...host.querySelectorAll("[data-provider-model]")].indexOf(removeModel.closest("[data-provider-model]")); provider.models.splice(index, 1); state.draftProvider = provider; render(); return; }
      if (event.target.closest("[data-model-add]")) { await addModel(event.target.closest("[data-model-add]")); return; }
      if (event.target.closest("[data-provider-delete]")) { const provider = selectedProvider(); if (!provider || !globalThis.confirm?.(`删除提供商“${provider.name}”？`)) return; try { await options.request(`/api/providers/${encodeURIComponent(provider.id)}`, { method: "DELETE" }); notifyProviderCatalogChanged("provider-deleted", { providerId: provider.id }); notify("提供商已删除"); await reloadProviders(); } catch (error) { notify(error.message); } return; }
      if (event.target.closest("[data-host-backup]")) { try { await options.request("/api/admin/backup", { method: "POST", body: { includeMedia: true } }); notify("系统备份已完成"); await load(); } catch (error) { notify(error.message); } }
    }

    async function onChange(event) {
      if (isAdmin() && state.section === "comfyui" && event.target.closest("[data-comfy-form]")) {
        comfySettings.change(event);
        return;
      }
      if (isAdmin() && protocolCenter.onChange(event)) return;
      if (event.target.matches('[name="networkMode"]')) invalidateProviderFeedback();
      if (event.target.matches('[name="protocol"]')) {
        invalidateProviderFeedback();
        const protocolRevision = ++state.protocolChangeRevision;
        const provider = readProviderForm();
        const previousWasCli = isJimengProvider(selectedProvider());
        const cli = isJimengProvider(provider);
        stopCliSession();
        state.modelDiscovery = null;
        const switched = cli
          ? {
            ...provider,
            name: provider.name === "新提供商" ? "即梦（本地 CLI）" : provider.name,
            baseUrl: "",
            apiKey: "",
            source: "cli",
            cliTool: "jimeng",
            models: provider.models.filter(model => model.protocol === "cli:jimeng"),
          }
        : {
            ...provider,
            // Keep an unsaved HTTP credential when switching between HTTP
            // platform protocols. CLI providers never expose an API key.
            apiKey: previousWasCli ? "" : provider.apiKey,
            source: provider.source === "cli" ? "api" : provider.source,
            cliTool: null,
            models: previousWasCli ? [] : provider.models.filter(model => model.protocol !== "cli:jimeng"),
          };
        if (cli) {
          state.draftProvider = switched;
          render();
          enterCliProvider();
          return;
        }
        const fallback = normalizeProviderModels(switched, [], state.protocolCatalog);
        state.draftProvider = { ...switched, models: fallback.models };
        render();
        try {
          const inferred = await inferProviderModels(switched, switched.models);
          if (protocolRevision !== state.protocolChangeRevision) return;
          const normalized = normalizeProviderModels(switched, inferred.models, state.protocolCatalog);
          state.draftProvider = { ...switched, models: normalized.models };
          if (normalized.removed.length) notify(`切换平台后移除了 ${normalized.removed.length} 个无法执行的模型；可重新拉取模型`);
        } catch (error) {
          // A newer protocol selection may have started while this inference
          // request was in flight. Do not let the stale request re-render its
          // old draft over the user's latest selection.
          if (protocolRevision !== state.protocolChangeRevision) return;
          if (fallback.removed.length) notify(`切换平台后移除了 ${fallback.removed.length} 个无法执行的模型；可重新拉取模型`);
          else notify(error.message);
        }
        render();
        return;
      }
      if (event.target.matches("[data-model-protocol]")) {
        const protocol = state.protocolCatalog.modelProtocols.find(item => item.id === event.target.value);
        const row = event.target.closest("[data-provider-model]");
        if (!protocol || !row) return;
        row.querySelectorAll("[data-model-capability]").forEach(input => { input.checked = protocol.capabilities.includes(input.dataset.modelCapability); });
        const button = row.querySelector("[data-model-test]");
        if (button) button.disabled = !testRouteForCapabilities(protocol.capabilities);
        refreshModelParameters(row);
        updateModelSummary(row);
        return;
      }
      if (event.target.matches("[data-model-capability]")) {
        const row = event.target.closest("[data-provider-model]");
        const active = [...row.querySelectorAll("[data-model-capability]:checked")].map(input => input.dataset.modelCapability);
        const button = row.querySelector("[data-model-test]");
        if (button) button.disabled = !testRouteForCapabilities(active);
        refreshModelParameters(row);
        updateModelSummary(row);
        return;
      }
      if (event.target.matches("[data-discovered-model]")) {
        applyDiscoveryFilter();
        return;
      }
      if (event.target.matches("[data-coverage-filter]") && state.agentCoverage) {
        state.agentCoverage.filter = event.target.value;
        state.agentCoverage.page = 0;
        updateCoverageResults();
        return;
      }
      if (event.target.matches("[data-settings-animations]")) {
        await savePreferences({ ...state.preferences, appearance: { ...state.preferences.appearance, animations: event.target.checked ? "reduced" : "full" } });
        return;
      }
      if (event.target.matches("[data-provider-fallback]")) {
        try { const data = await options.request("/api/providers/auto-fallback", { method: "POST", body: { enabled: event.target.checked } }); state.autoFallback = Boolean(data.enabled); render(); } catch (error) { notify(error.message); }
        return;
      }
      if (event.target.matches("[data-agent-candidate]")) {
        const selected = { providerId: event.target.dataset.providerId, modelId: event.target.dataset.modelId };
        const key = agentSelectionValue(selected);
        const candidates = [...(state.agentDraft?.candidates || [])];
        const index = candidates.findIndex(item => agentSelectionValue(item) === key);
        // New picks join the end of the takeover order instead of being
        // reshuffled into catalog order.
        if (event.target.checked) { if (index < 0) candidates.push(selected); }
        else if (index >= 0) candidates.splice(index, 1);
        state.agentDraft = { ...(state.agentDraft || { primary: null, candidates: [] }), candidates };
        renderAgentList();
        return;
      }
      if (event.target.matches("[data-skill-toggle]")) {
        const id = event.target.dataset.skillId;
        const card = event.target.closest("[data-skill-card]");
        await toggleSkill(id, event.target.checked, card?.querySelector("strong")?.textContent || id);
        return;
      }
      if (event.target.matches("[data-host-autostart]") && options.hostBridge?.setAutostart) {
        try { state.autostart = await options.hostBridge.setAutostart(event.target.checked); notify(state.autostart.enabled ? "已开启开机自动启动" : "已关闭开机自动启动"); render(); } catch (error) { notify(error.message); }
      }
    }

    function updateModelSummary(row) {
      if (!row) return;
      const id = row.dataset.modelId;
      const protocolLabel = row.querySelector("[data-model-protocol]").selectedOptions[0]?.textContent || "";
      row.querySelector("[data-model-summary-name]").textContent = id;
      row.querySelector("[data-model-summary-protocol]").textContent = protocolLabel;
      const category = discoveryCategory({ capabilities: [...row.querySelectorAll("[data-model-capability]:checked")].map(input => input.dataset.modelCapability) });
      const badge = row.querySelector(".settings-model-kind");
      badge.dataset.kind = category;
      badge.textContent = { llm: "对话", image: "图像", video: "视频", audio: "音频", other: "其他" }[category];
      row.querySelector("[data-model-test-status]").textContent = "";
    }

    function refreshModelParameters(row) {
      try {
        const provider = readProviderForm();
        state.draftProvider = provider;
        host.querySelectorAll("[data-provider-model]").forEach(item => {
          const model = provider.models.find(candidate => candidate.id === item.dataset.modelId);
          const current = item.querySelector(".settings-model-defaults");
          if (!model || !current) return;
          const wasOpen = current.open;
          current.outerHTML = modelParameters.markup(model);
          const replacement = item.querySelector(".settings-model-defaults");
          if (replacement) replacement.open = wasOpen;
        });
      } catch (error) { notify(error.message); }
    }

    function onInput(event) {
      if (event.target.matches("[data-coverage-search]") && state.agentCoverage) {
        state.agentCoverage.query = event.target.value;
        state.agentCoverage.page = 0;
        updateCoverageResults();
        return;
      }
      if (isAdmin() && state.section === "comfyui" && event.target.closest("[data-comfy-form]")) { comfySettings.input(event); return; }
      if (event.target.matches('[name="baseUrl"], [name="apiKey"], [name="networkMode"]')) invalidateProviderFeedback();
      if (event.target.matches('[data-model-param]')) updateModelSummary(event.target.closest("[data-provider-model]"));
      const discoverySearch = event.target.closest("[data-discovery-search]");
      if (discoverySearch && state.modelDiscovery) {
        state.modelDiscovery.query = discoverySearch.value || "";
        applyDiscoveryFilter();
        return;
      }
      const search = event.target.closest(".settings-search input");
      if (!search) return;
      const query = search.value.trim().toLowerCase();
      host.querySelectorAll("[data-settings-nav]").forEach((button) => { button.hidden = Boolean(query) && !button.textContent.toLowerCase().includes(query); });
    }

    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    host.addEventListener("input", onInput);
    host.addEventListener("submit", (event) => {
      if (event.target.matches("[data-provider-form]")) saveProvider(event);
      else if (isAdmin() && event.target.matches("[data-comfy-form]")) { event.preventDefault(); comfySettings.save(event.target); }
      else if (isAdmin()) protocolCenter.onSubmit(event);
    });
    const dismissListeners = new AbortController();
    host.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.agentPrimaryOpen) return;
      state.agentPrimaryOpen = false;
      render();
    }, { signal: dismissListeners.signal });
    doc?.addEventListener?.("click", (event) => {
      if (!state.agentPrimaryOpen) return;
      if (host.contains(event.target)) return;
      state.agentPrimaryOpen = false;
      render();
    }, { capture: true, signal: dismissListeners.signal });
    const systemListener = () => {
      if (state.preferences.appearance.theme === "system") {
        applyPreferences(state.preferences, doc?.documentElement, media);
      }
    };
    media?.addEventListener?.("change", systemListener);
    if (typeof updateBridge?.onUpdateStatus === "function") {
      try {
        const unsubscribe = updateBridge.onUpdateStatus(setUpdateStatus);
        if (typeof unsubscribe === "function") unsubscribeUpdate = unsubscribe;
      } catch (error) {
        state.update = normalizeUpdateStatus({ status: "error", error: error?.message || error });
      }
    }
    render();

    return Object.freeze({
      initialize,
      load,
      render,
      destroy() {
        comfySettings.destroy();
        localModels.dispose();
        modelTestDialog.destroy();
        destroyed = true;
        dismissListeners.abort();
        stopCliSession();
        unsubscribeUpdate?.();
        unsubscribeUpdate = null;
        media?.removeEventListener?.("change", systemListener);
        host.replaceChildren();
      },
      getState: () => ({ ...state, preferences: clone(state.preferences), providers: clone(state.providers), agentModels: clone(state.agentModels), agentDraft: clone(state.agentDraft) }),
    });
  }

  return Object.freeze({
    APIMART_RECOMMENDED_PROVIDER,
    DEFAULT_PREFERENCES,
    applyPreferences,
    createSettingsApp,
    createRecommendedApimartProvider,
    modelDiscoverySelectionState,
    selectNewDiscoveredModels,
    uniqueDiscoveredModels,
    normalizeProviderModels,
    normalizePreferences,
    normalizeUpdateStatus,
    agentSelectionValue,
    parseAgentSelectionValue,
    selectableModelProfiles,
    sectionIdsForRole,
    testRouteForCapabilities,
  });
});
