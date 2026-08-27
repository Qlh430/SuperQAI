const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const APP_URL = process.env.CANVAS_HISTORY_LOADING_APP_URL || "http://127.0.0.1:3099";
const ROOT = path.join(__dirname, "..");
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "canvas-history-progressive-loading-ui.png");
const NODE_COUNT = 186;
const CONNECTION_COUNT = 157;

function createProgressiveBoard() {
  const nodes = Array.from({ length: NODE_COUNT }, (_, index) => ({
    id: `progressive-node-${index + 1}`,
    kind: "text",
    text: `历史画布节点 ${index + 1}`,
    x: 100 + (index % 10) * 250,
    y: 100 + Math.floor(index / 10) * 170,
    width: 220,
    height: 130,
  }));
  const connections = Array.from({ length: CONNECTION_COUNT }, (_, index) => ({
    from: nodes[index].id,
    to: nodes[index + NODE_COUNT - CONNECTION_COUNT].id,
  }));
  return {
    id: "progressive-test-board",
    title: "186 节点渐进加载测试",
    createdAt: "2026-08-19T08:00:00.000Z",
    updatedAt: "2026-08-19T08:10:00.000Z",
    viewport: { x: 80, y: 60, scale: 1 },
    nodes,
    connections,
  };
}

(async () => {
  const board = createProgressiveBoard();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/canvas/boards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ boards: [board], trash: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ boards: [board], trash: [], board }),
    });
  });

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("#infiniteCanvas").waitFor({ state: "visible" });
    await page.evaluate(() => {
      document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed");
      window.__canvasLoadingProgress = [];
      const percent = document.querySelector("#canvasBoardLoadingPercent");
      const capture = () => {
        const value = Number.parseInt(percent?.textContent || "", 10);
        if (Number.isFinite(value)) window.__canvasLoadingProgress.push(value);
      };
      capture();
      new MutationObserver(capture).observe(percent, { childList: true, subtree: true, characterData: true });
    });

    await page.locator("#canvasHistoryButton").click();
    const card = page.locator('[data-board-id="progressive-test-board"]');
    await card.waitFor({ state: "visible" });
    await card.click();

    const overlay = page.locator("#canvasBoardLoading");
    await overlay.waitFor({ state: "visible" });
    await page.waitForFunction(() => /正在恢复节点|正在整理节点关系|正在完成画布/.test(
      document.querySelector("#canvasBoardLoadingDetail")?.textContent || "",
    ));
    assert.match(await page.locator("#canvasBoardLoadingDetail").textContent(), /正在恢复节点|正在整理节点关系|正在完成画布/);
    const overlayStyles = await overlay.evaluate((element) => {
      const overlayStyle = getComputedStyle(element);
      const spinnerStyle = getComputedStyle(element.querySelector(".canvas-board-loading-spinner"));
      return {
        pointerEvents: overlayStyle.pointerEvents,
        animationName: spinnerStyle.animationName,
      };
    });
    assert.equal(overlayStyles.pointerEvents, "all");
    assert.equal(overlayStyles.animationName, "canvas-board-loading-spin");
    assert.equal(await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }))), false);
    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    await overlay.waitFor({ state: "hidden", timeout: 30000 });
    assert.equal(await page.evaluate(() => window.canvasVirtualStore?.size), NODE_COUNT);
    const mountedNodeCount = await page.locator("#canvasPlane .canvas-node").count();
    assert.ok(mountedNodeCount > 0 && mountedNodeCount < NODE_COUNT, `Expected a virtualized subset, received ${mountedNodeCount}`);
    assert.equal(await page.evaluate(() => serializeCanvasBoard().nodes.length), NODE_COUNT);
    assert.equal(await page.evaluate(() => canvasState.connections.length), CONNECTION_COUNT);
    assert.equal(await page.evaluate(() => canvasState.boardOpening), false);
    const progressValues = await page.evaluate(() => window.__canvasLoadingProgress);
    assert.ok(progressValues.some((value) => value > 0 && value < 100), `Expected intermediate progress, received: ${progressValues.join(", ")}`);
    assert.ok(progressValues.includes(100), `Expected 100% completion, received: ${progressValues.join(", ")}`);
    assert.deepEqual(pageErrors, []);
    console.log("Canvas history progressive loading UI checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
