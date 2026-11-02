const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = process.env.PERF_SOURCE || path.join(__dirname, 'design-sources')

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: {
      authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [],
      settings: {}, preferences: {}, operations: [], success: true,
    } }))
    for (const file of ['flora-generator-composer.js', 'flora-node-shell.js', 'flora-node-tags.js']) {
      await page.route(`**/${file}*`, route => route.fulfill({
        contentType: 'application/javascript',
        body: fs.readFileSync(path.join(source, file), 'utf8'),
      }))
    }
    await page.route('**/script.js*', route => route.fulfill({
      contentType: 'application/javascript',
      body: fs.readFileSync(path.join(source, 'script-before-save-bridge.js'), 'utf8'),
    }))
    await page.addInitScript(() => {
      window.qaObserverRecords = []
      const Original = window.MutationObserver
      window.MutationObserver = class extends Original {
        constructor(callback) {
          const origin = new Error().stack.split('\n')[2]?.trim() || 'unknown'
          super((records, observer) => {
            if (origin.includes('flora-generator-composer.js')) {
              window.qaObserverRecords.push({ origin, records: records.length })
            }
            return callback(records, observer)
          })
        }
      }
    })
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api', 'canvas-node-text', 'canvas-node-media'])
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-plane-observer'
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
      window.qaNodes = []
      for (let index = 0; index < 12; index++) {
        const node = addCanvasImageGeneratorNode({ x: index * 440, y: 0 }, { focus: false })
        qaNodes.push(node)
        pinCanvasNode(node.dataset.id)
      }
      canvasState.isRestoring = false
      canvasState.scale = 0.3
      canvasState.x = 80
      canvasState.y = 70
      applyCanvasTransformNow()
      await new Promise(resolve => requestAnimationFrame(resolve))
      window.qaObserverRecords = []
      for (let index = 0; index < 10; index++) {
        canvasState.x = 80 + index * 4
        canvasState.scale = 0.3 + index * 0.01
        applyCanvasTransformNow()
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
    })
    await page.waitForTimeout(80)
    const result = await page.evaluate(() => ({
      records: window.qaObserverRecords.reduce((sum, item) => sum + item.records, 0),
      callbacks: window.qaObserverRecords.length,
    }))
    assert.equal(result.records, 0, `画布变换不应触发生成节点平面观察器：${JSON.stringify(result)}`)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, ...result }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
