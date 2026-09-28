"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSystemDb } = require("../system-db");
const { createAuthService } = require("../auth-service");
const { createAuthHttpApi } = require("../auth-http-api");

function request(url, {
  method = "GET",
  cookie = "",
  body,
  remoteAddress = "127.0.0.1",
} = {}) {
  return {
    url,
    method,
    headers: {
      host: "localhost",
      cookie,
      "user-agent": "auth-http-api-check",
    },
    socket: { remoteAddress },
    body,
  };
}

function responseRecorder() {
  return {
    status: 0,
    body: null,
    headers: {},
    sendJson(_res, status, body, headers = {}) {
      this.status = status;
      this.body = body;
      this.headers = headers;
    },
  };
}

async function call(api, phase, req) {
  const response = responseRecorder();
  const handled = phase === "public"
    ? await api.publicHandle(req, response)
    : await api.handle(req, response);
  return { handled, response };
}

function cookieFrom(response) {
  return String(response.headers["Set-Cookie"] || "").split(";", 1)[0];
}

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-auth-http-api-"));
  const db = createSystemDb({
    dbPath: path.join(tempDirectory, "system.sqlite"),
  });
  db.migrate();

  try {
    const authService = createAuthService({ db, sessionTtlMs: 60_000 });
    const api = createAuthHttpApi({
      authService,
      systemDb: db,
      sessionTtlMs: 60_000,
      getAuthDisabledUser: () => null,
      readJson: async (req) => req.body || {},
      sendJson: (res, status, body, headers) => res.sendJson(res, status, body, headers),
    });

    assert.equal((await call(api, "public", request("/api/models"))).handled, false);
    assert.equal((await call(api, "handle", request("/api/models"))).handled, false);

    const anonymous = await call(api, "public", request("/api/auth/session"));
    assert.equal(anonymous.handled, true);
    assert.equal(anonymous.response.status, 401);
    assert.equal(anonymous.response.body.authenticated, false);
    assert.equal(anonymous.response.body.needsBootstrap, true);

    const remoteBootstrap = await call(api, "public", request("/api/auth/bootstrap", {
      method: "POST",
      remoteAddress: "192.168.1.50",
      body: { username: "Remote", password: "remote administrator password" },
    }));
    assert.equal(remoteBootstrap.response.status, 403);
    assert.equal(remoteBootstrap.response.body.code, "host_setup_required");

    const bootstrap = await call(api, "public", request("/api/auth/bootstrap", {
      method: "POST",
      body: {
        username: "SuperQ",
        displayName: "超级管理员",
        password: "host administrator password",
      },
    }));
    assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.response.body));
    assert.equal(bootstrap.response.body.user.role, "superadmin");
    const adminId = bootstrap.response.body.user.id;

    const adminLogin = await call(api, "public", request("/api/auth/login", {
      method: "POST",
      body: { username: "SuperQ", password: "host administrator password" },
      remoteAddress: "::ffff:127.0.0.1",
    }));
    assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.response.body));
    const adminCookie = cookieFrom(adminLogin.response);
    assert.match(adminCookie, /^ai_os_session=/);

    const adminSession = await call(api, "public", request("/api/auth/session", { cookie: adminCookie }));
    assert.equal(adminSession.response.status, 200);
    assert.equal(adminSession.response.body.authenticated, true);
    assert.equal(adminSession.response.body.user.id, adminId);

    const created = await call(api, "handle", request("/api/admin/users", {
      method: "POST",
      cookie: adminCookie,
      body: { username: "editor", displayName: "编辑" },
    }));
    assert.equal(created.response.status, 201, JSON.stringify(created.response.body));
    const memberId = created.response.body.user.id;
    const memberPassword = created.response.body.temporaryPassword;
    assert.ok(memberPassword && memberPassword.length >= 12);

    const directory = await call(api, "handle", request("/api/users/directory", {
      cookie: adminCookie,
    }));
    assert.equal(directory.response.status, 200);
    assert.deepEqual(
      directory.response.body.users.map((user) => user.username).sort(),
      ["SuperQ", "editor"],
    );

    const lastSuperAdmin = await call(api, "handle", request(`/api/admin/users/${encodeURIComponent(adminId)}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { status: "disabled" },
    }));
    assert.equal(lastSuperAdmin.response.status, 409);
    assert.equal(lastSuperAdmin.response.body.code, "last_superadmin");

    const memberLogin = await call(api, "public", request("/api/auth/login", {
      method: "POST",
      body: { username: "editor", password: memberPassword },
    }));
    assert.equal(memberLogin.response.status, 200);
    assert.equal(memberLogin.response.body.user.mustChangePassword, true);
    const firstMemberCookie = cookieFrom(memberLogin.response);

    const reset = await call(api, "handle", request(`/api/admin/users/${encodeURIComponent(memberId)}/reset-password`, {
      method: "POST",
      cookie: adminCookie,
    }));
    assert.equal(reset.response.status, 200, JSON.stringify(reset.response.body));
    const resetPassword = reset.response.body.temporaryPassword;
    assert.ok(resetPassword && resetPassword !== memberPassword);

    const revokedByReset = await call(api, "public", request("/api/auth/session", {
      cookie: firstMemberCookie,
    }));
    assert.equal(revokedByReset.response.status, 401);

    const resetLogin = await call(api, "public", request("/api/auth/login", {
      method: "POST",
      body: { username: "editor", password: resetPassword },
    }));
    assert.equal(resetLogin.response.status, 200);
    const resetCookie = cookieFrom(resetLogin.response);

    const revoke = await call(api, "handle", request(`/api/admin/users/${encodeURIComponent(memberId)}/revoke-sessions`, {
      method: "POST",
      cookie: adminCookie,
    }));
    assert.equal(revoke.response.status, 200);
    assert.ok(Number(revoke.response.body.revokedSessions) >= 1);
    assert.equal(
      (await call(api, "public", request("/api/auth/session", { cookie: resetCookie }))).response.status,
      401,
    );

    const changeLogin = await call(api, "public", request("/api/auth/login", {
      method: "POST",
      body: { username: "editor", password: resetPassword },
    }));
    assert.equal(changeLogin.response.status, 200);
    const changeCookie = cookieFrom(changeLogin.response);
    const changed = await call(api, "public", request("/api/auth/change-password", {
      method: "POST",
      cookie: changeCookie,
      body: {
        currentPassword: resetPassword,
        newPassword: "editor permanent password",
      },
    }));
    assert.equal(changed.response.status, 200);
    assert.equal(changed.response.body.user.mustChangePassword, false);

    const logout = await call(api, "public", request("/api/auth/logout", {
      method: "POST",
      cookie: changeCookie,
    }));
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers["Set-Cookie"], /Max-Age=0/);
    assert.equal(
      (await call(api, "public", request("/api/auth/session", { cookie: changeCookie }))).response.status,
      401,
    );

    const unknown = await call(api, "public", request("/api/auth/unknown"));
    assert.equal(unknown.handled, true);
    assert.equal(unknown.response.status, 404);

    console.log("Auth HTTP API checks passed.");
  } finally {
    db.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
