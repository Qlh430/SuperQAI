const assert = require("node:assert/strict");
const rules = require("../canvas-virtualization-rules");
const { CanvasPagedStore } = require("../canvas-paged-store");

/**
 * A batch another account already saved must land in the store without ever
 * becoming this client's pending work, otherwise the receiver's next local save
 * re-uploads someone else's operations and collides on the revision.
 */

function node(id, x, extra = {}) {
  return { id, kind: "text", x, y: 0, width: 80, height: 80, ...extra };
}

const store = new CanvasPagedStore({ rules, maxModels: 64, maxEstimatedBytes: 1 << 20 });
store.applyViewportPage({
  generation: "1",
  boardRevision: 4,
  bounds: { left: -100, top: -100, right: 500, bottom: 500 },
  mode: "detail",
  nodes: [node("mine", 0)],
  connections: [],
});

assert.equal(store.getPendingOperations().length, 0);

const applied = store.applyCommitted([
  { operationId: "peer-add", type: "node.upsert", entityId: "peer", after: node("peer", 400, { text: "协作者创建" }) },
  { operationId: "peer-link", type: "connection.upsert", entityId: "mine-peer", after: { id: "mine-peer", from: "mine", to: "peer" } },
]);
assert.equal(applied, 2, "both supported operations are applied");
assert.equal(store.get("peer").text, "协作者创建", "the received node is resident");
assert.deepEqual(store.getConnectionsForNode("mine").map((item) => item.id), ["mine-peer"]);
assert.equal(store.getPendingOperations().length, 0, "a committed batch is never re-staged for upload");
assert.equal(store.boardRevision, 4, "applying a batch does not move the revision on its own");

const removed = store.applyCommitted([
  { operationId: "peer-drop-link", type: "connection.delete", entityId: "mine-peer" },
  { operationId: "peer-drop-node", type: "node.delete", entityId: "peer" },
]);
assert.equal(removed, 2);
assert.equal(store.has("peer"), false);
assert.equal(store.getConnectionsForNode("mine").length, 0);
assert.equal(store.getPendingOperations().length, 0);

// A viewport response that was already in flight when the deletion arrived must
// not bring the node back.
store.applyViewportPage({
  generation: "2",
  boardRevision: 6,
  bounds: { left: -100, top: -100, right: 900, bottom: 900 },
  mode: "detail",
  nodes: [node("peer", 400)],
  connections: [],
});
assert.equal(store.has("peer"), false, "a stale page cannot resurrect a deleted node");

assert.equal(store.applyCommitted([{ type: "board.patch", entityId: "board" }]), 0, "an unsupported operation is ignored");
assert.equal(store.applyCommitted(null), 0);
assert.equal(store.getPendingOperations().length, 0);

console.log("Canvas collaboration store checks passed.");
