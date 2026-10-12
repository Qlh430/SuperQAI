(function installFloraConnectionInteraction(root) {
  "use strict";
  const RADIUS = 34;
  const MAX_OFFSET = 8;
  let context, activePort, frame = 0, lastPointer, gesture, suppressClick = false;
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
    const node = port.closest('.canvas-node');
    if (!node?.isConnected || node.hidden || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return false;
    const style = getComputedStyle(port);
    return style.display !== 'none' && port.getBoundingClientRect().width > 0;
  }
  function nearest(x, y, options = {}) {
    const canvas = root.document?.getElementById('infiniteCanvas');
    if (!canvas?.getClientRects().length) return null;
    const rect = canvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const target = root.document.elementFromPoint(x, y);
    if (!isPort(target) && (target?.closest?.(blocked) || target?.closest?.('button'))) return null;
    let result = null, distance = RADIUS;
    canvas.querySelectorAll('.canvas-port[data-canvas-port]').forEach(port => {
      const node = port.closest('.canvas-node');
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
  function install(options) {
    if (context) return;
    context = options;
    root.document.addEventListener('pointermove', event => {
      lastPointer = event;
      if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) gesture.moved = true;
      if (!frame) frame = root.requestAnimationFrame(hover);
    }, true);
    root.document.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (event.button !== 0 || !event.isTrusted || context.isDragging?.()) return;
      const nativePort = isPort(event.target);
      const nearby = nativePort ? { port: nativePort } : nearest(event.clientX, event.clientY);
      if (!nearby) return;
      gesture = { x: event.clientX, y: event.clientY, moved: false };
      if (nativePort) return;
      event.preventDefault(); event.stopImmediatePropagation();
      nearby.port.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: event.pointerId, pointerType: event.pointerType, button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY }));
    }, true);
    root.document.addEventListener('pointerup', () => { suppressClick = Boolean(gesture?.moved); gesture = null; }, true);
    root.document.addEventListener('click', event => {
      if (suppressClick && event.detail) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    root.document.addEventListener('pointercancel', () => { gesture = null; clear(); }, true);
    root.document.addEventListener('pointerout', event => { if (!event.relatedTarget) { lastPointer = null; clear(); } }, true);
    root.addEventListener('blur', () => { lastPointer = null; gesture = null; context.cancelDrag?.(); clear(); });
    root.document.addEventListener('keydown', event => { if (event.key === 'Escape') { context.cancelDrag?.(); clear(); } });
  }
  root.FloraConnectionInteraction = Object.freeze({ install, nearest, paint, clear, radius: RADIUS });
})(typeof globalThis !== 'undefined' ? globalThis : this);
