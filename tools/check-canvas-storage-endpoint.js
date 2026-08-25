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

function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: body ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      } : {},
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

async function waitFor(port, pathname, predicate, diagnostics) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await requestJson(port, pathname);
      if (predicate(response)) return response;
    } catch {
      // Server or migration may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${pathname}.\n${diagnostics.join("")}`);
}

(async () => {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-storage-endpoint-"));
  const legacyFile = path.join(directory, "canvas-boards.json");
  const databaseFile = path.join(directory, "canvas.db");
  const backupDirectory = path.join(directory, "backups");
  const legacyBoard = {
    id: "legacy-endpoint",
    title: "Legacy endpoint",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [
      { id: "legacy-n1", kind: "text", x: -500, y: 0, width: 200, height: 100, text: "old" },
      { id: "legacy-n2", kind: "image", x: 0, y: 0, width: 200, height: 100, imageSrc: "/old.png" },
    ],
    connections: [{ from: "legacy-n1", to: "legacy-n2" }],
  };
  const legacyBytes = Buffer.from(JSON.stringify([legacyBoard], null, 2));
  fs.writeFileSync(legacyFile, legacyBytes);
  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      CANVAS_DB_FILE: databaseFile,
      CANVAS_LEGACY_FILE: legacyFile,
      CANVAS_BACKUP_DIR: backupDirectory,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    await waitFor(port, "/api/models", (response) => response.status === 200, diagnostics);
    const listed = await requestJson(port, "/api/canvas/boards");
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.data.boards.map((board) => board.id), ["legacy-endpoint"]);
    assert.equal(listed.data.boards[0].nodeCount, 2);
    assert.equal(listed.data.boards[0].nodes, undefined);

    const migrationStart = await requestJson(
      port,
      "/api/canvas/boards/legacy-endpoint/viewport?left=-1000&top=-500&right=500&bottom=500&scale=1&nodeLimit=9000",
    );
    assert.equal(migrationStart.status, 202);
    assert.equal(migrationStart.data.state, "migrating");
    assert.ok(migrationStart.data.progress);

    const metadata = await waitFor(
      port,
      "/api/canvas/boards/legacy-endpoint/meta",
      (response) => response.status === 200 && response.data.migrationState === "active",
      diagnostics,
    );
    assert.equal(metadata.data.nodeCount, 2);
    assert.equal(metadata.data.connectionCount, 1);
    const migratedPage = await requestJson(
      port,
      "/api/canvas/boards/legacy-endpoint/viewport?left=-1000&top=-500&right=500&bottom=500&scale=1&nodeLimit=9000&connectionLimit=9000&generation=7",
    );
    assert.equal(migratedPage.status, 200);
    assert.equal(migratedPage.data.nodes.length, 2);
    assert.equal(migratedPage.data.connections.length, 1);
    assert.deepEqual(fs.readFileSync(legacyFile), legacyBytes);
    assert.ok(fs.readdirSync(backupDirectory).some((name) => name.includes(".bak-")));

    const created = await requestJson(port, "/api/canvas/boards", {
      method: "POST",
      body: { id: "new-endpoint", title: "New endpoint", viewport: { x: 0, y: 0, scale: 1 } },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.id, "new-endpoint");

    const malformed = await requestJson(port, "/api/canvas/boards/new-endpoint/operations", {
      method: "POST",
      body: { baseRevision: 0, operations: [{ operationId: "bad", type: "unknown" }] },
    });
    assert.equal(malformed.status, 400);

    const applied = await requestJson(port, "/api/canvas/boards/new-endpoint/operations", {
      method: "POST",
      body: {
        baseRevision: 0,
        operations: [{
          operationId: "create-node",
          type: "node.upsert",
          entityId: "n1",
          before: null,
          after: { id: "n1", kind: "text", x: 0, y: 0, width: 100, height: 100, text: "new" },
        }],
      },
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.boardRevision, 1);

    const stale = await requestJson(port, "/api/canvas/boards/new-endpoint/operations", {
      method: "POST",
      body: {
        baseRevision: 0,
        operations: [{
          operationId: "stale-node",
          type: "node.delete",
          entityId: "n1",
          before: { id: "n1" },
          after: null,
        }],
      },
    });
    assert.equal(stale.status, 409);

    const trashed = await requestJson(port, "/api/canvas/boards/new-endpoint/trash", {
      method: "POST",
      body: { operationId: "trash-new" },
    });
    assert.equal(trashed.status, 200);
    assert.ok(trashed.data.deletedAt);
    const afterTrash = await requestJson(port, "/api/canvas/boards");
    assert.ok(afterTrash.data.trash.some((board) => board.id === "new-endpoint"));

    const restored = await requestJson(port, "/api/canvas/boards/new-endpoint/restore", {
      method: "POST",
      body: { operationId: "restore-new" },
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.deletedAt, "");
    assert.equal(fs.existsSync(databaseFile), true);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }

  console.log("Canvas storage endpoint checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
