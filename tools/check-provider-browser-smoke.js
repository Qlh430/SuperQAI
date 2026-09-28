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
      upstreamRequests.push({ url: req.url, authorization: req.headers.authorization || req.headers["x-goog-api-key"] || "", body });
      res.setHeader("content-type", "application/json; charset=utf-8");
      if (req.method === "GET" && req.url === "/v1/models") {
        res.end(JSON.stringify({ data: ["smoke-chat", "smoke-image", "gemini-3-pro-image-preview", "claude-sonnet-4", "text-embedding-3-large"].map(id => ({ id })) }));
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
    if (await root.locator('input[name="apiKey"]').count()) assert.equal(await root.locator('input[name="apiKey"]').inputValue(), "");
    await root.locator("[data-provider-new]").first().click();
    const smokeProviderId = await root.locator('input[name="id"]').inputValue();
    assert.ok(smokeProviderId, "new providers receive an internal ID automatically");
    assert.equal(await root.locator('input[name="id"]').isVisible(), false);
    await root.locator('input[name="name"]').fill("Smoke Provider");
    await root.locator('input[name="baseUrl"]').fill(`http://127.0.0.1:${upstreamPort}/v1/images/generations`);
    await root.locator('input[name="apiKey"]').fill("browser-smoke-key");
    await root.locator('select[name="protocol"]').selectOption("gemini");
    const geminiVerification = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/providers/verify-protocol";
      }),
      root.locator("[data-provider-verify]").click(),
    ]).then(([response]) => response);
    assert.equal(geminiVerification.status(), 200, "verification diagnostics are actionable results");
    const geminiDiagnostic = await geminiVerification.json();
    assert.equal(geminiDiagnostic.available, false, "an incompatible selected protocol is not reported available");
    assert.equal(geminiDiagnostic.recommendedProtocol, "openai");
    assert.equal(await root.locator('select[name="protocol"]').inputValue(), "gemini", "verification must not silently replace the selected protocol");
    await root.locator('[data-provider-use-protocol="openai"]').waitFor({ state: "visible" });
    assert.match(await root.locator('[data-provider-status]').textContent(), /模型目录/);

    await root.locator('select[name="protocol"]').selectOption("openai");
    const openaiVerification = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/providers/verify-protocol" && response.status() === 200;
      }),
      root.locator("[data-provider-verify]").click(),
    ]).then(([response]) => response);
    assert.equal(openaiVerification.status(), 200);
    await page.waitForFunction(expected => document.querySelector('#aiOsSystemSettingsRoot input[name="baseUrl"]')?.value === expected, `http://127.0.0.1:${upstreamPort}/v1`);
    assert.equal(await root.locator('input[name="baseUrl"]').inputValue(), `http://127.0.0.1:${upstreamPort}/v1`);
    await root.locator('select[name="networkMode"]').selectOption("direct");
    const initialModelSync = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/providers/models"),
      root.locator("[data-provider-sync]").click(),
    ]).then(([response]) => response);
    assert.equal(initialModelSync.status(), 200, await initialModelSync.text());
    await root.locator("[data-model-discovery]").waitFor({ state: "visible" });
    assert.equal(await root.locator('[data-provider-model][data-model-id="smoke-chat"]').count(), 0, "discovery must not persist every fetched model automatically");
    await root.locator('[data-discovered-model="smoke-chat"]').check();
    await root.locator('[data-discovered-model="smoke-image"]').check();
    await root.locator("[data-model-discovery-add]").click();
    await root.locator('[data-provider-model][data-model-id="smoke-chat"]').waitFor({ state: "visible" });
    const chatModel = root.locator('[data-provider-model][data-model-id="smoke-chat"]');
    const imageModel = root.locator('[data-provider-model][data-model-id="smoke-image"]');
    await chatModel.locator('.settings-model-details > summary').click();
    await chatModel.locator('[data-model-capability="llm.tools"]').check();
    assert.equal(await imageModel.locator("[data-model-protocol]").inputValue(), "openai");
    assert.equal(await imageModel.locator('[data-model-capability="image.generate"]').isChecked(), true);
    assert.equal(await imageModel.locator('[data-model-capability="llm.chat"]').isChecked(), false);
    await root.locator('[data-new-model-id]').fill("nano-banana-pro");
    await root.locator('[data-model-add]').click();
    await root.locator('[data-provider-model][data-model-id="nano-banana-pro"]').waitFor();
    assert.equal(await root.locator('[data-model-id="nano-banana-pro"] [data-model-protocol]').inputValue(), "openai");
    await chatModel.locator('.settings-model-details > summary').click();
    await chatModel.locator('[data-model-capability="llm.tools"]').check();
    const savedModelCountBeforeDiscovery = await root.locator("[data-provider-model]").count();
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/providers/models" && response.status() === 200),
      root.locator('[data-provider-sync]').click(),
    ]);
    await root.locator("[data-model-discovery]").waitFor({ state: "visible" });
    const discovery = root.locator("[data-model-discovery]");
    assert.equal(await discovery.locator("[data-discovery-selected]").textContent(), "已选择 2 个");
    await discovery.locator("[data-discovery-search]").fill("smoke");
    assert.equal(await discovery.locator('[data-discovered-model="smoke-chat"]').isChecked(), true);
    assert.equal(await discovery.locator('[data-discovered-model="smoke-image"]').isChecked(), true);
    assert.equal(await discovery.locator("[data-discovery-selected]").textContent(), "已选择 2 个");
    await discovery.locator('[data-discovery-filter="image"]').click();
    assert.equal(await discovery.locator('[data-discovered-model="smoke-image"]').isChecked(), true);
    assert.equal(await discovery.locator('[data-discovered-model="smoke-chat"]').isChecked(), true);
    assert.equal(await discovery.locator("[data-discovery-selected]").textContent(), "已选择 2 个");
    await discovery.locator("[data-model-discovery-cancel]").click();
    await root.locator("[data-model-discovery]").waitFor({ state: "hidden" });
    assert.equal(await root.locator("[data-provider-model]").count(), savedModelCountBeforeDiscovery);
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/providers/models" && response.status() === 200),
      root.locator('[data-provider-sync]').click(),
    ]);
    await root.locator("[data-model-discovery]").waitFor({ state: "visible" });
    assert.equal(await root.locator('[data-discovered-model="smoke-chat"]').isChecked(), true);
    assert.equal(await root.locator('[data-discovered-model="smoke-image"]').isChecked(), true);
    assert.equal(await root.locator('[data-discovered-model="gemini-3-pro-image-preview"]').isChecked(), false);
    await root.locator('[data-discovered-model="smoke-chat"]').uncheck();
    await root.locator('[data-discovered-model="smoke-image"]').uncheck();
    assert.equal(await root.locator("[data-model-discovery-add]").isDisabled(), true);
    await root.locator('[data-discovered-model="smoke-chat"]').check();
    assert.equal(await root.locator("[data-model-discovery-add]").isDisabled(), false);
    await root.locator('[data-discovered-model="gemini-3-pro-image-preview"]').check();
    await root.locator('[data-discovered-model="claude-sonnet-4"]').check();
    await root.locator('[data-discovered-model="text-embedding-3-large"]').check();
    await root.locator("[data-model-discovery-add]").click();
    await root.locator('select[name="protocol"]').selectOption("gemini");
    await page.waitForFunction(() => document.querySelector('#aiOsSystemSettingsRoot [data-model-id="claude-sonnet-4"] [data-model-protocol]')?.value === "gemini");
    await root.locator('select[name="protocol"]').selectOption("openai");
    await page.waitForFunction(() => document.querySelector('#aiOsSystemSettingsRoot [data-model-id="claude-sonnet-4"] [data-model-protocol]')?.value === "openai");
    assert.equal(await root.locator('[data-model-id="claude-sonnet-4"] [data-model-protocol]').inputValue(), "openai");
    // Switching protocols re-infers capabilities; restore the Agent fixture's tools capability.
    await chatModel.locator('.settings-model-details > summary').click();
    await chatModel.locator('[data-model-capability="llm.tools"]').check();
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/providers/models" && response.status() === 200),
      root.locator('[data-provider-sync]').click(),
    ]);
    await root.locator("[data-model-discovery]").waitFor({ state: "visible" });
    await root.locator("[data-model-discovery-cancel]").click();
    assert.equal(await chatModel.locator('[data-model-capability="llm.tools"]').isChecked(), true, "fetching a catalog preserves configured model capabilities");
    const existingCanvasNodeId = await page.evaluate(() => {
      const node = addCanvasApiNode(getCanvasViewportCenterPoint());
      return node.dataset.id;
    });
    await root.locator("[data-provider-form]").getByRole("button", { name: "保存更改" }).click();
    await page.getByText("提供商已创建", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await root.locator('input[name="apiKey"]').inputValue(), "");
    await page.waitForFunction(() => [...document.querySelectorAll("#imageModel option")]
      .some((option) => option.value.includes("c21va2UtaW1hZ2U") || option.textContent.includes("smoke-image")));
    const savedImageModelId = await page.evaluate(() => [...document.querySelectorAll("#imageModel option")]
      .find((option) => option.value.includes("c21va2UtaW1hZ2U") || option.textContent.includes("smoke-image"))?.value || "");
    assert.ok(savedImageModelId, "saving a provider must update the canvas image catalog without a reload");
    assert.equal(await page.evaluate(({ nodeId, modelId }) => {
      const node = document.querySelector(`.canvas-node-image[data-id="${nodeId}"]`);
      return Boolean(node && [...node.querySelectorAll(".canvas-node-model option")].some((option) => option.value === modelId));
    }, { nodeId: existingCanvasNodeId, modelId: savedImageModelId }), true, "saving a provider must refresh model selects on canvas nodes that already exist");
    const canvasParameterFields = await page.evaluate((modelId) => {
      if (typeof addCanvasApiNode !== "function") return ["missing-addCanvasApiNode"];
      const node = addCanvasApiNode({ x: 2400, y: 1800 });
      const select = node.querySelector(".canvas-node-model");
      if (!select || ![...select.options].some((option) => option.value === modelId)) return ["missing-model-option"];
      // The model picker flips the node to an exact model before dispatching
      // change. Setting the option alone would leave it on 自动选择, which now
      // renders no per-model protocol fields on purpose.
      select.dataset.modelSelection = "exact";
      node.dataset.modelSelection = "exact";
      select.value = modelId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return [...node.querySelectorAll("[data-canvas-model-param]")].map((control) => control.dataset.canvasModelParam);
    }, savedImageModelId);
    assert.deepEqual(canvasParameterFields, ["quality"], "canvas node controls must follow the selected model parameters");
    const uiTestRequestStart = upstreamRequests.length;
    await root.locator('[data-provider-model][data-model-id="smoke-chat"] [data-model-test]').click();
    const chatTest = root.locator("dialog.settings-test-dialog");
    await chatTest.waitFor({ state: "visible" });
    await chatTest.locator("[data-test-prompt]").fill("hello");
    await chatTest.locator("[data-test-send]").click();
    await chatTest.getByText(/对话测试成功/).waitFor({ state: "visible" });
    await chatTest.locator("[data-test-close]").click();
    await root.locator('[data-provider-model][data-model-id="smoke-image"] [data-model-test]').click();
    const imageTest = root.locator("dialog.settings-test-dialog");
    await imageTest.waitFor({ state: "visible" });
    await imageTest.locator("[data-test-prompt]").fill("one pixel");
    await imageTest.locator("[data-test-send]").click();
    await imageTest.getByText(/图片生成成功/).waitFor({ state: "visible" });
    await imageTest.locator("[data-test-close]").click();
    const uiTestRequests = upstreamRequests.slice(uiTestRequestStart);
    assert.ok(uiTestRequests.some(entry => entry.url === "/v1/chat/completions"), "the LLM test must reach the chat completion endpoint");
    assert.ok(uiTestRequests.some(entry => entry.url === "/v1/images/generations"), "the image test must reach the image generation endpoint");
    const moveUp = root.locator(`[data-provider-move="up"][data-provider-id="${smokeProviderId}"]`);
    if (await moveUp.isEnabled()) await moveUp.click();
    const orderedProviders = await page.evaluate(async () => (await fetch("/api/providers")).json());
    assert.equal(orderedProviders.providers.filter(provider => String(provider.protocol || "").toLowerCase() !== "comfyui")[0]?.id, smokeProviderId);
    await root.locator("[data-provider-fallback]").setChecked(false, { force: true });
    await root.locator("[data-provider-fallback]").setChecked(true, { force: true });

    const boardCreation = await page.evaluate(async () => {
      const response = await fetch("/api/canvas/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "smoke-board", title: "Smoke" }) });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(boardCreation.status, 201, JSON.stringify(boardCreation.data));

    const runtimeResults = await page.evaluate(async (smokeProviderId) => {
      async function json(pathname, body) {
        const response = await fetch(pathname, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
      }
      return {
        models: await json("/api/models"),
        chat: await json("/api/chat", { messages: [{ role: "user", content: "hello" }], model: "smoke-chat" }),
        agent: await json("/api/canvas-agent/turn", { prompt: "summarize this canvas", canvas: { id: "smoke-board", title: "Smoke", selected_node_ids: [], nodes: [], connections: [] }, vision_images: [], step: 0 }),
        image: await json("/api/images", { prompt: "one pixel", model: `custom:${smokeProviderId}:c21va2UtaW1hZ2U`, size: "1024x1024", resolution: "1k", count: 1 }),
      };
    }, smokeProviderId);
    assert.equal(runtimeResults.models.status, 200);
    assert.ok(runtimeResults.models.data.models.some((model) => model.id === "smoke-chat"));
    assert.equal(runtimeResults.chat.status, 200, JSON.stringify(runtimeResults.chat.data));
    assert.match(runtimeResults.chat.data.text || "", /smoke provider reply/);
    assert.equal(runtimeResults.agent.status, 200, JSON.stringify(runtimeResults.agent.data));
    assert.equal(runtimeResults.image.status, 200, JSON.stringify(runtimeResults.image.data));
    assert.ok(upstreamRequests.every((entry) => ["Bearer browser-smoke-key", "browser-smoke-key"].includes(entry.authorization)));
    await root.locator('input[name="enabled"]').setChecked(false, { force: true });
    await root.getByRole("button", { name: "保存更改" }).click();
    await page.waitForFunction(async id => (await (await fetch("/api/providers")).json()).providers.find((provider) => provider.id === id)?.enabled === false, smokeProviderId);
    await root.locator('input[name="enabled"]').setChecked(true, { force: true });
    await root.getByRole("button", { name: "保存更改" }).click();
    await page.waitForFunction(async id => (await (await fetch("/api/providers")).json()).providers.find((provider) => provider.id === id)?.enabled === true, smokeProviderId);
    await root.locator('[data-settings-nav="appearance"]').click();
    await Promise.all([
      page.waitForResponse(response => {
        const request = response.request();
        return new URL(response.url()).pathname === "/api/preferences" && request.method() === "PATCH" && response.status() === 200;
      }),
      root.locator('[data-settings-theme="dark"]').click(),
    ]);
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
    await Promise.all([
      page.waitForResponse(response => {
        const request = response.request();
        return new URL(response.url()).pathname === "/api/preferences" && request.method() === "PATCH" && response.status() === 200;
      }),
      root.locator('[data-settings-theme="light"]').click(),
    ]);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");

    await page.locator("#aiOsUserMenu").click();
    await page.locator("#aiOsLogout").click();
    await page.locator("#aiOsLoginForm [name=username]").fill("admin");
    await page.locator("#aiOsLoginForm [name=password]").fill("browser smoke administrator password");
    await page.getByRole("button", { name: "登录 AI OS" }).click();
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

    await stopChild(child);
    diagnostics.push("\n--- restart ---\n");
    child = startApp(port, dataDir, outputDir, diagnostics);
    await waitForApp(child, port, diagnostics);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator('[data-ai-app="settings"]').click();
    await root.locator('[data-settings-nav="providers"]').click();
    await root.locator(`[data-provider-select="${smokeProviderId}"]`).click();
    assert.equal(await root.locator('input[name="apiKey"]').inputValue(), "");
    assert.equal(await root.locator('select[name="networkMode"]').inputValue(), "direct");
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
