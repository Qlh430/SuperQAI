const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const schema = require("../canvas-schema");

const db = new DatabaseSync(":memory:");
schema.configureDatabase(db);
schema.initializeSchema(db);

assert.equal(schema.SCHEMA_VERSION, 2);
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
  "media_refs",
  "board_operations",
  "lod_tiles",
  "node_previews",
].forEach((name) => {
  assert.ok(tables.includes(name), `missing ${name}`);
});

const boardColumns = db.prepare("PRAGMA table_info(boards)").all().map((row) => row.name);
["external_id", "revision", "schema_version", "migration_state", "validation_hash"].forEach((name) => {
  assert.ok(boardColumns.includes(name), `missing boards.${name}`);
});

const nodeColumns = db.prepare("PRAGMA table_info(nodes)").all().map((row) => row.name);
["external_id", "x", "y", "width", "height", "revision", "payload_json"].forEach((name) => {
  assert.ok(nodeColumns.includes(name), `missing nodes.${name}`);
});

const previewColumns = db.prepare("PRAGMA table_info(node_previews)").all().map((row) => row.name);
["board_pk", "node_id", "source", "z_order", "updated_at"].forEach((name) => {
  assert.ok(previewColumns.includes(name), `missing node_previews.${name}`);
});

schema.initializeSchema(db);
assert.equal(schema.readSchemaVersion(db), schema.SCHEMA_VERSION);

db.close();
console.log("Canvas schema checks passed.");
