const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const context = {
  CanvasVirtualizationRules: require('../host-sources/app/canvas-virtualization-rules'),
}
vm.runInNewContext(fs.readFileSync(require('node:path').join(process.env.QA_RUNTIME_ROOT || './design-sources', 'canvas-scene-layer.js'), 'utf8'), context)
const { CanvasSceneLayer } = context

function renderWire(scale) {
  const strokes = []
  const makeContext = () => ({
    lineWidth: 1,
    setLineDash(value) { this.dash = [...value] },
    beginPath() {},
    bezierCurveTo() {},
    clearRect() {},
    drawImage() {},
    moveTo() {},
    setTransform() {},
    stroke() { strokes.push({ width: this.lineWidth, dash: [...(this.dash || [])], color: this.strokeStyle }) },
  })
  const visibleContext = makeContext()
  const bufferContext = makeContext()
  const canvas = {
    width: 1,
    height: 1,
    style: {},
    ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '#888888' }) } },
    getContext: () => visibleContext,
  }
  const buffer = { width: 1, height: 1, getContext: () => bufferContext }
  const layer = new CanvasSceneLayer({ canvas, createBuffer: () => buffer })
  layer.resize(400, 300)
  layer.render({
    visualConnections: [20, 20, 220, 120],
    transform: { x: 0, y: 0, scale },
  })
  return strokes[0]
}

for (const scale of [0.1, 0.17, 0.25, 0.5, 1]) {
  const actual = renderWire(scale)
  assert.equal(actual.width, 3 * scale, `画布 ${scale * 100}% 时线宽应随缩放`)
  assert.deepEqual(actual.dash, [6 * scale, 6 * scale], `画布 ${scale * 100}% 时虚线节奏应随缩放`)
  assert.equal(actual.color, 'rgba(136, 136, 136, 0.4)', 'Canvas 连线应使用与 SVG 相同的淡化程度')
}

assert.equal(renderWire(0.5).width, 1.5, '50% 缩放时线宽保持参考样式')
assert.deepEqual(renderWire(0.5).dash, [3, 3], '50% 缩放时虚线保持参考节奏')
console.log(JSON.stringify({ ok: true, zooms: [0.1, 0.17, 0.25, 0.5, 1] }, null, 2))
