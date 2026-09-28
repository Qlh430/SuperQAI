"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function checkCanvasImageActions(page) {
  const originalSource = await page.locator("#canvasPlane img[data-canvas-original-src]").first().getAttribute("data-original-src");
  const source = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Test image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const upload = await fetch("/api/upload-image", {
      method: "POST",
      headers: {
        "content-type": blob.type || "image/png",
        "x-file-name": encodeURIComponent(`图片操作测试-${Date.now()}.png`),
      },
      body: blob,
    });
    const data = await upload.json().catch(() => ({}));
    if (!upload.ok || !data.url) throw new Error(data.error || `Test image upload failed: ${upload.status}`);
    return data.url;
  }, originalSource);
  const imageNodeId = await page.evaluate((src) => {
    clearCanvasSelection();
    const node = addCanvasImage(src, "图片操作测试.png", { x: 120, y: 120 });
    canvasState.scale = 1;
    canvasState.x = 80;
    canvasState.y = 60;
    applyCanvasTransformNow();
    canvasVirtualizer.flushNow();
    return node.dataset.id;
  }, source);
  const image = page.locator(`[data-id="${imageNodeId}"] img[data-canvas-original-src]`);
  await image.waitFor({ state: "visible", timeout: 5000 });
  const originalReads = () => page.evaluate((url) => performance.getEntriesByName(new URL(url, location.href).href).length, source);
  await page.waitForFunction((nodeId) => {
    const img = getCanvasNode(nodeId)?.querySelector("img[data-canvas-original-src]");
    return img?.complete && img.naturalWidth > 0;
  }, imageNodeId, { timeout: 5000 });
  assert.equal(await originalReads(), 0, "default canvas must show the thumbnail without downloading the original");
  assert.equal(await image.evaluate((img) => Math.max(img.naturalWidth, img.naturalHeight)), 640);
  await image.click();
  const toolbar = page.locator(".canvas-image-toolbar");
  await toolbar.waitFor({ state: "visible", timeout: 3000 });
  await toolbar.getByRole("button", { name: "裁剪图片", exact: true }).click();
  await page.locator("#canvasCropWorkbench").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await page.locator("#canvasCropWorkbench").evaluate((workbench) => workbench.hidden),
    false,
    "the selected image toolbar crop button must open the crop workbench",
  );
  await page.locator("#canvasCropWorkbench [data-crop-cancel]").click();
  await page.locator("#canvasCropWorkbench").waitFor({ state: "hidden" });
  console.log("PASS selected image toolbar crop opens the shared workbench");
  await image.click();
  assert.equal(await originalReads(), 0, "selecting an image must not download the original");
  const frame = await toolbar.boundingBox();
  const picture = await image.boundingBox();
  assert.ok(frame.y + frame.height <= picture.y + 2, "toolbar is above the selected picture");
  const artifactDir = path.join(__dirname, "..", "artifacts", "canvas-image-actions");
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, "selected-image.png") });
  const zoom = (scale) => page.evaluate(({ scale, nodeId }) => {
    const node = getCanvasNode(nodeId);
    const viewport = document.querySelector("#infiniteCanvas");
    canvasState.scale = scale;
    canvasState.x = viewport.clientWidth / 2 - (Number(node.dataset.x) + node.offsetWidth / 2) * scale;
    canvasState.y = viewport.clientHeight / 2 - (Number(node.dataset.y) + node.offsetHeight / 2) * scale;
    applyCanvasTransformNow(); canvasVirtualizer.flushNow(); scheduleCanvasImageQualityUpdate();
  }, { scale, nodeId: imageNodeId });
  const caption = page.locator(".canvas-image-info");
  for (const scale of [.5, .25]) {
    await zoom(scale);
    await image.hover();
    await caption.waitFor({ state: "visible", timeout: 3000 });
    const checkCaptionBounds = async () => {
      const picture = await image.boundingBox();
      const bounds = await caption.boundingBox();
      assert.ok(bounds && bounds.width <= picture.width + 1, `actual app caption fits image at ${scale * 100}%`);
      assert.ok(Math.abs(bounds.x - picture.x) < 1.5, "actual app caption stays left aligned");
      for (const child of await caption.locator(":scope > *").all()) {
        if (!await child.isVisible()) continue;
        const box = await child.boundingBox();
        assert.ok(box.x >= picture.x - 1 && box.x + box.width <= picture.x + picture.width + 1,
          "caption text and editor stay within the image bounds under the app theme");
      }
    };
    await checkCaptionBounds();
    // The toolbar retains its original screen size and layer.
    assert.equal(Math.round((await toolbar.boundingBox()).width), Math.round(frame.width));
    await page.evaluate(() => canvasImageToolbar.hide());
    const nameText = caption.locator("[data-image-info-name]");
    const editor = caption.locator("[data-image-info-name-editor]");
    await nameText.click();
    await editor.waitFor({ state: "visible" });
    await checkCaptionBounds();
    await editor.press("Escape");
    assert.equal(await editor.isVisible(), false);
    await image.hover();
    await caption.waitFor({ state: "visible" });
    if (scale === .5) await page.screenshot({ path: path.join(artifactDir, "caption-small-app.png") });
    await image.click();
  }
  assert.equal(await originalReads(), 0, "small captions and editing must not download the original");
  console.log("PASS actual app captions fit small images in text/edit modes without resizing the toolbar");
  await zoom(2);
  await page.waitForTimeout(600);
  assert.equal(await originalReads(), 0, "200% alone must not upgrade a picture still smaller than 640px");
  assert.equal(await image.getAttribute("data-image-quality"), "thumbnail");
  const zoomedToolbar = await toolbar.boundingBox();
  assert.equal(Math.round(zoomedToolbar.width), Math.round(frame.width), "toolbar must keep its screen size while zooming");
  await zoom(3);
  await page.waitForFunction((nodeId) =>
    getCanvasNode(nodeId)?.querySelector("img[data-canvas-original-src]")?.dataset.imageQuality === "original",
  imageNodeId, { timeout: 5000 });
  assert.ok(await originalReads() > 0, "detail zoom must load the original");
  // Reopening at a saved detail zoom must still paint the preview before the original.
  await image.evaluate((img) => {
    window.__imagePaintWidths = [];
    img.addEventListener("load", () => window.__imagePaintWidths.push(img.naturalWidth));
    cancelCanvasMediaImage(img);
    scheduleCanvasImageQualityUpdate();
  });
  await page.waitForFunction(() => window.__imagePaintWidths?.includes(2400), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__imagePaintWidths[0]), 640, "first paint at high zoom must also be a thumbnail");
  await zoom(1);
  await image.click();
  await toolbar.getByRole("button", { name: "放大查看原图", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#lightbox").hidden && document.querySelector("#lightboxImage").naturalWidth === 2400);
  assert.equal(await page.locator("#lightboxImage").getAttribute("src"), source);
  await page.locator("#lightboxClose").click();
  await image.dblclick();
  await page.locator("#lightbox").waitFor({ state: "visible" });
  assert.equal(await page.locator("#lightboxImage").getAttribute("src"), source);
  await page.locator("#lightboxClose").click();
  await image.click();
  const downloading = page.waitForEvent("download");
  await toolbar.getByRole("button", { name: "下载原图", exact: true }).click();
  const download = await downloading;
  assert.equal(await download.failure(), null);
  const sharp = require("sharp");
  const metadata = await sharp(fs.readFileSync(await download.path())).metadata();
  assert.equal(metadata.width, 2400, "download must contain the original pixels");

  // Exercise the selected member only, including its output connection and undo.
  const fixture = await page.evaluate((source) => {
    clearCanvasSelection();
    const gallery = addCanvasGalleryContainer({ x: 750, y: 100 }, { members: [
      { id: "action-a", src: source, name: "第一张.png", width: 2400, height: 1600 },
      { id: "action-b", src: source, name: "第二张.png", width: 2400, height: 1600 },
    ], columns: 2 });
    const target = addCanvasImagePlaceholder({ x: 1200, y: 100 });
    const connection = normalizeVisibleCanvasConnection({ from: gallery.dataset.id, fromPort: "member-output:action-a", to: target.dataset.id, toPort: "input" });
    canvasState.connections.push(connection);
    canvasState.scale = 1;
    canvasState.x = 260 - 750; canvasState.y = 100 - 100;
    applyCanvasTransformNow(); canvasVirtualizer.flushNow(); scheduleCanvasSave();
    return { galleryId: gallery.dataset.id, targetId: target.dataset.id, connectionId: connection.id };
  }, source);
  const member = page.locator(`[data-gallery-member-id="action-a"] img`);
  await require("./check-canvas-gallery-hover-browser")(page, fixture);
  await member.click({ button: "right" });
  const imageMenu = page.locator("#canvasImageMenu");
  await imageMenu.waitFor({ state: "visible" });
  await imageMenu.getByRole("button", { name: "裁剪图片", exact: true }).click();
  await page.locator("#canvasCropWorkbench").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await page.locator("#canvasCropWorkbench").evaluate((workbench) => workbench.hidden),
    false,
    "right-clicking a gallery member and choosing crop must open the crop workbench",
  );
  await page.locator("#canvasCropWorkbench [data-crop-cancel]").click();
  await page.locator("#canvasCropWorkbench").waitFor({ state: "hidden" });
  console.log("PASS gallery member crop menu opens the top-layer workbench");
  const galleryScroll = () => page.evaluate(() =>
    [...document.querySelectorAll("#infiniteCanvas, #canvasEditorScreen")]
      .map(el => ({ id: el.id, x: el.scrollLeft, y: el.scrollTop })));
  const scrollBeforeEdit = await galleryScroll();
  const hoverMember = async () => {
    const box = await member.boundingBox();
    // Locator.hover scrolls transformed ancestors into view before moving.
    // Real mouse movement must not introduce that test-only canvas scrolling.
    await page.mouse.move(box.x + 45, box.y + 60, { steps: 8 });
    await caption.waitFor({ state: "visible", timeout: 3000 });
  };
  await member.click();
  await hoverMember();
  const galleryName = caption.locator("[data-image-info-name]");
  const galleryEditor = caption.locator("[data-image-info-name-editor]");
  const galleryNameBox = await galleryName.boundingBox();
  await page.mouse.move(galleryNameBox.x + galleryNameBox.width / 2,
    galleryNameBox.y + galleryNameBox.height / 2, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  assert.deepEqual(await galleryScroll(), scrollBeforeEdit,
    "focusing the name editor must not scroll the canvas's outer containers");
  assert.equal(await galleryEditor.isVisible(), true,
    "clicking a selected gallery member's name must open the editor");
  assert.equal(await galleryEditor.evaluate(el => document.activeElement === el), true,
    "the gallery name editor keeps focus after the preview button loses focus");
  await page.screenshot({ path: path.join(artifactDir, "gallery-rename-edit.png") });
  assert.equal(await galleryName.isVisible(), false, "the display name must be hidden while editing, not share the input's space");
  const galleryEditorBox = await galleryEditor.boundingBox();
  await page.mouse.move(galleryEditorBox.x + 12, galleryEditorBox.y + galleryEditorBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(galleryEditorBox.x + 45, galleryEditorBox.y + galleryEditorBox.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.equal(await galleryEditor.isVisible(), true,
    "dragging to select the name must not be mistaken for dragging the canvas");
  assert.doesNotMatch(await page.locator(".canvas-status span:last-child").innerText(), /图集图片数据读取失败/,
    "dragging selected name text must not be submitted as a gallery image drop");
  await galleryEditor.fill("图集改名测试.png");
  await galleryEditor.press("Enter");
  await page.waitForFunction(({ galleryId }) =>
    getCanvasGalleryContainerMembers(getCanvasNode(galleryId))
      .find(item => item.id === "action-a")?.name === "图集改名测试.png", fixture);
  await hoverMember();
  // Focus can stay on the gallery's preview button (including keyboard
  // selection). Clicking its separate caption must transfer into the input.
  const focusedNameBox = await galleryName.boundingBox();
  await page.mouse.move(focusedNameBox.x + focusedNameBox.width / 2,
    focusedNameBox.y + focusedNameBox.height / 2, { steps: 8 });
  await page.locator('[data-gallery-member-id="action-a"] .canvas-gallery-member-preview').focus();
  await page.mouse.down();
  await page.mouse.up();
  assert.equal(await galleryEditor.isVisible(), true,
    "gallery preview focus must transfer to the editor");
  await galleryEditor.fill("不保存.png");
  await galleryEditor.press("Escape");
  assert.equal(await galleryEditor.isVisible(), false, "Escape returns to the default caption");
  assert.equal(await page.evaluate(({ galleryId }) =>
    getCanvasGalleryContainerMembers(getCanvasNode(galleryId))[0].name, fixture), "图集改名测试.png");
  await hoverMember();
  await galleryName.click();
  await galleryEditor.dblclick();
  assert.equal(await page.locator("#canvasNodeMenu").isVisible(), false,
    "double-clicking the name editor must not open the canvas node menu");
  assert.equal(await galleryEditor.isVisible(), true, "double-clicking the editor selects text without closing it");
  await galleryEditor.fill("第二张.png");
  await page.mouse.click(1000, 700);
  assert.equal(await galleryEditor.isVisible(), false, "clicking blank canvas exits editing");
  assert.deepEqual(await page.evaluate(({ galleryId }) =>
    getCanvasGalleryContainerMembers(getCanvasNode(galleryId)).map(item => item.name), fixture),
  ["第二张 2.png", "第二张.png"], "only the edited member changes and duplicate names get a suffix");
  await page.evaluate(() => saveCanvasBoardNow());
  const savedGallery = await page.evaluate(async ({ galleryId }) => {
    const response = await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/node?nodeId=${encodeURIComponent(galleryId)}`);
    return (await response.json()).node;
  }, fixture);
  assert.deepEqual(savedGallery.galleryContainer.members.map(item => item.name),
    ["第二张 2.png", "第二张.png"], "gallery names survive the actual save endpoint");
  await hoverMember();
  assert.equal(await galleryEditor.isVisible(), false, "hovering again shows text, not a sticky editor");
  assert.equal(await galleryName.innerText(), "第二张 2.png");
  await page.screenshot({ path: path.join(artifactDir, "gallery-rename-saved.png") });
  console.log("PASS actual gallery rename: focus transfer, text selection, Enter, Escape, outside click, uniqueness and persistence");
  await member.click();
  await toolbar.getByRole("button", { name: "从画布删除图片", exact: true }).click();
  await page.waitForFunction(({ galleryId, connectionId }) => {
    const gallery = getCanvasNode(galleryId);
    return getCanvasGalleryContainerMembers(gallery).length === 1 && !canvasState.connections.some((c) => c.id === connectionId);
  }, fixture);
  await page.keyboard.press("Control+z");
  await page.waitForFunction(({ galleryId, connectionId }) => getCanvasGalleryContainerMembers(getCanvasNode(galleryId)).length === 2 && canvasState.connections.some((c) => c.id === connectionId), fixture);
  await page.evaluate(({ galleryId, targetId }) => {
    deleteCanvasNodes([getCanvasNode(galleryId), getCanvasNode(targetId)]);
    canvasState.scale = 1; canvasState.x = 80; canvasState.y = 60;
    applyCanvasTransformNow(); canvasVirtualizer.flushNow();
  }, fixture);
  await page.evaluate((nodeId) => deleteCanvasNodes([getCanvasNode(nodeId)]), imageNodeId);
  console.log("PASS 640 first paint, zoom thresholds, toolbar, original preview/download, member delete and undo");
  await require("./check-canvas-gallery-zoom-browser")(page, source);
  await page.evaluate(async () => {
    // Restore the fixture viewport in storage as well as on screen, so the
    // caller's reload sees the original uploaded image again.
    scheduleCanvasViewportSave();
    await saveCanvasBoardNow();
  });
};
