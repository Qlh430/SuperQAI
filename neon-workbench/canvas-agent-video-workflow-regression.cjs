const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const http = require('node:http')
const Module = require('node:module')
const { Worker } = require('node:worker_threads')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const videoFixture = path.join(root, 'AI-OS-Portable-1.0.5-win-x64/data/output/minimax_h3_1791456128166_2ef47959.mp4')
const pngFixture = `data:image/png;base64,${Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64').toString('base64')}`
const ffprobe = process.env.FFPROBE_PATH || 'C:/Users/Administrator/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffprobe.exe'
const validPngFixture = ['data:', 'image/png;base64,', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64').toString('base64')].join('')
const diagnostic = JSON.parse(fs.readFileSync(path.join(root, 'AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json')))
const app = diagnostic.appRoot
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === './canvas-feature-registry.js' && parent?.filename?.includes('host-sources')) {
    return path.join(__dirname, 'design-sources/canvas-feature-registry.js')
  }
  return originalResolve.call(this, request, parent, ...rest)
}
const adapters = require('../host-sources/app/canvas-agent-tool-adapters')
const runtime = require('../host-sources/app/canvas-agent-runtime')
const capabilities = require('../host-sources/app/canvas-agent-capabilities')

async function unit() {
  const api = { createNode: (kind, args) => ({ kind, args }) }
  const tools = adapters.create({ canvasApi: api })
  assert.equal(tools.create_video_node({ engine: 'api' }).kind, 'video-api', 'API engine must create the existing API video node')
  assert.equal(tools.create_video_node({ engine: 'comfyui' }).kind, 'minimax-h3', 'explicit H3 remains supported')
  assert.equal(tools.create_video_node({}).kind, 'minimax-h3', 'legacy H3 tool calls remain compatible')
  const schema = capabilities.getCapabilityByToolName('create_video_node').tool.inputSchema
  for (const key of ['engine', 'model', 'resolution', 'title']) assert.ok(schema.properties[key], `video tool exposes ${key}`)
  const prompt = '在画布只创建节点：图片生成节点和视频生成节点，写入提示词并连接排列。不执行任何付费生成。'
  const context = { capabilityIds: capabilities.CAPABILITY_REGISTRY.map(item => item.id), mode: 'manual' }
  const ids = runtime.selectAdaptiveCapabilityIds({ prompt }, context)
  assert.ok(ids.includes('node.video.create'), 'node-only video planning retains video creation')
  assert.ok(!ids.includes('node.run'), 'node-only planning excludes paid execution')
  const skillIds = runtime.selectAdaptiveCapabilityIds({ prompt }, { ...context, manualActivated: true })
  assert.ok(skillIds.includes('skill.reference.read'), 'selected Skill keeps reference reading during node-only planning')
  console.log('PASS unit: API/H3 dispatch, schema and node-only tool selection')
}

