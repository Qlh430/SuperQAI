(function initializeCanvasImageName(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasImageName = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasImageName() {
  "use strict";

  function normalize(value, fallback = "图片") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function appendSuffix(name, index) {
    const value = normalize(name);
    const suffix = ` ${Math.max(2, Math.floor(Number(index) || 2))}`;
    const match = value.match(/^(.*?)(\.[^./\\]+)$/);
    return match ? `${match[1]}${suffix}${match[2]}` : `${value}${suffix}`;
  }

  function ensureUnique(requested, existingNames = [], options = {}) {
    const base = normalize(requested, options.fallback || "图片");
    const taken = new Set((Array.isArray(existingNames) ? existingNames : [])
      .map((value) => normalize(value))
      .filter(Boolean));
    if (!taken.has(base)) return base;
    const extension = base.match(/(\.[^./\\]+)$/)?.[1] || "";
    const stem = extension ? base.slice(0, -extension.length) : base;
    const numbered = stem.match(/^(.*?)[ ]+(\d+)$/);
    const root = numbered?.[1] || stem;
    let index = numbered ? Number(numbered[2]) + 1 : 2;
    let candidate = appendSuffix(`${root}${extension}`, index);
    while (taken.has(candidate)) candidate = appendSuffix(`${root}${extension}`, ++index);
    return candidate;
  }

  return Object.freeze({ normalize, appendSuffix, ensureUnique });
});
