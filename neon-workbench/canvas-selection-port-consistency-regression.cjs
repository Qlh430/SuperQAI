const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { openFixture, settle } = require('./dom-scaling-test-support.cjs')

const source = path.join(__dirname, 'design-sources')
const script = fs.readFileSync(path.join(source, 'script-before-save-bridge.js'), 'utf8')
const start = script.indexOf('function syncCanvasHoverPortPreview(id) {')
const end = script.indexOf('\nwindow.supportsCanvasMediaPortPreview', start)
assert.ok(start > 0 && end > start)

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<main id="neonEngineSurface"><div id="canvasEditorScreen"><div id="canvasPlane"></div></div></main>')
    for (const file of ['neon-canvas-surface.css', 'flora-node-shell.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(source, file), 'utf8') })
    await page.addStyleTag({ content: '#canvasPlane{position:absolute!important;left:0;top:0;transform-origin:0 0}.fixture-shell{position:absolute;left:200px;top:200px;width:400px;height:448px}.fixture-shell .flora-node-shell{position:absolute!important;left:0!important;top:48px!important;width:400px!important;height:400px!important}.fixture-shell .flora-node-port-layer{position:absolute!important;inset:0!important}.fixture-shell .canvas-port{position:absolute!important;top:50%!important;transition:none!important}' })
    await page.evaluate(() => {
      window.canvasState = { scale: 1 }
      window.canvasHoverPortPreview = null
      window.canvasVirtualStore = { get: () => ({ id: 'fixture' }), getMounted: () => null }
      window.supportsCanvasMediaPortPreview = () => true
      window.resolveNodeVisualGeometry = () => ({ outerBounds: { left: 200, top: 248, right: 600, bottom: 648 } })
      window.createCanvasPort = kind => {
        const port = document.createElement('button')
        port.className = `canvas-port canvas-port-${kind}`
        port.dataset.canvasPort = kind
        return port
      }
      const full = document.createElement('div')
      full.className = 'canvas-node fixture-shell is-selected'
      full.dataset.floraNode = 'true'
      const layer = document.createElement('div')
      layer.className = 'flora-node-port-layer'
      layer.append(createCanvasPort('output'))
      const shell = document.createElement('div')
      shell.className = 'flora-node-shell'
      shell.append(layer)
      full.append(shell)
      document.querySelector('#canvasPlane').append(full)
    })
    await page.addScriptTag({ content: script.slice(start, end) })
    const results = []
    const geometry = locator => locator.evaluate(port => {
      const rect = port.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height }
    })
    const proxy = page.locator('.canvas-hover-port-proxy > .canvas-port')
    const full = page.locator('.fixture-shell .canvas-port')
    for (const scale of [.1, .17, .5, 1, 1.5]) {
      await page.mouse.move(1400, 980)
      await page.evaluate(scale => {
        canvasState.scale = scale
        const plane = document.querySelector('#canvasPlane')
        plane.style.transform = `scale(${scale})`
        plane.style.setProperty('--collab-inverse-scale', String(1 / scale))
        syncCanvasHoverPortPreview('fixture')
      }, scale)
      const selected = await geometry(full)
      for (const state of ['default', 'hover', 'focus', 'magnetized']) {
        if (state === 'hover') await proxy.hover()
        if (state === 'focus') await proxy.focus()
        if (state === 'magnetized') await proxy.evaluate(port => port.classList.add('is-magnetized'))
        const unselected = await geometry(proxy)
        results.push({ scale, state, selected, unselected })
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(unselected[key] - selected[key]) < .15,
          `缩放 ${scale}、${state}：未选中与选中端点 ${key} 必须一致：${JSON.stringify({ selected, unselected })}`)
      }
      await proxy.evaluate(port => { port.blur(); port.classList.remove('is-magnetized') })
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, checked: 'proxy-css-geometry', cases: results.length, scales: [.1, .17, .5, 1, 1.5], errors }))
  } finally {
    await browser.close()
  }
})().then(async () => {
  const fixture = await openFixture({ width: 1440, height: 1000 })
  try {
    const { page } = fixture
    const results = []
    for (const scale of [.1, .17, .5, 1, 1.5]) {
      await page.evaluate(scale => {
        const nodes = [0, 1].map(index => ({ ...__domScalingSeeds[0], id: String(index + 1), kind: 'image', x: 160 + index * 700, y: 180, width: 400, height: 400,
          resultSrc: __domScalingPNG, generationHistory: [{ id: `result-${index}`, kind: 'image', src: __domScalingPNG }], currentGenerationId: `result-${index}` }))
        restoreCanvasBoard({ id: 'dom-scaling-mock-board', nodes, connections: [{ id: 'edge', from: '1', to: '2', fromPort: 'output', toPort: 'input' }], viewport: { x: 30, y: 30, scale } })
        canvasState.activeBoardPersisted = false
        canvasState.isRestoring = false
        clearCanvasSelection()
        CanvasNodeRepresentation.dehydrateNode('1')
        CanvasNodeRepresentation.dehydrateNode('2')
        applyCanvasTransformNow()
      }, scale)
      await settle(page, 300)
      const before = await page.evaluate(() => {
        syncCanvasHoverPortPreview('1')
        const port = canvasHoverPortPreview?.querySelector('.canvas-port')
        if (!port) throw new Error('未选中节点应显示代理端点')
        const r = port.getBoundingClientRect()
        const edge = getVisibleCanvasConnections({ includeScene: true })[0]
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, wire: edge.from }
      })
      await page.evaluate(() => {
        const node = CanvasNodeRepresentation.hydrateNode('1')
        selectCanvasNode(node)
        syncCanvasHoverPortPreview('1')
      })
      await settle(page, 300)
      const after = await page.evaluate(() => {
        const node = getCanvasNode('1'), port = node.querySelector('.canvas-port-output'), r = port.getBoundingClientRect()
        const edge = getVisibleCanvasConnections({ includeScene: true })[0]
        const body = node.querySelector('.flora-node-content').getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, wire: edge.from, bodyCenterY: body.top + body.height / 2 }
      })
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < .2,
        `实际节点在 ${scale} 缩放下选中前后 ${key} 一致：${JSON.stringify({ before, after })}`)
      assert.ok(Math.abs(after.y - after.bodyCenterY) < .2, '端点必须保持在节点主体的侧边中心')
      assert.ok(Math.abs(before.wire.x - after.wire.x) < .2 && Math.abs(before.wire.y - after.wire.y) < .2, '切换表示不改变连线锚点')
      results.push({ scale, before, after })
    }
    const output = path.join(__dirname, 'acceptance', 'selection-port-consistency.png')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    await page.screenshot({ path: output })
    assert.deepEqual(fixture.errors, [])
    console.log(JSON.stringify({ ok: true, checked: 'actual-node-selection-geometry', cases: results.length, results, errors: fixture.errors }))
  } finally {
    await fixture.close()
  }
}).catch(error => { console.error(error); process.exitCode = 1 })
