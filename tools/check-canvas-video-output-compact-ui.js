const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.VIDEO_OUTPUT_UI_BASE_URL || "http://127.0.0.1:3107";
const root = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("#infiniteCanvas").waitFor({ state: "visible" });
    await page.evaluate(() => {
    setActiveTool("canvas");
    canvasState.isRestoring = true;
    clearCanvasPlane();
    canvasState.x = 32;
    canvasState.y = 24;
    canvasState.scale = 1;
    applyCanvasTransform();
    document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed");
    addCanvasVideoOutputNode({ x: 320, y: 130 }, {
      videoHistory: [
        {
          id: "compact-history-1",
          src: "/output/minimax_h3_1786420193143_544fc0ed.mp4",
          name: "MiniMax H3 night walk 01.mp4",
          mimeType: "video/mp4",
          duration: 10,
          promptSummary: "A cinematic nighttime walk past a convenience store.",
          createdAt: "2026-08-11T03:49:53.000Z",
        },
        {
          id: "compact-history-2",
          src: "/output/minimax_h3_1786506423512_658841dc.mp4",
          name: "MiniMax H3 night walk 02.mp4",
          mimeType: "video/mp4",
          duration: 10,
          promptSummary: "Wet pavement, cool streetlights and a steady forward tracking shot.",
          createdAt: "2026-08-12T03:47:03.000Z",
        },
      ],
      activeVideoId: "compact-history-2",
    });
    });

    const node = page.locator(".canvas-node-video-output");
    const stage = node.locator(".canvas-video-output-stage");
    const toggle = node.locator(":scope > .canvas-video-history-toggle");
    await node.waitFor({ state: "visible" });
    assert.equal(await node.locator(".canvas-video-output-meta").count(), 0);
    assert.equal(await node.locator(".canvas-video-output-actions").count(), 0);
    assert.equal(await node.locator(":scope > a[download]").count(), 0);
    assert.equal(await node.locator(".canvas-video-output-stage video[controls]").count(), 1);
    assert.equal(await toggle.locator("b").textContent(), "2");

    const stageBox = await stage.boundingBox();
    const toggleBox = await toggle.boundingBox();
    assert.ok(toggleBox.x >= stageBox.x + stageBox.width - 1, "History control must not cover native video controls");
    assert.ok(toggleBox.y + toggleBox.height > stageBox.y + stageBox.height - 80, "History control should remain near the node bottom");

    await toggle.click();
    const panel = node.locator(".canvas-video-history-panel");
    await panel.waitFor({ state: "visible" });
    assert.equal(await panel.locator(".canvas-video-history-item").count(), 2);
    assert.equal(await panel.locator(".canvas-video-history-download").count(), 2);
    assert.equal(await panel.locator(".canvas-video-history-remove").count(), 2);
    assert.equal(await panel.locator(".canvas-video-history-prompt").count(), 2);
    assert.match(await panel.textContent(), /MiniMax H3 night walk 02\.mp4/);
    assert.match(await panel.textContent(), /Wet pavement/);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");

    await page.screenshot({ path: path.join(root, "artifacts", "canvas-video-output-compact-ui.png"), fullPage: true });
    await page.locator("#infiniteCanvas").click({ position: { x: 80, y: 80 } });
    assert.equal(await panel.isHidden(), true);
    assert.deepEqual(pageErrors, []);

    console.log("Canvas video output compact UI checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
