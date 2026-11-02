(function exposeCanvasConnectionRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasConnectionRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasConnectionRules() {
  "use strict";

  const PATH_MIN_DISTANCE = 80;
  const PATH_DISTANCE_FACTOR = 0.45;

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function connectionId(connection = {}) {
    const existing = String(connection.id || "").trim();
    if (existing) return existing;
    const fromPort = String(connection.fromPort || "output");
    const source = fromPort === "output"
      ? String(connection.from || "")
      : `${String(connection.from || "")}:${fromPort}`;
    return `edge:${source}:${String(connection.to || "")}:${String(connection.toPort || "input")}`;
  }

  function normalizeConnection(connection = {}) {
    return { ...connection, id: connectionId(connection) };
  }

  function connectionKey(connection = {}, index = 0) {
    return `${String(connection.from || "")}:${String(connection.fromPort || "output")}`
      + `->${String(connection.to || "")}:${String(connection.toPort || "input")}:${Number(index) || 0}`;
  }

  function pathData(from = {}, to = {}) {
    const start = { x: finiteNumber(from.x), y: finiteNumber(from.y) };
    const end = { x: finiteNumber(to.x), y: finiteNumber(to.y) };
    const distance = Math.max(PATH_MIN_DISTANCE, Math.abs(end.x - start.x) * PATH_DISTANCE_FACTOR);
    return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
  }

  function resolveDropPort(node, target, kind = "input", fallback = "input") {
    const port = target?.closest?.("[data-canvas-port]");
    const handle = String(port?.dataset?.canvasPort || "");
    const expected = kind === "input" ? "member-input:" : "member-output:";
    if (!node?.contains?.(port)) return fallback;
    return handle === kind || handle.startsWith(expected) ? handle : fallback;
  }

  return Object.freeze({
    PATH_DISTANCE_FACTOR,
    PATH_MIN_DISTANCE,
    connectionId,
    connectionKey,
    normalizeConnection,
    pathData,
    resolveDropPort,
  });
});
