# Logically Unbounded 50,000-Node Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-board JSON loading and saving with a lightweight local SQLite/R*Tree viewport data path that guarantees smooth, lossless operation at 50,000 mixed nodes and 100,000 connections while preserving automatic legacy-board compatibility.

**Architecture:** A dedicated Node worker owns SQLite and exposes a repository message protocol; server query and command services expose bounded viewport and incremental-operation APIs. The browser evolves the existing virtualizer into a paged hot store, renders only the visible working set, and uses LOD primitives plus staged media loading outside the detailed DOM layer.

**Tech Stack:** Node.js 24.13+, `node:sqlite`, `node:worker_threads`, SQLite WAL/R*Tree, CommonJS/UMD JavaScript, existing DOM virtualizer, native Canvas2D, Playwright browser checks.

## Global Constraints

- Supported local runtime is Node 24.13.0 or newer within the Node 24 LTS line.
- Add no third-party production dependency unless a measured acceptance failure proves it necessary and the design is revised first.
- Guarantee 50,000 mixed nodes, 100,000 connections, and 25,000 media references on the documented baseline machine.
- Apply no business count limit to nodes, connections, or canvas extent; above the guarantee scale, increase LOD without dropping data.
- Keep detailed DOM nodes at or below 800 and total canvas-related DOM at or below 1,200 at every zoom.
- Keep canvas-related browser JavaScript heap at or below 350MB and server canvas-data RSS at or below 250MB in steady state.
- Never dual-write a board to SQLite and legacy JSON. Legacy JSON is backup and read-only fallback after migration begins.
- Preserve unknown node fields and unknown node kinds in `payload_json` and export/import round trips.
- Do not delete legacy JSON, recovery backups, or user business files during migration or rollout.
- Keep daily automated checks within 2–3 minutes; require one 10-minute 50,000-node stability run for delivery; keep the 60-minute soak optional and non-blocking.

---

## Planned File Map

### Server-side modules

- Create `canvas-spatial-rules.js`: finite bounds, conservative R*Tree padding, connection bounds, LOD level and tile math.
- Create `canvas-schema.js`: schema version, SQL schema, PRAGMA configuration, prepared-statement names.
- Create `canvas-db-worker.js`: sole `DatabaseSync` owner and repository method dispatcher.
- Create `canvas-repository.js`: worker lifecycle, request correlation, timeout, typed repository methods.
- Create `canvas-legacy-migrator.js`: timestamped backup, per-board migration, validation, and read-only fallback state.
- Create `canvas-query-service.js`: bounded viewport/LOD/list/export-page queries.
- Create `canvas-command-service.js`: command validation, idempotency, optimistic revision checks, and inverse operations.
- Create `canvas-export-service.js`: paged JSON streaming and transactional import orchestration.
- Modify `server.js:1-55,215-326,439,4179-4286`: initialize storage, register canvas routes, retire full-board writes, and close the worker cleanly.

### Browser modules

- Create `canvas-paged-store.js`: loaded models/connections, pinning, byte-aware LRU, mounted elements, and pending commands.
- Create `canvas-viewport-data-source.js`: generation tokens, `AbortController`, overscan prefetch, and response application.
- Create `canvas-media-scheduler.js`: placeholder/thumbnail/original priorities, cancellation, concurrency, and retry.
- Create `canvas-primitive-layer.js`: bounded Canvas2D rendering for LOD nodes and aggregate connections.
- Modify `canvas-virtualizer.js`: accept asynchronously paged store contents without assuming all models are resident.
- Modify `script.js:380-383,8534-8600,10885-11546`: use metadata lists, viewport pages, incremental commands, delta undo, and server-side export.
- Modify `index.html` final script block and `styles.css` canvas layers: load modules and style explicit loading/error/LOD states.

### Tests, packaging, and docs

- Create focused checks under `tools/check-canvas-*.js` for every new module and endpoint.
- Create `tools/generate-canvas-50000-fixture.js` and `tools/check-canvas-50000-performance-ui.js`.
- Modify `package.json`, `build-portable.bat`, `start.bat`, `.env.example`, and `.gitignore`.
- Create `docs/performance/canvas-50000-baseline.md` from the final measured run.

---

### Task 1: Spatial Rules, SQLite Schema, and Runtime Floor

**Files:**
- Create: `canvas-spatial-rules.js`
- Create: `canvas-schema.js`
- Create: `tools/check-canvas-spatial-rules.js`
- Create: `tools/check-canvas-schema.js`
- Modify: `package.json:4-15`

**Interfaces:**
- Produces: `normalizeBounds(input)`, `padRtreeBounds(bounds)`, `getConnectionBounds(fromRect, toRect)`, `chooseLodLevel(scale, candidateCount)`, `getTileAddress(level, x, y)`.
- Produces: `SCHEMA_VERSION`, `configureDatabase(db)`, `initializeSchema(db)`, `readSchemaVersion(db)`.
- Consumes: only Node built-ins and a `DatabaseSync`-compatible object.

- [ ] **Step 1: Write failing spatial-rule and schema tests**

```js
// tools/check-canvas-spatial-rules.js
const assert = require("node:assert/strict");
const rules = require("../canvas-spatial-rules");

assert.deepEqual(
  rules.normalizeBounds({ left: 10, top: 20, right: -5, bottom: 8 }),
  { left: -5, top: 8, right: 10, bottom: 20 },
);
const padded = rules.padRtreeBounds({ left: 1_000_000_000, top: -20, right: 1_000_000_320, bottom: 220 });
assert.ok(padded.left < 1_000_000_000);
assert.ok(padded.right > 1_000_000_320);
assert.deepEqual(
  rules.getConnectionBounds({ left: -10, top: 0, right: 20, bottom: 30 }, { left: 100, top: 90, right: 140, bottom: 120 }),
  { left: 5, top: 15, right: 120, bottom: 105 },
);
assert.equal(rules.chooseLodLevel(1, 100), 0);
assert.ok(rules.chooseLodLevel(0.05, 50_000) > 0);
assert.deepEqual(rules.getTileAddress(2, -1, 1025), { level: 2, tileX: -1, tileY: 1, tileSize: 1024 });
console.log("Canvas spatial rule checks passed.");
```

```js
// tools/check-canvas-schema.js
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const schema = require("../canvas-schema");

const db = new DatabaseSync(":memory:");
schema.configureDatabase(db);
schema.initializeSchema(db);
assert.equal(schema.readSchemaVersion(db), schema.SCHEMA_VERSION);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all().map((row) => row.name);
["boards", "nodes", "node_spatial", "connections", "connection_spatial", "media_refs", "board_operations", "lod_tiles"].forEach((name) => {
  assert.ok(tables.includes(name), "missing " + name);
});
db.close();
console.log("Canvas schema checks passed.");
```

- [ ] **Step 2: Run the tests and verify missing-module failures**

Run: `node tools/check-canvas-spatial-rules.js`

Expected: FAIL with `Cannot find module '../canvas-spatial-rules'`.

Run: `node tools/check-canvas-schema.js`

Expected: FAIL with `Cannot find module '../canvas-schema'`.

- [ ] **Step 3: Implement pure spatial rules**

