const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const APP_URL = process.env.CANVAS_VIRTUAL_APP_URL || "http://127.0.0.1:3099";
const NODE_COUNT = 600;
const PIXEL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%236d5dfc'/%3E%3C/svg%3E";

function createLegacyBoard() {
  const nodes = Array.from({ length: NODE_COUNT }, (_, index) => ({
    id: String(index + 1),
    kind: index % 2 ? "text" : "image",
    uploadOnly: index % 2 === 0,
    imageSrc: index % 2 === 0 ? PIXEL : undefined,
    imageName: index % 2 === 0 ? `legacy-${index + 1}.svg` : undefined,
    text: index % 2 ? `legacy text ${index + 1}` : undefined,
    x: String((index % 30) * 420 - 5000),
    y: String(Math.floor(index / 30) * 320 - 2500),
    width: index % 2 ? 292 : 320,
    height: 240,
    ...(index === 0 ? { futureField: "preserved" } : {}),
  }));
  return {
    id: "legacy-virtual-board",
    title: "Legacy virtual board",
    createdAt: "2026-08-01T00:00:00.000Z",
    viewport: { x: 5000, y: 2500, scale: 1 },
    nodes,
    connections: Array.from({ length: NODE_COUNT - 1 }, (_, index) => ({
      from: String(index + 1),
      to: String(index + 2),
    })),
  };
}

(async () => {
  const board = createLegacyBoard();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("PAGEERROR", error.message);
  });
  await page.route("**/api/canvas/boards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ boards: [board], trash: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ boards: [board], trash: [], board }) });
  });

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible" });
    await page.locator('[data-board-id="legacy-virtual-board"]').click({ timeout: 5000 });
    await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
    await page.waitForFunction(() => typeof window.canvasVirtualStore === "object");

    const result = await page.evaluate(() => {
      const serialized = serializeCanvasBoard();
      return {
        storeSize: canvasVirtualStore.size,
        mountedNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
        serializedNodes: serialized.nodes.length,
        serializedConnections: serialized.connections.length,
        futureField: serialized.nodes[0]?.futureField,
      };
    });
    assert.equal(result.storeSize, NODE_COUNT);
    assert.ok(result.mountedNodes < 220, `expected fewer than 220 mounted nodes, received ${result.mountedNodes}`);
    assert.equal(result.serializedNodes, NODE_COUNT);
    assert.equal(result.serializedConnections, NODE_COUNT - 1);
    assert.equal(result.futureField, "preserved");
    assert.deepEqual(errors, []);
    console.log("Canvas virtualization round-trip UI checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
