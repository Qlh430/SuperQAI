"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
const QA_DIR = path.join(ROOT, "artifacts", "design-qa", "global-appearance-scale");
const REFERENCE_IMAGE = process.env.AI_OS_REFERENCE_IMAGE
  || "C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\codex-clipboard-bfe5cdd5-cd71-40f6-ac01-bdb059c7b298.png";
const BASE_URL = process.env.AI_OS_TEST_BASE_URL || "http://127.0.0.1:3199";
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const ADMIN = Object.freeze({ username: "SuperQ", displayName: "超级管理员", password: "browser test administrator password" });
const ORDINARY_USER = Object.freeze({ username: `browser-user-${process.pid}-${Date.now()}`, displayName: "浏览器测试用户", password: "browser user permanent password" });
const SCALE_LEVELS = Object.freeze([0.75, 1, 1.25, 1.5, 1.75]);
let allowAuthGateNetworkDiagnostics = true;

fs.mkdirSync(QA_DIR, { recursive: true });

function assertApprox(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`,
  );
}

function parseCssColor(value) {
  const parts = String(value).match(/[\d.]+/g)?.map(Number) || [];
  return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
}

function composite(foreground, background) {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function relativeLuminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(color.r) * 0.2126 + channel(color.g) * 0.7152 + channel(color.b) * 0.0722;
}

function contrastRatio(foregroundValue, backgroundValue, backdropValue) {
  const foreground = parseCssColor(foregroundValue);
  const background = composite(parseCssColor(backgroundValue), parseCssColor(backdropValue));
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

async function readTransform(locator) {
  return locator.evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { a: matrix.a, d: matrix.d, x: matrix.m41, y: matrix.m42 };
  });
}

async function assertDesktopGeometry(page, expectedScale) {
  const desktop = page.locator(".ai-os-desktop");
  const transform = await readTransform(desktop);
  const geometry = await desktop.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      logicalWidth: Number.parseFloat(style.width),
      logicalHeight: Number.parseFloat(style.height),
      physicalWidth: bounds.width,
      physicalHeight: bounds.height,
    };
  });
  assertApprox(transform.a, expectedScale, 0.001, "desktop scale x");
  assertApprox(transform.d, expectedScale, 0.001, "desktop scale y");
  assertApprox(geometry.logicalWidth, VIEWPORT.width / expectedScale, 0.1, `${expectedScale} logical width`);
  assertApprox(geometry.logicalHeight, VIEWPORT.height / expectedScale, 0.1, `${expectedScale} logical height`);
  assertApprox(geometry.physicalWidth, VIEWPORT.width, 0.2, `${expectedScale} compensated physical width`);
  assertApprox(geometry.physicalHeight, VIEWPORT.height, 0.2, `${expectedScale} compensated physical height`);
  return geometry;
}

async function assertScaleMatrix(page, expectedScale) {
  return assertDesktopGeometry(page, expectedScale);
}

async function dragBy(page, locator, deltaX, deltaY, button = "left") {
  const bounds = await locator.boundingBox();
  assert.ok(bounds, "drag target must have measurable bounds");
  let startX = bounds.x + bounds.width / 2;
  let startY = bounds.y + bounds.height / 2;
  if (button === "middle") {
    const candidates = [
      [0.82, 0.78], [0.18, 0.78], [0.82, 0.28], [0.18, 0.28],
    ].map(([x, y]) => ({ x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y }));
    const safePoint = await locator.evaluate((element, points) => points.find((point) => {
      const target = document.elementFromPoint(point.x, point.y);
      return target && element.contains(target) && !target.closest(".canvas-node, button, input, textarea, select");
    }) || null, candidates);
    assert.ok(safePoint, "canvas pan requires a blank viewport point");
    startX = safePoint.x;
    startY = safePoint.y;
  }
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button });
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
  await page.mouse.up({ button });
}

async function waitForDesktop(page) {
  await page.waitForLoadState("networkidle");
  await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
  await page.locator(".ai-os-dock").waitFor({ state: "visible" });
  allowAuthGateNetworkDiagnostics = false;
}

async function login(page, credentials) {
  allowAuthGateNetworkDiagnostics = true;
  await page.locator("#aiOsAuthGate").waitFor({ state: "visible" });
  const form = page.locator("#aiOsLoginForm");
  await form.locator('[name="username"]').fill(credentials.username);
  await form.locator('[name="password"]').fill(credentials.password);
  await form.getByRole("button", { name: "登录 AI OS" }).click();
  await waitForDesktop(page);
}

async function bootstrapOrLoginAdmin(page) {
  allowAuthGateNetworkDiagnostics = true;
  await page.locator("#aiOsAuthGate").waitFor({ state: "visible" });
  if (await page.locator("#aiOsBootstrapForm").isVisible()) {
    const form = page.locator("#aiOsBootstrapForm");
    await form.locator('[name="username"]').fill(ADMIN.username);
    await form.locator('[name="displayName"]').fill(ADMIN.displayName);
    await form.locator('[name="password"]').fill(ADMIN.password);
    await form.getByRole("button", { name: "创建超级管理员" }).click();
    await waitForDesktop(page);
    return;
  }
  await login(page, ADMIN);
}

async function logout(page) {
  allowAuthGateNetworkDiagnostics = true;
  await page.locator("#aiOsUserMenu").click();
  await page.locator("#aiOsLogout").click();
  await page.locator("#aiOsAuthGate").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
  const loginScale = await page.evaluate(() => ({
    normalized: window.AiOsDisplay.currentScale(document.documentElement),
    cssVariable: getComputedStyle(document.querySelector("#aiOsDesktop")).getPropertyValue("--system-scale").trim() || "1",
  }));
  assert.equal(loginScale.normalized, 1, "login gate must normalize to 100% scale");
  assert.equal(Number(loginScale.cssVariable), 1, "login gate desktop scale variable must reset to 1");
}

async function openSettings(page) {
  await page.locator('[data-ai-app="settings"]').click();
  await page.locator("#aiOsSystemSettingsRoot").waitFor({ state: "visible" });
  await page.locator('[data-settings-section="appearance"]').waitFor({ state: "visible" });
}

async function selectTheme(page, theme) {
  await openSettings(page);
  await page.locator(`[data-settings-theme="${theme}"]`).click();
  await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
  await page.waitForFunction((value) => document.querySelector(`[data-settings-theme="${value}"]`)?.classList.contains("active"), theme);
}

async function selectScale(page, scale) {
  await openSettings(page);
  await page.locator(`[data-settings-scale="${scale}"]`).click();
  await page.waitForFunction((value) => document.documentElement.dataset.uiScale === String(value), scale);
  await page.waitForFunction((value) => document.querySelector(`[data-settings-scale="${value}"]`)?.classList.contains("active"), scale);
  return assertDesktopGeometry(page, scale);
}

async function verifyLoginSystemTheme(page) {
  await page.evaluate(() => localStorage.setItem("ai-theme-mode", "system"));
  await page.reload({ waitUntil: "networkidle" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
}

async function verifyAppearanceAccessibility(page) {
  await openSettings(page);
  assert.equal(await page.locator('.settings-theme-grid[role="radiogroup"][aria-label="界面主题"]').count(), 1);
  assert.equal(await page.locator('[data-settings-theme="light"][role="radio"][aria-checked="true"]').count(), 1);
  assert.equal(await page.locator('.settings-scale-grid[role="radiogroup"][aria-label="界面缩放"]').count(), 1);
  assert.equal(await page.locator('[data-settings-scale="1"][role="radio"][aria-checked="true"]').count(), 1);
  const animations = page.locator("[data-settings-animations]");
  await page.locator('[data-settings-scale="1.75"]').focus();
  await page.keyboard.press("Tab");
  assert.equal(await animations.evaluate((element) => document.activeElement === element), true, "Tab reaches the reduced-motion switch");
  assert.equal(await animations.evaluate((element) => element.matches(":focus-visible")), true, "reduced-motion switch receives keyboard-visible focus");
  const outline = await animations.evaluate((element) => getComputedStyle(element.nextElementSibling).outlineStyle);
  assert.notEqual(outline, "none", "reduced-motion switch renders a visible focus ring");
}

async function verifyWindowRetention(page) {
  await selectScale(page, 1);
  for (const appId of ["canvas", "chat", "settings"]) {
    await page.locator(`[data-ai-app="${appId}"]`).click();
  }
  await page.locator("#aiOsSystemSettingsRoot").waitFor({ state: "visible" });
  const readWindows = () => page.locator(".ai-os-app-window").evaluateAll((windows) => windows.map((element) => ({
    id: element.dataset.windowId,
    hidden: element.hidden,
  })));
  const before = await readWindows();
  await page.locator('[data-settings-scale="1.75"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1.75");
  const narrow = await readWindows();
  assert.deepEqual(narrow.map((window) => window.id), before.map((window) => window.id), "175% keeps every live window identity");
  await page.locator('[data-settings-scale="1"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1");
  assert.deepEqual(await readWindows(), before, "100% -> 175% -> 100% restores every window visibility state");
}

async function verifyScaledDialogs(page) {
  for (const scale of [1.5, 1.75]) {
    await selectScale(page, scale);
    for (const id of ["aiOsAccountDialog", "aiOsShareDialog", "aiOsShareUnlockDialog", "aiOsPasswordDialog"]) {
      const dialog = page.locator(`#${id}`);
      await dialog.evaluate((element) => element.showModal());
      const box = await dialog.boundingBox();
      assert.ok(box, `${id} must have a measurable box at ${scale}`);
      const transform = await readTransform(dialog);
      assertApprox(transform.a, scale, 0.001, `${id} scale x`);
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= VIEWPORT.width + 1 && box.y + box.height <= VIEWPORT.height + 1, `${id} stays inside the viewport at ${scale}`);
      assertApprox(box.x + box.width / 2, VIEWPORT.width / 2, 2, `${id} horizontal center at ${scale}`);
      assertApprox(box.y + box.height / 2, VIEWPORT.height / 2, 2, `${id} vertical center at ${scale}`);
      await dialog.locator('button[value="cancel"]').last().click();
      assert.equal(await dialog.evaluate((element) => element.open), false, `${id} remains interactive at ${scale}`);
    }
  }
}

