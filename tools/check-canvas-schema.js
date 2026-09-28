const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const schema = require("../canvas-schema");

const db = new DatabaseSync(":memory:");
schema.configureDatabase(db);
schema.initializeSchema(db);

assert.equal(schema.SCHEMA_VERSION, 5);
assert.equal(schema.readSchemaVersion(db), schema.SCHEMA_VERSION);
assert.equal(Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys), 1);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
  .all()
  .map((row) => row.name);

[
  "boards",
  "nodes",
  "node_spatial",
  "connections",
  "connection_spatial",
  "connection_geometry",
  "media_refs",
  "board_operations",
  "lod_tiles",
  "node_previews",
].forEach((name) => {
  assert.ok(tables.includes(name), `missing ${name}`);
});

const boardColumns = db.prepare("PRAGMA table_info(boards)").all().map((row) => row.name);
["external_id", "project_id", "revision", "schema_version", "migration_state", "validation_hash"].forEach((name) => {
  assert.ok(boardColumns.includes(name), `missing boards.${name}`);
});

const nodeColumns = db.prepare("PRAGMA table_info(nodes)").all().map((row) => row.name);
["external_id", "x", "y", "width", "height", "revision", "payload_json"].forEach((name) => {
  assert.ok(nodeColumns.includes(name), `missing nodes.${name}`);
});

const previewColumns = db.prepare("PRAGMA table_info(node_previews)").all().map((row) => row.name);
["board_pk", "node_id", "source", "title", "z_order", "updated_at"].forEach((name) => {
  assert.ok(previewColumns.includes(name), `missing node_previews.${name}`);
});
const connectionGeometryColumns = db
  .prepare("PRAGMA table_info(connection_geometry)")
  .all()
  .map((row) => row.name);
["connection_pk", "from_x", "from_y", "to_x", "to_y"].forEach((name) => {
  assert.ok(connectionGeometryColumns.includes(name), `missing connection_geometry.${name}`);
});

schema.initializeSchema(db);
assert.equal(schema.readSchemaVersion(db), schema.SCHEMA_VERSION);

db.close();

const legacy = new DatabaseSync(":memory:");
schema.configureDatabase(legacy);
legacy.exec(`
  CREATE TABLE boards (
    pk INTEGER PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    viewport_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 2,
    migration_state TEXT NOT NULL DEFAULT 'active',
    validation_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) STRICT;
  CREATE TABLE node_previews (
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    source TEXT NOT NULL,
    z_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(board_pk, node_id)
  ) STRICT, WITHOUT ROWID;
  PRAGMA user_version = 2;
`);
schema.initializeSchema(legacy);
assert.ok(
  legacy.prepare("PRAGMA table_info(node_previews)").all().some((row) => row.name === "title"),
  "schema v2 preview index must upgrade in place",
);
assert.equal(schema.readSchemaVersion(legacy), 5);
legacy.close();
console.log("Canvas schema checks passed.");
