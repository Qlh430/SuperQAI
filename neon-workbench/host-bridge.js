(function () {
  "use strict";
  const desktop = document.getElementById("aiOsDesktop");
  if (!desktop) return;
  let frame = null;
  let accountId = "";
  let pending = false;
  let surface = null;
  let returnButton = null;
  let engineKind = "";
  let revision = 0;
  let activeBoardId = "";
  let assetDialogRequestId = "";
  let assetDialogState = null;
  let previousMaximizedChrome = null;
  let skillDialog = null;
  function closeSkillDialog(requestId) {
    if (!skillDialog || requestId !== skillDialog.requestId) return;
    const saved = skillDialog;
    skillDialog = null;
    message("neon:close-skill-square", { requestId });
    if (frame) {
      frame.hidden = saved.hidden;
      frame.style.cssText = saved.frameStyle;
    }
    if (surface) surface.inert = saved.inert;
    if (saved.revision === revision && saved.boardId === activeBoardId && saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
  }
  function openSkillDialog() {
    const session = window.AiOsDesktop?.getSession?.();
    if (!frame || !surface || surface.hidden || engineKind !== "canvas" || !activeBoardId || desktop.hidden
      || session?.user?.id !== accountId || pending || skillDialog) return;
    closeAssetDialog(assetDialogRequestId);
    const requestId = `${revision}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    skillDialog = { requestId, revision, accountId, boardId: activeBoardId, focus: document.activeElement, hidden: frame.hidden, frameStyle: frame.style.cssText, inert: surface.inert };
    surface.inert = true;
    frame.hidden = false;
    frame.style.display = "block";
    frame.style.zIndex = "2147483600";
    frame.style.background = "transparent";
    frame.focus({ preventScroll: true });
    message("neon:skill-square", { requestId, boardId: activeBoardId });
  }
  function moduleLoadError(loaded) {
    const report = window.AiOsModuleLoader?.getReport?.();
    const failures = (report?.failures || []).map(item => `${item.componentLabel || item.componentId}（${item.src}）`);
    const missing = loaded?.missing || [];
    return new Error(`工具组件加载失败：${[...failures, ...missing].join("、") || Object.entries(loaded?.components || {}).map(([id, state]) => `${id}: ${state}`).join("、") || "组件加载器尚未就绪"}。请刷新后重试。`);
  }
  function suppressHostChrome() {
    if (previousMaximizedChrome === null) {
      previousMaximizedChrome = document.documentElement.dataset.aiMaximizedChrome ?? "";
    }
    document.documentElement.dataset.aiMaximizedChrome = "true";
    document.body.classList.add("canvas-surface-open");
  }
  function restoreHostChrome() {
    if (previousMaximizedChrome !== null) {
      if (previousMaximizedChrome) document.documentElement.dataset.aiMaximizedChrome = previousMaximizedChrome;
      else delete document.documentElement.dataset.aiMaximizedChrome;
      previousMaximizedChrome = null;
    }
    document.body.classList.remove("canvas-surface-open");
  }
  function releaseSurface() {
    closeSkillDialog(skillDialog?.requestId);
    closeAssetDialog(assetDialogRequestId);
    if (surface) {
      surface.querySelectorAll(":scope > :not(header)").forEach(node => { node.hidden = true; document.body.append(node); });
      surface.remove();
    }
    surface = null; returnButton = null; engineKind = ""; activeBoardId = "";
    restoreHostChrome();
  }
  function closeAssetDialog(requestId) {
    if (!assetDialogState || requestId !== assetDialogRequestId) return false;
    const saved = assetDialogState;
    message("neon:cancel-add-assets", { requestId: assetDialogRequestId });
    assetDialogState = null; assetDialogRequestId = "";
    if (frame) {
      frame.hidden = saved.hidden;
      frame.style.display = saved.display;
      frame.style.zIndex = saved.zIndex;
      frame.style.pointerEvents = saved.pointerEvents;
      frame.style.background = saved.background;
    }
    if (surface) {
      surface.style.pointerEvents = saved.surfacePointerEvents;
      surface.style.zIndex = saved.surfaceZIndex;
    }
    if (saved.revision === revision && saved.accountId === window.AiOsDesktop?.getSession?.()?.user?.id
      && saved.boardId === activeBoardId && saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
    return true;
  }
  function openAssetDialog(detail) {
    const session = window.AiOsDesktop?.getSession?.();
    const items = Array.isArray(detail?.items) ? detail.items.filter(item => {
      if (!item || !["image", "video", "audio"].includes(item.kind) || typeof item.url !== "string" || !item.url.trim()) return false;
      try { const url = new URL(item.url, location.origin); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
    }).map(item => ({ url: item.url.trim(), kind: item.kind, title: String(item.title || ({ image: "图片", video: "视频", audio: "音频" })[item.kind]), ...(typeof item.mimeType === "string" && item.mimeType.startsWith(`${item.kind}/`) ? { mimeType: item.mimeType } : {}) })) : [];
    if (!frame || !surface || surface.hidden || surface.style.display === "none" || engineKind !== "canvas" || !session?.user || desktop.hidden
      || accountId !== session.user.id || !activeBoardId || String(detail?.boardId || "") !== activeBoardId || !items.length) return;
    closeSkillDialog(skillDialog?.requestId);
    closeAssetDialog(assetDialogRequestId);
    const focus = document.activeElement;
    const requestId = `${revision}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    assetDialogState = {
      hidden: frame.hidden, display: frame.style.display, zIndex: frame.style.zIndex,
      pointerEvents: frame.style.pointerEvents, background: frame.style.background,
      surfacePointerEvents: surface.style.pointerEvents, surfaceZIndex: surface.style.zIndex, focus,
      revision, accountId, boardId: activeBoardId,
    };
    assetDialogRequestId = requestId;
    frame.hidden = false;
    frame.style.display = "block";
    frame.style.zIndex = "2147483600";
    frame.style.pointerEvents = "auto";
    frame.style.background = "transparent";
    surface.style.pointerEvents = "none";
    surface.style.zIndex = "2147483000";
    frame.focus({ preventScroll: true });
    message("neon:add-assets", { items, requestId });
  }
  function message(type, detail) {
    frame?.contentWindow?.postMessage({ type, ...detail }, location.origin);
  }
  function sync() {
    const session = window.AiOsDesktop?.getSession?.();
    if (desktop.hidden || !session?.user) {
      revision += 1; pending = false; frame?.remove(); frame = null; releaseSurface(); accountId = "";
      return;
    }
    if (frame && accountId !== session.user.id) {
      revision += 1; pending = false; frame.remove(); frame = null; releaseSurface();
    }
    if (!frame) {
      accountId = session.user.id;
      frame = document.createElement("iframe");
      frame.id = "aiOsNeonFrame";
      frame.title = "BenDo Neon 工作台";
      frame.src = "./neon-workbench.html?v=20261007-comfy-shared-composer";
      frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9999;background:oklch(0.145 0.01 264)";
      document.body.appendChild(frame);
    }
  }
  async function returnToWorkbench() {
    if (pending) return;
    closeSkillDialog(skillDialog?.requestId);
    closeAssetDialog(assetDialogRequestId);
    const currentRevision = revision, button = returnButton;
    pending = true; button.disabled = true;
    try {
      if (engineKind === "canvas") await window.CanvasWorkspace.saveForNavigation();
      if (revision !== currentRevision || !frame || !surface) return;
      surface.hidden = true; surface.style.display = "none"; frame.hidden = false;
      restoreHostChrome();
      message("neon:return"); frame.focus();
    } catch {
      if (revision === currentRevision) button.textContent = "保存失败，点击重试返回";
    } finally { if (revision === currentRevision) pending = false; button.disabled = false; }
  }
  function createSurface(kind, node) {
    if (!surface) {
      surface = document.createElement("section");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b;color:#f5f6f0";
      returnButton = document.createElement("button");
      returnButton.type = "button";
      returnButton.textContent = "返回工作台";
      returnButton.title = "保存并返回工作台";
      returnButton.setAttribute("aria-label", "保存并返回工作台");
      returnButton.className = "text-action canvas-workbench-back";
      returnButton.style.cssText = "cursor:pointer";
      returnButton.addEventListener("click", () => void returnToWorkbench());
      document.body.append(surface);
    }
    suppressHostChrome();
      surface.querySelectorAll(":scope > *").forEach(n => n.remove());
      surface.append(node);
      node.querySelectorAll(".canvas-workbench-back").forEach(button => button.remove());
      surface.append(returnButton);
      node.hidden = false;
    node.style.flex = "1";
    node.style.minHeight = "0";
    node.style.width = "100%";
    surface.hidden = false;
    surface.style.display = "flex";
    engineKind = kind;
    returnButton.textContent = "返回工作台";
    frame.hidden = true;
  }
  async function invoke(event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (window.AiOsDesktop?.getSession?.()?.user?.id !== accountId || desktop.hidden) return;
    if (event.data?.type === "neon:models-changed") {
      window.dispatchEvent(new CustomEvent("ai-os-provider-catalog-changed", {
        detail: { catalogRevision: Math.max(0, Number(event.data.catalogRevision) || 0) },
      }));
      return;
    }
    if (event.data?.type === "neon:asset-dialog-closed") {
      closeAssetDialog(String(event.data.requestId || ""));
      return;
    }
    if (event.data?.type !== "neon:action") return;
    const { action, params } = event.data;
    if (action === "logout" || action === "sessionExpired") { location.reload(); return; }
    if (action === "closeSkillSquare") { closeSkillDialog(String(params?.requestId || "")); return; }
    if (action === "useCanvasSkill") {
      const current = skillDialog;
      if (!current || current.requestId !== params?.requestId || current.revision !== revision || current.boardId !== activeBoardId || current.accountId !== accountId || current.busy) return;
      current.busy = true;
      try {
        if (!window.CanvasAgentUi?.useSkill) throw new Error("Agent 尚未准备好，请关闭弹窗并重新打开 Agent。");
        await window.CanvasAgentUi.useSkill(String(params.skillId || ""), { boardId: current.boardId });
        if (skillDialog === current) { closeSkillDialog(current.requestId); document.querySelector("#canvasAgentPrompt")?.focus({ preventScroll: true }); }
      } catch (error) {
        if (skillDialog === current) message("neon:skill-error", { requestId: current.requestId, message: error.message || "Skill 载入失败。" });
      } finally { current.busy = false; }
      return;
    }
      if (action === "assetDialogClosed") { closeAssetDialog(String(params?.requestId || "")); return; }
      if (action === "workbenchHome" || action === "hostDesktop") {
        closeAssetDialog(assetDialogRequestId);
        // Keep the recovery path in Neon, including older cached fallback pages.
        if (surface) { surface.hidden = true; surface.style.display = "none"; }
        restoreHostChrome();
        frame.hidden = false;
        activeBoardId = "";
        frame.src = `./neon-workbench.html?recovery=${Date.now()}#home`;
        frame.focus();
        return;
      }
    if (pending) return;
    if (action !== "canvas") return;
    closeAssetDialog(assetDialogRequestId);
    pending = true;
    const currentRevision = revision, currentFrame = frame;
    const ensureCurrent = () => {
      if (currentRevision !== revision || frame !== currentFrame || desktop.hidden || window.AiOsDesktop?.getSession?.()?.user?.id !== accountId) throw new Error("会话已切换，已停止打开工具。");
    };
    try {
      const kind = "canvas";
      const modules = ["canvas-runtime"];
      const loaded = await window.AiOsModuleLoader?.ensure?.(modules);
      ensureCurrent();
      if (!loaded || loaded.ok === false) throw moduleLoadError(loaded);
      if (window.AiOsDesktop.openInlineApp) await window.AiOsDesktop.openInlineApp(kind);
      else window.AiOsDesktop.openApp(kind);
      ensureCurrent();
      const node = action === "canvas" ? window.AiOsLegacyWorkbench?.getView?.("canvas") : document.getElementById("aiOsSystemWindow");
      if (!node) throw new Error("工具尚未准备好，请稍后重试。");
      if (action === "canvas") {
        // Save before any creation or switch; never clear an unsaved canvas.
        await window.CanvasWorkspace.saveForNavigation();
        ensureCurrent();
        let resourceId = String(params?.resourceId || "");
        if (!resourceId) {
          let boardId = String(params?.boardId || "");
          if (!boardId) {
            const response = await fetch("/api/canvas/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "未命名画布", ...(params?.projectId ? { projectId: params.projectId } : {}) }) });
            const board = await response.json();
            ensureCurrent();
            if (!response.ok) throw new Error("创建画布失败，请检查权限后重试。");
            boardId = board.id;
          }
          const response = await fetch("/api/canvas/boards?scope=all", { cache: "no-store" });
          const data = await response.json();
          ensureCurrent();
          if (!response.ok) throw new Error("画布目录加载失败。");
          resourceId = (data.boards || []).find(b => b.id === boardId)?.resourceId || "";
        }
        if (!resourceId) throw new Error("未找到对应画布，请刷新项目列表后重试。");
        const opened = await window.CanvasWorkspace?.openBoardByResourceId?.(resourceId);
        ensureCurrent();
        if (!opened) throw new Error("画布打开失败，请检查访问权限后重试。");
      }
      createSurface(kind, node);
      if (params?.skillId) {
        await window.AiOsModuleLoader?.ensure?.(["canvas-agent-ui"]);
        ensureCurrent();
        if (!window.CanvasAgentUi?.useSkill) throw new Error("Agent 组件尚未准备好，请重新打开画布。");
        await window.CanvasAgentUi.useSkill(String(params.skillId));
        ensureCurrent();
      }
    } catch (error) {
      if (currentRevision !== revision || frame !== currentFrame) return;
      if (surface) { surface.hidden = true; surface.style.display = "none"; }
      if (frame) frame.hidden = false;
      message("neon:error", { message: error.message || "工具打开失败。" });
    } finally { if (currentRevision === revision) pending = false; }
  }
  new MutationObserver(sync).observe(desktop, { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("ai-os-session", sync);
  window.addEventListener("canvas:board-changed", event => {
    const nextBoardId = String(event.detail?.boardId || "");
    if (activeBoardId === nextBoardId) return;
    activeBoardId = nextBoardId;
    closeSkillDialog(skillDialog?.requestId);
    closeAssetDialog(assetDialogRequestId);
  });
  window.addEventListener("neon:request-add-assets", event => openAssetDialog(event.detail));
  window.addEventListener("neon:request-skill-square", openSkillDialog);
  window.addEventListener("message", event => void invoke(event));
  sync();
})();
