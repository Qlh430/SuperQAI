(function attachCanvasNodePluginHost(root) {
  "use strict";

  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
  const plugins = new Map();

  function normalizeId(value) {
    const id = String(value || "").trim();
    if (!ID_PATTERN.test(id)) throw new Error(`Invalid canvas node plugin id: ${value}`);
    return id;
  }

  function register(plugin) {
    const id = normalizeId(plugin?.id);
    if (plugins.has(id)) throw new Error(`Canvas node plugin already registered: ${id}`);
    const normalized = Object.freeze({
      id,
      label: String(plugin?.label || id),
      render: typeof plugin?.render === "function" ? plugin.render : null,
      run: typeof plugin?.run === "function" ? plugin.run : null,
      serialize: typeof plugin?.serialize === "function" ? plugin.serialize : null,
      restore: typeof plugin?.restore === "function" ? plugin.restore : null,
      agent: plugin?.agent && typeof plugin.agent === "object" ? Object.freeze({ ...plugin.agent }) : null,
      api: plugin?.api && typeof plugin.api === "object" ? Object.freeze({ ...plugin.api }) : null,
    });
    if (!normalized.render && !normalized.run && !normalized.restore) {
      throw new Error(`Canvas node plugin ${id} does not expose any lifecycle hook.`);
    }
    plugins.set(id, normalized);
    return normalized;
  }

  root.AiOsCanvasNodePlugins = Object.freeze({
    register,
    get: (id) => plugins.get(normalizeId(id)) || null,
    list: () => [...plugins.values()],
  });
})(typeof window !== "undefined" ? window : globalThis);
