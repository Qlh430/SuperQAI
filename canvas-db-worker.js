const fs = require("node:fs");
const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const {
  configureDatabase,
  initializeSchema,
  readSchemaVersion,
} = require("./canvas-schema");

if (!parentPort) throw new Error("Canvas database worker requires a parent port.");

const dbPath = path.resolve(String(workerData?.dbPath || ""));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let database = new DatabaseSync(dbPath, {
  timeout: 5000,
  defensive: true,
});
configureDatabase(database);
initializeSchema(database);

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const handlers = {
  ready() {
    return { schemaVersion: readSchemaVersion(database) };
  },

  quickCheck() {
    const row = database.prepare("PRAGMA quick_check").get();
    const result = String(Object.values(row || {})[0] || "");
    return { ok: result === "ok", result };
  },

  close() {
    if (!database) return { closed: true };
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.close();
    database = null;
    return { closed: true };
  },
};

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
