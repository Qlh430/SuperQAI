(function initializeCanvasImageToolbar(root) {
  function create({ viewport, getSelectedNodes, selectNode, onSelectImage, onPreview, onDownload, onDelete, onReplace, onCrop, onError }) {
    const toolbar = document.createElement("div");
    toolbar.className = "canvas-image-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "图片操作");
    toolbar.hidden = true;
    let selectedImage = null, selectedNode = null;
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
      toolbar.style.top = `${Math.max(8, (picture.top - stage.top) / unit - toolbar.offsetHeight - 10)}px`;
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
      toolbar.querySelector('[data-image-action="replace"]').hidden = !image.closest(".canvas-image-upload");
      toolbar.querySelector('[data-image-action="crop"]').hidden = !(
        node.classList.contains("canvas-node-image")
        || node.classList.contains("canvas-node-gallery-container")
      ) || typeof onCrop !== "function";
      refresh();
    }
    for (const [action, label, icon, handler] of [
      ["preview", "放大查看原图", "maximize", onPreview],
      ["crop", "裁剪图片", "crop", onCrop],
      ["download", "下载原图", "download", onDownload],
      ["replace", "替换图片", "image-plus", onReplace],
      ["delete", "从画布删除图片", "trash-2", onDelete],
    ]) {
      const button = document.createElement("button");
      button.type = "button"; button.dataset.imageAction = action; button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<i data-lucide="${icon}"></i>`;
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!selectedImage || !selectedNode) return;
        const image = selectedImage, node = selectedNode;
        button.disabled = true;
        try { await handler(node, image); }
        catch (error) { onError?.(error); }
        finally { button.disabled = false; refresh(); }
      });
      toolbar.append(button);
    }
    toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
    toolbar.addEventListener("dblclick", (event) => event.stopPropagation());
    viewport.append(toolbar);
    root.lucide?.createIcons({ root: toolbar, attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
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
