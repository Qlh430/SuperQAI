const assert = require("node:assert/strict");
const path = require("node:path");
process.env.AI_OS_TEST_URL = "http://127.0.0.1:33200";
const { openFixture } = require("./dom-scaling-test-support.cjs");

(async () => {
  const { dailyPaths } = await import("./daily-workbench.mjs");
  process.env.QA_RUNTIME_ROOT = dailyPaths(path.resolve(__dirname)).runtime;
  const { page, close, errors } = await openFixture();
  try {
    await page.evaluate(() => {
      restoreCanvasBoard({
        id: "dom-scaling-mock-board",
        nodes: __domScalingSeeds.slice(0, 2).map((node, index) => ({
          ...node, id: String(index + 1), x: 320 + index * 480, y: 140, width: 400, height: 400,
        })),
        connections: [],
        viewport: { x: 0, y: 0, scale: 1 },
      });
      CanvasNodeRepresentation.reconcile();
    });
    async function sample() {
      const info = await page.evaluate(() => {
        const node = canvasVirtualStore.getMounted("1");
        const body = node.querySelector(".flora-node-result-area, .canvas-light-visual");
        const rect = body.getBoundingClientRect();
        const icon = body.querySelector(".flora-generator-placeholder svg");
        const style = icon && getComputedStyle(icon);
        const iconRect = icon?.getBoundingClientRect();
        return {
          center: [rect.x + rect.width / 2, rect.y + rect.height / 2],
          scale: canvasState.scale,
          level: node.dataset.virtualLevel,
          icon: style && { color: style.stroke, width: style.width, weight: style.strokeWidth, opacity: style.opacity },
          offset: iconRect && [iconRect.left + iconRect.width / 2 - rect.left - rect.width / 2,
            iconRect.top + iconRect.height / 2 - rect.top - rect.height / 2],
        };
      });
      const [x, y] = info.center;
      const size = Math.ceil(90 * info.scale);
      const png = await page.screenshot({ clip: { x: Math.round(x - size / 2), y: Math.round(y - size / 2), width: size, height: size } });
      return { ...info, png: png.toString("base64") };
    }
    const mouseAway = () => page.mouse.move(120, 100);
    const pixelDelta = (first, second) => page.evaluate(async ([first, second]) => {
      async function pixels(png) {
        const image = new Image();
        image.src = "data:image/png;base64," + png;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const [a, b] = await Promise.all([pixels(first), pixels(second)]);
      let count = 0, total = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.max(a[i], b[i]) < 70) continue;
        count++;
        total += Math.abs(a[i] - b[i]);
      }
      return total / count;
    }, [first.png, second.png]);
    async function assertSameIcon(first, second, state) {
      assert.ok(Math.hypot(first.center[0] - second.center[0], first.center[1] - second.center[1]) < 0.5, state + "图标中心");
      const delta = await pixelDelta(first, second);
      assert.ok(delta < 6, state + "图标像素偏差 " + delta);
      return delta;
    }
    for (const scale of [1, 1.65, 0.65]) {
      await mouseAway();
      await page.evaluate(scale => {
        document.activeElement?.blur();
        clearCanvasSelection();
        CanvasNodeRepresentation.dehydrateNode("1");
        Object.assign(canvasState, { scale, x: 70 - (scale - 1) * 380, y: 52 - (scale - 1) * 120 });
        applyCanvasTransformNow();
        CanvasNodeRepresentation.reconcile();
      }, scale);
      const before = await sample();
      assert.equal(before.level, "light");
      await page.mouse.move(...before.center);
      await page.waitForFunction(() => canvasVirtualStore.getMountedLevel("1") === "full");
      const hover = await sample();
      assert.deepEqual(hover.icon, { color: "rgb(136, 136, 136)", width: "80px", weight: "1.5px", opacity: "1" });
      assert.ok(Math.hypot(...hover.offset) < 0.5, "完整节点图标居中");
      const visualDelta = await assertSameIcon(before, hover, `${scale} 倍默认到悬停`);
      await page.mouse.click(...hover.center);
      await page.waitForFunction(() => canvasState.selectedIds.has("1"));
      const selected = await sample();
      assert.deepEqual(selected.icon, hover.icon);
      await assertSameIcon(hover, selected, "选中");
      await mouseAway();
      const outside = await sample();
      await assertSameIcon(selected, outside, "移出");
      await page.locator('.canvas-node[data-id="1"] .flora-generator-add-reference').focus();
      await assertSameIcon(selected, await sample(), "聚焦");
      await page.evaluate(() => document.activeElement?.blur());
      await page.evaluate(() => clearCanvasSelection());
      const deselected = await sample();
      await assertSameIcon(hover, deselected, "取消选中");
      console.log(JSON.stringify({ scale, visualDelta, center: hover.center }));
    }
    await page.evaluate(() => {
      const node = CanvasNodeRepresentation.hydrateNode("1");
      appendCanvasGenerationToGallery(node, { id: "qa-image", src: __domScalingPNG });
      FloraGeneratorComposer.sync(node);
    });
    await page.locator('.canvas-node[data-id="1"] .flora-generator-placeholder').waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelector('.canvas-node[data-id="1"] .canvas-node-result img')?.naturalWidth > 0);
    assert.equal(await page.locator('.canvas-node[data-id="2"] .flora-video-placeholder-icon').count()
      + await page.locator('[data-canvas-light-id="2"] [data-visual-renderer="h3"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
