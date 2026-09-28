"use strict";

/**
 * 账户管理里的三个按钮（重置密码 / 退出所有设备 / 停用账号）是不是真的生效，
 * 用隔离的数据目录起一个真服务端，逐条验证落在服务端上的行为：
 *   重置密码     -> 旧密码失效、临时密码可登录、mustChangePassword=true、旧会话被踢
 *   退出所有设备 -> 该账号的在线会话立即 401
 *   停用 / 恢复  -> 停用后登录被拒，恢复后能重新登录；最后一位超管不允许停用
 *   显示名称     -> 可以改，空名称被拒，改动写进审计
 */

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const ADMIN = { username: "SuperQ", displayName: "超级管理员", password: "host administrator password" };
const MEMBER = { username: "321", displayName: "321" };

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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const setCookie = response.headers.get("set-cookie");
  return { response, status: response.status, data, text, cookie: setCookie ? setCookie.split(";", 1)[0] : "" };
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early (${child.exitCode}).\n${diagnostics.join("")}`);
    try {
      return await request(port, "/api/auth/session");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for auth server.\n${diagnostics.join("")}`);
}

function stopChild(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve();
    }, 5_000);
    timeout.unref?.();
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function readAuditActions(databaseFile) {
  const database = new DatabaseSync(databaseFile);
  try {
    return database.prepare("SELECT action FROM audit_events").all().map((row) => row.action);
  } finally {
    database.close();
  }
}

async function main() {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-account-actions-"));
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

  const login = (username, password) => request(port, "/api/auth/login", { method: "POST", body: { username, password } });

  try {
    const initial = await waitForServer(port, child, diagnostics);
    assert.equal(initial.status, 401);
    assert.equal(initial.data.needsBootstrap, true);

    const bootstrap = await request(port, "/api/auth/bootstrap", { method: "POST", body: ADMIN });
    assert.equal(bootstrap.status, 201, bootstrap.text);
    const adminLogin = await login(ADMIN.username, ADMIN.password);
    assert.equal(adminLogin.status, 200, adminLogin.text);
    const adminCookie = adminLogin.cookie;

    // 1) 新建普通账号：界面上"分配一个新账号"走的就是这次调用。
    const created = await request(port, "/api/admin/users", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: MEMBER,
    });
    assert.equal(created.status, 201, created.text);
    const memberId = created.data.user.id;
    const firstPassword = created.data.temporaryPassword;
    assert.ok(firstPassword && firstPassword.length >= 12, "新建账号要返回一次性临时密码");

    const memberLogin = await login(MEMBER.username, firstPassword);
    assert.equal(memberLogin.status, 200, memberLogin.text);
    assert.equal(memberLogin.data.user.mustChangePassword, true, "临时密码登录后必须先改密");
    const memberCookie = memberLogin.cookie;
    const blocked = await request(port, "/api/resources", { headers: { cookie: memberCookie } });
    assert.equal(blocked.status, 403, "没改临时密码前不能使用业务接口");
    assert.equal(blocked.data.code, "password_change_required");
    const changed = await request(port, "/api/auth/change-password", {
      method: "POST",
      headers: { cookie: memberCookie },
      body: { currentPassword: firstPassword, newPassword: "member permanent password" },
    });
    assert.equal(changed.status, 200, changed.text);
    assert.equal(changed.data.user.mustChangePassword, false);
    assert.equal((await request(port, "/api/resources", { headers: { cookie: memberCookie } })).status, 200);

    // 2) 显示名称可改。
    const renamed = await request(port, `/api/admin/users/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: { cookie: adminCookie },
      body: { displayName: "张三" },
    });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(renamed.data.user.displayName, "张三");
    const usersAfterRename = await request(port, "/api/admin/users", { headers: { cookie: adminCookie } });
    assert.equal(usersAfterRename.data.users.find((user) => user.id === memberId).displayName, "张三");
    const blankName = await request(port, `/api/admin/users/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: { cookie: adminCookie },
      body: { displayName: "   " },
    });
    assert.ok(blankName.status >= 400, "空白显示名称必须被拒绝");

    // 3) 重置密码：旧密码失效、新临时密码可登录、旧会话掉线。
    const reset = await request(port, `/api/admin/users/${encodeURIComponent(memberId)}/reset-password`, {
      method: "POST",
      headers: { cookie: adminCookie },
    });
    assert.equal(reset.status, 200, reset.text);
    const secondPassword = reset.data.temporaryPassword;
    assert.ok(secondPassword && secondPassword !== firstPassword, "重置后要换一个临时密码");
    assert.equal((await login(MEMBER.username, "member permanent password")).status, 401, "旧密码必须立即失效");
    const resetLogin = await login(MEMBER.username, secondPassword);
    assert.equal(resetLogin.status, 200, resetLogin.text);
    assert.equal(resetLogin.data.user.mustChangePassword, true);
    assert.equal(
      (await request(port, "/api/auth/session", { headers: { cookie: memberCookie } })).status,
      401,
      "重置密码要退出该账号其它设备",
    );

    // 4) 退出所有设备：在线会话立即失效。
    const revoke = await request(port, `/api/admin/users/${encodeURIComponent(memberId)}/revoke-sessions`, {
      method: "POST",
      headers: { cookie: adminCookie },
    });
    assert.equal(revoke.status, 200, revoke.text);
    assert.ok(Number(revoke.data.revokedSessions) >= 1, "至少要踢掉一条在线会话");
    assert.equal((await request(port, "/api/auth/session", { headers: { cookie: resetLogin.cookie } })).status, 401);

    // 5) 停用 / 恢复账号。
    const disabled = await request(port, `/api/admin/users/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: { cookie: adminCookie },
      body: { status: "disabled" },
    });
    assert.equal(disabled.status, 200, disabled.text);
    assert.equal(disabled.data.user.status, "disabled");
    const disabledLogin = await login(MEMBER.username, secondPassword);
    assert.equal(disabledLogin.status, 403, disabledLogin.text);
    assert.equal(disabledLogin.data.code, "account_disabled");

    const restored = await request(port, `/api/admin/users/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: { cookie: adminCookie },
      body: { status: "active" },
    });
    assert.equal(restored.status, 200, restored.text);
    assert.equal(restored.data.user.status, "active");
    assert.equal((await login(MEMBER.username, secondPassword)).status, 200, "恢复后应能重新登录");

    // 6) 最后一位超级管理员不能被停用。
    const superAdmin = (await request(port, "/api/admin/users", { headers: { cookie: adminCookie } })).data.users
      .find((user) => user.role === "superadmin");
    const lastOne = await request(port, `/api/admin/users/${encodeURIComponent(superAdmin.id)}`, {
      method: "PATCH",
      headers: { cookie: adminCookie },
      body: { status: "disabled" },
    });
    assert.equal(lastOne.status, 409, lastOne.text);
    assert.equal(lastOne.data.code, "last_superadmin");

    // 7) 这些操作都写审计。
    const actions = readAuditActions(path.join(dataDirectory, "system.sqlite"));
    for (const action of ["admin.password_reset", "admin.sessions_revoked", "admin.user_updated"]) {
      assert.ok(actions.includes(action), `审计日志缺少 ${action}`);
    }

    console.log("Account admin action checks passed.");
  } finally {
    await stopChild(child);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
