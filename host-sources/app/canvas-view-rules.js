(function exposeCanvasViewRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasViewRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasViewRules() {
  "use strict";

  const SCALE_MIN = 0.05;
  const SCALE_MAX = 5;
  const DEFAULT_VIEW = Object.freeze({ x: 80, y: 60, scale: 1 });
  const WHEEL_DELTA_MAX = 20;
  const WHEEL_ZOOM_SENSITIVITY = 0.001;

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeScale(value, fallback = DEFAULT_VIEW.scale) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, numeric));
  }

  function normalizeViewport(viewport = {}, defaults = DEFAULT_VIEW) {
    const fallback = {
      x: finiteNumber(defaults?.x, DEFAULT_VIEW.x),
      y: finiteNumber(defaults?.y, DEFAULT_VIEW.y),
      scale: normalizeScale(defaults?.scale, DEFAULT_VIEW.scale),
    };
    return {
      x: finiteNumber(viewport?.x, fallback.x),
      y: finiteNumber(viewport?.y, fallback.y),
      scale: normalizeScale(viewport?.scale, fallback.scale),
    };
  }

  function screenToCanvas(point = {}, viewport = {}) {
    const view = normalizeViewport(viewport, { x: 0, y: 0, scale: 1 });
    return {
      x: (finiteNumber(point.x, 0) - view.x) / view.scale,
      y: (finiteNumber(point.y, 0) - view.y) / view.scale,
    };
  }

  function canvasToScreen(point = {}, viewport = {}) {
    const view = normalizeViewport(viewport, { x: 0, y: 0, scale: 1 });
    return {
      x: view.x + finiteNumber(point.x, 0) * view.scale,
      y: view.y + finiteNumber(point.y, 0) * view.scale,
    };
  }

  function wheelDelta(value, deltaMode = 0, viewportHeight = 0) {
    const delta = finiteNumber(value, 0);
    if (Number(deltaMode) === 1) return delta * 16;
    if (Number(deltaMode) === 2) return delta * Math.max(0, finiteNumber(viewportHeight, 0));
    return delta;
  }

  function wheelZoomFactor(delta) {
    const bounded = Math.max(
      -WHEEL_DELTA_MAX,
      Math.min(WHEEL_DELTA_MAX, -finiteNumber(delta, 0) * WHEEL_ZOOM_SENSITIVITY),
    );
    return Math.exp(bounded);
  }

  function zoomViewportAt(viewport, point, factor, fallbackScale = DEFAULT_VIEW.scale) {
    const view = normalizeViewport(viewport, { x: 0, y: 0, scale: 1 });
    const anchor = {
      x: finiteNumber(point?.x, 0),
      y: finiteNumber(point?.y, 0),
    };
    const before = screenToCanvas(anchor, view);
    const scale = normalizeScale(view.scale * finiteNumber(factor, 1), fallbackScale);
    return {
      x: anchor.x - before.x * scale,
      y: anchor.y - before.y * scale,
      scale,
    };
  }

  function panViewport(viewport, delta = {}) {
    const view = normalizeViewport(viewport, { x: 0, y: 0, scale: 1 });
    return {
      x: view.x + finiteNumber(delta.x, 0),
      y: view.y + finiteNumber(delta.y, 0),
      scale: view.scale,
    };
  }

  function gridBackgroundSize(scale, { baseSize = 34, minimum = 16, step = 5 } = {}) {
    let size = Math.max(0.000001, finiteNumber(baseSize, 34) * normalizeScale(scale, 1));
    const floor = Math.max(0.000001, finiteNumber(minimum, 16));
    const multiplier = Math.max(1, finiteNumber(step, 5));
    while (size < floor) size *= multiplier;
    return size;
  }

  function scaleLabel(scale) {
    return `${Math.round(normalizeScale(scale, 1) * 100)}%`;
  }

  return Object.freeze({
    DEFAULT_VIEW,
    SCALE_MAX,
    SCALE_MIN,
    canvasToScreen,
    gridBackgroundSize,
    normalizeScale,
    normalizeViewport,
    panViewport,
    scaleLabel,
    screenToCanvas,
    wheelDelta,
    wheelZoomFactor,
    zoomViewportAt,
  });
});
