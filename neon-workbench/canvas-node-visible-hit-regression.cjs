const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, process.env.QA_OUTPUT_DIR || '../.design/visible-node-hit-20261015'); fs.mkdirSync(output, { recursive: true });
const overrides = { 'script.js': 'script-before-save-bridge.js', 'flora-node-shell.js': 'flora-node-shell.js', 'flora-node-shell.css': 'flora-node-shell.css', 'flora-node-tags.css': 'flora-node-tags.css', 'neon-canvas-surface.css': 'neon-canvas-surface.css', 'flora-connection-interaction.js': 'flora-connection-interaction.js' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  const override = process.env.QA_DEPLOYED !== '1' && overrides[name];
  const file = override ? path.join(__dirname, 'design-sources', override) : path.resolve(runtime, name || 'index.html');
  if (!override && !file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    let body = fs.readFileSync(file);
    if (name === 'script.js' && override) body = Buffer.from(body.toString() + '\n' + fs.readFileSync(path.join(__dirname, 'design-sources/canvas-asset-entry.js'), 'utf8'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream'); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
const stub = { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} };
let browser;
const errors = [], checks = [], failures = [], skips = [];
async function check(name, fn) { try { await fn(); checks.push(name); } catch (e) { failures.push(name + ': ' + e.message); } }
async function drag(page, point) { await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 18, point.y + 12, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(80); }
async function snapshot(page) { return page.evaluate(() => ({ group: serializeCanvasNode(qaGroup), nodes: [qaA, qaB].map(serializeCanvasNode) })); }
async function main() {
  await new Promise(resolve => server.listen(33199, '127.0.0.1', resolve)); fs.writeFileSync(path.join(output, 'test.pid'), String(process.pid));
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', e => errors.push(e.message));
  // Full-path compatibility only. Never set this in DOM/performance benchmarks.
  if (process.env.QA_COMPAT_FULL === '1') await page.addInitScript(() => {
    window.NeonCanvasPerformanceFlags = { ...(window.NeonCanvasPerformanceFlags || {}), representationManager: false, detailHydration: false, detailCulling: false };
  });
  await page.route('**/api/**', r => r.fulfill({ json: stub }));
  await page.route('**/api/canvas/boards/*/viewport*', r => r.fulfill({ json: { state: 'migrating' } }));
  await page.route('**/api/image-thumbnails*', r => r.fulfill({ json: { item: { thumbnailUrl: '/output/qa-hit.png', width: 600, height: 400, lightweight: true } } }));
  const cases = [[390, .3], [768, .65], [1440, .8], [1728, 1], [1440, .45], [1440, 1.2]];
  for (const [width, scale] of cases) {
    const key = `${width}-${scale}`;
    await page.setViewportSize({ width, height: 1000 }); await page.goto('http://127.0.0.1:33199/', { waitUntil: 'domcontentloaded' });
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#755b40'; x.fillRect(0, 0, 600, 400); return c.toDataURL(); });
    await page.route('**/output/qa-hit.png', r => r.fulfill({ contentType: 'image/png', body: Buffer.from(png.split(',')[1], 'base64') }));
    await page.evaluate(async scale => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']); if (modules?.ok === false) throw new Error(JSON.stringify(modules));
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-visible-hit';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'; document.body.append(surface);
      const view = document.querySelector('#canvasView'); surface.append(view); view.style.flex = '1'; view.style.minHeight = '0'; view.style.width = '100%'; view.hidden = false; view.classList.add('active'); document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      window.qaA = addCanvasImage('/output/qa-hit.png', '主图.png', { x: 160, y: 160 }, { displaySize: { width: 400, height: 266 } });
      window.qaB = createCanvasImageToolResultNode(null, { src: '/output/qa-hit.png', name: '结果.png' }, { point: { x: 610, y: 160 }, connectSource: false, displaySize: { width: 400, height: 266 } });
      FloraNodeTags.mount(qaA); FloraNodeTags.mount(qaB);
      clearCanvasSelection(); [qaA, qaB].forEach(addCanvasNodeToSelection); window.qaGroup = createCanvasGroupFromSelection(null, { programmatic: true });
      canvasState.scale = scale; canvasState.x = (innerWidth < 768 ? 30 : 160) - Number(qaA.dataset.x) * scale; canvasState.y = 260 - Number(qaA.dataset.y) * scale;
      applyCanvasTransformNow(); scheduleCanvasImageQualityUpdate(); clearCanvasSelection();
    }, scale);
    await page.waitForTimeout(200);
    for (const kind of ['red-blank', 'above-title', 'icon-gap', 'result-blank']) await check(`${key} ${kind}命中组并拖动整组`, async () => {
      await page.evaluate(kind => selectCanvasNode(kind === 'result-blank' ? qaB : qaA), kind);
      const point = await page.evaluate(kind => {
        const node = kind === 'result-blank' ? qaB : qaA;
        const n = node.getBoundingClientRect(), title = node.querySelector('.flora-node-label-title').getBoundingClientRect(), icon = node.querySelector('.flora-node-label-icon').getBoundingClientRect(), tag = node.querySelector('.flora-tag-trigger').getBoundingClientRect();
        if (kind === 'above-title' && title.top - n.top <= 2) return { unavailable: true, gap: title.top - n.top };
        const x = kind === 'red-blank' || kind === 'result-blank' ? (title.right + tag.left) / 2 : kind === 'above-title' ? title.left + title.width / 2 : (icon.right + title.left) / 2;
        const y = kind === 'above-title' ? (n.top + title.top) / 2 : icon.top + icon.height / 2;
        return { x, y, hit: document.elementFromPoint(x, y)?.closest('.canvas-node')?.dataset.id, expected: qaGroup.dataset.id };
      }, kind);
      if (point.unavailable) { skips.push(`${key} above-title没有可测的标题上方空白（${point.gap.toFixed(2)}px）`); return; }
      assert.equal(point.hit, point.expected, JSON.stringify(point));
      const before = await snapshot(page); await drag(page, point); const after = await snapshot(page);
      const dx = after.group.x - before.group.x, dy = after.group.y - before.group.y; assert.ok(dx > 0 && dy > 0);
      after.nodes.forEach((n, i) => { assert.ok(Math.abs(n.x - before.nodes[i].x - dx) < 1); assert.ok(Math.abs(n.y - before.nodes[i].y - dy) < 1); });
      assert.equal(await page.locator('#canvasPlane .flora-node-toolbar:visible').count(), 0);
    });
    await check(`${key}图片主体仍只拖动一个节点`, async () => {
      const point = await page.evaluate(() => { const r = qaA.querySelector('.flora-node-content').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const before = await snapshot(page); await drag(page, point); const after = await snapshot(page);
      assert.ok(after.nodes[0].x > before.nodes[0].x); assert.equal(after.nodes[1].x, before.nodes[1].x); assert.equal(after.nodes[1].y, before.nodes[1].y);
    });
    await check(`${key}名称和标签控件保留命中`, async () => {
      const data = await page.evaluate(() => ['.flora-node-label-title', '.flora-tag-trigger'].map(selector => { const e = qaA.querySelector(selector), r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })); assert.deepEqual(data, [true, true]);
    });
    await check(`${key}名称、标签、连接端口和工具栏都留在节点主体外`, async () => {
      const id = await page.evaluate(() => {
        window.qaChrome = addCanvasImageGeneratorNode({
          x: Number(qaA.dataset.x) + 500,
          y: Number(qaA.dataset.y) + 120 / canvasState.scale,
        }, { focus: false });
        pinCanvasNode(qaChrome.dataset.id);
        selectCanvasNode(qaChrome);
        FloraNodeTags.mount(qaChrome);
        return qaChrome.dataset.id;
      });
      try {
      const boxes = await page.evaluate(() => {
        const read = selector => {
          const element = qaChrome.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          return rect && { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        };
        return {
          title: read('.flora-node-label-title'),
          tag: read('.flora-tag-trigger'),
          input: read('.canvas-port-input'),
          output: read('.canvas-port-output'),
          toolbar: read('.flora-node-toolbar'),
          body: read('.flora-node-content'),
        };
      });
      if (process.env.QA_VERBOSE_CHROME === '1') console.log(`${key} chrome geometry: ${JSON.stringify(boxes)}`);
      assert.ok(boxes.title && boxes.title.bottom <= boxes.body.top - 8, `名称点击区域缺少外部留白: ${JSON.stringify(boxes)}`);
      assert.ok(boxes.tag && boxes.tag.bottom <= boxes.body.top - 8, `标签按钮缺少外部留白: ${JSON.stringify(boxes)}`);
      assert.ok(boxes.input && boxes.input.right <= boxes.body.left + 0.5, `输入端口进入主体范围: ${JSON.stringify(boxes)}`);
      assert.ok(boxes.output && boxes.output.left >= boxes.body.right - 0.5, `输出端口进入主体范围: ${JSON.stringify(boxes)}`);
      assert.ok(boxes.toolbar && boxes.toolbar.bottom <= boxes.body.top + 0.5, `工具栏进入主体: ${JSON.stringify(boxes)}`);
      const body = await page.locator(`[data-id="${id}"] .flora-node-content`).boundingBox();
      await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
      await page.waitForTimeout(120);
      for (const side of ['input', 'output']) {
        const port = page.locator(`[data-id="${id}"] .canvas-port-${side}`);
        const before = await port.boundingBox();
        await page.mouse.move(before.x + before.width / 2 + (side === 'input' ? 26 : -26), before.y + before.height / 2 + 8);
        await page.waitForTimeout(140);
        const geometry = await page.evaluate(side => {
          const port = qaChrome.querySelector(`.canvas-port-${side}`), body = qaChrome.querySelector('.flora-node-content');
          const p = port.getBoundingClientRect(), b = body.getBoundingClientRect();
          return { magnetized: port.classList.contains('is-magnetized'), port: { left: p.left, right: p.right }, body: { left: b.left, right: b.right } };
        }, side);
        if (process.env.QA_VERBOSE_CHROME === '1') console.log(`${key} ${side} magnet: ${JSON.stringify(geometry)}`);
        assert.equal(geometry.magnetized, true, `${side}端口应被磁吸激活`);
        assert.ok(side === 'input' ? geometry.port.right <= geometry.body.left + 0.5 : geometry.port.left >= geometry.body.right - 0.5,
          `${side}端口磁吸后进入主体范围: ${JSON.stringify(geometry)}`);
      }
      } finally {
      await page.mouse.move(5, 850); await page.waitForTimeout(180);
      await page.evaluate(id => { document.querySelector(`[data-id="${id}"]`)?.remove(); clearCanvasSelection(); }, id);
      }
    });
    await check(`${key}图片圆角外透明角不属于节点`, async () => {
      const data = await page.evaluate(() => {
        const r = qaA.querySelector('.flora-node-content').getBoundingClientRect();
        const element = document.elementFromPoint(r.left + .1, r.top + .1);
        return { hit: element?.closest('.canvas-node')?.dataset.id, group: qaGroup.dataset.id, node: qaA.dataset.id, element: element?.className };
      }); assert.notEqual(data.hit, data.node, JSON.stringify(data));
    });
    if (width === 1440 && scale === .8) await check('可见名称编辑、标签弹层、端口与历史徽标可操作', async () => {
      const a = page.locator(`[data-id="${await page.evaluate(() => qaA.dataset.id)}"]`);
      await page.evaluate(() => selectCanvasNode(qaA));
      await a.locator('.flora-node-label-title').dblclick();
      await a.locator('.flora-node-title-editor').fill('可见节点'); await a.locator('.flora-node-title-editor').press('Enter');
      assert.equal(await a.locator('.flora-node-label-title').textContent(), '可见节点');
      await a.locator('.flora-tag-trigger').click(); assert.equal(await page.getByRole('menu', { name: '选择节点标签' }).isVisible(), true);
      await page.keyboard.press('Escape'); await page.evaluate(() => FloraNodeTags.close());
      await page.evaluate(() => selectCanvasNode(qaA));
      const body = await a.locator('.flora-node-content').boundingBox();
      await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2); await page.waitForTimeout(160);
      assert.equal(await a.locator('[data-canvas-port="output"]').evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), true);
      await page.evaluate(() => selectCanvasNode(qaB));
      const b = page.locator(`[data-id="${await page.evaluate(() => qaB.dataset.id)}"]`);
      await b.locator('.flora-generation-history-badge').click(); assert.equal(await page.getByRole('dialog', { name: '节点生成历史' }).isVisible(), true);
      await page.getByRole('button', { name: '关闭生成历史', exact: true }).click();
    });
    await check(`${key}框选透明标题空白不选中图片节点`, async () => {
      await page.evaluate(() => selectCanvasNode(qaA));
      await page.waitForTimeout(50);
      const data = await page.evaluate(() => {
        const title = qaA.querySelector('.flora-node-label-title').getBoundingClientRect(), tag = qaA.querySelector('.flora-tag-trigger').getBoundingClientRect();
        const x = (title.right + tag.left) / 2, y = (title.top + title.bottom) / 2;
        const rects = getCanvasVisibleNodeClientRects(qaA).map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
        selectCanvasNodesInScreenRect({ left: x - 1, right: x + 1, top: y - 1, bottom: y + 1 });
        return { selected: canvasState.selectedIds.has(qaA.dataset.id), rect: { left: x - 1, right: x + 1, top: y - 1, bottom: y + 1 }, title: { left: title.left, right: title.right, top: title.top, bottom: title.bottom }, tag: { left: tag.left, right: tag.right, top: tag.top, bottom: tag.bottom }, visibleRects: rects };
      }); assert.equal(data.selected, false, JSON.stringify(data));
    });
    await page.mouse.move(5, 850); await page.waitForTimeout(180); await page.screenshot({ path: path.join(output, `${key}-group.png`) });
    await check(`${key}无组透明空白交给画布不拖动节点`, async () => {
      await page.evaluate(() => { ungroupCanvasNode(qaGroup); selectCanvasNode(qaA); });
      const point = await page.evaluate(() => { const t = qaA.querySelector('.flora-node-label-title').getBoundingClientRect(), b = qaA.querySelector('.flora-tag-trigger').getBoundingClientRect(); const x = (t.right + b.left) / 2, y = (t.top + t.bottom) / 2; return { x, y, hit: document.elementFromPoint(x, y)?.closest('.canvas-node')?.dataset.id }; });
      assert.equal(point.hit, undefined); const before = await page.evaluate(() => ({ x: qaA.dataset.x, y: qaA.dataset.y }));
      await drag(page, point); assert.deepEqual(await page.evaluate(() => ({ x: qaA.dataset.x, y: qaA.dataset.y })), before);
    });
  }
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    const result = await new Promise(resolve => { const child = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] }); let text = ''; child.stdout.on('data', d => text += d); child.stderr.on('data', d => text += d); child.on('close', code => resolve({ code, text })); });
    fs.writeFileSync(path.join(output, 'acceptance.log'), result.text); assert.equal(result.code, 0, result.text); checks.push('完整四宽acceptance通过');
  }
  if (process.env.RUN_MENU_REGRESSION !== '0') {
    const menuEnv = { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199', QA_OUTPUT_DIR: output };
    if (process.env.QA_DEPLOYED === '1') delete menuEnv.GENERATOR_SOURCE;
    else menuEnv.GENERATOR_SOURCE = path.join(__dirname, 'design-sources');
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, ['canvas-menu-regression.cjs'], {
        cwd: __dirname,
        env: menuEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let outputText = '';
      child.stdout.on('data', data => outputText += data);
      child.stderr.on('data', data => outputText += data);
      child.on('close', code => resolve({ code, outputText }));
    });
    assert.equal(result.code, 0, result.outputText);
    checks.push('添加节点菜单回归通过');
  }
  const report = { checks, skips, failures, errors }; fs.writeFileSync(path.join(output, process.env.QA_DEPLOYED === '1' ? 'deployed-report.json' : 'source-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
