(function initCanvasSceneLayer(root, factory) {
  const api = factory(typeof module === "object" && module.exports
    ? require("./canvas-virtualization-rules") : root.CanvasVirtualizationRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasSceneLayer = api.CanvasSceneLayer;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasSceneLayer(geometryRules) {
  const SURFACES = Object.freeze({
    image: "#25262a",
    upload: "#25262a",
    gallery: "#24262b",
    group: "#28282c",
    text: "#2a2925",
    note: "#2f2c20",
    comfy: "#24282b",
    llm: "#27252d",
    video: "#24272b",
    "video-api": "#24272b",
    midjourney: "#242a2b",
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
      // Present pixels and the CSS camera transform in the same compositor frame.
      this.context = canvas.getContext("2d", { alpha: true });
      const makeBuffer = typeof createBuffer === "function"
        ? createBuffer
        : () => canvas.ownerDocument?.createElement?.("canvas")
          || (typeof OffscreenCanvas === "function" ? new OffscreenCanvas(1, 1) : null);
      this.buffer = makeBuffer();
      if (!this.context || !this.buffer?.getContext) {
        throw new Error("Canvas scene layer requires visible and buffer 2D contexts.");
      }
      this.bufferContext = this.buffer.getContext("2d", { alpha: true });
      this.devicePixelRatio = Math.max(1, finite(devicePixelRatio, 1));
      this.width = 0;
      this.height = 0;
      this.padding = 0;
      this.rasterWidth = 0;
      this.rasterHeight = 0;
      this.hitRegions = [];
      this.spriteCount = 0;
      this.connectionCount = 0;
      this.renderedGeometryCount = 0;
      this.lastTransform = null;
      this.currentTransform = null;
    }

    resize(width, height, padding = this.padding) {
      this.width = Math.max(0, finite(width));
      this.height = Math.max(0, finite(height));
      this.padding = Math.max(0, finite(padding, 0));
      this.rasterWidth = this.width + this.padding * 2;
      this.rasterHeight = this.height + this.padding * 2;
      const pixelWidth = Math.max(1, Math.round(this.rasterWidth * this.devicePixelRatio));
      const pixelHeight = Math.max(1, Math.round(this.rasterHeight * this.devicePixelRatio));
      // Only prepare the back buffer here. Resizing the visible canvas clears
      // it immediately, before the replacement scene has even been drawn.
      if (this.buffer.width !== pixelWidth) this.buffer.width = pixelWidth;
      if (this.buffer.height !== pixelHeight) this.buffer.height = pixelHeight;
      this.bufferContext.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    }

    clear() {
      this.context.clearRect(0, 0, this.rasterWidth, this.rasterHeight);
      this.bufferContext.clearRect(0, 0, this.rasterWidth, this.rasterHeight);
      this.hitRegions = [];
      this.spriteCount = 0;
      this.connectionCount = 0;
      this.renderedGeometryCount = 0;
      this.lastTransform = null;
      this.currentTransform = null;
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
      this.currentTransform = { ...transform };
      const previousScale = Math.max(0.000001, finite(this.lastTransform.scale, 1));
      const nextScale = Math.max(0.000001, finite(transform.scale, 1));
      const ratio = nextScale / previousScale;
      // The canvas is laid out at (-padding, -padding), so that base offset is
      // already included in its local coordinate space. Adding it again here
      // shifts the scene away from the pointer anchor whenever scale changes.
      const translateX = finite(transform.x) - ratio * finite(this.lastTransform.x);
      const translateY = finite(transform.y) - ratio * finite(this.lastTransform.y);
      this.canvas.style.transformOrigin = "0 0";
      this.canvas.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${ratio})`;
      return true;
    }

    needsRepaint(transform = {}, margin = 64) {
      if (!this.lastTransform) return true;
      const ratio = Math.max(0.000001, finite(transform.scale, 1)) / this.lastTransform.scale;
      const left = finite(transform.x) - ratio * this.lastTransform.x - this.padding * ratio;
      const top = finite(transform.y) - ratio * this.lastTransform.y - this.padding * ratio;
      const reserve = Math.min(margin, this.padding * ratio);
      return left > -reserve || top > -reserve
        || left + this.rasterWidth * ratio < this.width + reserve
        || top + this.rasterHeight * ratio < this.height + reserve;
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

    drawContain(context, image, left, top, width, height) {
      const sourceWidth = Math.max(1, finite(image.naturalWidth ?? image.width, 1));
      const sourceHeight = Math.max(1, finite(image.naturalHeight ?? image.height, 1));
      const ratio = Math.min(width / sourceWidth, height / sourceHeight);
      const drawnWidth = sourceWidth * ratio;
      const drawnHeight = sourceHeight * ratio;
      context.drawImage(
        image,
        left + (width - drawnWidth) / 2,
        top + (height - drawnHeight) / 2,
        drawnWidth,
        drawnHeight,
      );
    }

    drawNode(context, node, transform, textured, resolveTexture, resolveNodeBounds) {
      const imageNode = ["image", "upload"].includes(String(node.kind || ""));
      const texture = node.previewSource && typeof resolveTexture === "function"
        ? resolveTexture(node.previewSource, node, { cachedOnly: !textured }) : null;
      const ready = texture && typeof texture.then !== "function" && (texture.complete === undefined || texture.complete);
      const envelope = geometryRules.getNodeRect(node);
      const rect = imageNode ? (resolveNodeBounds?.(node) || geometryRules.getImageContentRect(envelope, {
        width: texture?.naturalWidth ?? texture?.width, height: texture?.naturalHeight ?? texture?.height,
      })) : envelope;
      const topLeft = this.toScreen(rect.left, rect.top, transform);
      const scale = Math.max(0.000001, finite(transform.scale, 1));
      const width = Math.max(0.25, (rect.right - rect.left) * scale);
      const height = Math.max(0.25, (rect.bottom - rect.top) * scale);
      if (!imageNode) {
        context.fillStyle = SURFACES[String(node.kind || "")] || "#25262a";
        context.fillRect(topLeft.x, topLeft.y, width, height);
        context.strokeStyle = "rgba(126, 146, 255, 0.68)";
        context.lineWidth = Math.min(1, Math.max(0.35, scale));
        context.strokeRect(topLeft.x, topLeft.y, width, height);
      }
      if (ready) {
        if (imageNode) context.drawImage(texture, topLeft.x, topLeft.y, width, height);
        else this.drawContain(context, texture, topLeft.x, topLeft.y, width, height);
      }
      if (!imageNode && node.title && width >= 96 && height >= 34) {
        context.fillStyle = "rgba(255,255,255,0.94)";
        context.font = `${Math.max(8, Math.min(13, 11 * scale))}px system-ui, sans-serif`;
        context.fillText(String(node.title).slice(0, 80), topLeft.x + 6, topLeft.y + 16, width - 12);
      }
      this.hitRegions.push({
        id: String(node.id),
        item: node,
        // Hit regions are kept in viewport coordinates while the backing canvas
        // draws at an offset padded origin.
        left: topLeft.x - this.padding,
        top: topLeft.y - this.padding,
        right: topLeft.x + width - this.padding,
        bottom: topLeft.y + height - this.padding,
      });
    }

    render({ visualNodes = [], visualConnections = [], texturedNodeIds = [], selectedIds = new Set(), transform = {}, resolveTexture, resolveNodeBounds } = {}) {
      const context = this.bufferContext;
      const drawTransform = {
        ...transform,
        x: finite(transform.x) + this.padding,
        y: finite(transform.y) + this.padding,
      };
      context.clearRect(0, 0, this.rasterWidth, this.rasterHeight);
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
              drawTransform,
            );
          }
        } else {
          connections.forEach((item) => this.drawConnection(context, item, drawTransform));
        }
        context.strokeStyle = "rgba(110, 129, 168, 0.38)";
        context.lineWidth = 1;
        context.stroke();
      }
      nodes.forEach(node => {
        this.drawNode(context, node, drawTransform, textured.has(String(node.id)), resolveTexture, resolveNodeBounds);
        const region = this.hitRegions.at(-1);
        if (region?.id === String(node.id) && selectedIds.has(region.id)) {
          context.strokeStyle = "#6691ff";
          context.lineWidth = 2;
          context.strokeRect(region.left + this.padding, region.top + this.padding, region.right - region.left, region.bottom - region.top);
        }
      });
      // Commit a complete buffer once; transparent pixels also replace the
      // previous scene, without exposing a clearRect between the two frames.
      if (this.canvas.width !== this.buffer.width) this.canvas.width = this.buffer.width;
      if (this.canvas.height !== this.buffer.height) this.canvas.height = this.buffer.height;
      this.canvas.style.width = `${this.rasterWidth}px`;
      this.canvas.style.height = `${this.rasterHeight}px`;
      this.canvas.style.inset = "auto";
      this.canvas.style.left = `${-this.padding}px`;
      this.canvas.style.top = `${-this.padding}px`;
      this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
      this.context.globalCompositeOperation = "copy";
      this.context.drawImage(this.buffer, 0, 0, this.rasterWidth, this.rasterHeight);
      this.context.globalCompositeOperation = "source-over";
      this.canvas.style.transform = "";
      this.canvas.style.transformOrigin = "0 0";
      this.lastTransform = {
        x: finite(transform.x),
        y: finite(transform.y),
        scale: Math.max(0.000001, finite(transform.scale, 1)),
      };
      this.spriteCount = nodes.length;
      this.currentTransform = { ...this.lastTransform };
      this.connectionCount = connectionCount;
      this.renderedGeometryCount = nodes.length;
      return { nodeCount: nodes.length, connectionCount };
    }

    hitTest(x, y) {
      const current = this.currentTransform || this.lastTransform;
      const previous = this.lastTransform;
      const ratio = current && previous ? current.scale / previous.scale : 1;
      const offsetX = current && previous ? current.x - previous.x * ratio : 0;
      const offsetY = current && previous ? current.y - previous.y * ratio : 0;
      const pointX = (finite(x, Number.NaN) - offsetX) / ratio;
      const pointY = (finite(y, Number.NaN) - offsetY) / ratio;
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

    getItemsInRect(rect = {}) {
      const current = this.currentTransform || this.lastTransform;
      const previous = this.lastTransform;
      const ratio = current && previous
        ? Math.max(0.000001, current.scale / previous.scale) : 1;
      const offsetX = current && previous
        ? current.x - previous.x * ratio : 0;
      const offsetY = current && previous
        ? current.y - previous.y * ratio : 0;
      const left = (finite(rect.left) - offsetX) / ratio;
      const top = (finite(rect.top) - offsetY) / ratio;
      const right = (finite(rect.right, left) - offsetX) / ratio;
      const bottom = (finite(rect.bottom, top) - offsetY) / ratio;
      return this.hitRegions
        .filter((region) => (
          region.left < right
          && region.right > left
          && region.top < bottom
          && region.bottom > top
        ))
        .map((region) => ({ id: region.id, item: region.item }));
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
