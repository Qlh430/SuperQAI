const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
 const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [], operations = [], output = path.join(__dirname, 'acceptance/node-tags'); fs.mkdirSync(output, { recursive: true });
  page.on('pageerror', error => errors.push(error.message));
  let revision = 0, definitions = null, fail = false, oldService = false;
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {} }) }));
  await page.route('**/api/canvas/boards/qa-tags/meta', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'qa-tags', revision, ...(oldService ? {} : { labelDefinitions: definitions }) }) }));
  await page.route('**/api/canvas/boards/qa-tags/viewport*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ mode: 'detail', engineVersion: 'canvas-visual-fidelity-v2', boardRevision: revision, nodes: [], connections: [], truncated: false }) }));
  await page.route('**/api/canvas/boards/qa-tags/operations', async r => {
   const body = r.request().postDataJSON();
   if (fail) return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: '没有修改此画布的权限。' }) });
   operations.push(...body.operations); for (const op of body.operations) if (op.after?.labelDefinitions !== undefined) definitions = op.after.labelDefinitions;
   await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ boardRevision: ++revision, results: body.operations.map(op => ({ operationId: op.operationId, status: 'applied', entityId: op.entityId, entityRevision: revision })) }) });
  });
  const src = process.env.GENERATOR_SOURCE;
  if (src) {
   await page.addInitScript(fs.readFileSync(path.join(src, 'canvas-node-tag-rules.js'), 'utf8') + '\n' + fs.readFileSync(path.join(src, 'flora-node-tags.js'), 'utf8'));
   for (const file of ['script.js', 'flora-node-shell.js', 'canvas-scene-layer.js', 'canvas-scene-rules.js']) await page.route(`**/${file}*`, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(src, file === 'script.js' ? 'script-before-save-bridge.js' : file), 'utf8') }));
  }
  await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' });
  if (src) await page.addStyleTag({ content: fs.readFileSync(path.join(src, 'flora-node-tags.css'), 'utf8') });
  await page.evaluate(async () => {
   await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api', 'canvas-node-text']);
   await loadCanvasBoards(); canvasState.activeBoardId = 'qa-tags'; canvasState.activeBoardPersisted = true;
   const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e';
   const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%';
   document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
   window.qaNode = addCanvasText({ x: 100, y: 80 }, { focus: false }); qaNode.dataset.qaTags = 'primary';
   canvasState.x = 360; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaNode);
  });
  const node = page.locator('[data-qa-tags="primary"]'), tag = node.locator('.flora-tag-trigger');
  assert.equal(await tag.count(), 1, '全部节点经统一挂载路径安装标签');
  await tag.click(); await page.locator('.flora-tag-picker [data-label-id="default-2"]').click();
  await page.waitForFunction(() => qaNode.dataset.nodeLabelId === 'default-2'); assert.equal(await tag.innerText(), '场景');
  const geometry = await node.evaluate(el => ({ x: el.dataset.x, y: el.dataset.y })); assert.deepEqual(geometry, { x: '100', y: '80' }, '点击按钮不移动节点');
  await page.evaluate(() => clearCanvasSelection()); await page.waitForTimeout(40); assert.equal(await tag.isVisible(), true); assert.equal(await node.locator('.flora-tag-remove').isVisible(), false);
  await page.screenshot({ path: path.join(output, 'tagged-default.png') });
  await page.evaluate(() => selectCanvasNode(qaNode)); await node.locator('.flora-tag-remove').click(); await page.waitForFunction(() => qaNode.dataset.nodeLabelId === '');
  assert.equal(definitions.length, 7, '移除绑定不删除定义');
  await page.evaluate(() => clearCanvasSelection()); await page.waitForTimeout(40); assert.equal(await tag.isVisible(), false);
  await page.evaluate(() => undoCanvasCommand()); await page.waitForFunction(() => qaNode.dataset.nodeLabelId === 'default-2'); assert.equal(await tag.isVisible(), true);
  await page.evaluate(() => selectCanvasNode(qaNode)); await tag.click(); await page.getByRole('button', { name: '管理标签', exact: true }).click();
  let dialog = page.locator('.flora-tag-manager');
  await dialog.getByRole('textbox', { name: '标签名称', exact: true }).fill('雪景'); await dialog.getByRole('textbox', { name: '十六进制颜色' }).fill('#2255AA'); await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => FloraNodeTags.resolve('default-2')?.name === '雪景');
  assert.equal(await tag.innerText(), '雪景');
  await dialog.getByRole('button', { name: '关闭标签管理' }).click();
  const saved = await node.evaluate(el => serializeCanvasNode(el)); assert.equal(saved.nodeLabelId, 'default-2');
  await page.evaluate(item => { document.activeElement?.blur(); canvasState.clipboard = { nodes: [item], connections: [] }; pasteCanvasNodes({ preventDefault() {} }); window.qaCopy = getSelectedCanvasNodes()[0]; }, saved);
  assert.equal(await page.evaluate(() => qaCopy.dataset.nodeLabelId), 'default-2');
  await page.evaluate(() => { unmountCanvasVirtualNode(qaCopy.dataset.id, qaCopy); selectCanvasNode(qaNode); });
  await tag.click(); await page.getByRole('button', { name: '管理标签', exact: true }).click();
  await dialog.getByRole('button', { name: '删除标签', exact: true }).click(); assert.equal(await tag.innerText(), '雪景', '确认前不删除');
  await dialog.getByRole('button', { name: '确认删除标签' }).click(); await page.waitForFunction(() => !FloraNodeTags.resolve('default-2'));
  await dialog.getByRole('button', { name: '关闭标签管理' }).click(); assert.equal(await tag.getAttribute('aria-label'), '添加标签');
  await page.evaluate(() => undoCanvasCommand()); await page.waitForFunction(() => FloraNodeTags.resolve('default-2')?.name === '雪景'); assert.equal(await tag.innerText(), '雪景', '撤销删除定义恢复全部引用');
  await tag.click(); await page.getByRole('button', { name: '＋ 新建标签' }).click();
  await dialog.getByRole('textbox', { name: '标签名称', exact: true }).fill('自定义参考'); await dialog.getByRole('button', { name: '保存并添加到节点' }).click();
  await page.waitForFunction(() => document.querySelector('[data-qa-tags="primary"] .flora-tag-name')?.textContent === '自定义参考');
  assert.equal(await dialog.count(), 0, '新建并绑定后关闭管理界面');
  await page.evaluate(() => { window.qaRestored = restoreCanvasBoardNode({ ...serializeCanvasNode(qaNode), id: 'qa-tag-restored' }, {}, { maxId: 0 }); selectCanvasNode(qaRestored); });
  assert.equal(await page.locator('[data-id="qa-tag-restored"] .flora-tag-name').innerText(), '自定义参考');
  await page.evaluate(() => { unmountCanvasVirtualNode(qaRestored.dataset.id, qaRestored); selectCanvasNode(qaNode); });
  for (const width of [390, 768, 1440, 1728]) {
   await page.setViewportSize({ width, height: 1050 });
   await page.evaluate(width => { canvasState.scale = width === 390 ? .65 : 1; canvasState.x = width / 2 - 300 * canvasState.scale; applyCanvasTransformNow(); selectCanvasNode(qaNode); }, width);
   await page.screenshot({ path: path.join(output, `${width}-selected.png`) }); await tag.hover(); await page.screenshot({ path: path.join(output, `${width}-hover.png`) }); await tag.focus(); await page.screenshot({ path: path.join(output, `${width}-focus.png`) });
   await tag.click(); const picker = page.locator('.flora-tag-picker'); let box = await picker.boundingBox(); assert.ok(box.x >= 15 && box.x + box.width <= width - 15); await page.screenshot({ path: path.join(output, `${width}-picker.png`) });
   await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); assert.equal(await picker.count(), 0);
   await tag.click(); await page.getByRole('button', { name: '管理标签', exact: true }).click(); box = await dialog.boundingBox(); assert.ok(box.x >= 15 && box.x + box.width <= width - 15);
   assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false, '标签管理无横向溢出'); await page.screenshot({ path: path.join(output, `${width}-manager.png`) });
   assert.deepEqual(await dialog.getByRole('textbox', {name:'标签名称',exact:true}).evaluate(el => ({ shadow:getComputedStyle(el).boxShadow, outlineWidth:getComputedStyle(el).outlineWidth })), {shadow:'none',outlineWidth:'2px'}, '焦点使用单层 Neon 外框');
   await dialog.getByRole('textbox', { name: '标签名称', exact: true }).fill('人物'); await dialog.getByRole('button', { name: '保存', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '标签名称已存在' }).waitFor();
   await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen()); await tag.click(); await page.getByRole('button', { name: '管理标签', exact: true }).click(); await page.screenshot({ path: path.join(output, 'fullscreen-manager.png') }); await page.keyboard.press('Escape'); await page.evaluate(() => document.exitFullscreen());
  // Real host operation failures stay visible and retain pending changes for retry.
  fail = true; await tag.click(); await page.locator('.flora-tag-picker [data-label-id="default-1"]').click(); await page.locator('.flora-tag-error').filter({ hasText: '没有修改此画布的权限' }).waitFor(); fail = false;
  await page.keyboard.press('Escape'); await page.evaluate(() => saveCanvasBoardNow());
  // Simulate the old running worker: frontend must not claim a successful save.
  oldService = true; await page.evaluate(() => { FloraNodeTags.close(); canvasTagReadyBoards.clear(); selectCanvasNode(qaNode); }); await tag.click(); await page.locator('.flora-tag-picker [data-label-id="default-3"]').click(); await page.locator('.flora-tag-error').filter({ hasText: '完全退出' }).waitFor(); await page.keyboard.press('Escape'); oldService = false;
  await page.evaluate(() => { FloraNodeTags.hydrate({ id: 'another-board', labelDefinitions: [] }); clearCanvasSelection(); }); assert.equal(await tag.isVisible(), false);
  await page.evaluate(() => selectCanvasNode(qaNode)); await tag.click(); await page.getByText('还没有标签，点击“新建标签”添加。').waitFor(); await page.keyboard.press('Escape');
  const kinds = ['text', 'note', 'upload', 'video', 'audio', 'generator', 'midjourney', 'comfy', 'llm', 'minimax-h3', 'video-api', 'director-3d', 'loop', 'gallery', 'asset-collection', 'video-output', 'grid-editor', 'group', 'gallery-container'];
  await page.evaluate(async () => { await AiOsModuleLoader.ensure(['canvas-node-note', 'canvas-node-media', 'canvas-node-asset-collection', 'canvas-node-llm', 'canvas-node-loop', 'canvas-node-video-output', 'canvas-node-director3d', 'canvas-node-gallery', 'canvas-node-grid-editor', 'canvas-node-midjourney', 'canvas-node-minimax-h3']); FloraNodeTags.hydrate(null); });
  for (const kind of kinds) {
   await page.evaluate(kind => {
    window.qaKind = restoreCanvasBoardNode({ id: `qa-kind-${kind}`, kind, x: 100, y: 80, width: 400, height: 400, nodeLabelId: 'default-2' }, {}, { maxId: 0 }); clearCanvasSelection();
   }, kind);
   const candidate = page.locator(`[data-id="qa-kind-${kind}"]`);
   await candidate.locator(':scope > .flora-node-tag .flora-tag-name').waitFor(); assert.equal(await candidate.locator('.flora-tag-name').innerText(), '场景', `${kind} 恢复标签`);
   await page.evaluate(() => selectCanvasNode(qaKind)); assert.equal(await candidate.locator('.flora-tag-remove').isVisible(), true);
   await page.evaluate(() => unmountCanvasVirtualNode(qaKind.dataset.id, qaKind));
  }
  // The scene renderer keeps classification when DOM nodes are virtualised.
  await page.evaluate(() => { const canvas = document.createElement('canvas'); const layer = new CanvasSceneLayer({ canvas }); layer.resize(400, 300); layer.render({ visualNodes: [{ id: 'scene-tag', kind: 'text', x: 10, y: 80, width: 180, height: 180, nodeLabelId: 'default-2' }], transform: { x: 0, y: 0, scale: 1 }, resolveNodeLabel: item => FloraNodeTags.resolve(item.nodeLabelId) }); window.qaScenePixel = [...canvas.getContext('2d').getImageData(170, 60, 1, 1).data]; });
  assert.ok(await page.evaluate(() => qaScenePixel[1] > qaScenePixel[0] && qaScenePixel[3] > 0), '场景层绘制绿色标签');
  await page.evaluate(() => saveCanvasBoardNow());
  const persistedCustom = definitions.find(label => label.name === '自定义参考'); assert.ok(persistedCustom);
  await page.evaluate(() => openCanvasBoardFromHistory({ id: 'qa-tags', title: '缓存标题', revision: 0, labelDefinitions: null }));
  assert.equal(await page.evaluate(id => FloraNodeTags.resolve(id)?.name, persistedCustom.id), '自定义参考', '从缓存列表重新打开画布也要读取已保存标签');
  await page.evaluate(() => { window.qaDetached = addCanvasText({ x: 100, y: 80 }, { focus: false }); window.qaSurvivor = addCanvasText({ x: 600, y: 80 }, { focus: false }); qaDetached.remove(); selectCanvasNode(qaSurvivor); });
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => qaDetached.querySelector('.flora-node-tag')), null, '旧路径直接删除节点后不重建标签控件');
  await page.evaluate(() => unmountCanvasVirtualNode(qaSurvivor.dataset.id, qaSurvivor));
  await page.evaluate(() => createNewCanvasBoard('标签库隔离测试'));
  assert.equal(await page.evaluate(() => FloraNodeTags.definitions().length), 7, '新画布独立初始化默认库');
  assert.equal(await page.evaluate(() => FloraNodeTags.definitions().some(label => label.name === '自定义参考')), false, '新画布不继承上一画布自定义标签');
  assert.deepEqual(errors, []); assert.ok(operations.some(op => op.type === 'board.patch' && op.after.labelDefinitions)); assert.ok(operations.some(op => op.type === 'node.upsert' && op.after.nodeLabelId === ''));
  console.log(JSON.stringify({ ok: true, widths: [390,768,1440,1728], nodeKinds: kinds.length, screenshots: 22, errors, persistenceOperations: operations.length }));
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1 });
