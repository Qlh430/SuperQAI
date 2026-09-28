const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createCanvasRepository } = require("../canvas-repository");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-repository-operations-"));
  const databaseFile = path.join(root, "canvas.db");
  const repository = createCanvasRepository({
    dbPath: databaseFile,
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
    assert.equal(lod.mode, "detail", "low scale alone must not aggregate a small board");
    assert.equal(lod.candidateCount, 2);
    assert.equal(lod.nodes.length, 2);

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
    assert.equal(oldAreaLod.mode, "detail");
    assert.equal(oldAreaLod.candidateCount, 1);
    assert.equal(oldAreaLod.nodes.length, 1);

    const newAreaLod = await repository.queryViewport({
      boardId: "board-1",
      left: 1_999_999_000,
      top: -2_000_001_000,
      right: 2_000_001_000,
      bottom: -1_999_999_000,
      scale: 0.05,
    });
    assert.equal(newAreaLod.mode, "detail");
    assert.equal(newAreaLod.candidateCount, 1);
    assert.equal(newAreaLod.nodes.length, 1);

    await repository.beginLegacyImport({
      board: {
        id: "dense-board",
        title: "Dense board",
        viewport: { x: 0, y: 0, scale: 0.74 },
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
      backupFile: "dense-board-test.json",
    });
    const denseNodes = Array.from({ length: 801 }, (_, index) => ({
      id: `dense-${index + 1}`,
      kind: index % 2 === 0 ? "image" : "text",
      x: index * 200,
      y: 0,
      width: 120,
      height: 100,
      imageName: index % 2 === 0 ? `图片 ${index + 1}` : undefined,
      text: index % 2 === 1 ? `文字 ${index + 1}` : undefined,
    }));
    await repository.importLegacyBatch({
      boardId: "dense-board",
      entity: "nodes",
      items: denseNodes,
      offset: 0,
    });
    const denseConnections = Array.from({ length: 1_400 }, (_, index) => ({
      id: `dense-edge-${index + 1}`,
      from: `dense-${(index % 800) + 1}`,
      to: `dense-${((index + 1) % 800) + 1}`,
    }));
    for (let offset = 0; offset < denseConnections.length; offset += 700) {
      await repository.importLegacyBatch({
        boardId: "dense-board",
        entity: "connections",
        items: denseConnections.slice(offset, offset + 700),
        offset,
      });
    }
    await repository.activateImportedBoard({
      boardId: "dense-board",
      validation: { hash: "dense-board-test" },
    });
    const maxFullCandidates = require("../canvas-virtualization-rules").MAX_FULL_NODE_CANDIDATES;
    const maxFullPage = await repository.queryViewport({
      boardId: "dense-board",
      left: -1,
      top: -1,
      right: (maxFullCandidates - 1) * 200 + 120,
      bottom: 200,
      scale: 0.09,
      nodeLimit: 800,
      connectionLimit: 1,
    });
    assert.equal(maxFullPage.candidateCount, maxFullCandidates);
    assert.equal(maxFullPage.mode, "detail");
    assert.equal(maxFullPage.engineVersion, "canvas-visual-fidelity-v2");
    assert.equal(maxFullPage.nodes.length, maxFullCandidates);
    const firstScenePage = await repository.queryViewport({
      boardId: "dense-board",
      left: -1,
      top: -1,
      right: 160_200,
      bottom: 200,
      scale: 0.74,
      nodeLimit: 800,
      connectionLimit: 1,
    });
    assert.equal(firstScenePage.candidateCount, 801);
    assert.equal(firstScenePage.engineVersion, "canvas-visual-fidelity-v2");
    assert.equal(firstScenePage.mode, "scene");
    assert.equal(firstScenePage.visualNodes.length, 801);
    assert.equal(firstScenePage.visualConnectionCount, 1_200);
    assert.equal(firstScenePage.visualConnectionTotalCount, 1_400);
    assert.equal(firstScenePage.visualConnectionTruncated, true);
    assert.equal(firstScenePage.visualConnections.length, 4_800);
    assert.equal(Object.hasOwn(firstScenePage, "lodNodes"), false);
    assert.ok(firstScenePage.visualNodes.every((node) => (
      node[0] && node[4] > 0 && node[5] > 0 && node[8]
    )));
    assert.equal(firstScenePage.visualNodeEncoding, "tuple-v1");
    const inspection = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      assert.equal(
        Number(inspection.prepare("SELECT COUNT(*) AS count FROM lod_tiles").get().count),
        0,
        "per-node aggregate LOD tiles must not be materialized by the visual-fidelity engine",
      );
    } finally {
      inspection.close();
    }
  } finally {
    await repository.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("Canvas repository operation checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