```js
// canvas-spatial-rules.js
const BASE_TILE_SIZE = 256;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBounds(input = {}) {
  const x1 = finite(input.left);
  const x2 = finite(input.right, x1);
  const y1 = finite(input.top);
  const y2 = finite(input.bottom, y1);
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) };
}

function padRtreeBounds(input) {
  const bounds = normalizeBounds(input);
  const magnitude = Math.max(1, ...Object.values(bounds).map((value) => Math.abs(value)));
  const padding = Math.max(0.01, magnitude * 0.0000002);
  return { left: bounds.left - padding, top: bounds.top - padding, right: bounds.right + padding, bottom: bounds.bottom + padding };
}

function getConnectionBounds(fromRect, toRect) {
  const from = normalizeBounds(fromRect);
  const to = normalizeBounds(toRect);
  return normalizeBounds({
    left: (from.left + from.right) / 2,
    top: (from.top + from.bottom) / 2,
    right: (to.left + to.right) / 2,
    bottom: (to.top + to.bottom) / 2,
  });
}

function chooseLodLevel(scale, candidateCount) {
  const safeScale = Math.max(0.01, finite(scale, 1));
  if (safeScale >= 0.3 && candidateCount <= 800) return 0;
  return Math.max(1, Math.ceil(Math.log2(Math.max(1, candidateCount / 400, 0.3 / safeScale))));
}

function getTileAddress(level, x, y) {
  const safeLevel = Math.max(0, Math.trunc(finite(level)));
  const tileSize = BASE_TILE_SIZE * (2 ** safeLevel);
  return { level: safeLevel, tileX: Math.floor(finite(x) / tileSize), tileY: Math.floor(finite(y) / tileSize), tileSize };
}

module.exports = { BASE_TILE_SIZE, normalizeBounds, padRtreeBounds, getConnectionBounds, chooseLodLevel, getTileAddress };
```

- [ ] **Step 4: Implement schema initialization**

`canvas-schema.js` must create STRICT `boards`, `nodes`, `connections`, `media_refs`, `board_operations`, and `lod_tiles` tables plus R*Tree `node_spatial` and `connection_spatial` tables keyed by integer primary keys. Create unique indexes on `(board_pk, external_id)` and `(board_pk, operation_id)`, set `PRAGMA user_version = 1`, and expose the listed interfaces. `configureDatabase(db)` must execute:

```js
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;");
db.enableDefensive(true);
```

Use this exact schema shape; `initializeSchema` executes it in one `db.exec` call and then sets `user_version`:

```sql
CREATE TABLE IF NOT EXISTS boards (
  pk INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  viewport_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1,
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
CREATE VIRTUAL TABLE IF NOT EXISTS node_spatial USING rtree(pk, min_x, max_x, min_y, max_y);
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
CREATE VIRTUAL TABLE IF NOT EXISTS connection_spatial USING rtree(pk, min_x, max_x, min_y, max_y);
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
) WITHOUT ROWID, STRICT;
```

- [ ] **Step 5: Raise and enforce the runtime floor**

Change `package.json` to:

```json
"engines": {
  "node": ">=24.13.0 <25"
}
```

Append both new syntax checks and both new test commands to `scripts.check`.

- [ ] **Step 6: Run focused checks**

Run: `node --check canvas-spatial-rules.js && node --check canvas-schema.js && node tools/check-canvas-spatial-rules.js && node tools/check-canvas-schema.js`

Expected: both checks print `passed` and exit 0.

- [ ] **Step 7: Commit**

```bash
git add canvas-spatial-rules.js canvas-schema.js tools/check-canvas-spatial-rules.js tools/check-canvas-schema.js package.json
git commit -m "feat: add canvas sqlite spatial schema"
```

---

### Task 2: Dedicated Database Worker and Repository Lifecycle

**Files:**
- Create: `canvas-db-worker.js`
- Create: `canvas-repository.js`
- Create: `tools/check-canvas-repository.js`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: `configureDatabase(db)` and `initializeSchema(db)` from Task 1.
- Produces: `createCanvasRepository({ dbPath, workerPath, requestTimeoutMs, testFaultStage })`; `testFaultStage` is rejected unless `dbPath` is inside the operating-system temporary directory.
- Produces methods: `ready()`, `invoke(method, params)`, `quickCheck()`, `close()`.
- Worker request: `{ id, method, params }`; response: `{ id, ok, result }` or `{ id, ok: false, error: { code, message } }`.

