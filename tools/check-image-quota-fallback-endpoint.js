"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
async function eventually(read) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read().catch(() => null);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error("Local image quota fallback check timed out.");
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "image-quota-fallback-"));
  const calls = [];
  let phase = "quota", child, cookie = "";
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const provider = req.headers.authorization === "Bearer primary-test-key" ? "primary" : "secondary";
    calls.push({ provider, path: req.url, body: Buffer.concat(chunks).toString("utf8") });
    res.setHeader("content-type", "application/json");
    if (provider === "primary") {
      if (phase === "unknown") { res.destroy(); return; }
      res.writeHead(402);
      res.end(JSON.stringify({ error: { code: "insufficient_quota", message: "余额不足" } }));
    } else res.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  try {
    const upstreamPort = await listen(upstream);
    const probe = http.createServer();
    const port = await listen(probe);
    await new Promise(resolve => probe.close(resolve));
    const childEnv = { ...process.env };
    // Isolate from real credentials, provider migration, and workspace data.
    for (const key of Object.keys(childEnv)) {
      if (/^(AI_|CANVAS_|IMAGE_|OUTBOUND_|SETTINGS_|APIMART_|GRSAI_|AINB_|CLSE_|RUNNINGHUB_|GEMINI_|BAILIAN_)/.test(key)) delete childEnv[key];
    }
    child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
      cwd: ROOT, windowsHide: true, stdio: "ignore",
      env: {
        ...childEnv, HOST: "127.0.0.1", PORT: String(port), AI_OS_AUTH_DISABLED: "0",
        AI_OS_SKIP_ENV_FILE: "1", AI_OS_DATA_DIR: directory, AI_OS_OUTPUT_DIR: path.join(directory, "output"),
        AI_OS_UPLOAD_TMP_DIR: path.join(directory, "uploads"), OUTBOUND_PROXY_URL: "auto",
        CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
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
      assert.ok(response.ok, `${route}: ${response.status}`);
      return { response, data };
    }
    await eventually(() => request("/api/system/ready"));
    await request("/api/auth/bootstrap", { username: "QuotaTest", password: "temporary quota test password", displayName: "QuotaTest" });
    const login = await request("/api/auth/login", { username: "QuotaTest", password: "temporary quota test password" });
    cookie = login.response.headers.get("set-cookie").split(";", 1)[0];
    for (const [index, id] of ["primary", "secondary"].entries()) {
      await request("/api/providers", {
        id, name: id, baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        protocol: "openai", apiKey: `${id}-test-key`, enabled: true, sortOrder: index,
        models: [{ id: "gpt-image-2", protocol: "openai-images", capabilities: ["image.generate", "image.edit"] }],
      });
    }
    await request("/api/providers/auto-fallback", { enabled: true });
    async function runJob(selection = {}) {
      const created = (await request("/api/image-jobs", {
        board_id: "quota-board", node_id: "quota-node", prompt: "dark background",
        size: "16:9", resolution: "2k", reference_images: [{ url: `data:image/png;base64,${PNG}`, name: "input.png" }],
        ...selection,
      })).data.job;
      return eventually(async () => {
        const job = (await request(`/api/image-jobs/${created.id}`)).data.job;
        return ["completed", "failed", "unknown"].includes(job.state) && job;
      });
    }
    const completed = await runJob();
    assert.equal(completed.state, "completed", completed.error);
    assert.deepEqual(calls.map(call => call.provider), ["primary", "secondary"]);
    assert.ok(calls.every(call => call.path === "/v1/images/edits" && call.body.includes("dark background")));
    assert.equal(completed.result.selection.providerId, "secondary");
    assert.equal(completed.result.attempts[0].code, "UPSTREAM_QUOTA_EXHAUSTED");
    assert.match(completed.result.data[0].local_url, /^\/output\//);
    assert.ok(fs.existsSync(path.join(directory, "output", path.basename(completed.result.data[0].local_url))));
    calls.length = 0;
    const pinned = await runJob({ providerId: "primary", modelId: "gpt-image-2" });
    assert.equal(pinned.state, "failed");
    assert.deepEqual(calls.map(call => call.provider), ["primary"]);
    calls.length = 0;
    phase = "unknown";
    const unknown = await runJob();
    assert.equal(unknown.state, "unknown");
    assert.deepEqual(calls.map(call => call.provider), ["primary"]);
    console.log("Image quota fallback endpoint passed: auto edit fallback, original reference, saved image, fixed selection, no replay after uncertain submission.");
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
