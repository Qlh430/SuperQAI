(function initCanvasSceneRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasSceneRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasSceneRules() {
  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeBounds(input = {}) {
    const left = finite(input.left);
    const top = finite(input.top);
    const right = finite(input.right, left);
    const bottom = finite(input.bottom, top);
    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      right: Math.max(left, right),
      bottom: Math.max(top, bottom),
    };
  }

  function normalizeVisualNode(row = {}, index = 0) {
    const x = finite(row.x);
    const y = finite(row.y);
    const width = Math.max(1, finite(row.width, 1));
    const height = Math.max(1, finite(row.height, 1));
    return {
      id: String(row.id ?? row.external_id ?? `scene-${index}`),
      kind: String(row.kind || "image"),
      x,
      y,
      width,
      height,
      zOrder: Math.trunc(finite(row.zOrder ?? row.z_order, index)),
      previewSource: String(row.previewSource ?? row.preview_source ?? row.source ?? ""),
      title: String(row.title || "").trim().slice(0, 120),
      _index: index,
    };
  }

  function intersects(node, bounds) {
    return node.x + node.width >= bounds.left
      && node.x <= bounds.right
      && node.y + node.height >= bounds.top
      && node.y <= bounds.bottom;
  }

  function exactGeometryKey(node) {
    return `${node.x}\u0000${node.y}\u0000${node.width}\u0000${node.height}`;
  }

  function selectVisibleSprites(rows, options = {}) {
    const bounds = normalizeBounds(options.bounds);
    const scale = Math.max(0.000001, finite(options.scale, 1));
    const maxTexturedSprites = Math.max(0, Math.trunc(finite(options.maxTexturedSprites, 5000)));
    const candidates = (Array.isArray(rows) ? rows : [])
      .map(normalizeVisualNode)
      .filter((node) => node.id && intersects(node, bounds))
      .sort((left, right) => right.zOrder - left.zOrder || right._index - left._index);
    const retained = [];
    const exactTop = new Set();
    const subpixelTop = new Set();

    for (const node of candidates) {
      const geometryKey = exactGeometryKey(node);
      if (exactTop.has(geometryKey)) continue;
      exactTop.add(geometryKey);
      const projectedWidth = node.width * scale;
      const projectedHeight = node.height * scale;
      if (projectedWidth < 1 && projectedHeight < 1) {
        const pixelX = Math.floor((node.x + node.width / 2 - bounds.left) * scale);
        const pixelY = Math.floor((node.y + node.height / 2 - bounds.top) * scale);
        const pixelKey = `${pixelX}:${pixelY}`;
        if (subpixelTop.has(pixelKey)) continue;
        subpixelTop.add(pixelKey);
      }
      retained.push(node);
    }

    retained.reverse();
    const texturedNodeIds = [...retained]
      .filter((node) => node.previewSource)
      .sort((left, right) => (
        right.width * right.height * scale * scale - left.width * left.height * scale * scale
        || right.zOrder - left.zOrder
      ))
      .slice(0, maxTexturedSprites)
      .map((node) => node.id);
    return {
      visualNodes: retained.map(({ _index, ...node }) => node),
      texturedNodeIds,
    };
  }

  return { normalizeBounds, normalizeVisualNode, selectVisibleSprites };
});
