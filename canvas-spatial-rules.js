const BASE_TILE_SIZE = 256;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBounds(input = {}) {
  const x1 = finite(input.left);
  const x2 = finite(input.right, x1);
  const y1 = finite(input.top);
  const y2 = finite(input.bottom, y1);
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

function padRtreeBounds(input) {
  const bounds = normalizeBounds(input);
  const magnitude = Math.max(1, ...Object.values(bounds).map((value) => Math.abs(value)));
  const padding = Math.max(0.01, magnitude * 0.0000002);
  return {
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  };
}

function getConnectionBounds(fromRect, toRect) {
  const from = normalizeBounds(fromRect);
  const to = normalizeBounds(toRect);
  return normalizeBounds({
    left: (from.left + from.right) / 2,
    top: (from.top + from.bottom) / 2,
    right: (to.left + to.right) / 2,
    bottom: (to.top + to.bottom) / 2,
  });
}

function chooseLodLevel(scale, candidateCount) {
  const safeCount = Math.max(0, finite(candidateCount));
  if (safeCount <= 800) return 0;
  return Math.max(1, Math.ceil(Math.log2(Math.max(1, safeCount / 400))));
}

function getTileAddress(level, x, y) {
  const safeLevel = Math.max(0, Math.trunc(finite(level)));
  const tileSize = BASE_TILE_SIZE * (2 ** safeLevel);
  return {
    level: safeLevel,
    tileX: Math.floor(finite(x) / tileSize),
    tileY: Math.floor(finite(y) / tileSize),
    tileSize,
  };
}

module.exports = {
  BASE_TILE_SIZE,
  normalizeBounds,
  padRtreeBounds,
  getConnectionBounds,
  chooseLodLevel,
  getTileAddress,
};
