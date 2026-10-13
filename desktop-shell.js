(function () {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const MENU_BAR_HEIGHT = 38;
  const DOCK_HEIGHT = 86;
  const DRAG_THRESHOLD = 3;
  const TITLEBAR_GRAB_HEIGHT = 34;
  const state = {
    session: null,
    manager: null,
    runtime: null,
    settingsApp: null,
    activeWindowId: null,
    immersiveWindowId: null,
    bridgeReady: Boolean(window.AiOsLegacyWorkbench),
    pendingAppOpen: null,
    pendingAppOpenTimer: 0,
    pendingAppOpenNotified: false,
  };
  const shellNodes = new Map();
  const launchParams = new Map();
  const APP_MANIFESTS = [
    { id: "canvas", label: "无限画布", icon: "workflow", roles: ["superadmin", "user"], adapter: "legacy-dom", defaultSize: { width: 900, height: 620 }, minSize: { width: 460, height: 320 }, multiInstance: false },
    { id: "image", label: "AI 生图", icon: "image-plus", roles: ["superadmin", "user"], adapter: "legacy-dom", defaultSize: { width: 880, height: 640 }, minSize: { width: 460, height: 320 }, multiInstance: false },
    { id: "chat", label: "AI 对话", icon: "message-square", roles: ["superadmin", "user"], adapter: "legacy-dom", defaultSize: { width: 760, height: 620 }, minSize: { width: 420, height: 320 }, multiInstance: false },
    { id: "records", label: "历史记录", icon: "history", roles: ["superadmin", "user"], adapter: "legacy-dom", defaultSize: { width: 760, height: 560 }, minSize: { width: 420, height: 300 }, multiInstance: false },
    { id: "shared", label: "文件", icon: "folder-open", roles: ["superadmin", "user"], adapter: "legacy-dom", defaultSize: { width: 940, height: 650 }, minSize: { width: 520, height: 360 }, multiInstance: false },
    { id: "accounts", label: "账户管理", icon: "users", roles: ["superadmin"], adapter: "legacy-dom", defaultSize: { width: 900, height: 620 }, minSize: { width: 540, height: 360 }, multiInstance: false },
    { id: "settings", label: "系统设置", icon: "settings-2", roles: ["superadmin", "user"], adapter: "legacy-dom", defaultSize: { width: 1120, height: 720 }, minSize: { width: 680, height: 440 }, multiInstance: false },
  ];
  const APP_COMPONENT_DEPENDENCIES = Object.freeze({
    canvas: ["canvas-runtime"],
    image: ["canvas-runtime"],
    chat: ["canvas-runtime"],
    records: ["canvas-runtime"],
    shared: ["os-account-management"],
    accounts: ["os-account-management"],
    settings: ["system-settings", "provider-settings", "comfyui-settings", "local-models"],
  });
  const HOME_APP_META = Object.freeze({
    canvas: { summary: "项目工作区" },
    image: { summary: "图片生成" },
    chat: { summary: "智能对话" },
    records: { summary: "创作记录" },
    shared: { summary: "文件资源" },
    accounts: { summary: "账户与权限" },
    settings: { summary: "偏好与更新" },
  });
  const RESIZE_HANDLE_MARKUP = [
    '<i class="ai-os-resize-handle" data-resize="n"></i>', '<i class="ai-os-resize-handle" data-resize="ne"></i>',
    '<i class="ai-os-resize-handle" data-resize="e"></i>', '<i class="ai-os-resize-handle" data-resize="se"></i>',
    '<i class="ai-os-resize-handle" data-resize="s"></i>', '<i class="ai-os-resize-handle" data-resize="sw"></i>',
    '<i class="ai-os-resize-handle" data-resize="w"></i>', '<i class="ai-os-resize-handle" data-resize="nw"></i>',
  ].join("");
  const LEGACY_VIEW_SELECTORS = Object.freeze({
    canvas: "#canvasView",
    image: "#imageView",
    chat: "#chatView",
    records: "#recordsView",
    shared: "#aiOsSharedWindow",
    accounts: "#aiOsAccountsWindow",
    settings: "#aiOsSystemWindow",
  });

  function el(selector) { return document.querySelector(selector); }
  function getLegacyView(appId) {
    const selector = LEGACY_VIEW_SELECTORS[appId] || "";
    return window.AiOsLegacyWorkbench?.getView?.(appId)
      || (selector ? el(selector) : null);
  }
  function roleLabel(role) { return role === "superadmin" ? "超级管理员" : "普通用户"; }
  function currentAccountId(session) { return String(session?.user?.id || session?.user?.username || "anonymous"); }
  function manifestFor(appId) { return APP_MANIFESTS.find((app) => app.id === appId) || { label: "AI 工作台", icon: "app-window" }; }
  function displayScale() { return AiOsDisplay.normalizeScale(document.documentElement.dataset.uiScale); }
  function menuBarChromeHeight() {
    // A maximized app window supersedes the menu bar, so the work area also owns
    // the strip the bar would otherwise occupy.
    return document.documentElement.dataset.aiMaximizedChrome === "true" ? 0 : MENU_BAR_HEIGHT;
  }
  function desktopViewport() {
    return AiOsDisplay.logicalViewport(innerWidth, innerHeight, displayScale(), {
      menuBarHeight: menuBarChromeHeight(),
      dockHeight: DOCK_HEIGHT
    });
  }

  function paintAppImmersiveState() {
    shellNodes.forEach((node, id) => node.classList.toggle("is-immersive", id === state.immersiveWindowId));
  }

  function notifyAppImmersiveChanged(appId, active) {
    window.dispatchEvent(new CustomEvent("ai-os-app-immersive-changed", { detail: { appId, active: Boolean(active) } }));
  }

  function clearAppImmersive(windowId) {
    if (windowId && state.immersiveWindowId && windowId !== state.immersiveWindowId) return false;
    const current = state.immersiveWindowId ? state.manager?.getWindow(state.immersiveWindowId) : null;
    const appId = current?.appId || document.documentElement.dataset.aiImmersiveApp || "canvas";
    const changed = Boolean(state.immersiveWindowId || document.documentElement.dataset.aiImmersiveApp);
    state.immersiveWindowId = null;
    document.documentElement.removeAttribute("data-ai-immersive-app");
    paintAppImmersiveState();
    if (changed) notifyAppImmersiveChanged(appId, false);
    return changed;
  }

  function setAppImmersive(appId, active) {
    if (!active) return clearAppImmersive();
    const existing = state.manager?.getSnapshot().windows.find((item) => item.appId === appId);
    if (!existing || existing.minimized) {
      notifyAppImmersiveChanged(appId, false);
      return false;
    }
    state.immersiveWindowId = existing.id;
    document.documentElement.dataset.aiImmersiveApp = appId;
    paintAppImmersiveState();
    notifyAppImmersiveChanged(appId, true);
    return true;
  }

  function setError(message) {
    const target = el("#aiOsAuthError");
    if (target) { target.textContent = message || ""; target.hidden = !message; }
  }

  async function readResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `请求失败（${response.status}）`);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function authRequest(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body && typeof body !== "string") { headers["content-type"] = "application/json"; body = JSON.stringify(body); }
    const response = await nativeFetch(path, { ...options, headers, body, credentials: "same-origin" });
    if (response.status === 401 && !String(path).includes("/api/auth/")) {
      const data = await response.clone().json().catch(() => ({}));
      showAuthGate({ needsBootstrap: Boolean(data.needsBootstrap) });
    }
    return readResponse(response);
  }

  function showAuthGate({ needsBootstrap = false, disconnected = false } = {}) {
    clearAppImmersive();
    clearPendingAppOpenTimer();
    state.pendingAppOpen = null;
    state.pendingAppOpenNotified = false;
    state.manager?.closeAll();
    state.activeWindowId = null;
    launchParams.clear();
    state.session = null;
    state.settingsApp?.destroy?.();
    state.settingsApp = null;
    closeLaunchpad();
    el("#aiOsDesktopHome").hidden = true;
    document.documentElement.dataset.aiAuth = "login";
    el("#aiOsDesktop").hidden = true;
    el("#aiOsAuthGate").hidden = false;
    el("#aiOsLoginForm").hidden = needsBootstrap;
    el("#aiOsBootstrapForm").hidden = !needsBootstrap;
    el("#aiOsAuthEyebrow").textContent = needsBootstrap ? "FIRST RUN" : "安全登录";
    el("#aiOsAuthTitle").textContent = needsBootstrap ? "创建这台主机的管理员" : "回到你的工作空间";
    el("#aiOsAuthDescription").textContent = needsBootstrap ? "超级管理员负责分配账号。初始化完成后，其他设备即可在局域网内登录。" : "画布、文件与对话都只属于当前账号。";
    el("#aiOsHostStatus").textContent = disconnected ? "主机服务暂时无法连接" : needsBootstrap ? "等待主机初始化" : "主机服务运行正常";
  }

  /** 顶栏、头像与用户菜单里的账号文案统一从这里刷新。 */
  function syncSessionChrome() {
    const user = state.session?.user;
    if (!user) return;
    el("#aiOsUserName").textContent = user.displayName || user.username;
    el("#aiOsUserAvatar").textContent = (user.displayName || user.username || "A").slice(0, 1).toUpperCase();
    el("#aiOsPopoverName").textContent = user.displayName || user.username;
    el("#aiOsPopoverRole").textContent = `${roleLabel(user.role)} · ${user.username}`;
  }

  /**
   * 账户管理里改了当前登录账号的显示名称后，只刷新账号文案，
   * 不走 activateSession —— 那条路径会重建桌面运行时，把正在用的窗口全关掉。
   */
  function updateSessionUser(patch = {}) {
    const current = state.session?.user;
    if (!current || patch?.id !== current.id) return null;
    state.session = { ...state.session, user: { ...current, ...patch } };
    window.AiOsSession = state.session;
    syncSessionChrome();
    window.dispatchEvent(new CustomEvent("ai-os-session", { detail: state.session }));
    return state.session;
  }

  function ensureSettingsApp() {
    if (state.settingsApp) return state.settingsApp;
    if (!state.session || !window.AiOsSystemSettings) return null;
    state.settingsApp = window.AiOsSystemSettings.createSettingsApp({
      root: el("#aiOsSystemSettingsRoot"),
      document,
      sessionProvider: () => state.session,
      request: authRequest,
      toast,
      hostBridge: window.aiOsHost || null,
    });
    return state.settingsApp;
  }

  function activateSession(session) {
    state.session = session;
    window.AiOsSession = session;
    createDesktopRuntime(session);
    document.documentElement.dataset.aiAuth = "ready";
    el("#aiOsAuthGate").hidden = true;
    el("#aiOsDesktop").hidden = false;
    const user = session.user;
    syncSessionChrome();
    document.querySelectorAll("[data-superadmin-only]").forEach((node) => { node.hidden = user.role !== "superadmin"; });
    state.settingsApp?.destroy?.();
    state.settingsApp = null;
    const settingsApp = ensureSettingsApp();
    void settingsApp?.initialize?.();
    const passwordDialog = el("#aiOsPasswordDialog");
    if (passwordDialog) {
      passwordDialog.dataset.forced = user.mustChangePassword ? "true" : "false";
      passwordDialog.querySelectorAll('[value="cancel"]').forEach((button) => { button.hidden = Boolean(user.mustChangePassword); });
    }
    window.dispatchEvent(new CustomEvent("ai-os-session", { detail: session }));
    if (user.mustChangePassword) setTimeout(() => { toast("首次登录请先修改临时密码"); el("#aiOsPasswordDialog")?.showModal(); }, 180);
  }

  function createDesktopRuntime(session) {
    if (!window.AiOsWindowManager?.createWindowManager || !window.AiOsAppRuntime?.createAppRuntime) throw new Error("Desktop runtime modules failed to load.");
    clearAppImmersive();
    state.manager?.closeAll();
    state.activeWindowId = null;
    state.inlineAppId = null;
    state.inlineRevision = (state.inlineRevision || 0) + 1;
    shellNodes.forEach((node) => { node.hidden = true; });
    state.manager = window.AiOsWindowManager.createWindowManager({
      storage: localStorage,
      storageKey: `desktop-layout:${currentAccountId(session)}`,
      viewport: desktopViewport(),
      onChange(snapshot) { renderWindows(snapshot); },
    });
    state.runtime = window.AiOsAppRuntime.createAppRuntime({
      document,
      sessionProvider: () => state.session,
      invokeHost() { throw new Error("No iframe apps are registered in this desktop shell."); },
    });
    APP_MANIFESTS.forEach((manifest) => {
      state.manager.registerApp(manifest);
      state.runtime.register({ ...manifest, legacy: legacyAdapter(manifest.id) });
    });
    renderLaunchpad();
    renderDesktopHome();
    renderWindows(state.manager.getSnapshot());
  }

  function legacyAdapter(appId) {
    return {
      mount() {
        const view = getLegacyView(appId);
        if (!view) throw new Error(`Legacy view is unavailable for ${appId}.`);
        view.hidden = false;
        return view;
      },
      onActivate() {
        window.AiOsLegacyWorkbench?.activateTool?.(appId);
        emitLaunchParams(appId);
        if (appId === "shared") window.AiOsManagement?.loadResources?.();
        if (appId === "accounts") window.AiOsManagement?.loadUsers?.();
        if (appId === "settings" && state.settingsApp) void state.settingsApp.load();
      },
    };
  }

  function emitLaunchParams(appId) {
    const params = launchParams.get(appId);
    if (!params || Object.keys(params).length === 0) return false;
    window.dispatchEvent(new CustomEvent("ai-os-app-activate", { detail: { appId, params } }));
    launchParams.delete(appId);
    return true;
  }

  function bridgeIsReady() {
    if (!state.bridgeReady && (window.AiOsLegacyWorkbench || getLegacyView("canvas"))) state.bridgeReady = true;
    return state.bridgeReady;
  }

  function clearPendingAppOpenTimer() {
    if (!state.pendingAppOpenTimer) return;
    window.clearTimeout(state.pendingAppOpenTimer);
    state.pendingAppOpenTimer = 0;
  }

  function schedulePendingAppOpen() {
    clearPendingAppOpenTimer();
    state.pendingAppOpenTimer = window.setTimeout(() => {
      state.pendingAppOpenTimer = 0;
      const pending = state.pendingAppOpen;
      if (!pending) return;
      if (bridgeIsReady() || getLegacyView(pending.appId)) {
        flushPendingAppOpen();
        return;
      }
      if (!state.pendingAppOpenNotified) {
        state.pendingAppOpenNotified = true;
        toast(`${manifestFor(pending.appId).label}正在准备，完成后会自动打开。`);
      }
      schedulePendingAppOpen();
    }, 5000);
  }

  function flushPendingAppOpen() {
    const pending = state.pendingAppOpen;
    if (!pending) return null;
    clearPendingAppOpenTimer();
    state.pendingAppOpen = null;
    state.pendingAppOpenNotified = false;
    return openApp(pending.appId, pending.params);
  }

  function windowContent(windowId) {
    return shellNodes.get(windowId)?.querySelector("[data-window-content]") || null;
  }

  function clearWindowLoading(content) {
    content?.querySelectorAll?.(":scope > .ai-os-window-loading").forEach((node) => node.remove());
    content?.removeAttribute?.("aria-busy");
  }

  function showWindowLoading(content, message) {
    if (!content) return;
    clearWindowLoading(content);
    const overlay = document.createElement("div");
    overlay.className = "ai-os-window-loading";
    overlay.innerHTML = `<span aria-hidden="true"></span><strong></strong><small></small>`;
    overlay.querySelector("strong").textContent = message;
    overlay.querySelector("small").textContent = "完成后会自动显示，不需要重启 AI OS";
    content.dataset.appLoading = "true";
    content.setAttribute("aria-busy", "true");
    content.append(overlay);
  }

  async function prepareAppComponents(appId, windowId) {
    const dependencies = APP_COMPONENT_DEPENDENCIES[appId] || [];
    const loader = window.AiOsModuleLoader;
    if (!dependencies.length || !loader?.ensure) return;

    let settled = false;
    let loadingTimer = 0;
    const content = windowContent(windowId);
    loadingTimer = window.setTimeout(() => {
      if (!settled) showWindowLoading(content, "正在准备应用组件");
    }, 140);
    try {
      const result = await loader.ensure(dependencies);
      settled = true;
      window.clearTimeout(loadingTimer);
      clearWindowLoading(content);
      if (!state.session || !state.manager?.getWindow(windowId)) return;
      if (!result?.ok) {
        toast("应用组件没有完整加载，请重新打开应用或查看系统诊断。");
        return;
      }
      if (appId === "settings") {
        const settingsApp = ensureSettingsApp();
        await settingsApp?.initialize?.();
        if (state.activeWindowId === windowId) await settingsApp?.load?.();
      }
    } catch (error) {
      settled = true;
      window.clearTimeout(loadingTimer);
      clearWindowLoading(content);
      toast(error.message || "应用组件加载失败。");
    }
  }

  function openApp(appId, params) {
    if (!state.session || !state.manager || !state.runtime) return null;
    if (appId === "launcher") { toggleLaunchpad(); return null; }
    if (["canvas", "shared", "settings", "records", "accounts"].includes(appId) && el("#aiOsInlineWorkspace")) {
      state.manager.getSnapshot().windows.filter((item) => ["canvas", "shared", "settings"].includes(item.appId)).forEach((item) => closeWindow(item.id));
      showInlineApp(appId);
      return null;
    }
    const manifest = state.runtime.listVisible().find((app) => app.id === appId);
    if (!manifest) { toast("你没有权限打开此应用。"); return null; }
    if (!bridgeIsReady() && !getLegacyView(appId)) {
      if (state.pendingAppOpen?.appId !== appId) state.pendingAppOpenNotified = false;
      state.pendingAppOpen = { appId, params: { ...(params || {}) } };
      schedulePendingAppOpen();
      return null;
    }
    const existing = state.manager.getSnapshot().windows.find((item) => item.appId === appId);
    const wasActive = Boolean(existing && !existing.minimized && state.activeWindowId === existing.id);
    const requestedParams = appId === "canvas" && (!params || typeof params !== "object" || Object.keys(params).length === 0)
      ? { screen: "library" }
      : { ...(params || {}) };
    launchParams.set(appId, requestedParams);
    try {
      const windowState = state.manager.open(appId);
      renderWindows(state.manager.getSnapshot());
      mountWindow(windowState, params);
      focusWindow(windowState.id);
      if (["image", "chat"].includes(appId)) setAppImmersive(appId, true);
      void prepareAppComponents(appId, windowState.id);
      if (wasActive) emitLaunchParams(appId);
      return windowState;
    } catch (error) { toast(error.message); return null; }
  }

  function toggleDockApp(appId) {
    if (["canvas", "shared", "settings", "records", "accounts"].includes(appId) && el("#aiOsInlineWorkspace")) {
      openApp(appId);
      return null;
    }
    const existing = state.manager?.getSnapshot().windows.find((item) => item.appId === appId);
    if (!existing) return openApp(appId);
    if (!existing.minimized && state.activeWindowId === existing.id && state.manager.isReachable(existing.id)) {
      clearAppImmersive(existing.id);
      state.manager.minimize(existing.id);
      return state.manager.getWindow(existing.id);
    }
    return focusWindow(existing.id, { reveal: true });
  }

  function mountWindow(windowState) {
    const content = shellNodes.get(windowState.id)?.querySelector("[data-window-content]");
    if (!content) return;
    const record = state.runtime.mount(windowState.appId, { instanceId: windowState.id, container: content });
    if (record.node && record.node.parentNode !== content) content.appendChild(record.node);
    record.container = content;
  }

  function focusApp(appId) {
    const existing = state.manager?.getSnapshot().windows.find((item) => item.appId === appId);
    return existing ? focusWindow(existing.id, { reveal: true }) : openApp(appId);
  }

  function focusWindow(windowId, options) {
    if (!state.manager) return null;
    const existing = state.manager.getWindow(windowId);
    if (!existing) return null;
    if (existing.minimized) state.manager.restore(windowId);
    state.manager.focus(windowId, options);
    mountWindow(state.manager.getWindow(windowId));
    syncRuntimeFocus(state.manager.getSnapshot());
    return state.manager.getWindow(windowId);
  }

  function minimizeApp(appId) {
    const windowState = state.manager?.getSnapshot().windows.find((item) => item.appId === appId);
    if (windowState) {
      clearAppImmersive(windowState.id);
      state.manager.minimize(windowState.id);
    }
  }

  function closeApp(appId) {
    const windowState = state.manager?.getSnapshot().windows.find((item) => item.appId === appId);
    if (windowState) closeWindow(windowState.id);
  }

  function closeWindow(windowId) {
    const windowState = state.manager?.getWindow(windowId);
    if (!windowState) return;
    clearAppImmersive(windowId);
    if (state.activeWindowId === windowId) {
      state.runtime.deactivate(windowState.appId);
      state.activeWindowId = null;
    }
    state.manager.close(windowId);
  }

  function syncRuntimeFocus(snapshot) {
    const next = snapshot.windows.filter((item) => !item.minimized).sort((left, right) => right.zIndex - left.zIndex)[0] || null;
    const previous = state.activeWindowId && state.manager?.getWindow(state.activeWindowId);
    if (previous && (!next || previous.id !== next.id)) state.runtime.deactivate(previous.appId);
    if (next && (!previous || previous.id !== next.id)) {
      try {
        state.runtime.activate(next.appId);
      } catch (error) {
        if (/not mounted/i.test(error.message)) return;
        throw error;
      }
    }
    state.activeWindowId = next?.id || null;
    el("#aiOsActiveApp").textContent = next ? manifestFor(next.appId).label : "工作台";
  }

  function renderWindows(snapshot) {
    const layer = el("#aiOsWindowLayer");
    if (!layer) return;
    syncRuntimeFocus(snapshot);
    const liveIds = new Set(snapshot.windows.map((item) => item.id));
    shellNodes.forEach((node, id) => { if (!liveIds.has(id)) node.hidden = true; });
    snapshot.windows.forEach((windowState) => {
      let node = shellNodes.get(windowState.id);
      if (!node) {
        node = createWindowNode();
        shellNodes.set(windowState.id, node);
        layer.appendChild(node);
      }
      node.hidden = windowState.minimized || (el("#aiOsInlineWorkspace") && ["canvas", "shared", "settings", "records", "accounts"].includes(windowState.appId));
      node.dataset.windowId = windowState.id;
      node.dataset.appId = windowState.appId;
      node.style.transform = `translate(${windowState.x}px, ${windowState.y}px)`;
      node.style.width = `${windowState.width}px`;
      node.style.height = `${windowState.height}px`;
      node.style.zIndex = String(windowState.zIndex);
      node.classList.toggle("is-maximized", windowState.maximized);
      node.classList.toggle("is-focused", windowState.id === state.activeWindowId);
      node.querySelector("[data-window-label]").textContent = manifestFor(windowState.appId).label;
    });
    if (state.immersiveWindowId) {
      const immersiveWindow = snapshot.windows.find((item) => item.id === state.immersiveWindowId);
      if (!immersiveWindow || immersiveWindow.minimized) clearAppImmersive(state.immersiveWindowId);
      else paintAppImmersiveState();
    }
    renderDock(snapshot);
    syncDesktopHome(snapshot);
    syncMaximizedChrome(snapshot);
  }

  // Maximizing an app window supersedes the AI OS menu bar: the window grows to the
  // top of the screen and the bar returns the moment the window is restored. Narrow
  // viewports auto-maximize the top window, so the bar must stay there.
  function syncMaximizedChrome(snapshot) {
    const focused = state.activeWindowId ? state.manager?.getWindow(state.activeWindowId) : null;
    const wideEnough = (snapshot?.viewport?.width || 0) >= 860;
    const hide = Boolean(focused && !focused.minimized && focused.maximized && wideEnough);
    const wasHidden = document.documentElement.dataset.aiMaximizedChrome === "true";
    document.documentElement.dataset.aiMaximizedChrome = hide ? "true" : "false";
    if (hide !== wasHidden) state.manager?.setViewport(desktopViewport());
  }

  function createWindowNode() {
    const node = document.createElement("section");
    node.className = "ai-os-app-window";
    node.setAttribute("role", "dialog");
    node.innerHTML = `<header class="ai-os-app-titlebar"><span class="ai-os-traffic-lights"><button type="button" data-window-action="close" aria-label="关闭"></button><button type="button" data-window-action="minimize" aria-label="最小化"></button><button type="button" data-window-action="maximize" aria-label="最大化"></button></span><strong data-window-label></strong></header><div class="ai-os-window-content" data-window-content></div>${RESIZE_HANDLE_MARKUP}`;
    // 捕获阶段监听：标题栏与应用内部都会 stopPropagation，冒泡监听会被拦掉，
    // 导致点击被压在下面的窗口时无法置顶。
    node.addEventListener(
      "pointerdown",
      () => {
        if (node.dataset.windowId && node.dataset.windowId !== state.activeWindowId) {
          focusWindow(node.dataset.windowId);
        }
      },
      true,
    );
    node.querySelector(".ai-os-app-titlebar").addEventListener("pointerdown", (event) => startPointerOperation(event, node, "move"));
    node.querySelector(".ai-os-app-titlebar").addEventListener("dblclick", (event) => { if (!event.target.closest("button")) state.manager?.toggleMaximize(node.dataset.windowId); });
    node.querySelectorAll("[data-resize]").forEach((handle) => handle.addEventListener("pointerdown", (event) => startPointerOperation(event, node, handle.dataset.resize)));
    node.querySelectorAll("[data-window-action]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = node.dataset.windowId;
      if (button.dataset.windowAction === "close") { if (node.classList.contains("is-immersive")) { clearAppImmersive(id); state.manager?.minimize(id); } else closeWindow(id); }
      if (button.dataset.windowAction === "minimize") state.manager?.minimize(id);
      if (button.dataset.windowAction === "maximize") state.manager?.toggleMaximize(id);
      });
    });
    return node;
  }

  function startPointerOperation(event, node, operation) {
    if (event.button !== 0 || (operation === "move" && event.target.closest("button")) || desktopViewport().width < 860) return;
    event.preventDefault();
    event.stopPropagation();
    const manager = state.manager;
    const initial = manager?.getWindow(node.dataset.windowId);
    if (!initial) return;
    node.setPointerCapture?.(event.pointerId);
    const scale = displayScale();
    const origin = { x: event.clientX, y: event.clientY };
    let bounds = { ...initial };
    let pullingMaximized = operation === "move" && initial.maximized;
    let dragging = false;
    const move = (moveEvent) => {
      const dxPx = moveEvent.clientX - origin.x;
      const dyPx = moveEvent.clientY - origin.y;
      if (!dragging) {
        if (Math.abs(dxPx) < DRAG_THRESHOLD && Math.abs(dyPx) < DRAG_THRESHOLD) return;
        dragging = true;
        if (pullingMaximized) {
          // Windows behaviour: the drag first pulls the maximized window back to its
          // previous size, keeping the grabbed point under the cursor.
          const rect = node.getBoundingClientRect();
          const ratioX = rect.width ? Math.min(1, Math.max(0, (origin.x - rect.left) / rect.width)) : .5;
          const grabY = Math.min(TITLEBAR_GRAB_HEIGHT, Math.max(0, (origin.y - rect.top) / scale));
          const restored = manager.restoreForDrag(node.dataset.windowId);
          pullingMaximized = false;
          if (!restored || restored.maximized) return;
          const anchor = windowLayerOrigin();
          bounds = manager.setBounds(node.dataset.windowId, {
            x: origin.x / scale - anchor.x - ratioX * restored.width,
            y: origin.y / scale - anchor.y - grabY,
            width: restored.width,
            height: restored.height
          }) || restored;
          return;
        }
      }
      const dx = AiOsDisplay.logicalDelta(dxPx, scale);
      const dy = AiOsDisplay.logicalDelta(dyPx, scale);
      if (operation === "move") manager.move(node.dataset.windowId, bounds.x + dx, bounds.y + dy);
      else resizeFromHandle(bounds, operation, dx, dy);
    };
    const end = (endEvent) => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      node.releasePointerCapture?.(endEvent.pointerId);
      if (operation !== "move" || !dragging || initial.maximized) return;
      // Aero snap: letting go while the cursor sits on the top strip maximizes the window.
      if (endEvent.clientY / scale > MENU_BAR_HEIGHT) return;
      const current = manager.getWindow(node.dataset.windowId);
      if (current && !current.maximized) manager.maximize(node.dataset.windowId);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  // Window coordinates are relative to the window layer, so absolute pointer positions
  // have to be converted back through the layer origin before they can anchor a drag.
  function windowLayerOrigin() {
    const rect = el("#aiOsWindowLayer")?.getBoundingClientRect();
    const scale = displayScale();
    return rect ? { x: rect.left / scale, y: rect.top / scale } : { x: 0, y: MENU_BAR_HEIGHT };
  }

  function resizeFromHandle(windowState, direction, dx, dy) {
    let x = windowState.x;
    let y = windowState.y;
    let width = windowState.width;
    let height = windowState.height;
    if (direction.includes("e")) width += dx;
    if (direction.includes("s")) height += dy;
    const minimum = manifestFor(windowState.appId).minSize;
    const viewport = state.manager.getSnapshot().viewport;
    if (direction.includes("w")) {
      const right = windowState.x + windowState.width;
      x = Math.min(right - minimum.width, Math.max(0, windowState.x + dx));
      width = right - x;
    }
    if (direction.includes("n")) {
      const bottom = windowState.y + windowState.height;
      y = Math.min(bottom - minimum.height, Math.max(0, windowState.y + dy));
      height = bottom - y;
    }
    if (direction.includes("e")) width = Math.min(width, viewport.width - x);
    if (direction.includes("s")) height = Math.min(height, viewport.height - y);
    state.manager.setBounds(windowState.id, { x, y, width, height });
  }

  function renderDock(snapshot) {
    document.querySelectorAll("[data-ai-app]").forEach((button) => {
      const windows = snapshot.windows.filter((item) => item.appId === button.dataset.aiApp);
      const focused = windows.some((item) => item.id === state.activeWindowId);
      const minimized = windows.length > 0 && windows.every((item) => item.minimized);
      button.classList.toggle("ai-os-dock-running", windows.length > 0);
      button.classList.toggle("ai-os-dock-minimized", minimized);
      button.classList.toggle("ai-os-dock-focused", focused);
      button.setAttribute("aria-pressed", String(focused));
    });
  }

  function syncDesktopHome(snapshot) {
    const home = el("#aiOsDesktopHome");
    if (!home) return;
    const hasVisibleWindow = (snapshot?.windows || []).some((windowState) => !windowState.minimized && !["canvas", "shared", "settings", "records", "accounts"].includes(windowState.appId));
    home.hidden = hasVisibleWindow;
  }

  async function showInlineApp(appId) {
    const overview = el("#aiOsHomeOverview");
    const workspace = el("#aiOsInlineWorkspace");
    if (!overview || !workspace || !state.runtime) return;
    if (!state.runtime.listVisible().some((app) => app.id === appId)) {
      toast("你没有权限打开此页面。");
      return;
    }
    const revision = (state.inlineRevision || 0) + 1;
    state.inlineRevision = revision;
    const runtime = state.runtime;
    const previous = state.inlineAppId;
    if (previous && previous !== appId) {
      try { runtime.deactivate(previous); } catch {}
    }
    overview.hidden = true;
    workspace.hidden = false;
    workspace.dataset.appId = appId;
    workspace.setAttribute("aria-busy", "true");
    document.querySelectorAll(".ai-os-home-nav").forEach((item) => {
      const active = item.dataset.homeApp === appId;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    try {
      const result = await window.AiOsModuleLoader?.ensure?.(APP_COMPONENT_DEPENDENCIES[appId] || []);
      if (revision !== state.inlineRevision || runtime !== state.runtime) return;
      if (result?.ok === false) throw new Error("页面组件加载失败，请重试。");
      const record = runtime.mount(appId, { instanceId: `inline-${appId}`, container: workspace });
      if (!record?.node) throw new Error("页面内容尚未准备好，请重试。");
      workspace.replaceChildren(record.node);
      record.node.classList.add(`neon-page-${appId}`);
      const pageLabels = { canvas: "项目", shared: "素材", records: "历史记录", settings: "设置", accounts: "账户" };
      const pageChrome = document.createElement("header");
      pageChrome.className = "neon-page-chrome";
      pageChrome.innerHTML = `<button type="button" class="neon-page-back" aria-label="返回首页"><i data-lucide="arrow-left" aria-hidden="true"></i><span>返回首页</span></button><span class="neon-page-location">${pageLabels[appId] || "工作区"}</span>`;
      workspace.prepend(pageChrome);
      window.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      record.container = workspace;
      record.node.hidden = false;
      state.inlineAppId = appId;
      if (appId === "canvas") launchParams.set(appId, { screen: "library" });
      runtime.activate(appId);
      if (appId === "settings") {
        // The settings factory exists only after its module has loaded.
        const settingsApp = ensureSettingsApp();
        if (!settingsApp) throw new Error("设置组件尚未准备好，请重试。");
        await settingsApp.initialize?.();
        if (revision === state.inlineRevision) await settingsApp.load?.();
      }
    } catch (error) {
      if (revision !== state.inlineRevision) return;
      toast(error.message || "页面加载失败，请重试。");
      const notice = document.createElement("div");
      notice.className = "ai-os-inline-error";
      notice.setAttribute("role", "alert");
      const message = document.createElement("p");
      message.textContent = error.message || "页面加载失败。";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重新加载";
      retry.addEventListener("click", () => showInlineApp(appId));
      notice.append(message, retry);
      workspace.append(notice);
    } finally {
      if (revision === state.inlineRevision) workspace.removeAttribute("aria-busy");
    }
  }

  function renderDesktopHome() {
    const host = el("#aiOsDesktopHomeApps");
    if (!host || !state.runtime) return;
    state.manager?.getSnapshot().windows.filter((item) => ["canvas", "shared", "settings", "records", "accounts"].includes(item.appId)).forEach((item) => closeWindow(item.id));
    const apps = state.runtime.listVisible();
    const appButton = (app, extra = "") => `<button class="neon-home-card ${extra}" type="button" data-home-app="${app.id}" aria-label="打开${app.label}"><span class="neon-home-card-icon" aria-hidden="true"><i data-lucide="${manifestFor(app.id).icon}"></i></span><span class="neon-home-card-copy"><strong>${app.label}</strong><small>${(HOME_APP_META[app.id] || { summary: "打开应用" }).summary}</small></span><i class="neon-home-card-arrow" data-lucide="arrow-up-right" aria-hidden="true"></i></button>`;
    const quick = apps.filter((app) => ["image", "chat", "records", "shared"].includes(app.id));
    const admin = apps.filter((app) => ["accounts", "settings"].includes(app.id));
    host.innerHTML = `<div class="neon-app-shell"><aside class="neon-sidebar"><div class="neon-brand"><span class="neon-brand-mark" aria-hidden="true">∞</span><strong>AI OS</strong></div><button class="neon-create-button" type="button" data-home-app="canvas"><i data-lucide="plus" aria-hidden="true"></i><span>新建项目</span></button><nav class="neon-primary-nav" aria-label="主导航"><p>工作空间</p><button class="ai-os-home-nav neon-nav-item is-active" type="button" data-home-app="home" aria-current="page"><i data-lucide="house" aria-hidden="true"></i><span>首页</span></button><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="canvas"><i data-lucide="workflow" aria-hidden="true"></i><span>项目</span></button><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="shared"><i data-lucide="folder-open" aria-hidden="true"></i><span>素材</span></button><p>创作工具</p><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="image"><i data-lucide="image-plus" aria-hidden="true"></i><span>AI 生图</span></button><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="chat"><i data-lucide="message-square" aria-hidden="true"></i><span>AI 对话</span></button><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="records"><i data-lucide="history" aria-hidden="true"></i><span>历史记录</span></button><p>管理</p><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="settings"><i data-lucide="settings-2" aria-hidden="true"></i><span>设置</span></button><button class="ai-os-home-nav neon-nav-item" type="button" data-home-app="accounts"><i data-lucide="users" aria-hidden="true"></i><span>账户</span></button></nav><div class="neon-sidebar-user"><span>${state.session?.user?.displayName || "本机用户"}</span><small>本地创作工作台</small></div></aside><main class="neon-main"><div id="aiOsHomeOverview" class="neon-home-page"><header class="neon-page-header"><span>工作台</span><h1 id="aiOsDesktopHomeTitle">开始你的创作</h1><p>从一个项目开始，所有画布、素材和生成结果都会在这里持续保存。</p></header><button class="neon-start-card" type="button" data-home-app="canvas"><span class="neon-start-icon"><i data-lucide="plus" aria-hidden="true"></i></span><strong>新建画布项目</strong><small>进入无限画布开始创作</small></button><section class="neon-home-section"><div class="neon-section-heading"><h2>快速开始</h2><span>选择一个创作工具</span></div><div class="neon-home-grid">${quick.map((app) => appButton(app)).join("")}</div></section><section class="neon-home-section"><div class="neon-section-heading"><h2>最近项目</h2><button type="button" data-home-app="canvas">查看全部</button></div><div class="neon-empty-state"><i data-lucide="folder-plus" aria-hidden="true"></i><strong>最近还没有项目</strong><small>新建画布后，项目会显示在这里</small></div></section><div class="neon-admin-grid">${admin.map((app) => appButton(app)).join("")}</div></div><div id="aiOsInlineWorkspace" class="ai-os-inline-workspace" hidden></div></main></div>`;
    window.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    syncDesktopHome(state.manager?.getSnapshot());
  }
  function renderLaunchpad() {
    const launchpad = el("#aiOsLaunchpad");
    if (!launchpad || !state.runtime) return;
    launchpad.innerHTML = `<button class="ai-os-launchpad-backdrop" type="button" data-launchpad-close aria-label="关闭启动台"></button><div class="ai-os-launchpad-grid">${state.runtime.listVisible().map((app) => `<button type="button" data-launchpad-app="${app.id}"><i data-lucide="${manifestFor(app.id).icon}"></i><span>${app.label}</span></button>`).join("")}</div>`;
    launchpad.querySelector("[data-launchpad-close]").addEventListener("click", closeLaunchpad);
    launchpad.querySelectorAll("[data-launchpad-app]").forEach((button) => button.addEventListener("click", () => { closeLaunchpad(); openApp(button.dataset.launchpadApp); }));
    window.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  function toggleLaunchpad() {
    const launchpad = el("#aiOsLaunchpad");
    if (!launchpad) return;
    if (!launchpad.hidden) { closeLaunchpad(); return; }
    renderLaunchpad();
    launchpad.hidden = false;
    launchpad.classList.add("is-open");
  }

  function closeLaunchpad() { const launchpad = el("#aiOsLaunchpad"); if (launchpad) { launchpad.classList.remove("is-open"); launchpad.hidden = true; } }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = 0; let amount = bytes;
    while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
  }

  async function loadSystemStatus() {
    return state.settingsApp?.load?.();
  }

  function toast(message) {
    const region = el("#aiOsToastRegion");
    if (!region || !message) return;
    const item = document.createElement("div");
    item.className = "ai-os-toast";
    item.textContent = message;
    region.append(item);
    setTimeout(() => item.remove(), 4200);
  }

  function updateClock() {
    const clock = el("#aiOsClock");
    if (!clock) return;
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  }

  async function loadSession() {
    try {
      const response = await nativeFetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) { activateSession(await response.json()); return; }
      showAuthGate({ needsBootstrap: Boolean((await response.json().catch(() => ({}))).needsBootstrap) });
    } catch { showAuthGate({ disconnected: true }); setError("无法连接主机服务。请确认主机端 AI OS 已启动，并检查局域网连接。"); }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const pageBack = event.target.closest?.(".neon-page-back");
      if (pageBack) { event.preventDefault(); event.stopImmediatePropagation(); const overview = el("#aiOsHomeOverview"); const workspace = el("#aiOsInlineWorkspace"); if (overview && workspace) { workspace.hidden = true; overview.hidden = false; workspace.replaceChildren(); state.inlineAppId = null; document.querySelectorAll(".ai-os-home-nav").forEach((item) => { const active = item.dataset.homeApp === "home"; item.classList.toggle("is-active", active); if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); }); } return; }
      const nav = event.target.closest?.(".ai-os-home-nav[data-home-app]");
      const legacyButton = event.target.closest?.("[data-ai-app]");
      const appId = nav?.dataset.homeApp || legacyButton?.dataset.aiApp;
      if (!appId || !["home", "canvas", "shared", "image", "chat", "records", "settings", "accounts"].includes(appId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (nav) document.querySelectorAll(".ai-os-home-nav").forEach((item) => item.classList.toggle("is-active", item === nav));
      if (appId === "home") { const overview = el("#aiOsHomeOverview"); const workspace = el("#aiOsInlineWorkspace"); if (overview && workspace) { workspace.hidden = true; overview.hidden = false; } } else if (["canvas", "shared", "settings", "records", "accounts"].includes(appId)) showInlineApp(appId); else openApp(appId);
    }, true);
    window.addEventListener("ai-os-legacy-workbench-ready", () => {
      state.bridgeReady = true;
      if (state.session) {
        renderDesktopHome();
        renderLaunchpad();
      }
      flushPendingAppOpen();
    });
    window.addEventListener("ai-os-module-load-failed", () => {
      const pending = state.pendingAppOpen;
      if (!pending) return;
      clearPendingAppOpenTimer();
      state.pendingAppOpen = null;
      state.pendingAppOpenNotified = false;
      toast(`${manifestFor(pending.appId).label}组件加载失败，请重新加载页面后再试。`);
    });
    el("#aiOsLoginForm")?.addEventListener("submit", async (event) => {
      event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
      try { await authRequest("/api/auth/login", { method: "POST", body: { username: form.get("username"), password: form.get("password") } }); location.reload(); }
      catch (error) { setError(error.code === "invalid_credentials" ? "账号或密码不正确。" : error.message); }
    });
    el("#aiOsBootstrapForm")?.addEventListener("submit", async (event) => {
      event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const credentials = { username: form.get("username"), displayName: form.get("displayName"), password: form.get("password") };
      try { await authRequest("/api/auth/bootstrap", { method: "POST", body: credentials }); await authRequest("/api/auth/login", { method: "POST", body: credentials }); location.reload(); } catch (error) { setError(error.message); }
    });
    el("#aiOsDesktopHomeApps")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-home-app]");
      if (button) {
        const nav = button.closest(".ai-os-home-nav");
        if (nav) document.querySelectorAll(".ai-os-home-nav").forEach((item) => item.classList.toggle("is-active", item === nav));
        if (["canvas", "shared", "settings"].includes(button.dataset.homeApp)) showInlineApp(button.dataset.homeApp);
        else openApp(button.dataset.homeApp);
      }
    });
    document.querySelectorAll("[data-ai-app]").forEach((button) => button.addEventListener("click", () => toggleDockApp(button.dataset.aiApp)));
    el("#aiOsUserMenu")?.addEventListener("click", () => { el("#aiOsUserPopover").hidden = !el("#aiOsUserPopover").hidden; });
    el("#aiOsLogout")?.addEventListener("click", async () => { clearAppImmersive(); state.manager?.closeAll(); try { await authRequest("/api/auth/logout", { method: "POST" }); } catch {} location.reload(); });
    el("#aiOsChangePassword")?.addEventListener("click", () => { el("#aiOsUserPopover").hidden = true; el("#aiOsPasswordDialog")?.showModal(); });
    el("#aiOsRefreshHealth")?.addEventListener("click", loadSystemStatus);
    el("#aiOsPasswordForm")?.addEventListener("submit", async (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      const passwordForm = event.currentTarget;
      const form = new FormData(passwordForm);
        const currentPassword = String(form.get("currentPassword") || "");
        const newPassword = String(form.get("newPassword") || "");
        // 依赖原生 minlength 时表单会静默拒绝提交，用户只看到按钮没反应；
        // 这里自己校验并给出中文提示，规则与表单上写的一致。
        const showPasswordError = (message) => {
          const box = el("#aiOsPasswordError");
          if (box) { box.textContent = message; box.hidden = false; }
          toast(message);
          return undefined;
        };
        const errorBox = el("#aiOsPasswordError");
        if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }
        if (!currentPassword) return showPasswordError("请输入当前密码。");
        if (newPassword.trim().length < 8) return showPasswordError("新密码至少需要 8 位字符，且不能只包含空格。");
        if (newPassword === currentPassword) return showPasswordError("新密码不能与当前密码相同。");
      try {
          const data = await authRequest("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
        passwordForm.reset();
        el("#aiOsPasswordDialog").close();
        activateSession(data);
          // 工作台 iframe 之前拿到的是“必须先改临时密码”的 403，改密成功后要它重新取数，
          // 否则概览会一直停在旧提示上。
          document.getElementById("aiOsNeonFrame")?.contentWindow?.postMessage({ type: "neon:refresh" }, location.origin);
        toast("密码已更新，其他设备上的旧会话已退出");
        } catch (error) { showPasswordError(error?.message || "修改密码失败，请重试。"); }
    });
    el("#aiOsPasswordDialog")?.addEventListener("cancel", (event) => { if (event.currentTarget.dataset.forced === "true") event.preventDefault(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLaunchpad(); });
    window.addEventListener("resize", () => state.manager?.setViewport(desktopViewport()));
    window.addEventListener("ai-os-preferences-applied", () => state.manager?.setViewport(desktopViewport()));
    window.addEventListener("ai-os-app-immersive", (event) => {
      const appId = String(event.detail?.appId || "").trim();
      if (appId) setAppImmersive(appId, Boolean(event.detail?.active));
    });
    window.addEventListener("message", (event) => { state.runtime?.handleMessage(event); });
    document.addEventListener("pointermove", (event) => document.documentElement.style.setProperty("--os-pointer-x", `${Math.round(event.clientX / innerWidth * 100)}%`), { passive: true });
  }

  window.fetch = async function aiOsAuthenticatedFetch(input, init) {
    const response = await nativeFetch(input, init);
    const url = typeof input === "string" ? input : input?.url || "";
    if (response.status === 401 && !String(url).includes("/api/auth/")) {
      const data = await response.clone().json().catch(() => ({}));
      if (!data.code || data.code === "unauthorized" || data.code === "not_authenticated") showAuthGate({ needsBootstrap: Boolean(data.needsBootstrap) });
    }
    return response;
  };

  window.AiOsAppRegistry = { register() { throw new Error("Apps are registered by the desktop runtime."); }, getVisibleApps() { return state.runtime?.listVisible() || []; } };
  window.AiOsDesktop = {
    openApp,
    focusApp,
    minimizeApp,
    closeApp,
    setAppImmersive,
    openInlineApp: showInlineApp,
    setSession: activateSession,
    updateSessionUser,
    toast,
    getSession: () => state.session,
    isReady: () => Boolean(state.session && state.manager && state.runtime && state.bridgeReady),
  };
  bindEvents();
  updateClock();
  setInterval(updateClock, 30_000);
  loadSession();
})();



