(function initCanvasGenerationRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGenerationRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGenerationRules() {
  const FAMILIES = Object.freeze({
    image: Object.freeze({
      label: "\u56fe\u7247\u751f\u6210",
      api: "generator",
      comfyui: "comfy",
    }),
    video: Object.freeze({
      label: "\u89c6\u9891\u751f\u6210",
      api: "video-api",
      comfyui: "minimax-h3",
    }),
  });

  const ENGINES = Object.freeze([
    Object.freeze({
      id: "api",
      label: "\u7ebf\u4e0a API",
      hint: "\u8c03\u7528 API \u8bbe\u7f6e\u91cc\u914d\u7f6e\u7684\u63a5\u5165",
    }),
    Object.freeze({
      id: "comfyui",
      label: "\u7ebf\u4e0b ComfyUI",
      hint: "\u5728\u672c\u673a ComfyUI \u4e0a\u6267\u884c\u5de5\u4f5c\u6d41",
    }),
  ]);

  function getFamily(node) {
    const list = node?.classList;
    if (!list) return "";
    if (list.contains("canvas-node-generator") || list.contains("canvas-node-comfy")) return "image";
    if (list.contains("canvas-node-video-api") || list.contains("canvas-node-minimax-h3")) return "video";
    return "";
  }

  function getEngine(node) {
    const list = node?.classList;
    if (!list) return "";
    if (list.contains("canvas-node-comfy") || list.contains("canvas-node-minimax-h3")) return "comfyui";
    if (list.contains("canvas-node-generator") || list.contains("canvas-node-video-api")) return "api";
    return "";
  }

  // The engine a card mounts is readable from its classes, so an engine switch
  // also becomes the persistence format used by the serializer.
  function getImplementation(node) {
    const family = getFamily(node);
    const engine = getEngine(node);
    return family && engine ? FAMILIES[family][engine] : "";
  }

  return Object.freeze({
    FAMILIES,
    ENGINES,
    getFamily,
    getEngine,
    getImplementation,
  });
});
