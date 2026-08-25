const assert = require("node:assert/strict");
const {
  createCanvasQueryService,
  normalizeViewportQuery,
} = require("../canvas-query-service");
const { createCanvasCommandService } = require("../canvas-command-service");

(async () => {
  assert.deepEqual(normalizeViewportQuery({
    left: "100",
    top: "90",
    right: "-20",
    bottom: "-30",
    scale: "0.05",
    nodeLimit: "9999",
    connectionLimit: "9999",
  }), {
    left: -20,
    top: -30,
    right: 100,
    bottom: 90,
    scale: 0.05,
    nodeLimit: 800,
    connectionLimit: 1200,
    generation: "0",
  });

  let legacyActive = false;
  const calls = [];
  const repository = {
    async listBoards() {
      return [{ id: "active", title: "Active", migrationState: "active", deletedAt: "" }];
    },
    async getBoardMeta(boardId) {
      if (boardId === "active") return { id: "active", revision: 2, migrationState: "active" };
      if (boardId === "legacy" && legacyActive) {
        return { id: "legacy", revision: 0, migrationState: "active" };
      }
      const error = new Error("missing");
      error.code = "board_not_found";
      throw error;
    },
    async queryViewport(input) {
      calls.push(["query", input]);
      return { mode: "detail", nodes: [], connections: [], boardRevision: 2 };
    },
    async exportBoardPage(input) {
      calls.push(["export", input]);
      return { items: [], nextCursor: "" };
    },
    async createBoard(input) {
      calls.push(["create", input]);
      return { ...input, revision: 0, migrationState: "active" };
    },
    async applyOperations(input) {
      calls.push(["apply", input]);
      if (input.baseRevision === 1) {
        const error = new Error("stale");
        error.code = "revision_conflict";
        throw error;
      }
      return { boardRevision: 3, results: [] };
    },
    async setBoardTrashState(input) {
      calls.push(["trash", input]);
      return { id: input.boardId, deletedAt: input.trashed ? "now" : "" };
    },
  };
  const migrator = {
    listLegacySummaries() {
      return [{
        id: "legacy",
        title: "Legacy",
        nodeCount: 2,
        connectionCount: 1,
        deletedAt: "",
      }];
    },
    async ensureMigrated(boardId, onProgress) {
      onProgress({ boardId, phase: "nodes", completed: 1, total: 2 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      legacyActive = true;
      return { id: boardId, migrationState: "active" };
    },
  };
  const queryService = createCanvasQueryService({ repository, migrator });
  const commandService = createCanvasCommandService({ repository });

  const listed = await queryService.listBoards();
  assert.deepEqual(listed.boards.map((board) => board.id), ["active", "legacy"]);
  assert.equal(listed.boards[1].migrationState, "pending");
  assert.equal(listed.boards[1].nodes, undefined);

  await assert.rejects(
    () => queryService.getMeta("missing"),
    (error) => error.code === "canvas_board_not_found" && error.status === 404,
  );

  const migrating = await queryService.queryViewport("legacy", { left: 0, top: 0, right: 10, bottom: 10 });
  assert.equal(migrating.state, "migrating");
  assert.equal(migrating.httpStatus, 202);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const page = await queryService.queryViewport("legacy", {
    left: 10,
    top: 10,
    right: -10,
    bottom: -10,
    nodeLimit: 5000,
    connectionLimit: 5000,
  });
  assert.equal(page.mode, "detail");
  assert.equal(page.generation, "0");
  assert.equal(calls.at(-1)[1].nodeLimit, 800);
  assert.equal(calls.at(-1)[1].connectionLimit, 1200);

  await assert.rejects(
    () => commandService.apply("active", {
      baseRevision: 2,
      operations: [{ operationId: "bad", type: "unknown", after: {} }],
    }),
    (error) => error.status === 400 && error.code === "invalid_canvas_operation",
  );
  await assert.rejects(
    () => commandService.apply("active", {
      baseRevision: 2,
      operations: [{
        operationId: "bad-geometry",
        type: "node.upsert",
        entityId: "n1",
        after: { id: "n1", x: Number.NaN, y: 0, width: 10, height: 10 },
      }],
    }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => commandService.apply("active", { baseRevision: 2, operations: new Array(501).fill({}) }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => commandService.apply("active", {
      baseRevision: 1,
      operations: [{
        operationId: "stale",
        type: "node.delete",
        entityId: "n1",
        before: { id: "n1" },
        after: null,
      }],
    }),
    (error) => error.status === 409 && error.code === "revision_conflict",
  );

  const created = await commandService.createBoard({ id: "new", title: "New" });
  assert.equal(created.id, "new");
  await assert.rejects(() => commandService.trash("active", ""), (error) => error.status === 400);
  assert.equal((await commandService.trash("active", "trash-1")).deletedAt, "now");
  assert.equal((await commandService.restore("active", "restore-1")).deletedAt, "");

  console.log("Canvas query and command service checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
