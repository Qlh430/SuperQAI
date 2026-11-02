const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const overrides = { 'script.js': 'script-before-save-bridge.js', 'flora-node-shell.css': 'flora-node-shell.css', 'neon-canvas-surface.css': 'neon-canvas-surface.css', 'flora-connection-interaction.js': 'flora-connection-interaction.js' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  const override = overrides[name];
  const file = override ? path.join(__dirname, 'design-sources', override) : path.resolve(runtime, name || 'index.html');
  if (!override && !file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(r => server.listen(33201, '127.0.0.1', r));
  const { spawn } = require('node:child_process');
  const chromeProc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--no-first-run', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=' + path.join(require('node:os').tmpdir(), 'qa-chrome-geometry-2')], { stdio: 'ignore' });
  let cdpUrl = '';
  for (let i = 0; i < 50 && !cdpUrl; i++) { await new Promise(r => setTimeout(r, 200)); try { cdpUrl = (await (await fetch('http://127.0.0.1:9333/json/version')).json()).webSocketDebuggerUrl; } catch {} }
  if (!cdpUrl) throw new Error('CDP not reachable');
  console.log('cdp ok', cdpUrl);
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} } }));
  await page.goto('http://127.0.0.1:33201/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']);
    await loadCanvasBoards();
    canvasState.activeBoardId = 'qa-chrome-boundary';
    const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'; document.body.append(surface);
    const view = document.querySelector('#canvasView'); surface.append(view); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%';
    document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
    window.qa = addCanvasImageGeneratorNode({ x: 200, y: 120 }, { focus: false });
    canvasState.scale = 0.3; applyCanvasTransformNow();
  });
  await page.waitForTimeout(300);
  const data = await page.evaluate(() => {
    const node = window.qa;
    const rects = {};
    const read = (name, el) => { if (!el) { rects[name] = null; return; } const r = el.getBoundingClientRect(); const n = node.getBoundingClientRect(); rects[name] = { top: +(r.top - n.top).toFixed(1), bottom: +(r.bottom - n.top).toFixed(1), left: +(r.left - n.left).toFixed(1), right: +(r.right - n.left).toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) }; };
    read('node', node);
    read('labelTitle', node.querySelector('.flora-node-label-title'));
    read('tag', node.querySelector('.flora-tag-trigger'));
    read('content', node.querySelector('.flora-node-content'));
    read('inputPort', node.querySelector('.canvas-port-input'));
    read('outputPort', node.querySelector('.canvas-port-output'));
    selectCanvasNode(node);
    read('toolbar', node.querySelector('.flora-node-toolbar'));
    read('label', node.querySelector('.flora-node-label'));
    return { scale: canvasState.scale, inverse: getComputedStyle(node.querySelector('.canvas-port-input')).getPropertyValue('--collab-inverse-scale'), rects };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close(); chromeProc.kill(); server.close();
})().catch(e => { console.error(e); process.exit(1); });











