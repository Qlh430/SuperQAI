const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {} }) }));
    if (process.env.GENERATOR_SOURCE) {
      const source = fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js'), 'utf8');
      await page.route('**/script.js*', route => route.fulfill({ contentType: 'application/javascript', body: source }));
    }
    await page.goto('http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']); });
    if (process.env.GENERATOR_SOURCE) {
      await page.addScriptTag({ path: path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js') });
      errors.length = 0;
    }
    const result = await page.evaluate(async () => {
      const sound = window.CanvasGenerationSound;
      if (!sound) return { available: false };
      const node = document.createElement('article');
      const sounds = [];
      sound._testHooks?.setPlayHook?.(() => sounds.push('played'));
      sound.arm(node);
      sound.playComplete(node, 'job-1');
      sound.playComplete(node, 'job-1');
      sound.playComplete(node, 'job-2');
      return { available: true, sounds: sounds.length, armed: sound._testHooks?.isArmed?.(node) === true };
    });
    assert.equal(result.available, true, '画布提示音服务已注册');
    assert.equal(result.armed, true, '生成开始时唤醒音频上下文');
    assert.equal(result.sounds, 2, '同一任务只播放一次');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, result, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
