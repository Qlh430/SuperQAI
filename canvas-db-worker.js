const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const {
  configureDatabase,
  initializeSchema,
  readSchemaVersion,
} = require("./canvas-schema");
const {
  getConnectionBounds,
  normalizeBounds,
  padRtreeBounds,
} = require("./canvas-spatial-rules");
const { extractNodePreviewSources, extractNodeSceneTitle } = require("./canvas-node-preview-rules");
const { ENGINE_VERSION } = require("./canvas-engine-contract");
const { selectVisibleSprites } = require("./canvas-scene-rules");

if (!parentPort) throw new Error("Canvas database worker requires a parent port.");

const dbPath = path.resolve(String(workerData?.dbPath || ""));
const requestedTestFaultStage = String(workerData?.testFaultStage || "");
const temporaryRoot = path.resolve(os.tmpdir());
const relativeToTemporaryRoot = path.relative(temporaryRoot, dbPath);
const isTemporaryDatabase = relativeToTemporaryRoot
  && !relativeToTemporaryRoot.startsWith(`..${path.sep}`)
  && relativeToTemporaryRoot !== ".."
  && !path.isAbsolute(relativeToTemporaryRoot);
if (requestedTestFaultStage && !isTemporaryDatabase) {
  throw new Error("Canvas database fault injection is restricted to test temporary directories.");
}
const testFaultStage = isTemporaryDatabase ? requestedTestFaultStage : "";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let database = new DatabaseSync(dbPath, {
  timeout: 5000,
  defensive: true,
});
configureDatabase(database);
initializeSchema(database);

const statementCache = new Map();

function triggerTestFault(stage) {
  if (testFaultStage === stage) process.exit(86);
}

