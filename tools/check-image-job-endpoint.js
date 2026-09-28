const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const diagnostics = [];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let data = {};
        try { data = JSON.parse(text || "{}"); } catch { data = text; }
        resolve({ status: response.statusCode, data });
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitFor(port, pathname, predicate) {
  const deadline = Date.now() + 15_000;
  let lastResponse = null;
  while (Date.now() < deadline) {
    try {
      const response = await requestJson(port, pathname);
      lastResponse = response;
      if (predicate(response)) return response;
    } catch {
      // Server or job may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${pathname}: ${JSON.stringify(lastResponse)}`);
}

(async () => {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const deadPortProbe = http.createServer();
  const deadPort = await listen(deadPortProbe);
  await new Promise((resolve) => deadPortProbe.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "image-job-endpoint-"));
  const jobsFile = path.join(directory, "image-jobs.json");
  const settingsFile = path.join(directory, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ version: 1, providers: [] }));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_DATA_DIR: directory,
      IMAGE_JOBS_FILE: jobsFile,
      SETTINGS_FILE: settingsFile,
      IMAGE_JOB_TIMEOUT_MINUTES: "5",
      AI_IMAGE_API_URL: `http://127.0.0.1:${deadPort}/v1/images/generations`,
      AI_API_KEY: "test-only-key",
      AI_IMAGE_MODELS: "gpt-image-2",
      AI_IMAGE_MODEL: "gpt-image-2",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
      AINB_IMAGE_API_KEY: "",
      CLSE_IMAGE_API_KEY: "",
      APIMART_IMAGE_API_KEY: "",
      GRSAI_IMAGE_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    await waitFor(port, "/api/image-models", (response) => response.status === 200);
    const provider = await requestJson(port, "/api/providers", {
      method: "POST",
      body: {
        id: "closed-port-image",
        name: "Closed Port Image",
        baseUrl: `http://127.0.0.1:${deadPort}`,
        protocol: "openai",
        apiKey: "test-only-key",
        enabled: true,
        models: [{
          id: "gpt-image-2",
          protocol: "openai-images",
          capabilities: ["image.generate", "image.edit"],
        }],
      },
    });
    assert.equal(provider.status, 201, JSON.stringify(provider.data));
    const catalog = await requestJson(port, "/api/image-models");
    assert.ok(
      catalog.data.models?.some((model) => model.modelId === "gpt-image-2"),
      "the closed-port provider must own the model used by the failure test",
    );
    const created = await requestJson(port, "/api/image-jobs", {
      method: "POST",
      body: {
        board_id: "board-job-test",
        node_id: "node-job-test",
        model: "definitely-not-configured",
        prompt: "must not reach a paid provider",
        size: "1024x1024",
        resolution: "1",
        n: 1,
      },
    });
    assert.equal(created.status, 202);
    assert.match(created.data.job_id, /^imgjob_/);
    assert.equal(created.data.job.state, "queued");
    assert.equal(created.data.job.payload, undefined);

    const terminal = await waitFor(port, `/api/image-jobs/${encodeURIComponent(created.data.job_id)}`, (response) => (
      response.status === 200 && ["failed", "unknown"].includes(response.data.job?.state)
    ));
    assert.equal(terminal.data.job.state, "failed");
    assert.match(terminal.data.job.error, /未配置|生成失败/);
    assert.equal(terminal.data.job.boardId, "board-job-test");
    assert.equal(terminal.data.job.nodeId, "node-job-test");

    const ambiguous = await requestJson(port, "/api/image-jobs", {
      method: "POST",
      body: {
        board_id: "board-ambiguous-test",
        node_id: "node-ambiguous-test",
        model: "gpt-image-2",
        prompt: "must fail against the local closed test port",
        size: "1024x1024",
        resolution: "1k",
        n: 1,
      },
    });
    assert.equal(ambiguous.status, 202);
    const rejected = await waitFor(port, `/api/image-jobs/${encodeURIComponent(ambiguous.data.job_id)}`, (response) => (
      response.status === 200 && ["failed", "unknown"].includes(response.data.job?.state)
    ));
    assert.equal(rejected.data.job.state, "unknown");
    assert.equal(rejected.data.job.code, "image_job_result_unknown");
    const privateLocalization = await requestJson(port, "/api/image-sync/localize", {
      method: "POST",
      body: { source: "http://127.0.0.1/private-image.png" },
    });
    assert.equal(privateLocalization.status, 502);
    assert.match(String(privateLocalization.data.error || ""), /private|local/i);
    assert.equal((await requestJson(port, "/api/image-jobs/missing")).status, 404);
    assert.equal((await requestJson(port, "/api/image-jobs/missing/recover", { method: "POST" })).status, 404);
    assert.equal(fs.existsSync(jobsFile), true);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
  }

  console.log("Image job endpoint checks passed.");
})().catch((error) => {
  console.error(error);
  if (diagnostics.length) console.error(`Server diagnostics:\n${diagnostics.join("")}`);
  process.exitCode = 1;
});
