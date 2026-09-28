"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
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
  for (let index = 0; index < 160; index += 1) {
    try {
      const response = await page.request.get(url);
      if ([200, 401].includes(response.status())) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the AI OS server.");
}

async function requestJson(page, route, options = {}) {
  return page.evaluate(async ({ route, options }) => {
    const response = await fetch(route, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `${route} failed with ${response.status}`);
    return data;
  }, { route, options });
}

async function login(page, origin, username, temporaryPassword, password = temporaryPassword) {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await requestJson(page, "/api/auth/login", { method: "POST", body: { username, password: temporaryPassword } });
  if (password !== temporaryPassword) {
    await requestJson(page, "/api/auth/change-password", {
      method: "POST",
      body: { currentPassword: temporaryPassword, newPassword: password },
    });
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const desktop = document.querySelector("#aiOsDesktop");
    return desktop && !desktop.hidden && window.CanvasAssetLibrary && window.CanvasAssetBridge;
  }, null, { timeout: 30_000 });
}

async function createProjectBoard(page, prefix, projectName, boardTitle) {
  const projectId = `${prefix}-project`;
  const boardId = `${prefix}-board`;
  const canvasWindowVisible = await page.evaluate(() => {
    const windowNode = document.querySelector("#canvasView")?.closest(".ai-os-app-window");
    return Boolean(windowNode && !windowNode.hidden);
  });
  if (!canvasWindowVisible) {
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible" });
  }
  await requestJson(page, "/api/canvas/projects", { method: "POST", body: { id: projectId, name: projectName } });
  await requestJson(page, "/api/canvas/boards", { method: "POST", body: { id: boardId, projectId, title: boardTitle } });
  await page.evaluate(({ projectId }) => window.CanvasWorkspace.loadCanvasWorkspace({ scope: "all", projectId }), { projectId });
  const card = page.locator(".canvas-board-item").filter({ hasText: boardTitle });
  await card.waitFor({ state: "visible" });
  await card.evaluate((element) => element.click());
  await page.waitForFunction(({ projectId, boardId }) => {
    const context = window.CanvasAssetBridge?.getCurrentContext?.();
    return context?.projectId === projectId && context?.boardId === boardId;
  }, { projectId, boardId });
  return { projectId, boardId };
}

async function openAssetLibrary(page) {
  const button = page.locator("#canvasAssetLibraryButton");
  await button.waitFor({ state: "visible" });
  const expanded = await button.getAttribute("aria-expanded");
  if (expanded !== "true") await button.click();
  await page.locator("#canvasAssetLibraryPanel").waitFor({ state: "visible" });
}

function assetCard(page, name) {
  return page.locator(".canvas-asset-card").filter({ hasText: name });
}

