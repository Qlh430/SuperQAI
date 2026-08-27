const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createCanvasRepository } = require("../canvas-repository");

function runDatabaseInspection(dbPath, source) {
  return JSON.parse(execFileSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "-e", source, dbPath],
    { encoding: "utf8", windowsHide: true, timeout: 10_000 },
  ));
}

async function removeTemporaryRoot(root) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-node-previews-"));
  const dbPath = path.join(root, "canvas.db");
  let repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
  try {
    assert.equal((await repository.ready()).schemaVersion, 4);
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
    const payloadBeforeBackfill = runDatabaseInspection(dbPath, `
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1]);
      const payload = db.prepare("SELECT external_id, payload_json FROM nodes ORDER BY pk").all();
      db.exec("DROP TABLE node_previews; PRAGMA user_version = 1;");
      db.close();
      process.stdout.write(JSON.stringify(payload));
    `);

    repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
    assert.equal((await repository.ready()).schemaVersion, 4);
    listed = await repository.listBoards();
    board = listed.find((item) => item.id === "preview-board");
    assert.deepEqual(board.previewImages, ["/second-saved.webp", "/first-thumb.webp"]);
    await repository.close();

    const backfilled = runDatabaseInspection(dbPath, `
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const value = {
        payload: db.prepare("SELECT external_id, payload_json FROM nodes ORDER BY pk").all(),
        previews: db.prepare("SELECT node_id, title FROM node_previews ORDER BY node_id").all(),
      };
      db.close();
      process.stdout.write(JSON.stringify(value));
    `);
    assert.deepEqual(backfilled.payload, payloadBeforeBackfill, "legacy preview backfill must not rewrite node payloads");
    assert.deepEqual(
      backfilled.previews,
      [
        { node_id: "gallery-1", title: "图集" },
        { node_id: "image-1", title: "图片" },
        { node_id: "text-1", title: "keep" },
      ],
    );
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
    await removeTemporaryRoot(root);
  }
  console.log("Canvas node preview repository checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
