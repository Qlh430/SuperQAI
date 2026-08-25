const crypto = require("node:crypto");
const { once } = require("node:events");
const { StringDecoder } = require("node:string_decoder");
const { canonicalize } = require("./canvas-legacy-migrator");

const FORMAT = "canvas-paged-v1";
const MAX_WRITE_BYTES = 256 * 1024;

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function writeBuffer(writable, buffer) {
  if (writable.write(buffer)) return;
  await Promise.race([
    once(writable, "drain"),
    once(writable, "error").then(([error]) => Promise.reject(error)),
  ]);
}

async function writeChunk(writable, value, maximumBytes = MAX_WRITE_BYTES) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  const size = Math.max(1024, Math.trunc(Number(maximumBytes) || MAX_WRITE_BYTES));
  for (let offset = 0; offset < buffer.length; offset += size) {
    await writeBuffer(writable, buffer.subarray(offset, Math.min(buffer.length, offset + size)));
  }
}

function createEntityHash() {
  const hash = crypto.createHash("sha256");
  let count = 0;
  hash.update("[");
  return {
    add(item) {
      if (count) hash.update(",");
      hash.update(JSON.stringify(canonicalize(item)));
      count += 1;
    },
    finish() {
      hash.update("]");
      return { count, hash: hash.digest("hex") };
    },
  };
}

function payloadHash(nodeHash, connectionHash) {
  return crypto.createHash("sha256")
    .update(`${String(nodeHash)}\n${String(connectionHash)}`)
    .digest("hex");
}

async function streamEntityPages({ repository, boardId, entity, writable, pageSize }) {
  let cursor = "";
  let first = true;
  const digest = createEntityHash();
  do {
    const page = await repository.exportBoardPage({
      boardId,
      entity,
      cursor,
      limit: pageSize,
    });
    for (const item of page.items || []) {
      digest.add(item);
      await writeChunk(writable, `${first ? "" : ","}${JSON.stringify(item)}\n`);
      first = false;
    }
    cursor = String(page.nextCursor || "");
  } while (cursor);
  return digest.finish();
}

async function endWritable(writable) {
  if (writable.writableEnded || writable.destroyed) return;
  const finished = once(writable, "finish");
  writable.end();
  await finished;
}

async function streamCanvasExport({
  repository,
  boardId,
  writable,
  pageSize = 500,
  end = true,
} = {}) {
  if (!repository || !writable) throw new Error("Canvas export requires repository and writable.");
  const id = String(boardId || "").trim();
  if (!id) throw codedError("canvas_export_board_required", "Canvas export requires a board id.");
  const limit = Math.max(1, Math.min(1000, Math.trunc(Number(pageSize) || 500)));
  const metadata = await repository.getBoardMeta(id);
  await writeChunk(writable, `{"format":${JSON.stringify(FORMAT)},\n`);
  await writeChunk(writable, `"board":${JSON.stringify(metadata)},\n`);
  await writeChunk(writable, '"nodes":[\n');
  const nodes = await streamEntityPages({ repository, boardId: id, entity: "nodes", writable, pageSize: limit });
  await writeChunk(writable, '],\n"connections":[\n');
  const connections = await streamEntityPages({
    repository,
    boardId: id,
    entity: "connections",
    writable,
    pageSize: limit,
  });
  const validation = {
    nodeCount: nodes.count,
    connectionCount: connections.count,
    nodeHash: nodes.hash,
    connectionHash: connections.hash,
    payloadHash: payloadHash(nodes.hash, connections.hash),
  };
  if (Number(metadata.nodeCount) !== validation.nodeCount) {
    throw codedError("canvas_export_changed", "Canvas nodes changed while export was running.");
  }
  if (Number(metadata.connectionCount) !== validation.connectionCount) {
    throw codedError("canvas_export_changed", "Canvas connections changed while export was running.");
  }
  await writeChunk(writable, `],\n"validation":${JSON.stringify(validation)}\n}\n`);
  if (end) await endWritable(writable);
  return { boardId: id, ...validation };
}

function parseValueLine(line, prefix, trailingComma = false) {
  if (!line.startsWith(prefix)) {
    throw codedError("canvas_import_invalid", `Canvas import expected ${prefix}`);
  }
  let value = line.slice(prefix.length);
  if (trailingComma && value.endsWith(",")) value = value.slice(0, -1);
  try {
    return JSON.parse(value);
  } catch {
    throw codedError("canvas_import_invalid", `Canvas import contains invalid JSON after ${prefix}`);
  }
}

function parseEntityLine(line) {
  const value = line.startsWith(",") ? line.slice(1) : line;
  try {
    return JSON.parse(value);
  } catch {
    throw codedError("canvas_import_invalid", "Canvas import contains an invalid entity record.");
  }
}