- [ ] **Step 1: Write the failing lifecycle test**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-repository-"));
  const repository = createCanvasRepository({ dbPath: path.join(root, "canvas.db") });
  await repository.ready();
  assert.deepEqual(await repository.quickCheck(), { ok: true, result: "ok" });
  await assert.rejects(() => repository.invoke("missingMethod", {}), /unknown repository method/i);
  await repository.close();
  assert.ok(fs.existsSync(path.join(root, "canvas.db")));
  fs.rmSync(root, { recursive: true, force: true });
  console.log("Canvas repository lifecycle checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `node tools/check-canvas-repository.js`

Expected: FAIL with `Cannot find module '../canvas-repository'`.

- [ ] **Step 3: Implement the repository request correlator**

`canvas-repository.js` must create one `Worker`, keep `pending = new Map()`, reject timed-out requests, and reject all pending requests if the worker exits. Its request core is:

```js
function invoke(method, params = {}) {
  if (closed) return Promise.reject(Object.assign(new Error("Canvas repository is closed."), { code: "repository_closed" }));
  const id = String(++requestId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error("Canvas repository request timed out: " + method), { code: "repository_timeout" }));
    }, requestTimeoutMs);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, method, params });
  });
}
```

`ready()` invokes `ready`, `quickCheck()` invokes `quickCheck`, and `close()` invokes `close`, waits for acknowledgement, then terminates the worker.

- [ ] **Step 4: Implement the worker dispatcher**

`canvas-db-worker.js` opens `workerData.dbPath` with `new DatabaseSync(path, { timeout: 5000, defensive: true })`, configures and initializes it, then supports `ready`, `quickCheck`, and `close`. Unknown methods throw code `unknown_repository_method`. Responses contain only serializable primitives and plain objects.

Use one dispatcher and normalize every failure:

```js
const handlers = {
  ready: () => ({ schemaVersion: readSchemaVersion(db) }),
  quickCheck: () => {
    const row = db.prepare("PRAGMA quick_check").get();
    const result = String(Object.values(row)[0]);
    return { ok: result === "ok", result };
  },
  close: () => {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    return { closed: true };
  },
};

parentPort.on("message", ({ id, method, params }) => {
  try {
    const handler = handlers[method];
    if (!handler) {
      const error = new Error("Unknown repository method: " + method);
      error.code = "unknown_repository_method";
      throw error;
    }
    parentPort.postMessage({ id, ok: true, result: handler(params || {}) });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: { code: String(error.code || "repository_error"), message: String(error.message || error) },
    });
  }
});
```

- [ ] **Step 5: Run lifecycle and syntax checks**

Run: `node --check canvas-db-worker.js && node --check canvas-repository.js && node tools/check-canvas-repository.js`

Expected: `Canvas repository lifecycle checks passed.`

- [ ] **Step 6: Add checks and commit**

```bash
git add canvas-db-worker.js canvas-repository.js tools/check-canvas-repository.js package.json
git commit -m "feat: isolate canvas sqlite in worker"
```

---

### Task 3: Transactional Node, Connection, LOD, and Operation Storage

**Files:**
- Modify: `canvas-db-worker.js`
- Modify: `canvas-repository.js`
- Create: `tools/check-canvas-repository-operations.js`
- Modify: `package.json` scripts

**Interfaces:**
- Produces repository methods `createBoard(board)`, `listBoards()`, `getBoardMeta(boardId)`, `applyOperations(input)`, `queryViewport(input)`, `exportBoardPage(input)`, and `getOperationStatuses(operationIds)`.
- `applyOperations` input: `{ boardId, baseRevision, operations }`.
- Operation: `{ operationId, type, entityId, before, after }` with type `node.upsert`, `node.delete`, `connection.upsert`, `connection.delete`, or `board.patch`.
- Output: `{ boardRevision, results: [{ operationId, status, entityRevision }] }`.

- [ ] **Step 1: Write a failing atomic-operation test**

Create a temporary repository and assert:

```js
await repository.createBoard({ id: "board-1", title: "Board", viewport: { x: 0, y: 0, scale: 1 } });
const result = await repository.applyOperations({
  boardId: "board-1",
  baseRevision: 0,
  operations: [
    { operationId: "op-1", type: "node.upsert", entityId: "n1", before: null, after: { id: "n1", kind: "text", x: -1_000_000_000, y: 20, width: 320, height: 240, text: "left", futureField: { keep: true } } },
    { operationId: "op-2", type: "node.upsert", entityId: "n2", before: null, after: { id: "n2", kind: "image", x: -999_999_500, y: 40, width: 320, height: 240, imageSrc: "/image.png" } },
    { operationId: "op-3", type: "connection.upsert", entityId: "c1", before: null, after: { id: "c1", from: "n1", to: "n2", toPort: "input" } },
  ],
});
assert.equal(result.boardRevision, 1);
const page = await repository.queryViewport({ boardId: "board-1", left: -1_000_000_100, top: 0, right: -999_999_000, bottom: 500, scale: 1, nodeLimit: 800, connectionLimit: 1200 });
assert.equal(page.nodes.length, 2);
assert.equal(page.connections.length, 1);
assert.deepEqual(page.nodes.find((node) => node.id === "n1").futureField, { keep: true });
```

Retry `op-1` and assert status `duplicate`. Submit a stale base revision and assert code `revision_conflict`. Submit a batch with an invalid connection and assert the entire batch rolls back.

- [ ] **Step 2: Run and verify missing-method failure**

Run: `node tools/check-canvas-repository-operations.js`

Expected: FAIL because `repository.createBoard` is not a function.

- [ ] **Step 3: Add typed wrappers**

```js
return {
  ready,
  quickCheck: () => invoke("quickCheck"),
  createBoard: (board) => invoke("createBoard", { board }),
  listBoards: () => invoke("listBoards"),
  getBoardMeta: (boardId) => invoke("getBoardMeta", { boardId }),
  applyOperations: (input) => invoke("applyOperations", input),
  queryViewport: (input) => invoke("queryViewport", input),
  exportBoardPage: (input) => invoke("exportBoardPage", input),
  getOperationStatuses: (operationIds) => invoke("getOperationStatuses", { operationIds }),
  invoke,
  close,
};
```

- [ ] **Step 4: Implement one-transaction operation application**

Prepare statements once. `applyOperations` executes `BEGIN IMMEDIATE`, checks `boards.revision`, checks `board_operations.operation_id` before mutation, writes exact `payload_json`, updates R*Tree rows with conservative bounds, updates affected connection bounds and LOD tiles, increments board revision once per non-empty batch, persists the serialized result for idempotent retries, and commits. Any error rolls back.

Use exact dispatch:

```js
const operationHandlers = {
  "node.upsert": upsertNodeOperation,
  "node.delete": deleteNodeOperation,
  "connection.upsert": upsertConnectionOperation,
  "connection.delete": deleteConnectionOperation,
  "board.patch": patchBoardOperation,
};
```

`queryViewport` exact-filters padded R*Tree candidates, enforces both limits, and returns detail mode. When `chooseLodLevel` is above zero, return `{ mode: "lod", lodNodes, lodConnections, boardRevision, truncated: false }` without loading full payloads.

- [ ] **Step 5: Run repository checks**

Run: `node tools/check-canvas-schema.js && node tools/check-canvas-repository.js && node tools/check-canvas-repository-operations.js`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add canvas-db-worker.js canvas-repository.js tools/check-canvas-repository-operations.js package.json
git commit -m "feat: add transactional canvas repository"
```

---

### Task 4: Lossless Legacy JSON Migration and Recovery

**Files:**
- Create: `canvas-legacy-migrator.js`
- Create: `tools/check-canvas-legacy-migrator.js`
- Modify: `canvas-db-worker.js`
- Modify: `canvas-repository.js`
- Modify: `package.json` scripts

**Interfaces:**
- Produces `createCanvasLegacyMigrator({ legacyFile, repository, backupDirectory, batchSize })`.
- Methods: `listLegacySummaries()`, `ensureMigrated(boardId, onProgress)`, `getMigrationState(boardId)`.
- Progress: `{ boardId, phase, completed, total }`; phase is `backup`, `nodes`, `connections`, `validate`, or `complete`.
- Extends repository with `beginLegacyImport(input)`, `importLegacyBatch(input)`, `exportImportedBoard(input)`, `activateImportedBoard(input)`, and `failLegacyImport(input)`.
- Produces pure exports `canonicalize(value)`, `stableHash(value)`, and `validateBoardExport(source, exported)` for import and round-trip checks.

- [ ] **Step 1: Write failing migration round-trip and rollback tests**

The fixture contains two boards, unknown fields, far negative coordinates, and connections. Call `ensureMigrated("legacy-a")`; assert a timestamped `.bak-YYYYMMDD-HHmmss` copy exists, original bytes are unchanged, exported pages match node/connection counts, and canonical payload hashes match. Inject a repository failure in the second node batch; assert state `failed`, no active board, and a retry succeeds without duplicate IDs.

Use canonical hashing with recursively sorted object keys, not top-level-only JSON replacer sorting:

```js
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
```

- [ ] **Step 2: Run and verify missing module**

Run: `node tools/check-canvas-legacy-migrator.js`

Expected: FAIL with `Cannot find module '../canvas-legacy-migrator'`.

- [ ] **Step 3: Implement backup and migration state machine**

`ensureMigrated` follows `pending -> migrating -> validated -> active`; exceptions write `failed` with a safe message. Backup uses `fs.copyFileSync` to a new target and never renames or overwrites the source. Nodes and connections are written in batches of 500 through an inactive import protocol.

```js
async function ensureMigrated(boardId, onProgress = () => {}) {
  const existing = await repository.getBoardMeta(boardId).catch(() => null);
  if (existing?.migrationState === "active") return existing;
  const board = readLegacyBoard(boardId);
  if (!board) throw codedError("canvas_board_not_found", "Legacy canvas board was not found.");
  const backupFile = ensureTimestampedBackup();
  onProgress({ boardId, phase: "backup", completed: 1, total: 1 });
  try {
    await repository.beginLegacyImport({ board, backupFile });
    await importBatches(boardId, "nodes", board.nodes || [], onProgress);
    await importBatches(boardId, "connections", board.connections || [], onProgress);
    const exported = await repository.exportImportedBoard({ boardId });
    const validation = validateBoardExport(board, exported);
    await repository.activateImportedBoard({ boardId, validation });
    onProgress({ boardId, phase: "complete", completed: 1, total: 1 });
    return repository.getBoardMeta(boardId);
  } catch (error) {
    await repository.failLegacyImport({ boardId, message: String(error.message || error) });
    throw error;
  }
}
```

- [ ] **Step 4: Validate before activation**

Compare node count, connection count, unique IDs, finite geometry, valid endpoints, and canonical payload hashes. `activateImportedBoard` executes in the same transaction that records validation success. Unknown kinds are valid.

```js
function requireValid(condition, message) {
  if (condition) return;
  const error = new Error(message);
  error.code = "legacy_validation_failed";
  throw error;
}

function validateBoardExport(source, exported) {
  requireValid(exported.nodes.length === source.nodes.length, "node count mismatch");
  requireValid(exported.connections.length === source.connections.length, "connection count mismatch");
  requireValid(new Set(exported.nodes.map((item) => item.id)).size === exported.nodes.length, "duplicate node id");
  const nodeIds = new Set(exported.nodes.map((item) => String(item.id)));
  exported.nodes.forEach((item) => ["x", "y", "width", "height"].forEach((key) => {
    requireValid(Number.isFinite(Number(item[key] ?? 0)), "non-finite " + key + " for " + item.id);
  }));
  exported.connections.forEach((item) => {
    requireValid(nodeIds.has(String(item.from)), "missing from endpoint");
    requireValid(nodeIds.has(String(item.to)), "missing to endpoint");
  });
  requireValid(stableHash(exported.nodes) === stableHash(source.nodes), "node payload hash mismatch");
  requireValid(stableHash(exported.connections) === stableHash(source.connections), "connection payload hash mismatch");
  return {
    nodeCount: exported.nodes.length,
    connectionCount: exported.connections.length,
    payloadHash: stableHash({ nodes: exported.nodes, connections: exported.connections }),
  };
}
```

- [ ] **Step 5: Run migration and repository checks**

Run: `node tools/check-canvas-legacy-migrator.js && node tools/check-canvas-repository-operations.js`

Expected: both pass and the fixture source hash is unchanged.

- [ ] **Step 6: Commit**

```bash
git add canvas-legacy-migrator.js canvas-db-worker.js canvas-repository.js tools/check-canvas-legacy-migrator.js package.json
git commit -m "feat: migrate legacy canvas boards safely"
```

---

### Task 5: Bounded Query, Incremental Command, and HTTP API Services

**Files:**
- Create: `canvas-query-service.js`
- Create: `canvas-command-service.js`
- Create: `tools/check-canvas-services.js`
- Create: `tools/check-canvas-storage-endpoint.js`
- Modify: `server.js:1-55,215-326,4179-4286`
- Modify: `package.json` scripts

**Interfaces:**
- Produces `createCanvasQueryService({ repository, migrator })` with `listBoards()`, `getMeta(boardId)`, `queryViewport(boardId, query)`, `exportPage(boardId, query)`.
- Produces pure export `normalizeViewportQuery(query)` for route and unit-test reuse.
- Produces `createCanvasCommandService({ repository })` with `createBoard(input)`, `apply(boardId, body)`, `trash(boardId, operationId)`, `restore(boardId, operationId)`.
- Endpoints: `GET/POST /api/canvas/boards`, `GET /api/canvas/boards/:id/meta`, `GET /api/canvas/boards/:id/viewport`, `POST /api/canvas/boards/:id/operations`, `POST /api/canvas/boards/:id/trash`, `POST /api/canvas/boards/:id/restore`, and `GET /api/canvas/boards/:id/export-page`.

- [ ] **Step 1: Write failing validation and endpoint tests**

Assert viewport strings become finite numbers, reversed bounds normalize, `nodeLimit <= 800`, `connectionLimit <= 1200`, missing board returns code `canvas_board_not_found`, stale revision maps to HTTP 409, malformed operations map to 400, and migration progress maps to 202 with `{ state: "migrating", progress }` instead of an empty board.

```js
const normalized = normalizeViewportQuery({
  left: "100", top: "90", right: "-20", bottom: "-30", scale: "0.05", nodeLimit: "9999", connectionLimit: "9999",
});
assert.deepEqual(normalized, {
  left: -20, top: -30, right: 100, bottom: 90, scale: 0.05, nodeLimit: 800, connectionLimit: 1200, generation: "0",
});
await assert.rejects(() => commandService.apply("board", { baseRevision: 0, operations: [{ type: "unknown" }] }), (error) => error.status === 400);
```

- [ ] **Step 2: Run and verify missing modules**

Run: `node tools/check-canvas-services.js`

Expected: FAIL with `Cannot find module '../canvas-query-service'`.

- [ ] **Step 3: Implement bounded services**

Use this boundary:

```js
function normalizeViewportQuery(query = {}) {
  const bounds = normalizeBounds(query);
  return {
    ...bounds,
    scale: Math.max(0.01, Math.min(5, Number(query.scale) || 1)),
    nodeLimit: Math.max(1, Math.min(800, Number(query.nodeLimit) || 800)),
    connectionLimit: Math.max(1, Math.min(1200, Number(query.connectionLimit) || 1200)),
    generation: String(query.generation || "0"),
  };
}
```

Reject empty `operationId`, unknown types, non-array lists, more than 500 operations per request, and non-finite geometry. Map `revision_conflict` to 409 and duplicates to 200.

- [ ] **Step 4: Register routes without dual writes**

Initialize one repository and migrator by the existing data-directory setup. Parse canvas routes with `new URL(req.url, "http://localhost")`. Replace `handleCanvasBoards` full-board mutation with service calls. Board listing may merge active SQLite metadata and unmigrated legacy summaries, but every write targets exactly one active SQLite board. Add one idempotent shutdown function awaited by `SIGINT`, `SIGTERM`, and server `close`.

```js
async function handleCanvasStorageRoute(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "canvas" || parts[2] !== "boards") return false;
  const boardId = parts[3] ? decodeURIComponent(parts[3]) : "";
  const action = parts[4] || "";
  if (req.method === "GET" && !boardId) sendJson(res, 200, await canvasQueryService.listBoards());
  else if (req.method === "POST" && !boardId) sendJson(res, 201, await canvasCommandService.createBoard(await readJsonBody(req)));
  else if (req.method === "GET" && action === "meta") sendJson(res, 200, await canvasQueryService.getMeta(boardId));
  else if (req.method === "GET" && action === "viewport") sendJson(res, 200, await canvasQueryService.queryViewport(boardId, Object.fromEntries(url.searchParams)));
  else if (req.method === "POST" && action === "operations") sendJson(res, 200, await canvasCommandService.apply(boardId, await readJsonBody(req)));
  else if (req.method === "POST" && action === "trash") sendJson(res, 200, await canvasCommandService.trash(boardId, String((await readJsonBody(req)).operationId || "")));
  else if (req.method === "POST" && action === "restore") sendJson(res, 200, await canvasCommandService.restore(boardId, String((await readJsonBody(req)).operationId || "")));
  else if (req.method === "GET" && action === "export-page") sendJson(res, 200, await canvasQueryService.exportPage(boardId, Object.fromEntries(url.searchParams)));
  else sendJson(res, 404, { error: "Canvas route not found.", code: "canvas_route_not_found" });
  return true;
}

