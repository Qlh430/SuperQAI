"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { createSystemDb } = require("../system-db");
const { hashPassword } = require("../auth-crypto");
const { createComfyService } = require("../comfyui-service");
const root = path.resolve(__dirname, "..");
const controller = path.join(root, "comfyui-http-api.js");

async function listen(server) { return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port))); }
async function main() {
  assert.ok(fs.existsSync(controller), "separate ComfyUI API controller must exist");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-comfy-http-"));
  let app;
  let comfy;
  let db;
  try {
    db = createSystemDb({ dbPath: path.join(temp, "system.sqlite") });
    db.migrate();
    db.insertUser({ id: "admin", username: "admin", role: "superadmin", status: "active", mustChangePassword: false, passwordHash: await hashPassword("comfy-test-password") });
    db.insertUser({ id: "member", username: "member", role: "user", status: "active", mustChangePassword: false, passwordHash: await hashPassword("comfy-test-password") });
    const original = db.saveProviderRecord({ id: "saved-comfy", name: "原有 ComfyUI", baseUrl: "http://192.168.1.53:8188", source: "local", providerProtocol: "comfyui", enabled: true,
      models: [{ id: "minimax-h3", modelProtocol: "comfyui", displayName: "原有工作流", capabilities: ["video.generate"], metadata: { retain: true } }] });
    const failedSave = createComfyService({
      settings: { ...db, setSetting: () => { throw Error("fixture disk failure"); } },
      getConnections: () => db.listProviderRecords(),
      updateConnection: (id, baseUrl) => db.saveProviderRecord({ ...db.getProviderRecord(id), baseUrl }),
    });
    await assert.rejects(failedSave.save({ baseUrl: "http://127.0.0.1:8888" }), /fixture disk failure/);
    assert.equal(db.getProviderRecord(original.id).baseUrl, original.baseUrl, "a failed settings save must roll back the legacy connection update");
    await failedSave.close();
    db.close(); db = null;
    const portProbe = http.createServer();
    const port = await listen(portProbe);
    await new Promise(resolve => portProbe.close(resolve));
    const calls = [];
    comfy = http.createServer((req, res) => {
      calls.push(req.url);
      res.setHeader("Content-Type", "application/json");
      res.end('{"system":{"os":"fixture"},"devices":[]}');
    });
    const comfyPort = await listen(comfy);
    app = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
      cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...process.env, AI_OS_SKIP_ENV_FILE: "1", AI_OS_AUTH_DISABLED: "0", PORT: String(port), HOST: "127.0.0.1",
        AI_OS_DATA_DIR: temp, AI_OS_SYSTEM_DB_FILE: path.join(temp, "system.sqlite"), AI_OS_OUTPUT_DIR: path.join(temp, "output"),
        AI_OS_WORKFLOW_DIR: path.join(temp, "workflows"), AI_OS_UPLOAD_TMP_DIR: path.join(temp, "uploads"),
        SETTINGS_FILE: path.join(temp, "settings.json"), CANVAS_DB_FILE: path.join(temp, "canvas.db"),
        CANVAS_LEGACY_FILE: path.join(temp, "canvas.json"), CANVAS_BACKUP_DIR: path.join(temp, "backup"),
        AI_OS_BACKUP_DIR: path.join(temp, "backup"), OUTBOUND_ROUTE_STATE_FILE: path.join(temp, "route.json"),
        AI_API_KEY: "", CANVAS_AGENT_API_KEY: "", GEMINI_API_KEY: "", BAILIAN_API_KEY: "",
        AINB_IMAGE_API_KEY: "", CLSE_IMAGE_API_KEY: "", APIMART_IMAGE_API_KEY: "", GRSAI_IMAGE_API_KEY: "",
        CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false", COMFYUI_URL: "http://127.0.0.1:8188" },
    });
    let diagnostics = "";
    app.stderr.on("data", chunk => { diagnostics += String(chunk); });
    app.stdout.resume();
    const base = `http://127.0.0.1:${port}`;
    const request = async (route, method = "GET", body, cookie = "", extraHeaders = {}) => {
      const res = await fetch(base + route, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, data: await res.json(), cookie: res.headers.get("set-cookie")?.split(";")[0] };
    };
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (app.exitCode !== null) throw Error("isolated server exited: " + diagnostics);
      try { await request("/api/system/ready"); ready = true; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, diagnostics);
    assert.equal((await request("/api/comfyui/settings")).status, 401);
    const admin = (await request("/api/auth/login", "POST", { username: "admin", password: "comfy-test-password" })).cookie;
    const member = (await request("/api/auth/login", "POST", { username: "member", password: "comfy-test-password" })).cookie;
    assert.ok(admin && member);
    for (const [route, method] of [["settings", "GET"], ["settings", "PUT"], ["test", "POST"], ["detect", "POST"], ["status", "GET"], ["start", "POST"], ["stop", "POST"]]) {
      assert.equal((await request("/api/comfyui/" + route, method, method === "GET" ? null : {}, member)).status, 403, route);
    }
    const config = await request("/api/comfyui/settings", "GET", null, admin);
    assert.equal(config.status, 200);
    assert.equal(config.data.config.baseUrl, original.baseUrl);
    assert.ok(config.data.connections.some(item => item.id === original.id));
    assert.equal((await request("/api/comfyui/start", "POST", {}, admin)).data.code, "comfy_remote_start");
    assert.equal((await request("/api/comfyui/settings", "DELETE", null, admin)).status, 405);
    assert.equal((await request("/api/comfyui/start", "POST", {}, admin, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await request("/api/comfyui/start", "POST", {}, admin, { "Content-Type": "text/plain" })).status, 415);
    const oversized = await request("/api/comfyui/settings", "PUT", { baseUrl: "x".repeat(40_000) }, admin);
    assert.equal(oversized.status, 413, "oversized input returns a structured error instead of dropping the socket");
    assert.equal(oversized.data.code, "comfy_input_too_large");
    const newUrl = `http://127.0.0.1:${comfyPort}`;
    assert.equal((await request("/api/comfyui/settings", "PUT", { ...config.data.config, baseUrl: newUrl }, admin, { Origin: base })).status, 200);
    assert.equal((await request("/api/comfyui/test", "POST", { mode: "remote", baseUrl: newUrl }, admin)).data.ok, true);
    assert.equal((await request("/api/comfyui/status", "GET", null, admin)).data.connection.ok, true);
    assert.ok(calls.length >= 2);
    assert.ok(calls.every(item => item === "/system_stats"));
    const providers = (await request("/api/providers", "GET", null, admin)).data.providers;
    const updated = providers.find(item => item.id === original.id);
    assert.equal(updated.baseUrl, newUrl);
    assert.equal(updated.models[0].metadata.retain, true);
    assert.equal(updated.models[0].id, "minimax-h3");
    const source = require("./server-source").readServerSource();
    const clientSource = fs.readFileSync(path.join(root, "comfyui-client.js"), "utf8");
    assert.ok(source.includes("getDefaultUrl: () => getComfyService().resolveUrl()"), "empty workflow URL resolves saved ComfyUI connection");
    assert.match(clientSource, /const fallback = typeof getDefaultUrl === "function" \? getDefaultUrl\(\) : getDefaultUrl/);
    assert.doesNotMatch(source, /normalizeComfyUrl\([^;\n]*\|\| COMFYUI_URL/);
    assert.match(source, /async function closeComfyService\(\)/, "server shutdown owns ComfyUI cleanup");
    console.log("ComfyUI HTTP checks passed (real isolated server, auth, CSRF, save, probe, legacy workflow preservation).");
  } finally {
    db?.close();
    if (app && app.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { app.kill(); }, 5_000);
      app.once("exit", () => { clearTimeout(timer); resolve(); });
      app.send({ type: "ai-os.shutdown" });
    });
    await new Promise(resolve => comfy?.listening ? comfy.close(resolve) : resolve());
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
