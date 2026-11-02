(function initCanvasAgentFocusRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentFocusRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentFocusRules() {
  function finite(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeBounds(bounds = {}) {
    const left = finite(bounds.left, 0);
    const top = finite(bounds.top, 0);
    const right = finite(bounds.right, left + 1);
    const bottom = finite(bounds.bottom, top + 1);
    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      right: Math.max(left, right),
      bottom: Math.max(top, bottom),
    };
  }

  function calculateFocusTransform({ bounds, viewport, currentScale, targetCount } = {}) {
    const normalized = normalizeBounds(bounds);
    const safeWidth = Math.max(1, finite(viewport?.width, 1));
    const safeHeight = Math.max(1, finite(viewport?.height, 1));
    const boundsWidth = Math.max(1, normalized.right - normalized.left);
    const boundsHeight = Math.max(1, normalized.bottom - normalized.top);
    const single = Math.max(0, finite(targetCount, 0)) === 1;
    const fallbackScale = clamp(finite(currentScale, 1), 0.05, 1.25);
    const proposedScale = single
      ? (safeHeight * 0.55) / boundsHeight
      : Math.min((safeWidth * 0.76) / boundsWidth, (safeHeight * 0.76) / boundsHeight);
    const scale = Number.isFinite(proposedScale)
      ? (single ? clamp(proposedScale, 0.65, 1.25) : clamp(proposedScale, 0.05, 1))
      : fallbackScale;
    const centerX = (normalized.left + normalized.right) / 2;
    const centerY = (normalized.top + normalized.bottom) / 2;
    return {
      scale,
      x: safeWidth / 2 - centerX * scale,
      y: safeHeight / 2 - centerY * scale,
      visibleRatio: clamp(Math.max(
        (boundsWidth * scale) / safeWidth,
        (boundsHeight * scale) / safeHeight,
      ), 0, 1),
    };
  }

  return Object.freeze({ calculateFocusTransform });
});
