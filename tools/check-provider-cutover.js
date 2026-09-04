"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const RETIRED_ROUTES = [
  ["GET", "/api/settings/agent-candidates?refresh=1"],
  ["POST", "/api/settings/providers/key"],
  ["POST", "/api/settings/providers/models"],
  ["POST", "/api/settings/providers/runtime"],
  ["POST", "/api/settings/providers/agent-verify"],
  ["GET", "/api/settings/providers/monitoring"],
  ["POST", "/api/settings/providers/monitoring"],
  ["PUT", "/api/settings", { providers: [] }],
];

function sliceFunction(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Unable to inspect ${start}`);
  return source.slice(from, to);
}

function staticCutoverChecks() {
  const server = read("server.js");
  const browser = read("script.js");
  const providerApi = read("provider-http-api.js");
  const agentTurn = sliceFunction(server, "async function handleCanvasAgentTurn", "async function handleCanvasAgentCancel");
  const imageTurn = sliceFunction(server, "async function executeImageGenerationPayload", "function compactImageJobResponse");

  assert.doesNotMatch(server, /providerMonitoringStartupTimer\s*=\s*setTimeout/, "provider monitoring must not start with the host");
  assert.doesNotMatch(browser, /\binitializeSettingsCenter\(\);/, "retired API/Agent/monitoring settings must not initialize in the browser");
  assert.doesNotMatch(browser, /\bensureSettingsMarkup\(\);/, "retired settings markup must not be mounted");
  assert.match(server, /LEGACY_PROVIDER_ADMIN_PATHS/);
  assert.match(server, /provider_control_plane_retired/);
  assert.match(providerApi, /pathname === "\/api\/settings\/providers\/key"[\s\S]{0,180}authorize\(req\)/, "legacy key route must retain the superadmin role gate");
  assert.match(agentTurn, /canvasAgentProviderBridge\.runTurn/);
  assert.doesNotMatch(agentTurn, /runCanvasAgentCandidate|acquireCanvasAgentHalfOpenLease|ewma|circuit/i);
  assert.match(imageTurn, /mediaProviderBridge\.(?:editImage|generateImage)/);
  assert.doesNotMatch(imageTurn, /readSettingsFile|getSystemProviders|process\.env/);
  assert.doesNotMatch(sliceFunction(server, "function validateImageOutputRequest", "function getDefaultImageResolutionsForModel"), /readSettingsFile|getSystemProviders|resolveCustomModel|getImageModelPlatform|getImageModelFamily/);
  assert.match(sliceFunction(server, "function getPublicProviderModelCatalog", "function sendProviderModelCatalog"), /providerStore\.publicModelsForCapability/);
}

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
    if (child.exitCode !== null) throw new Error(`Server exited early (${child.exitCode}).\n${diagnostics.join("")}`);
    try { return await request(port, "/api/auth/session"); }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error(`Timed out waiting for cutover server.\n${diagnostics.join("")}`);
}

function cookieFrom(result) {
  return String(result.response.headers.get("set-cookie") || "").split(";", 1)[0];
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

async function httpCutoverChecks() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-provider-cutover-"));
  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_DATA_DIR: dataDir, AI_OS_SKIP_ENV_FILE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  try {
    await waitForServer(port, child, diagnostics);
    await request(port, "/api/auth/bootstrap", { method: "POST", body: { username: "admin", displayName: "Admin", password: "cutover administrator password" } });
    const adminLogin = await request(port, "/api/auth/login", { method: "POST", body: { username: "admin", password: "cutover administrator password" } });
    const adminCookie = cookieFrom(adminLogin);
    const created = await request(port, "/api/admin/users", { method: "POST", headers: { cookie: adminCookie }, body: { username: "user", displayName: "User" } });
    let userLogin = await request(port, "/api/auth/login", { method: "POST", body: { username: "user", password: created.data.temporaryPassword } });
    let userCookie = cookieFrom(userLogin);
    const changed = await request(port, "/api/auth/change-password", { method: "POST", headers: { cookie: userCookie }, body: { currentPassword: created.data.temporaryPassword, newPassword: "cutover ordinary password" } });
    userCookie = cookieFrom(changed) || userCookie;

    for (const [method, pathname, requestedBody] of RETIRED_ROUTES) {
      const body = requestedBody || (["POST", "PUT"].includes(method) ? {} : undefined);
      const ordinary = await request(port, pathname, { method, headers: { cookie: userCookie }, body });
      assert.equal(ordinary.status, 403, `ordinary ${method} ${pathname}: ${ordinary.status} ${ordinary.text}`);
      const admin = await request(port, pathname, { method, headers: { cookie: adminCookie }, body });
      assert.equal(admin.status, 410, `admin ${method} ${pathname}: ${admin.status} ${admin.text}`);
      assert.equal(admin.data.code, "provider_control_plane_retired");
    }
    const legacySettings = await request(port, "/api/settings", { headers: { cookie: adminCookie } });
    assert.equal(legacySettings.status, 200, legacySettings.text);
    assert.equal(Object.hasOwn(legacySettings.data, "providers"), false);
    assert.equal(Object.hasOwn(legacySettings.data, "agentRouting"), false);
  } finally {
    await stopChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

(async () => {
  staticCutoverChecks();
  await httpCutoverChecks();
  console.log("Provider cutover checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