async function mountEditorOverlays(page) {
  await page.evaluate(() => {
    const desktop = document.querySelector("#aiOsDesktop");
    document.querySelector("#lightboxImage").src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='2000' height='1200'/>";
    Object.assign(document.querySelector("#lightboxImage").style, { width: "2000px", height: "1200px" });
    document.querySelector("#lightbox").hidden = false;
    const compare = document.createElement("div");
    compare.className = "lightbox-compare";
    compare.dataset.finalReviewOverlay = "compare";
    compare.hidden = true;
    document.querySelector("#lightbox").append(compare);
    const mask = document.createElement("div");
    mask.className = "canvas-mask-modal";
    mask.dataset.finalReviewOverlay = "mask";
    mask.innerHTML = '<section class="canvas-mask-dialog"><header class="canvas-mask-header"><strong>遮罩</strong><span>说明</span></header><div class="canvas-mask-stage" style="width:640px;height:360px"></div><div class="canvas-mask-toolbar"><button>画笔</button><label class="canvas-mask-brush-control">大小</label><span class="canvas-mask-zoom-controls">100%</span></div></section>';
    desktop.append(mask);
    const crop = document.createElement("div");
    crop.className = "canvas-crop-workbench";
    crop.dataset.finalReviewOverlay = "crop";
    crop.innerHTML = '<section class="canvas-crop-workbench-panel" style="height:1200px"><header><strong>裁剪</strong><button>×</button></header><div class="canvas-crop-workbench-controls"><div>控制</div></div><div class="canvas-crop-workbench-preview"></div><p class="canvas-crop-workbench-status">状态</p><footer><button>保存</button></footer></section>';
    desktop.append(crop);
  });
}

