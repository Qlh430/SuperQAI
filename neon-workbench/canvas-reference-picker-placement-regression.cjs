const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AI_OS_TEST_URL ||= 'http://127.0.0.1:33200';
process.env.QA_RUNTIME_ROOT ||= path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
const { openFixture } = require('./dom-scaling-test-support.cjs');

const items = Array.from({ length: 18 }, (_, index) => ({
  id: `material-${index}`, type: ['image', 'video', 'text'][index % 3],
  name: `测试素材 ${index}`, sourceNodeId: `material-${index}`, compatible: true,
}));
const panel = '.flora-reference-picker:not([hidden])';
const evidence = process.env.PICKER_QA_DIR;
const capture = (page, name) => evidence && page.screenshot({ path: path.join(evidence, `${name}.png`) });
const nextPaint = page => page.evaluate(async () => {
  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
});

async function setup(page) {
  await page.evaluate(items => {
    window.__qaReferenceTarget = addCanvasImageGeneratorNode({ x: 200, y: 100 }, { focus: false });
    selectCanvasNode(__qaReferenceTarget);
    const bridge = window.CanvasReferenceBridge;
    window.__qaAddedReferences = new Set();
    window.CanvasReferenceBridge = {
      ...bridge,
      list: () => items,
      isAdded: ({ sourceNodeId, assetId }) => __qaAddedReferences.has(sourceNodeId || assetId),
      add: ({ sourceNodeId }) => __qaAddedReferences.add(sourceNodeId),
      addAsset: ({ asset }) => __qaAddedReferences.add(asset.assetId),
      canAddAsset: () => ({ ok: true }),
    };
    const viewport = document.querySelector('#infiniteCanvas');
    viewport.style.margin = '28px 42px 32px 50px';
    viewport.style.width = 'auto';
    viewport.style.minHeight = '0';
    Object.assign(canvasState, { x: 240, y: 40, scale: .75 });
    applyCanvasTransformNow();
  }, items);
  await page.locator('.flora-generator-add-reference:visible').first().waitFor();
}

async function moveAnchor(page, selector, x, y) {
  await page.evaluate(({ selector, x, y }) => {
    const anchor = document.querySelector(selector);
    const viewport = document.querySelector('#infiniteCanvas');
    const bounds = viewport.getBoundingClientRect();
    // Place the real button at a controlled screen position without altering
    // canvas state or the production panel's positioning implementation.
    anchor.style.removeProperty('translate');
    const viewScale = anchor.getBoundingClientRect().width / anchor.offsetWidth || 1;
    const rect = anchor.getBoundingClientRect();
    anchor.style.translate = [
      (bounds.left + x * bounds.width - (rect.left + rect.width / 2)) / viewScale,
      (bounds.top + y * bounds.height - (rect.top + rect.height / 2)) / viewScale,
    ].map(value => `${value}px`).join(' ');
  }, { selector, x, y });
}

function readPlacement(page, selector) {
  return page.evaluate(({ selector, panel }) => {
    const anchor = document.querySelector(selector);
    const picker = document.querySelector(panel);
    const canvas = document.querySelector('#infiniteCanvas');
    return {
      anchor: anchor.getBoundingClientRect().toJSON(),
      panel: picker.getBoundingClientRect().toJSON(),
      canvas: canvas.getBoundingClientRect().toJSON(),
      screen: { width: innerWidth, height: innerHeight },
      visibility: getComputedStyle(picker).visibility,
    };
  }, { selector, panel });
}

async function verify(page, selector, allowed = ['right', 'left', 'down', 'up']) {
  const point = await readPlacement(page, selector);
  const { anchor, panel: p, canvas: c, screen } = point;
  assert.equal(point.visibility, 'visible');
  assert.ok(p.left >= Math.max(c.left, 0) + 7.5 && p.right <= Math.min(c.right, screen.width) - 7.5 &&
    p.top >= Math.max(c.top, 0) + 7.5 && p.bottom <= Math.min(c.bottom, screen.height) - 7.5,
  `面板超出可视画布 ${JSON.stringify(point)}`);
  const gaps = { right: p.left - anchor.right, left: anchor.left - p.right, down: p.top - anchor.bottom, up: anchor.top - p.bottom };
  assert.ok(allowed.some(side => Math.abs(gaps[side] - 8) < 1.5), `面板应紧贴入口 ${JSON.stringify({ allowed, gaps })}`);
}

async function placeAt(page, selector, x, y, allowed) {
  const close = page.locator(panel + ' .flora-reference-picker-close');
  if (await close.isVisible()) await close.click();
  await moveAnchor(page, selector, x, y);
  await page.locator(selector).evaluate(button => button.click());
  await nextPaint(page);
  await verify(page, selector, allowed);
}

