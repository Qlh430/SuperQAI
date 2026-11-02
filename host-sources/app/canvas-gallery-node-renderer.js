(function initCanvasGalleryNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGalleryNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGalleryNodeRenderer() {
  "use strict";

  function render(node, value, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      bindCanvasGalleryContainerMemberDrag,
      collectCanvasGalleryReusableImages,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      getCanvasGalleryContainer,
      getCanvasGalleryContainerRenderState,
      getCanvasGalleryImageSyncLabel,
      getCanvasImageIntrinsicDimensions,
      isCanvasGalleryImageReady,
      normalizeCanvasGalleryContainer,
      reconcilePersistedCanvasGalleryContainerSyncStates,
      recoverCanvasGalleryContainerMember,
      registerCanvasDetailImage,
      renderCanvasNodeIcons,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      setCanvasStatus,
      shouldRenderCanvasGalleryMemberOutput,
      syncCanvasGalleryMemberIntrinsicSize,
      takeCanvasGalleryReusableImage,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas gallery node renderer context is incomplete.");
    }
    if (!normalizeCanvasGalleryContainer || !getCanvasGalleryContainerRenderState) {
      throw new Error("Canvas gallery layout rules must load before the node renderer.");
    }

    const reconciledContainer = reconcilePersistedCanvasGalleryContainerSyncStates
      ? reconcilePersistedCanvasGalleryContainerSyncStates(normalizeCanvasGalleryContainer(value))
      : normalizeCanvasGalleryContainer(value);
    const reusableMemberImages = collectCanvasGalleryReusableImages?.(node) || new Map();
    options?.preservedMemberImages?.forEach?.((image, memberId) => {
      if (image) reusableMemberImages.set(String(memberId), image);
    });
    let hydratedIntrinsicDimensions = false;
    const hydratedMembers = reconciledContainer.members.map((member) => {
      const image = reusableMemberImages.get(String(member.id));
      const intrinsic = getCanvasImageIntrinsicDimensions?.(image);
      if (!intrinsic) return member;
      const width = Number(member.width) > 0 ? Number(member.width) : intrinsic.width;
      const height = Number(member.height) > 0 ? Number(member.height) : intrinsic.height;
      if (width === Number(member.width) && height === Number(member.height)) return member;
      hydratedIntrinsicDimensions = true;
      return { ...member, width, height };
    });
    const renderContainer = hydratedIntrinsicDimensions
      ? { ...reconciledContainer, members: hydratedMembers }
      : reconciledContainer;
    if (hydratedIntrinsicDimensions) {
      node.dataset.galleryContainer = JSON.stringify(renderContainer);
      scheduleCanvasSave?.();
    }
    const { container, layout } = getCanvasGalleryContainerRenderState(renderContainer, {
      width: Number(node.dataset.width || 0),
      height: Number(node.dataset.height || 0),
    });
    const members = container.members;
    const columns = layout.columns;
    const gap = layout.gap;
    const showMemberOutputs = shouldRenderCanvasGalleryMemberOutput
      ? shouldRenderCanvasGalleryMemberOutput(members.length)
      : Number(members.length) > 1;
    node.innerHTML = "";
    node.classList.remove("canvas-node-gallery", "canvas-gallery-frameless", "is-gallery-history-open");
    node.classList.add("canvas-node-gallery-container");
    node.dataset.width = String(Math.round(layout.width));
    node.dataset.height = String(Math.round(layout.height));
    node.style.width = `${layout.width}px`;
    node.style.height = `${layout.height}px`;
    node.style.setProperty("--canvas-gallery-container-width", `${layout.width}px`);
    node.style.setProperty("--canvas-gallery-container-height", `${layout.height}px`);
    node.style.setProperty("--canvas-gallery-container-min-height", `${layout.minHeight}px`);
    node.style.setProperty("--canvas-gallery-container-cell-width", `${layout.cellWidth}px`);
    node.style.setProperty("--canvas-gallery-container-cell-height", `${layout.cellHeight}px`);
    node.dataset.galleryContainer = JSON.stringify(container);
    node.dataset.galleryTitle = container.title;
    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    outputPort.classList.add("canvas-gallery-container-output-port");
    outputPort.title = "图集输出：整组图片连接到后续节点";
    outputPort.setAttribute("aria-label", "图集输出：整组图片连接到后续节点");
    const bar = createCanvasNodeBar(container.title || "图集");
    const membersEl = document.createElement("div");
    membersEl.className = "canvas-gallery-container-members";
    membersEl.style.setProperty("--canvas-gallery-container-columns", String(columns));
    membersEl.style.setProperty("--canvas-gallery-container-gap", `${Math.max(0, gap)}px`);
    membersEl.style.setProperty("--canvas-gallery-container-cell-width", `${layout.cellWidth}px`);
    membersEl.style.setProperty("--canvas-gallery-container-cell-height", `${layout.cellHeight}px`);
    if (!members.length) {
      const empty = document.createElement("div");
      empty.className = "canvas-gallery-container-empty";
      empty.textContent = "图片会自动收纳到这里";
      membersEl.innerHTML = "";
      membersEl.append(empty);
    }
    members.forEach((member, index) => {
      const item = document.createElement("article");
      item.className = `canvas-gallery-member${member.id === container.activeMemberId ? " is-active" : ""}`;
      item.dataset.galleryMemberId = member.id;
      item.setAttribute("data-gallery-member-id", member.id);
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "canvas-gallery-member-preview";
      const memberAspectRatio = Number(member.width) > 0 && Number(member.height) > 0
        ? `${Number(member.width)} / ${Number(member.height)}` : "1 / 1";
      preview.style.aspectRatio = memberAspectRatio;
      preview.title = member.name || `图片 ${index + 1}`;
      preview.setAttribute("aria-label", `选择图片：${member.name || `图片 ${index + 1}`}`);
      if (isCanvasGalleryImageReady?.(member)) {
        const source = member.src || member.savedUrl;
        const image = takeCanvasGalleryReusableImage?.(reusableMemberImages, member.id, source)
          || document.createElement("img");
        image.alt = member.name || `图片 ${index + 1}`;
        image.style.aspectRatio = memberAspectRatio;
        image.__canvasGalleryIntrinsicSync = { node, memberId: member.id };
        if (image.dataset.canvasGalleryIntrinsicSyncBound !== "true") {
          image.dataset.canvasGalleryIntrinsicSyncBound = "true";
          image.addEventListener("load", () => {
            const binding = image.__canvasGalleryIntrinsicSync;
            if (binding?.node && binding?.memberId) {
              syncCanvasGalleryMemberIntrinsicSize?.(binding.node, binding.memberId, image);
            } else {
              syncCanvasGalleryMemberIntrinsicSize?.(node, member.id, image);
            }
          });
        }
        if (image.complete && (
          Number(image.naturalWidth) > 0
          || (Number(image.dataset.originalWidth) > 0 && Number(image.dataset.originalHeight) > 0)
        )) {
          Promise.resolve().then(() => {
            const binding = image.__canvasGalleryIntrinsicSync;
            if (binding?.node && binding?.memberId) {
              syncCanvasGalleryMemberIntrinsicSize?.(binding.node, binding.memberId, image);
            } else {
              syncCanvasGalleryMemberIntrinsicSize?.(node, member.id, image);
            }
          });
        }
        if (!image.hasAttribute?.("data-original-src")) {
          registerCanvasDetailImage?.(image, source);
        }
        preview.append(image);
      } else {
        const pending = document.createElement("span");
        pending.className = "canvas-gallery-member-pending";
        pending.textContent = getCanvasGalleryImageSyncLabel?.(member) || "等待图片";
        preview.append(pending);
      }
      preview.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isCanvasGalleryImageReady?.(member)) {
          void recoverCanvasGalleryContainerMember?.(node, member.id).catch((error) => {
            setCanvasStatus?.(`原图同步失败：${error.message || "未知错误"}`);
          });
          return;
        }
        const next = { ...getCanvasGalleryContainer?.(node), activeMemberId: member.id };
        node.dataset.galleryContainer = JSON.stringify(next);
        membersEl.querySelectorAll(".canvas-gallery-member").forEach((candidate) => {
          candidate.classList.toggle("is-active", candidate.dataset.galleryMemberId === member.id);
        });
        scheduleCanvasSave?.();
      });
      item.append(preview);
      if (showMemberOutputs) {
        const memberPort = createCanvasPort("output", { handle: `member-output:${member.id}` });
        memberPort.classList.add("canvas-gallery-member-port", "canvas-gallery-member-output-port");
        memberPort.title = `图片输出：${member.name || `图片 ${index + 1}`}`;
        memberPort.setAttribute("aria-label", `图片输出：${member.name || `图片 ${index + 1}`}`);
        item.append(memberPort);
      }
      bindCanvasGalleryContainerMemberDrag?.(item, node, member);
      membersEl.append(item);
    });
    const footer = document.createElement("footer");
    footer.className = "canvas-gallery-container-footer";
    const footerStatus = document.createElement("span");
    footerStatus.className = "canvas-node-status";
    footerStatus.dataset.state = members.length ? "done" : "idle";
    footerStatus.textContent = members.length
      ? `已收纳 ${members.length} 张图片`
      : "还没有收纳图片";
    footer.append(footerStatus);
    node.append(inputPort, outputPort, bar, membersEl, footer, createCanvasResizeHandle());
    renderCanvasNodeIcons?.(node);
    scheduleCanvasConnectionRender?.({ trailing: false });
  }

  return Object.freeze({ render });
});
