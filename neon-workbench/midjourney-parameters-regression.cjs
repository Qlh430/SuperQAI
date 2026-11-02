const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const errors = [], states = [], requests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }));
    const models = [
      { id: 'qa-mj', modelId: 'midjourney', modelProtocol: 'midjourney', providerProtocol: 'apimart', providerHost: 'api.apimart.ai', providerId: 'qa-apimart', providerName: '测试 APIMart', capabilities: ['image.generate', 'image.edit'], state: 'online' },
      { id: 'qa-mj-fixed', modelId: 'midjourney-v8.1', modelProtocol: 'midjourney', providerId: 'qa-apimart', providerName: '测试 APIMart', capabilities: ['image.generate'], state: 'online' },
      { id: 'qa-image', modelId: 'gpt-image-2', providerId: 'qa-other', providerName: '测试其它模型', capabilities: ['image.generate'], state: 'online' },
      { id: 'qa-rh-v7', modelId: 'midjourney-v7', providerProtocol: 'runninghub', providerId: 'qa-rh', providerName: '测试独立版本', capabilities: ['image.generate'], state: 'online' },
      { id: 'qa-rh-v8', modelId: 'midjourney-v8.2-fast', providerProtocol: 'runninghub', providerId: 'qa-rh', providerName: '测试独立版本', capabilities: ['image.generate'], state: 'online' },
      { id: 'qa-mj-second', modelId: 'midjourney', modelProtocol: 'midjourney', providerProtocol: 'apimart', providerId: 'qa-second', providerName: '测试第二中转站', capabilities: ['image.generate'], state: 'online' },
      { id: 'qa-niji', modelId: 'niji7', providerId: 'qa-niji-provider', providerName: '测试动漫接入', capabilities: ['image.generate'], state: 'online' },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `qa-search-${i}`, modelId: `test-image-${i}`, providerId: 'qa-search', providerName: '测试搜索', capabilities: ['image.generate'], state: 'online' })),
    ];
    await page.route('**/api/image-models*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ models, candidates: [], revision: 1, instanceId: 'qa-mj-parameters' }) }));
    let job;
    await page.route('**/api/image-jobs**', r => {
      if (r.request().method() === 'POST') {
        const body = r.request().postDataJSON(); requests.push(body);
        job = { id: 'qa-job-' + requests.length, boardId: body.board_id, nodeId: body.node_id, model: body.model, state: 'failed', error: '模拟任务结束' };
      }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ job }) });
    });
    if (process.env.GENERATOR_SOURCE) for (const name of ['script.js', 'midjourney-parameter-rules.js', 'flora-midjourney-settings.js', 'flora-generator-parameters.js', 'flora-generation-history.js', 'image-model-picker.js', 'flora-node-shell.css']) {
      await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name), 'utf8') }));
    }
    await page.goto('http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' });
    if (process.env.GENERATOR_SOURCE) for (const name of ['midjourney-parameter-rules.js', 'flora-midjourney-settings.js']) {
      const file = path.join(process.env.GENERATOR_SOURCE, name); if (fs.existsSync(file)) await page.addScriptTag({ path: file });
    }
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']);
      if (modules?.ok === false) throw new Error(JSON.stringify(modules));
      await loadImageModels(); await loadCanvasBoards(); canvasState.activeBoardId = 'qa-mj-parameters';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e';
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%';
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      window.qaNode = addCanvasImageGeneratorNode({ x: 80, y: 70 }); canvasState.scale = 1; canvasState.x = 150; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaNode);
      const select = qaNode.querySelector('.canvas-node-model'); select.value = 'qa-mj'; select.dataset.modelSelection = 'exact'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const gear = page.locator('[data-flora-midjourney-settings]');
    await assert.equal(await gear.count(), 1, 'Midjourney 必须拥有独立齿轮设置入口 ' + JSON.stringify({ errors, globals: await page.evaluate(() => ({ rules: !!window.MidjourneyParameterRules, settings: !!window.FloraMidjourneySettings, parameters: !!window.FloraGeneratorParameters, composer: !!window.FloraGeneratorComposer, node: qaNode.outerHTML.slice(0, 800) })) }));
    await gear.waitFor({ state: 'visible' }); await gear.click();
    assert.equal(await page.locator('.flora-midjourney-settings-popover:popover-open').count(), 1);
    assert.equal(await page.locator('.flora-midjourney-settings-popover [data-midjourney-field="chaos"]').count(), 1);
    states.push('齿轮与中文动态参数');
    const providerDefaults = await page.evaluate(() => {
      const node = document.createElement('article'); node.innerHTML = '<div class="canvas-midjourney-options"></div>';
      FloraMidjourneySettings.sync(node, { id: 'qa-defaults', modelId: 'midjourney', modelProtocol: 'midjourney', parameterOverrides: { version: '8.2', speed: 'fast', stylize: 0 } });
      return FloraMidjourneySettings.payload(node);
    });
    assert.deepEqual(providerDefaults, { version: '8.2', niji: false, speed: 'fast', stylize: 0 }, '空旧字段不覆盖服务商默认值');
    const field = key => page.locator(`.flora-midjourney-settings-popover [data-midjourney-field="${key}"]`);
    const version = async key => { await field('variant').selectOption(key); };
    for (const [key, present, absent] of [
      ['8.2', ['hd', 'raw', 'weird'], ['quality', 'draft', 'stop']],
      ['8.1', ['hd', 'chaos'], ['quality', 'draft', 'stop']],
      ['7', ['quality', 'draft'], ['hd', 'stop']],
      ['6.1', ['quality', 'stop'], ['hd', 'draft']],
      ['5.2', ['quality', 'stop'], ['hd', 'draft']],
      ['5.1', ['quality', 'stop'], ['hd', 'draft']],
      ['niji7', ['raw', 'chaos'], ['quality', 'weird', 'draft', 'stop']],
      ['niji6', ['stop', 'chaos'], ['quality', 'weird', 'draft', 'hd']],
    ]) {
      await version(key);
      for (const name of present) assert.equal(await field(name).count(), 1, `${key} 显示 ${name}`);
      for (const name of absent) assert.equal(await field(name).count(), 0, `${key} 隐藏 ${name}`);
    }
    states.push('八个版本的兼容选项');
    await version('8.2'); await field('hd').selectOption('true'); await version('7');
    await field('draft').selectOption('true'); await version('6.1'); await field('stop').fill('20'); await field('stop').blur(); await version('7');
    await field('chaos').fill('0'); await field('chaos').blur(); await field('seed').fill('0'); await field('seed').blur();
    await field('tile').selectOption('false'); await field('quality').selectOption('2');
    const params = await page.evaluate(() => FloraMidjourneySettings.payload(qaNode));
    assert.equal(params.chaos, 0); assert.equal(params.seed, 0); assert.equal(params.tile, false); assert.equal(params.quality, '2');
    for (const key of ['hd', 'draft', 'stop', 'iw']) assert.equal(key in params, false);
    const restored = await page.evaluate(() => {
      const item = serializeCanvasNode(qaNode);
      const restored = restoreCanvasBoardNode({ ...item, id: 'qa-restored', x: 1700 }, { id: canvasState.activeBoardId }, { maxId: 0 });
      const result = FloraMidjourneySettings.read(restored); restored.remove(); return result;
    });
    assert.deepEqual(restored, await page.evaluate(() => FloraMidjourneySettings.read(qaNode)), '完整保存恢复不添加旧默认参数');
    const copied = await page.evaluate(() => {
      document.activeElement?.blur();
      const before = new Set(document.querySelectorAll('#canvasPlane .canvas-node'));
      canvasState.clipboard = { nodes: [serializeCanvasNode(qaNode)], connections: [], externalConnections: [], pasteCount: 0 };
      pasteCanvasNodes({ preventDefault() {} });
      const pasted = Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).find(node => !before.has(node));
      const result = FloraMidjourneySettings.read(pasted); pasted.remove(); selectCanvasNode(qaNode); return result;
    });
    assert.deepEqual(copied, restored, '复制粘贴保留完整设置');
    const lateCatalog = await page.evaluate(() => {
      const saved = { ...serializeCanvasNode(qaNode), id: 'qa-late-catalog', midjourneyParameters: { version: '8.1', niji: false, seed: 42, tile: true } };
      const catalog = imageModelCatalog; imageModelCatalog = [];
      const restored = restoreCanvasBoardNode(saved, { id: canvasState.activeBoardId }, { maxId: 0 });
      const pending = serializeCanvasNode(restored).midjourneyParameters;
      const debug = { model: restored.dataset.canvasModel, selection: restored.dataset.modelSelection, value: restored.querySelector('.canvas-node-model').value, pending: restored.querySelector('.canvas-node-model').dataset.pendingModel, parameters: FloraMidjourneySettings.read(restored) };
      imageModelCatalog = catalog; refreshCanvasImageModelSelects();
      const ready = FloraMidjourneySettings.read(restored); restored.remove(); return { pending, ready, debug };
    });
    assert.deepEqual(lateCatalog.pending, { version: '8.1', niji: false, seed: 42, tile: true }, '目录未加载时保留完整保存参数 ' + JSON.stringify(lateCatalog.debug));
    assert.deepEqual(lateCatalog.ready, lateCatalog.pending, '目录恢复后继续使用原版本与参数');
    await page.evaluate(() => { qaNode.dataset.imageSrc = 'https://example.invalid/reference.png'; syncCanvasMidjourneyOptions(qaNode, 'qa-mj'); });
    assert.equal(await field('iw').count(), 1, '有图片输入提供参考图影响');
    await field('iw').fill('1.25'); await field('iw').blur();
    await page.evaluate(() => { delete qaNode.dataset.imageSrc; syncCanvasMidjourneyOptions(qaNode, 'qa-mj'); });
    assert.equal(await field('iw').count(), 0, '移除图片输入同步隐藏并清理影响参数');
    assert.equal('iw' in (await page.evaluate(() => FloraMidjourneySettings.payload(qaNode))), false);
    states.push('旧参数清理、零值与关闭、保存恢复');
    await field('chaos').fill('101'); await field('chaos').blur();
    const invalid = await page.evaluate(async () => { qaNode.querySelector('.canvas-node-prompt').value = '测试香蕉'; return runCanvasImageEdit(qaNode); });
    assert.equal(invalid.ok, false); assert.equal(requests.length, 0, '越界参数必须在提交前拦截');
    assert.match(invalid.error, /变化程度|范围|100/);
    await field('chaos').fill('0'); await field('chaos').blur();
    await page.evaluate(() => runCanvasImageEdit(qaNode));
    assert.equal(requests.length, 1); assert.equal(requests[0].model, 'qa-mj'); assert.deepEqual(requests[0].params, params);
    assert.equal('chaos' in requests[0], false, '统一参数袋避免宿主顶层白名单丢字段');
    await page.evaluate(() => appendCanvasGenerationToGallery(qaNode, { id: 'qa-history', src: '/output/mock.png', model: 'qa-mj', midjourneyParameters: JSON.parse(qaNode.dataset.imageJobMidjourneyParameters) }));
    const history = await page.evaluate(() => FloraGenerationHistory.serialize(qaNode).generationHistory[0]);
    assert.deepEqual(history.midjourneyParameters, params);
    states.push('请求真实字段格式、中文校验与历史参数');
    await page.keyboard.press('Escape');
    await page.locator('.image-model-picker-trigger').last().click();
    assert.equal(await page.locator('[data-model-variant]').count(), 0, '外部不再展开版本');
    const mjRows = page.locator('.image-model-provider-group[data-provider-id="qa-apimart"] .image-model-picker-row');
    assert.equal(await mjRows.count(), 1, '同一中转站只有一个 Midjourney 入口');
    assert.equal(await mjRows.locator('strong').innerText(), 'Midjourney');
    assert.equal(await page.locator('.image-model-provider-group[data-provider-id="qa-rh"] .image-model-picker-row').count(), 1, '独立版本模型也聚合为一个入口');
    assert.equal(await page.locator('.image-model-provider-group[data-provider-id="qa-second"] .image-model-picker-row').count(), 1, '不同中转站分别保留入口');
    const search = page.locator('.image-model-picker-search input').last();
    await search.fill('Midjourney');
    assert.equal(await page.locator('.image-model-provider-group[data-provider-id="qa-niji-provider"] .image-model-picker-row').count(), 1, '统一名称可搜索只有 Niji 的接入');
    await search.fill('');
    await mjRows.locator('.image-model-picker-choice').click();
    await gear.click(); await version('8.1'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => qaNode.querySelector('.canvas-node-model').value), 'qa-mj');
    assert.equal((await page.evaluate(() => FloraMidjourneySettings.read(qaNode))).version, '8.1');
    assert.equal(await page.locator('.image-model-picker-trigger').last().locator('strong').innerText(), 'Midjourney');
    await page.locator('.image-model-picker-trigger').last().click();
    await page.locator('.image-model-provider-group[data-provider-id="qa-apimart"] .image-model-picker-choice').click();
    assert.equal((await page.evaluate(() => FloraMidjourneySettings.read(qaNode))).version, '8.1', '重新选择当前入口不重置齿轮版本');
    await page.evaluate(() => {
      refreshCanvasImageModelSelects();
    });
    await gear.click();
    assert.equal(await field('variant').inputValue(), '8.1', '泛模型与独立版本并存仍保留当前泛模型版本');
    await page.keyboard.press('Escape');
    const fixedRestore = await page.evaluate(() => {
      const saved = { ...serializeCanvasNode(qaNode), id: 'qa-fixed-restore', model: 'qa-mj-fixed', midjourneyParameters: { version: '8.1', niji: false, seed: 42 } };
      const restored = restoreCanvasBoardNode(saved, { id: canvasState.activeBoardId }, { maxId: 0 });
      const version = restored.querySelector('[data-midjourney-field="variant"]').value;
      const result = { version, model: restored.querySelector('.canvas-node-model').value, params: FloraMidjourneySettings.read(restored) };
      restored.remove(); return result;
    });
    assert.deepEqual(fixedRestore, { version: 'model:qa-mj-fixed', model: 'qa-mj-fixed', params: { version: '8.1', niji: false, seed: 42 } });
    const focusedSwitch = await page.evaluate(() => {
      const restored = document.createElement('article'); restored.innerHTML = '<div class="canvas-midjourney-options"></div>'; document.body.append(restored);
      let model = imageModelCatalog.find(item => item.id === 'qa-mj-fixed');
      const context = { catalog: imageModelCatalog, selectModel(id, values) { model = imageModelCatalog.find(item => item.id === id); FloraMidjourneySettings.sync(restored, model, { ...values, __replace: true }, context); } };
      FloraMidjourneySettings.sync(restored, model, { version: '8.1', niji: false, seed: 42 }, context);
      const options = restored.querySelector('.canvas-midjourney-options');
      const select = options.querySelector('[data-midjourney-field="variant"]'); select.focus(); select.value = '7'; select.dispatchEvent(new Event('change', { bubbles: true }));
      const current = options.querySelector('[data-midjourney-field="variant"]');
      const result = { displayed: current.value, focused: document.activeElement === current, model: model.id, payload: FloraMidjourneySettings.payload(restored) };
      restored.remove(); return result;
    });
    assert.deepEqual(focusedSwitch, { displayed: '7', focused: true, model: 'qa-mj', payload: { version: '7', niji: false, seed: 42 } }, '聚焦切换版本后显示值与提交一致');
    states.push('外部统一入口，齿轮版本与真实上游 ID 分离');
    await page.evaluate(() => { const s = qaNode.querySelector('.canvas-node-model'); s.value = 'qa-rh-v7'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await gear.isVisible(), true, '实际目录独立版本由齿轮选择');
    await gear.click();
    assert.equal(await field('variant').locator('option').count(), 2, '只显示当前中转站提供的真实版本');
    assert.equal(await field('chaos').count(), 0, '未核实的接入不冒用 APIMart 参数');
    await version('model:qa-rh-v8');
    assert.equal(await page.evaluate(() => qaNode.querySelector('.canvas-node-model').value), 'qa-rh-v8');
    await page.evaluate(() => runCanvasImageEdit(qaNode));
    assert.equal(requests.at(-1).model, 'qa-rh-v8', '独立版本提交真实模型 ID');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const s = qaNode.querySelector('.canvas-node-model'); s.value = 'qa-image'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await gear.isVisible(), false, '其它模型隐藏 MJ 设置');
    await page.evaluate(() => { const s = qaNode.querySelector('.canvas-node-model'); s.value = 'qa-mj'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    states.push('其它接入与模型兼容');
    const output = path.join(__dirname, '..', '.design', 'midjourney-parameters'); fs.mkdirSync(output, { recursive: true });
    await page.evaluate(() => setCanvasNodeStatus(qaNode, ''));
    await page.locator('.image-model-picker-trigger').last().click();
    await page.screenshot({ path: path.join(output, 'single-entry-1440.png') });
    await page.keyboard.press('Escape');
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.evaluate(width => { canvasState.scale = width < 800 ? 0.5 : 1; canvasState.x = width < 800 ? 0 : 150; applyCanvasTransformNow(); }, width);
      await page.locator('.flora-generator-expand').last().click();
      await gear.click();
      const bounds = await page.locator('.flora-midjourney-settings-popover:popover-open').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 1051, `${width} 全屏参数不越界`);
      await field('chaos').focus();
      await page.screenshot({ path: path.join(output, `settings-${width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog[open]').count(), 1, '关闭参数不退出放大界面');
      assert.equal(await gear.getAttribute('aria-expanded'), 'false');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog[open]').count(), 0);
      states.push(`${width} 放大、焦点与 Escape`);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ states, errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
