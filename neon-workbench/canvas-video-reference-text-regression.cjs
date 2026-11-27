const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { Worker } = require('node:worker_threads')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const diagnostic = JSON.parse(fs.readFileSync(path.join(root, 'AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json')))
const runtime = diagnostic.appRoot
const stage = path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app')
const deployed = process.argv.includes('--deployed')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAE0lEQVR4nGP8//8/AwMDCwMYAAAkFAMDuxa40wAAAABJRU5ErkJggg==', 'base64')

async function main() {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-video-reference-text-'))
  const { frontendFiles } = await import('./daily-workbench.mjs')
  const source = deployed ? {} : Object.fromEntries([
    ['script.js', 'script-before-save-bridge.js'],
    ...['canvas-text-node-renderer.js', 'canvas-node-visuals.js', 'canvas-representation-host.js',
      'flora-node-shell.js', 'flora-node-shell.css', 'flora-generator-composer.js', 'neon-canvas-surface.css'].map(name => [name, name]),
  ].map(([file, input]) => [file, path.join(__dirname, 'design-sources', input)]))
  const worker = new Worker(path.join(runtime, 'canvas-db-worker.js'), { workerData: { dbPath: path.join(evidence, 'canvas.db') } })
  const pending = new Map()
  let sequence = 0
  worker.on('message', message => {
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    message.ok ? item.resolve(message.result) : item.reject(new Error(message.error?.message))
  })
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  const boardId = 'qa-video-reference-text'
  await rpc('createBoard', { id: boardId, title: '隔离视频参考与文字显示验收' })
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'
    if (/^output\/qa-.*\.png$/.test(file)) return res.writeHead(200, { 'Content-Type': 'image/png' }).end(png)
    const resourceRoot = frontendFiles.has(file) ? stage : runtime
    const target = source[file] || path.resolve(resourceRoot, file)
    if (!source[file] && !target.startsWith(resourceRoot + path.sep)) return res.writeHead(403).end()
    try {
      const bytes = fs.readFileSync(target)
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const pageErrors = [], paidRequests = [], checks = [], canvasRequests = []
  const check = (name, actual, expected = true) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
    checks.push({ name, pass, actual, expected })
  }
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/canvas/')) canvasRequests.push({ method: request.method(), path: url.pathname, query: url.search })
  })
  await page.routeWebSocket('**/*', ws => ws.close())
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: {
      authenticated: true,
      user: { id: 'qa-isolated', username: 'qa-isolated', displayName: '隔离验收', role: 'superadmin', status: 'active' },
    } })
    if (req.method() === 'POST' && /^\/api\/(?:image-jobs|videos|images|minimax-h3|generate|comfyui\/(?:run|generate))\b/.test(url.pathname)) {
      paidRequests.push(url.pathname)
      return route.fulfill({ status: 503, json: { error: '隔离验收禁止生成' } })
    }
    if (url.pathname.endsWith('/operations') && req.method() === 'POST') {
      return route.fulfill({ json: await rpc('applyOperations', { boardId, ...req.postDataJSON() }) })
    }
    if (url.pathname === '/api/canvas/boards' && req.method() === 'GET') {
      return route.fulfill({ json: { boards: [{ id: boardId, title: '隔离视频参考与文字显示验收', nodeCount: 5 }] } })
    }
    if (url.pathname.includes(`/boards/${boardId}/`) && /\/(?:viewport|nodes|meta)$/.test(url.pathname)) {
      const state = await rpc('getBoardState', { boardId })
      return route.fulfill({ json: {
        ...state, mode: 'detail', complete: true, boardRevision: state.revision, engineVersion: 'canvas-visual-fidelity-v2',
        nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
        connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items,
      } })
    }
    return route.fulfill({ json: { authenticated: false, boards: [], nodes: [], connections: [], models: [], providers: [], resources: [], projects: [], records: [], settings: {}, preferences: {} } })
  })
  const setup = async () => {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' })
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-text', 'canvas-node-minimax-h3', 'canvas-node-asset-collection', 'canvas-agent-tool-adapters'])
      await loadCanvasBoards()
      canvasState.activeBoardId = id
      canvasState.activeBoardPersisted = true
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'
      const view = document.querySelector('#canvasView')
      surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      videoModelCatalog = [{ id: 'seedance-2.0', modelId: 'seedance-2.0', modelProtocol: 'video-adapter', providerProtocol: 'openai', displayName: 'Seedance 2.0（隔离配置）' }]
      videoModelRatios = { 'seedance-2.0': ['9:16', '16:9'] }
      videoModelResolutions = { 'seedance-2.0': ['720p'] }
      videoModelDurations = { 'seedance-2.0': { min: 4, max: 15 } }
    }, boardId)
  }
  try {
    await setup()
    const created = await page.evaluate(async () => {
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-video-reference-text' })
      let sequence = 0
      const call = (name, args) => broker.execute(scope, { name, call_id: String(++sequence), arguments: args })
      const asset = addCanvasAssetCollection({ x: 40, y: 80 }, { title: '原始服装素材（本地测试夹具）', mode: 'single', members: [{ id: 'qa-original', kind: 'image', src: '/output/qa-original.png', name: '本地测试夹具', source: 'upload' }] })
      asset.dataset.boardId = canvasState.activeBoardId
      const standard = await call('create_image_node', { title: '服装正反面标准化', prompt: '仅依据本件棕色无袖连衣裙的原图，保留圆领、正面纽扣、腰带与裙摆，纯白背景，左正面右背面，完整平铺展示，无模特、无文字。背面未提供的细节仅作保守推断，不增加口袋或装饰。', reference_node_ids: [asset.dataset.id] })
      const model = await call('create_image_node', { title: 'AI 模特上身', prompt: '严格参考本件服装的正反面标准图，同一件棕色无袖连衣裙由单名成年模特正面全身展示，保留颜色、圆领、纽扣、腰带和裙摆。纯白影棚、柔和光线与真实接触阴影，双手自然垂放，不添加口袋，不改变设计。', reference_node_ids: [standard.node_id] })
      const promptText = ('纯白影棚，单名成年模特穿着本件棕色无袖连衣裙，保留圆领、正面纽扣、腰带、裙摆与面料纹理。固定机位、一镜到底，模特通过自然脚步、重心转移和髋部运动缓慢转身，依次展示正面、侧面、背面并回到正面。以模特图作为首帧；正反面图仅在通道支持时用于服装细节参考，不作为尾帧。不机械旋转，不新增口袋，不改变剪裁，不闪烁，不切镜，无文字。').repeat(6)
      const text = await call('create_text_node', { title: '自然转身视频完整提示词', content: promptText })
      // Existing non-manual text dimensions must survive representation changes.
      const legacyText = ensureCanvasNodeMounted(text.node_id)
      legacyText.dataset.width = '292'; legacyText.dataset.height = '746'
      applyCanvasNodeSize(legacyText); syncCanvasNodeModel(legacyText)
      const video = await call('create_video_node', { engine: 'api', model: 'seedance-2.0', title: '自然转身视频', prompt: promptText, reference_node_ids: [model.node_id, standard.node_id, text.node_id], aspect_ratio: '9:16', duration: 8, resolution: '720p' })
      const node = ensureCanvasNodeMounted(video.node_id)
      await saveCanvasBoardNow()
      const blocked = await runCanvasApiVideoNode(node)
      return { source: asset.dataset.id, standard, model, text, video, promptText, blocked, videoPrompt: getCanvasGenerationPrompt(node, node.dataset.apiVideoPrompt), pending: getCanvasVideoPendingDependency(node), edges: canvasState.connections, resultSources: serializeCanvasBoard().nodes.map(n => [n.id, n.resultSrc || n.generationVideoSrc || '']) }
    })
    check('five-node creation accepts workflow associations', created.video.ok)
    check('five expected relations', created.edges.length, 5)
    check('video prompt receives independent text without duplication', created.videoPrompt, created.promptText)
    check('pending upstream blocks submission', created.pending?.code, 'upstream_image_pending')
    check('manual video run blocked before provider call', created.blocked?.code, 'upstream_image_pending')
    check('no invented generated output', created.resultSources.every(([, src]) => !src))
    const state = async () => page.evaluate(id => {
      const geometry = resolveNodeVisualGeometry(id)
      const fullNode = getCanvasNode(id)
      const lightNode = document.querySelector(`[data-canvas-light-id="${CSS.escape(id)}"]`)
      const node = fullNode || lightNode
      const body = fullNode?.querySelector('.canvas-text')
      const lightBody = lightNode?.querySelector('.canvas-light-visual')
      const model = canvasVirtualStore.get(id)
      const contentBounds = geometry?.contentBounds
      const visualLayout = contentBounds && CanvasNodeVisuals.layoutRichText(
        document.createElement('canvas').getContext('2d'),
        CanvasNodeVisuals.project(model),
        contentBounds.right - contentBounds.left,
        contentBounds.bottom - contentBounds.top,
      )
      const box = element => {
        if (!element || !node) return null
        const rect = element.getBoundingClientRect(), root = node.getBoundingClientRect()
        return {
          left: Math.round((rect.left - root.left) * 100) / 100,
          top: Math.round((rect.top - root.top) * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        }
      }
      const title = fullNode?.querySelector('.flora-node-label-title') || lightNode?.querySelector('.canvas-light-title')
      const editor = body?.closest('.flora-node-editor-surface')
      return {
        geometry,
        level: CanvasNodeRepresentation.getLevel(id),
        title: title?.textContent || canvasRepresentation.resolveVisualIdentity?.(canvasVirtualStore.get(id))?.title || canvasVirtualStore.get(id)?.nodeTitle || canvasVirtualStore.get(id)?.textName,
        titleBox: box(title),
        nodeBox: node ? (() => {
          const rect = node.getBoundingClientRect()
          return { width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100 }
        })() : null,
        body: body ? {
          clientHeight: body.clientHeight,
          scrollHeight: body.scrollHeight,
          scrollTop: body.scrollTop,
          width: body.clientWidth,
          layout: box(body),
          editor: box(editor),
          overflowY: getComputedStyle(body).overflowY,
          inside: (() => {
            const bodyRect = body.getBoundingClientRect(), nodeRect = node.getBoundingClientRect()
            return bodyRect.left >= nodeRect.left - 1 && bodyRect.top >= nodeRect.top - 1
              && bodyRect.right <= nodeRect.right + 1 && bodyRect.bottom <= nodeRect.bottom + 1
          })(),
        } : lightBody ? {
          clientHeight: Math.round(lightBody.getBoundingClientRect().height),
          scrollHeight: Number(lightNode.dataset.textScrollHeight || 0),
          scrollTop: Number(lightNode.dataset.textScrollTop || 0),
          width: Math.round(lightBody.getBoundingClientRect().width),
          layout: box(lightBody),
          editor: box(lightBody.parentElement),
          overflowY: 'auto',
          inside: true,
        } : visualLayout ? {
          clientHeight: visualLayout.clientHeight,
          scrollHeight: visualLayout.scrollHeight,
          scrollTop: Number(canvasRepresentation.textScrolls.get(String(id)) || 0),
          width: Math.round((contentBounds.right - contentBounds.left) * 100) / 100,
          layout: {
            left: Math.round(contentBounds.left * 100) / 100,
            top: Math.round(contentBounds.top * 100) / 100,
            width: Math.round((contentBounds.right - contentBounds.left) * 100) / 100,
            height: Math.round((contentBounds.bottom - contentBounds.top) * 100) / 100,
          },
          editor: null,
          overflowY: 'auto',
          inside: contentBounds.left >= geometry.outerBounds.left
            && contentBounds.top >= geometry.outerBounds.top
            && contentBounds.right <= geometry.outerBounds.right
            && contentBounds.bottom <= geometry.outerBounds.bottom,
        } : null,
      }
    }, created.text.node_id)
    const visualCases = []
    for (const scale of [0.5, 1, 1.5]) {
      await page.evaluate(({ id, scale }) => {
        clearCanvasSelection()
        canvasRepresentation.intents.delete(id)
        canvasRepresentation.textScrolls.delete(id)
        const m = canvasVirtualStore.get(id)
        canvasState.x = 80 - Number(m.x) * scale; canvasState.y = 50 - Number(m.y) * scale; canvasState.scale = scale
        applyCanvasTransformNow()
        CanvasNodeRepresentation.dehydrateNode(id)
        CanvasNodeRepresentation.reconcile()
      }, { id: created.text.node_id, scale })
      await page.mouse.move(1350, 920)
      await page.waitForTimeout(850)
      const normal = await state()
      await page.screenshot({ path: path.join(evidence, `text-${scale}-normal.png`) })
      const sceneScrollPoint = await page.evaluate(id => {
        const g = resolveNodeVisualGeometry(id), viewport = document.querySelector('#infiniteCanvas')
        const rect = viewport.getBoundingClientRect(), bounds = g.contentBounds
        return {
          x: rect.left + canvasState.x + ((bounds.left + bounds.right) / 2) * canvasState.scale,
          y: rect.top + canvasState.y + ((bounds.top + bounds.bottom) / 2) * canvasState.scale,
        }
      }, created.text.node_id)
      await page.evaluate(point => {
        const viewport = document.querySelector('#infiniteCanvas')
        viewport.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, deltaY: 240, clientX: point.x, clientY: point.y,
        }))
      }, sceneScrollPoint)
      await page.waitForTimeout(450)
      const scrolled = await state()
      const point = await page.evaluate(id => {
        const g = resolveNodeVisualGeometry(id), r = document.querySelector('#infiniteCanvas').getBoundingClientRect()
        return { x: r.left + canvasState.x + (g.outerBounds.left + 80) * canvasState.scale, y: r.top + canvasState.y + (g.outerBounds.top + 80) * canvasState.scale }
      }, created.text.node_id)
      await page.mouse.move(point.x, point.y)
      await page.waitForTimeout(350)
      const hover = await state()
      await page.mouse.click(point.x, point.y)
      await page.waitForTimeout(350)
      const selected = await state()
      await page.screenshot({ path: path.join(evidence, `text-${scale}-selected.png`) })
      check(`text ${scale}: normal/hover/selected geometry stable`, [normal.geometry.outerBounds, hover.geometry.outerBounds], [selected.geometry.outerBounds, selected.geometry.outerBounds])
      check(`text ${scale}: custom title in Full`, selected.title, '自然转身视频完整提示词')
      check(`text ${scale}: title stable across representations`, [normal.title, hover.title], [selected.title, selected.title])
      check(`text ${scale}: title position stable while hovered and selected`, hover.titleBox, selected.titleBox)
      check(`text ${scale}: body layout stable while hovered and selected`, hover.body?.layout, selected.body?.layout)
      check(`text ${scale}: body remains inside node`, [normal.body?.inside, scrolled.body?.inside, hover.body?.inside, selected.body?.inside].every(Boolean))
      check(`text ${scale}: long body scrollable in every state`, [normal.body, hover.body, selected.body].every(body => body && body.scrollHeight > body.clientHeight && body.clientHeight > 100 && body.overflowY === 'auto'))
      check(`text ${scale}: unselected canvas body scrolls internally`, scrolled.body?.scrollTop > 0)
      visualCases.push({ scale, normal, hover, scrolled, selected })
    }
    const textInteraction = await page.evaluate(async id => {
      const node = ensureCanvasNodeMounted(id), before = resolveNodeVisualGeometry(id)
      CanvasTextNodeRenderer.beginEdit(node)
      await new Promise(requestAnimationFrame)
      const focused = resolveNodeVisualGeometry(id)
      CanvasTextNodeRenderer.commitEdit(node)
      node.querySelector('.canvas-text').scrollTop = 280
      node.querySelector('.canvas-text').dispatchEvent(new Event('scroll'))
      return { before, focused, scroll: node.querySelector('.canvas-text').scrollTop }
    }, created.text.node_id)
    await page.mouse.move(1350, 920)
    await page.waitForTimeout(850)
    check('text focus preserves geometry', textInteraction.focused, textInteraction.before)
    check('text scroll retained off pointer', (await state()).body?.scrollTop, textInteraction.scroll)
    await page.evaluate(id => {
      const node = ensureCanvasNodeMounted(id)
      node.querySelector('.canvas-text').scrollTop = 0
      selectCanvasNode(node)
      node.querySelector('[data-flora-action="text-expand"]').click()
    }, created.text.node_id)
    check('text expanded view opens', await page.locator('.flora-text-expanded-dialog[open]').count(), 1)
    await page.screenshot({ path: path.join(evidence, 'text-expanded.png') })
    await page.locator('[data-flora-action="expanded-text-close"]').click()
    check('text expanded round-trip preserves geometry', (await state()).geometry, textInteraction.before)
    const handoff = await page.evaluate(async ({ standard, model, video }) => {
      const first = ensureCanvasNodeMounted(standard), main = ensureCanvasNodeMounted(model), target = ensureCanvasNodeMounted(video)
      appendCanvasGenerationToGallery(first, { src: '/output/qa-standard.png', name: '标准图交接夹具（非生成结果）' })
      const before = getCanvasApiVideoRefs(target)
      appendCanvasGenerationToGallery(main, { src: '/output/qa-model.png', name: '模特图交接夹具（非生成结果）' })
      updateCanvasNodeRefs(target)
      const api = getCanvasApiVideoRefs(target)
      setCanvasImageDependencyState(main, 'running')
      const rerun = { refs: getCanvasApiVideoRefs(target), pending: getCanvasVideoPendingDependency(target) }
      setCanvasImageDependencyState(main, 'failed')
      const failed = getCanvasApiVideoRefs(target)
      appendCanvasGenerationToGallery(main, { src: '/output/qa-model-retry.png', name: '重试交接夹具（非生成结果）' })
      setCanvasImageDependencyState(main, 'completed')
      const retried = getCanvasApiVideoRefs(target)
      setCanvasImageDependencyState(first, 'running')
      const unusedPending = getCanvasVideoPendingDependency(target)
      setCanvasImageDependencyState(first, 'completed')
      const materials = getCanvasIncomingReferenceMaterials(video)
      const label = target.querySelector('.canvas-api-video-reference')?.textContent
      let dryRunRequest = null
      const originalFetch = window.fetch
      try {
        window.fetch = async (url, init) => {
          if (String(url) === '/api/videos') {
            dryRunRequest = JSON.parse(init.body)
            return new Response(JSON.stringify({ error: '隔离请求检查，未提交后端' }), { status: 503 })
          }
          return originalFetch(url, init)
        }
        await runCanvasApiVideoNode(target)
      } finally { window.fetch = originalFetch }
      const h3 = addCanvasMinimaxH3Node({ x: 6000, y: 1000 }, { prompt: '同一模特自然转身，保持服装细节一致。' })
      h3.dataset.boardId = canvasState.activeBoardId
      connectCanvasNodes(model, h3.dataset.id, 'input')
      connectCanvasNodes(standard, h3.dataset.id, 'input')
      const h3Images = getCanvasIncomingMinimaxH3Refs(h3).images
      const h3Edges = canvasState.connections.filter(edge => edge.to === h3.dataset.id)
      const h3StandardOutput = getCanvasNodeOutput(first)
      deleteCanvasNodes([h3])
      return { before, api, rerun, failed, retried, unusedPending, materials, label, dryRunRequest, h3Images, h3Edges, h3StandardOutput, warnings: getAgentCanvasNodeResult(target) }
    }, { standard: created.standard.node_id, model: created.model.node_id, video: created.video.node_id })
    check('pending primary never falls back to clothing image', handoff.before.length, 0)
    check('API uses only primary model frame', handoff.api.map(ref => ref.sourceNodeId), [created.model.node_id])
    check('API payload contains only primary image', handoff.dryRunRequest?.reference_images?.map(ref => ref.url), ['/output/qa-model-retry.png'])
    check('API model and prompt configured', [handoff.dryRunRequest?.modelId, handoff.dryRunRequest?.prompt], ['seedance-2.0', created.promptText])
    check('primary rerun never reuses old result', [handoff.rerun.refs.length, handoff.rerun.pending?.code], [0, 'upstream_image_pending'])
    check('primary failure never exposes old result', handoff.failed.length, 0)
    check('primary retry hands off new result', handoff.retried[0]?.url, '/output/qa-model-retry.png')
    check('unused workflow association does not block primary', handoff.unusedPending, null)
    check('additional reference clearly marked association only', handoff.materials.some(item => item.sourceNodeId === created.standard.node_id && item.workflowOnly === true))
    check('API limit visible in node', /仅.*(关联|首帧)|未传入/.test(handoff.label || ''))
    await page.evaluate(async () => { await saveCanvasBoardNow() })
    const saved = { ...(await rpc('getBoardState', { boardId })), nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items, connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items }
    await page.reload({ waitUntil: 'networkidle' })
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-text', 'canvas-node-minimax-h3', 'canvas-node-asset-collection', 'canvas-agent-tool-adapters'])
      await loadCanvasBoards()
      canvasState.activeBoardId = id
      canvasState.activeBoardPersisted = true
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'
      const view = document.querySelector('#canvasView')
      surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      videoModelCatalog = [{ id: 'seedance-2.0', modelId: 'seedance-2.0', modelProtocol: 'video-adapter', providerProtocol: 'openai', displayName: 'Seedance 2.0（隔离配置）' }]
      videoModelRatios = { 'seedance-2.0': ['9:16', '16:9'] }
      videoModelResolutions = { 'seedance-2.0': ['720p'] }
      videoModelDurations = { 'seedance-2.0': { min: 4, max: 15 } }
    }, boardId)
    const restored = await page.evaluate(async ({ saved, textId, videoId }) => {
      await openCanvasBoardFromHistory(saved)
      const text = ensureCanvasNodeMounted(textId), video = ensureCanvasNodeMounted(videoId)
      return { nodes: serializeCanvasBoard().nodes, edges: canvasState.connections, textTitle: text.querySelector('.flora-node-label-title')?.textContent, text: getCanvasTextValue(text), prompt: getCanvasGenerationPrompt(video, video.dataset.apiVideoPrompt), refs: getCanvasApiVideoRefs(video), materials: getCanvasIncomingReferenceMaterials(videoId) }
    }, { saved, textId: created.text.node_id, videoId: created.video.node_id })
    check('SQLite and F5 preserve five nodes', restored.nodes.length, 5)
    check('SQLite and F5 preserve five relations', restored.edges.length, 5)
    check('F5 preserves custom text title', restored.textTitle, '自然转身视频完整提示词')
    check('F5 preserves complete text and prompt', [restored.text, restored.prompt], [created.promptText, created.promptText])
    check('F5 preserves primary/extra reference roles', [restored.refs[0]?.sourceNodeId, restored.materials.find(item => item.sourceNodeId === created.standard.node_id)?.workflowOnly], [created.model.node_id, true])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(id => {
      clearCanvasSelection()
      const model = canvasVirtualStore.get(id)
      canvasState.scale = 0.5
      canvasState.x = 20 - Number(model.x) * canvasState.scale
      canvasState.y = 50 - Number(model.y) * canvasState.scale
      applyCanvasTransformNow()
      CanvasNodeRepresentation.dehydrateNode(id)
      CanvasNodeRepresentation.reconcile()
    }, created.text.node_id)
    await page.mouse.move(380, 820)
    await page.waitForTimeout(850)
    const mobilePage = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }))
    const mobilePoint = await page.evaluate(id => {
      const b = resolveNodeVisualGeometry(id).outerBounds, view = document.querySelector('#infiniteCanvas').getBoundingClientRect()
      return { x: view.left + canvasState.x + (b.left + 80) * canvasState.scale, y: view.top + canvasState.y + (b.top + 80) * canvasState.scale }
    }, created.text.node_id)
    await page.mouse.move(mobilePoint.x, mobilePoint.y)
    await page.waitForTimeout(850)
    const mobile = await page.evaluate(({ id, page }) => {
      const node = getCanvasNode(id), text = node?.querySelector('.canvas-text')
      return { ...page, bounds: resolveNodeVisualGeometry(id)?.outerBounds, body: text ? { clientWidth: text.clientWidth, scrollWidth: text.scrollWidth, clientHeight: text.clientHeight, scrollHeight: text.scrollHeight } : null }
    }, { id: created.text.node_id, page: mobilePage })
    await page.screenshot({ path: path.join(evidence, 'text-mobile.png') })
    check('mobile page has no horizontal overflow', mobilePage.documentWidth <= mobilePage.width)
    check('mobile text stays inside node and scrolls', mobile.body && mobile.body.clientWidth > 0 && mobile.body.clientHeight < mobile.body.scrollHeight)
    check('no paid generation requests', paidRequests.length, 0)
    check('no page errors', pageErrors, [])
    const report = { pass: checks.every(item => item.pass), deployed, evidence, checks, created, visualCases, handoff, restored, mobile, pageErrors, paidRequests, canvasRequests }
    fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ pass: report.pass, evidence, checks: checks.map(({ name, pass, actual }) => ({ name, pass, ...(!pass ? { actual } : {}) })) }, null, 2))
    assert.equal(report.pass, true, 'targeted regression failed')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await rpc('close')
    await worker.terminate()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