async function unmountEditorOverlays(page) {
  await page.evaluate(() => {
    document.querySelector("#lightbox").hidden = true;
    document.querySelector("#lightboxImage").hidden = false;
    document.querySelector("#lightboxImage").removeAttribute("style");
    document.querySelectorAll("[data-final-review-overlay]").forEach((element) => element.remove());
  });
}

async function verifyOverlayBoundsAndThemes(page) {
  for (const scale of SCALE_LEVELS) {
    await selectScale(page, scale);
    await mountEditorOverlays(page);
    for (const selector of ["#lightboxImage", ".canvas-mask-dialog", ".canvas-crop-workbench-panel"]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box, `${selector} must have a measurable box at ${scale}`);
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= VIEWPORT.width + 1 && box.y + box.height <= VIEWPORT.height + 1, `${selector} stays inside the desktop at ${scale}: ${JSON.stringify(box)}`);
    }
    await page.evaluate(() => {
      document.querySelector("#lightboxImage").hidden = true;
      document.querySelector('[data-final-review-overlay="compare"]').hidden = false;
    });
    const compareBox = await page.locator('[data-final-review-overlay="compare"]').boundingBox();
    assert.ok(compareBox, `lightbox comparison must have a measurable box at ${scale}`);
    assert.ok(compareBox.x >= -1 && compareBox.y >= -1 && compareBox.x + compareBox.width <= VIEWPORT.width + 1 && compareBox.y + compareBox.height <= VIEWPORT.height + 1, `lightbox comparison stays inside the desktop at ${scale}: ${JSON.stringify(compareBox)}`);
    await unmountEditorOverlays(page);
  }

  await selectScale(page, 1);
  const themed = {};
  for (const theme of ["light", "dark"]) {
    await selectTheme(page, theme);
    await mountEditorOverlays(page);
    themed[theme] = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        const panel = element.closest(".canvas-mask-dialog, .canvas-crop-workbench-panel");
        const backdrop = panel && panel !== element ? getComputedStyle(panel).backgroundColor : getComputedStyle(document.body).backgroundColor;
        return { background: style.backgroundColor, color: style.color, border: style.borderColor, backdrop };
      };
      return {
        mask: read(".canvas-mask-dialog"),
        maskControl: read(".canvas-mask-toolbar button"),
        crop: read(".canvas-crop-workbench-panel"),
        cropControl: read(".canvas-crop-workbench-panel button"),
      };
    });
    await unmountEditorOverlays(page);
  }
  for (const surface of Object.keys(themed.light)) {
    assert.notEqual(themed.light[surface].background, themed.dark[surface].background, `${surface} background follows the global theme`);
    assert.notEqual(themed.light[surface].color, themed.dark[surface].color, `${surface} text follows the global theme`);
    for (const theme of ["light", "dark"]) {
      const colors = themed[theme][surface];
      assert.ok(contrastRatio(colors.color, colors.background, colors.backdrop) >= 4.5, `${surface} keeps WCAG AA text contrast in ${theme} mode`);
    }
  }
}

