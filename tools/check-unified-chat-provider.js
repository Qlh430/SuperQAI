"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PRIMARY_KEY = "sk-chat-primary-secret";
const SECONDARY_KEY = "sk-chat-secondary-secret";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
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
  return { response, status: response.status, text, data };
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Unified chat server exited (${child.exitCode}).\n${diagnostics.join("")}`);
    try { return await request(port, "/api/system/health"); }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error(`Timed out waiting for unified chat server.\n${diagnostics.join("")}`);
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

(async () => {
  let primaryShouldFail = false;
  const upstreamCalls = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const providerId = req.url.startsWith("/primary/") ? "primary" : "secondary";
      upstreamCalls.push({ providerId, url: req.url, authorization: req.headers.authorization, body });
      if (providerId === "primary" && primaryShouldFail) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "primary unavailable" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { role: "assistant", content: providerId === "primary" ? "executor reply" : "fallback reply" } }],
        usage: { total_tokens: 3 },
      }));
    });
  });
  const upstreamPort = await listen(upstream);
  const appPortProbe = http.createServer();
  const appPort = await listen(appPortProbe);
  await close(appPortProbe);
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-unified-chat-"));
  fs.writeFileSync(path.join(dataDirectory, "settings.json"), JSON.stringify({
    providers: [
      {
        id: "primary",
        name: "Primary",
        baseUrl: `http://127.0.0.1:${upstreamPort}/primary/v1`,
        apiKey: PRIMARY_KEY,
        enabled: true,
        models: [{ id: "chat-primary", alias: "Chat Primary", capabilities: ["text", "vision"] }],
      },
      {
        id: "secondary",
        name: "Secondary",
        baseUrl: `http://127.0.0.1:${upstreamPort}/secondary/v1`,
        apiKey: SECONDARY_KEY,
        enabled: true,
        models: [{ id: "chat-secondary", alias: "Chat Secondary", capabilities: ["text", "vision"] }],
      },
    ],
  }));
  fs.writeFileSync(path.join(dataDirectory, "provider-runtime-history.json"), JSON.stringify({
    providers: {
      primary: [{ state: "offline", errorRate: 1, latencyMs: 999999, checkedAt: new Date().toISOString() }],
      secondary: [{ state: "online", errorRate: 0, latencyMs: 1, checkedAt: new Date().toISOString() }],
    },
  }));
  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDirectory,
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_SKIP_ENV_FILE: "1",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
      PROVIDER_MONITORING_INTERVAL_MINUTES: "1440",
      AI_API_KEY: "",
      GEMINI_API_KEY: "",
      BAILIAN_API_KEY: "",
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
    await waitForServer(appPort, child, diagnostics);
    const firstCatalog = await request(appPort, "/api/models");
    assert.equal(firstCatalog.status, 200, firstCatalog.text);
    assert.deepEqual(firstCatalog.data.models.map((item) => item.id), ["chat-primary", "chat-secondary"]);
    assert.equal(firstCatalog.data.defaultModel, "chat-primary");
    assert.equal(/apiKey|baseUrl|apiKeyMasked|protocol/i.test(JSON.stringify(firstCatalog.data)), false);

    const secondCatalog = await request(appPort, "/api/models");
    assert.deepEqual(secondCatalog.data.models.map((item) => item.id), ["chat-primary", "chat-secondary"]);

    const visionCatalog = await request(appPort, "/api/vision-models");
    assert.equal(visionCatalog.status, 200, visionCatalog.text);
    assert.deepEqual(visionCatalog.data.models.map((item) => item.id), ["chat-primary", "chat-secondary"]);
    assert.equal(/apiKey|baseUrl|apiKeyMasked|protocol/i.test(JSON.stringify(visionCatalog.data)), false);

    const imageCatalog = await request(appPort, "/api/image-models");
    assert.equal(imageCatalog.status, 200, imageCatalog.text);
    assert.deepEqual(imageCatalog.data.models, []);
    assert.equal(/apiKey|baseUrl|apiKeyMasked|protocol/i.test(JSON.stringify(imageCatalog.data)), false);

    const chat = await request(appPort, "/api/chat", {
      method: "POST",
      body: { messages: [{ role: "user", content: "hello" }] },
    });
    assert.equal(chat.status, 200, chat.text);
    assert.equal(chat.data.text, "executor reply");
    assert.equal(chat.data.selection.providerId, "primary");
    assert.equal(upstreamCalls.at(-1).body.model, "chat-primary");
    assert.equal(upstreamCalls.at(-1).authorization, `Bearer ${PRIMARY_KEY}`);

    primaryShouldFail = true;
    upstreamCalls.length = 0;
    const pinned = await request(appPort, "/api/chat", {
      method: "POST",
      body: { providerId: "primary", model: "chat-primary", messages: [{ role: "user", content: "pinned" }] },
    });
    assert.equal(pinned.status, 503, pinned.text);
    assert.deepEqual(upstreamCalls.map((call) => call.providerId), ["primary"]);

    upstreamCalls.length = 0;
    const fallback = await request(appPort, "/api/chat", {
      method: "POST",
      body: { messages: [{ role: "user", content: "fallback" }] },
    });
    assert.equal(fallback.status, 200, fallback.text);
    assert.equal(fallback.data.text, "fallback reply");
    assert.equal(fallback.data.selection.providerId, "secondary");
    assert.deepEqual(upstreamCalls.map((call) => call.providerId), ["primary", "secondary"]);
    assert.equal(fallback.text.includes(PRIMARY_KEY), false);
    assert.equal(fallback.text.includes(SECONDARY_KEY), false);

    const scriptSource = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
    assert.equal(scriptSource.includes("/api/settings/providers/key"), false);
    assert.doesNotMatch(scriptSource, /data\.apiKey\s*\|\|/);

    console.log("Unified chat Provider checks passed.");
  } finally {
    await stopChild(child);
    await close(upstream);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
