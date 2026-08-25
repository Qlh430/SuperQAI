const { normalizeBounds } = require("./canvas-spatial-rules");

function serviceError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeViewportQuery(query = {}) {
  const bounds = normalizeBounds(query);
  return {
    ...bounds,
    scale: Math.max(0.01, Math.min(5, finite(query.scale, 1))),
    nodeLimit: Math.max(1, Math.min(800, Math.trunc(finite(query.nodeLimit, 800)))),
    connectionLimit: Math.max(1, Math.min(1200, Math.trunc(finite(query.connectionLimit, 1200)))),
    generation: String(query.generation || "0"),
  };
}

function mapQueryError(error) {
  if (error?.status) return error;
  if (error?.code === "board_not_found") {
    return serviceError("canvas_board_not_found", "Canvas board was not found.", 404);
  }
  return error;
}

function createCanvasQueryService({ repository, migrator } = {}) {
  if (!repository) throw new Error("Canvas query service requires a repository.");
  const migrationJobs = new Map();

  function legacySummaries() {
    return migrator?.listLegacySummaries?.() || [];
  }

  async function listBoards() {
    const stored = await repository.listBoards();
    const known = new Set(stored.map((board) => String(board.id)));
    const legacy = legacySummaries()
      .filter((board) => !known.has(String(board.id)))
      .map((board) => ({
        ...board,
        migrationState: "pending",
        revision: 0,
      }));
    const combined = [...stored, ...legacy];
    return {
      boards: combined.filter((board) => !board.deletedAt),
      trash: combined.filter((board) => Boolean(board.deletedAt)),
    };
  }

  function startMigration(boardId) {
    let job = migrationJobs.get(boardId);
    if (job) return job;
    job = {
      state: "migrating",
      progress: { boardId, phase: "prepare", completed: 0, total: 1 },
      error: null,
      promise: null,
    };
    migrationJobs.set(boardId, job);
    job.promise = Promise.resolve()
      .then(() => migrator.ensureMigrated(boardId, (progress) => {
        job.progress = progress;
      }))
      .then((metadata) => {
        job.state = "complete";
        job.metadata = metadata;
        return metadata;
      })
      .catch((error) => {
        job.state = "failed";
        job.error = error;
        return null;
      });
    return job;
  }

  async function ensureReady(boardId) {
    const id = String(boardId || "").trim();
    if (!id) throw serviceError("canvas_board_not_found", "Canvas board was not found.", 404);
    try {
      const metadata = await repository.getBoardMeta(id);
      if (metadata.migrationState === "active") return { metadata };
    } catch (error) {
      if (error?.code !== "board_not_found") throw mapQueryError(error);
    }
    if (!migrator || !legacySummaries().some((board) => String(board.id) === id)) {
      throw serviceError("canvas_board_not_found", "Canvas board was not found.", 404);
    }
    const job = startMigration(id);
    if (job.state === "failed") {
      const error = job.error || serviceError(
        "canvas_migration_failed",
        "Canvas migration failed.",
        500,
      );
      error.status ||= 500;
      throw error;
    }
    return {
      migrating: {
        state: "migrating",
        progress: job.progress,
        httpStatus: 202,
      },
    };
  }

  async function getMeta(boardId) {
    const ready = await ensureReady(boardId);
    if (ready.migrating) return ready.migrating;
    return ready.metadata;
  }

  async function queryViewport(boardId, query) {
    const ready = await ensureReady(boardId);
    if (ready.migrating) return ready.migrating;
    const normalized = normalizeViewportQuery(query);
    try {
      const page = await repository.queryViewport({ boardId: String(boardId), ...normalized });
      return { ...page, generation: normalized.generation };
    } catch (error) {
      throw mapQueryError(error);
    }
  }

  async function exportPage(boardId, query = {}) {
    const ready = await ensureReady(boardId);
    if (ready.migrating) return ready.migrating;
    const entity = query.entity === "connections" ? "connections" : "nodes";
    const limit = Math.max(1, Math.min(1000, Math.trunc(finite(query.limit, 200))));
    try {
      return await repository.exportBoardPage({
        boardId: String(boardId),
        entity,
        cursor: String(query.cursor || ""),
        limit,
      });
    } catch (error) {
      throw mapQueryError(error);
    }
  }

  return {
    listBoards,
    getMeta,
    queryViewport,
    exportPage,
  };
}

module.exports = {
  normalizeViewportQuery,
  createCanvasQueryService,
};
