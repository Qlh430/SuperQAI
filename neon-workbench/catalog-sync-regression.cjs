const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(`${__dirname}/design-sources/script-before-save-bridge.js`, 'utf8')
function extract(name) { const begin = source.indexOf(`function ${name}(`); assert.ok(begin >= 0); return source.slice(begin, source.indexOf('\n}', begin) + 2) }
function select() { return { value: '', dataset: {}, options: [], append(option) { this.options.push(option) }, closest() { return null }, set innerHTML(value) { this.options = []; this.value = '' }, get innerHTML() { return '' } } }
const mainSelect = select(), requests = []
let status = ''
const context = vm.createContext({
  document: { createElement: () => ({}) },
  providerModelRequestSerial: { chat: 0 }, chatModelInput: mainSelect,
  CHAT_MODELS_API_URL: '/api/models', DYNAMIC_MODEL_DISPLAY_NAMES: {},
  fetch: () => new Promise(resolve => requests.push(resolve)),
  normalizePublicModelCatalog: models => models,
  fillSelect: (target, models) => { target.options = models.map(value => ({ value })); target.value = models[0] || '' },
  renderChatModelPicker() {}, refreshCanvasLlmModelSelects() {},
  setChatStatus: value => { status = value }, setCanvasNodeStatus() {},
})
vm.runInContext(`${extract('retainCatalogSelection')}\nasync ${extract('loadChatModels')}\nasync ${extract('loadVisionModels')}`, context)
;(async () => {
  mainSelect.value = 'p-a::same-name'
  const old = context.loadChatModels({ preserveSelection: true })
  const fresh = context.loadChatModels({ preserveSelection: true })
  requests[1]({ ok: true, json: async () => ({ models: [{ id: 'p-a::same-name' }, { id: 'p-b::same-name' }], defaultModel: 'p-b::same-name' }) })
  await fresh
  assert.equal(mainSelect.value, 'p-a::same-name')
  requests[0]({ ok: true, json: async () => ({ models: [{ id: 'stale' }], defaultModel: 'stale' }) }); await old
  assert.equal(mainSelect.value, 'p-a::same-name'); assert.equal(mainSelect.options.length, 2)
  const removed = context.loadChatModels({ preserveSelection: true })
  requests[2]({ ok: true, json: async () => ({ models: [{ id: 'p-b::same-name' }], defaultModel: 'p-b::same-name' }) }); await removed
  assert.equal(mainSelect.value, 'p-a::same-name'); assert.equal(mainSelect.dataset.catalogUnavailable, 'true'); assert.equal(mainSelect.options[1].disabled, true)
  assert.match(status, /重新选择/)
  const failed = context.loadChatModels({ preserveSelection: true })
  requests[3]({ ok: false, json: async () => ({ error: '目录更新失败' }) })
  await assert.rejects(failed, /目录更新失败/)
  assert.equal(mainSelect.value, 'p-a::same-name'); assert.equal(mainSelect.options.length, 2)
  context.retainCatalogSelection(mainSelect, '', ['p-b::same-name']); assert.equal(mainSelect.dataset.catalogUnavailable, 'false')
  const visionSelect = select(), visionNode = { status: '', querySelector: () => visionSelect }
  visionSelect.value = 'vision-model'; visionSelect.closest = () => visionNode
  Object.assign(context, { VISION_MODELS_API_URL: '/api/vision-models', visionModelCatalog: [{ id: 'vision-model' }], visionModelOptions: ['vision-model'], visionModelCatalogLoaded: true })
  context.providerModelRequestSerial.vision = 0
  context.document.querySelectorAll = () => [visionNode]
  context.setCanvasNodeStatus = (node, value) => { node.status = value }
  context.refreshCanvasLlmModelSelects = () => context.retainCatalogSelection(visionSelect, visionSelect.value, context.visionModelOptions)
  const visionFailure = context.loadVisionModels(), lateChat = context.loadChatModels({ preserveSelection: true })
  requests[4]({ ok: false, json: async () => ({ error: '视觉目录失败' }) }); await assert.rejects(visionFailure, /视觉目录失败/)
  requests[5]({ ok: true, json: async () => ({ models: [{ id: 'p-b::same-name' }], defaultModel: 'p-b::same-name' }) }); await lateChat
  assert.equal(visionSelect.dataset.catalogError, 'true'); assert.match(visionNode.status, /视觉模型读取失败/)
  const visionRetry = context.loadVisionModels()
  requests[6]({ ok: true, json: async () => ({ models: [{ id: 'vision-model' }] }) }); await visionRetry
  assert.equal(visionSelect.dataset.catalogError, undefined); assert.equal(visionNode.status, '准备就绪')
  console.log('PASS catalog synchronization: stale responses ignored, provider-specific selection retained, removed choice explicit, failures preserve catalog')
})().catch(error => { console.error(error); process.exitCode = 1 })
