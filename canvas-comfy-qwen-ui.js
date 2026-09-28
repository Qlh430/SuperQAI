(function initCanvasComfyQwenUi(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasComfyQwenUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasComfyQwenUi() {
  "use strict";

  const QWEN_FIELDS = Object.freeze([
    { key: "horizontal", className: "canvas-comfy-qwen-horizontal", label: "水平角", min: -180, max: 180, step: 1 },
    { key: "vertical", className: "canvas-comfy-qwen-vertical", label: "垂直角", min: -30, max: 60, step: 1 },
    { key: "zoom", className: "canvas-comfy-qwen-zoom", label: "缩放", min: 0, max: 10, step: 0.1 },
  ]);

  function getSvgPoint(svg, event) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const width = rect.width || viewBox.width || 260;
    const height = rect.height || viewBox.height || 170;
    return {
      x: ((event.clientX - rect.left) / width) * viewBox.width,
      y: ((event.clientY - rect.top) / height) * viewBox.height,
    };
  }

  function updateQwenAngleUi(options = {}) {
    const document = options.document || globalThis.document;
    const node = options.node;
    const root = options.area || node?.querySelector?.(".canvas-comfy-qwen-angle");
    if (!document || !node || !root) return;
    const angle = options.getAngle?.(node) || {};
    root.querySelectorAll("[data-qwen-key]").forEach((input) => {
      const key = input.dataset.qwenKey;
      if (!key || !(key in angle)) return;
      if (input.type === "number" && document.activeElement === input) return;
      input.value = String(angle[key]);
    });

    const setText = (selector, value) => {
      const target = root.querySelector(selector);
      if (target) target.textContent = value;
    };
    setText('[data-qwen-value="horizontal"]', String(angle.horizontal) + "\u00b0");
    setText('[data-qwen-value="vertical"]', String(angle.vertical) + "\u00b0");
    setText('[data-qwen-value="zoom"]', String(angle.zoom));
    setText('[data-qwen-label="horizontal"]', options.describeHorizontal?.(angle.horizontal));
    setText('[data-qwen-label="vertical"]', options.describeVertical?.(angle.vertical));
    setText('[data-qwen-label="zoom"]', options.describeZoom?.(angle.zoom));

    const svg = root.querySelector(".canvas-comfy-qwen-svg");
    if (!svg) return;
    const orbitCx = 130;
    const orbitCy = 108;
    const orbitRx = 92;
    const orbitRy = 39;
    const targetX = 130;
    const targetY = 82;
    const radians = angle.horizontal * Math.PI / 180;
    const orbitX = orbitCx + Math.sin(radians) * orbitRx;
    const orbitY = orbitCy + Math.cos(radians) * orbitRy;
    const verticalProgress = (angle.vertical + 30) / 90;
    const inverseVerticalProgress = 1 - verticalProgress;
    const verticalX = inverseVerticalProgress ** 3 * 54 + 3 * inverseVerticalProgress ** 2 * verticalProgress * 24 + 3 * inverseVerticalProgress * verticalProgress ** 2 * 28 + verticalProgress ** 3 * 66;
    const verticalY = inverseVerticalProgress ** 3 * 142 + 3 * inverseVerticalProgress ** 2 * verticalProgress * 104 + 3 * inverseVerticalProgress * verticalProgress ** 2 * 54 + verticalProgress ** 3 * 22;
    const zoomProgress = angle.zoom / 10;
    const distanceScale = 1.12 - zoomProgress * 0.42;
    const cameraBaseX = targetX + (orbitX - targetX) * distanceScale;
    const cameraBaseY = targetY + (orbitY - targetY) * distanceScale;
    const overheadLift = verticalProgress * 92;
    const lowerLift = Math.max(0, -angle.vertical) * 0.18;
    const cameraX = Math.max(42, Math.min(216, cameraBaseX));
    const cameraY = Math.max(38, Math.min(124, cameraBaseY - overheadLift + lowerLift - 4));
    const viewLabel = options.describeHorizontal?.(angle.horizontal);
    const tiltLabel = options.describeVertical?.(angle.vertical);

    const cameraBehindPlane = Math.cos(radians) < -0.08;
    svg.querySelectorAll("[data-qwen-camera]").forEach((camera) => {
      const layer = camera.dataset.qwenCameraLayer || "front";
      camera.setAttribute("transform", "translate(" + cameraX.toFixed(1) + " " + cameraY.toFixed(1) + ")");
      camera.classList.toggle("is-camera-back", layer === "back");
      camera.classList.toggle("is-camera-front", layer !== "back");
      camera.setAttribute("opacity", layer === "back" ? (cameraBehindPlane ? "0.48" : "0") : (cameraBehindPlane ? "0" : "1"));
    });
    const orbitHandle = svg.querySelector("[data-qwen-orbit-handle]");
    if (orbitHandle) {
      orbitHandle.setAttribute("cx", orbitX.toFixed(1));
      orbitHandle.setAttribute("cy", orbitY.toFixed(1));
    }
    svg.classList.toggle("is-camera-behind-plane", cameraBehindPlane);
    const updateRay = (selector) => {
      const ray = svg.querySelector(selector);
      if (!ray) return;
      ray.setAttribute("x1", targetX.toFixed(1));
      ray.setAttribute("y1", targetY.toFixed(1));
      ray.setAttribute("x2", cameraX.toFixed(1));
      ray.setAttribute("y2", cameraY.toFixed(1));
    };
    updateRay("[data-qwen-camera-ray-back]");
    updateRay("[data-qwen-camera-ray-front]");
    const verticalHandle = svg.querySelector("[data-qwen-vertical-handle]");
    if (verticalHandle) {
      verticalHandle.setAttribute("cx", verticalX.toFixed(1));
      verticalHandle.setAttribute("cy", verticalY.toFixed(1));
    }
    const plane = svg.querySelector("[data-qwen-plane]");
    if (plane) plane.setAttribute("transform", "translate(" + targetX.toFixed(1) + " 78)");
    setText('[data-qwen-svg-label="view"]', viewLabel);
    setText('[data-qwen-svg-label="tilt"]', tiltLabel);
  }

  function createQwenAngleFields(options = {}) {
    const document = options.document || globalThis.document;
    const node = options.node;
    if (!document || !node) throw new Error("ComfyUI Qwen angle UI requires a document and node.");
    const angle = options.angle || options.getAngle?.(node) || {};
    const updateUi = (area = options.area) => updateQwenAngleUi({
      document,
      node,
      area,
      getAngle: options.getAngle,
      describeHorizontal: options.describeHorizontal,
      describeVertical: options.describeVertical,
      describeZoom: options.describeZoom,
    });

    const area = document.createElement("section");
    area.className = "canvas-comfy-qwen-angle";
    const stopQwenPointer = (event) => event.stopPropagation();
    ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "dragstart"].forEach((type) => {
      area.addEventListener(type, stopQwenPointer);
    });
    area.addEventListener("wheel", stopQwenPointer, { passive: true });
    const head = document.createElement("div");
    head.className = "canvas-comfy-qwen-angle-head";
    const title = document.createElement("strong");
    title.textContent = "Qwen \u89d2\u5ea6\u53c2\u6570";
    const tip = document.createElement("div");
    tip.className = "canvas-comfy-qwen-legend";
    tip.innerHTML = [
      '<span class="is-horizontal"><i></i><b>\u7c89\u8272</b>\u6c34\u5e73\u73af\u7ed5</span>',
      '<span class="is-vertical"><i></i><b>\u9752\u8272</b>\u4e0a\u4e0b\u4fef\u4ef0</span>',
      '<span class="is-zoom"><i></i><b>\u9ec4\u8272</b>\u6444\u50cf\u673a\u8fdc\u8fd1</span>',
    ].join("");
    head.append(title, tip);

    const visual = document.createElement("div");
    visual.className = "canvas-comfy-qwen-visual";
    visual.innerHTML = [
      '<svg class="canvas-comfy-qwen-svg" viewBox="0 0 260 170" role="img" aria-label="Qwen camera angle visualizer">',
      '<defs><linearGradient id="qwenOrbitGradient" x1="0" x2="1"><stop offset="0" stop-color="#24e0c2"/><stop offset="1" stop-color="#ff3e8d"/></linearGradient><filter id="qwenGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>',
      '<g class="canvas-comfy-qwen-floor"><path d="M24 132 H236 M42 118 H218 M60 104 H200 M78 90 H182 M96 76 H164 M38 144 L112 50 M76 148 L126 50 M116 150 L138 50 M156 150 L150 50 M196 148 L164 50 M224 140 L176 50"/></g>',
      '<ellipse data-qwen-drag="horizontal" class="canvas-comfy-qwen-orbit" cx="130" cy="108" rx="92" ry="39"/>',
      '<ellipse class="canvas-comfy-qwen-inner-orbit" cx="130" cy="108" rx="31" ry="13"/>',
      '<line data-qwen-camera-ray-back class="canvas-comfy-qwen-ray canvas-comfy-qwen-ray-back" x1="130" y1="82" x2="130" y2="147"/>',
      '<g class="canvas-comfy-qwen-view-label"><text data-qwen-svg-label="view" x="130" y="15" text-anchor="middle">\u6b63\u9762</text><text data-qwen-svg-label="tilt" x="130" y="29" text-anchor="middle">\u5e73\u89c6</text></g>',
      '<g data-qwen-camera data-qwen-camera-layer="back" class="canvas-comfy-qwen-camera canvas-comfy-qwen-eye" transform="translate(130 147)"><ellipse class="canvas-comfy-qwen-eye-glow" cx="0" cy="0" rx="20" ry="15"/><path class="canvas-comfy-qwen-eye-white" d="M-17 0 C-10 -10 10 -10 17 0 C10 10 -10 10 -17 0 Z"/><circle class="canvas-comfy-qwen-eye-iris" cx="0" cy="0" r="7.2"/><circle class="canvas-comfy-qwen-eye-pupil" cx="0" cy="0" r="3.1"/><circle class="canvas-comfy-qwen-eye-spark" cx="-2.7" cy="-2.7" r="1.5"/></g>',
      '<g data-qwen-plane class="canvas-comfy-qwen-plane" transform="translate(130 78)"><ellipse class="canvas-comfy-qwen-plane-shadow" cx="0" cy="45" rx="30" ry="8"/><rect class="canvas-comfy-qwen-plane-card" x="-28" y="-42" width="56" height="84" rx="6"/><line x1="-20" y1="-24" x2="20" y2="-24"/><line x1="-20" y1="0" x2="20" y2="0"/><line x1="-20" y1="24" x2="20" y2="24"/><line x1="0" y1="-34" x2="0" y2="34"/><circle class="canvas-comfy-qwen-plane-center" cx="0" cy="0" r="2.2"/></g>',
      '<line data-qwen-camera-ray-front class="canvas-comfy-qwen-ray canvas-comfy-qwen-ray-front" x1="130" y1="82" x2="130" y2="147"/>',
      '<path data-qwen-drag="vertical" class="canvas-comfy-qwen-tilt-rail" d="M54 142 C24 104 28 54 66 22"/>',
      '<circle data-qwen-vertical-handle data-qwen-drag="vertical" class="canvas-comfy-qwen-tilt-handle" cx="54" cy="83" r="10"/>',
      '<circle data-qwen-orbit-handle data-qwen-drag="horizontal" class="canvas-comfy-qwen-orbit-handle" cx="130" cy="147" r="10"/>',
      '<g data-qwen-camera data-qwen-camera-layer="front" class="canvas-comfy-qwen-camera canvas-comfy-qwen-eye" transform="translate(130 147)"><ellipse class="canvas-comfy-qwen-eye-glow" cx="0" cy="0" rx="20" ry="15"/><path class="canvas-comfy-qwen-eye-white" d="M-17 0 C-10 -10 10 -10 17 0 C10 10 -10 10 -17 0 Z"/><circle class="canvas-comfy-qwen-eye-iris" cx="0" cy="0" r="7.2"/><circle class="canvas-comfy-qwen-eye-pupil" cx="0" cy="0" r="3.1"/><circle class="canvas-comfy-qwen-eye-spark" cx="-2.7" cy="-2.7" r="1.5"/></g>',
      '</svg>',
    ].join("");

    const readout = document.createElement("div");
    readout.className = "canvas-comfy-qwen-readout";
    readout.innerHTML = [
      '<div><span>\u6c34\u5e73</span><strong data-qwen-value="horizontal">' + angle.horizontal + '\u00b0</strong><em data-qwen-label="horizontal"></em></div>',
      '<div><span>\u5782\u76f4</span><strong data-qwen-value="vertical">' + angle.vertical + '\u00b0</strong><em data-qwen-label="vertical"></em></div>',
      '<div><span>\u7f29\u653e</span><strong data-qwen-value="zoom">' + angle.zoom + '</strong><em data-qwen-label="zoom"></em></div>',
    ].join("");

    const grid = document.createElement("div");
    grid.className = "canvas-comfy-qwen-angle-grid";
    const applyAngle = (nextValue) => {
      options.setAngle?.(node, nextValue);
      updateUi(area);
      options.onHint?.(node);
      options.onSave?.();
    };
    QWEN_FIELDS.forEach((field) => {
      const label = document.createElement("label");
      const span = document.createElement("span");
      span.textContent = field.label;
      const row = document.createElement("div");
      row.className = "canvas-comfy-qwen-field-row";
      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.className = field.className;
      numberInput.dataset.qwenKey = field.key;
      numberInput.min = String(field.min);
      numberInput.max = String(field.max);
      numberInput.step = String(field.step || 1);
      numberInput.value = String(angle[field.key]);
      const rangeInput = document.createElement("input");
      rangeInput.type = "range";
      rangeInput.className = "canvas-comfy-qwen-range";
      rangeInput.dataset.qwenKey = field.key;
      rangeInput.min = String(field.min);
      rangeInput.max = String(field.max);
      rangeInput.step = String(field.step || 1);
      rangeInput.value = String(angle[field.key]);
      const onInput = (event) => {
        const next = options.getAngle?.(node) || {};
        next[field.key] = event.currentTarget.value;
        applyAngle(next);
      };
      numberInput.addEventListener("input", onInput);
      rangeInput.addEventListener("input", onInput);
      numberInput.addEventListener("change", () => updateUi(area));
      row.append(numberInput, rangeInput);
      label.append(span, row);
      grid.append(label);
    });

    const svg = visual.querySelector(".canvas-comfy-qwen-svg");
    const clampLocal = (item, min, max) => Math.max(min, Math.min(max, item));
    const updateFromPointer = (event, dragType) => {
      const point = getSvgPoint(svg, event);
      const next = options.getAngle?.(node) || {};
      if (dragType === "vertical") {
        const y = clampLocal(point.y, 24, 142);
        next.vertical = Math.round(((142 - y) / 118) * 90 - 30);
      } else if (dragType === "zoom") {
        const x = clampLocal(point.x, 64, 196);
        next.zoom = Math.round(((x - 64) / 132) * 100) / 10;
      } else {
        const radians = Math.atan2((point.x - 130) / 92, (point.y - 108) / 39);
        next.horizontal = Math.round(radians * 180 / Math.PI);
      }
      applyAngle(next);
    };
    svg.addEventListener("pointerdown", (event) => {
      const dragNode = event.target.closest?.("[data-qwen-drag]");
      if (!dragNode) return;
      const dragType = dragNode.dataset.qwenDrag;
      event.preventDefault();
      event.stopPropagation();
      svg.setPointerCapture?.(event.pointerId);
      const move = (moveEvent) => {
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        updateFromPointer(moveEvent, dragType);
      };
      const up = (upEvent) => {
        svg.releasePointerCapture?.(upEvent.pointerId);
        svg.removeEventListener("pointermove", move);
        svg.removeEventListener("pointerup", up);
        svg.removeEventListener("pointercancel", up);
      };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", up);
      updateFromPointer(event, dragType);
    });

    const visualColumn = document.createElement("div");
    visualColumn.className = "canvas-comfy-qwen-visual-column";
    visualColumn.append(visual, readout);
    const body = document.createElement("div");
    body.className = "canvas-comfy-qwen-body";
    body.append(visualColumn, grid);
    area.append(head, body);
    updateUi(area);
    return area;
  }

  return Object.freeze({
    getSvgPoint,
    updateQwenAngleUi,
    createQwenAngleFields,
  });
});
