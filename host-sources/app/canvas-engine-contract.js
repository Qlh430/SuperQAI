(function initCanvasEngineContract(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasEngineContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasEngineContract() {
  const ENGINE_VERSION = "canvas-visual-fidelity-v2";

  function assertCompatible(actual, expected = ENGINE_VERSION) {
    if (String(actual || "") === String(expected || ENGINE_VERSION)) return true;
    const error = new Error("画布引擎已更新，请重启本地服务后重试。");
    error.code = "canvas_engine_version_mismatch";
    error.expectedEngineVersion = String(expected || ENGINE_VERSION);
    error.actualEngineVersion = String(actual || "");
    throw error;
  }

  return { ENGINE_VERSION, assertCompatible };
});