async function checkNativeMotion(page, selector) {
  await page.locator(selector).click();
  await verify(page, selector, ['right', 'left']);
  await capture(page, '1440-open');
  const initial = await readPlacement(page, selector);
  const x = initial.canvas.left + 165, y = initial.canvas.top + 140;
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#infiniteCanvas')?.id, [x, y]), 'infiniteCanvas');
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(x - 76, y + 38, { steps: 7 });
  await page.mouse.up({ button: 'middle' });
  await nextPaint(page);
  const panned = await readPlacement(page, selector);
  assert.ok(Math.abs(initial.anchor.left - panned.anchor.left) > 40);
  await verify(page, selector);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -195);
  await nextPaint(page);
  const zoomed = await readPlacement(page, selector);
  assert.ok(Math.hypot(zoomed.anchor.x - panned.anchor.x, zoomed.anchor.y - panned.anchor.y) > 2);
  await verify(page, selector);
  const old = zoomed.anchor.x;
  await page.evaluate(() => {
    const node = __qaReferenceTarget;
    node.dataset.x = String(Number(node.dataset.x) + 50);
    updateCanvasNodePosition(node);
  });
  await nextPaint(page);
  assert.notEqual((await readPlacement(page, selector)).anchor.x, old);
  await verify(page, selector);
  await page.setViewportSize({ width: 910, height: 875 });
  await nextPaint(page);
  await verify(page, selector);
  await page.locator('#infiniteCanvas').evaluate(view => { view.style.marginRight = '112px'; });
  await nextPaint(page);
  await verify(page, selector);
  await page.locator('#infiniteCanvas').evaluate(view => { view.style.marginRight = '42px'; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nextPaint(page);
}

async function checkContent(page, selector) {
  const picker = page.locator(panel);
  const cards = picker.locator('.flora-reference-picker-item');
  for (const type of ['image', 'video', 'text']) {
    await picker.locator(`[data-reference-type="${type}"]:is(button):not(.flora-reference-picker-item)`).click();
    assert.equal(await cards.count(), 6);
    assert.ok(await cards.evaluateAll((nodes, type) => nodes.every(node => node.dataset.referenceType === type), type));
  }
  await picker.locator('[data-reference-type="all"]').click();
  const search = picker.getByRole('searchbox');
  await picker.getByRole('button', { name: '关闭素材面板' }).hover();
  await search.focus();
  assert.equal(await search.evaluate(input => input === document.activeElement), true);
  await verify(page, selector);
  await search.fill('测试素材 3');
  assert.equal(await cards.count(), 1);
  await cards.first().click();
  await cards.first().click();
  assert.equal(await page.evaluate(() => __qaAddedReferences.size), 1);
  assert.match(await cards.first().innerText(), /已添加/);
  await nextPaint(page);
  await verify(page, selector);
  await search.fill('');
  let respond;
  const release = new Promise(resolve => { respond = resolve; });
  let markRequested;
  const requested = new Promise(resolve => { markRequested = resolve; });
  const assets = route => {
    markRequested();
    return release.then(() => route.fulfill({ json: { entries: [
      { asset: { id: 'qa-library', name: '延迟加载的资产' }, preview: { kind: 'image', url: '/qa-picker.png' } },
    ] } }));
  };
  await page.route('**/api/asset-library?*', assets);
  await page.route('**/qa-picker.png', route => route.fulfill({ contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') }));
  await picker.getByRole('tab', { name: '资产' }).click();
  let loading;
  try {
    await requested;
    await verify(page, selector);
    loading = await readPlacement(page, selector);
  } finally { respond(); }
  await picker.getByRole('button', { name: /延迟加载的资产/ }).waitFor();
  assert.equal(await cards.count(), 1, '三个资产来源中的同 ID 只出现一次');
  await nextPaint(page);
  await verify(page, selector);
  const loaded = await readPlacement(page, selector);
  assert.ok(Math.abs(loaded.panel.height - loading.panel.height) <= 32, '切换资产分类时，短列表和加载占位的面板高度应接近');
  await cards.first().click();
  assert.equal(await page.evaluate(() => __qaAddedReferences.size), 2);
  await picker.getByRole('tab', { name: '画布' }).click();
  assert.ok(await cards.count() > 0 && await cards.count() <= 18, '画布分类应恢复首屏卡片');
  const file = page.waitForEvent('filechooser');
  await picker.getByRole('button', { name: '本地上传' }).click();
  assert.equal(await (await file).element().getAttribute('aria-label'), '选择参考素材');
  const box = await readPlacement(page, selector);
  await page.mouse.click(box.canvas.right - 20, box.canvas.top + 18);
  assert.equal(await picker.count(), 0, '点击画布空白关闭');
}

async function checkNarrow(page, selector) {
  await page.setViewportSize({ width: 390, height: 790 });
  await page.evaluate(() => selectCanvasNode(__qaReferenceTarget));
  await nextPaint(page);
  await placeAt(page, selector, .5, .17, ['down']);
  await placeAt(page, selector, .5, .83, ['up']);
  await page.setViewportSize({ width: 390, height: 535 });
  await nextPaint(page);
  await placeAt(page, selector, .5, .28, ['down']);
  await verify(page, selector, ['down']);
  const grid = page.locator(`${panel} .flora-reference-picker-grid`);
  const gridMetrics = await grid.evaluate(list => {
    list.scrollTop = list.scrollHeight;
    return { scrollTop: list.scrollTop, visible: list.clientHeight, full: list.scrollHeight };
  });
  assert.ok(gridMetrics.scrollTop > 0 && gridMetrics.visible < gridMetrics.full);
  const bounds = await page.locator(panel).boundingBox();
  for (const control of [page.locator(panel).getByRole('tab').first(),
    page.locator(panel).getByRole('searchbox'), page.locator(panel).getByRole('button', { name: '本地上传' })]) {
    const rect = await control.boundingBox();
    assert.ok(rect && rect.y >= bounds.y && rect.y + rect.height <= bounds.y + bounds.height);
  }
  await capture(page, '390-constrained');
}

async function checkCommerce(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    const node = addCanvasMinimaxH3Node({ x: 250, y: 70 }, { modelId: 'h3-commerce' });
    selectCanvasNode(node);
    Object.assign(canvasState, { x: 220, y: 40, scale: .75 });
    applyCanvasTransformNow();
    window.__qaSlotActions = [];
    CanvasReferenceBridge.pickCommerceImage = (_, slot) => __qaSlotActions.push(['canvas', slot]);
    CanvasReferenceBridge.useSelectedCommerceImage = (_, slot) => __qaSlotActions.push(['selected', slot]);
    window.addEventListener('flora-h3-commerce-slot-assign', event =>
      __qaSlotActions.push(['image', event.detail.slot, event.detail.image.id]), { capture: true });
  });
  const slot = index => `.canvas-node.is-selected .canvas-h3-commerce-slot[data-slot="${index}"] .canvas-h3-commerce-slot-choose`;
  await page.locator(slot(0)).waitFor();
  for (const [index, side] of [[0, 'right'], [1, 'left'], [2, 'right'], [3, 'left']]) {
    await placeAt(page, slot(index), side === 'right' ? .08 : .92, index < 2 ? .1 : .88, [side]);
    assert.equal(await page.locator(panel).locator('.flora-reference-picker-item').count(), 6);
  }
  await page.locator(panel).getByRole('button', { name: '从画布选择' }).click();
  await placeAt(page, slot(1), .8, .3, ['left']);
  await page.locator(panel).getByRole('button', { name: '使用当前选中素材' }).click();
  await placeAt(page, slot(0), .2, .3, ['right']);
  await page.locator(panel).locator('.flora-reference-picker-item').first().click();
  assert.deepEqual(await page.evaluate(() => __qaSlotActions), [['canvas', 3], ['selected', 1], ['image', 0, 'material-0']]);
  await placeAt(page, slot(2), .2, .3, ['right']);
  const file = page.waitForEvent('filechooser');
  await page.locator(panel).getByRole('button', { name: '本地上传' }).click();
  assert.equal(await (await file).element().evaluate(input => input.closest('.canvas-h3-commerce-slot').dataset.slot), '2');
  assert.equal(await page.locator(panel).count(), 0);
}

async function main() {
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const fixture = await openFixture({ width: 1440, height: 1000 });
  const { page } = fixture;
  page.setDefaultTimeout(7000);
  const selector = '.canvas-node.is-selected .flora-generator-add-reference:not(.canvas-h3-commerce-slot-choose)';
  try {
    await setup(page);
    await checkNativeMotion(page, selector);
    await checkContent(page, selector);
    await moveAnchor(page, selector, .08, .1);
    await page.locator(selector).evaluate(button => button.click());
    await verify(page, selector, ['right']);
    for (const [x, y, side] of [[.92, .1, 'left'], [.08, .88, 'right'], [.92, .88, 'left'], [.5, .5, 'right'],
      [.03, .5, 'right'], [.97, .5, 'left'], [.5, .04, 'right'], [.5, .95, 'right']]) {
      await placeAt(page, selector, x, y, [side]);
    }
    for (const scale of [.5, 1, 2]) {
      await page.evaluate(scale => {
        canvasState.scale = scale;
        applyCanvasTransformNow();
      }, scale);
      await nextPaint(page);
      await placeAt(page, selector, .15, .25, ['right']);
    }
    await checkNarrow(page, selector);
    await checkCommerce(page);
    assert.deepEqual(fixture.errors, []);
    console.log('参考素材面板几何回归通过');
  } finally { await fixture.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