function prepare(sql) {
  const key = String(sql);
  let statement = statementCache.get(key);
  if (!statement) {
    statement = database.prepare(key);
    statementCache.set(key, statement);
  }
  return statement;
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function requiredId(value, label) {
  const id = String(value || "").trim();
  if (!id) throw codedError("invalid_identifier", `${label} requires a non-empty id.`);
  return id;
}

function finiteNumber(value, fallback, label) {
  const number = value === undefined ? Number(fallback) : Number(value);
  if (!Number.isFinite(number)) {
    throw codedError("invalid_node_geometry", `${label} must be a finite number.`);
  }
  return number;
}

function boardRow(boardId) {
  const id = requiredId(boardId, "Board");
  const row = prepare(`
    SELECT pk, external_id, title, viewport_json, revision, schema_version,
           migration_state, validation_hash, created_at, updated_at, deleted_at
      FROM boards
     WHERE external_id = ?
  `).get(id);
  if (!row) throw codedError("board_not_found", `Canvas board not found: ${id}`);
  return row;
}

function toBoardMeta(row) {
  const previewImages = parseJson(row.preview_images_json, []);
  return {
    id: row.external_id,
    title: row.title,
    viewport: parseJson(row.viewport_json, { x: 0, y: 0, scale: 1 }),
    revision: Number(row.revision),
    schemaVersion: Number(row.schema_version),
    migrationState: row.migration_state,
    validationHash: row.validation_hash || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || "",
    nodeCount: Number(row.node_count || 0),
    connectionCount: Number(row.connection_count || 0),
    previewImages: Array.isArray(previewImages)
      ? [...new Set(previewImages.map(String).filter(Boolean))].slice(0, 4)
      : [],
  };
}

function syncNodePreview(boardPk, nodeId, zOrder, payload, updatedAt) {
  const source = extractNodePreviewSources(payload)[0] || "";
  const title = extractNodeSceneTitle(payload);
  prepare(`
    INSERT INTO node_previews(board_pk, node_id, source, title, z_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(board_pk, node_id) DO UPDATE SET
      source = excluded.source,
      title = excluded.title,
      z_order = excluded.z_order,
      updated_at = excluded.updated_at
  `).run(
    boardPk,
    String(nodeId),
    source,
    title,
    Math.trunc(Number(zOrder) || 0),
    String(updatedAt || nowIso()),
  );
}

function backfillNodePreviews(batchSize = 500) {
  let lastPk = 0;
  let backfilled = 0;
  while (true) {
    const rows = prepare(`
      SELECT n.pk, n.board_pk, n.external_id, n.z_order, n.payload_json, n.updated_at
        FROM nodes n
        LEFT JOIN node_previews p
          ON p.board_pk = n.board_pk AND p.node_id = n.external_id
       WHERE n.pk > ? AND (p.node_id IS NULL OR p.title = '')
       ORDER BY n.pk
       LIMIT ?
    `).all(lastPk, Math.max(1, Math.trunc(Number(batchSize) || 500)));
    if (!rows.length) break;
    database.exec("BEGIN IMMEDIATE");
    try {
      rows.forEach((row) => syncNodePreview(
        row.board_pk,
        row.external_id,
        row.z_order,
        parseJson(row.payload_json, {}),
        row.updated_at,
      ));
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    backfilled += rows.length;
    lastPk = Number(rows[rows.length - 1].pk);
  }
  return backfilled;
}

function nodeRect(row) {
  return {
    left: Number(row.x),
    top: Number(row.y),
    right: Number(row.x) + Number(row.width),
    bottom: Number(row.y) + Number(row.height),
  };
}

function writeSpatial(table, pk, bounds) {
  const safeTable = table === "node_spatial" ? "node_spatial" : "connection_spatial";
  const padded = padRtreeBounds(bounds);
  prepare(`DELETE FROM ${safeTable} WHERE pk = ?`).run(pk);
  prepare(`
    INSERT INTO ${safeTable}(pk, min_x, max_x, min_y, max_y)
    VALUES (?, ?, ?, ?, ?)
  `).run(pk, padded.left, padded.right, padded.top, padded.bottom);
}

function readNode(boardPk, externalId) {
  return prepare(`
    SELECT pk, external_id, z_order, kind, x, y, width, height, revision,
           payload_json, created_at, updated_at
      FROM nodes WHERE board_pk = ? AND external_id = ?
  `).get(boardPk, externalId);
}

function refreshConnectionSpatial(boardPk, connectionRow) {
  const from = readNode(boardPk, connectionRow.from_id);
  const to = readNode(boardPk, connectionRow.to_id);
  if (!from || !to) {
    throw codedError(
      "connection_endpoint_missing",
      `Connection ${connectionRow.external_id} references a missing endpoint.`,
    );
  }
  writeSpatial("connection_spatial", connectionRow.pk, getConnectionBounds(nodeRect(from), nodeRect(to)));
  writeConnectionGeometry(connectionRow.pk, from, to);
}

function writeConnectionGeometry(connectionPk, from, to) {
  prepare(`
    INSERT INTO connection_geometry(connection_pk, from_x, from_y, to_x, to_y)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(connection_pk) DO UPDATE SET
      from_x = excluded.from_x,
      from_y = excluded.from_y,
      to_x = excluded.to_x,
      to_y = excluded.to_y
  `).run(
    connectionPk,
    Number(from.x) + Number(from.width),
    Number(from.y) + Number(from.height) * 0.5,
    Number(to.x),
    Number(to.y) + Number(to.height) * 0.5,
  );
}

function backfillConnectionGeometry(batchSize = 500) {
  let lastPk = 0;
  let backfilled = 0;
  while (true) {
    const rows = prepare(`
      SELECT c.pk,
             source.x + source.width AS from_x,
             source.y + source.height * 0.5 AS from_y,
             target.x AS to_x,
             target.y + target.height * 0.5 AS to_y
        FROM connections c
        JOIN nodes source ON source.board_pk = c.board_pk AND source.external_id = c.from_id
        JOIN nodes target ON target.board_pk = c.board_pk AND target.external_id = c.to_id
        LEFT JOIN connection_geometry geometry ON geometry.connection_pk = c.pk
       WHERE c.pk > ? AND geometry.connection_pk IS NULL
       ORDER BY c.pk
       LIMIT ?
    `).all(lastPk, Math.max(1, Math.trunc(Number(batchSize) || 500)));
    if (!rows.length) break;
    database.exec("BEGIN IMMEDIATE");
    try {
      const insert = prepare(`
        INSERT INTO connection_geometry(connection_pk, from_x, from_y, to_x, to_y)
        VALUES (?, ?, ?, ?, ?)
      `);
      rows.forEach((row) => insert.run(
        row.pk,
        Number(row.from_x),
        Number(row.from_y),
        Number(row.to_x),
        Number(row.to_y),
      ));
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    backfilled += rows.length;
    lastPk = Number(rows[rows.length - 1].pk);
  }
  return backfilled;
}

function refreshAttachedConnections(boardPk, nodeId) {
  const rows = prepare(`
    SELECT pk, external_id, from_id, to_id
      FROM connections
     WHERE board_pk = ? AND (from_id = ? OR to_id = ?)
  `).all(boardPk, nodeId, nodeId);
  for (const row of rows) refreshConnectionSpatial(boardPk, row);
}

function upsertNode(boardPk, operation, timestamp) {
  const after = operation.after;
  if (!after || typeof after !== "object") {
    throw codedError("invalid_operation", "node.upsert requires an after payload.");
  }
  const id = requiredId(after.id || operation.entityId, "Node");
  const existing = readNode(boardPk, id);
  const x = finiteNumber(after.x, existing?.x ?? 0, "Node x");
  const y = finiteNumber(after.y, existing?.y ?? 0, "Node y");
  const width = finiteNumber(after.width, existing?.width ?? 160, "Node width");
  const height = finiteNumber(after.height, existing?.height ?? 120, "Node height");
  if (width < 0 || height < 0) {
    throw codedError("invalid_node_geometry", "Node width and height cannot be negative.");
  }
  const zOrder = Math.trunc(finiteNumber(
    after.zOrder ?? after.z,
    existing?.z_order ?? 0,
    "Node z-order",
  ));
  const kind = String(after.kind || existing?.kind || "text");
  const revision = Number(existing?.revision || 0) + 1;
  const payload = { ...parseJson(existing?.payload_json, {}), ...after, id, kind, x, y, width, height };
  let pk;
  if (existing) {
    prepare(`
      UPDATE nodes
         SET z_order = ?, kind = ?, x = ?, y = ?, width = ?, height = ?,
             revision = ?, payload_json = ?, updated_at = ?
       WHERE pk = ?
    `).run(zOrder, kind, x, y, width, height, revision, JSON.stringify(payload), timestamp, existing.pk);
    pk = existing.pk;
  } else {
    const inserted = prepare(`
      INSERT INTO nodes(
        board_pk, external_id, z_order, kind, x, y, width, height,
        revision, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      boardPk, id, zOrder, kind, x, y, width, height,
      revision, JSON.stringify(payload), timestamp, timestamp,
    );
    pk = Number(inserted.lastInsertRowid);
  }
  writeSpatial("node_spatial", pk, { left: x, top: y, right: x + width, bottom: y + height });
  syncNodePreview(boardPk, id, zOrder, payload, timestamp);
  refreshAttachedConnections(boardPk, id);
  return { entityId: id, entityRevision: revision };
}

function deleteConnectionRow(row) {
  prepare("DELETE FROM connection_spatial WHERE pk = ?").run(row.pk);
  prepare("DELETE FROM connections WHERE pk = ?").run(row.pk);
}

function deleteNode(boardPk, operation) {
  const id = requiredId(operation.entityId || operation.before?.id, "Node");
  const existing = readNode(boardPk, id);
  if (!existing) return { entityId: id, entityRevision: 0 };
  const connections = prepare(`
    SELECT pk FROM connections
     WHERE board_pk = ? AND (from_id = ? OR to_id = ?)
  `).all(boardPk, id, id);
  for (const connection of connections) deleteConnectionRow(connection);
  prepare("DELETE FROM node_previews WHERE board_pk = ? AND node_id = ?").run(boardPk, id);
  prepare("DELETE FROM node_spatial WHERE pk = ?").run(existing.pk);
  prepare("DELETE FROM nodes WHERE pk = ?").run(existing.pk);
  return { entityId: id, entityRevision: Number(existing.revision) + 1 };
}

function upsertConnection(boardPk, operation, timestamp) {
  const after = operation.after;
  if (!after || typeof after !== "object") {
    throw codedError("invalid_operation", "connection.upsert requires an after payload.");
  }
  const id = requiredId(after.id || operation.entityId, "Connection");
  const existing = prepare(`
    SELECT pk, external_id, from_id, to_id, revision, payload_json, created_at
      FROM connections WHERE board_pk = ? AND external_id = ?
  `).get(boardPk, id);
  const fromId = requiredId(after.from || after.fromId || existing?.from_id, "Connection source");
  const toId = requiredId(after.to || after.toId || existing?.to_id, "Connection target");
  const from = readNode(boardPk, fromId);
  const to = readNode(boardPk, toId);
  if (!from || !to) {
    throw codedError(
      "connection_endpoint_missing",
      `Connection ${id} references missing endpoint ${!from ? fromId : toId}.`,
    );
  }
  const revision = Number(existing?.revision || 0) + 1;
  const payload = {
    ...parseJson(existing?.payload_json, {}),
    ...after,
    id,
    from: fromId,
    to: toId,
  };
  let pk;
  if (existing) {
    prepare(`
      UPDATE connections
         SET from_id = ?, to_id = ?, revision = ?, payload_json = ?, updated_at = ?
       WHERE pk = ?
    `).run(fromId, toId, revision, JSON.stringify(payload), timestamp, existing.pk);
    pk = existing.pk;
  } else {
    const inserted = prepare(`
      INSERT INTO connections(
        board_pk, external_id, from_id, to_id, revision, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(boardPk, id, fromId, toId, revision, JSON.stringify(payload), timestamp, timestamp);
    pk = Number(inserted.lastInsertRowid);
  }
  writeSpatial("connection_spatial", pk, getConnectionBounds(nodeRect(from), nodeRect(to)));
  writeConnectionGeometry(pk, from, to);
  return { entityId: id, entityRevision: revision };
}

function deleteConnection(boardPk, operation) {
  const id = requiredId(operation.entityId || operation.before?.id, "Connection");
  const existing = prepare(`
    SELECT pk, revision FROM connections WHERE board_pk = ? AND external_id = ?
  `).get(boardPk, id);
  if (!existing) return { entityId: id, entityRevision: 0 };
  deleteConnectionRow(existing);
  return { entityId: id, entityRevision: Number(existing.revision) + 1 };
}

function patchBoard(board, operation, timestamp) {
  const after = operation.after || {};
  const title = after.title === undefined ? board.title : String(after.title);
  const viewportJson = after.viewport === undefined
    ? board.viewport_json
    : JSON.stringify(after.viewport || { x: 0, y: 0, scale: 1 });
  prepare(`UPDATE boards SET title = ?, viewport_json = ?, updated_at = ? WHERE pk = ?`)
    .run(title, viewportJson, timestamp, board.pk);
  board.title = title;
  board.viewport_json = viewportJson;
  return { entityId: board.external_id, entityRevision: Number(board.revision) + 1 };
}

function applyOperation(board, operation, timestamp) {
  switch (String(operation.type || "")) {
    case "node.upsert": return upsertNode(board.pk, operation, timestamp);
    case "node.delete": return deleteNode(board.pk, operation);
    case "connection.upsert": return upsertConnection(board.pk, operation, timestamp);
    case "connection.delete": return deleteConnection(board.pk, operation);
    case "board.patch": return patchBoard(board, operation, timestamp);
    default:
      throw codedError("unknown_operation_type", `Unknown canvas operation: ${String(operation.type || "")}`);
  }
}

function exactNodeIntersects(row, bounds) {
  return Number(row.x) + Number(row.width) >= bounds.left
    && Number(row.x) <= bounds.right
    && Number(row.y) + Number(row.height) >= bounds.top
    && Number(row.y) <= bounds.bottom;
}

function hydrateNode(row) {
  return {
    ...parseJson(row.payload_json, {}),
    id: row.external_id,
    kind: row.kind,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    revision: Number(row.revision),
  };
}

function hydrateConnection(row) {
  return {
    ...parseJson(row.payload_json, {}),
    id: row.external_id,
    from: row.from_id,
    to: row.to_id,
    revision: Number(row.revision),
  };
}

function viewportNodeRows(boardPk, bounds, columns = "n.*") {
  return prepare(`
    SELECT ${columns}
      FROM node_spatial s
      CROSS JOIN nodes n ON n.pk = s.pk
     WHERE s.max_x >= ? AND s.min_x <= ?
       AND s.max_y >= ? AND s.min_y <= ?
       AND n.board_pk = ?
       AND n.x + n.width >= ? AND n.x <= ?
       AND n.y + n.height >= ? AND n.y <= ?
     ORDER BY n.z_order, n.pk
  `).all(
    bounds.left, bounds.right, bounds.top, bounds.bottom,
    boardPk,
    bounds.left, bounds.right, bounds.top, bounds.bottom,
  );
}

function viewportVisualRows(boardPk, bounds) {
  return prepare(`
    SELECT n.external_id, n.z_order, n.kind, n.x, n.y, n.width, n.height,
           COALESCE(p.source, '') AS preview_source,
           COALESCE(p.title, n.kind) AS title
      FROM node_spatial s
      CROSS JOIN nodes n ON n.pk = s.pk
      LEFT JOIN node_previews p
        ON p.board_pk = n.board_pk AND p.node_id = n.external_id
     WHERE s.max_x >= ? AND s.min_x <= ?
       AND s.max_y >= ? AND s.min_y <= ?
       AND n.board_pk = ?
       AND n.x + n.width >= ? AND n.x <= ?
       AND n.y + n.height >= ? AND n.y <= ?
  `).all(
    bounds.left, bounds.right, bounds.top, bounds.bottom,
    boardPk,
    bounds.left, bounds.right, bounds.top, bounds.bottom,
  );
}

function viewportVisualConnectionRows(boardPk, bounds) {
  const rows = prepare(`
    SELECT geometry.from_x, geometry.from_y, geometry.to_x, geometry.to_y
      FROM connection_spatial s
      CROSS JOIN connections c ON c.pk = s.pk
      CROSS JOIN connection_geometry geometry ON geometry.connection_pk = c.pk
     WHERE s.max_x >= ? AND s.min_x <= ?
       AND s.max_y >= ? AND s.min_y <= ?
       AND c.board_pk = ?
  `).all(bounds.left, bounds.right, bounds.top, bounds.bottom, boardPk);
  const segments = new Array(rows.length * 4);
  rows.forEach((row, index) => {
    const offset = index * 4;
    segments[offset] = Number(row.from_x);
    segments[offset + 1] = Number(row.from_y);
    segments[offset + 2] = Number(row.to_x);
    segments[offset + 3] = Number(row.to_y);
  });
  return { count: rows.length, segments };
}

function packVisualNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => ([
    String(node.id),
    String(node.kind || "image"),
    Number(node.x),
    Number(node.y),
    Number(node.width),
    Number(node.height),
    Number(node.zOrder || 0),
    String(node.previewSource || ""),
    String(node.title || "节点"),
  ]));
}

function removeBoardStorage(boardPk) {
  prepare(`DELETE FROM node_spatial WHERE pk IN (SELECT pk FROM nodes WHERE board_pk = ?)`)
    .run(boardPk);
  prepare(`DELETE FROM connection_spatial WHERE pk IN (SELECT pk FROM connections WHERE board_pk = ?)`)
    .run(boardPk);
  prepare("DELETE FROM boards WHERE pk = ?").run(boardPk);
}

function requireMigratingBoard(boardId) {
  const board = boardRow(boardId);
  if (board.migration_state !== "migrating") {
    throw codedError(
      "legacy_migration_state_invalid",
      `Canvas ${board.external_id} is not in the migrating state.`,
    );
  }
  return board;
}

function importLegacyNode(boardPk, item, zOrder, timestamp) {
  const id = requiredId(item?.id, "Legacy node");
  const x = finiteNumber(item?.x, 0, "Legacy node x");
  const y = finiteNumber(item?.y, 0, "Legacy node y");
  const width = finiteNumber(item?.width, 0, "Legacy node width");
  const height = finiteNumber(item?.height, 0, "Legacy node height");
  if (width < 0 || height < 0) {
    throw codedError("invalid_node_geometry", "Legacy node width and height cannot be negative.");
  }
  const kind = String(item?.kind || "unknown");
  const inserted = prepare(`
    INSERT INTO nodes(
      board_pk, external_id, z_order, kind, x, y, width, height,
      revision, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    boardPk,
    id,
    Math.trunc(finiteNumber(item?.zOrder ?? item?.z, zOrder, "Legacy node z-order")),
    kind,
    x,
    y,
    width,
    height,
    JSON.stringify(item),
    timestamp,
    timestamp,
  );
  const pk = Number(inserted.lastInsertRowid);
  writeSpatial("node_spatial", pk, { left: x, top: y, right: x + width, bottom: y + height });
  syncNodePreview(boardPk, id, Math.trunc(finiteNumber(item?.zOrder ?? item?.z, zOrder, "Legacy node z-order")), item, timestamp);
}

function importLegacyConnection(boardPk, item, storageIndex, timestamp) {
  const fromId = requiredId(item?.from, "Legacy connection source");
  const toId = requiredId(item?.to, "Legacy connection target");
  const from = readNode(boardPk, fromId);
  const to = readNode(boardPk, toId);
  if (!from || !to) {
    throw codedError(
      "connection_endpoint_missing",
      `Legacy connection references missing endpoint ${!from ? fromId : toId}.`,
    );
  }
  const externalId = String(item?.id || `@legacy:${storageIndex}`);
  const inserted = prepare(`
    INSERT INTO connections(
      board_pk, external_id, from_id, to_id, revision,
      payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    boardPk,
    externalId,
    fromId,
    toId,
    JSON.stringify(item),
    timestamp,
    timestamp,
  );
  writeSpatial(
    "connection_spatial",
    Number(inserted.lastInsertRowid),
    getConnectionBounds(nodeRect(from), nodeRect(to)),
  );
  writeConnectionGeometry(Number(inserted.lastInsertRowid), from, to);
}

const handlers = {
  ready() {
    return { schemaVersion: readSchemaVersion(database) };
  },

  quickCheck() {
    const row = prepare("PRAGMA quick_check").get();
    const result = String(Object.values(row || {})[0] || "");
    return { ok: result === "ok", result };
  },

  createBoard(params = {}) {
    const id = requiredId(params.id, "Board");
    const timestamp = String(params.createdAt || nowIso());
    const title = String(params.title || "Untitled canvas");
    const viewport = params.viewport || { x: 0, y: 0, scale: 1 };
    try {
      prepare(`
        INSERT INTO boards(
          external_id, title, viewport_json, revision, schema_version,
          migration_state, created_at, updated_at
        ) VALUES (?, ?, ?, 0, ?, 'active', ?, ?)
      `).run(id, title, JSON.stringify(viewport), readSchemaVersion(database), timestamp, timestamp);
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE")) {
        throw codedError("board_already_exists", `Canvas board already exists: ${id}`);
      }
      throw error;
    }
    return toBoardMeta(boardRow(id));
  },

  listBoards() {
    const rows = prepare(`
      SELECT b.*,
             (SELECT COUNT(*) FROM nodes n WHERE n.board_pk = b.pk) AS node_count,
             (SELECT COUNT(*) FROM connections c WHERE c.board_pk = b.pk) AS connection_count,
             COALESCE((
               SELECT json_group_array(source)
                 FROM (
                   SELECT source
                     FROM node_previews p
                    WHERE p.board_pk = b.pk AND p.source != ''
                    ORDER BY p.z_order DESC, p.updated_at DESC
                    LIMIT 4
                 )
             ), '[]') AS preview_images_json
        FROM boards b
       WHERE b.migration_state = 'active'
       ORDER BY b.updated_at DESC, b.pk DESC
    `).all();
    return rows.map(toBoardMeta);
  },

  getBoardMeta({ boardId } = {}) {
    const board = boardRow(boardId);
    const counts = prepare(`
      SELECT (SELECT COUNT(*) FROM nodes WHERE board_pk = ?) AS node_count,
             (SELECT COUNT(*) FROM connections WHERE board_pk = ?) AS connection_count
    `).get(board.pk, board.pk);
    return toBoardMeta({ ...board, ...counts });
  },

  getBoardState({ boardId } = {}) {
    return toBoardMeta(boardRow(boardId));
  },

  applyOperations({ boardId, baseRevision, operations } = {}) {
    const board = boardRow(boardId);
    const items = Array.isArray(operations) ? operations : [];
    if (items.length === 0) return { boardRevision: Number(board.revision), results: [] };
    const seenIds = new Set();
    for (const operation of items) {
      const operationId = requiredId(operation?.operationId, "Operation");
      if (seenIds.has(operationId)) {
        throw codedError("duplicate_operation_id", `Operation id is repeated in batch: ${operationId}`);
      }
      seenIds.add(operationId);
    }

    const stored = new Map();
    const lookup = prepare(`
      SELECT operation_id, result_json
        FROM board_operations WHERE board_pk = ? AND operation_id = ?
    `);
    for (const operation of items) {
      const row = lookup.get(board.pk, operation.operationId);
      if (row) stored.set(row.operation_id, parseJson(row.result_json, {}));
    }
    if (stored.size === items.length) {
      return {
        boardRevision: Number(board.revision),
        results: items.map((operation) => ({
          ...stored.get(operation.operationId),
          operationId: operation.operationId,
          status: "duplicate",
        })),
      };
    }
    if (Number(baseRevision) !== Number(board.revision)) {
      throw codedError(
        "revision_conflict",
        `Canvas revision changed from ${Number(baseRevision)} to ${Number(board.revision)}.`,
      );
    }

    const timestamp = nowIso();
    const nextRevision = Number(board.revision) + 1;
    const results = [];
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const operation of items) {
        if (stored.has(operation.operationId)) {
          results.push({
            ...stored.get(operation.operationId),
            operationId: operation.operationId,
            status: "duplicate",
          });
          continue;
        }
        const entityResult = applyOperation(board, operation, timestamp);
        results.push({
          operationId: operation.operationId,
          status: "applied",
          boardRevision: nextRevision,
          ...entityResult,
        });
      }
      prepare("UPDATE boards SET revision = ?, updated_at = ? WHERE pk = ?")
        .run(nextRevision, timestamp, board.pk);
      const insertOperation = prepare(`
        INSERT INTO board_operations(
          board_pk, operation_id, base_revision, operation_type,
          request_json, result_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (let index = 0; index < items.length; index += 1) {
        const operation = items[index];
        if (stored.has(operation.operationId)) continue;
        insertOperation.run(
          board.pk,
          operation.operationId,
          Number(baseRevision),
          String(operation.type || ""),
          JSON.stringify(operation),
          JSON.stringify(results[index]),
          timestamp,
        );
      }
      triggerTestFault("after_sql_before_commit");
      database.exec("COMMIT");
      return { boardRevision: nextRevision, results };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  },

  queryViewport(params = {}) {
    const board = boardRow(params.boardId);
    const bounds = normalizeBounds(params);
    const countRow = prepare(`
      SELECT COUNT(*) AS candidate_count
        FROM node_spatial s
        CROSS JOIN nodes n ON n.pk = s.pk
       WHERE s.max_x >= ? AND s.min_x <= ?
         AND s.max_y >= ? AND s.min_y <= ?
         AND n.board_pk = ?
         AND n.x + n.width >= ? AND n.x <= ?
         AND n.y + n.height >= ? AND n.y <= ?
    `).get(
      bounds.left, bounds.right, bounds.top, bounds.bottom,
      board.pk,
      bounds.left, bounds.right, bounds.top, bounds.bottom,
    );
    const candidateCount = Number(countRow?.candidate_count || 0);
    if (candidateCount > 800) {
      const scene = selectVisibleSprites(viewportVisualRows(board.pk, bounds), {
        bounds,
        scale: params.scale,
        maxTexturedSprites: 5000,
      });
      const visualConnections = viewportVisualConnectionRows(board.pk, bounds);
      return {
        mode: "scene",
        engineVersion: ENGINE_VERSION,
        boardRevision: Number(board.revision),
        candidateCount,
        visualNodes: packVisualNodes(scene.visualNodes),
        visualNodeCount: scene.visualNodes.length,
        visualNodeEncoding: "tuple-v1",
        texturedNodeIds: scene.texturedNodeIds,
        visualConnections: visualConnections.segments,
        visualConnectionCount: visualConnections.count,
        nodes: [],
        connections: [],
        truncated: false,
      };
    }

    const nodeLimit = Math.max(1, Math.min(5000, Math.trunc(Number(params.nodeLimit) || 800)));
    const connectionLimit = Math.max(1, Math.min(10000, Math.trunc(Number(params.connectionLimit) || 1200)));
    const nodeRows = viewportNodeRows(
      board.pk,
      bounds,
      "n.pk, n.external_id, n.z_order, n.kind, n.x, n.y, n.width, n.height, n.revision, n.payload_json",
    );
    const visibleNodes = nodeRows.slice(0, nodeLimit + 1);
    const connectionRows = prepare(`
      SELECT c.*
        FROM connection_spatial s
        CROSS JOIN connections c ON c.pk = s.pk
       WHERE s.max_x >= ? AND s.min_x <= ?
         AND s.max_y >= ? AND s.min_y <= ?
         AND c.board_pk = ?
       LIMIT ?
    `).all(
      bounds.left, bounds.right, bounds.top, bounds.bottom,
      board.pk,
      connectionLimit + 1,
    );
    const truncated = visibleNodes.length > nodeLimit || connectionRows.length > connectionLimit;
    return {
      mode: "detail",
      engineVersion: ENGINE_VERSION,
      boardRevision: Number(board.revision),
      candidateCount,
      lodLevel: 0,
      nodes: visibleNodes.slice(0, nodeLimit).filter((row) => exactNodeIntersects(row, bounds)).map(hydrateNode),
      connections: connectionRows.slice(0, connectionLimit).map(hydrateConnection),
      truncated,
    };
  },

  exportBoardPage({ boardId, entity, cursor, limit } = {}) {
    const board = boardRow(boardId);
    const table = entity === "connections" ? "connections" : entity === "nodes" ? "nodes" : "";
    if (!table) throw codedError("invalid_export_entity", `Cannot export canvas entity: ${String(entity || "")}`);
    const pageLimit = Math.max(1, Math.min(1000, Math.trunc(Number(limit) || 200)));
    const afterPk = Math.max(0, Math.trunc(Number(cursor) || 0));
    const rows = prepare(`
      SELECT * FROM ${table}
       WHERE board_pk = ? AND pk > ?
       ORDER BY pk
       LIMIT ?
    `).all(board.pk, afterPk, pageLimit + 1);
    const page = rows.slice(0, pageLimit);
    const hydrate = table === "nodes" ? hydrateNode : hydrateConnection;
    return {
      entity: table,
      boardRevision: Number(board.revision),
      items: page.map(hydrate),
      nextCursor: rows.length > pageLimit ? String(page[page.length - 1].pk) : "",
    };
  },

  getOperationStatuses({ operationIds } = {}) {
    const ids = Array.isArray(operationIds) ? operationIds.map((id) => String(id)) : [];
    const lookup = prepare(`
      SELECT b.external_id AS board_id, o.result_json
        FROM board_operations o
        JOIN boards b ON b.pk = o.board_pk
       WHERE o.operation_id = ?
       ORDER BY o.pk DESC LIMIT 1
    `);
    return ids.map((operationId) => {
      const row = lookup.get(operationId);
      return row
        ? { operationId, committed: true, boardId: row.board_id, result: parseJson(row.result_json, {}) }
        : { operationId, committed: false };
    });
  },

  beginLegacyImport({ board, backupFile } = {}) {
    const id = requiredId(board?.id, "Legacy board");
    const timestamp = nowIso();
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = prepare(`
        SELECT pk, migration_state FROM boards WHERE external_id = ?
      `).get(id);
      if (existing?.migration_state === "active") {
        throw codedError("board_already_active", `Canvas board is already active: ${id}`);
      }
      if (existing) removeBoardStorage(existing.pk);
      prepare(`
        INSERT INTO boards(
          external_id, title, viewport_json, revision, schema_version,
          migration_state, validation_hash, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, 0, ?, 'migrating', ?, ?, ?, ?)
      `).run(
        id,
        String(board?.title || "Untitled canvas"),
        JSON.stringify(board?.viewport || { x: 0, y: 0, scale: 1 }),
        readSchemaVersion(database),
        backupFile ? `backup:${String(backupFile).slice(-500)}` : null,
        String(board?.createdAt || timestamp),
        String(board?.updatedAt || timestamp),
        board?.deletedAt ? String(board.deletedAt) : null,
      );
      triggerTestFault("after_migration_begin_before_commit");
      database.exec("COMMIT");
      return toBoardMeta(boardRow(id));
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  },

  importLegacyBatch({ boardId, entity, items, offset } = {}) {
    const board = requireMigratingBoard(boardId);
    const batch = Array.isArray(items) ? items : [];
    if (batch.length > 1000) {
      throw codedError("legacy_batch_too_large", "Legacy import batches cannot exceed 1000 items.");
    }
    const start = Math.max(0, Math.trunc(Number(offset) || 0));
    const timestamp = nowIso();
    database.exec("BEGIN IMMEDIATE");
    try {
      if (entity === "nodes") {
        batch.forEach((item, index) => importLegacyNode(board.pk, item, start + index, timestamp));
      } else if (entity === "connections") {
        batch.forEach((item, index) => importLegacyConnection(board.pk, item, start + index, timestamp));
      } else {
        throw codedError("invalid_import_entity", `Cannot import legacy entity: ${String(entity || "")}`);
      }
      prepare("UPDATE boards SET updated_at = ? WHERE pk = ?").run(timestamp, board.pk);
      triggerTestFault("after_import_sql_before_commit");
      database.exec("COMMIT");
      return { boardId: board.external_id, entity, imported: batch.length, offset: start };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  },

  exportImportedBoard({ boardId } = {}) {
    const board = boardRow(boardId);
    const nodes = prepare(`
      SELECT payload_json FROM nodes WHERE board_pk = ? ORDER BY pk
    `).all(board.pk).map((row) => parseJson(row.payload_json, {}));
    const connections = prepare(`
      SELECT payload_json FROM connections WHERE board_pk = ? ORDER BY pk
    `).all(board.pk).map((row) => parseJson(row.payload_json, {}));
    return { boardId: board.external_id, nodes, connections };
  },

  activateImportedBoard({ boardId, validation } = {}) {
    const board = requireMigratingBoard(boardId);
    const timestamp = nowIso();
    const validationHash = String(validation?.hash || "");
    if (!validationHash) {
      throw codedError("legacy_validation_missing", "Legacy import cannot activate without validation.");
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      prepare(`
        UPDATE boards
           SET migration_state = 'validated', validation_hash = ?, updated_at = ?
         WHERE pk = ?
      `).run(validationHash, timestamp, board.pk);
      prepare(`
        UPDATE boards SET migration_state = 'active', updated_at = ?
         WHERE pk = ? AND migration_state = 'validated'
      `).run(timestamp, board.pk);
      database.exec("COMMIT");
      return toBoardMeta(boardRow(board.external_id));
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  },

  failLegacyImport({ boardId, message } = {}) {
    const id = requiredId(boardId, "Legacy board");
    const row = prepare("SELECT pk FROM boards WHERE external_id = ?").get(id);
    if (!row) return { boardId: id, state: "failed", recorded: false };
    prepare(`
      UPDATE boards
         SET migration_state = 'failed', validation_hash = ?, updated_at = ?
       WHERE pk = ? AND migration_state != 'active'
    `).run(`error:${String(message || "Legacy migration failed.").slice(0, 480)}`, nowIso(), row.pk);
    return { boardId: id, state: "failed", recorded: true };
  },

  setBoardTrashState({ boardId, operationId, trashed } = {}) {
    const board = boardRow(boardId);
    const requestId = requiredId(operationId, "Operation");
    const existing = prepare(`
      SELECT result_json FROM board_operations
       WHERE board_pk = ? AND operation_id = ?
    `).get(board.pk, requestId);
    if (existing) return parseJson(existing.result_json, {});
    const timestamp = nowIso();
    const revision = Number(board.revision) + 1;
    const deletedAt = trashed ? timestamp : null;
    database.exec("BEGIN IMMEDIATE");
    try {
      prepare(`
        UPDATE boards SET deleted_at = ?, revision = ?, updated_at = ? WHERE pk = ?
      `).run(deletedAt, revision, timestamp, board.pk);
      const result = toBoardMeta({
        ...board,
        deleted_at: deletedAt,
        revision,
        updated_at: timestamp,
      });
      prepare(`
        INSERT INTO board_operations(
          board_pk, operation_id, base_revision, operation_type,
          request_json, result_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        board.pk,
        requestId,
        Number(board.revision),
        trashed ? "board.trash" : "board.restore",
        JSON.stringify({ boardId: board.external_id, trashed: Boolean(trashed) }),
        JSON.stringify(result),
        timestamp,
      );
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  },

  deleteBoardPermanently({ boardId } = {}) {
    const board = boardRow(boardId);
    if (!board.deleted_at) {
      throw codedError(
        "board_not_trashed",
        `Canvas board must be in trash before permanent deletion: ${board.external_id}`,
      );
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      removeBoardStorage(board.pk);
      database.exec("COMMIT");
      return { id: board.external_id, permanentlyDeleted: true };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  },

  close() {
    if (!database) return { closed: true };
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    statementCache.clear();
    database.close();
    database = null;
    return { closed: true };
  },
};

backfillNodePreviews();
backfillConnectionGeometry();

parentPort.on("message", (message = {}) => {
  const id = String(message.id || "");
  try {
    const handler = handlers[message.method];
    if (!handler) {
      throw codedError(
        "unknown_repository_method",
        `Unknown repository method: ${String(message.method || "")}`,
      );
    }
    const result = handler(message.params || {});
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: {
        code: String(error?.code || "repository_error"),
        message: String(error?.message || error || "Canvas repository failed."),
      },
    });
  }
});
