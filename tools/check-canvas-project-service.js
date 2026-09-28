"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSystemDb, SCHEMA_VERSION } = require("../system-db");
const { createCanvasProjectService } = require("../canvas-project-service");

function withDatabase(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-projects-"));
  const db = createSystemDb({ dbPath: path.join(root, "system.sqlite") });
  try {
    db.migrate();
    return callback(db, root);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withDatabase((db) => {
  assert.equal(SCHEMA_VERSION, 4);
  db.insertUser({ id: "user-a", username: "alice", displayName: "Alice", passwordHash: "hash-a", mustChangePassword: false });
  db.insertUser({ id: "user-b", username: "bob", displayName: "Bob", passwordHash: "hash-b", mustChangePassword: false });

  const service = createCanvasProjectService({ db });
  const project = db.createCanvasProject({ id: "project-a", ownerUserId: "user-a", name: " 未分类 " });
  assert.equal(project.name, "未分类");
  assert.equal(db.listCanvasProjects("user-a").length, 1);
  assert.equal(db.listCanvasProjects("user-b").length, 0);
  assert.throws(() => db.renameCanvasProject("project-a", ""), (error) => error.code === "invalid_canvas_project");
  assert.throws(() => service.requireOwnerProject("user-b", "project-a"), (error) => error.code === "canvas_project_forbidden");

  const first = service.ensureUnclassifiedProject("user-a");
  const second = service.ensureUnclassifiedProject("user-a");
  assert.equal(first.id, second.id);
  assert.equal(first.name, "未分类");
});

console.log("Canvas project service checks passed.");
