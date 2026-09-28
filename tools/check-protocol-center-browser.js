"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

let playwright;
try { playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright"); }
catch { playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }
const ROOT = path.resolve(__dirname, "..");

const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

function start(port, dataDir, diagnostics) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_DATA_DIR: dataDir, AI_OS_OUTPUT_DIR: path.join(dataDir, "output"), AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.db"), AI_OS_BACKUP_DIR: path.join(dataDir, "backups"), AI_OS_SKIP_ENV_FILE: "1", OUTBOUND_NO_PROXY: "127.0.0.1,localhost" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => diagnostics.push(String(chunk)));
  child.stderr.on("data", chunk => diagnostics.push(String(chunk)));
  return child;
}

async function ready(child, port, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/auth/session`)).status) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`Isolated test app did not start: ${diagnostics.join("")}`);
}

async function main() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  const upstreamRequests = [];
  const upstream = http.createServer((req, res) => {
    upstreamRequests.push(req.url);
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Isolated protocol runtime works" } }], usage: { total_tokens: 2 } }));
      return;
    }
    res.writeHead(500); res.end("Unexpected local upstream request");
  });
  const upstreamPort = await listen(upstream);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-protocol-browser-"));
  const diagnostics = [];
  const pageErrors = [];
  let child = start(port, dataDir, diagnostics);
  let browser;
  try {
    await ready(child, port, diagnostics);
    const executablePath = [process.env.AI_OS_TEST_BROWSER, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(value => value && fs.existsSync(value));
    browser = await playwright.chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("#aiOsBootstrapForm [name=username]").fill("admin");
    await page.locator("#aiOsBootstrapForm [name=displayName]").fill("Protocol Test Admin");
    await page.locator("#aiOsBootstrapForm [name=password]").fill("protocol browser test administrator password");
    await page.getByRole("button", { name: "创建超级管理员" }).click();
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    const root = page.locator("#aiOsSystemSettingsRoot");
    const openSettings = async section => {
      await page.locator('[data-ai-app="settings"]').click();
      await root.locator(`[data-settings-nav="${section}"]`).click();
      await root.locator(`[data-settings-section="${section}"]`).waitFor();
    };
    await openSettings("protocols");
    await root.locator('[data-protocol-select="openai"]').click();
    assert.match(await root.locator(".settings-protocol-details").innerText(), /authorization/);
    const openaiPlatformDetails = await root.locator(".settings-protocol-details").innerText();
    assert.match(openaiPlatformDetails, /GET \/v1\/models/);
    assert.doesNotMatch(openaiPlatformDetails, /\/v1\/chat\/completions/);
    assert.doesNotMatch(openaiPlatformDetails, /支持能力/);
    await root.locator('[data-protocol-scope="model"]').click();
    await root.locator('[data-protocol-select="openai"]').click();
    const openaiModelDetails = await root.locator(".settings-protocol-details").innerText();
    assert.match(openaiModelDetails, /\/v1\/chat\/completions/);
    assert.match(openaiModelDetails, /仅目录，尚未接入执行器/);
    await root.locator('[data-protocol-select="midjourney"]').click();
    const midjourneyDetails = await root.locator(".settings-protocol-details").innerText();
    assert.match(midjourneyDetails, /Midjourney 专用协议/);
    assert.match(midjourneyDetails, /模型 Profile · Midjourney/);
    assert.match(midjourneyDetails, /\/v1\/midjourney\/generations/);
    assert.doesNotMatch(midjourneyDetails, /APIMart \/ Midjourney/);
    await root.locator('[data-protocol-scope="platform"]').click();
    if (process.env.AI_OS_TEST_NARROW_ONLY) {
      await page.locator('.ai-os-app-window:has(#aiOsSystemSettingsRoot) [data-window-action="maximize"]').click();
      for (const width of [620, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await root.locator(".settings-protocol-route").scrollIntoViewIfNeeded();
        const dimensions = await root.locator(".ai-os-settings-main").evaluate(element => ({ width: element.clientWidth, contentWidth: element.scrollWidth }));
        assert.ok(dimensions.contentWidth <= dimensions.width + 1, `Protocol center must fit ${width}px viewport: ${JSON.stringify(dimensions)}`);
        if (process.env.AI_OS_TEST_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.AI_OS_TEST_SCREENSHOT_DIR, { recursive: true });
          await root.screenshot({ path: path.join(process.env.AI_OS_TEST_SCREENSHOT_DIR, `protocol-center-narrow-${width}.png`) });
        }
      }
      assert.deepEqual(pageErrors, []);
      console.log("Protocol center narrow browser checks passed: 620px and 390px without horizontal overflow.");
      return;
    }

    const createProtocol = async (scope, id, label, capabilities) => {
      await root.locator(`[data-protocol-scope="${scope}"]`).click();
      await root.locator('[data-protocol-select="openai"]').click();
      await root.locator("[data-protocol-new]").click();
      const form = root.locator("[data-protocol-form]");
      await form.locator('[name="id"]').fill(id);
      await form.locator('[name="label"]').fill(label);
      await form.locator('[name="summary"]').fill("Isolated browser verification");
      if (capabilities) {
        for (const input of await form.locator("[data-protocol-capability]").all()) {
          if (await input.isEnabled()) await input.setChecked(capabilities.includes(await input.getAttribute("data-protocol-capability")), { force: true });
        }
      } else if (scope === "platform") {
        assert.equal(await form.locator("[data-protocol-capability]").count(), 0, "platform editor must not expose model capabilities");
      }
      await form.getByRole("button", { name: "保存协议" }).click();
      await root.locator(`[data-protocol-select="${id}"]`).waitFor();
      await form.waitFor({ state: "detached" });
    };
    await createProtocol("platform", "browser-platform", "Browser Platform");
    await createProtocol("model", "browser-chat-only", "Browser Chat Only", ["llm.chat"]);
    await root.locator("[data-protocol-edit]").click();
    await root.locator('[data-protocol-form] [name="label"]').fill("Browser Chat Restricted");
    await root.locator("[data-protocol-form]").getByRole("button", { name: "保存协议" }).click();
    await root.locator("[data-protocol-form]").waitFor({ state: "detached" });
    assert.match(await root.locator(".settings-protocol-details").innerText(), /Browser Chat Restricted/);

    await createProtocol("model", "browser-unused", "Unused Protocol", ["llm.chat"]);
    page.once("dialog", dialog => dialog.accept());
    await root.locator("[data-protocol-delete]").click();
    await root.locator('[data-protocol-select="browser-unused"]').waitFor({ state: "detached" });

    await root.locator('[data-settings-nav="providers"]').click();
    await root.locator("[data-provider-new]").first().click();
    const providerForm = root.locator("[data-provider-form]");
    assert.match(await providerForm.innerText(), /平台协议/);
    const platformOptions = await providerForm.locator('[name="protocol"] option').evaluateAll(items => items.map(item => item.value));
    assert.ok(platformOptions.includes("browser-platform"));
    assert.ok(!platformOptions.includes("browser-chat-only"));
    const protocolProviderId = await providerForm.locator('[name="id"]').inputValue();
    await providerForm.locator('[name="name"]').fill("Protocol Browser Provider");
    await providerForm.locator('[name="baseUrl"]').fill(`http://127.0.0.1:${upstreamPort}/v1`);
    await providerForm.locator('[name="apiKey"]').fill("isolated-no-upstream-key");
    await providerForm.locator('[name="protocol"]').selectOption("browser-platform");
    await root.locator("[data-new-model-id]").fill("gpt-4o-mini");
    await root.locator("[data-model-add]").click();
    const model = root.locator('[data-provider-model][data-model-id="gpt-4o-mini"]');
    await model.waitFor();
    // Per-model protocol and parameters live in a collapsed editor, so it is
    // expanded before any of those controls are touched.
    await model.locator("details.settings-model-details > summary").click();
    const modelOptions = await model.locator("[data-model-protocol] option").evaluateAll(items => items.map(item => item.value));
    assert.ok(modelOptions.includes("browser-chat-only"));
    assert.ok(!modelOptions.includes("browser-platform"));
    assert.match(await model.locator('[data-model-protocol] option[value="browser-chat-only"]').evaluate(element => element.textContent), /Browser Chat Restricted/);
    await model.locator("[data-model-protocol]").selectOption("openai");
    assert.equal(await model.locator('[data-model-capability="image.generate"]').isChecked(), true);
    assert.equal(await model.locator('[data-model-capability="llm.chat"]').isChecked(), true);
    await model.locator("[data-model-protocol]").selectOption("browser-chat-only");
    assert.equal(await model.locator('[data-model-capability="llm.chat"]').isChecked(), true);
    assert.equal(await model.locator('[data-model-capability="llm.tools"]').isChecked(), false);
    await providerForm.getByRole("button", { name: "保存更改" }).click();
    await root.locator(`[data-provider-select="${protocolProviderId}"]`).waitFor();

    const cliCalls = [];
    let cliState = { state: "ready-signed-out", executable: "C:\\tools\\dreamina.exe", version: "1.2.0", signedIn: false, account: "", credits: null };
    let releaseCliPoll;
    let pollReceived;
    let holdPoll = new Promise(resolve => { pollReceived = resolve; });
    await page.route("**/api/jimeng-cli/*", async intercepted => {
      const action = new URL(intercepted.request().url()).pathname.split("/").pop();
      cliCalls.push({ action, method: intercepted.request().method(), body: intercepted.request().postDataJSON() });
      if (action === "login") cliState = { ...cliState, state: "login-running", authUrl: "https://jimeng.jianying.com/cli/login", userCode: "ABCD-EFGH" };
      if (action === "login-status") {
        pollReceived();
        await new Promise(resolve => { releaseCliPoll = resolve; });
      }
      if (action === "relogin") cliState = { ...cliState, state: "ready-signed-in", signedIn: true, account: "Switched Account", credits: 7 };
      if (action === "logout") cliState = { ...cliState, state: "ready-signed-out", signedIn: false, account: "", credits: null };
      if (action === "path") cliState = { ...cliState, executable: intercepted.request().postDataJSON().executablePath };
      await intercepted.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(action === "models" ? { models: ["jimeng-image", "jimeng-video"] } : { cli: cliState }) });
    });
    await root.locator("[data-provider-new]").click();
    await providerForm.locator('[name="apiKey"]').fill("must-clear-on-cli-switch");
    await providerForm.locator('[name="protocol"]').selectOption("cli:jimeng");
    await root.locator("[data-jimeng-cli-panel]").waitFor({ timeout: 5_000 });
    assert.equal(await providerForm.locator('[name="baseUrl"], [name="apiKey"], [name="networkMode"]').count(), 0);
    await root.locator("[data-jimeng-cli-state]").filter({ hasText: "未登录" }).waitFor();
    assert.equal(await providerForm.locator('[name="name"]').inputValue(), "即梦（本地 CLI）");
    const jimengProviderId = await providerForm.locator('[name="id"]').inputValue();
    await providerForm.locator('[name="name"]').fill("即梦测试草稿");
    // The client is bundled with the product, so no path field may be offered.
    assert.equal(await root.locator("[data-jimeng-path]").count(), 0);
    assert.equal(await root.locator("[data-jimeng-executable]").count(), 0);
    // The desktop host owns the browser hand-off: the authorization page has to
    // open in the operator's own browser, not inside the app window.
    await page.evaluate(() => {
      window.__jimengOpened = [];
      window.aiOsHost = { openExternal: (url) => { window.__jimengOpened.push(String(url)); return true; } };
    });
    await root.locator("[data-jimeng-login]").click();
    await holdPoll;
    assert.equal(await root.locator("[data-jimeng-login]").isDisabled(), true);
    // The authorization link and user code must be offered while login waits.
    const authLink = root.locator("[data-jimeng-auth-link]");
    await authLink.waitFor({ timeout: 5_000 });
    assert.equal(await authLink.getAttribute("href"), "https://jimeng.jianying.com/cli/login");
    assert.deepEqual(await page.evaluate(() => window.__jimengOpened), ["https://jimeng.jianying.com/cli/login"]);
    assert.match(await root.locator("[data-jimeng-user-code]").innerText(), /ABCD-EFGH/);
    await providerForm.locator('[name="name"]').fill("登录过程中保留名称");
    cliState = { ...cliState, state: "ready-signed-in", signedIn: true, account: "Mock Account", credits: 42, authUrl: "", userCode: "" };
    releaseCliPoll();
    await root.locator("[data-jimeng-account]").filter({ hasText: "Mock Account" }).waitFor();
    assert.equal(await providerForm.locator('[name="name"]').inputValue(), "登录过程中保留名称");
    assert.equal(await root.locator("[data-jimeng-login-box]").isVisible(), false, "Authorization box hides once login completes");
    assert.match(await root.locator("[data-jimeng-credits]").innerText(), /42/);
    assert.equal(cliCalls.filter(call => call.action === "login").length, 1);
    // Pulling the catalog is a suggestion, not a decision: nothing may be ticked
    // until the operator picks, and only then do the models join the provider.
    await root.locator("[data-jimeng-models]").click();
    await root.locator("[data-model-discovery]").waitFor();
    // The field is a compact header control. The legacy workbench paints every
    // input 40px tall with a heavy weight, and it drags the placeholder out of
    // the box unless this one keeps its own height floor and weight.
    const discoverySearch = root.locator("[data-discovery-search]");
    const searchMetrics = await discoverySearch.evaluate(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { height: Math.round(box.height), minHeight: style.minHeight, fontWeight: style.fontWeight };
    });
    assert.deepEqual(searchMetrics, { height: 30, minHeight: "30px", fontWeight: "400" });
    assert.equal(await root.locator("[data-provider-model]").count(), 0, "Pulled models stay out until they are added");
    assert.equal(await root.locator("[data-discovered-model]:checked").count(), 0, "Nothing is ticked before the operator chooses");
    await root.locator('[data-discovered-model="jimeng-image"]').check();
    await root.locator('[data-discovered-model="jimeng-video"]').check();
    await root.locator("[data-model-discovery-add]").click();
    await root.locator('[data-provider-model][data-model-id="jimeng-video"]').waitFor();
    assert.equal(await root.locator("[data-model-discovery]").count(), 0, "The checklist closes once the models are added");
    assert.deepEqual(await root.locator('[data-provider-model]').first().locator("[data-model-protocol] option").evaluateAll(items => items.map(item => item.value)), ["cli:jimeng"]);
    assert.equal(await providerForm.locator('[name="name"]').inputValue(), "登录过程中保留名称");
    // Re-pulling a saved catalog offers the stored models already ticked.
    await root.locator("[data-jimeng-models]").click();
    await root.locator("[data-model-discovery]").waitFor();
    assert.equal(await root.locator("[data-discovered-model]:checked").count(), 2, "Stored models are ticked by default");
    await root.locator("[data-model-discovery-cancel]").click();
    assert.equal(await root.locator("[data-model-discovery]").count(), 0);
    // A signed-in account can switch accounts, which cannot reuse the stored session.
    const switchAccount = root.locator("[data-jimeng-login]");
    assert.equal(await switchAccount.innerText(), "切换账号");
    assert.equal(await switchAccount.isDisabled(), false);
    await switchAccount.click();
    await root.locator("[data-jimeng-account]").filter({ hasText: "Switched Account" }).waitFor();
    assert.ok(cliCalls.some(call => call.action === "relogin" && call.method === "POST"));
    assert.equal(await providerForm.locator('[name="name"]').inputValue(), "登录过程中保留名称");
    const cliSave = page.waitForRequest(request => request.url().endsWith("/api/providers") && request.method() === "POST");
    await providerForm.getByRole("button", { name: "保存更改" }).click();
    const savedCli = (await cliSave).postDataJSON();
    assert.equal(savedCli.source, "cli");
    assert.equal(savedCli.cliTool, "jimeng");
    assert.equal(savedCli.baseUrl, "");
    assert.equal(savedCli.apiKey, "");
    await root.locator(`[data-provider-select="${jimengProviderId}"]`).waitFor();
    await root.locator("[data-jimeng-logout]").click();
    await root.locator("[data-jimeng-cli-state]").filter({ hasText: "未登录" }).waitFor();
    holdPoll = new Promise(resolve => { pollReceived = resolve; });
    await root.locator("[data-jimeng-login]").click();
    await holdPoll;
    await root.locator(`[data-provider-select="${protocolProviderId}"]`).click();
    releaseCliPoll();
    await page.waitForTimeout(2_200);
    assert.equal(await root.locator("[data-jimeng-cli-panel]").count(), 0);
    assert.equal(cliCalls.filter(call => call.action === "login-status").length, 2, "Selection change cancels polling and ignores the held response");
    assert.equal(await providerForm.locator('[name="name"]').inputValue(), "Protocol Browser Provider");
    assert.ok(!(await model.locator("[data-model-protocol] option").evaluateAll(items => items.map(item => item.value))).includes("cli:jimeng"));
    await root.locator(`[data-provider-select="${jimengProviderId}"]`).click();
    await providerForm.locator('[name="protocol"]').selectOption("openai");
    assert.equal(await root.locator("[data-provider-model]").count(), 0, "Switching transport clears incompatible models");
    assert.equal(await providerForm.locator('[name="apiKey"]').inputValue(), "");
    await root.locator(`[data-provider-select="${protocolProviderId}"]`).click();

    await root.locator('[data-settings-nav="protocols"]').click();
    await root.locator('[data-protocol-scope="model"]').click();
    await root.locator('[data-protocol-select="browser-chat-only"]').click();
    assert.equal(await root.locator("[data-protocol-delete]").isDisabled(), true);
    const route = root.locator("[data-protocol-route-form]");
    await route.locator('[name="providerId"]').selectOption(protocolProviderId);
    await route.locator('[name="modelId"]').selectOption("gpt-4o-mini");
    await route.locator('[name="intent"]').selectOption("llm.tools");
    await route.getByRole("button", { name: "检查路由" }).click();
    const result = root.locator("[data-protocol-route-result]");
    await result.waitFor();
    assert.match(await result.innerText(), /配置检查未通过/);
    assert.match(await result.innerText(), /llm\.tools/);
    assert.match(await result.innerText(), /缺少/);
    await route.locator('[name="intent"]').selectOption("llm.chat");
    await route.getByRole("button", { name: "检查路由" }).click();
    await result.waitFor();
    assert.match(await result.innerText(), /配置检查通过/);
    assert.match(await result.innerText(), /browser-platform/);
    assert.match(await result.innerText(), /browser-chat-only/);
    assert.match(await result.innerText(), /不代表实际调用成功/);
    assert.deepEqual(upstreamRequests, [], "Protocol CRUD, inference and route checks must not access upstream");

    let releaseRoute;
    let interceptedRoute;
    const heldRoute = new Promise(resolve => { interceptedRoute = resolve; });
    await page.route("**/api/protocols/route-test", async intercepted => {
      interceptedRoute();
      await new Promise(resolve => { releaseRoute = resolve; });
      await intercepted.continue();
    });
    await route.getByRole("button", { name: "检查路由" }).click();
    await heldRoute;
    await route.locator('[name="intent"]').selectOption("llm.tools");
    releaseRoute();
    await route.getByRole("button", { name: "检查路由" }).waitFor();
    assert.equal(await result.count(), 0, "An old route response must not overwrite a changed intent");
    await page.unroute("**/api/protocols/route-test");
    await route.getByRole("button", { name: "检查路由" }).click();
    await result.waitFor();
    assert.match(await result.innerText(), /配置检查未通过/);

    if (process.env.AI_OS_TEST_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.AI_OS_TEST_SCREENSHOT_DIR, { recursive: true });
      await page.locator("#aiOsToastRegion .ai-os-toast").last().waitFor({ state: "detached" });
      await page.locator('.ai-os-app-window:has(#aiOsSystemSettingsRoot) [data-window-action="maximize"]').click();
      await root.screenshot({ path: path.join(process.env.AI_OS_TEST_SCREENSHOT_DIR, "protocol-center-light.png") });
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      await root.screenshot({ path: path.join(process.env.AI_OS_TEST_SCREENSHOT_DIR, "protocol-center-dark.png") });
      await result.scrollIntoViewIfNeeded();
      await root.screenshot({ path: path.join(process.env.AI_OS_TEST_SCREENSHOT_DIR, "protocol-center-route-dark.png") });
    }

    await root.locator('[data-settings-nav="providers"]').click();
    await root.locator(`[data-provider-select="${protocolProviderId}"]`).click();
    await model.locator("[data-model-test]").click();
    // Model testing opens a dialog that runs a real request through the custom
    // protocol, so the isolated mock must receive exactly one chat completion.
    const testDialog = root.locator(".settings-test-dialog");
    await testDialog.waitFor();
    await testDialog.locator("[data-test-prompt]").fill("isolated prompt");
    await testDialog.locator("[data-test-send]").click();
    await testDialog.locator("[data-test-status]").filter({ hasText: "测试成功" }).waitFor({ timeout: 15_000 });
    assert.deepEqual(upstreamRequests, ["/v1/chat/completions"], "Explicit model testing executes the custom protocol against the isolated mock only");
    await testDialog.locator("[data-test-close]").click();
    await testDialog.waitFor({ state: "detached" });

    await stop(child);
    child = start(port, dataDir, diagnostics);
    await ready(child, port, diagnostics);
    await page.reload({ waitUntil: "networkidle" });
    await openSettings("providers");
    await root.locator(`[data-provider-select="${protocolProviderId}"]`).click();
    assert.equal(await providerForm.locator('[name="protocol"]').inputValue(), "browser-platform");
    assert.equal(await model.locator("[data-model-protocol]").inputValue(), "browser-chat-only");
    await root.locator('[data-settings-nav="protocols"]').click();
    await root.locator('[data-protocol-scope="model"]').click();
    await root.locator('[data-protocol-select="browser-chat-only"]').click();
    assert.match(await root.locator(".settings-protocol-details").innerText(), /Browser Chat Restricted/);
    assert.equal(await root.locator('[data-protocol-select="browser-unused"]').count(), 0);
    assert.deepEqual(pageErrors, [], "Browser must not report JavaScript errors");
    console.log("Protocol center browser checks passed: custom CRUD, scope separation, provider use, missing tools diagnostics, stale response protection, restart persistence, readonly checks without upstream calls, explicit execution against local mock.");
  } finally {
    if (browser) await browser.close();
    await stop(child);
    await new Promise(resolve => upstream.close(resolve));
    if (path.dirname(dataDir) === os.tmpdir() && path.basename(dataDir).startsWith("ai-os-protocol-browser-")) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
