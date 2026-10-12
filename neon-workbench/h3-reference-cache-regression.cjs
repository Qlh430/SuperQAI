// 分页存储回收离屏来源节点后，参考带与生成请求不能丢素材。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['flora-generator-composer.js', 'flora-generator-composer.js'],
  ['flora-generator-parameters.js', 'flora-generator-parameters.js'],
  ['canvas-h3-node-renderer.js', 'canvas-h3-node-renderer.js'],
  ['flora-node-shell.js', 'flora-node-shell.js'],
  ['flora-node-shell.css', 'flora-node-shell.css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    const submissions = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/minimax-h3-video', route => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'H3测试接口暂不可用' }) })
    })
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: served.endsWith('.css') ? 'text/css' : 'application/javascript',
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-h3-cache-board'
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.style.flex = '1'
      view.style.minHeight = '0'
      view.style.width = '100%'
      view.hidden = false
      view.classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      const h3 = window.qaH3 = addCanvasVideoGeneratorNode({ x: 200, y: 80 }, { engine: 'comfyui' })
      h3.dataset.qaH3 = 'primary'
      canvasState.scale = 1
      canvasState.x = (innerWidth - h3.offsetWidth) / 2 - Number(h3.dataset.x)
      canvasState.y = 120 - Number(h3.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(h3)
      const image = window.qaSource = addCanvasImageGeneratorNode({ x: 900, y: 80 })
      image.dataset.qaSource = 'primary'
      updateCanvasGenerationResult(image, {
        src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#242826"/><circle cx="200" cy="200" r="120" fill="#b8ddba"/></svg>'),
      })
      connectCanvasNodes(image.dataset.id, h3.dataset.id, 'input', 'output')
    })
    await page.waitForTimeout(600)
    const beforeEvict = await page.evaluate(() => ({
      incoming: getCanvasIncomingReferenceMaterials(window.qaH3.dataset.id).length,
      cards: document.querySelectorAll('[data-qa-h3="primary"] .flora-reference-card').length,
    }))
    assert.equal(beforeEvict.incoming, 1, `连接后应有一个参考素材：${JSON.stringify(beforeEvict)}`)
    assert.equal(beforeEvict.cards, 1)

    // 模拟分页存储回收离屏来源：卸载节点并移除常驻模型，再触发一次同步。
    const evicted = await page.evaluate(() => {
      const source = window.qaSource
      const sourceId = source.dataset.id
      unmountCanvasVirtualNode(sourceId, source)
      // 真实回收：模型从常驻表移除，节点从 DOM 卸载，之后只剩连接关系。
      canvasVirtualStore.removeResidentModel(sourceId)
      canvasVirtualStore.remove(sourceId)
      source.remove()
      clearCanvasSelection()
      selectCanvasNode(window.qaH3)
      return {
        mounted: Boolean(canvasVirtualStore.getMounted?.(sourceId)),
        resident: canvasVirtualStore.has?.(sourceId) ?? null,
        inDom: Boolean(document.querySelector(`[data-id="${sourceId}"]`)),
      }
    })
    await page.waitForTimeout(500)
    const afterEvict = await page.evaluate(() => ({
      incoming: getCanvasIncomingReferenceMaterials(window.qaH3.dataset.id).length,
      cards: document.querySelectorAll('[data-qa-h3="primary"] .flora-reference-card').length,
      badge: document.querySelector('[data-qa-h3="primary"] .flora-reference-index')?.textContent?.trim() || '',
    }))
    assert.deepEqual(evicted, { mounted: false, resident: false, inDom: false }, `来源节点应已被卸载并回收：${JSON.stringify(evicted)}`)
    assert.equal(afterEvict.incoming, 1, `来源被回收后仍应保留参考素材：${JSON.stringify(afterEvict)}`)
    assert.equal(afterEvict.cards, 1, '参考带卡片不能随来源回收消失')
    assert.equal(afterEvict.badge, '图片1')

    // 提交请求同样不能丢参考素材。
    await page.evaluate(() => {
      const prompt = document.querySelector('[data-qa-h3="primary"] .canvas-h3-prompt')
      prompt.value = '回收后仍带参考素材'
      prompt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.locator('[data-qa-h3="primary"] .canvas-node-run').click()
    await page.waitForFunction(() => document.querySelector('[data-qa-h3="primary"] .flora-generator-status')?.textContent?.includes('H3测试接口暂不可用'), null, { timeout: 15000 })
    assert.equal(submissions.length, 1)
    assert.equal(submissions[0].images.length, 1, `提交请求应保留被回收来源的素材：${JSON.stringify(submissions[0].images)}`)
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    console.log(JSON.stringify({ ok: true, beforeEvict, evicted, afterEvict, submitted: submissions[0].images.length }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
