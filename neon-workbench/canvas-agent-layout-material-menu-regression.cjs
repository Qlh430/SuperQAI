const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { Worker } = require('node:worker_threads')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const portable = path.join(root, 'AI-OS-Portable-1.0.5-win-x64')
const diagnostic = JSON.parse(fs.readFileSync(path.join(portable, 'data/.logs/runtime-diagnostics.json')))
const runtimeApp = diagnostic.appRoot
const app = path.resolve(process.env.AI_OS_REGRESSION_APP || diagnostic.appRoot)
const useSourceFiles = !process.env.AI_OS_REGRESSION_APP
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAE0lEQVR4nGP8//8/AwMDCwMYAAAkFAMDuxa40wAAAABJRU5ErkJggg==',
  'base64',
)

async function run() {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-agent-layout-menu-'))
  const frontendFiles = useSourceFiles ? null : (await import('./daily-workbench.mjs')).frontendFiles
  const worker = new Worker(path.join(runtimeApp, 'canvas-db-worker.js'), {
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
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  const boardId = 'qa-agent-layout-menu'
  await rpc('createBoard', { id: boardId, title: '隔离布局与连接菜单验收' })
  const sourceFiles = useSourceFiles ? {
    'script.js': path.join(__dirname, 'design-sources/script-before-save-bridge.js'),
    'image-resource-manager.js': path.join(root, 'host-sources/app/image-resource-manager.js'),
  } : {}
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'
    if (file === 'output/qa-imported.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(pngBytes)
      return
    }
    if (file === 'output/qa-invalid.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end('not an image')
      return
    }
    const resourceRoot = !useSourceFiles && !frontendFiles.has(file) ? runtimeApp : app
    const target = sourceFiles[file] || path.resolve(resourceRoot, file)
    if (!sourceFiles[file] && !target.startsWith(resourceRoot + path.sep)) { res.writeHead(403).end(); return }
    try {
      const bytes = fs.readFileSync(target)
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(target)]
      res.writeHead(200, { 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
    } catch { res.writeHead(404).end() }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const pageErrors = []
  const uploads = []
  let thumbnailRequests = 0
  let generationRequests = 0
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
    if (url.pathname === '/api/upload-image' && request.method() === 'POST') {
      const name = decodeURIComponent(request.headers()['x-file-name'] || '')
      uploads.push(name)
      return route.fulfill({ json: {
        url: name.includes('invalid') ? '/output/qa-invalid.png' : '/output/qa-imported.png',
        mimeType: 'image/png',
        asset: { id: `qa-asset-${uploads.length}`, name: name.replace(/\.[^.]+$/, '') },
      } })
    }
    if (url.pathname === '/api/image-thumbnails') {
      thumbnailRequests += 1
      return route.fulfill({ status: 503, json: { error: 'isolated thumbnail failure' } })
    }
    if (url.pathname === '/api/image-jobs' && request.method() === 'POST') {
      generationRequests += 1
      return route.fulfill({ status: 503, json: { error: 'paid generation blocked by regression test' } })
    }
    return route.fulfill({ json: {
      authenticated: false, boards: [], projects: [], resources: [], records: [],
      models: [], imageModels: [], providers: [], preferences: {}, settings: {},
    } })
  })

  const setup = async () => {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' })
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-agent-tool-adapters', 'canvas-node-asset-collection'])
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
    const layoutAndMenus = await page.evaluate(async () => {
      const userNode = addCanvasText({ x: 420, y: 220 }, { name: '用户已有节点', text: '保留原位', focus: false })
      userNode.dataset.boardId = canvasState.activeBoardId
      const asset = addCanvasAssetCollection({ x: 40, y: 700 }, {
        title: '原始商品图', mode: 'single',
        members: [{ id: 'qa-source-image', kind: 'image', src: '/output/qa-imported.png', name: '商品图', source: 'upload' }],
      })
      asset.dataset.boardId = canvasState.activeBoardId
      const broker = CanvasAgentBroker.createBroker({
        getCurrentBoardId: () => canvasState.activeBoardId,
        adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
      })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-layout-menu' })
      let seq = 0
      const call = (name, args) => broker.execute(scope, { name, call_id: String(++seq), arguments: args })
      const samePoint = { x: 420, y: 220 }
      const first = await call('create_image_node', {
        title: '标准化正反面服装参考图',
        prompt: '白色无缝背景，正面和背面并列展示同一件服装，完整保留面料纹理、领口、袖口、纽扣、缝线和颜色，轮廓清晰，电商标准产品摄影，无模特、无文字。',
        reference_node_ids: [asset.dataset.id], ...samePoint,
      })
      const second = await call('create_image_node', {
        title: 'AI 模特上身展示',
        prompt: '使用上游服装标准参考图，生成真实成年 AI 模特的全身正面上身展示，服装版型、面料、颜色、纽扣和细节与参考完全一致，干净白底影棚光线，双手自然垂放，电商摄影，无文字。',
        reference_node_ids: [first.node_id], ...samePoint,
      })
      const video = await call('create_video_node', {
        title: '自然转身展示视频', engine: 'api',
        aspect_ratio: '9:16', duration: 8,
        prompt: '同一成年 AI 模特保持同一服装和白色影棚背景，先正面自然站立，再缓慢向左转身展示侧面与背面，动作连贯克制，镜头固定，服装版型、颜色、纹理和纽扣全程稳定，不添加文字。',
        reference_node_ids: [second.node_id], ...samePoint,
      })
      const prompt = await call('create_text_node', {
        title: '视频动态提示词',
        content: '同一成年 AI 模特穿着参考服装，在纯白影棚中从正面自然站立开始，缓慢转向左侧并展示背面，再回到自然站姿。固定中景镜头，动作真实连贯，服装颜色、面料纹理、剪裁与细节保持一致，不变形、不闪烁、不切镜、不出现文字。',
        ...samePoint,
      })
      const promptConnection = await call('connect_nodes', { from_id: prompt.node_id, to_id: video.node_id, to_port: 'input' })
      const menu = document.querySelector('#canvasConnectMenu')
      const view = document.querySelector('#infiniteCanvas').getBoundingClientRect()
      showCanvasConnectMenu({ clientX: view.left + 1000, clientY: view.top + 100 }, asset.dataset.id, { direction: 'output' })
      const materialChoices = [...menu.querySelectorAll('[data-connect-node]')].filter(button => !button.hidden).map(button => button.dataset.connectNode)
      const imageButton = menu.querySelector('[data-connect-node="image-generator"]')
      imageButton.click()
      const imageGenerator = canvasState.connections
        .filter(edge => edge.from === asset.dataset.id)
        .map(edge => getCanvasNode(edge.to))
        .find(node => node?.classList.contains('canvas-node-image') && node.dataset.uploadOnly !== 'true')
      showCanvasConnectMenu({ clientX: view.left + 1100, clientY: view.top + 650 }, asset.dataset.id, { direction: 'output' })
      const videoButton = menu.querySelector('[data-connect-node="video-generator"]')
      videoButton.click()
      const videoGenerator = canvasState.connections
        .filter(edge => edge.from === asset.dataset.id)
        .map(edge => getCanvasNode(edge.to))
        .find(node => node?.classList.contains('canvas-node-video-api'))
      showCanvasConnectMenu({ clientX: view.left + 1200, clientY: view.top + 850 }, asset.dataset.id, { direction: 'output' })
      const llmButton = menu.querySelector('[data-connect-node="llm"]')
      llmButton.click()
      const llmNode = canvasState.connections
        .filter(edge => edge.from === asset.dataset.id)
        .map(edge => getCanvasNode(edge.to))
        .find(node => node?.classList.contains('canvas-node-llm'))
      showCanvasConnectMenu({ clientX: view.left + 200, clientY: view.top + 200 }, first.node_id, { direction: 'output' })
      const generatorChoices = [...menu.querySelectorAll('[data-connect-node]')].filter(button => !button.hidden).map(button => button.dataset.connectNode)
      showCanvasConnectMenu({ clientX: view.left + 180, clientY: view.top + 180 }, null, {
        direction: 'input', toId: second.node_id, toPort: 'input',
      })
      const inputChoices = [...menu.querySelectorAll('[data-connect-node]')].filter(button => !button.hidden).map(button => button.dataset.connectNode)
      const nodes = [userNode, asset, getCanvasNode(first.node_id), getCanvasNode(second.node_id), getCanvasNode(video.node_id), getCanvasNode(prompt.node_id)]
        .filter(Boolean)
      const boxes = nodes.map(node => {
        const bounds = getAgentCanvasNodeBounds(node)
        return {
          id: node.dataset.id, kind: getCanvasNodeKind(node),
          x: bounds.left, y: bounds.top,
          width: bounds.right - bounds.left, height: bounds.bottom - bounds.top,
          position: { x: Number(node.dataset.x), y: Number(node.dataset.y) },
        }
      })
      await saveCanvasBoardNow()
      return {
        userPoint: { x: Number(userNode.dataset.x), y: Number(userNode.dataset.y) },
        userExpected: { x: 420, y: 220 },
        materialChoices, generatorChoices, inputChoices, first, second, video, prompt, promptConnection,
        imageGenerator: imageGenerator && {
          id: imageGenerator.dataset.id,
          kind: getCanvasNodeKind(imageGenerator),
          hasPrompt: Boolean(imageGenerator.querySelector('.canvas-node-prompt')),
          hasModel: Boolean(imageGenerator.querySelector('.canvas-node-model')),
          uploadOnly: imageGenerator.dataset.uploadOnly,
        },
        videoGenerator: videoGenerator && {
          id: videoGenerator.dataset.id,
          kind: getCanvasNodeKind(videoGenerator),
          hasPrompt: Boolean(videoGenerator.querySelector('.canvas-api-video-prompt-input')),
          hasModel: Boolean(videoGenerator.querySelector('.canvas-api-video-model')),
        },
        llmNode: llmNode && {
          id: llmNode.dataset.id,
          kind: getCanvasNodeKind(llmNode),
          hasPrompt: Boolean(llmNode.querySelector('.canvas-llm-prompt')),
        },
        boxes,
        edges: canvasState.connections.map(edge => ({ from: edge.from, to: edge.to })),
      }
    })
    assert.deepEqual(layoutAndMenus.userPoint, layoutAndMenus.userExpected, 'existing user node stays in place')
    assert.equal(layoutAndMenus.first.ok, true, JSON.stringify(layoutAndMenus.first))
    assert.equal(layoutAndMenus.second.ok, true, JSON.stringify(layoutAndMenus.second))
    assert.equal(layoutAndMenus.video.ok, true, JSON.stringify(layoutAndMenus.video))
    assert.equal(layoutAndMenus.prompt.ok, true, JSON.stringify(layoutAndMenus.prompt))
    assert.equal(layoutAndMenus.promptConnection.ok, true, JSON.stringify(layoutAndMenus.promptConnection))
    assert.ok(layoutAndMenus.boxes.length >= 6, 'creates the source, workflow, and menu-generated nodes')
    for (let left = 0; left < layoutAndMenus.boxes.length; left += 1) {
      for (let right = left + 1; right < layoutAndMenus.boxes.length; right += 1) {
        const a = layoutAndMenus.boxes[left], b = layoutAndMenus.boxes[right], gap = 20
        const overlaps = a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
          && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
        assert.equal(overlaps, false, `Agent layout nodes must not overlap: ${a.id} and ${b.id}`)
      }
    }
    assert.deepEqual(layoutAndMenus.materialChoices.sort(), ['image-generator', 'llm', 'video-generator'].sort(),
      `image material menu only offers compatible generators: ${JSON.stringify(layoutAndMenus.materialChoices)}`)
    assert.ok(layoutAndMenus.generatorChoices.includes('image-generator'))
    assert.ok(layoutAndMenus.generatorChoices.includes('video-generator'))
    assert.ok(!layoutAndMenus.generatorChoices.includes('upload'), 'generator output cannot create a blank image material target')
    assert.ok(layoutAndMenus.inputChoices.includes('image-generator'), 'image generator input offers a true upstream image generator')
    assert.ok(!layoutAndMenus.inputChoices.includes('video-generator'), 'image generator input hides incompatible video output')
    assert.ok(layoutAndMenus.imageGenerator?.hasPrompt && layoutAndMenus.imageGenerator?.hasModel,
      'image-generator menu choice creates a configurable generation node')
    assert.equal(layoutAndMenus.imageGenerator.uploadOnly, undefined)
    assert.ok(layoutAndMenus.videoGenerator?.hasPrompt && layoutAndMenus.videoGenerator?.hasModel,
      'video-generator menu choice creates a configurable video generation node')
    assert.ok(layoutAndMenus.llmNode?.hasPrompt, 'visual text generation menu choice creates a real LLM node')
    const box = id => layoutAndMenus.boxes.find(item => item.id === id)
    const materialBox = box(layoutAndMenus.boxes.find(item => item.kind === 'asset-collection').id)
    const firstBox = box(layoutAndMenus.first.node_id)
    const secondBox = box(layoutAndMenus.second.node_id)
    const videoBox = box(layoutAndMenus.video.node_id)
    const promptBox = box(layoutAndMenus.prompt.node_id)
    assert.ok(firstBox.x >= materialBox.x + materialBox.width, 'first image node follows its material')
    assert.ok(secondBox.x >= firstBox.x + firstBox.width, 'downstream image node follows its dependency')
    assert.ok(videoBox.x >= secondBox.x + secondBox.width, 'video node follows the final image dependency')
    assert.ok(promptBox.x < videoBox.x && promptBox.x >= secondBox.x - promptBox.width,
      'video prompt is arranged beside its video input and after the image stage')
    const savedLayout = {
      nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
      connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items,
    }
    assert.ok(savedLayout.nodes.some(node => node.id === layoutAndMenus.first.node_id), 'Agent nodes persist to the isolated board')
    assert.ok(savedLayout.connections.some(edge => edge.from === layoutAndMenus.prompt.node_id && edge.to === layoutAndMenus.video.node_id),
      `prompt-to-video edge persists: ${JSON.stringify({ prompt: layoutAndMenus.prompt.node_id, video: layoutAndMenus.video.node_id, saved: savedLayout.connections, live: layoutAndMenus.edges })}`)

    const importResult = await page.evaluate(async () => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAE0lEQVR4nGP8//8/AwMDCwMYAAAkFAMDuxa40wAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))
      const file = new File([bytes], 'Image (6).png', { type: 'image/png' })
      const nodes = await CanvasFileImport.importFiles([file], { x: 1800, y: 100 })
      const node = nodes[0]
      const img = node?.querySelector('.flora-node-result-area img')
      return {
        count: nodes.length,
        status: document.querySelector('.canvas-status span:last-child')?.textContent || '',
        nodeStatus: node?.querySelector('.canvas-node-status')?.textContent || '',
        memberCount: getCanvasAssetCollection(node).members.length,
        source: img?.getAttribute('data-original-src') || '',
        quality: img?.dataset.imageQuality || '',
        dimensions: [img?.naturalWidth || 0, img?.naturalHeight || 0],
        nodeId: node?.dataset.id || '',
      }
    })
    assert.equal(importResult.count, 1)
    assert.match(importResult.status, /已导入 1 个节点/)
    assert.doesNotMatch(importResult.nodeStatus, /失败/)
    assert.equal(importResult.memberCount, 1, 'the uploaded asset is persisted exactly once')
    assert.equal(importResult.source, '/output/qa-imported.png')
    assert.deepEqual(importResult.dimensions, [2, 2], 'failed thumbnail falls back to readable original')
    assert.equal(uploads.length, 1, 'the test file is uploaded once')
    assert.ok(thumbnailRequests > 0, 'test exercised the failed thumbnail path')

    const agentReference = await page.evaluate(async nodeId => {
      const broker = CanvasAgentBroker.createBroker({
        getCurrentBoardId: () => canvasState.activeBoardId,
        adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
      })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-imported-material-reference' })
      const result = await broker.execute(scope, { name: 'create_image_node', call_id: 'image-from-import', arguments: {
        title: '读取已导入服装图片',
        prompt: '读取真实导入的商品图作为参考素材，保持款式和颜色一致。本节点仅预填配置，不执行生成。',
        reference_node_ids: [nodeId],
      } })
      return {
        result,
        refs: getCanvasIncomingRefs(result.node_id).map(ref => ({ url: ref.url, name: ref.name })),
        edge: canvasState.connections.some(edge => edge.from === nodeId && edge.to === result.node_id),
      }
    }, importResult.nodeId)
    assert.equal(agentReference.result.ok, true, JSON.stringify(agentReference.result))
    assert.equal(agentReference.edge, true)
    assert.equal(agentReference.refs[0]?.url, '/output/qa-imported.png', 'Agent receives the persisted source image URL')
    await page.evaluate(async () => saveCanvasBoardNow())
    const persisted = {
      ...(await rpc('getBoardState', { boardId })),
      nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
      connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 200 })).items,
    }
    const workflowNodeIds = [layoutAndMenus.first.node_id, layoutAndMenus.second.node_id, layoutAndMenus.video.node_id, layoutAndMenus.prompt.node_id]
    const workflowEdges = persisted.connections
      .filter(edge => workflowNodeIds.includes(edge.from) && workflowNodeIds.includes(edge.to))
      .map(edge => ({ from: edge.from, to: edge.to }))
    await setup()
    const refreshed = await page.evaluate(async ({ state, workflowNodeIds, workflowEdges }) => {
      await openCanvasBoardFromHistory(state)
      const workflowRects = workflowNodeIds.map(id => {
        const node = ensureCanvasNodeMounted(id)
        const bounds = getAgentCanvasNodeBounds(node)
        return {
          id,
          position: { x: Number(node.dataset.x), y: Number(node.dataset.y) },
          left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
        }
      })
      const missingWorkflowEdges = workflowEdges.filter(edge => !canvasState.connections.some(
        saved => saved.from === edge.from && saved.to === edge.to,
      ))
      const workflowOverlaps = []
      for (let left = 0; left < workflowRects.length; left += 1) {
        for (let right = left + 1; right < workflowRects.length; right += 1) {
          const a = workflowRects[left], b = workflowRects[right], gap = 20
          if (a.left < b.right + gap && a.right + gap > b.left
            && a.top < b.bottom + gap && a.bottom + gap > b.top) workflowOverlaps.push([a.id, b.id])
        }
      }
      const source = ensureCanvasNodeMounted(state.connections.find(edge => {
        const target = state.nodes.find(node => node.id === edge.to)
        return target?.kind === 'image' && target?.prompt?.includes('读取真实导入的商品图')
      })?.from)
      const targetId = state.nodes.find(node => node.kind === 'image' && node.prompt?.includes('读取真实导入的商品图'))?.id
      const target = ensureCanvasNodeMounted(targetId)
      const asset = ensureCanvasNodeMounted(source?.dataset.id)
      const image = asset?.querySelector('.flora-node-result-area img')
      const refs = getCanvasIncomingRefs(targetId).map(ref => ref.url)
      const response = await fetch('/output/qa-imported.png')
      const blob = await response.blob()
      const probe = new Image()
      probe.src = URL.createObjectURL(blob)
      let probeDecoded = false
      try { await probe.decode(); probeDecoded = true } catch {}
      const originalReady = await window.imageResources?.showOriginal(image)
      return {
        workflowRects,
        missingWorkflowEdges,
        workflowOverlaps,
        edge: canvasState.connections.some(edge => edge.from === source?.dataset.id && edge.to === targetId),
        refs,
        memberCount: getCanvasAssetCollection(asset).members.length,
        sourceUrl: image?.getAttribute('data-original-src') || '',
        src: image?.getAttribute('src') || '',
        originalReady,
        fetchStatus: response.status,
        blobSize: blob.size,
        probeDecoded,
        imageState: { complete: image?.complete, quality: image?.dataset.imageQuality, requested: image?.dataset.requestedQuality },
        dimensions: [image?.naturalWidth || 0, image?.naturalHeight || 0],
        prompt: target?.querySelector('.canvas-node-prompt')?.value || '',
      }
    }, { state: persisted, workflowNodeIds, workflowEdges })
    const expectedPositions = Object.fromEntries(layoutAndMenus.boxes
      .filter(item => workflowNodeIds.includes(item.id))
      .map(item => [item.id, item.position]))
    assert.equal(refreshed.workflowRects.length, workflowNodeIds.length, 'all workflow nodes restore after refresh')
    assert.deepEqual(
      Object.fromEntries(refreshed.workflowRects.map(item => [item.id, item.position])),
      expectedPositions,
      'workflow node positions survive refresh',
    )
    assert.deepEqual(refreshed.workflowOverlaps, [], 'restored workflow nodes remain separated')
    assert.deepEqual(refreshed.missingWorkflowEdges, [], 'workflow stage and prompt connections survive refresh')
    assert.equal(refreshed.edge, true, 'asset-to-Agent reference survives refresh')
    assert.deepEqual(refreshed.refs, ['/output/qa-imported.png'])
    assert.equal(refreshed.memberCount, 1, 'refresh does not duplicate the imported asset')
    assert.equal(refreshed.sourceUrl, '/output/qa-imported.png')
    assert.deepEqual(refreshed.dimensions, [2, 2], JSON.stringify(refreshed))
    assert.match(refreshed.prompt, /读取真实导入的商品图/)

    const invalidImport = await page.evaluate(async () => {
      const file = new File(['not an image'], 'Image-invalid.png', { type: 'image/png' })
      const nodes = await CanvasFileImport.importFiles([file], { x: 2200, y: 800 })
      return {
        count: nodes.length,
        status: document.querySelector('.canvas-status span:last-child')?.textContent || '',
        memberCount: getCanvasAssetCollection(nodes[0]).members.length,
      }
    })
    assert.equal(invalidImport.count, 1)
    assert.equal(invalidImport.memberCount, 1)
    assert.match(invalidImport.status, /部分文件未成功导入/)
    assert.match(invalidImport.status, /原始图片已上传，但无法读取或解码/, JSON.stringify(invalidImport))
    assert.doesNotMatch(invalidImport.status, /已导入 1 个节点/)
    assert.equal(uploads.length, 2, 'each isolated test file is uploaded exactly once')
    assert.equal(generationRequests, 0, 'no paid generation request is sent')
    assert.deepEqual(pageErrors, [])
    console.log(JSON.stringify({
      ok: true,
      evidence,
      checks: ['agent-layout-avoids-overlap', 'existing-node-position-preserved', 'layout-and-connections-survive-refresh', 'dynamic-compatible-menu', 'menu-creates-real-image-generator', 'failed-thumbnail-original-fallback', 'single-asset-import', 'no-paid-generation'],
      materialChoices: layoutAndMenus.materialChoices,
      generatorChoices: layoutAndMenus.generatorChoices,
      inputChoices: layoutAndMenus.inputChoices,
      uploads: uploads.length,
      thumbnailRequests,
      generationRequests,
      refreshed,
      invalidImport,
      pageErrors,
    }))
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await rpc('close')
    await worker.terminate()
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
