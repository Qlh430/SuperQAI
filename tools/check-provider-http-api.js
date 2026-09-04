"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createProviderHttpApi } = require("../provider-http-api");

const SECRET = "sk-private-provider-key";
const LEGACY_SECRET = "sk-legacy-provider-key";
const ordinaryUser = { id: "user-1", role: "user", username: "alice" };
const superadmin = { id: "admin-1", role: "superadmin", username: "root" };
const ROOT = path.resolve(__dirname, "..");

function authError(code, message, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}

function publicProvider() {
  return {
    id: "provider-1",
    name: "Provider One",
    baseUrl: "https://provider.example/v1",
    protocol: "openai",
    enabled: true,
    hasApiKey: true,
    apiKeyMasked: "sk-p••••-key",
    models: [{ id: "model-1", protocol: "openai", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools", "image.generate", "video.generate", "audio.generate"] }],
  };
}

function createFixture() {
  const audits = [];
  let catalogChanges = 0;
  let autoFallback = true;
  const store = {
    listPublic: () => [publicProvider()],
    getPublic: (id) => id === "provider-1" ? publicProvider() : null,
    reveal: (id) => {
      if (id !== "provider-1") throw Object.assign(new Error("not found"), { code: "provider_not_found" });
      return { ...publicProvider(), apiKey: SECRET, walletKey: "", models: publicProvider().models };
    },
    save: (body) => ({ ...publicProvider(), id: body.id, name: body.name, apiKeyMasked: "sk-p••••-key" }),
    setEnabled: (_id, enabled) => ({ ...publicProvider(), enabled }),
    remove: () => true,
    reorderProviders: () => [publicProvider()],
    reorderModels: () => publicProvider(),
    getAutoFallback: () => autoFallback,
    setAutoFallback: (enabled) => (autoFallback = Boolean(enabled)),
  };
  const registry = {
    listPublic: () => [{ id: "openai", label: "OpenAI 兼容", capabilities: ["llm"] }],
    candidatesForBaseUrl: () => ["openai"],
    inferModelProtocol: () => "openai",
  };
  const engine = {
    verifyProtocol: async () => ({ selectedProtocol: "openai", models: ["model-1"], diagnostic: SECRET }),
    fetchModels: async () => ["model-1", "model-2"],
    execute: async (_provider, _model, intent) => ({ text: `${intent}:ok`, usage: null, debug: SECRET }),
  };
  const api = createProviderHttpApi({
    store,
    registry,
    engine,
    requireSignedIn: async (req) => {
      if (!req.auth?.user) throw authError("unauthorized", "Authentication required", 401);
      return req.auth;
    },
    requireRole: async (auth, role) => {
      if (auth.user.role !== role) throw authError("forbidden", "Forbidden", 403);
      return auth;
    },
    readJson: async (req) => req.body || {},
    sendJson: (res, status, body) => {
      res.status = status;
      res.body = body;
    },
    appendAudit: (entry) => audits.push(entry),
    onCatalogChange: () => { catalogChanges += 1; },
    assertAvailable: () => true,
  });
  return { api, audits, engine, getCatalogChanges: () => catalogChanges };
}

async function requestAs(api, user, route) {
  const req = {
    method: route.method,
    url: route.path,
    headers: { host: "localhost" },
    auth: user ? { user, sessionId: `session-${user.id}` } : null,
    body: route.body,
  };
  const res = {};
  const handled = await api.handle(req, res);
  assert.equal(handled, true, `${route.method} ${route.path} was not handled`);
  return res;
}

async function serverRequest(port, pathname, options = {}) {
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
  return { response, status: response.status, text, data };
}

async function freePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Provider API server exited early (${child.exitCode}).\n${diagnostics.join("")}`);
    try { return await serverRequest(port, "/api/auth/session"); }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error(`Timed out waiting for Provider API server.\n${diagnostics.join("")}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => { child.kill(); resolve(); }, 5_000);
    timeout.unref?.();
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
    child.kill("SIGTERM");
  });
}

