const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const source = fs.readFileSync(process.env.AI_OS_IMAGE_DEPENDENCY_SCRIPT
  || path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8')

function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'))
  if (start < 0) return ''
  const next = source.slice(start + 1).search(/^(?:async )?function \w+\(/m)
  return source.slice(start, next < 0 ? source.length : start + next + 1)
}

function fixture() {
  const nodes = new Map()
  const submitted = []
  const virtualStore = new Map()
  virtualStore.upsert = model => virtualStore.set(String(model.id), model)
  const sandbox = {
    console, window: {}, canvasRepresentation: null, canvasState: { connections: [] }, canvasVirtualStore: virtualStore,
    document: { querySelectorAll: () => ({ forEach() {} }) },
    canvasIncomingOutputCache: new Map(),
    getCanvasNode: id => nodes.get(id) || null,
    rememberCanvasIncomingOutput(key, output) { sandbox.canvasIncomingOutputCache.set(key, output) },
    getCanvasNodeRefOrder: () => [], getCanvasH3ReferenceOrder: () => [],
    sortCanvasReferenceItems: items => items,
    applyCanvasRefOrder: (_node, refs) => refs, QWEN_IMAGE21_API_URL: '/api/isolated-qwen',
    getCanvasTextValue: node => node.text || '',
    CanvasGenerationSound: { arm() {} },
    syncCanvasPromptFromTextInputs() {}, scheduleCanvasSave() {}, refreshCanvasDownstreamNodes() {},
    getCanvasNodeStatusElement: node => node.status,
    setCanvasStatus: text => { sandbox.lastCanvasStatus = text },
    getCanvasPortPoint: () => ({}),
    setCanvasNodeStatus: (node, text) => { node.status.textContent = text },
    setCanvasImageNodeGenerationState: (node, active) => { node.dataset.canvasGenerating = String(active) },
    syncCanvasNodeModel() {}, syncCanvasNodeResolutionState: () => ({ supported: true }),
    getCanvasOutputSize: () => '1024x1024', getCanvasImageResolution: () => '1',
    isMidjourneyModel: () => false, getImageModelPlatform: () => 'jimeng',
    prepareOpenAIEditRefs: async refs => refs, getCanvasImageProtocolParams: () => ({}),
    createCanvasImageJob: async body => { submitted.push(body); throw new Error('isolated task boundary') },
    getSafeCanvasImageGenerationError: error => ({ ok: false, code: error.code || 'intercepted', error: error.message }),
    CANVAS_IMAGE_JOB_ACTIVE_STATES: new Set(['queued', 'submitting', 'running', 'syncing']),
  }
  vm.createContext(sandbox)
  for (const name of [
    'isCanvasImageGenerator', 'isCanvasImageReferencePending', 'hasCanvasDependencyPath',
    'getCanvasImageReferenceSignature', 'getCanvasImagePendingDependency', 'syncCanvasImageDependencyStatus',
    'assertCanvasImageReferencesCurrent', 'setCanvasImageDependencyState', 'syncCanvasImageDependencyModel',
    'getCanvasNodeOutput', 'getCanvasVirtualNodeOutput', 'getCanvasH3ConnectionCapacity',
    'getCanvasApiVideoConnectionCapacity', 'getCanvasMidjourneyConnectionCapacity',
    'getCanvasConnectionCompatibility', 'getCanvasPendingImageReferenceIds', 'getCanvasVideoPendingDependency',
    'getCanvasIncomingItems', 'getCanvasIncomingRefs', 'getCanvasIncomingTexts', 'connectCanvasNodes',
    'getCanvasGenerationPrompt', 'runCanvasImageEdit', 'runCanvasComfyNode',
    'runCanvasComfyQwen21Node', 'getSafeCanvasImageGenerationError', 'syncCanvasImageJobProgress',
  ]) {
    const fn = extract(name)
    if (fn) vm.runInContext(fn, sandbox, { filename: `canvas:${name}` })
  }
  const add = (id, fields = {}, kind = 'image') => {
    const node = {
      dataset: { id, modelSelection: 'auto', ...fields },
      classList: { contains: name => name === `canvas-node-${kind}` },
      status: { textContent: '' },
      querySelector: selector => selector === '.canvas-node-model'
        ? { value: 'fixture-model', dataset: { modelSelection: 'auto' } }
        : selector === '.canvas-node-prompt' ? { value: '仅依据当前上游图片生成，保留主体结构、颜色和细节。' } : null,
    }
    nodes.set(id, node)
    return node
  }
  const connect = (from, to) => sandbox.canvasState.connections.push({ from, to, fromPort: 'output', toPort: 'input' })
  return { sandbox, nodes, submitted, add, connect }
}

test('empty image generators can be wired before either result exists', () => {
  const { sandbox: api, add } = fixture()
  const a = add('a'), b = add('b')
  assert.equal(api.getCanvasConnectionCompatibility(a, b, api.getCanvasNodeOutput(a)).ok, true)
  assert.equal(api.getCanvasConnectionCompatibility(a, add('comfy', {}, 'comfy'), api.getCanvasNodeOutput(a)).ok, true)
})

test('image-to-image rejects cycles even when upstream already has an image', () => {
  const { sandbox: api, add, connect } = fixture()
  const a = add('a', { resultSrc: '/output/old-a.png' }), b = add('b', { resultSrc: '/output/old-b.png' })
  connect('a', 'b')
  assert.equal(api.getCanvasConnectionCompatibility(b, a, api.getCanvasNodeOutput(b)).ok, false)
  assert.equal(api.getCanvasConnectionCompatibility(a, a, api.getCanvasNodeOutput(a)).ok, false)
})

test('cycle rejection does not add an invalid persisted edge', () => {
  const { sandbox: api, add, connect } = fixture()
  const a = add('a', { resultSrc: '/output/a.png' }), b = add('b', { resultSrc: '/output/b.png' })
  connect('a', 'b')
  api.document = { querySelectorAll: () => ({ forEach() {} }) }
  api.connectCanvasNodes('b', 'a')
  assert.equal(api.canvasState.connections.length, 1)
  assert.equal(api.canvasState.connections[0].from, 'a')
  assert.match(api.lastCanvasStatus, /循环依赖/)
})

test('pending reference blocks manual image execution before task submission', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  add('a')
  const b = add('b')
  connect('a', 'b')
  const result = await api.runCanvasImageEdit(b)
  assert.equal(result.code, 'upstream_image_pending')
  assert.equal(submitted.length, 0)
  assert.match(b.status.textContent, /等待上游图片/)
})

