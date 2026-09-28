"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

// Invoked only with the isolated dense-image fixture; never uses a real user's board.
module.exports = async function checkMarquee(page, artifacts) {
  const area = await page.evaluate(() => {
    clearCanvasSelection();
    canvasState.scale = 0.65;
    canvasState.x = 80;
    canvasState.y = 80;
    applyCanvasTransformNow();
    renderCanvasSceneLayer();
    const viewport = document.querySelector("#infiniteCanvas");
    const rect = viewport.getBoundingClientRect();
    const unit = rect.width / viewport.clientWidth;
    const local = { left: 65, top: 65, right: 420, bottom: 270 };
    const hits = canvasSceneLayer.getItemsInRect(local);
    return {
      start: { x: rect.left + local.left * unit, y: rect.top + local.top * unit },
      end: { x: rect.left + local.right * unit, y: rect.top + local.bottom * unit },
      ids: hits.map(hit => hit.id).sort(),
      resident: hits.filter(hit => canvasPagedStore.has(hit.id)).length,
    };
  });
  assert.ok(area.ids.length > 120, "fixture exercises a dense selection larger than the old DOM cap");
  await page.keyboard.down("Control");
  await page.mouse.move(area.start.x, area.start.y);
  await page.mouse.down();
  await page.mouse.move(area.end.x, area.end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  const result = await page.evaluate(() => ({
    ids: [...canvasState.selectedIds].sort(),
    mounted: document.querySelectorAll("#canvasPlane .canvas-node").length,
    selectedDom: getSelectedCanvasNodes().length,
    frame: !document.querySelector("#canvasSelectionBox").hidden,
  }));
  await page.screenshot({ path: path.join(artifacts, "marquee-selection.png") });
  console.log("Marquee diagnostics:", JSON.stringify({
    hit: area.ids.length, resident: area.resident, selected: result.ids.length,
    mounted: result.mounted, selectedDom: result.selectedDom, frame: result.frame,
  }));
  assert.deepEqual(result.ids, area.ids, "Ctrl-drag must select ALL intersecting scene nodes, including unloaded nodes");
  assert.ok(result.frame, "selection frame must remain visible after releasing the pointer");
  assert.ok(result.mounted < 130, "marquee selection must not mount thousands of image elements");
  await page.keyboard.press("Control+c");
  await page.waitForFunction(count => canvasState.clipboard?.nodes?.length === count, area.ids.length, { timeout: 10000 });
  const copied = await page.evaluate(() => canvasState.clipboard.nodes.map(node => node.id).sort());
  assert.deepEqual(copied, area.ids, "copy includes every selected unloaded scene node");
  const drag = await page.evaluate(() => {
    const viewport = document.querySelector("#infiniteCanvas"), rect = viewport.getBoundingClientRect();
    const unit = rect.width / viewport.clientWidth;
    const region = canvasSceneLayer.hitRegions.find(region => {
      const hit = canvasSceneLayer.hitTest(region.left + 5, region.top + 5);
      return canvasState.selectedIds.has(hit?.id) && region.left > 90 && region.top > 90;
    });
    const hit = region && canvasSceneLayer.hitTest(region.left + 5, region.top + 5);
    return { x: rect.left + (region?.left + 5) * unit, y: rect.top + (region?.top + 5) * unit, hit: hit?.id,
      selected: canvasState.selectedIds.has(hit?.id), dx: 30 * unit, dy: 20 * unit };
  });
  assert.ok(drag.selected, "drag starts inside an already-selected scene image");
  await page.mouse.move(drag.x, drag.y); await page.mouse.down();
  await page.mouse.move(drag.x + drag.dx, drag.y + drag.dy, { steps: 5 }); await page.mouse.up();
  await page.waitForFunction(count => canvasState.undoStack.at(-1)?.forward?.filter(op => op.type === "node.upsert").length === count, area.ids.length, { timeout: 15000 });
  const moved = await page.evaluate(() => ({
    selected: canvasState.selectedIds.size,
    mounted: canvasVirtualStore.mountedSize,
    correct: canvasState.clipboard.nodes.every(before => {
      const after = canvasVirtualStore.get(before.id);
      return after && Math.abs(after.x - before.x - 30 / 0.65) < 0.01
        && Math.abs(after.y - before.y - 20 / 0.65) < 0.01;
    }),
  }));
  assert.equal(moved.selected, area.ids.length, "drag preserves the full marquee selection");
  assert.ok(moved.correct, "drag moves every selected model by the same logical delta");
  assert.ok(moved.mounted < 130, "group drag keeps dense images virtual");
  await page.keyboard.press("Control+z");
  await page.evaluate(async () => { await saveCanvasBoardNow(); });
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => canvasState.selectedIds.size === 0);
  await page.evaluate(async () => { await saveCanvasBoardNow(); });
  const deleted = await page.evaluate(async () => (await (await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/meta`)).json()).nodeCount);
  assert.equal(deleted, 2176 - area.ids.length, "Delete removes every selected model and no outside model");
  await page.keyboard.press("Control+z");
  await page.evaluate(async () => { await saveCanvasBoardNow(); });
  const restored = await page.evaluate(async () => (await (await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/meta`)).json()).nodeCount);
  assert.equal(restored, 2176, "undo restores all deleted scene nodes");
  await page.keyboard.press("Control+v");
  await page.waitForFunction(count => canvasState.selectedIds.size === count, area.ids.length);
  assert.ok(await page.evaluate(() => document.querySelectorAll("#canvasPlane .canvas-node").length < 130),
    "bulk paste must keep the new selection virtual");
  await page.evaluate(async () => { await saveCanvasBoardNow(); });
  const pasted = await page.evaluate(async () => (await (await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/meta`)).json()).nodeCount);
  assert.equal(pasted, 2176 + area.ids.length, "bulk paste persists every copied node");
  await page.keyboard.press("Control+g");
  await page.waitForFunction(count => [...canvasVirtualStore.values()].some(model => model.kind === "group" && model.groupMembers?.length === count), area.ids.length);
  const group = await page.evaluate(() => {
    const model = [...canvasVirtualStore.values()].find(model => model.kind === "group");
    const mounted = canvasVirtualStore.getMounted(model.id);
    return { id: model.id, count: mounted ? getCanvasGroupImages(mounted).length : model.groupImages.length };
  });
  assert.equal(group.count, area.ids.length, "group includes every selected image, including unloaded members");
  // Remove only the temporary group through the normal deletion helper.
  await page.evaluate(id => deleteCanvasModels([canvasVirtualStore.get(id)], [canvasVirtualStore.getMounted(id)].filter(Boolean)), group.id);
  // Selected pasted images remain selected when only their group is deleted.
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => canvasState.selectedIds.size === 0);
  await page.evaluate(async () => { await saveCanvasBoardNow(); });
  const cleaned = await page.evaluate(async () => (await (await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/meta`)).json()).nodeCount);
  assert.equal(cleaned, 2176, "deleting pasted selection leaves the original board intact");
  for (const [uiScale, canvasScale] of [[1, 1.83], [1.5, 0.72]]) {
    const scaled = await page.evaluate(async ([uiScale, canvasScale]) => {
      clearCanvasSelection();
      AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: uiScale } });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      canvasState.scale = canvasScale; canvasState.x = 70; canvasState.y = 70;
      applyCanvasTransformNow(); renderCanvasSceneLayer();
      const viewport = document.querySelector("#infiniteCanvas"), rect = viewport.getBoundingClientRect();
      const unit = rect.width / viewport.clientWidth;
      const box = { left: 35, top: 140, right: 460, bottom: 310 };
      const ids = new Set(canvasSceneLayer.getItemsInRect(box).map(hit => hit.id));
      const physical = { left: rect.left + box.left * unit, top: rect.top + box.top * unit,
        right: rect.left + box.right * unit, bottom: rect.top + box.bottom * unit };
      // DOM nodes can coexist with the scene after operations.
      document.querySelectorAll("#canvasPlane .canvas-node").forEach(node => {
        const r = node.getBoundingClientRect();
        if (r.left < physical.right && r.right > physical.left && r.top < physical.bottom && r.bottom > physical.top) ids.add(node.dataset.id);
      });
      return { ...physical, ids: [...ids].sort(),
        startOnCanvas: Boolean(document.elementFromPoint(physical.left, physical.top)?.closest("#infiniteCanvas")) };
    }, [uiScale, canvasScale]);
    assert.ok(scaled.ids.length, "scaled fixture contains selectable images");
    assert.ok(scaled.startOnCanvas, "marquee starts on canvas below the floating toolbar");
    await page.keyboard.down("Control");
    await page.mouse.move(scaled.left, scaled.top); await page.mouse.down();
    await page.mouse.move(scaled.right, scaled.bottom, { steps: 6 }); await page.mouse.up();
    await page.keyboard.up("Control");
    const actual = await page.evaluate(() => [...canvasState.selectedIds].sort());
    assert.deepEqual(actual, scaled.ids, `marquee coordinates at UI ${uiScale} / canvas ${canvasScale}`);
    await page.evaluate(() => { clearCanvasSelection(); canvasVirtualizer.flushNow(); });
    assert.equal(await page.evaluate(() => canvasVirtualizer.pinnedIds.size), 0, "clearing selection releases its pins");
  }
  await page.evaluate(() => {
    clearCanvasSelection();
    AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: 1 } });
    canvasState.scale = 1;
    canvasState.x = 60;
    canvasState.y = 60;
    applyCanvasTransformNow();
  });
  console.log("PASS Ctrl-drag at 183% zoom / 150% UI, copy, group move, delete, undo, bulk paste and grouping for 1290 scene nodes with bounded DOM");
};
