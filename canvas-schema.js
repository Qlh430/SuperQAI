const SCHEMA_VERSION = 4;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS boards (
    pk INTEGER PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    viewport_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 4,
    migration_state TEXT NOT NULL DEFAULT 'active'
      CHECK (migration_state IN ('pending','migrating','validated','active','failed')),
    validation_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS nodes (
    pk INTEGER PRIMARY KEY,
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    z_order INTEGER NOT NULL,
    kind TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(board_pk, external_id)
  ) STRICT;

  CREATE VIRTUAL TABLE IF NOT EXISTS node_spatial USING rtree(
    pk,
    min_x,
    max_x,
    min_y,
    max_y
  );

  CREATE TABLE IF NOT EXISTS connections (
    pk INTEGER PRIMARY KEY,
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(board_pk, external_id)
  ) STRICT;

  CREATE VIRTUAL TABLE IF NOT EXISTS connection_spatial USING rtree(
    pk,
    min_x,
    max_x,
    min_y,
    max_y
  );

  CREATE TABLE IF NOT EXISTS connection_geometry (
    connection_pk INTEGER PRIMARY KEY REFERENCES connections(pk) ON DELETE CASCADE,
    from_x REAL NOT NULL,
    from_y REAL NOT NULL,
    to_x REAL NOT NULL,
    to_y REAL NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS media_refs (
    pk INTEGER PRIMARY KEY,
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    original_url TEXT,
    thumbnail_url TEXT,
    width INTEGER,
    height INTEGER,
    status TEXT NOT NULL,
    last_accessed_at TEXT,
    UNIQUE(board_pk, node_id, resource_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS node_previews (
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    z_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(board_pk, node_id)
  ) STRICT, WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS board_operations (
    pk INTEGER PRIMARY KEY,
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    operation_id TEXT NOT NULL,
    base_revision INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    request_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(board_pk, operation_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS lod_tiles (
    board_pk INTEGER NOT NULL REFERENCES boards(pk) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    node_count INTEGER NOT NULL,
    bounds_json TEXT NOT NULL,
    type_counts_json TEXT NOT NULL,
    preview_ids_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    PRIMARY KEY(board_pk, level, tile_x, tile_y)
  ) STRICT, WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS nodes_board_order_idx ON nodes(board_pk, z_order);
  CREATE INDEX IF NOT EXISTS connections_board_from_idx ON connections(board_pk, from_id);
  CREATE INDEX IF NOT EXISTS connections_board_to_idx ON connections(board_pk, to_id);
  CREATE INDEX IF NOT EXISTS board_operations_board_created_idx ON board_operations(board_pk, created_at);
  CREATE INDEX IF NOT EXISTS node_previews_board_rank_idx
    ON node_previews(board_pk, z_order DESC, updated_at DESC);
`;

function configureDatabase(db) {
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;");
  if (typeof db.enableDefensive === "function") db.enableDefensive(true);
  return db;
}

function initializeSchema(db) {
  db.exec(SCHEMA_SQL);
  const previewColumns = new Set(
    db.prepare("PRAGMA table_info(node_previews)").all().map((row) => String(row.name)),
  );
  if (!previewColumns.has("title")) {
    db.exec("ALTER TABLE node_previews ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`UPDATE boards SET schema_version = ${SCHEMA_VERSION} WHERE schema_version < ${SCHEMA_VERSION}`);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return SCHEMA_VERSION;
}

function readSchemaVersion(db) {
  return Number(db.prepare("PRAGMA user_version").get()?.user_version || 0);
}

module.exports = {
  SCHEMA_VERSION,
  SCHEMA_SQL,
  configureDatabase,
  initializeSchema,
  readSchemaVersion,
};
