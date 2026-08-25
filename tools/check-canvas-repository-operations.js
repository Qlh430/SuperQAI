const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-repository-operations-"));
  const repository = createCanvasRepository({
    dbPath: path.join(root, "canvas.db"),
    requestTimeoutMs: 10_000,
  });

  try {
    await repository.ready();
    const created = await repository.createBoard({
      id: "board-1",
      title: "Board 1",
      createdAt: "2026-08-25T00:00:00.000Z",
      viewport: { x: 0, y: 0, scale: 1 },
    });
    assert.equal(created.id, "board-1");
    assert.equal(created.revision, 0);

    const result = await repository.applyOperations({
      boardId: "board-1",
      baseRevision: 0,
      operations: [
        {
          operationId: "op-1",
          type: "node.upsert",
          entityId: "n1",
          before: null,
          after: {
            id: "n1",
            kind: "text",
            x: -1_000_000_000,
            y: 20,
            width: 320,
            height: 240,
            text: "left",
            futureField: { keep: true },
          },
        },
        {
          operationId: "op-2",
          type: "node.upsert",
          entityId: "n2",
          before: null,
          after: {
            id: "n2",
            kind: "image",
            x: -999_999_500,
            y: 40,
            width: 320,
            height: 240,
            imageSrc: "/image.png",
          },
        },
        {
          operationId: "op-3",
          type: "connection.upsert",
          entityId: "c1",
          before: null,
          after: { id: "c1", from: "n1", to: "n2", toPort: "input" },
        },
      ],
    });
    assert.equal(result.boardRevision, 1);
    assert.deepEqual(result.results.map((item) => item.status), ["applied", "applied", "applied"]);

    const duplicate = await repository.applyOperations({
      boardId: "board-1",
      baseRevision: 1,
      operations: [{
        operationId: "op-1",
        type: "node.upsert",
        entityId: "n1",
        before: null,
        after: { id: "n1" },
      }],
    });
    assert.equal(duplicate.boardRevision, 1);
    assert.equal(duplicate.results[0].status, "duplicate");

    const page = await repository.queryViewport({
      boardId: "board-1",
      left: -1_000_000_100,
      top: 0,
      right: -999_999_000,
      bottom: 500,
      scale: 1,
      nodeLimit: 800,
      connectionLimit: 1200,
    });
    assert.equal(page.mode, "detail");
    assert.equal(page.nodes.length, 2);
    assert.equal(page.connections.length, 1);
    assert.deepEqual(page.nodes.find((node) => node.id === "n1").futureField, { keep: true });

    const lod = await repository.queryViewport({
      boardId: "board-1",
      left: -1_000_001_000,
      top: -1000,
      right: -999_998_000,
      bottom: 2000,
      scale: 0.05,
      nodeLimit: 800,
      connectionLimit: 1200,
    });
    assert.equal(lod.mode, "lod");
    assert.equal(lod.lodNodes.reduce((total, item) => total + item.count, 0), 2);

    const statuses = await repository.getOperationStatuses(["op-1", "op-2", "missing"]);
    assert.deepEqual(statuses.map((item) => [item.operationId, item.committed]), [
      ["op-1", true],
      ["op-2", true],
      ["missing", false],
    ]);

    await assert.rejects(
      () => repository.applyOperations({
        boardId: "board-1",
        baseRevision: 0,
        operations: [{
          operationId: "stale-op",
          type: "node.upsert",
          entityId: "stale",
          before: null,
          after: { id: "stale", kind: "text", x: 0, y: 0, width: 100, height: 100 },
        }],
      }),
      (error) => error.code === "revision_conflict",
    );

    await assert.rejects(
      () => repository.applyOperations({
        boardId: "board-1",
        baseRevision: 1,
        operations: [
          {
            operationId: "rollback-node",
            type: "node.upsert",
            entityId: "n3",
            before: null,
            after: { id: "n3", kind: "text", x: 0, y: 0, width: 100, height: 100 },
          },
          {
            operationId: "rollback-connection",
            type: "connection.upsert",
            entityId: "bad",
            before: null,
            after: { id: "bad", from: "n3", to: "missing" },
          },
        ],
      }),
      (error) => error.code === "connection_endpoint_missing",
    );

    const afterRollback = await repository.queryViewport({
      boardId: "board-1",
      left: -100,
      top: -100,
      right: 200,
      bottom: 200,
      scale: 1,
      nodeLimit: 800,
      connectionLimit: 1200,
    });
    assert.equal(afterRollback.nodes.some((node) => node.id === "n3"), false);
    assert.equal((await repository.getBoardMeta("board-1")).revision, 1);

    const nodeExport = await repository.exportBoardPage({
      boardId: "board-1",
      entity: "nodes",
      cursor: "",
      limit: 1,
    });
    assert.equal(nodeExport.items.length, 1);
    assert.ok(nodeExport.nextCursor);

    const secondNodeExport = await repository.exportBoardPage({
      boardId: "board-1",
      entity: "nodes",
      cursor: nodeExport.nextCursor,
      limit: 1,
    });
    assert.equal(secondNodeExport.items.length, 1);
    assert.equal(secondNodeExport.nextCursor, "");

    const boards = await repository.listBoards();
    assert.equal(boards.length, 1);
    assert.equal(boards[0].nodeCount, 2);
    assert.equal(boards[0].connectionCount, 1);

    const moved = await repository.applyOperations({
      boardId: "board-1",
      baseRevision: 1,
      operations: [{
        operationId: "move-n2",
        type: "node.upsert",
        entityId: "n2",
        before: page.nodes.find((node) => node.id === "n2"),
        after: {
          ...page.nodes.find((node) => node.id === "n2"),
          x: 2_000_000_000,
          y: -2_000_000_000,
        },
      }],
    });
    assert.equal(moved.boardRevision, 2);

    const oldAreaLod = await repository.queryViewport({
      boardId: "board-1",
      left: -1_000_001_000,
      top: -1000,
      right: -999_998_000,
      bottom: 2000,
      scale: 0.05,
    });
    assert.equal(oldAreaLod.lodNodes.reduce((total, item) => total + item.count, 0), 1);

    const newAreaLod = await repository.queryViewport({
      boardId: "board-1",
      left: 1_999_999_000,
      top: -2_000_001_000,
      right: 2_000_001_000,
      bottom: -1_999_999_000,
      scale: 0.05,
    });
    assert.equal(newAreaLod.lodNodes.reduce((total, item) => total + item.count, 0), 1);
  } finally {
    await repository.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("Canvas repository operation checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
