'use strict';

const assert = require('node:assert/strict');
const { openFixture, settle, persistenceCheck } = require('./dom-scaling-test-support.cjs');

(async () => {
  const fixture = await openFixture();
  try {
    const page = fixture.page;
    await page.evaluate(() => {
      const clone = value => JSON.parse(JSON.stringify(value));
      const nodes = [
        { ...clone(__domScalingSeeds[0]), id: 'drag-image', kind: 'image-generator', x: 100, y: 100, width: 400, height: 400, resultSrc: '' },
        { ...clone(__domScalingSeeds[2]), id: 'drag-text', kind: 'text', x: 650, y: 100, width: 400, height: 320, text: '文字节点拖动验收\n'.repeat(24) },
        { ...clone(__domScalingSeeds[3]), id: 'drag-note', kind: 'note', x: 1200, y: 100, width: 400, height: 260, text: '便签拖动验收' },
      ];
      restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [], viewport: { x: 20, y: 20, scale: .4 } });
      canvasState.activeBoardPersisted = false;
      canvasState.isRestoring = false;
      clearCanvasSelection();
      CanvasNodeRepresentation.reconcile();
    });
    await settle(page, 700);

    const moves = [];
    for (const id of ['drag-image', 'drag-text', 'drag-note']) {
      const start = await page.evaluate(id => {
        const model = canvasVirtualStore.get(id);
        const bounds = getCanvasRepresentationVisualBounds(model, canvasVirtualStore.getRect(id));
        const viewport = document.querySelector('#infiniteCanvas').getBoundingClientRect();
        const unit = viewport.width / document.querySelector('#infiniteCanvas').clientWidth;
        return {
          x: viewport.left + (canvasState.x + (bounds.left + 80) * canvasState.scale) * unit,
          y: viewport.top + (canvasState.y + (bounds.top + 80) * canvasState.scale) * unit,
          before: { x: model.x, y: model.y },
        };
      }, id);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 64, start.y + 40, { steps: 6 });
      await page.mouse.up();
      await settle(page, 180);
      const after = await page.evaluate(id => {
        const model = canvasVirtualStore.get(id);
        const mounted = canvasVirtualStore.getMounted(id);
        return { x: model.x, y: model.y, mounted: !!mounted, level: mounted?.dataset.virtualLevel };
      }, id);
      assert.ok(after.mounted, `${id} 必须完成 Full 节点挂载`);
      assert.ok(after.x > start.before.x + 100 && after.y > start.before.y + 60, `${id} 必须响应原生拖动: ${JSON.stringify({ start, after })}`);
      moves.push({ id, before: start.before, after });
    }

    await page.evaluate(async () => {
      canvasPersistedNodes.clear();
      canvasPersistedConnections.clear();
      await ensureCanvasBoardPersisted();
      const text = ensureCanvasNodeMounted('drag-text')?.querySelector('.canvas-text');
      if (text) text.scrollTop = 120;
    });
    const persisted = await persistenceCheck(fixture);
    assert.ok(persisted.pass, `模拟 API 保存必须成功: ${JSON.stringify(persisted)}`);
    const reopened = await page.evaluate(() => {
      const nodes = [...fixtureModels()];
      function fixtureModels() { return canvasVirtualStore.values().map(model => toCanvasOperationNode(model)); }
      restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [], viewport: { x: 20, y: 20, scale: .4 } });
      canvasState.activeBoardPersisted = false;
      canvasState.isRestoring = false;
      CanvasNodeRepresentation.reconcile();
      return ['drag-image', 'drag-text', 'drag-note'].map(id => {
        const model = canvasVirtualStore.get(id);
        const node = ensureCanvasNodeMounted(id);
        return { id, x: model.x, y: model.y, mounted: !!node };
      });
    });
    for (const move of moves) {
      const row = reopened.find(item => item.id === move.id);
      assert.equal(row.x, move.after.x);
      assert.equal(row.y, move.after.y);
      assert.ok(row.mounted, `${row.id} 重新打开后必须挂载`);
    }
    const zoomDrag = await page.evaluate(async () => {
      clearCanvasSelection();
      canvasState.scale = 1.2;
      canvasState.x = 20;
      canvasState.y = 20;
      applyCanvasTransformNow();
      CanvasNodeRepresentation.reconcile();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const model = canvasVirtualStore.get('drag-image');
      const before = { x: model.x, y: model.y };
      const bounds = getCanvasRepresentationVisualBounds(model, canvasVirtualStore.getRect(model.id));
      const viewport = document.querySelector('#infiniteCanvas').getBoundingClientRect();
      const unit = viewport.width / document.querySelector('#infiniteCanvas').clientWidth;
      return {
        before,
        x: viewport.left + (canvasState.x + (bounds.left + 80) * canvasState.scale) * unit,
        y: viewport.top + (canvasState.y + (bounds.top + 80) * canvasState.scale) * unit,
      };
    });
    await page.mouse.move(zoomDrag.x, zoomDrag.y);
    await page.mouse.down();
    await page.mouse.move(zoomDrag.x + 48, zoomDrag.y + 32, { steps: 5 });
    await page.mouse.up();
    await settle(page, 180);
    const zoomAfter = await page.evaluate(() => {
      const model = canvasVirtualStore.get('drag-image');
      return { x: model.x, y: model.y };
    });
    assert.ok(zoomAfter.x > zoomDrag.before.x && zoomAfter.y > zoomDrag.before.y, `缩放后拖动必须更新节点位置: ${JSON.stringify({ zoomDrag, zoomAfter })}`);
    assert.deepEqual(fixture.errors, []);
    console.log(JSON.stringify({ pass: true, moves, reopened, zoomAfter, mockPersistence: persisted.pass }));
  } finally {
    await fixture.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
