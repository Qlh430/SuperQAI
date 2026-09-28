"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");

let playwright;
try { playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright"); } catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const ROOT = path.resolve(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(server.address().port)); });
}
async function waitForServer(page, url) {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await page.request.get(url)).ok()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for AI OS server.");
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-project-browser-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_DATA_DIR: dataDir, CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false" }, stdio: "ignore" });
  const executablePath = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((item) => fs.existsSync(item));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const requests = [];
  page.on("request", (request) => { if (request.url().includes("/api/canvas/boards")) requests.push(request.url()); });
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await waitForServer(page, `http://127.0.0.1:${port}/`);
    await page.evaluate(async () => {
      await fetch("/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "browser-admin", displayName: "浏览器管理员", password: "browser-admin-password" }) });
      await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "browser-admin", password: "browser-admin-password" }) });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });
    await page.locator('[data-ai-app="canvas"]').evaluate((element) => element.click());
    await page.locator("#canvasLibraryScreen").waitFor();
    await page.locator(".canvas-gallery-sidebar").waitFor();
    for (const selector of ["[data-canvas-scope=all]", "[data-canvas-scope=shared]", "#canvasProjectList", "#canvasProjectNew"]) assert.equal(await page.locator(selector).count(), 1, `missing ${selector}`);
    await page.evaluate(async () => { await fetch("/api/canvas/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "browser-project", name: "浏览器项目" }) }); await fetch("/api/canvas/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "browser-board", projectId: "browser-project", title: "浏览器画布" }) }); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-ai-app="canvas"]').evaluate((element) => element.click());
    await page.locator("#canvasLibraryScreen").waitFor();
    await page.locator(".canvas-gallery-project-item").filter({ hasText: "浏览器项目" }).click();
    await page.locator(".canvas-board-item").filter({ hasText: "浏览器画布" }).waitFor();
    const projectRow = page.locator(".canvas-gallery-project-row").filter({ hasText: "浏览器项目" });
    await projectRow.locator(".canvas-gallery-project-action").click();
    await page.locator("#canvasNameInput").fill("浏览器项目（已重命名）");
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator(".canvas-gallery-project-item").filter({ hasText: "浏览器项目（已重命名）" }).waitFor();
    await page.evaluate(async () => {
      await fetch("/api/canvas/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "browser-target-project", name: "目标项目" }) });
      await window.CanvasWorkspace.loadCanvasWorkspace({ scope: "all", projectId: "browser-project" });
    });
    const boardCard = page.locator(".canvas-board-item").filter({ hasText: "浏览器画布" });
    await boardCard.click({ button: "right" });
    await page.locator('[data-board-menu-action="move"]').click();
    await page.locator("#canvasProjectMoveSelect").selectOption("browser-target-project");
    await page.locator("#canvasProjectMoveForm button[type=submit]").click();
    await page.locator(".canvas-gallery-project-item").filter({ hasText: "目标项目" }).click();
    await page.locator(".canvas-board-item").filter({ hasText: "浏览器画布" }).waitFor();
    await page.locator('[data-canvas-scope="shared"]').click();
    await page.waitForTimeout(120);
    assert.ok(requests.some((url) => url.includes("scope=shared")), "shared scope must be requested from server");
    await page.locator('[data-canvas-scope="all"]').click();
    await page.waitForTimeout(120);
    for (const scale of [0.75, 1, 1.25, 1.5, 1.75]) {
      await page.evaluate((value) => window.AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: value, animations: "reduced" } }, document.documentElement), scale);
      await page.waitForFunction((value) => document.documentElement.dataset.uiScale === String(value), scale);
      const geometry = await page.locator(".canvas-gallery-shell").evaluate((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }; });
      assert.ok(
        geometry.left >= -2 && geometry.top >= -2 && geometry.right <= geometry.viewportWidth + 2 && geometry.bottom <= geometry.viewportHeight + 2,
        `gallery must remain within viewport at ${scale} — saw ${JSON.stringify(geometry)}`,
      );
      assert.equal(await page.locator(".canvas-gallery-sidebar").isVisible(), true, `project sidebar must remain visible at ${scale}`);
      assert.equal(await page.locator(".canvas-board-item").filter({ hasText: "浏览器画布" }).isVisible(), true, `canvas card must remain visible at ${scale}`);
    }
    for (const mode of ["light", "dark"]) {
      await page.evaluate((value) => window.AiOsDisplay.applyPreferences({ appearance: { theme: value, scale: 1, animations: "reduced" } }, document.documentElement), mode);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), mode);
      assert.equal(await page.locator(".canvas-gallery-sidebar").count(), 1);
    }
  } finally {
    await browser.close();
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log("Canvas project browser checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
