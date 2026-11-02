const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openFixture, settle } = require('./dom-scaling-test-support.cjs');
const output = path.resolve(__dirname, '../.planning/marquee-group-20261026');
fs.mkdirSync(output, { recursive: true });

async function snapshot(page) {
  return page.evaluate(() => {
    const box = document.querySelector('#canvasSelectionBox'), tools = box.querySelector('.canvas-selection-tools');
    const visible = element => { const s = getComputedStyle(element), r = element.getBoundingClientRect(); return !element.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    return { ids: [...canvasState.selectedIds], sceneIds: [...canvasState.selectedSceneItems.keys()], frameVisible: canvasState.selectionFrameVisible, marquee: box.classList.contains('is-marquee'), box: visible(box), tools: visible(box) && visible(tools), bounds: box.getBoundingClientRect().toJSON(), full: __domScalingSnapshot().full, layers: [canvasSceneLayer, canvasInteractionLayer].map(layer => layer?.hitRegions.map(r => r.id) || []) };
  });
}
async function main() {
  const evidence = [];
  for (const width of (process.env.MARQUEE_WIDTHS || '1440,390,768,1728').split(',').map(Number)) {
    const f = await openFixture({ width, height: 1050 });
    try {
      await f.page.evaluate(() => {
        const nodes = ['1', '2'].map((id, i) => ({ ...__domScalingSeeds[0], id, x: 140 + i * 500, y: 240, width: 400, height: 400, resultSrc: __domScalingPNG, resultDownloadUrl: __domScalingPNG, nodeTitle: `图片${id}`, zOrder: i + 1 }));
        restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [], viewport: { x: 20, y: 20, scale: Math.min(.49, (innerWidth - 80) / 1040) } });
        canvasState.isRestoring = false; canvasState.activeBoardPersisted = false;
        clearCanvasSelection(); CanvasNodeRepresentation.reconcile();
      });
      await settle(f.page, 850);
      const drag = await f.page.evaluate(() => {
        const v = document.querySelector('#infiniteCanvas').getBoundingClientRect(), s = canvasState.scale;
        return { x: v.x + canvasState.x + 80 * s, y: v.y + canvasState.y + 140 * s, endX: v.x + canvasState.x + 1100 * s, endY: v.y + canvasState.y + 720 * s };
      });
      await f.page.mouse.move(drag.x, drag.y); await f.page.mouse.down();
      await f.page.mouse.move(drag.endX, drag.endY, { steps: 12 });
      const during = await snapshot(f.page);
      // Wait between moves so the selected raster actually changes rendering layers.
      const stable = [];
      for (let index = 0; index < 6; index++) {
        await f.page.mouse.move(drag.endX - index, drag.endY + index);
        await settle(f.page, 45);
        const state = await snapshot(f.page); stable.push(state.ids);
        assert.deepEqual(state.ids.sort(), ['1', '2'], '连续拖框不能因节点换层而丢失选中');
        assert.equal(state.tools, false, '手势期间不显示操作条');
        assert.equal(state.full, 0, '框选不得批量挂载完整节点');
      }
      await f.page.mouse.move(drag.x + (drag.endX - drag.x) * .48, drag.endY);
      await settle(f.page, 80);
      assert.deepEqual((await snapshot(f.page)).ids, ['1'], '缩小选框必须取消范围外的节点');
      await f.page.mouse.move(drag.endX, drag.endY); await settle(f.page, 80);
      await f.page.mouse.up(); await settle(f.page, 500);
      const after = await snapshot(f.page);
      evidence.push({ width, during, stable, after, errors: f.errors });
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
      await f.page.screenshot({ path: path.join(output, `${width}-selected.png`) });
      assert.deepEqual(after.ids.sort(), ['1', '2'], '框选必须保留两个节点');
      assert.equal(after.marquee, false, '松手后必须结束框选手势');
      assert.equal(after.tools, true, '松手后必须出现打组/布局工具条');
      await f.page.locator('[data-selection-action="group"]').hover();
      await f.page.screenshot({ path: path.join(output, `${width}-hover.png`) });
      await f.page.locator('[data-selection-action="group"]').focus();
      await f.page.screenshot({ path: path.join(output, `${width}-focus.png`) });
      await f.page.locator('[data-selection-action="group"]').click();
      await f.page.waitForFunction(() => [...canvasVirtualStore.models.values()].some(node => node.kind === 'group'));
      const groups = await f.page.evaluate(() => [...canvasVirtualStore.models.values()].filter(node => node.kind === 'group').map(node => toCanvasOperationNode(node)));
      assert.deepEqual(groups[0].groupMembers.sort(), ['1', '2']);
      assert.deepEqual(await f.page.evaluate(() => [...canvasState.selectedIds]), [groups[0].id], '打组后选中新组');
      assert.equal((await snapshot(f.page)).tools, false, '打组完成必须退出框选工具条');
      await settle(f.page, 180);
      await f.page.screenshot({ path: path.join(output, `${width}-grouped.png`) });
      await f.page.evaluate(() => clearCanvasSelection());
      await settle(f.page, 120);
      assert.equal((await snapshot(f.page)).tools, false, '取消选择必须收起批量工具条');
      assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '页面不得横向溢出');
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ cases: evidence.length, stableMoves: evidence.reduce((count, row) => count + row.stable.length, 0), errors: evidence.flatMap(row => row.errors) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
