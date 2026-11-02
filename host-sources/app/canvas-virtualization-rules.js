(function initCanvasVirtualizationRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasVirtualizationRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasVirtualizationRules() {
  const DEFAULT_CELL_SIZE = 768;
  const MOUNT_OVERSCAN_PX = 640;
  const RETAIN_OVERSCAN_PX = 960;
  const FRAME_BUDGET_MS = 8;
  const MAX_MOUNTS_PER_FRAME = 12;
  // Rich DOM nodes become layout-bound well before the old 800-node detail cap.
  const MAX_FULL_NODE_CANDIDATES = 80;

  const DEFAULT_NODE_SIZES = Object.freeze({
    group: { width: 360, height: 260 },
    "grid-editor": { width: 640, height: 480 },
    "director-3d": { width: 350, height: 350 },
    llm: { width: 360, height: 320 },
    "minimax-h3": { width: 420, height: 420 },
    midjourney: { width: 340, height: 430 },
    "video-api": { width: 292, height: 460 },
    "video-output": { width: 360, height: 320 },
    video: { width: 360, height: 280 },
    audio: { width: 360, height: 220 },
    comfy: { width: 380, height: 360 },
    loop: { width: 360, height: 300 },
    gallery: { width: 420, height: 360 },
    text: { width: 292, height: 180 },
    note: { width: 300, height: 220 },
    image: { width: 320, height: 240 },
    upload: { width: 320, height: 240 },
  });

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRect(rect) {
    const left = finiteNumber(rect?.left);
    const top = finiteNumber(rect?.top);
    const right = finiteNumber(rect?.right, left);
    const bottom = finiteNumber(rect?.bottom, top);
    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      right: Math.max(left, right),
      bottom: Math.max(top, bottom),
    };
  }

  function rectsIntersect(first, second) {
    if (!first || !second) return false;
    const a = normalizeRect(first);
    const b = normalizeRect(second);
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function getDefaultNodeSize(kind) {
    return DEFAULT_NODE_SIZES[String(kind || "image")] || DEFAULT_NODE_SIZES.image;
  }

  function getNodeRect(model) {
    const fallback = getDefaultNodeSize(model?.kind);
    const x = finiteNumber(model?.x);
    const y = finiteNumber(model?.y);
    const width = Math.max(1, finiteNumber(model?.width) > 0 ? finiteNumber(model.width) : fallback.width);
    const height = Math.max(1, finiteNumber(model?.height) > 0 ? finiteNumber(model.height) : fallback.height);
    return { left: x, top: y, right: x + width, bottom: y + height };
  }

  // The spatial index keeps the saved envelope (a conservative broad phase).
  // Paint, ports and pointer hits use this tighter rectangle, without moving
  // legacy boards or rewriting their automatic-size payloads on selection.
  function getImageContentRect(rect, media = {}) {
    const width = Number(media.width), height = Number(media.height);
    if (!(width > 0 && height > 0)) return { ...rect };
    const scale = Math.min((rect.right - rect.left) / width, (rect.bottom - rect.top) / height);
    const w = width * scale, h = height * scale;
    const left = rect.left + (rect.right - rect.left - w) / 2;
    const top = rect.top + (rect.bottom - rect.top - h) / 2;
    return { left, top, right: left + w, bottom: top + h };
  }

  function getViewportCanvasRect(viewport, transform, overscanPx = 0) {
    const scale = Math.max(0.01, finiteNumber(transform?.scale, 1));
    const overscan = Math.max(0, finiteNumber(overscanPx));
    const x = finiteNumber(transform?.x);
    const y = finiteNumber(transform?.y);
    const width = Math.max(0, finiteNumber(viewport?.width));
    const height = Math.max(0, finiteNumber(viewport?.height));
    return {
      left: (-x - overscan) / scale,
      top: (-y - overscan) / scale,
      right: (-x + width + overscan) / scale,
      bottom: (-y + height + overscan) / scale,
    };
  }

  function getConnectionBounds(from, to) {
    const fromX = finiteNumber(from?.x);
    const fromY = finiteNumber(from?.y);
    const toX = finiteNumber(to?.x);
    const toY = finiteNumber(to?.y);
    return {
      left: Math.min(fromX, toX),
      top: Math.min(fromY, toY),
      right: Math.max(fromX, toX),
      bottom: Math.max(fromY, toY),
    };
  }

  function chooseNodeLevel({ candidateCount, visibleCount, pinned } = {}) {
    if (pinned) return "full";
    const count = finiteNumber(candidateCount, finiteNumber(visibleCount));
    return count <= MAX_FULL_NODE_CANDIDATES ? "full" : "scene";
  }

  class GridSpatialIndex {
    constructor({ cellSize = DEFAULT_CELL_SIZE } = {}) {
      this.cellSize = Math.max(1, finiteNumber(cellSize, DEFAULT_CELL_SIZE));
      this.cells = new Map();
      this.entries = new Map();
    }

    get size() {
      return this.entries.size;
    }

    clear() {
      this.cells.clear();
      this.entries.clear();
    }

    has(id) {
      return this.entries.has(String(id));
    }

    getCellKeys(rect) {
      const value = normalizeRect(rect);
      const epsilon = 1e-7;
      const minX = Math.floor(value.left / this.cellSize);
      const minY = Math.floor(value.top / this.cellSize);
      const maxX = Math.floor((Math.max(value.left, value.right - epsilon)) / this.cellSize);
      const maxY = Math.floor((Math.max(value.top, value.bottom - epsilon)) / this.cellSize);
      const keys = [];
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) keys.push(`${x}:${y}`);
      }
      return keys;
    }

    upsert(id, rect) {
      const key = String(id);
      if (!key) return false;
      this.remove(key);
      const normalized = normalizeRect(rect);
      const keys = this.getCellKeys(normalized);
      this.entries.set(key, { rect: normalized, keys });
      keys.forEach((cellKey) => {
        if (!this.cells.has(cellKey)) this.cells.set(cellKey, new Set());
        this.cells.get(cellKey).add(key);
      });
      return true;
    }

    remove(id) {
      const key = String(id);
      const entry = this.entries.get(key);
      if (!entry) return false;
      entry.keys.forEach((cellKey) => {
        const cell = this.cells.get(cellKey);
        cell?.delete(key);
        if (cell && !cell.size) this.cells.delete(cellKey);
      });
      this.entries.delete(key);
      return true;
    }

    query(rect) {
      const normalized = normalizeRect(rect);
      const candidates = new Set();
      this.getCellKeys(normalized).forEach((cellKey) => {
        this.cells.get(cellKey)?.forEach((id) => candidates.add(id));
      });
      const result = [];
      candidates.forEach((id) => {
        const entry = this.entries.get(id);
        if (entry && rectsIntersect(entry.rect, normalized)) result.push(id);
      });
      return result;
    }
  }

  return {
    DEFAULT_CELL_SIZE,
    MOUNT_OVERSCAN_PX,
    RETAIN_OVERSCAN_PX,
    FRAME_BUDGET_MS,
    MAX_MOUNTS_PER_FRAME,
    MAX_FULL_NODE_CANDIDATES,
    DEFAULT_NODE_SIZES,
    GridSpatialIndex,
    finiteNumber,
    normalizeRect,
    rectsIntersect,
    getDefaultNodeSize,
    getNodeRect,
    getImageContentRect,
    getViewportCanvasRect,
    getConnectionBounds,
    chooseNodeLevel,
  };
});