let canvasShutdownPromise = null;
function shutdownCanvasStorage() {
  if (!canvasShutdownPromise) canvasShutdownPromise = canvasRepository.close();
  return canvasShutdownPromise;
}
```

- [ ] **Step 5: Run endpoint and regression checks**

Run: `node tools/check-canvas-services.js && node tools/check-canvas-storage-endpoint.js && node --check server.js && node tools/check-canvas-agent-server.js && node tools/check-image-job-endpoint.js`

Expected: all pass; the endpoint test uses a temporary database and never writes real `data/`.

- [ ] **Step 6: Commit**

```bash
git add canvas-query-service.js canvas-command-service.js server.js tools/check-canvas-services.js tools/check-canvas-storage-endpoint.js package.json
git commit -m "feat: expose paged canvas storage api"
```


---

### Task 6: Browser Paged Store with Byte-Aware LRU and Pending Commands

**Files:**
- Create: `canvas-paged-store.js`
- Create: `tools/check-canvas-paged-store.js`
- Modify: `canvas-virtualizer.js`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: `CanvasVirtualizationRules` and existing node normalization semantics.
- Produces `CanvasPagedStore` with `applyViewportPage(page)`, `stageOperation(operation)`, `ackOperations(result)`, `getPendingOperations()`, `pin(id)`, `unpin(id)`, `evict()`, and `isViewportComplete(rect)`.
- Preserves virtualizer methods `has`, `get`, `getRect`, `query`, `setMounted`, `getMounted`, `mountedIds`, and `mountedSize`.
- Produces connection methods `getVisibleConnections()`, `getConnectionsForNode(nodeId)`, `upsertConnections(items)`, and `removeConnection(id)`.
- Exposes read-only `lodPage` containing the current aggregate response or `null`.

- [ ] **Step 1: Write the failing LRU and pending-operation test**

```js
const store = new CanvasPagedStore({ rules, maxModels: 3, maxEstimatedBytes: 4096 });
store.applyViewportPage({ generation: "1", nodes: [node("a", 0), node("b", 100), node("c", 200)], connections: [] });
store.pin("a");
store.stageOperation({ operationId: "move-b", type: "node.upsert", entityId: "b", before: store.get("b"), after: node("b", 500) });
store.applyViewportPage({ generation: "2", nodes: [node("d", 900)], connections: [] });
store.evict();
assert.equal(store.has("a"), true);
assert.equal(store.has("b"), true);
assert.equal(store.has("d"), true);
assert.equal(store.has("c"), false);
assert.equal(store.getPendingOperations().length, 1);
store.ackOperations({ results: [{ operationId: "move-b", status: "applied", entityRevision: 2 }] });
assert.equal(store.getPendingOperations().length, 0);
```

Also assert stale page generations are ignored, mounted elements are not evicted, unknown fields survive page application, byte limits evict oversized unpinned models, and LOD pages do not enter the detailed spatial index.

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `node tools/check-canvas-paged-store.js`

Expected: FAIL with `Cannot find module '../canvas-paged-store'`.

- [ ] **Step 3: Implement the UMD paged store**

Use the same Node/browser wrapper as `canvas-virtual-store.js`. Track `models`, `connections`, `mounted`, `pinned`, `pendingOperations`, `accessOrder`, `estimatedBytes`, `activeGeneration`, and `lodPage`. Estimate bytes with `Buffer.byteLength(JSON.stringify(model), "utf8")` in Node and `new TextEncoder().encode(JSON.stringify(model)).byteLength` in the browser.

Eviction excludes pinned IDs, mounted IDs, and entities referenced by pending operations. Eviction removes local model/index entries and never stages a delete operation.

```js
estimate(value) {
  const json = JSON.stringify(value);
  return typeof Buffer === "function" ? Buffer.byteLength(json, "utf8") : new TextEncoder().encode(json).byteLength;
}

