const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openFixture, settle } = require('./dom-scaling-test-support.cjs');
const output = path.resolve(__dirname, '../.planning/group-completion-20261026');
fs.mkdirSync(output, { recursive: true });

async function main() {
  const results = [];
  const cases = (process.env.GROUP_COMPLETION_CASES || 'scene-image,scene-comfy,scene-asset-collection,scene-upload,scene-generator,full-image,full-comfy,full-asset-collection').split(',');
  for (const width of (process.env.GROUP_COMPLETION_WIDTHS || '1440,390,768,1728').split(',').map(Number)) {
    for (const scenario of cases) {
    const f = await openFixture({ width, height: 1050 });
    try {
      await f.page.evaluate(() => AiOsModuleLoader.ensure(['canvas-node-asset-collection']));
        await f.page.evaluate(scenario => {
          const kind = scenario.slice(scenario.indexOf('-') + 1);
          const nodes = ['1', '2'].map((id, i) => ({ ...__domScalingSeeds[0], id, kind: 'image', x: 140 + i * 500, y: 300, width: 400, height: 400, resultSrc: __domScalingPNG, resultDownloadUrl: __domScalingPNG, generationHistory: [{ id: `result-${id}`, kind: 'image', src: __domScalingPNG }], currentGenerationId: `result-${id}`, nodeTitle: `图片${id}`, zOrder: i + 1 }));
          if (kind === 'comfy') nodes[1] = { ...nodes[1], kind: 'comfy', comfy: { workflowId: 'qa' } };
          if (kind === 'upload' || kind === 'generator') nodes[1] = { ...nodes[1], kind };
          if (kind === 'asset-collection') {
            nodes[1] = { ...nodes[1], kind, assetCollection: { mode: 'single', title: '素材图片', members: [{ id: 'asset-image', kind: 'image', src: __domScalingPNG, name: '苹果.png', mimeType: 'image/png' }], activeMemberId: 'asset-image' } };
            delete nodes[1].resultSrc; delete nodes[1].resultDownloadUrl;
          }
          restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [], viewport: { x: 20, y: 20, scale: Math.min(.49, (innerWidth - 80) / 1040) } });
          canvasState.isRestoring = false; canvasState.activeBoardPersisted = false;
          clearCanvasSelection(); CanvasNodeRepresentation.reconcile();
        }, scenario);
        await settle(f.page, 500);
        if (scenario.startsWith('full-')) {
          await f.page.evaluate(async () => {
            const nodes = await Promise.all(['1', '2'].map(id => CanvasNodeRepresentation.hydrateNode(id)));
            clearCanvasSelection(); nodes.forEach(addCanvasNodeToSelection);
            canvasState.selectionFrameVisible = true; updateCanvasSelectionFrame();
          });
        } else {
          const drag = await f.page.evaluate(() => {
            const v = document.querySelector('#infiniteCanvas').getBoundingClientRect(), s = canvasState.scale;
            return { x: v.x + canvasState.x + 80 * s, y: v.y + canvasState.y + 200 * s, endX: v.x + canvasState.x + 1100 * s, endY: v.y + canvasState.y + 800 * s };
          });
          await f.page.mouse.move(drag.x, drag.y); await f.page.mouse.down();
          await f.page.mouse.move(drag.endX, drag.endY, { steps: 12 }); await f.page.mouse.up();
        }
        assert.deepEqual(await f.page.evaluate(() => [...canvasState.selectedIds].sort()), ['1', '2']);
        await f.page.locator('[data-selection-action="group"]').click();
        try { await f.page.waitForFunction(() => canvasVirtualStore.values().some(node => node.kind === 'group'), undefined, { timeout: 4000 }); }
        catch (error) {
          console.log(JSON.stringify(await f.page.evaluate(() => ({ selected: [...canvasState.selectedIds], nodes: getSelectedCanvasNodes().map(node => ({ kind: node.className, output: getCanvasNodeOutput(node), model: getCanvasGroupImageOutput(node) })), active: document.activeElement?.outerHTML.slice(0, 500), status: document.querySelector('.canvas-status')?.textContent }))));
          throw error;
        }
        await settle(f.page, 250);
        const state = await f.page.evaluate(() => {
          const group = canvasVirtualStore.values().find(node => node.kind === 'group'), mounted = getCanvasNode(group.id);
          const box = document.querySelector('#canvasSelectionBox');
          return { group: toCanvasOperationNode(group), selected: [...canvasState.selectedIds], frame: canvasState.selectionFrameVisible, boxHidden: box.hidden, images: mounted ? getCanvasGroupImages(mounted) : group.groupImages, mode: document.querySelector('#canvasEditorScreen').dataset.nodeSelection };
        });
        results.push({ width, scenario, state });
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
        await f.page.screenshot({ path: path.join(output, `${width}-${scenario}.png`) });
        assert.deepEqual(state.group.groupMembers.sort(), ['1', '2'], '图片结果类型不同也必须把两个节点完整打组');
        assert.equal(state.images.length, 2, '组输出必须包含两个成员的图片');
        assert.deepEqual(state.selected, [state.group.id], '打组后只选中新组');
        assert.equal(state.mode, 'single');
        assert.equal(state.frame, false, '打组后退出框选');
        assert.equal(state.boxHidden, true, '打组后收起框选及打组工具条');
        assert.equal(await f.page.locator('[data-selection-action="group"]').isVisible(), false, '打组按钮必须实际隐藏');
        assert.equal(await f.page.locator(`[data-id="${state.group.id}"] .canvas-group-tools`).isVisible(), true, '选中新组后显示该组的工具栏');
        const saved = await f.page.evaluate(id => serializeCanvasNode(getCanvasNode(id)), state.group.id);
        assert.deepEqual(saved.groupMembers.sort(), ['1', '2'], '保存的组成员必须完整');
        assert.equal(saved.groupImages.length, 2, '保存的组引用必须完整');
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
    }
  }
  console.log(JSON.stringify({ cases: results.length, passed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
