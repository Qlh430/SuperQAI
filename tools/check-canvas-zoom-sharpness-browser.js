"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function dependency(name) {
  try { return require(name); } catch {
    return require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules", name));
  }
}
const { chromium } = dependency("playwright");
const sharp = dependency("sharp");
const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const shellStyles = fs.readFileSync(path.join(root, "desktop-shell.css"), "utf8");
const themeStyles = fs.readFileSync(path.join(root, "ai-os-theme.css"), "utf8");
const output = path.join(root, "artifacts", "canvas-zoom-sharpness");

function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  let depth = 0;
  for (let i = script.indexOf("{", start); i < script.length; i += 1) {
    if (script[i] === "{") depth += 1;
    if (script[i] === "}" && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Unterminated ${name}`);
}

const runtime = `
  let canvasRasterRefreshFrame = 0;
  let canvasRasterRefreshReason = "";
  let canvasDetailReady = true;
  const canvasImageToolbar = null;
  const canvasImageInfo = null;
  const canvasState = { x: 32, y: 32, scale: 1 };
  const CanvasViewRules = {
    gridBackgroundSize: () => 34,
    scaleLabel: (scale) => Math.round(scale * 100) + "%",
  };
  function reprojectCanvasSceneLayer() {}
  function updateCanvasSelectionFrame() {}
  ${["cancelCanvasRasterRefresh", "beginCanvasRasterInteraction", "scheduleCanvasRasterRefresh", "applyCanvasTransformNow"].map(functionSource).join("\n")}
`;

async function painted(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
}

async function fixture(browser, scale, dpr) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: dpr });
  const cdp = await page.context().newCDPSession(page);
  let layers = [];
  cdp.on("LayerTree.layerTreeDidChange", (event) => { layers = event.layers || []; });
  await cdp.send("LayerTree.enable");
  await page.setContent(`<html data-theme="light" data-ai-immersive-app="canvas"><head><style>${styles}\n${shellStyles}\n${themeStyles}</style><style>
    html, body { margin: 0; background: white; }
    #infiniteCanvas { position: absolute; inset: 0; overflow: hidden; }
    .canvas-node { width: 280px; height: 158px; transform: translate(0px, 0px); box-shadow: none; color: #111827; font-family: Arial, sans-serif; }
    .sharpness-title { padding: 14px; font-size: 15px; font-weight: 700; border-bottom: 1px solid #ccc; }
    .sharpness-content { margin: 12px; font-size: 12px; line-height: 1.5; }
  </style></head><body><div class="ai-os-desktop"><div class="ai-os-window-layer"><div class="ai-os-app-window is-immersive"><div class="ai-os-window-content"><div id="infiniteCanvas"><div class="canvas-plane" id="canvasPlane">
    <div class="canvas-node"><div class="sharpness-title">生成节点 · Canvas 226%</div>
    <div class="sharpness-content">一颗苹果树<br>Sharp text 0123456789<br>图集 · 原图细节</div></div>
  </div></div></div></div></div></div></body></html>`);
  await page.addScriptTag({ content: runtime });
  await page.evaluate((value) => {
    canvasState.scale = value;
    applyCanvasTransformNow();
    beginCanvasRasterInteraction();
  }, scale);
  await painted(page);
  const { root: documentNode } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: documentNode.nodeId, selector: "#canvasPlane" });
  const { node } = await cdp.send("DOM.describeNode", { nodeId });
  page.rasterLayer = () => layers.find((layer) => layer.backendNodeId === node.backendNodeId);
  page.rasterLayerHistory = [];
  cdp.on("LayerTree.layerTreeDidChange", () => page.rasterLayerHistory.push(page.rasterLayer()?.layerId || null));
  return page;
}

async function pixelDifference(a, b) {
  const left = await sharp(a).removeAlpha().raw().toBuffer();
  const right = await sharp(b).removeAlpha().raw().toBuffer();
  assert.equal(left.length, right.length);
  let total = 0;
  for (let i = 0; i < left.length; i += 1) total += Math.abs(left[i] - right[i]);
  return total / left.length;
}

async function capture(page, clip) {
  // Playwright's screenshot helper overrides viewport metrics, which itself
  // rerasterizes stale layers and hides this bug. Read the compositor directly.
  const cdp = await page.context().newCDPSession(page);
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await cdp.detach();
  const dpr = await page.evaluate(() => devicePixelRatio);
  return sharp(Buffer.from(result.data, "base64")).extract({ left: Math.round(clip.x * dpr), top: Math.round(clip.y * dpr), width: Math.round(clip.width * dpr), height: Math.round(clip.height * dpr) }).png().toBuffer();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((item) => item && fs.existsSync(item));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const [from, to, dpr] of [[1, 2.26, 1], [0.25, 2.26, 1], [1, 5, 1], [1, 2.26, 2]]) {
      const page = await fixture(browser, from, dpr);
      const reference = await fixture(browser, to, dpr);
      await reference.evaluate(() => document.querySelector("#canvasPlane").style.willChange = "auto");
      await painted(reference);
      const clip = { x: 32, y: 32, width: Math.ceil(280 * to), height: Math.ceil(158 * to) };
      const expected = await capture(reference, clip);
      await page.evaluate(async (value) => {
        const initial = canvasState.scale;
        for (let step = 1; step <= 18; step += 1) {
          canvasState.scale = initial + (value - initial) * step / 18;
          applyCanvasTransformNow();
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }, to);
      await painted(page);
      const before = await capture(page, clip);
      const layerId = page.rasterLayer()?.layerId;
      assert.ok(layerId, "The canvas must have a compositor layer before refreshing.");
      page.rasterLayerHistory.length = 0;
      await page.evaluate(() => scheduleCanvasRasterRefresh("sharpness-test"));
      await page.waitForFunction(() => document.querySelector("#canvasPlane").dataset.rasterState === "ready");
      await painted(page);
      const actual = await capture(page, clip);
      assert.ok(page.rasterLayerHistory.length > 0, "The refresh must reach the compositor.");
      assert.ok(page.rasterLayerHistory.every((id) => id === layerId), "The plane's compositor layer must survive every refresh frame.");
      const staleDifference = await pixelDifference(before, expected);
      const settledDifference = await pixelDifference(actual, expected);
      const label = `${from}-to-${to}-dpr-${dpr}`;
      fs.writeFileSync(path.join(output, `${label}-before.png`), before);
      fs.writeFileSync(path.join(output, `${label}-settled.png`), actual);
      fs.writeFileSync(path.join(output, `${label}-reference.png`), expected);
      console.log(JSON.stringify({ from, to, dpr, staleDifference, settledDifference }));
      assert.ok(settledDifference < 0.5, `Settled ${Math.round(to * 100)}% zoom still stretches a stale raster (pixel difference ${settledDifference.toFixed(3)}; expected < 0.5).`);
      const cancelled = await page.evaluate(async () => {
        const plane = document.querySelector("#canvasPlane");
        const epoch = plane.dataset.rasterRefreshEpoch;
        scheduleCanvasRasterRefresh("cancelled-idle");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        beginCanvasRasterInteraction();
        canvasDetailReady = false;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { epochUnchanged: plane.dataset.rasterRefreshEpoch === epoch, state: plane.dataset.rasterState, willChange: plane.style.willChange };
      });
      assert.deepEqual(cancelled, { epochUnchanged: true, state: "interaction", willChange: "transform" }, "Resuming a gesture must cancel a pending idle repaint.");
      await page.close();
      await reference.close();
    }
    console.log("Canvas zoom sharpness browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
