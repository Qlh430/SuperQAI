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

  function colorWithAlpha(value, alpha, fallback) {
    const color = String(value || '').trim();
    const match = color.match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const red = parseInt(match[1].slice(0, 2), 16);
    const green = parseInt(match[1].slice(2, 4), 16);
    const blue = parseInt(match[1].slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  const ICON_PATHS = Object.freeze({
    type: 'M4 7V4h16v3M9 20h6M12 4v16',
    image: 'M3 5h18v14H3zM7.5 9.5h.01M4 17l5-5 4 4 2-2 5 5',
    'image-plus': 'M3 5h18v14H3zM7.5 9.5h.01M4 17l5-5 4 4 2-2 5 5M18 2v6M15 5h6',
    video: 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm12 4 6-3v10l-6-3',
    film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4',
    sparkles: 'm12 3-1.4 4.6L6 9l4.6 1.4L12 15l1.4-4.6L18 9l-4.6-1.4L12 3ZM19 15l-.8 2.2L16 18l2.2.8L19 21l.8-2.2L22 18l-2.2-.8L19 15ZM5 15l-.7 1.8L2.5 18l1.8.7L5 20.5l.7-1.8 1.8-.7-1.8-.7L5 15Z',
    'wand-sparkles': 'm15 4 5 5M4 20l11-11M18 15l-.8 2.2L15 18l2.2.8L18 21l.8-2.2L21 18l-2.2-.8L18 15Z',
    workflow: 'M5 4h5v5H5zM14 15h5v5h-5zM14 4h5v5h-5zM10 6.5h4M16.5 9v6M10 17.5h4',
    bot: 'M8 10h.01M16 10h.01M9 15h6M12 3v3M5 8h14v10H5z',
    'sticky-note': 'M5 3h14v12l-5 6H5zM14 21v-6h5',
    'audio-lines': 'M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4',
    clapperboard: 'M4 5h16v15H4zM4 9h16M8 5l3 4M14 5l3 4',
    images: 'M4 4h14v14H4zM7 7h14v14H7zM9 17l3-3 3 3 2-2 3 3',
    'layers-3': 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
    'play-square': 'M4 4h16v16H4zM10 8l6 4-6 4z',
    'layout-grid': 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    box: 'M4 7 12 3l8 4-8 4-8-4ZM4 7v10l8 4 8-4V7M12 11v10',
    'repeat-2': 'm17 2 4 4-4 4M3 6h18M7 22l-4-4 4-4M21 18H3',
  });

  function drawNodeIcon(context, icon, left, top, size, color) {
    const dimension = Math.max(1, finite(size, 12));
    context.save();
    context.translate(left, top);
    context.scale(dimension / 24, dimension / 24);
    context.strokeStyle = color;
    context.lineWidth = 2.7;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const path = ICON_PATHS[String(icon || '')] || ICON_PATHS.box;
    if (typeof Path2D === 'function') context.stroke(new Path2D(path));
    else { context.strokeRect(5, 5, 14, 14); context.beginPath(); context.moveTo(8, 12); context.lineTo(16, 12); context.stroke(); }
    context.restore();
  }

  function statusColor(state, theme) {
    if (state === 'failed') return theme?.danger || '#ff4d6d';
    if (state === 'running') return theme?.primary || '#00ff41';
    if (state === 'done') return theme?.success || theme?.primary || '#00ff41';
    return theme?.muted || '#888';
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
      this.renderCount = 0;
      this.reprojectCount = 0;
      this.candidatesRead = 0;
      this.visualSummary = { icon: 0, title: 0, kind: 0, tag: 0, status: 0, colored: 0 };
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
      this.visualSummary = { icon: 0, title: 0, kind: 0, tag: 0, status: 0, colored: 0 };
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
      this.reprojectCount += 1;
      this.currentTransform = { ...transform };
      const previousScale = Math.max(0.000001, finite(this.lastTransform.scale, 1));
      const nextScale = Math.max(0.000001, finite(transform.scale, 1));
      const ratio = nextScale / previousScale;
      // Raster coordinates include padding, but the element's -padding layout
      // offset is outside its CSS scale. Cancel the scaled padding as well.
      const translateX = finite(transform.x) - ratio * finite(this.lastTransform.x) + (1 - ratio) * this.padding;
      const translateY = finite(transform.y) - ratio * finite(this.lastTransform.y) + (1 - ratio) * this.padding;
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

    drawNode(context, node, transform, textured, resolveTexture, resolveNodeBounds, resolveNodeLabel, resolveNodeVisualGeometry, renderBounds) {
      const imageNode = ["image", "upload"].includes(String(node.kind || ""));
      const visuals = globalThis.CanvasNodeVisuals;
      const texture = !visuals && node.previewSource && typeof resolveTexture === "function"
        ? resolveTexture(node.previewSource, node, { cachedOnly: !textured }) : null;
      const ready = texture && typeof texture.then !== "function" && (texture.complete === undefined || texture.complete);
      const envelope = geometryRules.getNodeRect(node);
      const geometry = node.visualGeometry || resolveNodeVisualGeometry?.(node.id) || null;
      const rect = geometry?.outerBounds || resolveNodeBounds?.(node) || (imageNode ? geometryRules.getImageContentRect(envelope, {
        width: texture?.naturalWidth ?? texture?.width, height: texture?.naturalHeight ?? texture?.height,
      }) : envelope);
      const mediaRect = geometry?.mediaBounds || geometry?.contentBounds || rect;
      const topLeft = this.toScreen(rect.left, rect.top, transform);
      const scale = Math.max(0.000001, finite(transform.scale, 1));
      const width = Math.max(0.25, (rect.right - rect.left) * scale);
      const height = Math.max(0.25, (rect.bottom - rect.top) * scale);
      const mediaTopLeft = this.toScreen(mediaRect.left, mediaRect.top, transform);
      const mediaWidth = Math.max(0.25, (mediaRect.right - mediaRect.left) * scale);
      const mediaHeight = Math.max(0.25, (mediaRect.bottom - mediaRect.top) * scale);
      if (renderBounds && (
        topLeft.x + width < renderBounds.left
        || topLeft.y + height < renderBounds.top
        || topLeft.x > renderBounds.right
        || topLeft.y > renderBounds.bottom
      )) return false;
      const rich = node.representation !== 'canvas' && width >= 140;
      const bodySurface = geometry?.bodySurface ?? true;
      const isGroup = node.kind === 'group';
      if (bodySurface) {
          context.fillStyle = node.kind==='note' ? (node.visualContent || visuals?.project(node))?.paperColor || '#e6d990'
            : isGroup ? 'rgba(255,255,255,.06)' : this.theme?.card || SURFACES[String(node.kind || "")] || "#1a1a1a";
        context.beginPath();
        const radius = Math.min(finite(geometry?.borderRadius, 16) * scale, width / 2, height / 2);
        context.roundRect(topLeft.x, topLeft.y, width, height, radius);
        context.fill();
        if(isGroup && node.groupColor){context.fillStyle=colorWithAlpha(node.groupColor,.16,'rgba(255,255,255,.07)');context.fill();}
        const visualState = node.visualState || 'normal';
        context.strokeStyle = ['selected','focused','connecting'].includes(visualState)
          ? this.theme?.primary || '#00ff41'
          : visualState === 'hover'
            ? colorWithAlpha(this.theme?.muted, .72, this.theme?.border || '#2a2a2a')
            : isGroup ? colorWithAlpha(node.groupColor,.58,'rgba(255,255,255,.22)') : this.theme?.border || '#2a2a2a';
        context.lineWidth = ['selected','focused','connecting'].includes(visualState) ? Math.min(2, Math.max(1, 2 * scale)) : Math.min(1, Math.max(0.35, scale));
        context.stroke();
      }
      if (visuals && geometry) {
        visuals.paint(context, node.visualContent || visuals.project(node), geometry, transform, {theme:this.theme,resolveTexture,node,cachedOnly:!textured});
      } else if (ready) {
        context.save();
        context.beginPath();context.roundRect(mediaTopLeft.x, mediaTopLeft.y, mediaWidth, mediaHeight, Math.min(finite(geometry?.borderRadius, 16) * scale, mediaWidth / 2, mediaHeight / 2));context.clip();
        this.drawContain(context, texture, mediaTopLeft.x, mediaTopLeft.y, mediaWidth, mediaHeight);
        context.restore();
      }
      const identityColor = node.nodeColor || node.groupColor || this.theme?.muted || '#888';
      if (node.icon) this.visualSummary.icon += 1;
      if (node.title) this.visualSummary.title += 1;
      if (node.kindLabel) this.visualSummary.kind += 1;
      if (node.tag?.name) this.visualSummary.tag += 1;
      if (node.status?.text) this.visualSummary.status += 1;
      if (node.nodeColor || node.groupColor) this.visualSummary.colored += 1;
      const header = geometry?.headerBounds || {left:rect.left,top:rect.top-48,right:rect.right,bottom:rect.top};
      const headerTop = this.toScreen(header.left, header.top, transform);
      if (!isGroup) headerTop.y -= 8;
      const headerWidth = Math.max(1,(header.right-header.left)*scale);
      const iconSize = 16 * scale;
      if (isGroup) {
        context.fillStyle=this.theme?.muted||'#888';context.font=`500 ${13*scale}px system-ui, sans-serif`;
        context.fillText(String(node.groupTitle||node.title||'组'),headerTop.x,headerTop.y+18*scale,Math.max(1,headerWidth-72*scale));
        context.font=`400 ${12*scale}px system-ui, sans-serif`;context.textAlign='right';
        context.fillText(`${node.groupMembers?.length||0} 个节点`,headerTop.x+headerWidth,headerTop.y+18*scale);context.textAlign='start';
      } else if (headerWidth > 0) {
        drawNodeIcon(context, node.icon || 'box', headerTop.x, headerTop.y + 16 * scale, iconSize, identityColor);
        if (node.title) {
          context.fillStyle = this.theme?.muted || '#888';
          context.font = `500 ${16 * scale}px system-ui, sans-serif`;
          const titleLeft = headerTop.x + 23 * scale;
          const reservedTagWidth = node.tag?.name ? Math.min(headerWidth * .55, 220) : 0;
          const titleWidth = Math.max(1,headerWidth-titleLeft+headerTop.x-reservedTagWidth-4);
          context.save(); context.beginPath(); context.rect(titleLeft, headerTop.y + 10 * scale, titleWidth, 28 * scale); context.clip();
          context.fillText(String(node.title).slice(0, 80), titleLeft, headerTop.y + 29.6 * scale); context.restore();
        }
      }
      if (!visuals && node.kind === 'text' && node.text && !ready) {
        context.fillStyle = this.theme?.text || '#fff';
        context.font = `${Math.max(9, Math.min(14, 14 * scale))}px system-ui, sans-serif`;
        context.fillText(String(node.text).slice(0, 120), topLeft.x + 12 * scale, topLeft.y + 28 * scale, Math.max(1,width - 24 * scale));
      }
      const label = node.tag || resolveNodeLabel?.(node);
      if (label && !isGroup) {
        const font = 14 * scale;
        context.font = `500 ${font}px system-ui, sans-serif`;
        const text = String(label.name), badgeWidth = Math.min(width * .55, context.measureText(text).width + 40 * scale);
        const badgeHeight = 44 * scale, left = topLeft.x + width - badgeWidth, top = headerTop.y + 2 * scale;
        context.fillStyle = label.color;
        context.beginPath(); context.roundRect(left, top, badgeWidth, badgeHeight, 10 * scale); context.fill();
        context.fillStyle = label.foreground;
        context.beginPath();context.arc(left+16*scale,top+22*scale,4*scale,0,Math.PI*2);context.fill();
        context.fillText(text, left + 28 * scale, top + 27.6 * scale, badgeWidth - 40 * scale);
      }
      const state = node.status?.state || 'idle';
      const status = node.status?.text || '';
      const quietStatus = node.kind==='note' || !['running','failed'].includes(state) && ['image','text','llm','minimax-h3','video-api','audio-generator','midjourney','comfy','asset-collection','video','audio','asset-video','asset-audio','video-output'].includes(node.kind);
      if (!isGroup && !quietStatus && width > 0 && height > 0) {
        const dot = Math.max(2, Math.min(5, 5 * scale));
        context.fillStyle = statusColor(state, this.theme);
        context.beginPath(); context.arc(topLeft.x + width - dot - Math.max(4, 6 * scale), topLeft.y + height - dot - Math.max(4, 6 * scale), dot, 0, Math.PI * 2); context.fill();
        if (status) {
          context.fillStyle = this.theme?.muted || '#888';
          context.font = `500 ${11 * scale}px system-ui, sans-serif`;
          context.textAlign = 'right';
          context.fillText(String(status).slice(0, 24), topLeft.x + width - 8 * scale, topLeft.y + height - 10.75 * scale, Math.max(1, width * .58));
          context.textAlign = 'start';
        }
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
        header: {left:headerTop.x-this.padding, top:headerTop.y-this.padding,
          right:headerTop.x+headerWidth-this.padding, bottom:headerTop.y+(header.bottom-header.top)*scale-this.padding},
      });
      return true;
    }

    render({ visualNodes = [], visualConnections = [], texturedNodeIds = [], selectedIds = new Set(), transform = {}, resolveTexture, resolveNodeBounds, resolveNodeLabel, resolveNodeVisualGeometry } = {}) {
      this.renderCount += 1;
      this.candidatesRead += visualNodes.length;
      const context = this.bufferContext;
      const style = this.canvas.ownerDocument?.defaultView?.getComputedStyle?.(this.canvas);
      const token = (name, fallback) => style?.getPropertyValue(`--canvas-neon-${name}`).trim() || fallback;
      this.theme = {card:token('card','#1a1a1a'),border:token('border','#2a2a2a'),text:token('text','#fff'),muted:token('muted','#888'),primary:token('primary','#00ff41')};
      this.visualSummary = { icon: 0, title: 0, kind: 0, tag: 0, status: 0, colored: 0 };
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
              nodeLabelId: String(node[9] || ""),
              icon: String(node[10] || "box"),
              kindLabel: String(node[11] || ""),
              tag: node[12] || null,
              status: node[13] || null,
              groupColor: String(node[14] || ""),
              nodeColor: String(node[15] || ""),
              tone: String(node[16] || "neutral"),
            }
          : node
      ))
        .sort((left, right) => Number(left.kind !== 'group') - Number(right.kind !== 'group') || finite(left.zOrder) - finite(right.zOrder));
      const textured = new Set(Array.isArray(texturedNodeIds) ? texturedNodeIds.map(String) : []);
      const renderBounds = {
        left: -32,
        top: -32,
        right: this.rasterWidth + 32,
        bottom: this.rasterHeight + 32,
      };
      const connectionVisible = (fromX, fromY, toX, toY) => {
        const start = this.toScreen(fromX, fromY, drawTransform);
        const end = this.toScreen(toX, toY, drawTransform);
        const distance = Math.max(24, Math.abs(end.x - start.x) * 0.45);
        const left = Math.min(start.x, end.x, start.x + distance, end.x - distance);
        const right = Math.max(start.x, end.x, start.x + distance, end.x - distance);
        const top = Math.min(start.y, end.y);
        const bottom = Math.max(start.y, end.y);
        return !(right < renderBounds.left || bottom < renderBounds.top
          || left > renderBounds.right || top > renderBounds.bottom);
      };
      let renderedConnectionCount = 0;
      if (connectionCount) {
        context.beginPath();
        if (compactConnections) {
          for (let index = 0; index < connectionCount; index += 1) {
            const offset = index * 4;
            if (!connectionVisible(
              connections[offset], connections[offset + 1],
              connections[offset + 2], connections[offset + 3],
            )) continue;
            this.drawConnectionSegment(
              context,
              connections[offset],
              connections[offset + 1],
              connections[offset + 2],
              connections[offset + 3],
              drawTransform,
            );
            renderedConnectionCount += 1;
          }
        } else {
          connections.forEach((item) => {
            const fromX = item.fromX ?? item.from?.x;
            const fromY = item.fromY ?? item.from?.y;
            const toX = item.toX ?? item.to?.x;
            const toY = item.toY ?? item.to?.y;
            if (!connectionVisible(fromX, fromY, toX, toY)) return;
            this.drawConnection(context, item, drawTransform);
            renderedConnectionCount += 1;
          });
        }
        if (renderedConnectionCount) {
          const style = this.canvas.ownerDocument?.defaultView?.getComputedStyle?.(this.canvas);
          const lineColor = style?.getPropertyValue("--canvas-neon-muted").trim();
          context.strokeStyle = colorWithAlpha(lineColor, .4, "rgba(136, 136, 136, 0.4)");
          const wireScale = Math.max(0.000001, finite(transform.scale, 1));
          context.lineWidth = 3 * wireScale;
          context.setLineDash([6 * wireScale, 6 * wireScale]);
          context.stroke();
          context.setLineDash([]);
        }
      }
      let renderedNodeCount = 0;
      nodes.forEach(node => {
        const rendered = this.drawNode(context, node, drawTransform, textured.has(String(node.id)), resolveTexture, resolveNodeBounds, resolveNodeLabel, resolveNodeVisualGeometry, renderBounds);
        if (!rendered) return;
        renderedNodeCount += 1;
        const region = this.hitRegions.at(-1);
        if (region?.id === String(node.id) && selectedIds.has(region.id) && node.visualGeometry?.bodySurface === false) {
          context.strokeStyle = this.theme.primary;
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
      this.spriteCount = renderedNodeCount;
      this.currentTransform = { ...this.lastTransform };
      this.connectionCount = connectionCount;
      this.renderedGeometryCount = renderedNodeCount;
      return { nodeCount: renderedNodeCount, connectionCount: renderedConnectionCount };
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
        const header = region.header;
        if (header && pointX >= header.left && pointX <= header.right && pointY >= header.top && pointY <= header.bottom) return {id:region.id,item:region.item};
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
        renderCount: this.renderCount,
        reprojectCount: this.reprojectCount,
        candidatesRead: this.candidatesRead,
        aggregateCardCount: 0,
        blankNodeCount: 0,
        visualSummary: { ...this.visualSummary },
      };
    }
  }

  return { CanvasSceneLayer, SURFACES };
});
