"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;

(async () => {
  const probe = http.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const url = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-desktop-home-"));
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: path.resolve(__dirname, ".."),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  let diagnostics = "";
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-4000); });

  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        if ((await fetch(url)).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Isolated desktop-home test server did not start. ${diagnostics}`);

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const account = {
      username: `desktop-home-${process.pid}-${Date.now()}`,
      displayName: "桌面首页测试",
      password: "isolated-desktop-home-password",
    };
    assert.ok((await page.request.post(`${url}/api/auth/bootstrap`, { data: account })).ok());
    assert.ok((await page.request.post(`${url}/api/auth/login`, { data: account })).ok());

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible", timeout: 20_000 });
    await page.locator("#aiOsStartupGate").waitFor({ state: "hidden", timeout: 60_000 });
    await page.locator("#aiOsDesktopHome").waitFor({ state: "visible" });
    await page.locator('[data-home-app="canvas"]').waitFor({ state: "visible" });
    assert.equal(await page.locator(".ai-os-app-window").count(), 0, "login must keep the desktop free of app windows");
    if (process.env.AI_OS_HOME_SCREENSHOT) await page.screenshot({ path: path.resolve(process.env.AI_OS_HOME_SCREENSHOT) });

    await page.evaluate(() => {
      window.AiOsLegacyWorkbench = undefined;
    });
    await page.locator('[data-home-app="canvas"]').click();
    await page.locator("#aiOsDesktopHome").waitFor({ state: "hidden" });
    await page.locator(".ai-os-app-window:visible").first().waitFor({ state: "visible" });
    assert.equal(await page.locator(".ai-os-app-window:visible").count(), 1, "desktop-home launch opens one canvas window");
    await page.locator(".ai-os-app-window:visible #canvasView").waitFor({ state: "visible" });
    assert.equal(
      await page.locator(".ai-os-app-window:visible #canvasView").evaluate((node) => node.dataset.canvasScreen),
      "library",
      "canvas must open its existing DOM view even if the legacy bridge event was missed",
    );

    await page.locator(".ai-os-app-window:visible [data-window-action='close']").click();
    await page.locator("#aiOsDesktopHome").waitFor({ state: "visible" });
    assert.equal(await page.locator(".ai-os-app-window:visible").count(), 0, "closing the only window restores the desktop home");
    assert.deepEqual(errors, [], "desktop-home flow must not throw page errors");

    console.log("AI OS desktop home browser checks passed.");
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await exited;
    }
    if (path.resolve(dataDir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
