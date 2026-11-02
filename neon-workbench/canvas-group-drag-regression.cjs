const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openFixture, settle } = require('./dom-scaling-test-support.cjs');
const output = path.resolve(process.env.GROUP_DRAG_OUTPUT || path.join(__dirname, '../.planning/group-drag-20261026'));
fs.mkdirSync(output, { recursive: true });

async function snapshot(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('#infiniteCanvas').getBoundingClientRect();
    const unit = viewport.width / document.querySelector('#infiniteCanvas').clientWidth;
    const ids = ['g', '1', '2', 'other-0'];
    const models = Object.fromEntries(ids.map(id => [id, toCanvasOperationNode(canvasVirtualStore.get(id))]));
    const visual = Object.fromEntries(ids.map(id => {
      const mounted = canvasVirtualStore.getMounted(id);
      if (mounted) {
        const rect = (mounted.querySelector(':scope > .flora-node-shell > .flora-node-content') || mounted).getBoundingClientRect();
        return [id, { x: rect.left, y: rect.top, width: rect.width, height: rect.height, level: mounted.dataset.virtualLevel || 'full' }];
      }
      const region = [canvasInteractionLayer, canvasSceneLayer].flatMap(layer => layer?.hitRegions || []).find(region => region.id === id);
      return [id, region ? { x: viewport.left + region.left * unit, y: viewport.top + region.top * unit, width: (region.right - region.left) * unit, height: (region.bottom - region.top) * unit, level: 'scene' } : null];
    }));
    const wires = getVisibleCanvasConnections({ includeScene: true }).map(({ item, index, from, to }) => ({
      id: String(item.id || `${item.from}->${item.to}`),
      from: { ...from }, to: { ...to },
      d: canvasConnectionElements.get(CanvasConnectionRules.connectionKey(item, index))?.path?.getAttribute('d') || '',
    }));
    return { models, visual, wires, dragging: canvasState.selectionDragging, selected: [...canvasState.selectedIds], moving: [...canvasState.selectedSceneItems].map(([id, item]) => ({ id, x: item.x, y: item.y })), full: __domScalingSnapshot().full, undoCount: canvasState.undoStack.length };
  });
}
async function checkPixels(page, png, state) {
  return page.evaluate(async ({ png, visual }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), char => char.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const viewport = document.querySelector('#infiniteCanvas').getBoundingClientRect();
    const colors = [[240,40,50],[30,180,60],[30,90,240],[240,210,30]];
    let tested = 0, wrong = 0, first;
    for (const id of ['1', '2']) for (const fx of [.06,.22,.46,.54,.78,.94]) for (const fy of [.06,.22,.46,.54,.78,.94]) {
      const r = visual[id], x = Math.round(r.x + r.width * fx), y = Math.round(r.y + r.height * fy);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      if (x < viewport.left || y < viewport.top || x >= viewport.right || y >= viewport.bottom) continue;
      const expected = colors[(fy < .5 ? 0 : 2) + (fx < .5 ? 0 : 1)];
      const pixel = [...ctx.getImageData(x, y, 1, 1).data]; tested++;
      const tolerance = 5;
      if (expected.some((value, i) => Math.abs(value - pixel[i]) > tolerance)) { wrong++; first ||= { id, x, y, expected, pixel, level: r.level }; }
    }
    return { tested, wrong, first };
  }, { png: png.toString('base64'), visual: state.visual });
}
function rigid(before, after, label) {
  const g = { x: after.visual.g.x - before.visual.g.x, y: after.visual.g.y - before.visual.g.y };
  for (const id of ['1', '2']) {
    assert.ok(after.visual[id], `${label}: 成员${id}必须可见`);
    const dx = after.visual[id].x - before.visual[id].x, dy = after.visual[id].y - before.visual[id].y;
    assert.ok(Math.abs(dx - g.x) < 1.5 && Math.abs(dy - g.y) < 1.5, `${label}: 成员${id}位移(${dx},${dy})必须与组(${g.x},${g.y})一致`);
  }
}
function modelRigid(before, after, label) {
  const dx = after.models.g.x - before.models.g.x, dy = after.models.g.y - before.models.g.y;
  for (const id of ['1', '2']) {
    assert.ok(Math.abs(after.models[id].x - before.models[id].x - dx) < .01 && Math.abs(after.models[id].y - before.models[id].y - dy) < .01, `${label}: 保存位置必须按组的位移更新`);
  }
  assert.deepEqual(after.models.g.groupMembers, before.models.g.groupMembers);
}
function samePositions(before, after, label) {
  for (const id of ['g', '1', '2', 'other-0']) {
    for (const key of ['x', 'y']) assert.ok(Math.abs(before.models[id][key] - after.models[id][key]) < .01, `${label}: ${id}.${key}`);
    assert.ok(Math.abs(before.visual[id].x - after.visual[id].x) < 1.5 && Math.abs(before.visual[id].y - after.visual[id].y) < 1.5, `${label}: ${id}的画面位置必须恢复`);
  }
}
async function main() {
  const results = [];
  const profiles = (process.env.GROUP_DRAG_PROFILES || 'scene,mixed,light,full,asset,slow').split(',').map(name => ({ name, scale: name === 'scene' ? .25 : name === 'light' ? .65 : .49, full: name === 'full' }));
  for (const width of (process.env.GROUP_DRAG_WIDTHS || '1440,390,768,1728').split(',').map(Number)) {
    for (const profile of profiles) {
    const f = await openFixture({ width, height: 1050 });
    const row = { width, profile, frames: [] }; results.push(row);
    try {
      const pixelCapture = async (state, label) => {
        if (process.env.GROUP_DRAG_PIXELS !== '1') return;
        const png = await f.page.screenshot({ path: path.join(output, `${width}-${profile.name}-${label}.png`) });
        state.pixels = await checkPixels(f.page, png, state);
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
        assert.equal(state.pixels.wrong, 0, `${width}/${profile.name}/${label}图片内容必须完整：${JSON.stringify(state.pixels)}`);
      };
      if (profile.name === 'slow') await f.page.route('**/api/canvas/boards/*/nodes?*', async route => {
        if (new URL(route.request().url()).searchParams.getAll('nodeId').length > 1) await new Promise(resolve => setTimeout(resolve, 350));
        await route.fallback();
      });
      await f.page.evaluate(() => AiOsModuleLoader.ensure(['canvas-node-asset-collection']));
      if (process.env.GROUP_DRAG_PIXELS === '1') await f.page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ['rgb(240,40,50)','rgb(30,180,60)','rgb(30,90,240)','rgb(240,210,30)'].forEach((color, index) => { ctx.fillStyle = color; ctx.fillRect((index % 2) * 200, Math.floor(index / 2) * 200, 200, 200); });
        window.__domScalingPNG = canvas.toDataURL('image/png');
      });
      await f.page.evaluate(profile => {
        const nodes = ['1', '2'].map((id, i) => ({ ...__domScalingSeeds[0], id, kind: i === 0 ? 'image' : 'comfy', x: 140 + i * 500, y: 300, width: 400, height: 400, resultSrc: __domScalingPNG, resultDownloadUrl: __domScalingPNG, generationHistory: [{ id: `result-${id}`, kind: 'image', src: __domScalingPNG }], currentGenerationId: `result-${id}`, nodeTitle: `图片${id}`, zOrder: i + 1 }));
        if (profile.name === 'asset') {
          nodes[1] = { ...nodes[1], kind: 'asset-collection', resultSrc: '', assetCollection: { mode: 'single', title: '素材图片', members: [{ id: 'asset-image', kind: 'image', src: __domScalingPNG, name: '苹果.png', mimeType: 'image/png' }], activeMemberId: 'asset-image' } };
        }
        nodes.push({ id: 'g', kind: 'group', x: 124, y: 284, width: 932, height: 480, groupMembers: ['1', '2'], groupImages: nodes.map(node => ({ name: node.nodeTitle, url: node.resultSrc })), groupTitle: '拖动测试组', zOrder: 0 });
        // Fill the normal Light budget, as on a user's populated canvas.
        for (let index = 0; index < 12; index++) nodes.push({ ...nodes[0], id: `other-${index}`, x: 1100 + (index % 2) * 350, y: 100 + Math.floor(index / 2) * 200, width: 320, height: 160, zOrder: index + 3 });
        restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [], viewport: { x: 30, y: 30, scale: Math.min(profile.scale, (innerWidth - 100) / 1200) } });
        canvasState.connections = [
          normalizeVisibleCanvasConnection({ id: 'qa-group-inner-wire', from: '1', to: '2', fromPort: 'output', toPort: 'input' }),
          normalizeVisibleCanvasConnection({ id: 'qa-group-external-wire', from: '2', to: 'other-0', fromPort: 'output', toPort: 'input' }),
        ];
        canvasState.isRestoring = false; canvasState.activeBoardPersisted = false;
        clearCanvasSelection(); CanvasNodeRepresentation.reconcile();
        renderCanvasConnectionsNow();
      }, profile);
      await settle(f.page, 650);
      const point = await f.page.evaluate(() => {
        const v = document.querySelector('#infiniteCanvas').getBoundingClientRect(), unit = v.width / document.querySelector('#infiniteCanvas').clientWidth;
        return { x: v.left + (canvasState.x + 590 * canvasState.scale) * unit, y: v.top + (canvasState.y + 450 * canvasState.scale) * unit };
      });
      await f.page.mouse.click(point.x, point.y); await settle(f.page, profile.name === 'slow' ? 500 : 180);
      if (profile.full) await f.page.evaluate(() => ['1', '2'].forEach(id => CanvasNodeRepresentation.hydrateNode(id)));
      await f.page.evaluate(() => collectCanvasDirtyOperations({ recordUndo: false }));
      row.before = await snapshot(f.page);
      assert.equal(row.before.wires.length, 2, '组内和组外连线都必须已渲染');
      await pixelCapture(row.before, 'before');
      assert.deepEqual(row.before.selected, ['g'], '必须拖动组内空白而非成员');
      await f.page.mouse.move(point.x, point.y); await f.page.mouse.down();
      for (let index = 1; index <= 5; index++) {
        await f.page.mouse.move(point.x + index * 12, point.y + index * 8);
        await settle(f.page, 90);
        const current = await snapshot(f.page); row.frames.push(current);
        fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
        const png = await f.page.screenshot({ path: path.join(output, `${width}-${profile.name}-drag-${index}.png`) });
        if (process.env.GROUP_DRAG_PIXELS === '1') {
          current.pixels = await checkPixels(f.page, png, current);
          fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
          assert.equal(current.pixels.wrong, 0, `${width}/${profile.name}/拖动${index}图片内容必须跟随节点：${JSON.stringify(current.pixels)}`);
        }
        rigid(row.before, current, `${width}/拖动${index}`);
        const positionDelta = id => {
          const before = row.before.moving.find(item => item.id === id) || row.before.models[id];
          const after = current.moving.find(item => item.id === id) || current.models[id];
          return { x: after.x - before.x, y: after.y - before.y };
        };
        for (const [wireIndex, wire] of row.before.wires.entries()) {
          const movedWire = current.wires.find(item => item.id === wire.id);
          const oldEndpoints = wire, newEndpoints = movedWire;
          for (const side of ['from', 'to']) {
            const nodeId = wireIndex === 0 ? (side === 'from' ? '1' : '2') : (side === 'from' ? '2' : 'other-0');
            const expected = positionDelta(nodeId);
            const dx = newEndpoints[side].x - oldEndpoints[side].x, dy = newEndpoints[side].y - oldEndpoints[side].y;
            assert.ok(Math.abs(dx - expected.x) < 1.5 && Math.abs(dy - expected.y) < 1.5,
              `${width}/${profile.name}/拖动${index}: 连线${wire.id}的${side}端点必须与对应节点同步: ${JSON.stringify({ dx, dy, expected, oldEndpoints, newEndpoints })}`);
          }
          if (wire.d && movedWire?.d) assert.notEqual(movedWire.d, wire.d, `${width}/${profile.name}/拖动${index}: 可见连线${wire.id}路径也必须同步更新`);
        }
      }
      await f.page.mouse.up(); await settle(f.page, 250);
      row.after = await snapshot(f.page); rigid(row.before, row.after, `${width}/松手`);
      await pixelCapture(row.after, 'released');
      modelRigid(row.before, row.after, `${width}/松手`);
      assert.ok(Math.hypot(row.after.visual.g.x - row.before.visual.g.x, row.after.visual.g.y - row.before.visual.g.y) > 30, '组必须确实移动');
      await f.page.evaluate(() => undoCanvasCommand()); await settle(f.page, 150);
      row.undone = await snapshot(f.page); samePositions(row.before, row.undone, `${width}/撤销`);
      await pixelCapture(row.undone, 'undo');
      await f.page.evaluate(() => redoCanvasCommand()); await settle(f.page, 150);
      row.redone = await snapshot(f.page); samePositions(row.after, row.redone, `${width}/重做`);
      await pixelCapture(row.redone, 'redo');
      const x = point.x + row.redone.visual.g.x - row.before.visual.g.x, y = point.y + row.redone.visual.g.y - row.before.visual.g.y;
      await f.page.mouse.move(x, y); await f.page.mouse.down();
      await f.page.mouse.move(x + 30, y + 20, { steps: 3 }); await settle(f.page, 100);
      row.cancelPreview = await snapshot(f.page); rigid(row.redone, row.cancelPreview, `${width}/取消前`);
      await pixelCapture(row.cancelPreview, 'cancel-preview');
      await f.page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
      await f.page.mouse.up(); await settle(f.page, profile.name === 'slow' ? 550 : 150);
      row.canceled = await snapshot(f.page); samePositions(row.redone, row.canceled, `${width}/取消`);
      await pixelCapture(row.canceled, 'canceled');
      assert.equal(row.canceled.undoCount, row.redone.undoCount, '取消拖动不能新增撤销记录');
      if (profile.name === 'slow') {
        await f.page.mouse.move(x, y); await f.page.mouse.down();
        await f.page.mouse.move(x + 24, y + 16, { steps: 3 }); await f.page.mouse.up();
        await settle(f.page, 550);
        row.quickRelease = await snapshot(f.page);
        await pixelCapture(row.quickRelease, 'quick-release');
        rigid(row.canceled, row.quickRelease, `${width}/加载期间松手`);
        modelRigid(row.canceled, row.quickRelease, `${width}/加载期间松手保存`);
        assert.ok(Math.hypot(row.quickRelease.visual.g.x - row.canceled.visual.g.x, row.quickRelease.visual.g.y - row.canceled.visual.g.y) > 5, '快速拖动必须完成整组位移');
        assert.equal(row.quickRelease.undoCount, row.canceled.undoCount + 1, '快速拖动只能记录一次整组移动');
      }
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
    }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ cases: results.length, passed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
