"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

let playwright;
try { playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright"); }
catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const ROOT = path.resolve(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function request(port, pathname, options = {}) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
    return response.status;
  } catch { return 0; }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

function startApp(port, dataDir, outputDir, diagnostics) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_OUTPUT_DIR: outputDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.db"),
      AI_OS_BACKUP_DIR: path.join(dataDir, "backups"),
      AI_OS_SKIP_ENV_FILE: "1",
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  return child;
}

async function waitForApp(child, port, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !(await request(port, "/api/auth/session"))) {
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(child.exitCode, null, diagnostics.join(""));
  assert.notEqual(await request(port, "/api/auth/session"), 0, diagnostics.join(""));
}

async function main() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const upstreamRequests = [];
  const upstream = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch {}
      upstreamRequests.push({ url: req.url, authorization: req.headers.authorization || "", body });
      res.setHeader("content-type", "application/json; charset=utf-8");
      if (req.method === "GET" && req.url === "/v1/models") {
        res.end(JSON.stringify({ data: [{ id: "smoke-chat" }, { id: "smoke-image" }] }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/images/generations") {
        res.end(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }] }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        res.end(JSON.stringify({ id: "chatcmpl-smoke", choices: [{ message: { role: "assistant", content: "smoke provider reply" } }], usage: { total_tokens: 3 } }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
  const upstreamPort = await listen(upstream);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-provider-browser-"));
  const outputDir = path.join(dataDir, "output");
  const diagnostics = [];
  let child = startApp(port, dataDir, outputDir, diagnostics);
  let browser;
  try {
    await waitForApp(child, port, diagnostics);
    const executablePath = [
      process.env.AI_OS_TEST_BROWSER,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const requests = [];
    page.on("request", (entry) => requests.push(new URL(entry.url()).pathname));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("#aiOsBootstrapForm [name=username]").fill("admin");
    await page.locator("#aiOsBootstrapForm [name=displayName]").fill("Admin");
    await page.locator("#aiOsBootstrapForm [name=password]").fill("browser smoke administrator password");
    await page.getByRole("button", { name: "创建超级管理员" }).click();
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.locator('[data-ai-app="settings"]').click();
    const root = page.locator("#aiOsSystemSettingsRoot");
    await root.locator('[data-settings-nav="providers"]').click();
    await root.locator('[data-settings-section="providers"]').waitFor({ state: "visible" });
    assert.equal(await root.getByText("API 监测", { exact: true }).count(), 0);
    assert.equal(await root.getByText("Agent 模型", { exact: true }).count(), 0);
    assert.equal(await root.locator('input[name="apiKey"]').inputValue(), "");
    await root.locator("[data-provider-new]").first().click();
    await root.locator('input[name="id"]').fill("smoke-provider");
    await root.locator('input[name="name"]').fill("Smoke Provider");
    await root.locator('input[name="baseUrl"]').fill(`http://127.0.0.1:${upstreamPort}/v1`);
    await root.locator('input[name="apiKey"]').fill("browser-smoke-key");
    await root.locator("[data-provider-sync]").click();
    await root.locator('[data-provider-model][data-model-id="smoke-chat"]').waitFor({ state: "visible" });
    const chatModel = root.locator('[data-provider-model][data-model-id="smoke-chat"]');
    const imageModel = root.locator('[data-provider-model][data-model-id="smoke-image"]');
    await chatModel.locator('[data-model-capability="llm.tools"]').check();
    await imageModel.locator("[data-model-protocol]").selectOption("openai-images");
    await imageModel.locator('[data-model-capability="image.generate"]').check();
    await root.locator("[data-provider-form]").getByRole("button", { name: "保存更改" }).click();
    await page.getByText("提供商已创建", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await root.locator('input[name="apiKey"]').inputValue(), "");
    await root.locator('[data-provider-model][data-model-id="smoke-chat"] [data-model-test]').click();
    await page.getByText("smoke-chat 连接正常", { exact: true }).waitFor({ state: "visible" });
    const moveUp = root.locator('[data-provider-move="up"][data-provider-id="smoke-provider"]');
    if (await moveUp.isEnabled()) await moveUp.click();
    const orderedProviders = await page.evaluate(async () => (await fetch("/api/providers")).json());
    assert.equal(orderedProviders.providers[0].id, "smoke-provider");
    await root.locator("[data-provider-fallback]").setChecked(false, { force: true });
    await root.locator("[data-provider-fallback]").setChecked(true, { force: true });

    const runtimeResults = await page.evaluate(async () => {
      async function json(pathname, body) {
        const response = await fetch(pathname, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
      }
      return {
        models: await json("/api/models"),
        chat: await json("/api/chat", { messages: [{ role: "user", content: "hello" }], model: "smoke-chat" }),
        agent: await json("/api/canvas-agent/turn", { prompt: "summarize this canvas", canvas: { id: "smoke-board", title: "Smoke", selected_node_ids: [], nodes: [], connections: [] }, vision_images: [], step: 0 }),
        image: await json("/api/images", { prompt: "one pixel", model: "custom:smoke-provider:c21va2UtaW1hZ2U", size: "1024x1024", resolution: "1k", count: 1 }),
      };
    });
    assert.equal(runtimeResults.models.status, 200);
    assert.ok(runtimeResults.models.data.models.some((model) => model.id === "smoke-chat"));
    assert.equal(runtimeResults.chat.status, 200, JSON.stringify(runtimeResults.chat.data));
    assert.match(runtimeResults.chat.data.text || "", /smoke provider reply/);
    assert.equal(runtimeResults.agent.status, 200, JSON.stringify(runtimeResults.agent.data));
    assert.equal(runtimeResults.image.status, 200, JSON.stringify(runtimeResults.image.data));
    assert.ok(upstreamRequests.every((entry) => entry.authorization === "Bearer browser-smoke-key"));
    await root.locator('input[name="enabled"]').setChecked(false, { force: true });
    await root.getByRole("button", { name: "保存更改" }).click();
    await page.waitForFunction(async () => (await (await fetch("/api/providers")).json()).providers.find((provider) => provider.id === "smoke-provider")?.enabled === false);
    await root.locator('input[name="enabled"]').setChecked(true, { force: true });
    await root.getByRole("button", { name: "保存更改" }).click();
    await page.waitForFunction(async () => (await (await fetch("/api/providers")).json()).providers.find((provider) => provider.id === "smoke-provider")?.enabled === true);
    await root.locator('[data-settings-nav="appearance"]').click();
    await root.locator('[data-settings-theme="dark"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

    const createdUser = await page.evaluate(async () => {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ordinary", displayName: "Ordinary User" }) });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(createdUser.status, 201, JSON.stringify(createdUser.data));
    await page.locator("#aiOsUserMenu").click();
    await page.locator("#aiOsLogout").click();
    await page.locator("#aiOsLoginForm [name=username]").fill("ordinary");
    await page.locator("#aiOsLoginForm [name=password]").fill(createdUser.data.temporaryPassword);
    await page.getByRole("button", { name: "登录 AI OS" }).click();
    await page.locator("#aiOsPasswordForm [name=currentPassword]").fill(createdUser.data.temporaryPassword);
    await page.locator("#aiOsPasswordForm [name=newPassword]").fill("ordinary browser smoke password");
    await page.getByRole("button", { name: "更新密码" }).click();
    await page.locator("#aiOsPasswordDialog").waitFor({ state: "hidden" });
    await page.locator('[data-ai-app="settings"]').click();
    assert.equal(await root.locator('[data-settings-nav="providers"]').count(), 0);
    assert.equal(await root.locator('[data-settings-nav="host"]').count(), 0);
    const ordinaryProviderStatus = await page.evaluate(async () => (await fetch("/api/providers")).status);
    assert.equal(ordinaryProviderStatus, 403);
    await root.locator('[data-settings-theme="light"]').click();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");

    await page.locator("#aiOsUserMenu").click();
    await page.locator("#aiOsLogout").click();
    await page.locator("#aiOsLoginForm [name=username]").fill("admin");
    await page.locator("#aiOsLoginForm [name=password]").fill("browser smoke administrator password");
    await page.getByRole("button", { name: "登录 AI OS" }).click();
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

    await stopChild(child);
    diagnostics.push("\n--- restart ---\n");
    child = startApp(port, dataDir, outputDir, diagnostics);
    await waitForApp(child, port, diagnostics);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator('[data-ai-app="settings"]').click();
    await root.locator('[data-settings-nav="providers"]').click();
    await root.locator('[data-provider-select="smoke-provider"]').click();
    assert.equal(await root.locator('input[name="apiKey"]').inputValue(), "");
    const retiredRequest = requests.find((pathname) => pathname.startsWith("/api/settings/providers/") || pathname === "/api/settings/agent-candidates");
    assert.equal(retiredRequest, undefined, `browser requested retired control plane: ${retiredRequest}`);
    console.log("Provider browser smoke checks passed.");
  } finally {
    await browser?.close();
    await stopChild(child);
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