async function browserCheck() {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-video-workflow-'))
  assert.ok(fs.existsSync(videoFixture), 'existing MP4 fixture is available for download-only verification')
  assert.ok(fs.existsSync(ffprobe), 'ffprobe is available for local MP4 validation')
  const worker = new Worker(path.join(app, 'canvas-db-worker.js'), { workerData: { dbPath: path.join(evidence, 'canvas.db') } })
  const waiting = new Map()
  let sequence = 0
  worker.on('message', message => {
    const pending = waiting.get(message.id)
    if (!pending) return
    waiting.delete(message.id)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error?.message))
  })
  worker.on('error', error => { for (const pending of waiting.values()) pending.reject(error); waiting.clear() })
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  const boardId = 'qa-fashion-workflow'
  const fashionSkill = { id: 'fashion-ecommerce-ai-model-video', name: 'fashion-ecommerce-ai-model-video', label: '服装电商 · AI 模特动态展示', description: '隔离验收技能', origin: 'custom', scope: 'personal', required_selection: 'image' }
  const ordinarySkill = { id: 'qa-ordinary-skill', name: 'qa-ordinary-skill', label: '普通验收 Skill', description: '不应套用服装默认值', origin: 'custom', scope: 'personal' }
  await rpc('createBoard', { id: boardId, title: '隔离服装工作流验收' })
  const sourceFiles = {
    'script.js': path.join(__dirname, 'design-sources/script-before-save-bridge.js'),
    'flora-node-shell.js': path.join(__dirname, 'design-sources/flora-node-shell.js'),
    'flora-node-shell.css': path.join(__dirname, 'design-sources/flora-node-shell.css'),
    ...Object.fromEntries(['canvas-agent-capabilities.js', 'canvas-agent-tool-adapters.js', 'canvas-agent-core.js', 'canvas-agent-ui.js']
      .map(name => [name, path.join(root, 'host-sources/app', name)])),
  }
  const historyDownloadSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'src/lib/media-download.ts'), 'utf8')
    .replace('import { request } from "@/lib/api"', `const request = async path => {
      const response = await fetch(path, { credentials: 'same-origin' })
      if (!response.ok) throw Object.assign(new Error('asset name not registered'), { status: response.status })
      return response.json()
    }`)
    .replace('export async function downloadMedia', 'async function downloadMedia')
    + '\nwindow.qaDownloadMedia = downloadMedia;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const server = http.createServer((req, res) => {
    let file
    try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html' } catch { res.writeHead(400).end(); return }
    if (file === 'output/qa-existing-video.mp4') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(videoFixture).size, 'Cache-Control': 'no-store' })
      fs.createReadStream(videoFixture).pipe(res)
      return
    }
    if (file === 'media-download-test.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(historyDownloadSource)
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
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(33199, '127.0.0.1', resolve) })
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(edge) ? edge : undefined })
  const browserContext = await browser.newContext({ acceptDownloads: true })
  const page = await browserContext.newPage({ viewport: { width: 1440, height: 1000 } })
  const pageErrors = []
  const paidRequests = []
  const agentTurnRequests = []
  const simulatedGenerationRequests = []
  const generationGates = new Map()
  const createGenerationGate = pathname => {
    let signalStarted
    let release
    const started = new Promise(resolve => { signalStarted = resolve })
    const released = new Promise(resolve => { release = resolve })
    generationGates.set(pathname, { signalStarted, released })
    return { started, release }
  }
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.routeWebSocket('**/*', ws => ws.close())
  await page.route('**/api/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'POST' && /image-jobs|video|generate/.test(url.pathname)) {
      simulatedGenerationRequests.push({ path: url.pathname })
      const gate = generationGates.get(url.pathname)
      if (gate) {
        generationGates.delete(url.pathname)
        gate.signalStarted()
        await gate.released
      }
      return route.fulfill({ status: 500, json: { error: '隔离验收禁止生成' } })
    }
    if (url.pathname === '/api/canvas-agent/skills') {
      return route.fulfill({ json: { configured: true, agentSettings: { configured: true }, skills: [fashionSkill, ordinarySkill], pickerSkills: [fashionSkill, ordinarySkill] } })
    }
    if (url.pathname === '/api/canvas-agent/turn' && req.method() === 'POST') {
      agentTurnRequests.push(req.postDataJSON())
      return route.fulfill({ json: { message: '隔离 Agent 已接收默认 Skill 工作流指令', tool_calls: [] } })
    }
    if (url.pathname === '/api/assets/resolve') return route.fulfill({ status: 404, json: { error: '测试旧视频文件无登记名' } })
    if (url.pathname.endsWith('/operations') && req.method() === 'POST') {
      try { return route.fulfill({ json: await rpc('applyOperations', { boardId, ...req.postDataJSON() }) }) }
      catch (error) { return route.fulfill({ status: 400, json: { error: error.message } }) }
    }
    return route.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} } })
  })
  const setup = async () => {
    await page.goto('http://127.0.0.1:33199/', { waitUntil: 'networkidle' })
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
      videoModelCatalog = [{ id: 'qa-video', displayName: '隔离视频模型', platform: 'openai' }]
      videoModelRatios = { 'qa-video': ['9:16', '16:9'] }
      videoModelResolutions = { 'qa-video': ['720p', '1080p'] }
      videoModelDurations = { 'qa-video': { min: 4, max: 15 } }
      imageModelCatalog = [{ id: 'gpt-image-2', displayName: 'gpt-image-2', platform: 'openai', family: 'gpt-image-2', resolutions: ['1', '2'] }]
      imageModelInput.innerHTML = '<option value="gpt-image-2">gpt-image-2</option>'
      imageModelInput.value = 'gpt-image-2'
    }, boardId)
  }
  try {
    await setup()
    await page.evaluate(fixture => { window.__qaValidPng = fixture }, validPngFixture)
    const noSkill = await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = ''
      document.querySelector('#canvasAgentForm').requestSubmit()
      return {
        status: document.querySelector('#canvasAgentStatus')?.textContent,
        running: document.querySelector('#canvasAgentPanel')?.classList.contains('is-running'),
      }
    })
    assert.match(noSkill.status, /选择.*Skill|描述.*任务/, 'blank send without a Skill gives actionable guidance')
    assert.equal(noSkill.running, false, 'blank send without a Skill does not start a run')
    assert.equal(agentTurnRequests.length, 0, 'blank send without a Skill never reaches Agent')
    const missingMaterial = await page.evaluate(async skillId => {
      await CanvasAgentUi.useSkill(skillId, { boardId: canvasState.activeBoardId })
      document.querySelector('#canvasAgentPrompt').value = ''
      document.querySelector('#canvasAgentForm').requestSubmit()
      for (let attempt = 0; attempt < 500 && !/服装图片|参考素材/.test(document.querySelector('#canvasAgentStatus')?.textContent || ''); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      return {
        status: document.querySelector('#canvasAgentStatus')?.textContent,
        running: document.querySelector('#canvasAgentPanel')?.classList.contains('is-running'),
      }
    }, fashionSkill.id)
    assert.match(missingMaterial.status, /服装图片|参考素材/, 'required image material must be requested before running')
    assert.equal(missingMaterial.running, false, 'missing required material does not start a run')
    assert.equal(agentTurnRequests.length, 0, 'missing required material never reaches Agent')
    const result = await page.evaluate(async () => {
      await CanvasAgentUi.useSkill('fashion-ecommerce-ai-model-video', { boardId: canvasState.activeBoardId })
      if (CanvasAgentUi.getActiveSkillId?.() !== 'fashion-ecommerce-ai-model-video') throw new Error('selected fashion Skill is not available to canvas node creation')
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-fashion' })
      let seq = 0
      const call = (name, args) => broker.execute(scope, { name, call_id: String(++seq), arguments: args })
      const fixture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0l8AAAAASUVORK5CYII='
      const imageFixture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      const pngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      const actualFixture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      const source = addCanvasAssetCollection({ x: 100, y: 100 }, {
        title: '服装正反面白底参考', mode: 'single',
        members: [{ id: 'qa-original', kind: 'image', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', name: '服装正反面白底参考', source: 'upload' }],
      })
      renderCanvasAssetCollectionNode(source, { title: '服装正反面白底参考', mode: 'single', members: [{ id: 'qa-original', kind: 'image', src: window.__qaValidPng, name: '服装正反面白底参考', source: 'upload' }] })
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('invalid PNG test fixture')); img.src = window.__qaValidPng })
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('invalid image fixture')); img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' })
      source.dataset.boardId = canvasState.activeBoardId
      selectCanvasNode(source)
      await new Promise(resolve => queueMicrotask(resolve))
      const sourceOutputDebug = window.getCanvasNodeOutput(source)
      const selectionDebug = {
        outputType: sourceOutputDebug?.type,
        assets: sourceOutputDebug?.assets?.map(asset => ({ kind: asset.kind, hasUrl: Boolean(asset.src || asset.url || asset.savedUrl) })) || [],
        selectedIds: Array.from(canvasState.selectedIds || []),
        contextNodes: Array.from(document.querySelectorAll('#canvasAgentContext [data-agent-node-id]')).map(node => node.dataset.agentNodeId),
      }
      document.querySelector('#canvasAgentPrompt').value = ''
      const nodesBeforeImplicitRun = Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).map(node => node.dataset.id)
      const sendButton = document.querySelector('#canvasAgentSend')
      const sendButtonEnabled = Boolean(sendButton && !sendButton.disabled)
      sendButton?.click()
      for (let attempt = 0; attempt < 500 && document.querySelector('#canvasAgentPanel')?.classList.contains('is-running'); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      const implicitRun = {
        status: document.querySelector('#canvasAgentStatus')?.textContent,
        running: document.querySelector('#canvasAgentPanel')?.classList.contains('is-running'),
        sendButtonEnabled,
        nodesBefore: nodesBeforeImplicitRun,
        nodesAfter: Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).map(node => node.dataset.id),
        selectionDebug,
        persisted: JSON.parse(localStorage.getItem('canvas-agent-runs-v1') || '[]').find(run => run.skillId === 'fashion-ecommerce-ai-model-video'),
      }
      const normalized = await call('create_image_node', { title: '01_服装_正反面标准化', prompt: '将当前商品处理为纯白背景、左正面右背面的完整双视图，不添加模特或文字。', model: 'gpt-image-2', size: '1:1', resolution: '1', reference_node_ids: [source.dataset.id], x: 700, y: 100 })
      const image = await call('create_image_node', { title: '02_服装_模特上身', prompt: '以当前商品正反面参考图为依据，制作单人正面全身模特照片。保留棕色无袖连衣裙、圆领、正面纽扣、腰带及裙摆结构，纯白背景，自然站姿与接触阴影，不改变服装设计。', model: 'gpt-image-2', size: '1:1', resolution: '1', reference_node_ids: [normalized.node_id], x: 1100, y: 100 })
      // Generic API/H3, download and spinner coverage stays outside the fashion contract.
      // The complete Agent-driven fashion contract is covered by canvas-fashion-workflow-regression.cjs.
      await CanvasAgentUi.useSkill('qa-ordinary-skill', { boardId: canvasState.activeBoardId })
      const created = await call('create_video_node', { engine: 'api', title: '03_服装_自然转身', model: 'qa-video', prompt: '以本商品真实模特上身图为起始画面。模特以真实小步和重心变化自然转身，依次展示正面、侧面、背面，再回到正面。固定机位，一镜到底，纯白背景，保持人物和服装一致，不机械旋转，不添加口袋或改变款式。', aspect_ratio: '9:16', duration: 12, resolution: '720p', reference_node_ids: [image.node_id], x: 1300, y: 100 })
      const repeat = await broker.execute(scope, { name: 'create_video_node', call_id: String(seq), arguments: { engine: 'api', title: '03_服装_自然转身', model: 'qa-video', prompt: '以本商品真实模特上身图为起始画面。模特以真实小步和重心变化自然转身，依次展示正面、侧面、背面，再回到正面。固定机位，一镜到底，纯白背景，保持人物和服装一致，不机械旋转，不添加口袋或改变款式。', aspect_ratio: '9:16', duration: 12, resolution: '720p', reference_node_ids: [image.node_id], x: 1300, y: 100 } })
      const video = ensureCanvasNodeMounted(created.node_id)
      const imageNode = ensureCanvasNodeMounted(image.node_id)
      const controls = { imagePrompt: Boolean(imageNode.querySelector('.canvas-node-prompt')), imageModel: Boolean(imageNode.querySelector('.canvas-node-model')), imageRun: Boolean(imageNode.querySelector('.canvas-node-run')), videoPrompt: Boolean(video.querySelector('.canvas-api-video-prompt-input')), videoModel: Boolean(video.querySelector('.canvas-api-video-model')), videoRun: Boolean(video.querySelector('.canvas-api-video-run')) }
      const pendingLabel = video.querySelector('.canvas-api-video-reference')?.textContent
      const blocked = await call('run_canvas_node', { node_id: created.node_id })
      const duplicateRef = await call('connect_nodes', { from_id: source.dataset.id, to_id: created.node_id, to_port: 'input' })
      const updated = await call('update_node', { node_id: created.node_id, changes: { prompt: '纯白摄影棚，固定机位，一位穿棕色连衣裙的模特以真实步伐自然转身，展示正侧背面后回正。等待真实上游模特图，不使用商品图替代。', aspect_ratio: '16:9', duration: 10, resolution: '1080p', model: 'qa-video' } })
      const h3 = await call('create_video_node', { engine: 'comfyui', title: '03_服装_H3自然转身', prompt: '固定机位自然转身，保持服装一致。', aspect_ratio: '3:4', duration: 6, reference_node_ids: [image.node_id], x: 1300, y: 800 })
      const h3Blocked = await call('run_canvas_node', { node_id: h3.node_id })
      await saveCanvasBoardNow()
      const directApiBlocked = await runCanvasApiVideoNode(video)
      const directH3Blocked = await runCanvasMinimaxH3Node(ensureCanvasNodeMounted(h3.node_id))
      const apiRunnable = await call('create_video_node', {
        engine: 'api', title: '隔离运行反馈视频节点', model: 'qa-video',
        prompt: '隔离测试用中文提示词，不会提交真实生成。',
        aspect_ratio: '16:9', duration: 6,
        reference_node_ids: [source.dataset.id], x: 1800, y: 1200,
      })
      const h3Runnable = await call('create_video_node', {
        engine: 'comfyui', title: '隔离运行反馈 H3 节点',
        prompt: '隔离测试用中文视频提示词，不会提交真实生成。',
        aspect_ratio: '16:9', duration: 6,
        reference_node_ids: [source.dataset.id], x: 1800, y: 1700,
      })
      const normalizedNode = ensureCanvasNodeMounted(normalized.node_id)
      const imageGeneratorNode = ensureCanvasNodeMounted(image.node_id)
      const h3Node = ensureCanvasNodeMounted(h3.node_id)
      h3Node.dataset.generationVideoSrc = '/output/qa-existing-video.mp4'
      window.CanvasFloraNodeShell?.syncToolbar?.(h3Node)
      await CanvasAgentUi.useSkill('qa-ordinary-skill', { boardId: canvasState.activeBoardId })
      const ordinary = await call('create_image_node', { title: '普通图片节点', prompt: '普通工作流默认值回归。', x: 1800, y: 800 })
      const ordinaryNode = ensureCanvasNodeMounted(ordinary.node_id)
      return {
        sourceId: source.dataset.id, implicitRun, normalized, image, created, repeat, blocked, directApiBlocked, directH3Blocked, duplicateRef, updated, h3, h3Blocked, apiRunnable, h3Runnable, controls, pendingLabel,
        defaults: {
          normalized: { model: normalizedNode.querySelector('.canvas-node-model')?.value, ratio: normalizedNode.querySelector('.canvas-node-size')?.value, resolution: normalizedNode.querySelector('.canvas-node-resolution')?.value },
          modelImage: { model: imageGeneratorNode.querySelector('.canvas-node-model')?.value, ratio: imageGeneratorNode.querySelector('.canvas-node-size')?.value, resolution: imageGeneratorNode.querySelector('.canvas-node-resolution')?.value },
          video: { model: h3Node.dataset.minimaxH3Model, ratio: h3Node.querySelector('[data-h3-param="aspectRatio"] select')?.value, duration: h3Node.querySelector('[data-h3-param="duration"] input')?.value },
          ordinary: { model: ordinaryNode.querySelector('.canvas-node-model')?.value, ratio: ordinaryNode.querySelector('.canvas-node-size')?.value, resolution: ordinaryNode.querySelector('.canvas-node-resolution')?.value },
        },
        downloadNodeId: h3.node_id, ordinary, snapshot: serializeCanvasBoard(), refs: getCanvasApiVideoRefs(video),
      }
    })
    fs.writeFileSync(path.join(evidence, 'created.json'), JSON.stringify(result, null, 2))
    assert.equal(result.implicitRun.running, false, 'blank prompt with selected required material completes the Skill turn')
    assert.equal(result.implicitRun.sendButtonEnabled, true, 'send button is enabled for a valid Skill and selected image')
    assert.match(result.implicitRun.status, /交付不完整/, 'an empty mock response cannot claim the fashion workflow is complete')
    assert.deepEqual(result.implicitRun.nodesAfter, result.implicitRun.nodesBefore, 'implicit task waits for Agent tools and does not fabricate workflow output')
    assert.equal(agentTurnRequests.length, 3, 'missing workflow is retried within the existing two-correction limit')
    assert.equal(agentTurnRequests[0].skill_id, fashionSkill.id, 'implicit Skill turn carries the selected Skill')
    assert.match(agentTurnRequests[0].prompt, /标准工作流/, 'implicit Skill turn supplies an actionable workflow instruction')
    assert.match(agentTurnRequests[0].prompt, /不执行或提交任何付费图片\/视频生成/, 'implicit Skill turn explicitly disallows paid generation')
    assert.ok(agentTurnRequests[0].canvas?.nodes?.some(node => node.id === result.sourceId), 'implicit Skill turn includes the selected image in canvas context')
    assert.equal(agentTurnRequests[0].vision_images?.length, 1, 'selected image-set member is passed as a readable vision reference')
    assert.equal(result.implicitRun.persisted?.implicitSkillRun, true, 'implicit mode survives local recovery persistence')
    assert.deepEqual(result.implicitRun.persisted?.paidAllowances, { generate_image_to_gallery: 0, run_canvas_node: 0 }, 'persisted implicit run has zero paid-generation allowance')
    assert.deepEqual(simulatedGenerationRequests, [], 'implicit Skill execution never calls a paid generation endpoint')
    assert.equal(result.image.ok, true, 'image generator created')
    assert.ok(Object.values(result.controls).every(Boolean), 'both real generators expose prompt, model and run controls')
    assert.deepEqual(result.defaults.normalized, { model: 'gpt-image-2', ratio: '3:4', resolution: '2' }, 'fashion standardization defaults are selected in node controls')
    assert.deepEqual(result.defaults.modelImage, { model: 'gpt-image-2', ratio: '4:5', resolution: '2' }, 'fashion model-image defaults are selected in node controls')
    assert.deepEqual(result.defaults.video, { model: 'minimax-h3', ratio: '3:4', duration: '6' }, 'fashion H3 defaults are selected in node controls')
    assert.notDeepEqual(result.defaults.ordinary, result.defaults.normalized, 'ordinary Skills keep their normal generator defaults')
    assert.equal(result.created.kind, 'video-api', 'API generator kind')
    assert.equal(result.created.ok, true, 'video created with valid pending connection')
    assert.match(result.pendingLabel, /等待上游图片生成/)
    assert.equal(result.created.persisted, true, 'video acknowledged by real SQLite persistence')
    assert.equal(result.repeat.node_id, result.created.node_id, 'same call is not duplicated')
    assert.deepEqual(result.created.pending_reference_node_ids, [result.image.node_id], 'pending dependency is reported')
    assert.equal(result.blocked.code, 'upstream_image_pending', 'pending API input blocks task submission')
    assert.equal(result.h3Blocked.code, 'upstream_image_pending', 'pending H3 input blocks task submission')
    assert.equal(result.directApiBlocked.code, 'upstream_image_pending', 'manual API execution also blocks missing input')
    assert.equal(result.directH3Blocked.code, 'upstream_image_pending', 'manual H3 execution also blocks missing input')
    assert.equal(result.duplicateRef.ok, true, 'extra API image is retained as an explicitly limited workflow association')
    assert.equal(result.updated.ok, true, 'API node accepts prompt/model/parameters updates')
    assert.equal(result.refs.length, 0, 'pending input has no invented media URL')
    assert.equal(paidRequests.length, 0, 'no paid request was submitted')
    const verifySpinner = async (nodeId, pathname, selector) => {
      const gate = createGenerationGate(pathname)
      await page.evaluate(({ nodeId, selector }) => {
        const node = ensureCanvasNodeMounted(nodeId)
        window.qaVideoRunPromise = selector === '.canvas-h3-run'
          ? runCanvasMinimaxH3Node(node)
          : runCanvasApiVideoNode(node)
      }, { nodeId, selector })
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${pathname} was not submitted to the locally intercepted test route`)), 8000)
        gate.started.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
      })
      const running = await page.evaluate(({ nodeId, selector }) => {
        const button = ensureCanvasNodeMounted(nodeId).querySelector(selector)
        const icon = button?.querySelector('svg')
        return { busy: button?.getAttribute('aria-busy'), disabled: button?.disabled, animation: icon ? getComputedStyle(icon).animationName : '' }
      }, { nodeId, selector })
      assert.equal(running.busy, 'true', `${pathname} reports an active run`)
      assert.equal(running.disabled, true, `${pathname} prevents duplicate submission`)
      assert.equal(running.animation, 'flora-node-spin', `${pathname} shows a rotating run icon`)
      gate.release()
      await page.evaluate(() => window.qaVideoRunPromise)
      const idle = await page.evaluate(({ nodeId, selector }) => {
        const button = ensureCanvasNodeMounted(nodeId).querySelector(selector)
        return { busy: button?.getAttribute('aria-busy'), disabled: button?.disabled }
      }, { nodeId, selector })
      assert.equal(idle.busy, 'false', `${pathname} clears busy state after failure`)
      assert.equal(idle.disabled, false, `${pathname} restores its run control`)
    }
    await verifySpinner(result.h3Runnable.node_id, '/api/minimax-h3-video', '.canvas-h3-run')
    await verifySpinner(result.apiRunnable.node_id, '/api/videos', '.canvas-api-video-run')
    assert.deepEqual(simulatedGenerationRequests.map(request => request.path), ['/api/minimax-h3-video', '/api/videos'], 'generation calls were intercepted locally, before any paid provider')
    const browserDownload = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
    const downloadButton = await page.evaluate(nodeId => {
      const node = ensureCanvasNodeMounted(nodeId)
      setCanvasNodePoint(node, { x: 100, y: 100 })
      updateCanvasNodePosition(node)
      selectCanvasNode(node)
      node.dataset.generationVideoSrc = '/output/qa-existing-video.mp4'
      node.dataset.videoMimeType = 'video/mp4'
      syncCanvasNodeModel(node)
      window.CanvasFloraNodeShell?.mount?.(node)
      window.CanvasFloraNodeShell?.syncToolbar?.(node)
      const button = node.querySelector('[data-flora-action="result-download"]')
      return { exists: Boolean(button), disabled: Boolean(button?.disabled), filename: button?.download || '' }
    }, result.downloadNodeId)
    await page.evaluate(nodeId => {
      const button = ensureCanvasNodeMounted(nodeId).querySelector('[data-flora-action="result-download"]')
      if (!button || button.disabled) throw new Error('generated video download action is unavailable')
      button.click()
    }, result.downloadNodeId)
    const download = await browserDownload
    assert.ok(downloadButton.exists && !downloadButton.disabled, 'generated video result download action is enabled')
    assert.ok(download, 'existing generated video can be downloaded from the real canvas result toolbar')
    const downloadPath = path.join(evidence, 'existing-video-download.mp4')
    await download.saveAs(downloadPath)
    const downloadedBytes = fs.readFileSync(downloadPath)
    assert.equal(crypto.createHash('sha256').update(downloadedBytes).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync(videoFixture)).digest('hex'), 'downloaded media bytes match the existing playable MP4')
    const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=format_name,duration,size', '-of', 'json', downloadPath], { encoding: 'utf8' }))
    assert.ok(Number(probe.format.duration) > 0 && Number(probe.format.size) === downloadedBytes.length, 'download is a non-empty playable MP4')
    const playback = await page.evaluate(base64 => new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.muted = true
      video.onloadeddata = () => resolve({ readyState: video.readyState, duration: video.duration, paused: video.paused })
      video.onerror = () => reject(new Error('downloaded video could not be decoded in Chromium'))
      video.src = `data:video/mp4;base64,${base64}`
      document.body.append(video)
    }), downloadedBytes.toString('base64'))
    assert.ok(playback.readyState >= 2 && playback.duration > 0 && playback.paused, 'downloaded MP4 opens in the browser without starting playback')
    const downloadFailure = await page.evaluate(async nodeId => {
      const button = ensureCanvasNodeMounted(nodeId).querySelector('[data-flora-action="result-download"]')
      const pending = window.downloadCanvasMediaAsset('/output/qa-missing-video.mp4', '失败视频.mp4', button)
      const during = { busy: button.getAttribute('aria-busy'), disabled: button.disabled }
      await pending
      return {
        during,
        after: { busy: button.getAttribute('aria-busy'), disabled: button.disabled },
        status: document.querySelector('.canvas-status span:last-child')?.textContent || '',
      }
    }, result.downloadNodeId)
    assert.deepEqual(downloadFailure.during, { busy: 'true', disabled: true }, 'download reports in-progress state while reading media')
    assert.deepEqual(downloadFailure.after, { busy: 'false', disabled: false }, 'download restores the result action after failure')
    assert.match(downloadFailure.status, /下载失败：.*视频文件不存在/, 'failed download explains that the media file is unavailable')
    await page.addScriptTag({ url: 'http://127.0.0.1:33199/media-download-test.js' })
    const historyDownloadWait = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
    await page.evaluate(() => window.qaDownloadMedia('/output/qa-existing-video.mp4', '历史视频'))
    const historyDownload = await historyDownloadWait
    assert.ok(historyDownload, 'history shared download action downloads an existing MP4')
    assert.match(historyDownload.suggestedFilename(), /\.mp4$/i, 'history download keeps the video extension')
    const historyPath = path.join(evidence, 'history-video-download.mp4')
    await historyDownload.saveAs(historyPath)
    const historyBytes = fs.readFileSync(historyPath)
    assert.equal(crypto.createHash('sha256').update(historyBytes).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync(videoFixture)).digest('hex'), 'history download preserves the existing video bytes')
    const historyProbe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', historyPath], { encoding: 'utf8' }))
    assert.ok(Number(historyProbe.format.duration) > 0 && Number(historyProbe.format.size) === historyBytes.length, 'history download is a playable non-empty video')
    const saved = {
      ...(await rpc('getBoardState', { boardId })),
      nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
      connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items,
    }
    assert.equal(saved.nodes.filter(node => node.kind === 'image' && !node.uploadOnly).length, 3, 'two fashion stages and one ordinary generator are present')
    const savedNormalized = saved.nodes.find(node => node.id === result.normalized.node_id)
    assert.equal(savedNormalized.model, 'gpt-image-2')
    assert.equal(savedNormalized.size, '3:4')
    assert.equal(savedNormalized.resolution, '2')
    const savedImage = saved.nodes.find(node => node.id === result.image.node_id)
    assert.equal(savedImage.model, 'gpt-image-2')
    assert.equal(savedImage.size, '4:5')
    assert.equal(savedImage.resolution, '2')
    const savedH3 = saved.nodes.find(node => node.id === result.h3.node_id)
    assert.equal(savedH3.minimaxH3Model, 'minimax-h3')
    assert.equal(savedH3.minimaxH3AspectRatio, '3:4')
    assert.equal(savedH3.minimaxH3Duration, 6)
    const savedVideo = saved.nodes.find(node => node.id === result.created.node_id)
    assert.match(savedVideo.apiVideoPrompt, /真实步伐自然转身/)
    assert.equal(savedVideo.apiVideoDuration, 10)
    assert.equal(savedVideo.apiVideoResolution, '1080p')
    assert.ok(saved.connections.some(edge => edge.from === result.image.node_id && edge.to === result.created.node_id))
    assert.ok(saved.connections.some(edge => edge.from === result.sourceId && edge.to === result.normalized.node_id))
    assert.ok(saved.connections.some(edge => edge.from === result.normalized.node_id && edge.to === result.image.node_id))
    const originalSource = saved.nodes.find(node => node.id === result.sourceId)
    assert.equal(originalSource.kind, 'asset-collection')
    assert.equal(result.image.prompt, saved.nodes.find(node => node.id === result.image.node_id).prompt)
    await setup()
    const restored = await page.evaluate(async ({ saved, videoId, imageId, normalizedId, h3Id }) => {
      await openCanvasBoardFromHistory(saved)
      const video = ensureCanvasNodeMounted(videoId)
      const image = ensureCanvasNodeMounted(imageId)
      const normalized = ensureCanvasNodeMounted(normalizedId)
      const h3 = ensureCanvasNodeMounted(h3Id)
      return {
        snapshot: serializeCanvasBoard(),
        result: getAgentCanvasNodeResult(video),
        refs: getCanvasApiVideoRefs(video),
        imageResult: getCanvasNodeOutput(image),
        normalized: { model: normalized.querySelector('.canvas-node-model')?.value, ratio: normalized.querySelector('.canvas-node-size')?.value, resolution: normalized.querySelector('.canvas-node-resolution')?.value },
        image: { model: image.querySelector('.canvas-node-model')?.value, ratio: image.querySelector('.canvas-node-size')?.value, resolution: image.querySelector('.canvas-node-resolution')?.value },
        h3: { model: h3.dataset.minimaxH3Model, ratio: h3.querySelector('[data-h3-param="aspectRatio"] select')?.value, duration: h3.querySelector('[data-h3-param="duration"] input')?.value },
      }
    }, { saved, videoId: result.created.node_id, imageId: result.image.node_id, normalizedId: result.normalized.node_id, h3Id: result.h3.node_id })
    assert.equal(restored.result.prompt, savedVideo.apiVideoPrompt, 'prompt restored after page reload')
    assert.deepEqual(restored.result.pending_reference_node_ids, [result.image.node_id], 'pending dependency restored')
    assert.equal(restored.refs.length, 0, 'reload does not invent a model image')
    assert.deepEqual(restored.normalized, result.defaults.normalized, 'normalization defaults survive refresh')
    assert.deepEqual(restored.image, result.defaults.modelImage, 'model-image defaults survive refresh')
    assert.deepEqual(restored.h3, result.defaults.video, 'H3 defaults survive refresh')
    const resolution = await page.evaluate(async ({ videoId, imageId, originalSource }) => {
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-second-product' })
      const fixture = originalSource.assetCollection.members[0].src
      const source = addCanvasAssetCollection({ x: 100, y: 1700 }, {
        title: '第二件商品参考', mode: 'single',
        members: [{ id: 'qa-original-second', kind: 'image', src: fixture + '#second-product', name: '第二件商品参考', source: 'upload' }],
      })
      source.dataset.boardId = canvasState.activeBoardId
      const secondImage = await broker.execute(scope, { name: 'create_image_node', call_id: 'second-image', arguments: { prompt: '只参考第二件商品，保留其全部服装特征，在纯白摄影棚由一位模特自然站立展示。', reference_node_ids: [source.dataset.id], x: 700, y: 1700 } })
      const secondVideo = await broker.execute(scope, { name: 'create_video_node', call_id: 'second-video', arguments: { engine: 'api', prompt: '固定机位，第二件商品的模特自然转身，保持服装一致。', aspect_ratio: '9:16', duration: 10, reference_node_ids: [secondImage.node_id], x: 1300, y: 1700 } })
      const firstVideoNode = ensureCanvasNodeMounted(videoId)
      const secondVideoNode = ensureCanvasNodeMounted(secondVideo.node_id)
      // A local fixture exercises result handoff only; it is not a generated deliverable.
      const fixtureResult = fixture + '#fixture-model-result'
      appendCanvasGenerationToGallery(ensureCanvasNodeMounted(imageId), { src: fixtureResult, name: '隔离结果交接测试图' })
      const originalRun = runCanvasImageEdit
      let runResult
      try {
        runCanvasImageEdit = async node => ({ ok: true, ...appendCanvasGenerationToGallery(node, { src: fixture + '#second-model-fixture', name: '第二件隔离结果图' }) })
        runResult = await broker.execute(scope, { name: 'run_canvas_node', call_id: 'fixture-run-result', arguments: { node_id: secondImage.node_id } })
      } finally { runCanvasImageEdit = originalRun }
      const previousModel = secondVideoNode.dataset.apiVideoModel
      let missingModel
      try {
        secondVideoNode.dataset.apiVideoModel = ''
        missingModel = await broker.execute(scope, { name: 'run_canvas_node', call_id: 'missing-model', arguments: { node_id: secondVideo.node_id } })
      } finally { secondVideoNode.dataset.apiVideoModel = previousModel }
      return {
        first: getAgentCanvasNodeResult(firstVideoNode),
        firstRefs: getCanvasApiVideoRefs(firstVideoNode),
        firstStatus: firstVideoNode.querySelector('.canvas-h3-status')?.textContent,
        secondImage, secondVideo,
        secondRefs: getCanvasApiVideoRefs(secondVideoNode),
        fixtureResult, runResult, missingModel,
      }
    }, { videoId: result.created.node_id, imageId: result.image.node_id, originalSource })
    fs.writeFileSync(path.join(evidence, 'handoff.json'), JSON.stringify(resolution, null, 2))
    assert.deepEqual(resolution.first.pending_reference_node_ids, [], 'real result handoff resolves only its downstream dependency')
    assert.equal(resolution.firstRefs[0].url, resolution.fixtureResult)
    assert.equal(resolution.firstStatus, '待执行', 'resolved input clears the pending status')
    assert.deepEqual(resolution.secondVideo.pending_reference_node_ids, [resolution.secondImage.node_id], 'another product initially stays pending')
    assert.notEqual(resolution.secondRefs[0]?.url, resolution.fixtureResult, 'another product never consumes the first product result')
    assert.equal(resolution.runResult.ok, true, 'image result stored in the existing node is acknowledged without requiring a retired gallery')
    assert.equal(resolution.missingModel.ok, false, 'missing video model never reports successful execution')
    assert.equal(paidRequests.length, 0)
    assert.deepEqual(pageErrors, [])
    fs.writeFileSync(path.join(evidence, 'saved.json'), JSON.stringify(saved, null, 2))
    console.log(JSON.stringify({ ok: true, evidence, nodes: saved.nodes.length, connections: saved.connections.length, paidRequests: paidRequests.length, simulatedGenerationRequests, pageErrors, checks: ['real-node-controls', 'API-H3-create', 'pending-dependency', 'local-intercepted-spinner', 'canvas-and-history-existing-mp4-download-and-decode', 'no-paid-submit', 'API-update', 'capacity', 'idempotency', 'SQLite-save', 'reload', 'result-handoff-fixture', 'per-product-isolation'] }))
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await rpc('close')
    await worker.terminate()
  }
}

;(process.argv.includes('--browser') ? browserCheck() : unit()).catch(error => { console.error(error); process.exitCode = 1 })
