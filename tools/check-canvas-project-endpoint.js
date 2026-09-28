"use strict";

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

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-project-endpoint-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: root,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 100; i += 1) {
      try {
        const response = await requestJson(port, "/api/canvas/projects");
        if (response.status === 200) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const createdProject = await requestJson(port, "/api/canvas/projects", {
      method: "POST",
      body: { id: "project-endpoint", name: "  设计   项目  " },
    });
    assert.equal(createdProject.status, 201);
    assert.equal(createdProject.data.project.name, "设计 项目");
    const createdBoard = await requestJson(port, "/api/canvas/boards", {
      method: "POST",
      body: { id: "board-endpoint-project", projectId: "project-endpoint", title: "项目画布" },
    });
    assert.equal(createdBoard.status, 201);
    assert.equal(createdBoard.data.projectId, "project-endpoint");
    const projects = await requestJson(port, "/api/canvas/projects");
    assert.equal(projects.status, 200);
    assert.ok(projects.data.projects.some((project) => project.id === "project-endpoint" && project.canvasCount === 1));
    const filtered = await requestJson(port, "/api/canvas/boards?projectId=project-endpoint");
    assert.deepEqual(filtered.data.boards.map((board) => board.id), ["board-endpoint-project"]);
    const renamed = await requestJson(port, "/api/canvas/projects/project-endpoint", {
      method: "PATCH",
      body: { name: "新名称" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.project.name, "新名称");
    const secondProject = await requestJson(port, "/api/canvas/projects", { method: "POST", body: { id: "project-endpoint-2", name: "第二项目" } });
    assert.equal(secondProject.status, 201);
    const moved = await requestJson(port, "/api/canvas/boards/board-endpoint-project/project", { method: "PATCH", body: { projectId: "project-endpoint-2" } });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.projectId, "project-endpoint-2");
    const resources = await requestJson(port, "/api/resources?type=canvas");
    const boardResource = resources.data.resources.find((item) => item.resource.refId === "board-endpoint-project");
    assert.equal(boardResource.resource.workspaceId, "project-endpoint-2");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("Canvas project endpoint checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
