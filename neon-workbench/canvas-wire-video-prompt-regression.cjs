const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { DatabaseSync } = require('node:sqlite')
const { Worker } = require('node:worker_threads')
const { chromium } = require('playwright')

const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-wire-video-prompt-'))
const diagnostics = JSON.parse(fs.readFileSync(path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json')))
const testTitle = '服装 Skill 真实 Agent 验收 2026-11-21'
const db = new DatabaseSync(path.join(diagnostics.dataDirectory, 'canvas.db'), { readOnly: true })
const record = db.prepare('SELECT pk, external_id, viewport_json FROM boards WHERE title=? AND deleted_at IS NULL').get(testTitle)
assert.ok(record, '存在可只读复制的服装验收画布')
const nodes = db.prepare('SELECT payload_json FROM nodes WHERE board_pk=? ORDER BY z_order').all(record.pk).map(row => JSON.parse(row.payload_json))
const connections = db.prepare('SELECT payload_json FROM connections WHERE board_pk=?').all(record.pk).map(row => JSON.parse(row.payload_json))
db.close()
const original = { id: 'qa-wire-video-prompt', title: '服装工作流 · 隔离验收', nodes, connections, viewport: JSON.parse(record.viewport_json) }
const video = nodes.find(node => node.kind === 'minimax-h3')
const text = nodes.find(node => node.kind === 'text')
const modelId = video.refOrder[0].split(':')[1]
const standardId = video.refOrder[1].split(':')[1]
const ids = { video: video.id, text: text.id, model: modelId, standard: standardId, source: connections.find(edge => edge.to === standardId).from }
const mediaUrl = nodes.find(node => node.id === ids.source).imageSrc
assert.ok(/^\/output\/[^/\\]+\.jpg$/i.test(mediaUrl))
const media = fs.readFileSync(path.join(diagnostics.dataDirectory, 'output', path.basename(mediaUrl)))
const bodies = []
const source = !process.argv.includes('--deployed') && !process.argv.includes('--before')
const before = process.argv.includes('--before')
const baseline = process.env.AI_OS_WIRE_BASELINE
const errors = []
const unexpectedRequests = []

async function main() {
  const worker = new Worker(path.join(diagnostics.appRoot, 'canvas-db-worker.js'), {
    workerData: { dbPath: path.join(evidence, 'isolated.db') },
  })
  let sequence = 0
  const waiters = new Map()
  worker.on('message', ({ id, ok, result, error }) => {
    const waiter = waiters.get(id)
    if (!waiter) return
    waiters.delete(id)
    if (ok) waiter.resolve(result)
    else waiter.reject(new Error(error?.message))
  })
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    waiters.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  await rpc('createBoard', { id: original.id, title: original.title })
  await rpc('applyOperations', { boardId: original.id, baseRevision: 0, operations: [
    ...original.nodes.map(node => ({ type: 'node.upsert', entityId: node.id, after: node })),
    ...original.connections.map(edge => ({ type: 'connection.upsert', entityId: edge.id, after: edge })),
  ].map((operation, index) => ({ ...operation, operationId: `fixture-${index}` })) })
  original.revision = (await rpc('getBoardState', { boardId: original.id })).revision
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.routeWebSocket('**/*', socket => socket.close())
    await page.route(url => url.pathname === mediaUrl, route => route.fulfill({ contentType: 'image/jpeg', body: media }))
    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.pathname === '/api/image-thumbnails' && url.searchParams.get('source') === mediaUrl) {
        return route.fulfill({ json: { item: { source: mediaUrl, thumbnailUrl: mediaUrl } } })
      }
      if (request.method() === 'POST') {
        if (url.pathname === `/api/canvas/boards/${original.id}/operations`) {
          return route.fulfill({ json: await rpc('applyOperations', { boardId: original.id, ...request.postDataJSON() }) })
        }
        if (url.pathname === '/api/minimax-h3-video') {
          bodies.push(request.postDataJSON())
          return route.fulfill({ status: 503, json: { error: '隔离验收已截获生成请求' } })
        }
        if (['/api/canvas-agent/conversation', '/api/online'].includes(url.pathname)) return route.fulfill({ json: {} })
        unexpectedRequests.push(url.pathname)
        return route.fulfill({ status: 503, json: { error: '未授权的验收请求' } })
      }
      if (url.pathname.startsWith(`/api/canvas/boards/${original.id}/`)) {
        const scope = { boardId: original.id }
        const state = await rpc('getBoardState', scope)
        const nodes = (await rpc('exportBoardPage', { ...scope, entity: 'nodes', limit: 100 })).items
        if (url.pathname.endsWith('/node')) return route.fulfill({ json: { node: nodes.find(node => node.id === url.searchParams.get('nodeId')) } })
        const connections = (await rpc('exportBoardPage', { ...scope, entity: 'connections', limit: 100 })).items
        return route.fulfill({ json: { ...state, id: original.id, mode: 'detail', complete: true,
          engineVersion: 'canvas-visual-fidelity-v2', boardRevision: state.revision, nodes, connections } })
      }
      return route.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], models: [], providers: [] } })
    })
    if (source || (before && baseline)) for (const [served, file] of [
      ['script.js', 'script-before-save-bridge.js'],
      ['flora-generator-composer.js', 'flora-generator-composer.js'],
      ['canvas-scene-layer.js', 'canvas-scene-layer.js'],
    ]) {
      await page.route(`**/${served}*`, route => route.fulfill({
        path: before ? path.join(baseline, served) : path.join(__dirname, 'design-sources', file), contentType: 'application/javascript',
      }))
    }
    const open = async board => {
      await page.goto('http://127.0.0.1:33200/', { waitUntil: 'domcontentloaded' })
      await page.evaluate(async ({ board, ids }) => {
        await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-text', 'canvas-node-minimax-h3', 'canvas-node-asset-collection'])
        const surface = document.createElement('div')
        surface.id = 'neonEngineSurface'
        surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'
        const view = document.querySelector('#canvasView')
        surface.append(view); document.body.append(surface)
        view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
        document.querySelector('#canvasEditorScreen').hidden = false
        document.body.classList.add('canvas-surface-open')
        restoreCanvasBoard(board)
        showCanvasEditor()
        canvasState.activeBoardPersisted = true
        canvasState.activeBoardRevision = board.revision || 0
        canvasPagedStore.boardRevision = canvasState.activeBoardRevision
        // The full SQLite fixture is resident. Prevent viewport requests during
        // fit/zoom from replacing the board with a redundant partial-page stub.
        canvasPagedStore.rememberCoverage({ left: -10000, top: -10000, right: 10000, bottom: 10000 }, false)
        canvasState.scale = .57
        canvasState.x = 90 - board.nodes.find(node => node.id === ids.source).x * canvasState.scale
        canvasState.y = 110 - board.nodes.find(node => node.id === ids.standard).y * canvasState.scale
        applyCanvasTransformNow()
        Object.values(ids).forEach(id => ensureCanvasNodeMounted(id))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        canvasConnectionRenderSignature = ''
        renderCanvasConnections()
      }, { board, ids })
    }
    const geometry = () => page.evaluate(ids => {
      const keys = [[ids.source, ids.standard], [ids.standard, ids.model], [ids.model, ids.video], [ids.standard, ids.video], [ids.text, ids.video]]
      return keys.map(([source, target]) => {
        const selector = `.canvas-connection-hit[data-connection-from="${source}"][data-connection-to="${target}"]`
        const wire = document.querySelector(selector)
        if (!wire) throw new Error(`没有绘制连线 ${source} → ${target} ${JSON.stringify({
          viewport: getCachedCanvasViewportSize(document.querySelector('#infiniteCanvas')),
          scale: canvasState.scale, visible: getVisibleCanvasConnections().map(entry => entry.key),
          connections: canvasState.connections.length, bounds: Object.values(ids).map(getCanvasConnectionNodeBox),
        })}`)
        const length = wire.getTotalLength()
        const start = wire.getPointAtLength(0), end = wire.getPointAtLength(length)
        const expectedStart = clampCanvasWireEndpoint(getCanvasConnectionPortPoint(source, 'output'), source)
        const expectedEnd = clampCanvasWireEndpoint(getCanvasConnectionPortPoint(target, 'input'), target)
        const obstacles = Object.values(ids).map(id => [id, getCanvasConnectionNodeBox(id)])
        const middle = obstacles.find(([id]) => id === ids.model)[1]
        const aroundMiddle = Math.min(...[middle.top, middle.bottom].map(y =>
          Math.hypot(start.x - middle.left, start.y - y) + middle.right - middle.left + Math.hypot(end.x - middle.right, end.y - y)))
        const crosses = new Set()
        for (let i = 1; i < 350; i++) {
          const p = wire.getPointAtLength(length * i / 350)
          for (const [id, box] of obstacles) {
            if (p.x > box.left + 1 && p.x < box.right - 1 && p.y > box.top + 1 && p.y < box.bottom - 1) crosses.add(id)
          }
        }
        return { path: wire.getAttribute('d'), length, direct: Math.hypot(end.x - start.x, end.y - start.y),
          portError: Math.hypot(start.x - expectedStart.x, start.y - expectedStart.y) + Math.hypot(end.x - expectedEnd.x, end.y - expectedEnd.y),
          crosses: [...crosses], aroundMiddle }
      })
    }, ids)
    await open(original)
    await page.waitForFunction(url => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === url), mediaUrl, { timeout: 5000 })
    const initial = await geometry()
    await page.screenshot({ path: path.join(evidence, 'wires.png') })
    await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), ids.video)
    const prompt = page.locator('.flora-generator-composer .canvas-h3-prompt')
    await prompt.waitFor({ state: 'attached' })
    await page.screenshot({ path: path.join(evidence, 'video-prompt.png') })
    const own = await prompt.inputValue()
    console.log(JSON.stringify({ evidence, initial, ownLength: own.length, before }))
    if (before) {
      assert.ok(own.length > 0 && initial.some(line => line.crosses.length), '原版同时复现重复显示及连线穿越')
      fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ initial, ownLength: own.length, reproduced: true }, null, 2))
      console.log(JSON.stringify({ evidence, reproduced: true }))
      return
    }
    assert.equal(own, '', '已确认的旧系统副本不得出现在补充输入区')
    assert.ok(initial.every(line => line.crosses.length === 0 && line.portError < 1), JSON.stringify(initial))
    assert.equal(await page.locator('.flora-reference-materials').getByText('已引用：视频生成提示词', { exact: true }).count(), 0)
    assert.ok(initial.slice(0, 3).every(line => line.path.includes(' C ') && line.length - line.direct < 8), '无遮挡的主流程使用短贝塞尔曲线')
    assert.ok(initial[3].path.includes(' Q ') && initial[4].path.includes(' Q '), '需要避让的转角用曲线连接')
    assert.ok(initial[3].length - initial[3].aroundMiddle < 40, '绕行应贴近阻挡节点')
    const linked = page.getByRole('button', { name: '文本1：视频生成提示词', exact: true })
    await linked.click()
    assert.ok(await page.locator(`[data-id="${ids.text}"].is-selected`).count())
    assert.deepEqual((await geometry()).map(line => line.path), initial.map(line => line.path))
    await page.evaluate(id => {
      const source = ensureCanvasNodeMounted(id)
      const editor = source.querySelector('.canvas-text')
      editor.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      renderCanvasConnectionsNow()
    }, ids.text)
    assert.deepEqual((await geometry()).map(line => line.path), initial.map(line => line.path))
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(async id => {
      await saveCanvasBoardNow()
      return serializeCanvasBoard().nodes.find(node => node.id === id).minimaxH3Prompt
    }, ids.video), '')
    const migrated = (await rpc('exportBoardPage', { boardId: original.id, entity: 'nodes', limit: 100 })).items.find(node => node.id === ids.video)
    assert.equal(migrated.minimaxH3Prompt, '')
    assert.equal(decodeURIComponent(migrated.agentNodeIdentityKey.split('|')[3]), '')

    await page.evaluate(({x, y}) => {
      canvasState.scale = .68
      canvasState.x = 90 - x * canvasState.scale
      canvasState.y = 110 - y * canvasState.scale
      applyCanvasTransformNow()
      renderCanvasConnectionsNow()
    }, nodes.find(node => node.id === ids.source))
    assert.deepEqual((await geometry()).map(line => line.path), initial.map(line => line.path))

    await page.evaluate(ids => {
      const model = ensureCanvasNodeMounted(ids.model)
      setCanvasNodePoint(model, { x: Number(model.dataset.x), y: Number(model.dataset.y) - 650 })
      updateCanvasNodePosition(model)
      renderCanvasConnectionsNow({ dirtyNodeIds: new Set([ids.model]) })
    }, ids)
    const moved = await geometry()
    assert.ok(moved[3].path.includes(' C ') && moved[3].length - moved[3].direct < 8, '阻挡节点移开后同一条连线恢复短曲线')
    const resizedBox = await page.evaluate(({ id, original }) => {
      const model = ensureCanvasNodeMounted(id)
      setCanvasNodePoint(model, original)
      model.dataset.mediaSizeMode = 'manual'
      model.dataset.width = '128'
      model.dataset.height = '160'
      applyCanvasNodeSize(model)
      updateCanvasNodePosition(model)
      syncCanvasNodeModel(model)
      renderCanvasConnectionsNow({ dirtyNodeIds: new Set([id]) })
      return getCanvasConnectionNodeBox(id)
    }, { id: ids.model, original: nodes.find(node => node.id === ids.model) })
    const resized = (await geometry())[3]
    assert.ok(resized.path.includes(' C ') && resized.length - resized.direct < 8, `障碍缩小后恢复短曲线 ${JSON.stringify({ resizedBox, resized })}`)

    const supplement = '补充：保留轻微衣料摩擦声。'
    const revised = '正文已更新：先正面停留，再自然转身。'
    const second = '第二个文字来源：背景保持纯白。'
    const draft = await page.evaluate(async ({ ids, supplement, revised, second }) => {
      const target = ensureCanvasNodeMounted(ids.video)
      const field = target.querySelector('.canvas-h3-prompt')
      field.value = supplement
      field.dispatchEvent(new Event('input', { bubbles: true }))
      setCanvasTextValue(ensureCanvasNodeMounted(ids.text), revised)
      const extra = addCanvasText({ x: 3240, y: 1150 }, { text: second, focus: false })
      connectCanvasNodes(extra.dataset.id, ids.video)
      setCanvasNodeRefOrder(target, [`text:${extra.dataset.id}:output`, `text:${ids.text}:output`, ...getCanvasNodeRefOrder(target).filter(key => !key.startsWith('text:'))])
      updateCanvasNodeRefs(target)
      await saveCanvasBoardNow()
      return { snapshot: serializeCanvasBoard(), extraId: extra.dataset.id }
    }, { ids, supplement, revised, second })
    assert.equal(draft.snapshot.nodes.find(node => node.id === ids.text).text, revised)
    assert.equal(draft.snapshot.nodes.find(node => node.id === ids.video).minimaxH3Prompt, supplement)
    const stored = await rpc('getBoardState', { boardId: original.id })
    const storedNodes = (await rpc('exportBoardPage', { boardId: original.id, entity: 'nodes', limit: 100 })).items
    const storedConnections = (await rpc('exportBoardPage', { boardId: original.id, entity: 'connections', limit: 100 })).items
    assert.equal(storedNodes.find(node => node.id === ids.video).minimaxH3Prompt, supplement)
    await open({ ...draft.snapshot, revision: stored.revision, nodes: storedNodes, connections: storedConnections })
    assert.equal((await geometry())[3].path, resized.path, '刷新后尺寸及重算路径保留')
    const restored = await page.evaluate(({ ids, extraId }) => {
      const video = ensureCanvasNodeMounted(ids.video)
      const field = video.querySelector('.canvas-h3-prompt')
      const before = getCanvasGenerationPrompt(video, field.value)
      canvasVirtualizer.unmountId(ids.text)
      const after = getCanvasGenerationPrompt(video, field.value)
      return { value: field.value, before, after }
    }, { ids, extraId: draft.extraId })
    assert.deepEqual(restored, { value: supplement, before: [second, revised, supplement].join('\n\n'),
      after: [second, revised, supplement].join('\n\n') })
    const disconnected = await page.evaluate(async ({ ids, extraId }) => {
      for (const id of [ids.standard, ids.model]) {
        appendCanvasGenerationToGallery(ensureCanvasNodeMounted(id), { src: '/output/qa-transferred.jpg', name: '隔离上游素材' })
      }
      const target = ensureCanvasNodeMounted(ids.video)
      await runCanvasMinimaxH3Node(target)
      disconnectCanvasNodes(extraId, ids.video)
      const prompt = getCanvasGenerationPrompt(target, target.querySelector('.canvas-h3-prompt').value)
      await saveCanvasBoardNow()
      await runCanvasMinimaxH3Node(ensureCanvasNodeMounted(ids.video))
      return prompt
    }, { ids, extraId: draft.extraId })
    assert.equal(disconnected, [revised, supplement].join('\n\n'))
    assert.equal(bodies.length, 2)
    assert.ok(bodies[0].prompt.endsWith([second, revised, supplement].join('\n\n')))
    assert.ok(bodies[1].prompt.endsWith(disconnected) && !bodies[1].prompt.includes(second))
    for (const body of bodies) {
      assert.equal(body.prompt.split(revised).length - 1, 1)
      assert.equal(body.prompt.split(supplement).length - 1, 1)
      assert.equal(body.images.length, 2)
      assert.deepEqual([body.mode, body.aspect_ratio, body.duration], ['reference', '3:4', 6])
    }
    assert.deepEqual(unexpectedRequests, [])
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ pass: true, initial, moved, restored, disconnected, requests: bodies, errors, unexpectedRequests }, null, 2))
    console.log(JSON.stringify({ evidence, pass: true }))
  } finally {
    await browser.close()
    await worker.terminate()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
