(function installFloraGenerationHistory(root) {
  "use strict";
  const mounted = new WeakMap();
  const kinds = new Set(["image", "video", "audio", "text"]);
  const kindLabels = { image: "图片", video: "视频", audio: "音频", text: "文本" };
  const mediaMimes = {
    image: /^image\/(?:png|jpeg|webp|gif|avif)$/i,
    video: /^video\/(?:mp4|webm|ogg|quicktime)$/i,
    audio: /^audio\/(?:mpeg|mp3|wav|x-wav|ogg|opus|aac|mp4|webm|flac)$/i,
    text: /^text\/plain$/i,
  };
  const secretQueries = new Set(["apikey", "key", "walletkey", "walletapikey", "authorization", "token", "accesstoken", "refreshtoken", "password", "cookie", "secret", "apisecret", "clientsecret", "xapikey"]);
  let nextId = 0;

  function checkedSource(value, kind) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source) return "";
    const data = source.match(/^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i);
    if (data) return source.length <= 32 * 1024 * 1024 && mediaMimes[kind]?.test(data[1]) ? source : "";
    if (source.length > 16_384) return "";
    try {
      const url = new URL(source, root.location?.href || "http://localhost/");
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
      if ([...url.searchParams.keys()].some(key => secretQueries.has(key.toLowerCase().replace(/[^a-z0-9]/g, "")))) return "";
      const extensions = {
        image: /\.(?:png|jpe?g|webp|gif|avif)$/i,
        video: /\.(?:mp4|webm|ogv|mov)$/i,
        audio: /\.(?:mp3|wav|ogg|opus|aac|m4a|flac)$/i,
        text: /\.txt$/i,
      };
      if (Object.entries(extensions).some(([type, pattern]) => type !== kind && pattern.test(url.pathname)
        && !((kind === "audio" && /\.(?:webm|mp4)$/i.test(url.pathname)) || (kind === "video" && /\.ogg$/i.test(url.pathname))))) return "";
      return source;
    } catch { return ""; }
  }

  function cleanItem(value) {
    if (!value || typeof value !== "object" || !value.id || !kinds.has(value.kind)) return null;
    const item = { id: String(value.id), kind: value.kind };
    for (const key of ["src", "savedUrl"]) {
      if (value[key] != null && value[key] !== "") {
        const source = checkedSource(value[key], value.kind);
        if (!source) return null;
        item[key] = source;
      }
    }
    for (const key of ["text", "prompt", "model"]) {
      if (value[key] != null) item[key] = String(value[key]);
    }
    if (value.midjourneyParameters && typeof value.midjourneyParameters === "object") {
      const params = {};
      for (const key of ["version", "niji", "speed", "quality", "raw", "stylize", "chaos", "weird", "iw", "seed", "tile", "draft", "hd", "stop"]) {
        const parameter = value.midjourneyParameters[key];
        if (typeof parameter === "boolean" || (typeof parameter === "number" && Number.isFinite(parameter)) || (typeof parameter === "string" && parameter.length <= 128)) params[key] = parameter;
      }
      item.midjourneyParameters = params;
    }
    if (value.kind === "text" && typeof value.richHtml === "string") item.richHtml = value.richHtml;
    if (value.createdAt != null) item.createdAt = typeof value.createdAt === "number" ? value.createdAt : String(value.createdAt);
    for (const key of ["requestedSize", "actualSize"]) {
      if (value[key] && typeof value[key] === "object") {
        const width = Number(value[key].width), height = Number(value[key].height);
        if (width > 0 && height > 0) item[key] = { width, height };
      } else if (value[key] != null) item[key] = String(value[key]);
    }
    return item;
  }

  function normalize(items, currentId) {
    const history = [];
    const ids = new Map();
    for (const value of Array.isArray(items) ? items : []) {
      const item = cleanItem(value);
      if (!item) continue;
      if (ids.has(item.id)) Object.assign(history[ids.get(item.id)], item);
      else { ids.set(item.id, history.length); history.push(item); }
    }
    return {
      generationHistory: history,
      currentGenerationId: history.some(item => item.id === String(currentId)) ? String(currentId) : history.at(-1)?.id || "",
    };
  }

  function serialize(node) {
    let items = [];
    try { items = JSON.parse(node?.dataset?.generationHistory || "[]"); } catch { /* A malformed history never prevents opening the canvas. */ }
    return normalize(items, node?.dataset?.currentGenerationId);
  }

  function write(node, value) {
    node.dataset.generationHistory = JSON.stringify(value.generationHistory);
    node.dataset.currentGenerationId = value.currentGenerationId;
  }

  function emit(type, node, item) {
    root.dispatchEvent(new CustomEvent(type, { detail: type === "flora-generation-history-select" ? { node, item } : { node } }));
  }

  function hydrate(node, items, currentId) {
    if (!node?.dataset) return;
    write(node, normalize(items, currentId));
    sync(node);
  }

  function add(node, value) {
    const item = cleanItem(value);
    if (!node?.dataset || !item) return null;
    const data = serialize(node);
    const previous = data.generationHistory.find(entry => entry.id === item.id);
    if (previous) Object.assign(previous, item);
    else {
      item.createdAt ??= Date.now();
      data.generationHistory.push(item);
      data.currentGenerationId = item.id;
    }
    write(node, data);
    if (data.currentGenerationId === item.id) emit("flora-generation-history-select", node, previous || item);
    sync(node);
    emit("flora-generation-history-change", node);
    return previous || item;
  }

  function select(node, id) {
    const data = serialize(node);
    const item = data.generationHistory.find(entry => entry.id === id);
    if (!item) return;
    data.currentGenerationId = id;
    write(node, data);
    emit("flora-generation-history-select", node, item);
    sync(node);
    emit("flora-generation-history-change", node);
  }

  function remove(node, id) {
    const data = serialize(node);
    const index = data.generationHistory.findIndex(item => item.id === id);
    if (index < 0) return;
    data.generationHistory.splice(index, 1);
    const changedCurrent = data.currentGenerationId === id;
    if (changedCurrent) data.currentGenerationId = data.generationHistory[Math.min(index, data.generationHistory.length - 1)]?.id || "";
    write(node, data);
    if (changedCurrent) emit("flora-generation-history-select", node, data.generationHistory.find(item => item.id === data.currentGenerationId) || null);
    sync(node);
    emit("flora-generation-history-change", node);
  }

  function icon(name) {
    const element = document.createElement("i");
    element.dataset.lucide = name;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function button(label, name, className = "flora-generation-history-action") {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.setAttribute("aria-label", label);
    element.title = label;
    if (name) element.append(icon(name));
    return element;
  }

  function icons() { root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } }); }

  function inheritTokens(node, panel) {
    // Dialogs can live outside #canvasEditorScreen during native fullscreen.
    // Copy only the existing semantic tokens, never a separate palette.
    const style = root.getComputedStyle(node);
    for (const token of ["--canvas-neon-bg", "--canvas-neon-card", "--canvas-neon-popover", "--canvas-neon-border", "--canvas-neon-text", "--canvas-neon-muted", "--canvas-neon-primary", "--canvas-neon-danger", "--neon-shadow-lg", "--neon-font-sans"]) {
      const value = style.getPropertyValue(token).trim();
      if (value) panel.style.setProperty(token, value);
    }
  }

  function safeSource(item) {
    const value = checkedSource(item.savedUrl || item.src || "", item.kind);
    try {
      const url = new URL(value, document.baseURI);
      return value ? url.href : "";
    } catch { return ""; }
  }

  function textElement(className, text) {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function playbackControls(element, frame, kind) {
    const label = kindLabels[kind];
    const controls = document.createElement("div");
    controls.className = "flora-generation-history-playback";
    const play = button(`播放${label}`, "play");
    const progress = document.createElement("input");
    progress.type = "range"; progress.min = "0"; progress.max = "1000";
    progress.step = "1"; progress.value = "0";
    progress.setAttribute("aria-label", `${label}进度`);
    const time = document.createElement("time");
    const format = seconds => {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
    };
    const syncPlayback = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      const current = Number.isFinite(element.currentTime) ? element.currentTime : 0;
      const playing = !element.paused && !element.ended;
      const action = `${playing ? "暂停" : "播放"}${label}`;
      play.setAttribute("aria-label", action); play.title = action;
      play.replaceChildren(icon(playing ? "pause" : "play"));
      progress.disabled = !(duration > 0);
      progress.value = String(duration > 0 ? Math.round(current / duration * 1000) : 0);
      progress.setAttribute("aria-valuetext", `${format(current)} / ${format(duration)}`);
      time.textContent = `${format(current)} / ${format(duration)}`;
      icons();
    };
    play.addEventListener("click", () => {
      if (element.paused || element.ended) element.play().catch(() => {
        if (!frame.querySelector(".flora-generation-history-error")) frame.append(textElement("flora-generation-history-error", `${label}播放失败，请重新打开预览`));
      });
      else element.pause();
    });
    progress.addEventListener("input", () => {
      if (Number.isFinite(element.duration) && element.duration > 0) element.currentTime = Number(progress.value) / 1000 * element.duration;
      syncPlayback();
    });
    for (const event of ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "seeked"]) element.addEventListener(event, syncPlayback);
    controls.append(play, progress, time); frame.append(controls);
    syncPlayback();
  }

  function media(item, thumbnail) {
    const frame = document.createElement("div");
    frame.className = "flora-generation-history-media";
    if (item.kind === "text") {
      frame.append(textElement("flora-generation-history-text", item.text || "暂无文本结果"));
      return frame;
    }
    const source = safeSource(item);
    if (!source) { frame.append(textElement("flora-generation-history-error", "结果地址不可用")); return frame; }
    const element = document.createElement(item.kind === "image" ? "img" : item.kind);
    if (item.kind === "image") { element.alt = "生成图片"; if (thumbnail) element.loading = "lazy"; }
    else {
      element.preload = "metadata";
      element.controls = false;
      if (item.kind === "video") element.playsInline = true;
      if (thumbnail || item.kind === "audio") {
        frame.append(icon(item.kind === "audio" ? "audio-lines" : "video"));
        frame.classList.add(`is-${item.kind}`);
      }
    }
    element.addEventListener("error", () => {
      element.hidden = true;
      if (!frame.querySelector(".flora-generation-history-error")) frame.append(textElement("flora-generation-history-error", "结果加载失败，请重新打开预览"));
    });
    element.src = source;
    frame.append(element);
    if (!thumbnail && item.kind !== "image") playbackControls(element, frame, item.kind);
    return frame;
  }

  function releaseMedia(container) {
    for (const element of container.querySelectorAll("audio,video")) {
      element.pause(); element.removeAttribute("src"); element.load();
    }
  }

  function sizeLabel(value) {
    return value && typeof value === "object" ? `${value.width}×${value.height}` : String(value || "");
  }

  // The canvas requests an aspect ratio plus a quality tier, so the exact pixel
  // count belongs to the provider. Compare ratios, not the UI's pixel preset.
  function ratioOf(value) {
    const text = sizeLabel(value).replace(/\s+/g, "");
    if (!text) return null;
    const direct = text.match(/^(\d+):(\d+)$/);
    if (direct) return Number(direct[1]) / Number(direct[2]);
    const pixels = text.match(/^(\d+)[x×](\d+)$/i);
    if (pixels) return Number(pixels[1]) / Number(pixels[2]);
    return null;
  }

  function describe(item) {
    const details = document.createElement("div");
    details.className = "flora-generation-history-details";
    if (item.model) details.append(textElement("", `模型：${item.model}`));
    const timestamp = new Date(item.createdAt);
    if (!Number.isNaN(timestamp.getTime())) details.append(textElement("", `生成时间：${timestamp.toLocaleString("zh-CN")}`));
    const requested = sizeLabel(item.requestedSize), actual = sizeLabel(item.actualSize);
    if (requested) details.append(textElement("", `请求尺寸：${requested}`));
    if (actual) details.append(textElement("", `实际尺寸：${actual}`));
    const requestedRatio = ratioOf(item.requestedSize), actualRatio = ratioOf(item.actualSize);
    if (requestedRatio && actualRatio && Math.abs(Math.log(actualRatio / requestedRatio)) > 0.02) {
      details.append(textElement("", "返回比例与请求不同，按原始结果显示"));
    }
    if (item.prompt) details.append(textElement("flora-generation-history-prompt", `提示词：${item.prompt}`));
    return details;
  }

  async function download(state, item, trigger) {
    trigger.disabled = true;
    state.status.textContent = "正在准备下载…";
    try {
      let blob;
      if (item.kind === "text") blob = new Blob([item.text || ""], { type: "text/plain;charset=utf-8" });
      else {
        const source = safeSource(item);
        if (!source) throw new Error("结果地址不可用");
        const url = new URL(source);
        const response = await root.fetch(source, { credentials: url.origin === root.location.origin ? "same-origin" : "omit" });
        if (!response.ok) throw new Error(`下载接口返回 ${response.status}`);
        blob = await response.blob();
      }
      if (mounted.get(state.node) !== state) return;
      const url = root.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };
      const extension = item.kind === "text" ? "txt" : extensions[blob.type.split(";")[0]] || ({ image: "png", video: "mp4", audio: "mp3" })[item.kind];
      anchor.href = url;
      anchor.download = `生成${kindLabels[item.kind]}-${item.id.replace(/[^a-z0-9_-]/gi, "_")}.${extension}`;
      anchor.hidden = true;
      state.panel.append(anchor); anchor.click(); anchor.remove();
      state.urls.add(url);
      const timer = root.setTimeout(() => {
        root.URL.revokeObjectURL(url);
        state.urls.delete(url);
        state.urlTimers.delete(url);
      }, 1000);
      state.urlTimers.set(url, timer);
      state.status.textContent = "下载已开始";
    } catch (error) {
      const reason = /[\u4e00-\u9fff]/.test(error?.message || "") ? error.message : "无法读取结果，请检查网络和服务权限后重试";
      if (mounted.get(state.node) === state) state.status.textContent = `下载失败：${reason}`;
    } finally { trigger.disabled = false; }
  }

  const PREVIEW_MAX_ZOOM = 8;

  // Wheel zoom keeps the point under the cursor in place so inspecting a detail
  // does not throw the picture sideways. Dragging pans once zoomed in, and a
  // double click returns to the fitted view.
  function enablePreviewZoom(frame) {
    const target = frame.querySelector("img,video");
    if (!target) return;
    let zoom = 1, panX = 0, panY = 0, dragging = null;
    const controls = () => frame.querySelector(".flora-generation-history-playback");
    const clampPan = () => {
      const rect = frame.getBoundingClientRect();
      const maxX = (zoom - 1) * rect.width / 2;
      const maxY = (zoom - 1) * rect.height / 2;
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
    };
    const apply = () => {
      target.style.transform = zoom === 1 && !panX && !panY
        ? ""
        : `translate(${panX}px, ${panY}px) scale(${zoom})`;
      frame.classList.toggle("is-zoomed", zoom > 1);
      frame.dataset.zoom = String(Math.round(zoom * 100));
    };
    const zoomAt = (clientX, clientY, factor) => {
      const rect = frame.getBoundingClientRect();
      const next = Math.min(PREVIEW_MAX_ZOOM, Math.max(1, zoom * factor));
      if (next === zoom) return;
      const offsetX = clientX - (rect.left + rect.width / 2);
      const offsetY = clientY - (rect.top + rect.height / 2);
      const grow = next / zoom;
      panX = offsetX - grow * (offsetX - panX);
      panY = offsetY - grow * (offsetY - panY);
      zoom = next;
      clampPan();
      apply();
    };
    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    frame.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zoom = 1; panX = 0; panY = 0;
      apply();
    });
    frame.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || controls()?.contains(event.target)) return;
      if (zoom <= 1) return;
      event.preventDefault();
      event.stopPropagation();
      frame.setPointerCapture?.(event.pointerId);
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    frame.addEventListener("pointermove", (event) => {
      if (dragging?.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      panX += event.clientX - dragging.x;
      panY += event.clientY - dragging.y;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      clampPan();
      apply();
    });
    const endDrag = (event) => {
      if (dragging?.id !== event.pointerId) return;
      frame.releasePointerCapture?.(event.pointerId);
      dragging = null;
    };
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);
    apply();
  }

  function closePreview(state, restoreFocus = true) {
    if (!state.preview) return;
    const preview = state.preview;
    state.preview = null;
    if (document.fullscreenElement && preview.contains(document.fullscreenElement)) document.exitFullscreen?.().catch(() => {});
    releaseMedia(preview);
    preview.close(); preview.remove();
    if (restoreFocus && state.previewTrigger?.isConnected) state.previewTrigger.focus();
  }

  function openPreview(state, item, trigger) {
    closePreview(state, false);
    const preview = document.createElement("dialog");
    preview.className = "flora-generation-history-preview";
    preview.setAttribute("aria-label", "生成结果全屏预览");
    inheritTokens(state.node, preview);
    const content = document.createElement("div");
    content.className = "flora-generation-history-preview-content";
    const header = document.createElement("div"); header.className = "flora-generation-history-header";
    const close = button("关闭全屏预览", "x");
    header.append(textElement("flora-generation-history-title", `生成${kindLabels[item.kind]}`), close);
    const frame = media(item, false);
    content.append(header, frame, describe(item));
    preview.append(content);
    state.host.append(preview); state.preview = preview; state.previewTrigger = trigger;
    close.addEventListener("click", () => closePreview(state));
    preview.addEventListener("cancel", event => { event.preventDefault(); closePreview(state); });
    preview.addEventListener("pointerdown", event => event.stopPropagation());
    preview.showModal(); close.focus(); icons();
    enablePreviewZoom(frame);
    // The modal itself already fills the viewport. Native fullscreen, when
    // available, also removes browser chrome; failure keeps the usable modal.
    content.requestFullscreen?.().catch(() => {});
  }

  function closePanel(state, restoreFocus = true) {
    closePreview(state, false);
    if (state.panel.open) state.panel.close();
    releaseMedia(state.grid);
    state.signature = null;
    state.badge.setAttribute("aria-expanded", "false");
    if (restoreFocus && !state.badge.hidden && state.badge.isConnected) state.badge.focus();
  }

  function render(state, data) {
    const focused = state.grid.contains(document.activeElement) ? { id: document.activeElement.dataset.historyId, action: document.activeElement.dataset.historyAction } : null;
    releaseMedia(state.grid); state.grid.replaceChildren();
    state.count.textContent = `共${data.generationHistory.length}条`;
    if (!data.generationHistory.length) state.grid.append(textElement("flora-generation-history-empty", "暂无生成历史"));
    data.generationHistory.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "flora-generation-history-card";
      card.dataset.current = String(item.id === data.currentGenerationId);
      const choose = button(`选择第${index + 1}条生成结果`, null, "flora-generation-history-choice");
      choose.setAttribute("aria-pressed", String(item.id === data.currentGenerationId));
      choose.dataset.historyId = item.id; choose.dataset.historyAction = "select";
      const caption = textElement("flora-generation-history-caption", `第${index + 1}条 · ${kindLabels[item.kind]}`);
      const current = textElement("flora-generation-history-current", "当前结果"); current.hidden = item.id !== data.currentGenerationId;
      choose.append(media(item, true), caption, current);
      choose.addEventListener("click", () => select(state.node, item.id));
      const actions = document.createElement("div"); actions.className = "flora-generation-history-actions";
      const expand = button(`全屏查看第${index + 1}条生成结果`, "maximize-2");
      const save = button(`下载第${index + 1}条生成结果`, "download");
      const trash = button(`删除第${index + 1}条生成结果`, "trash-2"); trash.dataset.destructive = "true";
      for (const [element, name] of [[expand, "preview"], [save, "download"], [trash, "remove"]]) {
        element.dataset.historyId = item.id; element.dataset.historyAction = name;
      }
      expand.addEventListener("click", () => openPreview(state, item, expand));
      save.addEventListener("click", () => download(state, item, save));
      trash.addEventListener("click", () => remove(state.node, item.id));
      actions.append(expand, save, trash);
      card.append(choose, actions); state.grid.append(card);
    });
    icons();
    if (focused) {
      const controls = Array.from(state.grid.querySelectorAll("button"));
      (controls.find(element => element.dataset.historyId === focused.id && element.dataset.historyAction === focused.action) || controls.find(element => element.getAttribute("aria-pressed") === "true") || state.dismiss).focus();
    }
  }

  function sync(node) {
    const state = mounted.get(node);
    if (!state) return;
    const data = serialize(node);
    const count = data.generationHistory.length;
    state.badge.hidden = count === 0;
    state.badgeLabel.textContent = String(count);
    const label = `查看生成历史，共${count}条`;
    state.badge.title = label; state.badge.setAttribute("aria-label", label);
    const signature = JSON.stringify(data);
    if (state.signature !== signature) {
      state.signature = signature;
      if (state.preview && !data.generationHistory.some(item => item.id === state.previewTrigger?.dataset.historyId)) closePreview(state);
      render(state, data);
    }
  }

  function mount(node, shell) {
    if (!node || !shell) return null;
    const existing = mounted.get(node);
    if (existing?.shell === shell) { sync(node); return existing; }
    if (existing) unmount(node);
    const badge = button("查看生成历史", "history", "flora-generation-history-badge");
    const badgeLabel = document.createElement("span"); badge.append(badgeLabel);
    badge.setAttribute("aria-haspopup", "dialog"); badge.setAttribute("aria-expanded", "false");
    const panel = document.createElement("dialog");
    panel.id = `flora-generation-history-${++nextId}`;
    panel.className = "flora-generation-history-panel";
    panel.setAttribute("aria-label", "节点生成历史");
    inheritTokens(node, panel);
    badge.setAttribute("aria-controls", panel.id);
    const header = document.createElement("div"); header.className = "flora-generation-history-header";
    const count = textElement("flora-generation-history-count", "");
    const dismiss = button("关闭生成历史", "x");
    header.append(textElement("flora-generation-history-title", "生成历史"), count, dismiss);
    const grid = document.createElement("div"); grid.className = "flora-generation-history-grid";
    const status = textElement("flora-generation-history-status", ""); status.setAttribute("role", "status");
    const note = textElement("flora-generation-history-note", "选择结果只更新预览。删除仅移除此节点的历史记录。");
    panel.append(header, grid, status, note);
    const host = document.fullscreenElement || node.closest("#neonEngineSurface") || document.body;
    host.append(panel); shell.append(badge);
    const state = { node, shell, host, badge, badgeLabel, panel, count, dismiss, grid, status, urls: new Set(), urlTimers: new Map() };
    mounted.set(node, state);
    badge.addEventListener("pointerdown", event => event.stopPropagation());
    badge.addEventListener("click", event => {
      event.stopPropagation(); sync(node);
      inheritTokens(node, panel);
      state.status.textContent = "";
      if (state.panel.open) { closePanel(state); return; }
      state.host = document.fullscreenElement || node.closest("#neonEngineSurface") || document.body;
      state.host.append(panel);
      panel.showModal(); badge.setAttribute("aria-expanded", "true");
      (grid.querySelector('[aria-pressed="true"]') || dismiss).focus();
    });
    dismiss.addEventListener("click", () => closePanel(state));
    panel.addEventListener("cancel", event => { event.preventDefault(); closePanel(state); });
    panel.addEventListener("click", event => { if (event.target === panel) { const rect = panel.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel(state); } });
    for (const name of ["pointerdown", "wheel", "keydown"]) panel.addEventListener(name, event => event.stopPropagation());
    state.changed = event => { if (event.detail?.node === node) sync(node); };
    root.addEventListener("flora-generation-history-change", state.changed);
    state.fullscreenChanged = () => {
      if (state.preview) return;
      const host = document.fullscreenElement || node.closest("#neonEngineSurface") || document.body;
      if (state.host !== host) { const open = panel.open; if (open) panel.close(); host.append(panel); state.host = host; if (open) panel.showModal(); }
    };
    document.addEventListener("fullscreenchange", state.fullscreenChanged);
    sync(node); icons();
    return state;
  }

  function unmount(node) {
    const state = mounted.get(node);
    if (!state) return;
    closePanel(state, false);
    mounted.delete(node);
    root.removeEventListener("flora-generation-history-change", state.changed);
    document.removeEventListener("fullscreenchange", state.fullscreenChanged);
    for (const timer of state.urlTimers.values()) root.clearTimeout(timer);
    for (const url of state.urls) root.URL.revokeObjectURL(url);
    state.urlTimers.clear(); state.urls.clear();
    state.badge.remove(); state.panel.remove();
  }

  root.FloraGenerationHistory = Object.freeze({ add, mount, sync, unmount, serialize, hydrate });
})(typeof window !== "undefined" ? window : globalThis);