test('another valid reference cannot hide an ungenerated reference', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  add('a')
  add('asset', { uploadOnly: 'true', imageSrc: '/output/asset.png' })
  const b = add('b')
  connect('a', 'b')
  connect('asset', 'b')
  const result = await api.runCanvasImageEdit(b)
  assert.equal(result.code, 'upstream_image_pending')
  assert.equal(submitted.length, 0)
})

for (const state of ['queued', 'running', 'syncing', 'failed', 'sync_failed', 'task_pending', 'unknown']) {
  test(`latest ${state} attempt never exposes its previous committed image`, () => {
    const { sandbox: api, add, connect } = fixture()
    add('a', { resultSrc: '/output/old.png', imageJobId: 'new', imageJobCommittedId: 'old', imageJobState: state })
    add('b')
    connect('a', 'b')
    assert.deepEqual(Array.from(api.getCanvasPendingImageReferenceIds('b')), ['a'])
    assert.equal(api.getCanvasIncomingRefs('b').length, 0)
  })
}

test('successful latest image replaces old input without replacing its connection', () => {
  const { sandbox: api, add, connect } = fixture()
  const a = add('a', { resultSrc: '/output/new.png', imageJobId: 'new', imageJobCommittedId: 'new', imageJobState: 'completed' })
  add('b')
  connect('a', 'b')
  assert.equal(api.getCanvasIncomingRefs('b')[0].url, '/output/new.png')
  a.dataset.resultSrc = '/output/newer.png'
  a.dataset.imageJobId = a.dataset.imageJobCommittedId = 'newer'
  assert.equal(api.getCanvasIncomingRefs('b')[0].url, '/output/newer.png')
  assert.equal(api.canvasState.connections.length, 1)
})

test('generated image reference uses result as original, not an obsolete upload', () => {
  const { sandbox: api, add, connect } = fixture()
  add('a', { resultSrc: '/output/result.png', originalSrc: '/output/original.png' })
  add('b')
  connect('a', 'b')
  const ref = api.getCanvasIncomingRefs('b')[0]
  assert.equal(ref.url, '/output/result.png')
  assert.equal(ref.originalUrl, '/output/result.png')
})

test('virtual failed regeneration blocks old result after refresh or viewport unmount', () => {
  const { sandbox: api, add, connect } = fixture()
  add('b')
  api.canvasVirtualStore.set('a', { id: 'a', kind: 'image', resultSrc: '/output/old.png', imageJobId: 'new', imageJobCommittedId: 'old', imageJobState: 'failed' })
  connect('a', 'b')
  assert.deepEqual(Array.from(api.getCanvasPendingImageReferenceIds('b')), ['a'])
  assert.equal(api.getCanvasIncomingRefs('b').length, 0)
})

