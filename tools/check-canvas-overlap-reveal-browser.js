"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

// Runs with an isolated LAN test server, using its synthetic image only.
module.exports = async function checkOverlapReveal(page, source, artifacts) {
  const previous = await page.evaluate(async source => {
    await saveCanvasBoardNow();
    const previous = { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
    const post = async (url, body) => {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result;
    };
    const id = "overlap-reveal-regression";
    await post("/api/canvas/boards", { id, title: "Overlap reveal", viewport: { x: 100, y: 120, scale: 1.83 } });
    for (let batch = 0; batch < 3; batch++) {
      const count = batch === 2 ? 1 : 400;
      await post(`/api/canvas/boards/${id}/operations`, { baseRevision: batch,
        operations: Array.from({ length: count }, (_, i) => {
          const nodeId = `stack-${batch * 400 + i}`;
          return { operationId: `add-${nodeId}`, entityId: nodeId, type: "node.upsert",
            after: { id: nodeId, kind: "image", x: 0, y: 0, width: 100, height: 181,
              imageSrc: source, imageName: "portrait.png" } };
        }),
      });
    }
    await openCanvasBoardFromHistory({ id, title: "Overlap reveal" });
    return previous;
  }, source);
  await page.waitForFunction(source => canvasSceneTextureCache.get(source)?.state === "ready", source);
  await page.evaluate(() => { canvasState.x = 100; canvasState.y = 120; canvasState.scale = 1.83; applyCanvasTransformNow(); renderCanvasSceneLayer(); });
  const start = await page.evaluate(() => {
    const r = document.querySelector("#infiniteCanvas").getBoundingClientRect();
    const unit = r.width / document.querySelector("#infiniteCanvas").clientWidth;
    const region = canvasSceneLayer.hitRegions.at(-1);
    return { x: r.left + (region.left + 30) * unit, y: r.top + (region.top + 30) * unit,
      sampleX: region.left + 25, sampleY: region.top + 100, topId: region.id };
  });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const pendingRoutes = new Set();
  const route = async route => {
    const pending = blocked.then(() => route.continue());
    pendingRoutes.add(pending);
    try { await pending; } finally { pendingRoutes.delete(pending); }
  };
  await page.route("**/api/canvas/boards/overlap-reveal-regression/operations", route);
  try {
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.waitForFunction(id => canvasVirtualStore.getMounted(id)?.querySelector("img")?.naturalWidth > 0, start.topId, { timeout: 5000 }).catch(async error => {
      console.log("Overlap pointer diagnostics", await page.evaluate(start => ({
        start, target: document.elementFromPoint(start.x, start.y)?.outerHTML.slice(0, 250),
        selected: [...canvasState.selectedIds], mounted: canvasVirtualStore.mountedSize,
        status: document.querySelector("#canvasStatus")?.textContent,
      }), start));
      throw error;
    });
    await page.mouse.move(start.x + 320, start.y + 10, { steps: 5 });
    // Inspect during the drag, before pointerup and before any server acknowledgement.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const reveal = await page.evaluate(({ sampleX, sampleY }) => {
      const ctx = canvasSceneLayer.context, dpr = canvasSceneLayer.devicePixelRatio;
      const pixel = [...ctx.getImageData(Math.round((sampleX + canvasSceneLayer.padding) * dpr), Math.round((sampleY + canvasSceneLayer.padding) * dpr), 1, 1).data];
      const hit = canvasSceneLayer.hitTest(sampleX, sampleY);
      return { pixel, id: hit?.id, mounted: canvasVirtualStore.mountedSize, cache: canvasSceneTextureCache.size };
    }, start);
    await page.screenshot({ path: path.join(artifacts, "overlap-during-drag.png") });
    console.log("Overlap reveal diagnostics:", JSON.stringify(reveal));
    assert.ok(reveal.pixel[3] > 240 && reveal.pixel[0] > 120, "underlying image must remain painted during drag, without waiting for save/viewport response");
    assert.ok(reveal.id && reveal.id !== start.topId, "underlying node is immediately hittable");
    assert.equal(reveal.cache, 1, "overlap reveal shares one decoded image");
    assert.ok(reveal.mounted < 5, "overlap reveal does not mount the stack");
    await page.mouse.up();
    for (let step = 1; step < 12; step++) {
      const topId = await page.evaluate(start => canvasSceneLayer.hitTest(start.sampleX, start.sampleY)?.id, start);
      assert.ok(topId, `layer ${step} remains available without server refresh`);
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.waitForFunction(id => canvasVirtualStore.getMounted(id)?.querySelector("img")?.naturalWidth > 0, topId);
      await page.mouse.move(start.x + 320, start.y + 10, { steps: 3 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const under = await page.evaluate(start => ({
        id: canvasSceneLayer.hitTest(start.sampleX, start.sampleY)?.id,
        alpha: canvasSceneLayer.context.getImageData(Math.round((start.sampleX + canvasSceneLayer.padding) * canvasSceneLayer.devicePixelRatio),
          Math.round((start.sampleY + canvasSceneLayer.padding) * canvasSceneLayer.devicePixelRatio), 1, 1).data[3],
        mounted: canvasVirtualStore.mountedSize,
      }), start);
      assert.ok(under.id && under.id !== topId && under.alpha === 255, `layer ${step + 1} paints immediately`);
      assert.ok(under.mounted < 5, "sequential drags release previous DOM nodes");
      await page.mouse.up();
    }
  } finally {
    await page.mouse.up();
    release();
    await Promise.all([...pendingRoutes]);
    await page.unroute("**/api/canvas/boards/overlap-reveal-regression/operations", route);
    await page.evaluate(async previous => { await saveCanvasBoardNow(); await openCanvasBoardFromHistory(previous); }, previous);
  }
  console.log("PASS 12 consecutive overlapping image drags reveal the next layer with save responses blocked");
};
