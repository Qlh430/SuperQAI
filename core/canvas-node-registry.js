(function attachCanvasNodeRegistry(root) {
  "use strict";

  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
  const definitions = [];
  const byId = new Map();

  function normalizeId(value) {
    const id = String(value || "").trim();
    if (!ID_PATTERN.test(id)) throw new Error(`Invalid canvas node id: ${value}`);
    return id;
  }

  function normalizeSelector(value) {
    const selector = String(value || "").trim();
    if (!selector || selector.includes(",")) throw new Error(`Invalid canvas node selector: ${selector}`);
    return selector;
  }

  function registerNode(definition) {
    const id = normalizeId(definition?.id);
    if (byId.has(id)) throw new Error(`Canvas node already registered: ${id}`);
    const selector = normalizeSelector(definition?.selector);
    const meta = Object.freeze({
      icon: String(definition?.icon || "box"),
      subtitle: String(definition?.subtitle || ""),
      tone: definition?.tone === "accent" ? "accent" : "neutral",
      group: String(definition?.group || "canvas"),
    });
    const node = Object.freeze({
      id,
      selector,
      pluginId: String(definition?.pluginId || ""),
      meta,
      defaultStatus: String(definition?.defaultStatus || "待完成"),
    });
    byId.set(id, node);
    definitions.push(node);
    return node;
  }

  function resolveKind(node) {
    if (!node?.matches) return undefined;
    for (const definition of definitions) {
      if (node.matches(definition.selector)) return definition.id;
    }
    return undefined;
  }

  function getMetaMap() {
    return Object.fromEntries(definitions.map((definition) => [definition.id, { ...definition.meta }]));
  }

  function getDefaultStatusMap() {
    return Object.fromEntries(definitions.map((definition) => [definition.id, definition.defaultStatus]));
  }

  root.AiOsCanvasNodeRegistry = Object.freeze({
    registerNode,
    getNode: (id) => byId.get(normalizeId(id)) || null,
    listNodes: () => definitions.slice(),
    resolveKind,
    getMetaMap,
    getDefaultStatusMap,
  });
})(typeof window !== "undefined" ? window : globalThis);