async function readThemeSurfaces(page) {
  const selectors = {
    settingsSidebar: ".ai-os-settings-sidebar",
    windowContent: ".ai-os-window-content:has(#aiOsSystemSettingsRoot)",
    canvasBackground: "#infiniteCanvas",
    fieldBackground: ".settings-search",
    menuBar: ".ai-os-menu-bar",
    dock: ".ai-os-dock",
  };
  const result = {};
  for (const [label, selector] of Object.entries(selectors)) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "attached" });
    result[label] = await locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
  }
  return result;
}

function assertThemeSurfacesChanged(light, dark) {
  for (const label of Object.keys(light)) {
    assert.notEqual(
      light[label].backgroundColor,
      dark[label].backgroundColor,
      `${label} background must change between light and dark themes`,
    );
  }
}

async function captureThemeCoverage(page) {
  await page.locator('[data-ai-app="settings"]').click();
  await page.locator('[data-settings-scale="1"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1");
  await assertScaleMatrix(page, 1);
  await selectTheme(page, "light");
  assert.equal(await page.getByText("画布主题", { exact: true }).count(), 0, "independent canvas theme label must not exist");
  const light = await readThemeSurfaces(page);
  await page.screenshot({ path: path.join(QA_DIR, "light-settings.png"), fullPage: true });
  await page.locator('[data-ai-app="canvas"]').click();
  await page.locator("#infiniteCanvas").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(QA_DIR, "light-canvas.png"), fullPage: true });

  await selectTheme(page, "dark");
  const dark = await readThemeSurfaces(page);
  await page.screenshot({ path: path.join(QA_DIR, "dark-settings.png"), fullPage: true });
  await page.locator('[data-ai-app="canvas"]').click();
  await page.locator("#infiniteCanvas").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(QA_DIR, "dark-canvas.png"), fullPage: true });

  assertThemeSurfacesChanged(light, dark);
  console.log(`Theme surfaces: ${JSON.stringify({ light, dark })}`);
  await selectTheme(page, "light");
}

