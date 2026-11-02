const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const hostSource = fs.readFileSync(path.join(__dirname, 'design-sources/canvas-representation-host.js'), 'utf8')
const noteSource = fs.readFileSync(path.join(root, 'host-sources/app/canvas-note-node-renderer.js'), 'utf8')
const portCss = fs.readFileSync(path.join(__dirname, 'design-sources/flora-node-shell.css'), 'utf8')

class ClassList {
  constructor(owner) { this.owner = owner }
  contains(value) { return this.owner.classes.has(value) }
  add(value) { this.owner.classes.add(value) }
  remove(value) { this.owner.classes.delete(value) }
  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force)
    if (enabled) this.add(value); else this.remove(value)
    return enabled
  }
}

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase()
    this.classes = new Set()
    this.classList = new ClassList(this)
    this.dataset = {}
    this.attributes = new Map()
    this.listeners = new Map()
    this.children = []
    this.parentElement = null
    this._textContent = ''
    this.contentEditable = 'inherit'
  }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); this.classList = new ClassList(this) }
  get className() { return [...this.classes].join(' ') }
  set textContent(value) { this._textContent = String(value ?? ''); this.children = [] }
  get textContent() { return this._textContent + this.children.map(child => child.textContent).join('') }
  get innerText() { return this.textContent }
  set innerText(value) { this.textContent = value }
  set innerHTML(value) { this.textContent = ''; this.html = String(value) }
  get innerHTML() { return this.html || this.textContent }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  addEventListener(type, handler) { const rows = this.listeners.get(type) || []; rows.push(handler); this.listeners.set(type, rows) }
  dispatch(type, extra = {}) {
    const event = { stopped: false, stopPropagation() { this.stopped = true }, ...extra }
    for (const listener of this.listeners.get(type) || []) listener(event)
    return event
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child) } }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
  querySelectorAll(selector) {
    const matches = element => selector === '.canvas-note-text' ? element.classList.contains('canvas-note-text')
      : selector === '[data-note-swatch]' ? Object.hasOwn(element.dataset, 'noteSwatch') : false
    const found = []
    const visit = element => { for (const child of element.children) { if (matches(child)) found.push(child); visit(child) } }
    visit(this)
    return found
  }
  focus() { this.focused = true }
  contains(element) { return element === this || this.children.some(child => child.contains(element)) }
  matches() { return false }
}

function createHostForSelection(kind = 'minimax-h3') {
  const shell = new Element()
  const node = new Element('article')
  node.dataset.id = 'active-node'
  node.dataset.virtualLevel = 'full'
  node.classList.add('canvas-node')
  node.append(shell)
  const model = { id: 'active-node', kind }
  const store = {
    has: id => id === model.id,
    get: id => id === model.id ? model : null,
    getMounted: id => id === model.id ? node : null,
    mountedElements: () => [node],
  }
  const state = { selectedIds: new Set([model.id]), activeNode: node, pendingConnection: null, tempConnection: null }
  class Manager { constructor() {} reset() {} }
  const window = {
    CanvasRepresentationManager: Manager,
    document: { activeElement: null, querySelector: () => null, addEventListener() {} },
    addEventListener() {},
  }
  vm.runInNewContext(hostSource, vm.createContext({ window, AbortController, Map, Set, Math, Number, String, Boolean, Array, Object, performance: { now: () => 0 } }))
  const host = new window.CanvasRepresentationHost({
    store, rules: {}, getState: () => state, getViewport: () => ({}), schedule() {}, isInteracting: () => false,
  })
  return { host, state, node, model }
}

function createNoteRenderer() {
  const module = { exports: {} }
  vm.runInNewContext(noteSource, vm.createContext({ module, globalThis: { document: null }, Object, String, Boolean, Array }))
  return module.exports
}

function test(name, callback) {
  try { callback(); console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1 }
}

test('selected active video node remains protected after pointer hover changes', () => {
  const { host, model } = createHostForSelection()
  const protectedNodes = host.protection()
  assert.ok(protectedNodes.has(model.id), 'the selected active node must stay Full so its toolbar and parameter tray do not unmount')
  assert.ok(protectedNodes.get(model.id).includes('active-selection-shell'))
})

test('selected note receives only its own interactive shell protection', () => {
  const { host, model } = createHostForSelection('note')
  assert.deepEqual(Array.from(host.protection().keys()), [model.id])
})

test('note is static until double-click, exits editing on blur, and color swatches update the model', () => {
  const renderer = createNoteRenderer()
  const node = new Element('article')
  node.classList.add('canvas-node-note')
  const saves = { count: 0, color: '' }
  renderer.render(node, { text: '已有备注', color: 'yellow' }, {
    document: { createElement: tag => new Element(tag), querySelector: () => null },
    createCanvasResizeHandle: () => new Element('button'),
    scheduleCanvasConnectionRender() {},
    scheduleCanvasSave() { saves.count += 1 },
    syncCanvasNodeModel(current) { saves.color = current.dataset.noteColor },
  })
  const text = node.querySelector('.canvas-note-text')
  assert.doesNotMatch(node.textContent, /待完成/)
  assert.equal(text.contentEditable, 'false')
  text.dispatch('dblclick')
  assert.equal(text.contentEditable, 'true')
  text.textContent = '更新后的备注'
  text.dispatch('input')
  text.dispatch('blur')
  assert.equal(text.contentEditable, 'false')
  assert.equal(node.dataset.noteText, '更新后的备注')
  const green = node.querySelectorAll('[data-note-swatch]').find(item => item.dataset.noteSwatch === 'green')
  green.dispatch('click')
  assert.equal(node.dataset.noteColor, 'green')
  assert.equal(saves.color, 'green')
  assert.equal(saves.count, 2)
})

test('asset-member port magnet feedback keeps neutral base and plus colors', () => {
  const assetOverride = [...portCss.matchAll(/#neonEngineSurface #canvasEditorScreen #canvasPlane \.canvas-assets-member-port:is\(\.is-magnetized,\s*:focus-visible\)\s*\{([^}]+)\}/gs)].at(-1)?.[1] || ''
  assert.match(assetOverride, /border-color:\s*var\(--canvas-neon-muted\) !important/)
  assert.match(assetOverride, /background:\s*var\(--canvas-neon-bg\) !important/)
  assert.match(assetOverride, /color:\s*var\(--canvas-neon-muted\) !important/)
  const genericMagnet = portCss.lastIndexOf('.canvas-node[data-flora-node="true"] .flora-node-port-layer .canvas-port:is(.is-magnetized, :focus-visible)')
  const assetMagnet = portCss.lastIndexOf('#neonEngineSurface #canvasEditorScreen #canvasPlane .canvas-assets-member-port:is(.is-magnetized, :focus-visible)')
  assert.ok(assetMagnet > genericMagnet, 'asset-member neutral state must win the cascade')
  assert.match(portCss, /\.canvas-assets-member-port\.is-snap-target[^}]*outline:\s*2px solid var\(--canvas-neon-primary\)/s)
  assert.match(portCss, /\.canvas-assets-member-port\.is-magnetized[^}]*outline:\s*2px solid var\(--canvas-neon-primary\)/s)
})
