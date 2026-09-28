(function initCanvasDirector3dUi(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasDirector3dUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasDirector3dUi(root) {
  "use strict";

  function resolveThree() {
    if (root && root.CanvasDirector3dThree) return root.CanvasDirector3dThree;
    return null;
  }
  function resolveCore() {
    if (root && root.CanvasDirector3d) return root.CanvasDirector3d;
    if (typeof require === "function") {
      try {
        return require("./canvas-director3d.js");
      } catch {
        return null;
      }
    }
    return null;
  }

  const PRESET_STORAGE_KEY = "director3d-presets:v1";
  const TIMELINE_STORAGE_KEY = "director3d-timeline-height";
  const DEFAULT_TIMELINE_HEIGHT = 132;
  const MIN_TIMELINE_HEIGHT = 108;
  const MAX_TIMELINE_HEIGHT = 260;
  const STAGE_SKY_TOP = "#1b1f26";
  const STAGE_SKY_BOTTOM = "#101317";
  const EXPORT_WIDTH = 1600;
  const PREVIEW_MAX_WIDTH = 1280;
  // The preview panel is narrow, and rendering a shot at the CSS width of a
  // 230px panel would come out visibly soft. It renders at least this wide and
  // is then displayed scaled down, which costs little and reads as a real shot.
  const PREVIEW_MIN_WIDTH = 640;

  const MODES = [
    { id: "select", label: "选择", hint: "点选对象，拖动空白处旋转视角" },
    { id: "move", label: "移动", hint: "拖动选中对象在地面移动" },
    { id: "rotate", label: "旋转", hint: "左右拖动旋转朝向" },
    { id: "scale", label: "缩放", hint: "上下拖动调整大小" },
  ];

  const ADD_BUTTONS = [
    { kind: "cube", label: "立方体", icon: "box" },
    { kind: "plane", label: "平面", icon: "square" },
    { kind: "board", label: "图片板", icon: "image" },
    { kind: "camera", label: "机位", icon: "video" },
  ];

  /** Kinds the palette still offers as plain buttons, in display order. */
  const PRIMITIVE_KINDS = ADD_BUTTONS.map((entry) => entry.kind);

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconButton(label, icon, action, className) {
    const button = element("button", className || "director-button");
    button.type = "button";
    button.dataset.action = action;
    const badge = element("span", "director-button-icon");
    const glyph = element("i");
    glyph.setAttribute("data-lucide", icon);
    glyph.setAttribute("aria-hidden", "true");
    badge.append(glyph);
    button.append(badge, element("span", "director-button-label", label));
    button.title = label;
    return button;
  }

  function numericField(label, { min, max, step, value, onInput }) {
    const field = element("label", "director-field");
    field.append(element("span", "director-field-label", label));
    const input = document.createElement("input");
    input.type = "number";
    input.className = "director-input";
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    input.step = String(step === undefined ? 0.05 : step);
    input.value = String(Math.round((Number(value) || 0) * 1000) / 1000);
    input.addEventListener("change", () => onInput(Number(input.value)));
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") input.blur();
    });
    field.append(input);
    return field;
  }

  function readStoredPresets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeStoredPresets(presets) {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
      return true;
    } catch {
      return false;
    }
  }

  function readStoredTimelineHeight() {
    const stored = Number(localStorage.getItem(TIMELINE_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0
      ? clamp(stored, MIN_TIMELINE_HEIGHT, MAX_TIMELINE_HEIGHT)
      : DEFAULT_TIMELINE_HEIGHT;
  }

  function storeTimelineHeight(value) {
    try {
      localStorage.setItem(TIMELINE_STORAGE_KEY, String(Math.round(value)));
    } catch {
      /* local storage is optional */
    }
  }

  /**
   * Mounts the full screen 3D stage. The controller owns its own DOM and never
   * writes to the canvas board: saving and exporting are handed back through
   * callbacks so the board keeps a single writer.
   */
  function createDirector3dApp(options = {}) {
    const core = options.core || resolveCore();
    if (!core) throw new Error("缺少 3D 导演台渲染内核。");
    const doc = options.document || document;
    const host = options.host || doc.body;

    const state = {
      project: core.normalizeProject(options.project || core.createProject()),
      previewSrc: String(options.previewSrc || ""),
      time: 0,
      playing: false,
      selectedId: "",
      mode: "select",
      showGrid: true,
      showNames: true,
      showJoints: true,
      jointHoverId: "",
      gizmoDragging: false,
      hiddenIds: [],
      looping: false,
      libraryOpen: true,
      previewFolded: false,
      dirty: false,
      status: "",
    };

    const orbit = {
      yaw: 0.42,
      pitch: 0.24,
      distance: 7.2,
      target: { x: 0, y: 0.95, z: 0 },
      fov: 42,
    };

    let frameHandle = 0;
    let playHandle = 0;
    let lastPlayStamp = 0;
    let drag = null;
    let observer = null;
    let disposed = false;
    let textures = null;
    let toastTimer = 0;

    const dom = buildMarkup();
    host.append(dom.root);
    syncThemeAttribute();
    // The WebGL renderer is optional: if it never loads, or WebGL is missing,
    // the software rasteriser keeps painting the stage exactly as before.
    const threeLayer = resolveThree();
    let stage3d = null;
    let stage3dReady = false;
    let preview3d = null;
    let previewBuffer = null;
    if (threeLayer && typeof threeLayer.createStage3d === "function") {
      try {
        stage3d = threeLayer.createStage3d({
          core,
          canvas: dom.stageCanvas,
          transform: options.transform || null,
          getProject: () => state.project,
          getTime: () => state.time,
          getSelectedId: () => state.selectedId,
          getShowGrid: () => state.showGrid,
          getShowNames: () => state.showNames,
          getHiddenIds: () => state.hiddenIds,
          getView: () => ({ ...stageView(), width: stageRect().width, height: stageRect().height }),
          onModelError: (kind, message) => setStatus(String(kind) + " 模型加载失败：" + message),
          onDragging: (active) => { state.gizmoDragging = Boolean(active); },
          onGizmoChange: () => syncGizmoToProject(),
        });
        stage3d.init().then((ok) => {
          stage3dReady = Boolean(ok);
          if (!stage3dReady) {
            setStatus("三维渲染不可用，已切回轻量渲染：" + (stage3d.error() || "未知原因"));
            scheduleRender();
            return;
          }
          // The camera preview renders the same scene through the shot camera.
          // It draws into its own detached WebGL canvas which is then blitted
          // onto the visible 2D preview canvas: that keeps a real WebGL pass for
          // the picture while the panel element stays a plain 2D canvas, which
          // is what the export and the tests read pixels back from.
          try {
            const buffer = doc.createElement("canvas");
            preview3d = threeLayer.createStage3d({
              core,
              canvas: buffer,
              preserveBuffer: true,
              getProject: () => state.project,
              getTime: () => state.time,
              getSelectedId: () => "",
              getShowGrid: () => false,
              getShowNames: () => false,
              getHiddenIds: () => cameraGizmoIds(),
              getSize: () => {
                const active = cameraView();
                return active ? { width: active.view.width, height: active.view.height } : null;
              },
              getView: () => (cameraView() ? cameraView().view : null),
            });
            previewBuffer = buffer;
          } catch {
            preview3d = null;
            previewBuffer = null;
          }
          if (preview3d) preview3d.init().then(() => scheduleRender());
          renderLibrary();
          // The stage only becomes able to hold handles once WebGL is up, so a
          // selection made while it was still initialising has to be re-bound.
          syncGizmo();
          scheduleRender();
        });
      } catch (error) {
        stage3d = null;
        setStatus("三维渲染不可用，已切回轻量渲染：" + ((error && error.message) || error));
      }
    }
    root.addEventListener("canvas-theme-changed", syncThemeAttribute);
    bindEvents();
    refreshAll();
    // The palette is plain data, so it lists every model immediately; the
    // thumbnails are painted in afterwards as the renderer becomes able to.
    renderLibrary();

    function syncThemeAttribute() {
      const source = doc.getElementById ? doc.getElementById("canvasEditorScreen") : null;
      const theme = source && source.getAttribute("data-canvas-theme");
      const mode = source && source.getAttribute("data-canvas-theme-mode");
      if (theme) dom.root.setAttribute("data-canvas-theme", theme);
      else dom.root.removeAttribute("data-canvas-theme");
      if (mode) dom.root.setAttribute("data-canvas-theme-mode", mode);
      else dom.root.removeAttribute("data-canvas-theme-mode");
    }

    function buildMarkup() {
      const overlay = element("div", "director-overlay");
      overlay.id = "canvasDirector3dOverlay";
      overlay.hidden = true;
      overlay.tabIndex = -1;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "3D 导演台");

      const shell = element("section", "director-shell");
      const topbar = element("header", "director-topbar");

      const back = element("button", "director-back");
      back.type = "button";
      back.dataset.action = "close";
      back.innerHTML = "<span aria-hidden=\"true\">‹</span><span>返回画布</span>";

      const titleGroup = element("div", "director-title");
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "director-name";
      nameInput.maxLength = 60;
      nameInput.autocomplete = "off";
      nameInput.setAttribute("aria-label", "场景名称");
      const meta = element("span", "director-title-meta");
      titleGroup.append(nameInput, meta);

      const settings = element("div", "director-settings");
      const durationField = element("label", "director-field director-field-inline");
      durationField.append(element("span", "director-field-label", "时长"));
      const durationInput = document.createElement("input");
      durationInput.type = "number";
      durationInput.className = "director-input director-duration";
      durationInput.min = "1";
      durationInput.max = "120";
      durationInput.step = "0.5";
      durationField.append(durationInput, element("span", "director-field-suffix", "秒"));
      const aspectField = element("label", "director-field director-field-inline");
      aspectField.append(element("span", "director-field-label", "画幅"));
      const aspectSelect = document.createElement("select");
      aspectSelect.className = "director-input director-aspect";
      core.ASPECT_RATIOS.forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        aspectSelect.append(option);
      });
      aspectField.append(aspectSelect);
      const gridToggle = element("button", "director-chip");
      gridToggle.type = "button";
      gridToggle.dataset.action = "toggle-grid";
      gridToggle.textContent = "网格";
      const nameToggle = element("button", "director-chip");
      nameToggle.type = "button";
      nameToggle.dataset.action = "toggle-names";
      nameToggle.textContent = "名称";
      const jointToggle = element("button", "director-chip");
      jointToggle.type = "button";
      jointToggle.dataset.action = "toggle-joints";
      jointToggle.textContent = "关节";
      jointToggle.title = "显示角色身上的可调关节";
      settings.append(durationField, aspectField, gridToggle, nameToggle, jointToggle);

      const topActions = element("div", "director-actions");
      topActions.append(
        iconButton("预置", "bookmark", "presets", "director-button director-ghost"),
        iconButton("导出单帧", "camera", "export", "director-button director-ghost"),
        iconButton("保存场景", "save", "save", "director-button director-primary"),
      );
      topbar.append(back, titleGroup, settings, topActions);

      const body = element("div", "director-body");
      const leftRail = element("aside", "director-rail director-rail-left");
      const objectsPanel = element("section", "director-panel director-panel-grow");
      const objectsHead = element("header", "director-panel-head");
      objectsHead.append(element("span", "director-panel-title", "对象"));
      const objectCount = element("small", "director-panel-note");
      objectsHead.append(objectCount);
      const library = element("section", "director-library");
      const libraryHead = element("button", "director-library-head");
      libraryHead.type = "button";
      libraryHead.dataset.action = "toggle-library";
      libraryHead.append(element("span", "director-library-caret", "▾"));
      libraryHead.append(element("span", "director-field-label", "模型库"));
      const libraryCount = element("small", "director-panel-note");
      libraryHead.append(libraryCount);
      const libraryBody = element("div", "director-library-body");
      const addGrid = element("div", "director-add-grid");
      ADD_BUTTONS.forEach((entry) => {
        const button = element("button", "director-add");
        button.type = "button";
        button.dataset.addKind = entry.kind;
        const glyph = element("i");
        glyph.setAttribute("data-lucide", entry.icon);
        glyph.setAttribute("aria-hidden", "true");
        button.append(glyph, element("span", undefined, entry.label));
        addGrid.append(button);
      });
      library.append(libraryHead, libraryBody, addGrid);
      const objectList = element("ul", "director-objects");
      objectsPanel.append(objectsHead, library, objectList);

      const lensPanel = element("section", "director-panel");
      const lensHead = element("header", "director-panel-head");
      lensHead.append(element("span", "director-panel-title", "镜头"));
      lensPanel.append(lensHead);
      const shotField = element("label", "director-field");
      shotField.append(element("span", "director-field-label", "机位预设"));
      const shotSelect = document.createElement("select");
      shotSelect.className = "director-input director-shot";
      core.SHOT_PRESETS.forEach((preset) => {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.label;
        shotSelect.append(option);
      });
      shotSelect.value = "front-full";
      shotField.append(shotSelect);
      const shotApply = element("button", "director-button director-ghost director-wide");
      shotApply.type = "button";
      shotApply.dataset.action = "apply-shot";
      shotApply.textContent = "摆好这个机位";
      lensPanel.append(shotField, shotApply);
      const motionField = element("label", "director-field");
      motionField.append(element("span", "director-field-label", "相机动画"));
      const motionSelect = document.createElement("select");
      motionSelect.className = "director-input director-motion";
      core.CAMERA_MOTION_PRESETS.forEach((preset) => {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.label;
        option.title = preset.description || "";
        motionSelect.append(option);
      });
      motionField.append(motionSelect);
      const motionApply = element("button", "director-button director-ghost director-wide");
      motionApply.type = "button";
      motionApply.dataset.action = "apply-motion";
      motionApply.textContent = "生成关键帧";
      const motionNote = element("p", "director-hint");
      lensPanel.append(motionField, motionApply, motionNote);
      leftRail.append(objectsPanel, lensPanel);

      const stage = element("div", "director-stage");
      const stageBackdrop = document.createElement("canvas");
      stageBackdrop.className = "director-stage-backdrop";
      const stageCanvas = document.createElement("canvas");
      stageCanvas.className = "director-stage-canvas";
      stageCanvas.tabIndex = -1;
      const jointLayer = document.createElement("canvas");
      jointLayer.className = "director-joint-layer";
      const hud = element("div", "director-hud");
      const hudTitle = element("strong", "director-hud-title");
      const hudHint = element("span", "director-hud-hint");
      hud.append(hudTitle, hudHint);
      const modeBar = element("div", "director-modes");
      MODES.forEach((entry) => {
        const button = element("button", "director-mode");
        button.type = "button";
        button.dataset.mode = entry.id;
        button.textContent = entry.label;
        modeBar.append(button);
      });
      const stageBadge = element("div", "director-stage-badge");
      stage.append(stageBackdrop, stageCanvas, jointLayer, modeBar, hud, stageBadge);

      const rightRail = element("aside", "director-rail director-rail-right");
      const previewPanel = element("section", "director-panel");
      const previewHead = element("header", "director-panel-head");
      previewHead.append(element("span", "director-panel-title", "相机画面"));
      const previewFold = element("button", "director-mini");
      previewFold.type = "button";
      previewFold.dataset.action = "fold-preview";
      previewFold.textContent = "收起";
      previewHead.append(previewFold);
      const previewShell = element("div", "director-preview");
      const previewCanvas = document.createElement("canvas");
      previewCanvas.className = "director-preview-canvas";
      const previewEmpty = element("p", "director-preview-empty", "先添加一个机位，这里会实时显示机位构图。");
      previewShell.append(previewCanvas, previewEmpty);
      const previewMeta = element("p", "director-preview-meta");
      previewPanel.append(previewHead, previewShell, previewMeta);

      const inspectorPanel = element("section", "director-panel director-panel-grow");
      const inspectorHead = element("header", "director-panel-head");
      inspectorHead.append(element("span", "director-panel-title", "属性"));
      const inspectorNote = element("small", "director-panel-note");
      inspectorHead.append(inspectorNote);
      const inspector = element("div", "director-inspector");
      inspectorPanel.append(inspectorHead, inspector);

      const statusPanel = element("section", "director-panel");
      const statusHead = element("header", "director-panel-head");
      statusHead.append(element("span", "director-panel-title", "状态描述"));
      statusHead.append(element("small", "director-panel-note", "供 AI 使用"));
      const statusText = document.createElement("textarea");
      statusText.className = "director-status";
      statusText.readOnly = true;
      statusText.rows = 4;
      statusPanel.append(statusHead, statusText);
      rightRail.append(previewPanel, inspectorPanel, statusPanel);

      body.append(leftRail, stage, rightRail);

      const timeline = element("footer", "director-timeline");
      const resizeBar = element("div", "director-timeline-resize");
      resizeBar.title = "上下拖动调整时间轴高度";
      const timelineHead = element("div", "director-timeline-head");
      const playButton = element("button", "director-button director-ghost");
      playButton.type = "button";
      playButton.dataset.action = "play";
      playButton.textContent = "播放";
      const timeLabel = element("strong", "director-time");
      const keyButton = element("button", "director-button director-ghost");
      keyButton.type = "button";
      keyButton.dataset.action = "key";
      keyButton.textContent = "记录关键帧";
      const clearButton = element("button", "director-button director-ghost");
      clearButton.type = "button";
      clearButton.dataset.action = "clear-keys";
      clearButton.textContent = "清除轨道";
      const timelineHint = element("span", "director-timeline-hint", "拖动播放头预览，双击关键帧删除");
      timelineHead.append(playButton, timeLabel, keyButton, clearButton, timelineHint);
      const track = element("div", "director-track");
      const playhead = document.createElement("input");
      playhead.type = "range";
      playhead.className = "director-playhead";
      playhead.min = "0";
      playhead.step = "0.05";
      const keyDots = element("div", "director-key-dots");
      track.append(playhead, keyDots);
      timeline.append(resizeBar, timelineHead, track);

      const presets = element("div", "director-presets");
      presets.hidden = true;
      presets.setAttribute("role", "dialog");
      presets.setAttribute("aria-label", "导演台预置");
      const presetsHead = element("header", "director-presets-head");
      presetsHead.append(element("strong", undefined, "场景预置"));
      const presetsClose = element("button", "director-mini");
      presetsClose.type = "button";
      presetsClose.dataset.action = "close-presets";
      presetsClose.textContent = "关闭";
      presetsHead.append(presetsClose);
      const presetsSave = element("div", "director-presets-save");
      const presetInput = document.createElement("input");
      presetInput.type = "text";
      presetInput.className = "director-input director-preset-name";
      presetInput.placeholder = "预置名称";
      presetInput.maxLength = 40;
      const presetSave = element("button", "director-button director-primary");
      presetSave.type = "button";
      presetSave.dataset.action = "save-preset";
      presetSave.textContent = "保存当前场景";
      presetsSave.append(presetInput, presetSave);
      const presetList = element("ul", "director-preset-list");
      const presetNote = element("p", "director-hint");
      presets.append(presetsHead, presetsSave, presetList, presetNote);

      const toast = element("p", "director-toast");
      toast.setAttribute("role", "status");
      toast.hidden = true;

      shell.append(topbar, body, timeline, presets, toast);
      overlay.append(shell);
      return {
        root: overlay,
        shell,
        back,
        nameInput,
        meta,
        durationInput,
        aspectSelect,
        gridToggle,
        nameToggle,
        jointToggle,
        objectCount,
        library,
        libraryHead,
        libraryCount,
        libraryBody,
        addGrid,
        objectList,
        shotSelect,
        shotApply,
        motionSelect,
        motionApply,
        motionNote,
        stage,
        stageBackdrop,
        stageCanvas,
        jointLayer,
        modeBar,
        hud,
        hudTitle,
        hudHint,
        stageBadge,
        previewHead,
        previewFold,
        previewShell,
        previewCanvas,
        previewEmpty,
        previewMeta,
        inspector,
        inspectorNote,
        statusText,
        timeline,
        resizeBar,
        playButton,
        timeLabel,
        keyButton,
        clearButton,
        playhead,
        keyDots,
        presets,
        presetInput,
        presetList,
        presetNote,
        toast,
      };
    }

    /* -------------------------------------------------------------- events */

    function bindEvents() {
      ["pointerdown", "contextmenu"].forEach((type) => {
        dom.root.addEventListener(type, (event) => event.stopPropagation());
      });
      dom.root.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
      dom.root.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (!dom.presets.hidden) {
            dom.presets.hidden = true;
            return;
          }
          close();
          return;
        }
        handleShortcut(event);
      });
      dom.root.addEventListener("click", (event) => {
        const addKind = event.target.closest("[data-add-kind]");
        const modelKind = event.target.closest("[data-model-kind]");
        const mode = event.target.closest("[data-mode]");
        const preset = event.target.closest("[data-preset-name]");
        const action = event.target.closest("[data-action]");
        if (modelKind) {
          addObject(modelKind.dataset.modelKind);
          return;
        }
        if (addKind) {
          addObject(addKind.dataset.addKind);
          return;
        }
        if (mode) {
          setMode(mode.dataset.mode);
          return;
        }
        if (preset) {
          applyPreset(preset.dataset.presetName);
          return;
        }
        if (action) runAction(action.dataset.action);
      });
      dom.nameInput.addEventListener("input", () => {
        state.project.name = String(dom.nameInput.value || "").trim() || "未命名场景";
        markDirty();
        refreshStatusText();
      });
      dom.durationInput.addEventListener("change", () => {
        state.project.duration = clamp(Number(dom.durationInput.value) || 10, 1, 120);
        state.time = clamp(state.time, 0, state.project.duration);
        markDirty();
        refreshAll();
      });
      dom.aspectSelect.addEventListener("change", () => {
        state.project.aspectRatio = dom.aspectSelect.value;
        markDirty();
        refreshAll();
      });
      dom.playhead.addEventListener("input", () => setTime(Number(dom.playhead.value)));
      dom.motionSelect.addEventListener("change", () => {
        const preset = core.CAMERA_MOTION_PRESETS.find((entry) => entry.id === dom.motionSelect.value);
        dom.motionNote.textContent = preset ? preset.description : "";
        scheduleRender();
      });
      dom.presetInput.addEventListener("keydown", (event) => event.stopPropagation());
      dom.objectList.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-id]");
        if (remove) {
          removeObject(remove.dataset.removeId);
          return;
        }
        const row = event.target.closest("[data-object-id]");
        if (row) selectObject(row.dataset.objectId);
      });
      dom.objectList.addEventListener("dblclick", (event) => {
        const row = event.target.closest("[data-object-id]");
        if (!row) return;
        const item = core.findItem(state.project, row.dataset.objectId);
        if (item) focusItem(item);
      });
      dom.keyDots.addEventListener("click", (event) => {
        const dot = event.target.closest("[data-keyframe-id]");
        if (!dot) return;
        const keyframe = state.project.keyframes.find((entry) => entry.id === dot.dataset.keyframeId);
        if (!keyframe) return;
        setTime(keyframe.time);
        if (keyframe.itemId) {
          state.selectedId = keyframe.itemId;
          refreshObjectList();
          refreshInspector();
        }
      });
      dom.keyDots.addEventListener("dblclick", (event) => {
        const dot = event.target.closest("[data-keyframe-id]");
        if (!dot) return;
        core.removeKeyframe(state.project, dot.dataset.keyframeId);
        markDirty();
        refreshAll();
        setStatus("已删除该关键帧。");
      });
      bindStage();
      bindTimelineResize();
      if (typeof window !== "undefined") window.addEventListener("resize", scheduleRender);
    }

    /** Picks through the live renderer when it is up, else through the data. */
    function pickAt(point) {
      if (stage3dReady && stage3d && typeof stage3d.pick === "function") {
        const hit = stage3d.pick(stageView(), point);
        if (hit) return hit;
      }
      return core.pickItem(state.project, state.time, stageView(), point);
    }

    /** Ground point under the pointer through the live renderer, else the data. */
    function groundAt(point) {
      if (stage3dReady && stage3d && typeof stage3d.groundPoint === "function") {
        const hit = stage3d.groundPoint(stageView(), point);
        if (hit) return hit;
      }
      return core.pointerGroundPoint(stageView(), point, 0);
    }

    function bindStage() {
      const canvas = dom.stageCanvas;
      canvas.addEventListener("pointerdown", (event) => {
        canvas.setPointerCapture(event.pointerId);
        canvas.focus();
        const point = localPoint(canvas, event);
        const panning = event.button === 1 || event.button === 2 || event.shiftKey;
        // Both the transform handles and the joint dots are live at once, so
        // the joint is claimed first: its 12 px radius sits inside the much
        // larger arrow hit area, and a bone is the more specific target.
        const joint = !panning && event.button === 0 ? jointAt(point) : null;
        // Otherwise the transform gizmo owns the press when the pointer is on
        // one of its handles; starting an orbit here would drag the camera out
        // from under the handle the user just grabbed.
        const onGizmo = !panning && event.button === 0 && !joint
          && typeof stage3d?.gizmoAxis === "function" && stage3d.gizmoAxis();
        if (onGizmo) {
          drag = { kind: "gizmo" };
          event.preventDefault();
          return;
        }
        const item = pickAt(point);
        if (panning) {
          drag = { kind: "pan", x: event.clientX, y: event.clientY };
        } else if (joint && item && core.isModelItem(item)) {
          drag = {
            kind: "joint",
            itemId: item.id,
            boneId: joint.id,
            axis: joint.axis || "x",
            min: Number(joint.min),
            max: Number(joint.max),
            startX: event.clientX,
            startY: event.clientY,
            base: Number((item.joints && item.joints[joint.id] && item.joints[joint.id][joint.axis]) || 0),
          };
          setStatus(`正在调整 ${joint.label}。`);
        } else if (item) {
          selectObject(item.id);
          drag = state.mode === "select"
            ? { kind: "none" }
            : { kind: "edit", itemId: item.id, x: event.clientX, y: event.clientY, point, view: stageView() };
        } else if (event.button === 0) {
          drag = { kind: "orbit", x: event.clientX, y: event.clientY };
        } else {
          drag = { kind: "pan", x: event.clientX, y: event.clientY };
        }
        event.preventDefault();
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!drag) {
          const point = localPoint(canvas, event);
          const joint = jointAt(point);
          const nextHover = joint ? joint.id : "";
          if (nextHover !== state.jointHoverId) {
            state.jointHoverId = nextHover;
            scheduleRender();
          }
          // Mirrors the press order: the joint dot's cursor wins where the two
          // overlap, so the pointer promises what the click will actually do.
          const onGizmo = typeof stage3d?.gizmoAxis === "function" && stage3d.gizmoAxis();
          if (joint) canvas.style.cursor = "grab";
          else if (onGizmo) canvas.style.cursor = "pointer";
          else canvas.style.cursor = pickAt(point) ? "pointer" : state.mode === "select" ? "grab" : "crosshair";
          return;
        }
        if (drag.kind === "gizmo") return;
        if (drag.kind === "joint") {
          applyJointEdit(event);
          return;
        }
        if (drag.kind === "orbit") {
          orbit.yaw -= (event.clientX - drag.x) * 0.008;
          orbit.pitch = clamp(orbit.pitch + (event.clientY - drag.y) * 0.006, -1.35, 1.35);
          drag.x = event.clientX;
          drag.y = event.clientY;
          scheduleRender();
          return;
        }
        if (drag.kind === "pan") {
          const basis = stageBasis();
          const scale = orbit.distance / 420;
          const dx = (drag.x - event.clientX) * scale;
          const dy = (event.clientY - drag.y) * scale;
          orbit.target = {
            x: orbit.target.x + basis.right.x * dx + basis.up.x * dy,
            y: clamp(orbit.target.y + basis.right.y * dx + basis.up.y * dy, 0.05, 12),
            z: orbit.target.z + basis.right.z * dx + basis.up.z * dy,
          };
          drag.x = event.clientX;
          drag.y = event.clientY;
          scheduleRender();
          return;
        }
        if (drag.kind === "edit") applyStageEdit(event);
      });
      ["pointerup", "pointercancel"].forEach((type) => {
        canvas.addEventListener(type, () => {
          if (drag && drag.kind === "edit") {
            markDirty();
            refreshObjectList();
            refreshInspector();
            setStatus("已更新对象变换。");
          }
          if (drag && drag.kind === "joint") {
            markDirty();
            refreshInspector();
            setStatus("已更新关节角度。");
          }
          if (drag && drag.kind === "gizmo") {
            syncGizmoToProject();
            refreshObjectList();
            refreshInspector();
            setStatus("已更新对象变换。");
          }
          drag = null;
          scheduleRender();
        });
      });
      canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        orbit.distance = clamp(orbit.distance * (1 + Math.sign(event.deltaY) * 0.12), 0.8, 48);
        scheduleRender();
      }, { passive: false });
      canvas.addEventListener("dblclick", (event) => {
        const item = pickAt(localPoint(canvas, event));
        if (item) focusItem(item);
      });
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    function bindTimelineResize() {
      dom.resizeBar.addEventListener("pointerdown", (event) => {
        dom.resizeBar.setPointerCapture(event.pointerId);
        const startY = event.clientY;
        const startHeight = dom.timeline.getBoundingClientRect().height || DEFAULT_TIMELINE_HEIGHT;
        const move = (moveEvent) => {
          const next = clamp(startHeight - (moveEvent.clientY - startY), MIN_TIMELINE_HEIGHT, MAX_TIMELINE_HEIGHT);
          dom.timeline.style.height = `${next}px`;
          storeTimelineHeight(next);
          scheduleRender();
        };
        const finish = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        event.preventDefault();
      });
    }

    /**
     * Drags one bone.
     *
     * The horizontal travel swings the joint and the vertical travel trims it,
     * so a limb reads the same whichever way the user pulls. Angles are clamped
     * to the joint's anatomical range before they reach the project, which is
     * what keeps a knee from bending backwards.
     */
    function applyJointEdit(event) {
      const item = core.findItem(state.project, drag.itemId);
      if (!item) return;
      const joint = core.JOINT_CONTROLS.find((entry) => entry.id === drag.boneId);
      if (!joint) return;
      const axis = drag.axis || joint.axis || "x";
      const delta = (event.clientX - drag.startX) * 0.5 - (event.clientY - drag.startY) * 0.25;
      const minimum = Number.isFinite(drag.min) ? drag.min : (joint.min === undefined ? -180 : joint.min);
      const maximum = Number.isFinite(drag.max) ? drag.max : (joint.max === undefined ? 180 : joint.max);
      const value = Math.round(clamp(drag.base + delta, minimum, maximum) * 10) / 10;
      const joints = { ...(item.joints || {}) };
      joints[drag.boneId] = { ...(joints[drag.boneId] || {}), [axis]: value };
      item.joints = core.normalizeJoints(joints);
      state.jointHoverId = drag.boneId;
      scheduleRender();
    }

    function applyStageEdit(event) {
      const item = core.findItem(state.project, drag.itemId);
      if (!item) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (state.mode === "move") {
        const from = groundAt(drag.point);
        const to = groundAt(localPoint(dom.stageCanvas, event));
        if (from && to) {
          item.position = [
            round3(item.position[0] + (to.x - from.x)),
            item.position[1],
            round3(item.position[2] + (to.z - from.z)),
          ];
        }
      } else if (state.mode === "rotate") {
        item.rotation = [item.rotation[0], round4(item.rotation[1] - dx * 0.01), item.rotation[2]];
      } else if (state.mode === "scale") {
        if (!drag.baseScale) drag.baseScale = [...item.scale];
        const factor = clamp(1 - dy * 0.005, 0.2, 4);
        item.scale = [
          clamp(drag.baseScale[0] * factor, 0.1, 6),
          clamp(drag.baseScale[1] * factor, 0.1, 6),
          clamp(drag.baseScale[2] * factor, 0.1, 6),
        ];
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.point = localPoint(dom.stageCanvas, event);
      refreshInspector();
      scheduleRender();
    }

    function handleShortcut(event) {
      const tag = String(event.target && event.target.tagName ? event.target.tagName : "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
        return;
      }
      const lower = String(event.key || "").toLowerCase();
      if (lower === "e") setMode("move");
      else if (lower === "r") setMode("rotate");
      else if (lower === "t") setMode("scale");
      else if (lower === "s") setMode("select");
      else if (lower === "f") {
        const item = core.findItem(state.project, state.selectedId) || core.defaultSubject(state.project);
        if (item) focusItem(item);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setTime(clamp(state.time + (event.key === "ArrowLeft" ? -0.1 : 0.1), 0, state.project.duration));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedId) {
          event.preventDefault();
          removeObject(state.selectedId);
        }
      }
    }

    function round3(value) {
      return Math.round(value * 1000) / 1000;
    }

    function round4(value) {
      return Math.round(value * 10000) / 10000;
    }

    function runAction(action) {
      if (action === "close") close();
      else if (action === "toggle-grid") {
        state.showGrid = !state.showGrid;
        refreshToggles();
        scheduleRender();
      } else if (action === "toggle-names") {
        state.showNames = !state.showNames;
        refreshToggles();
        scheduleRender();
      } else if (action === "toggle-joints") {
        state.showJoints = !state.showJoints;
        if (!state.showJoints) state.jointHoverId = "";
        refreshToggles();
        scheduleRender();
      } else if (action === "toggle-library") {
        state.libraryOpen = !state.libraryOpen;
        refreshLibraryFold();
      } else if (action === "fold-preview") {
        state.previewFolded = !state.previewFolded;
        refreshPreviewFold();
        scheduleRender();
      } else if (action === "apply-shot") applyShot();
      else if (action === "apply-motion") applyMotion();
      else if (action === "play") togglePlay();
      else if (action === "key") recordCurrentKeyframe();
      else if (action === "clear-keys") clearSelectionKeyframes();
      else if (action === "presets") {
        dom.presets.hidden = !dom.presets.hidden;
        if (!dom.presets.hidden) refreshPresets();
      } else if (action === "close-presets") dom.presets.hidden = true;
      else if (action === "save-preset") savePreset();
      else if (action === "save") requestSaveScene();
      else if (action === "export") requestExportFrame();
    }

    /* ---------------------------------------------------------- operations */

    function markDirty() {
      state.dirty = true;
      if (typeof options.onChange === "function") options.onChange();
    }

    function setStatus(message) {
      state.status = String(message || "");
      dom.toast.hidden = !state.status;
      dom.toast.textContent = state.status;
      if (toastTimer) clearTimeout(toastTimer);
      if (state.status) {
        toastTimer = setTimeout(() => {
          dom.toast.hidden = true;
        }, 2800);
      }
      if (typeof options.onStatus === "function") options.onStatus(state.status);
    }

    function setMode(mode) {
      const entry = MODES.find((item) => item.id === mode) || MODES[0];
      state.mode = entry.id;
      dom.hudTitle.textContent = entry.label;
      dom.hudHint.textContent = entry.hint;
      dom.modeBar.querySelectorAll("[data-mode]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.mode === entry.id);
      });
      dom.stageCanvas.style.cursor = entry.id === "select" ? "grab" : "crosshair";
      syncGizmo();
      scheduleRender();
    }

    function setTime(value) {
      state.time = Math.round(clamp(Number(value) || 0, 0, state.project.duration) * 100) / 100;
      refreshTimeline();
      scheduleRender();
    }

    function selectObject(id) {
      const item = core.findItem(state.project, id);
      if (!item) return;
      state.selectedId = item.id;
      const keys = core.keyframesFor(state.project, item.id);
      if (keys.length) setTime(keys[0].time);
      refreshObjectList();
      refreshInspector();
      syncGizmo();
      scheduleRender();
    }

    function addObject(kind) {
      const item = core.addItem(state.project, kind);
      // A new object lands in clear space, not on top of whatever is already in
      // the middle of the stage, so two characters never spawn interpenetrating.
      placeInOpenSpace(item, kind);
      state.selectedId = item.id;
      if (item.kind === "camera") {
        const subject = core.defaultSubject(state.project, "");
        const preset = dom.shotSelect.value || "front-full";
        core.applyShotPreset(state.project, item.id, preset, subject ? subject.id : "", state.time);
      }
      markDirty();
      refreshAll();
      focusItem(item);
      const meta = core.ITEM_KINDS[item.kind] || {};
      setStatus(`已添加${meta.label || "对象"}。`);
    }

    /**
     * Finds clear floor for a new object.
     *
     * Throwing everything at the origin would stack a second character inside
     * the first, so this walks a spiral outwards from the middle and takes the
     * first slot no existing object is standing in. Cameras and flat props are
     * placed by their own rules instead: a camera belongs behind the subject and
     * a plane belongs on the floor under it.
     */
    function placeInOpenSpace(item, kind) {
      if (!item) return;
      const meta = core.ITEM_KINDS[kind] || {};
      if (meta.flat) {
        item.position = [0, 0, 0];
        return;
      }
      if (meta.camera) {
        const subject = core.defaultSubject(state.project, item.id);
        const subjectPosition = subject ? subject.position : [0, 0, 0];
        item.position = [round3(subjectPosition[0]), 1.6, round3(subjectPosition[2] + 5.4)];
        return;
      }
      const occupied = state.project.items.filter((other) => other.id !== item.id && other.kind !== "camera");
      const clearance = 1.7;
      let chosen = null;
      for (let ring = 0; ring <= 4 && !chosen; ring += 1) {
        const slots = ring === 0 ? 1 : ring * 6;
        for (let slot = 0; slot < slots; slot += 1) {
          const angle = (slot / slots) * Math.PI * 2;
          const candidate = [Math.cos(angle) * ring * 2.4, Math.sin(angle) * ring * 2.4];
          const clash = occupied.some((other) => Math.hypot(
            Number(other.position?.[0]) - candidate[0],
            Number(other.position?.[2]) - candidate[1],
          ) < clearance);
          if (!clash) {
            chosen = candidate;
            break;
          }
        }
      }
      const spot = chosen || [0, 0];
      item.position = [round3(spot[0]), item.position[1] || 0, round3(spot[1])];
    }

    function removeObject(id) {
      const item = core.findItem(state.project, id);
      if (!item) return;
      core.removeItem(state.project, id);
      if (state.selectedId === id) state.selectedId = "";
      state.jointHoverId = "";
      if (stage3d && typeof stage3d.detachGizmo === "function") stage3d.detachGizmo();
      markDirty();
      refreshAll();
      setStatus(`已删除${item.name}。`);
    }

    function focusItem(item) {
      const bounds = core.itemBounds(state.project, item, state.time);
      orbit.target = { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z };
      orbit.distance = clamp(Math.max(1.6, bounds.height * 1.6) * 2.4, 1.2, 40);
      state.selectedId = item.id;
      refreshObjectList();
      refreshInspector();
      setStatus(`视角已对准 ${item.name}。`);
      scheduleRender();
    }

    function ensureCamera() {
      const selected = core.findItem(state.project, state.selectedId);
      if (selected && selected.kind === "camera") return selected;
      const existing = state.project.items.find((item) => item.kind === "camera");
      if (existing) {
        state.selectedId = existing.id;
        return existing;
      }
      setStatus("先在左侧添加一个机位。");
      return null;
    }

    function applyShot() {
      const camera = ensureCamera();
      if (!camera) return;
      const subjectId = state.selectedId === camera.id ? "" : state.selectedId;
      const subject = core.defaultSubject(state.project, subjectId);
      const result = core.applyShotPreset(state.project, camera.id, dom.shotSelect.value, subject ? subject.id : "", state.time);
      if (!result) {
        setStatus("还没有可拍摄的主体，先添加角色或道具。");
        return;
      }
      state.selectedId = camera.id;
      markDirty();
      refreshAll();
      const preset = core.SHOT_PRESETS.find((entry) => entry.id === dom.shotSelect.value);
      setStatus(`已应用${preset ? preset.label : "机位"}。`);
    }

    function applyMotion() {
      const camera = ensureCamera();
      if (!camera) return;
      const subjectId = state.selectedId === camera.id ? "" : state.selectedId;
      const subject = core.defaultSubject(state.project, subjectId);
      const preset = core.CAMERA_MOTION_PRESETS.find((entry) => entry.id === dom.motionSelect.value);
      const result = core.applyCameraMotionPreset(
        state.project,
        camera.id,
        dom.motionSelect.value,
        subject ? subject.id : "",
        state.time,
      );
      if (!result) {
        setStatus("相机动画生成失败，请先准备主体与机位。");
        return;
      }
      const end = state.time + Number(preset ? preset.duration : 3);
      if (end > state.project.duration) state.project.duration = Math.ceil(end * 2) / 2;
      state.selectedId = camera.id;
      markDirty();
      refreshAll();
      setStatus(`已生成${preset ? preset.label : "相机动画"}关键帧。`);
    }

    function recordCurrentKeyframe() {
      const item = core.findItem(state.project, state.selectedId);
      if (!item) {
        setStatus("先选中一个对象再记录关键帧。");
        return;
      }
      core.recordKeyframe(state.project, item.id, state.time);
      markDirty();
      refreshAll();
      setStatus(`已在 ${state.time.toFixed(1)} 秒记录${item.name}。`);
    }

    function clearSelectionKeyframes() {
      const item = core.findItem(state.project, state.selectedId);
      if (!item) {
        setStatus("先选中一个对象再清除轨道。");
        return;
      }
      core.clearItemKeyframes(state.project, item.id);
      markDirty();
      refreshAll();
      setStatus(`已清除${item.name}的全部关键帧。`);
    }

    function togglePlay() {
      state.playing = !state.playing;
      dom.playButton.textContent = state.playing ? "暂停" : "播放";
      if (state.playing) {
        lastPlayStamp = 0;
        playHandle = requestAnimationFrame(tickPlay);
      } else if (playHandle) {
        cancelAnimationFrame(playHandle);
        playHandle = 0;
      }
    }

    function tickPlay(stamp) {
      if (!state.playing || disposed) return;
      const delta = lastPlayStamp ? (stamp - lastPlayStamp) / 1000 : 0;
      lastPlayStamp = stamp;
      let next = state.time + delta;
      if (next >= state.project.duration) next = 0;
      state.time = Math.round(next * 1000) / 1000;
      refreshTimeline();
      scheduleRender();
      playHandle = requestAnimationFrame(tickPlay);
    }

    /* ------------------------------------------------------------ presets */

    function refreshPresets() {
      const presets = readStoredPresets();
      const names = Object.keys(presets);
      dom.presetList.innerHTML = "";
      dom.presetNote.textContent = names.length
        ? "点击预置即可套用它的对象与机位。"
        : "还没有预置，给当前场景起个名字保存下来吧。";
      names.forEach((name) => {
        const row = element("li", "director-preset-row");
        const load = element("button", "director-preset-load");
        load.type = "button";
        load.dataset.presetName = name;
        load.textContent = name;
        const remove = element("button", "director-mini");
        remove.type = "button";
        remove.dataset.removePreset = name;
        remove.textContent = "删除";
        row.append(load, remove);
        dom.presetList.append(row);
      });
      dom.presetList.querySelectorAll("[data-remove-preset]").forEach((button) => {
        button.addEventListener("click", () => {
          const next = readStoredPresets();
          delete next[button.dataset.removePreset];
          writeStoredPresets(next);
          refreshPresets();
        });
      });
    }

    function savePreset() {
      const name = String(dom.presetInput.value || "").trim();
      if (!name) {
        dom.presetNote.textContent = "请先填写预置名称。";
        return;
      }
      const presets = readStoredPresets();
      presets[name] = core.cloneProject(state.project);
      if (!writeStoredPresets(presets)) {
        dom.presetNote.textContent = "浏览器本地存储不可用，预置没有保存。";
        return;
      }
      dom.presetInput.value = "";
      refreshPresets();
      dom.presetNote.textContent = `已保存预置「${name}」。`;
    }

    function applyPreset(name) {
      const stored = readStoredPresets()[name];
      if (!stored) return;
      state.project = core.normalizeProject(core.cloneProject(stored));
      state.selectedId = "";
      state.time = 0;
      dom.presets.hidden = true;
      markDirty();
      refreshAll();
      setStatus(`已套用预置「${name}」。`);
    }

    /* ------------------------------------------------------------ geometry */

    function stageRect() {
      const rect = dom.stageCanvas.getBoundingClientRect();
      const width = Math.max(240, Math.round(rect.width || dom.stage.clientWidth || 720));
      const height = Math.max(200, Math.round(rect.height || dom.stage.clientHeight || 460));
      return { width, height };
    }

    function localPoint(canvas, event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function subtract(a, b) {
      return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }

    function cross(a, b) {
      return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
      };
    }

    function normalize(vector) {
      const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
      return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
    }

    function stageView() {
      const pitch = clamp(orbit.pitch, -1.35, 1.35);
      const cos = Math.cos(pitch);
      const rect = stageRect();
      return {
        eye: {
          x: orbit.target.x + Math.sin(orbit.yaw) * cos * orbit.distance,
          y: orbit.target.y + Math.sin(pitch) * orbit.distance,
          z: orbit.target.z + Math.cos(orbit.yaw) * cos * orbit.distance,
        },
        target: { x: orbit.target.x, y: orbit.target.y, z: orbit.target.z },
        fov: orbit.fov,
        roll: 0,
        width: rect.width,
        height: rect.height,
      };
    }

    function stageBasis() {
      const view = stageView();
      const forward = normalize(subtract(view.target, view.eye));
      let right = cross(forward, { x: 0, y: 1, z: 0 });
      if (Math.hypot(right.x, right.y, right.z) < 1e-4) right = cross(forward, { x: 0, y: 0, z: 1 });
      right = normalize(right);
      return { forward, right, up: normalize(cross(right, forward)) };
    }

    /* ----------------------------------------------------------- rendering */

    /**
     * Queues a repaint.
     *
     * While the stage is open the loop keeps re-queuing itself: animation clips
     * need a frame clock to advance, the joint dots have to follow bones the
     * mixer moved, and the camera preview has to be re-blitted every time the
     * offscreen WebGL canvas changes. Closing the stage stops the loop so a
     * hidden stage costs nothing.
     */
    function scheduleRender() {
      if (frameHandle || disposed) return;
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0;
        drawStage();
        drawCameraPreview();
        if (state.looping && !disposed && !dom.root.hidden) scheduleRender();
      });
    }

    function ensureTextureSource() {
      if (textures || !state.previewSrc) return textures;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => scheduleRender();
      image.src = state.previewSrc;
      textures = new Map([[state.previewSrc, image]]);
      return textures;
    }

    function accentColor() {
      const value = getComputedStyle(dom.root).getPropertyValue("--color-accent").trim();
      return value || "#d5ff40";
    }

    /**
     * Paints the stage.
     *
     * Once the three.js layer is live it owns the canvas, so this only paints
     * the backdrop and lets the WebGL pass draw the objects on top. Until then,
     * and whenever WebGL is unavailable, the software rasteriser draws the whole
     * frame itself.
     */
    function drawStage() {
      const rect = stageRect();
      const ratio = clamp(window.devicePixelRatio || 1, 1, 2);
      if (!stage3dReady) {
        // The software rasteriser paints into the backdrop layer, never into the
        // WebGL canvas: asking that canvas for a 2D context would bind it to the
        // wrong context type forever and three could never take it over.
        drawSoftwareStage(rect, ratio);
      } else {
        stage3d.draw();
        drawStageOverlays(rect, ratio);
      }
      dom.stageBadge.textContent = `${state.project.items.length} 个对象 · ${core.formatTime(state.time)}`;
    }

    /** Full software frame, used only while the WebGL stage is unavailable. */
    function drawSoftwareStage(rect, ratio) {
      const backdrop = dom.stageBackdrop;
      if (!backdrop) return;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (backdrop.width !== width || backdrop.height !== height) {
        backdrop.width = width;
        backdrop.height = height;
      }
      const context = backdrop.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      core.renderScene(context, { ...stageView(), width: rect.width, height: rect.height }, state.project, state.time, {
        skyTop: STAGE_SKY_TOP,
        skyBottom: STAGE_SKY_BOTTOM,
        selectedId: state.selectedId,
        showLabels: state.showNames,
        showGrid: state.showGrid,
        accent: accentColor(),
        textures: ensureTextureSource() || new Map(),
      });
      // There are no bones to grab without a rig, so the joint layer stays empty
      // and is simply cleared at its own pixel scale.
      const overlay = dom.jointLayer;
      if (overlay) {
        const ratio2 = clamp(window.devicePixelRatio || 1, 1, 2);
        const ow = Math.round(rect.width * ratio2);
        const oh = Math.round(rect.height * ratio2);
        if (overlay.width !== ow || overlay.height !== oh) {
          overlay.width = ow;
          overlay.height = oh;
        }
        overlay.getContext("2d")?.clearRect(0, 0, ow, oh);
      }
      jointHandleCache = [];
    }

    /**
     * The WebGL pass draws objects but not the floor gradient, so the backdrop
     * canvas behind it still paints the gradient the software renderer used to
     * draw. The joint dots land on a third canvas above both, which is what
     * makes them grabbable without touching the WebGL surface.
     */
    function drawStageOverlays(rect, ratio) {
      drawStageBackdrop(rect, ratio);
      drawJointHandles(rect, ratio);
    }

    let jointHandleCache = [];

    /**
     * Bone dots for the selected skinned character, on their own canvas above
     * the WebGL surface.
     *
     * They live on a separate layer rather than in the WebGL pass because they
     * have to be hit-tested by the same pointer events the stage already owns,
     * and a DOM canvas keeps that arithmetic in two dimensions.
     */
    function drawJointHandles(rect) {
      const overlay = dom.jointLayer;
      if (!overlay) return;
      // The dots are drawn at device resolution and scaled by the transform, so
      // they stay round and crisp on a HiDPI display instead of fuzzy.
      const ratio = clamp(window.devicePixelRatio || 1, 1, 2);
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
      }
      const context = overlay.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const item = core.findItem(state.project, state.selectedId);
      if (!item || !core.isModelItem(item) || !stage3dReady || !state.showJoints) {
        jointHandleCache = [];
        return;
      }
      const view = { ...stageView(), width: rect.width, height: rect.height };
      const handles = stage3d.boneHandles(item, view, core.JOINT_CONTROLS);
      jointHandleCache = handles;
      // Mirrored onto the root element so the browser checks can drive a real
      // drag at a real handle position instead of re-deriving the projection.
      if (dom.root) dom.root.__jointHandles = handles;
      for (const handle of handles) {
        const active = state.jointHoverId === handle.id;
        const radius = active ? 7 : 5;
        context.beginPath();
        context.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
        context.fillStyle = active ? "rgba(213,255,64,0.96)" : "rgba(213,255,64,0.52)";
        context.fill();
        context.lineWidth = 1.4;
        context.strokeStyle = "rgba(12,14,18,0.85)";
        context.stroke();
        if (active) {
          context.beginPath();
          context.arc(handle.x, handle.y, radius + 4, 0, Math.PI * 2);
          context.strokeStyle = "rgba(213,255,64,0.5)";
          context.lineWidth = 1.2;
          context.stroke();
        }
      }
    }

    /** The joint dot under a stage-local point, if any. */
    function jointAt(point) {
      let best = null;
      for (const handle of jointHandleCache) {
        const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
        if (distance > 12) continue;
        if (!best || distance < best.distance) best = { handle, distance };
      }
      return best ? best.handle : null;
    }

    /**
     * Writes the live three transform of the current selection back onto the
     * project.
     *
     * When the transform gizmo is dragged it edits the three object directly, so
     * this copies the transform across and refreshes the panels. The project
     * remains the only thing that is saved or exported.
     *
     * Two kinds need wording worth spelling out: a camera comes back as an
     * orientation basis rather than as a Euler, and it is pinned to a unit scale
     * because a marker has no size of its own.
     */
    function syncGizmoToProject() {
      if (!stage3d || !state.selectedId) return;
      const item = core.findItem(state.project, state.selectedId);
      if (!item) return;
      const live = typeof stage3d.readItemTransform === "function"
        ? stage3d.readItemTransform(item.id)
        : null;
      if (!live) return;
      item.position = live.position.map(round3);
      // A camera marker is held as the project's own basis, so a dragged turn
      // arrives as a matrix rather than as a Euler. Inverting it through
      // rotationFromMatrix is what keeps the aim the operator dragged identical
      // to the shot that is rendered; reading three's `XYZ` Euler here would
      // store an aim that leans the other way.
      if (item.kind === "camera" && live.basis && typeof core.rotationFromMatrix === "function") {
        item.rotation = core.rotationFromMatrix(live.basis).map(round4);
      } else {
        item.rotation = live.rotation.map(round4);
      }
      // A camera has no size. The marker is a fixed-size box, so a scale drag
      // would change nothing about the shot while suggesting that it did.
      item.scale = item.kind === "camera"
        ? [1, 1, 1]
        : live.scale.map((value) => clamp(round4(value), 0.05, 12));
      markDirty();
      refreshInspector();
      refreshStatusText();
      scheduleRender();
    }

    /**
     * Points the three gizmo at the current selection and mode.
     *
     * The handles are attached for any selection, not only while one of the
     * transform modes is active: the arrows are what tells an operator the
     * object is grabbable at all, and having them appear only after switching
     * mode reads as "selection did nothing". In select mode they act as the
     * move handles, which is the transform that is wanted nearly every time.
     *
     * A camera gets handles too. It used to be excluded, because the two layers
     * disagreed about what a rotation triple meant and a dragged camera would
     * have ended up aimed somewhere the pane did not show. The stage now hands
     * the marker orientation across as a matrix in both directions, so a
     * dragged camera and a shot preset describe the same aim.
     *
     * A camera is still the one kind without a scale handle: the marker is a
     * fixed-size gizmo, so only move and rotate mean anything for it.
     */
    function syncGizmo() {
      if (!stage3d || typeof stage3d.attachGizmo !== "function") return;
      const item = core.findItem(state.project, state.selectedId);
      const wantGizmo = Boolean(item) && stage3dReady && !state.gizmoDragging;
      if (!wantGizmo) {
        if (typeof stage3d.detachGizmo === "function") stage3d.detachGizmo();
        return;
      }
      const requested = state.mode === "rotate" ? "rotate" : state.mode === "scale" ? "scale" : "translate";
      stage3d.attachGizmo(item, item.kind === "camera" && requested === "scale" ? "translate" : requested);
    }

    /** Flat backdrop used behind the transparent WebGL canvas. */
    function drawStageBackdrop(rect, ratio) {
      const backdrop = dom.stageBackdrop;
      if (!backdrop) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (backdrop.width !== width || backdrop.height !== height) {
        backdrop.width = width;
        backdrop.height = height;
      }
      const context = backdrop.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, STAGE_SKY_TOP);
      gradient.addColorStop(1, STAGE_SKY_BOTTOM);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }

    function activeCamera() {
      const selected = core.findItem(state.project, state.selectedId);
      if (selected && selected.kind === "camera") return selected;
      return state.project.items.find((item) => item.kind === "camera") || null;
    }

    /**
     * Camera gizmos are hidden from the camera preview and from exported
     * frames: the active camera box sits exactly on the lens, so drawing it
     * there would cover the whole shot. The stage view still shows them.
     */
    function cameraGizmoIds() {
      return state.project.items.filter((item) => item.kind === "camera").map((item) => item.id);
    }

    function cameraView() {
      const camera = activeCamera();
      if (!camera) return null;
      const ratio = core.aspectValue(state.project, 16 / 9);
      const shellWidth = Math.max(160, dom.previewShell.clientWidth || 240);
      const width = clamp(Math.round(shellWidth), PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH);
      return {
        camera,
        view: {
          ...core.cameraViewFor(state.project, camera, state.time),
          width,
          height: Math.max(90, Math.round(width / ratio)),
        },
      };
    }

    function drawCameraPreview() {
      const active = cameraView();
      const canvas = dom.previewCanvas;
      dom.previewEmpty.hidden = Boolean(active);
      canvas.hidden = !active;
      if (!active) {
        dom.previewMeta.textContent = "还没有机位";
        return;
      }
      canvas.style.aspectRatio = `${active.view.width} / ${active.view.height}`;
      const ratio = clamp(window.devicePixelRatio || 1, 1, 2);
      const pixelWidth = Math.round(active.view.width * ratio);
      const pixelHeight = Math.round(active.view.height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      // The WebGL layer renders on a transparent clear colour so the stage
      // backdrop can show through it, which means the preview has to lay down
      // the same sky before blitting or the shot would come out empty.
      const gradient = context.createLinearGradient(0, 0, 0, pixelHeight);
      gradient.addColorStop(0, STAGE_SKY_TOP);
      gradient.addColorStop(1, STAGE_SKY_BOTTOM);
      context.fillStyle = gradient;
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      const live = preview3d && preview3d.isReady && preview3d.isReady() && previewBuffer;
      if (live) {
        // Draw the shot into the offscreen WebGL canvas, then blit it down onto
        // the visible 2D one so the panel shows real characters while the
        // element stays readable with getImageData.
        preview3d.draw();
        const source = preview3d.element || previewBuffer;
        try {
          context.drawImage(source, 0, 0, pixelWidth, pixelHeight);
        } catch {
          live = false;
        }
      }
      if (!live) {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        core.renderScene(context, active.view, state.project, state.time, {
          skyTop: STAGE_SKY_TOP,
          skyBottom: STAGE_SKY_BOTTOM,
          showLabels: false,
          showGrid: false,
          accent: accentColor(),
          hideItemIds: cameraGizmoIds(),
          textures: ensureTextureSource() || new Map(),
        });
      }
      const transform = core.resolveItemTransform(state.project, active.camera, state.time);
      const focal = core.focalFromFov(active.view.fov);
      dom.previewMeta.textContent = `${active.camera.name} · 视野 ${active.view.fov.toFixed(0)}° · 焦距 ${focal.toFixed(0)}mm · 高度 ${transform.position[1].toFixed(2)}m`;
    }

    /* ------------------------------------------------------------- refresh */

    function refreshAll() {
      dom.nameInput.value = state.project.name;
      dom.durationInput.value = String(state.project.duration);
      dom.aspectSelect.value = state.project.aspectRatio;
      dom.playhead.max = String(state.project.duration);
      dom.meta.textContent = `${state.project.items.length} 个对象 · ${state.project.keyframes.length} 个关键帧`;
      const motionPreset = core.CAMERA_MOTION_PRESETS.find((entry) => entry.id === dom.motionSelect.value);
      dom.motionNote.textContent = motionPreset ? motionPreset.description : "";
      refreshToggles();
      refreshLibraryFold();
      refreshObjectList();
      refreshInspector();
      refreshTimeline();
      refreshPreviewFold();
      refreshStatusText();
      // Every path that changes the selection - adding an object, loading a
      // scene, applying a preset - funnels through here, so the transform
      // handles are re-bound in one place instead of in each of them.
      syncGizmo();
      scheduleRender();
    }

    function refreshToggles() {
      dom.gridToggle.classList.toggle("is-active", state.showGrid);
      dom.nameToggle.classList.toggle("is-active", state.showNames);
      dom.jointToggle.classList.toggle("is-active", state.showJoints);
    }

    /**
     * Collapses the model palette. The catalogue is seven tiles per category, so
     * folding it is what keeps the object list reachable on a short window.
     */
    function refreshLibraryFold() {
      dom.libraryBody.hidden = !state.libraryOpen;
      dom.addGrid.hidden = !state.libraryOpen;
      dom.library.classList.toggle("is-folded", !state.libraryOpen);
      dom.libraryHead.setAttribute("aria-expanded", state.libraryOpen ? "true" : "false");
    }

    function refreshPreviewFold() {
      dom.previewFold.textContent = state.previewFolded ? "展开" : "收起";
      dom.previewShell.hidden = state.previewFolded;
      dom.previewMeta.hidden = state.previewFolded;
    }

    function refreshStatusText() {
      dom.statusText.value = core.describeProject(state.project, { time: state.time });
    }

    /**
     * Draws the model palette: rigged characters, robots and animals as tiles
     * with a rendered thumbnail, grouped by category.
     *
     * A tile is only a button that adds the model. The thumbnail comes from the
     * live WebGL renderer, so the palette shows the real asset rather than an
     * icon, and it falls back to the label alone while a thumbnail is pending or
     * when WebGL never came up.
     */
    function renderLibrary() {
      const body = dom.libraryBody;
      if (!body) return;
      body.innerHTML = "";
      const models = Array.isArray(core.MODEL_LIBRARY) ? core.MODEL_LIBRARY : [];
      if (!models.length) return;
      if (dom.libraryCount) dom.libraryCount.textContent = String(models.length);
      const groups = new Map();
      for (const model of models) {
        const category = model.category || "模型";
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(model);
      }
      for (const [category, entries] of groups) {
        const group = element("section", "director-library-group");
        group.append(element("h4", "director-library-title", category));
        const grid = element("div", "director-library-grid");
        for (const model of entries) {
          const tile = element("button", "director-model-tile");
          tile.type = "button";
          tile.dataset.modelKind = model.kind;
          tile.title = model.label;
          const thumb = element("span", "director-model-thumb");
          const name = element("span", "director-model-name", model.label);
          const clips = Array.isArray(model.clips) ? model.clips.length : 0;
          const meta = element("span", "director-model-meta", clips ? `${clips} 个动作` : "静态");
          tile.append(thumb, name, meta);
          grid.append(tile);
          paintThumbnail(thumb, model);
        }
        group.append(grid);
        body.append(group);
      }
    }

    /** Fills one tile's thumbnail once the renderer can produce it. */
    function paintThumbnail(host, model) {
      if (!stage3dReady || !stage3d || typeof stage3d.thumbnail !== "function") return;
      // Reuse the same descriptor the stage loads from, so a tile can never
      // point at a different file than the object it creates.
      const descriptor = core.modelFor({ kind: model.kind, clip: "", joints: {} });
      if (!descriptor) return;
      const promised = stage3d.thumbnail(descriptor);
      if (!promised || typeof promised.then !== "function") return;
      promised.then((dataUrl) => {
        if (!dataUrl || disposed || !host.isConnected) return;
        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = "";
        image.loading = "lazy";
        host.append(image);
        host.classList.add("is-ready");
      }).catch(() => {});
    }

    function refreshObjectList() {
      dom.objectList.innerHTML = "";
      dom.objectCount.textContent = String(state.project.items.length);
      if (!state.project.items.length) {
        dom.objectList.append(element("li", "director-object-empty", "还没有对象，先用上方的按钮添加角色、道具和机位。"));
        return;
      }
      state.project.items.forEach((item) => {
        const row = element("li", "director-object");
        row.dataset.objectId = item.id;
        row.classList.toggle("is-selected", item.id === state.selectedId);
        const dot = element("span", "director-object-dot");
        dot.style.background = normalizeHex(item.color);
        const copy = element("span", "director-object-copy");
        const meta = core.ITEM_KINDS[item.kind] || {};
        copy.append(
          element("strong", undefined, item.name),
          element("small", undefined, `${meta.label || item.kind} · ${core.itemTypeLabel(item.kind)}`),
        );
        const keys = core.keyframesFor(state.project, item.id).length;
        const keyBadge = element("span", "director-object-meta", keys ? `${keys} 帧` : "静态");
        const remove = element("button", "director-object-remove");
        remove.type = "button";
        remove.dataset.removeId = item.id;
        remove.title = `删除 ${item.name}`;
        remove.textContent = "×";
        row.append(dot, copy, keyBadge, remove);
        dom.objectList.append(row);
      });
    }

    function normalizeHex(value) {
      const text = String(value || "").trim();
      return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "#b9c2cb";
    }

    function refreshInspector() {
      dom.inspector.innerHTML = "";
      const item = core.findItem(state.project, state.selectedId);
      if (!item) {
        dom.inspectorNote.textContent = "未选中";
        dom.inspector.append(element("p", "director-hint", "在左侧选择对象，或直接在舞台上点选。"));
        return;
      }
      const meta = core.ITEM_KINDS[item.kind] || {};
      dom.inspectorNote.textContent = meta.label || item.kind;

      const nameField = element("label", "director-field");
      nameField.append(element("span", "director-field-label", "名称"));
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "director-input";
      nameInput.value = item.name;
      nameInput.maxLength = 40;
      nameInput.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") nameInput.blur();
      });
      nameInput.addEventListener("change", () => {
        core.renameItem(state.project, item.id, nameInput.value);
        const updated = core.findItem(state.project, item.id);
        nameInput.value = updated.name;
        markDirty();
        refreshObjectList();
        refreshStatusText();
        dom.inspectorNote.textContent = core.ITEM_KINDS[updated.kind] ? core.ITEM_KINDS[updated.kind].label : updated.kind;
      });
      nameField.append(nameInput);
      dom.inspector.append(nameField);

      const positionField = element("div", "director-field director-field-stacked");
      positionField.append(element("span", "director-field-label", "位置"));
      const positionRow = element("div", "director-grid-3");
      ["X", "Y", "Z"].forEach((axis, index) => {
        positionRow.append(numericField(axis, {
          step: 0.05,
          value: item.position[index],
          onInput: (value) => {
            item.position = item.position.map((entry, position) => (position === index ? value : entry));
            markDirty();
            refreshStatusText();
            scheduleRender();
          },
        }));
      });
      positionField.append(positionRow);
      dom.inspector.append(positionField);

      const angleField = element("div", "director-field director-field-stacked");
      angleField.append(element("span", "director-field-label", item.kind === "camera" ? "朝向（度）" : "朝向"));
      const angleRow = element("div", "director-grid-3");
      // Each angle is written back into its own slot, so a camera that has just
      // been dragged keeps the pitch and roll the drag produced instead of the
      // panel flattening the shot back to level.
      const angleFieldFor = (label, index, step) => numericField(label, {
        step,
        value: Math.round((item.rotation[index] * 180) / Math.PI),
        onInput: (value) => {
          item.rotation = item.rotation.map((entry, position) => (
            position === index ? round4(((Number(value) || 0) * Math.PI) / 180) : entry
          ));
          markDirty();
          scheduleRender();
        },
      });
      angleRow.append(angleFieldFor("左右", 1, 5));
      if (item.kind === "camera") {
        // A camera is aimed, so all three angles are worth exposing: the drag
        // handles produce pitch and roll as well, and a shot that can only be
        // levelled from the panel would lose what the drag just set.
        angleRow.append(angleFieldFor("俯仰", 0, 5));
        angleRow.append(angleFieldFor("倾斜", 2, 5));
      }
      // A camera marker is a fixed-size gizmo, so it carries no scale control.
      // Offering one would promise a change to the shot that never happens.
      if (item.kind !== "camera") {
        angleRow.append(numericField("缩放", {
          min: 0.1,
          max: 6,
          step: 0.05,
          value: item.scale[0],
          onInput: (value) => {
            const factor = clamp(Number(value) || 1, 0.1, 6);
            item.scale = [factor, factor, factor];
            markDirty();
            scheduleRender();
          },
        }));
      }
      angleField.append(angleRow);
      dom.inspector.append(angleField);

      if (item.kind === "camera") {
        const fovField = element("div", "director-field director-field-stacked");
        fovField.append(element("span", "director-field-label", "视野"));
        const fovRow = element("div", "director-grid-3");
        fovRow.append(numericField("度数", {
          min: 12,
          max: 100,
          step: 1,
          value: item.fov || 42,
          onInput: (value) => {
            item.fov = clamp(Number(value) || 42, 12, 100);
            item.focalLength = core.focalFromFov(item.fov);
            markDirty();
            refreshInspector();
            scheduleRender();
          },
        }));
        fovField.append(fovRow);
        fovField.append(element("p", "director-hint", `等效焦距 ${core.focalFromFov(item.fov || 42).toFixed(0)}mm`));
        dom.inspector.append(fovField);
      } else if (core.isModelItem(item)) {
        dom.inspector.append(buildModelSection(item));
      } else if (meta.pose) {
        const poseField = element("label", "director-field");
        poseField.append(element("span", "director-field-label", "姿态"));
        const poseSelect = document.createElement("select");
        poseSelect.className = "director-input";
        core.CHARACTER_POSES.forEach((pose) => {
          const option = document.createElement("option");
          option.value = pose.id;
          option.textContent = pose.label;
          poseSelect.append(option);
        });
        poseSelect.value = item.pose || "stand";
        poseSelect.addEventListener("change", () => {
          item.pose = poseSelect.value;
          markDirty();
          scheduleRender();
        });
        poseField.append(poseSelect);
        dom.inspector.append(poseField);
      }

      const colorField = element("label", "director-field");
      colorField.append(element("span", "director-field-label", "颜色"));
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "director-color";
      colorInput.value = normalizeHex(item.color);
      colorInput.addEventListener("input", () => {
        item.color = colorInput.value;
        markDirty();
        refreshObjectList();
        scheduleRender();
      });
      colorField.append(colorInput);
      dom.inspector.append(colorField);

      const curveField = element("label", "director-field");
      curveField.append(element("span", "director-field-label", "运动曲线"));
      const curveSelect = document.createElement("select");
      curveSelect.className = "director-input";
      core.MOTION_CURVES.forEach((curve) => {
        const option = document.createElement("option");
        option.value = curve.id;
        option.textContent = curve.label;
        curveSelect.append(option);
      });
      curveSelect.value = core.MOTION_CURVES.some((curve) => curve.id === item.motionCurve)
        ? item.motionCurve
        : "linear";
      curveSelect.addEventListener("change", () => {
        item.motionCurve = curveSelect.value;
        markDirty();
        scheduleRender();
      });
      curveField.append(curveSelect);
      dom.inspector.append(curveField);

      const keyCount = core.keyframesFor(state.project, item.id).length;
      const keyRow = element("div", "director-inspector-actions");
      const keyNow = element("button", "director-button director-ghost");
      keyNow.type = "button";
      keyNow.textContent = "在当前时间记录";
      keyNow.addEventListener("click", recordCurrentKeyframe);
      const clearKeys = element("button", "director-button director-ghost");
      clearKeys.type = "button";
      clearKeys.textContent = keyCount ? `清除 ${keyCount} 帧` : "暂无关键帧";
      clearKeys.disabled = !keyCount;
      clearKeys.addEventListener("click", clearSelectionKeyframes);
      keyRow.append(keyNow, clearKeys);
      dom.inspector.append(keyRow);
    }

    /**
     * The animation and joint block for a rigged character.
     *
     * It is built from the same tables the renderer uses, so the dropdown can
     * only offer clips the loaded model actually has, and a slider can only
     * reach a bone the rig actually carries. Everything here writes plain
     * degrees into item.joints, which is what gets saved with the scene.
     */
    function buildModelSection(item) {
      const wrap = element("div", "director-model-section");
      const clips = core.clipsForKind(item.kind);
      const clipField = element("label", "director-field");
      clipField.append(element("span", "director-field-label", "动画"));
      const clipSelect = document.createElement("select");
      clipSelect.className = "director-input director-clip";
      clips.forEach((clip) => {
        const option = document.createElement("option");
        option.value = clip.id;
        option.textContent = clip.label;
        clipSelect.append(option);
      });
      clipSelect.value = item.clip || (clips[0] ? clips[0].id : "");
      clipSelect.addEventListener("change", () => {
        item.clip = clipSelect.value;
        markDirty();
        refreshStatusText();
        scheduleRender();
      });
      clipField.append(clipSelect);
      wrap.append(clipField);

      const presetField = element("div", "director-field director-field-stacked");
      presetField.append(element("span", "director-field-label", "姿态预置"));
      const presetGrid = element("div", "director-stance-grid");
      core.CHARACTER_STANCE_PRESETS.forEach((preset) => {
        const button = element("button", "director-stance");
        button.type = "button";
        button.dataset.stanceId = preset.id;
        button.textContent = preset.label;
        button.addEventListener("click", () => {
          item.joints = core.applyStancePreset(item.joints, preset.id, item.kind);
          // A pose is an offset stacked on the playing clip, so a rig whose
          // default animation keeps the arms moving would drag the pose around
          // the loop. Where the catalogue names a still clip, the pose is
          // composed against that instead - and the switch is reported, because
          // it changes the animation the operator had chosen.
          const meta = core.ITEM_KINDS[item.kind] || {};
          let switched = "";
          if (preset.id !== "neutral" && meta.stanceClip && item.clip !== meta.stanceClip) {
            switched = meta.stanceClip;
            item.clip = switched;
          }
          markDirty();
          refreshInspector();
          refreshStatusText();
          if (preset.id === "neutral") {
            setStatus("已回到动画本身的姿态。");
          } else if (switched) {
            const label = (core.clipsForKind(item.kind).find((clip) => clip.id === switched) || {}).label || switched;
            setStatus(`已套用「${preset.label}」姿态，并切到「${label}」作为基准动画。`);
          } else {
            setStatus(`已套用「${preset.label}」姿态。`);
          }
          scheduleRender();
        });
        presetGrid.append(button);
      });
      presetField.append(presetGrid);
      wrap.append(presetField);

      const joints = item.joints || {};
      const touched = Object.keys(joints).length;
      const jointHead = element("div", "director-joint-head");
      jointHead.append(
        element("span", "director-field-label", "关节微调"),
        element("small", "director-panel-note", touched ? `已调整 ${touched} 处` : "未调整"),
      );
      const reset = element("button", "director-mini");
      reset.type = "button";
      reset.textContent = "复位";
      reset.disabled = !touched;
      reset.addEventListener("click", () => {
        item.joints = {};
        markDirty();
        refreshInspector();
        refreshStatusText();
        scheduleRender();
      });
      jointHead.append(reset);
      wrap.append(jointHead);

      const groups = new Map();
      for (const control of core.JOINT_CONTROLS) {
        const group = control.group || "关节";
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(control);
      }
      for (const [groupName, controls] of groups) {
        const block = element("details", "director-joint-group");
        block.open = false;
        const summary = element("summary", "director-joint-summary", groupName);
        block.append(summary);
        const list = element("div", "director-joint-list");
        for (const control of controls) {
          list.append(buildJointRow(item, control));
        }
        block.append(list);
        wrap.append(block);
      }
      return wrap;
    }

    /** One bone slider, bound to a single axis of that joint. */
    function buildJointRow(item, control) {
      const axis = control.axis || "x";
      const current = Number(item.joints?.[control.id]?.[axis]) || 0;
      const row = element("label", "director-joint-row");
      const head = element("span", "director-joint-name");
      head.textContent = control.label;
      const value = element("output", "director-joint-value");
      value.textContent = `${current.toFixed(0)}°`;
      const input = document.createElement("input");
      input.type = "range";
      input.className = "director-joint-range";
      input.min = String(control.min === undefined ? -180 : control.min);
      input.max = String(control.max === undefined ? 180 : control.max);
      input.step = "1";
      input.value = String(current);
      const write = (next) => {
        const joints = { ...(item.joints || {}) };
        const entry = { ...(joints[control.id] || {}) };
        if (Math.abs(next) < 0.5) delete entry[axis];
        else entry[axis] = next;
        if (Object.keys(entry).length) joints[control.id] = entry;
        else delete joints[control.id];
        item.joints = core.normalizeJoints(joints);
        value.textContent = `${next.toFixed(0)}°`;
      };
      input.addEventListener("input", () => {
        write(Number(input.value));
        scheduleRender();
      });
      input.addEventListener("change", () => {
        markDirty();
        refreshStatusText();
      });
      row.append(head, input, value);
      return row;
    }

    function refreshTimeline() {
      dom.playhead.value = String(state.time);
      dom.playhead.max = String(state.project.duration);
      dom.timeLabel.textContent = `${core.formatTime(state.time)} / ${core.formatTime(state.project.duration)}`;
      dom.keyDots.innerHTML = "";
      const duration = state.project.duration || 1;
      [...state.project.keyframes]
        .sort((left, right) => left.time - right.time)
        .forEach((keyframe) => {
          const item = core.findItem(state.project, keyframe.itemId);
          const dot = element("button", "director-key-dot");
          dot.type = "button";
          dot.dataset.keyframeId = keyframe.id;
          dot.style.left = `${clamp((keyframe.time / duration) * 100, 0, 100)}%`;
          dot.style.background = normalizeHex(item ? item.color : "");
          if (item && item.kind === "camera") dot.classList.add("is-camera");
          dot.title = `${item ? item.name : "对象"} · ${core.formatTime(keyframe.time)}`;
          dom.keyDots.append(dot);
        });
      dom.keyButton.disabled = !state.selectedId;
      dom.clearButton.disabled = !state.selectedId;
    }

    /* ------------------------------------------------------------ capture */

    function captureFrame(width) {
      const camera = activeCamera();
      if (!camera) return null;
      const ratio = core.aspectValue(state.project, 16 / 9);
      const frameWidth = Math.max(320, Math.round(Number(width) || EXPORT_WIDTH));
      const frameHeight = Math.max(180, Math.round(frameWidth / ratio));
      const view = { ...core.cameraViewFor(state.project, camera, state.time), width: frameWidth, height: frameHeight };
      if (stage3dReady && stage3d && typeof stage3d.capture === "function") {
        const shot = stage3d.capture(view, frameWidth, frameHeight);
        if (shot && shot.dataUrl) {
          return { canvas: null, width: shot.width, height: shot.height, dataUrl: shot.dataUrl, camera };
        }
      }
      const canvas = doc.createElement("canvas");
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const context = canvas.getContext("2d");
      if (!context) return null;
      core.renderScene(context, view, state.project, state.time, {
        skyTop: STAGE_SKY_TOP,
        skyBottom: STAGE_SKY_BOTTOM,
        showLabels: false,
        showGrid: false,
        accent: accentColor(),
        hideItemIds: cameraGizmoIds(),
        textures: ensureTextureSource() || new Map(),
      });
      return { canvas, width: frameWidth, height: frameHeight, dataUrl: canvas.toDataURL("image/png"), camera };
    }

    function requestSaveScene() {
      const frame = captureFrame();
      if (frame) state.previewSrc = frame.dataUrl;
      state.dirty = false;
      if (typeof options.onSaveScene === "function") {
        options.onSaveScene({
          project: core.cloneProject(state.project),
          dataUrl: frame ? frame.dataUrl : "",
          width: frame ? frame.width : 0,
          height: frame ? frame.height : 0,
          name: state.project.name,
        });
      }
      scheduleRender();
      setStatus(frame ? "场景与预览图已保存到节点。" : "场景已保存，还没有机位可以生成预览。");
    }

    function requestExportFrame() {
      const frame = captureFrame();
      if (!frame) {
        setStatus("先添加一个机位再导出画面。");
        return;
      }
      if (typeof options.onExportFrame === "function") {
        options.onExportFrame({
          project: core.cloneProject(state.project),
          dataUrl: frame.dataUrl,
          width: frame.width,
          height: frame.height,
          name: state.project.name,
        });
      }
      setStatus("已把当前机位画面导成画布上的新图片。");
    }

    /* ----------------------------------------------------------------- api */

    function observeStage() {
      if (observer || typeof ResizeObserver !== "function") return;
      observer = new ResizeObserver(() => scheduleRender());
      observer.observe(dom.stage);
    }

    function open() {
      dom.root.hidden = false;
      state.looping = true;
      dom.timeline.style.height = `${readStoredTimelineHeight()}px`;
      setMode(state.mode);
      refreshAll();
      if (dom.root.focus) dom.root.focus();
      observeStage();
      renderLibrary();
      scheduleRender();
      return controller;
    }

    function close() {
      if (state.playing) togglePlay();
      state.looping = false;
      dom.root.hidden = true;
      drag = null;
      state.jointHoverId = "";
      jointHandleCache = [];
      if (stage3d && typeof stage3d.detachGizmo === "function") stage3d.detachGizmo();
      if (typeof options.onClose === "function") options.onClose({ dirty: state.dirty });
      return controller;
    }

    function destroy() {
      disposed = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      if (playHandle) cancelAnimationFrame(playHandle);
      if (toastTimer) clearTimeout(toastTimer);
      if (observer) observer.disconnect();
      if (stage3d) stage3d.destroy();
      if (preview3d) preview3d.destroy();
      stage3d = null;
      preview3d = null;
      previewBuffer = null;
      stage3dReady = false;
      jointHandleCache = [];
      root.removeEventListener("canvas-theme-changed", syncThemeAttribute);
      dom.root.remove();
    }

    function setProject(project) {
      state.project = core.normalizeProject(project);
      state.selectedId = "";
      state.time = 0;
      state.jointHoverId = "";
      jointHandleCache = [];
      refreshAll();
      return controller;
    }

    const controller = {
      dom,
      open,
      close,
      destroy,
      setProject,
      setStatus,
      setTime,
      captureFrame,
      stageView,
      get project() {
        return state.project;
      },
      get isOpen() {
        return !dom.root.hidden;
      },
      get selectedId() {
        return state.selectedId;
      },
      get stage3d() {
        return stage3d;
      },
      get time() {
        return state.time;
      },
      context() {
        return core.sceneContext(state.project, { nodeId: options.nodeId || "", time: state.time });
      },
    };
    return controller;
  }

  return {
    PRESET_STORAGE_KEY,
    TIMELINE_STORAGE_KEY,
    DEFAULT_TIMELINE_HEIGHT,
    EXPORT_WIDTH,
    MODES,
    ADD_BUTTONS,
    resolveCore,
    createDirector3dApp,
  };
});
