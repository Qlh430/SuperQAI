"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createSystemDb } = require("../system-db");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");

const ROOT = path.resolve(__dirname, "..");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
async function eventually(read) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const value = await read().catch(() => null);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error("Model identity endpoint check timed out.");
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "model-identity-endpoint-"));
  let child, cookie = "";
  const calls = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ key: req.headers.authorization, path: req.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  try {
    const upstreamPort = await listen(upstream);
    const db = createSystemDb({ dbPath: path.join(directory, "system.sqlite") });
    db.migrate();
    try {
      const store = createProviderStore({ db, vault: createProviderSecretVault({ dataDir: directory }) });
      for (const id of ["first", "second"]) {
        store.save({
          id, name: `${id} API`, protocol: "openai", baseUrl: `http://127.0.0.1:${upstreamPort}`,
          apiKey: `${id}-test-key`, enabled: true, models: [{
            id: id === "first" ? "gpt-image-2-vip" : "gpt-image-2-vip-grsai",
            displayName: "不应显示的旧别名", protocol: "openai", capabilities: ["image.generate", "image.edit"],
            metadata: id === "first" ? {} : { upstreamModel: "gpt-image-2-vip" },
          }],
        });
      }
      // Simulate an existing install where earlier migrations already ran.
      for (const key of ["providers.migration.v1", "providers.agent-bridge.v1", "providers.media-bridge.v1", "providers.media-model-profiles.v2", "providers.legacy-apimart-platform.v1"]) db.setSetting(key, { completed: true });
    } finally { db.close(); }
    const probe = http.createServer();
    const port = await listen(probe);
    await new Promise(resolve => probe.close(resolve));
    const childEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) {
      if (/^(AI_|CANVAS_|IMAGE_|OUTBOUND_|SETTINGS_|APIMART_|GRSAI_|AINB_|CLSE_|RUNNINGHUB_|GEMINI_|BAILIAN_)/.test(key)) delete childEnv[key];
    }
    child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
      cwd: ROOT, windowsHide: true, stdio: "ignore",
      env: {
        ...childEnv, HOST: "127.0.0.1", PORT: String(port), AI_OS_AUTH_DISABLED: "0", AI_OS_SKIP_ENV_FILE: "1",
        AI_OS_DATA_DIR: directory, AI_OS_OUTPUT_DIR: path.join(directory, "output"), AI_OS_UPLOAD_TMP_DIR: path.join(directory, "uploads"),
        OUTBOUND_PROXY_URL: "auto", CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
      },
    });
    async function request(route, body) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(3000),
      });
      const data = await response.json();
      assert.ok(response.ok, `${route}: ${response.status} ${data.error || ""}`);
      return { response, data };
    }
    await eventually(() => request("/api/system/ready"));
    await request("/api/auth/bootstrap", { username: "ModelTest", password: "temporary model test password", displayName: "ModelTest" });
    const login = await request("/api/auth/login", { username: "ModelTest", password: "temporary model test password" });
    cookie = login.response.headers.get("set-cookie").split(";", 1)[0];
    const providers = (await request("/api/providers")).data.providers;
    assert.equal(providers.find(provider => provider.id === "second").models[0].id, "gpt-image-2-vip");
    const catalog = (await request("/api/image-models")).data.models;
    const second = catalog.find(model => model.providerId === "second");
    assert.equal(second.modelId, "gpt-image-2-vip");
    assert.equal(second.displayName, "gpt-image-2-vip · second API");
    const legacyClientId = `custom:second:${Buffer.from("gpt-image-2-vip-grsai").toString("base64url")}`;
    assert.ok(second.legacyIds.includes(legacyClientId));
    for (const selection of [
      { model: legacyClientId },
      { model: "gpt-image-2-vip", providerId: "second" },
      { model: "gpt-image-2-vip-grsai", providerId: "second" },
    ]) {
      const created = (await request("/api/image-jobs", { board_id: "identity-board", node_id: "identity-node", prompt: "test image", size: "1:1", resolution: "1k", ...selection })).data.job;
      const job = await eventually(async () => {
        const current = (await request(`/api/image-jobs/${created.id}`)).data.job;
        return ["completed", "failed", "unknown"].includes(current.state) && current;
      });
      assert.equal(job.state, "completed", job.error);
      assert.equal(job.result.selection.providerId, "second");
      assert.equal(job.result.selection.modelId, "gpt-image-2-vip");
    }
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.key === "Bearer second-test-key" && call.body.model === "gpt-image-2-vip"));
    console.log("Model identity endpoint passed: startup migration, canonical catalog, old encoded/raw selections, provider isolation, original upstream model.");
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