async function verifyScaleLevels(page) {
  const geometries = {};
  for (const scale of SCALE_LEVELS) geometries[scale] = await selectScale(page, scale);
  console.log(`Scale geometries: ${JSON.stringify(geometries)}`);
}

async function verifyScaledInteractions(page) {
  await page.locator('[data-ai-app="settings"]').click();
  await page.locator('[data-settings-scale="1.5"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1.5");
  await assertScaleMatrix(page, 1.5);
  await page.locator('[data-ai-app="chat"]').click();
  const chatWindow = page.locator(".ai-os-app-window").filter({ hasText: /^AI 对话/ });
  const chatTitlebar = chatWindow.locator(".ai-os-app-titlebar");
  await chatTitlebar.waitFor({ state: "visible" });
  const chatBeforeX = (await readTransform(chatWindow)).x;
  await dragBy(page, chatTitlebar, 150, 0);
  const chatAfterX = (await readTransform(chatWindow)).x;
  assertApprox(chatAfterX - chatBeforeX, 100, 3, "150% window drag logical x");

  await page.locator('[data-ai-app="canvas"]').click();
  const canvasWindow = page.locator(".ai-os-app-window").filter({ hasText: /^无限画布/ });
  const canvasViewport = canvasWindow.locator("#infiniteCanvas");
  const canvasPlane = canvasWindow.locator("#canvasPlane");
  await canvasViewport.waitFor({ state: "visible" });
  const canvasBefore = await readTransform(canvasPlane);
  await dragBy(page, canvasViewport, 150, 75, "middle");
  await page.waitForFunction(({ x, y }) => {
    const plane = document.querySelector("#canvasPlane");
    if (!plane) return false;
    const matrix = new DOMMatrix(getComputedStyle(plane).transform);
    return Math.abs(matrix.m41 - x - 100) <= 3 && Math.abs(matrix.m42 - y - 50) <= 3;
  }, canvasBefore);
  const canvasAfter = await readTransform(canvasPlane);
  assertApprox(canvasAfter.x - canvasBefore.x, 100, 3, "150% canvas pan logical x");
  assertApprox(canvasAfter.y - canvasBefore.y, 50, 3, "150% canvas pan logical y");
}

async function createOrdinaryAccount(page) {
  const response = await page.request.post(`${BASE_URL}/api/admin/users`, {
    data: { username: ORDINARY_USER.username, displayName: ORDINARY_USER.displayName },
  });
  const data = await response.json();
  assert.equal(response.status(), 201, `ordinary account creation failed: ${JSON.stringify(data)}`);
  assert.ok(data.temporaryPassword?.trim(), "ordinary account temporary password must be returned once");
  return data.temporaryPassword.trim();
}

async function finishFirstLogin(page, temporaryPassword) {
  const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: ORDINARY_USER.username, password: temporaryPassword },
  });
  assert.equal(loginResponse.status(), 200, `ordinary account first login failed: ${await loginResponse.text()}`);
  const passwordResponse = await page.request.post(`${BASE_URL}/api/auth/change-password`, {
    data: { currentPassword: temporaryPassword, newPassword: ORDINARY_USER.password },
  });
  assert.equal(passwordResponse.status(), 200, `ordinary account password change failed: ${await passwordResponse.text()}`);
  await page.reload({ waitUntil: "networkidle" });
  await waitForDesktop(page);
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1");
}

async function verifyAccountPersistence(page) {
  await selectScale(page, 1.5);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1.5");
  await assertDesktopGeometry(page, 1.5);

  const temporaryPassword = await createOrdinaryAccount(page);
  await logout(page);
  await login(page, ADMIN);
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1.5");
  await assertDesktopGeometry(page, 1.5);

  await logout(page);
  await finishFirstLogin(page, temporaryPassword);
  await assertDesktopGeometry(page, 1);
  await openSettings(page);
  assert.equal(await page.locator('[data-settings-scale="1"].active').count(), 1, "ordinary account must retain its independent default scale");

  await logout(page);
  await login(page, ADMIN);
  await page.waitForFunction(() => document.documentElement.dataset.uiScale === "1.5");
  await assertDesktopGeometry(page, 1.5);
}

