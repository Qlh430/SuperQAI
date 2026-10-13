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
  let previousMaximizedChrome = null;
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
    if (surface) {
      surface.querySelectorAll(":scope > :not(header)").forEach(node => { node.hidden = true; document.body.append(node); });
      surface.remove();
    }
    surface = null; returnButton = null; engineKind = "";
    restoreHostChrome();
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
      frame.title = "AI OS Neon 工作台";
      frame.src = "./neon-workbench.html?v=20261007-comfy-shared-composer";
      frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9999;background:oklch(0.145 0.01 264)";
      document.body.appendChild(frame);
    }
  }
  async function returnToWorkbench() {
    if (pending) return;
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
    if (!window.AiOsDesktop?.getSession?.()?.user || desktop.hidden) return;
    if (event.data?.type === "neon:models-changed") {
      window.dispatchEvent(new CustomEvent("ai-os-provider-catalog-changed", {
        detail: { catalogRevision: Math.max(0, Number(event.data.catalogRevision) || 0) },
      }));
      return;
    }
    if (event.data?.type !== "neon:action") return;
    const { action, params } = event.data;
    if (action === "logout" || action === "sessionExpired") { location.reload(); return; }
      if (action === "hostDesktop") {
        // 工作台页面自己起不来时，至少让用户能回到宿主桌面再决定重开还是退出，
        // 不要把整块黑色 iframe 留在屏幕上。
        if (frame) frame.hidden = true;
        window.AiOsDesktop?.toast?.("已回到 AI OS 桌面，可从启动台重新打开工作台。");
        return;
      }
    if (pending) return;
    if (action !== "canvas") return;
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
      if (loaded?.ok === false) throw new Error("工具组件加载失败，请重试。");
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
    } catch (error) {
      if (currentRevision !== revision || frame !== currentFrame) return;
      if (surface) { surface.hidden = true; surface.style.display = "none"; }
      if (frame) frame.hidden = false;
      message("neon:error", { message: error.message || "工具打开失败。" });
    } finally { if (currentRevision === revision) pending = false; }
  }
  new MutationObserver(sync).observe(desktop, { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("ai-os-session", sync);
  window.addEventListener("message", event => void invoke(event));
  sync();
})();