async function* readStreamLines(readable) {
  const decoder = new StringDecoder("utf8");
  let buffered = "";
  for await (const chunk of readable) {
    buffered += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      yield buffered.slice(0, newline).replace(/\r$/, "");
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf("\n");
    }
    if (Buffer.byteLength(buffered, "utf8") > 16 * 1024 * 1024) {
      throw codedError("canvas_import_record_too_large", "Canvas import record exceeds 16MB.");
    }
  }
  buffered += decoder.end();
  if (buffered) yield buffered.replace(/\r$/, "");
}

async function importCanvasStream({
  repository,
  readable,
  boardId,
  onProgress,
  batchSize = 500,
} = {}) {
  if (!repository || !readable) throw new Error("Canvas import requires repository and readable.");
  const limit = Math.max(1, Math.min(1000, Math.trunc(Number(batchSize) || 500)));
  let state = "header";
  let metadata = null;
  let validation = null;
  let targetId = String(boardId || "").trim();
  let staged = false;
  let complete = false;
  let entity = "";
  let batch = [];
  const offsets = { nodes: 0, connections: 0 };
  const digests = { nodes: createEntityHash(), connections: createEntityHash() };

  async function flush() {
    if (!batch.length || !entity) return;
    const items = batch;
    batch = [];
    await repository.importLegacyBatch({
      boardId: targetId,
      entity,
      items,
      offset: offsets[entity],
    });
    offsets[entity] += items.length;
    onProgress?.({ boardId: targetId, entity, imported: offsets[entity] });
  }

  try {
    for await (const rawLine of readStreamLines(readable)) {
      const line = String(rawLine).trim();
      if (!line) continue;
      if (state === "header") {
        const format = parseValueLine(line, '{"format":', true);
        if (format !== FORMAT) throw codedError("canvas_import_format_unsupported", `Unsupported canvas format: ${format}`);
        state = "board";
      } else if (state === "board") {
        metadata = parseValueLine(line, '"board":', true);
        targetId ||= String(metadata?.id || "").trim();
        if (!targetId) throw codedError("canvas_import_board_required", "Canvas import metadata has no board id.");
        await repository.beginLegacyImport({
          board: { ...metadata, id: targetId },
          backupFile: `stream:${FORMAT}`,
        });
        staged = true;
        state = "nodes-open";
      } else if (state === "nodes-open") {
        if (line !== '"nodes":[') throw codedError("canvas_import_invalid", "Canvas import is missing nodes array.");
        entity = "nodes";
        state = "entities";
      } else if (state === "entities") {
        if (line === '],') {
          await flush();
          state = entity === "nodes" ? "connections-open" : "validation";
          entity = "";
          continue;
        }
        const item = parseEntityLine(line);
        digests[entity].add(item);
        batch.push(item);
        if (batch.length >= limit) await flush();
      } else if (state === "connections-open") {
        if (line !== '"connections":[') {
          throw codedError("canvas_import_invalid", "Canvas import is missing connections array.");
        }
        entity = "connections";
        state = "entities";
      } else if (state === "validation") {
        validation = parseValueLine(line, '"validation":');
        state = "closing";
      } else if (state === "closing") {
        if (line !== "}") throw codedError("canvas_import_invalid", "Canvas import has an invalid closing token.");
        complete = true;
        state = "complete";
      } else {
        throw codedError("canvas_import_invalid", "Canvas import has trailing data.");
      }
    }
    if (!complete || !staged || !validation) {
      throw codedError("canvas_import_incomplete", "Canvas import stream ended before validation completed.");
    }
    const nodes = digests.nodes.finish();
    const connections = digests.connections.finish();
    const computed = {
      nodeCount: nodes.count,
      connectionCount: connections.count,
      nodeHash: nodes.hash,
      connectionHash: connections.hash,
      payloadHash: payloadHash(nodes.hash, connections.hash),
    };
    for (const key of Object.keys(computed)) {
      if (String(computed[key]) !== String(validation[key])) {
        throw codedError("canvas_import_validation_failed", `Canvas import validation failed for ${key}.`);
      }
    }
    await repository.activateImportedBoard({
      boardId: targetId,
      validation: { ...computed, hash: computed.payloadHash },
    });
    return { boardId: targetId, ...computed };
  } catch (error) {
    if (staged && targetId) {
      await repository.failLegacyImport({
        boardId: targetId,
        message: String(error?.message || error || "Canvas streaming import failed."),
      }).catch(() => {});
    }
    if (!error?.code) error.code = "canvas_import_failed";
    throw error;
  }
}

module.exports = {
  FORMAT,
  MAX_WRITE_BYTES,
  createEntityHash,
  payloadHash,
  writeChunk,
  streamEntityPages,
  streamCanvasExport,
  importCanvasStream,
};
