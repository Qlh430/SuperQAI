(function installFloraConnectionInteraction(root) {
  "use strict";
  const RADIUS = 34;
  const MAX_OFFSET = 8;
  let context, activePort, hoverNode, frame = 0, lastPointer, gesture, suppressClick = false;
  let settleFrame = 0;
  const settlingPorts = new Map();
  // 内联工具（裁剪 / 扩图）在节点上直接操作时，整块操作区都不参与磁吸，
  // 否则按在裁剪分线或扩图把手上会被判定成“靠近端口”，指针被连接拖拽抢走。
  const blocked = 'input,textarea,select,[contenteditable="true"],.flora-generator-composer,.flora-node-actions,.flora-node-tag,.canvas-resize-handle,dialog,.canvas-inline-crop,.canvas-inline-outpaint';
  const isPort = target => target?.closest?.('.canvas-port');
  function scale() { return Math.max(.01, Number(context?.getScale?.()) || 1); }
  function anchor(port) {
    const box = port.getBoundingClientRect();
    const offset = getComputedStyle(port).translate.split(/\s+/).map(value => parseFloat(value) || 0);
    return { x: box.left + box.width / 2 - offset[0] * scale(), y: box.top + box.height / 2 - (offset[1] || 0) * scale() };
  }
  function visible(port) {
    const node = port.closest('.canvas-node,.canvas-hover-port-proxy');
    if (!node?.isConnected || node.hidden || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return false;
    const style = getComputedStyle(port);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && port.getBoundingClientRect().width > 0;
  }
  function setHoverNode(node) {
    if (hoverNode === node) return;
    hoverNode?.removeAttribute('data-flora-port-hover');
    hoverNode = node;
    hoverNode?.setAttribute('data-flora-port-hover', 'true');
    clear();
  }
  // 只为已悬停对象保留从主体侧边收拢到端口的过渡区，容纳斜向移动。
  // 这里只延续悬停，不扩展点击命中，也不能从外侧激活一个未悬停的节点。
  function inPortPassage(node, x, y) {
    if (!node?.isConnected || node.dataset.inlineTool) return false;
    const body = (node.querySelector('.flora-node-content') || node).getBoundingClientRect();
    return [...node.querySelectorAll('.canvas-port[data-canvas-port]')].some(port => {
      if (!visible(port)) return false;
      const p = anchor(port), box = port.getBoundingClientRect();
      const side = port.dataset.canvasPortKind === 'input' ? -1 : 1;
      const edge = side < 0 ? body.left : body.right;
      const gap = (p.x - edge) * side, outside = (x - edge) * side;
      if (outside < 0 || outside > gap + box.width / 2) return false;
      const progress = Math.min(1, outside / Math.max(1, gap));
      const top = body.top + (p.y - RADIUS - body.top) * progress;
      const bottom = body.bottom + (p.y + RADIUS - body.bottom) * progress;
      return y >= top && y <= bottom;
    });
  }
  function updateHover(x, y, pressed = false) {
    const target = root.document.elementFromPoint(x, y);
    const canvas = root.document.getElementById('canvasPlane');
    const light = target?.closest?.('[data-canvas-light-id]');
    const direct = target?.closest?.('.canvas-node,.canvas-hover-port-proxy') || (light && root.getCanvasHoverPortOwner?.(light.dataset.canvasLightId)) || root.getCanvasHoverPortOwner?.(null,x,y);
    // 工具栏、参数操作区不属于节点内容的悬停激活区域。
    const owner = direct && canvas?.contains(direct) && !target.closest('.flora-node-toolbar,.canvas-group-tools,.flora-generator-composer,.canvas-inline-crop,.canvas-inline-outpaint') ? direct : null;
    if (owner === hoverNode && owner) return owner;
    if (!pressed && inPortPassage(hoverNode, x, y)) return hoverNode;
    setHoverNode(owner);
    return owner;
  }
  function nearest(x, y, options = {}) {
    const canvas = root.document?.getElementById('infiniteCanvas');
    if (!canvas?.getClientRects().length) return null;
    const rect = canvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const owner = updateHover(x, y);
    if (!owner) return null;
    const target = root.document.elementFromPoint(x, y);
    if (!isPort(target) && (target?.closest?.(blocked) || target?.closest?.('button'))) return null;
    let result = null, distance = RADIUS;
    owner.querySelectorAll('.canvas-port[data-canvas-port]').forEach(port => {
      const node = port.closest('.canvas-node,.canvas-hover-port-proxy');
      if (node === options.excludeNode || !visible(port) || (options.kind && port.dataset.canvasPortKind !== options.kind)) return;
      // 正在用内联工具的节点，端口先让位给工具的拖拽。
      if (node?.dataset?.inlineTool) return;
      const point = anchor(port), candidate = Math.hypot(x - point.x, y - point.y);
      if (candidate > distance || (options.accepts && !options.accepts(port, node))) return;
      if (candidate <= distance) { distance = candidate; result = { port, node, handle: port.dataset.canvasPort, point, distance }; }
    });
    return result;
  }
  function clear() {
    if (!activePort) return;
    const port = activePort;
    activePort.classList.remove('is-magnetized', 'is-snap-target');
    activePort.style.removeProperty('--flora-port-magnet-x');
    activePort.style.removeProperty('--flora-port-magnet-y');
    activePort = null;
    context?.onPositionChange?.(port);
    settlingPorts.set(port, performance.now() + 160);
    if (!settleFrame) settleFrame = root.requestAnimationFrame(function settle(now) {
      settlingPorts.forEach((until, pending) => {
        context?.onPositionChange?.(pending);
        if (now >= until || !pending.isConnected || pending === activePort) settlingPorts.delete(pending);
      });
      settleFrame = settlingPorts.size ? root.requestAnimationFrame(settle) : 0;
    });
  }
  function paint(candidate, x, y, snap = false) {
    if (activePort !== candidate?.port) clear();
    if (!candidate) return;
    activePort = candidate.port;
    const dx = x - candidate.point.x, dy = y - candidate.point.y;
    const distance = Math.hypot(dx, dy);
    const offset = Math.min(MAX_OFFSET, distance * .3);
    activePort.style.setProperty('--flora-port-magnet-x', `${distance ? dx / distance * offset / scale() : 0}px`);
    activePort.style.setProperty('--flora-port-magnet-y', `${distance ? dy / distance * offset / scale() : 0}px`);
    activePort.classList.add('is-magnetized');
    activePort.classList.toggle('is-snap-target', snap);
    context?.onPositionChange?.(activePort);
  }
  function hover() {
    frame = 0;
    if (!lastPointer || context?.isDragging?.()) return;
    if (lastPointer.buttons || lastPointer.pointerType === 'touch') { clear(); return; }
    paint(nearest(lastPointer.clientX, lastPointer.clientY), lastPointer.clientX, lastPointer.clientY);
  }
  function releaseNode(node) {
    if (!node) return;
    if (hoverNode === node) {
      setHoverNode(null);lastPointer = null;
      if (frame) root.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (activePort && node.contains(activePort)) clear();
    settlingPorts.forEach((_,port)=>{if(node.contains(port))settlingPorts.delete(port);});
    if (!settlingPorts.size && settleFrame) {root.cancelAnimationFrame(settleFrame);settleFrame=0;}
  }
  function install(options) {
    if (context) return;
    context = options;
    root.document.addEventListener('pointermove', event => {
      // Keep coordinates only: a PointerEvent retains its entire old DOM path.
      lastPointer = {clientX:event.clientX,clientY:event.clientY,buttons:event.buttons,pointerType:event.pointerType};
      if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) gesture.moved = true;
      // Ordinary pan and node drags don't need hover ownership. Resolving the
      // hit target here performs elementFromPoint plus scene/port geometry work
      // on every captured move, while the active drag already owns the pointer.
      // A wire gesture still needs hover changes to find its snap target.
      if (event.buttons && !context.isDragging?.()) {
        if (frame) root.cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      updateHover(event.clientX, event.clientY);
      if (!frame) frame = root.requestAnimationFrame(hover);
    }, true);
    root.document.addEventListener('pointerdown', event => {
      suppressClick = false;
      updateHover(event.clientX, event.clientY, true);
      if (event.button !== 0 || !event.isTrusted || context.isDragging?.()) return;
      const nativePort = isPort(event.target);
      if (!nativePort && event.target.closest?.('.canvas-node')) return;
      const nearby = nativePort ? { port: nativePort } : nearest(event.clientX, event.clientY);
      if (!nearby) return;
      // 磁吸不能抢走可见图片或组内空白的按下；只有已显示端口的外侧通道可代点。
      if (!nativePort && !inPortPassage(nearby.node, event.clientX, event.clientY)) return;
      gesture = { x: event.clientX, y: event.clientY, moved: false };
      if (nativePort) return;
      event.preventDefault(); event.stopImmediatePropagation();
      nearby.port.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: event.pointerId, pointerType: event.pointerType, button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY }));
    }, true);
    root.document.addEventListener('pointerup', () => { suppressClick = Boolean(gesture?.moved); gesture = null; }, true);
    root.document.addEventListener('click', event => {
      if (suppressClick && event.detail) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    root.document.addEventListener('pointercancel', () => { gesture = null; clear(); setHoverNode(null); }, true);
    root.document.addEventListener('pointerout', event => { if (!event.relatedTarget) { lastPointer = null; clear(); setHoverNode(null); } }, true);
    root.addEventListener('blur', () => { lastPointer = null; gesture = null; context.cancelDrag?.(); clear(); setHoverNode(null); });
    root.document.addEventListener('keydown', event => { if (event.key === 'Escape') { context.cancelDrag?.(); clear(); } });
  }
  root.FloraConnectionInteraction = Object.freeze({ install, nearest, paint, clear, releaseNode, radius: RADIUS,
    hoveredId: () => hoverNode?.isConnected ? hoverNode.dataset.id : null,
    refreshHover: () => { if (lastPointer && !frame) frame = root.requestAnimationFrame(hover); },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
