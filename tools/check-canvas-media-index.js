"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createCanvasRepository } = require("../canvas-repository");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-media-index-"));
  const dbPath = path.join(root, "canvas.db");
  let repo = createCanvasRepository({ dbPath });
  try {
    await repo.createBoard({ id: "legacy-gallery", title: "Old gallery" });
    const source = "/output/旧图%20%231.png";
    const gallery = { id: "gallery", kind: "gallery-container", galleryImages: JSON.stringify([{ src: source }, { savedUrl: "/output/other.png" }]) };
    await repo.applyOperations({ boardId: "legacy-gallery", baseRevision: 0, operations: [{ operationId: "add", type: "node.upsert", entityId: "gallery", after: gallery }] });
    assert.deepEqual(await repo.invoke("boardsReferencingMedia", { source }), [{ id: "legacy-gallery" }]);
    await repo.close();
    const old = new DatabaseSync(dbPath);
    // Simulate a pre-index database containing real node payloads.
    old.exec("DELETE FROM media_refs; DROP TABLE node_media_index_state;");
    old.close();
    repo = createCanvasRepository({ dbPath });
    assert.deepEqual(await repo.invoke("boardsReferencingMedia", { source }), [{ id: "legacy-gallery" }], "existing galleries are indexed on reopen");
    assert.deepEqual(await repo.invoke("boardsReferencingMedia", { source: "/output/other.png" }), [{ id: "legacy-gallery" }]);
    await repo.applyOperations({ boardId: "legacy-gallery", baseRevision: 1, operations: [{ operationId: "remove-one", type: "node.upsert", entityId: "gallery", after: { ...gallery, galleryImages: [{ src: source }] } }] });
    assert.deepEqual(await repo.invoke("boardsReferencingMedia", { source: "/output/other.png" }), [], "replacing a gallery removes stale access references");
    await repo.setBoardTrashState({ boardId: "legacy-gallery", operationId: "trash", trashed: true });
    assert.deepEqual(await repo.invoke("boardsReferencingMedia", { source }), [], "trashed canvases confer no image access");
    console.log("Canvas media index upgrade, update and revocation checks passed.");
  } finally {
    await repo.close();
    assert.ok(path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
