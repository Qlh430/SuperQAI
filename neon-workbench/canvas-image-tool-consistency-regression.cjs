const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, process.env.QA_OUTPUT_DIR || '../.design/image-tool-consistency-20261015');
fs.mkdirSync(output, { recursive: true });
const overrides = { 'script.js': 'script-before-save-bridge.js', 'canvas-asset-entry.js': 'canvas-asset-entry.js', 'background-removal-ui.js': 'background-removal-ui.js', 'flora-node-shell.js': 'flora-node-shell.js', 'flora-node-shell.css': 'flora-node-shell.css', 'flora-connection-interaction.js': 'flora-connection-interaction.js', 'neon-canvas-surface.css': 'neon-canvas-surface.css' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname.slice(1);
  const sourceName = overrides[name] || (name === 'canvas-feature-registry.js' || /^canvas-features\/[\w-]+\.js$/.test(name) ? name : null);
  const source = process.env.QA_DEPLOYED !== '1' && sourceName && path.join(__dirname, 'design-sources', sourceName);
  const file = source && fs.existsSync(source) ? source : path.resolve(runtime, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!source && !file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    let body = name === 'script.js' && source ? fs.readFileSync(file, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'design-sources/canvas-asset-entry.js'), 'utf8') : fs.readFileSync(file);
    if (process.env.QA_DEPLOYED !== '1' && path.extname(file) === '.html' && !body.toString().includes('canvas-feature-registry.js')) {
      const files = ['canvas-feature-registry.js', ...fs.readdirSync(path.join(__dirname, 'design-sources/canvas-features')).filter(f => f.endsWith('.js')).map(f => 'canvas-features/' + f)];
      body = body.toString().replace('<script src="./module-manifest.js', files.map(f => `<script src="./${f}"></script>`).join('\n') + '\n<script src="./module-manifest.js');
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream'); res.end(body);
  }
  catch { res.writeHead(404); res.end(); }
});
const stub = { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} };
let browser;
const checks = [], failures = [], errors = [];
async function check(name, fn) { try { await fn(); checks.push(name); } catch (e) { failures.push(`${name}: ${e.message}`); } }
async function main() {
  await new Promise(resolve => server.listen(33199, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(output, 'test.pid'), String(process.pid));
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Full-path compatibility only. Never set this in DOM/performance benchmarks.
  if (process.env.QA_COMPAT_FULL === '1') await page.addInitScript(() => {
    window.NeonCanvasPerformanceFlags = { ...(window.NeonCanvasPerformanceFlags || {}), representationManager: false, detailHydration: false, detailCulling: false };
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(stub) }));
  await page.route('**/api/canvas/boards/*/viewport*', r => r.fulfill({ json: { state: 'migrating' } }));
  await page.route('**/api/image-thumbnails*', r => r.fulfill({ json: { item: { thumbnailUrl: '/output/qa-source.png', width: 800, height: 600 } } }));
  await page.route('**/api/background-removal/models', r => r.fulfill({ json: { models: [{ installed: true, size: 1234 }] } }));
  await page.route('**/api/background-removal/prepare', r => r.fulfill({ json: { token: 'qa-mask', mask_url: '/output/qa-result.png', width: 800, height: 600 } }));
  await page.route('**/api/background-removal/apply', r => r.fulfill({ json: { url: '/output/qa-result.png', width: 800, height: 600 } }));
  await page.route('**/api/upload-image', r => r.fulfill({ json: { url: '/output/qa-result.png' } }));
  for (const endpoint of ['upscale2', 'outpaint', 'qwen-edit-angle']) await page.route(`**/api/${endpoint}`, r => r.fulfill({ json: { task_id: 'qa-' + endpoint } }));
  await page.route('**/api/upscale/status*', r => r.fulfill({ json: { status: 'success', images: ['/output/qa-result.png', '/output/qa-second.png'] } }));
  await page.goto('http://127.0.0.1:33199/', { waitUntil: 'domcontentloaded' });
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const ctx = c.getContext('2d'); ctx.fillStyle = '#775b40'; ctx.fillRect(0, 0, 800, 600); return c.toDataURL(); });
  for (const url of ['qa-source.png', 'qa-result.png', 'qa-second.png']) await page.route('**/' + url, r => r.fulfill({ contentType: 'image/png', body: Buffer.from(png.split(',')[1], 'base64') }));
  await page.evaluate(async () => {
    const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']);
    if (modules?.ok === false) throw new Error(JSON.stringify(modules));
    await loadCanvasBoards(); canvasState.activeBoardId = 'qa-tools';
    const surface = document.createElement('div'); surface.id = 'neonEngineSurface';
    surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'; document.body.append(surface);
    const view = document.querySelector('#canvasView'); surface.append(view); view.style.flex = '1'; view.style.minHeight = '0'; view.hidden = false; view.classList.add('active');
    document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
    window.qaA = addCanvasImage('/output/qa-source.png', '来源.png', { x: 180, y: 170 });
    window.qaB = addCanvasImage('/output/qa-source.png', '另一张.png', { x: 750, y: 170 });
    window.qaGenerated = addCanvasImageGeneratorNode({ x: 1180, y: 170 }, { focus: false });
    updateCanvasGenerationResult(qaGenerated, { src: '/output/qa-result.png', savedUrl: '/output/qa-result.png', name: '生成结果.png' });
    canvasState.scale = 1; canvasState.x = 0; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaA);
  });
  await page.waitForFunction(() => qaA.querySelector('img')?.naturalWidth > 0);
  await page.waitForFunction(() => qaGenerated.querySelector('.canvas-node-result img')?.naturalWidth > 0);
  await check('节点工具栏只在单选时显示，多选无悬停或焦点例外', async () => {
    const states = await page.evaluate(async () => {
      const bars = () => [...document.querySelectorAll('#canvasPlane .flora-node-toolbar, #canvasPlane .canvas-group-tools')].filter(bar => getComputedStyle(bar).display !== 'none' && getComputedStyle(bar).visibility !== 'hidden').length;
      selectCanvasNode(qaA); await new Promise(requestAnimationFrame);
      const single = bars();
      qaA.querySelector('[data-flora-action="download"]').focus();
      addCanvasNodeToSelection(qaB);
      const multipleImmediate = bars();
      await new Promise(requestAnimationFrame);
      const multiple = bars();
      const group = createCanvasGroupFromSelection(null, { programmatic: true });
      const groupedMultiple = bars();
      selectCanvasNode(group); await new Promise(requestAnimationFrame);
      const singleGroup = bars();
      addCanvasNodeToSelection(qaA);
      const groupAndMember = bars();
      selectCanvasNode(qaA); await new Promise(requestAnimationFrame);
      const singleMember = bars();
      clearCanvasSelection(); const none = bars();
      ungroupCanvasNode(group); selectCanvasNode(qaA); document.activeElement?.blur();
      return { single, multipleImmediate, multiple, groupedMultiple, singleGroup, groupAndMember, singleMember, none };
    });
    assert.deepEqual(states, { single: 1, multipleImmediate: 0, multiple: 0, groupedMultiple: 0, singleGroup: 1, groupAndMember: 0, singleMember: 1, none: 0 });
  });
  await check('抠图切换节点关闭及切回不自动重开', async () => {
    await page.evaluate(async () => { selectCanvasNode(qaA); await openCanvasCutoutWorkbench(qaA); });
    assert.equal(await page.locator('.canvas-cutout-modal:visible').count(), 1);
    await page.evaluate(() => selectCanvasNode(qaB)); await page.waitForTimeout(50);
    assert.equal(await page.locator('.canvas-cutout-modal:visible').count(), 0);
    await page.evaluate(() => selectCanvasNode(qaA)); await page.waitForTimeout(50);
    assert.equal(await page.locator('.canvas-cutout-modal:visible').count(), 0);
  });
  await check('实际点击图片工具栏抠图按钮会打开面板', async () => {
    await page.evaluate(() => { closeCanvasImageToolInteractions(); selectCanvasNode(qaA); });
    await page.evaluate(() => qaA.querySelector('[data-flora-action="cutout"]').click());
    await page.waitForFunction(() => {
      const modal = document.querySelector('.canvas-cutout-modal');
      return modal && !modal.hidden && getComputedStyle(modal).display !== 'none';
    });
    const result = await page.evaluate(() => ({
      visible: !document.querySelector('.canvas-cutout-modal').hidden,
      registered: CanvasFeatureRegistry.hasTool('cutout'),
      status: document.querySelector('.canvas-cutout-status')?.textContent || '',
    }));
    assert.equal(result.visible, true, JSON.stringify(result));
    assert.equal(result.registered, true, JSON.stringify(result));
    await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  await check('生成结果图片的工具按钮可用且点击进入对应工具', async () => {
    const enabled = await page.evaluate(() => {
      selectCanvasNode(qaGenerated);
      window.CanvasFloraNodeShell.syncToolbar(qaGenerated);
      return ['upscale', 'cutout', 'crop', 'outpaint', 'angle'].map(action => {
        const button = qaGenerated.querySelector('[data-flora-action="' + action + '"]');
        return { action, exists: Boolean(button), hidden: Boolean(button?.hidden), disabled: Boolean(button?.disabled) };
      });
    });
    assert.deepEqual(enabled, ['upscale', 'cutout', 'crop', 'outpaint', 'angle'].map(action => ({ action, exists: true, hidden: false, disabled: false })));

    await page.locator('[data-flora-action="cutout"]').last().click();
    await page.waitForFunction(() => { const modal = document.querySelector('.canvas-cutout-modal'); return modal && !modal.hidden; });
    await page.evaluate(() => closeCanvasImageToolInteractions());

    await page.locator('[data-flora-action="crop"]').last().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#canvasInlineCrop')));
    await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  await check('扩图只显示扩图执行栏，不显示通用生成操作区', async () => {
    await page.evaluate(() => { closeCanvasImageToolInteractions(); selectCanvasNode(qaGenerated); });
    await page.locator('[data-flora-action="outpaint"]').last().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-submit]')));
    const visible = await page.evaluate(() => {
      const node = qaGenerated;
      const composer = node.querySelector('.flora-generator-composer');
      const bar = node.querySelector('#canvasInlineOutpaint .canvas-inline-outpaint-bar');
      return {
        mode: node.dataset.inlineTool,
        composerDisplay: composer ? getComputedStyle(composer).display : 'missing',
        composerVisible: Boolean(composer && composer.getClientRects().length && getComputedStyle(composer).visibility !== 'hidden'),
        outpaintBarVisible: Boolean(bar && bar.getClientRects().length && getComputedStyle(bar).visibility !== 'hidden'),
        genericToolPanel: Boolean(node.querySelector(':scope > .flora-node-shell > .flora-node-tool-panel')),
      };
    });
    assert.deepEqual(visible, { mode: 'outpaint', composerDisplay: 'none', composerVisible: false, outpaintBarVisible: true, genericToolPanel: false });
    await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  await check('抠图组件未注册时点击仍回退到兼容入口', async () => {
    await page.evaluate(() => {
      closeCanvasImageToolInteractions();
      selectCanvasNode(qaA);
      CanvasFeatureRegistry.unregisterTool('cutout');
      qaA.querySelector('[data-flora-action="cutout"]').hidden = false;
    });
    await page.evaluate(() => qaA.querySelector('[data-flora-action="cutout"]').click());
    await page.waitForFunction(() => {
      const modal = document.querySelector('.canvas-cutout-modal');
      return modal && !modal.hidden;
    });
    assert.equal(await page.locator('.canvas-cutout-modal:visible').count(), 1);
    await page.evaluate(() => {
      closeCanvasImageToolInteractions();
      CanvasFeatureRegistry.registerTool({ id: 'cutout', open: ({ node, memberId }) => openCanvasCutoutWorkbench(node, memberId), close: () => BackgroundRemovalUi.close() });
      CanvasFloraNodeShell.syncToolbar(qaA);
    });
  });
  await check('更多按钮与相邻动作样式一致', async () => {
    const styles = await page.evaluate(() => ['[data-node-action="asset-more"]', '[data-flora-action="download"]'].map(selector => {
      const s = getComputedStyle(qaA.querySelector(selector)); return [s.backgroundColor, s.borderTopWidth, s.height, s.borderRadius, s.color];
    }));
    assert.deepEqual(styles[0], styles[1]);
  });
  for (const tool of ['upscale', 'angle', 'outpaint', 'crop']) await check(`${tool}切换节点关闭`, async () => {
    await page.evaluate(async tool => {
      closeCanvasInlineCrop(); closeCanvasInlineOutpaint(); closeCanvasAngleDialog(); document.querySelectorAll('[data-flora-tool-panel]').forEach(closeCanvasImageToolPanel);
      selectCanvasNode(qaA);
      if (tool === 'upscale') openCanvasImageToolPanel(qaA, tool);
      else if (tool === 'angle') openCanvasAngleDialog(qaA);
      else if (tool === 'outpaint') await openCanvasInlineOutpaint(qaA);
      else await openCanvasInlineCrop(qaA);
      selectCanvasNode(qaB);
    }, tool);
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.flora-node-tool-panel:visible, #canvasInlineCrop:visible, #canvasInlineOutpaint:visible, #canvasAngleDialog:visible').count(), 0);
  });
  await page.evaluate(() => { closeCanvasInlineCrop(); closeCanvasInlineOutpaint(); closeCanvasAngleDialog(); document.querySelectorAll('[data-flora-tool-panel]').forEach(closeCanvasImageToolPanel); });
  await check('同节点五种工具逐个切换全局互斥', async () => {
    for (const tool of ['crop', 'angle', 'outpaint', 'cutout', 'upscale']) {
      await page.evaluate(async tool => {
        selectCanvasNode(qaA);
        if (tool === 'upscale') openCanvasImageToolPanel(qaA, tool);
        else if (tool === 'cutout') await openCanvasCutoutWorkbench(qaA);
        else if (tool === 'crop') await openCanvasInlineCrop(qaA);
        else if (tool === 'angle') openCanvasAngleDialog(qaA);
        else await openCanvasInlineOutpaint(qaA);
      }, tool);
      assert.equal(await page.locator('.flora-node-tool-panel:visible, #canvasInlineCrop:visible, #canvasInlineOutpaint:visible, #canvasAngleDialog:visible, .canvas-cutout-modal:visible').count(), 1, tool);
    }
    await page.evaluate(() => clearCanvasSelection()); await page.waitForTimeout(50);
    assert.equal(await page.locator('.flora-node-tool-panel:visible, #canvasInlineCrop:visible, #canvasInlineOutpaint:visible, #canvasAngleDialog:visible, .canvas-cutout-modal:visible').count(), 0);
  });
  await check('裁剪异步打开后切换节点不重新弹出', async () => {
    const data = await page.evaluate(async () => {
      selectCanvasNode(qaA); const open = openCanvasInlineCrop(qaA); selectCanvasNode(qaB); await open;
      return Boolean(document.querySelector('#canvasInlineCrop'));
    }); assert.equal(data, false);
  });
  await check('已提交抠图关闭后仍归属原图且不关闭新面板', async () => {
    let release; const gate = new Promise(resolve => release = resolve);
    await page.route('**/api/background-removal/apply', async r => { await gate; await r.fulfill({ json: { url: '/output/qa-result.png', width: 800, height: 600 } }); });
    await page.evaluate(async () => { selectCanvasNode(qaA); await openCanvasCutoutWorkbench(qaA); });
    const request = page.waitForRequest('**/api/background-removal/apply');
    await page.locator('.cutout-export').click(); await request;
    await page.evaluate(() => { selectCanvasNode(qaB); openCanvasAngleDialog(qaB); }); release();
    await page.waitForFunction(() => [...document.querySelectorAll('#canvasPlane .canvas-node')].some(n => n.dataset.imageName === '来源-抠图.png'));
    const data = await page.evaluate(() => { const n = [...document.querySelectorAll('#canvasPlane .canvas-node')].find(n => n.dataset.imageName === '来源-抠图.png'); return { kind: n.dataset.floraKind, history: FloraGenerationHistory.serialize(n).generationHistory.length, connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === n.dataset.id), selected: canvasState.activeNode === qaB, angle: !getCanvasAngleDialog().hidden }; });
    assert.deepEqual(data, { kind: 'generator', history: 1, connected: true, selected: true, angle: true });
    await page.unroute('**/api/background-removal/apply'); await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  for (const tool of ['upscale', 'outpaint', 'angle']) await check(`${tool}所有结果为带历史和来源连线的生成节点`, async () => {
    const data = await page.evaluate(async tool => {
      const before = new Set([...document.querySelectorAll('#canvasPlane .canvas-node')].map(n => n.dataset.id));
      await runCanvasImageTool(qaA, tool);
      return [...document.querySelectorAll('#canvasPlane .canvas-node')].filter(n => !before.has(n.dataset.id)).map(n => ({ kind: n.dataset.floraKind, history: FloraGenerationHistory.serialize(n).generationHistory.length, connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === n.dataset.id) }));
    }, tool);
    assert.equal(data.length, 2); assert.ok(data.every(n => n.kind === 'generator' && n.history === 1 && n.connected), JSON.stringify(data));
  });
  await check('超清后台完成不改变新节点选择或关闭新工具', async () => {
    let release; const gate = new Promise(resolve => release = resolve);
    const handler = async r => { await gate; await r.fulfill({ json: { status: 'success', images: ['/output/qa-result.png'] } }); };
    await page.route('**/api/upscale/status*', handler);
    const request = page.waitForRequest('**/api/upscale/status*');
    await page.evaluate(() => { selectCanvasNode(qaA); window.qaPendingTask = runCanvasImageTool(qaA, 'upscale'); });
    await request; await page.evaluate(() => { selectCanvasNode(qaB); openCanvasAngleDialog(qaB); }); release();
    assert.equal(await page.evaluate(() => window.qaPendingTask), true);
    await page.waitForTimeout(50);
    assert.deepEqual(await page.evaluate(() => ({ selected: canvasState.activeNode === qaB, angle: !getCanvasAngleDialog().hidden })), { selected: true, angle: true });
    await page.unroute('**/api/upscale/status*', handler); await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  await check('裁剪保存中切换节点结果保留且不关闭新工具', async () => {
    let release; const gate = new Promise(resolve => release = resolve);
    const handler = async r => { await gate; await r.fulfill({ json: { url: '/output/qa-result.png' } }); };
    await page.route('**/api/upload-image', handler);
    await page.evaluate(async () => { selectCanvasNode(qaA); await openCanvasInlineCrop(qaA); });
    const request = page.waitForRequest('**/api/upload-image');
    await page.evaluate(() => { window.qaPendingCrop = submitCanvasInlineCrop(); });
    await request; await page.evaluate(() => { selectCanvasNode(qaB); openCanvasAngleDialog(qaB); }); release();
    const data = await page.evaluate(async () => { const n = await qaPendingCrop; return { kind: n?.dataset.floraKind, selected: canvasState.activeNode === qaB, angle: !getCanvasAngleDialog().hidden, connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === n.dataset.id) }; });
    assert.deepEqual(data, { kind: 'generator', selected: true, angle: true, connected: true });
    await page.unroute('**/api/upload-image', handler); await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  await check('单张裁剪输出生成节点', async () => {
    const data = await page.evaluate(async () => { selectCanvasNode(qaA); await openCanvasInlineCrop(qaA); const n = await submitCanvasInlineCrop(); return { kind: n?.dataset.floraKind, history: n && FloraGenerationHistory.serialize(n).generationHistory.length, connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === n?.dataset.id) }; });
    assert.equal(data.kind, 'generator'); assert.equal(data.history, 1); assert.equal(data.connected, true);
  });
  await check('裁剪组保存中切换并聚焦新节点参数仍正常打组', async () => {
    let release; const gate = new Promise(resolve => release = resolve);
    const handler = async r => { await gate; await r.fulfill({ json: { url: '/output/qa-result.png' } }); };
    await page.route('**/api/upload-image', handler);
    await page.evaluate(async () => { selectCanvasNode(qaA); await openCanvasInlineCrop(qaA); canvasInlineCropState.rows = 2; canvasInlineCropState.columns = 2; });
    const request = page.waitForRequest('**/api/upload-image');
    await page.evaluate(() => { window.qaPendingGroup = submitCanvasInlineCrop(); });
    await request; await page.evaluate(() => { selectCanvasNode(qaB); openCanvasAngleDialog(qaB); getCanvasAngleDialog().querySelector('[data-angle-horizontal]').focus(); }); release();
    const data = await page.evaluate(async () => { const g = await qaPendingGroup; return { group: g?.classList.contains('canvas-node-group'), count: g && getCanvasGroupMemberIds(g).length, selected: canvasState.activeNode === qaB, angle: !getCanvasAngleDialog().hidden, connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === g?.dataset.id) }; });
    assert.deepEqual(data, { group: true, count: 4, selected: true, angle: true, connected: true });
    await page.unroute('**/api/upload-image', handler); await page.evaluate(() => { document.activeElement?.blur(); closeCanvasImageToolInteractions(); });
  });
  await check('裁剪组单线连接且成员都是生成节点', async () => {
    const data = await page.evaluate(async () => {
      selectCanvasNode(qaA); await openCanvasInlineCrop(qaA); canvasInlineCropState.rows = 2; canvasInlineCropState.columns = 2;
      const g = await submitCanvasInlineCrop(); const ids = getCanvasGroupMemberIds(g);
      window.qaGroup = g;
      return { kinds: ids.map(id => getCanvasNode(id)?.dataset.floraKind), links: canvasState.connections.filter(c => c.from === qaA.dataset.id && (c.to === g.dataset.id || ids.includes(c.to))).map(c => c.to), id: g.dataset.id };
    });
    assert.deepEqual(data.kinds, ['generator', 'generator', 'generator', 'generator']); assert.deepEqual(data.links, [data.id]);
  });
  await check('生成节点历史和裁剪组来源连接可恢复', async () => {
    const data = await page.evaluate(() => {
      const models = getCanvasGroupMemberIds(qaGroup).map(id => serializeCanvasNode(getCanvasNode(id)));
      const group = serializeCanvasNode(qaGroup);
      const restored = models.map(n => restoreCanvasBoardNode({ ...n, id: 'restore-' + n.id }, { id: canvasState.activeBoardId }, { maxId: 0 }));
      const g = restoreCanvasBoardNode({ ...group, id: 'restore-group', groupMembers: models.map(n => 'restore-' + n.id) }, { id: canvasState.activeBoardId }, { maxId: 0 });
      connectCanvasNodes(qaA.dataset.id, g.dataset.id);
      return { histories: restored.map(n => FloraGenerationHistory.serialize(n).generationHistory.length), kinds: restored.map(n => n.dataset.floraKind), connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === g.dataset.id), ports: Boolean(g.querySelector('[data-canvas-port="input"]')) };
    });
    assert.deepEqual(data.histories, [1, 1, 1, 1]); assert.ok(data.kinds.every(k => k === 'generator')); assert.equal(data.connected, true); assert.equal(data.ports, true);
  });
  await check('图片工具结果可撤销重做且保留历史连线', async () => {
    const data = await page.evaluate(() => {
      resetCanvasUndoHistory(); collectCanvasDirtyOperations({ recordUndo: false });
      const n = createCanvasImageToolResultNode(qaA, { src: '/output/qa-result.png', name: '撤销结果.png' });
      const id = n.dataset.id; collectCanvasDirtyOperations();
      let steps = 0; while (getCanvasNode(id) && canvasState.undoStack.length && steps < 30) { undoCanvasCommand(); steps++; }
      const removed = !getCanvasNode(id); for (let i = 0; i < steps; i++) redoCanvasCommand();
      const model = canvasVirtualStore.get(id);
      const restored = getCanvasNode(id) || (model && restoreCanvasBoardNode(model, { id: canvasState.activeBoardId }, { maxId: 0 }));
      return { removed, restored: restored?.dataset.floraKind, history: restored && FloraGenerationHistory.serialize(restored).generationHistory.length, connected: canvasState.connections.some(c => c.from === qaA.dataset.id && c.to === id) };
    }); assert.deepEqual(data, { removed: true, restored: 'generator', history: 1, connected: true });
  });
  for (const width of [390, 768, 1440, 1728]) await check(`${width}工具栏状态、操作区内部点击和外部关闭`, async () => {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      closeCanvasImageToolInteractions();
      document.querySelectorAll('#canvasPlane .canvas-node').forEach(n => n.style.visibility = n === qaA || n === qaB ? '' : 'hidden');
      canvasState.scale = innerWidth < 768 ? .65 : 1;
      canvasState.x = innerWidth / 2 - (Number(qaA.dataset.x) + qaA.offsetWidth / 2) * canvasState.scale;
      canvasState.y = 240 - Number(qaA.dataset.y) * canvasState.scale;
      applyCanvasTransformNow(); selectCanvasNode(qaA);
    });
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      const r = qaA.querySelector('.flora-node-toolbar').getBoundingClientRect();
      const v = document.querySelector('#infiniteCanvas').getBoundingClientRect();
      canvasState.x += toSystemDelta((v.left + v.right) / 2 - (r.left + r.right) / 2);
      applyCanvasTransformNow();
    });
    const more = page.locator(`[data-id="${await page.evaluate(() => qaA.dataset.id)}"] [data-node-action="asset-more"]`);
    await page.evaluate(() => {
      addCanvasNodeToSelection(qaB); canvasState.selectionFrameVisible = true; updateCanvasSelectionFrame();
    });
    await page.locator(`[data-id="${await page.evaluate(() => qaA.dataset.id)}"] .flora-node-result-area`).hover();
    assert.equal(await page.locator('#canvasPlane .flora-node-toolbar:visible, #canvasPlane .canvas-group-tools:visible').count(), 0);
    assert.equal(await page.locator('#canvasSelectionBox').isVisible(), true);
    await page.screenshot({ path: path.join(output, `${width}-multiple-hover.png`) });
    await page.evaluate(() => toggleCanvasNodeSelection(qaB));
    assert.equal(await page.locator('#canvasPlane .flora-node-toolbar:visible').count(), 1);
    await page.mouse.move(0, 0); await page.screenshot({ path: path.join(output, `${width}-default-selected.png`) });
    const rect = await page.evaluate(() => { const r = qaA.querySelector('.flora-node-toolbar').getBoundingClientRect(); const v = document.querySelector('#infiniteCanvas').getBoundingClientRect(); return { left: r.left, right: r.right, viewportLeft: v.left, viewportRight: v.right }; });
    assert.ok(rect.left >= rect.viewportLeft - 1 && rect.right <= rect.viewportRight + 1, JSON.stringify(rect));
    await more.hover(); await page.screenshot({ path: path.join(output, `${width}-more-hover.png`) });
    await more.focus(); await page.screenshot({ path: path.join(output, `${width}-more-focus.png`) });
    await more.click(); await page.screenshot({ path: path.join(output, `${width}-more-menu.png`) }); await page.keyboard.press('Escape');
    await page.evaluate(() => { hideCanvasImageMenu(); openCanvasImageToolPanel(qaA, 'upscale'); });
    const panel = page.locator('.flora-node-tool-panel');
    await panel.locator('strong').click(); assert.equal(await panel.count(), 1);
    await panel.locator('select').selectOption('4096'); assert.equal(await panel.count(), 1);
    await page.screenshot({ path: path.join(output, `${width}-upscale-panel.png`) });
    await page.mouse.click(8, 850); assert.equal(await panel.count(), 0);
    await page.evaluate(() => { selectCanvasNode(qaA); return openCanvasInlineCrop(qaA); });
    await page.screenshot({ path: path.join(output, `${width}-crop.png`) });
    await page.evaluate(() => selectCanvasNode(qaB)); await page.waitForTimeout(40);
    assert.equal(await page.locator('#canvasInlineCrop').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
  await check('全屏工具栏状态和工具互斥', async () => {
    await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen());
    await page.evaluate(() => { selectCanvasNode(qaA); addCanvasNodeToSelection(qaB); });
    assert.equal(await page.locator('#canvasPlane .flora-node-toolbar:visible, #canvasPlane .canvas-group-tools:visible').count(), 0);
    await page.screenshot({ path: path.join(output, 'fullscreen-multiple.png') });
    await page.evaluate(() => { selectCanvasNode(qaA); openCanvasAngleDialog(qaA); });
    await page.screenshot({ path: path.join(output, 'fullscreen-angle.png') });
    await page.evaluate(() => { openCanvasImageToolPanel(qaA, 'upscale'); });
    assert.equal(await page.locator('#canvasAngleDialog:visible').count(), 0);
    assert.equal(await page.locator('.flora-node-tool-panel:visible').count(), 1);
    await page.evaluate(() => document.exitFullscreen()); await page.evaluate(() => closeCanvasImageToolInteractions());
  });
  await page.screenshot({ path: path.join(output, 'initial.png') });
  await check('抠图准备中仍可裁剪扩图，后台完成不抢操作区且重开复用', async () => {
    let release; const gate = new Promise(resolve => release = resolve); let requests = 0;
    await page.route('**/api/background-removal/prepare', async r => { requests++; await gate; await r.fulfill({ json: { token: 'isolated-mask', mask_url: '/output/qa-result.png', width: 800, height: 600 } }); });
    try {
      await page.evaluate(src => { window.qaIsolated = addCanvasImage(src, '异步抠图.png', { x: 200, y: 120 }); selectCanvasNode(qaIsolated); window.qaCutoutPromise = CanvasFeatureRegistry.openTool('cutout', { node: qaIsolated }); }, png);
      for (let i = 0; i < 30 && requests === 0; i++) await page.waitForTimeout(30);
      assert.equal(requests, 1);
      await page.evaluate(() => CanvasFeatureRegistry.openTool('crop', { node: qaIsolated })); assert.equal(await page.locator('#canvasInlineCrop').count(), 1);
      await page.evaluate(() => CanvasFeatureRegistry.openTool('outpaint', { node: qaIsolated })); assert.equal(await page.locator('#canvasInlineOutpaint').count(), 1);
      release(); await page.evaluate(() => qaCutoutPromise); assert.equal(await page.locator('#canvasInlineOutpaint').count(), 1); assert.equal(await page.locator('.canvas-cutout-modal:visible').count(), 0);
      await page.evaluate(() => CanvasFeatureRegistry.openTool('cutout', { node: qaIsolated })); assert.equal(requests, 1); assert.equal(await page.locator('.cutout-export').isEnabled(), true);
      await page.evaluate(() => closeCanvasImageToolInteractions());
    } finally { release(); }
  });
  await check('工具与节点创建插件独立停用且已有节点保留', async () => {
    const result = await page.evaluate(() => {
      selectCanvasNode(qaA); CanvasFeatureRegistry.unregisterTool('cutout'); CanvasFloraNodeShell.syncToolbar(qaA);
      const cutoutHidden = qaA.querySelector('[data-flora-action="cutout"]').hidden;
      CanvasFeatureRegistry.unregisterNode('text'); CanvasFeatureRegistry.syncControls();
      const textHidden = document.querySelector('#canvasNodeMenu [data-canvas-node="text"]').hidden;
      const imageAvailable = CanvasFeatureRegistry.hasNode('image-generator');
      CanvasFeatureRegistry.registerTool({ id: 'cutout', open: ({ node, memberId }) => openCanvasCutoutWorkbench(node, memberId), close: () => BackgroundRemovalUi.close() });
      CanvasFeatureRegistry.registerNode({ id: 'text', create: (point, options) => addCanvasText(point, options) });
      return { cutoutHidden, textHidden, imageAvailable, sourcePreserved: qaA.isConnected, restored: CanvasFeatureRegistry.hasTool('cutout') && CanvasFeatureRegistry.hasNode('text') };
    });
    assert.deepEqual(result, { cutoutHidden: true, textHidden: true, imageAvailable: true, sourcePreserved: true, restored: true });
  });
  await check('抠图保存中同一来源切换裁剪不抢选择或关闭裁剪', async () => {
    let release; const gate = new Promise(resolve => release = resolve);
    await page.route('**/api/background-removal/apply', async r => { await gate; await r.fulfill({ json: { url: '/output/qa-result.png', width: 800, height: 600 } }); });
    try {
      await page.evaluate(() => { selectCanvasNode(qaIsolated); return CanvasFeatureRegistry.openTool('cutout', { node: qaIsolated }); });
      await page.locator('.cutout-export').click(); await page.evaluate(() => CanvasFeatureRegistry.openTool('crop', { node: qaIsolated }));
      release(); await page.waitForTimeout(100);
      assert.equal(await page.locator('#canvasInlineCrop').count(), 1); assert.equal(await page.evaluate(() => canvasState.selectedIds.has(qaIsolated.dataset.id)), true);
      await page.evaluate(() => closeCanvasImageToolInteractions());
    } finally { release(); }
  });
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    const result = await new Promise(resolve => { const child = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] }); let text = ''; child.stdout.on('data', d => text += d); child.stderr.on('data', d => text += d); child.on('close', code => resolve({ code, text })); });
    fs.writeFileSync(path.join(output, 'acceptance.log'), result.text); assert.equal(result.code, 0, result.text); checks.push('四宽完整acceptance通过');
  }
  const report = { checks, failures, errors }; fs.writeFileSync(path.join(output, process.env.QA_DEPLOYED === '1' ? 'deployed-report.json' : 'source-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });

