const crypto = require("node:crypto");

const OPERATION_TYPES = new Set([
  "node.upsert",
  "node.delete",
  "connection.upsert",
  "connection.delete",
  "board.patch",
]);

function commandError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw commandError("invalid_canvas_operation", `${label} is required.`);
  return text;
}

function requireFiniteGeometry(operation) {
  if (operation.type !== "node.upsert") return;
  const after = operation.after;
  if (!after || typeof after !== "object") {
    throw commandError("invalid_canvas_operation", "node.upsert requires an after payload.");
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (after[key] !== undefined && !Number.isFinite(Number(after[key]))) {
      throw commandError("invalid_canvas_geometry", `Node ${key} must be finite.`);
    }
  }
  if (Number(after.width ?? 0) < 0 || Number(after.height ?? 0) < 0) {
    throw commandError("invalid_canvas_geometry", "Node width and height cannot be negative.");
  }
}

function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    throw commandError("invalid_canvas_operation", "Canvas operation must be an object.");
  }
  requiredText(operation.operationId, "operationId");
  if (!OPERATION_TYPES.has(String(operation.type || ""))) {
    throw commandError("invalid_canvas_operation", `Unknown canvas operation: ${String(operation.type || "")}`);
  }
  if (operation.type !== "board.patch") requiredText(operation.entityId, "entityId");
  requireFiniteGeometry(operation);
  if (operation.type === "connection.upsert") {
    requiredText(operation.after?.from || operation.after?.fromId, "Connection source");
    requiredText(operation.after?.to || operation.after?.toId, "Connection target");
  }
  return operation;
}

function mapCommandError(error) {
  if (error?.status) return error;
  if (error?.code === "revision_conflict") {
    error.status = 409;
    return error;
  }
  if (error?.code === "board_not_found") {
    error.code = "canvas_board_not_found";
    error.status = 404;
    return error;
  }
  if ([
    "invalid_identifier",
    "invalid_node_geometry",
    "invalid_operation",
    "unknown_operation_type",
    "connection_endpoint_missing",
  ].includes(error?.code)) {
    error.status = 400;
  }
  return error;
}

function createCanvasCommandService({ repository } = {}) {
  if (!repository) throw new Error("Canvas command service requires a repository.");

  async function createBoard(input = {}) {
    if (!input || typeof input !== "object") {
      throw commandError("invalid_canvas_board", "Canvas board must be an object.");
    }
    const id = String(input.id || crypto.randomUUID()).trim();
    const title = String(input.title || "Untitled canvas").replace(/\s+/g, " ").trim().slice(0, 80);
    try {
      return await repository.createBoard({
        id,
        title: title || "Untitled canvas",
        viewport: input.viewport || { x: 0, y: 0, scale: 1 },
        createdAt: input.createdAt,
      });
    } catch (error) {
      throw mapCommandError(error);
    }
  }

  async function apply(boardId, body = {}) {
    const id = requiredText(boardId, "boardId");
    if (!Array.isArray(body.operations)) {
      throw commandError("invalid_canvas_operations", "operations must be an array.");
    }
    if (body.operations.length > 500) {
      throw commandError("canvas_operation_batch_too_large", "A canvas batch cannot exceed 500 operations.");
    }
    const baseRevision = Number(body.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      throw commandError("invalid_canvas_revision", "baseRevision must be a non-negative integer.");
    }
    const operations = body.operations.map(validateOperation);
    try {
      return await repository.applyOperations({ boardId: id, baseRevision, operations });
    } catch (error) {
      throw mapCommandError(error);
    }
  }

  async function setTrashState(boardId, operationId, trashed) {
    const id = requiredText(boardId, "boardId");
    const requestId = requiredText(operationId, "operationId");
    try {
      return await repository.setBoardTrashState({
        boardId: id,
        operationId: requestId,
        trashed,
      });
    } catch (error) {
      throw mapCommandError(error);
    }
  }

  async function deletePermanently(boardId) {
    const id = requiredText(boardId, "boardId");
    try {
      return await repository.deleteBoardPermanently({ boardId: id });
    } catch (error) {
      if (error?.code === "board_not_trashed") error.status = 409;
      throw mapCommandError(error);
    }
  }

  return {
    createBoard,
    apply,
    trash: (boardId, operationId) => setTrashState(boardId, operationId, true),
    restore: (boardId, operationId) => setTrashState(boardId, operationId, false),
    deletePermanently,
  };
}

module.exports = {
  createCanvasCommandService,
};
