const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AI_OS_TEST_URL ||= 'http://127.0.0.1:33200';
process.env.QA_RUNTIME_ROOT ||= path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
const { openFixture } = require('./dom-scaling-test-support.cjs');

const idsOf = nodes => nodes.map(node => String(node.id)).sort();
const readSelection = page => page.evaluate(() => [...canvasState.selectedIds].sort());
const readModels = page => page.evaluate(() => canvasVirtualStore.values().map(toCanvasOperationNode));
const positions = (models, ids) => Object.fromEntries(models.filter(node => ids.includes(node.id))
  .map(({ id, x, y, width, height }) => [id, { x, y, width, height }]));
const frames = page => page.evaluate(async () => {
  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
});

async function seed(fixture, { count, scale = 1, pan = { x: 120, y: 80 }, overlap = false, zoom = 1, spread = 0 }) {
  const nodes = await fixture.page.evaluate(({ count, overlap, spread }) => {
    const [image, , text, note] = __domScalingSeeds;
    const types = [image, text, { kind: 'video' }, note, { kind: 'audio' }];
    return Array.from({ length: count }, (_, index) => {
      const seed = types[index % types.length];
      return {
        ...seed, id: String(index + 1), zOrder: index + 1,
        x: overlap && index === 1 ? 0 : (index % 5) * (spread || 82),
        y: overlap && index === 1 ? 0 : Math.floor(index / 5) * (spread || 74),
        width: seed.kind === 'audio' ? 400 : 55 + index % 3 * 18,
        height: seed.kind === 'image' ? 55 + index % 3 * 18 : 128,
        mediaSizeMode: 'manual',
        ...(seed.kind === 'image' ? {
          resultSrc: __domScalingPNG, resultDownloadUrl: __domScalingPNG,
          generationHistory: [{ id: `result-${index}`, kind: 'image', src: __domScalingPNG }],
          currentGenerationId: `result-${index}`,
        } : {}),
      };
    });
  }, { count, overlap, spread });
  fixture.savedModels.clear();
  nodes.forEach(node => fixture.savedModels.set(node.id, node));
  await fixture.page.evaluate(({ nodes, scale, pan, zoom }) => {
    const viewport = document.querySelector('#infiniteCanvas');
    viewport.style.zoom = String(zoom);
    restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [], viewport: { ...pan, scale } });
    canvasState.activeBoardPersisted = true;
    canvasState.isRestoring = false;
    CanvasNodeRepresentation.reconcile();
  }, { nodes, scale, pan, zoom });
  await fixture.page.waitForTimeout(220);
  await frames(fixture.page);
  return nodes;
}

function clientPoints(page, points) {
  return page.evaluate(points => {
    const viewport = document.querySelector('#infiniteCanvas');
    const rect = viewport.getBoundingClientRect();
    return points.map(([x, y]) => [
      rect.left + (canvasState.x + x * canvasState.scale) * rect.width / viewport.clientWidth,
      rect.top + (canvasState.y + y * canvasState.scale) * rect.height / viewport.clientHeight,
    ]);
  }, points);
}

async function marquee(page, from, to, { ctrl = false, terminal = null, foreignPointer = false } = {}) {
  const [start, end, last] = await clientPoints(page, [from, to, terminal?.point || to]);
  const targets = await page.evaluate(points => points.map(([x, y]) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 145)), [start, end]);
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(...end, { steps: 5 });
  if (foreignPointer) {
    await page.evaluate(([clientX, clientY]) => window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 42, clientX, clientY,
    })), last);
    assert.equal(await page.locator('#canvasSelectionBox').evaluate(box => box.classList.contains('is-marquee')), true);
  }
  if (terminal) await page.evaluate(({ type, last: [clientX, clientY] }) => {
    window.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX, clientY }));
  }, { type: terminal.type, last });
  await page.mouse.up();
  if (ctrl) await page.keyboard.up('Control');
  await frames(page);
  return { start, end, targets };
}

async function groupSelection(page, expected, { title = '图片组' } = {}) {
  assert.deepEqual(await readSelection(page), expected);
  await page.keyboard.press('Control+g');
  await page.waitForFunction(ids => canvasState.selectedIds.size === 1
    && [...canvasState.selectedIds].some(id => !ids.includes(id) && canvasVirtualStore.get(id)?.kind === 'group'), expected);
  const [id] = await readSelection(page);
  const models = await readModels(page);
  const group = models.find(node => node.id === id);
  assert.deepEqual(group.groupMembers.slice().sort(), expected, '打组保存的直接成员必须与选中 ID 完全一致');
  assert.equal(await page.locator(`[data-id="${id}"] .canvas-group-count`).textContent(), `${expected.length} 个节点`);
  assert.equal(group.groupTitle, title);
  return group;
}

