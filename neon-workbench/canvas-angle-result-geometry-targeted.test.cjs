const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUTPUT = path.join(__dirname, '..', '.planning', 'angle-result-geometry-20261022')

;(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }))
    for (const [served, source, type] of [
      ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
      ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
      ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
    ]) {
      await page.route(`**/${served}*`, route => route.fulfill({ contentType: type, body: fs.readFileSync(path.join(__dirname, 'design-sources', source), 'utf8') }))
    }
    await page.goto(process.env.AI_OS_TEST_URL || 'http://127.0.0.1:33199', { waitUntil: 'domcontentloaded' })
    const before = await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-angle-result-geometry'
      canvasState.activeBoardPersisted = false
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.hidden = false
      view.classList.add('active')
      view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      canvasState.x = 0
      canvasState.y = 0
      canvasState.scale = 1
      applyCanvasTransformNow()
      const source = window.qaAngleSource = addCanvasImageGeneratorNode({ x: 100, y: 100 }, { focus: false })
      source.dataset.mediaSizeMode = 'manual'
      source.dataset.width = '600'
      source.dataset.height = '400'
      applyCanvasNodeSize(source)
      syncCanvasNodeModel(source)
      const result = window.qaAngleResult = createCanvasImageToolResultNode(source, null, { tool: 'angle' })
      result.dataset.qaAngleResult = 'true'
      clearCanvasSelection()
      clearTimeout(canvasState.saveTimer)
      return {
        source: { width: Number(source.dataset.width), height: Number(source.dataset.height) },
        result: { width: Number(result.dataset.width), height: Number(result.dataset.height) },
        outer: { width: result.offsetWidth, height: result.offsetHeight },
        viewport: (() => { const viewport = document.querySelector('#infiniteCanvas'); const rect = viewport.getBoundingClientRect(); return { width: viewport.clientWidth, height: viewport.clientHeight, left: rect.left, top: rect.top } })(),
        resultId: result.dataset.id,
      }
    })
    assert.deepEqual(before.result, before.source, `结果节点首帧应继承来源图片节点尺寸：${JSON.stringify(before)}`)
    assert.equal(before.outer.width, before.source.width, `结果节点外框首帧宽度应立即应用来源尺寸：${JSON.stringify(before)}`)
    assert.equal(before.outer.height, before.source.height + 48, `Flora 外框只增加标题带高度：${JSON.stringify(before)}`)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, before, errors, note: 'first-frame geometry verified; real pointer click remains manual' }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.stack || error.message || error); process.exitCode = 1 })
