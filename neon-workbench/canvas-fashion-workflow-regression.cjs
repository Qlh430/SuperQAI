const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const crypto = require('node:crypto')
const { Worker } = require('node:worker_threads')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const diagnostic = JSON.parse(fs.readFileSync(path.join(root, 'AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json')))
const skillId = 'fashion-ecommerce-ai-model-video'
const skillRoot = path.join(diagnostic.dataDirectory, 'users/28967de5-f4d8-4bdd-a024-e02469022182-5022b724bea041d10465/skills', skillId)
const referencePaths = ['01-product-front-back.md', '02-fashion-model-front.md', '03-natural-turn-video.md', '04-canvas-execution.md'].map(file => `references/${file}`)
const references = Object.fromEntries(referencePaths.map(file => [file, fs.readFileSync(path.join(skillRoot, file), 'utf8')]))
const realImage = path.join(diagnostic.dataDirectory, 'output/O1CN016dFUNX1EbVbN4CA7Z_!!2635590370_1794022144617_c007db1e.jpg')
const imageModel = 'custom:qa-provider:Z3B0LWltYWdlLTI'
const stage = path.resolve(root, '../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app')
const deployed = process.argv.includes('--deployed')
const before = process.argv.includes('--before')
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const originalHashes = Object.fromEntries(['SKILL.md', ...referencePaths].map(file => [file, digest(path.join(skillRoot, file))]))
const promptFrom = (file, fields) => references[`references/${file}`].split(/\r?\n/).filter(line => line.startsWith('> ')).map(line => line.slice(2))
  .join('\n').replace(/【([^】]+)】/g, (_, field) => {
    assert.ok(Object.hasOwn(fields, field), `missing stage-specific prompt value: ${field}`)
    return fields[field]
  })

