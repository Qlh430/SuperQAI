"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}
const { chromium } = playwright;

const ROOT = path.resolve(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function waitForServer(page, url) {
  for (let index = 0; index < 200; index += 1) {
    try {
      const response = await page.request.get(url);
      if (response.ok()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for AI OS server.");
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-pending-open-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
    },
    stdio: "ignore",
  });
  const executablePath = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((item) => fs.existsSync(item));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  let releaseCanvasScript = () => {};
  const canvasScriptGate = new Promise((resolve) => {
    releaseCanvasScript = resolve;
  });
  await page.route("**/script.js?*", async (route) => {
    await canvasScriptGate;
    await route.continue();
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("__ai_os_dev_reload_refresh_v1", String(Date.now()));
    } catch {}
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForServer(page, `http://127.0.0.1:${port}/`);
    await page.waitForFunction(
      () => window.AiOsDesktop && document.querySelector("#aiOsDesktopHome"),
      null,
      { timeout: 30_000 },
    );

    const session = await page.evaluate(async () => {
      const headers = { "content-type": "application/json" };
      await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers,
        body: JSON.stringify({
          username: "pending-admin",
          displayName: "待办验收管理员",
          password: "pending-admin-password",
        }),
      });
      return fetch("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "pending-admin", password: "pending-admin-password" }),
      }).then((response) => response.json());
    });
    await page.evaluate((value) => window.AiOsDesktop.setSession(value), session);
    await page.waitForFunction(() => document.querySelector("#aiOsDesktopHome")?.hidden === false);

    await page.locator('[data-home-app="canvas"]').click();
    await page.getByText("无限画布正在准备，完成后会自动打开。").waitFor({
      state: "visible",
      timeout: 7_000,
    });
    assert.equal(await page.locator("#canvasEditorScreen").count(), 0, "画布运行时未就绪时不能挂载空界面");

    releaseCanvasScript();
    await page.waitForFunction(() => window.AiOsDesktop?.isReady?.() === true, null, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector("#canvasEditorScreen"), null, { timeout: 30_000 });
    await page.getByText("无限画布正在准备，完成后会自动打开。").waitFor({
      state: "detached",
      timeout: 6_000,
    });
    assert.deepEqual(pageErrors, [], "页面不应该有未捕获异常");
    console.log("Desktop pending app open checks passed.");
  } finally {
    releaseCanvasScript();
    await browser.close();
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
