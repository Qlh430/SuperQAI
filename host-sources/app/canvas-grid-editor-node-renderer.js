(function initCanvasGridEditorNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGridEditorNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGridEditorNodeRenderer() {
  "use strict";

  function render(node, stateValue, context = {}) {
    const document = context.document || globalThis.document;
    const {
      GridSlicingRules,
      appendCanvasGridEditorBands,
      canvasGridEditorWheelTimers,
      clearCanvasGridEditor,
      createCanvasGridEditorTrackTemplate,
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      createDeferredThumbnail,
      getCanvasGridEditorRegions,
      getCanvasGridEditorState,
      normalizeCanvasGridEditorState,
      outputCanvasGridEditorGallery,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      setCanvasGridEditorBandGap,
      setCanvasGridEditorCellZoom,
      setCanvasGridEditorCollapsed,
      setCanvasGridEditorState,
      setCanvasGridEditorUniformGap,
      setCanvasStatus,
      startCanvasGridEditorBandDrag,
      startCanvasGridEditorCellPan,
      toggleCanvasGridEditorPopover,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle
      || !normalizeCanvasGridEditorState || !getCanvasGridEditorState
      || !setCanvasGridEditorState || !getCanvasGridEditorRegions
      || !createCanvasGridEditorTrackTemplate || !appendCanvasGridEditorBands
      || !startCanvasGridEditorBandDrag || !startCanvasGridEditorCellPan
      || !setCanvasGridEditorCellZoom || !toggleCanvasGridEditorPopover
      || !clearCanvasGridEditor || !createDeferredThumbnail || !GridSlicingRules) {
      throw new Error("Canvas grid editor node renderer context is incomplete.");
    }

    const state = normalizeCanvasGridEditorState(stateValue || getCanvasGridEditorState(node));
    node.innerHTML = "";
    node.dataset.gridEditorState = JSON.stringify(state);
    node.classList.remove("canvas-node-frameless");
    node.classList.toggle("is-grid-editing", state.editing);
    node.classList.toggle("is-grid-collapsed", state.collapsed);
    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar("宫格编辑");
    const shell = document.createElement("div");
    shell.className = "canvas-grid-editor-shell";
    const toolbar = document.createElement("div");
    toolbar.className = "canvas-grid-editor-toolbar";
    toolbar.innerHTML = `
      <button type="button" class="canvas-grid-editor-aspect">比例 ${state.aspect === "match" ? "匹配" : state.aspect}</button>
      <button type="button" class="canvas-grid-editor-grid">网格 ${state.rows}×${state.columns}</button>
      <button type="button" class="canvas-grid-editor-edit" aria-pressed="${state.editing}">${state.editing ? "完成编辑" : "编辑"}</button>
      <button type="button" class="canvas-grid-editor-output">输出图集</button>
      <button type="button" class="canvas-grid-editor-clear">清空</button>
      <button type="button" class="canvas-grid-editor-collapse" aria-expanded="${!state.collapsed}">${state.collapsed ? "展开" : "折叠"}</button>
    `;
    const body = document.createElement("div");
    body.className = "canvas-grid-editor-body";
    body.hidden = state.collapsed;
    const editControls = document.createElement("div");
    editControls.className = "canvas-grid-editor-edit-controls";
    editControls.hidden = !state.editing || !state.sourceSrc;
    const selectedBand = state.selectedBand
      ? (state.selectedBand.axis === "vertical" ? state.verticalBands : state.horizontalBands)
        .find((band) => band.id === state.selectedBand.id)
      : null;
    const selectedTransform = state.cellTransforms.find((item) => item.key === state.selectedCellKey);
    editControls.innerHTML = `
      <label><span>统一间隔</span><input class="canvas-grid-editor-uniform-gap" type="number" min="0" step="2" value="${state.uniformGap}"><em>px</em></label>
      <label><span>选中线</span><input class="canvas-grid-editor-band-gap" type="number" min="0" step="2" value="${selectedBand ? selectedBand.end - selectedBand.start : 0}" ${selectedBand ? "" : "disabled"}><em>px</em></label>
      <label class="canvas-grid-editor-zoom-control"><span>选中格缩放</span><input class="canvas-grid-editor-zoom" type="range" min="1" max="8" step="0.05" value="${selectedTransform?.zoom || 1}"><output>${(selectedTransform?.zoom || 1).toFixed(2)}×</output></label>
    `;
    const preview = document.createElement("div");
    preview.className = "canvas-grid-editor-preview";
    const cells = document.createElement("div");
    cells.className = "canvas-grid-editor-cells";
    const bandLayer = document.createElement("div");
    bandLayer.className = "canvas-grid-editor-band-layer";
    bandLayer.hidden = !state.editing;
    const status = document.createElement("div");
    status.className = "canvas-grid-editor-status";
    status.setAttribute("aria-live", "polite");
    if (!state.sourceSrc) {
      const empty = document.createElement("div");
      empty.className = "canvas-grid-editor-empty";
      empty.textContent = "来源图片已清空";
      cells.append(empty);
      status.textContent = "重新创建宫格节点可继续编辑。";
    } else {
      const regions = getCanvasGridEditorRegions(state);
      const transforms = new Map(state.cellTransforms.map((transform) => [transform.key, transform]));
      const ratio = GridSlicingRules.resolveAspectRatio(state.aspect, {
        width: state.sourceWidth,
        height: state.sourceHeight,
        rows: state.rows,
        columns: state.columns,
      });
      cells.style.aspectRatio = `${state.sourceWidth} / ${state.sourceHeight}`;
      cells.style.gridTemplateColumns = createCanvasGridEditorTrackTemplate(regions, state.verticalBands, "vertical");
      cells.style.gridTemplateRows = createCanvasGridEditorTrackTemplate(regions, state.horizontalBands, "horizontal");
      regions.forEach((region, index) => {
        const crop = GridSlicingRules.getCellCrop(region, ratio, transforms.get(region.key));
        const cell = document.createElement("div");
        cell.className = "canvas-grid-editor-cell";
        cell.classList.toggle("is-selected", state.selectedCellKey === region.key);
        cell.dataset.cellKey = region.key;
        cell.dataset.crop = JSON.stringify({
          x: crop.x,
          y: crop.y,
          width: crop.width,
          height: crop.height,
          ratio,
        });
        cell.style.gridColumn = String((region.column - 1) * 2 + 1);
        cell.style.gridRow = String((region.row - 1) * 2 + 1);
        const frame = document.createElement("div");
        frame.className = "canvas-grid-editor-cell-frame";
        frame.tabIndex = 0;
        frame.dataset.cellKey = region.key;
        const regionRatio = region.width / region.height;
        if (ratio >= regionRatio) {
          frame.style.width = "100%";
          frame.style.height = `${Math.min(100, (region.width / ratio / region.height) * 100)}%`;
        } else {
          frame.style.height = "100%";
          frame.style.width = `${Math.min(100, (region.height * ratio / region.width) * 100)}%`;
        }
        const image = createDeferredThumbnail(
          state.sourceSrc,
          `${state.sourceName} 第 ${region.row} 行第 ${region.column} 列`,
        );
        image.draggable = false;
        image.style.width = `${(state.sourceWidth / crop.width) * 100}%`;
        image.style.height = `${(state.sourceHeight / crop.height) * 100}%`;
        image.style.left = `${-(crop.x / crop.width) * 100}%`;
        image.style.top = `${-(crop.y / crop.height) * 100}%`;
        const label = document.createElement("span");
        label.textContent = String(index + 1);
        frame.append(image, label);
        cell.append(frame);
        frame.addEventListener("pointerdown", (event) => startCanvasGridEditorCellPan(event, node, region.key));
        frame.addEventListener("click", (event) => {
          event.stopPropagation();
          const latest = getCanvasGridEditorState(node);
          if (latest.selectedCellKey === region.key) return;
          setCanvasGridEditorState(node, { ...latest, selectedCellKey: region.key });
        });
        frame.addEventListener("wheel", (event) => {
          if (!getCanvasGridEditorState(node).editing) return;
          event.preventDefault();
          event.stopPropagation();
          const current = getCanvasGridEditorState(node).cellTransforms.find((item) => item.key === region.key);
          const delta = event.deltaY < 0 ? 0.05 : -0.05;
          setCanvasGridEditorCellZoom(node, region.key, (current?.zoom || 1) + delta, { save: false });
          clearTimeout(canvasGridEditorWheelTimers?.get(node.dataset.id));
          canvasGridEditorWheelTimers?.set(node.dataset.id, setTimeout(() => {
            canvasGridEditorWheelTimers.delete(node.dataset.id);
            scheduleCanvasSave?.();
          }, 260));
        }, { passive: false });
        cells.append(cell);
      });
      appendCanvasGridEditorBands(bandLayer, state, "vertical", state.verticalBands);
      appendCanvasGridEditorBands(bandLayer, state, "horizontal", state.horizontalBands);
      status.textContent = `${state.rows * state.columns} 格 · ${state.sourceWidth} × ${state.sourceHeight}px 来源快照`;
    }
    preview.append(cells, bandLayer);
    body.append(editControls, preview, status);
    shell.append(toolbar, body);
    node.append(inputPort, outputPort, bar, shell, createCanvasResizeHandle());
    toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
    editControls.addEventListener("pointerdown", (event) => event.stopPropagation());
    toolbar.querySelector(".canvas-grid-editor-aspect")?.addEventListener("click", (event) => {
      toggleCanvasGridEditorPopover(node, "aspect", event.currentTarget);
    });
    toolbar.querySelector(".canvas-grid-editor-grid")?.addEventListener("click", (event) => {
      toggleCanvasGridEditorPopover(node, "grid", event.currentTarget);
    });
    toolbar.querySelector(".canvas-grid-editor-edit")?.addEventListener("click", () => {
      const latest = getCanvasGridEditorState(node);
      setCanvasGridEditorState(node, { ...latest, editing: !latest.editing, collapsed: false });
    });
    toolbar.querySelector(".canvas-grid-editor-output")?.addEventListener("click", () => {
      if (typeof outputCanvasGridEditorGallery === "function") outputCanvasGridEditorGallery(node);
      else setCanvasStatus?.("宫格输出功能尚未就绪。");
    });
    toolbar.querySelector(".canvas-grid-editor-clear")?.addEventListener("click", () => clearCanvasGridEditor(node));
    toolbar.querySelector(".canvas-grid-editor-collapse")?.addEventListener("click", () => {
      setCanvasGridEditorCollapsed?.(node, !getCanvasGridEditorState(node).collapsed);
    });
    editControls.querySelector(".canvas-grid-editor-uniform-gap")?.addEventListener("change", (event) => {
      setCanvasGridEditorUniformGap?.(node, event.target.value);
    });
    editControls.querySelector(".canvas-grid-editor-band-gap")?.addEventListener("change", (event) => {
      const latest = getCanvasGridEditorState(node);
      if (latest.selectedBand) {
        setCanvasGridEditorBandGap?.(node, latest.selectedBand.axis, latest.selectedBand.id, event.target.value);
      }
    });
    editControls.querySelector(".canvas-grid-editor-zoom")?.addEventListener("input", (event) => {
      const latest = getCanvasGridEditorState(node);
      setCanvasGridEditorCellZoom(node, latest.selectedCellKey, event.target.value, { save: false });
    });
    editControls.querySelector(".canvas-grid-editor-zoom")?.addEventListener("change", () => scheduleCanvasSave?.());
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