async function selectScope(page, scope) {
  await page.locator(`[data-asset-scope="${scope}"]`).click();
  await page.waitForFunction(() => !document.querySelector("#canvasAssetLibraryPanel")?.classList.contains("is-loading"));
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-asset-browser-"));
  const outputDir = path.join(dataDir, "output");
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_OUTPUT_DIR: outputDir,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: "ignore",
  });
  const executablePath = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const origin = `http://127.0.0.1:${port}/`;
  const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const carolContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const carol = await carolContext.newPage();

  try {
    await alice.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForServer(alice, origin);
    await requestJson(alice, "/api/auth/bootstrap", {
      method: "POST",
      body: { username: "alice-admin", displayName: "Alice 管理员", password: "alice-browser-password" },
    });
    await requestJson(alice, "/api/auth/login", {
      method: "POST",
      body: { username: "alice-admin", password: "alice-browser-password" },
    });
    await alice.reload({ waitUntil: "domcontentloaded" });
    await alice.waitForFunction(() => !document.querySelector("#aiOsDesktop")?.hidden && window.CanvasAssetLibrary);

    const users = await alice.evaluate(async () => {
      const create = async (username, displayName, password) => {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, displayName, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed to create ${username}`);
        return data.user;
      };
      return {
        bob: await create("bob-browser", "Bob 设计师", "bob-temporary-password"),
        carol: await create("carol-browser", "Carol 访客", "carol-temporary-password"),
      };
    });

    await login(bob, origin, "bob-browser", "bob-temporary-password", "bob-browser-password");
    await login(carol, origin, "carol-browser", "carol-temporary-password", "carol-browser-password");

    await createProjectBoard(alice, "alice-assets", "Alice 资产项目", "Alice 资产画布");
    await openAssetLibrary(alice);
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");
    await alice.locator("#canvasAssetInput").setInputFiles([
      { name: "hero.png", mimeType: "image/png", buffer: png },
      { name: "intro.mp4", mimeType: "video/mp4", buffer: Buffer.from("asset-browser-video") },
      { name: "theme.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("asset-browser-audio") },
    ]);
    await alice.waitForFunction(() => document.querySelectorAll(".canvas-asset-card").length === 3 && !document.querySelector("#canvasAssetImport")?.disabled, null, { timeout: 30_000 });
    await selectScope(alice, "mine");
    for (const name of ["hero.png", "intro.mp4", "theme.mp3"]) assert.equal(await assetCard(alice, name).count(), 1, `${name} must appear in Alice's project assets`);

    const heroId = await assetCard(alice, "hero.png").getAttribute("data-asset-id");
    const videoId = await assetCard(alice, "intro.mp4").getAttribute("data-asset-id");
    const audioId = await assetCard(alice, "theme.mp3").getAttribute("data-asset-id");
    await assetCard(alice, "hero.png").locator(".canvas-asset-preview").dblclick();
    await alice.locator(`#canvasPlane [data-asset-id="${heroId}"]`).waitFor();

    await assetCard(alice, "intro.mp4").locator("[data-asset-share]").click();
    await alice.locator("#aiOsShareDialog").waitFor({ state: "visible" });
    // 共享素材没有口令这一档（/api/assets/:id/share 只收 private / all / users），
    // 所以安全面板里的「口令访问」要藏起来、共享权限也要藏起来。
    assert.equal(
      await alice.locator("#aiOsShareDialog [data-share-password-choice]").first().isHidden(),
      true,
      "共享素材不该出现口令访问",
    );
    assert.equal(
      await alice.locator("#aiOsShareDialog [data-share-permission]").first().isHidden(),
      true,
      "共享素材不该出现共享权限",
    );
    await alice.locator('#aiOsShareForm [name="visibility"][value="all"]').evaluate((element) => element.click());
    await alice.locator('#aiOsShareForm button[type="submit"]').evaluate((element) => element.click());
    await alice.locator("#aiOsShareDialog").waitFor({ state: "hidden" });
    await alice.waitForFunction((id) => window.CanvasAssetLibrary.state.items.some((item) => item.id === id && item.visibility === "all"), videoId);

    await assetCard(alice, "theme.mp3").locator("[data-asset-share]").click();
    await alice.locator("#aiOsShareDialog").waitFor({ state: "visible" });
    await alice.locator('#aiOsShareForm [name="visibility"][value="users"]').evaluate((element) => element.click());
    await alice.locator('#aiOsShareForm [name="userIds"]').selectOption(users.bob.id);
    await alice.locator('#aiOsShareForm button[type="submit"]').evaluate((element) => element.click());
    await alice.locator("#aiOsShareDialog").waitFor({ state: "hidden" });
    await alice.waitForFunction((id) => window.CanvasAssetLibrary.state.items.some((item) => item.id === id && item.visibility === "users"), audioId);

    await createProjectBoard(bob, "bob-assets", "Bob 资产项目", "Bob 资产画布");
    await openAssetLibrary(bob);
    await selectScope(bob, "public");
    await assetCard(bob, "intro.mp4").waitFor();
    assert.equal(await assetCard(bob, "theme.mp3").count(), 0, "specified audio must not appear in Bob's public scope");
    await selectScope(bob, "shared");
    await assetCard(bob, "theme.mp3").waitFor();
    assert.equal(await assetCard(bob, "intro.mp4").count(), 0, "public video must not be mixed into specified-user scope");

    await selectScope(bob, "public");
    await assetCard(bob, "intro.mp4").locator("[data-asset-like]").click();
    await bob.waitForFunction((id) => window.CanvasAssetLibrary.state.items.some((item) => item.id === id && item.liked && item.likeCount === 1), videoId);
    await assetCard(bob, "intro.mp4").locator("[data-asset-favorite]").click();
    await bob.waitForFunction((id) => window.CanvasAssetLibrary.state.items.some((item) => item.id === id && item.favorited), videoId);
    await selectScope(bob, "favorites");
    await assetCard(bob, "intro.mp4").waitFor();
    await selectScope(bob, "public");

    const duplicateUploads = [];
    const trackUpload = (request) => {
      const pathname = new URL(request.url()).pathname;
      if (["/api/upload-image", "/api/upload-media", "/api/upload-media/chunk", "/api/assets/import"].includes(pathname)) duplicateUploads.push(pathname);
    };
    bob.on("request", trackUpload);
    const dragPayload = await bob.evaluate((id) => {
      const card = document.querySelector(`.canvas-asset-card[data-asset-id="${CSS.escape(id)}"]`);
      const viewport = document.querySelector("#infiniteCanvas");
      if (!card || !viewport) throw new Error("Asset drag fixture is missing.");
      const transfer = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const rect = viewport.getBoundingClientRect();
      const eventOptions = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 180, clientY: rect.top + 260 };
      viewport.dispatchEvent(new DragEvent("dragover", eventOptions));
      viewport.dispatchEvent(new DragEvent("drop", eventOptions));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return transfer.getData("application/x-ai-os-asset");
    }, videoId);
    assert.equal(dragPayload, JSON.stringify({ assetId: videoId }), "browser drag source must transfer only the asset id");
    await bob.locator(`#canvasPlane [data-asset-id="${videoId}"]`).waitFor();
    await bob.waitForTimeout(150);
    bob.off("request", trackUpload);
    assert.deepEqual(duplicateUploads, [], "dragging an existing asset must not upload a second file");

    await createProjectBoard(carol, "carol-assets", "Carol 资产项目", "Carol 资产画布");
    await openAssetLibrary(carol);
    await selectScope(carol, "public");
    await assetCard(carol, "intro.mp4").waitFor();
    await selectScope(carol, "shared");
    await carol.waitForFunction(() => !document.querySelector("#canvasAssetLibraryPanel")?.classList.contains("is-loading"));
    assert.equal(await assetCard(carol, "theme.mp3").count(), 0, "Carol must not see Bob-only audio");

    await selectScope(alice, "project");
    for (const theme of ["light", "dark"]) {
      for (const scale of [0.75, 1, 1.25, 1.5, 1.75]) {
        await alice.evaluate(({ theme, scale }) => {
          window.AiOsDisplay.applyPreferences({ appearance: { theme, scale, animations: "reduced" } }, document.documentElement);
        }, { theme, scale });
        await alice.waitForFunction(({ theme, scale }) => document.documentElement.dataset.theme === theme && document.documentElement.dataset.uiScale === String(scale), { theme, scale });
        const geometry = await alice.locator("#canvasAssetLibraryPanel").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
        });
        assert.ok(geometry.left >= -2 && geometry.top >= -2 && geometry.right <= geometry.width + 2 && geometry.bottom <= geometry.height + 2, `asset panel must stay inside the viewport in ${theme} at ${scale}`);
        assert.equal(await alice.locator('[data-asset-scope="mine"]').isVisible(), true, `scope filters must remain visible at ${scale}`);
        const firstCard = alice.locator(".canvas-asset-card").first();
        await firstCard.evaluate((element) => element.click());
        assert.equal(await firstCard.evaluate((element) => element.classList.contains("is-selected")), true, `asset card must remain activatable at ${scale}`);
      }
    }
  } finally {
    await browser.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log("Canvas asset library browser checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
