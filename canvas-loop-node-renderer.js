(function initCanvasLoopNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasLoopNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasLoopNodeRenderer() {
  "use strict";

  function render(node, options, context = {}) {
    const document = context.document || globalThis.document;
    const {
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      scheduleCanvasConnectionRender,
      updateCanvasLoopHint,
      updateCanvasNodeRefs,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas loop node renderer context is incomplete.");
    }

    node.innerHTML = "";
    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar("循环节点");
    const refs = document.createElement("div");
    refs.className = "canvas-node-refs";
    const hint = document.createElement("p");
    hint.className = "canvas-loop-hint";
    node.append(inputPort, outputPort, bar, refs, hint, createCanvasResizeHandle());
    updateCanvasNodeRefs?.(node);
    updateCanvasLoopHint?.(node);
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
