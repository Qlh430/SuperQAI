const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createCanvasRepository } = require("../canvas-repository");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-node-previews-"));
  const dbPath = path.join(root, "canvas.db");
  let repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
  try {
    assert.equal((await repository.ready()).schemaVersion, 2);
    await repository.createBoard({ id: "preview-board", title: "Preview Board" });
    await repository.applyOperations({
      boardId: "preview-board",
      baseRevision: 0,
      operations: [
        {
          operationId: "preview-1",
          type: "node.upsert",
          entityId: "image-1",
          after: {
            id: "image-1", kind: "image", x: 0, y: 0, width: 320, height: 240,
            thumbnailSrc: "/first-thumb.webp", imageSrc: "/first-original.png",
          },
        },
        {
          operationId: "preview-2",
          type: "node.upsert",
          entityId: "gallery-1",
          after: {
            id: "gallery-1", kind: "gallery", x: 400, y: 0, width: 420, height: 360,
            galleryImages: [{ savedUrl: "/second-saved.webp" }], zOrder: 9,
          },
        },
        {
          operationId: "preview-none",
          type: "node.upsert",
          entityId: "text-1",
          after: { id: "text-1", kind: "text", x: 900, y: 0, width: 292, height: 180, text: "keep" },
        },
      ],
    });

    let listed = await repository.listBoards();
    let board = listed.find((item) => item.id === "preview-board");
    assert.deepEqual(board.previewImages, ["/second-saved.webp", "/first-thumb.webp"]);
    assert.equal(Object.hasOwn(board, "nodes"), false);

    await repository.close();
    const legacyDb = new DatabaseSync(dbPath);
    const payloadBeforeBackfill = legacyDb
      .prepare("SELECT external_id, payload_json FROM nodes ORDER BY pk")
      .all();
    legacyDb.exec("DROP TABLE node_previews; PRAGMA user_version = 1;");
    legacyDb.close();

    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
    assert.equal((await repository.ready()).schemaVersion, 2);
    listed = await repository.listBoards();
    board = listed.find((item) => item.id === "preview-board");
    assert.deepEqual(board.previewImages, ["/second-saved.webp", "/first-thumb.webp"]);
    await repository.close();

    const backfilledDb = new DatabaseSync(dbPath, { readOnly: true });
    const payloadAfterBackfill = backfilledDb
      .prepare("SELECT external_id, payload_json FROM nodes ORDER BY pk")
      .all();
    assert.deepEqual(payloadAfterBackfill, payloadBeforeBackfill, "legacy preview backfill must not rewrite node payloads");
    backfilledDb.close();

    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
    await repository.ready();

    await repository.applyOperations({
      boardId: "preview-board",
      baseRevision: 1,
      operations: [{
        operationId: "delete-gallery-preview",
        type: "node.delete",
        entityId: "gallery-1",
        before: { id: "gallery-1" },
      }],
    });
    board = (await repository.listBoards()).find((item) => item.id === "preview-board");
    assert.deepEqual(board.previewImages, ["/first-thumb.webp"]);
  } finally {
    await repository.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("Canvas node preview repository checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
