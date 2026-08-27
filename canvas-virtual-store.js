(function initCanvasVirtualStore(root, factory) {
  const rules = typeof module === "object" && module.exports
    ? require("./canvas-virtualization-rules")
    : root?.CanvasVirtualizationRules;
  const api = factory(rules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasVirtualStore = api.CanvasVirtualStore;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasVirtualStore(rules) {
  if (!rules?.GridSpatialIndex) throw new Error("CanvasVirtualizationRules is required.");

  function cloneSerializable(value) {
    if (value === undefined) return undefined;
    return value === null ? null : JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeNodeModel(input, fallbackId) {
    const source = cloneSerializable(input) || {};
    const id = String(source.id ?? fallbackId ?? "").trim();
    if (!id) throw new Error("Canvas node model requires an id.");
    const next = {
      ...source,
      id,
      kind: String(source.kind || "image"),
      x: finiteNumber(source.x),
      y: finiteNumber(source.y),
    };
    if (source.width !== undefined) next.width = Math.max(0, finiteNumber(source.width));
    if (source.height !== undefined) next.height = Math.max(0, finiteNumber(source.height));
    return next;
  }

  class CanvasVirtualStore {
    constructor({ rules: providedRules = rules } = {}) {
      this.rules = providedRules;
      this.models = new Map();
      this.order = [];
      this.index = new providedRules.GridSpatialIndex({ cellSize: providedRules.DEFAULT_CELL_SIZE });
      this.mounted = new Map();
      this.mountedLevels = new Map();
      this.revisions = new Map();
    }

    get size() {
      return this.models.size;
    }

    get mountedSize() {
      return this.mounted.size;
    }

    clear() {
      this.models.clear();
      this.order = [];
      this.index.clear();
      this.clearMounted();
      this.revisions.clear();
    }

    load(nodes) {
      this.clear();
      (Array.isArray(nodes) ? nodes : []).forEach((node, index) => {
        this.upsert(node, { fallbackId: index + 1 });
      });
      return this;
    }

    has(id) {
      return this.models.has(String(id));
    }

    get(id) {
      return this.models.get(String(id)) || null;
    }

    values() {
      return this.order.map((id) => this.models.get(id)).filter(Boolean);
    }

    upsert(model, { fallbackId } = {}) {
      const next = normalizeNodeModel(model, fallbackId);
      const exists = this.models.has(next.id);
      this.models.set(next.id, next);
      if (!exists) this.order.push(next.id);
      this.index.upsert(next.id, this.rules.getNodeRect(next));
      this.revisions.set(next.id, (this.revisions.get(next.id) || 0) + 1);
      return next;
    }

    mergeSerialized(id, serialized) {
      const key = String(id);
      const existing = this.models.get(key) || {};
      return this.upsert({ ...existing, ...(cloneSerializable(serialized) || {}), id: key });
    }

    remove(id) {
      const key = String(id);
      if (!this.models.has(key)) return false;
      this.models.delete(key);
      this.order = this.order.filter((item) => item !== key);
      this.index.remove(key);
      this.mounted.delete(key);
      this.mountedLevels.delete(key);
      this.revisions.delete(key);
      return true;
    }

    getRect(id) {
      const model = this.get(id);
      return model ? this.rules.getNodeRect(model) : null;
    }

    setGeometry(id, geometry = {}) {
      const key = String(id);
      const current = this.models.get(key);
      if (!current) return null;
      const next = { ...current };
      ["x", "y", "width", "height"].forEach((field) => {
        if (geometry[field] === undefined) return;
        const fallback = field === "x" || field === "y" ? 0 : Number(current[field] || 0);
        next[field] = field === "x" || field === "y"
          ? finiteNumber(geometry[field], fallback)
          : Math.max(0, finiteNumber(geometry[field], fallback));
      });
      return this.upsert(next);
    }

    query(rect) {
      return this.index.query(rect);
    }

    serialize() {
      return this.values().map((model) => cloneSerializable(model));
    }

    getRevision(id) {
      return this.revisions.get(String(id)) || 0;
    }

    setMounted(id, element, level = "full") {
      const key = String(id);
      if (!element) {
        this.mounted.delete(key);
        this.mountedLevels.delete(key);
        return null;
      }
      this.mounted.set(key, element);
      this.mountedLevels.set(key, String(level || "full"));
      return element;
    }

    getMounted(id) {
      return this.mounted.get(String(id)) || null;
    }

    getMountedLevel(id) {
      return this.mountedLevels.get(String(id)) || "";
    }

    mountedIds() {
      return Array.from(this.mounted.keys());
    }

    mountedElements() {
      return Array.from(this.mounted.values());
    }

    clearMounted() {
      this.mounted.clear();
      this.mountedLevels.clear();
    }
  }

  return { CanvasVirtualStore, normalizeNodeModel, cloneSerializable };
});
