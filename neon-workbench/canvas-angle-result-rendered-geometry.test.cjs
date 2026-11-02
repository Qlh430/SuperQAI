const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const sourcePath = path.join(__dirname, 'design-sources', 'script-before-save-bridge.js')
const source = fs.readFileSync(sourcePath, 'utf8')
const shellCss = fs.readFileSync(path.join(__dirname, 'design-sources', 'flora-node-shell.css'), 'utf8')
const marker = 'function createCanvasImageToolResultNode(sourceNode, image, {'
const start = source.indexOf(marker)
const end = source.indexOf('\n}', start) + 2
assert.ok(start >= 0 && end > start, 'angle result creator should exist in the canonical canvas source')
const creatorSource = source.slice(start, end)

for (const geometry of [
  { label: 'landscape', width: 600, height: 400 },
  { label: 'portrait', width: 400, height: 600 },
  { label: 'wide', width: 820, height: 300 },
]) test(`angle placeholder matches the visible ${geometry.label} source when saved dimensions are stale`, () => {
  const styleValues = Object.create(null)
  const createCanvasImageToolResultNode = new Function(
    'addCanvasImageGeneratorNode',
    'findCanvasImageToolResultPoint',
    'getCanvasNodeBox',
    'getCanvasNodeBodyHeight',
    'connectCanvasNodes',
    'writeCanvasImageToolResult',
    'applyCanvasNodeSize',
    `${creatorSource}; return createCanvasImageToolResultNode;`,
  )(
    () => ({
      dataset: {},
      style: {
        setProperty(name, value) { styleValues[name] = value },
        getPropertyValue(name) { return styleValues[name] || '' },
      },
    }),
    () => ({ x: 0, y: 0 }),
    () => ({ left: 0, top: 0, right: geometry.width, bottom: geometry.height }),
    () => 400,
    () => {},
    () => {},
    () => {},
  )

  const sourceNode = {
    isConnected: true,
    offsetWidth: geometry.width,
    offsetHeight: geometry.height + 48,
    dataset: { width: '400', height: '267', x: '20', y: '30', id: 'source' },
    querySelector(selector) {
      if (selector.startsWith('.canvas-node-result')) return { offsetHeight: geometry.height }
      if (selector === ':scope > .canvas-node-bar') return { offsetHeight: 48 }
      return null
    },
  }
  const result = createCanvasImageToolResultNode(sourceNode, null, { tool: 'angle' })

  assert.equal(result.dataset.width, String(geometry.width), 'placeholder width should match the rendered source width')
  assert.equal(result.dataset.height, String(geometry.height), 'placeholder media height should match the rendered source media area')
  assert.equal(result.style.getPropertyValue('--flora-node-width'), `${geometry.width}px`)
  assert.equal(result.style.getPropertyValue('--flora-node-height'), `${geometry.height}px`)
})

test('angle placeholder prefers the actual canvas image bounds over a stale 400px DOM box', () => {
  const styleValues = Object.create(null)
  const createCanvasImageToolResultNode = new Function(
    'addCanvasImageGeneratorNode',
    'findCanvasImageToolResultPoint',
    'getCanvasNodeBox',
    'getCanvasNodeBodyHeight',
    'connectCanvasNodes',
    'writeCanvasImageToolResult',
    'applyCanvasNodeSize',
    `${creatorSource}; return createCanvasImageToolResultNode;`,
  )(
    () => ({ dataset: {}, style: { setProperty(name, value) { styleValues[name] = value }, getPropertyValue(name) { return styleValues[name] || '' } } }),
    () => ({ x: 0, y: 0 }),
    () => ({ left: 0, top: 0, right: 600, bottom: 400 }),
    () => 400,
    () => {},
    () => {},
    () => {},
  )
  const sourceNode = {
    isConnected: true,
    offsetWidth: 400,
    offsetHeight: 448,
    dataset: { width: '400', height: '267', x: '20', y: '30', id: 'source' },
    querySelector: () => null,
  }
  const result = createCanvasImageToolResultNode(sourceNode, null, { tool: 'angle' })

  assert.equal(result.dataset.width, '600', 'result should match the visible canvas image width')
  assert.equal(result.dataset.height, '400', 'result should match the visible canvas image height')
})

