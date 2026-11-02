const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const base = process.env.AI_OS_TEST_URL || 'http://127.0.0.1:33199'
const executablePath = process.env.BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: {
      authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {}, operations: [], success: true,
    } }))
    if (process.env.PERF_SOURCE) {
      for (const file of ['flora-generator-composer.js', 'flora-node-shell.js']) {
        await page.route(`**/${file}*`, route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.PERF_SOURCE, file), 'utf8') }))
      }
      await page.route('**/script.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.PERF_SOURCE, 'script-before-save-bridge.js'), 'utf8') }))
    }
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    const report = await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-drag-frame'
      canvasState.isRestoring = true
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView')
      surface.append(view)
      document.body.append(surface)
      view.hidden = false
      view.classList.add('active')
      view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      const nodes = Array.from({ length: 36 }, (_, index) => addCanvasImageGeneratorNode({ x: (index % 6) * 440, y: Math.floor(index / 6) * 480 }, { focus: false }))
      nodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.connections = Array.from({ length: nodes.length - 1 }, (_, index) => normalizeVisibleCanvasConnection({
        id: `qa-edge-${index}`,
        from: nodes[index].dataset.id,
        to: nodes[index + 1].dataset.id,
        fromPort: 'output',
        toPort: 'input',
      }))
      canvasState.isRestoring = false
      canvasState.x = 80
      canvasState.y = 70
      canvasState.scale = 0.3
      applyCanvasTransformNow()
      const originalSetGeometry = canvasVirtualStore.setGeometry.bind(canvasVirtualStore)
      const originalGetRevision = canvasVirtualStore.getRevision.bind(canvasVirtualStore)
      let geometryWrites = 0
      let revisionReads = 0
      canvasVirtualStore.setGeometry = (...args) => {
        geometryWrites += 1
        return originalSetGeometry(...args)
      }
      canvasVirtualStore.getRevision = (...args) => {
        revisionReads += 1
        return originalGetRevision(...args)
      }
      const node = nodes[0]
      for (let index = 0; index < 45; index += 1) {
        node.dataset.x = String(index * 3)
        node.dataset.y = String(index * 2)
        updateCanvasNodePosition(node, { deferPaint: true })
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      canvasVirtualStore.setGeometry = originalSetGeometry
      canvasVirtualStore.getRevision = originalGetRevision
      return { geometryWrites, revisionReads, connectionCount: canvasState.connections.length, finalX: Number(canvasVirtualStore.get(node.dataset.id).x), finalY: Number(canvasVirtualStore.get(node.dataset.id).y) }
    })
    assert.ok(report.geometryWrites <= 2, `拖动一帧内应合并虚拟几何写入，实际 ${report.geometryWrites} 次`)
    assert.ok(report.revisionReads <= 200, `单节点拖动不应每帧扫描全部连接，实际读取 ${report.revisionReads} 次`)
    assert.equal(report.finalX, 132)
    assert.equal(report.finalY, 88)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, ...report, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