async function checkServerIntegration() {
  const port = await freePort();
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-provider-http-"));
  fs.writeFileSync(path.join(dataDirectory, "settings.json"), JSON.stringify({
    providers: [{
      id: "legacy-provider",
      name: "Legacy Provider",
      baseUrl: "https://legacy.example/v1",
      apiKey: LEGACY_SECRET,
      enabled: true,
      models: [{ id: "legacy-chat", capabilities: ["text"] }],
    }],
  }));
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
      PROVIDER_MONITORING_INTERVAL_MINUTES: "1440",
      AI_API_KEY: "",
      GEMINI_API_KEY: "",
      BAILIAN_API_KEY: "",
      AI_IMAGE_API_KEY: "",
      AINB_IMAGE_API_KEY: "",
      CLSE_IMAGE_API_KEY: "",
      APIMART_IMAGE_API_KEY: "",
      GRSAI_IMAGE_API_KEY: "",
      RUNNINGHUB_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  try {
    await waitForServer(port, child, diagnostics);
    assert.equal((await serverRequest(port, "/api/providers")).status, 401);
    await serverRequest(port, "/api/auth/bootstrap", {
      method: "POST",
      body: { username: "Root", displayName: "Root", password: "root provider password" },
    });
    const adminLogin = await serverRequest(port, "/api/auth/login", {
      method: "POST",
      body: { username: "Root", password: "root provider password" },
    });
    assert.equal(adminLogin.status, 200, adminLogin.text);
    const adminCookie = adminLogin.response.headers.get("set-cookie").split(";", 1)[0];
    const createdUser = await serverRequest(port, "/api/admin/users", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: { username: "Alice", displayName: "Alice", password: "alice temporary password" },
    });
    assert.equal(createdUser.status, 201, createdUser.text);
    const userLogin = await serverRequest(port, "/api/auth/login", {
      method: "POST",
      body: { username: "Alice", password: "alice temporary password" },
    });
    const userCookie = userLogin.response.headers.get("set-cookie").split(";", 1)[0];
    assert.equal((await serverRequest(port, "/api/auth/change-password", {
      method: "POST",
      headers: { cookie: userCookie },
      body: { currentPassword: "alice temporary password", newPassword: "alice permanent password" },
    })).status, 200);

    const saved = await serverRequest(port, "/api/providers", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: {
        id: "provider-1",
        name: "Provider One",
        baseUrl: "https://provider.example/v1",
        protocol: "openai",
        apiKey: SECRET,
        models: [{ id: "model-1", protocol: "openai", capabilities: ["llm.chat"] }],
      },
    });
    assert.equal(saved.status, 201, saved.text);
    assert.equal(saved.text.includes(SECRET), false);
    const adminList = await serverRequest(port, "/api/providers", { headers: { cookie: adminCookie } });
    assert.equal(adminList.status, 200, adminList.text);
    assert.equal(adminList.text.includes(SECRET), false);
    assert.equal(adminList.text.includes(LEGACY_SECRET), false);
    assert.ok(adminList.data.providers.some((provider) => provider.id === "legacy-provider"));
    assert.equal((await serverRequest(port, "/api/protocols", { headers: { cookie: adminCookie } })).status, 200);
    assert.equal((await serverRequest(port, "/api/providers", { headers: { cookie: userCookie } })).status, 403);
    assert.equal((await serverRequest(port, "/api/protocols", { headers: { cookie: userCookie } })).status, 403);
    const ordinarySettings = await serverRequest(port, "/api/settings", { headers: { cookie: userCookie } });
    assert.equal(ordinarySettings.status, 200, ordinarySettings.text);
    assert.equal(Object.hasOwn(ordinarySettings.data, "providers"), false);
    const ordinaryAppearanceSave = await serverRequest(port, "/api/preferences", {
      method: "PATCH",
      headers: { cookie: userCookie },
      body: { appearance: { theme: "dark" } },
    });
    assert.equal(ordinaryAppearanceSave.status, 200, ordinaryAppearanceSave.text);
    assert.equal(ordinaryAppearanceSave.data.preferences.appearance.theme, "dark");
    assert.equal(Object.hasOwn(ordinaryAppearanceSave.data.preferences, "canvas"), false);
    const canvasThemeSave = await serverRequest(port, "/api/preferences", {
      method: "PATCH",
      headers: { cookie: userCookie },
      body: { canvas: { theme: "dark" } },
    });
    assert.equal(canvasThemeSave.status, 400, canvasThemeSave.text);
    assert.equal(canvasThemeSave.data.code, "invalid_preference_field");
    const ordinaryPreferences = await serverRequest(port, "/api/preferences", { headers: { cookie: userCookie } });
    assert.equal(ordinaryPreferences.status, 200, ordinaryPreferences.text);
    assert.equal(Object.hasOwn(ordinaryPreferences.data.preferences, "canvas"), false);
    assert.equal((await serverRequest(port, "/api/settings", {
      method: "PUT",
      headers: { cookie: userCookie },
      body: { providers: [] },
    })).status, 403);
    assert.equal((await serverRequest(port, "/api/settings/providers/models", {
      method: "POST",
      headers: { cookie: userCookie },
      body: { providerId: "provider-1" },
    })).status, 403);
    const legacy = await serverRequest(port, "/api/settings/providers/key", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: { providerId: "provider-1" },
    });
    assert.equal(legacy.status, 410, legacy.text);
    assert.equal(legacy.text.includes(SECRET), false);

    const database = new DatabaseSync(path.join(dataDirectory, "system.sqlite"), { readOnly: true });
    try {
      const providerRow = database.prepare("SELECT encrypted_api_key FROM providers WHERE id = ?").get("provider-1");
      assert.match(providerRow.encrypted_api_key, /^aiosenc:v1:/);
      assert.equal(providerRow.encrypted_api_key.includes(SECRET), false);
      const legacyRow = database.prepare("SELECT encrypted_api_key FROM providers WHERE id = ?").get("legacy-provider");
      assert.match(legacyRow.encrypted_api_key, /^aiosenc:v1:/);
      assert.equal(legacyRow.encrypted_api_key.includes(LEGACY_SECRET), false);
      const legacyCapabilities = database.prepare("SELECT capabilities_json FROM provider_models WHERE provider_id = ? AND model_id = ?").get("legacy-provider", "legacy-chat");
      assert.deepEqual(JSON.parse(legacyCapabilities.capabilities_json), ["llm.chat"]);
      const audits = database.prepare("SELECT action, target_id, details_json FROM audit_events WHERE target_type = 'provider'").all();
      assert.ok(audits.some((audit) => audit.action === "provider.created" && audit.target_id === "provider-1"));
      assert.equal(JSON.stringify(audits).includes(SECRET), false);
      for (const audit of audits) assert.deepEqual(Object.keys(JSON.parse(audit.details_json)), ["fields"]);
    } finally {
      database.close();
    }
    assert.equal(fs.readFileSync(path.join(dataDirectory, "security", "provider-master.key")).length, 32);
  } finally {
    await stopChild(child);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

(async () => {
  const { api, audits, engine, getCatalogChanges } = createFixture();
  const providerAdminRoutes = [
    { method: "GET", path: "/api/providers" },
    { method: "POST", path: "/api/providers", body: { id: "provider-1", name: "Provider One", baseUrl: "https://provider.example/v1", protocol: "openai", apiKey: SECRET, models: [] } },
    { method: "GET", path: "/api/providers/provider-1" },
    { method: "POST", path: "/api/providers/provider-1/enabled", body: { enabled: false } },
    { method: "DELETE", path: "/api/providers/provider-1" },
    { method: "POST", path: "/api/providers/reorder", body: { providerIds: ["provider-1"] } },
    { method: "POST", path: "/api/providers/models/reorder", body: { providerId: "provider-1", modelIds: ["model-1"] } },
    { method: "GET", path: "/api/providers/auto-fallback" },
    { method: "POST", path: "/api/providers/auto-fallback", body: { enabled: true } },
    { method: "POST", path: "/api/providers/verify-protocol", body: { providerId: "provider-1" } },
    { method: "POST", path: "/api/providers/infer-protocols", body: { baseUrl: "https://provider.example/v1", models: [{ id: "model-1" }] } },
    { method: "POST", path: "/api/providers/models", body: { providerId: "provider-1" } },
    { method: "POST", path: "/api/providers/test", body: { providerId: "provider-1", modelId: "model-1" } },
    { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } },
    { method: "POST", path: "/api/providers/test-video", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } },
    { method: "POST", path: "/api/providers/test-audio", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } },
    { method: "POST", path: "/api/providers/test-vision", body: { providerId: "provider-1", modelId: "model-1", input: { messages: [] } } },
    { method: "GET", path: "/api/protocols" },
  ];

  for (const route of providerAdminRoutes) {
    assert.equal((await requestAs(api, null, route)).status, 401, `anonymous ${route.method} ${route.path}`);
    assert.equal((await requestAs(api, ordinaryUser, route)).status, 403, `ordinary ${route.method} ${route.path}`);
    const result = await requestAs(api, superadmin, route);
    assert.ok(result.status >= 200 && result.status < 300, `admin ${route.method} ${route.path}: ${result.status}`);
    assert.equal(JSON.stringify(result.body).includes(SECRET), false, `secret leaked from ${route.method} ${route.path}`);
  }

  const listed = await requestAs(api, superadmin, providerAdminRoutes[0]);
  assert.equal(JSON.stringify(listed.body).includes(SECRET), false);

  engine.execute = async () => { throw new Error(`upstream rejected ${SECRET}`); };
  const failedTest = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test", body: { providerId: "provider-1", modelId: "model-1" } });
  assert.equal(failedTest.status, 502);
  assert.equal(JSON.stringify(failedTest.body).includes(SECRET), false);

  const legacyKey = await requestAs(api, superadmin, { method: "POST", path: "/api/settings/providers/key", body: { providerId: "provider-1" } });
  assert.equal(legacyKey.status, 410);
  assert.equal(JSON.stringify(legacyKey.body).includes(SECRET), false);

  assert.ok(audits.length >= 5);
  assert.equal(getCatalogChanges(), 5);
  assert.equal(JSON.stringify(audits).includes(SECRET), false);
  for (const audit of audits) {
    assert.deepEqual(Object.keys(audit.details || {}), ["fields"]);
    assert.ok((audit.details.fields || []).every((field) => typeof field === "string"));
  }

  const unavailableFixture = createFixture();
  unavailableFixture.api.setAvailability(() => { throw Object.assign(new Error("Master key missing"), { code: "PROVIDER_VAULT_KEY_MISSING" }); });
  const unavailable = await requestAs(unavailableFixture.api, superadmin, providerAdminRoutes[0]);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.recoverable, true);

  const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  if (serverSource.includes("createProviderHttpApi")) await checkServerIntegration();

  console.log("Provider HTTP API checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
