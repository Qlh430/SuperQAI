"use strict";
const assert = require("node:assert/strict");
module.exports = async ({ page, board, origin }) => {
  const meta = async () => (await fetch(`${origin}/api/canvas/boards/${board.external_id}/meta`)).json();
  const initialCount = (await meta()).nodeCount;
  assert.equal(initialCount, 2176, "exercise the user's actual duplicate board");
  const hit = await page.evaluate(() => {
    const regions = canvasSceneLayer.hitRegions;
    for (const region of [...regions].reverse()) {
      const x = Math.max(40, region.left + 80), y = Math.max(140, region.top + 80);
      if (x < 1800 && y < 900 && canvasSceneLayer.hitTest(x, y)?.id === region.id) return { x, y, id: region.id };
    }
  });
  assert.ok(hit, "the real duplicate board must have a clickable visible picture");
  await page.mouse.click(hit.x, hit.y);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(id => getSelectedCanvasNodes().some(n => n.dataset.id === id), hit.id), true,
    "clicking a dense-board picture must activate the actual node, not only record its ID");
  assert.equal(await page.locator('.canvas-image-toolbar').isVisible(), true, "image actions must be available in a dense board");
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").filter(r => /\/output\/(?!thumbnails\/)/.test(new URL(r.name).pathname)).length), 0,
    "selecting a picture must still use the shared 640px thumbnail");
  const original = await page.evaluate(id => ({ ...getCanvasNodeModel(id) }), hit.id);
  const point = await page.locator(`[data-id="${hit.id}"] img`).boundingBox();
  await page.mouse.dblclick(point.x + 70, point.y + 70);
  await page.waitForFunction(() => !document.querySelector("#lightbox").hidden && document.querySelector("#lightboxImage").naturalWidth > 640);
  assert.equal(await page.locator("#lightboxImage").getAttribute("src"), original.imageSrc, "double click loads the original URL");
  await page.locator("#lightboxClose").click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.evaluate(() => saveCanvasBoardNow());
  await page.waitForTimeout(800);
  const copyId = await page.evaluate(() => canvasState.activeNode?.dataset.id);
  assert.ok(copyId && copyId !== hit.id && !/^\d+$/.test(copyId), "copied node IDs must not collide with unloaded legacy nodes");
  assert.equal((await meta()).nodeCount, initialCount + 1, "copy adds one node without overwriting hidden copies");
  const copy = page.locator(`[data-id="${copyId}"] img`);
  const dragPoint = await copy.boundingBox();
  const before = await page.evaluate(id => ({ x: Number(getCanvasNode(id).dataset.x), y: Number(getCanvasNode(id).dataset.y), scale: canvasState.scale }), copyId);
  await page.mouse.move(dragPoint.x + 70, dragPoint.y + 70);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 150, dragPoint.y + 110, { steps: 6 });
  await page.mouse.up();
  await page.evaluate(() => saveCanvasBoardNow());
  const stored = await (await fetch(`${origin}/api/canvas/boards/${board.external_id}/node?nodeId=${copyId}`)).json();
  assert.ok(Math.abs(stored.node.x - before.x - 80 / before.scale) < 1, "drag persists the selected node's position");
  await page.keyboard.press("Delete");
  await page.evaluate(() => saveCanvasBoardNow());
  assert.equal((await meta()).nodeCount, initialCount, "delete removes only the chosen copy");
  await page.keyboard.press("Control+z");
  await page.evaluate(() => saveCanvasBoardNow());
  assert.equal((await meta()).nodeCount, initialCount + 1, "undo restores the deleted copy");
  await page.evaluate(() => clearCanvasSelection());
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => canvasVirtualStore.mountedSize), 0, "deselected dense nodes return to shared scene rendering");
  await page.evaluate(async id => { const data = await (await fetch(`/api/canvas/boards/${id}/meta`)).json(); await openCanvasBoardFromHistory(data); }, board.external_id);
  await page.waitForTimeout(800);
  assert.ok(await page.evaluate(() => canvasSceneLayer.getDiagnostics().spriteCount > 0), "reopening must show the scene");
  assert.ok(await page.evaluate(() => canvasSceneLayer.hitRegions.length > 0), "reopening preserves interaction targets");
  await page.route("**/api/canvas/boards/*/node?*", async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  const freshHit = await page.evaluate(() => {
    for (const r of [...canvasSceneLayer.hitRegions].reverse()) {
      const x = Math.max(40, r.left + 80), y = Math.max(140, r.top + 80);
      if (x < 1750 && y < 850 && canvasSceneLayer.hitTest(x, y)?.id === r.id) return { x, y, id: r.id };
    }
  });
  assert.ok(freshHit);
  await page.mouse.dblclick(freshHit.x, freshHit.y, { delay: 40 });
  await page.waitForFunction(() => !document.querySelector("#lightbox").hidden && document.querySelector("#lightboxImage").naturalWidth > 640);
  await page.locator("#lightboxClose").click();
  await page.evaluate(() => clearCanvasSelection());
  await page.waitForTimeout(500);
  const coldBefore = (await (await fetch(`${origin}/api/canvas/boards/${board.external_id}/node?nodeId=${freshHit.id}`)).json()).node;
  const scale = await page.evaluate(() => canvasState.scale);
  await page.mouse.move(freshHit.x, freshHit.y);
  await page.mouse.down();
  await page.mouse.move(freshHit.x + 60, freshHit.y + 30, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await page.evaluate(() => saveCanvasBoardNow());
  const coldAfter = (await (await fetch(`${origin}/api/canvas/boards/${board.external_id}/node?nodeId=${freshHit.id}`)).json()).node;
  assert.ok(Math.abs(coldAfter.x - coldBefore.x - 60 / scale) < 1, "a quick first drag must survive a delayed node response and pointer-up before loading finishes");
  assert.ok(await page.evaluate(() => canvasVirtualStore.mountedSize <= 1), "dense interactions must not recreate thousands of DOM nodes");
  await page.unroute("**/api/canvas/boards/*/node?*");
  console.log("Duplicate board interaction checks passed.");
};
