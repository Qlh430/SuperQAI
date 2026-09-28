"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const pause = ms => new Promise(r => setTimeout(r, ms));
const listen = server => new Promise(r => server.listen(0, "127.0.0.1", () => r(server.address().port)));
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
async function eventually(fn, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await fn().catch(() => null); if (result) return result; await pause(60); }
  throw new Error("APIMart integration condition timed out");
}
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apimart-endpoint-"));
  const counts = { posts: 0, polls: 0 };
  let phase = "retry", retryPolls = 0, child, cookie = "", diagnostics = "";
  const upstream = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer fake-apimart-integration-key");
    let body = ""; for await (const chunk of req) body += chunk;
    const send = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (req.method === "POST") {
      counts.posts++;
      assert.equal(req.url, "/v1/images/generations");
      const payload = JSON.parse(body);
      assert.equal(payload.model, "gpt-image-2", JSON.stringify(payload)); assert.equal(payload.resolution, "1k", JSON.stringify(payload)); assert.equal(payload.size, "1:1", JSON.stringify(payload));
      send({ data: [{ task_id: `task-${counts.posts}` }] }); return;
    }
    counts.polls++;
    assert.match(req.url, /^\/v1\/tasks\/task-[12]$/);
    if (phase === "retry" && retryPolls++ === 0) { send({ message: "temporary outage" }, 503); return; }
    if (phase === "interrupt") { send({ data: { status: "processing" } }); return; }
    send({ data: { status: "completed", result: { images: [{ url: [png] }] } } });
  });
  const upstreamPort = await listen(upstream);
  const probe = http.createServer(); const port = await listen(probe); await new Promise(r => probe.close(r));
  const jobsFile = path.join(dir, "image-jobs.json");
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ providers: [] }));
  async function request(url, body) {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json();
    assert.ok(res.ok, `${url}: ${res.status} ${JSON.stringify(data)}`);
    return { res, data };
  }
  async function start() {
    child = spawn(process.execPath, ["server.js"], { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_AUTH_DISABLED: "0", AI_OS_DATA_DIR: dir, AI_OS_OUTPUT_DIR: path.join(dir, "output"),
      SETTINGS_FILE: path.join(dir, "settings.json"), IMAGE_JOBS_FILE: jobsFile, IMAGE_JOB_TIMEOUT_MINUTES: "1", OUTBOUND_PROXY_URL: "direct",
      AI_IMAGE_API_KEY: "", AINB_IMAGE_API_KEY: "", CLSE_IMAGE_API_KEY: "", APIMART_IMAGE_API_KEY: "", GRSAI_IMAGE_API_KEY: "", RUNNINGHUB_API_KEY: "",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    }});
    child.stdout.on("data", b => { diagnostics = (diagnostics + b).slice(-3000); });
    child.stderr.on("data", b => { diagnostics = (diagnostics + b).slice(-3000); });
    await eventually(async () => (await fetch(`http://127.0.0.1:${port}/api/auth/session`)).status < 500);
  }
  async function stop() { if (child && child.exitCode === null) { const exited = new Promise(r => child.once("exit", r)); child.kill(); await exited; } }
  try {
    await start();
    await request("/api/auth/bootstrap", { username: "Reliability", displayName: "Reliability", password: "temporary integration password" });
    const login = await request("/api/auth/login", { username: "Reliability", password: "temporary integration password" });
    cookie = login.res.headers.get("set-cookie").split(";", 1)[0];
    const saved = await request("/api/providers", { id: "apimart-new", name: "APIMart newly added", baseUrl: `http://127.0.0.1:${upstreamPort}/v1/images/generations`, protocol: "apimart", apiKey: "fake-apimart-integration-key", models: [{ id: "gpt-image-2-apimart", protocol: "openai-images", capabilities: ["image.generate"], metadata: { upstreamModel: "gpt-image-2", resolutions: ["1", "2", "4"] } }] });
    assert.ok(!JSON.stringify(saved.data).includes("fake-apimart-integration-key"));
    const create = async () => (await request("/api/image-jobs", { board_id: "reliability-board", node_id: "node-1", providerId: "apimart-new", modelId: "gpt-image-2-apimart", prompt: "one tree", size: "1:1", resolution: "1", n: 1 })).data.job;
    const first = await create();
    const done = await eventually(async () => { const job = (await request(`/api/image-jobs/${first.id}`)).data.job; return job.state === "completed" && job; });
    assert.match(done.result.data[0].local_url, /^\/output\//);
    assert.equal(counts.posts, 1);
    phase = "interrupt";
    const second = await create();
    await eventually(async () => JSON.parse(fs.readFileSync(jobsFile)).jobs[second.id].remoteTask?.taskId === "task-2");
    await stop(); phase = "resume"; await start();
    const pending = (await request(`/api/image-jobs/${second.id}`)).data.job;
    assert.equal(pending.state, "task_pending"); assert.equal(pending.canResume, true);
    const results = await Promise.all([request(`/api/image-jobs/${second.id}/recover`, {}), request(`/api/image-jobs/${second.id}/recover`, {})]);
    assert.ok(results.every(r => r.data.job.state === "completed"));
    assert.equal(counts.posts, 2, "restart and recovery must not submit a third generation");
    assert.ok(!fs.readFileSync(jobsFile, "utf8").includes("fake-apimart-integration-key"));
    console.log("APIMart endpoint checks passed: add API, alias, full URL, transient GET retry, local image, restart and same-task recovery.");
  } catch (e) { console.error(diagnostics); throw e; }
  finally {
    await stop(); upstream.closeAllConnections(); await new Promise(r => upstream.close(r));
    if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