evict() {
  const protectedIds = new Set([
    ...this.pinned,
    ...this.mounted.keys(),
    ...Array.from(this.pendingOperations.values(), (item) => String(item.entityId)),
  ]);
  for (const id of this.accessOrder.keys()) {
    if (this.models.size <= this.maxModels && this.estimatedBytes <= this.maxEstimatedBytes) break;
    if (protectedIds.has(id)) continue;
    this.removeResidentModel(id);
  }
}
```

- [ ] **Step 4: Make the virtualizer request missing pages without clearing retained nodes**

Add optional constructor callback `requestData({ mountRect, viewport })`. During `flush`, if `store.isViewportComplete?.(mountRect) === false`, call it once per generation and report `needsData: true`. Keep retained mounted nodes until a newer page is applied.

```js
const needsData = this.store.isViewportComplete?.(mountRect) === false;
if (needsData && this.requestedDataGeneration !== generation) {
  this.requestedDataGeneration = generation;
  this.requestData?.({ mountRect, viewport });
}
const detail = {
  mounted: mountedCount,
  unmounted: unmountedCount,
  remaining,
  visible: visibleIds.length,
  totalMounted: this.store.mountedSize,
  needsData,
};
```

- [ ] **Step 5: Run paged-store and existing virtualizer checks**

Run: `node tools/check-canvas-paged-store.js && node tools/check-canvas-virtual-store.js && node tools/check-canvas-virtualizer.js`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add canvas-paged-store.js canvas-virtualizer.js tools/check-canvas-paged-store.js package.json
git commit -m "feat: add bounded canvas paged store"
```

---

### Task 7: Viewport Data Source, Cancellation, and Overscan Prefetch

**Files:**
- Create: `canvas-viewport-data-source.js`
- Create: `tools/check-canvas-viewport-data-source.js`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: `CanvasPagedStore.applyViewportPage(page)`.
- Produces `CanvasViewportDataSource({ fetchImpl, store, endpointBase, getBoardId, overscanFactor, onStatus })`.
- Methods: `request(viewport)`, `prefetch(viewport)`, `cancel()`, `dispose()`.
- Status: `{ state, generation, error }` where state is `loading`, `ready`, `aborted`, or `error`.

- [ ] **Step 1: Write failing cancellation and stale-response tests**

Use deferred fake fetch calls. Start generation 1, start generation 2 before generation 1 resolves, resolve generation 1 last, and assert only generation 2 reaches `store.applyViewportPage`. Assert the first signal is aborted, a failed request keeps existing models, and a request contained by fulfilled overscan at the same board revision and LOD makes no fetch.

```js
const pages = [];
function createDeferredResponse(marker) {
  let resolveRequest;
  return {
    start(url, options) {
      this.signal = options.signal;
      return new Promise((resolve) => {
        resolveRequest = () => resolve({ ok: true, json: async () => ({ marker, mode: "detail", nodes: [], connections: [] }) });
      });
    },
    resolve() { resolveRequest(); },
  };
}
const firstResponse = createDeferredResponse("first");
const secondResponse = createDeferredResponse("second");
const responses = [firstResponse, secondResponse];
let responseIndex = 0;
const source = new CanvasViewportDataSource({
  fetchImpl: (url, options) => responses[responseIndex++].start(url, options),
  store: { applyViewportPage: (page) => pages.push(page) },
  endpointBase: "/api/canvas/boards",
  getBoardId: () => "board-1",
  overscanFactor: 1.5,
  onStatus: () => {},
});
const makeViewport = (left) => ({ left, top: 0, right: left + 1000, bottom: 800, scale: 1 });
const first = source.request(makeViewport(0));
const second = source.request(makeViewport(1000));
secondResponse.resolve();
await second;
firstResponse.resolve();
await first.catch(() => {});
assert.deepEqual(pages.map((page) => page.marker), ["second"]);
```

- [ ] **Step 2: Run and verify failure**

Run: `node tools/check-canvas-viewport-data-source.js`

Expected: FAIL with `Cannot find module '../canvas-viewport-data-source'`.

- [ ] **Step 3: Implement generation-safe requests**

Use this core order:

```js
this.generation += 1;
const generation = String(this.generation);
this.controller?.abort();
this.controller = new AbortController();
this.onStatus({ state: "loading", generation });
const response = await this.fetchImpl(url, { signal: this.controller.signal });
if (!response.ok) throw new Error("Canvas viewport request failed: " + response.status);
const page = await response.json();
if (generation !== String(this.generation)) return { ignored: true };
this.store.applyViewportPage({ ...page, generation });
this.onStatus({ state: "ready", generation });
return page;
```

Compute overscan in canvas units from viewport pixels and scale. Cache the last fulfilled rectangle and skip contained requests only when board revision and LOD mode also match.

- [ ] **Step 4: Run checks**

Run: `node --check canvas-viewport-data-source.js && node tools/check-canvas-viewport-data-source.js`

Expected: `Canvas viewport data source checks passed.`

- [ ] **Step 5: Commit**

```bash
git add canvas-viewport-data-source.js tools/check-canvas-viewport-data-source.js package.json
git commit -m "feat: add cancellable canvas viewport source"
```

---

### Task 8: Client Cutover to Metadata, Viewport Pages, Incremental Save, and Delta Undo

**Files:**
- Modify: `index.html` final script block
- Modify: `script.js:362-383,8534-8600,10885-11546,11996-13020`
- Create: `tools/check-canvas-paged-integration.js`
- Create: `tools/check-canvas-paged-roundtrip-ui.js`
- Modify: `package.json` scripts
- Modify: `build-portable.bat` runtime list

**Interfaces:**
- Consumes: `CanvasPagedStore`, `CanvasViewportDataSource`, existing `CanvasVirtualizer`, and node adapters.
- Produces diagnostic globals `canvasPagedStore` and `canvasViewportDataSource`.
- Produces `stageCanvasOperation(operation)`, `flushCanvasOperations()`, `recordCanvasUndo(command)`, and `undoCanvasCommand()`.

- [ ] **Step 1: Write the failing static integration contract**

```js
assert.match(html, /canvas-paged-store\.js[\s\S]*canvas-viewport-data-source\.js[\s\S]*canvas-virtualizer\.js[\s\S]*script\.js/);
assert.match(script, /const canvasPagedStore\s*=/);
assert.match(script, /const canvasViewportDataSource\s*=/);
assert.match(script, /function stageCanvasOperation\(/);
assert.match(script, /async function flushCanvasOperations\(/);
assert.match(script, /function recordCanvasUndo\(/);
assert.doesNotMatch(script, /async function saveCanvasBoardNow\(\)[\s\S]{0,700}serializeCanvasBoard\(\)/);
assert.doesNotMatch(script, /function recordCanvasUndo\([\s\S]{0,500}serializeCanvasBoard\(\)/);
```

Also assert both modules are copied by `build-portable.bat` and syntax/test-checked by `npm run check`.