async function marqueeCases(fixture) {
  const { page } = fixture;
  await seed(fixture, { count: 2, spread: 200 });
  await marquee(page, [-12, 35], [70, 100], { terminal: { type: 'pointerup', point: [220, 100] } });
  assert.deepEqual(await readSelection(page), ['1', '2'], '松手必须以 pointerup 最终位置提交结果');

  for (const [index, scale] of [.25, .5, 1, 1.5, 2].entries()) {
    const count = [2, 5, 10, 20, 20][index];
    const options = { count, scale, overlap: true, pan: { x: 98 + index * 20, y: 97 - index * 12 }, zoom: index === 2 ? 1.25 : 1 };
    const nodes = await seed(fixture, options);
    const before = positions(await readModels(page), idsOf(nodes));
    for (const reverse of [false, true, false]) {
      const a = [-42, -12], b = [500, 460];
      const drag = await marquee(page, reverse ? b : a, reverse ? a : b);
      assert.deepEqual(await readSelection(page), idsOf(nodes), `重复框选 ${count} 个节点，缩放 ${scale} ${JSON.stringify(drag)}`);
      assert.deepEqual(positions(await readModels(page), idsOf(nodes)), before);
    }
  }

  await seed(fixture, { count: 2, spread: 200 });
  await marquee(page, [-12, 35], [70, 100]);
  assert.deepEqual(await readSelection(page), ['1']);
  await marquee(page, [170, 35], [220, 100], { ctrl: true, foreignPointer: true });
  assert.deepEqual(await readSelection(page), ['1', '2'], 'Ctrl 框选追加，外来指针不能结束手势');
  await marquee(page, [-12, 35], [70, 100], { terminal: { type: 'pointercancel', point: [70, 100] } });
  assert.deepEqual(await readSelection(page), ['1', '2'], '取消手势应恢复框选前的选择');
  await page.mouse.click(...(await clientPoints(page, [[-20, 34]]))[0]);
  assert.deepEqual(await readSelection(page), [], '空白单击应清空选择');

  // The viewport endpoint can return only one sprite for an exact stack.
  const rows = await seed(fixture, { count: 2, scale: .5 });
  const top = rows[0];
  const row = [top.id, top.kind, top.x, top.y, top.width, top.height, top.zOrder, top.resultSrc, '图片'];
  const scene = { mode: 'scene', visualNodes: [row], occludedStacks: [[row, [['behind-top', 0, '叠放图片', '']]]] };
  const viewportRoute = route => route.fulfill({ json: { ...scene, connections: [], complete: true } });
  await page.route('**/viewport?*', viewportRoute);
  await page.evaluate(scene => { canvasPagedStore.scenePage = scene; }, scene);
  await marquee(page, [-60, 15], [48, 90]);
  assert.deepEqual(await readSelection(page), ['1', 'behind-top'], '折叠精确重叠的场景记录仍应选中每个 ID');
  await page.keyboard.press('Control+g');
  await page.waitForFunction(() => document.querySelector('.canvas-status')?.textContent.includes('无法读取全部节点'), null, { timeout: 5000 });
  assert.equal((await readModels(page)).some(node => node.kind === 'group'), false);
  assert.deepEqual(await readSelection(page), ['1', 'behind-top']);
  await page.unroute('**/viewport?*', viewportRoute);
}

