const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/crop-proportions-free-20261014');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(runtime, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
function pngChunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(800, 0); header.writeUInt32BE(600, 4); header[8] = 8; header[9] = 2;
const raw = Buffer.alloc(600 * (1 + 800 * 3), 70); for (let y = 0; y < 600; y++) raw[y * (1 + 800 * 3)] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
const stub = { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} };
let browser;
async function main() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(33199, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  const errors = [], geometry = [], checks = [], uploads = [];
  let failUploads = false;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).pathname === '/api/upload-image') {
      if (failUploads) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '切片保存失败，请重试。' }) });
      const data = route.request().postDataBuffer();
      uploads.push({ width: data.readUInt32BE(16), height: data.readUInt32BE(20) });
      await new Promise(r => setTimeout(r, 150));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: 'data:image/png;base64,' + data.toString('base64') }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(stub) });
  });
  await page.route('**/output/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  for (const width of [1440, 390, 768, 1728]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:33199/');
    await page.evaluate(async source => {
      const loaded = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy']);
      if (loaded?.ok === false) throw new Error(JSON.stringify(loaded));
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-grid-input';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface';
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b';
      document.body.append(surface); const view = document.querySelector('#canvasView'); surface.append(view);
      view.style.flex = '1'; view.style.minHeight = '0'; view.style.width = '100%'; view.hidden = false; view.classList.add('active');
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      const node = window.qaGridNode = addCanvasImage(source, '宫格测试.png', { x: 200, y: 140 });
      canvasState.scale = innerWidth < 768 ? .6 : 1;
      canvasState.x = (innerWidth - node.offsetWidth * canvasState.scale) / 2 - Number(node.dataset.x) * canvasState.scale;
      canvasState.y = 240 - Number(node.dataset.y) * canvasState.scale;
      applyCanvasTransformNow(); selectCanvasNode(node);
    }, 'data:image/png;base64,' + png.toString('base64'));
    await page.waitForFunction(() => window.qaGridNode.querySelector('.flora-node-result-area img')?.naturalWidth > 0).catch(async error => {
      console.log(await page.evaluate(() => ({ width: innerWidth, images: [...window.qaGridNode.querySelectorAll('img')].map(i => ({ quality: i.dataset.imageQuality, loaded: i.complete, width: i.naturalWidth })) })));
      throw error;
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => { selectCanvasNode(window.qaGridNode); return openCanvasInlineCrop(window.qaGridNode); });
    const dialog = page.locator('#canvasInlineCrop');
    await dialog.locator('[data-crop-grid-menu]').click(); await dialog.locator('[data-crop-grid="custom"]').click();
    const rows = dialog.locator('[data-crop-custom-rows]'), columns = dialog.locator('[data-crop-custom-columns]');
    await page.screenshot({ path: path.join(output, `${width}-default.png`) });
    await rows.click();
    assert.equal(await rows.evaluate(el => document.activeElement === el), true, '点击行数字应获得焦点，不能被裁剪平移拦截');
    await page.keyboard.press('Control+a'); await page.keyboard.type('4');
    assert.equal(await rows.inputValue(), '4');
    assert.equal(await dialog.locator('.canvas-inline-crop-split.is-row').count(), 3, '输入行4时应即时显示3条横分割线');
    await page.screenshot({ path: path.join(output, `${width}-rows-focus.png`) });
    await columns.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('2');
    assert.equal(await columns.inputValue(), '2');
    assert.equal(await dialog.locator('.canvas-inline-crop-split.is-col').count(), 1);
    await columns.press('ArrowUp'); assert.equal(await columns.inputValue(), '3');
    assert.equal(await dialog.locator('.canvas-inline-crop-split.is-col').count(), 2);
    await columns.press('ArrowDown'); assert.equal(await columns.inputValue(), '2');
    await page.screenshot({ path: path.join(output, `${width}-edited.png`) });
    // A mouse drag over an input must not move the image preview.
    const before = await page.evaluate(() => ({ x: canvasInlineCropState.viewX, y: canvasInlineCropState.viewY, zoom: canvasInlineCropState.zoom }));
    const box = await rows.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2); await page.mouse.up();
    const after = await page.evaluate(() => ({ x: canvasInlineCropState.viewX, y: canvasInlineCropState.viewY, zoom: canvasInlineCropState.zoom }));
    assert.deepEqual(after, before);
    const wheel = await columns.evaluate(el => { const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }); el.dispatchEvent(e); return e.defaultPrevented; });
    assert.equal(wheel, false, '行列控件滚轮不应被图片缩放抢占');
    assert.equal(await page.evaluate(() => canvasInlineCropState.zoom), before.zoom);
    await rows.fill('4'); await columns.fill('2');
    await dialog.locator('[data-crop-custom-confirm]').hover();
    await page.screenshot({ path: path.join(output, `${width}-confirm-hover.png`) });
    geometry.push(await dialog.locator('[data-crop-menu]').evaluate(el => { const r = el.getBoundingClientRect(), stage = document.querySelector('[data-crop-stage]').getBoundingClientRect(); return { width: innerWidth, left: r.left, right: r.right, top: r.top, bottom: r.bottom, stageBottom: stage.bottom }; }));
    await rows.fill('');
    assert.equal(await dialog.locator('[data-crop-custom-confirm]').isDisabled(), true);
    assert.equal(await dialog.locator('.canvas-inline-crop-split.is-row').count(), 3);
    await rows.press('Tab'); assert.equal(await rows.inputValue(), '4');
    await rows.fill('9'); assert.equal(await dialog.locator('[data-crop-custom-confirm]').isDisabled(), true);
    await rows.press('Tab'); assert.equal(await rows.inputValue(), '4');
    const grid = await page.evaluate(() => ({ rows: canvasInlineCropState.rows, columns: canvasInlineCropState.columns, tiles: buildCanvasInlineCropTiles(canvasInlineCropState), count: document.querySelectorAll('[data-crop-split]').length }));
    assert.equal(grid.rows, 4); assert.equal(grid.columns, 2); assert.equal(grid.tiles.length, 8); assert.equal(grid.count, 4);
    assert.ok(grid.tiles.every(tile => tile.width === 400 && tile.height === 150));
    // Verify the image stage still pans and zooms, after controls are excluded.
    const stage = await dialog.locator('[data-crop-stage]').boundingBox();
    const zoom = await page.evaluate(() => canvasInlineCropState.zoom);
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2); await page.mouse.wheel(0, -100); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => canvasInlineCropState.zoom) > zoom);
    await page.evaluate(() => { canvasInlineCropState.rect = { x: .2, y: .2, width: .5, height: .5 }; renderCanvasInlineCropFrame(); });
    const rectBox = await dialog.locator('[data-crop-rect]').boundingBox();
    const stateBefore = await page.evaluate(() => ({ ...canvasInlineCropState.rect }));
    const pointerX = rectBox.x + rectBox.width * .2, pointerY = rectBox.y + rectBox.height * .15;
    await page.mouse.move(pointerX, pointerY); await page.mouse.down();
    await page.mouse.move(pointerX + 15, pointerY + 10); await page.mouse.up();
    const stateAfter = await page.evaluate(() => ({ ...canvasInlineCropState.rect }));
    assert.ok(stateAfter.x > stateBefore.x && stateAfter.y > stateBefore.y, '图片区域仍可拖动裁剪框');
    await page.evaluate(() => { canvasInlineCropState.rect = { x: 0, y: 0, width: 1, height: 1 }; renderCanvasInlineCropFrame(); });
    if (width === 1728) {
      failUploads = true; await dialog.locator('[data-crop-custom-confirm]').click();
      await page.waitForFunction(() => canvasInlineCropState && !canvasInlineCropState.submitting);
      assert.equal(await rows.inputValue(), '4'); assert.equal(await columns.inputValue(), '2');
      assert.equal(await dialog.locator('.canvas-inline-crop-split').count(), 4);
      assert.match(await page.evaluate(() => getCanvasNodeStatusElement(window.qaGridNode).textContent), /切片保存失败/);
      failUploads = false;
    }
    const count = uploads.length;
    await dialog.locator('[data-crop-custom-confirm]').click();
    await dialog.locator('[data-crop-custom-confirm]').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await dialog.waitFor({ state: 'detached', timeout: 15000 });
    assert.equal(uploads.length - count, 8);
    assert.ok(uploads.slice(count).every(p => p.width === 400 && p.height === 150));
    assert.equal(await page.locator('[data-crop-row][data-crop-column]').count(), 8);
    // A deliberately uneven grid must use one scale across every slice.
    await page.evaluate(() => { selectCanvasNode(window.qaGridNode); return openCanvasInlineCrop(window.qaGridNode); });
    await dialog.locator('[data-crop-grid-menu]').click(); await dialog.locator('[data-crop-grid="2x2"]').click();
    const split = await dialog.locator('.canvas-inline-crop-split.is-row').boundingBox();
    const viewBox = await dialog.locator('[data-crop-view]').boundingBox();
    await page.mouse.move(split.x + viewBox.width * .25, split.y + split.height / 2); await page.mouse.down();
    await page.mouse.move(split.x + viewBox.width * .25, viewBox.y + viewBox.height * .8); await page.mouse.up();
    const uneven = await page.evaluate(() => ({ crops: buildCanvasInlineCropTiles(canvasInlineCropState), ids: [...document.querySelectorAll('#canvasPlane .canvas-node')].map(n => n.dataset.id) }));
    assert.ok(uneven.crops[0].height > uneven.crops[2].height * 3);
    await dialog.locator('[data-crop-confirm]').click(); await dialog.waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForTimeout(200);
    const tiles = await page.evaluate(ids => [...document.querySelectorAll('[data-crop-row][data-crop-column]')].filter(n => !ids.includes(n.dataset.id)).map(n => ({ id: n.dataset.id, row: Number(n.dataset.cropRow), column: Number(n.dataset.cropColumn), width: Number(n.dataset.width), height: Number(n.dataset.height), x: Number(n.dataset.x), y: Number(n.dataset.y), saved: serializeCanvasNode(n) })), uneven.ids);
    assert.equal(tiles.length, 4);
    const scales = tiles.map(t => { const crop = uneven.crops.find(c => c.row === t.row && c.column === t.column); return [t.width / crop.width, t.height / crop.height]; }).flat();
    assert.ok(scales.every(s => Math.abs(s - scales[0]) < .005), `切片应共用缩放比例，实际${scales}`);
    const first = tiles.find(t => t.row === 1 && t.column === 1), lower = tiles.find(t => t.row === 2 && t.column === 1);
    assert.ok(Math.abs(first.width - lower.width) < 1);
    assert.ok(first.height > lower.height * 3);
    const camera = await page.evaluate(ids => {
      const previous = { scale: canvasState.scale, x: canvasState.x, y: canvasState.y };
      const nodes = ids.map(getCanvasNode);
      const left = Math.min(...nodes.map(n => Number(n.dataset.x))), top = Math.min(...nodes.map(n => Number(n.dataset.y)));
      const right = Math.max(...nodes.map(n => Number(n.dataset.x) + Number(n.dataset.width))), bottom = Math.max(...nodes.map(n => Number(n.dataset.y) + Number(n.dataset.height) + 48));
      canvasState.scale = Math.min(1, (innerWidth - 80) / (right - left + 72), (innerHeight - 200) / (bottom - top + 96));
      canvasState.x = innerWidth / 2 - (left + right) / 2 * canvasState.scale;
      canvasState.y = innerHeight / 2 - (top + bottom) / 2 * canvasState.scale;
      // Hide unrelated test results for the visual comparison only.
      document.querySelectorAll('#canvasPlane .canvas-node').forEach(n => { if (!ids.includes(n.dataset.id) && !n.classList.contains('canvas-node-group')) n.style.visibility = 'hidden'; });
      applyCanvasTransformNow(); return previous;
    }, tiles.map(t => t.id));
    await page.screenshot({ path: path.join(output, `${width}-uneven-group.png`) });
    await page.evaluate(previous => { document.querySelectorAll('#canvasPlane .canvas-node').forEach(n => n.style.visibility = ''); Object.assign(canvasState, previous); selectCanvasNode(window.qaGridNode); applyCanvasTransformNow(); }, camera);
    for (const tile of tiles) {
      const restored = await page.evaluate(saved => {
        const node = restoreCanvasBoardNode({ ...saved, id: 'restored-' + saved.id }, { id: canvasState.activeBoardId }, { maxId: 0 });
        window.qaRestored = node; return Boolean(node);
      }, tile.saved);
      assert.equal(restored, true);
      await page.waitForTimeout(100);
      const restoredSize = await page.evaluate(() => { const n = window.qaRestored; applyCanvasAdaptiveMediaSize(n, 640, 120); return { width: Number(n.dataset.width), height: Number(n.dataset.height) }; });
      assert.ok(Math.abs(restoredSize.width - tile.width) < 1 && Math.abs(restoredSize.height - tile.height) < 1);
    }
    const copiedSize = await page.evaluate(saved => {
      const ids = new Set([...document.querySelectorAll('#canvasPlane .canvas-node')].map(n => n.dataset.id));
      canvasState.clipboard = { nodes: [saved], connections: [], pasteCount: 0 };
      pasteCanvasNodes({ preventDefault() {} });
      const copied = [...document.querySelectorAll('#canvasPlane .canvas-node')].find(n => !ids.has(n.dataset.id));
      applyCanvasNodeSize(copied);
      return { width: Number(copied.dataset.width), height: Number(copied.dataset.height), mode: copied.dataset.mediaSizeMode };
    }, first.saved);
    assert.equal(copiedSize.mode, 'manual');
    assert.ok(Math.abs(copiedSize.width - first.width) < 1 && Math.abs(copiedSize.height - first.height) < 1);
    await page.evaluate(() => { selectCanvasNode(window.qaGridNode); return openCanvasInlineCrop(window.qaGridNode); });
    await dialog.locator('[data-crop-free]').click();
    const free = await page.evaluate(() => ({ ...canvasInlineCropPixels(canvasInlineCropState) }));
    assert.equal(free.width, free.height);
    const right = await dialog.locator('[data-crop-line="right"]').boundingBox();
    await page.mouse.move(right.x + right.width / 2, right.y + right.height * .35); await page.mouse.down();
    await page.mouse.move(right.x + right.width / 2 - 30, right.y + right.height * .35); await page.mouse.up();
    const resized = await page.evaluate(() => canvasInlineCropPixels(canvasInlineCropState));
    assert.ok(resized.width < free.width); assert.equal(resized.height, free.height);
    const bottomLine = await dialog.locator('[data-crop-line="bottom"]').boundingBox();
    await page.mouse.move(bottomLine.x + bottomLine.width * .3, bottomLine.y + bottomLine.height / 2); await page.mouse.down();
    await page.mouse.move(bottomLine.x + bottomLine.width * .3, bottomLine.y + bottomLine.height / 2 - 20); await page.mouse.up();
    const shorter = await page.evaluate(() => canvasInlineCropPixels(canvasInlineCropState));
    assert.equal(shorter.width, resized.width); assert.ok(shorter.height < resized.height);
    const moveBox = await dialog.locator('[data-crop-rect]').boundingBox();
    await page.mouse.move(moveBox.x + moveBox.width * .4, moveBox.y + moveBox.height * .4); await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width * .4 + 10, moveBox.y + moveBox.height * .4 + 5); await page.mouse.up();
    const moved = await page.evaluate(() => canvasInlineCropPixels(canvasInlineCropState));
    assert.ok(moved.x > shorter.x && moved.y > shorter.y); assert.equal(moved.width, shorter.width); assert.equal(moved.height, shorter.height);
    assert.equal(await dialog.locator('[data-crop-split]').count(), 0);
    await page.screenshot({ path: path.join(output, `${width}-free-resized.png`) });
    const freeUploads = uploads.length;
    await dialog.locator('[data-crop-confirm]').click(); await dialog.waitFor({ state: 'detached', timeout: 15000 });
    assert.equal(uploads.length - freeUploads, 1);
    assert.equal(uploads.at(-1).width, moved.width); assert.equal(uploads.at(-1).height, moved.height);
    checks.push(`${width}：行列实时更新分线、不遮图、非法输入保护、一次确认保存8片、防重复、拖动缩放保留`);
    checks.push(`${width}：不等分线共用显示比例、恢复不放大；自由裁剪默认正方形、解锁拉伸并实际导出单图`);
  }
  assert.deepEqual(errors, []); assert.ok(geometry.every(g => g.left >= -2 && g.right <= g.width + 2 && g.top >= g.stageBottom));
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    for (const file of ['canvas-inline-crop-chrome-regression.cjs', 'acceptance.cjs']) {
      const result = await new Promise(resolve => {
        const child = spawn(process.execPath, [file], { cwd: __dirname, env: { ...process.env, CROP_CHROME_INLINE_SOURCE: '1', AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] });
        let text = ''; child.stdout.on('data', d => text += d); child.stderr.on('data', d => text += d);
        child.on('close', code => resolve({ code, text }));
      });
      fs.writeFileSync(path.join(output, `${file}.log`), result.text); assert.equal(result.code, 0, result.text); checks.push(`${file}通过`);
    }
  }
  const report = { errors, geometry, checks, boundary: '独立33199静态测试服务，模拟API/图片，真实运行时DOM事件；未操作用户画布或停止3199，未进行真实账户/供应商业务验收。' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