async function main() {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-fashion-five-node-'))
  const { frontendFiles } = await import('./daily-workbench.mjs')
  const source = deployed ? {} : {
    'script.js': path.join(__dirname, 'design-sources/script-before-save-bridge.js'),
    'canvas-agent-ui.js': path.join(root, 'host-sources/app/canvas-agent-ui.js'),
  }
  const worker = new Worker(path.join(diagnostic.appRoot, 'canvas-db-worker.js'), { workerData: { dbPath: path.join(evidence, 'canvas.db') } })
  let sequence = 0
  const waiting = new Map()
  worker.on('message', message => {
    const item = waiting.get(message.id)
    if (!item) return
    waiting.delete(message.id)
    message.ok ? item.resolve(message.result) : item.reject(new Error(message.error?.message))
  })
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  const boardId = 'qa-fashion-five-node'
  await rpc('createBoard', { id: boardId, title: '隔离服装五节点验收' })
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'
    if (/^output\/qa-(clothing|standard-transfer|model-transfer|standard-retry)\.jpg$/.test(file)) return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(fs.readFileSync(realImage))
    const base = frontendFiles.has(file) ? stage : diagnostic.appRoot
    const target = source[file] || path.resolve(base, file)
    if (!source[file] && !target.startsWith(base + path.sep)) return res.writeHead(403).end()
    try {
      const bytes = fs.readFileSync(target)
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
    } catch { res.writeHead(404).end() }
  })
  if (!deployed) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } })
  const pageErrors = [], paidRequests = [], requests = [], tools = []
  const ids = {}
  let phase = 0
  let firstRequestAt
  let firstResponseAt
  let chatMode = false
  let chatAttempts = 0
  let readOnlyPhase = 0
  let conversation = { boardId, conversationId: 'qa-fashion-session', items: [], generationSettings: { mode: 'agent' }, revision: 0 }
  const call = (name, args, label) => ({ call_id: `qa-${label}`, name, arguments: args })
  const turn = calls => ({ response_id: `qa-turn-${requests.length}`, message: '', tool_calls: calls })
  const prompts = {
    standard: promptFrom('01-product-front-back.md', {
      '当前单件服装原图': 'qa-clothing.jpg 中浅灰色连帽拉链上衣与同色短裤套装的正面商品照片',
      '品类': '连帽拉链上衣与同色短裤两件套',
      '颜色、版型、材质表现、领口袖型、衣长、结构、口袋/纽扣/拉链/印花等真实细节': '浅灰色，连帽、长袖、前中拉链，上衣下摆与袖口为罗纹质感，同色短裤；可见布面细纹理，但纤维成分无法确认',
      '正面/背面/正反面': '仅正面',
    }),
    model: promptFrom('02-fashion-model-front.md', {
      '当前商品正反面参考图及真实商品图': '待生成的 @图片1 商品正反面标准化图',
      '品类、具体颜色、面料表现、轮廓版型、长度、领型、袖型、口袋、钮扣、拉链、纹样、Logo、缝线、所有可见特征': '浅灰色连帽拉链上衣与同色短裤套装；保留可见帽型、长袖、前中拉链、罗纹下摆和短裤轮廓；面料成分、不可见结构及无依据装饰保持未知且不补造',
      '已确认的模特条件': '成年女性模特，真实自然比例，正面全身站姿，外观自然克制',
      '当前产品': '浅灰色连帽拉链上衣与同色短裤套装',
    }),
    video: promptFrom('03-natural-turn-video.md', {
      '本商品真实模特正面参考图': '待生成的第二阶段模特正面参考图，当前尚无生成结果',
      '模特实际可见特征': '以第二阶段将生成的成年女性正面模特图为准，具体发型与外观以届时实际生成结果为准',
      '当前商品实际颜色、品类、面料、版型、长度、裁片、口袋数量和位置、纽扣/拉链/印花等确认细节': '浅灰色连帽拉链上衣与同色短裤套装；保留可见帽型、长袖、前中拉链、罗纹下摆和短裤轮廓；面料成分及不可见结构未知，不得补造',
    }),
  }
  assert.ok(Object.values(prompts).every(prompt => prompt.length > 300), 'full professional prompts come from installed reference files')
  assert.ok(Object.values(prompts).every(prompt => !/【[^】]+】/.test(prompt)), 'stage prompts replace every template field')
  assert.notEqual(prompts.standard, prompts.model, 'product and model prompts are independently composed')
  assert.notEqual(prompts.model, prompts.video, 'model and motion prompts are independently composed')
  assert.match(prompts.video, /尚无生成结果/)
  assert.doesNotMatch(prompts.standard, /模特以待生成的正面照片为准/)
  const modelCall = extra => call('create_image_node', {
    title: 'AI 模特正面图片', prompt: prompts.model, model: null, size: null, resolution: null,
    reference_node_ids: [ids.standard, ...(extra ? [ids.source] : [])], x: null, y: null,
  }, extra ? 'model-wrong-input' : 'model')
  const videoCall = complete => call('create_video_node', {
    engine: 'api', model: 'seedance-2.0', title: 'AI 模特动态视频', prompt: prompts.video,
    aspect_ratio: '9:16', duration: 4, resolution: null,
    reference_node_ids: complete ? [ids.model, ids.standard, ids.text] : [ids.model], x: null, y: null,
  }, complete ? 'video' : 'video-incomplete')
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  await page.routeWebSocket('**/*', ws => ws.close())
  if (deployed) await page.route('**/output/qa-*.jpg', route => route.fulfill({
    contentType: 'image/jpeg', body: fs.readFileSync(realImage),
  }))
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: {
      authenticated: true, user: { id: 'qa-isolated', username: 'qa-isolated', displayName: '隔离验收', role: 'superadmin', status: 'active' },
    } })
    if (req.method() === 'POST' && /^\/api\/(?:image-jobs|videos|images|minimax-h3|generate|comfyui\/(?:run|generate))\b/.test(url.pathname)) {
      paidRequests.push(url.pathname)
      return route.fulfill({ status: 503, json: { error: '禁止付费生成' } })
    }
    if (url.pathname === '/api/canvas-agent/skills') {
      const skill = { id: skillId, label: '服装电商 · AI 模特动态展示', origin: 'custom', scope: 'personal', required_selection: 'image', references: referencePaths.map(path => ({ path, bytes: Buffer.byteLength(references[path]) })) }
      return route.fulfill({ json: { configured: true, agentSettings: { configured: true }, skills: [skill], pickerSkills: [skill] } })
    }
    if (url.pathname === '/api/canvas-agent/conversation') {
      if (req.method() === 'POST' && req.postDataJSON().conversation) {
        conversation = { ...req.postDataJSON().conversation, revision: conversation.revision + 1 }
      }
      return route.fulfill({ json: conversation })
    }
    if (url.pathname === '/api/skills/reference') {
      const file = url.searchParams.get('path')
      return route.fulfill({ json: { skill_id: skillId, path: file, content: references[file], bytes: Buffer.byteLength(references[file] || '') } })
    }
    if (url.pathname === '/api/canvas-agent/turn') {
      const body = req.postDataJSON()
      if (readOnlyPhase === 1) {
        readOnlyPhase = 2
        return route.fulfill({ json: turn([call('focus_canvas_nodes', { node_ids: [ids.video] }, 'read-only-video')]) })
      }
      if (readOnlyPhase === 2) {
        readOnlyPhase = 3
        return route.fulfill({ json: { message: '已核对本画布的 H3 引用顺序。', tool_calls: [] } })
      }
      if (chatMode) {
        chatAttempts++
        await new Promise(resolve => setTimeout(resolve, chatAttempts === 2 ? 350 : 0))
        if (chatAttempts === 1) return route.fulfill({ status: 400, json: { error: '隔离验收：提交失败' } })
        if (chatAttempts === 4) return route.fulfill({ json: { request_id: 'qa-mismatched-id', message: '错误回执应被拒绝', tool_calls: [] } })
        return route.fulfill({ json: { message: `普通对话回复 ${chatAttempts}`, tool_calls: [] } })
      }
      requests.push(body)
      for (const item of body.tool_outputs || []) {
        const output = typeof item.output === 'string' ? JSON.parse(item.output) : item.output
        tools.push({ call_id: item.call_id, ...output })
        if (output.ok !== false && output.node_id) {
          if (item.call_id === 'qa-standard') ids.standard = output.node_id
          if (item.call_id.startsWith('qa-model')) ids.model = output.node_id
          if (item.call_id === 'qa-text') ids.text = output.node_id
          if (item.call_id.startsWith('qa-video')) ids.video = output.node_id
        }
      }
      if (phase === 0) {
        firstRequestAt = Date.now()
        phase = 1
        ids.source = body.canvas.nodes.find(node => node.kind === 'asset-collection').id
        await new Promise(resolve => setTimeout(resolve, 1200))
        firstResponseAt = Date.now()
        const reply = turn(referencePaths.map((path, i) => call('read_skill_reference', { skill_id: skillId, path }, `read-${i}`)))
        return route.fulfill({ json: { ...reply, request_id: body.request_id,
          vision_receipt: { count: body.vision_images?.length || 0, mime_type: 'image/jpeg' } } })
      }
      if (phase === 1) {
        phase = 2
        return route.fulfill({ json: turn([call('create_image_node', { title: '服装正反面标准化', prompt: prompts.standard, model: null, size: null, resolution: null, reference_node_ids: [ids.source], x: null, y: null }, 'standard')]) })
      }
      if (phase === 2) { phase = 3; return route.fulfill({ json: turn([modelCall(true)]) }) }
      if (phase === 3 && !ids.model) { phase = 4; return route.fulfill({ json: turn([modelCall(false)]) }) }
      if (phase === 3 || phase === 4) {
        phase = 5
        return route.fulfill({ json: { message: '工作流已搭建完成。', tool_calls: [] } })
      }
      if (phase === 5) {
        phase = 6
        return route.fulfill({ json: turn([call('create_text_node', { title: '03_自然转身视频提示词', content: prompts.video, x: null, y: null }, 'text')]) })
      }
      if (phase === 6) { phase = 7; return route.fulfill({ json: turn([videoCall(false)]) }) }
      if (phase === 7 && !ids.video) { phase = 8; return route.fulfill({ json: turn([videoCall(true)]) }) }
      if (phase < 9 && ids.video) {
        phase = 9
        return route.fulfill({ json: turn([call('move_nodes', { node_ids: [ids.text], delta_x: 0, delta_y: 650 }, 'move-prompt')]) })
      }
      phase = 9
      return route.fulfill({ json: { message: '仅搭建工作流，全部保持待执行。', tool_calls: [] } })
    }
    if (url.pathname.endsWith('/operations') && req.method() === 'POST') return route.fulfill({ json: await rpc('applyOperations', { boardId, ...req.postDataJSON() }) })
    if (url.pathname === '/api/canvas/boards') return route.fulfill({ json: { boards: [{ id: boardId, title: '隔离服装五节点验收', nodeCount: 5 }] } })
    if (url.pathname.includes(`/boards/${boardId}/`) && /\/(?:viewport|nodes|meta)$/.test(url.pathname)) {
      const state = await rpc('getBoardState', { boardId })
      return route.fulfill({ json: { ...state, complete: true, mode: 'detail', boardRevision: state.revision, engineVersion: 'canvas-visual-fidelity-v2',
        nodes: (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items,
        connections: (await rpc('exportBoardPage', { boardId, entity: 'connections', limit: 100 })).items,
      } })
    }
    return route.fulfill({ json: { authenticated: false, boards: [], models: [], providers: [], resources: [], projects: [], records: [], settings: {}, preferences: {} } })
  })
  const setup = async () => {
    await page.goto(deployed ? 'http://127.0.0.1:33200/' : `http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' })
    await page.evaluate(async ({ boardId, imageModel }) => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-text', 'canvas-node-minimax-h3', 'canvas-node-asset-collection', 'canvas-agent-tool-adapters'])
      await loadCanvasBoards()
      canvasState.activeBoardId = boardId
      canvasState.activeBoardPersisted = true
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
      const view = document.querySelector('#canvasView')
      surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      dispatchCanvasBoardChanged({ force: true })
      imageModelCatalog = [
        { id: 'qa-seedream', modelId: 'seedream-5.0', displayName: 'Seedream', family: 'seedream', platform: 'openai', resolutions: ['1', '2'] },
        { id: imageModel, modelId: 'gpt-image-2', displayName: 'GPT Image 2', family: 'gpt-image-2', platform: 'openai', capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2', '4'] },
      ]
      canvasImageModelCandidates = [{ id: imageModel, model: 'gpt-image-2', family: 'gpt-image-2', platform: 'openai', enabled: true, hasApiKey: true, hasBaseUrl: true, capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2', '4'] }]
      IMAGE_MODEL_FAMILIES[imageModel] = 'gpt-image-2'
      imageModelInput.innerHTML = `<option value="qa-seedream">Seedream</option><option value="${imageModel}">GPT Image 2</option>`
      imageModelInput.value = 'qa-seedream'; imageModelInput.dataset.modelSelection = 'auto'
      canvasImageModelsSettingsDirty = false
    }, { boardId, imageModel })
  }
  try {
    await setup()
    await page.evaluate(async skillId => {
      const asset = addCanvasAssetCollection({ x: 60, y: 80 }, { title: '真实服装图片（隔离只读夹具）', mode: 'single', members: [{ id: 'qa-clothing', kind: 'image', src: '/output/qa-clothing.jpg', name: '浅灰色服装套装', source: 'upload' }] })
      asset.dataset.boardId = canvasState.activeBoardId
      await saveCanvasBoardNow()
      selectCanvasNode(asset)
      await CanvasAgentUi.useSkill(skillId, { boardId: canvasState.activeBoardId })
      if (CanvasAgentUi.getActiveSkillId() !== skillId) throw new Error('未载入验收 Skill')
      document.querySelector('#canvasAgentPrompt').value = ''
      window.qaSendAt = Date.now()
      const messages = document.querySelector('#canvasAgentMessages')
      const watch = new MutationObserver(() => {
        if (!messages.querySelector('.canvas-agent-message.is-user')) return
        window.qaVisibleAt = Date.now()
        watch.disconnect()
      })
      watch.observe(messages, { childList: true })
      document.querySelector('#canvasAgentSend').click()
    }, skillId)
    await page.waitForFunction(skillId => JSON.parse(localStorage.getItem('canvas-agent-runs-v1') || '[]').some(run => run.skillId === skillId), skillId)
    await page.waitForFunction(() => !document.querySelector('#canvasAgentPanel')?.classList.contains('is-running'), { timeout: 30000 })
    const timing = await page.evaluate(() => ({ clickAt: window.qaSendAt, visibleAt: window.qaVisibleAt }))
    const timings = { clickToMessageMs: timing.visibleAt - timing.clickAt, clickToRequestMs: firstRequestAt - timing.clickAt,
      firstResponseMs: firstResponseAt - timing.clickAt, clickToFinishMs: Date.now() - timing.clickAt }
    console.log(JSON.stringify({ evidence, before, timings }))
    if (before) return
    assert.ok(timing.visibleAt < firstRequestAt, 'pending message and attachments must appear before submission')
    assert.match(requests[0].prompt, /已验证 GPT Image 2/)
    assert.equal(await page.locator('#canvasAgentStatus').textContent(), '工作流已保存 · 等待生成',
      (await page.locator('#canvasAgentMessages').innerText()).slice(-1800))
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#canvasAgentMessages .is-recovered .canvas-agent-tool-status')]
        .filter(element => element.textContent === '已自动纠正').length === 2)
    assert.equal(await page.locator('#canvasAgentMessages .canvas-agent-tool-step.is-error').count(), 0)
    await page.screenshot({ path: path.join(evidence, 'workflow.png') })
    const snapshot = await page.evaluate(() => serializeCanvasBoard())
    fs.writeFileSync(path.join(evidence, 'run.json'), JSON.stringify({ ids, requests, tools, snapshot, paidRequests, pageErrors }, null, 2))
    assert.equal(snapshot.nodes.length, 5, 'Agent must repair premature completion into five actual nodes')
    assert.equal(snapshot.connections.length, 5, 'five real relations must persist')
    const edges = snapshot.connections.map(edge => `${edge.from}>${edge.to}`).sort()
    assert.deepEqual(edges, [`${ids.source}>${ids.standard}`, `${ids.standard}>${ids.model}`, `${ids.standard}>${ids.video}`, `${ids.model}>${ids.video}`, `${ids.text}>${ids.video}`].sort())
    const standard = snapshot.nodes.find(node => node.id === ids.standard)
    const model = snapshot.nodes.find(node => node.id === ids.model)
    const text = snapshot.nodes.find(node => node.id === ids.text)
    const video = snapshot.nodes.find(node => node.id === ids.video)
    assert.deepEqual([standard.model, standard.modelSelection, standard.size, standard.resolution], [imageModel, 'exact', '3:4', '2'])
    assert.deepEqual([model.model, model.modelSelection, model.size, model.resolution], [imageModel, 'exact', '4:5', '2'])
    assert.deepEqual(standard.promptMentions?.map(item => [item.label, item.sourceNodeId]), [['@图片1', ids.source]])
    assert.deepEqual(model.promptMentions?.map(item => [item.label, item.sourceNodeId, item.pendingOutput]), [['@图片1', ids.standard, true]])
    assert.deepEqual([video.kind, video.minimaxH3Model, video.minimaxH3AspectRatio, video.minimaxH3Duration, video.minimaxH3Mode], ['minimax-h3', 'minimax-h3', '3:4', 6, 'reference'])
    assert.equal(text.nodeTitle || text.textName, '视频生成提示词')
    assert.equal(text.text, prompts.video)
    assert.equal(video.minimaxH3Prompt, '', '视频节点通过文字连线读取正文')
    assert.ok([standard, model, video].every(node => !node.resultSrc && !node.generationVideoSrc), 'no invented intermediate results')
    assert.ok(tools.some(tool => tool.call_id === 'qa-model-wrong-input' && tool.ok === false), 'raw original must not bypass standardization')
    assert.ok(tools.some(tool => tool.call_id === 'qa-video-incomplete' && tool.ok === false), 'missing text/garment input must be rejected before creation')
    assert.ok(requests.some(request => request.skill_contract_retry), 'early completion must trigger existing corrective loop')
    assert.ok(requests[0].vision_images?.length > 0, 'real canvas image still reaches Agent vision')
    const live = await page.evaluate(({ ids, skillId, imageModel, readReferences }) => {
      const model = ensureCanvasNodeMounted(ids.model), video = ensureCanvasNodeMounted(ids.video)
      const status = { image: getCanvasPendingImageReferenceIds(ids.model), video: getCanvasVideoPendingDependency(video), prompt: getCanvasGenerationPrompt(video, video.dataset.minimaxH3Prompt) }
      const geometry = Object.values(ids).map(id => ({ id, ...getAgentCanvasNodeBounds(ensureCanvasNodeMounted(id)) }))
      const promptBox = geometry.find(item => item.id === ids.text), videoBox = geometry.find(item => item.id === ids.video)
      const dx = Math.max(0, promptBox.left - videoBox.right, videoBox.left - promptBox.right)
      const dy = Math.max(0, promptBox.top - videoBox.bottom, videoBox.top - promptBox.bottom)
      const promptVideoOverlap = promptBox.left < videoBox.right && promptBox.right > videoBox.left
        && promptBox.top < videoBox.bottom && promptBox.bottom > videoBox.top
      const family = IMAGE_MODEL_FAMILIES[imageModel]
      delete IMAGE_MODEL_FAMILIES[imageModel]
      try {
        const validation = CanvasAgentCanvasApi.inspectSkillWorkflow?.({ skillId, sourceNodeIds: [ids.source], readReferences })
        return { status, geometry, promptVideoGap: Math.hypot(dx, dy), promptVideoOverlap, validation, modelRunAvailable: Boolean(model.querySelector('.canvas-node-run')), videoRunAvailable: Boolean(video.querySelector('.canvas-h3-run')) }
      } finally {
        IMAGE_MODEL_FAMILIES[imageModel] = family
      }
    }, { ids, skillId, imageModel, readReferences: referencePaths })
    assert.deepEqual(live.status.image, [ids.standard])
    assert.equal(live.status.video.code, 'upstream_image_pending')
    assert.equal(live.status.prompt, prompts.video, 'text connection is actually read without duplicated prompt')
    assert.ok(live.modelRunAvailable && live.videoRunAvailable)
    assert.ok(tools.some(tool => tool.call_id === 'qa-move-prompt' && tool.ok !== false), 'Agent move after video creation succeeds')
    assert.ok(live.promptVideoGap <= 160, `video prompt stays near the video node after Agent move, gap=${live.promptVideoGap}, geometry=${JSON.stringify(live.geometry)}`)
    assert.equal(live.promptVideoOverlap, false, 'video prompt remains outside the final rendered video node bounds')
    assert.equal(live.validation?.ok, true, 'real graph satisfies completion validation')
    const correctedToolRows = conversation.items.filter(item => item.role === 'tool' && item.status === 'completed' && item.text === '已自动纠正').length
    assert.equal(correctedToolRows, 2)
    const skipWire = await page.evaluate(ids => {
      const edge = canvasState.connections.find(item => item.from === ids.standard && item.to === ids.video)
      const from = clampCanvasWireEndpoint(getCanvasConnectionPortPoint(edge.from, 'output'), edge.from)
      const to = clampCanvasWireEndpoint(getCanvasConnectionPortPoint(edge.to, 'input'), edge.to)
      const obstacle = getCanvasConnectionNodeBox(ids.model)
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', getCanvasConnectionPathData(from, to, edge))
      const length = path.getTotalLength()
      return {
        routed: path.getAttribute('d').includes(' Q '),
        crossesModel: Array.from({ length: 181 }, (_, index) => path.getPointAtLength(length * index / 180))
          .some(point => point.x > obstacle.left && point.x < obstacle.right && point.y > obstacle.top && point.y < obstacle.bottom),
      }
    }, ids)
    assert.deepEqual(skipWire, { routed: true, crossesModel: false }, 'standard image bypasses the intervening model node')
    live.skipWire = skipWire
    const h3Readback = await page.evaluate(ids => {
      canvasVirtualizer.unmountId(ids.model)
      canvasVirtualizer.unmountId(ids.standard)
      return getAgentCanvasNodeResult(ensureCanvasNodeMounted(ids.video))
    }, ids)
    assert.deepEqual(h3Readback.reference_node_ids, [ids.model, ids.standard, ids.text])
    assert.deepEqual(h3Readback.model_input_reference_node_ids, [ids.model, ids.standard])
    assert.deepEqual(new Set(h3Readback.pending_reference_node_ids), new Set([ids.model, ids.standard]))
    live.h3ReferenceReadback = h3Readback
    fs.writeFileSync(path.join(evidence, 'live.json'), JSON.stringify(live, null, 2))
    await page.screenshot({ path: path.join(evidence, 'before-layout-check.png') })
    for (let a = 0; a < live.geometry.length; a++) for (let b = a + 1; b < live.geometry.length; b++) {
      const x = live.geometry[a], y = live.geometry[b]
      assert.ok(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top, `external node bounds overlap: ${x.id}/${y.id}`)
    }
    await page.evaluate(ids => focusAgentCanvasNodesInViewport(Object.values(ids).map(id => ensureCanvasNodeMounted(id))), ids)
    await page.screenshot({ path: path.join(evidence, 'five-nodes.png') })
    const persisted = (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items
    assert.equal(persisted.length, 5)
    await setup()
    await page.evaluate(async boardId => {
      const meta = await fetch(`/api/canvas/boards/${boardId}/meta`).then(response => response.json())
      await openCanvasBoardFromHistory(meta)
    }, boardId)
    const restored = await page.evaluate(() => serializeCanvasBoard())
    for (const before of snapshot.nodes) {
      const after = restored.nodes.find(node => node.id === before.id)
      for (const key of ['nodeTitle', 'textName', 'text', 'model', 'modelSelection', 'size', 'resolution', 'prompt', 'minimaxH3Model', 'minimaxH3Mode', 'minimaxH3Prompt', 'minimaxH3AspectRatio', 'minimaxH3Duration', 'refOrder', 'x', 'y']) {
        assert.deepEqual(after?.[key], before[key], `refresh preserves ${before.id}.${key}`)
      }
    }
    assert.deepEqual(restored.connections.map(edge => `${edge.from}>${edge.to}`).sort(), edges)
    const duplicate = await page.evaluate(async ({ skillId, sourceId, prompt }) => {
      await CanvasAgentUi.useSkill(skillId, { boardId: canvasState.activeBoardId })
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-duplicate-recovery' })
      return broker.execute(scope, { name: 'create_image_node', call_id: 'different-call-id', arguments: { title: '服装正反面标准化', prompt, reference_node_ids: [sourceId] } })
    }, { skillId, sourceId: ids.source, prompt: prompts.standard })
    assert.equal(duplicate.node_id, ids.standard, 'a retried identical stage reuses the existing valid node')
    const handoff = await page.evaluate(async ids => {
      const standard = ensureCanvasNodeMounted(ids.standard), model = ensureCanvasNodeMounted(ids.model), video = ensureCanvasNodeMounted(ids.video)
      const blocked = await runCanvasMinimaxH3Node(video)
      appendCanvasGenerationToGallery(standard, { src: '/output/qa-standard-transfer.jpg', name: '上游交接夹具，非生成结果' })
      appendCanvasGenerationToGallery(model, { src: '/output/qa-model-transfer.jpg', name: '模特交接夹具，非生成结果' })
      let dryRequest
      const originalFetch = window.fetch
      try {
        window.fetch = async (url, init) => {
          if (String(url) === '/api/minimax-h3-video') {
            dryRequest = JSON.parse(init.body)
            return new Response(JSON.stringify({ error: '仅检查提交参数，未发送后端' }), { status: 503 })
          }
          return originalFetch(url, init)
        }
        await runCanvasMinimaxH3Node(video)
      } finally { window.fetch = originalFetch }
      setCanvasImageDependencyState(standard, 'running')
      const rerunning = getCanvasVideoPendingDependency(video)
      const stale = getCanvasIncomingMinimaxH3Refs(video).images.map(ref => ref.url)
      setCanvasImageDependencyState(standard, 'failed')
      const failed = getCanvasVideoPendingDependency(video)
      appendCanvasGenerationToGallery(standard, { src: '/output/qa-standard-retry.jpg', name: '重试交接夹具，非生成结果' })
      setCanvasImageDependencyState(standard, 'completed')
      const retried = getCanvasIncomingMinimaxH3Refs(video).images.map(ref => ref.url)
      return { blocked, dryRequest, rerunning, stale, failed, retried, edgeCount: canvasState.connections.length }
    }, ids)
    assert.equal(handoff.blocked?.code, 'upstream_image_pending')
    assert.deepEqual(handoff.dryRequest?.images.map(image => image.url), ['/output/qa-model-transfer.jpg', '/output/qa-standard-transfer.jpg'])
    assert.match(handoff.dryRequest?.prompt || '', /自然循环/)
    assert.deepEqual([handoff.dryRequest?.mode, handoff.dryRequest?.duration, handoff.dryRequest?.aspect_ratio], ['reference', 6, '3:4'])
    const h3 = require(path.join(diagnostic.appRoot, 'minimax-h3-workflow.js'))
    const request = h3.normalizeMinimaxH3Request(handoff.dryRequest)
    const template = JSON.parse(fs.readFileSync(path.join(diagnostic.appRoot, 'workflows/minimax-h3-video.json')))
    const prepared = h3.prepareMinimaxH3Workflow(template, request, 'qa-no-submit')
    const referenceNode = Object.values(prepared).find(node => node.class_type === 'MiniMaxH3ReferenceToVideo')
    assert.equal(Object.keys(referenceNode.inputs).filter(key => key.startsWith('ref_images.')).length, 2, 'both references reach actual existing H3 workflow inputs')
    assert.equal(handoff.rerunning?.code, 'upstream_image_pending')
    assert.equal(handoff.failed?.code, 'upstream_image_pending')
    assert.ok(!handoff.stale.includes('/output/qa-standard-transfer.jpg'), 'regeneration cannot reuse old standardization result')
    assert.ok(handoff.retried.includes('/output/qa-standard-retry.jpg'))
    assert.equal(handoff.edgeCount, 5)
    const missingModel = await page.evaluate(async ({ skillId, sourceId, prompt }) => {
      await CanvasAgentUi.useSkill(skillId, { boardId: canvasState.activeBoardId })
      imageModelCatalog = imageModelCatalog.filter(model => model.id === 'qa-seedream')
      canvasImageModelCandidates = []
      imageModelInput.querySelectorAll('option').forEach(option => { if (option.value !== 'qa-seedream') option.remove() })
      const before = serializeCanvasBoard().nodes.length
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa-missing-gpt' })
      const output = await broker.execute(scope, { name: 'create_image_node', call_id: 'missing-gpt', arguments: { title: '新商品标准化', prompt, reference_node_ids: [sourceId] } })
      return { output, before, after: serializeCanvasBoard().nodes.length }
    }, { skillId, sourceId: ids.source, prompt: prompts.standard + '新建参数缺失检查。' })
    assert.equal(missingModel.output.ok, false)
    assert.match(missingModel.output.error, /GPT Image 2/)
    assert.equal(missingModel.after, missingModel.before, 'missing required model never creates an automatic substitute')
    await setup()
    const edited = await page.evaluate(async ({ ids, boardId }) => {
      await openCanvasBoardFromHistory(await fetch(`/api/canvas/boards/${boardId}/meta`).then(response => response.json()))
      const node = ensureCanvasNodeMounted(ids.model)
      applyAgentCanvasNodeChanges(node, { model: 'qa-seedream', size: '1024x1024', resolution: '1', prompt: '用户手动调整的模特摄影提示词，不运行生成。' })
      applyAgentCanvasNodeChanges(ensureCanvasNodeMounted(ids.video), { aspect_ratio: '9:16', duration: 8 })
      await saveCanvasBoardNow()
      return serializeCanvasBoard()
    }, { ids, boardId })
    await setup()
    const editedRestored = await page.evaluate(async boardId => {
      await openCanvasBoardFromHistory(await fetch(`/api/canvas/boards/${boardId}/meta`).then(response => response.json()))
      return serializeCanvasBoard()
    }, boardId)
    for (const id of [ids.model, ids.video]) {
      const before = edited.nodes.find(node => node.id === id), after = editedRestored.nodes.find(node => node.id === id)
      for (const key of ['model', 'size', 'resolution', 'prompt', 'minimaxH3AspectRatio', 'minimaxH3Duration']) {
        assert.equal(after[key], before[key], `user edits survive refresh without reapplying Skill defaults: ${key}`)
      }
    }
    assert.deepEqual(paidRequests, [])
    assert.deepEqual(pageErrors, [])
    const markdown = '# 阅读测试\n\n正文 **加粗**。\n\n1. 第一项\n2. 第二项\n\n- 无序列表\n\n> 引用\n\n| 字段 | 内容 |\n| --- | --- |\n| 模型 | 图片 |\n\n```text\n代码内容\n```\n\n' + '用于验证中文长段落、换行和内容宽度。'.repeat(45)
    const documentId = await page.evaluate(markdown => {
      const node = addCanvasText({ x: 120, y: 80 }, { text: markdown, name: "Markdown 验收", focus: false })
      syncCanvasNodeModel(node)
      Object.assign(canvasState, { x: 80, y: 30, scale: 1 })
      applyCanvasTransformNow()
      selectCanvasNode(node)
      return node.dataset.id
    }, markdown)
    const textNode = page.locator(`.canvas-node[data-id="${documentId}"]`)
    const body = textNode.locator('.canvas-text')
    await body.locator('h1').waitFor({ state: 'attached', timeout: 4000 }).catch(async error => {
      const details = await page.evaluate(id => {
        const node = getCanvasNode(id) || ensureCanvasNodeMounted(id)
        return { mounted: Boolean(node), html: node?.querySelector('.canvas-text')?.innerHTML.slice(0, 400),
          model: getCanvasNodeModel(id)?.kind }
      }, documentId)
      throw new Error(`${error.message}\n${JSON.stringify(details)}`)
    })
    const layout = () => body.evaluate(element => ({
      width: Number(element.closest('.canvas-node').dataset.width),
      height: Number(element.closest('.canvas-node').dataset.height),
      font: getComputedStyle(element.querySelector('.canvas-text-markdown')).fontSize,
      blocks: [...element.querySelectorAll('h1,strong,ol,ul,blockquote,table,pre')].map(item => item.tagName),
    }))
    const selectedLayout = await layout()
    await page.evaluate(id => {
      clearCanvasSelection()
      pinCanvasNode(id)
      ensureCanvasNodeMounted(id)
    }, documentId)
    const normalLayout = await layout()
    assert.deepEqual(selectedLayout, normalLayout)
    assert.ok(normalLayout.width >= 400 && normalLayout.width <= 480)
    for (const tag of ['H1','STRONG','OL','UL','BLOCKQUOTE','TABLE','PRE']) assert.ok(normalLayout.blocks.includes(tag), tag)
    await textNode.screenshot({ path: path.join(evidence, 'markdown-normal.png') })
    await body.click()
    assert.deepEqual(await layout(), normalLayout)
    await body.dblclick()
    await page.waitForFunction(id => document.querySelector(`.canvas-node[data-id="${id}"] .canvas-text`)?.isContentEditable, documentId)
    assert.deepEqual(await layout(), normalLayout)
    await textNode.screenshot({ path: path.join(evidence, 'markdown-edit.png') })
    await body.press('Escape')
    assert.deepEqual(await layout(), normalLayout)
    const zoomLayout = await page.evaluate(id => {
      canvasState.scale = 0.55
      applyCanvasTransformNow()
      const node = ensureCanvasNodeMounted(id)
      const body = node.querySelector('.canvas-text')
      return { width: Number(node.dataset.width), height: Number(node.dataset.height), font: getComputedStyle(body.querySelector('.canvas-text-markdown')).fontSize,
        blocks: [...body.querySelectorAll('h1,strong,ol,ul,blockquote,table,pre')].map(item => item.tagName) }
    }, documentId)
    assert.deepEqual(zoomLayout, normalLayout, 'canvas zoom does not change document layout dimensions or Markdown structure')
    await page.evaluate(async () => { await saveCanvasBoardNow() })
    const savedDocument = (await rpc('exportBoardPage', { boardId, entity: 'nodes', limit: 100 })).items.find(node => node.id === documentId)
    assert.equal(savedDocument.text, markdown)
    await setup()
    const restoredDocumentLayout = await page.evaluate(async ({ boardId, id }) => {
      await openCanvasBoardFromHistory(await fetch(`/api/canvas/boards/${boardId}/meta`).then(response => response.json()))
      const node = ensureCanvasNodeMounted(id), body = node.querySelector('.canvas-text')
      return { width: Number(node.dataset.width), height: Number(node.dataset.height), font: getComputedStyle(body.querySelector('.canvas-text-markdown')).fontSize,
        blocks: [...body.querySelectorAll('h1,strong,ol,ul,blockquote,table,pre')].map(item => item.tagName) }
    }, { boardId, id: documentId })
    assert.deepEqual(restoredDocumentLayout, normalLayout, 'Markdown layout survives refresh and board restore')
    await page.evaluate(async skillId => {
      clearCanvasSelection()
      await CanvasAgentUi.useSkill(skillId, { boardId: canvasState.activeBoardId })
    }, skillId)
    readOnlyPhase = 1
    await page.locator('#canvasAgentPrompt').fill('请只读复核视频节点的引用顺序。')
    await page.locator('#canvasAgentSend').click()
    await page.getByText('已核对本画布的 H3 引用顺序。', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent === '已完成只读核对')
    const readOnlyStatus = await page.locator('#canvasAgentStatus').textContent()
    assert.equal(readOnlyPhase, 3)
    chatMode = true
    await page.evaluate(() => clearCanvasSelection())
    const panelOpen = page.locator('#canvasAgentPanel')
    if (await panelOpen.getAttribute('aria-hidden') === 'true') await page.locator('#canvasAgentToggle').click()
    await page.locator('#canvasAgentSkillBook').click()
    await page.locator('#canvasAgentUseAuto').click()
    const field = page.locator('#canvasAgentPrompt')
    const send = page.locator('#canvasAgentSend')
    await field.fill('普通对话验收一')
    await send.click()
    await page.waitForFunction(() => [...document.querySelectorAll('#canvasAgentMessages article')].some(node => node.textContent.includes('提交失败')))
    assert.equal(await field.inputValue(), '普通对话验收一')
    await send.click()
    await page.getByText('普通对话回复 2', { exact: true }).waitFor()
    await field.fill('普通对话验收二')
    await send.click()
    await page.getByText('普通对话回复 3', { exact: true }).waitFor()
    assert.equal(chatAttempts, 3)
    await field.fill('错误回执验收')
    await send.click()
    await page.getByText('服务返回的请求标识与当前消息不一致。', { exact: true }).waitFor()
    assert.equal(await page.getByText('错误回执应被拒绝', { exact: true }).count(), 0)
    for (const [file, hash] of Object.entries(originalHashes)) assert.equal(digest(path.join(skillRoot, file)), hash, 'installed Skill remains unchanged')
    fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ pass: true, mode: deployed ? 'fixed-stage' : 'source', nodes: 5, edges: 5, timings, normalLayout, zoomLayout, restoredDocumentLayout, promptChecks: { stageSpecific: true, unfilledTemplateFields: 0, falseGeneratedState: false }, correctedToolRows, readOnlyStatus, chatAttempts, realImageBytes: fs.statSync(realImage).size, tools, live, duplicate, handoff, missingModel, paidRequests, pageErrors, boundary: 'Real canvas components and SQLite persistence; isolated model responses and marked transfer fixtures; no live Agent/provider request.' }, null, 2))
    console.log(JSON.stringify({ pass: true, evidence, nodes: 5, edges: 5, paidRequests, pageErrors }))
  } finally {
    await browser.close()
    if (server.listening) await new Promise(resolve => server.close(resolve))
    await worker.terminate()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
