"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSystemDb } = require("../system-db");

(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-asset-db-"));
  let tick = 0;
  const db = createSystemDb({
    dbPath: path.join(root, "system.sqlite"),
    clock: () => new Date(Date.UTC(2026, 8, 5, 8, 0, tick++)),
  });

  try {
    assert.deepEqual(db.migrate(), { schemaVersion: 4 });
    const admin = db.insertUser({
      id: "asset-admin",
      username: "asset-admin",
      displayName: "资产管理员",
      role: "superadmin",
      passwordHash: "hash-admin",
      mustChangePassword: false,
    });
    const alice = db.insertUser({
      id: "asset-alice",
      username: "asset-alice",
      displayName: "Alice",
      passwordHash: "hash-alice",
      createdBy: admin.id,
      mustChangePassword: false,
    });
    const bob = db.insertUser({
      id: "asset-bob",
      username: "asset-bob",
      displayName: "Bob",
      passwordHash: "hash-bob",
      createdBy: admin.id,
      mustChangePassword: false,
    });
    const project = db.createCanvasProject({ id: "asset-project", ownerUserId: alice.id, name: "产品图" });
    const image = db.registerResource({
      id: "asset-image",
      type: "image",
      ownerUserId: alice.id,
      workspaceId: project.id,
      title: "hero.png",
      refType: "output_media",
      refId: "/output/hero.png",
      metadata: { url: "/output/hero.png", mimeType: "image/png" },
    });

    const firstLink = db.linkAssetProject({ resourceId: image.id, projectId: project.id, boardId: "board-a" });
    const repeatedLink = db.linkAssetProject({ resourceId: image.id, projectId: project.id, boardId: "board-a" });
    assert.equal(firstLink.createdAt, repeatedLink.createdAt, "re-linking must preserve the original creation time");
    assert.notEqual(firstLink.lastUsedAt, repeatedLink.lastUsedAt, "re-linking must refresh last-used time");
    assert.deepEqual(db.listAssetProjectLinks(image.id).map((link) => ({
      resourceId: link.resourceId,
      projectId: link.projectId,
      boardId: link.boardId,
    })), [{ resourceId: image.id, projectId: project.id, boardId: "board-a" }]);

    db.setAssetLike(alice.id, image.id, true);
    db.setAssetLike(alice.id, image.id, true);
    db.setAssetFavorite(bob.id, image.id, true);
    db.setAssetFavorite(bob.id, image.id, true);
    assert.deepEqual(db.getAssetEngagement(image.id, alice.id), {
      likeCount: 1,
      liked: true,
      favorited: false,
    });
    assert.deepEqual(db.getAssetEngagement(image.id, bob.id), {
      likeCount: 1,
      liked: false,
      favorited: true,
    });
    assert.deepEqual(db.listFavoriteResourceIds(bob.id), [image.id]);

    db.setAssetLike(alice.id, image.id, false);
    db.setAssetLike(alice.id, image.id, false);
    db.setAssetFavorite(bob.id, image.id, false);
    db.setAssetFavorite(bob.id, image.id, false);
    assert.deepEqual(db.getAssetEngagement(image.id, bob.id), {
      likeCount: 0,
      liked: false,
      favorited: false,
    });
    assert.deepEqual(db.listFavoriteResourceIds(bob.id), []);
    assert.deepEqual(db.quickCheck(), { ok: true, result: "ok" });
    console.log("Asset library database checks passed.");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
