(function initCanvasAssetCollectionNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAssetCollectionNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAssetCollectionNodeRenderer() {
  "use strict";

  function openAssetPicker(node, document, selectCanvasNode) {
    selectCanvasNode?.(node);
    const picker = document.querySelector("#canvasNodeAssetInput");
    if (!picker) return;
    picker.dataset.nodeId = node.dataset.id;
    picker.click();
  }

  function createUploadButton(
    node,
    document,
    selectCanvasNode,
    className = "canvas-assets-upload",
    { icon = "plus", title = "添加图片、视频或音频" } = {},
  ) {
    const upload = document.createElement("button");
    upload.type = "button";
    upload.className = className;
    upload.title = title;
    upload.setAttribute("aria-label", upload.title);
    upload.innerHTML = `<i data-lucide="${icon}"></i>`;
    upload.addEventListener("pointerdown", (event) => event.stopPropagation());
    upload.addEventListener("click", (event) => {
      event.stopPropagation();
      openAssetPicker(node, document, selectCanvasNode);
    });
    return upload;
  }

  function bindDropSurface(surface, node, rules, fillCanvasAssetCollectionFromFile) {
    surface.addEventListener("dragover", (event) => {
      if (Array.from(event.dataTransfer?.items || []).some((item) => rules.detectKind({ mimeType: item.type }))) {
        event.preventDefault();
      }
    });
    surface.addEventListener("drop", async (event) => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      for (const file of files) await fillCanvasAssetCollectionFromFile?.(node, file);
    });
  }

  function resetNodePresentation(node) {
    node.classList.remove(
      "canvas-node-frameless",
      "canvas-node-asset-single-image",
      "canvas-node-asset-single-video",
      "canvas-node-asset-single-audio",
      "canvas-node-media",
      "canvas-node-media-video",
      "canvas-node-media-audio",
    );
    [
      "imageSrc",
      "imageName",
      "originalSrc",
      "videoSrc",
      "audioSrc",
      "mediaName",
      "mediaMimeType",
      "mediaDuration",
    ].forEach((key) => delete node.dataset[key]);
    node.style.removeProperty("width");
    node.style.removeProperty("height");
  }

  function render(node, value = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      applyCanvasNodeSize,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      ensureCanvasNodeChrome,
      fillCanvasAssetCollectionFromFile,
      hasCanvasNodeIncomingConnection,
      openPreview,
      registerCanvasDetailImage,
      removeCanvasAssetCollectionMember,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      selectCanvasNode,
      setCanvasAssetCollectionStatus,
    } = context;
    const rules = globalThis.CanvasAssetCollectionRules;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas asset collection node renderer context is incomplete.");
    }
    if (!rules) throw new Error("Canvas asset collection rules must load before the node renderer.");

    const members = rules.normalizeMembers(value?.members);
    const activeMemberId = members.some((item) => item.id === value?.activeMemberId)
      ? value.activeMemberId : members[0]?.id || "";
    const state = {
      title: String(value?.title || "素材合集"),
      mode: value?.mode === "single" ? "single" : "collection",
      members,
      activeMemberId,
    };
    const single = members.length === 1 ? members[0] : null;
    const singleImage = state.mode === "single" && single?.kind === "image" ? single : null;
    const singleVideo = state.mode === "single" && single?.kind === "video" ? single : null;
    const singleAudio = state.mode === "single" && single?.kind === "audio" ? single : null;
    const singleMedia = singleVideo || singleAudio;

    resetNodePresentation(node);
    node.dataset.assetCollection = JSON.stringify(state);
    if (singleImage) {
      node.classList.add("canvas-node-frameless", "canvas-node-asset-single-image");
      node.dataset.imageSrc = singleImage.src;
      node.dataset.imageName = singleImage.name;
      node.dataset.originalSrc = singleImage.src;
    } else if (singleVideo || singleAudio) {
      const kind = singleVideo ? "video" : "audio";
      node.classList.add(`canvas-node-asset-single-${kind}`);
      node.dataset[`${kind}Src`] = singleMedia.src;
      node.dataset.mediaName = singleMedia.name;
      node.dataset.mediaMimeType = singleMedia.mimeType || (kind === "video" ? "video/mp4" : "audio/mpeg");
      node.dataset.mediaDuration = String(Number(singleMedia.duration || 0));
    }

    node.innerHTML = "";
    const input = createCanvasPort("input");
    const output = createCanvasPort("output");

    if (singleImage) {
      const bar = createCanvasNodeBar(singleImage.name, { editable: true });
      const picture = document.createElement("div");
      picture.className = "canvas-image-upload has-image";
      picture.title = "单击显示图片操作，双击查看原图";
      const image = document.createElement("img");
      image.alt = singleImage.name;
      if (registerCanvasDetailImage) registerCanvasDetailImage(image, singleImage.src);
      else image.src = singleImage.src;
      image.addEventListener("load", scheduleCanvasConnectionRender || (() => {}));
      picture.append(image);
      picture.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        openAssetPicker(node, document, selectCanvasNode);
      });
      bindDropSurface(picture, node, rules, fillCanvasAssetCollectionFromFile);

      const children = [];
      if (hasCanvasNodeIncomingConnection?.(node)) children.push(input);
      children.push(output, bar, picture, createCanvasResizeHandle());
      node.append(...children);
    } else if (singleMedia) {
      const kind = singleVideo ? "video" : "audio";
      const isVideo = kind === "video";
      const label = isVideo ? "视频" : "音频";
      node.classList.add("canvas-node-media", `canvas-node-media-${kind}`);
      const bar = createCanvasNodeBar(label);
      const mediaShell = document.createElement("div");
      mediaShell.className = `canvas-media-shell canvas-media-shell-${kind} has-media`;
      const previewLabel = document.createElement("span");
      previewLabel.className = "canvas-media-preview-label";
      previewLabel.textContent = `${label}预览`;
      const media = document.createElement(kind);
      media.className = `canvas-${kind}-preview`;
      media.src = singleMedia.src;
      media.controls = true;
      media.preload = "metadata";
      if (isVideo) media.playsInline = true;
      media.addEventListener("pointerdown", (event) => event.stopPropagation());
      media.addEventListener("loadedmetadata", () => {
        const duration = Number.isFinite(media.duration) ? Number(media.duration) : 0;
        singleMedia.duration = duration;
        node.dataset.mediaDuration = String(duration);
        node.dataset.assetCollection = JSON.stringify(state);
        scheduleCanvasConnectionRender?.();
        scheduleCanvasSave?.();
      });
      mediaShell.append(previewLabel, media);
      mediaShell.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        openAssetPicker(node, document, selectCanvasNode);
      });
      bindDropSurface(mediaShell, node, rules, fillCanvasAssetCollectionFromFile);

      const actions = document.createElement("div");
      actions.className = "canvas-media-actions";
      const replace = createUploadButton(
        node,
        document,
        selectCanvasNode,
        "canvas-assets-upload canvas-media-action",
        { icon: "refresh-cw", title: `替换${label}` },
      );
      const download = document.createElement("a");
      download.href = singleMedia.savedUrl || singleMedia.src;
      download.download = singleMedia.name || `${kind}-material`;
      download.className = "canvas-media-action";
      download.title = `下载${label}`;
      download.setAttribute("aria-label", download.title);
      download.innerHTML = '<i data-lucide="download"></i>';
      download.addEventListener("pointerdown", (event) => event.stopPropagation());
      actions.append(replace, download);
      const remove = bar.querySelector(".canvas-node-delete");
      if (remove) remove.before(actions);
      else bar.append(actions);

      const status = document.createElement("span");
      status.className = "canvas-node-status";
      status.textContent = "已就绪 · 可预览和输出";
      const children = [];
      if (hasCanvasNodeIncomingConnection?.(node)) children.push(input);
      children.push(output, bar, mediaShell, status, createCanvasResizeHandle());
      node.append(...children);
    } else {
      const bar = createCanvasNodeBar(state.title);
      const actions = document.createElement("div");
      actions.className = "canvas-assets-actions";
      const upload = createUploadButton(node, document, selectCanvasNode);
      actions.append(upload);
      const body = document.createElement("div");
      body.className = "canvas-assets-body";
      if (!members.length) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.className = "canvas-assets-empty";
        empty.innerHTML = '<i data-lucide="paperclip"></i><strong>添加素材</strong><small>图片、视频或音频</small>';
        empty.addEventListener("click", () => upload.click());
        body.append(empty);
      } else {
        const list = document.createElement("div");
        list.className = `canvas-assets-list${members.length === 1 ? " is-single" : ""}`;
        members.forEach((member) => {
          const item = document.createElement("article");
          item.className = `canvas-assets-item${member.id === activeMemberId ? " is-active" : ""}`;
          const visual = document.createElement("div");
          visual.className = "canvas-assets-visual";
          if (member.kind === "image") {
            const image = document.createElement("img");
            image.alt = member.name;
            image.loading = "lazy";
            if (registerCanvasDetailImage) registerCanvasDetailImage(image, member.src);
            else image.src = member.src;
            image.addEventListener("click", (event) => {
              event.stopPropagation();
              openPreview?.(member.src, member.savedUrl || member.src);
            });
            visual.append(image);
          } else {
            const media = document.createElement(member.kind);
            media.src = member.src;
            media.controls = true;
            media.preload = "metadata";
            if (member.kind === "video") media.playsInline = true;
            media.addEventListener("pointerdown", (event) => event.stopPropagation());
            visual.append(media);
          }
          const info = document.createElement("div");
          info.className = "canvas-assets-info";
          const badge = document.createElement("span");
          badge.className = `canvas-assets-kind is-${member.kind}`;
          badge.textContent = { image: "图片", video: "视频", audio: "音频" }[member.kind];
          const name = document.createElement("strong");
          name.textContent = member.name;
          name.title = member.name;
          const time = document.createElement("time");
          time.textContent = new Date(member.createdAt).toLocaleString();
          info.append(badge, name, time);
          const buttons = document.createElement("div");
          buttons.className = "canvas-assets-item-actions";
          const download = document.createElement("a");
          download.href = member.savedUrl || member.src;
          download.download = member.name || "素材";
          download.title = "下载素材";
          download.setAttribute("aria-label", `下载${member.name}`);
          download.innerHTML = '<i data-lucide="download"></i>';
          download.addEventListener("pointerdown", (event) => event.stopPropagation());
          const remove = document.createElement("button");
          remove.type = "button";
          remove.title = "从合集移除";
          remove.setAttribute("aria-label", `移除${member.name}`);
          remove.innerHTML = '<i data-lucide="trash-2"></i>';
          remove.addEventListener("click", (event) => {
            event.stopPropagation();
            removeCanvasAssetCollectionMember?.(node, member.id);
          });
          buttons.append(download, remove);
          info.append(buttons);
          const memberPort = createCanvasPort("output", { handle: `member-output:${member.id}` });
          memberPort.classList.add("canvas-assets-member-port");
          memberPort.title = `连接${member.name}`;
          item.append(visual, info, memberPort);
          list.append(item);
        });
        body.append(list);
      }
      bindDropSurface(body, node, rules, fillCanvasAssetCollectionFromFile);
      node.append(input, output, bar, actions, body, createCanvasResizeHandle());
      ensureCanvasNodeChrome?.(node);
    }

    setCanvasAssetCollectionStatus?.(node);
    applyCanvasNodeSize?.(node);
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
