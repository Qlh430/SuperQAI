const assert = require('node:assert/strict');
const { openFixture, settle } = require('./dom-scaling-test-support.cjs');

async function main() {
  const fixture = await openFixture({ width: 1440, height: 1050 });
  try {
    await fixture.page.evaluate(() => {
      const image = { ...__domScalingSeeds[0], id: '1', kind: 'image', x: 140, y: 300, width: 400, height: 400,
        resultSrc: __domScalingPNG, resultDownloadUrl: __domScalingPNG,
        generationHistory: [{ id: 'image-result', kind: 'image', src: __domScalingPNG }], currentGenerationId: 'image-result' };
      const text = { ...__domScalingSeeds[2], id: '2', kind: 'text', x: 650, y: 300, width: 400, height: 400, text: '图片参考文字' };
      restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes: [image, text],
        connections: [{ id: 'image-to-text', from: '1', to: '2', fromPort: 'output', toPort: 'input' }],
        viewport: { x: 20, y: 20, scale: 0.55 } });
      canvasState.isRestoring = false; canvasState.activeBoardPersisted = false;
      clearCanvasSelection(); CanvasNodeRepresentation.reconcile();
    });
    await settle(fixture.page, 500);

    const grouped = await fixture.page.evaluate(async () => {
      canvasState.selectedIds = new Set(['1', '2']);
      canvasState.selectedSceneItems = new Map(['1', '2'].map(id => [id, canvasVirtualStore.get(id)]));
      await createCanvasSceneGroup();
      const group = canvasVirtualStore.values().find(node => node.kind === 'group');
      return { members: [...group.groupMembers].sort(), connections: canvasState.connections.map(edge => [edge.from, edge.to]),
        wireCount: document.querySelectorAll('#canvasConnections .canvas-connection-path').length };
    });
    assert.deepEqual(grouped.members, ['1', '2'], '图片和文字都必须进入新组');
    assert.deepEqual(grouped.connections, [['1', '2']], '打组不能删除图片到文字的连接');
    assert.equal(grouped.wireCount, 1, '打组后仍应绘制图片到文字的连接线');

    const dropped = await fixture.page.evaluate(() => {
      const group = canvasVirtualStore.values().find(node => node.kind === 'group');
      group.groupMembers = ['1'];
      const text = canvasVirtualStore.get('2');
      text.x = 200; text.y = 340;
      updateCanvasGroupMembership([text]);
      return { members: [...canvasVirtualStore.get(group.id).groupMembers].sort(), connections: canvasState.connections.map(edge => [edge.from, edge.to]),
        wireCount: document.querySelectorAll('#canvasConnections .canvas-connection-path').length };
    });
    assert.deepEqual(dropped.members, ['1', '2'], '文字拖入现有图片组后应成为组成员');
    assert.deepEqual(dropped.connections, [['1', '2']], '拖入组不能删除图片到文字的连接');
    assert.equal(dropped.wireCount, 1, '拖入组后仍应绘制图片到文字的连接线');
    assert.deepEqual(fixture.errors, []);
    console.log(JSON.stringify({ grouped, dropped, passed: true }, null, 2));
  } finally { await fixture.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