test('missing connected source cannot fall back to a cached old generator result', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  add('b')
  connect('missing', 'b')
  api.canvasIncomingOutputCache.set('missing|output', { type: 'image', url: '/output/stale.png' })
  const result = await api.runCanvasImageEdit(api.getCanvasNode('b'))
  assert.equal(result.code, 'upstream_image_pending')
  assert.equal(submitted.length, 0)
  assert.equal(api.getCanvasIncomingRefs('b').length, 0)
})

test('reference changes during async input preparation stop before paid submission', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  const a = add('a', { resultSrc: '/output/first.png' }), b = add('b')
  connect('a', 'b')
  api.prepareOpenAIEditRefs = async refs => { a.dataset.resultSrc = '/output/second.png'; return refs }
  const result = await api.runCanvasImageEdit(b)
  assert.equal(result.code, 'upstream_image_changed')
  assert.equal(submitted.length, 0)
})

test('failed generation after reference preparation keeps its output blocked for downstream nodes', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  const a = add('a', { resultSrc: '/output/a.png' })
  const b = add('b', { resultSrc: '/output/old-b.png' })
  add('c')
  connect('a', 'b')
  connect('b', 'c')
  api.prepareOpenAIEditRefs = async () => { throw new Error('isolated reference preparation failure') }
  const result = await api.runCanvasImageEdit(b)
  assert.equal(result.code, 'reference_prepare_failed')
  assert.equal(b.dataset.imageDependencyState, 'failed')
  assert.deepEqual(Array.from(api.getCanvasPendingImageReferenceIds('c')), ['b'])
  assert.equal(api.getCanvasIncomingRefs('c').length, 0)
  assert.equal(submitted.length, 0)
})

test('successful retry clears persisted failure and refreshes downstream to the new result', () => {
  const { sandbox: api, add, connect } = fixture()
  const a = add('a', { resultSrc: '/output/a.png' })
  const b = add('b', { resultSrc: '/output/old-b.png', imageDependencyState: 'failed' })
  add('c')
  connect('a', 'b')
  connect('b', 'c')
  api.refreshCanvasDownstreamNodes = id => {
    if (id === 'b') api.getCanvasNode('b').dataset.resultSrc = '/output/retried-b.png'
  }
  api.setCanvasImageDependencyState(b, 'completed')
  assert.equal(b.dataset.imageDependencyState, 'completed')
  assert.equal(api.getCanvasIncomingRefs('c')[0].url, '/output/retried-b.png')
})

test('legacy cycle in saved data cannot submit a task', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  add('a', { resultSrc: '/output/a.png' })
  const b = add('b', { resultSrc: '/output/b.png' })
  connect('a', 'b')
  connect('b', 'a')
  const result = await api.runCanvasImageEdit(b)
  assert.equal(result.code, 'upstream_image_pending')
  assert.equal(submitted.length, 0)
})

test('ComfyUI entry blocks an empty upstream before invoking its workflow', async () => {
  const { sandbox: api, add, connect, submitted } = fixture()
  add('a')
  const b = add('b', {}, 'comfy')
  connect('a', 'b')
  api.CanvasGenerationSound.arm = () => {}
  api.createId = () => 'qa'
  api.fetch = async () => { submitted.push('comfy'); throw new Error('intercepted') }
  const result = await api.runCanvasComfyNode(b)
  assert.equal(result?.code, 'upstream_image_pending')
  assert.equal(submitted.length, 0)
})

test('image asset inputs and existing API/H3 pending image inputs remain supported', () => {
  const { sandbox: api, add } = fixture()
  const asset = add('asset', { uploadOnly: 'true', imageSrc: '/output/asset.png' })
  assert.equal(api.getCanvasConnectionCompatibility(asset, add('b'), api.getCanvasNodeOutput(asset)).ok, true)
  const a = add('a')
  assert.equal(api.getCanvasConnectionCompatibility(a, add('video', {}, 'video-api'), api.getCanvasNodeOutput(a)).ok, true)
  assert.equal(api.getCanvasConnectionCompatibility(a, add('h3', {}, 'minimax-h3'), api.getCanvasNodeOutput(a)).ok, true)
  assert.equal(api.getCanvasConnectionCompatibility(a, add('text', {}, 'text'), api.getCanvasNodeOutput(a)).ok, false)
})
