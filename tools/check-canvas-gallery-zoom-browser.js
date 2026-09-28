"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function checkCanvasGalleryZoom(page, source) {
  const id = await page.evaluate((source) => {
    clearCanvasSelection();
    const gallery = addCanvasGalleryContainer({ x: 1600, y: 100 }, { container: {
      title: "六张图片缩放检查", layoutMode: "manual", manualColumns: 2,
      members: Array.from({ length: 6 }, (_, index) => ({ id: `zoom-${index}`, src: source, name: `缩放检查 ${index + 1}.png`, width: 2400, height: 1600 })),
    } });
    canvasState.scale = 1;
    canvasState.x = 40 - 1600; canvasState.y = 100 - 100;
    applyCanvasTransformNow(); canvasVirtualizer.flushNow(); scheduleCanvasImageQualityUpdate();
    return gallery.dataset.id;
  }, source);
  const measure = () => page.evaluate((id) => {
    const node = getCanvasNode(id), scale = canvasState.scale;
    const rect = node.getBoundingClientRect();
    const members = [...node.querySelectorAll(".canvas-gallery-member")].map((member) => {
      const image = member.querySelector("img"), box = member.getBoundingClientRect();
      return { top: (box.top - rect.top) / scale, height: box.height / scale, width: box.width / scale, source: image.getAttribute("src"), naturalWidth: image.naturalWidth };
    });
    const footer = node.querySelector(".canvas-gallery-container-footer").getBoundingClientRect();
    return { height: rect.height / scale, members, bottomGap: (footer.top - rect.top) / scale - Math.max(...members.map((member) => member.top + member.height)) };
  }, id);
  await page.waitForFunction((id) => [...getCanvasNode(id).querySelectorAll(".canvas-gallery-member img")].every((image) => image.complete && image.naturalWidth > 0), id);
  await page.mouse.move(1350, 850);
  const initial = await measure();
  assert.equal(initial.members.length, 6);
  assert.ok(initial.bottomGap < 24, JSON.stringify(initial));
  const samples = [{ scale: 1, ...initial }];
  for (const [scale, focusRow] of [[4, 0], [4, 2], [1, 0], [3, 1], [1, 0]]) {
    await page.evaluate(({ id, scale, focusRow }) => {
      const node = getCanvasNode(id), viewport = document.querySelector("#infiniteCanvas");
      const row = node.querySelectorAll(".canvas-gallery-member")[focusRow * 2];
      const rowTop = (row.getBoundingClientRect().top - node.getBoundingClientRect().top) / canvasState.scale;
      canvasState.scale = scale;
      canvasState.x = 100 - Number(node.dataset.x) * scale;
      canvasState.y = viewport.clientHeight / 2 - (Number(node.dataset.y) + rowTop + 45) * scale;
      applyCanvasTransformNow(); canvasVirtualizer.flushNow(); scheduleCanvasImageQualityUpdate();
    }, { id, scale, focusRow });
    await page.waitForTimeout(700);
    const state = await measure();
    samples.push({ scale, focusRow, ...state });
    const artifacts = path.join(__dirname, "..", "artifacts", "canvas-gallery-zoom");
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, "layout-samples.json"), JSON.stringify(samples, null, 2));
    await page.screenshot({ path: path.join(artifacts, `zoom-${scale}-row-${focusRow}.png`) });
    for (let index = 0; index < state.members.length; index++) {
      assert.ok(Math.abs(state.members[index].top - initial.members[index].top) < 1, `zoom ${scale}, member ${index}: row moved when images unloaded`);
      assert.ok(Math.abs(state.members[index].height - initial.members[index].height) < 1, `zoom ${scale}, member ${index}: image slot collapsed when unloaded`);
    }
    assert.ok(Math.abs(state.bottomGap - initial.bottomGap) < 1, `zoom ${scale}: blank space increased below the images`);
  }
  const selected = page.locator(`[data-id="${id}"] [data-gallery-member-id="zoom-4"] img`);
  await selected.dblclick();
  await page.waitForFunction((source) => {
    const image = document.querySelector("#lightboxImage");
    return !document.querySelector("#lightbox").hidden && image.getAttribute("src") === source && image.complete && image.naturalWidth === 2400 && image.naturalHeight === 1600;
  }, source);
  console.log("PASS gallery double-click uses the 2400x1600 original, not the 640px thumbnail");
  await page.locator("#lightboxClose").click();
  await page.evaluate((id) => {
    deleteCanvasNodes([getCanvasNode(id)]);
    canvasState.scale = 1; canvasState.x = 80; canvasState.y = 60;
    applyCanvasTransformNow(); canvasVirtualizer.flushNow();
  }, id);
  console.log("PASS six-image gallery keeps row geometry and bottom spacing during zoom and offscreen unloading");
};
