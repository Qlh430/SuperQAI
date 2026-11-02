const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, process.env.QA_OUTPUT_DIR || '../.design/upscale-dock-20261015'); fs.mkdirSync(output, { recursive: true });
const overrides = { 'script.js': 'script-before-save-bridge.js', 'flora-node-shell.css': 'flora-node-shell.css' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
  const source = process.env.QA_DEPLOYED !== '1' && overrides[name];
  const file = source ? path.join(__dirname, 'design-sources', source) : path.resolve(runtime, name || 'index.html');
  if (!source && !file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    let body = fs.readFileSync(file);
    if (name === 'script.js' && source) body = Buffer.from(body.toString() + '\n' + fs.readFileSync(path.join(__dirname, 'design-sources/canvas-asset-entry.js'), 'utf8'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream'); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
let browser;
const checks = [], errors = [];
async function geometry(page) {
  return page.evaluate(() => {
    const panel = qaNode.querySelector('.flora-node-tool-panel'), p = panel.getBoundingClientRect(), n = qaNode.getBoundingClientRect(), v = document.querySelector('#infiniteCanvas').getBoundingClientRect();
    return { gap: p.top - n.bottom, panel: p.toJSON(), viewport: v.toJSON(), body: (qaNode.querySelector('.flora-node-content') || qaNode).getBoundingClientRect().toJSON(), camera: [canvasState.x, canvasState.y, canvasState.scale], composer: qaNode.querySelector('.flora-generator-composer') ? getComputedStyle(qaNode.querySelector('.flora-generator-composer')).display : null };
  });
}
function assertDock(g, label) {
  assert.ok(Math.abs(g.gap - 12) < 1.5, `${label}超清面板应位于节点下方12px，实际间距${g.gap}`);
  assert.ok(g.panel.left >= g.viewport.left + 10 && g.panel.right <= g.viewport.right - 10, `${label}面板横向完整可见`);
  assert.ok(g.panel.top >= g.viewport.top && g.panel.bottom <= g.viewport.bottom - 10, `${label}面板纵向完整可见`);
}
async function main() {
  await new Promise(resolve => server.listen(33199, '127.0.0.1', resolve)); fs.writeFileSync(path.join(output, 'test.pid'), String(process.pid));
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
  // Full-path compatibility only. Never set this in DOM/performance benchmarks.
  if (process.env.QA_COMPAT_FULL === '1') await page.addInitScript(() => {
    window.NeonCanvasPerformanceFlags = { ...(window.NeonCanvasPerformanceFlags || {}), representationManager: false, detailHydration: false, detailCulling: false };
  });
  await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} } }));
  await page.route('**/api/canvas/boards/*/viewport*', r => r.fulfill({ json: { state: 'migrating' } }));
  for (const [width, scale] of (process.env.QA_QUICK ? [[1440, .85]] : [[390, .3], [768, .6], [1440, .85], [1728, 1], [1440, 1.6], [390, 1.2]])) {
    for (const kind of ['asset', 'generator']) {
      const key = `${width}-${scale}-${kind}`;
      await page.setViewportSize({ width, height: 1000 }); await page.goto('http://127.0.0.1:33199/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(async ({ scale, kind }) => {
        await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy']); await loadCanvasBoards(); canvasState.activeBoardId = 'qa-upscale-dock';
        const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'; document.body.append(surface);
        const view = document.querySelector('#canvasView'); surface.append(view); view.style.cssText = 'flex:1;min-height:0;width:100%'; view.hidden = false; view.classList.add('active'); document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
        const c = document.createElement('canvas'); c.width = 600; c.height = 400; const ctx = c.getContext('2d'); ctx.fillStyle = '#755b40'; ctx.fillRect(0, 0, 600, 400); const src = c.toDataURL();
        window.qaNode = kind === 'asset' ? addCanvasImage(src, '超清素材.png', { x: 160, y: 160 }) : createCanvasImageToolResultNode(null, { src, name: '超清生成图.png' }, { point: { x: 160, y: 160 }, connectSource: false });
        window.qaOther = addCanvasImage(src, '其它节点.png', { x: 1000, y: 160 });
        canvasState.scale = scale; canvasState.x = innerWidth / 2 - 360 * scale; canvasState.y = 100 - 160 * scale; applyCanvasTransformNow(); selectCanvasNode(qaNode); openCanvasImageToolPanel(qaNode, 'upscale');
      }, { scale, kind }); await page.waitForTimeout(180);
      assertDock(await geometry(page), key); if (kind === 'generator') assert.equal((await geometry(page)).composer, 'none', '超清操作时生成操作区应让位'); checks.push(`${key}超清操作区在节点下方且完整可见`);
      assert.equal(await page.evaluate(() => { const p = qaNode.querySelector('.flora-node-tool-panel'); return p.scrollWidth > p.clientWidth; }), false, '参数和按钮不应撑出操作区');
      const panel = page.locator('.flora-node-tool-panel'); await panel.locator('strong').click(); await panel.locator('select').selectOption('4096');
      assert.equal(await panel.count(), 1); assert.equal(await page.evaluate(() => qaNode.dataset.comfyResolution), '4096');
      await panel.locator('select').focus(); await page.screenshot({ path: path.join(output, `${key}-focus.png`) }); await panel.locator('[data-flora-tool-submit]').hover(); await page.screenshot({ path: path.join(output, `${key}-hover.png`) }); checks.push(`${key}面板可点选且4K参数保留`);
      await page.evaluate(() => { canvasState.y += 110; canvasState.scale *= .9; applyCanvasTransformNow(); }); await page.waitForTimeout(100);
      const moved = await geometry(page); assert.ok(Math.abs(moved.gap - 12) < 1.5, `${key}缩放和平移保持下方间距`);
      for (const edge of ['left', 'right']) {
        await page.evaluate(edge => { const n = qaNode.getBoundingClientRect(), v = document.querySelector('#infiniteCanvas').getBoundingClientRect(); canvasState.x += (edge === 'left' ? v.left + 8 : v.right - 8) - (n.left + n.width / 2); applyCanvasTransformNow(); }, edge);
        const g = await geometry(page); assert.ok(g.panel.left >= g.viewport.left + 10 && g.panel.right <= g.viewport.right - 10, `${key}靠近${edge}边界面板完整可见`);
      }
      await page.evaluate(() => {
        const n = qaNode.getBoundingClientRect(), v = document.querySelector('#infiniteCanvas').getBoundingClientRect(); canvasState.y += v.bottom - 40 - n.bottom; applyCanvasTransformNow(); closeCanvasImageToolInteractions(); openCanvasImageToolPanel(qaNode, 'upscale');
      }); await page.waitForTimeout(120); assertDock(await geometry(page), `${key}贴底节点`); checks.push(`${key}画布平移缩放跟随且贴底打开自动腾出空间`);
      await page.setViewportSize({ width, height: 700 }); await page.waitForTimeout(140); assertDock(await geometry(page), `${key}窗口变矮`); checks.push(`${key}窗口缩小重新定位`);
      await panel.locator('.flora-node-tool-panel-cancel').click(); assert.equal(await panel.count(), 0);
      if (kind === 'generator') assert.notEqual(await page.evaluate(() => getComputedStyle(qaNode.querySelector('.flora-generator-composer')).display), 'none');
      await page.evaluate(() => openCanvasImageToolPanel(qaNode, 'upscale')); await page.keyboard.press('Escape'); assert.equal(await panel.count(), 0);
      await page.evaluate(() => { openCanvasImageToolPanel(qaNode, 'upscale'); selectCanvasNode(qaOther); }); assert.equal(await panel.count(), 0); checks.push(`${key}取消切换和Escape关闭且恢复原操作区`);
      const blank = await page.evaluate(() => { selectCanvasNode(qaNode); openCanvasImageToolPanel(qaNode, 'upscale'); const v = document.querySelector('#infiniteCanvas').getBoundingClientRect(); return { x: v.left + 2, y: v.bottom - 2 }; }); await page.mouse.click(blank.x, blank.y); assert.equal(await panel.count(), 0, '点击画布空白收起');
      if (width === 1440 && scale === .85 && kind === 'asset') {
        await page.evaluate(() => { selectCanvasNode(qaNode); openCanvasImageToolPanel(qaNode, 'upscale'); document.querySelector('#neonEngineSurface').requestFullscreen(); }); await page.waitForTimeout(160); assertDock(await geometry(page), '全屏');
        await page.screenshot({ path: path.join(output, 'fullscreen.png') }); await page.evaluate(() => document.exitFullscreen()); checks.push('全屏保持节点下方定位');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.evaluate(() => closeCanvasImageToolInteractions());
    }
  }
  assert.deepEqual(errors, []); const report = { checks, errors }; fs.writeFileSync(path.join(output, process.env.QA_DEPLOYED === '1' ? 'deployed-report.json' : 'source-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
