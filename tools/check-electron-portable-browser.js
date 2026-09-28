"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const ROOT = path.resolve(__dirname, "..");
const packageRoot = path.resolve(process.argv[2] || path.join(ROOT, "dist/AI-OS-Portable-win-x64"));
const account = { username: "portable-test", displayName: "Portable test", password: "temporary-portable-test-password" };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const value = probe.address().port; await new Promise(resolve => probe.close(resolve)); return value;
}
async function waitUntil(check, label) {
  let last;
  for (let i = 0; i < 150; i++) { try { const result = await check(); if (result) return result; } catch (error) { last = error; } await delay(200); }
  throw new Error(`${label}: ${last?.message || "timed out"}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-portable-browser-"));
  const oldRoot = path.join(temp, "旧项目"), qaRoot = path.join(temp, "AI OS 中文 测试");
  const artifacts = path.join(ROOT, "artifacts/electron-portable");
  fs.mkdirSync(oldRoot, { recursive: true }); fs.mkdirSync(artifacts, { recursive: true });
  let oldServer, browser, page, diagnostics, launcher;
  try {
    assert.ok(fs.existsSync(path.join(packageRoot, "AI OS.exe")), "build a portable package first");
    const copy = (from, to) => {
      if (fs.statSync(from).isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
      } else { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
    };
    copy(packageRoot, qaRoot);
    const oldPort = await port(), origin = `http://127.0.0.1:${oldPort}`;
    oldServer = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
      cwd: ROOT, windowsHide: true, stdio: "ignore", env: { ...process.env, PORT: String(oldPort), HOST: "127.0.0.1",
        AI_OS_DATA_DIR: path.join(oldRoot, "data"), AI_OS_OUTPUT_DIR: path.join(oldRoot, "output"), AI_OS_SKIP_ENV_FILE: "1",
        CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false" },
    });
    await waitUntil(async () => (await fetch(origin + "/api/system/health")).ok, "legacy fixture server");
    const request = await playwright.request.newContext({ baseURL: origin });
    assert.ok((await request.post("/api/auth/bootstrap", { data: account })).ok());
    assert.ok((await request.post("/api/auth/login", { data: account })).ok());
    const png = await require("sharp")({ create: { width: 320, height: 240, channels: 3, background: "#dca71d" } }).png().toBuffer();
    const uploaded = await request.post("/api/upload-image", { data: png, headers: { "content-type": "image/png", "x-file-name": encodeURIComponent("迁移图片.png") } });
    assert.ok(uploaded.ok()); const media = await uploaded.json();
    assert.ok((await request.post("/api/canvas/boards", { data: { id: "portable-fixture", title: "迁移画布" } })).ok());
    assert.ok((await request.post("/api/canvas/boards/portable-fixture/operations", { data: { baseRevision: 0, operations: [
      { operationId: "image", entityId: "image", type: "node.upsert", after: { id: "image", kind: "image", x: 120, y: 170, width: 320, height: 240, imageSrc: media.url } },
      { operationId: "text", entityId: "text", type: "node.upsert", after: { id: "text", kind: "text", x: 190, y: 180, width: 320, height: 240, text: "迁移后可编辑" } },
    ] } })).ok());
    await request.dispose(); await stop(oldServer); oldServer = null;
    fs.writeFileSync(path.join(oldRoot, ".env"), "CANVAS_AGENT_USE_SETTINGS_PROVIDERS=false\nPORT=3138\n");
    fs.mkdirSync(path.join(oldRoot, "workflows"), { recursive: true });
    fs.writeFileSync(path.join(oldRoot, "workflows", "custom-workflow.json"), '{"custom":true}');
    const runPort = await port(), debugPort = await port();
    launcher = spawn(path.join(qaRoot, "AI OS.exe"), ["--hidden", "--import-from", oldRoot, `--remote-debugging-port=${debugPort}`], {
      cwd: temp, windowsHide: true, stdio: "ignore", env: { ...process.env, PORT: String(runPort), CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false" },
    });
    const diagPath = path.join(qaRoot, "data/.logs/runtime-diagnostics.json");
    diagnostics = await waitUntil(() => fs.existsSync(diagPath) && JSON.parse(fs.readFileSync(diagPath, "utf8")), "packaged desktop startup and migration");
    assert.equal(fs.realpathSync.native(diagnostics.dataDirectory), fs.realpathSync.native(path.join(qaRoot, "data")));
    assert.equal(diagnostics.isPackaged, true);
    assert.ok(fs.realpathSync.native(diagnostics.nodeExecutable).startsWith(fs.realpathSync.native(path.join(qaRoot, ".ai-runtime")) + path.sep));
    assert.deepEqual(fs.readFileSync(path.join(qaRoot, "data/.env")), fs.readFileSync(path.join(oldRoot, ".env")));
    assert.equal(JSON.parse(fs.readFileSync(path.join(qaRoot, "data/workflows/custom-workflow.json"))).custom, true);
    assert.deepEqual(fs.readdirSync(qaRoot).sort(), [".ai-runtime", "AI OS.exe", "ai-os-portable.json", "data"].sort());
    browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    page = browser.contexts()[0].pages().find(item => item.url().startsWith("http:"));
    assert.ok(page, "the packaged Electron renderer must load AI OS");
    await page.evaluate(() => window.aiOsHost.openSystem());
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    assert.ok((await page.request.post(diagnostics.localUrl + "/api/auth/login", { data: account })).ok(), "migrated account must log in");
    await page.reload({ waitUntil: "networkidle" });
    const loaded = await page.request.get(diagnostics.localUrl + media.url);
    assert.deepEqual(await loaded.body(), png, "migrated relative media URL must serve identical image bytes");
    await page.locator('[data-ai-app="canvas"]').click();
    await page.evaluate(() => openCanvasBoardFromHistory({ id: "portable-fixture", title: "迁移画布" }));
    await page.waitForFunction(() => canvasVirtualStore.get("image") && canvasVirtualStore.get("text"));
    await require("./check-canvas-motion-regressions")(page);
    await require("./check-canvas-node-front-browser")(page);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(artifacts, "portable-electron.png") });
    fs.writeFileSync(path.join(artifacts, "runtime-diagnostics.json"), JSON.stringify(diagnostics, null, 2));
    console.log("PASS root EXE, Chinese/space paths, bundled Node, first-run legacy import, login, media, custom workflows, 12 node types and dense canvas in real Electron");
    console.log(JSON.stringify({ electron: diagnostics.versions.electron, chrome: diagnostics.versions.chrome, gpu: diagnostics.gpuFeatureStatus }));
  } catch (error) {
    console.error("Portable integration failure:", error);
    throw error;
  } finally {
    try { if (page && !page.isClosed()) await page.evaluate(() => window.aiOsHost.quit()); } catch {}
    await browser?.close(); await stop(oldServer);
    if (diagnostics?.pid) {
      try { await waitUntil(() => { try { process.kill(diagnostics.pid, 0); return false; } catch { return true; } }, "desktop shutdown"); }
      catch { try { process.kill(diagnostics.pid); } catch {} }
    }
    if (!diagnostics && launcher?.pid) await stop(launcher);
    if (diagnostics?.serverPid) { try { process.kill(diagnostics.serverPid); } catch {} }
    // This directory was created above; never clean the supplied package or a user's project.
    if (path.dirname(temp) === os.tmpdir() && fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
