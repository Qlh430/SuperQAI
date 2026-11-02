const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = process.env.GENERATOR_SOURCE || path.join(__dirname, 'design-sources');
const url = process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199';
const output = path.resolve(__dirname, '../.design/audio-node-mode-20261024');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      if (request.url().includes('/providers/audio-models')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ models: [
          { id: 'qa-music', modelId: 'music-2.5', providerId: 'qa', providerName: '测试音频服务', displayName: 'MiniMax Music 2.5', capabilities: ['audio.generate'], modelProtocol: 'audio-adapter' },
          { id: 'qa-ace', modelId: 'ace-step', providerId: 'local-comfyui', providerName: '本机 ComfyUI', displayName: 'ACE-Step', capabilities: ['audio.generate'], modelProtocol: 'comfyui' },
          { id: 'qa-speech', modelId: 'speech-2.8', providerId: 'qa', providerName: '测试音频服务', displayName: 'MiniMax Speech 2.8', capabilities: ['audio.generate'], modelProtocol: 'audio-speech', metadata: { voiceOptions: [{ id: 'healing-doctor', label: '治愈博士' }] } },
          { id: 'custom:local-comfyui:qwen-tts', modelId: 'qwen-tts', providerId: 'local-comfyui', providerName: '本机 ComfyUI', displayName: 'Qwen-TTS', capabilities: ['audio.generate'], modelProtocol: 'audio-speech' },
        ] }) });
      }
      if (request.url().includes('/providers/generate-audio')) {
        requests.push(request.postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ audio: { url: 'data:audio/wav;base64,UklGRg==' } }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) });
    });
    for (const name of ['script.js', 'flora-generator-composer.js', 'flora-generator-parameters.js', 'flora-node-shell.js', 'flora-node-shell.css', 'flora-generation-history.js', 'canvas-audio-generator.js']) {
      const file = path.join(source, name === 'script.js' ? 'script-before-save-bridge.js' : name);
      if (fs.existsSync(file)) await page.route(`**/${name}*`, route => route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file, 'utf8') }));
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const css = path.join(source, 'canvas-audio-generator.css');
    if (fs.existsSync(css)) await page.addStyleTag({ path: css });
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-llm', 'canvas-node-video-api', 'canvas-node-minimax-h3', 'canvas-node-asset-collection']);
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-audio-mode';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'; document.body.append(surface);
      const view = document.querySelector('#canvasView'); surface.append(view); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'; document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      window.qaAudio = addCanvasAudioGeneratorNode({ x: 100, y: 50 }); qaAudio.dataset.qaGeneration = 'audio'; canvasState.scale = 1; canvasState.x = 420; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaAudio);
    });
    const audio = page.locator('[data-qa-generation="audio"]');
    const panel = audio.locator('.flora-generator-composer');
    await panel.waitFor({ state: 'visible' });
    const mode = panel.locator('.canvas-audio-generator-mode');
    const musicModel = panel.locator('.canvas-audio-generator-model option[value="qa-music"]');
    await musicModel.waitFor({ state: 'attached' });
    assert.equal(await mode.inputValue(), 'music');
    await panel.locator('.canvas-audio-generator-prompt').fill('温暖、轻快、钢琴和弦乐');
    await panel.locator('.canvas-audio-generator-lyrics').fill('夜色落在窗边');
    await mode.selectOption('speech');
    await panel.locator('.canvas-audio-generator-model option[value="qa-speech"]').waitFor({ state: 'attached' });
    assert.equal(await panel.locator('.canvas-audio-generator-model').inputValue(), 'custom:local-comfyui:qwen-tts', '首次切换至语音应默认选择 Qwen-TTS');
    assert.equal(await panel.locator('.canvas-audio-generator-speed').inputValue(), 'preset');
    assert.equal(await panel.locator('.canvas-audio-generator-voice').inputValue(), 'Serena', 'Qwen-TTS 预设声音默认应为苏瑶');
    await panel.locator('.canvas-audio-generator-model').selectOption('qa-speech');
    assert.equal(await panel.locator('.canvas-audio-generator-prompt').getAttribute('placeholder'), '必填，text');
    assert.equal(await panel.locator('.canvas-audio-generator-lyrics').isHidden(), true);
    assert.equal(await panel.locator('.canvas-audio-generator-prompt').inputValue(), '');
    assert.equal(await panel.locator('.canvas-audio-generator-lyrics').inputValue(), '夜色落在窗边');
    assert.equal(await panel.locator('.canvas-audio-generator-speed').isVisible(), true);
    assert.equal(await panel.locator('.canvas-audio-generator-voice').isVisible(), true);
    assert.equal(await panel.locator('.canvas-audio-generator-voice option:checked').textContent(), '治愈博士');
    assert.equal(await panel.locator('.flora-generator-parameter-trigger').first().textContent(), '设置');
    assert.equal(await panel.locator('.flora-generator-cost').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'audio-speech-desktop.png') });
    await mode.selectOption('music');
    await mode.selectOption('speech');
    assert.equal(await panel.locator('.canvas-audio-generator-model').inputValue(), 'qa-speech', '用户改选其他语音模型后，切换模式不能覆盖手动选择');
    await panel.locator('.canvas-audio-generator-prompt').fill('你好，这是语音测试');
    await panel.locator('.canvas-audio-generator-speed').selectOption('1.25');
    await panel.locator('.canvas-audio-generator-run').click();
    await page.waitForFunction(() => window.qaAudio.querySelector('audio')?.getAttribute('src')?.startsWith('data:audio/'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].mode, 'speech');
    assert.equal(requests[0].prompt, '你好，这是语音测试');
    assert.equal(requests[0].parameters.speed, 1.25);
    await mode.selectOption('music');
    assert.equal(await panel.locator('.canvas-audio-generator-prompt').inputValue(), '温暖、轻快、钢琴和弦乐');
    assert.equal(await panel.locator('.canvas-audio-generator-lyrics').isVisible(), true);
    const promptStyle = await panel.locator('.canvas-audio-generator-prompt').evaluate(el => {
      const style = getComputedStyle(el);
      return { width: el.getBoundingClientRect().width, borderBottom: style.borderBottomWidth, background: style.backgroundColor };
    });
    const lyricsStyle = await panel.locator('.canvas-audio-generator-lyrics').evaluate(el => {
      const style = getComputedStyle(el);
      return { width: el.getBoundingClientRect().width, border: style.border, background: style.backgroundColor };
    });
    assert.equal(promptStyle.borderBottom, '1px', '音乐提示词与歌词之间必须有分隔线');
    assert.ok(promptStyle.width > 500 && Math.abs(promptStyle.width - lyricsStyle.width) <= 1, '音乐提示词和歌词必须同宽');
    assert.equal(lyricsStyle.background, 'rgba(0, 0, 0, 0)', '歌词区应与提示词共用透明面板');
    await panel.locator('.canvas-audio-generator-model').selectOption('qa-ace');
    assert.equal(await panel.locator('.canvas-audio-generator-prompt').getAttribute('placeholder'), '必填，请输入音乐类型、情绪、乐器等');
    await panel.locator('.flora-generator-parameter-trigger').first().click();
    const settingsPopup = panel.locator('.flora-generator-parameter-popover:popover-open');
    const duration = settingsPopup.locator('[aria-label="时长（秒）"]');
    const bpm = settingsPopup.locator('[aria-label="BPM"]');
    const keyscale = settingsPopup.locator('[aria-label="调式"]');
    await duration.waitFor({ state: 'visible' });
    assert.equal(await duration.inputValue(), '120');
    assert.equal(await bpm.inputValue(), '95');
    assert.equal(await keyscale.inputValue(), 'E minor');
    await duration.fill('73'); await duration.dispatchEvent('change');
    await bpm.fill('108'); await bpm.dispatchEvent('change');
    await keyscale.selectOption('A minor');
    await panel.locator('.canvas-audio-generator-prompt').fill('氛围电子、温暖、钢琴与弦乐');
    await panel.locator('.canvas-audio-generator-lyrics').fill('夜色落在窗边');
    await panel.locator('.canvas-audio-generator-run').click();
    await page.waitForFunction(() => window.qaAudio.querySelector('audio')?.getAttribute('src')?.startsWith('data:audio/'));
    assert.equal(requests.length, 2);
    assert.equal(requests[1].modelId, 'ace-step');
    assert.equal(requests[1].prompt, '氛围电子、温暖、钢琴与弦乐');
    assert.equal(requests[1].parameters.lyrics, '夜色落在窗边');
    assert.equal(requests[1].parameters.duration, 73);
    assert.equal(requests[1].parameters.bpm, 108);
    assert.equal(requests[1].parameters.keyscale, 'A minor');
    await page.screenshot({ path: path.join(output, 'audio-music-desktop.png') });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(output, 'audio-music-mobile.png') });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'audio mode switch passed', requests, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
