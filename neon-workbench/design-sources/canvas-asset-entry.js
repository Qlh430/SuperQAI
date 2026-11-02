(function installCanvasAssetEntry(root) {
  "use strict";
  const mediaKinds = new Set(["image", "video", "audio"]);
  const labels = { image: "图片", video: "视频", audio: "音频" };
  function clean(value) {
    const kind = value?.kind || value?.type;
    let url = String(value?.savedUrl || value?.originalUrl || value?.url || value?.src || "").trim();
    if (!mediaKinds.has(kind) || !url) return null;
    try {
      const parsed = new URL(url, root.location.href);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      if (parsed.origin !== new URL(root.location.href).origin || !parsed.pathname.startsWith("/output/")) return null;
      url = parsed.pathname;
      const parts = decodeURIComponent(url).slice(8).split("/");
      if (parts.some(part => !part || part === "." || part === ".." || /[\\:\u0000-\u001f]/.test(part))) return null;
    } catch { return null; }
    const item = { url, kind, title: String(value.title || value.name || labels[kind]).trim() || labels[kind] };
    if (typeof value.mimeType === "string" && value.mimeType.startsWith(`${kind}/`)) item.mimeType = value.mimeType;
    return item;
  }
  function normalize(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).map(clean).filter(item => {
      if (!item) return false;
      const key = `${item.kind}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function state() { return typeof canvasState !== "undefined" ? canvasState : {}; }
  function readNode(id) { return typeof getCanvasNode === "function" ? getCanvasNode(String(id)) : null; }
  function readModel(id) { return typeof getCanvasNodeModel === "function" ? getCanvasNodeModel(String(id)) : null; }
  function snapshotNode(node, model, memberId, visited) {
    const id = String(node?.dataset?.id || model?.id || "");
    if (id && visited.has(id)) return [];
    if (id) visited.add(id);
    const data = node?.dataset || model || {};
    const has = kind => node ? node.classList.contains(`canvas-node-${kind}`) : (model?.kind || model?.type) === kind;
    if (has("group")) {
      const ids = node && typeof getCanvasGroupMemberIds === "function" ? getCanvasGroupMemberIds(node) : model?.groupMembers || [];
      let fallback = model?.groupImages || [];
      if (node && !ids.length) { try { fallback = JSON.parse(data.groupImages || "[]"); } catch { fallback = []; } }
      return ids.length ? ids.flatMap(member => snapshotNode(readNode(member), readModel(member), "", visited)) : fallback.map(item => ({ ...item, kind: "image" }));
    }
    if (has("gallery-container") || has("gallery")) {
      const gallery = node && typeof getCanvasGalleryContainer === "function" ? getCanvasGalleryContainer(node) : model?.galleryContainer;
      return (gallery?.members || []).filter(item => !memberId || String(item.id) === String(memberId)).map(item => ({ ...item, kind: "image" }));
    }
    if (has("asset-collection") || node?.classList.contains("canvas-node-asset-single-image") || node?.classList.contains("canvas-node-asset-single-video") || node?.classList.contains("canvas-node-asset-single-audio")) {
      const collection = node && typeof getCanvasAssetCollection === "function" ? getCanvasAssetCollection(node) : model?.assetCollection;
      return (collection?.members || []).filter(item => !memberId || String(item.id) === String(memberId)).map(item => ({ ...item }));
    }
    const output = node && typeof getCanvasNodeOutput === "function" ? getCanvasNodeOutput(node)
      : model && typeof getCanvasVirtualNodeOutput === "function" ? getCanvasVirtualNodeOutput(model) : null;
    const history = node ? root.FloraGenerationHistory?.serialize?.(node) : model;
    const currentId = String(data.currentGenerationId || "");
    const current = currentId ? history?.generationHistory?.find(item => String(item.id) === currentId && mediaKinds.has(item.kind)) : null;
    // The current version is captured now; later history changes never reach this dialog.
    if (current?.savedUrl || current?.src) return [{ ...current, title: data.nodeTitle || output?.name || data.imageName || data.mediaName || labels[current.kind] }];
    if (has("audio-generator") && !node && model?.result) return [{ ...model.result, kind: "audio", title: data.nodeTitle || "生成音频" }];
    if (!mediaKinds.has(output?.type)) return [];
    return [{ ...output, savedUrl: output.type === "image" ? data.resultDownloadUrl || output.savedUrl : output.savedUrl,
      title: data.nodeTitle || output.name || labels[output.type] }];
  }
  function snapshotSelection(node, memberId = "") {
    if (!node) return [];
    const current = state(), id = String(node.dataset?.id || "");
    if (node.dataset?.boardId && current.activeBoardId && String(node.dataset.boardId) !== String(current.activeBoardId)) return [];
    const ids = !memberId && current.selectedIds?.has(id) && current.selectedIds.size > 1 ? [...current.selectedIds] : [id];
    const visited = new Set();
    return normalize(ids.flatMap(selected => snapshotNode(selected === id ? node : readNode(selected), readModel(selected), memberId, visited)));
  }
  function open(items) {
    const snapshots = normalize(items);
    if (!snapshots.length || !state().activeBoardId) return false;
    root.dispatchEvent(new CustomEvent("neon:request-add-assets", { detail: { items: snapshots, boardId: String(state().activeBoardId) } }));
    return true;
  }
  function hideMenus() {
    if (typeof hideCanvasNodeMenu === "function") hideCanvasNodeMenu();
    if (typeof hideCanvasContextMenu === "function") hideCanvasContextMenu();
    if (typeof hideCanvasConnectMenu === "function") hideCanvasConnectMenu();
  }
  function showMenu(event, node, memberId = "") {
    const items = snapshotSelection(node, memberId);
    if (!items.length || typeof showCanvasImageMenu !== "function") return false;
    const menu = document.querySelector("#canvasImageMenu");
    if (!menu) return false;
    hideMenus();
    let button = menu.querySelector("[data-canvas-add-assets]");
    if (!button) {
      button = document.createElement("button"); button.type = "button"; button.dataset.canvasAddAssets = "true";
      button.addEventListener("click", event => {
        event.stopPropagation();
        const captured = button.assetSnapshots;
        const boardId = button.assetBoardId;
        if (typeof hideCanvasImageMenu === "function") hideCanvasImageMenu();
        if (boardId !== String(state().activeBoardId || "")) {
          if (typeof setCanvasStatus === "function") setCanvasStatus("当前画布已改变，请重新选择媒体。");
          return;
        }
        if (!open(captured) && typeof setCanvasStatus === "function") setCanvasStatus("没有可加入资产库的媒体，请先完成生成或上传素材。");
      });
      menu.append(button);
    }
    showCanvasImageMenu(event, node, memberId);
    const image = items.length === 1 && items[0].kind === "image" && (node.classList.contains("canvas-node-image") || node.classList.contains("canvas-node-gallery-container"));
    if (!image) menu.querySelectorAll("[data-image-menu-action]").forEach(action => { action.hidden = true; });
    button.hidden = false; button.assetSnapshots = items;
    button.assetBoardId = String(state().activeBoardId || "");
    button.textContent = items.length > 1 ? `加入资产库（${items.length}项）` : "加入资产库";
    button.setAttribute("aria-label", button.textContent);
    // The existing menu has fixed geometry; keep every action within the viewport on touch screens.
    const viewport = document.querySelector("#infiniteCanvas");
    if (viewport) {
      const left = parseFloat(menu.style.left) || 0, top = parseFloat(menu.style.top) || 0;
      menu.style.left = `${Math.max(12, Math.min(left, viewport.clientWidth - menu.offsetWidth - 12))}px`;
      menu.style.top = `${Math.max(12, Math.min(top, viewport.clientHeight - menu.offsetHeight - 12))}px`;
    }
    return true;
  }
  function handleContextMenu(event) {
    if (event.target.closest?.("#canvasImageMenu, #canvasNodeMenu, #canvasConnectMenu, input, textarea, [contenteditable=true]")) return false;
    const node = event.target.closest?.(".canvas-node");
    if (!node) return false;
    const memberId = event.target.closest?.(".canvas-gallery-member")?.dataset.galleryMemberId
      || event.target.closest?.("[data-asset-member-id]")?.dataset.assetMemberId || "";
    if (!snapshotSelection(node, memberId).length) return false;
    if (!state().selectedIds?.has(String(node.dataset.id)) && typeof selectCanvasNode === "function") selectCanvasNode(node);
    if (!showMenu(event, node, memberId)) return false;
    event.preventDefault(); event.stopPropagation(); return true;
  }
  function mountToolbar(toolbar) {
    if (!toolbar?.classList.contains("flora-node-toolbar") && !toolbar?.classList.contains("canvas-image-toolbar")) return;
    const button = root.CanvasNodeActionBar.createButton({ id: "asset-more", title: "更多操作", icon: "ellipsis", modifierClass: "flora-node-action flora-node-icon-action" });
    toolbar.append(button);
    const getNode = () => toolbar.closest(".canvas-node") || state().activeNode;
    const refresh = () => { button.hidden = !snapshotSelection(getNode()).length; };
    button.addEventListener("click", event => {
      event.stopPropagation();
      const node = getNode(), rect = button.getBoundingClientRect();
      if (node) showMenu({ clientX: rect.left, clientY: rect.bottom }, node);
    });
    toolbar.addEventListener("pointerenter", refresh); toolbar.addEventListener("focusin", refresh);
    const node = toolbar.closest(".canvas-node");
    if (node) {
      node.addEventListener("pointerenter", refresh);
      const observer = new MutationObserver(refresh);
      observer.observe(node, { attributes: true, attributeFilter: ["class", "data-result-src", "data-result-download-url", "data-image-src", "data-video-src", "data-audio-src", "data-generation-video-src", "data-generation-history", "data-current-generation-id", "data-asset-collection", "data-gallery-container"] });
    }
    queueMicrotask(() => { toolbar.append(button); refresh(); });
  }
  root.NeonCanvasAssets = Object.freeze({ open, snapshotSelection, handleContextMenu, mountToolbar });
})(window);