async function createReferenceComparison(browser) {
  assert.ok(fs.existsSync(REFERENCE_IMAGE), `reference screenshot is missing: ${REFERENCE_IMAGE}`);
  const referenceData = `data:image/png;base64,${fs.readFileSync(REFERENCE_IMAGE).toString("base64")}`;
  const implementationPath = path.join(QA_DIR, "light-settings.png");
  assert.ok(fs.existsSync(implementationPath), "light settings screenshot must exist before comparison");
  const implementationData = `data:image/png;base64,${fs.readFileSync(implementationPath).toString("base64")}`;
  const comparison = await browser.newPage({ viewport: { width: VIEWPORT.width * 2, height: VIEWPORT.height }, deviceScaleFactor: 1 });
  await comparison.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#dce3ed;font:600 16px system-ui;color:#152033}
    main{display:grid;grid-template-columns:1fr 1fr;width:100%;height:100%}.frame{position:relative;overflow:hidden;border-right:1px solid #778499;background:#edf1f6}
    img{display:block;width:100%;height:100%;object-fit:contain}.label{position:absolute;z-index:2;top:16px;left:16px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.9);box-shadow:0 4px 16px rgba(0,0,0,.15)}
  </style><main><section class="frame"><span class="label">DX OS reference · normalized to 1440×900</span><img src="${referenceData}"></section><section class="frame"><span class="label">AI OS · light settings · 1440×900</span><img src="${implementationData}"></section></main>`);
  await comparison.locator("img").last().waitFor({ state: "visible" });
  await comparison.screenshot({ path: path.join(QA_DIR, "reference-light-settings-comparison.png") });
  await comparison.close();
}

async function main() {
  const executablePath = [
    process.env.AI_OS_TEST_BROWSER,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, executablePath });
  const browserErrors = [];
  const expectedNetworkDiagnostics = [];
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const entry = `console: ${message.text()} @ ${location.url || "unknown"}:${location.lineNumber || 0}`;
    const expectedAuthGateRequest = message.text().includes("401 (Unauthorized)")
      && location.url?.startsWith(`${BASE_URL}/api/`);
    const expectedFaviconProbe = message.text().includes("404 (Not Found)")
      && location.url === `${BASE_URL}/favicon.ico`;
    (allowAuthGateNetworkDiagnostics && (expectedAuthGateRequest || expectedFaviconProbe)
      ? expectedNetworkDiagnostics
      : browserErrors).push(entry);
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));

  try {
    const health = await page.request.get(`${BASE_URL}/api/system/health`);
    assert.equal(health.status(), 200, "isolated AI OS health endpoint must respond before UI navigation");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await verifyLoginSystemTheme(page);
    await bootstrapOrLoginAdmin(page);
    assert.equal(await page.locator('[data-ai-app="canvas"]').isVisible(), true);
    assert.equal(await page.locator('[data-ai-app="accounts"]').isVisible(), true);

    await captureThemeCoverage(page);
    await verifyAppearanceAccessibility(page);
    await createReferenceComparison(browser);
    await verifyScaleLevels(page);
    await verifyWindowRetention(page);
    await verifyScaledDialogs(page);
    await verifyOverlayBoundsAndThemes(page);
    await verifyScaledInteractions(page);
    await verifyAccountPersistence(page);

    assert.deepEqual(browserErrors, [], `browser console must remain error-free:\n${browserErrors.join("\n")}`);
    console.log(`Expected auth-gate network diagnostics: ${expectedNetworkDiagnostics.length}`);
    console.log("AI OS browser checks passed: themes, five scales, window retention, dialogs, overlays, accessibility, persistence, account isolation, drag, pan, screenshots, and console.");
  } catch (error) {
    if (browserErrors.length) console.error(`Browser diagnostics:\n${browserErrors.join("\n")}`);
    await page.screenshot({ path: path.join(QA_DIR, "failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
