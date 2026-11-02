(function initCanvasDirector3dNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasDirector3dNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasDirector3dNodeRenderer() {
  "use strict";

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      canvasDirector3dCore,
      canvasDirector3dSceneName,
      cardWidth,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      openCanvasDirector3dWorkbench,
      readCanvasDirector3dProject,
      scheduleCanvasConnectionRender,
      selectCanvasNode,
      updateCanvasNodeRefs,
      writeCanvasDirector3dProject,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas 3D director node renderer context is incomplete.");
    }

    const core = canvasDirector3dCore?.();
    const previousProject = readCanvasDirector3dProject?.(node);
    const project = options.project || previousProject || (core ? core.createProject() : null);
    const previewSrc = options.previewSrc !== undefined
      ? String(options.previewSrc || "")
      : String(node.dataset.directorPreviewSrc || "");

    node.innerHTML = "";
    node.dataset.canvasNodeType = "director3d";
    if (project) {
      writeCanvasDirector3dProject?.(node, project);
      node.dataset.directorSceneName = String(project.name || "3D 导演台");
    }
    if (options.previewSrc !== undefined) node.dataset.directorPreviewSrc = previewSrc;
    if (!node.dataset.width) node.dataset.width = String(cardWidth || 350);

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar("3D 导演台");

    const card = document.createElement("div");
    card.className = "canvas-director-card";
    const cover = document.createElement("div");
    cover.className = "canvas-director-cover";
    const storedPreview = String(node.dataset.directorPreviewSrc || "");
    if (storedPreview) {
      const image = document.createElement("img");
      image.className = "canvas-director-cover-img";
      image.src = storedPreview;
      image.alt = `${canvasDirector3dSceneName?.(node) || "3D 导演台"} 预览`;
      image.loading = "lazy";
      image.decoding = "async";
      cover.append(image);
    } else {
      const empty = document.createElement("div");
      empty.className = "canvas-director-empty";
      const glyph = document.createElement("i");
      glyph.setAttribute("data-lucide", "box");
      glyph.setAttribute("aria-hidden", "true");
      const title = document.createElement("strong");
      title.textContent = "3D 导演台";
      const hint = document.createElement("span");
      hint.textContent = "在三维空间里搭场景、摆机位、出画面。";
      empty.append(glyph, title, hint);
      cover.append(empty);
    }
    const actions = document.createElement("div");
    actions.className = "canvas-director-actions";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "canvas-director-open";
    openButton.textContent = storedPreview ? "打开这个场景" : "打开导演台";
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectCanvasNode?.(node);
      openCanvasDirector3dWorkbench?.(node);
    });
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "canvas-director-open";
    exportButton.textContent = "导出画面";
    exportButton.title = "把当前机位画面导出成画布上的图片节点";
    exportButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectCanvasNode?.(node);
      openCanvasDirector3dWorkbench?.(node, { exportOnOpen: true });
    });
    actions.append(openButton, exportButton);
    card.append(cover, actions);

    node.append(inputPort, outputPort, bar, card, createCanvasResizeHandle());
    updateCanvasNodeRefs?.(node);
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
