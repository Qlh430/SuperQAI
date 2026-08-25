const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable, Writable } = require("node:stream");
const { createCanvasRepository } = require("../canvas-repository");
const {
  streamCanvasExport,
  importCanvasStream,
} = require("../canvas-export-service");

const NODE_COUNT = 2500;
const CONNECTION_COUNT = 5000;

function collectWritable(chunks, maximumChunkBytes = 1024 * 1024) {
  return new Writable({
    write(chunk, encoding, callback) {
      assert.ok(chunk.byteLength <= maximumChunkBytes, `export chunk exceeded ${maximumChunkBytes} bytes`);
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
}

async function seed(repository) {
  await repository.createBoard({
    id: "stream-source",
    title: "Streaming source",
    viewport: { x: -900_000_000, y: 800_000_000, scale: 0.08 },
  });
  const nodes = Array.from({ length: NODE_COUNT }, (_, index) => ({
    id: `node-${index}`,
    kind: index % 3 === 0 ? "image" : "text",
    x: index === NODE_COUNT - 1 ? 1_000_000_000 : (index % 100) * 480 - 25_000,
    y: index === NODE_COUNT - 1 ? -1_000_000_000 : Math.floor(index / 100) * 360 - 5_000,
    width: 320,
    height: 220,
    text: `node payload ${index}`,
    futureField: index === NODE_COUNT - 1 ? { retained: true, version: 17 } : undefined,
  }));
  const connections = Array.from({ length: CONNECTION_COUNT }, (_, index) => ({
    id: `edge-${index}`,
    from: `node-${index % NODE_COUNT}`,
    to: `node-${(index * 17 + 1) % NODE_COUNT}`,
    futureEdgeField: index === CONNECTION_COUNT - 1 ? { retained: true } : undefined,
  }));
  let revision = 0;
  for (let offset = 0; offset < nodes.length; offset += 500) {
    const batch = nodes.slice(offset, offset + 500).map((node) => ({
      operationId: `seed-node-${node.id}`,
      type: "node.upsert",
      entityId: node.id,
      after: node,
    }));
    const result = await repository.applyOperations({ boardId: "stream-source", baseRevision: revision, operations: batch });
    revision = result.boardRevision;
  }
  for (let offset = 0; offset < connections.length; offset += 500) {
    const batch = connections.slice(offset, offset + 500).map((connection) => ({
      operationId: `seed-edge-${connection.id}`,
      type: "connection.upsert",
      entityId: connection.id,
      after: connection,
    }));
    const result = await repository.applyOperations({ boardId: "stream-source", baseRevision: revision, operations: batch });
    revision = result.boardRevision;
  }
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-export-roundtrip-"));
  const source = createCanvasRepository({ dbPath: path.join(root, "source.db"), requestTimeoutMs: 30_000 });
  const destination = createCanvasRepository({ dbPath: path.join(root, "destination.db"), requestTimeoutMs: 30_000 });
  try {
    await Promise.all([source.ready(), destination.ready()]);
    await seed(source);
    const chunks = [];
    const exported = await streamCanvasExport({
      repository: source,
      boardId: "stream-source",
      writable: collectWritable(chunks),
      pageSize: 500,
    });
    assert.equal(exported.nodeCount, NODE_COUNT);
    assert.equal(exported.connectionCount, CONNECTION_COUNT);
    assert.ok(exported.payloadHash);
    assert.ok(chunks.length > 10, "export should be written incrementally");

    const progress = [];
    const imported = await importCanvasStream({
      repository: destination,
      readable: Readable.from(chunks),
      onProgress: (item) => progress.push(item),
    });
    assert.equal(imported.boardId, "stream-source");
    assert.equal(imported.nodeCount, NODE_COUNT);
    assert.equal(imported.connectionCount, CONNECTION_COUNT);
    assert.equal(imported.payloadHash, exported.payloadHash);
    assert.ok(progress.some((item) => item.entity === "nodes" && item.imported >= 500));
    assert.ok(progress.some((item) => item.entity === "connections" && item.imported >= 500));

    const meta = await destination.getBoardMeta("stream-source");
    assert.equal(meta.nodeCount, NODE_COUNT);
    assert.equal(meta.connectionCount, CONNECTION_COUNT);
    assert.equal(meta.migrationState, "active");
    assert.deepEqual(meta.viewport, { x: -900_000_000, y: 800_000_000, scale: 0.08 });
    const lastNodePage = await destination.exportBoardPage({
      boardId: "stream-source",
      entity: "nodes",
      cursor: String(NODE_COUNT - 1),
      limit: 10,
    });
    assert.equal(lastNodePage.items.at(-1).x, 1_000_000_000);
    assert.equal(lastNodePage.items.at(-1).y, -1_000_000_000);
    assert.deepEqual(lastNodePage.items.at(-1).futureField, { retained: true, version: 17 });
    const lastConnectionPage = await destination.exportBoardPage({
      boardId: "stream-source",
      entity: "connections",
      cursor: String(CONNECTION_COUNT - 1),
      limit: 10,
    });
    assert.deepEqual(lastConnectionPage.items.at(-1).futureEdgeField, { retained: true });

    const bytes = Buffer.concat(chunks);
    const cutoff = bytes.indexOf(Buffer.from('"connections":['));
    assert.ok(cutoff > 0);
    let interruptedError;
    try {
      await importCanvasStream({
        repository: destination,
        readable: Readable.from([bytes.subarray(0, cutoff)]),
        boardId: "interrupted-copy",
      });
    } catch (error) {
      interruptedError = error;
    }
    assert.equal(interruptedError?.code, "canvas_import_incomplete", interruptedError?.stack);
    const afterInterrupted = await destination.listBoards();
    assert.equal(afterInterrupted.some((board) => board.id === "interrupted-copy"), false);
    const interruptedMeta = await destination.getBoardMeta("interrupted-copy");
    assert.equal(interruptedMeta.migrationState, "failed");
    console.log("Canvas streaming export/import checks passed.");
  } finally {
    await Promise.allSettled([source.close(), destination.close()]);
    const resolved = path.resolve(root);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
