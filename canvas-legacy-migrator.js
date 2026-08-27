const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function stableHash(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function requireValid(condition, message) {
  if (condition) return;
  throw codedError("legacy_validation_failed", message);
}

function validateBoardExport(source = {}, exported = {}) {
  const sourceNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const sourceConnections = Array.isArray(source.connections) ? source.connections : [];
  const nodes = Array.isArray(exported.nodes) ? exported.nodes : [];
  const connections = Array.isArray(exported.connections) ? exported.connections : [];
  requireValid(nodes.length === sourceNodes.length, "Legacy node count mismatch.");
  requireValid(connections.length === sourceConnections.length, "Legacy connection count mismatch.");
  requireValid(
    new Set(nodes.map((item) => String(item?.id || ""))).size === nodes.length,
    "Legacy canvas contains duplicate node ids.",
  );
  const connectionIds = connections
    .map((item) => String(item?.id || ""))
    .filter(Boolean);
  requireValid(
    new Set(connectionIds).size === connectionIds.length,
    "Legacy canvas contains duplicate connection ids.",
  );
  const nodeIds = new Set(nodes.map((item) => String(item?.id || "")));
  nodes.forEach((item) => {
    requireValid(Boolean(String(item?.id || "")), "Legacy node id is missing.");
    ["x", "y", "width", "height"].forEach((key) => {
      requireValid(
        Number.isFinite(Number(item?.[key] ?? 0)),
        `Legacy node ${String(item?.id || "")} has non-finite ${key}.`,
      );
    });
  });
  connections.forEach((item) => {
    requireValid(nodeIds.has(String(item?.from || "")), "Legacy connection source is missing.");
    requireValid(nodeIds.has(String(item?.to || "")), "Legacy connection target is missing.");
  });
  const nodeHash = stableHash(nodes);
  const connectionHash = stableHash(connections);
  requireValid(nodeHash === stableHash(sourceNodes), "Legacy node payload hash mismatch.");
  requireValid(
    connectionHash === stableHash(sourceConnections),
    "Legacy connection payload hash mismatch.",
  );
  return {
    nodeCount: nodes.length,
    connectionCount: connections.length,
    nodeHash,
    connectionHash,
    hash: stableHash({ nodes, connections }),
  };
}

function readLegacyBoards(legacyFile) {
  if (!fs.existsSync(legacyFile)) return [];
  const parsed = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  return [
    ...(Array.isArray(parsed?.boards) ? parsed.boards : []),
    ...(Array.isArray(parsed?.trash) ? parsed.trash : []),
  ];
}

function backupTimestamp(date = new Date()) {
  const digits = date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return digits;
}

function createCanvasLegacyMigrator({
  legacyFile,
  repository,
  backupDirectory = path.dirname(path.resolve(legacyFile || ".")),
  batchSize = 500,
} = {}) {
  if (!legacyFile) throw new Error("Canvas legacy migrator requires a legacy file.");
  if (!repository) throw new Error("Canvas legacy migrator requires a repository.");
  const sourceFile = path.resolve(legacyFile);
  const backupRoot = path.resolve(backupDirectory);
  const safeBatchSize = Math.max(1, Math.min(1000, Math.trunc(Number(batchSize) || 500)));

  function listLegacySummaries() {
    return readLegacyBoards(sourceFile).map((board) => ({
      id: String(board?.id || ""),
      title: String(board?.title || "Untitled canvas"),
      createdAt: String(board?.createdAt || ""),
      updatedAt: String(board?.updatedAt || ""),
      deletedAt: String(board?.deletedAt || ""),
      viewport: board?.viewport && typeof board.viewport === "object"
        ? { ...board.viewport }
        : { x: 0, y: 0, scale: 1 },
      nodeCount: Array.isArray(board?.nodes) ? board.nodes.length : 0,
      connectionCount: Array.isArray(board?.connections) ? board.connections.length : 0,
    })).filter((board) => board.id);
  }

  function findLegacyBoard(boardId) {
    const id = String(boardId || "");
    return readLegacyBoards(sourceFile).find((board) => String(board?.id || "") === id) || null;
  }

  function ensureTimestampedBackup() {
    if (!fs.existsSync(sourceFile)) {
      throw codedError("legacy_file_missing", `Legacy canvas file was not found: ${sourceFile}`);
    }
    fs.mkdirSync(backupRoot, { recursive: true });
    const stem = `${path.basename(sourceFile)}.bak-${backupTimestamp()}`;
    let target = path.join(backupRoot, stem);
    let suffix = 0;
    while (fs.existsSync(target)) {
      suffix += 1;
      target = path.join(backupRoot, `${stem}-${suffix}`);
    }
    fs.copyFileSync(sourceFile, target, fs.constants.COPYFILE_EXCL);
    return target;
  }

  async function importBatches(boardId, entity, items, onProgress) {
    const total = items.length;
    if (total === 0) {
      onProgress({ boardId, phase: entity, completed: 0, total: 0 });
      return;
    }
    for (let offset = 0; offset < total; offset += safeBatchSize) {
      const batch = items.slice(offset, offset + safeBatchSize);
      await repository.importLegacyBatch({ boardId, entity, items: batch, offset });
      onProgress({
        boardId,
        phase: entity,
        completed: Math.min(total, offset + batch.length),
        total,
      });
    }
  }

  async function getMigrationState(boardId) {
    const id = String(boardId || "");
    const metadata = await repository.getBoardMeta(id).catch((error) => {
      if (error?.code === "board_not_found") return null;
      throw error;
    });
    return {
      boardId: id,
      state: metadata?.migrationState || (findLegacyBoard(id) ? "pending" : "missing"),
      metadata,
    };
  }

  async function ensureMigrated(boardId, onProgress = () => {}) {
    const id = String(boardId || "");
    const existing = await repository.getBoardMeta(id).catch((error) => {
      if (error?.code === "board_not_found") return null;
      throw error;
    });
    if (existing?.migrationState === "active") return existing;
    const board = findLegacyBoard(id);
    if (!board) {
      throw codedError("canvas_board_not_found", `Legacy canvas board was not found: ${id}`);
    }
    const backupFile = ensureTimestampedBackup();
    onProgress({ boardId: id, phase: "backup", completed: 1, total: 1, backupFile });
    try {
      await repository.beginLegacyImport({ board, backupFile });
      await importBatches(id, "nodes", Array.isArray(board.nodes) ? board.nodes : [], onProgress);
      await importBatches(
        id,
        "connections",
        Array.isArray(board.connections) ? board.connections : [],
        onProgress,
      );
      onProgress({ boardId: id, phase: "validate", completed: 0, total: 1 });
      const exported = await repository.exportImportedBoard({ boardId: id });
      const validation = validateBoardExport(board, exported);
      await repository.activateImportedBoard({ boardId: id, validation });
      onProgress({ boardId: id, phase: "validate", completed: 1, total: 1 });
      onProgress({ boardId: id, phase: "complete", completed: 1, total: 1 });
      return repository.getBoardMeta(id);
    } catch (error) {
      await repository.failLegacyImport({
        boardId: id,
        message: String(error?.message || error || "Legacy migration failed."),
      }).catch(() => {});
      throw error;
    }
  }

  return {
    listLegacySummaries,
    ensureMigrated,
    getMigrationState,
  };
}

module.exports = {
  canonicalize,
  stableHash,
  validateBoardExport,
  createCanvasLegacyMigrator,
};
