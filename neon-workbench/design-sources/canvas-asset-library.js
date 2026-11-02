"use strict";

(() => {
  const ASSET_API = "/api/asset-library";
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
    categories: [],
    folders: [],
    loading: false,
    importing: false,
    requestId: 0,
    selectedId: null,
    searchTimer: 0,
    pendingActions: new Set(),
    layoutObserver: null,
    layoutResizeBound: false,
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
    const response = await fetch(path, { ...options, headers, body }).catch(() => { throw new Error("无法连接素材服务，请检查网络后重试。"); });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const message = data.error || data.message || ""; throw new Error(/[\u4e00-\u9fff]/.test(message) ? message : `素材请求失败（${response.status}），请稍后重试。`); }
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
              <p>媒体引用</p>
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
            <button type="button" data-asset-scope="mine" class="is-active"><i data-lucide="user-round"></i><span>我的资产</span></button>
            <button type="button" data-asset-scope="public"><i data-lucide="globe-2"></i><span>共享精选</span></button>
            <button type="button" data-asset-scope="shared"><i data-lucide="users-round"></i><span>共享给我</span></button>
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

  function adaptEntry(entry) {
    const resource = entry?.resource, registration = entry?.asset;
    const kind = entry?.preview?.kind || resource?.type;
    const url = resource?.metadata?.url || resource?.metadata?.localUrl || entry?.preview?.url || (resource?.refType === "output_media" ? resource.refId : "");
    if (!registration || entry.access?.locked || resource?.deletedAt || !["image", "video", "audio"].includes(kind) || !url) return null;
    return { id: registration.id, resourceId: resource.id, kind, url, name: registration.name || resource.title,
      mine: registration.permission === "owner", owner: { displayName: registration.ownerDisplayName },
      categoryName: state.categories.find(item => item.id === registration.categoryId)?.name || "",
      folderName: state.folders.find(item => item.id === registration.folderId)?.name || "" };
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
    meta.textContent = [asset.mine ? "我的资产" : `来自 ${asset.owner?.displayName || "其他用户"}`, asset.categoryName, asset.folderName].filter(Boolean).join(" · ");
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "canvas-asset-card-actions";
    const insert = document.createElement("button");
    insert.type = "button";
    insert.dataset.assetInsert = asset.id;
    insert.textContent = "插入";
    insert.setAttribute("aria-label", `插入 ${asset.name}`);
    actions.append(insert);
    body.append(actions);
    card.append(body);

    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify({ assetId: asset.id }));
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
    card.addEventListener("dblclick", () => insertAsset(asset).catch(error => toast(error.message)));
    card.addEventListener("click", () => {
      state.selectedId = asset.id;
      elements.grid.querySelectorAll(".canvas-asset-card").forEach((item) => item.classList.toggle("is-selected", item.dataset.assetId === asset.id));
    });
    return card;
  }

  function layoutMasonryCards() {
    const grid = elements.grid;
    if (!grid) return;
    state.layoutObserver?.disconnect();
    const measure = (card) => {
      const height = card.getBoundingClientRect().height;
      if (!height) return;
      const gap = parseFloat(getComputedStyle(grid).getPropertyValue("--canvas-asset-card-gap")) || 0;
      const span = `span ${Math.max(1, Math.ceil(height + gap))}`;
      if (card.style.gridRowEnd !== span) card.style.gridRowEnd = span;
    };
    if (!state.layoutResizeBound) {
      state.layoutResizeBound = true;
      window.addEventListener("resize", () => requestAnimationFrame(() => {
        elements.grid?.querySelectorAll(":scope > .canvas-asset-card").forEach(measure);
      }));
    }
    const cards = grid.querySelectorAll(":scope > .canvas-asset-card");
    if (typeof ResizeObserver === "undefined") {
      cards.forEach(measure);
      return;
    }
    state.layoutObserver = new ResizeObserver((entries) => entries.forEach(({ target }) => measure(target)));
    cards.forEach((card) => {
      measure(card);
      state.layoutObserver.observe(card);
    });
  }

  function renderItems() {
    state.layoutObserver?.disconnect();
    state.layoutObserver = null;
    elements.grid.replaceChildren();
    if (!state.items.length && !state.loading) {
      const empty = document.createElement("div");
      empty.className = "canvas-asset-empty";
      empty.innerHTML = '<i data-lucide="image-off"></i><strong>这里还没有资产</strong><span>主动将画布成品加入资产库，或导入后选择分类入库。</span>';
      elements.grid.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      state.items.forEach((asset) => fragment.append(renderCard(asset)));
      elements.grid.append(fragment);
      layoutMasonryCards();
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
    elements.projectLabel.textContent = "仅展示已主动加入资产库的媒体";
    const requestId = ++state.requestId;
    setLoading(true, append);
    const params = new URLSearchParams({ scope: state.scope, kind: state.kind, limit: "36" });
    if (state.search) params.set("search", state.search);
    if (context.projectId) params.set("projectId", context.projectId);
    if (append && state.nextCursor) params.set("cursor", state.nextCursor);
    try {
      const data = await request(`${ASSET_API}?${params}`);
      if (requestId !== state.requestId) return;
      state.categories = data.categories || [];
      state.folders = data.folders || [];
      const items = (data.entries || []).map(adaptEntry).filter(Boolean);
      state.items = append ? [...state.items, ...items] : items;
      state.nextCursor = data.nextCursor || null;
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

  async function insertAsset(asset, point) {
    if (!window.CanvasAssetBridge?.insertAsset) throw new Error("画布尚未准备完成。");
    // Re-read on every insert so a revoked share cannot use a cached grant.
    const data = await request(ASSET_API + "?scope=" + state.scope);
    state.categories = data.categories || []; state.folders = data.folders || [];
    const current = (data.entries || []).map(adaptEntry).find(item => item?.id === asset.id);
    if (!current) throw new Error("该资产已被移除或您已失去访问权限。");
    window.CanvasAssetBridge.insertAsset(current, point);
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
      }).catch(() => { throw new Error("无法连接上传服务，请检查网络后重试。"); });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(/[\u4e00-\u9fff]/.test(data.error || "") ? data.error : `分片导入失败（${response.status}），请稍后重试。`);
      if (data.complete) completed = data;
    }
    if (!completed?.asset) throw new Error("导入完成，但没有返回资产信息。");
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
    const snapshots = [];
    try {
      for (const file of accepted) {
        elements.status.textContent = `正在导入 ${file.name}…`;
        const result = file.size > DIRECT_UPLOAD_LIMIT ? await uploadChunked(file, context) : await uploadDirect(file, context);
        const asset = result.asset;
        if (!asset?.url || !asset?.kind) throw new Error("上传完成，但没有返回可入库的媒体信息。");
        snapshots.push({ url: asset.url, kind: asset.kind, title: asset.name || file.name });
        completed += 1;
      }
      state.scope = "mine";
      setActiveFilters();
      await loadAssets();
      toast(`已上传 ${completed} 项媒体，请选择分类后入库。`);
      window.dispatchEvent(new CustomEvent("ai-os-assets-changed", { detail: { imported: completed } }));
    } catch (error) {
      toast(`已导入 ${completed} 项，其余失败：${error.message}`);
    } finally {
      state.importing = false;
      elements.importButton.disabled = false;
      elements.input.value = "";
      if (snapshots.length && !window.NeonCanvasAssets?.open(snapshots)) toast("媒体已上传，请从历史记录中加入资产库。");
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
        if (asset) { try { await insertAsset(asset); } catch (error) { toast(error.message); } }
        return;
      }

    });
    elements.loadMore.addEventListener("click", () => loadAssets({ append: true }));

    window.addEventListener("ai-os-canvas-asset-drop", async (event) => {
      try {
        await insertAsset({ id: event.detail?.assetId }, event.detail?.point);
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
