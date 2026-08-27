(function initCanvasBoardLoadingRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.canvasBoardLoadingRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasBoardLoadingRules() {
  const NODE_THRESHOLD = 30;
  const FRAME_BUDGET_MS = 8;
  const MIN_VISIBLE_MS = 240;

  function clampRatio(completed, total) {
    const safeTotal = Math.max(1, Number(total) || 0);
    return Math.max(0, Math.min(1, (Number(completed) || 0) / safeTotal));
  }

  function shouldUseProgressiveRestore(nodeCount) {
    return Math.max(0, Number(nodeCount) || 0) >= NODE_THRESHOLD;
  }

  function getCanvasBoardRestoreProgress(phase, completed = 0, total = 0) {
    if (phase === "nodes") return Math.round(clampRatio(completed, total) * 80);
    if (phase === "refs") return 80 + Math.round(clampRatio(completed, total) * 15);
    if (phase === "finalize") return 95;
    if (phase === "complete") return 100;
    return 0;
  }

  return {
    NODE_THRESHOLD,
    FRAME_BUDGET_MS,
    MIN_VISIBLE_MS,
    shouldUseProgressiveRestore,
    getCanvasBoardRestoreProgress,
  };
});
