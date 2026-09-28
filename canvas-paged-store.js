(function initCanvasPagedStore(root, factory) {
  const rules = typeof module === "object" && module.exports
    ? require("./canvas-virtualization-rules")
    : root?.CanvasVirtualizationRules;
  const api = factory(rules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasPagedStore = api.CanvasPagedStore;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasPagedStore(defaultRules) {
  if (!defaultRules?.GridSpatialIndex) {
    throw new Error("CanvasVirtualizationRules is required.");
  }

  function cloneSerializable(value) {
    if (value === undefined) return undefined;
    return value === null ? null : JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeModel(input, fallbackId) {
    const source = cloneSerializable(input) || {};
    const id = String(source.id ?? fallbackId ?? "").trim();
    if (!id) throw new Error("Canvas node model requires an id.");
    const model = {
      ...source,
      id,
      kind: String(source.kind || "image"),
      x: finiteNumber(source.x),
      y: finiteNumber(source.y),
    };
    if (source.width !== undefined) model.width = Math.max(0, finiteNumber(source.width));
    if (source.height !== undefined) model.height = Math.max(0, finiteNumber(source.height));
    return model;
  }

  function normalizeConnection(input, fallbackId) {
    const source = cloneSerializable(input) || {};
    const from = String(source.from || source.fromId || "");
    const to = String(source.to || source.toId || "");
    const id = String(source.id || fallbackId || `${from}->${to}`).trim();
    if (!id) throw new Error("Canvas connection requires an id.");
    return { ...source, id, from, to };
  }

  function generationNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function containsRect(outer, inner) {
    if (!outer || !inner) return false;
    return Number(outer.left) <= Number(inner.left)
      && Number(outer.top) <= Number(inner.top)
      && Number(outer.right) >= Number(inner.right)
      && Number(outer.bottom) >= Number(inner.bottom);
  }

  class CanvasPagedStore {
    constructor({
      rules = defaultRules,
      maxModels = 2400,
      maxEstimatedBytes = 96 * 1024 * 1024,
    } = {}) {
      this.rules = rules;
      this.maxModels = Math.max(1, Math.trunc(finiteNumber(maxModels, 2400)));
      this.maxEstimatedBytes = Math.max(1, Math.trunc(finiteNumber(
        maxEstimatedBytes,
        96 * 1024 * 1024,
      )));
      this.models = new Map();
      this.modelBytes = new Map();
      this.revisions = new Map();
      this.connections = new Map();
      this.connectionBytes = new Map();
      this.connectionsByNode = new Map();
      this.index = new rules.GridSpatialIndex({ cellSize: rules.DEFAULT_CELL_SIZE });
      this.mounted = new Map();
      this.mountedLevels = new Map();
      this.pinned = new Set();
      this.deletedNodeIds = new Set();
      this.pendingOperations = new Map();
      this.accessOrder = new Map();
      this.estimatedBytes = 0;
      this.activeGeneration = null;
      this.boardRevision = 0;
      this.lodPage = null;
      this.scenePage = null;
      this.loadedRects = [];
    }

    get size() {
      return this.models.size;
    }

    get mountedSize() {
      return this.mounted.size;
    }

    estimate(value) {
      const json = JSON.stringify(value);
      if (typeof Buffer === "function") return Buffer.byteLength(json, "utf8");
      return new TextEncoder().encode(json).byteLength;
    }

    touch(id) {
      const key = String(id);
      this.accessOrder.delete(key);
      this.accessOrder.set(key, true);
    }

    has(id) {
      return this.models.has(String(id));
    }

    get(id) {
      const key = String(id);
      const model = this.models.get(key) || null;
      if (model) this.touch(key);
      return model;
    }

    getRevision(id) {
      return this.revisions.get(String(id)) || 0;
    }

    values() {
      return [...this.models.values()];
    }

    upsert(model, { fallbackId } = {}) {
      const requestedId = String(model?.id ?? fallbackId ?? "");
      if (requestedId && this.deletedNodeIds.has(requestedId)) return null;
      const next = normalizeModel(model, fallbackId);
      const previousBytes = this.modelBytes.get(next.id) || 0;
      const bytes = this.estimate(next);
      this.models.set(next.id, next);
      this.modelBytes.set(next.id, bytes);
      this.revisions.set(next.id, (this.revisions.get(next.id) || 0) + 1);
      this.estimatedBytes += bytes - previousBytes;
      this.index.upsert(next.id, this.rules.getNodeRect(next));
      this.touch(next.id);
      return next;
    }

    mergeSerialized(id, serialized) {
      const key = String(id);
      return this.upsert({ ...(this.models.get(key) || {}), ...(cloneSerializable(serialized) || {}), id: key });
    }

    removeResidentModel(id) {
      const key = String(id);
      if (!this.models.has(key)) return false;
      this.models.delete(key);
      this.estimatedBytes -= this.modelBytes.get(key) || 0;
      this.modelBytes.delete(key);
      this.revisions.delete(key);
      this.index.remove(key);
      this.accessOrder.delete(key);
      return true;
    }

    remove(id) {
      const key = String(id);
      const removed = this.removeResidentModel(key);
      this.mounted.delete(key);
      this.mountedLevels.delete(key);
      this.pinned.delete(key);
      return removed;
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
      for (const field of ["x", "y", "width", "height"]) {
        if (geometry[field] === undefined) continue;
        const value = finiteNumber(geometry[field], current[field]);
        next[field] = field === "width" || field === "height" ? Math.max(0, value) : value;
      }
      return this.upsert(next);
    }

    query(rect) {
      return this.index.query(rect);
    }

    serialize() {
      return this.values().map(cloneSerializable);
    }

    addConnectionIndex(connection) {
      for (const nodeId of [connection.from, connection.to]) {
        if (!nodeId) continue;
        if (!this.connectionsByNode.has(nodeId)) this.connectionsByNode.set(nodeId, new Set());
        this.connectionsByNode.get(nodeId).add(connection.id);
      }
    }

    removeConnection(id) {
      const key = String(id);
      const connection = this.connections.get(key);
      if (!connection) return false;
      for (const nodeId of [connection.from, connection.to]) {
        const ids = this.connectionsByNode.get(nodeId);
        ids?.delete(key);
        if (ids?.size === 0) this.connectionsByNode.delete(nodeId);
      }
      this.connections.delete(key);
      this.estimatedBytes -= this.connectionBytes.get(key) || 0;
      this.connectionBytes.delete(key);
      return true;
    }

    upsertConnections(items) {
      return (Array.isArray(items) ? items : []).map((item, index) => {
        const next = normalizeConnection(item, `page-connection-${index}`);
        this.removeConnection(next.id);
        const bytes = this.estimate(next);
        this.connections.set(next.id, next);
        this.connectionBytes.set(next.id, bytes);
        this.estimatedBytes += bytes;
        this.addConnectionIndex(next);
        return next;
      });
    }

    getVisibleConnections() {
      return [...this.connections.values()];
    }

    getConnectionsForNode(nodeId) {
      const ids = this.connectionsByNode.get(String(nodeId));
      return ids ? [...ids].map((id) => this.connections.get(id)).filter(Boolean) : [];
    }

    getVisualNodeId(visualNode) {
      return String(Array.isArray(visualNode) ? visualNode[0] : visualNode?.id || "");
    }

    withoutDeletedSceneNodes(page) {
      const nextPage = cloneSerializable(page) || {};
      const visualNodes = (Array.isArray(nextPage.visualNodes) ? nextPage.visualNodes : [])
        .filter((visualNode) => !this.deletedNodeIds.has(this.getVisualNodeId(visualNode)));
      const visualNodeIds = new Set(
        visualNodes.map((visualNode) => this.getVisualNodeId(visualNode)).filter(Boolean),
      );
      nextPage.visualNodes = visualNodes;
      if (Array.isArray(nextPage.texturedNodeIds)) {
        nextPage.texturedNodeIds = nextPage.texturedNodeIds
          .map((nodeId) => String(nodeId))
          .filter((nodeId) => visualNodeIds.has(nodeId));
      }
      if (Number.isFinite(Number(nextPage.visualNodeCount))) {
        nextPage.visualNodeCount = visualNodes.length;
      }
      return nextPage;
    }

    pruneDeletedSceneNodes() {
      if (!this.scenePage || this.scenePage.mode !== "scene") return;
      this.scenePage = this.withoutDeletedSceneNodes(this.scenePage);
    }

    applyViewportPage(page = {}) {
      const generation = String(page.generation ?? "0");
      if (
        this.activeGeneration !== null
        && generationNumber(generation) < generationNumber(this.activeGeneration)
      ) return false;
      const pageBoardRevision = Number(page.boardRevision);
      if (Number.isFinite(pageBoardRevision) && pageBoardRevision < this.boardRevision) return false;
      this.activeGeneration = generation;
      if (Number.isFinite(pageBoardRevision)) {
        this.boardRevision = pageBoardRevision;
      }
      if (page.mode === "lod") {
        this.scenePage = null;
        this.lodPage = cloneSerializable(page);
        if (page.bounds) this.rememberCoverage(page.bounds, page.truncated);
        return true;
      }
      if (page.mode === "scene") {
        this.lodPage = null;
        this.scenePage = this.withoutDeletedSceneNodes(page);
        if (page.bounds) this.rememberCoverage(page.bounds, page.truncated);
        return true;
      }
      this.lodPage = null;
      this.scenePage = null;
    const pendingNodeOperations = new Map();
    [...this.pendingOperations.values()]
      .filter((operation) => String(operation.type || "").startsWith("node."))
      .forEach((operation) => {
        pendingNodeOperations.set(String(operation.entityId || ""), operation);
      });

    (Array.isArray(page.nodes) ? page.nodes : []).forEach((model) => {
      const id = String(model?.id || "");
      const pendingOperation = pendingNodeOperations.get(id);
      if (this.deletedNodeIds.has(id)) {
        this.removeResidentModel(id);
        return;
      }
      if (!pendingOperation) {
        this.upsert(model);
        return;
      }

      if (pendingOperation.type === "node.delete") {
        this.removeResidentModel(id);
      }
    });
      const incomingConnectionIds = new Set(
        (Array.isArray(page.connections) ? page.connections : []).map((item) => String(item?.id || "")),
      );
      const protectedConnectionIds = new Set(
        [...this.pendingOperations.values()]
          .filter((item) => String(item.type || "").startsWith("connection."))
          .map((item) => String(item.entityId || "")),
      );
      for (const id of this.connections.keys()) {
        if (!incomingConnectionIds.has(id) && !protectedConnectionIds.has(id)) this.removeConnection(id);
      }
      this.upsertConnections(page.connections);
      if (page.bounds) this.rememberCoverage(page.bounds, page.truncated);
      this.evict();
      return true;
    }

    rememberCoverage(rect, truncated) {
      if (truncated) return;
      const normalized = {
        left: finiteNumber(rect.left),
        top: finiteNumber(rect.top),
        right: finiteNumber(rect.right),
        bottom: finiteNumber(rect.bottom),
      };
      this.loadedRects.push(normalized);
      if (this.loadedRects.length > 16) this.loadedRects.shift();
    }

    isViewportComplete(rect) {
      return this.loadedRects.some((loaded) => containsRect(loaded, rect));
    }

    stageOperation(operation) {
      const next = cloneSerializable(operation) || {};
      const operationId = String(next.operationId || "").trim();
      if (!operationId) throw new Error("Canvas pending operation requires operationId.");
      next.operationId = operationId;
      next.entityId = String(next.entityId || "");
      this.pendingOperations.set(operationId, next);
      if (next.type === "node.upsert" && next.after) {
        this.deletedNodeIds.delete(next.entityId);
        this.upsert(next.after);
      } else if (next.type === "node.delete") {
        this.deletedNodeIds.add(next.entityId);
        this.removeResidentModel(next.entityId);
        this.pruneDeletedSceneNodes();
      }
      else if (next.type === "connection.upsert" && next.after) this.upsertConnections([next.after]);
      else if (next.type === "connection.delete") this.removeConnection(next.entityId);
      return next;
    }

    getPendingOperations() {
      return [...this.pendingOperations.values()].map(cloneSerializable);
    }

    ackOperations(result = {}) {
      if (Number.isFinite(Number(result.boardRevision))) {
        this.boardRevision = Number(result.boardRevision);
      }
      for (const item of Array.isArray(result.results) ? result.results : []) {
        const operationId = String(item?.operationId || "");
        const pending = this.pendingOperations.get(operationId);
        if (!pending || !["applied", "duplicate"].includes(String(item?.status || ""))) continue;
        if (pending.type === "node.upsert" && this.models.has(pending.entityId)) {
          this.mergeSerialized(pending.entityId, { revision: Number(item.entityRevision || 0) });
        }
        if (pending.type === "connection.upsert" && this.connections.has(pending.entityId)) {
          const connection = this.connections.get(pending.entityId);
          this.upsertConnections([{ ...connection, revision: Number(item.entityRevision || 0) }]);
        }
        this.pendingOperations.delete(operationId);
      }
      this.evict();
    }

    /**
     * Applies a batch the server already persisted, on behalf of a client that
     * was not the author. The operations never enter `pendingOperations` —
     * they are already stored, and re-uploading them would only create a
     * revision conflict for the receiving client's next local save.
     */
    applyCommitted(operations = []) {
      let applied = 0;
      for (const raw of Array.isArray(operations) ? operations : []) {
        const operation = cloneSerializable(raw) || {};
        const type = String(operation.type || "");
        const entityId = String(operation.entityId || operation.after?.id || "");
        if (type === "node.upsert" && operation.after) {
          this.deletedNodeIds.delete(entityId);
          this.upsert({ ...operation.after, id: String(operation.after.id || entityId) });
          applied += 1;
        } else if (type === "node.delete" && entityId) {
          this.deletedNodeIds.add(entityId);
          this.removeResidentModel(entityId);
          this.pruneDeletedSceneNodes();
          applied += 1;
        } else if (type === "connection.upsert" && operation.after) {
          this.upsertConnections([operation.after]);
          applied += 1;
        } else if (type === "connection.delete" && entityId) {
          this.removeConnection(entityId);
          applied += 1;
        }
      }
      this.evict();
      return applied;
    }

    pin(id) {
      const key = String(id);
      if (key) this.pinned.add(key);
    }

    unpin(id) {
      this.pinned.delete(String(id));
    }

    evict() {
      const protectedIds = new Set([
        ...this.pinned,
        ...this.mounted.keys(),
        ...[...this.pendingOperations.values()].map((item) => String(item.entityId || "")),
      ]);
      let madeProgress = true;
      while (
        madeProgress
        && (this.models.size > this.maxModels || this.estimatedBytes > this.maxEstimatedBytes)
      ) {
        madeProgress = false;
        for (const id of this.accessOrder.keys()) {
          if (protectedIds.has(id)) continue;
          this.removeResidentModel(id);
          madeProgress = true;
          break;
        }
      }
      return this.models.size;
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
      return [...this.mounted.keys()];
    }

    mountedElements() {
      return [...this.mounted.values()];
    }

    clearMounted() {
      this.mounted.clear();
      this.mountedLevels.clear();
    }

    clear() {
      this.models.clear();
      this.modelBytes.clear();
      this.revisions.clear();
      this.connections.clear();
      this.connectionBytes.clear();
      this.connectionsByNode.clear();
      this.index.clear();
      this.clearMounted();
      this.pinned.clear();
      this.deletedNodeIds.clear();
      this.pendingOperations.clear();
      this.accessOrder.clear();
      this.loadedRects = [];
      this.estimatedBytes = 0;
      this.activeGeneration = null;
      this.boardRevision = 0;
      this.lodPage = null;
      this.scenePage = null;
    }
  }

  return { CanvasPagedStore, normalizeModel, normalizeConnection };
});
