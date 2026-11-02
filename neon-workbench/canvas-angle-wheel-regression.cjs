const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, process.env.QA_OUTPUT_DIR || '../.design/angle-wheel-20261015');
fs.mkdirSync(output, { recursive: true });
const overrides = { 'script.js': 'script-before-save-bridge.js', 'flora-node-shell.css': 'flora-node-shell.css' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
  const source = process.env.QA_DEPLOYED !== '1' && overrides[name];
  const file = source ? path.join(__dirname, process.env.QA_ANGLE_SOURCE || 'design-sources', source) : path.resolve(runtime, name || 'index.html');
  if (!source && !file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    let body = fs.readFileSync(file);
    if (name === 'script.js' && source) body = Buffer.from(body.toString() + '\n' + fs.readFileSync(path.join(__dirname, 'design-sources/canvas-asset-entry.js'), 'utf8'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
const checks = [], errors = [], submissions = [];
let browser;
async function state(page) {
  await page.locator('.canvas-angle-cube').evaluate(async cube => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(cube.getAnimations().map(a => a.finished.catch(() => {})));
  });
  return page.evaluate(() => {
    const d = getCanvasAngleDialog(), cube = d.querySelector('.canvas-angle-cube');
    const r = cube.getBoundingClientRect(), stage = d.querySelector('.canvas-angle-stage').getBoundingClientRect();
    const faces = [...cube.querySelectorAll('.canvas-angle-face')].map(f => f.getBoundingClientRect());
    return { angle: getCanvasComfyQwenAngle(qaAngleNode), slider: Number(d.querySelector('[data-angle-zoom]').value), width: r.width, height: r.height,
      hint: d.querySelector('[data-angle-zoom-value]').textContent, transform: getComputedStyle(cube).transform, zoomStyle: cube.style.getPropertyValue('--canvas-angle-zoom'), camera: [canvasState.scale, canvasState.x, canvasState.y],
      scroll: [scrollX, scrollY, d.querySelector('.canvas-angle-dialog-body').scrollTop],
      stage: stage.toJSON(), faces: faces.map(f => f.toJSON()),
      fits: faces.every(f => f.left >= stage.left - 1 && f.right <= stage.right + 1 && f.top >= stage.top - 1 && f.bottom <= stage.bottom + 1) };
  });
}
async function wheel(page, deltaY, blank = false) {
  const p = await page.evaluate(blank => {
    const r = getCanvasAngleDialog().querySelector(blank ? '.canvas-angle-stage' : '.canvas-angle-cube').getBoundingClientRect();
    return blank ? { x: r.left + 12, y: r.top + 12 } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, blank);
  await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, deltaY); await page.waitForTimeout(190);
}
async function child(file, log) {
  const result = await new Promise(resolve => {
    const p = spawn(process.execPath, [file], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; p.stdout.on('data', d => text += d); p.stderr.on('data', d => text += d); p.on('close', code => resolve({ code, text }));
  });
  fs.writeFileSync(path.join(output, log), result.text); assert.equal(result.code, 0, result.text); checks.push(file);
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
  await page.route('**/api/upload-image', r => r.fulfill({ json: { url: '/output/qa-angle-input.png' } }));
  await page.route('**/api/qwen-edit-angle', r => { submissions.push(r.request().postDataJSON()); return r.fulfill({ status: 400, json: { error: '模拟提交验证结束' } }); });
  for (const [width, scale] of (process.env.QA_QUICK ? [[1440, .85]] : [[390, .3], [768, .65], [1440, .85], [1728, 1]])) {
    const key = `${width}-${scale}`;
    await page.setViewportSize({ width, height: 1200 }); await page.goto('http://127.0.0.1:33199/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async scale => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy']); await loadCanvasBoards(); canvasState.activeBoardId = 'qa-angle-wheel';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'; document.body.append(surface);
      const view = document.querySelector('#canvasView'); surface.append(view); view.style.cssText = 'flex:1;min-height:0;width:100%'; view.hidden = false; view.classList.add('active'); document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const ctx = c.getContext('2d'); ctx.fillStyle = '#755b40'; ctx.fillRect(0, 0, 600, 400);
      window.qaAngleNode = addCanvasImage(c.toDataURL(), '景别缩放测试.png', { x: 160, y: 160 });
      canvasState.scale = scale; canvasState.x = innerWidth / 2 - 360 * scale; canvasState.y = 100 - 160 * scale; applyCanvasTransformNow(); selectCanvasNode(qaAngleNode);
      setCanvasComfyQwenAngle(qaAngleNode, { horizontal: -46, vertical: 32, zoom: 5 }); openCanvasAngleDialog(qaAngleNode);
    }, scale);
    await page.waitForTimeout(250); const initial = await state(page);
    await wheel(page, -120); const closer = await state(page);
    fs.writeFileSync(path.join(output, `${key}-wheel.json`), JSON.stringify({ initial, closer }, null, 2));
    assert.ok(closer.slider > initial.slider, `${key}滚轮向上时右侧滑条应右移`);
    assert.ok(closer.width > initial.width * 1.01, `${key}滚轮向上时方块应放大：${initial.width} -> ${closer.width}`);
    assert.equal(closer.angle.zoom, closer.slider); assert.equal(closer.angle.horizontal, -46); assert.equal(closer.angle.vertical, 32);
    assert.deepEqual(closer.camera, initial.camera); assert.deepEqual(closer.scroll, initial.scroll); checks.push(`${key}滚轮拉近同步方块和滑条且不影响角度或画布`);
    await wheel(page, 120, true); const farther = await state(page);
    assert.ok(farther.slider < closer.slider); assert.ok(farther.width < closer.width); checks.push(`${key}预览空白处滚轮拉远同步`);
    const slider = page.locator('[data-angle-zoom]'); await slider.focus(); await page.keyboard.press('Home'); await page.waitForTimeout(180); const far = await state(page);
    assert.equal(far.slider, 0); assert.equal(far.angle.zoom, 0); assert.equal(far.hint, '远景'); await page.screenshot({ path: path.join(output, `${key}-far.png`) });
    await page.keyboard.press('End'); await page.waitForTimeout(180); const near = await state(page);
    fs.writeFileSync(path.join(output, `${key}-near.json`), JSON.stringify(near, null, 2));
    await page.screenshot({ path: path.join(output, `${key}-near.png`) });
    assert.equal(near.slider, 10); assert.equal(near.angle.zoom, 10); assert.equal(near.hint, '近景'); assert.ok(near.width > far.width + 5); assert.ok(near.fits, `${key}最大景别方块应保持在左侧预览区内`);
    checks.push(`${key}滑条键盘双向联动并保持预览边界`);
    await wheel(page, -24000, true); assert.equal((await state(page)).slider, 10);
    await wheel(page, 24000, true); assert.equal((await state(page)).slider, 0);
    await wheel(page, -24, true); assert.equal((await state(page)).slider, .1); checks.push(`${key}滚轮上下限截断且反向立即响应`);
    await page.evaluate(() => { resetCanvasAngleDialog(); }); await page.waitForTimeout(160);
    const reset = await state(page); assert.deepEqual(reset.angle, { horizontal: 0, vertical: 0, zoom: 5 }); assert.equal(reset.slider, 5); assert.equal(reset.hint, '中景'); checks.push(`${key}重置同步`);
    if (width === 1440) {
      await wheel(page, 0, true);
      for (let i = 0; i < 24; i++) await page.mouse.wheel(0, -1);
      assert.equal((await state(page)).slider, 5.1); checks.push('细粒度触控板滚动累积后同步');
      await page.evaluate(() => { resetCanvasAngleDialog(); getCanvasAngleDialog().querySelector('.canvas-angle-stage').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 1, deltaY: -3 })); });
      assert.equal((await state(page)).slider, 5.2);
      await page.evaluate(() => getCanvasAngleDialog().querySelector('.canvas-angle-stage').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 2, deltaY: -1 })));
      assert.ok((await state(page)).slider > 5.2); checks.push('行和页单位滚轮归一化');
      await page.evaluate(() => resetCanvasAngleDialog());
    }
    await wheel(page, -240, true); const saved = await state(page);
    await page.evaluate(() => { closeCanvasAngleDialog(); openCanvasAngleDialog(qaAngleNode); }); await page.waitForTimeout(160);
    const reopened = await state(page); assert.equal(reopened.slider, saved.slider); assert.equal(reopened.angle.zoom, saved.slider); assert.ok(Math.abs(reopened.width - saved.width) < 1); checks.push(`${key}重新打开保留同一缩放值`);
    await page.evaluate(() => { getCanvasAngleDialog().querySelector('[data-angle-horizontal]').value = '-46'; getCanvasAngleDialog().querySelector('[data-angle-vertical]').value = '32'; renderCanvasAngleDialog(); });
    const beforeDrag = await state(page); const box = await page.locator('.canvas-angle-cube').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2 + 24, { steps: 5 }); await page.mouse.up();
    const afterDrag = await state(page); assert.notEqual(afterDrag.angle.horizontal, beforeDrag.angle.horizontal); assert.notEqual(afterDrag.angle.vertical, beforeDrag.angle.vertical); assert.equal(afterDrag.slider, beforeDrag.slider); checks.push(`${key}缩放后仍可拖动换角度`);
    if (width === 1440) {
      await page.evaluate(() => document.querySelector('#canvasEditorScreen').requestFullscreen()); await wheel(page, -120, true); assert.ok((await state(page)).slider > afterDrag.slider); await page.screenshot({ path: path.join(output, 'fullscreen.png') }); await page.evaluate(() => document.exitFullscreen()); checks.push('全屏滚轮同步');
      const submittedZoom = (await state(page)).slider; await page.evaluate(() => submitCanvasAngleDialog()); await page.waitForTimeout(120); assert.equal(submissions.at(-1)?.zoom, submittedZoom); checks.push('提交沿用当前景别参数');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false);
    await page.evaluate(() => closeCanvasAngleDialog());
  }
  assert.deepEqual(errors, []);
  if (process.env.QA_RUN_COMPAT === '1') await child('canvas-angle-panel-regression.cjs', 'angle-panel.log');
  if (process.env.RUN_FULL_ACCEPTANCE === '1') await child('acceptance.cjs', 'acceptance.log');
  const report = { checks, errors, submissions: submissions.map(({ horizontal_angle, vertical_angle, zoom }) => ({ horizontal_angle, vertical_angle, zoom })) }; fs.writeFileSync(path.join(output, process.env.QA_DEPLOYED === '1' ? 'deployed-report.json' : 'source-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
