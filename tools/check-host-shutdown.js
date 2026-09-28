/**
 * Quitting the desktop host asks the server process to exit and waits for it.
 * That wait used to be unbounded whenever a collaboration socket was open: an
 * upgraded WebSocket is not an active HTTP request, so the HTTP server's close
 * callback never fires while the canvas editor is open, and the host only
 * recovered through its own 15s timeout.
 *
 * This check starts the real server, opens a real collaboration socket, and
 * requires the process to exit promptly after the shutdown message.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SHUTDOWN_BUDGET_MS = 4_000;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, headers: { Connection: "close" } }, response => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

(async () => {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise(resolve => portProbe.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aios-host-shutdown-"));
  fs.writeFileSync(path.join(directory, "settings.json"), JSON.stringify({ version: 1, providers: [] }));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: directory,
      SETTINGS_FILE: path.join(directory, "settings.json"),
      IMAGE_JOBS_FILE: path.join(directory, "image-jobs.json"),
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const diagnostics = [];
  child.stdout.on("data", chunk => diagnostics.push(String(chunk)));
  child.stderr.on("data", chunk => diagnostics.push(String(chunk)));

  try {
    let ready = false;
    for (let attempt = 0; attempt < 200 && !ready; attempt += 1) {
      try { ready = await request(port, "/api/system/ready") === 200; } catch { ready = false; }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, `server did not become ready\n${diagnostics.join("")}`);

    // The canvas editor keeps this socket open for as long as a board is open.
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/canvas/collab?boardId=board-shutdown&clientId=check-host-shutdown`);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error(`collaboration socket refused\n${diagnostics.join("")}`)), { once: true });
      setTimeout(() => reject(new Error("collaboration socket did not open")), 5_000).unref?.();
    });

    const started = Date.now();
    const exited = new Promise(resolve => child.once("exit", () => resolve(true)));
    child.send({ type: "ai-os.shutdown" });
    const stopped = await Promise.race([
      exited,
      new Promise(resolve => setTimeout(() => resolve(false), SHUTDOWN_BUDGET_MS)),
    ]);
    const elapsed = Date.now() - started;
    assert.equal(stopped, true, `server still running ${elapsed}ms after the shutdown message\n${diagnostics.join("")}`);
    assert.ok(elapsed < SHUTDOWN_BUDGET_MS, `server took ${elapsed}ms to exit`);
    try { socket.close(); } catch {}
    console.log(`Host shutdown checks passed (exited ${elapsed}ms after shutdown with a collaboration socket open).`);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
