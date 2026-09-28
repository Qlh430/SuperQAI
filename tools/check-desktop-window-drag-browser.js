"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Run from check-lan-canvas-access.js --browser --window-drag, using its
// isolated account/database. No production hooks or paid API calls.
module.exports = async function checkDesktopWindowDrag(page) {
  const originalViewport = page.viewportSize();
  const originalPreferences = await page.evaluate(() => ({
    appearance: {
      theme: document.documentElement.dataset.themeMode,
      scale: Number(document.documentElement.dataset.uiScale),
      animations: document.documentElement.dataset.animations,
    },
  }));
  const windowSelector = '.ai-os-app-window[data-window-id="canvas"]';
  const appWindow = page.locator(windowSelector);
  const dockButton = page.locator('.ai-os-dock [data-ai-app="canvas"]');
  const artifactDir = path.resolve(__dirname, "..", "artifacts", "desktop-free-drag");
  fs.mkdirSync(artifactDir, { recursive: true });

  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const readGeometry = () => appWindow.evaluate((node) => {
    const transform = new DOMMatrix(node.style.transform);
    const rect = node.getBoundingClientRect();
    const session = AiOsDesktop.getSession();
    const key = `desktop-layout:${session.user.id || session.user.username}`;
    return {
      x: transform.m41, y: transform.m42,
      width: parseFloat(node.style.width), height: parseFloat(node.style.height),
      hidden: node.hidden, maximized: node.classList.contains("is-maximized"),
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      saved: JSON.parse(localStorage.getItem(key)).windows.canvas,
    };
  });
  function approx(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) < 1.5, `${label}: ${actual} vs ${expected}`);
  }
  async function dragToRaw(x, y, scale) {
    const before = await readGeometry();
    const title = await appWindow.locator(".ai-os-app-titlebar").boundingBox();
    const viewport = page.viewportSize();
    // Avoid traffic lights and choose an actually visible titlebar point.
    const left = Math.max(12, title.x + 110 * scale);
    const right = Math.min(viewport.width - 12, title.x + title.width - 16 * scale);
    assert.ok(right > left, "test starts dragging from a reachable titlebar");
    const start = { x: (left + right) / 2, y: title.y + title.height / 2 };
    assert.ok(start.y > 38 * scale && start.y < viewport.height, "drag starts below the menu bar");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + (x - before.x) * scale, start.y + (y - before.y) * scale, { steps: 8 });
    const during = await readGeometry();
    await page.mouse.up();
    await settle();
    const after = await readGeometry();
    return { before, start, during, after };
  }
  async function dragTo(x, y, scale) {
    const { during, after } = await dragToRaw(x, y, scale);
    for (const [name, value] of [["x", x], ["y", Math.max(0, y)]]) {
      approx(during[name], value, `${scale}x ${name} follows pointer with only the top edge constrained`);
      approx(after[name], value, `${scale}x ${name} does not snap after release`);
      approx(after.saved[name], value, `${scale}x ${name} persists its allowed position`);
    }
    return after;
  }
  async function recoverFromDock() {
    const before = await readGeometry();
    await dockButton.click();
    await settle();
    const after = await readGeometry();
    assert.equal(after.hidden, false, "one Dock click reveals, rather than minimizes, an unreachable active window");
    assert.ok(after.x >= 0 && after.y >= 0, "recovered window has a visible titlebar");
    assert.equal(after.width, before.width, "recovery retains window width");
    assert.equal(after.height, before.height, "recovery retains window height");
    return after;
  }

  try {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.waitForFunction(() => window.AiOsDesktop?.isReady());
    await page.evaluate(() => AiOsDesktop.openApp("canvas"));
    await appWindow.waitFor({ state: "visible" });

    for (const scale of [1, 1.5]) {
      await page.evaluate((value) => AiOsDisplay.applyPreferences({
        appearance: { theme: "light", scale: value, animations: "reduced" },
      }), scale);
      await settle();
      const logicalWidth = page.viewportSize().width / scale;
      const logicalHeight = Math.floor(page.viewportSize().height / scale) - 38 - 86;
      const initial = await readGeometry();
      assert.equal(initial.maximized, false, "test uses the desktop, not mobile, window layout");

      const menuBottom = await page.locator(".ai-os-menu-bar").evaluate((node) => node.getBoundingClientRect().bottom);

      // A modest upward drag clamps at logical y=0 and stays restored.
      const nudged = await dragToRaw(180, -10, scale);
      approx(nudged.during.y, 0, "upward dragging stops at logical y=0");
      approx(nudged.during.top, menuBottom, "titlebar stays immediately below the scaled top menu");
      approx(nudged.after.y, 0, "upward dragging does not snap after release");
      assert.equal(nudged.after.maximized, false, "releasing a drag below the top strip keeps the window restored");

      // A hard upward drag lands the pointer in the top strip: Aero-snap maximizes.
      const snapped = await dragToRaw(180, -200, scale);
      approx(snapped.during.y, 0, "hard upward dragging still stops at logical y=0");
      approx(snapped.during.top, menuBottom, "the dragged titlebar never rises above the top menu");
      assert.equal(snapped.after.maximized, true, "releasing the drag on the top strip maximizes the window");
      approx(snapped.after.y, 0, "the snapped window starts at the work-area top");
      approx(snapped.after.x, 0, "the snapped window fills the work area horizontally");
      await appWindow.locator('[data-window-action="maximize"]').click();
      await settle();
      assert.equal((await readGeometry()).maximized, false, "the maximize control restores the snapped window");
      await dragTo(180, 80, scale);

      const left = await dragTo(-initial.width + 160, 110, scale);
      assert.ok(left.left < 0, "window can leave the left edge");
      await page.mouse.click(45 * scale, left.top + 90 * scale);
      approx((await readGeometry()).x, left.x, "normal content focus does not clamp the left edge");
      const right = await dragTo(logicalWidth - 160, 110, scale);
      assert.ok(right.right > page.viewportSize().width, "window can leave the right edge");
      await dragTo(180, logicalHeight - 170, scale);
      const bottom = await readGeometry();
      assert.ok(bottom.bottom > page.viewportSize().height, "window can continue below the Dock and screen");
      const paintedBelowDock = await page.evaluate((selector) => {
        const node = document.querySelector(selector);
        const rect = node.getBoundingClientRect();
        const dock = document.querySelector(".ai-os-dock").getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + 20, dock.bottom - 2);
        return hit === node || node.contains(hit);
      }, windowSelector);
      assert.equal(paintedBelowDock, true, "window is rendered below the work-area boundary alongside the Dock");
      if (scale === 1) await page.screenshot({ path: path.join(artifactDir, "below-dock.png") });

      // Maximization still fits the work area, and it also claims the menu bar
      // strip so the app reaches the top of the screen.
      // Maximizing also claims the menu bar strip, so the work area grows by 38.
      const maximizedHeight = logicalHeight + 38;
      const menuBarVisibility = () => page.locator(".ai-os-menu-bar").evaluate((node) => getComputedStyle(node).visibility);
      assert.equal(await menuBarVisibility(), "visible", "the menu bar is shown before maximizing");
      await appWindow.locator('[data-window-action="maximize"]').click();
      const maximized = await readGeometry();
      assert.equal(maximized.maximized, true);
      approx(maximized.y, 0, "maximized window starts at the work-area top");
      approx(maximized.height, maximizedHeight, "a maximized window claims the menu bar strip and still leaves space for the Dock");
      assert.equal(await menuBarVisibility(), "hidden", "a maximized window hides the AI OS menu bar");
      await appWindow.locator('[data-window-action="maximize"]').click();
      assert.equal(await menuBarVisibility(), "visible", "restoring the window brings the AI OS menu bar back");
      approx((await readGeometry()).y, bottom.y, "restore retains below-Dock placement");

      // Pointer capture must keep the drag alive even when crossing the Dock.
      const dockRect = await page.locator(".ai-os-dock").boundingBox();
      const centeredX = (logicalWidth - bottom.width) / 2;
      await dragTo(centeredX, 100, scale);
      const targetY = dockRect.y / scale - 38 + 10;
      await dragTo(centeredX, targetY, scale);
      const dockOverlap = await dockButton.evaluate((button) => {
        const buttonRect = button.getBoundingClientRect();
        const rect = document.querySelector('.ai-os-app-window[data-window-id="canvas"]').getBoundingClientRect();
        const x = buttonRect.x + buttonRect.width / 2;
        const y = buttonRect.y + buttonRect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          windowBehind: x > rect.left && x < rect.right && y > rect.top && y < rect.bottom,
          dockOnTop: hit === button || button.contains(hit),
        };
      });
      assert.equal(dockOverlap.windowBehind, true, "Dock hit point overlaps the freely dragged window");
      assert.equal(dockOverlap.dockOnTop, true, "Dock stays clickable above the overlapping window");
      await recoverFromDock();

      // Side and bottom edges remain unbounded and recoverable.
      for (const [x, y] of [
        [-initial.width - 60, 100], [logicalWidth + 60, 100],
        [160, logicalHeight + 200],
      ]) {
        await dragTo(x, y, scale);
        await recoverFromDock();
      }

      // Normal Dock toggle behavior remains unchanged when the titlebar is reachable.
      await dockButton.click();
      assert.equal((await readGeometry()).hidden, true, "Dock still minimizes a visible active app");
      await dockButton.click();
      assert.equal((await readGeometry()).hidden, false, "Dock still restores minimized apps");
      console.log(`PASS top boundary, free side/bottom drag, Dock recovery and maximize at ${scale * 100}%`);
    }

    // A persisted negative x remains after reopening, when its titlebar is reachable.
    await page.evaluate(() => AiOsDisplay.applyPreferences({ appearance: { scale: 1, animations: "reduced" } }));
    await dragTo(-180, 120, 1);
    await page.reload();
    await page.waitForFunction(() => window.AiOsDesktop?.isReady());
    await page.evaluate(() => AiOsDesktop.openApp("canvas"));
    await appWindow.waitFor({ state: "visible" });
    approx((await readGeometry()).x, -180, "saved negative x survives page reload and reopening");
    await dragTo(180, 120, Number(await page.evaluate(() => document.documentElement.dataset.uiScale)));
    console.log("PASS free window geometry persists across reload");

    // Windows stack like a desktop: clicking a covered window raises it, even though
    // the titlebar and the hosted app both stop pointerdown propagation.
    await page.evaluate(() => AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: 1, animations: "reduced" } }));
    await settle();
    await page.evaluate(() => AiOsDesktop.openApp("chat"));
    const chatWindow = page.locator('.ai-os-app-window[data-window-id="chat"]');
    await chatWindow.waitFor({ state: "visible" });
    await settle();
    const readStack = () => page.evaluate(() => [...document.querySelectorAll(".ai-os-app-window")]
      .filter((node) => !node.hidden)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset.windowId,
          z: Number(node.style.zIndex),
          focused: node.classList.contains("is-focused"),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        };
      }));
    const cardOf = (stack, id) => stack.find((item) => item.id === id);
    const dragWindowBy = async (locator, dx, dy) => {
      const title = await locator.locator(".ai-os-app-titlebar").boundingBox();
      const start = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
      await page.mouse.up();
      await settle();
    };

    await dragWindowBy(chatWindow, 620, 430);
    let stack = await readStack();
    assert.ok(cardOf(stack, "chat").z > cardOf(stack, "canvas").z, "the moved window stays on top before the raise test");

    const coveredCanvas = cardOf(stack, "canvas").rect;
    await page.mouse.click(coveredCanvas.x + 200, coveredCanvas.y + 17);
    await settle();
    stack = await readStack();
    assert.ok(cardOf(stack, "canvas").z > cardOf(stack, "chat").z, "clicking a covered titlebar raises that window");
    assert.equal(cardOf(stack, "canvas").focused, true, "the window raised from its titlebar becomes focused");
    await page.screenshot({ path: path.join(artifactDir, "raise-covered-window.png") });

    const exposedChat = cardOf(stack, "chat").rect;
    await page.mouse.click(exposedChat.x + 400, exposedChat.y + 17);
    await settle();
    stack = await readStack();
    assert.ok(cardOf(stack, "chat").z > cardOf(stack, "canvas").z, "clicking the raised window's titlebar raises it again");
    const contentTarget = (() => {
      const canvas = cardOf(stack, "canvas").rect;
      return { x: canvas.x + 300, y: canvas.y + 300 };
    })();
    const contentHit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".ai-os-app-window")?.dataset.windowId, [contentTarget.x, contentTarget.y]);
    assert.equal(contentHit, "canvas", "the content probe point is not covered by another window");
    await page.mouse.click(contentTarget.x, contentTarget.y);
    await settle();
    stack = await readStack();
    assert.ok(cardOf(stack, "canvas").z > cardOf(stack, "chat").z, "clicking app content raises its window above the covering window");
    assert.equal(cardOf(stack, "canvas").focused, true, "the window raised from its content becomes focused");
    await page.evaluate(() => AiOsDesktop.closeApp("chat"));
    console.log("PASS clicking a covered window raises and focuses it");
  } finally {
    await page.mouse.up().catch(() => {});
    await page.evaluate((preferences) => {
      AiOsDesktop.closeApp("canvas");
      AiOsDisplay.applyPreferences(preferences);
    }, originalPreferences);
    await page.setViewportSize(originalViewport);
  }
};
