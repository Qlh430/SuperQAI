"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSystemDb } = require("../system-db");
const { createResourceAccess } = require("../resource-access");
const { createCanvasProjectService } = require("../canvas-project-service");
const { createAssetLibraryService, detectAssetKind } = require("../asset-library-service");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-asset-service-"));
  const db = createSystemDb({ dbPath: path.join(root, "system.sqlite") });
  db.migrate();
  try {
    const admin = db.insertUser({ id: "admin", username: "admin", displayName: "管理员", role: "superadmin", passwordHash: "hash", mustChangePassword: false });
    const alice = db.insertUser({ id: "alice", username: "alice", displayName: "Alice", passwordHash: "hash", createdBy: admin.id, mustChangePassword: false });
    const bob = db.insertUser({ id: "bob", username: "bob", displayName: "Bob", passwordHash: "hash", createdBy: admin.id, mustChangePassword: false });
    const carol = db.insertUser({ id: "carol", username: "carol", displayName: "Carol", passwordHash: "hash", createdBy: admin.id, mustChangePassword: false });
    const aliceProject = db.createCanvasProject({ id: "alice-project", ownerUserId: alice.id, name: "Alice 项目" });
    const bobProject = db.createCanvasProject({ id: "bob-project", ownerUserId: bob.id, name: "Bob 项目" });
    const privateImage = db.registerResource({ id: "private-image", type: "image", ownerUserId: alice.id, title: "私有主图.png", refType: "output_media", refId: "/output/private.png", metadata: { url: "/output/private.png", mimeType: "image/png" } });
    const publicVideo = db.registerResource({ id: "public-video", type: "video", ownerUserId: alice.id, title: "精选视频.mp4", refType: "output_media", refId: "/output/public.mp4", metadata: { url: "/output/public.mp4", mimeType: "video/mp4" } });
    const usersAudio = db.registerResource({ id: "users-audio", type: "file", ownerUserId: alice.id, title: "配乐.mp3", refType: "output_media", refId: "/output/music.mp3", metadata: { url: "/output/music.mp3", mimeType: "audio/mpeg" } });
    const bobImage = db.registerResource({ id: "bob-image", type: "image", ownerUserId: bob.id, title: "Bob 素材.png", refType: "output_media", refId: "/output/bob.png", metadata: { url: "/output/bob.png", mimeType: "image/png" } });
    await createResourceAccess({ db }).createShare(alice.id, publicVideo.id, { visibility: "all", permission: "read" });
    const resourceAccess = createResourceAccess({ db });
    await resourceAccess.createShare(alice.id, usersAudio.id, { visibility: "users", permission: "read", userIds: [bob.id] });
    db.linkAssetProject({ resourceId: privateImage.id, projectId: aliceProject.id, boardId: "alice-board" });
    db.linkAssetProject({ resourceId: bobImage.id, projectId: bobProject.id, boardId: "bob-board" });
    const service = createAssetLibraryService({ db, resourceAccess, projectService: createCanvasProjectService({ db }) });

    assert.equal(detectAssetKind(usersAudio), "audio", "legacy file resources use their audio MIME type");
    assert.deepEqual((await service.listAssets(alice.id, { scope: "mine" })).items.map((item) => item.id).sort(), [privateImage.id, publicVideo.id, usersAudio.id].sort());
    assert.deepEqual((await service.listAssets(alice.id, { scope: "project", projectId: aliceProject.id })).items.map((item) => item.id), [privateImage.id]);
    assert.deepEqual((await service.listAssets(bob.id, { scope: "public" })).items.map((item) => item.id), [publicVideo.id]);
    assert.deepEqual((await service.listAssets(bob.id, { scope: "shared" })).items.map((item) => item.id), [usersAudio.id]);
    assert.deepEqual((await service.listAssets(carol.id, { scope: "shared" })).items, []);
    assert.equal((await service.listAssets(bob.id, { scope: "shared", kind: "audio", search: "配乐" })).items[0].kind, "audio");
    await assert.rejects(() => service.getAsset(bob.id, privateImage.id), (error) => error.code === "forbidden");

    await service.setFavorite(bob.id, publicVideo.id, true);
    assert.deepEqual((await service.listAssets(bob.id, { scope: "favorites" })).items.map((item) => item.id), [publicVideo.id]);
    const liked = await service.setLike(bob.id, publicVideo.id, true);
    assert.equal(liked.liked, true);
    assert.equal(liked.likeCount, 1);
    await service.setLike(bob.id, publicVideo.id, true);
    assert.equal((await service.getAsset(alice.id, publicVideo.id)).likeCount, 1, "repeated likes must not duplicate counts");
    await assert.rejects(() => service.setLike(bob.id, usersAudio.id, true), (error) => error.code === "asset_not_public");

    await service.recordUse(bob.id, publicVideo.id, { projectId: bobProject.id, boardId: "bob-board" });
    assert.deepEqual((await service.listAssets(bob.id, { scope: "project", projectId: bobProject.id })).items.map((item) => item.id).sort(), [bobImage.id, publicVideo.id].sort());
    await assert.rejects(() => service.recordUse(bob.id, publicVideo.id, { projectId: aliceProject.id, boardId: "forbidden" }), (error) => error.code === "canvas_project_forbidden");

    const specified = await service.setShare(alice.id, publicVideo.id, { visibility: "users", userIds: [bob.id] });
    assert.equal(specified.visibility, "users");
    assert.deepEqual((await service.listAssets(carol.id, { scope: "public" })).items, []);
    assert.deepEqual((await service.listAssets(bob.id, { scope: "shared" })).items.map((item) => item.id).sort(), [publicVideo.id, usersAudio.id].sort());
    await service.setShare(alice.id, publicVideo.id, { visibility: "all" });
    const unpublished = await service.setShare(admin.id, publicVideo.id, { visibility: "private" });
    assert.equal(unpublished.visibility, "private", "superadmin may unpublish public curation");
    await assert.rejects(() => service.setShare(bob.id, usersAudio.id, { visibility: "all" }), (error) => error.code === "forbidden");

    console.log("Asset library service checks passed.");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
