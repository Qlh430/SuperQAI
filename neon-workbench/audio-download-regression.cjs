const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// Static files only: never starts a business service or opens a user database.
function startServer() {
  const root = path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"authenticated":false}'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(33199, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const server = await startServer();
  if (process.argv.includes('--serve')) { console.log(`Static fixture PID=${process.pid} http://127.0.0.1:33199`); return; }
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
    const errors = [], downloads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', item => downloads.push(item));
    // Real browser downloads of deterministic synthetic WAV files.
    const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    const dataUrl = `data:audio/wav;base64,${wav.toString('base64')}`;
    await page.route('**/api/**', route => {
      const url = route.request().url();
      if (url.includes('/audio-models')) return route.fulfill({ json: { models: [{ id: 'qa-ace', modelId: 'ace-step', providerId: 'local-comfyui', displayName: 'ACE-Step', capabilities: ['audio.generate'], modelProtocol: 'comfyui' }] } });
      if (url.includes('/generate-audio')) return route.fulfill({ json: { audio: { url: dataUrl, name: '测试音乐', contentType: 'audio/wav' } } });
      if (url.includes('/assets/resolve')) return route.fulfill({ json: { asset: { downloadName: '历史音频.wav' } } });
      return route.fulfill({ json: { authenticated: false, boards: [], projects: [], models: [], providers: [], records: [], preferences: {}, settings: {} } });
    });
    await page.route('**/output/qa-history.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
    if (process.env.AUDIO_DOWNLOAD_SOURCE) await page.route('**/script.js*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8') }));
    await page.goto('http://127.0.0.1:33199/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-asset-collection']);
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-audio-download';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'; document.body.append(surface);
      const view = document.querySelector('#canvasView'); surface.append(view); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'; document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      window.qaAudio = addCanvasAudioGeneratorNode({ x: 100, y: 150 }); qaAudio.dataset.qaDownload = 'true'; canvasState.x = 420; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaAudio);
    });
    const node = () => page.locator('[data-qa-download="true"]');
    await node().locator('option[value="qa-ace"]').waitFor({ state: 'attached' });
    await node().locator('.canvas-audio-generator-model').selectOption('qa-ace');
    await node().locator('.canvas-audio-generator-prompt').fill('测试钢琴');
    await node().locator('.canvas-audio-generator-lyrics').fill('测试歌词');
    await node().locator('.canvas-audio-generator-run').click();
    await page.waitForFunction(() => CanvasAudioGenerator.serialize(qaAudio)?.result?.url);
    async function checkDownload(expected) {
      const pending = page.waitForEvent('download', { timeout: 4000 });
      await node().locator('[data-flora-action="result-download"]').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), expected);
      assert.equal(await download.failure(), null);
      assert.deepEqual(fs.readFileSync(await download.path()), wav);
    }
    await checkDownload('测试音乐.wav');
    await page.evaluate(() => applyCanvasGenerationHistoryItem(qaAudio, { src: '/output/qa-history.wav', name: '历史音频', mimeType: 'audio/wav' }));
    await checkDownload('历史音频.wav');
    await page.evaluate(() => {
      const state = CanvasAudioGenerator.serialize(qaAudio); deleteCanvasNodes([qaAudio]);
      window.qaAudio = addCanvasAudioGeneratorNode({ x: 100, y: 150 }, state); qaAudio.dataset.qaDownload = 'true'; selectCanvasNode(qaAudio);
    });
    await checkDownload('历史音频.wav');
    await page.route('**/output/qa-history.wav', route => route.fulfill({ status: 403, body: 'Forbidden' }));
    await node().locator('[data-flora-action="result-download"]').click();
    await page.waitForFunction(() => document.body.innerText.includes('下载失败：'));
    assert.equal(downloads.length, 3, '失败时不能产生假下载');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: ['生成后下载及正确格式', '切换历史下载当前音频', '序列化恢复后下载', '访问失败中文提示'], errors, downloads: downloads.length }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
