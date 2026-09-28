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
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers,
    body,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, status: response.status, data, text };
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (${child.exitCode}).\n${diagnostics.join("")}`);
    }
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

async function main() {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-auth-endpoint-"));
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
    const initial = await waitForServer(port, child, diagnostics);
    assert.equal(initial.status, 401);
    assert.equal(initial.data.authenticated, false);
    assert.equal(initial.data.needsBootstrap, true);

    const bootstrap = await request(port, "/api/auth/bootstrap", {
      method: "POST",
      body: {
        username: "SuperQ",
        displayName: "超级管理员",
        password: "host administrator password",
      },
    });
    assert.equal(bootstrap.status, 201, bootstrap.text);
    assert.equal(bootstrap.data.user.role, "superadmin");
    assert.equal(bootstrap.data.user.passwordHash, undefined);
    assert.equal((await request(port, "/api/auth/bootstrap", {
      method: "POST",
      body: { username: "root", password: "another administrator password" },
    })).status, 409);

    const anonymousModels = await request(port, "/api/models");
    assert.equal(anonymousModels.status, 401);

    const wrong = await request(port, "/api/auth/login", {
      method: "POST",
      body: { username: "SuperQ", password: "wrong password" },
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.code, "invalid_credentials");
    assert.doesNotMatch(wrong.text, /passwordHash|password_hash|host administrator password/i);

    const login = await request(port, "/api/auth/login", {
      method: "POST",
      body: { username: "superq", password: "host administrator password" },
    });
    assert.equal(login.status, 200, login.text);
    const setCookie = login.response.headers.get("set-cookie");
    assert.ok(setCookie && setCookie.startsWith("ai_os_session="));
    assert.doesNotMatch(login.text, /passwordHash|password_hash|host administrator password/i);
    const cookie = setCookie.split(";", 1)[0];

    const session = await request(port, "/api/auth/session", {
      headers: { cookie },
    });
    assert.equal(session.status, 200, session.text);
    assert.equal(session.data.authenticated, true);
    assert.equal(session.data.user.username, "SuperQ");

    const authenticatedModels = await request(port, "/api/models", {
      headers: { cookie },
    });
    assert.equal(authenticatedModels.status, 200, authenticatedModels.text);

    const logout = await request(port, "/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(logout.status, 200, logout.text);
    assert.match(logout.response.headers.get("set-cookie") || "", /Max-Age=0/);

    const oldSession = await request(port, "/api/auth/session", {
      headers: { cookie },
    });
    assert.equal(oldSession.status, 401);
    assert.equal(oldSession.data.needsBootstrap, false);
    console.log("Auth endpoint checks passed.");
  } finally {
    await stopChild(child);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
