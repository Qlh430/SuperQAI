const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = __dirname;
const runtime = path.resolve(root, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  let file = path.resolve(runtime, name || 'index.html');
  if (name === 'script.js') file = path.join(root, 'design-sources/script-before-save-bridge.js');
  if (name === 'flora-node-shell.js') file = path.join(root, 'design-sources/flora-node-shell.js');
  if (name === 'flora-node-shell.css') file = path.join(root, 'design-sources/flora-node-shell.css');
  if (name === 'neon-canvas-surface.css') file = path.join(root, 'design-sources/neon-canvas-surface.css');
  try {
    let body = fs.readFileSync(file);
    if (name === 'script.js' && file.includes('design-sources')) body = Buffer.from(body.toString() + '\n' + fs.readFileSync(path.join(root, 'design-sources/canvas-asset-entry.js'), 'utf8'));
    res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

const square = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#b43c3c"/><circle cx="300" cy="300" r="210" fill="#e9b21e"/></svg>';

(async () => {
  await new Promise(resolve => server.listen(33197, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} }) }));
    await page.route('**/output/qa-square.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: square }));
    await page.goto('http://127.0.0.1:33197/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api', 'canvas-node-text']);
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-generator-resize';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e';
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'; document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      window.qaNode = addCanvasImageGeneratorNode({ x: 100, y: 100 }, { focus: false, engine: 'comfyui' });
      selectCanvasNode(qaNode);
      commitCanvasImageJobResult(qaNode, { id: 'qa-square-result', boardId: canvasState.activeBoardId, nodeId: qaNode.dataset.id, result: { data: [{ url: '/output/qa-square.svg', width: 600, height: 600 }] } }, '正方形测试');
    });
    await page.waitForFunction(() => qaNode?.querySelector('.canvas-node-result img')?.naturalWidth > 0);
    await page.evaluate(() => {
      qaNode.dataset.mediaSizeMode = 'manual'; qaNode.dataset.width = '600'; qaNode.dataset.height = '900';
      qaNode.style.setProperty('--flora-node-width', '600px'); qaNode.style.setProperty('--flora-node-height', '900px');
      applyCanvasNodeSize(qaNode); window.CanvasFloraNodeShell.syncImagePreview(qaNode, true);
    });
    const corrected = await page.evaluate(() => ({ width: Number(qaNode.dataset.width), height: Number(qaNode.dataset.height), shell: qaNode.querySelector('.flora-node-shell').getBoundingClientRect().toJSON(), image: qaNode.querySelector('.canvas-node-result img').getBoundingClientRect().toJSON() }));
    assert.ok(Math.abs(corrected.width / corrected.height - 1) < .01, JSON.stringify(corrected));
    assert.ok(Math.abs(corrected.shell.width / corrected.shell.height - 1) < .01, JSON.stringify(corrected));
    assert.ok(Math.abs(corrected.image.width / corrected.image.height - 1) < .01, JSON.stringify(corrected));
    const handle = page.locator('.canvas-resize-handle');
    await handle.evaluate(el => { el.style.display = 'block'; el.style.pointerEvents = 'auto'; });
    const box = await handle.boundingBox(); assert.ok(box, '生成节点右下角缩放点可见');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 20, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(60);
    const resized = await page.evaluate(() => ({ width: Number(qaNode.dataset.width), height: Number(qaNode.dataset.height), shell: qaNode.querySelector('.flora-node-shell').getBoundingClientRect().toJSON(), image: qaNode.querySelector('.canvas-node-result img').getBoundingClientRect().toJSON() }));
    assert.ok(Math.abs(resized.width / resized.height - 1) < .01, JSON.stringify(resized));
    assert.ok(Math.abs(resized.image.width / resized.image.height - 1) < .01, JSON.stringify(resized));
    console.log(JSON.stringify({ ok: true, corrected, resized }));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
