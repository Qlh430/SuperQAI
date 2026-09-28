(function initCanvasComfyRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasComfyRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasComfyRules() {
  function normalizePadding(value = {}) {
    const normalize = (item, fallback) =>
      Math.max(0, Math.min(1600, Math.round(Number(item ?? fallback) / 8) * 8));
    return {
      left: normalize(value.left, 200),
      top: normalize(value.top, 0),
      right: normalize(value.right, 200),
      bottom: normalize(value.bottom, 0),
    };
  }

  function setPadding(node, padding) {
    node.dataset.comfyOutpaintLeft = String(padding.left);
    node.dataset.comfyOutpaintTop = String(padding.top);
    node.dataset.comfyOutpaintRight = String(padding.right);
    node.dataset.comfyOutpaintBottom = String(padding.bottom);
  }

  function getPadding(node) {
    return normalizePadding({
      left: node.dataset.comfyOutpaintLeft,
      top: node.dataset.comfyOutpaintTop,
      right: node.dataset.comfyOutpaintRight,
      bottom: node.dataset.comfyOutpaintBottom,
    });
  }

  function normalizeQwenAngle(value = {}) {
    const normalize = (item, fallback, min, max, decimals = 0) => {
      const number = Number(item ?? fallback);
      if (!Number.isFinite(number)) return fallback;
      const factor = 10 ** decimals;
      const rounded = Math.round(number * factor) / factor;
      return Math.max(min, Math.min(max, rounded));
    };
    return {
      horizontal: normalize(value.horizontal, 49, -180, 180),
      vertical: normalize(value.vertical, 0, -30, 60),
      zoom: normalize(value.zoom, 5, 0, 10, 1),
    };
  }

  function setQwenAngle(node, value = {}) {
    const angle = normalizeQwenAngle(value);
    node.dataset.comfyQwenHorizontal = String(angle.horizontal);
    node.dataset.comfyQwenVertical = String(angle.vertical);
    node.dataset.comfyQwenZoom = String(angle.zoom);
    return angle;
  }

  function getQwenAngle(node) {
    return normalizeQwenAngle({
      horizontal: node.dataset.comfyQwenHorizontal,
      vertical: node.dataset.comfyQwenVertical,
      zoom: node.dataset.comfyQwenZoom,
    });
  }

  function describeQwenHorizontal(value) {
    const angle = Number(value) || 0;
    const abs = Math.abs(angle);
    const side = angle >= 0 ? "\u53f3" : "\u5de6";
    if (abs < 12) return "\u6b63\u9762";
    if (abs < 68) return side + "\u524d\u65b9";
    if (abs < 112) return side + "\u4fa7\u9762";
    if (abs < 158) return side + "\u540e\u65b9";
    return "\u80cc\u9762";
  }

  function describeQwenVertical(value) {
    const angle = Number(value) || 0;
    if (angle > 18) return "\u4fef\u89c6";
    if (angle < -18) return "\u4ef0\u89c6";
    return "\u5e73\u89c6";
  }

  function describeQwenZoom(value) {
    const zoom = Number(value) || 0;
    if (zoom > 6.7) return "\u8fd1\u666f";
    if (zoom < 3.4) return "\u8fdc\u666f";
    return "\u4e2d\u666f";
  }

  function isResolutionMode(mode) {
    return ["upscale", "upscale2"].includes(mode);
  }

  function normalizeResolution(value) {
    const resolution = String(value || "2048");
    if (resolution === "8192") return "6144";
    return ["2048", "4096", "6144"].includes(resolution) ? resolution : "2048";
  }

  return Object.freeze({
    normalizePadding,
    setPadding,
    getPadding,
    normalizeQwenAngle,
    setQwenAngle,
    getQwenAngle,
    describeQwenHorizontal,
    describeQwenVertical,
    describeQwenZoom,
    isResolutionMode,
    normalizeResolution,
  });
});
