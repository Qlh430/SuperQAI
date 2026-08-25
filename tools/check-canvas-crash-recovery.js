const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function close(repository) {
  await repository?.close().catch(() => {});
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-crash-recovery-"));
  const dbPath = path.join(root, "canvas.db");
  const backupFile = path.join(root, "legacy-source.bak");
  fs.writeFileSync(backupFile, "legacy bytes must remain identical\n");
  const backupHash = hashFile(backupFile);
  let repository;
  try {
    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 20_000 });
    await repository.ready();
    await repository.createBoard({ id: "operation-crash", title: "operation crash" });
    const committed = {
      operationId: "committed-before-crash",
      type: "node.upsert",
      entityId: "committed-node",
      after: { id: "committed-node", kind: "text", x: 0, y: 0, width: 200, height: 100 },
    };
    await repository.applyOperations({ boardId: "operation-crash", baseRevision: 0, operations: [committed] });
    await close(repository);

    const interrupted = Array.from({ length: 20 }, (_, index) => ({
      operationId: `interrupted-${index}`,
      type: "node.upsert",
      entityId: `interrupted-node-${index}`,
      after: { id: `interrupted-node-${index}`, kind: "text", x: index * 10, y: 0, width: 100, height: 80 },
    }));
    repository = createCanvasRepository({
      dbPath,
      requestTimeoutMs: 20_000,
      testFaultStage: "after_sql_before_commit",
    });
    await repository.ready();
    await assert.rejects(
      repository.applyOperations({ boardId: "operation-crash", baseRevision: 1, operations: interrupted }),
      /worker exited|repository worker/i,
    );
    await close(repository);

    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 20_000 });
    await repository.ready();
    assert.deepEqual(await repository.quickCheck(), { ok: true, result: "ok" });
    const statuses = await repository.getOperationStatuses(interrupted.map((item) => item.operationId));
    assert.equal(statuses.filter((item) => item.committed).length, 0);
    const retry = await repository.applyOperations({
      boardId: "operation-crash",
      baseRevision: 1,
      operations: interrupted,
    });
    assert.equal(retry.results.filter((item) => item.status === "applied").length, interrupted.length);
    const duplicate = await repository.applyOperations({
      boardId: "operation-crash",
      baseRevision: retry.boardRevision,
      operations: interrupted,
    });
    assert.equal(duplicate.results.filter((item) => item.status === "duplicate").length, interrupted.length);
    await close(repository);

    repository = createCanvasRepository({
      dbPath,
      requestTimeoutMs: 20_000,
      testFaultStage: "after_migration_begin_before_commit",
    });
    await repository.ready();
    await assert.rejects(
      repository.beginLegacyImport({
        board: { id: "migration-crash", title: "migration crash", nodes: [], connections: [] },
        backupFile,
      }),
      /worker exited|repository worker/i,
    );
    await close(repository);

    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 20_000 });
    await repository.ready();
    assert.equal((await repository.listBoards()).some((board) => board.id === "migration-crash"), false);
    await repository.beginLegacyImport({
      board: { id: "migration-crash", title: "migration crash", nodes: [], connections: [] },
      backupFile,
    });
    await close(repository);

    repository = createCanvasRepository({
      dbPath,
      requestTimeoutMs: 20_000,
      testFaultStage: "after_import_sql_before_commit",
    });
    await repository.ready();
    await assert.rejects(
      repository.importLegacyBatch({
        boardId: "migration-crash",
        entity: "nodes",
        offset: 0,
        items: [{ id: "legacy-node", kind: "text", x: 0, y: 0, width: 100, height: 100 }],
      }),
      /worker exited|repository worker/i,
    );
    await close(repository);

    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 20_000 });
    await repository.ready();
    assert.deepEqual(await repository.quickCheck(), { ok: true, result: "ok" });
    const migrating = await repository.getBoardMeta("migration-crash");
    assert.equal(migrating.migrationState, "migrating");
    assert.equal(migrating.nodeCount, 0);
    assert.equal((await repository.listBoards()).some((board) => board.id === "migration-crash"), false);
    await repository.importLegacyBatch({
      boardId: "migration-crash",
      entity: "nodes",
      offset: 0,
      items: [{ id: "legacy-node", kind: "text", x: 0, y: 0, width: 100, height: 100 }],
    });
    await repository.activateImportedBoard({ boardId: "migration-crash", validation: { hash: "recovered" } });
    assert.equal((await repository.getBoardMeta("migration-crash")).nodeCount, 1);
    assert.equal(hashFile(backupFile), backupHash);
    console.log("Canvas crash recovery checks passed.");
  } finally {
    await close(repository);
    const resolved = path.resolve(root);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