- [ ] **Step 2: Run and verify failure**

Run: `node tools/check-canvas-paged-integration.js`

Expected: FAIL because `index.html` does not load the modules.

- [ ] **Step 3: Instantiate the paged runtime and change board opening**

Load `canvas-paged-store.js` and `canvas-viewport-data-source.js` before `canvas-virtualizer.js`. Replace the all-node store with `CanvasPagedStore` while retaining an alias only for adapters that use the common store interface. `loadCanvasBoards()` consumes metadata only. `openCanvasBoardFromHistory(meta)` sets active ID/revision/viewport, requests the first page, waits for a visible shell or confirmed empty page, and never calls progressive full restore for active SQLite boards.

```js
const canvasPagedStore = new window.CanvasPagedStore({ rules: window.CanvasVirtualizationRules });
const canvasVirtualStore = canvasPagedStore;
const canvasViewportDataSource = new window.CanvasViewportDataSource({
  fetchImpl: window.fetch.bind(window),
  store: canvasPagedStore,
  endpointBase: "/api/canvas/boards",
  getBoardId: () => canvasState.activeBoardId,
  overscanFactor: 1.5,
  onStatus: updateCanvasViewportStatus,
});
window.canvasPagedStore = canvasPagedStore;
window.canvasViewportDataSource = canvasViewportDataSource;
canvasState.redoStack = [];
```

- [ ] **Step 4: Replace normal save serialization with operations**

Every create, move, resize, edit, connection change, group change, and board metadata change calls:

```js
function stageCanvasOperation(operation) {
  canvasPagedStore.stageOperation({
    ...operation,
    operationId: operation.operationId || createId(),
  });
  canvasState.hasUnsavedChanges = true;
  scheduleCanvasBoardSave();
}
```

`saveCanvasBoardNow()` sends at most 500 pending operations, acknowledges exact IDs, updates `activeBoardRevision`, and leaves failed operations pending. `serializeCanvasBoard()` remains only for legacy fixtures and explicit compatibility export; autosave, undo, history listing, and normal open cannot call it.

- [ ] **Step 5: Replace snapshot undo with inverse commands**

Use `{ label, forward, inverse, estimatedBytes }`. Move stores old/new geometry; create inverts to delete; delete stores payload and related loaded connections; text/edit stores old/new changed fields. `undoCanvasCommand()` stages new operation IDs for inverse commands and retains forward commands for redo. Enforce both 80 entries and a 32MB estimated-byte ceiling.

```js
function recordCanvasUndo(command) {
  const entry = { ...command, estimatedBytes: new TextEncoder().encode(JSON.stringify(command)).byteLength };
  canvasState.undoStack.push(entry);
  let bytes = canvasState.undoStack.reduce((total, item) => total + item.estimatedBytes, 0);
  while (canvasState.undoStack.length > 80 || bytes > 32 * 1024 * 1024) {
    bytes -= canvasState.undoStack.shift().estimatedBytes;
  }
}

function undoCanvasCommand() {
  const command = canvasState.undoStack.pop();
  if (!command) return false;
  command.inverse.forEach((operation) => stageCanvasOperation({ ...operation, operationId: createId() }));
  canvasState.redoStack.push(command);
  return true;
}
```

- [ ] **Step 6: Keep connection compatibility bounded**

`canvasState.connections` becomes the loaded connection working set only. Rendering may iterate it. Save, export, board trash, global statistics, and whole-board operations use services. Node-local helpers query the paged connection map by endpoint ID; no feature may infer total board connections from the loaded array.

```js
function syncVisibleCanvasConnections() {
  canvasState.connections = canvasPagedStore.getVisibleConnections();
}

function getCanvasConnectionsForNode(nodeId) {
  return canvasPagedStore.getConnectionsForNode(String(nodeId));
}
```

- [ ] **Step 7: Add the browser round-trip test**

Mock metadata, viewport, and operation endpoints separately. Open a board, pan to page two, resolve stale page one last, edit a far text node, flush, simulate reload, and assert the returned payload plus unknown field remount. Assert no normal save body contains `nodes` or `connections` arrays.

```js
const saveBodies = [];
await page.route("**/api/canvas/boards/*/operations", async (route) => {
  const body = route.request().postDataJSON();
  saveBodies.push(body);
  const results = body.operations.map((item, index) => ({ operationId: item.operationId, status: "applied", entityRevision: index + 1 }));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ boardRevision: body.baseRevision + 1, results }) });
});
await page.locator('[data-board-id="paged-board"]').click();
await page.evaluate(() => {
  canvasState.x = -100000;
  applyCanvasTransformNow();
});
await page.locator('[data-node-id="far-text"] textarea').fill("changed");
await page.evaluate(() => flushCanvasOperations());
assert.equal(saveBodies.some((body) => Object.hasOwn(body, "nodes") || Object.hasOwn(body, "connections")), false);
```

- [ ] **Step 8: Run client checks**

Run: `node tools/check-canvas-paged-integration.js && node tools/check-canvas-virtualization-integration.js && node tools/check-canvas-paged-roundtrip-ui.js`

Expected: all pass without page errors.

- [ ] **Step 9: Commit**

```bash
git add index.html script.js canvas-paged-store.js canvas-viewport-data-source.js build-portable.bat tools/check-canvas-paged-integration.js tools/check-canvas-paged-roundtrip-ui.js package.json
git commit -m "feat: page canvas data by viewport"
```

---

### Task 9: Explicit Media Scheduling and Lightweight LOD Primitive Layer

**Files:**
- Create: `canvas-media-scheduler.js`
- Create: `canvas-primitive-layer.js`
- Create: `tools/check-canvas-media-scheduler.js`
- Create: `tools/check-canvas-primitive-layer.js`
- Modify: `index.html` canvas markup and script block
- Modify: `styles.css` canvas layer rules
- Modify: `script.js` image-quality and connection-render adapters
- Modify: `build-portable.bat`
- Modify: `package.json` scripts

**Interfaces:**
- Produces `CanvasMediaScheduler({ maxThumbnails = 6, maxOriginals = 2, now, setTimer, clearTimer })` with `enqueue(task)`, `cancelNode(nodeId)`, `setInteractionActive(active)`, and `dispose()`.
- Task: `{ nodeId, quality, priority, run(signal), release() }` where quality is `thumbnail` or `original`.
- Produces `CanvasPrimitiveLayer({ canvas, devicePixelRatio })` with `resize(width, height)`, `render({ lodNodes, lodConnections, transform })`, `clear()`, and `hitTest(x, y)`.

- [ ] **Step 1: Write failing scheduler and primitive tests**

Scheduler tests prove thumbnail concurrency never exceeds 6, original concurrency never exceeds 2, interaction aborts originals but not thumbnails, leaving viewport releases object URLs once, and retries use delays `[250, 1000, 4000]`.

Primitive tests use a fake 2D context and assert command count is bounded by response size, transforms use viewport center as local origin, hit-test returns aggregate ID, and clear removes stale hit regions.

```js
const active = { thumbnail: 0, original: 0 };
const peak = { thumbnail: 0, original: 0 };
const aborted = { thumbnail: 0, original: 0 };
function deferredMediaTask(nodeId, quality) {
  return {
    nodeId,
    quality,
    priority: 1,
    release() {},
    run(signal) {
      active[quality] += 1;
      peak[quality] = Math.max(peak[quality], active[quality]);
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => {
        active[quality] -= 1;
        aborted[quality] += 1;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true }));
    },
  };
}
function fakeCanvas() {
  const context = {
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {}, fillText() {},
    setTransform() {}, save() {}, restore() {}, measureText: () => ({ width: 10 }),
  };
  return { width: 0, height: 0, style: {}, getContext: () => context };
}
const scheduler = new CanvasMediaScheduler({ maxThumbnails: 6, maxOriginals: 2, now: () => 0 });
for (let index = 0; index < 10; index += 1) scheduler.enqueue(deferredMediaTask("thumb-" + index, "thumbnail"));
for (let index = 0; index < 5; index += 1) scheduler.enqueue(deferredMediaTask("full-" + index, "original"));
assert.ok(peak.thumbnail <= 6);
assert.ok(peak.original <= 2);
const originalBeforeInteraction = active.original;
scheduler.setInteractionActive(true);
assert.equal(aborted.original, originalBeforeInteraction);

const layer = new CanvasPrimitiveLayer({ canvas: fakeCanvas(), devicePixelRatio: 1 });
layer.resize(1440, 900);
layer.render({ lodNodes: [{ id: "tile-1", x: 0, y: 0, width: 50, height: 40, count: 100 }], lodConnections: [], transform: { x: 0, y: 0, scale: 1 } });
assert.equal(layer.hitTest(720, 450)?.id, "tile-1");
layer.clear();
assert.equal(layer.hitTest(720, 450), null);
```

