const path = require("node:path");
const { Worker } = require("node:worker_threads");

function responseError(payload = {}) {
  const error = new Error(String(payload.message || "Canvas repository request failed."));
  error.code = String(payload.code || "repository_error");
  return error;
}

function createCanvasRepository({
  dbPath,
  workerPath = path.join(__dirname, "canvas-db-worker.js"),
  requestTimeoutMs = 10_000,
} = {}) {
  if (!dbPath) throw new Error("Canvas repository requires a database path.");

  const worker = new Worker(path.resolve(workerPath), {
    workerData: { dbPath: path.resolve(dbPath) },
  });
  const pending = new Map();
  let requestId = 0;
  let closed = false;
  let closing = false;
  let closePromise = null;

  function rejectPending(error) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }

  worker.on("message", (message = {}) => {
    const request = pending.get(String(message.id || ""));
    if (!request) return;
    pending.delete(String(message.id || ""));
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message.result);
    else request.reject(responseError(message.error));
  });

  worker.on("error", (error) => {
    rejectPending(Object.assign(new Error(`Canvas repository worker failed: ${error.message}`), {
      code: "repository_worker_error",
    }));
  });

  worker.on("exit", (code) => {
    if (closing || closed) return;
    rejectPending(Object.assign(new Error(`Canvas repository worker exited with code ${code}.`), {
      code: "repository_worker_exit",
    }));
  });

  function invoke(method, params = {}) {
    if (closed) {
      return Promise.reject(Object.assign(new Error("Canvas repository is closed."), {
        code: "repository_closed",
      }));
    }
    const id = String(++requestId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error(`Canvas repository request timed out: ${method}`), {
          code: "repository_timeout",
        }));
      }, Math.max(1, Number(requestTimeoutMs) || 10_000));
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, method, params });
    });
  }

  function ready() {
    return invoke("ready");
  }

  function quickCheck() {
    return invoke("quickCheck");
  }

  function createBoard(board) {
    return invoke("createBoard", board);
  }

  function listBoards() {
    return invoke("listBoards");
  }

  function getBoardMeta(boardId) {
    return invoke("getBoardMeta", { boardId });
  }

  function applyOperations(input) {
    return invoke("applyOperations", input);
  }

  function queryViewport(input) {
    return invoke("queryViewport", input);
  }

  function exportBoardPage(input) {
    return invoke("exportBoardPage", input);
  }

  function getOperationStatuses(operationIds) {
    return invoke("getOperationStatuses", { operationIds });
  }

  function beginLegacyImport(input) {
    return invoke("beginLegacyImport", input);
  }

  function importLegacyBatch(input) {
    return invoke("importLegacyBatch", input);
  }

  function exportImportedBoard(input) {
    return invoke("exportImportedBoard", input);
  }

  function activateImportedBoard(input) {
    return invoke("activateImportedBoard", input);
  }

  function failLegacyImport(input) {
    return invoke("failLegacyImport", input);
  }

  function setBoardTrashState(input) {
    return invoke("setBoardTrashState", input);
  }

  function deleteBoardPermanently(input) {
    return invoke("deleteBoardPermanently", input);
  }

  function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      closing = true;
      try {
        if (!closed) await invoke("close");
      } finally {
        closed = true;
        await worker.terminate();
        rejectPending(Object.assign(new Error("Canvas repository is closed."), {
          code: "repository_closed",
        }));
      }
    })();
    return closePromise;
  }

  return {
    ready,
    quickCheck,
    createBoard,
    listBoards,
    getBoardMeta,
    applyOperations,
    queryViewport,
    exportBoardPage,
    getOperationStatuses,
    beginLegacyImport,
    importLegacyBatch,
    exportImportedBoard,
    activateImportedBoard,
    failLegacyImport,
    setBoardTrashState,
    deleteBoardPermanently,
    invoke,
    close,
  };
}

module.exports = {
  createCanvasRepository,
};
