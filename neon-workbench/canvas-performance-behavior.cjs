const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {}, success: true, operations: [] } }))
    if (process.env.PERF_SOURCE) {
      for (const file of ['flora-generator-composer.js', 'flora-node-shell.js']) await page.route(`**/${file}*`, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.PERF_SOURCE, file), 'utf8') }))
      await page.route('**/script.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.PERF_SOURCE, 'script-before-save-bridge.js'), 'utf8') }))
    }
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']); await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-perf-behavior'; canvasState.isRestoring = true
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaNodes = Array.from({ length: 8 }, (_, i) => addCanvasImageGeneratorNode({ x: i * 450, y: 50 }, { focus: false }))
      qaNodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.isRestoring = false; canvasState.hasUnsavedChanges = false
      canvasState.x = 100; canvasState.y = 90; canvasState.scale = 0.65; applyCanvasTransformNow(); selectCanvasNode(qaNodes[0])
      window.qaFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
    })
    await page.waitForTimeout(500)
    const scoped = await page.evaluate(() => {
      const original = Element.prototype.querySelector, calls = []
      Element.prototype.querySelector = function (...args) { const node = this.closest('.canvas-node'); if (node) calls.push(node.dataset.id); return original.apply(this, args) }
      try { FloraGeneratorComposer.sync(qaNodes[0]) } finally { Element.prototype.querySelector = original }
      return { unrelated: calls.filter(id => id !== qaNodes[0].dataset.id).length }
    })
    if (!process.env.PERF_BASELINE) assert.equal(scoped.unrelated, 0, '单节点同步不得扫描无关操作区')
    const motion = await page.evaluate(async () => {
      const shell = qaNodes[0].querySelector('.flora-node-shell'), original = shell.getBoundingClientRect.bind(shell)
      let measurements = 0; shell.getBoundingClientRect = () => { measurements++; return original() }
      const values = []
      for (const [x, y, scale] of [[110, 80, 0.65], [160, 60, 0.85], [-180, 70, 1.1], [90, 100, 0.3]]) {
        Object.assign(canvasState, { x, y, scale }); applyCanvasTransformNow(); await qaFrame(); await qaFrame()
        const rect = original(), paintedScale = rect.width / shell.offsetWidth
        // 操作区始终以节点为中心（不再横向夹取），宽度按节点类型取 760 / 960。
        const wide = qaNodes[0].dataset.floraKind === 'minimax-h3'
        const width = Math.min(wide ? 960 : 760, innerWidth - 32), left = rect.left + rect.width / 2 - width / 2
        const style = qaNodes[0].style
        values.push({ leftError: Math.abs(Number.parseFloat(style.getPropertyValue('--flora-composer-left')) - (left - rect.left) / paintedScale),
          topError: Math.abs(Number.parseFloat(style.getPropertyValue('--flora-composer-top')) - (rect.height + 16) / paintedScale),
          widthError: Math.abs(Number.parseFloat(style.getPropertyValue('--flora-composer-width')) - width) })
      }
      shell.getBoundingClientRect = original
      return { measurements, values }
    })
    for (const value of motion.values) for (const error of Object.values(value)) assert.ok(error < 0.5, `平移缩放后操作区位置保持原公式 ${JSON.stringify(motion)}`)
    const save = await page.evaluate(() => {
      clearTimeout(canvasState.saveTimer); canvasPagedStore.pendingOperations.clear();
      for (const node of qaNodes) canvasPersistedNodes.set(node.dataset.id, toCanvasOperationNode(syncCanvasNodeModel(node)));
      canvasState.undoStack = []; canvasState.redoStack = [];
      const node = qaNodes[0], id = node.dataset.id, before = canvasPersistedNodes.get(id);
      const original = canvasPagedStore.getPendingOperations.bind(canvasPagedStore);
      let reads = 0; canvasPagedStore.getPendingOperations = (...args) => { reads++; return original(...args) };
      const prompt = node.querySelector('.canvas-node-prompt'); prompt.value = '香蕉被人拿起剥开';
      node.dataset.x = String(Number(before.x) + 40); updateCanvasNodePosition(node);
      let first;
      try { first = collectCanvasDirtyOperations().find(op => op.entityId === id) } finally { canvasPagedStore.getPendingOperations = original }
      prompt.value += '，镜头缓慢推进'; collectCanvasDirtyOperations();
      const second = original().find(op => op.type === 'node.upsert' && op.entityId === id), undoCount = canvasState.undoStack.length;
      const undone = undoCanvasCommand(), undoX = Number(node.dataset.x), undoPrompt = canvasPagedStore.get(id)?.prompt;
      const redone = redoCanvasCommand(), redoX = Number(node.dataset.x);
      const connection = normalizeVisibleCanvasConnection({ id: 'qa-edge', from: qaNodes[0].dataset.id, to: qaNodes[1].dataset.id, fromPort: 'output', toPort: 'input' });
      canvasState.connections = [connection]; collectCanvasDirtyOperations();
      const connectionFirst = original().find(op => op.type === 'connection.upsert' && op.entityId === connection.id);
      collectCanvasDirtyOperations();
      const connectionSecond = original().find(op => op.type === 'connection.upsert' && op.entityId === connection.id);
      canvasPersistedConnections.set(connection.id, connection); canvasVisibleConnectionBaselineIds.add(connection.id);
      canvasState.connections = []; collectCanvasDirtyOperations();
      const deleted = original().find(op => op.type === 'connection.delete' && op.entityId === connection.id);
      collectCanvasDirtyOperations();
      const deletedAgain = original().find(op => op.type === 'connection.delete' && op.entityId === connection.id);
      const boardId = canvasState.activeBoardId;
      stageCanvasOperation({ type: 'board.patch', entityId: boardId, before: { title: '旧标题' }, after: { title: '新标题' } });
      const boardFirst = original().find(op => op.type === 'board.patch' && op.entityId === boardId);
      stageCanvasOperation({ type: 'board.patch', entityId: boardId, after: { labelDefinitions: [] } });
      const boardSecond = original().find(op => op.type === 'board.patch' && op.entityId === boardId);
      const duplicateNode = qaNodes[3], duplicateId = duplicateNode.dataset.id, duplicateBefore = canvasPersistedNodes.get(duplicateId);
      canvasPagedStore.stageOperation({ type: 'node.upsert', entityId: duplicateId, operationId: 'qa-first-pending', before: duplicateBefore, after: { ...duplicateBefore, prompt: '第一份待保存' } });
      canvasPagedStore.stageOperation({ type: 'node.upsert', entityId: duplicateId, operationId: 'qa-later-pending', before: { ...duplicateBefore, prompt: '较晚的基线' }, after: { ...duplicateBefore, prompt: '第二份待保存' } });
      duplicateNode.querySelector('.canvas-node-prompt').value = '当前完整提示词';
      const duplicateMerged = collectCanvasDirtyOperations().find(op => op.entityId === duplicateId);
      clearTimeout(canvasState.saveTimer);
      return { duplicateBefore, duplicateMerged, reads, before, first, second, undoCount, undone, undoX, undoPrompt, redone, redoX,
        connectionFirst, connectionSecond, deleted, deletedAgain, boardFirst, boardSecond };
    });
    if (!process.env.PERF_BASELINE) assert.ok(save.reads <= 2, '保存扫描只克隆一次待提交操作列表');
    assert.equal(save.duplicateMerged.operationId, 'qa-first-pending');
    assert.deepEqual(save.duplicateMerged.before, save.duplicateBefore);
    assert.equal(save.duplicateMerged.after.prompt, '当前完整提示词');
    assert.equal(save.first.after.prompt, '香蕉被人拿起剥开');
    assert.equal(save.second.after.prompt, '香蕉被人拿起剥开，镜头缓慢推进');
    assert.equal(save.first.operationId, save.second.operationId);
    assert.deepEqual(save.second.before, save.before);
    assert.equal(save.undoCount, 1); assert.equal(save.undone, true); assert.equal(save.redone, true);
    assert.equal(save.undoX, Number(save.before.x)); assert.equal(save.undoPrompt, save.before.prompt);
    assert.equal(save.redoX, Number(save.before.x) + 40);
    assert.equal(save.connectionFirst.operationId, save.connectionSecond.operationId);
    assert.equal(save.deleted.operationId, save.deletedAgain.operationId); assert.deepEqual(save.deleted.before, save.connectionFirst.after);
    assert.equal(save.boardFirst.operationId, save.boardSecond.operationId);
    assert.deepEqual(save.boardSecond.before, save.boardFirst.before);
    assert.deepEqual(save.boardSecond.after, { title: '新标题', labelDefinitions: [] });
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, scoped, motion, save: { reads: save.reads, prompt: save.second.after.prompt, undoRedo: true, stableOperationIds: true, connectionMerge: true, boardMerge: true }, errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })

