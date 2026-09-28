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
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        let data;
        try { data = JSON.parse(responseBody || "{}"); } catch { data = responseBody; }
        resolve({ status: response.statusCode, data });
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Agent conversation test server exited: ${diagnostics.join("")}`);
    try {
      const response = await requestJson(port, "/api/canvas-agent/skills");
      if (response.status === 200) return;
    } catch {
      // The server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Agent conversation server: ${diagnostics.join("")}`);
}

(async () => {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await close(portProbe);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-conversation-endpoint-"));
  const diagnostics = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_OS_SKIP_ENV_FILE: "1",
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: tempDirectory,
      CANVAS_AGENT_CONVERSATIONS_FILE: path.join(tempDirectory, "conversations.json"),
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    await waitForServer(port, child, diagnostics);
    const emptyA = await requestJson(port, "/api/canvas-agent/conversation?board_id=board-a");
    assert.equal(emptyA.status, 200);
    assert.equal(emptyA.data.boardId, "board-a");
    assert.deepEqual(emptyA.data.items, []);

    // A conversation preload does not create a canvas or claim its ownership.
    assert.equal((await requestJson(port, "/api/canvas/boards", {
      method: "POST", body: { id: "board-a", title: "Conversation canvas" },
    })).status, 201);

    const created = await requestJson(port, "/api/canvas-agent/conversation", {
      method: "POST",
      body: {
        board_id: "board-a",
        expected_revision: 0,
        conversation: {
          boardId: "board-a",
          items: [{ id: "u1", role: "user", text: "你好", status: "completed" }],
        },
      },
    });
    assert.equal(created.status, 200);
    assert.equal(created.data.boardId, "board-a");
    assert.equal(created.data.revision, 1);

    const loaded = await requestJson(port, "/api/canvas-agent/conversation?board_id=board-a");
    assert.equal(loaded.data.items[0].text, "你好");
    assert.deepEqual((await requestJson(port, "/api/canvas-agent/conversation?board_id=board-b")).data.items, []);

    const conflict = await requestJson(port, "/api/canvas-agent/conversation", {
      method: "POST",
      body: { board_id: "board-a", expected_revision: 0, conversation: created.data },
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.data.code, "CONVERSATION_REVISION_CONFLICT");
    assert.equal(conflict.data.current.revision, 1);

    const removed = await requestJson(port, "/api/canvas-agent/conversation", {
      method: "DELETE",
      body: { board_id: "board-a" },
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.ok, true);
    assert.deepEqual((await requestJson(port, "/api/canvas-agent/conversation?board_id=board-a")).data.items, []);

    assert.equal((await requestJson(port, "/api/canvas-agent/conversation?board_id=../secret")).status, 400);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }

  console.log("Canvas agent conversation endpoint checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
