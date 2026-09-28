"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { configureDatabase, initializeSchema } = require("../canvas-schema");
const { createCanvasRepository } = require("../canvas-repository");
const { createCanvasCommandService } = require("../canvas-command-service");

(async () => {
  const legacyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-project-v4-")), "legacy.sqlite");
  const legacy = configureDatabase(new DatabaseSync(legacyPath));
  legacy.exec("CREATE TABLE boards (pk INTEGER PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, viewport_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, schema_version INTEGER NOT NULL DEFAULT 4, migration_state TEXT NOT NULL DEFAULT 'active', validation_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT); PRAGMA user_version = 4;");
  legacy.prepare("INSERT INTO boards(external_id,title,viewport_json,created_at,updated_at) VALUES ('legacy-v4','Legacy','{}','2026-01-01','2026-01-01')").run();
  initializeSchema(legacy);
  assert.ok(legacy.prepare("SELECT project_id FROM boards WHERE external_id = 'legacy-v4'").get());
  assert.equal(Number(legacy.prepare("SELECT COUNT(*) AS count FROM boards").get().count), 1);
  legacy.close();
  fs.rmSync(path.dirname(legacyPath), { recursive: true, force: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-project-meta-"));
  const repository = createCanvasRepository({ dbPath: path.join(root, "canvas.sqlite") });
  try {
    await repository.ready();
    const first = await repository.createBoard({ id: "board-a", projectId: "project-a", title: "A" });
    const second = await repository.createBoard({ id: "board-b", projectId: "project-b", title: "B" });
    assert.equal(first.projectId, "project-a");
    assert.equal(second.projectId, "project-b");
    assert.deepEqual((await repository.listBoards({ projectId: "project-a" })).map((board) => board.id), ["board-a"]);
    assert.deepEqual((await repository.listBoards()).map((board) => board.id), ["board-b", "board-a"]);
    const meta = await repository.getBoardMeta("board-a");
    assert.equal(meta.projectId, "project-a");
    const command = createCanvasCommandService({ repository });
    const moved = await command.setProject("board-a", "project-b");
    assert.equal(moved.projectId, "project-b");
    assert.equal(moved.revision, first.revision);
  } finally {
    await repository.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("Canvas project metadata checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