async function groupCases(fixture) {
  const { page } = fixture;
  for (const count of [2, 5, 10, 20]) {
    const nodes = await seed(fixture, { count, scale: .65, overlap: true });
    await marquee(page, [-12, 34], [485, 450]);
    const expected = idsOf(nodes);
    const before = positions(await readModels(page), expected);
    const group = await groupSelection(page, expected);
    assert.deepEqual(positions(await readModels(page), expected), before, '打组保留成员的世界位置和尺寸');
    await page.evaluate(() => saveCanvasBoardNow());
    assert.deepEqual(fixture.savedModels.get(group.id).groupMembers.slice().sort(), expected);
  }
  await seed(fixture, { count: 4, scale: .65, spread: 300 });
  await marquee(page, [-55, 0], [415, 200]);
  const inner = await groupSelection(page, ['1', '2']);
  await page.keyboard.down('Control');
  await page.mouse.click(...(await clientPoints(page, [[630, 100]]))[0]);
  await page.keyboard.up('Control');
  await page.waitForFunction(() => canvasState.selectedIds.has('3'));
  const expected = [inner.id, '3'].sort();
  const before = positions(await readModels(page), ['1', '2', '3', inner.id]);
  const outer = await groupSelection(page, expected);
  assert.equal(outer.groupImages.length, 1, '嵌套组保留原图输出');
  assert.deepEqual(positions(await readModels(page), Object.keys(before)), before);
  assert.deepEqual((await readModels(page)).find(node => node.id === inner.id).groupMembers, inner.groupMembers);
  await assertEncloses(page, outer.id);
  const ids = ['1', '2', '3', inner.id, outer.id];
  const grouped = positions(await readModels(page), ids);
  const drag = await dragBy(page, outer, 55, 35, 8);
  await waitForMovement(page, outer.id, outer.x, drag);
  assertRigid(grouped, positions(await readModels(page), ids), ids);
  await page.evaluate(id => {
    const node = openCanvasNodeInteraction(id);
    if (!layoutCanvasGroupMembers(node, 'vertical')) throw new Error('嵌套组布局失败');
  }, outer.id);
  const layout = positions(await readModels(page), ids);
  assert.equal(layout['2'].x - layout['1'].x, grouped['2'].x - grouped['1'].x);
  await assertEncloses(page, outer.id);
  await page.evaluate(id => openCanvasNodeInteraction(id), inner.id);
  const resize = page.locator(`.canvas-group-resize-proxy[data-group-id="${inner.id}"]`);
  const handle = await resize.boundingBox();
  assert.ok(handle, '嵌套组缩放代理可用');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 105, handle.y + handle.height / 2 + 26, { steps: 5 });
  await page.mouse.up();
  await frames(page);
  assert.ok((await readModels(page)).find(node => node.id === inner.id).width > layout[inner.id].width);
  await assertEncloses(page, outer.id);
  const enlarged = positions(await readModels(page), ids);
  await page.keyboard.press('Control+z');
  assert.deepEqual(positions(await readModels(page), ids), layout, '一次撤销还原内外组框');
  await page.keyboard.press('Control+Shift+z');
  assert.deepEqual(positions(await readModels(page), ids), enlarged, '一次重做恢复内外组框');
  await page.evaluate(id => ungroupCanvasNode(openCanvasNodeInteraction(id)), inner.id);
  assert.deepEqual(await readSelection(page), ['1', '2']);
  assert.deepEqual((await readModels(page)).find(node => node.id === outer.id).groupMembers.slice().sort(), ['1', '2', '3']);
  assert.deepEqual(positions(await readModels(page), ['1', '2', '3']),
    Object.fromEntries(['1', '2', '3'].map(id => [id, layout[id]])));

  await seed(fixture, { count: 4, scale: .5, spread: 300 });
  await marquee(page, [240, 10], [670, 200]);
  await groupSelection(page, ['2', '3'], { title: '节点组' });
}

async function dragBy(page, start, dx, dy, offset = 0) {
  const [from, to] = await clientPoints(page, [[start.x + offset, start.y + offset], [start.x + offset + dx, start.y + offset + dy]]);
  const target = await page.evaluate(([x, y]) => {
    const point = getCanvasViewportPoint(document.querySelector('#infiniteCanvas'), { clientX: x, clientY: y });
    return { html: document.elementFromPoint(x, y)?.outerHTML.slice(0, 240), point,
      id: hitTestCanvasScene(point.x, point.y)?.id, modelBox: getCanvasGroupSubjectBounds('1'),
      layer: [canvasSceneLayer, canvasInteractionLayer].map(layer => layer?.hitRegions.filter(region => region.id === '1')
        .map(({ item, ...bounds }) => bounds)) };
  }, from);
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 7 });
  await page.mouse.up();
  await frames(page);
  return { from, to, target };
}

async function waitForMovement(page, id, x, drag) {
  try {
    await page.waitForFunction(({ id, x }) => !canvasState.selectionDragging && Math.abs(canvasVirtualStore.get(id).x - x) > 1,
      { id, x }, { timeout: 5000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      ids: [...canvasState.selectedIds], status: document.querySelector('.canvas-status')?.textContent,
      camera: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
    }));
    throw new Error(`节点 ${id} 未移动 ${JSON.stringify({ drag, state })}`, { cause: error });
  }
}

function assertRigid(before, after, ids) {
  const first = ids[0];
  const dx = after[first].x - before[first].x, dy = after[first].y - before[first].y;
  assert.ok(Math.hypot(dx, dy) > 1, '必须有实际移动');
  for (const id of ids) {
    assert.ok(Math.abs(after[id].x - before[id].x - dx) < .01, `节点 ${id} 横向偏移 ${before[id].x} → ${after[id].x}，预期位移 ${dx}`);
    assert.ok(Math.abs(after[id].y - before[id].y - dy) < .01, `节点 ${id} 纵向偏移 ${before[id].y} → ${after[id].y}，预期位移 ${dy}`);
    assert.equal(after[id].width, before[id].width);
    assert.equal(after[id].height, before[id].height);
  }
}

