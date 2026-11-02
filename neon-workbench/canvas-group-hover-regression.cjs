const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, process.env.QA_OUTPUT_DIR || '../.design/group-hover-20261015'); fs.mkdirSync(output, { recursive: true });
const overrides = { 'script.js': 'script-before-save-bridge.js', 'flora-node-shell.css': 'flora-node-shell.css', 'neon-canvas-surface.css': 'neon-canvas-surface.css', 'flora-connection-interaction.js': 'flora-connection-interaction.js' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  const override = process.env.QA_DEPLOYED !== '1' && overrides[name];
  const file = override ? path.join(__dirname, 'design-sources', override) : path.resolve(runtime, name || 'index.html');
  if (!override && !file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    let body = fs.readFileSync(file);
    if (name === 'script.js' && override) body = Buffer.from(body.toString() + '\n' + fs.readFileSync(path.join(__dirname, 'design-sources/canvas-asset-entry.js'), 'utf8'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
const stub = { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} };
let browser;
const errors = [], checks = [], failures = [];
async function check(name, fn) { try { await fn(); checks.push(name); } catch (e) { failures.push(name + ': ' + e.message); } }
async function point(page, name, kind = 'body') {
  return page.evaluate(({ name, kind }) => {
    const n = window[name]; let r;
    if (kind === 'blank') { r = n.getBoundingClientRect(); return { x: r.left + 3 * canvasState.scale, y: r.top + r.height / 2 }; }
    r = (kind === 'body' ? n.querySelector('.flora-node-content') || n : n.querySelector(kind)).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { name, kind });
}
async function move(page, p) { await page.mouse.move(p.x, p.y, { steps: 8 }); await page.waitForTimeout(180); }
async function click(page, locator) { const r = await locator.boundingBox(); assert.ok(r, '控件可见'); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
async function ports(page) { return page.evaluate(() => [...document.querySelectorAll('#canvasPlane .canvas-port')].filter(p => { const s = getComputedStyle(p); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > .5; }).map(p => ({ id: p.closest('.canvas-node').dataset.id, kind: p.dataset.canvasPortKind }))); }
async function expectOwner(page, name) { const visible = await ports(page); const id = await page.evaluate(name => window[name]?.dataset.id, name); assert.ok(visible.length > 0, '应显示连接点'); assert.deepEqual([...new Set(visible.map(p => p.id))], [id], JSON.stringify(visible)); }
async function geometry(page) { return page.evaluate(() => ({ x: canvasState.x, y: canvasState.y, group: [qaGroup.dataset.x, qaGroup.dataset.y], title: qaGroup.querySelector('[aria-label="组名称"]').getBoundingClientRect().toJSON(), scrollers: [...document.querySelectorAll('*')].filter(e => e.scrollLeft || e.scrollTop).map(e => ({ id: e.id, class: e.className, x: e.scrollLeft, y: e.scrollTop })), active: document.activeElement?.className })); }
async function resetCamera(page) { await page.evaluate(() => { Object.assign(canvasState, qaCamera); applyCanvasTransformNow(); }); await page.waitForTimeout(80); }
async function main() {
  await new Promise(resolve => server.listen(33199, '127.0.0.1', resolve)); fs.writeFileSync(path.join(output, 'test.pid'), String(process.pid));
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(4000); page.on('pageerror', e => errors.push(e.message));
  // Full-path compatibility only. Never set this in DOM/performance benchmarks.
  if (process.env.QA_COMPAT_FULL === '1') await page.addInitScript(() => {
    window.NeonCanvasPerformanceFlags = { ...(window.NeonCanvasPerformanceFlags || {}), representationManager: false, detailHydration: false, detailCulling: false };
  });
  await page.route('**/api/**', r => r.fulfill({ json: stub }));
  await page.route('**/api/canvas/boards/*/viewport*', r => r.fulfill({ json: { state: 'migrating' } }));
  for (const [width, scale] of (process.env.QA_QUICK ? [[1440, .85]] : [[390, .3], [768, .6], [1440, .85], [1728, 1]])) {
    const key = `${width}-${scale}`;
    await page.setViewportSize({ width, height: 1000 }); await page.goto('http://127.0.0.1:33199/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async scale => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']); await loadCanvasBoards(); canvasState.activeBoardId = 'qa-group-hover';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'; document.body.append(surface);
      const view = document.querySelector('#canvasView'); surface.append(view); view.style.cssText = 'flex:1;min-height:0;width:100%'; view.hidden = false; view.classList.add('active'); document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const ctx = c.getContext('2d'); ctx.fillStyle = '#755b40'; ctx.fillRect(0, 0, 600, 400); const src = c.toDataURL();
      window.qaA = addCanvasImage(src, '主图.png', { x: 160, y: 160 }, { displaySize: { width: 400, height: 266 } });
      window.qaB = createCanvasImageToolResultNode(null, { src, name: '结果.png' }, { point: { x: 610, y: 160 }, connectSource: false, displaySize: { width: 400, height: 266 } });
      clearCanvasSelection(); [qaA, qaB].forEach(addCanvasNodeToSelection); window.qaGroup = createCanvasGroupFromSelection(null, { programmatic: true });
      window.qaTarget = addCanvasImageGeneratorNode({ x: 610, y: 500 });
      window.qaExtra = addCanvasImage(src, '外部来源.png', { x: 160, y: 500 }, { displaySize: { width: 400, height: 266 } });
      canvasState.scale = scale; canvasState.x = 60 - Number(qaA.dataset.x) * scale; canvasState.y = 260 - Number(qaA.dataset.y) * scale; applyCanvasTransformNow(); clearCanvasSelection();
      window.qaCamera = { x: canvasState.x, y: canvasState.y, scale };
    }, scale); await page.waitForTimeout(200);
    fs.writeFileSync(path.join(output, `${key}-geometry.json`), JSON.stringify(await page.evaluate(() => {
      const rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.outerHTML.slice(0, 250) }; };
      return { group: rect(qaGroup), title: rect(qaGroup.querySelector('[aria-label="组名称"]')), a: rect(qaA), b: rect(qaB), viewport: rect(document.querySelector('#infiniteCanvas')) };
    }), null, 2));
    const groupTools = page.locator('.canvas-node-group .canvas-group-tools');
    await check(`${key}松手和移开后组工具栏保持且菜单可用`, async () => {
      await page.evaluate(() => {
        window.qaTrace = [];
        ['pointermove', 'pointerdown', 'pointerup', 'click'].forEach(type => document.addEventListener(type, e => qaTrace.push({ type, x: e.clientX, y: e.clientY, target: e.target.className, port: e.target.closest?.('.canvas-port')?.dataset.canvasPort, selected: [...canvasState.selectedIds] }), true));
      });
      const p = await point(page, 'qaGroup', 'blank'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(220);
      fs.writeFileSync(path.join(output, `${key}-click.json`), JSON.stringify(await page.evaluate(() => ({ trace: qaTrace, group: qaGroup.dataset.id, selected: [...canvasState.selectedIds], temp: canvasState.tempConnection })), null, 2));
      assert.equal(await groupTools.isVisible(), true, '松手不能清除组选择');
      await move(page, { x: 15, y: 900 }); assert.equal(await groupTools.isVisible(), true);
      await click(page, groupTools.locator('[data-group-tool="color"]')); assert.equal(await page.locator('#canvasGroupMenu').isVisible(), true);
      await click(page, page.locator('#canvasGroupMenu [data-group-color="#a855f7"]')); assert.equal(await groupTools.isVisible(), true);
      assert.equal(await page.evaluate(() => qaGroup.dataset.groupColor), '#a855f7');
      await click(page, groupTools.locator('[data-group-tool="layout"]')); assert.equal(await page.locator('#canvasGroupMenu [data-group-layout="horizontal"]').isVisible(), true);
      await click(page, page.locator('#canvasGroupMenu [data-group-layout="horizontal"]')); assert.equal(await groupTools.isVisible(), true);
      fs.writeFileSync(path.join(output, `${key}-after-menu.json`), JSON.stringify(await geometry(page), null, 2));
    });
    await check(`${key}点击节点或画布收组工具栏且组名可选中`, async () => {
      let p = await point(page, 'qaB'); await page.mouse.click(p.x, p.y); assert.equal(await groupTools.isVisible(), false);
      fs.writeFileSync(path.join(output, `${key}-after-member.json`), JSON.stringify(await geometry(page), null, 2));
      // 单选生成节点会自动平移以容纳下方操作区；恢复测试视口再测组名，避免点到屏外。
      await resetCamera(page);
      p = await point(page, 'qaGroup', '[aria-label="组名称"]');
      const titleHit = await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.outerHTML.slice(0, 250), p);
      assert.ok(titleHit?.includes('组名称'), JSON.stringify({ p, titleHit }));
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); assert.equal(await groupTools.isVisible(), true);
      await page.mouse.click(90, 850); assert.equal(await groupTools.isVisible(), false);
    });
    await check(`${key}点击其它节点标题也收起组工具栏`, async () => {
      await page.evaluate(() => selectCanvasNode(qaGroup)); await resetCamera(page);
      const p = await point(page, 'qaB', '.flora-node-label-title'); await page.mouse.click(p.x, p.y);
      assert.equal(await groupTools.isVisible(), false);
      assert.equal(await page.evaluate(() => canvasState.selectedIds.size === 1 && canvasState.selectedIds.has(qaB.dataset.id)), true);
    });
    await check(`${key}仅靠近外侧不显示端口即使节点已选`, async () => {
      await page.evaluate(() => selectCanvasNode(qaB)); await move(page, { x: 15, y: 900 });
      await resetCamera(page);
      const p = await point(page, 'qaGroup', '[data-canvas-port="output"]'); await page.mouse.move(p.x + 20, p.y); await page.waitForTimeout(180);
      assert.deepEqual(await ports(page), []); assert.equal(await page.locator('.is-magnetized').count(), 0);
    });
    await check(`${key}悬停成员只显示成员端口，悬停组空白只显示组端口`, async () => {
      await move(page, await point(page, 'qaB')); await expectOwner(page, 'qaB');
      await page.screenshot({ path: path.join(output, `${key}-hover-member.png`) });
      await move(page, await point(page, 'qaGroup', 'blank')); await expectOwner(page, 'qaGroup');
      await page.screenshot({ path: path.join(output, `${key}-hover-group.png`) });
      const positions = await page.evaluate(() => { const g = qaGroup.getBoundingClientRect(), l = qaGroup.querySelector('[data-canvas-port="input"]').getBoundingClientRect(), r = qaGroup.querySelector('[data-canvas-port="output"]').getBoundingClientRect(); return { l: l.left + l.width / 2, r: r.left + r.width / 2, left: g.left, right: g.right }; });
      assert.ok(positions.l < positions.left && positions.r > positions.right, JSON.stringify(positions));
    });
    for (const name of ['qaA', 'qaB', 'qaGroup']) for (const kind of (name === 'qaA' ? ['output'] : ['input', 'output'])) await check(`${key} ${name} ${kind}从主体到端口保持并磁吸`, async () => {
      await move(page, { x: 15, y: 900 }); await move(page, await point(page, name, name === 'qaGroup' ? 'blank' : 'body'));
      const p = await point(page, name, `[data-canvas-port="${kind}"]`);
      // 先沿组内可见空白到相应边缘，再向外走；不横穿组内成员。
      if (name === 'qaGroup') {
        const edge = await page.evaluate(({ kind }) => { const r = qaGroup.getBoundingClientRect(); return { x: kind === 'input' ? r.left + 2 * canvasState.scale : r.right - 2 * canvasState.scale, y: r.top + 2 * canvasState.scale }; }, { kind });
        await move(page, edge); await move(page, { x: edge.x, y: p.y });
      }
      await move(page, p); await expectOwner(page, name);
      assert.equal(await page.evaluate(({ name, kind }) => window[name].querySelector(`[data-canvas-port="${kind}"]`).classList.contains('is-magnetized'), { name, kind }), true);
      assert.equal(await page.evaluate(({ name, kind }) => window[name].querySelector(`[data-canvas-port="${kind}"]`).hasAttribute('title'), { name, kind }), false);
      await move(page, { x: 15, y: 900 }); assert.deepEqual(await ports(page), []);
    });
    for (const name of ['qaA', 'qaB', 'qaGroup']) for (const kind of (name === 'qaA' ? ['output'] : ['input', 'output'])) await check(`${key} ${name} ${kind}上下斜向离开侧边仍可到达端口`, async () => {
      for (const direction of [-1, 1]) {
        await move(page, { x: 15, y: 900 });
        const route = await page.evaluate(({ name, kind, direction }) => {
          const n = window[name], body = (n.querySelector('.flora-node-content') || n).getBoundingClientRect();
          const p = n.querySelector(`[data-canvas-port="${kind}"]`).getBoundingClientRect();
          const side = kind === 'input' ? -1 : 1, edge = side < 0 ? body.left : body.right;
          const y = p.top + p.height / 2, delta = direction * Math.min(90, body.height * .32);
          return { start: { x: edge - side * 2 * canvasState.scale, y: y + delta }, outside: { x: edge + side * 12, y: y + delta * .65 }, end: { x: p.left + p.width / 2, y } };
        }, { name, kind, direction });
        if (name === 'qaGroup') {
          await move(page, await point(page, name, 'blank'));
          const edge = await page.evaluate(kind => { const r = qaGroup.getBoundingClientRect(); return { x: kind === 'input' ? r.left + 2 * canvasState.scale : r.right - 2 * canvasState.scale, y: r.top + 2 * canvasState.scale }; }, kind);
          await move(page, edge); await move(page, { x: edge.x, y: route.start.y });
        } else await move(page, await point(page, name));
        await move(page, route.start); await expectOwner(page, name);
        await move(page, route.outside); await expectOwner(page, name);
        assert.notEqual(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('.canvas-node')?.dataset.id, route.outside), await page.evaluate(name => window[name].dataset.id, name), '过渡点已经离开节点主体');
        await page.screenshot({ path: path.join(output, `${key}-${name}-${kind}-${direction}-diagonal.png`) });
        await move(page, route.end); await expectOwner(page, name);
        assert.equal(await page.evaluate(({ name, kind }) => window[name].querySelector(`[data-canvas-port="${kind}"]`).classList.contains('is-magnetized'), { name, kind }), true);
      }
    });
    await page.evaluate(() => selectCanvasNode(qaGroup)); await move(page, { x: 15, y: 900 }); await page.screenshot({ path: path.join(output, `${key}-selected-group.png`) });
    if (width === 1440) {
      await check('组输出真实拖线到生成节点且输入吸附', async () => {
        await move(page, await point(page, 'qaGroup', 'blank')); const start = await point(page, 'qaGroup', '[data-canvas-port="output"]');
        const edge = await page.evaluate(() => { const r = qaGroup.getBoundingClientRect(); return { x: r.right - 1, y: r.top + 1 }; });
        await move(page, edge); await move(page, { x: edge.x, y: start.y }); await move(page, start); await page.mouse.down();
        await move(page, await point(page, 'qaTarget')); await expectOwner(page, 'qaTarget');
        const end = await point(page, 'qaTarget', '[data-canvas-port="input"]'); await move(page, end);
        assert.equal(await page.locator('.is-snap-target').count(), 1); await page.screenshot({ path: path.join(output, 'group-snap.png') });
        await page.mouse.up(); await page.waitForTimeout(120);
        assert.equal(await page.evaluate(() => canvasState.connections.filter(c => c.from === qaGroup.dataset.id && c.to === qaTarget.dataset.id).length), 1);
      });
      await check('从组输入反向拖线并可取消', async () => {
        await resetCamera(page);
        await move(page, await point(page, 'qaGroup', 'blank')); const start = await point(page, 'qaGroup', '[data-canvas-port="input"]'); await move(page, start); await page.mouse.down();
        assert.equal(await page.evaluate(() => canvasState.tempConnection?.direction), 'input');
        await move(page, await point(page, 'qaA')); const end = await point(page, 'qaA', '[data-canvas-port="output"]'); await move(page, end);
        await page.keyboard.press('Escape'); await page.mouse.up(); assert.equal(await page.evaluate(() => canvasState.tempConnection), null);
      });
      await check('组输入反向拖到外部图片输出完成连接', async () => {
        await resetCamera(page);
        await move(page, await point(page, 'qaGroup', 'blank')); const start = await point(page, 'qaGroup', '[data-canvas-port="input"]'); await move(page, start); await page.mouse.down();
        assert.equal(await page.evaluate(() => canvasState.tempConnection?.direction), 'input');
        const sourceBody = await point(page, 'qaExtra'); await move(page, sourceBody);
        fs.writeFileSync(path.join(output, 'reverse-body.json'), JSON.stringify(await page.evaluate(p => ({ p, hit: document.elementFromPoint(p.x, p.y)?.outerHTML.slice(0, 600), selected: [...canvasState.selectedIds], hover: document.querySelector('[data-flora-port-hover]')?.dataset.id, temp: canvasState.tempConnection, rect: qaExtra.getBoundingClientRect().toJSON() }), sourceBody), null, 2));
        await page.screenshot({ path: path.join(output, 'reverse-body.png') });
        await expectOwner(page, 'qaExtra');
        const end = await point(page, 'qaExtra', '[data-canvas-port="output"]'); await move(page, end);
        const diagnostic = await page.evaluate(end => ({ end, hit: document.elementFromPoint(end.x, end.y)?.outerHTML.slice(0, 400), compatible: getCanvasConnectionCompatibility(qaExtra, qaGroup, getCanvasNodeOutput(qaExtra)), hover: document.querySelector('[data-flora-port-hover]')?.dataset.id, source: qaExtra.dataset.id, temp: canvasState.tempConnection }), end);
        await page.screenshot({ path: path.join(output, 'reverse-snap.png') });
        assert.equal(await page.locator('.is-snap-target').count(), 1, JSON.stringify(diagnostic)); await page.mouse.up();
        assert.equal(await page.evaluate(() => canvasState.connections.filter(c => c.from === qaExtra.dataset.id && c.to === qaGroup.dataset.id).length), 1);
      });
      await check('键盘端口焦点、组工具栏焦点和全屏状态', async () => {
        await page.evaluate(() => { selectCanvasNode(qaGroup); qaGroup.querySelector('[data-group-tool="color"]').focus(); });
        assert.equal(await groupTools.isVisible(), true); await page.keyboard.press('Enter'); assert.equal(await page.locator('#canvasGroupMenu').isVisible(), true);
        await page.keyboard.press('Escape'); await page.evaluate(() => { closeCanvasGroupMenu(); document.activeElement?.blur(); });
        await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen()); await page.waitForTimeout(100);
        await move(page, await point(page, 'qaGroup', 'blank')); await expectOwner(page, 'qaGroup'); assert.equal(await groupTools.isVisible(), true);
        await page.screenshot({ path: path.join(output, 'fullscreen.png') }); await page.evaluate(() => document.exitFullscreen());
        await page.keyboard.press('Tab'); await page.evaluate(() => qaGroup.querySelector('[data-canvas-port="input"]').focus());
        assert.equal(await page.evaluate(() => getComputedStyle(qaGroup.querySelector('[data-canvas-port="input"]')).visibility), 'visible');
        await page.evaluate(() => document.activeElement?.blur());
      });
    }
  }
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    const result = await new Promise(resolve => { const child = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] }); let text = ''; child.stdout.on('data', d => text += d); child.stderr.on('data', d => text += d); child.on('close', code => resolve({ code, text })); });
    fs.writeFileSync(path.join(output, 'acceptance.log'), result.text); assert.equal(result.code, 0, result.text); checks.push('完整四宽acceptance通过');
  }
  const report = { checks, failures, errors }; fs.writeFileSync(path.join(output, process.env.QA_DEPLOYED === '1' ? 'deployed-report.json' : 'source-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
