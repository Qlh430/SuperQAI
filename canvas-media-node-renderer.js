(function initCanvasMediaNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasMediaNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasMediaNodeRenderer() {
  "use strict";

  function renderUpload(node, options, context) {
    const document = context?.document || globalThis.document;
    const {
      applyCanvasNodeSize,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      hasCanvasNodeIncomingConnection,
      registerCanvasDetailImage,
      scheduleCanvasConnectionRender,
      selectCanvasNode,
      uniqueCanvasImageName,
    } = context || {};
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas upload node renderer context is incomplete.");
    }

    const src = String(options?.src || "");
    const previousSize = node.dataset.canvasSize || "";
    const previousResolution = node.dataset.canvasResolution || "";
    const resolvedName = uniqueCanvasImageName?.(node, options?.name || "图片节点") || options?.name || "图片节点";
    node.innerHTML = "";
    node.dataset.imageSrc = src;
    node.dataset.imageName = resolvedName;
    node.dataset.originalSrc = src;
    if (previousSize) node.dataset.canvasSize = previousSize;
    if (previousResolution) node.dataset.canvasResolution = previousResolution;
    node.dataset.uploadOnly = "true";
    node.classList.toggle("canvas-node-frameless", Boolean(src));

    const outputPort = createCanvasPort("output");
    const media = document.createElement("div");
    media.className = `canvas-image-upload${src ? " has-image" : " canvas-image-empty"}`;
    media.title = src ? "单击显示图片操作，双击查看原图" : "双击上传图片";
    if (src) {
      const img = document.createElement("img");
      img.alt = resolvedName;
      img.addEventListener("load", scheduleCanvasConnectionRender || (() => {}));
      registerCanvasDetailImage?.(img, src);
      media.append(img);
    } else {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "canvas-media-empty";
      const icon = document.createElement("span");
      icon.className = "canvas-media-empty-icon";
      icon.innerHTML = '<i data-lucide="image-plus"></i>';
      const title = document.createElement("span");
      title.textContent = "上传或拖入图片";
      empty.append(icon, title);
      empty.addEventListener("click", (event) => {
        event.stopPropagation();
        selectCanvasNode?.(node);
        document.querySelector("#canvasNodeImageInput")?.click();
      });
      media.append(empty);
    }
    media.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectCanvasNode?.(node);
      document.querySelector("#canvasNodeImageInput")?.click();
    });

    const bar = createCanvasNodeBar(src ? resolvedName : "图片", { editable: Boolean(src) });
    if (hasCanvasNodeIncomingConnection?.(node)) {
      node.append(createCanvasPort("input"), outputPort, bar, media, createCanvasResizeHandle());
    } else {
      node.append(outputPort, bar, media, createCanvasResizeHandle());
    }
    applyCanvasNodeSize?.(node);
    scheduleCanvasConnectionRender?.();
  }

  function renderMedia(node, kind, options, context) {
    const document = context?.document || globalThis.document;
    const {
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      selectCanvasNode,
    } = context || {};
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas media node renderer context is incomplete.");
    }

    const src = String(options?.src || "");
    const name = String(options?.name || "");
    const mimeType = String(options?.mimeType || "");
    const duration = Number(options?.duration || 0);
    const assetId = String(options?.assetId || "");
    const isVideo = kind === "video";
    const label = isVideo ? "视频" : "音频";
    const sourceKey = isVideo ? "videoSrc" : "audioSrc";
    const inputSelector = isVideo ? "#canvasNodeVideoInput" : "#canvasNodeAudioInput";
    node.innerHTML = "";
    node.classList.remove(
      "canvas-node-media",
      "canvas-node-media-video",
      "canvas-node-media-audio",
    );
    node.classList.add("canvas-node-media", `canvas-node-media-${kind}`);
    if (assetId) node.dataset.assetId = assetId;
    node.dataset[sourceKey] = src;
    node.dataset.mediaName = name || label;
    node.dataset.mediaMimeType = mimeType || (isVideo ? "video/mp4" : "audio/mpeg");
    node.dataset.mediaDuration = String(Number(duration || 0));
    node.classList.toggle("has-media", Boolean(src));

    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar(label);
    const mediaShell = document.createElement("div");
    mediaShell.className = `canvas-media-shell canvas-media-shell-${kind}${src ? " has-media" : ""}`;
    if (src) {
      const previewLabel = document.createElement("span");
      previewLabel.className = "canvas-media-preview-label";
      previewLabel.textContent = `${label}预览`;
      const media = document.createElement(kind);
      media.className = `canvas-${kind}-preview`;
      media.src = src;
      media.controls = true;
      media.preload = "metadata";
      if (isVideo) media.playsInline = true;
      media.addEventListener("loadedmetadata", () => {
        node.dataset.mediaDuration = String(Number.isFinite(media.duration) ? media.duration : 0);
        scheduleCanvasConnectionRender?.();
        scheduleCanvasSave?.();
      });
      mediaShell.append(previewLabel, media);
    } else {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "canvas-media-empty";
      const icon = document.createElement("span");
      icon.className = "canvas-media-empty-icon";
      icon.innerHTML = `<i data-lucide="${isVideo ? "video" : "audio-lines"}"></i>`;
      const title = document.createElement("span");
      title.textContent = `上传或拖入${label}`;
      empty.append(icon, title);
      empty.addEventListener("click", (event) => {
        event.stopPropagation();
        selectCanvasNode?.(node);
        document.querySelector(inputSelector)?.click();
      });
      mediaShell.append(empty);
    }
    mediaShell.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectCanvasNode?.(node);
      document.querySelector(inputSelector)?.click();
    });

    const actions = document.createElement("div");
    actions.className = "canvas-media-actions";
    const replace = document.createElement("button");
    replace.type = "button";
    replace.className = "canvas-media-action";
    replace.title = src ? `替换${label}` : `上传${label}`;
    replace.setAttribute("aria-label", replace.title);
    replace.innerHTML = `<i data-lucide="${src ? "refresh-cw" : "upload"}"></i>`;
    replace.addEventListener("click", (event) => {
      event.stopPropagation();
      selectCanvasNode?.(node);
      document.querySelector(inputSelector)?.click();
    });
    actions.append(replace);
    if (src) {
      const download = document.createElement("a");
      download.href = src;
      download.download = name || `${kind}-material`;
      download.className = "canvas-media-action";
      download.title = `下载${label}`;
      download.setAttribute("aria-label", download.title);
      download.innerHTML = '<i data-lucide="download"></i>';
      download.addEventListener("pointerdown", (event) => event.stopPropagation());
      actions.append(download);
    }
    const remove = bar.querySelector(".canvas-node-delete");
    if (remove) remove.before(actions);
    else bar.append(actions);
    const status = document.createElement("span");
    status.className = "canvas-node-status";
    status.textContent = src ? "已就绪 · 可预览和输出" : "上传或连接媒体";
    node.append(outputPort, bar, mediaShell, status, createCanvasResizeHandle());
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({
    renderUpload,
    renderMedia,
  });
});
