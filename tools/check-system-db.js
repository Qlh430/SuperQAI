"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSystemDb } = require("../system-db");

(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-system-db-"));
  const dbPath = path.join(root, "system.db");
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 8, 3, 4, 0, tick++));
  const db = createSystemDb({ dbPath, clock });

  try {
    assert.deepEqual(db.migrate(), { schemaVersion: 2 });
    assert.deepEqual(db.quickCheck(), { ok: true, result: "ok" });
    assert.equal(db.countUsers(), 0);

    const admin = db.insertUser({
      id: "admin-1",
      username: "SuperQ",
      displayName: "Super Q",
      role: "superadmin",
      passwordHash: "hash-admin",
      mustChangePassword: false,
    });
    const alice = db.insertUser({
      id: "user-a",
      username: "alice",
      displayName: "Alice",
      passwordHash: "hash-a",
      createdBy: admin.id,
    });
    const bob = db.insertUser({
      id: "user-b",
      username: "bob",
      displayName: "Bob",
      passwordHash: "hash-b",
      createdBy: admin.id,
    });

    assert.equal(db.countUsers(), 3);
    assert.equal(db.getUserByUsername("ALICE").id, alice.id, "username lookup must be case-insensitive");
    assert.equal(db.getUserById(bob.id).displayName, "Bob");
    assert.equal(db.listUsers().length, 3);
    assert.throws(
      () => db.insertUser({ username: "Alice", displayName: "Duplicate", passwordHash: "hash" }),
      (error) => error.code === "username_exists",
    );

    const disabled = db.updateUser(bob.id, { status: "disabled", displayName: "Bob Disabled" });
    assert.equal(disabled.status, "disabled");
    assert.equal(disabled.displayName, "Bob Disabled");

    const session = db.createSession({
      id: "session-a",
      userId: alice.id,
      tokenHash: "token-hash-a",
      expiresAt: "2026-09-04T04:00:00.000Z",
      userAgent: "test-agent",
      ipAddress: "192.168.1.20",
    });
    assert.equal(db.getSessionByTokenHash("token-hash-a").id, session.id);
    assert.equal(db.revokeSession(session.id), true);
    assert.ok(db.getSessionByTokenHash("token-hash-a").revokedAt);

    db.createSession({
      id: "session-b-1",
      userId: bob.id,
      tokenHash: "token-hash-b-1",
      expiresAt: "2026-09-04T04:00:00.000Z",
    });
    db.createSession({
      id: "session-b-2",
      userId: bob.id,
      tokenHash: "token-hash-b-2",
      expiresAt: "2026-09-04T04:00:00.000Z",
    });
    assert.equal(db.revokeUserSessions(bob.id), 2);

    const privateCanvas = db.registerResource({
      id: "resource-private",
      type: "canvas",
      ownerUserId: alice.id,
      title: "Alice private canvas",
      refType: "canvas",
      refId: "legacy-board-a",
      metadata: { revision: 1 },
    });
    const repeatedCanvas = db.registerResource({
      id: "ignored-id",
      type: "canvas",
      ownerUserId: alice.id,
      title: "Updated title",
      refType: "canvas",
      refId: "legacy-board-a",
      metadata: { revision: 2 },
    });
    assert.equal(repeatedCanvas.id, privateCanvas.id, "legacy resource registration must be idempotent");
    assert.equal(repeatedCanvas.title, "Updated title");
    assert.deepEqual(db.getResource(privateCanvas.id).metadata, { revision: 2 });
    assert.equal(db.listVisibleResources(alice.id, "canvas").length, 1);
    assert.equal(db.listVisibleResources(bob.id, "canvas").length, 0);

    const allResource = db.registerResource({
      id: "resource-all",
      type: "file",
      ownerUserId: alice.id,
      title: "Shared handbook",
    });
    db.createShare({
      id: "share-all",
      resourceId: allResource.id,
      createdBy: alice.id,
      visibility: "all",
      permission: "read",
    });
    assert.equal(db.listVisibleResources(bob.id, "file").length, 1);

    const memberResource = db.registerResource({
      id: "resource-members",
      type: "chat",
      ownerUserId: alice.id,
      title: "Project chat",
    });
    const memberShare = db.createShare({
      id: "share-members",
      resourceId: memberResource.id,
      createdBy: alice.id,
      visibility: "users",
      permission: "edit",
      userIds: [bob.id],
    });
    assert.deepEqual(db.getShare(memberShare.id).userIds, [bob.id]);
    assert.equal(db.getShareForResource(memberResource.id).id, memberShare.id);
    assert.equal(db.listVisibleResources(bob.id, "chat").length, 1);
    assert.equal(db.listVisibleResources(admin.id, "chat").length, 0);
    const updatedShare = db.updateShare(memberShare.id, {
      permission: "read",
      userIds: [admin.id, bob.id, bob.id],
    });
    assert.equal(updatedShare.permission, "read");
    assert.deepEqual(updatedShare.userIds, [admin.id, bob.id]);
    db.deleteShare(memberShare.id);
    assert.equal(db.listVisibleResources(bob.id, "chat").length, 0);

    const event = db.appendAudit({
      actorUserId: admin.id,
      action: "user.disabled",
      targetType: "user",
      targetId: bob.id,
      details: { reason: "test" },
    });
    assert.equal(db.listAudit({ limit: 10 })[0].id, event.id);
    assert.deepEqual(db.listAudit({ limit: 10 })[0].details, { reason: "test" });

    assert.equal(db.getSetting("lan.enabled"), null);
    db.setSetting("lan.enabled", true);
    assert.equal(db.getSetting("lan.enabled"), true);

    console.log("System database checks passed.");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
