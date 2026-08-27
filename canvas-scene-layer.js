(function initCanvasSceneLayer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasSceneLayer = api.CanvasSceneLayer;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasSceneLayer() {
  const SURFACES = Object.freeze({
    image: "#25262a",
    upload: "#25262a",
    gallery: "#24262b",
    group: "#28282c",
    text: "#2a2925",
    comfy: "#24282b",
    llm: "#27252d",
    video: "#24272b",
    "video-output": "#24272b",
    audio: "#28262b",
  });

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  class CanvasSceneLayer {
    constructor({ canvas, devicePixelRatio = 1, createBuffer } = {}) {
      if (!canvas?.getContext) throw new Error("Canvas scene layer requires a canvas.");
      this.canvas = canvas;
      this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
      const makeBuffer = typeof createBuffer === "function"
        ? createBuffer
        : () => canvas.ownerDocument?.createElement?.("canvas")
          || (typeof OffscreenCanvas === "function" ? new OffscreenCanvas(1, 1) : null);
      this.buffer = makeBuffer();
      if (!this.context || !this.buffer?.getContext) {
        throw new Error("Canvas scene layer requires visible and buffer 2D contexts.");
      }
      this.bufferContext = this.buffer.getContext("2d", { alpha: true, desynchronized: true });
      this.devicePixelRatio = Math.max(1, finite(devicePixelRatio, 1));
      this.width = 0;
      this.height = 0;
      this.hitRegions = [];
      this.spriteCount = 0;
      this.connectionCount = 0;
      this.renderedGeometryCount = 0;
      this.lastTransform = null;
    }

    resize(width, height) {
      this.width = Math.max(0, finite(width));
      this.height = Math.max(0, finite(height));
      const pixelWidth = Math.max(1, Math.round(this.width * this.devicePixelRatio));
      const pixelHeight = Math.max(1, Math.round(this.height * this.devicePixelRatio));
      for (const target of [this.canvas, this.buffer]) {
        if (target.width !== pixelWidth) target.width = pixelWidth;
        if (target.height !== pixelHeight) target.height = pixelHeight;
      }
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
      this.bufferContext.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
      this.clear();
    }

    clear() {
      this.context.clearRect(0, 0, this.width, this.height);
      this.bufferContext.clearRect(0, 0, this.width, this.height);
      this.hitRegions = [];
      this.spriteCount = 0;
      this.connectionCount = 0;
      this.renderedGeometryCount = 0;
      this.lastTransform = null;
      this.canvas.style.transform = "";
      this.canvas.style.transformOrigin = "0 0";
    }

    toScreen(x, y, transform = {}) {
      const scale = Math.max(0.000001, finite(transform.scale, 1));
      return {
        x: finite(transform.x) + finite(x) * scale,
        y: finite(transform.y) + finite(y) * scale,
      };
    }

    reproject(transform = {}) {
      if (!this.lastTransform) return false;
      const previousScale = Math.max(0.000001, finite(this.lastTransform.scale, 1));
      const nextScale = Math.max(0.000001, finite(transform.scale, 1));
      const ratio = nextScale / previousScale;
      const translateX = finite(transform.x) - ratio * finite(this.lastTransform.x);
      const translateY = finite(transform.y) - ratio * finite(this.lastTransform.y);
      this.canvas.style.transformOrigin = "0 0";
      this.canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${ratio})`;
      return true;
    }

    drawConnection(context, item, transform) {
      this.drawConnectionSegment(
        context,
        item.fromX ?? item.from?.x,
        item.fromY ?? item.from?.y,
        item.toX ?? item.to?.x,
        item.toY ?? item.to?.y,
        transform,
      );
    }

    drawConnectionSegment(context, fromX, fromY, toX, toY, transform) {
      const start = this.toScreen(fromX, fromY, transform);
      const end = this.toScreen(toX, toY, transform);
      const distance = Math.max(24, Math.abs(end.x - start.x) * 0.45);
      context.moveTo(start.x, start.y);
      context.bezierCurveTo(
        start.x + distance,
        start.y,
        end.x - distance,
        end.y,
        end.x,
        end.y,
      );
    }

    drawCover(context, image, left, top, width, height) {
      const sourceWidth = Math.max(1, finite(image.naturalWidth ?? image.width, 1));
      const sourceHeight = Math.max(1, finite(image.naturalHeight ?? image.height, 1));
      const sourceRatio = sourceWidth / sourceHeight;
      const targetRatio = width / height;
      let sx = 0;
      let sy = 0;
      let sw = sourceWidth;
      let sh = sourceHeight;
      if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
      } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
      }
      context.drawImage(image, sx, sy, sw, sh, left, top, width, height);
    }

    drawNode(context, node, transform, textured, resolveTexture) {
      const topLeft = this.toScreen(node.x, node.y, transform);
      const scale = Math.max(0.000001, finite(transform.scale, 1));
      const width = Math.max(0.25, finite(node.width, 1) * scale);
      const height = Math.max(0.25, finite(node.height, 1) * scale);
      context.fillStyle = SURFACES[String(node.kind || "")] || "#25262a";
      context.fillRect(topLeft.x, topLeft.y, width, height);
      context.strokeStyle = "rgba(126, 146, 255, 0.68)";
      context.lineWidth = Math.min(1, Math.max(0.35, scale));
      context.strokeRect(topLeft.x, topLeft.y, width, height);
      if (textured && node.previewSource && typeof resolveTexture === "function") {
        const texture = resolveTexture(node.previewSource, node);
        if (texture && typeof texture.then !== "function" && (texture.complete === undefined || texture.complete)) {
          this.drawCover(context, texture, topLeft.x, topLeft.y, width, height);
        }
      }
      if (node.title && width >= 96 && height >= 34) {
        context.fillStyle = "rgba(255,255,255,0.94)";
        context.font = `${Math.max(8, Math.min(13, 11 * scale))}px system-ui, sans-serif`;
        context.fillText(String(node.title).slice(0, 80), topLeft.x + 6, topLeft.y + 16, width - 12);
      }
      this.hitRegions.push({
        id: String(node.id),
        item: node,
        left: topLeft.x,
        top: topLeft.y,
        right: topLeft.x + width,
        bottom: topLeft.y + height,
      });
    }

    render({ visualNodes = [], visualConnections = [], texturedNodeIds = [], transform = {}, resolveTexture } = {}) {
      const context = this.bufferContext;
      context.clearRect(0, 0, this.width, this.height);
      this.hitRegions = [];
      const connections = Array.isArray(visualConnections) ? visualConnections : [];
      const compactConnections = connections.length > 0 && typeof connections[0] === "number";
      const connectionCount = compactConnections ? Math.floor(connections.length / 4) : connections.length;
      const nodes = (Array.isArray(visualNodes) ? visualNodes : []).map((node) => (
        Array.isArray(node)
          ? {
              id: String(node[0] || ""),
              kind: String(node[1] || "image"),
              x: finite(node[2]),
              y: finite(node[3]),
              width: finite(node[4], 1),
              height: finite(node[5], 1),
              zOrder: finite(node[6]),
              previewSource: String(node[7] || ""),
              title: String(node[8] || "节点"),
            }
          : node
      ))
        .sort((left, right) => finite(left.zOrder) - finite(right.zOrder));
      const textured = new Set(Array.isArray(texturedNodeIds) ? texturedNodeIds.map(String) : []);
      if (connectionCount) {
        context.beginPath();
        if (compactConnections) {
          for (let index = 0; index < connectionCount; index += 1) {
            const offset = index * 4;
            this.drawConnectionSegment(
              context,
              connections[offset],
              connections[offset + 1],
              connections[offset + 2],
              connections[offset + 3],
              transform,
            );
          }
        } else {
          connections.forEach((item) => this.drawConnection(context, item, transform));
        }
        context.strokeStyle = "rgba(110, 129, 168, 0.38)";
        context.lineWidth = 1;
        context.stroke();
      }
      nodes.forEach((node) => this.drawNode(
        context,
        node,
        transform,
        textured.has(String(node.id)),
        resolveTexture,
      ));
      this.context.clearRect(0, 0, this.width, this.height);
      this.context.drawImage(this.buffer, 0, 0, this.width, this.height);
      this.canvas.style.transform = "";
      this.canvas.style.transformOrigin = "0 0";
      this.lastTransform = {
        x: finite(transform.x),
        y: finite(transform.y),
        scale: Math.max(0.000001, finite(transform.scale, 1)),
      };
      this.spriteCount = nodes.length;
      this.connectionCount = connectionCount;
      this.renderedGeometryCount = nodes.length;
      return { nodeCount: nodes.length, connectionCount };
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
        spriteCount: this.spriteCount,
        connectionCount: this.connectionCount,
        renderedGeometryCount: this.renderedGeometryCount,
        aggregateCardCount: 0,
        blankNodeCount: 0,
      };
    }
  }

  return { CanvasSceneLayer, SURFACES };
});
