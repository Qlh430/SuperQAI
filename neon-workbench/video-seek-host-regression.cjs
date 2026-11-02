const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { startFixtureServer } = require('./media-range-regression.cjs')

;(async () => {
  const { server, origin } = await startFixtureServer()
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    if (process.env.VIDEO_SHELL_SOURCE) {
      await page.route('**/flora-node-shell.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(process.env.VIDEO_SHELL_SOURCE, 'utf8') }))
    }
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} }) }))
    await page.route('**/qa-video.mp4', async route => {
      const response = await fetch(`${origin}/output/video-seek-fixture.mp4`, { headers: route.request().headers() })
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    })
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    assert.ok(await page.evaluate(() => Boolean(window.CanvasFloraNodeShell)), '测试入口必须加载本项目的 Flora 壳体')
    await page.evaluate(async () => {
      const result = await window.AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-asset-collection'])
      if (result?.ok === false) throw new Error(JSON.stringify(result))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-isolated-board'
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#090a0c'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.hidden = false
      view.classList.add('active')
      const editor = document.querySelector('#canvasEditorScreen')
      editor.hidden = false
      document.body.classList.add('canvas-surface-open')
      const node = addCanvasAssetCollection({ x: 160, y: 120 }, { mode: 'single', deferSave: true, members: [{ id: 'qa-video', kind: 'video', src: '/qa-video.mp4', name: '测试视频', mimeType: 'video/mp4' }] })
      node.dataset.qaVideo = 'true'
      showCanvasEditor()
      canvasState.scale = 1
      canvasState.x = 0
      canvasState.y = 0
      applyCanvasTransform()
    })
    await page.waitForFunction(() => document.querySelector('[data-qa-video] video')?.duration > 0)
    const video = page.locator('[data-qa-video] video')
    const progress = page.locator('[data-qa-video] .flora-video-progress')
    const node = page.locator('[data-qa-video]')
    const results = []
    async function dragProgress(ratio, label) {
      await node.hover()
      try { await progress.waitFor({ state: 'visible', timeout: 3000 }) }
      catch (error) {
        await page.screenshot({ path: path.join(__dirname, 'acceptance/video-interaction-failure.png') })
        throw new Error(`${label}: ${error.message}`)
      }
      const before = await node.evaluate(element => ({ x: element.dataset.x, y: element.dataset.y }))
      const box = await progress.boundingBox()
      const current = await progress.inputValue()
      const y = box.y + box.height / 2
      await page.mouse.move(box.x + 4 + (box.width - 8) * Number(current) / 1000, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * ratio, y, { steps: 10 })
      await page.mouse.up()
      await page.waitForFunction(() => !document.querySelector('[data-qa-video] video').seeking)
      const time = await video.evaluate(media => media.currentTime)
      assert.ok(Math.abs(time - 8 * ratio) < 0.7, `${label} 拖动时间异常：${time}`)
      assert.deepEqual(await node.evaluate(element => ({ x: element.dataset.x, y: element.dataset.y })), before, '拖动进度条不能移动节点')
      results.push({ label, time })
    }
    async function checkPictureInteraction(label) {
      await video.evaluate(media => { media.pause(); media.currentTime = 0 })
      await page.locator('[data-qa-video] .flora-video-center').click()
      assert.equal(await video.evaluate(media => media.paused), false, '播放按钮应开始播放')
      const box = await page.locator('[data-qa-video] .canvas-media-shell').boundingBox()
      const point = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.25 }
      const before = await node.evaluate(element => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) }))
      // A drag gesture during playback must neither pause nor move the node.
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 20, point.y + 20, { steps: 3 })
      await page.mouse.move(point.x, point.y, { steps: 3 })
      await page.mouse.up()
      assert.equal(await video.evaluate(media => media.paused), false, '拖动后回到原位也不能被当成单击暂停')
      assert.deepEqual(await node.evaluate(element => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) })), before)
      await page.mouse.click(point.x, point.y)
      assert.equal(await video.evaluate(media => media.paused), true, '播放中单击画面应暂停')
      assert.deepEqual(await node.evaluate(element => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) })), before)
      // Dragging the paused picture uses the real canvas engine.
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 24, point.y + 20, { steps: 4 })
      await page.mouse.up()
      assert.equal(await video.evaluate(media => media.paused), true, '暂停画面拖动不能误触播放')
      const after = await node.evaluate(element => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) }))
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 5, '暂停后应能拖动节点')
      results.push({ label: `${label} / 画面点击与拖动`, before, after })
    }
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 })
      for (const zoom of [0.5, 1, 1.75]) {
        await page.evaluate(({ width, zoom }) => {
          const node = document.querySelector('[data-qa-video]')
          node.style.setProperty('--flora-node-width', `${width === 390 ? 190 : 400}px`)
          node.style.setProperty('--flora-node-height', '400px')
          canvasState.scale = zoom
          canvasState.x = -Number(node.dataset.x) * zoom + 24
          canvasState.y = -Number(node.dataset.y) * zoom + 100
          applyCanvasTransformNow()
          node.querySelector('video').pause()
          node.querySelector('video').currentTime = 0
        }, { width, zoom })
        await dragProgress(0.65, `${width}px / ${zoom} / 暂停`)
        await video.evaluate(media => media.play())
        await dragProgress(0.3, `${width}px / ${zoom} / 播放`)
        assert.equal(await video.evaluate(media => media.paused), false)
        await video.evaluate(media => media.pause())
        await checkPictureInteraction(`${width}px / ${zoom}`)
      }
      await progress.focus()
      await progress.press('Home')
      await progress.press('ArrowRight')
      assert.ok(await video.evaluate(media => media.currentTime) > 0, '键盘应能调节视频进度')
      await node.hover()
      await page.screenshot({ path: path.join(__dirname, `acceptance/video-seek-host-${width}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    await node.hover()
    await page.locator('[data-qa-video] .flora-video-expand').click()
    await page.waitForFunction(() => document.fullscreenElement)
    await dragProgress(0.6, '全屏')
    await video.evaluate(media => media.play())
    await page.mouse.click(150, 180)
    assert.equal(await video.evaluate(media => media.paused), true, '全屏播放中单击画面应暂停')
    await page.screenshot({ path: path.join(__dirname, 'acceptance/video-seek-host-fullscreen.png') })
    await page.locator('[data-qa-video] .flora-video-expand').click()
    await page.waitForFunction(() => !document.fullscreenElement)
    assert.deepEqual(errors, [])
    const report = { evidence: '真实宿主画布与实际 MP4 解码；隔离媒体服务、模拟业务 API，未修改用户画布。', results, errors }
    fs.writeFileSync(path.join(__dirname, 'acceptance/video-seek-host-report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ checked: results.length, errors, evidence: report.evidence }))
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
