(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsDisplay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const THEMES = Object.freeze(["light", "dark", "system"]);
  const SCALES = Object.freeze([0.75, 1, 1.25, 1.5, 1.75]);
  const ANIMATIONS = Object.freeze(["full", "reduced"]);
  const DEFAULT_PREFERENCES = Object.freeze({
    appearance: Object.freeze({ theme: "system", scale: 1, animations: "full" }),
  });

  function normalizeScale(value) {
    const scale = Number(value);
    return SCALES.includes(scale) ? scale : 1;
  }

  function resolveTheme(mode, media) {
    return mode === "system" && media?.matches ? "dark" : mode === "dark" ? "dark" : "light";
  }

  function normalizePreferences(value = {}, fallback = DEFAULT_PREFERENCES) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const base = fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : DEFAULT_PREFERENCES;
    const theme = String(source.appearance?.theme ?? base.appearance?.theme ?? "system");
    const animations = String(source.appearance?.animations ?? base.appearance?.animations ?? "full");
    return {
      appearance: {
        theme: THEMES.includes(theme) ? theme : "system",
        scale: normalizeScale(source.appearance?.scale ?? base.appearance?.scale ?? 1),
        animations: ANIMATIONS.includes(animations) ? animations : "full",
      },
    };
  }

  return Object.freeze({
    THEMES,
    SCALES,
    DEFAULT_PREFERENCES,
    normalizePreferences,
    resolveTheme,
    normalizeScale,
  });
});
