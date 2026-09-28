"use strict";
const assert = require("node:assert/strict");

// Runs inside the raster harness's disposable server/account, never user data.
module.exports = async function checkCanvasMotionRegressions(page) {
  const failures = [];
  const check = async (name, run) => {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures.push(`${name}: ${error.message}`); }
  };
  if (!await page.locator("#canvasView.active").isVisible()) await page.locator('[data-ai-app="canvas"]').click();
  await page.evaluate(() => createNewCanvasBoard("Motion regression"));

  await check("wheel distance, reciprocal zoom, zero delta and cursor anchor", async () => {
    const result = await page.evaluate(async () => {
      const viewport = document.querySelector("#infiniteCanvas");
      const rect = viewport.getBoundingClientRect();
      canvasState.x = 30; canvasState.y = 50; canvasState.scale = 1;
      applyCanvasTransformNow();
      const clientX = rect.left + 360, clientY = rect.top + 240;
      const point = () => screenToCanvas(toSystemDelta(clientX - rect.left), toSystemDelta(clientY - rect.top));
      const before = point();
      const wheel = async (deltaY, deltaMode = 0) => {
        viewport.dispatchEvent(new WheelEvent("wheel", { clientX, clientY, deltaY, deltaMode, bubbles: true, cancelable: true }));
        await new Promise(requestAnimationFrame);
        return canvasState.scale;
      };
      const zero = await wheel(0), tiny = await wheel(-1), large = await wheel(-100);
      const reversed = await wheel(101), anchor = point();
      const line = await wheel(-1, 1);
      await wheel(16);
      return { zero, tiny, large, reversed, before, anchor, line, final: canvasState.scale };
    });
    assert.equal(result.zero, 1, "horizontal-only/zero wheel must not zoom");
    assert.ok(Math.abs(result.tiny - Math.exp(0.001)) < 1e-8, "small deltas must make small steps like DX OS");
    assert.ok(Math.abs(result.large - Math.exp(0.101)) < 1e-8);
    assert.ok(Math.abs(result.reversed - 1) < 1e-8, "opposite wheel travel must restore scale");
    assert.ok(Math.hypot(result.anchor.x - result.before.x, result.anchor.y - result.before.y) < 1e-7);
    assert.ok(Math.abs(result.line - Math.exp(0.016)) < 1e-8);
    assert.ok(Math.abs(result.final - 1) < 1e-8);
  });

  await check("node drag snaps to smart alignment guides and clears them", async () => {
    const result = await page.evaluate(async () => {
      clearCanvasPlane();
      setCanvasAppScreen("editor");
      canvasState.x = 0;
      canvasState.y = 0;
      canvasState.scale = 1;
      applyCanvasTransformNow();
      const first = addCanvasText({ x: 120, y: 160 }, { text: "A", focus: false });
      const second = addCanvasText({ x: 420, y: 120 }, { text: "B", focus: false });
      await new Promise(requestAnimationFrame);
      const firstBox = getCanvasNodeBox(first);
      const secondBox = getCanvasNodeBox(second);
      const rawDx = secondBox.left - firstBox.right - 3;
      const rawDy = secondBox.top - firstBox.top - 3;
      const startX = 100;
      const startY = 100;
      beginCanvasNodeDrag({
        target: first,
        button: 0,
        clientX: startX,
        clientY: startY,
        preventDefault() {},
        stopPropagation() {},
      }, first, {
        initialMove: { clientX: startX + rawDx, clientY: startY + rawDy },
      });
      const guides = document.querySelector("#canvasAlignmentGuides");
      const vertical = guides?.querySelector('[data-alignment-axis="x"]');
      const horizontal = guides?.querySelector('[data-alignment-axis="y"]');
      const during = {
        right: getCanvasNodeBox(first).right,
        top: getCanvasNodeBox(first).top,
        targetRight: secondBox.left,
        targetTop: secondBox.top,
        visible: guides && !guides.hidden,
        verticalVisible: vertical && !vertical.hidden,
        horizontalVisible: horizontal && !horizontal.hidden,
        verticalPosition: vertical?.style.left || "",
        horizontalPosition: horizontal?.style.top || "",
      };
      window.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        clientX: startX + rawDx,
        clientY: startY + rawDy,
      }));
      return {
        during,
        afterHidden: Boolean(guides?.hidden),
      };
    });
    assert.ok(Math.abs(result.during.right - result.during.targetRight) < 0.01);
    assert.ok(Math.abs(result.during.top - result.during.targetTop) < 0.01);
    assert.equal(result.during.visible, true, "the guide overlay must be visible during a snap");
    assert.equal(result.during.verticalVisible, true, "the vertical edge guide must be visible");
    assert.equal(result.during.horizontalVisible, true, "the horizontal edge guide must be visible");
    assert.match(result.during.verticalPosition, /px$/);
    assert.match(result.during.horizontalPosition, /px$/);
    assert.equal(result.afterHidden, true, "the guide overlay must be hidden after pointer release");
  });

  await check("scene keeps painted pixels and hit regions until replacement is ready", async () => {
    const result = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const layer = new CanvasSceneLayer({ canvas });
      layer.resize(300, 200, 80);
      layer.render({ visualNodes: [["node", "text", 10, 10, 100, 80]], transform: { scale: 1 } });
      const alpha = () => layer.context.getImageData(100, 100, 1, 1).data[3];
      const before = alpha();
      layer.resize(300, 200, 80);
      const afterResize = alpha(), hit = layer.hitTest(20, 20)?.id;
      layer.resize(350, 230, 90);
      const beforeReplacement = alpha();
      layer.render({ visualNodes: [["node", "text", 10, 10, 100, 80]], transform: { scale: 1 } });
      const replaced = layer.context.getImageData(110, 110, 1, 1).data[3];
      layer.render({ visualNodes: [], transform: { scale: 1 } });
      return { before, afterResize, hit, beforeReplacement, replaced, removed: alpha(),
        desynchronized: layer.context.getContextAttributes().desynchronized };
    });
    assert.equal(result.before, 255);
    assert.equal(result.afterResize, 255, "same-size redraw must not clear the visible canvas");
    assert.equal(result.hit, "node");
    assert.equal(result.beforeReplacement, 255, "resize must keep old pixels until the new buffer is ready");
    assert.equal(result.replaced, 255);
    assert.equal(result.removed, 0, "atomic replacement must still erase removed nodes");
    assert.equal(result.desynchronized, false, "scene pixels must commit with their CSS transform");
  });

  await check("external clipboard repeats and concurrent uploads remain staggered", async () => {
    const result = await page.evaluate(async () => {
      const source = document.createElement("canvas"); source.width = 20; source.height = 20;
      source.getContext("2d").fillRect(0, 0, 20, 20);
      const blob = await new Promise(resolve => source.toBlob(resolve));
      const paste = () => {
        const data = new DataTransfer(); data.items.add(new File([blob], "clipboard.png", { type: "image/png" }));
        return handleCanvasClipboardPaste({ clipboardData: data, preventDefault() {} });
      };
      const center = getCanvasViewportCenterPoint();
      await paste(); await paste(); await Promise.all([paste(), paste(), paste()]);
      const nodes = canvasVirtualStore.values().filter((node) => (
        node.kind === "asset-collection"
        && node.assetCollection?.members?.some((member) => /^clipboard(?: \d+)?\.png$/.test(member.name || ""))
      ));
      return { center, points: nodes.map(node => ({ x: node.x, y: node.y })).sort((a, b) => a.x - b.x) };
    });
    assert.equal(result.points.length, 5);
    assert.deepEqual(result.points, Array.from({ length: 5 }, (_, index) => ({
      x: result.center.x + index * 28, y: result.center.y + index * 28,
    })), "each paste must reserve a distinct point before asynchronous upload");
  });

  await check("changing clipboard content while uploading does not discard the earlier paste", async () => {
    const result = await page.evaluate(async () => {
      const source = canvasVirtualStore.values()
        .flatMap((node) => node.assetCollection?.members || [])
        .find((member) => member.src)?.src;
      const upload = uploadCanvasImageFile, pending = [];
      uploadCanvasImageFile = () => new Promise(resolve => pending.push(resolve));
      const paste = name => {
        const data = new DataTransfer(); data.items.add(new File(["image"], name, { type: "image/png" }));
        return handleCanvasClipboardPaste({ clipboardData: data, preventDefault() {} });
      };
      try {
        const first = paste("pending-a.png"), second = paste("pending-b.png");
        pending[1](source); await second;
        pending[0](source); await first;
        return canvasVirtualStore.values()
          .flatMap((node) => node.assetCollection?.members || [])
          .filter((member) => /^pending-/.test(member.name || ""))
          .map((member) => member.name)
          .sort();
      } finally { uploadCanvasImageFile = upload; }
    });
    assert.deepEqual(result, ["pending-a.png", "pending-b.png"]);
  });

  await check("leaving a board cancels pending paste even when its id is reused", async () => {
    const count = await page.evaluate(async () => {
      await saveCanvasBoardNow();
      const upload = uploadCanvasImageFile;
      const source = canvasVirtualStore.values().find(node => node.imageSrc)?.imageSrc;
      let resolveUpload;
      uploadCanvasImageFile = () => new Promise(resolve => { resolveUpload = resolve; });
      try {
        const data = new DataTransfer(); data.items.add(new File(["image"], "late.png", { type: "image/png" }));
        const pending = handleCanvasClipboardPaste({ clipboardData: data, preventDefault() {} });
        clearCanvasPlane();
        resolveUpload(source); await pending;
        return canvasVirtualStore.size;
      } finally { uploadCanvasImageFile = upload; }
    });
    assert.equal(count, 0, "an old upload must not insert into a newly restored board");
  });

  await check("fast scene pan redraws before the cached edge enters the viewport", async () => {
    const result = await page.evaluate(async () => {
      clearCanvasPlane(); setCanvasAppScreen("editor");
      canvasState.x = 0; canvasState.y = 0; canvasState.scale = 1;
      const viewport = document.querySelector("#infiniteCanvas");
      const width = viewport.clientWidth, height = viewport.clientHeight;
      canvasPagedStore.scenePage = { mode: "scene", visualNodes: [
        ["edge", "text", -900, 0, 1000, height, 1, "", "edge"],
      ], visualConnections: [], texturedNodeIds: [] };
      renderCanvasSceneLayer();
      const padding = canvasSceneLayer.padding;
      canvasState.x = padding + 140;
      applyCanvasTransformNow();
      const raster = canvasSceneLayer.lastTransform;
      const current = canvasSceneLayer.currentTransform;
      const dx = current.x - raster.x * current.scale / raster.scale;
      const left = dx - padding * current.scale / raster.scale;
      const local = new DOMMatrix(canvasSceneLayer.canvas.style.transform || undefined).inverse()
        .transformPoint({ x: 30 + padding, y: 50 + padding });
      const pixel = [...canvasSceneLayer.context.getImageData(Math.floor(local.x * canvasSceneLayer.devicePixelRatio),
        Math.floor(local.y * canvasSceneLayer.devicePixelRatio), 1, 1).data];
      return { left, width, pixel, hit: canvasSceneLayer.hitTest(30, 50)?.id };
    });
    assert.ok(result.left <= 0, `a ${result.left}px blank strip entered the viewport`);
    assert.equal(result.pixel[3], 255, "newly exposed pixels must exist in the same transform frame");
    assert.equal(result.hit, "edge");
  });
  await page.evaluate(() => { clearCanvasPlane(); canvasState.activeBoardId = null; });
  assert.deepEqual(failures, [], failures.join("\n"));
};
