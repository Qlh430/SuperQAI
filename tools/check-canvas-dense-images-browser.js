"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

// Runs only in check-lan-canvas-access's isolated server and temporary database.
module.exports = async function checkDenseImages(page) {
  const fixture = await page.evaluate(async () => {
    await saveCanvasBoardNow();
    const previous = { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
    const bitmap = document.createElement("canvas"); bitmap.width = 900; bitmap.height = 1630;
    const ctx = bitmap.getContext("2d"); ctx.fillStyle = "#b22325"; ctx.fillRect(0, 0, 900, 1630);
    ctx.fillStyle = "#fff"; ctx.font = "80px sans-serif"; ctx.fillText("PORTRAIT", 90, 200);
    const blob = await new Promise(resolve => bitmap.toBlob(resolve));
    const uploaded = await (await fetch("/api/upload-image", { method: "POST", headers: { "content-type": "image/png", "x-file-name": "dense-portrait.png" }, body: blob })).json();
    if (!uploaded.url) throw new Error(JSON.stringify(uploaded));
    const post = async (url, body) => {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
    };
    const id = "dense-image-regression";
    await post("/api/canvas/boards", { id, title: "密集重复竖图验证", viewport: { x: 60, y: 60, scale: 1 } });
    const nodes = Array.from({ length: 2176 }, (_, i) => ({ id: `copy-${i}`, kind: "image", x: (i % 64) * 10, y: Math.floor(i / 64) * 10, width: 0, height: 0, imageSrc: uploaded.url, imageName: "portrait.png" }));
    let revision = 0;
    for (let offset = 0; offset < nodes.length; offset += 400) {
      await post(`/api/canvas/boards/${id}/operations`, { baseRevision: revision++, operations: nodes.slice(offset, offset + 400).map(n => ({ operationId: `add-${n.id}`, entityId: n.id, type: "node.upsert", after: n })) });
    }
    await post(`/api/canvas/boards/${id}/operations`, { baseRevision: revision, operations: [{ operationId: "wire", entityId: "wire", type: "connection.upsert", after: { id: "wire", from: "copy-2175", to: "copy-2174", fromPort: "output", toPort: "input" } }] });
    await openCanvasBoardFromHistory({ id, title: "密集重复竖图验证" });
    return { previous, id, source: uploaded.url };
  });
  await page.waitForFunction(source => canvasSceneTextureCache.get(source)?.state === "ready" && canvasPagedStore.scenePage?.visualNodeCount === 2176, fixture.source);
  const dense = await page.evaluate(() => {
    let images = 0;
    const ctx = canvasSceneLayer.bufferContext, draw = ctx.drawImage;
    ctx.drawImage = function (...args) { images++; return draw.apply(this, args); };
    const start = performance.now(); renderCanvasSceneLayer(); const elapsed = performance.now() - start;
    ctx.drawImage = draw;
    const page = canvasPagedStore.scenePage;
    const top = page.visualNodes.find(n => n[0] === "copy-2175");
    const rect = getCanvasImageContentRect({ kind: "image", x: top[2], y: top[3], width: top[4], height: top[5], previewSource: top[7] });
    const wire = getCanvasSceneConnectionSegments(page);
    return { count: page.visualNodeCount, images, elapsed, rect, wire, cache: canvasSceneTextureCache.size, mounted: document.querySelectorAll("#canvasPlane .canvas-node").length };
  });
  assert.equal(dense.images, 2176, "all visible copies must draw the shared cached preview");
  assert.equal(dense.cache, 1, "copies must share one decoded source");
  assert.ok(dense.mounted < 10, "dense scene must not mount thousands of DOM nodes");
  assert.ok(Math.abs(dense.wire[0] - dense.rect.right) < 0.01, "dense wire attaches to the actual image edge");
  const artifacts = path.join(__dirname, "..", "artifacts", "canvas-dense-images"); fs.mkdirSync(artifacts, { recursive: true });
  if (process.argv.includes("--paste-offsets")) {
    // Other focused checks reuse the same isolated board below.
    await require("./check-canvas-paste-offset-browser")(page, fixture.source, artifacts);
    await page.evaluate(async previous => { await openCanvasBoardFromHistory(previous); }, fixture.previous);
    return;
  }
  if (process.argv.includes("--overlap-only")) {
    await require("./check-canvas-overlap-reveal-browser")(page, fixture.source, artifacts);
    await page.evaluate(async previous => { await openCanvasBoardFromHistory(previous); }, fixture.previous);
    return;
  }
  await page.screenshot({ path: path.join(artifacts, "2176-visible.png") });
  if (process.argv.includes("--pan-edges")) {
    await require("./check-canvas-pan-edges-browser")(page, artifacts);
    await page.evaluate(async previous => { await openCanvasBoardFromHistory(previous); }, fixture.previous);
    return;
  }
  await require("./check-canvas-marquee-browser")(page, artifacts);
  const click = await page.evaluate(rect => {
    const viewport = document.querySelector("#infiniteCanvas"); const v = viewport.getBoundingClientRect();
    const unit = v.width / viewport.clientWidth;
    return { x: v.left + (canvasState.x + (rect.left + rect.right) / 2 * canvasState.scale) * unit, y: v.top + (canvasState.y + (rect.top + rect.bottom) / 2 * canvasState.scale) * unit };
  }, dense.rect);
  await page.mouse.click(click.x, click.y);
  const node = page.locator('#canvasPlane .canvas-node[data-id="copy-2175"]');
  await node.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-id="copy-2175"] img')?.naturalWidth > 0);
  const checkEdges = async () => {
    const image = await node.locator('.canvas-image-upload img').first().boundingBox();
    const port = await node.locator('.canvas-port-output').boundingBox();
    assert.ok(Math.abs(port.x + port.width / 2 - image.x - image.width) < 1, "connector stays on image right edge");
    assert.ok(Math.abs(port.y + port.height / 2 - image.y - image.height / 2) < 1, "connector stays centered");
    return image;
  };
  const before = await checkEdges();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + before.height / 2 - 25, { steps: 5 }); await page.mouse.up();
  const moved = await checkEdges();
  assert.ok(Math.abs(moved.x - before.x - 40) < 1 && Math.abs(moved.y - before.y + 25) < 1, "drag moves the actual image by the pointer delta");
  const handle = node.locator('.canvas-resize-handle'); await handle.hover();
  const h = await handle.boundingBox(); await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2 + 70, { steps: 5 }); await page.mouse.up();
  const resized = await checkEdges();
  assert.ok(resized.height > moved.height, "resize handle changes image size");
  assert.ok(Math.abs(resized.width / resized.height - 900 / 1630) < 0.002, "resize preserves portrait aspect ratio");
  for (const scale of [0.45, 1.73, 2.26]) {
    await page.evaluate(scale => {
      const rect = getCanvasNodeBox(getCanvasNode("copy-2175"));
      const viewport = document.querySelector("#infiniteCanvas");
      canvasState.scale = scale;
      canvasState.x = viewport.clientWidth / 2 - (rect.left + rect.right) / 2 * scale;
      canvasState.y = viewport.clientHeight / 2 - (rect.top + rect.bottom) / 2 * scale;
      applyCanvasTransformNow();
    }, scale);
    await checkEdges();
  }
  await page.evaluate(async () => { await saveCanvasBoardNow(); clearCanvasSelection(); });
  const saved = await page.evaluate(async id => {
    const response = await fetch(`/api/canvas/boards/${id}/node?nodeId=copy-2175`);
    return (await response.json()).node;
  }, fixture.id);
  assert.ok(saved.width > 0 && Math.abs(saved.width / saved.height - 900 / 1630) < 0.002, "saved node retains the resized aspect ratio");
  await page.screenshot({ path: path.join(artifacts, "selected-after-resize.png") });
  await require("./check-canvas-overlap-reveal-browser")(page, fixture.source, artifacts);
  await page.evaluate(async previous => { await openCanvasBoardFromHistory(previous); }, fixture.previous);
  fs.writeFileSync(path.join(artifacts, "result.json"), JSON.stringify(dense, null, 2));
  console.log(`PASS 2176 visible copies: ${dense.images} painted, ${dense.cache} shared texture, ${dense.elapsed.toFixed(1)} ms repaint; ports, dense wires, drag and aspect-preserving resize`);
};
