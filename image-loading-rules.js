(function initImageLoadingRules(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ImageLoadingRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DETAIL_SCALE = 1;
  const DETAIL_IDLE_MS = 300;
  const THUMBNAIL_MAX_SIDE = 768;
  const THUMBNAIL_QUALITY = 0.76;

  function getCanvasVisibleRect(viewport, transform, margin = 240) {
    const scale = Math.max(0.01, Number(transform?.scale) || 1);
    const left = (-Number(transform?.x || 0)) / scale;
    const top = (-Number(transform?.y || 0)) / scale;
    const pad = Math.max(0, Number(margin) || 0) / scale;
    return {
      left: left - pad,
      top: top - pad,
      right: left + Math.max(0, Number(viewport?.width) || 0) / scale + pad,
      bottom: top + Math.max(0, Number(viewport?.height) || 0) / scale + pad,
    };
  }

  function rectsIntersect(a, b) {
    return Boolean(
      a
      && b
      && Number(a.left) < Number(b.right)
      && Number(a.right) > Number(b.left)
      && Number(a.top) < Number(b.bottom)
      && Number(a.bottom) > Number(b.top),
    );
  }

  function chooseCanvasImageQuality({ visible, scale, detailReady, currentQuality, displayedMaxSide }) {
    if (!visible) return "unloaded";
    const needsOriginal = Number(scale) >= DETAIL_SCALE
      || Number(displayedMaxSide) > THUMBNAIL_MAX_SIDE;
    if (!needsOriginal) return "thumbnail";
    return Boolean(detailReady) || currentQuality === "original" ? "original" : "thumbnail";
  }

  function shouldGenerateThumbnail({ width, height, bytes }) {
    return Math.max(Number(width) || 0, Number(height) || 0) > 1600
      || Number(bytes) > 1024 * 1024;
  }

  return {
    DETAIL_SCALE,
    DETAIL_IDLE_MS,
    THUMBNAIL_MAX_SIDE,
    THUMBNAIL_QUALITY,
    getCanvasVisibleRect,
    rectsIntersect,
    chooseCanvasImageQuality,
    shouldGenerateThumbnail,
  };
});