async function assertEncloses(page, groupId) {
  const boxes = await page.evaluate(id => {
    const group = canvasVirtualStore.get(id);
    return { frame: getCanvasGroupSubjectBounds(group), members: group.groupMembers.map(getCanvasGroupSubjectBounds) };
  }, groupId);
  for (const box of boxes.members) {
    assert.ok(boxes.frame.left <= box.left && boxes.frame.right >= box.right &&
      boxes.frame.top <= box.top && boxes.frame.bottom >= box.bottom, '组框必须完整包围直接成员');
  }
}

async function layoutCases(fixture) {
  const { page } = fixture;
  await seed(fixture, { count: 5, scale: .5, spread: 220, pan: { x: 95, y: 84 } });
  const ids = ['1', '2', '3', '4', '5'];
  await marquee(page, [-55, 10], [1030, 195]);
  assert.deepEqual(await readSelection(page), ids);
  const before = positions(await readModels(page), ids);
  const batchDrag = await dragBy(page, { x: before['1'].x + 24, y: before['1'].y + 72 }, 70, 80);
  await waitForMovement(page, '1', before['1'].x, batchDrag);
  assert.deepEqual(await readSelection(page), ids);
  assertRigid(before, positions(await readModels(page), ids), ids);

  await page.locator('[data-selection-action="layout"]').click();
  await page.locator('#canvasGroupMenu [data-group-layout="horizontal"]').click();
  assert.deepEqual(await readSelection(page), ids);
  const arranged = await page.evaluate(ids => ids.map(getCanvasGroupSubjectBounds).sort((a, b) => a.left - b.left), ids);
  for (let index = 1; index < arranged.length; index++) {
    assert.ok(Math.abs(arranged[index].left - arranged[index - 1].right - 32) < .01, '沿用 32 世界像素的排版间距');
    assert.ok(Math.abs(arranged[index].top - arranged[0].top) < .01);
  }
  const group = await groupSelection(page, ids);
  await assertEncloses(page, group.id);
  const all = [...ids, group.id];
  const grouped = positions(await readModels(page), all);
  const groupDrag = await dragBy(page, group, 80, 63, 10);
  await waitForMovement(page, group.id, group.x, groupDrag);
  assertRigid(grouped, positions(await readModels(page), all), all);

  const moved = positions(await readModels(page), all);
  const resize = page.locator('.canvas-group-resize-proxy').filter({ visible: true });
  await resize.scrollIntoViewIfNeeded();
  const handle = await resize.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 53, handle.y + handle.height / 2 + 43, { steps: 6 });
  await page.mouse.up();
  await frames(page);
  const resized = positions(await readModels(page), all);
  assert.ok(resized[group.id].width > moved[group.id].width && resized[group.id].height > moved[group.id].height);
  for (const id of ids) assert.deepEqual(resized[id], moved[id], '组框尺寸调整保持成员位置');
  await assertEncloses(page, group.id);

  const member = resized['1'];
  const memberDrag = await dragBy(page, { x: member.x + 24, y: member.y + 72 }, 24, 12);
  await waitForMovement(page, '1', member.x, memberDrag);
  for (const id of ids.slice(1)) assert.deepEqual(positions(await readModels(page), ids)[id], resized[id], '独立移动组内节点时其它成员保持原位');
  await assertEncloses(page, group.id);

  await page.evaluate(id => {
    const group = openCanvasNodeInteraction(id);
    if (!layoutCanvasGroupMembers(group, 'grid')) throw new Error('组内排版失败');
  }, group.id);
  await assertEncloses(page, group.id);
  const arrangedGroup = positions(await readModels(page), all);
  await page.locator(`[data-id="${group.id}"] [data-group-tool="ungroup"]`).click();
  assert.deepEqual(await readSelection(page), ids, '解组恢复包括未挂载的全部成员选择');
  assert.deepEqual(positions(await readModels(page), ids), Object.fromEntries(ids.map(id => [id, arrangedGroup[id]])));
  const regrouped = await groupSelection(page, ids);
  await assertEncloses(page, regrouped.id);

  // Recreate the canvas from the actual mocked save payload after a reload.
  await page.evaluate(() => saveCanvasBoardNow());
  const saved = [...fixture.savedModels.values()];
  assert.deepEqual(saved.find(node => node.id === regrouped.id).groupMembers.slice().sort(), ids);
  const expected = positions(await readModels(page), [...ids, regrouped.id]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reopened = await page.evaluate(async () => {
    await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-text', 'canvas-node-note']);
    return openCanvasBoardFromHistory({ id: 'dom-scaling-mock-board', title: '多节点回归', viewport: { x: 95, y: 84, scale: .5 } });
  });
  assert.equal(reopened, true, '刷新后通过画布打开入口从模拟 API 恢复');
  assert.deepEqual(positions(await readModels(page), [...ids, regrouped.id]), expected);
  assert.deepEqual((await readModels(page)).find(node => node.id === regrouped.id).groupMembers.slice().sort(), ids);
}

