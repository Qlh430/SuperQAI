"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { hashPassword } = require("../auth-crypto");
const { createSystemDb } = require("../system-db");
const {
  SESSION_COOKIE_NAME,
  createAuthService,
  parseCookies,
  serializeSessionCookie,
} = require("../auth-service");

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error && error.code === code);
}

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-auth-"));
  let nowMs = Date.parse("2026-09-03T01:00:00.000Z");
  const now = () => new Date(nowMs);
  const db = createSystemDb({
    dbPath: path.join(tempDirectory, "system.sqlite"),
    clock: now,
  });
  db.migrate();

  try {
    const auth = createAuthService({ db, sessionTtlMs: 60_000, now });

    const admin = await auth.bootstrapSuperAdmin({
      username: "SuperQ",
      displayName: "超级管理员",
      password: "correct horse battery staple",
    });
    assert.equal(admin.role, "superadmin");
    assert.equal(admin.mustChangePassword, false);
    assert.equal(admin.passwordHash, undefined);
    await expectCode(
      () => auth.bootstrapSuperAdmin({ username: "root", password: "another password" }),
      "already_initialized",
    );

    await expectCode(
      () => auth.login({ username: "SuperQ", password: "wrong password" }),
      "invalid_credentials",
    );
    const firstLogin = await auth.login({
      username: "superq",
      password: "correct horse battery staple",
      userAgent: "auth-check",
      ipAddress: "192.168.1.20",
    });
    assert.match(firstLogin.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(firstLogin.auth.user.username, "SuperQ");
    assert.equal(firstLogin.auth.user.passwordHash, undefined);
    assert.equal((await auth.resolveSession(firstLogin.token)).sessionId, firstLogin.auth.sessionId);

    const alice = db.insertUser({
      username: "alice",
      displayName: "Alice",
      passwordHash: await hashPassword("alice temporary password"),
      status: "disabled",
      createdBy: admin.id,
    });
    await expectCode(
      () => auth.login({ username: alice.username, password: "alice temporary password" }),
      "account_disabled",
    );
    db.updateUser(alice.id, { status: "active" });

    const expiringLogin = await auth.login({
      username: alice.username,
      password: "alice temporary password",
    });
    nowMs += 60_001;
    assert.equal(await auth.resolveSession(expiringLogin.token), null);

    nowMs += 1_000;
    const logoutLogin = await auth.login({
      username: alice.username,
      password: "alice temporary password",
    });
    assert.equal(await auth.logout(logoutLogin.token), true);
    assert.equal(await auth.resolveSession(logoutLogin.token), null);
    assert.equal(await auth.logout("not-a-session"), false);

    const currentLogin = await auth.login({
      username: alice.username,
      password: "alice temporary password",
    });
    const otherLogin = await auth.login({
      username: alice.username,
      password: "alice temporary password",
    });
    const changed = await auth.changePassword({
      token: currentLogin.token,
      currentPassword: "alice temporary password",
      newPassword: "alice permanent password",
    });
    assert.equal(changed.auth.user.mustChangePassword, false);
    assert.ok(await auth.resolveSession(currentLogin.token));
    assert.equal(await auth.resolveSession(otherLogin.token), null);
    await expectCode(
      () => auth.login({ username: alice.username, password: "alice temporary password" }),
      "invalid_credentials",
    );
    assert.ok(await auth.login({ username: alice.username, password: "alice permanent password" }));
    assert.throws(() => auth.requireRole(changed.auth, "superadmin"), (error) => error.code === "forbidden");
    assert.equal(auth.requireRole(firstLogin.auth, "superadmin").user.id, admin.id);

    const cookies = parseCookies("theme=light; ai_os_session=abc%20123; malformed; empty=");
    assert.deepEqual(cookies, {
      theme: "light",
      ai_os_session: "abc 123",
      empty: "",
    });
    const sessionCookie = serializeSessionCookie("abc 123", 120);
    assert.match(sessionCookie, new RegExp(`^${SESSION_COOKIE_NAME}=abc%20123;`));
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Lax/);
    assert.match(sessionCookie, /Path=\//);
    assert.match(sessionCookie, /Max-Age=120/);
    assert.doesNotMatch(sessionCookie, /Secure/);
    assert.match(serializeSessionCookie("", 0), /Max-Age=0/);

    console.log("Auth service checks passed.");
  } finally {
    db.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
