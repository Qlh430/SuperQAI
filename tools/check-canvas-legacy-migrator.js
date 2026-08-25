const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");
const {
  createCanvasLegacyMigrator,
  stableHash,
  validateBoardExport,
} = require("../canvas-legacy-migrator");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-legacy-migrator-"));
  const legacyFile = path.join(root, "canvas-boards.json");
  const backupDirectory = path.join(root, "backups");
  const sourceBoards = [
    {
      id: "legacy-a",
      title: "Legacy A",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
      viewport: { x: -500, y: 25, scale: 0.8 },
      nodes: [
        {
          id: "n1",
          kind: "future-widget",
          x: -1_500_000_000,
          y: -200,
          width: 320,
          height: 180,
          futureField: { nested: [3, 2, 1] },
        },
        {
          id: "n2",
          kind: "image",
          x: -1_499_999_400,
          y: 40,
          width: 512,
          height: 512,
          imageSrc: "/legacy.png",
        },
      ],
      connections: [
        { from: "n1", to: "n2", futureEdgeField: { keep: true } },
      ],
    },
    {
      id: "legacy-b",
      title: "Legacy B",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
      viewport: { x: 0, y: 0, scale: 1 },
      nodes: [],
      connections: [],
    },
  ];
  const sourceBytes = Buffer.from(JSON.stringify(sourceBoards, null, 2));
  fs.writeFileSync(legacyFile, sourceBytes);

  const repository = createCanvasRepository({
    dbPath: path.join(root, "canvas.db"),
    requestTimeoutMs: 10_000,
  });

  try {
    await repository.ready();
    let nodeBatchCount = 0;
    let injected = false;
    const failingRepository = {
      ...repository,
      async importLegacyBatch(input) {
        if (input.entity === "nodes") nodeBatchCount += 1;
        if (!injected && input.entity === "nodes" && nodeBatchCount === 2) {
          injected = true;
          const error = new Error("Injected second-batch failure.");
          error.code = "injected_migration_failure";
          throw error;
        }
        return repository.importLegacyBatch(input);
      },
    };
    const progress = [];
    const failingMigrator = createCanvasLegacyMigrator({
      legacyFile,
      repository: failingRepository,
      backupDirectory,
      batchSize: 1,
    });

    const summaries = failingMigrator.listLegacySummaries();
    assert.deepEqual(summaries.map((item) => [item.id, item.nodeCount, item.connectionCount]), [
      ["legacy-a", 2, 1],
      ["legacy-b", 0, 0],
    ]);
    await assert.rejects(
      () => failingMigrator.ensureMigrated("legacy-a", (item) => progress.push(item)),
      (error) => error.code === "injected_migration_failure",
    );
    assert.equal((await repository.getBoardMeta("legacy-a")).migrationState, "failed");
    assert.equal((await repository.listBoards()).some((board) => board.id === "legacy-a"), false);
    assert.deepEqual(fs.readFileSync(legacyFile), sourceBytes);
    assert.ok(progress.some((item) => item.phase === "backup"));
    assert.ok(progress.some((item) => item.phase === "nodes" && item.completed === 1));

    const migrator = createCanvasLegacyMigrator({
      legacyFile,
      repository,
      backupDirectory,
      batchSize: 1,
    });
    const migrated = await migrator.ensureMigrated("legacy-a");
    assert.equal(migrated.migrationState, "active");
    assert.equal(migrated.nodeCount, 2);
    assert.equal(migrated.connectionCount, 1);

    const backups = fs.readdirSync(backupDirectory)
      .filter((name) => name.startsWith("canvas-boards.json.bak-"));
    assert.ok(backups.length >= 2);
    for (const backup of backups) {
      assert.deepEqual(fs.readFileSync(path.join(backupDirectory, backup)), sourceBytes);
    }
    assert.deepEqual(fs.readFileSync(legacyFile), sourceBytes);

    const exported = await repository.exportImportedBoard({ boardId: "legacy-a" });
    const validation = validateBoardExport(sourceBoards[0], exported);
    assert.equal(validation.nodeCount, 2);
    assert.equal(validation.connectionCount, 1);
    assert.equal(stableHash(exported.nodes), stableHash(sourceBoards[0].nodes));
    assert.equal(stableHash(exported.connections), stableHash(sourceBoards[0].connections));
    assert.deepEqual(exported.nodes[0].futureField, { nested: [3, 2, 1] });
    assert.deepEqual(exported.connections[0].futureEdgeField, { keep: true });
    assert.throws(
      () => validateBoardExport(sourceBoards[0], {
        ...exported,
        connections: [{ from: "n1", to: "missing" }],
      }),
      (error) => error.code === "legacy_validation_failed",
    );

    const state = await migrator.getMigrationState("legacy-a");
    assert.equal(state.state, "active");
    const backupCount = backups.length;
    const alreadyActive = await migrator.ensureMigrated("legacy-a");
    assert.equal(alreadyActive.migrationState, "active");
    assert.equal(fs.readdirSync(backupDirectory).length, backupCount);
  } finally {
    await repository.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("Canvas legacy migration checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
