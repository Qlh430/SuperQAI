(function initCanvasPrimitiveLayer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasPrimitiveLayer = api.CanvasPrimitiveLayer;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasPrimitiveLayer() {
  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nodeBounds(item = {}) {
    if (item.bounds && typeof item.bounds === "object") {
      return {
        left: finite(item.bounds.left),
        top: finite(item.bounds.top),
        right: finite(item.bounds.right, finite(item.bounds.left) + 1),
        bottom: finite(item.bounds.bottom, finite(item.bounds.top) + 1),
      };
    }
    const left = finite(item.x);
    const top = finite(item.y);
    return {
      left,
      top,
      right: left + Math.max(1, finite(item.width, 1)),
      bottom: top + Math.max(1, finite(item.height, 1)),
    };
  }

  function aggregateId(item = {}, index = 0) {
    return String(item.id || `lod:${item.level ?? 0}:${item.tileX ?? index}:${item.tileY ?? 0}`);
  }

  class CanvasPrimitiveLayer {
    constructor({ canvas, devicePixelRatio = 1 } = {}) {
      if (!canvas?.getContext) throw new Error("Canvas primitive layer requires a canvas.");
      const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
      if (!context) throw new Error("Canvas primitive layer requires a 2D context.");
      this.canvas = canvas;
      this.context = context;
      this.devicePixelRatio = Math.max(1, finite(devicePixelRatio, 1));
      this.width = 0;
      this.height = 0;
      this.hitRegions = [];
      this.lastRenderCount = 0;
    }

    resize(width, height) {
      const nextWidth = Math.max(0, finite(width));
      const nextHeight = Math.max(0, finite(height));
      const pixelWidth = Math.max(1, Math.round(nextWidth * this.devicePixelRatio));
      const pixelHeight = Math.max(1, Math.round(nextHeight * this.devicePixelRatio));
      this.width = nextWidth;
      this.height = nextHeight;
      if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
      if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
      this.canvas.style.width = `${nextWidth}px`;
      this.canvas.style.height = `${nextHeight}px`;
      this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
      this.clear();
    }

    clear() {
      this.context.clearRect(0, 0, this.width, this.height);
      this.hitRegions = [];
      this.lastRenderCount = 0;
    }

    toScreen(x, y, transform, originX, originY) {
      const scale = Math.max(0.000001, finite(transform?.scale, 1));
      return {
        x: originX + (finite(x) - finite(transform?.x)) * scale,
        y: originY + (finite(y) - finite(transform?.y)) * scale,
      };
    }

    drawConnection(item, transform, originX, originY) {
      const from = item.from || {};
      const to = item.to || {};
      const start = this.toScreen(item.fromX ?? from.x, item.fromY ?? from.y, transform, originX, originY);
      const end = this.toScreen(item.toX ?? to.x, item.toY ?? to.y, transform, originX, originY);
      const context = this.context;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.strokeStyle = "rgba(110, 129, 168, 0.38)";
      context.lineWidth = 1;
      context.stroke();
    }

    drawNode(item, index, transform, originX, originY) {
      const bounds = nodeBounds(item);
      const topLeft = this.toScreen(bounds.left, bounds.top, transform, originX, originY);
      const bottomRight = this.toScreen(bounds.right, bounds.bottom, transform, originX, originY);
      const width = Math.max(2, bottomRight.x - topLeft.x);
      const height = Math.max(2, bottomRight.y - topLeft.y);
      const count = Math.max(0, Math.trunc(finite(item.count ?? item.nodeCount, 0)));
      const context = this.context;
      context.fillStyle = "rgba(93, 109, 255, 0.20)";
      context.fillRect(topLeft.x, topLeft.y, width, height);
      context.strokeStyle = "rgba(93, 109, 255, 0.72)";
      context.lineWidth = 1;
      context.strokeRect?.(topLeft.x, topLeft.y, width, height);
      const typeCounts = item.typeCounts && typeof item.typeCounts === "object" ? item.typeCounts : {};
      const dominantType = Object.entries(typeCounts)
        .sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || "node";
      context.fillStyle = "rgba(28, 36, 64, 0.82)";
      context.font = "11px system-ui, sans-serif";
      context.fillText(`${count || 1} · ${dominantType}`, topLeft.x + 6, topLeft.y + 15);
      this.hitRegions.push({
        id: aggregateId(item, index),
        item,
        left: topLeft.x,
        top: topLeft.y,
        right: topLeft.x + width,
        bottom: topLeft.y + height,
      });
    }

    render({ lodNodes = [], lodConnections = [], transform = {} } = {}) {
      this.clear();
      const originX = this.width / 2;
      const originY = this.height / 2;
      const connections = Array.isArray(lodConnections) ? lodConnections : [];
      const nodes = Array.isArray(lodNodes) ? lodNodes : [];
      connections.forEach((item) => this.drawConnection(item, transform, originX, originY));
      nodes.forEach((item, index) => this.drawNode(item, index, transform, originX, originY));
      this.lastRenderCount = nodes.length + connections.length;
      return { nodeCount: nodes.length, connectionCount: connections.length };
    }

    hitTest(x, y) {
      const pointX = finite(x, Number.NaN);
      const pointY = finite(y, Number.NaN);
      if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
      for (let index = this.hitRegions.length - 1; index >= 0; index -= 1) {
        const region = this.hitRegions[index];
        if (
          pointX >= region.left && pointX <= region.right
          && pointY >= region.top && pointY <= region.bottom
        ) return { id: region.id, item: region.item };
      }
      return null;
    }

    getDiagnostics() {
      return {
        width: this.width,
        height: this.height,
        hitRegionCount: this.hitRegions.length,
        lastRenderCount: this.lastRenderCount,
      };
    }
  }

  return { CanvasPrimitiveLayer, nodeBounds, aggregateId };
});
