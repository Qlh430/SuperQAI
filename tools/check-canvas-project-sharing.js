"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const sharingUi = fs.readFileSync(path.join(__dirname, "..", "account-management-ui.js"), "utf8");
assert.ok(sharingUi.includes("ai-os-canvas-sharing-changed"), "canvas sharing changes must refresh the canvas workspace");
assert.ok(sharingUi.includes('payload.visibility === "users" && !payload.userIds.length'), "specific-user sharing must require a selected user");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const headers = { ...(options.cookie ? { cookie: options.cookie } : {}) };
    if (body) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: options.method || "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => { let data = {}; try { data = JSON.parse(text || "{}"); } catch {} resolve({ status: res.statusCode, data, headers: res.headers }); });
    });
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-share-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_DATA_DIR: root, CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 100; i += 1) {
      try { if ((await requestJson(port, "/api/auth/session")).status === 401) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const bootstrap = await requestJson(port, "/api/auth/bootstrap", { method: "POST", body: { username: "share-admin", displayName: "共享管理员", password: "share-admin-password" } });
    assert.equal(bootstrap.status, 201, JSON.stringify(bootstrap.data));
    const adminLogin = await requestJson(port, "/api/auth/login", { method: "POST", body: { username: "share-admin", password: "share-admin-password" } });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.data));
    const adminCookie = String(adminLogin.headers["set-cookie"]?.[0] || "").split(";", 1)[0];
    assert.ok(adminCookie.startsWith("ai_os_session="));
    const user = await requestJson(port, "/api/admin/users", { method: "POST", cookie: adminCookie, body: { username: "share-user", displayName: "共享用户", password: "share-user-temporary-password" } });
    assert.equal(user.status, 201);
    const userLogin = await requestJson(port, "/api/auth/login", { method: "POST", body: { username: "share-user", password: "share-user-temporary-password" } });
    assert.equal(userLogin.status, 200, JSON.stringify(userLogin.data));
    const userCookie = String(userLogin.headers["set-cookie"]?.[0] || "").split(";", 1)[0];
    const passwordChanged = await requestJson(port, "/api/auth/change-password", { method: "POST", cookie: userCookie, body: { currentPassword: "share-user-temporary-password", newPassword: "share-user-password" } });
    assert.equal(passwordChanged.status, 200, JSON.stringify(passwordChanged.data));
    const created = await requestJson(port, "/api/canvas/boards", { method: "POST", cookie: adminCookie, body: { id: "share-board", title: "共享测试" } });
    assert.equal(created.status, 201);
    const resources = await requestJson(port, "/api/resources?type=canvas", { cookie: adminCookie });
    const resource = resources.data.resources.find((item) => item.resource.refId === "share-board");
    assert.ok(resource?.resource?.id);
    for (const visibility of ["private", "all", "users"]) {
      const response = await requestJson(port, `/api/resources/${encodeURIComponent(resource.resource.id)}/shares`, { method: "POST", cookie: adminCookie, body: { visibility, permission: "read", userIds: visibility === "users" ? [user.data.user.id] : [] } });
      assert.equal(response.status, 201, JSON.stringify(response.data));
      assert.equal(response.data.share.visibility, visibility);
      const sharedBoards = await requestJson(port, "/api/canvas/boards?scope=shared", { cookie: userCookie });
      assert.equal(sharedBoards.status, 200, JSON.stringify(sharedBoards.data));
      assert.equal(
        sharedBoards.data.boards.some((board) => board.id === "share-board"),
        visibility !== "private",
        `shared user visibility mismatch for ${visibility}`,
      );
    }
    const invalidMember = await requestJson(port, `/api/resources/${encodeURIComponent(resource.resource.id)}/shares`, {
      method: "POST",
      cookie: adminCookie,
      body: { visibility: "users", permission: "read", userIds: ["missing-user"] },
    });
    assert.equal(invalidMember.status, 400, JSON.stringify(invalidMember.data));
    assert.equal(invalidMember.data.code, "invalid_share_member");
    const afterInvalidMember = await requestJson(port, "/api/canvas/boards?scope=shared", { cookie: userCookie });
    assert.equal(afterInvalidMember.data.boards.some((board) => board.id === "share-board"), true, "invalid update must preserve the previous share");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("Canvas project sharing checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
