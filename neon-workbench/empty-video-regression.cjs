const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const errors = [], output = path.join(__dirname, 'acceptance/empty-video')
  fs.mkdirSync(output, { recursive: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {} } }))
    await page.route('**/output/empty-video-test.webm', r => r.fulfill({ status: 404, body: '' }))
    if (process.env.GENERATOR_SOURCE) for (const name of ['flora-node-shell.js', 'flora-node-shell.css']) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, name), 'utf8') }))
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-empty-video'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaVideos = [addCanvasApiVideoNode({ x: 60, y: 100 }, { focus: false }), addCanvasMinimaxH3Node({ x: 520, y: 100 }, { focus: false })]
    })
    for (let index = 0; index < 2; index++) {
      const node = page.locator('.canvas-node').filter({ has: page.locator('.flora-generator-composer') }).nth(index)
      assert.equal(await node.locator('.flora-generator-placeholder').isVisible(), true, '新建空视频显示默认占位')
      await page.evaluate(index => applyCanvasGenerationHistoryItem(qaVideos[index], null), index)
      assert.equal(await node.locator('.canvas-media-shell').isVisible(), false, '空历史回调不能显示无源播放器')
      assert.equal(await node.locator('.flora-video-center:visible').count(), 0, '空态没有播放键')
      assert.equal(await node.locator('.flora-generator-placeholder').isVisible(), true)
      await page.evaluate(index => {
        const node = qaVideos[index]
        applyCanvasGenerationHistoryItem(node, { kind: 'video', src: '/output/empty-video-test.webm' })
        const media = node.querySelector('video'); let paused = true
        Object.defineProperty(media, 'paused', { configurable: true, get: () => paused })
        media.play = () => { paused = false; media.dispatchEvent(new Event('play')); return Promise.resolve() }
        media.pause = () => { paused = true; media.dispatchEvent(new Event('pause')) }
      }, index)
      assert.equal(await node.locator('.canvas-media-shell').isVisible(), true, '有结果显示视频表面')
      assert.equal(await node.locator('.flora-generator-placeholder').isVisible(), false)
      assert.equal(await node.locator('.flora-video-center').isVisible(), true)
      await node.locator('.flora-video-center').click()
      assert.equal(await node.locator('video').evaluate(media => media.paused), false, '播放控件仍可播放')
      await page.evaluate(index => applyCanvasGenerationHistoryItem(qaVideos[index], null), index)
      assert.equal(await node.locator('.canvas-media-shell').isVisible(), false, '清空结果恢复占位')
      assert.equal(await node.locator('.flora-video-center:visible').count(), 0)
      assert.equal(await node.locator('.flora-video-controls:visible').count(), 0)
      assert.equal(await node.locator('.flora-generator-placeholder').isVisible(), true)
      await page.evaluate(index => CanvasFloraNodeShell.refresh(qaVideos[index]), index)
      assert.equal(await node.locator('.canvas-media-shell').isVisible(), false, '刷新壳体保持空态')
      await page.evaluate(index => {
        const saved = serializeCanvasNode(qaVideos[index]); saved.id = `qa-empty-restored-${index}`
        window.qaRestored = restoreCanvasBoardNode(saved, {}, { maxId: 0 })
      }, index)
      const restored = page.locator(`[data-id="qa-empty-restored-${index}"]`)
      assert.equal(await restored.locator('.flora-generator-placeholder').isVisible(), true, '恢复空节点保持占位')
      assert.equal(await restored.locator('.flora-video-center:visible').count(), 0)
      await page.evaluate(() => unmountCanvasVirtualNode(qaRestored.dataset.id, qaRestored))
    }
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 })
      await page.evaluate(width => { canvasState.scale = width < 768 ? .6 : 1; canvasState.x = width / 2 - 260 * canvasState.scale; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaVideos[0]) }, width)
      const node = page.locator(`[data-flora-kind="video-api"]`).first()
      assert.equal(await node.locator('.flora-generator-placeholder').isVisible(), true)
      assert.equal(await node.locator('.flora-video-center:visible').count(), 0)
      await node.hover(); await page.screenshot({ path: path.join(output, `${width}-selected-hover.png`) })
      await node.locator('.flora-generator-expand').click()
      await page.screenshot({ path: path.join(output, `${width}-expanded.png`) })
      await page.keyboard.press('Escape')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, kinds: ['video-api', 'minimax-h3'], widths: [390, 768, 1440, 1728], errors, note: '真实宿主空态/结果写入/清空/恢复，播放方法模拟，无真实生成' }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
