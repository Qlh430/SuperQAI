"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

// Called only on the isolated LAN harness's synthetic 2176-image board.
module.exports = async function checkPanEdges(page, artifacts) {
  const original = await page.evaluate(() => {
    const previous = { x: canvasState.x, y: canvasState.y, scale: canvasState.scale };
    window.__panEdgeRequest = canvasViewportDataSource.request;
    window.__panEdgeRequests = 0;
    canvasViewportDataSource.request = async () => { window.__panEdgeRequests++; return null; };
    return previous;
  });
  const results = [];
  try {
    for (const uiScale of [1, 1.5]) {
      await page.evaluate(uiScale => AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: uiScale } }), uiScale);
      for (const scale of [1, 2.33]) {
        for (const direction of ["up", "down", "left", "right"]) {
          const gesture = await page.evaluate(({ scale, direction }) => {
            clearCanvasSelection();
            window.__panEdgeGeneration = (window.__panEdgeGeneration || 0) + 1;
            const panGeneration = window.__panEdgeGeneration;
            window.__panEdgeSampling = false;
            window.__panEdgeSamples = [];
            const viewport = document.querySelector("#infiniteCanvas"), box = viewport.getBoundingClientRect();
            const width = viewport.clientWidth, height = viewport.clientHeight, unit = box.width / width;
            const tuple = canvasPagedStore.scenePage.visualNodes.find(item => item[0] === "copy-2175");
            const rect = getCanvasImageContentRect({ kind: "image", x: tuple[2], y: tuple[3], width: tuple[4], height: tuple[5], previewSource: tuple[7] });
            const horizontal = direction === "left" || direction === "right";
            const dx = direction === "left" ? -80 : direction === "right" ? 80 : 0;
            const dy = direction === "up" ? -80 : direction === "down" ? 80 : 0;
            const centerX = horizontal ? (dx > 0 ? 0 : width) : width / 2;
            const centerY = horizontal ? height / 2 : (dy > 0 ? 0 : height);
            canvasState.scale = scale;
            canvasState.x = centerX - (rect.left + rect.right) / 2 * scale;
            canvasState.y = centerY - (rect.top + rect.bottom) / 2 * scale;
            markCanvasViewportInteraction();
            applyCanvasTransformNow();
            renderCanvasSceneLayer();
            const start = { x: canvasState.x, y: canvasState.y };
            const sampleX = horizontal ? (dx > 0 ? 20 : width - 20) : width / 2;
            const sampleY = horizontal ? height / 2 : (dy > 0 ? 20 : height - 20);
            window.__panEdgeSamples = [];
            window.__panEdgeSampling = true;
            const sample = () => {
              if (!window.__panEdgeSampling || window.__panEdgeGeneration !== panGeneration) return;
              if (Math.abs(canvasState.x - start.x) + Math.abs(canvasState.y - start.y) > 30) {
                const layer = canvasSceneLayer, canvas = layer.canvas;
                const matrix = new DOMMatrix(canvas.style.transform || undefined);
                const local = matrix.inverse().transformPoint({ x: sampleX - (parseFloat(canvas.style.left) || 0), y: sampleY - (parseFloat(canvas.style.top) || 0) });
                const pixel = [...layer.context.getImageData(Math.floor(local.x * layer.devicePixelRatio), Math.floor(local.y * layer.devicePixelRatio), 1, 1).data];
                window.__panEdgeSamples.push({ pixel, hit: layer.hitTest(sampleX, sampleY)?.id, dx: canvasState.x - start.x, dy: canvasState.y - start.y });
              }
              requestAnimationFrame(sample);
            };
            // Read after the app's transform callback, before a later page response or idle refresh.
            window.__panEdgeStartSampling = () => requestAnimationFrame(sample);
            return { x: box.left + width / 2 * unit, y: box.top + height / 2 * unit, dx: dx * unit, dy: dy * unit };
          }, { scale, direction });
          await page.mouse.move(gesture.x, gesture.y);
          await page.mouse.down({ button: "middle" });
          await page.mouse.move(gesture.x + gesture.dx, gesture.y + gesture.dy);
          await page.evaluate(() => window.__panEdgeStartSampling());
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const samples = await page.evaluate(() => { window.__panEdgeSampling = false; return window.__panEdgeSamples; });
          await page.mouse.up({ button: "middle" });
          results.push({ uiScale, scale, direction, samples });
          if (samples.some(s => s.pixel[3] < 240)) await page.screenshot({ path: path.join(artifacts, "pan-edge-failure.png") });
          assert.ok(samples.length > 0, "real middle-button pan must move the canvas");
          assert.ok(samples.every(s => s.hit === "copy-2175"), `known portrait must cover the sample: ${JSON.stringify(results.at(-1))}`);
          assert.ok(samples.every(s => s.pixel[3] > 240 && s.pixel[0] > 120), `newly exposed image pixels must paint during pan without waiting for a page: ${JSON.stringify(results.at(-1))}`);
        }
      }
    }
    fs.writeFileSync(path.join(artifacts, "pan-edges-result.json"), JSON.stringify(results, null, 2));
    console.log("PASS live pan edges in four directions at 100% / 233% zoom and 100% / 150% UI, without viewport responses");
  } finally {
    await page.mouse.up({ button: "middle" });
    await page.evaluate(original => {
      window.__panEdgeSampling = false;
      canvasViewportDataSource.request = window.__panEdgeRequest;
      AiOsDisplay.applyPreferences({ appearance: { theme: "light", scale: 1 } });
      Object.assign(canvasState, original);
      applyCanvasTransformNow();
      renderCanvasSceneLayer();
    }, original);
  }
};
