(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsDisplay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Neon is the single supported visual language. The legacy values are
  // normalized to Neon so existing preference files migrate safely.
  const THEMES = Object.freeze(["neon"]);
  const SCALES = Object.freeze([0.75, 1, 1.25, 1.5, 1.75]);
  const ANIMATIONS = Object.freeze(["full", "reduced"]);
  const DEFAULT_PREFERENCES = Object.freeze({
    appearance: Object.freeze({ theme: "neon", scale: 1, animations: "full" }),
  });

  function normalizeScale(value) {
    const scale = Number(value);
    return SCALES.includes(scale) ? scale : 1;
  }

  function resolveTheme() {
    // Keep the DOM contract on dark for the existing shell selectors while
    // Neon tokens provide the actual palette.
    return "dark";
  }

  function normalizePreferences(value = {}, fallback = DEFAULT_PREFERENCES) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const base = fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : DEFAULT_PREFERENCES;
    const theme = String(source.appearance?.theme ?? base.appearance?.theme ?? "neon");
    const animations = String(source.appearance?.animations ?? base.appearance?.animations ?? "full");
    return {
      appearance: {
        theme: "neon",
        scale: normalizeScale(source.appearance?.scale ?? base.appearance?.scale ?? 1),
        animations: ANIMATIONS.includes(animations) ? animations : "full",
      },
    };
  }

  function logicalViewport(innerWidth, innerHeight, scale, chrome = {}) {
    const normalizedScale = normalizeScale(scale);
    const width = Math.max(1, Math.floor(Number(innerWidth) / normalizedScale));
    const height = Math.max(1, Math.floor(Number(innerHeight) / normalizedScale) - Number(chrome.menuBarHeight || 0) - Number(chrome.dockHeight || 0));
    return { width, height };
  }

  function logicalDelta(clientDelta, scale) {
    return Number(clientDelta) / normalizeScale(scale);
  }

  function currentScale(root) {
    return normalizeScale(root?.dataset?.uiScale);
  }

  function applyPreferences(value, documentRoot, media) {
    const preferences = normalizePreferences(value);
    const target = documentRoot || (typeof document !== "undefined" ? document.documentElement : null);
    if (!target) return preferences;
    const query = media || (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : { matches: false });
    const theme = resolveTheme(preferences.appearance.theme, query);
    const scale = preferences.appearance.scale;
    target.dataset.themeMode = "neon";
    target.dataset.theme = theme;
    target.dataset.animations = preferences.appearance.animations;
    target.dataset.uiScale = String(scale);
    target.style?.setProperty("--system-scale", String(scale));
    target.removeAttribute?.("data-canvas-theme");
    target.removeAttribute?.("data-canvas-theme-mode");
    target.removeAttribute?.("data-palette");
    target.ownerDocument?.getElementById("aiOsDesktop")?.style?.setProperty("--system-scale", String(scale));
    try { globalThis.localStorage?.setItem("ai-theme-mode", preferences.appearance.theme); } catch {}
    const ownerWindow = target.ownerDocument?.defaultView;
    if (ownerWindow?.CustomEvent && ownerWindow?.dispatchEvent) {
      ownerWindow.dispatchEvent(new ownerWindow.CustomEvent("ai-os-preferences-applied", { detail: { preferences, theme, scale } }));
    }
    return preferences;
  }

  return Object.freeze({
    THEMES,
    SCALES,
    DEFAULT_PREFERENCES,
    normalizePreferences,
    resolveTheme,
    normalizeScale,
    currentScale,
    logicalViewport,
    logicalDelta,
    applyPreferences,
  });
});
