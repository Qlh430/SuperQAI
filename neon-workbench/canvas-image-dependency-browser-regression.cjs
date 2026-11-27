const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const Module = require('node:module')
const { Worker } = require('node:worker_threads')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const portable = path.join(root, 'AI-OS-Portable-1.0.5-win-x64')
const diagnostic = JSON.parse(fs.readFileSync(path.join(portable, 'data/.logs/runtime-diagnostics.json')))
const app = diagnostic.appRoot

async function run() {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-image-dependency-'))
  const worker = new Worker(path.join(app, 'canvas-db-worker.js'), {
    workerData: { dbPath: path.join(evidence, 'canvas.db') },
  })
  const waiting = new Map()
  let sequence = 0
  worker.on('message', message => {
    const pending = waiting.get(message.id)
    if (!pending) return
    waiting.delete(message.id)
    message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error?.message))
  })
  worker.on('error', error => { for (const item of waiting.values()) item.reject(error); waiting.clear() })
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  const boardId = 'qa-image-dependency'
  await rpc('createBoard', { id: boardId, title: '隔离图片串联验收' })
  const sourceFiles = {
    'script.js': path.join(__dirname, 'design-sources/script-before-save-bridge.js'),
    ...Object.fromEntries([
      'canvas-agent-capabilities.js',
      'canvas-agent-tool-adapters.js',
      'canvas-agent-core.js',
      'canvas-agent-ui.js',
    ].map(name => [name, path.join(root, 'host-sources/app', name)])),
  }
  const server = http.createServer((req, res) => {
    let file
    try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html' }
    catch { res.writeHead(400).end(); return }
    if (/^output\/qa-[\w-]+\.svg$/.test(file)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' })
        .end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#777"/></svg>')
      return
    }
    const target = sourceFiles[file] || path.resolve(app, file)
    if (!sourceFiles[file] && !target.startsWith(app + path.sep)) { res.writeHead(403).end(); return }
    try {
      const bytes = fs.readFileSync(target)
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(target)]
      res.writeHead(200, { 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
    } catch { res.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(edge) ? edge : undefined })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const pageErrors = []
  const imageJobRequests = []
  let imageJobStartedResolve
  let releaseImageJob
  const imageJobStarted = new Promise(resolve => { imageJobStartedResolve = resolve })
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  await page.addInitScript(() => {
    window.NeonCanvasPerformanceFlags = { representationManager: false, detailHydration: false, detailCulling: false }
  })
  await page.routeWebSocket('**/*', ws => ws.close())
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/operations') && request.method() === 'POST') {
      try { return route.fulfill({ json: await rpc('applyOperations', { boardId, ...request.postDataJSON() }) }) }
      catch (error) { return route.fulfill({ status: 400, json: { error: error.message } }) }
    }
    if (url.pathname === '/api/image-jobs' && request.method() === 'POST') {
      imageJobRequests.push(request.postDataJSON())
      imageJobStartedResolve()
      await new Promise(resolve => { releaseImageJob = resolve })
      return route.fulfill({ status: 503, json: { error: '隔离验收已拦截图片任务；未连接模型服务。' } })
    }
    return route.fulfill({ json: {
      authenticated: false, boards: [], projects: [], resources: [], records: [],
      models: [], imageModels: [], providers: [], preferences: {}, settings: {},
    } })
  })

  const setup = async () => {
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' })
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-agent-tool-adapters'])
      await loadCanvasBoards()
      canvasState.activeBoardId = id
      canvasState.activeBoardPersisted = true
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      document.body.append(surface)
      surface.append(document.querySelector('#canvasView'))
      document.querySelector('#canvasView').hidden = false
      document.querySelector('#canvasView').classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
    }, boardId)
  }

  try {
    await setup()
    const created = await page.evaluate(async () => {
      const broker = CanvasAgentBroker.createBroker({
        getCurrentBoardId: () => canvasState.activeBoardId,
        adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
      })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-image-chain' })
      let seq = 0
      const call = (name, args) => broker.execute(scope, { name, call_id: String(++seq), arguments: args })
      const fixture = '[image omitted]' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#777"/></svg>')
      const asset = addCanvasAssetCollection({ x: 100, y: 100 }, {
        title: '隔离商品参考图', mode: 'single',
        members: [{ id: 'qa-product', kind: 'image', src: fixture, name: '隔离商品参考图', source: 'upload' }],
      })
      asset.dataset.boardId = canvasState.activeBoardId
      const first = await call('create_image_node', {
        title: '上游图片生成', prompt: '依据商品参考图片生成标准白底正反面视图，保持款式、颜色、纽扣、面料与轮廓一致。',
        reference_node_ids: [asset.dataset.id], x: 600, y: 100,
      })
      const second = await call('create_image_node', {
        title: '下游图片生成', prompt: '仅使用上游已成功生成的标准服装图，制作写实模特上身图，保持服装细节、比例与颜色一致。',
        model: first.model || null, reference_node_ids: [first.node_id], x: 1120, y: 100,
      })
      const a = ensureCanvasNodeMounted(first.node_id)
      const b = ensureCanvasNodeMounted(second.node_id)
      const bControls = [...b.querySelectorAll('.canvas-node-prompt, .canvas-node-model, .canvas-node-size, .canvas-node-resolution')]
        .map(control => ({ className: control.className, disabled: control.disabled, readOnly: Boolean(control.readOnly) }))
      const before = {
        first, second, edgeCount: canvasState.connections.length,
        edgeExists: canvasState.connections.some(edge => edge.from === first.node_id && edge.to === second.node_id),
        bControls, bStatus: b.querySelector('.canvas-node-status')?.textContent || '',
        result: await call('run_canvas_node', { node_id: second.node_id }),
        refs: getCanvasIncomingRefs(second.node_id),
      }
      await saveCanvasBoardNow()
      return {
        ...before, snapshot: serializeCanvasBoard(),
        firstId: first.node_id, secondId: second.node_id, assetId: asset.dataset.id,
      }
    })
    assert.equal(created.first.ok, true, 'Agent creates upstream image generator')
    assert.equal(created.second.ok, true, 'Agent creates downstream image generator')
    assert.equal(created.edgeExists, true, 'Agent-created image dependency is a persisted canvas edge')
    assert.equal(created.result.code, 'upstream_image_pending', 'Agent run reports dependency wait')
    assert.match(created.bStatus, /等待上游图片生成成功/)
    assert.equal(created.refs.length, 0, 'empty upstream contributes no reference URL')
    assert.ok(created.bControls.length >= 4 && created.bControls.slice(0, 3).every(control => !control.disabled && !control.readOnly)
      && !created.bControls[3].readOnly,
      `prompt, model, size and resolution stay configurable while waiting: ${JSON.stringify(created.bControls)}`)
    assert.equal(imageJobRequests.length, 0, 'blocked downstream never requests an image task')
    const saved = {
      ...(await rpc('getBoardState', { boardId })),
      nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
      connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items,
    }
    assert.ok(saved.connections.some(edge => edge.from === created.firstId && edge.to === created.secondId),
      'SQLite contains the source dependency')

    const outcome = await page.evaluate(async ({ firstId, secondId }) => {
      const broker = CanvasAgentBroker.createBroker({
        getCurrentBoardId: () => canvasState.activeBoardId,
        adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
      })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-image-chain-retry' })
      const a = ensureCanvasNodeMounted(firstId)
      const b = ensureCanvasNodeMounted(secondId)
      const c = await broker.execute(scope, { name: 'create_image_node', call_id: 'third', arguments: {
        title: '下游再下游', prompt: '仅使用上游最新成功图片，保留商品特征。',
        reference_node_ids: [secondId], x: 1600, y: 100,
      } })
      const child = ensureCanvasNodeMounted(c.node_id)
      const old = '/output/qa-old-result.svg'
      appendCanvasGenerationToGallery(a, { src: old, savedUrl: old, name: '隔离旧结果' })
      setCanvasImageDependencyState(a, 'completed')
      refreshCanvasConnectedNodes(firstId)
      const firstResolved = getCanvasIncomingRefs(secondId)[0]?.url

      window.qaUpstreamRun = runCanvasImageEdit(a, { autoFailover: false })
      return { c, old, firstResolved, edgeCount: canvasState.connections.length }
    }, { firstId: created.firstId, secondId: created.secondId })
    assert.equal(outcome.firstResolved, outcome.old, 'successful upstream result becomes the actual image input')
    await imageJobStarted
    const duringRetry = await page.evaluate(({ secondId, childId, firstId }) => {
      const a = ensureCanvasNodeMounted(firstId)
      return {
        refs: getCanvasIncomingRefs(secondId),
        pending: getCanvasPendingImageReferenceIds(secondId),
        childPending: getCanvasPendingImageReferenceIds(childId),
        sourceState: { ...a.dataset },
      }
    }, { firstId: created.firstId, secondId: created.secondId, childId: outcome.c.node_id })
    assert.equal(duringRetry.refs.length, 0, 'regeneration hides the previous result while request is in flight')
    assert.deepEqual(duringRetry.pending, [created.firstId])
    assert.deepEqual(duringRetry.childPending, [created.secondId], 'wait propagates through the intermediate image node')
    releaseImageJob()
    const failureResult = await page.evaluate(async () => window.qaUpstreamRun)
    const afterFailure = await page.evaluate(({ firstId, secondId }) => {
      const a = ensureCanvasNodeMounted(firstId)
      return {
        state: a.dataset.imageDependencyState,
        refs: getCanvasIncomingRefs(secondId),
        pending: getCanvasPendingImageReferenceIds(secondId),
      }
    }, { firstId: created.firstId, secondId: created.secondId })
    await page.evaluate(async () => saveCanvasBoardNow())
    const imageStateSaved = await page.evaluate(firstId => serializeCanvasNode(ensureCanvasNodeMounted(firstId)).imageDependencyState, created.firstId)
    assert.equal(failureResult.ok, false, 'intercepted upstream generation fails without producing an image')
    assert.equal(afterFailure.state, 'failed', JSON.stringify(afterFailure))
    assert.equal(afterFailure.refs.length, 0, 'failed regeneration cannot reuse the old image')
    assert.deepEqual(afterFailure.pending, [created.firstId])
    assert.equal(imageStateSaved, 'failed', 'failure state is serialized')

    const retried = await page.evaluate(async ({ firstId, secondId, childId }) => {
      const a = ensureCanvasNodeMounted(firstId)
      const b = ensureCanvasNodeMounted(secondId)
      appendCanvasGenerationToGallery(a, { src: '/output/qa-retry-result.svg', savedUrl: '/output/qa-retry-result.svg', name: '隔离重试结果' })
      setCanvasImageDependencyState(a, 'completed')
      refreshCanvasConnectedNodes(firstId)
      const afterUpstreamRetry = {
        refs: getCanvasIncomingRefs(secondId).map(ref => ref.url),
        pending: getCanvasPendingImageReferenceIds(secondId),
        childRefs: getCanvasIncomingRefs(childId).map(ref => ref.url),
        edgeCount: canvasState.connections.length,
      }
      appendCanvasGenerationToGallery(b, { src: '/output/qa-second-stage-result.svg', savedUrl: '/output/qa-second-stage-result.svg', name: '隔离第二阶段结果' })
      setCanvasImageDependencyState(b, 'completed')
      refreshCanvasConnectedNodes(secondId)
      const afterRetry = {
        ...afterUpstreamRetry,
        childRefs: getCanvasIncomingRefs(childId).map(ref => ref.url),
        childPending: getCanvasPendingImageReferenceIds(childId),
      }
      await saveCanvasBoardNow()
      return afterRetry
    }, { firstId: created.firstId, secondId: created.secondId, childId: outcome.c.node_id })
    assert.deepEqual(retried.refs, ['/output/qa-retry-result.svg'], 'retry exposes the new result')
    assert.deepEqual(retried.childRefs, ['/output/qa-second-stage-result.svg'], 'later stage uses its direct upstream result')
    assert.deepEqual(retried.pending, [])
    assert.deepEqual(retried.childPending, [])
    assert.equal(retried.edgeCount, outcome.edgeCount, 'retry preserves existing edges')
    assert.equal(imageJobRequests.length, 1, 'only upstream task probe reached the intercepted stub')
    assert.equal(imageJobRequests[0].node_id, created.firstId)

    const finalSaved = {
      ...(await rpc('getBoardState', { boardId })),
      nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
      connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items,
    }
    assert.ok(finalSaved.connections.some(edge => edge.from === created.firstId && edge.to === created.secondId),
      'SQLite contains the source dependency')

    await setup()
    const restored = await page.evaluate(async ({ finalSaved, firstId, secondId }) => {
      await openCanvasBoardFromHistory(finalSaved)
      const a = ensureCanvasNodeMounted(firstId)
      const b = ensureCanvasNodeMounted(secondId)
      return {
        edge: canvasState.connections.some(item => item.from === firstId && item.to === secondId),
        refs: getCanvasIncomingRefs(secondId),
        pending: getCanvasPendingImageReferenceIds(secondId),
        status: b.querySelector('.canvas-node-status')?.textContent || '',
        prompt: b.querySelector('.canvas-node-prompt')?.value || '',
        modelDisabled: Boolean(b.querySelector('.canvas-node-model')?.disabled),
        sourceState: a.dataset.imageDependencyState,
        sourceResult: a.dataset.resultSrc,
      }
    }, { finalSaved, firstId: created.firstId, secondId: created.secondId })
    assert.equal(restored.edge, true, 'edge restores from isolated SQLite snapshot')
    assert.deepEqual(restored.pending, [], `successful retry remains resolved after refresh: ${JSON.stringify(restored)}`)
    assert.deepEqual(restored.refs.map(ref => ref.url), ['/output/qa-retry-result.svg'])
    assert.equal(restored.sourceResult, '/output/qa-retry-result.svg')
    assert.match(restored.prompt, /仅使用上游已成功生成/)
    assert.equal(restored.modelDisabled, false)
    assert.equal(restored.sourceState, 'completed')
    assert.deepEqual(pageErrors, [])
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ created, outcome, failureResult, retried, restored, imageJobRequests, pageErrors }, null, 2))
    console.log(JSON.stringify({
      ok: true, evidence, nodes: finalSaved.nodes.length, connections: finalSaved.connections.length,
      imageJobRequests: imageJobRequests.length, pageErrors,
      checks: ['agent-image-create', 'empty-edge', 'pre-run-wait', 'editable-controls', 'sqlite-save', 'result-handoff-fixture', 'regeneration-wait', 'failure-persistence', 'retry-new-result', 'downstream-propagation', 'refresh-restore', 'no-downstream-paid-call'],
    }))
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await rpc('close')
    await worker.terminate()
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