test('angle placeholder prefers visible media bounds when the enclosing node box is stale', () => {
  const styleValues = Object.create(null)
  const createCanvasImageToolResultNode = new Function(
    'addCanvasImageGeneratorNode',
    'findCanvasImageToolResultPoint',
    'getCanvasNodeBox',
    'getCanvasNodeBodyHeight',
    'connectCanvasNodes',
    'writeCanvasImageToolResult',
    'applyCanvasNodeSize',
    `${creatorSource}; return createCanvasImageToolResultNode;`,
  )(
    () => ({ dataset: {}, style: { setProperty(name, value) { styleValues[name] = value }, getPropertyValue(name) { return styleValues[name] || '' } } }),
    () => ({ x: 0, y: 0 }),
    () => ({ left: 0, top: 0, right: 400, bottom: 315 }),
    () => 400,
    () => {},
    () => {},
    () => {},
  )
  const media = { offsetWidth: 600, offsetHeight: 400 }
  const sourceNode = {
    isConnected: true,
    offsetWidth: 400,
    offsetHeight: 363,
    dataset: { width: '400', height: '267', x: '20', y: '30', id: 'source' },
    querySelector(selector) {
      if (selector.startsWith('.canvas-node-result')) return media
      if (selector === ':scope > .canvas-node-bar') return { offsetHeight: 48 }
      return null
    },
  }
  const result = createCanvasImageToolResultNode(sourceNode, null, { tool: 'angle' })

  assert.equal(result.dataset.width, '600', 'result width should match visible media, not its stale enclosing node')
  assert.equal(result.dataset.height, '400', 'result height should match visible media')
})

test('frameless uploaded image uses its visible image content bounds instead of the legacy media container', () => {
  const styleValues = Object.create(null)
  const createCanvasImageToolResultNode = new Function(
    'addCanvasImageGeneratorNode',
    'findCanvasImageToolResultPoint',
    'getCanvasNodeBox',
    'getCanvasNodeBodyHeight',
    'connectCanvasNodes',
    'writeCanvasImageToolResult',
    'applyCanvasNodeSize',
    `${creatorSource}; return createCanvasImageToolResultNode;`,
  )(
    () => ({ dataset: {}, style: { setProperty(name, value) { styleValues[name] = value }, getPropertyValue(name) { return styleValues[name] || '' } } }),
    () => ({ x: 0, y: 0 }),
    () => ({ left: 0, top: 0, right: 600, bottom: 400 }),
    () => 400,
    () => {},
    () => {},
    () => {},
  )
  const media = { offsetWidth: 400, offsetHeight: 267 }
  const sourceNode = {
    isConnected: true,
    offsetWidth: 400,
    offsetHeight: 315,
    classList: { contains(name) { return name === 'canvas-node-frameless' } },
    dataset: { imageSrc: '/image.png', width: '400', height: '267', x: '20', y: '30', id: 'source' },
    querySelector(selector) {
      if (selector.startsWith('.canvas-node-result')) return media
      if (selector === ':scope > .canvas-node-bar') return { offsetHeight: 48 }
      return null
    },
  }
  const result = createCanvasImageToolResultNode(sourceNode, null, { tool: 'angle' })

  assert.equal(result.dataset.width, '600', 'frameless result width should follow the visible image bounds')
  assert.equal(result.dataset.height, '400', 'frameless result height should follow the visible image bounds')
})

test('Flora uploaded image uses its actual outer geometry instead of a smaller legacy media child', () => {
  const styleValues = Object.create(null)
  const createCanvasImageToolResultNode = new Function(
    'addCanvasImageGeneratorNode',
    'findCanvasImageToolResultPoint',
    'getCanvasNodeBox',
    'getCanvasNodeBodyHeight',
    'connectCanvasNodes',
    'writeCanvasImageToolResult',
    'applyCanvasNodeSize',
    `${creatorSource}; return createCanvasImageToolResultNode;`,
  )(
    () => ({ dataset: {}, style: { setProperty(name, value) { styleValues[name] = value }, getPropertyValue(name) { return styleValues[name] || '' } } }),
    () => ({ x: 0, y: 0 }),
    () => ({ left: 50, top: 60, right: 650, bottom: 508 }),
    () => 400,
    () => {},
    () => {},
    () => {},
  )
  const media = { offsetWidth: 400, offsetHeight: 267 }
  const sourceNode = {
    isConnected: true,
    offsetWidth: 600,
    offsetHeight: 448,
    classList: { contains: name => name === 'canvas-node-image' },
    dataset: { floraNode: 'true', floraAdaptiveMedia: 'true', imageSrc: '/banana.png', width: '400', height: '267', x: '50', y: '60', id: 'source' },
    querySelector(selector) {
      if (selector.startsWith('.canvas-node-result')) return media
      if (selector === ':scope > .flora-node-shell') return { offsetHeight: 400 }
      if (selector === ':scope > .flora-node-content') return { offsetHeight: 400 }
      return null
    },
  }
  const result = createCanvasImageToolResultNode(sourceNode, null, { tool: 'angle' })

  assert.equal(result.dataset.width, '600', 'pending width should match the visible Flora image node')
  assert.equal(result.dataset.height, '400', 'pending media height should exclude only the title strip')
})