async function largeBoardCase(fixture) {
  const { page } = fixture;
  const nodes = await seed(fixture, { count: 600, scale: .25, spread: 180, pan: { x: 52, y: 14 } });
  // Move over nodes repeatedly without mounting all matching editors or rereading
  // visual geometry for each pointer event.
  await page.evaluate(() => {
    const original = getCanvasMarqueeCandidates;
    window.__marqueeGeometryPasses = 0;
    getCanvasMarqueeCandidates = function (...args) {
      window.__marqueeGeometryPasses++;
      return original(...args);
    };
  });
  const [from, to] = await clientPoints(page, [[-14, -12], [760, 625]]);
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 40 });
  await page.mouse.up();
  await frames(page);
  const expected = nodes.filter(node => node.x < 760 && node.y < 600).map(node => node.id).sort();
  assert.deepEqual(await readSelection(page), expected);
  const metrics = await page.evaluate(() => ({
    geometryPasses: window.__marqueeGeometryPasses, fullEditors: __domScalingSnapshot().full,
  }));
  assert.equal(metrics.geometryPasses, 2);
  assert.equal(metrics.fullEditors, 0);
  console.log(`600 节点 / 40 次指针移动：${metrics.geometryPasses} 次候选几何计算 / ${metrics.fullEditors} 个完整节点编辑器`);
}

async function selectionOperationCases(fixture) {
  const { page } = fixture;
  const nodes = await seed(fixture, { count: 5, scale: .5 });
  const ids = idsOf(nodes);
  await marquee(page, [-55, 10], [480, 230]);
  assert.deepEqual(await readSelection(page), ids);
  await page.keyboard.press('Control+c');
  await page.waitForFunction(() => canvasState.clipboard?.nodes.length === 5);
  const copied = await page.evaluate(() => canvasState.clipboard.nodes);
  assert.deepEqual(idsOf(copied), ids, '复制读取同一批节点 ID');

  let release;
  let signal;
  const requested = new Promise(resolve => { signal = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const delay = async route => { signal(); await gate; await route.fallback(); };
  await page.route('**/nodes?*', delay);
  await page.keyboard.press('Control+g');
  try {
    await Promise.race([requested, page.waitForFunction(() =>
      canvasVirtualStore.values().some(node => node.kind === 'group'), null, { timeout: 5000 })
      .then(() => { throw new Error('缺少异步成员加载'); })]);
    await page.mouse.click(...(await clientPoints(page, [[-70, 5]]))[0]);
  } finally {
    release();
  }
  await page.waitForFunction(() => document.querySelector('.canvas-status')?.textContent.includes('选择已改变'), null, { timeout: 5000 });
  await page.unroute('**/nodes?*', delay);
  assert.deepEqual(await readSelection(page), []);
  assert.equal((await readModels(page)).some(node => node.kind === 'group'), false, '异步期间选择变化时阻止打组');

  await marquee(page, [-55, 10], [480, 230]);
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => canvasVirtualStore.size === 0);
  assert.deepEqual(await readSelection(page), []);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => canvasVirtualStore.size === 5);
  assert.deepEqual(idsOf(await readModels(page)), ids, '批量删除和撤销均使用框选的完整集合');
}

async function main() {
  const fixture = await openFixture({ width: 1728, height: 1200 });
  try {
    const part = process.argv[2];
    if (!part || part === 'marquee') await marqueeCases(fixture);
    if (!part || part === 'group') await groupCases(fixture);
    if (!part || part === 'operations') await selectionOperationCases(fixture);
    if (!part || part === 'layout') await layoutCases(fixture);
    if (!part || part === 'large') {
      const largeFixture = await openFixture({ width: 1440, height: 1050 });
      try {
        await largeBoardCase(largeFixture);
        assert.deepEqual(largeFixture.errors, []);
      } finally {
        await largeFixture.close();
      }
    }
    assert.deepEqual(fixture.errors, []);
    console.log('多节点框选和打组专项通过');
  } finally {
    await fixture.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
