const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function reservePort() {
  const probe = http.createServer();
  return listen(probe).then(async (port) => {
    await close(probe);
    return port;
  });
}

function request(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Agent server exited: ${diagnostics.join("")}`);
    try {
      const response = await request(port, "/api/canvas-agent/skills");
      if (response.status === 200) return;
    } catch {
      // The child may still be binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Agent server: ${diagnostics.join("")}`);
}

function parseNdjson(text) {
  return String(text || "").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

(async () => {
  const upstreamPaths = [];
  const upstream = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      upstreamPaths.push(req.url);
      if (req.url === "/v1/responses") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "temporary upstream failure" } }));
        return;
      }
      if (req.url === "/v1/chat/completions") {
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
        res.write(`data: ${JSON.stringify({
          id: "chat-fallback-ok",
          model: "must-not-leak-model",
          choices: [{ delta: { content: "备用通道已响应" } }],
        })}\n\n`);
        res.end("data: [DONE]\n\n");
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  const upstreamPort = await listen(upstream);
  const appPort = await reservePort();
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-failover-endpoint-"));
  const routeHistoryFile = path.join(tempDirectory, "route-history.json");
  fs.writeFileSync(routeHistoryFile, JSON.stringify({
    agentRoutes: {},
    agentCapabilities: {
      "canvas-agent-env-fallback": {
        "test-fast-model": { text: true, tools: true, vision: true, protocol: "responses", adapterId: "openai-responses" },
      },
    },
  }));
  const diagnostics = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: "127.0.0.1",
      CANVAS_AGENT_API_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      CANVAS_AGENT_API_KEY: "test-agent-key",
      CANVAS_AGENT_MODEL: "test-fast-model",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
      CANVAS_AGENT_ROUTE_HISTORY_FILE: routeHistoryFile,
      CANVAS_AGENT_CONNECT_TIMEOUT_SECONDS: "1",
      CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS: "2",
      CANVAS_AGENT_ATTEMPT_TIMEOUT_SECONDS: "10",
      CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS: "20",
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    await waitForServer(appPort, child, diagnostics);
    const response = await request(appPort, "/api/canvas-agent/turn", {
      method: "POST",
      headers: { Accept: "application/x-ndjson" },
      body: {
        run_id: "failover-run-1",
        skill_mode: "auto",
        prompt: "你好",
        canvas: { id: "board-failover", title: "故障转移测试", selected_node_ids: [], nodes: [], connections: [] },
        vision_images: [],
        step: 0,
      },
    });
    assert.equal(response.status, 200);
    assert.match(String(response.headers["content-type"]), /application\/x-ndjson/);
    const events = parseNdjson(response.text);
    assert.deepEqual(events.map((event) => event.type), ["status", "status", "status", "turn"]);
    assert.deepEqual(events.filter((event) => event.type === "status").map((event) => event.stage), ["understanding", "recovering", "resumed"]);
    assert.equal(events.at(-1).turn.message, "备用通道已响应");
    assert.equal(events.at(-1).turn.response_id, "chat-fallback-ok");
    assert.deepEqual(events.at(-1).turn.tool_calls, []);
    assert.doesNotMatch(response.text, /must-not-leak-model|test-fast-model|provider|endpoint/i);
    assert.deepEqual(upstreamPaths, ["/v1/responses", "/v1/chat/completions"]);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await close(upstream);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }

  console.log("Canvas agent failover endpoint checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
