"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function request(port, pathname, options = {}) {
  const isBuffer = Buffer.isBuffer(options.body);
  const body = isBuffer ? options.body : options.body === undefined ? null : Buffer.from(JSON.stringify(options.body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: {
        ...(body ? { "Content-Length": body.length } : {}),
        ...(body && !isBuffer ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try { data = JSON.parse(text || "{}"); } catch { data = text; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-asset-endpoint-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_AUTH_DISABLED: "1",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: "ignore",
  });

  try {
    let ready = false;
    for (let index = 0; index < 120; index += 1) {
      try {
        if ((await request(port, "/api/canvas/projects")).status === 200) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, "server must become ready");
    const project = await request(port, "/api/canvas/projects", { method: "POST", body: { id: "asset-endpoint-project", name: "资产接口项目" } });
    assert.equal(project.status, 201);
    const board = await request(port, "/api/canvas/boards", { method: "POST", body: { id: "asset-endpoint-board", projectId: project.data.project.id, title: "资产画布" } });
    assert.equal(board.status, 201);

    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");
    const imported = await request(port, `/api/assets/import?projectId=${encodeURIComponent(project.data.project.id)}&boardId=${encodeURIComponent(board.data.id)}`, {
      method: "POST",
      headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent("hero.png") },
      body: png,
    });
    assert.equal(imported.status, 201);
    assert.equal(imported.data.asset.kind, "image");
    assert.equal(imported.data.asset.name, "hero.png");
    assert.ok(imported.data.url.startsWith("/output/"));

    const mine = await request(port, "/api/assets?scope=mine");
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.data.items.map((item) => item.id), [imported.data.asset.id]);
    const currentProject = await request(port, `/api/assets?scope=project&projectId=${encodeURIComponent(project.data.project.id)}`);
    assert.deepEqual(currentProject.data.items.map((item) => item.id), [imported.data.asset.id]);

    const shared = await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}/share`, { method: "PATCH", body: { visibility: "all" } });
    assert.equal(shared.status, 200);
    assert.equal(shared.data.asset.visibility, "all");
    const publicAssets = await request(port, "/api/assets?scope=public");
    assert.deepEqual(publicAssets.data.items.map((item) => item.id), [imported.data.asset.id]);

    const liked = await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}/like`, { method: "PUT" });
    assert.equal(liked.data.asset.likeCount, 1);
    const likedAgain = await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}/like`, { method: "PUT" });
    assert.equal(likedAgain.data.asset.likeCount, 1);
    const favorited = await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}/favorite`, { method: "PUT" });
    assert.equal(favorited.data.asset.favorited, true);
    assert.deepEqual((await request(port, "/api/assets?scope=favorites")).data.items.map((item) => item.id), [imported.data.asset.id]);
    assert.equal((await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}/favorite`, { method: "DELETE" })).data.asset.favorited, false);
    assert.equal((await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}/like`, { method: "DELETE" })).data.asset.likeCount, 0);

    const asset = await request(port, `/api/assets/${encodeURIComponent(imported.data.asset.id)}`);
    assert.equal(asset.status, 200);
    assert.equal(asset.data.asset.id, imported.data.asset.id);
    assert.equal((await request(port, "/api/assets?scope=unknown")).status, 400);
    console.log("Asset library endpoint checks passed.");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
