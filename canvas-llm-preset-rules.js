(function initCanvasLlmPresetRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasLlmPresetRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasLlmPresetRules() {
  function readCustomPresets(storage, key) {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => ({
          label: String(item?.label || "").trim(),
          text: String(item?.text || "").trim(),
        }))
        .filter((item) => item.label && item.text);
    } catch {
      return [];
    }
  }

  function writeCustomPresets(storage, key, presets) {
    try {
      storage?.setItem(key, JSON.stringify(Array.isArray(presets) ? presets : []));
      return true;
    } catch {
      return false;
    }
  }

  function readHiddenLabels(storage, key) {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || "[]");
      if (!Array.isArray(parsed)) return [];
      return [...new Set(
        parsed
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      )];
    } catch {
      return [];
    }
  }

  function writeHiddenLabels(storage, key, labels) {
    try {
      const unique = [...new Set(
        (Array.isArray(labels) ? labels : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      )];
      storage?.setItem(key, JSON.stringify(unique));
      return true;
    } catch {
      return false;
    }
  }

  function resolvePromptPresets({ defaults = [], hiddenLabels = [], customPresets = [] } = {}) {
    const seen = new Set();
    const hiddenDefaults = new Set(
      (Array.isArray(hiddenLabels) ? hiddenLabels : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    );
    const base = defaults
      .filter((item) => !hiddenDefaults.has(String(item?.label || "").trim()))
      .map((item) => ({ ...item, source: "default" }));
    const custom = customPresets.map((item) => ({ ...item, source: "custom" }));
    return [...base, ...custom]
      .map((item) => ({
        label: String(item.label || "").trim(),
        text: String(item.text || "").trim(),
        source: item.source || "custom",
      }))
      .filter((item) => {
        if (!item.label || !item.text || seen.has(item.label)) return false;
        seen.add(item.label);
        return true;
      });
  }

  return Object.freeze({
    readCustomPresets,
    writeCustomPresets,
    readHiddenLabels,
    writeHiddenLabels,
    resolvePromptPresets,
  });
});
