"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Used only by the raster harness with its temporary account/database.
module.exports = async function checkNodeFront(page) {
  const artifacts = path.join(__dirname, "..", "artifacts", "canvas-node-front");
  fs.mkdirSync(artifacts, { recursive: true });
  await page.evaluate(() => createNewCanvasBoard("Click brings node to front"));
  const fixture = await page.evaluate(async () => {
    const bitmap = document.createElement("canvas"); bitmap.width = 320; bitmap.height = 230;
    bitmap.getContext("2d").fillRect(0, 0, 320, 230);
    const blob = await new Promise(resolve => bitmap.toBlob(resolve));
    const source = await uploadCanvasImageFile(new File([blob], "front.png", { type: "image/png" }));
    canvasState.x = 0; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow();
    return { source, id: canvasState.activeBoardId };
  });
  const failures = [];
  for (const kind of ["image", "text", "llm", "group", "gallery-container", "grid-editor", "comfy", "loop", "video", "audio", "minimax-h3", "video-api", "video-output"]) {
    const result = await page.evaluate(async ({ kind, source }) => {
      clearCanvasSelection();
      canvasVirtualizer.reset(); canvasVirtualStore.clear();
      const context = { maxId: 0, legacyResults: [], migratedLegacyCount: 0 };
      const model = { id: `front-${kind}`, kind, x: 100, y: 150, width: 320, height: 230,
        zOrder: 100,
        imageSrc: source, imageName: "front.png", text: "Clickable text", groupTitle: "Group",
        galleryContainer: { members: [] } };
      const back = restoreCanvasBoardNode(model, canvasVirtualBoard || {}, context);
      const cover = restoreCanvasBoardNode({ id: `cover-${kind}`, kind: "text", x: 180, y: 150,
        width: 320, height: 230, text: "Cover", zOrder: 100 }, canvasVirtualBoard || {}, context);
      for (const node of [back, cover]) {
        node.style.width = "320px"; node.style.height = "230px"; node.style.minHeight = "230px";
      }
      await new Promise(requestAnimationFrame);
      const rect = back.getBoundingClientRect(), other = cover.getBoundingClientRect();
      const x = Math.max(rect.left, other.left) + 30, y = Math.max(rect.top, other.top) + (kind === "group" ? 15 : 90);
      const hit = () => document.elementFromPoint(x, y)?.closest(".canvas-node")?.dataset.id;
      const before = hit();
      // Controls often stop pointer propagation; capture must still raise their node.
      const target = back.querySelector("textarea,input,.canvas-text,.canvas-node-bar") || back;
      target.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 31, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 31, bubbles: true }));
      const after = hit();
      // Already-selected nodes must be raised again, including multi-selection.
      addCanvasNodeToSelection(back); addCanvasNodeToSelection(cover);
      cover.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 32, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 32 }));
      back.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 33, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 33 }));
      return { before, after, selectedAgain: hit(), zOrder: serializeCanvasNode(back).zOrder,
        sourceZ: serializeCanvasNode(cover).zOrder };
    }, { kind, source: fixture.source });
    if (result.after !== `front-${kind}` || result.selectedAgain !== `front-${kind}` || !(result.zOrder > result.sourceZ)) {
      failures.push({ kind, ...result });
    }
  }
  assert.deepEqual(failures, [], "every node/control click must raise it, including nodes already selected");
  const saved = await page.evaluate(async () => {
    await saveCanvasBoardNow();
    const board = { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
    const id = "front-video-output", zOrder = canvasVirtualStore.get(id).zOrder;
    await openCanvasBoardFromHistory(board);
    const node = ensureCanvasNodeMounted(id);
    return { zOrder, restored: serializeCanvasNode(node).zOrder };
  });
  assert.equal(saved.restored, saved.zOrder, "front order must survive saving and reopening");
  console.log("PASS click brings all 13 node types to front, child controls, reselected nodes, persisted stacking");

  const grouped = await page.evaluate(async source => {
    await createNewCanvasBoard("Group front preserves members");
    canvasState.x = 0; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow();
    const a = addCanvasImage(source, "a.png", { x: 100, y: 160 });
    const b = addCanvasImage(source, "b.png", { x: 420, y: 160 });
    await Promise.all([a, b].map(node => new Promise(resolve => {
      const img = node.querySelector("img"); if (img.complete && img.naturalWidth) resolve(); else img.addEventListener("load", resolve, { once: true });
    })));
    clearCanvasSelection(); addCanvasNodeToSelection(a); addCanvasNodeToSelection(b);
    createCanvasGroupFromSelection();
    await new Promise(requestAnimationFrame);
    const group = document.querySelector(".canvas-node-group");
    selectCanvasNode(group);
    const images = [a, b].map(node => {
      const r = node.querySelector("img").getBoundingClientRect();
      return { expected: node.dataset.id, actual: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(".canvas-node")?.dataset.id };
    });
    return { images, group: group?.dataset.id, background: group && getComputedStyle(group).backgroundColor };
  }, fixture.source);
  assert.ok(grouped.images.every(item => item.actual === item.expected), `bringing a group forward must keep its member images visible and clickable: ${JSON.stringify(grouped)}`);
  assert.equal(grouped.background, "rgba(0, 0, 0, 0)", "group frame must not obscure the independent image layer");
  await page.screenshot({ path: path.join(artifacts, "group-front.png") });

  // Exercise real pointer hit testing through the scene-to-DOM boundary.
  const dense = await page.evaluate(async source => {
    await saveCanvasBoardNow();
    const post = async (url, body) => {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
    };
    const id = "click-front-dense";
    await post("/api/canvas/boards", { id, title: "Dense click front", viewport: { x: 0, y: 0, scale: 1 } });
    const models = Array.from({ length: 801 }, (_, index) => ({ id: `front-dense-${index}`, kind: "image",
      x: index === 0 ? 100 : 180, y: 150, width: 320, height: 230, imageSrc: source, imageName: "front.png" }));
    for (let offset = 0; offset < models.length; offset += 400) {
      await post(`/api/canvas/boards/${id}/operations`, { baseRevision: offset / 400,
        operations: models.slice(offset, offset + 400).map(after => ({ type: "node.upsert", operationId: after.id, entityId: after.id, after })) });
    }
    await openCanvasBoardFromHistory({ id, title: "Dense click front" });
    canvasState.x = 0; canvasState.y = 0; canvasState.scale = 1;
    applyCanvasTransformNow(); renderCanvasSceneLayer();
    return { id, title: "Dense click front" };
  }, fixture.source);
  await page.waitForFunction(() => !canvasState.boardOpening && canvasPagedStore.scenePage?.mode === "scene" && canvasSceneLayer.hitTest(130, 200)?.id === "front-dense-0");
  const coords = await page.evaluate(() => {
    const viewport = document.querySelector("#infiniteCanvas"), r = viewport.getBoundingClientRect(), unit = r.width / viewport.clientWidth;
    return { a: { x: r.left + 130 * unit, y: r.top + 230 * unit }, b: { x: r.left + 470 * unit, y: r.top + 230 * unit },
      overlap: { x: r.left + 260 * unit, y: r.top + 230 * unit } };
  });
  for (const [point, id] of [[coords.a, "front-dense-0"], [coords.b, "front-dense-800"], [coords.a, "front-dense-0"]]) {
    await page.evaluate(() => {
      window.__frontPointerTrace = null;
      document.addEventListener("pointerdown", event => {
        const r = document.querySelector("#infiniteCanvas").getBoundingClientRect();
        window.__frontPointerTrace = { x: event.clientX, y: event.clientY,
          target: event.target.outerHTML.slice(0, 140), opening: canvasState.boardOpening,
          hit: canvasSceneLayer.hitTest(toSystemDelta(event.clientX - r.left), toSystemDelta(event.clientY - r.top))?.id };
      }, { once: true, capture: true });
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(({ id, point }) => document.elementFromPoint(point.x, point.y)?.closest(".canvas-node")?.dataset.id === id,
      { id, point: coords.overlap }, { timeout: 5000 }).catch(async error => {
        console.log("Real front click", await page.evaluate(({ id, point }) => ({ id,
          actual: document.elementFromPoint(point.x, point.y)?.outerHTML.slice(0, 180),
          nodes: canvasVirtualStore.mountedElements().map(node => ({ id: node.dataset.id, z: node.style.zIndex, order: node.dataset.zOrder })),
          selected: [...canvasState.selectedIds], status: document.querySelector(".canvas-status")?.textContent,
          x: canvasState.x, y: canvasState.y, preview: !lightbox.hidden,
          pointer: window.__frontPointerTrace,
        }), { id, point: coords.overlap })); throw error;
      });
  }
  await page.screenshot({ path: path.join(artifacts, "clicked-image-front.png") });
  await page.evaluate(async () => { clearCanvasSelection(); await saveCanvasBoardNow(); canvasVirtualizer.flushNow(); renderCanvasSceneLayer(); });
  await page.waitForFunction(() => canvasSceneLayer.hitTest(260, 230)?.id === "front-dense-0");
  await page.evaluate(async board => {
    await openCanvasBoardFromHistory(board);
    canvasState.x = 0; canvasState.y = 0; applyCanvasTransformNow(); renderCanvasSceneLayer();
  }, dense);
  await page.waitForFunction(() => canvasSceneLayer.hitTest(260, 230)?.id === "front-dense-0");
  assert.ok(await page.evaluate(() => canvasVirtualStore.mountedSize < 5), "front order must not mount the dense board");
  console.log("PASS real clicks alternate front image in 801-node scene, survive deselection/save/reopen with bounded DOM");
  await page.waitForFunction(() => !canvasState.boardOpening);
  await page.evaluate(() => {
    const ids = ["front-dense-0", "front-dense-800"];
    for (const id of ids) {
      const region = canvasSceneLayer.hitRegions.find(region => region.id === id);
      canvasState.selectedIds.add(id);
      canvasState.selectedSceneItems.set(id, { ...region.item });
    }
    dispatchCanvasSelectionChange();
  });
  await page.mouse.click(coords.b.x, coords.b.y);
  await page.waitForFunction(point => document.elementFromPoint(point.x, point.y)?.closest(".canvas-node")?.dataset.id === "front-dense-800", coords.overlap, { timeout: 5000 });
  assert.equal(await page.evaluate(() => canvasState.selectedIds.size), 2, "raising one scene node must retain multi-selection");
  console.log("PASS clicking an already-selected scene node raises it while retaining multi-selection");
  await page.evaluate(() => { clearCanvasSelection(); canvasVirtualizer.flushNow(); renderCanvasSceneLayer(); });
  assert.equal(await page.evaluate(() => canvasSceneLayer.hitTest(260, 230)?.id), "front-dense-800", "selected scene promotion must remain after demotion to scene");
  await page.keyboard.down("Control");
  await page.mouse.click(coords.a.x, coords.a.y);
  await page.keyboard.up("Control");
  await page.waitForFunction(point => document.elementFromPoint(point.x, point.y)?.closest(".canvas-node")?.dataset.id === "front-dense-0", coords.overlap);
  await page.evaluate(() => { clearCanvasSelection(); canvasVirtualizer.flushNow(); renderCanvasSceneLayer(); });
  assert.equal(await page.evaluate(() => canvasSceneLayer.hitTest(260, 230)?.id), "front-dense-0", "Ctrl-click scene promotion must remain after demotion to scene");
  await page.mouse.click(coords.a.x, coords.a.y);
  await page.waitForFunction(() => canvasVirtualStore.getMounted("front-dense-0"));
  await page.evaluate(() => {
    const id = "front-dense-800", region = canvasSceneLayer.hitRegions.find(region => region.id === id);
    canvasState.selectedIds.add(id); canvasState.selectedSceneItems.set(id, { ...region.item });
    dispatchCanvasSelectionChange();
  });
  await page.mouse.click(coords.b.x, coords.b.y);
  await page.waitForFunction(point => document.elementFromPoint(point.x, point.y)?.closest(".canvas-node")?.dataset.id === "front-dense-800", coords.overlap, { timeout: 5000 });
  assert.equal(await page.evaluate(() => canvasState.selectedIds.size), 2);
  console.log("PASS selected scene image rises above an already mounted selected image without clearing multi-selection");
};
