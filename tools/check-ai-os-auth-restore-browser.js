"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
let playwright;
try { playwright = require("playwright"); } catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}

(async () => {
  const probe = http.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-auth-restore-"));
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: path.resolve(__dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_DATA_DIR: dataDir, CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false" },
  });
  let diagnostics = "";
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-4000); });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) break;
      try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Isolated auth test server did not start. ${diagnostics}`);
    const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const account = { username: "restore-test", displayName: "Restore test", password: "isolated-session-restore-password" };
    assert.ok((await page.request.post(`${url}/api/auth/bootstrap`, { data: account })).ok());
    assert.ok((await page.request.post(`${url}/api/auth/login`, { data: account })).ok());
    await page.addInitScript(() => {
      window.__authFrames = [];
      const visible = (selector) => {
        const node = document.querySelector(selector);
        return Boolean(node?.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
      };
      const sample = () => {
        window.__authFrames.push({ state: document.documentElement.dataset.aiAuth, login: visible("#aiOsAuthGate"), desktop: visible("#aiOsDesktop") });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (const scenario of ["authenticated", "authenticated-reload", "expired", "bootstrap", "disconnected"]) {
      let release;
      let requested;
      const held = new Promise((resolve) => { release = resolve; });
      const requestStarted = new Promise((resolve) => { requested = resolve; });
      await page.route("**/api/auth/session", async (route) => {
        requested();
        await held;
        if (scenario.startsWith("authenticated")) await route.continue();
        else if (scenario === "disconnected") await route.abort("connectionfailed");
        else await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ authenticated: false, needsBootstrap: scenario === "bootstrap" }) });
      });
      try {
        if (scenario === "authenticated") await page.goto(url, { waitUntil: "domcontentloaded" });
        else await page.reload({ waitUntil: "domcontentloaded" });
        await requestStarted;
        await page.evaluate(() => new Promise((resolve) => {
          let frames = 0;
          const next = () => { if (++frames >= 6) resolve(); else requestAnimationFrame(next); };
          requestAnimationFrame(next);
        }));
        const pending = await page.evaluate(() => window.__authFrames);
        assert.ok(pending.length > 0, "The test must observe painted startup frames.");
        assert.ok(pending.every((frame) => !frame.login && !frame.desktop), `${scenario}: a login form or desktop was painted before session restoration completed: ${JSON.stringify(pending)}`);
        release();
        if (scenario.startsWith("authenticated")) {
          await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
          assert.equal(await page.locator("#aiOsAuthGate").isVisible(), false);
          assert.ok((await page.evaluate(() => window.__authFrames)).every((frame) => !frame.login), "A valid session must reach the desktop without a login flash.");
        } else {
          await page.locator("#aiOsAuthGate").waitFor({ state: "visible" });
          assert.equal(await page.locator("#aiOsDesktop").isVisible(), false);
          assert.equal(await page.locator("#aiOsBootstrapForm").isVisible(), scenario === "bootstrap");
          assert.equal(await page.locator("#aiOsLoginForm").isVisible(), scenario !== "bootstrap");
          if (scenario === "disconnected") assert.match(await page.locator("#aiOsAuthError").textContent(), /无法连接主机服务/);
        }
        console.log(`Auth startup: ${scenario} passed.`);
      } finally {
        release();
        await page.unrouteAll({ behavior: "wait" });
      }
    }
    assert.deepEqual(errors, [], "Auth restoration must not throw page errors.");
    console.log("AI OS auth restoration browser checks passed.");
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await exited;
    }
    if (path.resolve(dataDir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
