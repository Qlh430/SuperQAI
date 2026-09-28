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
  let agentSettingsValue = { primary: null, candidates: [] };
  const agentModels = [{
    providerId: "provider-1", providerName: "Provider One", modelId: "model-1", modelName: "model-1",
    capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
  }];
  const agentModelSettings = {
    get: () => ({ configured: Boolean(agentSettingsValue.primary), settings: agentSettingsValue, models: agentModels, unavailable: [] }),
    save: value => {
      agentSettingsValue = { primary: value.primary, candidates: value.candidates || [] };
      return { configured: true, settings: agentSettingsValue, models: agentModels, unavailable: [] };
    },
  };
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
    describe: (protocolId) => protocolId === "openai" ? {
      runnable: true,
      capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
      operations: [{ intent: "llm.chat" }, { intent: "llm.chat.vision" }, { intent: "llm.tools" }],
    } : null,
    candidatesForBaseUrl: () => ["openai"],
    inferModelProtocol: () => "openai",
    platformProtocolId: (value) => String(value || "") === "openai-images" ? "openai" : String(value || ""),
    inferModelConfiguration: (model) => {
      if (model?.protocol === "stale-profile") {
        throw Object.assign(new Error("incompatible model profile"), { code: "incompatible_protocols" });
      }
      if (model?.id === "incompatible-model") {
        throw Object.assign(new Error("incompatible discovered model"), { code: "incompatible_protocols" });
      }
      return {
        ...model,
        id: String(model?.id || ""),
        protocol: model?.protocol || "openai",
        capabilities: Array.isArray(model?.capabilities) ? model.capabilities : ["llm.chat"],
      };
    },
  };
  const engine = {
    verifyProtocol: async () => ({ selectedProtocol: "openai", models: ["model-1"], diagnostic: SECRET }),
    fetchModels: async (provider, options = {}) => {
      assert.equal(provider.protocol, "openai", "model protocol aliases must be normalized before model discovery");
      assert.equal(options.verifyCatalog, true, "the user-facing model fetch must validate the catalog envelope");
      if (provider.id === "object-catalog") return [{ id: "gpt-5.6-terra", protocol: "openai", capabilities: ["llm.chat", "llm.tools"] }];
      if (provider.id === "mixed-catalog") return ["model-1", "incompatible-model", "model-2"];
      return ["model-1", "model-2"];
    },
    execute: async (_provider, _model, intent) => String(intent).startsWith("image.")
      ? ({ data: [{ url: "https://media.example.test/test.png" }], usage: null, debug: SECRET })
      : ({ text: `${intent}:ok`, usage: null, debug: SECRET }),
  };
  const jimengCli = {
    status: async () => ({ state: "ready-signed-in", executable: "C:\\safe\\dreamina.exe", version: "1.4.17", signedIn: true, account: "local-user", credits: 12, raw: SECRET }),
    setPath: async () => ({ state: "ready-signed-out", executable: "C:\\safe\\dreamina.exe", token: SECRET }),
    login: async () => ({ state: "login-running", deviceCode: SECRET, verification_uri: "https://secret.example" }),
    relogin: async () => ({ state: "login-running", deviceCode: SECRET, verification_uri: "https://secret.example" }),
    loginStatus: async () => ({ state: "login-running", deviceCode: SECRET }),
    logout: async () => ({ state: "ready-signed-out", cookie: SECRET }),
    models: async () => ["jimeng-5.0", "seedance2.5", SECRET],
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
    jimengCli,
    agentModelSettings,
  });
  return { api, audits, engine, jimengCli, getCatalogChanges: () => catalogChanges };
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
    const savedAgentProvider = await serverRequest(port, "/api/providers", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: {
        id: "agent-provider",
        name: "Agent Provider",
        baseUrl: "https://agent-provider.example/v1",
        protocol: "openai",
        apiKey: "agent-provider-secret",
        models: [{ id: "vision-agent", protocol: "openai", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"] }],
      },
    });
    assert.equal(savedAgentProvider.status, 201, savedAgentProvider.text);
    const agentSettingsCatalog = await serverRequest(port, "/api/providers/agent-settings", { headers: { cookie: adminCookie } });
    assert.equal(agentSettingsCatalog.status, 200, agentSettingsCatalog.text);
    assert.ok(agentSettingsCatalog.data.models.some(item => item.providerId === "agent-provider" && item.modelId === "vision-agent"));
    assert.equal(agentSettingsCatalog.data.models.some(item => item.providerId === "provider-1" && item.modelId === "model-1"), false);
    const savedAgentSettings = await serverRequest(port, "/api/providers/agent-settings", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: { primary: { providerId: "agent-provider", modelId: "vision-agent" }, candidates: [] },
    });
    assert.equal(savedAgentSettings.status, 200, savedAgentSettings.text);
    assert.deepEqual(savedAgentSettings.data.settings, { primary: { providerId: "agent-provider", modelId: "vision-agent" }, candidates: [] });
    assert.equal((await serverRequest(port, "/api/providers/agent-settings", { headers: { cookie: userCookie } })).status, 403);
    const adminList = await serverRequest(port, "/api/providers", { headers: { cookie: adminCookie } });
    assert.equal(adminList.status, 200, adminList.text);
    assert.equal(adminList.text.includes(SECRET), false);
    assert.equal(adminList.text.includes(LEGACY_SECRET), false);
    assert.ok(adminList.data.providers.some((provider) => provider.id === "legacy-provider"));
    const serverCoverage = await serverRequest(port, "/api/providers/agent-coverage", {
      method: "POST",
      headers: { cookie: adminCookie },
      body: { providerId: "provider-1" },
    });
    assert.equal(serverCoverage.status, 200, serverCoverage.text);
    assert.deepEqual(serverCoverage.data.coverage.summary, { total: 1, ready: 0, configurable: 1, partial: 0, missing: 0, visionReady: 0, mediaTools: 0 });
    assert.equal(serverCoverage.text.includes(SECRET), false);
    assert.equal((await serverRequest(port, "/api/providers/agent-coverage", {
      method: "POST",
      headers: { cookie: userCookie },
      body: { providerId: "provider-1" },
    })).status, 403);
    assert.equal((await serverRequest(port, "/api/protocols", { headers: { cookie: adminCookie } })).status, 200);
    assert.equal((await serverRequest(port, "/api/providers", { headers: { cookie: userCookie } })).status, 403);
    assert.equal((await serverRequest(port, "/api/protocols", { headers: { cookie: userCookie } })).status, 403);
    const ordinarySettings = await serverRequest(port, "/api/settings", { headers: { cookie: userCookie } });
    assert.equal(ordinarySettings.status, 200, ordinarySettings.text);
    assert.equal(Object.hasOwn(ordinarySettings.data, "providers"), false);
    {
      const database = new DatabaseSync(path.join(dataDirectory, "system.sqlite"));
      try {
        const ordinaryUser = database.prepare("SELECT id FROM users WHERE username = ?").get("alice");
        database.prepare("INSERT INTO user_preferences(user_id, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
          .run(ordinaryUser.id, JSON.stringify({ appearance: { theme: "system", scale: 1, animations: "full" }, canvas: { theme: "dark" } }), new Date().toISOString());
      } finally {
        database.close();
      }
    }
    const ordinaryAppearanceSave = await serverRequest(port, "/api/preferences", {
      method: "PATCH",
      headers: { cookie: userCookie },
      body: { appearance: { theme: "dark" } },
    });
    assert.equal(ordinaryAppearanceSave.status, 200, ordinaryAppearanceSave.text);
    assert.equal(ordinaryAppearanceSave.data.preferences.appearance.theme, "dark");
    assert.equal(Object.hasOwn(ordinaryAppearanceSave.data.preferences, "canvas"), false);
    {
      const database = new DatabaseSync(path.join(dataDirectory, "system.sqlite"), { readOnly: true });
      try {
        const ordinaryUser = database.prepare("SELECT id FROM users WHERE username = ?").get("alice");
        const row = database.prepare("SELECT value_json FROM user_preferences WHERE user_id = ?").get(ordinaryUser.id);
        assert.equal(Object.hasOwn(JSON.parse(row.value_json), "canvas"), false, "PATCH removes the retired canvas theme from raw storage");
      } finally {
        database.close();
      }
    }
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
      const agentSettingsRow = database.prepare("SELECT value_json FROM system_settings WHERE key = ?").get("agent_model_settings");
      assert.deepEqual(JSON.parse(agentSettingsRow.value_json), { primary: { providerId: "agent-provider", modelId: "vision-agent" }, candidates: [] });
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
  const jimengAdminRoutes = [
    { method: "GET", path: "/api/jimeng-cli/status" },
    { method: "POST", path: "/api/jimeng-cli/path", body: { executablePath: "C:\\safe\\dreamina.exe" } },
    { method: "POST", path: "/api/jimeng-cli/login", body: {} },
    { method: "POST", path: "/api/jimeng-cli/relogin", body: {} },
    { method: "GET", path: "/api/jimeng-cli/login-status" },
    { method: "POST", path: "/api/jimeng-cli/logout", body: {} },
    { method: "POST", path: "/api/jimeng-cli/models", body: {} },
  ];
  for (const route of jimengAdminRoutes) {
    assert.equal((await requestAs(api, null, route)).status, 401, `anonymous ${route.method} ${route.path}`);
    assert.equal((await requestAs(api, ordinaryUser, route)).status, 403, `ordinary ${route.method} ${route.path}`);
    const result = await requestAs(api, superadmin, route);
    assert.ok(result.status >= 200 && result.status < 300, `admin ${route.method} ${route.path}: ${result.status}`);
    assert.equal(JSON.stringify(result.body).includes(SECRET), false, `secret leaked from ${route.method} ${route.path}`);
  }
  // The CLI catalog keeps the qualified image id and the Seedance video name
  // while anything else the client reports is dropped.
  const jimengModels = await requestAs(api, superadmin, { method: "POST", path: "/api/jimeng-cli/models", body: {} });
  assert.deepEqual(jimengModels.body.models, ["jimeng-5.0", "seedance2.5"]);

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
    { method: "GET", path: "/api/providers/agent-settings" },
    { method: "POST", path: "/api/providers/agent-settings", body: { primary: { providerId: "provider-1", modelId: "model-1" }, candidates: [] } },
    { method: "POST", path: "/api/providers/verify-protocol", body: { providerId: "provider-1" } },
    { method: "POST", path: "/api/providers/infer-protocols", body: { baseUrl: "https://provider.example/v1", models: [{ id: "model-1" }] } },
    { method: "POST", path: "/api/providers/models", body: { providerId: "provider-1" } },
    { method: "POST", path: "/api/providers/agent-coverage", body: { providerId: "provider-1" } },
    { method: "POST", path: "/api/providers/test", body: { providerId: "provider-1", modelId: "model-1" } },
    { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } },
    { method: "POST", path: "/api/providers/test-video", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } },
    { method: "POST", path: "/api/providers/test-audio", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } },
    { method: "POST", path: "/api/providers/test-vision", body: { providerId: "provider-1", modelId: "model-1", input: { messages: [] } } },
    { method: "GET", path: "/api/protocols" },
  ];

  const fetched = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/models",
    body: {
      provider: {
        id: "provider-1",
        name: "Provider One",
        baseUrl: "https://provider.example/v1",
        protocol: "openai-images",
        models: [],
      },
    },
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.platformProtocol, "openai");

  const savedCoverage = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/agent-coverage",
    body: { providerId: "provider-1" },
  });
  assert.equal(savedCoverage.status, 200);
  assert.deepEqual(savedCoverage.body.coverage.summary, { total: 1, ready: 1, configurable: 0, partial: 0, missing: 0, visionReady: 1, mediaTools: 0 });
  assert.equal(savedCoverage.body.coverage.source, "saved");
  assert.equal(JSON.stringify(savedCoverage.body).includes(SECRET), false);

  const liveCoverage = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/agent-coverage",
    body: { providerId: "provider-1", refreshModels: true },
  });
  assert.equal(liveCoverage.status, 200);
  assert.deepEqual(liveCoverage.body.coverage.summary, { total: 2, ready: 0, configurable: 2, partial: 0, missing: 0, visionReady: 0, mediaTools: 0 });
  assert.equal(liveCoverage.body.coverage.source, "live");

  const objectCatalogCoverage = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/agent-coverage",
    body: { provider: { id: "object-catalog", name: "Object Catalog", baseUrl: "https://provider.example/v1", protocol: "openai", models: [] }, refreshModels: true },
  });
  assert.equal(objectCatalogCoverage.status, 200);
  assert.equal(objectCatalogCoverage.body.coverage.models[0].state, "ready", "discovered model capabilities survive HTTP inference");

  const mixedLiveCoverage = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/agent-coverage",
    body: { provider: { id: "mixed-catalog", name: "Mixed", baseUrl: "https://provider.example/v1", protocol: "openai", models: [] }, refreshModels: true },
  });
  assert.equal(mixedLiveCoverage.status, 200);
  assert.deepEqual(mixedLiveCoverage.body.coverage.summary, { total: 3, ready: 0, configurable: 2, partial: 0, missing: 1, visionReady: 0, mediaTools: 0 });
  assert.equal(mixedLiveCoverage.body.coverage.models.find(model => model.id === "incompatible-model").state, "missing");

  const fetchedWithStaleModel = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/models",
    body: {
      provider: {
        id: "draft-provider",
        name: "Draft Provider",
        baseUrl: "https://provider.example/v1",
        protocol: "openai",
        models: [{ id: "old-model", protocol: "stale-profile", capabilities: ["llm.chat"] }],
      },
    },
  });
  assert.equal(fetchedWithStaleModel.status, 200, "model discovery must validate the platform connection independently of stale model profiles");
  assert.deepEqual(fetchedWithStaleModel.body.models, ["model-1", "model-2"]);

  const fetchedWithIncompatibleCatalogItem = await requestAs(api, superadmin, {
    method: "POST",
    path: "/api/providers/models",
    body: {
      provider: {
        id: "mixed-catalog",
        name: "Mixed Catalog",
        baseUrl: "https://provider.example/v1",
        protocol: "openai",
        models: [],
      },
    },
  });
  assert.equal(fetchedWithIncompatibleCatalogItem.status, 200, "one incompatible discovered model must not abort the catalog");
  assert.deepEqual(fetchedWithIncompatibleCatalogItem.body.models, ["model-1", "incompatible-model", "model-2"]);
  assert.deepEqual(fetchedWithIncompatibleCatalogItem.body.modelConfigurations.map(model => model.id), ["model-1", "model-2"]);
  assert.deepEqual(fetchedWithIncompatibleCatalogItem.body.skippedModels, [{ id: "incompatible-model", code: "incompatible_protocols" }]);

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

  engine.execute = async (_provider, _model, intent) => intent === "image.generate" ? { data: [] } : { text: "" };
  const emptyLlmTest = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test", body: { providerId: "provider-1", modelId: "model-1" } });
  const emptyImageTest = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } });
  assert.equal(emptyLlmTest.status, 502, "HTTP 200 without LLM content must not be reported as available");
  assert.equal(emptyImageTest.status, 502, "HTTP 200 without image output must not be reported as available");
  assert.equal(emptyLlmTest.body.code, "provider_test_invalid_response");
  assert.equal(emptyImageTest.body.code, "provider_test_invalid_response");
  engine.execute = async (_provider, _model, intent) => intent === "image.generate" ? { data: [{}] } : { text: "ok" };
  const emptyImageItemTest = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1", input: { prompt: "test" } } });
  assert.equal(emptyImageItemTest.status, 502, "an empty image item must not be reported as available");
  assert.equal(emptyImageItemTest.body.code, "provider_test_invalid_response");
  engine.execute = async () => ({ message: "upstream error" });
  const misleadingLlmTest = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test", body: { providerId: "provider-1", modelId: "model-1" } });
  assert.equal(misleadingLlmTest.status, 502, "an error message in an HTTP 200 response is not usable LLM content");

  engine.execute = async () => ({ text: "完整测试回复".repeat(900) });
  const fullReply = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test", body: { providerId: "provider-1", modelId: "model-1" } });
  assert.equal(fullReply.body.test?.text, "完整测试回复".repeat(900), "test presentation must not truncate replies at the diagnostic 2000-character limit");
  assert.equal(fullReply.body.test.status, "succeeded");
  assert.ok(fullReply.body.test.elapsedMs >= 0);
  const imageBytes = Buffer.alloc(5000, 1).toString("base64");
  engine.execute = async () => ({ data: [{ b64_json: imageBytes }] });
  const fullImage = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1" } });
  assert.equal(fullImage.body.test?.images[0], `data:image/png;base64,${imageBytes}`, "base64 preview must not be truncated or rewritten as diagnostic text");
  engine.execute = async () => ({ task_id: "pending-task" });
  const pendingImage = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1" } });
  assert.equal(pendingImage.body.test?.status, "pending", "task acceptance is not generation success");
  engine.execute = async () => ({ data: [{ url: "javascript:alert(1)" }] });
  const unsafeImage = await requestAs(api, superadmin, { method: "POST", path: "/api/providers/test-image", body: { providerId: "provider-1", modelId: "model-1" } });
  assert.equal(unsafeImage.status, 502, "unsafe image URLs are not successful image outputs");

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
