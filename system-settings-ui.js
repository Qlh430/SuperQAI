(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsSystemSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const THEMES = Object.freeze(["light", "dark", "system"]);
  const SCALES = Object.freeze([0.75, 1, 1.25, 1.5, 1.75]);
  const ANIMATIONS = Object.freeze(["full", "reduced"]);
  const CAPABILITIES = Object.freeze([
    ["llm.chat", "对话"],
    ["llm.chat.vision", "识图"],
    ["llm.tools", "工具"],
    ["image.generate", "生图"],
    ["image.edit", "修图"],
    ["video.generate", "视频"],
    ["audio.generate", "音频"],
  ]);
  const DEFAULT_PREFERENCES = Object.freeze({
    appearance: Object.freeze({ theme: "system", scale: 1, animations: "full" }),
    canvas: Object.freeze({ theme: "system" }),
  });
  const SECTION_DEFINITIONS = Object.freeze([
    { id: "appearance", label: "外观", icon: "◐", group: "个人" },
    { id: "account", label: "账户", icon: "●", group: "个人" },
    { id: "system", label: "系统信息", icon: "⌁", group: "系统" },
    { id: "host", label: "主机管理", icon: "⌂", group: "管理", admin: true },
    { id: "providers", label: "模型服务", icon: "✦", group: "管理", admin: true },
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function allowed(value, values, fallback) {
    return values.includes(value) ? value : fallback;
  }

  function normalizePreferences(value = {}, fallback = DEFAULT_PREFERENCES) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_PREFERENCES;
    const requestedScale = Number(source.appearance?.scale ?? base.appearance?.scale ?? 1);
    return {
      appearance: {
        theme: allowed(String(source.appearance?.theme ?? base.appearance?.theme ?? "system"), THEMES, "system"),
        scale: SCALES.includes(requestedScale) ? requestedScale : 1,
        animations: allowed(String(source.appearance?.animations ?? base.appearance?.animations ?? "full"), ANIMATIONS, "full"),
      },
      canvas: {
        theme: allowed(String(source.canvas?.theme ?? base.canvas?.theme ?? "system"), THEMES, "system"),
      },
    };
  }

  function resolveTheme(mode, media) {
    return mode === "system" ? (media?.matches ? "dark" : "light") : mode;
  }

  function applyPreferences(value, documentRoot, media) {
    const preferences = normalizePreferences(value);
    const target = documentRoot || (typeof document !== "undefined" ? document.documentElement : null);
    if (!target) return preferences;
    const query = media || (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : { matches: false });
    target.dataset.themeMode = preferences.appearance.theme;
    target.dataset.theme = resolveTheme(preferences.appearance.theme, query);
    target.dataset.canvasThemeMode = preferences.canvas.theme;
    target.dataset.canvasTheme = resolveTheme(preferences.canvas.theme, query);
    target.dataset.animations = preferences.appearance.animations;
    target.dataset.uiScale = String(preferences.appearance.scale);
    target.style?.setProperty?.("--os-ui-scale", String(preferences.appearance.scale));
    try { globalThis.localStorage?.setItem("ai-theme-mode", preferences.appearance.theme); } catch {}
    const ownerWindow = target.ownerDocument?.defaultView;
    if (ownerWindow?.CustomEvent) {
      ownerWindow.dispatchEvent(new ownerWindow.CustomEvent("ai-os-preferences-applied", { detail: preferences }));
    }
    return preferences;
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

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = bytes;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
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
    const state = {
      section: "appearance",
      preferences: clone(DEFAULT_PREFERENCES),
      providers: [],
      protocols: [],
      selectedProviderId: "",
      draftProvider: null,
      autoFallback: true,
      health: null,
      backup: null,
      autostart: null,
      loading: false,
    };

    function session() { return sessionProvider() || {}; }
    function role() { return String(session()?.user?.role || "user"); }
    function isAdmin() { return role() === "superadmin"; }
    function visibleSections() { return SECTION_DEFINITIONS.filter((section) => !section.admin || isAdmin()); }
    function selectedProvider() {
      return state.draftProvider || state.providers.find((provider) => provider.id === state.selectedProviderId) || null;
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
        }
        const [preferences, health, providers, protocols, fallback, backup] = await Promise.all(requests);
        state.preferences = normalizePreferences(preferences.preferences || preferences);
        state.health = health;
        if (isAdmin()) {
          state.providers = Array.isArray(providers?.providers) ? providers.providers : [];
          state.protocols = Array.isArray(protocols?.protocols) ? protocols.protocols : [];
          state.autoFallback = fallback?.enabled !== false;
          state.backup = backup;
          if (!state.selectedProviderId || !state.providers.some((provider) => provider.id === state.selectedProviderId)) {
            state.selectedProviderId = state.providers[0]?.id || "";
            state.draftProvider = null;
          }
          if (options.hostBridge?.getAutostart) state.autostart = await options.hostBridge.getAutostart();
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
      return `<section class="settings-page" data-settings-section="appearance">
        <header><p>APPEARANCE</p><h2>外观</h2><span>你的显示偏好只保存在当前账号。</span></header>
        <div class="settings-theme-grid" role="group" aria-label="界面主题">
          ${THEMES.map((theme) => `<button type="button" data-settings-theme="${theme}" class="${preference.appearance.theme === theme ? "active" : ""}"><span class="settings-theme-preview ${theme}"><i></i><b></b></span><strong>${themeNames[theme]}</strong></button>`).join("")}
        </div>
        <article class="settings-card">
          <div class="settings-row"><div><strong>界面缩放</strong><span>调整菜单、窗口与设置内容的显示大小。</span></div></div>
          <div class="settings-scale-grid">${SCALES.map((scale) => `<button type="button" data-settings-scale="${scale}" class="${preference.appearance.scale === scale ? "active" : ""}"><i style="--scale:${scale}">文</i><strong>${scaleNames[scale]}</strong><span>${Math.round(scale * 100)}%</span></button>`).join("")}</div>
          <label class="settings-row settings-toggle-row"><div><strong>减少动态效果</strong><span>降低窗口和界面的动画幅度。</span></div><input type="checkbox" data-settings-animations ${preference.appearance.animations === "reduced" ? "checked" : ""} /><i></i></label>
        </article>
        <article class="settings-card">
          <div class="settings-row"><div><strong>画布主题</strong><span>可与系统界面独立，适合不同创作环境。</span></div><div class="settings-segmented">${THEMES.map((theme) => `<button type="button" data-settings-canvas-theme="${theme}" class="${preference.canvas.theme === theme ? "active" : ""}">${themeNames[theme]}</button>`).join("")}</div></div>
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
      </section>`;
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

    function protocolOptions(selected) {
      const values = state.protocols.length ? state.protocols : [{ id: selected || "openai", label: selected || "OpenAI 兼容" }];
      return values.map((protocol) => `<option value="${escapeHtml(protocol.id)}" ${protocol.id === selected ? "selected" : ""}>${escapeHtml(protocol.label || protocol.id)}</option>`).join("");
    }

    function modelMarkup(model, index) {
      return `<article class="settings-model-row" data-provider-model data-model-id="${escapeHtml(model.id)}">
        <div class="settings-model-heading"><span class="settings-model-order">${index + 1}</span><label><span>模型 ID</span><input data-model-id-input value="${escapeHtml(model.id)}" /></label><label><span>显示名称</span><input data-model-name value="${escapeHtml(model.displayName || model.id)}" /></label></div>
        <div class="settings-model-meta"><label><span>模型协议</span><select data-model-protocol>${protocolOptions(model.protocol || model.modelProtocol)}</select></label><div class="settings-model-actions"><button type="button" data-model-test>测试</button><button type="button" data-model-move="up" aria-label="上移模型">↑</button><button type="button" data-model-move="down" aria-label="下移模型">↓</button><button type="button" data-model-remove aria-label="移除模型">移除</button></div></div>
        <div class="settings-capability-list">${capabilityMarkup(model)}</div>
      </article>`;
    }

    function providerSidebarMarkup() {
      return `<aside class="settings-provider-sidebar">
        <div class="settings-provider-sidebar-heading"><div><strong>提供商</strong><span>${state.providers.length} 个站点</span></div><button type="button" data-provider-new aria-label="新建提供商">＋</button></div>
        <div class="settings-provider-list">${state.providers.map((provider, index) => `<div class="settings-provider-item ${provider.id === state.selectedProviderId && !state.draftProvider ? "active" : ""}"><button type="button" data-provider-select="${escapeHtml(provider.id)}"><i class="${provider.enabled ? "online" : ""}"></i><span><strong>${escapeHtml(provider.name)}</strong><small>${escapeHtml(provider.protocol)} · ${provider.models?.length || 0} 个模型</small></span></button><span><button type="button" data-provider-move="up" data-provider-id="${escapeHtml(provider.id)}" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-provider-move="down" data-provider-id="${escapeHtml(provider.id)}" ${index === state.providers.length - 1 ? "disabled" : ""}>↓</button></span></div>`).join("")}</div>
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

    function providerEditorMarkup() {
      const provider = selectedProvider();
      if (!provider) return `<div class="settings-provider-empty"><i>✦</i><h3>添加第一个模型服务</h3><p>一个提供商集中管理地址、协议、密钥和模型。</p><button type="button" class="settings-primary-button" data-provider-new>新建提供商</button></div>`;
      const isNew = Boolean(state.draftProvider);
      return `<form class="settings-provider-form" data-provider-form>
        <header><div><p>${isNew ? "NEW PROVIDER" : "MODEL PROVIDER"}</p><h3>${escapeHtml(provider.name || "新提供商")}</h3><span>${provider.apiKeyMasked ? `密钥已保存：${escapeHtml(provider.apiKeyMasked)}` : "密钥只保存在主机加密保险库中"}</span></div><label class="settings-inline-toggle"><input type="checkbox" name="enabled" ${provider.enabled !== false ? "checked" : ""} /><i></i><span>启用</span></label></header>
        <div class="settings-provider-fields">
          <label><span>标识</span><input name="id" value="${escapeHtml(provider.id)}" ${isNew ? "" : "readonly"} required /></label>
          <label><span>名称</span><input name="name" value="${escapeHtml(provider.name || "")}" required /></label>
          <label class="wide"><span>Base URL</span><input name="baseUrl" type="url" value="${escapeHtml(provider.baseUrl || "")}" placeholder="https://api.openai.com/v1" required /></label>
          <label><span>站点协议</span><select name="protocol">${protocolOptions(provider.protocol)}</select></label>
          <label><span>API Key</span><input name="apiKey" type="password" value="" autocomplete="new-password" placeholder="${provider.hasApiKey ? "留空则保持现有密钥" : "粘贴密钥"}" /></label>
        </div>
        <div class="settings-provider-toolbar"><button type="button" data-provider-verify>验证协议</button><button type="button" data-provider-sync>拉取模型</button><span>验证和拉取只在点击时访问上游。</span></div>
        <section class="settings-model-section"><div class="settings-model-title"><div><strong>模型</strong><span>${provider.models?.length || 0} 个</span></div><div><input data-new-model-id placeholder="输入模型 ID" /><button type="button" data-model-add>添加</button></div></div>${(provider.models || []).map(modelMarkup).join("") || '<p class="settings-model-empty">还没有模型。可从站点拉取，或手动输入模型 ID。</p>'}</section>
        <footer><div>${isNew ? "保存后才会向所有账号开放已启用的模型。" : "API Key 不会回填到浏览器。"}</div><span>${!isNew ? '<button type="button" class="settings-danger-button" data-provider-delete>删除</button>' : ""}<button type="submit" class="settings-primary-button">保存更改</button></span></footer>
      </form>`;
    }

    function providersMarkup() {
      return `<section class="settings-page settings-provider-page" data-settings-section="providers">
        <header><p>MODEL SERVICES</p><h2>模型服务</h2><span>一个入口管理对话、Agent、图片、视频和音频所用的模型。</span></header>
        <div class="settings-provider-workspace">${providerSidebarMarkup()}<div class="settings-provider-editor">${providerEditorMarkup()}</div></div>
      </section>`;
    }

    function pageMarkup() {
      if (!sectionIdsForRole(role()).includes(state.section)) state.section = "appearance";
      if (state.section === "appearance") return appearanceMarkup();
      if (state.section === "account") return accountMarkup();
      if (state.section === "system") return systemMarkup();
      if (state.section === "host" && isAdmin()) return hostMarkup();
      if (state.section === "providers" && isAdmin()) return providersMarkup();
      return appearanceMarkup();
    }

    function render() {
      const user = session().user || {};
      const name = user.displayName || user.username || "账户";
      host.innerHTML = `<div class="ai-os-settings-layout">
        <aside class="ai-os-settings-sidebar"><div class="settings-sidebar-lights"><i></i><i></i><i></i></div><label class="settings-search"><span>⌕</span><input type="search" placeholder="搜索设置" aria-label="搜索设置" /></label><div class="settings-user-card"><i>${escapeHtml(name.slice(0, 1).toUpperCase())}</i><span><strong>${escapeHtml(name)}</strong><small>${isAdmin() ? "超级管理员" : "普通用户"}</small></span></div><nav>${navigationMarkup()}</nav></aside>
        <main class="ai-os-settings-main">${state.loading ? '<div class="settings-loading-bar"></div>' : ""}${pageMarkup()}</main>
      </div>`;
    }

    function readProviderForm() {
      const form = host.querySelector("[data-provider-form]");
      if (!form) return selectedProvider();
      const data = new FormData(form);
      const previous = selectedProvider() || {};
      const models = [...form.querySelectorAll("[data-provider-model]")].map((row, index) => ({
        id: row.querySelector("[data-model-id-input]")?.value.trim(),
        displayName: row.querySelector("[data-model-name]")?.value.trim(),
        protocol: row.querySelector("[data-model-protocol]")?.value || data.get("protocol"),
        capabilities: [...row.querySelectorAll("[data-model-capability]:checked")].map((input) => input.dataset.modelCapability),
        sortOrder: index,
        metadata: previous.models?.find((model) => model.id === row.dataset.modelId)?.metadata || {},
      })).filter((model) => model.id);
      return {
        ...previous,
        id: String(data.get("id") || "").trim(),
        name: String(data.get("name") || "").trim(),
        baseUrl: String(data.get("baseUrl") || "").trim(),
        protocol: String(data.get("protocol") || "openai"),
        enabled: data.get("enabled") === "on",
        apiKey: String(data.get("apiKey") || ""),
        models,
      };
    }

    async function reloadProviders(selectedId) {
      const data = await options.request("/api/providers");
      state.providers = Array.isArray(data.providers) ? data.providers : [];
      state.selectedProviderId = selectedId && state.providers.some((provider) => provider.id === selectedId)
        ? selectedId
        : state.providers[0]?.id || "";
      state.draftProvider = null;
      render();
    }

    async function saveProvider(event) {
      event.preventDefault();
      const provider = readProviderForm();
      try {
        const data = await options.request("/api/providers", { method: "POST", body: provider });
        notify(state.draftProvider ? "提供商已创建" : "提供商已保存");
        await reloadProviders(data.provider?.id || provider.id);
      } catch (error) { notify(error.message); }
    }

    async function verifyProvider() {
      const provider = readProviderForm();
      try {
        const result = await options.request("/api/providers/verify-protocol", { method: "POST", body: { provider } });
        notify(`协议验证通过：${result.protocol || provider.protocol}`);
      } catch (error) { notify(error.message); }
    }

    async function syncModels() {
      const provider = readProviderForm();
      try {
        const result = await options.request("/api/providers/models", { method: "POST", body: { provider } });
        const existing = new Map((provider.models || []).map((model) => [model.id, model]));
        (result.models || []).forEach((id) => {
          if (!existing.has(id)) existing.set(id, { id, displayName: id, protocol: provider.protocol, capabilities: ["llm.chat"] });
        });
        state.draftProvider = { ...provider, models: [...existing.values()] };
        notify(`已读取 ${result.models?.length || 0} 个模型`);
        render();
      } catch (error) { notify(error.message); }
    }

    async function testModel(button) {
      const provider = readProviderForm();
      const row = button.closest("[data-provider-model]");
      const modelId = row?.querySelector("[data-model-id-input]")?.value.trim();
      const model = provider.models.find((item) => item.id === modelId);
      const route = testRouteForCapabilities(model?.capabilities);
      if (!modelId || !route) { notify("请先为模型选择一种可测试能力"); return; }
      const input = route === "/api/providers/test-vision" ? { messages: [{ role: "user", content: "ping" }] } : { prompt: "ping" };
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "测试中…";
      try {
        await options.request(route, { method: "POST", body: { provider, modelId, input } });
        notify(`${model.displayName || model.id} 连接正常`);
      } catch (error) { notify(error.message); }
      finally { button.disabled = false; button.textContent = originalText; }
    }

    async function reorderProviders(providerId, direction) {
      const ids = state.providers.map((provider) => provider.id);
      const index = ids.indexOf(providerId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      try {
        const data = await options.request("/api/providers/reorder", { method: "POST", body: { providerIds: ids } });
        state.providers = data.providers || state.providers;
        render();
      } catch (error) { notify(error.message); }
    }

    async function reorderModels(direction, button) {
      const provider = readProviderForm();
      const row = button.closest("[data-provider-model]");
      const index = provider.models.findIndex((model) => model.id === row?.querySelector("[data-model-id-input]")?.value.trim());
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= provider.models.length) return;
      [provider.models[index], provider.models[target]] = [provider.models[target], provider.models[index]];
      if (!state.draftProvider && state.providers.some((item) => item.id === provider.id)) {
        try {
          const data = await options.request("/api/providers/models/reorder", { method: "POST", body: { providerId: provider.id, modelIds: provider.models.map((model) => model.id) } });
          state.providers = state.providers.map((item) => item.id === provider.id ? data.provider : item);
        } catch (error) { notify(error.message); return; }
      } else state.draftProvider = provider;
      render();
    }

    async function onClick(event) {
      const nav = event.target.closest("[data-settings-nav]");
      if (nav) { state.section = nav.dataset.settingsNav; if (state.section === "providers" && isAdmin() && !state.providers.length) await load(); else render(); return; }
      const theme = event.target.closest("[data-settings-theme]")?.dataset.settingsTheme;
      if (theme) { await savePreferences({ ...state.preferences, appearance: { ...state.preferences.appearance, theme } }); return; }
      const scale = event.target.closest("[data-settings-scale]")?.dataset.settingsScale;
      if (scale) { await savePreferences({ ...state.preferences, appearance: { ...state.preferences.appearance, scale: Number(scale) } }); return; }
      const canvasTheme = event.target.closest("[data-settings-canvas-theme]")?.dataset.settingsCanvasTheme;
      if (canvasTheme) { await savePreferences({ ...state.preferences, canvas: { theme: canvasTheme } }); return; }
      const select = event.target.closest("[data-provider-select]");
      if (select) { state.selectedProviderId = select.dataset.providerSelect; state.draftProvider = null; render(); return; }
      if (event.target.closest("[data-provider-new]")) { state.draftProvider = emptyProvider(); state.selectedProviderId = ""; render(); return; }
      const providerMove = event.target.closest("[data-provider-move]");
      if (providerMove) { await reorderProviders(providerMove.dataset.providerId, providerMove.dataset.providerMove); return; }
      if (event.target.closest("[data-provider-verify]")) { await verifyProvider(); return; }
      if (event.target.closest("[data-provider-sync]")) { await syncModels(); return; }
      const modelTest = event.target.closest("[data-model-test]");
      if (modelTest) { await testModel(modelTest); return; }
      const modelMove = event.target.closest("[data-model-move]");
      if (modelMove) { await reorderModels(modelMove.dataset.modelMove, modelMove); return; }
      const removeModel = event.target.closest("[data-model-remove]");
      if (removeModel) { const provider = readProviderForm(); const index = [...host.querySelectorAll("[data-provider-model]")].indexOf(removeModel.closest("[data-provider-model]")); provider.models.splice(index, 1); state.draftProvider = provider; render(); return; }
      if (event.target.closest("[data-model-add]")) { const provider = readProviderForm(); const input = host.querySelector("[data-new-model-id]"); const id = input?.value.trim(); if (!id) return; if (!provider.models.some((model) => model.id === id)) provider.models.push({ id, displayName: id, protocol: provider.protocol, capabilities: ["llm.chat"] }); state.draftProvider = provider; render(); return; }
      if (event.target.closest("[data-provider-delete]")) { const provider = selectedProvider(); if (!provider || !globalThis.confirm?.(`删除提供商“${provider.name}”？`)) return; try { await options.request(`/api/providers/${encodeURIComponent(provider.id)}`, { method: "DELETE" }); notify("提供商已删除"); await reloadProviders(); } catch (error) { notify(error.message); } return; }
      if (event.target.closest("[data-host-backup]")) { try { await options.request("/api/admin/backup", { method: "POST", body: { includeMedia: true } }); notify("系统备份已完成"); await load(); } catch (error) { notify(error.message); } }
    }

    async function onChange(event) {
      if (event.target.matches("[data-settings-animations]")) {
        await savePreferences({ ...state.preferences, appearance: { ...state.preferences.appearance, animations: event.target.checked ? "reduced" : "full" } });
        return;
      }
      if (event.target.matches("[data-provider-fallback]")) {
        try { const data = await options.request("/api/providers/auto-fallback", { method: "POST", body: { enabled: event.target.checked } }); state.autoFallback = Boolean(data.enabled); render(); } catch (error) { notify(error.message); }
        return;
      }
      if (event.target.matches("[data-host-autostart]") && options.hostBridge?.setAutostart) {
        try { state.autostart = await options.hostBridge.setAutostart(event.target.checked); notify(state.autostart.enabled ? "已开启开机自动启动" : "已关闭开机自动启动"); render(); } catch (error) { notify(error.message); }
      }
    }

    function onInput(event) {
      const search = event.target.closest(".settings-search input");
      if (!search) return;
      const query = search.value.trim().toLowerCase();
      host.querySelectorAll("[data-settings-nav]").forEach((button) => { button.hidden = Boolean(query) && !button.textContent.toLowerCase().includes(query); });
    }

    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    host.addEventListener("input", onInput);
    host.addEventListener("submit", (event) => { if (event.target.matches("[data-provider-form]")) saveProvider(event); });
    const systemListener = () => {
      if (state.preferences.appearance.theme === "system" || state.preferences.canvas.theme === "system") {
        applyPreferences(state.preferences, doc?.documentElement, media);
      }
    };
    media?.addEventListener?.("change", systemListener);
    render();

    return Object.freeze({
      initialize,
      load,
      render,
      destroy() {
        media?.removeEventListener?.("change", systemListener);
        host.replaceChildren();
      },
      getState: () => ({ ...state, preferences: clone(state.preferences), providers: clone(state.providers) }),
    });
  }

  return Object.freeze({
    DEFAULT_PREFERENCES,
    applyPreferences,
    createSettingsApp,
    normalizePreferences,
    sectionIdsForRole,
    testRouteForCapabilities,
  });
});
