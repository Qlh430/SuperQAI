const assert = require("node:assert/strict");
const rules = require("../canvas-virtualization-rules");
const { CanvasPagedStore } = require("../canvas-paged-store");

function node(id, x, extra = {}) {
  return { id, kind: "text", x, y: 0, width: 80, height: 80, ...extra };
}

const store = new CanvasPagedStore({
  rules,
  maxModels: 3,
  maxEstimatedBytes: 4096,
});
store.applyViewportPage({
  generation: "1",
  boardRevision: 1,
  bounds: { left: -100, top: -100, right: 500, bottom: 500 },
  mode: "detail",
  nodes: [node("a", 0), node("b", 100), node("c", 200, { futureField: { keep: true } })],
  connections: [{ id: "ab", from: "a", to: "b", futureEdge: true }],
  truncated: false,
});
assert.deepEqual(store.get("c").futureField, { keep: true });
assert.equal(store.isViewportComplete({ left: 0, top: 0, right: 300, bottom: 300 }), true);
assert.deepEqual(store.getConnectionsForNode("a").map((item) => item.id), ["ab"]);
assert.deepEqual(store.getVisibleConnections().map((item) => item.id), ["ab"]);

store.pin("a");
store.stageOperation({
  operationId: "move-b",
  type: "node.upsert",
  entityId: "b",
  before: store.get("b"),
  after: node("b", 500),
});
assert.equal(store.get("b").x, 500);
store.applyViewportPage({
  generation: "2",
  bounds: { left: 800, top: -100, right: 1200, bottom: 500 },
  mode: "detail",
  nodes: [node("d", 900)],
  connections: [],
  truncated: false,
});
store.evict();
assert.equal(store.has("a"), true);
assert.equal(store.has("b"), true);
assert.equal(store.has("d"), true);
assert.equal(store.has("c"), false);
assert.equal(store.getPendingOperations().length, 1);
store.ackOperations({
  boardRevision: 2,
  results: [{ operationId: "move-b", status: "applied", entityRevision: 2 }],
});
assert.equal(store.getPendingOperations().length, 0);
assert.equal(store.get("b").revision, 2);
assert.equal(store.boardRevision, 2);

const deleteStore = new CanvasPagedStore({ rules });
deleteStore.applyViewportPage({
  generation: "1",
  mode: "detail",
  nodes: [node("delete-me", 0)],
  connections: [],
});
deleteStore.stageOperation({
  operationId: "delete-pending-node",
  type: "node.delete",
  entityId: "delete-me",
  before: deleteStore.get("delete-me"),
  after: null,
});
deleteStore.applyViewportPage({
  generation: "2",
  mode: "detail",
  nodes: [node("delete-me", 0)],
  connections: [],
});
assert.equal(deleteStore.has("delete-me"), false, "a stale viewport response must not recreate a node that is pending deletion");

deleteStore.ackOperations({
  boardRevision: 2,
  results: [{ operationId: "delete-pending-node", status: "applied" }],
});
const staleDeletedNodePage = deleteStore.applyViewportPage({
  generation: "3",
  boardRevision: 2,
  mode: "detail",
  nodes: [node("delete-me", 0)],
  connections: [],
});
assert.equal(staleDeletedNodePage, true, "a current-version viewport response can still be processed");
assert.equal(deleteStore.has("delete-me"), false, "an acknowledged deletion must survive later canvas movement and a late viewport response");
const delayedDetachedSync = deleteStore.mergeSerialized("delete-me", node("delete-me", 0));
assert.equal(delayedDetachedSync, null, "a delayed focusout sync must not write a tombstoned node back into the store");
assert.equal(deleteStore.has("delete-me"), false, "a detached deleted node must remain absent after its delayed sync runs");
deleteStore.stageOperation({
  operationId: "undo-delete-pending-node",
  type: "node.upsert",
  entityId: "delete-me",
  before: null,
  after: node("delete-me", 0),
});
assert.equal(deleteStore.has("delete-me"), true, "undo must explicitly restore a deleted node");

