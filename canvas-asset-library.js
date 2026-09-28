"use strict";

(() => {
  const ASSET_API = "/api/assets";
  const ASSET_IMPORT_API = "/api/assets/import";
  const MEDIA_CHUNK_API = "/api/upload-media/chunk";
  const ASSET_DRAG_TYPE = "application/x-ai-os-asset";
  const DIRECT_UPLOAD_LIMIT = 6 * 1024 * 1024;
  const CHUNK_SIZE = 4 * 1024 * 1024;

  const state = {
    open: false,
    scope: "mine",
    kind: "all",
    search: "",
    items: [],
    nextCursor: null,
    counts: {},
    loading: false,
    importing: false,
    requestId: 0,
    selectedId: null,
    searchTimer: 0,
    pendingActions: new Set(),
  };

  const elements = {};

  function currentContext() {
    return window.CanvasAssetBridge?.getCurrentContext?.() || { projectId: null, boardId: null };
  }

  function toast(message) {
    if (window.AiOsDesktop?.toast) window.AiOsDesktop.toast(message);
    else if (elements.status) elements.status.textContent = message;
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body && typeof body !== "string" && !(body instanceof Blob)) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(path, { ...options, headers, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `请求失败（${response.status}）`);
    return data;
  }

  function ensureMarkup() {
    const actions = document.querySelector(".canvas-actions");
    const workspace = document.querySelector(".canvas-workspace");
    if (!actions || !workspace) return false;

    if (!document.querySelector("#canvasAssetLibraryButton")) {
      const button = document.createElement("button");
      button.id = "canvasAssetLibraryButton";
      button.className = "text-action canvas-asset-library-button";
      button.type = "button";
      button.setAttribute("aria-controls", "canvasAssetLibraryPanel");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = '<i data-lucide="library"></i><span>资产库</span>';
      actions.insertBefore(button, actions.firstElementChild);
    }

    if (!document.querySelector("#canvasAssetLibraryPanel")) {
      workspace.insertAdjacentHTML("beforeend", `
        <aside class="canvas-asset-library" id="canvasAssetLibraryPanel" aria-label="画布资产库" hidden>
          <header class="canvas-asset-header">
            <div>
              <p>ASSET LIBRARY</p>
              <h2>资产库</h2>
              <span id="canvasAssetProjectLabel">正在读取当前项目</span>
            </div>
            <button class="canvas-asset-icon-button" id="canvasAssetClose" type="button" aria-label="关闭资产库"><i data-lucide="x"></i></button>
          </header>
          <div class="canvas-asset-toolbar">
            <label class="canvas-asset-search">
              <i data-lucide="search"></i>
              <input id="canvasAssetSearch" type="search" placeholder="搜索名称或创建人" autocomplete="off" />
            </label>
            <button class="canvas-asset-import" id="canvasAssetImport" type="button"><i data-lucide="upload"></i><span>导入</span></button>
            <input id="canvasAssetInput" type="file" accept="image/*,video/*,audio/*" multiple hidden />
          </div>
          <nav class="canvas-asset-scopes" aria-label="资产范围">
            <button type="button" data-asset-scope="mine" class="is-active"><i data-lucide="user-round"></i><span>我的资产</span><b data-asset-count="mine">0</b></button>
            <button type="button" data-asset-scope="project"><i data-lucide="folder-kanban"></i><span>当前项目</span><b data-asset-count="project">0</b></button>
            <button type="button" data-asset-scope="public"><i data-lucide="globe-2"></i><span>共享精选</span><b data-asset-count="public">0</b></button>
            <button type="button" data-asset-scope="shared"><i data-lucide="users-round"></i><span>共享给我</span><b data-asset-count="shared">0</b></button>
            <button type="button" data-asset-scope="favorites"><i data-lucide="star"></i><span>我的收藏</span><b data-asset-count="favorites">0</b></button>
          </nav>
          <div class="canvas-asset-kinds" role="group" aria-label="资产类型">
            <button type="button" data-asset-kind="all" class="is-active">全部</button>
            <button type="button" data-asset-kind="image">图片</button>
            <button type="button" data-asset-kind="video">视频</button>
            <button type="button" data-asset-kind="audio">音频</button>
          </div>
          <div class="canvas-asset-status" id="canvasAssetStatus" role="status" aria-live="polite"></div>
          <div class="canvas-asset-grid" id="canvasAssetGrid"></div>
          <button class="canvas-asset-load-more" id="canvasAssetLoadMore" type="button" hidden>加载更多</button>
        </aside>
      `);
    }

    elements.button = document.querySelector("#canvasAssetLibraryButton");
    elements.panel = document.querySelector("#canvasAssetLibraryPanel");
    elements.close = document.querySelector("#canvasAssetClose");
    elements.search = document.querySelector("#canvasAssetSearch");
    elements.importButton = document.querySelector("#canvasAssetImport");
    elements.input = document.querySelector("#canvasAssetInput");
    elements.grid = document.querySelector("#canvasAssetGrid");
    elements.status = document.querySelector("#canvasAssetStatus");
    elements.loadMore = document.querySelector("#canvasAssetLoadMore");
    elements.projectLabel = document.querySelector("#canvasAssetProjectLabel");
    window.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    return true;
  }

  function setActiveFilters() {
    document.querySelectorAll("[data-asset-scope]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.assetScope === state.scope);
    });
    document.querySelectorAll("[data-asset-kind]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.assetKind === state.kind);
    });
  }

  function renderCounts() {
    for (const [scope, count] of Object.entries(state.counts || {})) {
      const target = document.querySelector(`[data-asset-count="${scope}"]`);
      if (target) target.textContent = String(count || 0);
    }
  }

  function mediaPreview(asset) {
    const shell = document.createElement("div");
    shell.className = `canvas-asset-preview is-${asset.kind}`;
    if (asset.kind === "image") {
      const image = document.createElement("img");
      image.src = asset.thumbnailUrl || asset.url;
      image.alt = "";
      image.loading = "lazy";
      image.draggable = false;
      shell.append(image);
    } else if (asset.kind === "video") {
      const video = document.createElement("video");
      video.src = asset.url;
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.draggable = false;
      shell.append(video);
      shell.insertAdjacentHTML("beforeend", '<span class="canvas-asset-type-mark"><i data-lucide="play"></i></span>');
    } else {
      shell.insertAdjacentHTML("beforeend", '<span class="canvas-asset-audio-art"><i data-lucide="audio-lines"></i></span>');
    }
    return shell;
  }

  function renderCard(asset) {
    const card = document.createElement("article");
    card.className = "canvas-asset-card";
    card.dataset.assetId = asset.id;
    card.tabIndex = 0;
    card.draggable = true;
    card.title = "拖到画布，或双击插入";
    if (asset.id === state.selectedId) card.classList.add("is-selected");
    card.append(mediaPreview(asset));

    const body = document.createElement("div");
    body.className = "canvas-asset-card-body";
    const title = document.createElement("strong");
    title.textContent = asset.name;
    const meta = document.createElement("span");
    meta.textContent = asset.mine ? "我的资产" : `来自 ${asset.owner?.displayName || "其他用户"}`;
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "canvas-asset-card-actions";
    const insert = document.createElement("button");
    insert.type = "button";
    insert.dataset.assetInsert = asset.id;
    insert.textContent = "插入";
    insert.setAttribute("aria-label", `插入 ${asset.name}`);
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.dataset.assetFavorite = asset.id;
    favorite.classList.toggle("is-active", Boolean(asset.favorited));
    favorite.innerHTML = `<i data-lucide="star"></i><span>${asset.favorited ? "已收藏" : "收藏"}</span>`;
    favorite.setAttribute("aria-pressed", String(Boolean(asset.favorited)));
    favorite.disabled = state.pendingActions.has(`${asset.id}:favorite`);
    actions.append(insert, favorite);
    if (asset.visibility === "all") {
      const like = document.createElement("button");
      like.type = "button";
      like.dataset.assetLike = asset.id;
      like.classList.toggle("is-active", Boolean(asset.liked));
      like.innerHTML = `<i data-lucide="heart"></i><span>${Number(asset.likeCount) || 0}</span>`;
      like.setAttribute("aria-label", asset.liked ? `取消点赞 ${asset.name}` : `点赞 ${asset.name}`);
      like.setAttribute("aria-pressed", String(Boolean(asset.liked)));
      like.disabled = state.pendingActions.has(`${asset.id}:like`);
      actions.append(like);
    }
    if (asset.canManage) {
      const share = document.createElement("button");
      share.type = "button";
      share.dataset.assetShare = asset.id;
      share.innerHTML = '<i data-lucide="share-2"></i><span>共享</span>';
      actions.append(share);
    } else if (asset.canUnpublish && asset.visibility === "all") {
      const unpublish = document.createElement("button");
      unpublish.type = "button";
      unpublish.dataset.assetUnpublish = asset.id;
      unpublish.className = "is-danger";
      unpublish.innerHTML = '<i data-lucide="circle-minus"></i><span>下架</span>';
      actions.append(unpublish);
    }
    body.append(actions);
    card.append(body);

    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({ assetId: asset.id }));
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
    card.addEventListener("dblclick", () => insertAsset(asset));
    card.addEventListener("click", () => {
      state.selectedId = asset.id;
      elements.grid.querySelectorAll(".canvas-asset-card").forEach((item) => item.classList.toggle("is-selected", item.dataset.assetId === asset.id));
    });
    return card;
  }

  function renderItems() {
    elements.grid.replaceChildren();
    if (!state.items.length && !state.loading) {
      const empty = document.createElement("div");
      empty.className = "canvas-asset-empty";
      empty.innerHTML = state.scope === "project" && !currentContext().projectId
        ? '<i data-lucide="folder-x"></i><strong>当前画布还未归入项目</strong><span>先在画布管理中把画布移动到一个项目。</span>'
        : '<i data-lucide="image-off"></i><strong>这里还没有资产</strong><span>导入图片、视频或音频，之后可以在多个画布中复用。</span>';
      elements.grid.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      state.items.forEach((asset) => fragment.append(renderCard(asset)));
      elements.grid.append(fragment);
    }
    elements.loadMore.hidden = !state.nextCursor;
    window.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  function setLoading(loading, append = false) {
    state.loading = loading;
    elements.panel?.classList.toggle("is-loading", loading);
    elements.status.textContent = loading ? (append ? "正在加载更多…" : "正在读取资产…") : `${state.items.length} 项资产`;
  }

  async function loadAssets({ append = false } = {}) {
    if (!ensureMarkup()) return;
    const context = currentContext();
    elements.projectLabel.textContent = context.projectId ? "跟随当前画布项目" : "当前画布未归入项目";
    if (state.scope === "project" && !context.projectId) {
      state.items = [];
      state.nextCursor = null;
      state.counts = { ...state.counts, project: 0 };
      setLoading(false);
      renderCounts();
      renderItems();
      return;
    }
    const requestId = ++state.requestId;
    setLoading(true, append);
    const params = new URLSearchParams({ scope: state.scope, kind: state.kind, limit: "36" });
    if (state.search) params.set("search", state.search);
    if (context.projectId) params.set("projectId", context.projectId);
    if (append && state.nextCursor) params.set("cursor", state.nextCursor);
    try {
      const data = await request(`${ASSET_API}?${params}`);
      if (requestId !== state.requestId) return;
      state.items = append ? [...state.items, ...(data.items || [])] : (data.items || []);
      state.nextCursor = data.nextCursor || null;
      state.counts = data.counts || {};
      renderCounts();
      setLoading(false);
      renderItems();
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.items = append ? state.items : [];
      state.nextCursor = null;
      setLoading(false);
      renderItems();
      elements.status.textContent = error.message;
    }
  }

  async function recordUse(asset) {
    const context = currentContext();
    if (!context.projectId) return;
    await request(`${ASSET_API}/${encodeURIComponent(asset.id)}/use`, {
      method: "POST",
      body: { projectId: context.projectId, boardId: context.boardId || "" },
    });
  }

  async function insertAsset(asset, point) {
    if (!window.CanvasAssetBridge?.insertAsset) throw new Error("画布尚未准备完成。");
    window.CanvasAssetBridge.insertAsset(asset, point);
    try {
      await recordUse(asset);
      if (state.scope === "project" && !state.items.some((item) => item.id === asset.id)) await loadAssets();
    } catch (error) {
      toast(`资产已插入，但项目关联失败：${error.message}`);
    }
  }

  async function toggleFavorite(asset) {
    const actionKey = `${asset.id}:favorite`;
    if (state.pendingActions.has(actionKey)) return;
    state.pendingActions.add(actionKey);
    const next = !asset.favorited;
    asset.favorited = next;
    renderItems();
    try {
      const data = await request(`${ASSET_API}/${encodeURIComponent(asset.id)}/favorite`, { method: next ? "PUT" : "DELETE" });
      Object.assign(asset, data.asset || {});
      if (state.scope === "favorites" && !asset.favorited) state.items = state.items.filter((item) => item.id !== asset.id);
      renderItems();
      window.dispatchEvent(new CustomEvent("ai-os-assets-changed", { detail: { assetId: asset.id } }));
    } catch (error) {
      asset.favorited = !next;
      renderItems();
      toast(error.message);
    } finally {
      state.pendingActions.delete(actionKey);
      renderItems();
    }
  }

  async function toggleLike(asset) {
    const actionKey = `${asset.id}:like`;
    if (state.pendingActions.has(actionKey)) return;
    state.pendingActions.add(actionKey);
    const next = !asset.liked;
    const previousCount = Number(asset.likeCount) || 0;
    asset.liked = next;
    asset.likeCount = Math.max(0, previousCount + (next ? 1 : -1));
    renderItems();
    try {
      const data = await request(`${ASSET_API}/${encodeURIComponent(asset.id)}/like`, { method: next ? "PUT" : "DELETE" });
      Object.assign(asset, data.asset || {});
      renderItems();
    } catch (error) {
      asset.liked = !next;
      asset.likeCount = previousCount;
      renderItems();
      toast(error.message);
    } finally {
      state.pendingActions.delete(actionKey);
      renderItems();
    }
  }

  async function unpublishAsset(asset) {
    try {
      await request(`${ASSET_API}/${encodeURIComponent(asset.id)}/share`, {
        method: "PATCH",
        body: { visibility: "private", userIds: [] },
      });
      state.items = state.items.filter((item) => item.id !== asset.id);
      renderItems();
      window.dispatchEvent(new CustomEvent("ai-os-assets-changed", { detail: { assetId: asset.id } }));
      toast("该资产已从共享精选下架");
    } catch (error) {
      toast(error.message);
    }
  }

  async function uploadDirect(file, context) {
    const params = new URLSearchParams();
    if (context.projectId) params.set("projectId", context.projectId);
    if (context.boardId) params.set("boardId", context.boardId);
    const suffix = params.size ? `?${params}` : "";
    return request(`${ASSET_IMPORT_API}${suffix}`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name || "asset-media"),
      },
      body: file,
    });
  }

  async function uploadChunked(file, context) {
    const total = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    let completed = null;
    for (let index = 0; index < total; index += 1) {
      elements.status.textContent = `正在导入 ${file.name} · ${index + 1}/${total}`;
      const response = await fetch(MEDIA_CHUNK_API, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-id": uploadId,
          "x-chunk-index": String(index),
          "x-chunk-total": String(total),
          "x-file-name": encodeURIComponent(file.name || "asset-media"),
          "x-file-type": file.type || "application/octet-stream",
        },
        body: file.slice(index * CHUNK_SIZE, Math.min(file.size, (index + 1) * CHUNK_SIZE)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `分片导入失败（${response.status}）`);
      if (data.complete) completed = data;
    }
    if (!completed?.asset) throw new Error("导入完成，但没有返回资产信息。");
    if (context.projectId) await recordUse(completed.asset);
    return completed;
  }

  async function importFiles(files) {
    const accepted = [...files].filter((file) => /^(image|video|audio)\//i.test(file.type || ""));
    if (!accepted.length) {
      toast("只支持图片、视频和音频文件。");
      return;
    }
    state.importing = true;
    elements.importButton.disabled = true;
    const context = currentContext();
    let completed = 0;
    try {
      for (const file of accepted) {
        elements.status.textContent = `正在导入 ${file.name}…`;
        if (file.size > DIRECT_UPLOAD_LIMIT) await uploadChunked(file, context);
        else await uploadDirect(file, context);
        completed += 1;
      }
      state.scope = context.projectId ? "project" : "mine";
      setActiveFilters();
      await loadAssets();
      toast(`已导入 ${completed} 项资产`);
      window.dispatchEvent(new CustomEvent("ai-os-assets-changed", { detail: { imported: completed } }));
    } catch (error) {
      toast(`已导入 ${completed} 项，其余失败：${error.message}`);
    } finally {
      state.importing = false;
      elements.importButton.disabled = false;
      elements.input.value = "";
    }
  }

  function open() {
    if (!ensureMarkup()) return;
    state.open = true;
    elements.panel.hidden = false;
    elements.button.setAttribute("aria-expanded", "true");
    loadAssets();
  }

  function close() {
    if (!ensureMarkup()) return;
    state.open = false;
    elements.panel.hidden = true;
    elements.button.setAttribute("aria-expanded", "false");
  }

  function bindEvents() {
    elements.button.addEventListener("click", () => state.open ? close() : open());
    elements.close.addEventListener("click", close);
    elements.importButton.addEventListener("click", () => elements.input.click());
    elements.input.addEventListener("change", () => importFiles(elements.input.files || []));
    elements.search.addEventListener("input", () => {
      state.search = elements.search.value.trim();
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => loadAssets(), 180);
    });
    elements.panel.addEventListener("click", async (event) => {
      const scope = event.target.closest("[data-asset-scope]");
      if (scope) {
        state.scope = scope.dataset.assetScope;
        setActiveFilters();
        await loadAssets();
        return;
      }
      const kind = event.target.closest("[data-asset-kind]");
      if (kind) {
        state.kind = kind.dataset.assetKind;
        setActiveFilters();
        await loadAssets();
        return;
      }
      const insertButton = event.target.closest("[data-asset-insert]");
      if (insertButton) {
        const asset = state.items.find((item) => item.id === insertButton.dataset.assetInsert);
        if (asset) await insertAsset(asset);
        return;
      }
      const favoriteButton = event.target.closest("[data-asset-favorite]");
      if (favoriteButton) {
        const asset = state.items.find((item) => item.id === favoriteButton.dataset.assetFavorite);
        if (asset) await toggleFavorite(asset);
        return;
      }
      const likeButton = event.target.closest("[data-asset-like]");
      if (likeButton) {
        const asset = state.items.find((item) => item.id === likeButton.dataset.assetLike);
        if (asset) await toggleLike(asset);
        return;
      }
      const shareButton = event.target.closest("[data-asset-share]");
      if (shareButton) {
        try {
          await window.AiOsManagement?.openAssetShareDialog?.(shareButton.dataset.assetShare);
        } catch (error) {
          toast(error.message);
        }
        return;
      }
      const unpublishButton = event.target.closest("[data-asset-unpublish]");
      if (unpublishButton) {
        const asset = state.items.find((item) => item.id === unpublishButton.dataset.assetUnpublish);
        if (asset) await unpublishAsset(asset);
      }
    });
    elements.loadMore.addEventListener("click", () => loadAssets({ append: true }));

    window.addEventListener("ai-os-canvas-asset-drop", async (event) => {
      try {
        const data = await request(`${ASSET_API}/${encodeURIComponent(event.detail?.assetId || "")}`);
        await insertAsset(data.asset, event.detail?.point);
      } catch (error) {
        toast(error.message);
      }
    });
    window.addEventListener("canvas:board-changed", () => {
      if (state.open) loadAssets();
    });
    window.addEventListener("ai-os-session", () => {
      if (state.open) loadAssets();
    });
    window.addEventListener("ai-os-assets-changed", () => {
      if (state.open) loadAssets();
    });
  }

  function init() {
    if (!ensureMarkup() || elements.panel.dataset.assetLibraryReady === "true") return;
    elements.panel.dataset.assetLibraryReady = "true";
    bindEvents();
    setActiveFilters();
  }

  window.CanvasAssetLibrary = { state, init, open, close, load: loadAssets, insertAsset, renderCard };
  init();
  document.addEventListener("DOMContentLoaded", init, { once: true });
})();
