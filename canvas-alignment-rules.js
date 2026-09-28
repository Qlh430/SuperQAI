(function exposeCanvasAlignmentRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAlignmentRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAlignmentRules() {
  "use strict";

  const DEFAULT_THRESHOLD = 8;
  const X_EDGES = Object.freeze(["left", "center", "right"]);
  const Y_EDGES = Object.freeze(["top", "center", "bottom"]);

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const left = finiteNumber(rect.left, NaN);
    const top = finiteNumber(rect.top, NaN);
    const right = finiteNumber(rect.right, NaN);
    const bottom = finiteNumber(rect.bottom, NaN);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      right: Math.max(left, right),
      bottom: Math.max(top, bottom),
    };
  }

  function edgeValue(rect, edge) {
    if (edge === "left" || edge === "top") return rect[edge];
    if (edge === "right" || edge === "bottom") return rect[edge];
    if (edge === "center") return (rect.left + rect.right) / 2;
    return (rect.top + rect.bottom) / 2;
  }

  function edgePairRank(movingEdge, targetEdge) {
    if (movingEdge === targetEdge) return 0;
    const complementary = (
      (movingEdge === "right" && targetEdge === "left")
      || (movingEdge === "left" && targetEdge === "right")
      || (movingEdge === "bottom" && targetEdge === "top")
      || (movingEdge === "top" && targetEdge === "bottom")
    );
    return complementary ? 1 : 2;
  }

  function isBetterMatch(next, current) {
    if (!current) return true;
    const nextDistance = Math.abs(next.delta);
    const currentDistance = Math.abs(current.delta);
    if (nextDistance !== currentDistance) return nextDistance < currentDistance;
    const nextRank = edgePairRank(next.movingEdge, next.targetEdge);
    const currentRank = edgePairRank(current.movingEdge, current.targetEdge);
    if (nextRank !== currentRank) return nextRank < currentRank;
    return next.candidateIndex < current.candidateIndex;
  }

  function findBestAxisMatch({ movingRect, candidateRects, edges, axis, threshold }) {
    let best = null;
    candidateRects.forEach((candidateRect, candidateIndex) => {
      edges.forEach((movingEdge) => {
        const movingValue = edgeValue(movingRect, movingEdge);
        edges.forEach((targetEdge) => {
          const targetValue = edgeValue(candidateRect, targetEdge);
          const delta = targetValue - movingValue;
          if (Math.abs(delta) > threshold) return;
          const match = {
            axis,
            delta,
            position: targetValue,
            movingEdge,
            targetEdge,
            candidateIndex,
          };
          if (isBetterMatch(match, best)) best = match;
        });
      });
    });
    return best;
  }

  function alignRect({
    movingRect,
    candidateRects,
    threshold = DEFAULT_THRESHOLD,
  } = {}) {
    const moving = normalizeRect(movingRect);
    const candidates = (Array.isArray(candidateRects) ? candidateRects : [])
      .map(normalizeRect)
      .filter(Boolean);
    const safeThreshold = Math.max(0, finiteNumber(threshold, DEFAULT_THRESHOLD));
    if (!moving || !candidates.length || safeThreshold <= 0) {
      return {
        movingRect: moving,
        deltaX: 0,
        deltaY: 0,
        x: null,
        y: null,
      };
    }

    const x = findBestAxisMatch({
      movingRect: moving,
      candidateRects: candidates,
      edges: X_EDGES,
      axis: "x",
      threshold: safeThreshold,
    });
    const y = findBestAxisMatch({
      movingRect: moving,
      candidateRects: candidates,
      edges: Y_EDGES,
      axis: "y",
      threshold: safeThreshold,
    });
    return {
      movingRect: moving,
      deltaX: x?.delta || 0,
      deltaY: y?.delta || 0,
      x,
      y,
    };
  }

  return Object.freeze({
    DEFAULT_THRESHOLD,
    alignRect,
    normalizeRect,
  });
});
