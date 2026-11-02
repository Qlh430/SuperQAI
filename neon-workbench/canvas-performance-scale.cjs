const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..', 'AI-OS-Portable-1.0.5-win-x64', '.ai-runtime', 'versions', '1.0.5-win-x64', 'resources', 'app')
const layerRoot = process.env.PERF_LAYER_PATH ? path.resolve(process.env.PERF_LAYER_PATH) : appRoot
const { CanvasSceneLayer } = require(path.join(layerRoot, 'canvas-scene-layer.js'))

class Context {
  constructor() { this.calls = 0 }
  _call() { this.calls++ }
  clearRect() { this._call() }
  setTransform() { this._call() }
  fillRect() { this._call() }
  strokeRect() { this._call() }
  drawImage() { this._call() }
  beginPath() { this._call() }
  moveTo() { this._call() }
  bezierCurveTo() { this._call() }
  stroke() { this._call() }
  setLineDash() { this._call() }
  fillText() { this._call() }
  measureText(text) { this._call(); return { width: String(text).length * 7 } }
  roundRect() { this._call() }
  arc() { this._call() }
  fill() { this._call() }
}

class Canvas {
  constructor() { this.width = 0; this.height = 0; this.style = {}; this.context = new Context(); this.buffer = null }
  getContext() { return this.context }
  get ownerDocument() { return { createElement: () => { this.buffer ||= new Canvas(); return this.buffer } } }
}

function makeNodes(count, scenario) {
  return Array.from({ length: count }, (_, index) => {
    const column = index % 50
    const row = Math.floor(index / 50)
    const offscreen = scenario === 'offscreen'
    const x = offscreen ? 10000 + column * 440 : column * 440
    const y = offscreen ? 10000 + row * 480 : row * 480
    const kind = scenario === 'mixed' ? (index % 3 === 0 ? 'video' : index % 3 === 1 ? 'image' : 'audio') : 'text'
    return { id: String(index), kind, x, y, width: kind === 'audio' ? 360 : 420, height: kind === 'audio' ? 180 : 420, zOrder: index, title: `节点${index}` }
  })
}

function makeConnections(count) {
  const values = []
  for (let index = 1; index < count; index += 1) {
    const from = index - 1, to = index
    const fromColumn = from % 50, fromRow = Math.floor(from / 50)
    const toColumn = to % 50, toRow = Math.floor(to / 50)
    values.push(fromColumn * 440 + 420, fromRow * 480 + 210, toColumn * 440, toRow * 480 + 210)
  }
  return values
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0
}

function measure(count, scenario, rounds = 8) {
  const canvas = new Canvas()
  const layer = new CanvasSceneLayer({ canvas })
  layer.resize(1440, 1050, 320)
  const visualNodes = makeNodes(count, scenario)
  const visualConnections = makeConnections(count)
  const frames = []
  for (let round = 0; round < rounds; round += 1) {
    const started = performance.now()
    layer.render({
      visualNodes,
      visualConnections,
      texturedNodeIds: scenario === 'mixed' ? visualNodes.filter(node => node.kind === 'image').map(node => node.id) : [],
      selectedIds: new Set(),
      transform: { x: 0, y: 0, scale: scenario === 'offscreen' ? 1 : 0.65 },
      resolveTexture: () => null,
      resolveNodeBounds: node => ({ left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }),
    })
    frames.push(performance.now() - started)
  }
  const panFrames = [], zoomFrames = [], dragFrames = [], inputFrames = []
  for (let index = 0; index < 45; index += 1) {
    let started = performance.now(); layer.reproject({ x: index * 3, y: index * 2, scale: scenario === 'offscreen' ? 1 : .65 }); panFrames.push(performance.now() - started)
    started = performance.now(); layer.reproject({ x: index * 3, y: index * 2, scale: .4 + (index % 8) * .05 }); zoomFrames.push(performance.now() - started)
  }
  for (let index = 0; index < 20; index += 1) {
    visualNodes[0].x = index * 6
    const started = performance.now()
    layer.render({ visualNodes, visualConnections, transform: { x: 0, y: 0, scale: scenario === 'offscreen' ? 1 : .65 }, resolveNodeBounds: node => ({ left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }) })
    dragFrames.push(performance.now() - started)
    visualNodes[0].title = `输入${index}`
    const inputStarted = performance.now(); JSON.stringify(visualNodes); inputFrames.push(performance.now() - inputStarted)
  }
  const saveStarted = performance.now(); JSON.stringify({ nodes: visualNodes, connections: visualConnections }); const saveMs = performance.now() - saveStarted
  return { count, scenario, medianMs: percentile(frames, .5), p95Ms: percentile(frames, .95), maxMs: Math.max(...frames), drawCalls: canvas.context.calls + canvas.buffer.context.calls, diagnostics: layer.getDiagnostics(), interactions: {
    loadMs: frames[0], panMedianMs: percentile(panFrames, .5), zoomMedianMs: percentile(zoomFrames, .5), dragMedianMs: percentile(dragFrames, .5), inputMedianMs: percentile(inputFrames, .5), saveMs, longTasks: [],
  } }
}

const counts = [100, 300, 1000, 2000]
const scenarios = ['offscreen', 'visible', 'mixed']
const results = scenarios.flatMap(scenario => counts.map(count => measure(count, scenario)))
assert.equal(results.length, 12)
assert.ok(results.every(item => item.drawCalls > 0))
const output = path.resolve(process.env.PERF_SCALE_OUTPUT || path.join(__dirname, '..', '.design', 'canvas-performance', 'scale-before.json'))
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), viewport: [1440, 1050], results }, null, 2))
console.log(JSON.stringify({ output, results }))
