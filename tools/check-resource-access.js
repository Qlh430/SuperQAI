"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { hashPassword } = require("../auth-crypto");
const { createResourceAccess } = require("../resource-access");
const { createSystemDb } = require("../system-db");

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error && error.code === code);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-acl-"));
  let nowMs = Date.parse("2026-09-03T03:00:00.000Z");
  const now = () => new Date(nowMs);
  const db = createSystemDb({ dbPath: path.join(directory, "system.sqlite"), clock: now });
  db.migrate();

  try {
    const passwordHash = await hashPassword("temporary user password");
    const owner = db.insertUser({ username: "owner", displayName: "Owner", passwordHash, mustChangePassword: false });
    const bob = db.insertUser({ username: "bob", displayName: "Bob", passwordHash, mustChangePassword: false });
    const charlie = db.insertUser({ username: "charlie", displayName: "Charlie", passwordHash, mustChangePassword: false });
    const access = createResourceAccess({ db, now, unlockTtlMs: 30_000 });
    const resource = await access.registerResource({
      type: "canvas",
      ownerUserId: owner.id,
      title: "Owner board",
      refType: "canvas",
      refId: "board-1",
    });

    const ownerRead = await access.assertRead(owner.id, resource.id);
    assert.equal(ownerRead.permission, "owner");
    assert.equal((await access.assertWrite(owner.id, resource.id)).resource.id, resource.id);
    await expectCode(() => access.assertRead(bob.id, resource.id), "forbidden");

    const allShare = await access.createShare(owner.id, resource.id, {
      visibility: "all",
      permission: "read",
    });
    assert.equal((await access.assertRead(bob.id, resource.id)).permission, "read");
    await expectCode(() => access.assertWrite(bob.id, resource.id), "forbidden");
    assert.ok((await access.listVisible(bob.id, "canvas")).some((item) => item.id === resource.id));
    // 所有者读自己的资源时也要带回这条共享：共享面板靠它回显可见范围和权限，
    // 给 null 会让面板每次都以“仅自己 + 只读”打开，一保存就把共享降级。
    const ownerView = await access.assertRead(owner.id, resource.id);
    assert.equal(ownerView.share?.visibility, "all", "所有者要能看到自己的共享可见范围");
    assert.equal(ownerView.share?.permission, "read", "所有者要能看到自己的共享权限");
    assert.equal(ownerView.permission, "owner", "所有者自己的权限仍是 owner");

    await access.createShare(owner.id, resource.id, {
      visibility: "users",
      permission: "edit",
      userIds: [bob.id],
    });
    assert.equal((await access.assertWrite(bob.id, resource.id)).permission, "edit");
    await expectCode(() => access.assertRead(charlie.id, resource.id), "forbidden");

    await access.createShare(owner.id, resource.id, {
      visibility: "all",
      permission: "copy",
    });
    assert.equal((await access.assertRead(bob.id, resource.id)).capabilities.copy, true);
    await expectCode(() => access.assertWrite(bob.id, resource.id), "forbidden");
    assert.equal((await access.assertWrite(bob.id, resource.id, { action: "copy" })).permission, "copy");

    const passwordShare = await access.createShare(owner.id, resource.id, {
      visibility: "password",
      permission: "read",
      password: "lan share secret",
    });
    assert.ok(passwordShare.passwordProtected);
    assert.equal(passwordShare.passwordHash, undefined);
    assert.notEqual(db.getShare(passwordShare.id).passwordHash, "lan share secret");
    assert.ok((await access.listVisible(bob.id)).some((item) => item.id === resource.id));
    await expectCode(() => access.assertRead(bob.id, resource.id), "share_password_required");
    await expectCode(() => access.unlockShare(bob.id, passwordShare.id, "wrong secret"), "invalid_share_password");
    assert.equal((await access.unlockShare(bob.id, passwordShare.id, "lan share secret")).resourceId, resource.id);
    assert.equal((await access.assertRead(bob.id, resource.id)).permission, "read");
    assert.ok((await access.listVisible(bob.id)).some((item) => item.id === resource.id));
    nowMs += 30_001;
    await expectCode(() => access.assertRead(bob.id, resource.id), "share_password_required");

    assert.equal(db.deleteShare(passwordShare.id), true);
    await expectCode(() => access.assertRead(bob.id, resource.id), "forbidden");

    await access.createShare(owner.id, resource.id, {
      visibility: "users",
      permission: "edit",
      userIds: [bob.id],
    });
    db.updateUser(bob.id, { status: "disabled" });
    await expectCode(() => access.assertRead(bob.id, resource.id), "not_authenticated");
    await expectCode(() => access.assertWrite(bob.id, resource.id), "not_authenticated");
    await expectCode(() => access.assertRead("missing-user", resource.id), "not_authenticated");
    await expectCode(() => access.assertRead(owner.id, "missing-resource"), "resource_not_found");

    console.log("Resource access checks passed.");
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
