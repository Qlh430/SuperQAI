const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const APP_URL = process.env.GRID_SLICING_APP_URL || "http://127.0.0.1:3000";
const SCREENSHOT_PATH = path.join(__dirname, "..", "artifacts", "canvas-grid-editor-ui.png");

(async () => {
  const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
  const options = { headless: true };
  if (fs.existsSync(executable)) options.executablePath = executable;
  const browser = await chromium.launch(options);
  const page = await browser.newPage({ viewport: { width: 1720, height: 1080 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const uploadedPngs = new Map();
  let uploadIndex = 0;
  let savedBoard = null;

  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/canvas/boards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ boards: [], trash: [] }) });
      return;
    }
    savedBoard = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ boards: savedBoard ? [savedBoard] : [], trash: [], board: savedBoard }),
    });
  });
  await page.route("**/api/upload-image", async (route) => {
    uploadIndex += 1;
    const url = `/test-output/grid-editor-${uploadIndex}.png`;
    uploadedPngs.set(url, route.request().postDataBuffer());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url }) });
  });
  await page.route("**/test-output/*.png", async (route) => {
    const url = new URL(route.request().url()).pathname;
    const body = uploadedPngs.get(url);
    await route.fulfill({ status: body ? 200 : 404, contentType: "image/png", body: body || Buffer.alloc(0) });
  });

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#canvasPlane");
  await page.evaluate(() => {
    document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed");
    const source = document.createElement("canvas");
    source.width = 1200;
    source.height = 900;
    const context = source.getContext("2d");
    context.fillStyle = "#ef4444";
    context.fillRect(0, 0, 600, 450);
    context.fillStyle = "#22c55e";
    context.fillRect(600, 0, 600, 450);
    context.fillStyle = "#3b82f6";
    context.fillRect(0, 450, 600, 450);
    context.fillStyle = "#f59e0b";
    context.fillRect(600, 450, 600, 450);
    const src = source.toDataURL("image/png");
    const gallery = addCanvasGallery({ x: 120, y: 130 });
    renderCanvasGalleryNode(gallery, {
      title: "宫格编辑 UI 测试源图集",
      images: [{ id: "source-active", name: "source-1200x900.png", src, savedUrl: src }],
      activeImageId: "source-active",
    });
    gallery.dataset.width = "420";
    applyCanvasNodeSize(gallery);
    window.__gridEditorSourceId = gallery.dataset.id;
    window.__gridEditorSourceSnapshot = {
      images: JSON.parse(gallery.dataset.galleryImages),
      activeId: gallery.dataset.galleryActiveImageId,
    };
  });

  const source = page.locator(`.canvas-node-gallery[data-id="${await page.evaluate(() => window.__gridEditorSourceId)}"]`);
  const toggle = source.locator(".canvas-gallery-slice-toggle");
  await source.locator(".canvas-gallery-cover img").waitFor({ state: "visible" });

  await source.hover();
  await toggle.click();
  await page.waitForSelector("#canvasGridMenu:not([hidden])");
  await page.locator("#canvasGridMenu [data-grid-rows='2'][data-grid-columns='2']").click();
  await page.locator("#canvasGridMenu [data-grid-action='direct']").click();
  await page.waitForFunction(() => document.querySelectorAll(".canvas-node-image[data-grid-slice-row]").length === 4);
  const direct = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".canvas-node-image[data-grid-slice-row]"))
      .map((node) => ({
        row: Number(node.dataset.gridSliceRow),
        column: Number(node.dataset.gridSliceColumn),
        x: Number(node.dataset.x),
        y: Number(node.dataset.y),
      }))
      .sort((a, b) => a.row - b.row || a.column - b.column);
    const sourceNode = document.querySelector(`.canvas-node-gallery[data-id="${window.__gridEditorSourceId}"]`);
    return {
      nodes,
      images: JSON.parse(sourceNode.dataset.galleryImages),
      activeId: sourceNode.dataset.galleryActiveImageId,
    };
  });
  assert.equal(direct.nodes.length, 4);
  assert.ok(direct.nodes[1].x > direct.nodes[0].x && direct.nodes[1].y === direct.nodes[0].y);
  assert.ok(direct.nodes[2].y > direct.nodes[0].y && direct.nodes[2].x === direct.nodes[0].x);
  assert.deepEqual(direct.images, await page.evaluate(() => window.__gridEditorSourceSnapshot.images));
  assert.equal(direct.activeId, await page.evaluate(() => window.__gridEditorSourceSnapshot.activeId));

  await source.hover();
  await toggle.click();
  await page.locator("#canvasGridMenu [data-grid-rows='3'][data-grid-columns='3']").click();
  await page.locator("#canvasGridMenu [data-grid-action='editor']").click();
  await page.waitForSelector(".canvas-node-grid-editor");
  const editor = page.locator(".canvas-node-grid-editor");
  await page.waitForFunction(() => document.querySelectorAll(".canvas-node-grid-editor .canvas-grid-editor-cell").length === 9);
  assert.equal(await editor.locator(".canvas-grid-editor-cell").count(), 9);
  assert.equal(await page.evaluate(() => {
    const editorNode = document.querySelector(".canvas-node-grid-editor");
    return canvasState.connections.filter((item) => item.to === editorNode.dataset.id).length;
  }), 1);

  await editor.locator(".canvas-grid-editor-aspect").click();
  await editor.locator("[data-grid-editor-aspect='3:4']").click();
  const cropRatios = await editor.locator(".canvas-grid-editor-cell").evaluateAll((cells) => (
    cells.map((cell) => {
      const crop = JSON.parse(cell.dataset.crop);
      return crop.width / crop.height;
    })
  ));
  assert.ok(cropRatios.every((ratio) => Math.abs(ratio - 0.75) < 0.0001));

  await editor.locator(".canvas-grid-editor-edit").click();
  await editor.locator(".canvas-grid-editor-uniform-gap").fill("12");
  await editor.locator(".canvas-grid-editor-uniform-gap").press("Tab");
  assert.deepEqual(await editor.evaluate((node) => {
    const state = JSON.parse(node.dataset.gridEditorState);
    return {
      uniformGap: state.uniformGap,
      horizontal: state.horizontalBands.map((band) => band.end - band.start),
      vertical: state.verticalBands.map((band) => band.end - band.start),
    };
  }), { uniformGap: 12, horizontal: [12, 12], vertical: [12, 12] });

  const firstVertical = editor.locator(".canvas-grid-editor-band.is-vertical").first();
  await firstVertical.locator("[data-band-edge='move']").click({ position: { x: 1, y: 30 } });
  await editor.locator(".canvas-grid-editor-band-gap").fill("20");
  await editor.locator(".canvas-grid-editor-band-gap").press("Tab");
  assert.equal(await editor.evaluate((node) => {
    const state = JSON.parse(node.dataset.gridEditorState);
    const band = state.verticalBands.find((item) => item.id === state.selectedBand.id);
    return band.end - band.start;
  }), 20);

  const band = editor.locator(".canvas-grid-editor-band.is-vertical").first();
  const layerBox = await editor.locator(".canvas-grid-editor-band-layer").boundingBox();
  const bandBox = await band.boundingBox();
  assert.ok(layerBox && bandBox);
  await band.locator("[data-band-edge='move']").dispatchEvent("pointerdown", {
    pointerId: 31,
    pointerType: "mouse",
    button: 0,
    clientX: bandBox.x + bandBox.width / 2,
    clientY: bandBox.y + 30,
    bubbles: true,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 31, pointerType: "mouse", clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 31, pointerType: "mouse", clientX: x, clientY: y, bubbles: true }));
  }, { x: layerBox.x + layerBox.width * 0.28, y: layerBox.y + 30 });

  const selectedFrame = editor.locator(".canvas-grid-editor-cell-frame").first();
  const frameBox = await selectedFrame.boundingBox();
  assert.ok(frameBox);
  await selectedFrame.dispatchEvent("pointerdown", {
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    clientX: frameBox.x + frameBox.width / 2,
    clientY: frameBox.y + frameBox.height / 2,
    bubbles: true,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 41, pointerType: "mouse", clientX: x + 20, clientY: y + 12, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 41, pointerType: "mouse", clientX: x + 20, clientY: y + 12, bubbles: true }));
  }, { x: frameBox.x + frameBox.width / 2, y: frameBox.y + frameBox.height / 2 });
  await editor.locator(".canvas-grid-editor-zoom").evaluate((input) => {
    input.value = "1.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const editedState = await editor.evaluate((node) => JSON.parse(node.dataset.gridEditorState));
  assert.equal(editedState.aspect, "3:4");
  assert.equal(editedState.cellTransforms.find((item) => item.key === editedState.selectedCellKey).zoom, 1.5);
  assert.ok(editedState.verticalBands[0].start < 330, "The first vertical cut should move left from its equal 400px center");

  await editor.locator(".canvas-grid-editor-collapse").click();
  assert.equal(await editor.locator(".canvas-grid-editor-body").isHidden(), true);
  await editor.locator(".canvas-grid-editor-collapse").click();
  assert.equal(await editor.locator(".canvas-grid-editor-body").isVisible(), true);

  await editor.locator(".canvas-grid-editor-output").click();
  await page.waitForFunction(() => document.querySelectorAll(".canvas-node-gallery").length === 2);
  await page.waitForFunction(() => document.querySelector(".canvas-node-grid-editor")?.dataset.gridEditorOutputting !== "true");
  const outputResult = await page.evaluate(async () => {
    const resultNode = Array.from(document.querySelectorAll(".canvas-node-gallery"))
      .find((node) => node.dataset.galleryTitle === "宫格裁切图集");
    const images = JSON.parse(resultNode.dataset.galleryImages);
    const dimensions = await Promise.all(images.map((item) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = reject;
      image.src = item.savedUrl;
    })));
    return { count: images.length, dimensions };
  });
  assert.equal(outputResult.count, 9);
  assert.equal(new Set(outputResult.dimensions.map((item) => `${item.width}x${item.height}`)).size, 1);
  assert.ok(outputResult.dimensions.every((item) => Math.abs(item.width / item.height - 0.75) < 0.01));
  assert.equal(uploadedPngs.size, 13);

  const persisted = await page.evaluate(() => {
    const board = serializeCanvasBoard();
    const editorItem = board.nodes.find((item) => item.kind === "grid-editor");
    const connection = board.connections.find((item) => item.to === editorItem.id);
    restoreCanvasBoard(board);
    const restoredNode = document.querySelector(`.canvas-node-grid-editor[data-id="${editorItem.id}"]`);
    return {
      before: editorItem.gridEditorState,
      after: JSON.parse(restoredNode.dataset.gridEditorState),
      connection,
      restoredConnection: canvasState.connections.find((item) => item.to === editorItem.id),
      cellCount: restoredNode.querySelectorAll(".canvas-grid-editor-cell").length,
    };
  });
  assert.equal(persisted.cellCount, 9);
  assert.deepEqual(persisted.after, { ...persisted.before, editing: false });
  assert.deepEqual(persisted.restoredConnection, persisted.connection);

  await page.waitForTimeout(650);
  assert.ok(savedBoard?.nodes?.some((item) => item.kind === "grid-editor"));
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(" | ")}`);
  await browser.close();
  console.log(`Canvas grid editor UI checks passed: ${SCREENSHOT_PATH}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
