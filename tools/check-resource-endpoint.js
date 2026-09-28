"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function request(port, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && typeof body !== "string") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers, body });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, status: response.status, data, text };
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early.\n${diagnostics.join("")}`);
    try { return await request(port, "/api/auth/session"); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server.\n${diagnostics.join("")}`);
}

async function login(port, username, password) {
  const result = await request(port, "/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  assert.equal(result.status, 200, result.text);
  return result.response.headers.get("set-cookie").split(";", 1)[0];
}

function stopChild(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    timeout.unref?.();
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
    child.kill("SIGTERM");
  });
}

async function main() {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-resource-endpoint-"));
  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDirectory,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    await waitForServer(port, child, diagnostics);
    const publicReady = await request(port, "/api/system/ready");
    assert.equal(publicReady.status, 200, publicReady.text);
    assert.equal(publicReady.data.ok, true);
    assert.equal(publicReady.data.port, port);
    assert.ok(Array.isArray(publicReady.data.lanUrls));
    assert.equal(Object.hasOwn(publicReady.data, "database"), false, "startup readiness must stay independent of database integrity checks");
    const publicHealth = await request(port, "/api/system/health");
    assert.equal(publicHealth.status, 200, publicHealth.text);
    assert.equal(publicHealth.data.ok, true);
    assert.equal(publicHealth.data.dataDir, null);
    await request(port, "/api/auth/bootstrap", {
      method: "POST",
      body: { username: "admin", displayName: "管理员", password: "administrator password" },
    });
    const adminCookie = await login(port, "admin", "administrator password");
    const adminHeaders = { cookie: adminCookie };

    const privateHealth = await request(port, "/api/system/health", { headers: adminHeaders });
    assert.equal(privateHealth.status, 200, privateHealth.text);
    assert.equal(privateHealth.data.dataDir, dataDirectory);
    assert.ok(Array.isArray(privateHealth.data.lanUrls));

    const backup = await request(port, "/api/admin/backup", {
      method: "POST",
      headers: adminHeaders,
      body: { includeMedia: false },
    });
    assert.equal(backup.status, 201, backup.text);
    assert.ok(backup.data.snapshot.path);
    const backupStatus = await request(port, "/api/system/backup/status", { headers: adminHeaders });
    assert.equal(backupStatus.status, 200, backupStatus.text);
    assert.ok(backupStatus.data.snapshots.length >= 1);

    const createdUser = await request(port, "/api/admin/users", {
      method: "POST",
      headers: adminHeaders,
      body: { username: "bob", displayName: "Bob" },
    });
    assert.equal(createdUser.status, 201, createdUser.text);
    assert.equal(createdUser.data.user.role, "user");
    assert.equal(createdUser.data.user.mustChangePassword, true);
    assert.ok(createdUser.data.temporaryPassword.length >= 12);
    assert.doesNotMatch(createdUser.text, /passwordHash|password_hash/i);
    const bobId = createdUser.data.user.id;
    let bobCookie = await login(port, "bob", createdUser.data.temporaryPassword);

    const forcedPasswordGate = await request(port, "/api/users/directory", { headers: { cookie: bobCookie } });
    assert.equal(forcedPasswordGate.status, 403, forcedPasswordGate.text);
    assert.equal(forcedPasswordGate.data.code, "password_change_required");
    const changedPassword = await request(port, "/api/auth/change-password", {
      method: "POST",
      headers: { cookie: bobCookie },
      body: { currentPassword: createdUser.data.temporaryPassword, newPassword: "bob permanent password" },
    });
    assert.equal(changedPassword.status, 200, changedPassword.text);
    assert.equal(changedPassword.data.user.mustChangePassword, false);

    const directory = await request(port, "/api/users/directory", { headers: { cookie: bobCookie } });
    assert.equal(directory.status, 200, directory.text);
    assert.equal(directory.data.users.length, 2);
    assert.ok(directory.data.users.some((user) => user.id === bobId));
    assert.doesNotMatch(directory.text, /passwordHash|password_hash|mustChangePassword|lastLoginAt/i);

    const forbiddenAdmin = await request(port, "/api/admin/users", { headers: { cookie: bobCookie } });
    assert.equal(forbiddenAdmin.status, 403);
    const users = await request(port, "/api/admin/users", { headers: adminHeaders });
    assert.equal(users.status, 200, users.text);
    assert.equal(users.data.users.length, 2);
    assert.doesNotMatch(users.text, /passwordHash|password_hash/i);

    const bobOwnedResource = await request(port, "/api/resources", {
      method: "POST",
      headers: { cookie: bobCookie },
      body: { type: "canvas", title: "Bob board", refType: "canvas", refId: "bob-endpoint-board" },
    });
    assert.equal(bobOwnedResource.status, 201, bobOwnedResource.text);
    const adminDirectoryEntry = directory.data.users.find((user) => user.username === "admin");
    assert.ok(adminDirectoryEntry);
    assert.equal((await request(port, `/api/resources/${bobOwnedResource.data.resource.id}/shares`, {
      method: "POST",
      headers: { cookie: bobCookie },
      body: { visibility: "users", permission: "read", userIds: [adminDirectoryEntry.id] },
    })).status, 201);
    assert.equal((await request(port, `/api/resources/${bobOwnedResource.data.resource.id}`, { headers: adminHeaders })).status, 200);

    const createdResource = await request(port, "/api/resources", {
      method: "POST",
      headers: adminHeaders,
      body: { type: "canvas", title: "Private board", refType: "canvas", refId: "endpoint-board" },
    });
    assert.equal(createdResource.status, 201, createdResource.text);
    const resourceId = createdResource.data.resource.id;
    assert.equal((await request(port, `/api/resources/${resourceId}`, { headers: { cookie: bobCookie } })).status, 403);

    const publicShare = await request(port, `/api/resources/${resourceId}/shares`, {
      method: "POST",
      headers: adminHeaders,
      body: { visibility: "all", permission: "read" },
    });
    assert.equal(publicShare.status, 201, publicShare.text);
    assert.equal((await request(port, `/api/resources/${resourceId}`, { headers: { cookie: bobCookie } })).status, 200);
    assert.equal((await request(port, `/api/resources/${resourceId}`, {
      method: "PATCH",
      headers: { cookie: bobCookie },
      body: { title: "Bob must not rename" },
    })).status, 403);

    const editShare = await request(port, `/api/resources/${resourceId}/shares`, {
      method: "POST",
      headers: adminHeaders,
      body: { visibility: "users", permission: "edit", userIds: [bobId] },
    });
    assert.equal(editShare.status, 201, editShare.text);
    const renamed = await request(port, `/api/resources/${resourceId}`, {
      method: "PATCH",
      headers: { cookie: bobCookie },
      body: { title: "Shared board renamed" },
    });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(renamed.data.resource.title, "Shared board renamed");

    const passwordShare = await request(port, `/api/resources/${resourceId}/shares`, {
      method: "POST",
      headers: adminHeaders,
      body: { visibility: "password", permission: "read", password: "shared on lan" },
    });
    assert.equal(passwordShare.status, 201, passwordShare.text);
    const shareId = passwordShare.data.share.id;
    assert.equal((await request(port, `/api/resources/${resourceId}`, { headers: { cookie: bobCookie } })).status, 401);
    const lockedResources = await request(port, "/api/resources", { headers: { cookie: bobCookie } });
    assert.equal(lockedResources.status, 200, lockedResources.text);
    const lockedEntry = lockedResources.data.resources.find((entry) => entry.resource.id === resourceId);
    assert.equal(lockedEntry.access.locked, true);
    assert.equal(lockedEntry.access.share.id, shareId);
    assert.equal(lockedEntry.access.share.passwordProtected, true);
    assert.equal((await request(port, `/api/shares/${shareId}/unlock`, {
      method: "POST",
      headers: { cookie: bobCookie },
      body: { password: "shared on lan" },
    })).status, 200);
    assert.equal((await request(port, `/api/resources/${resourceId}`, { headers: { cookie: bobCookie } })).status, 200);
    const unlockedResources = await request(port, "/api/resources", { headers: { cookie: bobCookie } });
    assert.equal(unlockedResources.data.resources.find((entry) => entry.resource.id === resourceId).access.locked, false);
    assert.equal((await request(port, `/api/shares/${shareId}`, {
      method: "DELETE",
      headers: adminHeaders,
    })).status, 200);
    assert.equal((await request(port, `/api/resources/${resourceId}`, { headers: { cookie: bobCookie } })).status, 403);

    const adminHistoryRecord = { id: "admin-history-1", prompt: "Only the admin owns this image", url: "/output/example.png" };
    assert.equal((await request(port, "/api/history/images", {
      method: "POST",
      headers: adminHeaders,
      body: { record: adminHistoryRecord },
    })).status, 200);
    const bobHistory = await request(port, "/api/history/images", { headers: { cookie: bobCookie } });
    assert.equal(bobHistory.status, 200, bobHistory.text);
    assert.deepEqual(bobHistory.data.records, []);

    const createdCanvas = await request(port, "/api/canvas/boards", {
      method: "POST",
      headers: adminHeaders,
      body: { id: "admin-private-board", title: "Admin private board", viewport: { x: 0, y: 0, scale: 1 } },
    });
    assert.equal(createdCanvas.status, 201, createdCanvas.text);
    const bobPrivateBoards = await request(port, "/api/canvas/boards", { headers: { cookie: bobCookie } });
    assert.equal(bobPrivateBoards.status, 200, bobPrivateBoards.text);
    assert.equal(bobPrivateBoards.data.boards.some((board) => board.id === "admin-private-board"), false);
    const adminCanvasResources = await request(port, "/api/resources?type=canvas", { headers: adminHeaders });
    const canvasResource = adminCanvasResources.data.resources
      .map((entry) => entry.resource)
      .find((item) => item.refId === "admin-private-board");
    assert.ok(canvasResource);
    assert.equal((await request(port, `/api/resources/${canvasResource.id}/shares`, {
      method: "POST",
      headers: adminHeaders,
      body: { visibility: "users", permission: "read", userIds: [bobId] },
    })).status, 201);
    const bobSharedBoards = await request(port, "/api/canvas/boards", { headers: { cookie: bobCookie } });
    assert.equal(bobSharedBoards.data.boards.some((board) => board.id === "admin-private-board"), true);
    assert.equal((await request(port, "/api/canvas/boards/admin-private-board/operations", {
      method: "POST",
      headers: { cookie: bobCookie },
      body: { baseRevision: 0, operations: [] },
    })).status, 403);

    const reset = await request(port, `/api/admin/users/${bobId}/reset-password`, {
      method: "POST",
      headers: adminHeaders,
    });
    assert.equal(reset.status, 200, reset.text);
    assert.ok(reset.data.temporaryPassword);
    assert.equal((await request(port, "/api/auth/session", { headers: { cookie: bobCookie } })).status, 401);
    bobCookie = await login(port, "bob", reset.data.temporaryPassword);

    const disabled = await request(port, `/api/admin/users/${bobId}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: { status: "disabled" },
    });
    assert.equal(disabled.status, 200, disabled.text);
    assert.equal(disabled.data.user.status, "disabled");
    assert.equal((await request(port, "/api/auth/session", { headers: { cookie: bobCookie } })).status, 401);

    console.log("Resource endpoint checks passed.");
  } finally {
    await stopChild(child);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
