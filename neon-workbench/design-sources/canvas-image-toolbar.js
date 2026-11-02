(function initializeCanvasImageToolbar(root) {
  function create({ viewport, getSelectedNodes, selectNode, onSelectImage, onPreview, onDownload, onDelete, onReplace, onCrop, onError }) {
    const shared = root.CanvasNodeActionBar;
    if (!shared) return { refresh() {}, hide() {}, show() {} };
    let selectedImage = null, selectedNode = null;
    const actionBar = shared.create({
      appendTo: viewport,
      className: "canvas-image-toolbar",
      ariaLabel: "图片操作",
      hidden: true,
      actions: [
        { id: "preview", title: "放大查看原图", icon: "maximize" },
        { id: "crop", title: "裁剪图片", icon: "crop" },
        { id: "download", title: "下载原图", icon: "download" },
        { id: "replace", title: "替换图片", icon: "image-plus" },
        { id: "delete", title: "从画布删除图片", icon: "trash-2" },
      ],
      onAction: async (action, { button }) => {
        if (!selectedImage || !selectedNode) return;
        const image = selectedImage, node = selectedNode;
        button.disabled = true;
        try {
          const handler = { preview: onPreview, crop: onCrop, download: onDownload, replace: onReplace, delete: onDelete }[action];
          await handler?.(node, image);
        } catch (error) {
          onError?.(error);
        } finally {
          button.disabled = false;
          refresh();
        }
      },
    });
    const toolbar = actionBar.element;
    function hide() {
      selectedImage?.classList.remove("is-image-action-selected");
      selectedImage = null; selectedNode = null; toolbar.hidden = true;
    }
    function refresh() {
      const selection = getSelectedNodes();
      if (!selectedImage?.isConnected || !selectedNode?.isConnected || selection.length !== 1 || selection[0] !== selectedNode) return hide();
      const picture = selectedImage.getBoundingClientRect(), stage = viewport.getBoundingClientRect();
      if (!picture.width || !picture.height || picture.right < stage.left || picture.left > stage.right || picture.bottom < stage.top || picture.top > stage.bottom) return hide();
      toolbar.hidden = false;
      const unit = stage.width / Math.max(1, viewport.offsetWidth), width = toolbar.offsetWidth;
      const center = ((picture.left + picture.right) / 2 - stage.left) / unit;
      toolbar.style.left = `${Math.max(8, Math.min(center - width / 2, viewport.clientWidth - width - 8))}px`;
      // Flora's title is outside the media surface. Anchor above the title,
      // using its painted geometry so the gap stays correct at any zoom.
      const label = selectedNode.querySelector(':scope > .flora-node-label');
      const labelRect = label?.getBoundingClientRect();
      const anchorTop = labelRect?.height ? labelRect.top : picture.top;
      const unitY = stage.height / Math.max(1, viewport.offsetHeight);
      toolbar.style.top = `${Math.max(8, (anchorTop - stage.top) / unitY - toolbar.offsetHeight - 12)}px`;
    }
    function show(image) {
      const node = image?.closest(".canvas-node");
      if (!node || !image.getAttribute("data-original-src")) return;
      hide();
      if (!node.classList.contains("is-selected")) selectNode(node);
      if (getSelectedNodes().length !== 1) return;
      selectedImage = image; selectedNode = node;
      onSelectImage?.(node, image);
      image.classList.add("is-image-action-selected");
      actionBar.setActionHidden("replace", !image.closest(".canvas-image-upload"));
      actionBar.setActionHidden("crop", !(
        node.classList.contains("canvas-node-image")
        || node.classList.contains("canvas-node-gallery-container")
      ) || typeof onCrop !== "function");
      refresh();
    }
    const findImage = (target) => target.closest?.("img[data-canvas-original-src]")
      || target.closest?.(".canvas-gallery-member, .canvas-image-upload, .canvas-node-result")?.querySelector("img[data-canvas-original-src]");
    let pointerStart = null;
    viewport.addEventListener("pointerdown", (event) => {
      pointerStart = { x: event.clientX, y: event.clientY };
      if (!toolbar.contains(event.target) && !findImage(event.target)) hide();
    }, true);
    viewport.addEventListener("click", (event) => {
      if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) return;
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.target.closest("button:not(.canvas-gallery-member-preview), a")) return;
      const image = findImage(event.target);
      if (image) show(image);
    }, true);
    viewport.addEventListener("dblclick", (event) => {
      const image = findImage(event.target);
      if (!image || event.target.closest("button:not(.canvas-gallery-member-preview), a")) return;
      event.preventDefault(); event.stopImmediatePropagation(); show(image);
      onPreview(image.closest(".canvas-node"), image);
    }, true);
    root.addEventListener("canvas:selectionchange", refresh);
    root.addEventListener("resize", refresh);
    return { refresh, hide, show };
  }
  root.CanvasImageToolbar = { create };
})(window);
