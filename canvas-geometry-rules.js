(function exposeCanvasGeometryRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGeometryRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGeometryRules() {
  "use strict";

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const left = finiteNumber(rect.left, NaN);
    const top = finiteNumber(rect.top, NaN);
    const right = finiteNumber(rect.right, NaN);
    const bottom = finiteNumber(rect.bottom, NaN);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      right: Math.max(left, right),
      bottom: Math.max(top, bottom),
    };
  }

  function rectFromPointSize(point = {}, width, height, { fallbackWidth = 0, fallbackHeight = 0 } = {}) {
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    const safeWidth = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : fallbackWidth;
    const safeHeight = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : fallbackHeight;
    const left = finiteNumber(point.x, 0);
    const top = finiteNumber(point.y, 0);
    return {
      left,
      top,
      right: left + safeWidth,
      bottom: top + safeHeight,
    };
  }

  function rectFromPoints(start = {}, end = {}) {
    const startX = finiteNumber(start.x, 0);
    const startY = finiteNumber(start.y, 0);
    const endX = finiteNumber(end.x, 0);
    const endY = finiteNumber(end.y, 0);
    return {
      left: Math.min(startX, endX),
      top: Math.min(startY, endY),
      right: Math.max(startX, endX),
      bottom: Math.max(startY, endY),
    };
  }

  function rectCenter(rect) {
    const normalized = normalizeRect(rect);
    if (!normalized) return null;
    return {
      x: (normalized.left + normalized.right) / 2,
      y: (normalized.top + normalized.bottom) / 2,
    };
  }

  function pointInRect(point, rect, { inclusive = true, requireArea = false } = {}) {
    const normalized = normalizeRect(rect);
    if (!normalized || !point) return false;
    if (requireArea && (normalized.right <= normalized.left || normalized.bottom <= normalized.top)) return false;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const leftHit = inclusive ? x >= normalized.left : x > normalized.left;
    const rightHit = inclusive ? x <= normalized.right : x < normalized.right;
    const topHit = inclusive ? y >= normalized.top : y > normalized.top;
    const bottomHit = inclusive ? y <= normalized.bottom : y < normalized.bottom;
    return leftHit && rightHit && topHit && bottomHit;
  }

  function rectsIntersect(leftRect, rightRect, { inclusive = false } = {}) {
    const left = normalizeRect(leftRect);
    const right = normalizeRect(rightRect);
    if (!left || !right) return false;
    if (inclusive) {
      return left.left <= right.right
        && left.right >= right.left
        && left.top <= right.bottom
        && left.bottom >= right.top;
    }
    return left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top;
  }

  function unionRects(rects) {
    let result = null;
    (Array.isArray(rects) ? rects : []).forEach((rect) => {
      const normalized = normalizeRect(rect);
      if (!normalized) return;
      if (!result) {
        result = { ...normalized };
        return;
      }
      result.left = Math.min(result.left, normalized.left);
      result.top = Math.min(result.top, normalized.top);
      result.right = Math.max(result.right, normalized.right);
      result.bottom = Math.max(result.bottom, normalized.bottom);
    });
    return result;
  }

  return Object.freeze({
    normalizeRect,
    pointInRect,
    rectCenter,
    rectFromPointSize,
    rectFromPoints,
    rectsIntersect,
    unionRects,
  });
});