const sceneDeleteStore = new CanvasPagedStore({ rules });
sceneDeleteStore.applyViewportPage({
  generation: "1",
  boardRevision: 1,
  mode: "scene",
  visualNodes: [
    ["scene-delete-me", "image", 0, 0, 160, 160, 0, "/delete.png"],
    ["scene-keep", "image", 200, 0, 160, 160, 0, "/keep.png"],
  ],
  texturedNodeIds: ["scene-delete-me", "scene-keep"],
  visualConnections: [],
});
sceneDeleteStore.stageOperation({
  operationId: "delete-scene-node",
  type: "node.delete",
  entityId: "scene-delete-me",
  before: node("scene-delete-me", 0),
  after: null,
});
assert.deepEqual(
  sceneDeleteStore.scenePage.visualNodes.map((item) => item[0]),
  ["scene-keep"],
  "deleting a node must immediately remove its scene-layer sprite",
);
assert.deepEqual(
  sceneDeleteStore.scenePage.texturedNodeIds,
  ["scene-keep"],
  "deleting a node must immediately remove its scene-layer texture reference",
);
sceneDeleteStore.applyViewportPage({
  generation: "2",
  boardRevision: 2,
  mode: "scene",
  visualNodes: [
    ["scene-delete-me", "image", 0, 0, 160, 160, 0, "/delete.png"],
    ["scene-keep", "image", 200, 0, 160, 160, 0, "/keep.png"],
  ],
  texturedNodeIds: ["scene-delete-me", "scene-keep"],
  visualConnections: [],
});
assert.deepEqual(
  sceneDeleteStore.scenePage.visualNodes.map((item) => item[0]),
  ["scene-keep"],
  "late scene pages must not redraw a deleted node while panning",
);
sceneDeleteStore.stageOperation({
  operationId: "undo-delete-scene-node",
  type: "node.upsert",
  entityId: "scene-delete-me",
  before: null,
  after: node("scene-delete-me", 0),
});
sceneDeleteStore.applyViewportPage({
  generation: "3",
  boardRevision: 3,
  mode: "scene",
  visualNodes: [
    ["scene-delete-me", "image", 0, 0, 160, 160, 0, "/delete.png"],
    ["scene-keep", "image", 200, 0, 160, 160, 0, "/keep.png"],
  ],
  texturedNodeIds: ["scene-delete-me", "scene-keep"],
  visualConnections: [],
});
assert.deepEqual(
  sceneDeleteStore.scenePage.visualNodes.map((item) => item[0]),
  ["scene-delete-me", "scene-keep"],
  "undo must allow the restored node to render in the scene layer again",
);

const staleApplied = store.applyViewportPage({
  generation: "1",
  mode: "detail",
  nodes: [node("stale", 0)],
  connections: [],
});
assert.equal(staleApplied, false);
assert.equal(store.has("stale"), false);

store.setMounted("a", { id: "mounted-a" }, "full");
store.unpin("a");
store.applyViewportPage({
  generation: "3",
  mode: "detail",
  nodes: [node("e", 1000)],
  connections: [],
});
store.evict();
assert.equal(store.has("a"), true, "mounted nodes must not be evicted");

const sceneSize = store.size;
store.applyViewportPage({
  generation: "4",
  mode: "scene",
  visualNodes: [{ id: "scene-a", kind: "image", x: 0, y: 0, width: 100, height: 80 }],
  visualConnections: [],
});
assert.ok(store.scenePage);
assert.equal(store.lodPage, null);
assert.equal(store.size, sceneSize, "scene sprites must not enter the detail index");
store.applyViewportPage({
  generation: "5",
  mode: "detail",
  nodes: [node("detail-after-scene", 0)],
  connections: [],
});
assert.equal(store.scenePage, null);

const bytesStore = new CanvasPagedStore({
  rules,
  maxModels: 10,
  maxEstimatedBytes: 500,
});
bytesStore.applyViewportPage({
  generation: "1",
  mode: "detail",
  nodes: [
    node("large-a", 0, { text: "x".repeat(400) }),
    node("large-b", 100, { text: "y".repeat(400) }),
  ],
  connections: [],
});
bytesStore.evict();
assert.ok(bytesStore.size < 2, "byte limits must evict oversized unpinned nodes");

console.log("Canvas paged store checks passed.");
