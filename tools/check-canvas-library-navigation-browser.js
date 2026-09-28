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
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function waitForServer(page, url) {
  for (let index = 0; index < 120; index += 1) {
    try { if ((await page.request.get(url)).ok()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for AI OS server.");
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-navigation-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
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
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await waitForServer(page, `http://127.0.0.1:${port}/`);
    await page.evaluate(async () => {
      const headers = { "content-type": "application/json" };
      await fetch("/api/auth/bootstrap", { method: "POST", headers, body: JSON.stringify({ username: "navigation-admin", displayName: "导航管理员", password: "navigation-admin-password" }) });
      await fetch("/api/auth/login", { method: "POST", headers, body: JSON.stringify({ username: "navigation-admin", password: "navigation-admin-password" }) });
      await fetch("/api/canvas/projects", { method: "POST", headers, body: JSON.stringify({ id: "navigation-project", name: "导航项目" }) });
      await fetch("/api/canvas/boards", { method: "POST", headers, body: JSON.stringify({ id: "navigation-board", projectId: "navigation-project", title: "导航画布" }) });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });

    assert.equal(await page.locator(".ai-os-app-window:not([hidden])").count(), 0, "login must leave a clean desktop with no app windows");
    assert.equal(await page.locator("#aiOsActiveApp").textContent(), "工作台", "clean desktop must not report an active app");
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor();
    assert.equal(await page.locator("#canvasLibraryScreen").isVisible(), true, "app must open on the library screen");
    assert.equal(await page.locator("#canvasEditorScreen").isHidden(), true, "editor must be hidden on launch");
    assert.equal(await page.locator("#canvasBoardPanel").count(), 0, "legacy history overlay must not exist");
    assert.equal(await page.locator(".canvas-start-gate").count(), 0, "legacy start gate must not exist");
    assert.equal(await page.evaluate(() => {
      const library = document.querySelector("#canvasLibraryScreen");
      const editor = document.querySelector("#canvasEditorScreen");
      return library?.parentElement === editor?.parentElement && library?.parentElement?.id === "canvasView";
    }), true, "library and editor must be direct sibling screens");
    if (process.env.AI_OS_NAVIGATION_SCREENSHOT) {
      await page.screenshot({ path: process.env.AI_OS_NAVIGATION_SCREENSHOT, fullPage: true });
    }

    await page.locator(".canvas-gallery-project-item").filter({ hasText: "导航项目" }).click();
    await page.locator("#canvasBoardSearch").fill("导航");
    const card = page.locator(".canvas-board-item").filter({ hasText: "导航画布" });
    await card.click();
    await page.locator("#canvasEditorScreen").waitFor();
    assert.equal(await page.locator("#canvasLibraryScreen").isHidden(), true);
    await page.waitForFunction(() => document.documentElement.dataset.aiImmersiveApp === "canvas");
    const immersiveLayout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const canvasWindow = document.querySelector("#canvasView")?.closest(".ai-os-app-window");
      const windowRect = canvasWindow?.getBoundingClientRect();
      const viewportRect = rect("#infiniteCanvas");
      const navigationRect = rect(".canvas-editor-navigation");
      const exitRect = rect("#canvasImmersiveToggleButton");
      const backRect = rect("#canvasLibraryBackButton");
      return {
        menuVisibility: getComputedStyle(document.querySelector(".ai-os-menu-bar")).visibility,
        dockVisibility: getComputedStyle(document.querySelector(".ai-os-dock")).visibility,
        titleDisplay: getComputedStyle(canvasWindow.querySelector(".ai-os-app-titlebar")).display,
        window: windowRect && { top: windowRect.top, bottom: windowRect.bottom, left: windowRect.left, right: windowRect.right },
        viewport: viewportRect && { top: viewportRect.top, bottom: viewportRect.bottom },
        navigation: navigationRect && { top: navigationRect.top, left: navigationRect.left },
        exit: exitRect && { top: exitRect.top, left: exitRect.left, right: exitRect.right },
        back: backRect && { top: backRect.top, left: backRect.left },
        screen: { width: innerWidth, height: innerHeight },
      };
    });
    console.log(`Immersive layout: ${JSON.stringify(immersiveLayout)}`);
    assert.equal(immersiveLayout.menuVisibility, "hidden", "immersive canvas must hide the AI OS menu bar");
    assert.equal(immersiveLayout.dockVisibility, "hidden", "immersive canvas must hide the Dock");
    assert.equal(immersiveLayout.titleDisplay, "none", "immersive canvas must hide the app title bar");
    assert.ok(Math.abs(immersiveLayout.window.top) <= 1 && Math.abs(immersiveLayout.window.bottom - immersiveLayout.screen.height) <= 1, "immersive app window must touch the top and bottom viewport edges");
    assert.ok(Math.abs(immersiveLayout.viewport.top) <= 1 && Math.abs(immersiveLayout.viewport.bottom - immersiveLayout.screen.height) <= 1, "infinite canvas must fill the viewport vertically");
    // The canvas layout contract pins the HUD to the 16px BENDO gutter, so the
    // immersive controls must sit on that corner rather than any larger inset.
    assert.ok(immersiveLayout.navigation.left <= 16 && immersiveLayout.navigation.top <= 16, "fullscreen controls must occupy the far top-left position");
    assert.ok(immersiveLayout.exit.right < immersiveLayout.back.left, "fullscreen control must remain left of the project-back control");
    assert.match(await page.locator("#canvasImmersiveToggleButton").textContent(), /退出全屏/);
    if (process.env.AI_OS_IMMERSIVE_SCREENSHOT) {
      await page.screenshot({ path: process.env.AI_OS_IMMERSIVE_SCREENSHOT, fullPage: true });
    }
    for (const scale of [0.75, 1, 1.25, 1.5, 1.75]) {
      await page.evaluate((value) => window.AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: value, animations: "reduced" } }, document.documentElement), scale);
      await page.waitForFunction((value) => document.documentElement.dataset.uiScale === String(value), scale);
      const edges = await page.evaluate(() => {
        const windowRect = document.querySelector("#canvasView")?.closest(".ai-os-app-window")?.getBoundingClientRect();
        const canvasRect = document.querySelector("#infiniteCanvas")?.getBoundingClientRect();
        return { windowTop: windowRect?.top, windowBottom: windowRect?.bottom, canvasTop: canvasRect?.top, canvasBottom: canvasRect?.bottom, height: innerHeight };
      });
      assert.ok(Math.abs(edges.windowTop) <= 1 && Math.abs(edges.windowBottom - edges.height) <= 1, `immersive window must fill the viewport at ${scale}`);
      assert.ok(Math.abs(edges.canvasTop) <= 1 && Math.abs(edges.canvasBottom - edges.height) <= 1, `infinite canvas must fill the viewport at ${scale}`);
    }
    await page.evaluate(() => window.AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: 1, animations: "reduced" } }, document.documentElement));
    await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1");
    const storedWindowGeometry = await page.locator(".ai-os-app-window").filter({ has: page.locator("#canvasView") }).evaluate((node) => {
      return { transform: node.style.transform, width: node.style.width, height: node.style.height };
    });

    await page.locator("#canvasImmersiveToggleButton").click();
    await page.waitForFunction(() => !document.documentElement.dataset.aiImmersiveApp);
    assert.equal(await page.locator("#canvasEditorScreen").isVisible(), true, "exiting fullscreen must keep the current canvas editor open");
    assert.equal(await page.locator(".ai-os-dock").evaluate((node) => getComputedStyle(node).visibility), "visible", "exiting fullscreen must restore the Dock");
    assert.match(await page.locator("#canvasImmersiveToggleButton").textContent(), /进入全屏/);
    const restoredGeometry = await page.locator(".ai-os-app-window").filter({ has: page.locator("#canvasView") }).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        inline: { transform: node.style.transform, width: node.style.width, height: node.style.height },
        rect: { top: rect.top, bottom: rect.bottom },
        viewportHeight: innerHeight,
      };
    });
    console.log(`Window geometry: ${JSON.stringify({ storedWindowGeometry, restoredGeometry })}`);
    assert.deepEqual(restoredGeometry.inline, storedWindowGeometry, "immersive mode must not rewrite saved window geometry");
    assert.ok(restoredGeometry.rect.top >= 37 && restoredGeometry.rect.bottom <= restoredGeometry.viewportHeight - 81, "exiting fullscreen must return the app inside the desktop menu and Dock bounds");
    await page.locator("#canvasImmersiveToggleButton").click();
    await page.waitForFunction(() => document.documentElement.dataset.aiImmersiveApp === "canvas");

    await page.locator("#canvasLibraryBackButton").click();
    await page.locator("#canvasLibraryScreen").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.aiImmersiveApp);
    assert.equal(await page.locator("#canvasBoardSearch").inputValue(), "导航", "search context must survive editor return");
    assert.equal(await page.locator(".canvas-gallery-project-item.is-active").filter({ hasText: "导航项目" }).count(), 1, "project context must survive editor return");

    await card.click();
    await page.locator("#canvasEditorScreen").waitFor();
    await page.locator("#canvasImmersiveToggleButton").click();
    await page.waitForFunction(() => !document.documentElement.dataset.aiImmersiveApp);
    await page.locator('[data-ai-app="canvas"]').click();
    await page.waitForFunction(() => document.querySelector("#canvasView")?.closest(".ai-os-app-window")?.hidden === true);
    assert.equal(await page.locator('[data-ai-app="canvas"]').getAttribute("aria-pressed"), "false", "minimized canvas must not remain focused");
    assert.equal(await page.locator('[data-ai-app="canvas"]').evaluate((node) => node.classList.contains("ai-os-dock-minimized")), true, "Dock must expose the minimized state");
    await page.locator('[data-ai-app="canvas"]').click();
    await page.waitForFunction(() => document.querySelector("#canvasView")?.closest(".ai-os-app-window")?.hidden === false);
    assert.equal(await page.locator("#canvasEditorScreen").isVisible(), true, "restoring a minimized canvas must preserve the editor page");

    const canvasWindow = page.locator(".ai-os-app-window").filter({ has: page.locator("#canvasView") });
    await canvasWindow.locator('[data-window-action="close"]').click();
    await page.waitForFunction(() => document.querySelector("#canvasView")?.closest(".ai-os-app-window")?.hidden === true);
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor();
    assert.equal(await page.locator("#canvasEditorScreen").isHidden(), true, "reopening a closed canvas app must start at the project library");

    const resourceId = await page.evaluate(async () => {
      const response = await fetch("/api/canvas/boards?scope=all");
      const data = await response.json();
      return data.boards.find((board) => board.id === "navigation-board")?.resourceId || "";
    });
    assert.ok(resourceId, "test canvas must expose its resource id");
    await page.evaluate((id) => window.AiOsDesktop.openApp("canvas", { resourceId: id }), resourceId);
    await page.locator("#canvasEditorScreen").waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.aiImmersiveApp === "canvas");

    await page.evaluate(() => window.AiOsDesktop.openApp("canvas", { resourceId: "missing-resource" }));
    await page.locator("#canvasLibraryScreen").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.aiImmersiveApp);
    assert.match(await page.locator("#canvasLibraryStatus").textContent(), /找不到可访问的画布/);

    await page.locator(".canvas-gallery-project-item").filter({ hasText: "导航项目" }).click();
    await page.locator("#canvasBoardNew").click();
    await page.locator("#canvasNameInput").fill("导航新建画布");
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator("#canvasEditorScreen").waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.aiImmersiveApp === "canvas");
    assert.equal(await page.evaluate(() => canvasState.activeBoardTitle), "导航新建画布");
    await page.locator("#canvasLibraryBackButton").click();
    await page.locator(".canvas-board-item").filter({ hasText: "导航新建画布" }).waitFor();
    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(" | ")}`);
  } finally {
    await browser.close();
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log("Canvas library navigation browser checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
