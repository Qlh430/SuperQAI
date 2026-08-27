const assert = require("node:assert/strict");
const CanvasAgentBroker = require("../canvas-agent-broker");

let activeBoardId = "board-A";
const writes = [];
let releaseDelayed;
const delayed = new Promise((resolve) => { releaseDelayed = resolve; });
let releaseConcurrent;
const concurrentGate = new Promise((resolve) => { releaseConcurrent = resolve; });

const adapters = {
  create_text_node: async (args, context) => {
    if (args.content === "并发") await concurrentGate;
    context.assertActive(context.scope);
    writes.push({ boardId: context.scope.boardId, content: args.content });
    return { node_id: String(writes.length) };
  },
  update_node: async (args, context) => {
    await delayed;
    context.assertActive(context.scope);
    writes.push({ boardId: context.scope.boardId, nodeId: args.node_id });
    return { node_id: args.node_id };
  },
  set_reference_order: async (args) => ({ count: args.reference_node_ids.length }),
  create_image_node: async (args) => ({ reference_count: args.reference_node_ids.length }),
};

const broker = CanvasAgentBroker.createBroker({
  getCurrentBoardId: () => activeBoardId,
  adapters,
  nextFrame: async () => {},
});
const emptyChanges = Object.fromEntries(
  Object.keys(require("../canvas-agent-capabilities").getCapabilityByToolName("update_node").tool.inputSchema.properties.changes.properties)
    .map((key) => [key, null]),
);

async function run() {
  const scopeA = broker.beginRun({ boardId: "board-A", runId: "run-1" });
  assert.equal(Object.isFrozen(scopeA), true);
  assert.equal(broker.isActive(scopeA), true);

  const first = await broker.execute(scopeA, {
    call_id: "call-1",
    name: "create_text_node",
    arguments: { content: "标题", x: null, y: null },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.equal(first.ok, true);
  assert.equal(writes.length, 1);

  const conflictingDuplicate = await broker.execute(scopeA, {
    call_id: "call-1",
    name: "create_text_node",
    arguments: { content: "不应重复", x: null, y: null },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.equal(conflictingDuplicate.ok, false);
  assert.equal(conflictingDuplicate.code, "call_id_conflict");
  assert.equal(writes.length, 1);

  const exactDuplicate = await broker.execute(scopeA, {
    call_id: "call-1",
    name: "create_text_node",
    arguments: { y: null, content: "标题", x: null },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.deepEqual(exactDuplicate, first, "property order must not change the idempotency fingerprint");
  assert.equal(writes.length, 1);

  const concurrentCall = {
    call_id: "call-concurrent",
    name: "create_text_node",
    arguments: { content: "并发", x: null, y: null },
    board_id: "board-A",
    run_id: "run-1",
  };
  const concurrentFirst = broker.execute(scopeA, concurrentCall);
  const concurrentDuplicate = broker.execute(scopeA, concurrentCall);
  releaseConcurrent();
  const [concurrentOutputA, concurrentOutputB] = await Promise.all([concurrentFirst, concurrentDuplicate]);
  assert.deepEqual(concurrentOutputB, concurrentOutputA);
  assert.equal(writes.filter((item) => item.content === "并发").length, 1, "concurrent duplicate call IDs must execute once");

  const invalidArguments = await broker.execute(scopeA, {
    call_id: "call-invalid-args",
    name: "create_text_node",
    arguments: { content: "缺字段" },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.equal(invalidArguments.code, "invalid_arguments");

  const tooManyReferences = await broker.execute(scopeA, {
    call_id: "call-too-many-refs",
    name: "set_reference_order",
    arguments: { node_id: "1", reference_node_ids: Array.from({ length: 41 }, (_, index) => String(index)) },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.ok(["invalid_arguments", "too_many_targets"].includes(tooManyReferences.code));

  const multiReferenceCreate = await broker.execute(scopeA, {
    call_id: "call-multi-ref-create",
    name: "create_image_node",
    arguments: {
      prompt: "组合参考",
      model: null,
      size: null,
      resolution: null,
      reference_node_ids: ["1", "2"],
      x: null,
      y: null,
    },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.equal(multiReferenceCreate.ok, true);
  assert.equal(multiReferenceCreate.reference_count, 2);

  const delayedCall = broker.execute(scopeA, {
    call_id: "call-2",
    name: "update_node",
    arguments: { node_id: "1", changes: emptyChanges },
    board_id: "board-A",
    run_id: "run-1",
  });
  activeBoardId = "board-B";
  broker.invalidate("board-changed");
  releaseDelayed();
  const expired = await delayedCall;
  assert.equal(expired.ok, false);
  assert.equal(expired.code, "scope_expired");
  assert.equal(writes.length, 2, "a delayed result must not write after switching canvases");

  const wrongBoard = await broker.execute(scopeA, {
    call_id: "call-3",
    name: "create_text_node",
    arguments: { content: "越界", x: null, y: null },
    board_id: "board-A",
    run_id: "run-1",
  });
  assert.equal(wrongBoard.code, "scope_expired");

  const scopeB = broker.beginRun({ boardId: "board-B", runId: "run-2" });
  const mismatchedEnvelope = await broker.execute(scopeB, {
    call_id: "call-4",
    name: "create_text_node",
    arguments: { content: "错误封套", x: null, y: null },
    board_id: "board-A",
    run_id: "run-2",
  });
  assert.equal(mismatchedEnvelope.code, "scope_mismatch");

  const unknown = await broker.execute(scopeB, {
    call_id: "call-5",
    name: "manage_other_canvas",
    arguments: {},
    board_id: "board-B",
    run_id: "run-2",
  });
  assert.equal(unknown.code, "unsupported_tool");

  const classified = broker.classifyCalls([
    { call_id: "p", name: "run_canvas_node", arguments: { node_id: "1" } },
    { call_id: "d", name: "delete_nodes", arguments: { node_ids: ["1", "2"] } },
    { call_id: "s", name: "move_nodes", arguments: { node_ids: ["1"], delta_x: 1, delta_y: 1 } },
  ]);
  assert.deepEqual(classified.map((item) => item.risk), ["paid", "destructive", "safe"]);
  assert.equal(classified[1].targetCount, 2);
  const galleryClassified = broker.classifyCalls([{
    call_id: "g",
    name: "update_gallery",
    arguments: { image_ids: Array(15), remove_image_ids: Array(10), add_node_ids: Array(20) },
  }]);
  assert.equal(galleryClassified[0].targetCount, 45);

  assert.throws(
    () => broker.beginRun({ boardId: "", runId: "run-3" }),
    /boardId/,
  );

  console.log("Canvas agent broker isolation checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