- [ ] **Step 2: Run and verify missing modules**

Run: `node tools/check-canvas-media-scheduler.js && node tools/check-canvas-primitive-layer.js`

Expected: both fail with missing-module errors.

- [ ] **Step 3: Implement the scheduler**

Maintain separate priority queues for thumbnails and originals, one `AbortController` per running task, and one map keyed by `nodeId:quality`. Re-enqueue replaces the older queued task. Originals cannot start while interaction is active. Cancellation and release call the release hook exactly once.

```js
enqueue(task) {
  const key = String(task.nodeId) + ":" + String(task.quality);
  this.cancelKey(key);
  const entry = { ...task, key, attempt: 0, released: false };
  this.entries.set(key, entry);
  this.queues[task.quality].push(entry);
  this.queues[task.quality].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  this.pump();
  return key;
}

start(entry) {
  const controller = new AbortController();
  this.running.set(entry.key, { entry, controller });
  Promise.resolve(entry.run(controller.signal))
    .then(() => this.finish(entry.key))
    .catch((error) => this.retryOrFinish(entry, error));
}
```

- [ ] **Step 4: Implement Canvas2D LOD rendering**

Add `<canvas id="canvasPrimitiveLayer" class="canvas-primitive-layer"></canvas>` below detailed nodes and above the background. Render aggregate rectangles, type/status markers, counts, and aggregate connections in one pass. Convert world coordinates through the current viewport center; never size the backing canvas from world extents.

```html
<div class="canvas-plane" id="canvasPlane">
  <canvas id="canvasPrimitiveLayer" class="canvas-primitive-layer" aria-hidden="true"></canvas>
  <svg class="canvas-connections" id="canvasConnections"></svg>
</div>
```

```js
render({ lodNodes = [], lodConnections = [], transform }) {
  this.clear();
  const originX = this.width / 2;
  const originY = this.height / 2;
  lodConnections.forEach((item) => this.drawConnection(item, transform, originX, originY));
  lodNodes.forEach((item) => this.drawNode(item, transform, originX, originY));
}
```

Native WebGL2 and PixiJS are outside this plan. If Task 11 proves Canvas2D itself misses frame budgets, capture the trace and revise the approved design before adding a renderer.

- [ ] **Step 5: Integrate explicit media states**

Detailed nodes request originals after interaction settles; compact nodes request thumbnails; LOD mode uses primitive data. Node title, state, and controls appear independently of media. Media failure shows the existing error card and manual retry.

```js
function getCanvasMediaQuality(nodeId, level) {
  if (canvasPagedStore.lodPage) return null;
  if (level !== "full") return "thumbnail";
  return canvasState.isPanning || canvasState.isZooming ? "thumbnail" : "original";
}
```

- [ ] **Step 6: Run checks**

Run: `node tools/check-canvas-media-scheduler.js && node tools/check-canvas-primitive-layer.js && node tools/check-global-image-demand-loading.js && node tools/check-canvas-paged-roundtrip-ui.js`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add canvas-media-scheduler.js canvas-primitive-layer.js index.html styles.css script.js build-portable.bat tools/check-canvas-media-scheduler.js tools/check-canvas-primitive-layer.js package.json
git commit -m "feat: bound canvas media and lod rendering"
```

---

### Task 10: Streaming Export/Import, Portable Runtime, and Safe Local Artifacts

**Files:**
- Create: `canvas-export-service.js`
- Create: `tools/check-canvas-export-roundtrip.js`
- Modify: `server.js` canvas export/import routes
- Modify: `start.bat`
- Modify: `build-portable.bat`
- Modify: `tools/check-portable-package.js`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: `repository.exportBoardPage({ boardId, cursor, limit })` and `validateBoardExport(source, exported)` from Task 4.
- Produces `streamCanvasExport({ repository, boardId, writable })` and `importCanvasStream({ repository, readable, onProgress })`.
- `importCanvasStream` resolves `{ boardId, nodeCount, connectionCount, payloadHash }` only after validation and activation.
- Endpoints: `GET /api/canvas/boards/:id/export` and `POST /api/canvas/import`.

- [ ] **Step 1: Write a failing streaming round-trip test**

Create a 2,500-node/5,000-connection temporary board, stream export into a writable that rejects any single write above 1MB, import into a second board, and assert counts, IDs, endpoints, far coordinates, unknown fields, and canonical hashes. Terminate import after page two and assert the temporary board is not active.

```js
const chunks = [];
const writable = new Writable({
  write(chunk, encoding, callback) {
    assert.ok(chunk.byteLength <= 1024 * 1024, "export chunk exceeded 1MB");
    chunks.push(Buffer.from(chunk));
    callback();
  },
});
await streamCanvasExport({ repository, boardId: "source", writable });
const imported = await importCanvasStream({ repository, readable: Readable.from(chunks), onProgress: () => {} });
assert.equal(imported.nodeCount, 2500);
assert.equal(imported.connectionCount, 5000);
assert.equal(imported.payloadHash, sourcePayloadHash);
```

- [ ] **Step 2: Run and verify failure**

Run: `node tools/check-canvas-export-roundtrip.js`

Expected: FAIL with `Cannot find module '../canvas-export-service'`.

- [ ] **Step 3: Implement paged streaming**

Write the JSON envelope incrementally: metadata, comma-separated node pages, comma-separated connection pages, then closing fields. Await `drain` when `writable.write()` returns false. Import writes bounded pages to an inactive board, validates with the migration validator, then atomically activates it. No path constructs an object containing all nodes and connections.

```js
async function writeChunk(writable, chunk) {
  if (writable.write(chunk)) return;
  await new Promise((resolve, reject) => {
    writable.once("drain", resolve);
    writable.once("error", reject);
  });
}

