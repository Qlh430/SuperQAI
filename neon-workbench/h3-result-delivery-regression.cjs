const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    const posts = []
    let pendingStatus, statusSeen
    const statusStarted = new Promise(resolve => { statusSeen = resolve })
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {} } }))
    await page.route('**/api/minimax-h3-video', r => { posts.push(r.request().postDataJSON()); return r.fulfill({ status: 202, json: { task_id: 'qa-h3-task' } }) })
    await page.route('**/api/upscale/status*', r => { pendingStatus = r; statusSeen() })
    await page.route('**/output/qa-h3-result.mp4', r => process.env.H3_RESULT_FILE
      ? r.fulfill({ contentType: 'video/mp4', body: fs.readFileSync(process.env.H3_RESULT_FILE) })
      : r.fulfill({ status: 404, body: '' }))
    if (process.env.GENERATOR_SOURCE) await page.route('**/script.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js'), 'utf8') }))
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-h3-delivery'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaOriginal = addCanvasMinimaxH3Node({ x: 60, y: 100 }, { focus: false })
      window.qaReference = addCanvasImage('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="yellow"/></svg>'), '香蕉.png', { x: -650, y: 100 })
      connectCanvasNodes(qaReference.dataset.id, qaOriginal.dataset.id)
      const prompt = qaOriginal.querySelector('.canvas-h3-prompt'); prompt.value = '香蕉被人拿起剥开'; prompt.dispatchEvent(new Event('input', { bubbles: true }))
      window.qaRun = runCanvasMinimaxH3Node(qaOriginal)
    })
    await statusStarted
    await page.evaluate(() => {
      window.qaCurrent = replaceCanvasVirtualNode(qaOriginal.dataset.id, qaOriginal, 'full', 'full')
      assertDelivery = qaOriginal !== qaCurrent && !qaOriginal.isConnected
    })
    assert.equal(await page.evaluate(() => assertDelivery), true, '任务进行期间真实替换节点')
    await pendingStatus.fulfill({ json: { status: 'success', progress: 100, videos: ['/output/qa-h3-result.mp4'] } })
    await page.evaluate(() => qaRun)
    assert.equal(posts.length, 1, '只提交一次生成任务')
    assert.equal(posts[0].images.length, 1, '未手写引用标记仍提交已连接图片')
    assert.equal(posts[0].images[0].name, '香蕉.png')
    assert.ok(posts[0].prompt.includes('<Picture 1>'))
    assert.ok(posts[0].prompt.endsWith('香蕉被人拿起剥开'))
    assert.equal(await page.evaluate(() => qaCurrent.querySelector('.canvas-h3-prompt').value), '香蕉被人拿起剥开', '自动引用不污染用户输入')
    const state = await page.evaluate(() => ({ current: serializeCanvasNode(qaCurrent), model: getCanvasNodeModel(qaCurrent.dataset.id), old: qaOriginal.isConnected }))
    assert.equal(state.current.generationVideoSrc, '/output/qa-h3-result.mp4', '完成结果写入当前实例')
    assert.equal(state.current.generationHistory.length, 1, '完成结果进入当前历史')
    assert.equal(state.model.generationVideoSrc, '/output/qa-h3-result.mp4', '结果同步到虚拟模型供保存')
    const node = page.locator(`[data-id="${state.current.id}"]`)
    assert.equal(await node.locator('.canvas-media-shell').isVisible(), true)
    assert.equal(await node.locator('.flora-generator-placeholder').isVisible(), false)
    if (process.env.H3_RESULT_FILE) {
      await page.waitForFunction(() => qaCurrent.querySelector('video').duration > 0)
      await node.locator('.flora-video-center').click()
      assert.equal(await node.locator('video').evaluate(media => media.paused), false, '本次真实结果可解码播放')
      await node.locator('video').evaluate(media => media.pause())
    }
    await page.evaluate(() => {
      window.qaAfterRestore = replaceCanvasVirtualNode(qaCurrent.dataset.id, qaCurrent, 'full', 'full')
    })
    assert.equal(await node.locator('.canvas-media-shell').isVisible(), true, '再次恢复后视频仍可见')
    const nextStatusStarted = new Promise(resolve => { statusSeen = resolve })
    await page.evaluate(() => {
      window.qaSecond = addCanvasMinimaxH3Node({ x: 800, y: 100 }, { focus: false })
      qaSecond.querySelector('.canvas-h3-prompt').value = '脱离视口的节点'
      window.qaSecondRun = runCanvasMinimaxH3Node(qaSecond)
    })
    await nextStatusStarted
    await page.evaluate(() => {
      unmountCanvasVirtualNode(qaSecond.dataset.id, qaSecond)
      canvasVirtualStore.setMounted(qaSecond.dataset.id, null)
    })
    await pendingStatus.fulfill({ json: { status: 'success', progress: 100, videos: ['/output/qa-h3-result.mp4'] } })
    await page.evaluate(() => qaSecondRun)
    assert.equal(await page.evaluate(() => getCanvasNodeModel(qaSecond.dataset.id).generationHistory.length), 1, '脱离视口后的模型仍保存结果')
    assert.equal(posts.length, 2)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, posts: posts.length, automaticReference: true, draftUnchanged: true, retargeted: true, unmounted: true, realMedia: Boolean(process.env.H3_RESULT_FILE), errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