test('angle result point leaves room for the composer so it does not cover the source node', () => {
  const marker = 'function findCanvasImageToolResultPoint(node, index = 0, { tool = "", displayWidth = 0 } = {}) {'
  const start = source.indexOf(marker)
  const end = source.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start, 'result point helper should exist in the canonical canvas source')
  const helperSource = source.slice(start, end)
  const findCanvasImageToolResultPoint = new Function(
    'getCanvasNodeBox',
    'canvasState',
    'window',
    `${helperSource}; return findCanvasImageToolResultPoint;`,
  )(
    () => ({ left: 50, top: 60, right: 650, bottom: 508 }),
    { scale: 1 },
    { innerWidth: 1440 },
  )
  const sourceNode = { dataset: { x: '50', y: '60' }, offsetWidth: 400 }
  const point = findCanvasImageToolResultPoint(sourceNode, 0, { tool: 'angle', displayWidth: 400 })
  const composerLeft = point.x + 400 / 2 - 760 / 2

  assert.ok(composerLeft >= 650 + 16, `composer should clear the source node; point=${JSON.stringify(point)}, left=${composerLeft}`)
})

test('angle result point uses the decoded image width when the source DOM envelope is stale', () => {
  const marker = 'function findCanvasImageToolResultPoint(node, index = 0, { tool = "", displayWidth = 0 } = {}) {'
  const start = source.indexOf(marker)
  const end = source.indexOf('\n}', start) + 2
  const helperSource = source.slice(start, end)
  const findCanvasImageToolResultPoint = new Function(
    'getCanvasNodeBox',
    'canvasState',
    'window',
    `${helperSource}; return findCanvasImageToolResultPoint;`,
  )(
    () => ({ left: 50, top: 60, right: 450, bottom: 460 }),
    { scale: 1 },
    { innerWidth: 1440 },
  )
  const sourceNode = { dataset: { x: '50', y: '60' }, offsetWidth: 400 }
  const point = findCanvasImageToolResultPoint(sourceNode, 0, { tool: 'angle', displayWidth: 600 })
  const composerLeft = point.x + 600 / 2 - 760 / 2

  assert.ok(composerLeft >= 650 + 16, `composer should use the decoded image edge; point=${JSON.stringify(point)}, left=${composerLeft}`)
})

test('angle result keeps exact source media bounds below the shared Flora title and tag band', () => {
  assert.match(creatorSource, /node\.dataset\.floraAngleResult\s*=\s*"true"/, 'angle result should opt into media-sized Flora geometry')
  assert.match(creatorSource, /renderedHeight\s*=\s*String\(displaySize\.height\s*\+\s*48\)/, 'outer geometry should retain the Flora title band while media data stays unchanged')
  const rules = shellCss.slice(shellCss.indexOf('/* A Qwen angle result'))
  assert.match(rules, /\.canvas-node\[data-flora-angle-result="true"\]\s*\{[\s\S]*?height:\s*var\(--flora-node-height\)\s*!important/)
  assert.match(rules, /\.canvas-node\[data-flora-angle-result="true"\]\s*\{[\s\S]*?height:\s*calc\(var\(--flora-node-height\)\s*\+\s*var\(--flora-node-header-height,\s*48px\)\)\s*!important/)
  assert.match(rules, /\.canvas-node\[data-flora-angle-result="true"\]\s*>\s*\.flora-node-shell\s*\{[\s\S]*?top:\s*var\(--flora-node-header-height,\s*48px\)\s*!important[\s\S]*?height:\s*var\(--flora-node-height\)/)
  assert.match(fs.readFileSync(path.join(__dirname, 'design-sources', 'flora-node-shell.js'), 'utf8'), /if \(angleResult\)\s*\{\s*node\.dataset\.renderedWidth = String\(bodyWidth\);\s*node\.dataset\.renderedHeight = String\(bodyHeight \+ 48\);/)
  assert.match(rules, /\.canvas-node\[data-flora-angle-result="true"\][\s\S]*?\.flora-node-result-area\s*\{[\s\S]*?inset:\s*0\s*!important/)
  assert.match(rules, /\.canvas-node\[data-flora-angle-result="true"\][\s\S]*?object-fit:\s*cover\s*!important/)
  assert.match(shellCss, /#canvasEditorScreen \.flora-node-label\s*\{[\s\S]*?top:\s*0/)
  assert.match(fs.readFileSync(path.join(__dirname, 'design-sources', 'flora-node-tags.css'), 'utf8'), /\.canvas-node > \.flora-node-tag\s*\{[\s\S]*?top:\s*0/)
  assert.match(source, /if \(node\.dataset\.floraAngleResult === "true"\) base\.floraAngleResult = true/)
  assert.match(source, /if \(item\.floraAngleResult === true\) node\.dataset\.floraAngleResult = "true"/)
})