async function streamEntityPages({ repository, boardId, entity, writable }) {
  let cursor = "";
  let first = true;
  do {
    const page = await repository.exportBoardPage({ boardId, entity, cursor, limit: 500 });
    for (const item of page.items) {
      await writeChunk(writable, (first ? "" : ",") + JSON.stringify(item));
      first = false;
    }
    cursor = page.nextCursor || "";
  } while (cursor);
}
```

- [ ] **Step 4: Enforce runtime in launcher and package**

`start.bat` runs:

```bat
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major===24&&minor>=13?0:1)"
```

On failure print `Node.js 24.13 or newer within Node 24 LTS is required.`. Portable verification asserts every new runtime file and exact engine range.

- [ ] **Step 5: Configure and ignore only transient state**

Add `CANVAS_DB_FILE=./data/canvas.db` and `CANVAS_STORAGE_MODE=auto` to `.env.example`. Add:

```gitignore
# Local canvas database and transient benchmark state
data/*.db
data/*.db-wal
data/*.db-shm
*.pid
tmp/canvas-pressure/
```

Do not delete existing `artifacts/`, `_encoding_corrupt_backup_*`, `flclash-backup-*`, or `.bak` files.

- [ ] **Step 6: Run export, portable, and full checks**

Run: `node tools/check-canvas-export-roundtrip.js && node tools/check-portable-package.js && npm run check`

Expected: all pass; portable verification lists every SQLite, paged, media, and LOD runtime module.

- [ ] **Step 7: Commit**

```bash
git add canvas-export-service.js server.js start.bat build-portable.bat tools/check-portable-package.js tools/check-canvas-export-roundtrip.js .env.example .gitignore package.json
git commit -m "feat: stream canvas data and package sqlite runtime"
```

---

### Task 11: 50,000-Node Benchmark, Crash Recovery, Rollout Gate, and Report

**Files:**
- Create: `tools/generate-canvas-50000-fixture.js`
- Create: `tools/check-canvas-50000-performance-ui.js`
- Create: `tools/check-canvas-crash-recovery.js`
- Create: `tools/run-canvas-50000-soak.js`
- Create: `docs/performance/canvas-50000-baseline.md`
- Modify: `package.json` scripts
- Modify: `.env.example`

**Interfaces:**
- Produces `npm run check:canvas-fast`, `npm run check:canvas-50000`, and optional `npm run check:canvas-soak`.
- Writes machine-readable metrics under ignored `tmp/canvas-pressure/` and commits only the summarized baseline report.

- [ ] **Step 1: Write the deterministic fixture generator**

Use seed `50000`. Generate exactly 15,000 text/basic, 15,000 image, 10,000 generation/form, 5,000 audio/video, and 5,000 group/Agent/workflow nodes; 100,000 valid connections; and 25,000 media references. Include dense clusters, sparse regions, overlap, and coordinates from `-1_000_000_000` through `1_000_000_000`. Insert through repository batches; do not commit a giant JSON fixture.

```js
const COMPOSITION = Object.freeze([
  { kind: "text", count: 15_000 },
  { kind: "image", count: 15_000 },
  { kind: "generator", count: 10_000 },
  { kind: "media", count: 5_000 },
  { kind: "workflow", count: 5_000 },
]);
const NODE_COUNT = COMPOSITION.reduce((total, item) => total + item.count, 0);
const CONNECTION_COUNT = 100_000;
const MEDIA_REFERENCE_COUNT = 25_000;
assert.equal(NODE_COUNT, 50_000);
```

- [ ] **Step 2: Write browser acceptance assertions**

Collect cold/warm usable time, viewport P95, pan/zoom P95/P99, input response, long tasks, DOM, JS heap, server RSS, visibility timing, stale response safety, and far-coordinate correctness. Assert:

```js
assert.ok(metrics.coldUsableMs <= 2000);
assert.ok(metrics.warmUsableMs <= 1000);
assert.ok(metrics.viewportP95Ms <= 75);
assert.ok(metrics.panP95Ms <= 20);
assert.ok(metrics.panP99Ms <= 50);
assert.ok(metrics.longestInteractionTaskMs <= 100);
assert.ok(metrics.detailedDomNodes <= 800);
assert.ok(metrics.totalCanvasDom <= 1200);
assert.ok(metrics.canvasHeapMB <= 350);
assert.ok(metrics.serverCanvasRssMB <= 250);
assert.ok(metrics.textVisibleMs <= 300);
assert.ok(metrics.thumbnailVisibleMs <= 800);
assert.equal(metrics.blankNodeCount, 0);
```

- [ ] **Step 3: Write crash-recovery checks**

Start with a temporary DB, terminate the DB Worker during a batch, restart, and assert committed operation IDs exist once, uncommitted IDs do not exist, retry is idempotent, and `quick_check` returns `ok`. Repeat during migration and import; inactive boards stay hidden and backup hashes remain unchanged.

Add a test-only worker option `testFaultStage` that is accepted only when the database path is inside the test temporary directory. The crash check runs:

```js
const first = createCanvasRepository({ dbPath, testFaultStage: "after_sql_before_commit" });
await first.ready();
await assert.rejects(() => first.applyOperations(batch), /worker exited|repository/i);
await first.close().catch(() => {});
const recovered = createCanvasRepository({ dbPath });
await recovered.ready();
assert.deepEqual(await recovered.quickCheck(), { ok: true, result: "ok" });
assert.equal((await recovered.getOperationStatuses(batch.operations.map((item) => item.operationId))).filter((item) => item.committed).length, 0);
const retry = await recovered.applyOperations(batch);
assert.equal(retry.results.filter((item) => item.status === "applied").length, batch.operations.length);
```

- [ ] **Step 4: Add tiered package scripts**

`check:canvas-fast` runs new pure/server tests plus existing virtualization checks and must complete within 3 minutes. `check:canvas-50000` generates the fixture, runs performance and crash checks, then runs the 10-minute stability loop. `check:canvas-soak` passes `--minutes=60` and is never part of `npm run check`.

Add these exact script keys, keeping `check:canvas-soak` out of `check`:

```json
"check:canvas-fast": "node tools/check-canvas-spatial-rules.js && node tools/check-canvas-schema.js && node tools/check-canvas-repository.js && node tools/check-canvas-repository-operations.js && node tools/check-canvas-legacy-migrator.js && node tools/check-canvas-services.js && node tools/check-canvas-paged-store.js && node tools/check-canvas-viewport-data-source.js && node tools/check-canvas-media-scheduler.js && node tools/check-canvas-primitive-layer.js && node tools/check-canvas-virtualization-integration.js",
"check:canvas-50000": "node tools/generate-canvas-50000-fixture.js && node tools/check-canvas-50000-performance-ui.js && node tools/check-canvas-crash-recovery.js && node tools/run-canvas-50000-soak.js --minutes=10",
"check:canvas-soak": "node tools/run-canvas-50000-soak.js --minutes=60"
```

- [ ] **Step 5: Run the fast suite**

Run: `npm run check:canvas-fast`

Expected: exit 0 within 3 minutes.

- [ ] **Step 6: Run required delivery acceptance**

Run: `npm run check:canvas-50000`

Expected: exit 0 after at least 10 minutes; every hard threshold passes and memory growth from the stable window is at or below 15%.

- [ ] **Step 7: Run full regressions**

Run: `npm run check`

Expected: exit 0. Run existing browser checks for grid editor, gallery history, progressive loading, video output, image jobs, and Agent UI against the local server; expect no page errors and unchanged behavior.

- [ ] **Step 8: Write measured baseline report**

Record exact machine, fixture counts, tested commit, metrics, crash cases, migration hashes, thresholds, and best-effort behavior beyond 50,000 in `docs/performance/canvas-50000-baseline.md`. Use measured values, not target-only values.

- [ ] **Step 9: Enable SQLite only after passing**

Keep `CANVAS_STORAGE_MODE=auto`: prefer SQLite when initialization and `quick_check` succeed; allow only read-only legacy opening when migration or database checks fail. Display protection mode in the UI and never silently resume legacy writes.

```js
async function resolveCanvasStorageMode(requestedMode, repository) {
  if (requestedMode === "legacy-readonly") return "legacy-readonly";
  try {
    const check = await repository.quickCheck();
    return check.ok ? "sqlite" : "legacy-readonly";
  } catch {
    return "legacy-readonly";
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add tools/generate-canvas-50000-fixture.js tools/check-canvas-50000-performance-ui.js tools/check-canvas-crash-recovery.js tools/run-canvas-50000-soak.js docs/performance/canvas-50000-baseline.md package.json .env.example
git commit -m "test: verify 50000-node canvas performance"
```

---

## Final Verification Checklist

- [ ] `node --check` passes for every new and modified JavaScript file.
- [ ] Every focused check introduced by Tasks 1–11 passes.
- [ ] `npm run check:canvas-fast` completes within 3 minutes.
- [ ] `npm run check:canvas-50000` completes its required 10-minute stability run and passes every hard threshold.
- [ ] `npm run check` passes without weakening existing assertions.
- [ ] Legacy JSON bytes and timestamped backup remain after migration tests.
- [ ] Normal open, autosave, undo, export, and history listing do not serialize the full board.
- [ ] No path dual-writes SQLite and legacy JSON.
- [ ] Unknown fields survive migration, viewport loading, edit/save, export/import, and reopen.
- [ ] The final report records actual numbers and the exact tested commit.
