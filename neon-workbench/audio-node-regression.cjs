const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { startFixtureServer } = require('./media-range-regression.cjs')

// Synthetic PCM fixture exercises actual browser decoding without user media.
function writeAudioFixture(file) {
  const sampleRate = 8000, samples = sampleRate * 8
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 220 / sampleRate) * 1000), 44 + i * 2)
  fs.writeFileSync(file, wav)
}

;(async () => {
  const fixture = path.join(__dirname, 'test-fixtures/audio-seek-fixture.wav')
  writeAudioFixture(fixture)
  const { server, origin } = await startFixtureServer()
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const errors = [], results = [], states = []
    page.on('pageerror', error => errors.push(error.message))
    if (process.env.AUDIO_SHELL_SOURCE) {
      for (const extension of ['js', 'css']) {
        await page.route(`**/flora-node-shell.${extension}*`, route => route.fulfill({ contentType: extension === 'js' ? 'application/javascript' : 'text/css', body: fs.readFileSync(path.join(process.env.AUDIO_SHELL_SOURCE, `flora-node-shell.${extension}`), 'utf8') }))
      }
    }
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} }) }))
    await page.route('**/qa-audio.wav', async route => {
      const response = await fetch(`${origin}/output/audio-seek-fixture.wav`, { headers: route.request().headers() })
      return route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), 'content-type': 'audio/wav' }, body: Buffer.from(await response.arrayBuffer()) })
    })
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    assert.ok(await page.evaluate(() => Boolean(window.CanvasFloraNodeShell)), '入口必须是本项目的 Neon/Flora 宿主')
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
      surface.append(view); view.hidden = false; view.classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      const node = addCanvasAssetCollection({ x: 160, y: 120 }, { mode: 'single', deferSave: true, members: [{ id: 'qa-audio', kind: 'audio', src: '/qa-audio.wav', name: '测试音频', mimeType: 'audio/wav' }] })
      node.dataset.qaAudio = 'true'
      showCanvasEditor()
    })
    await page.waitForFunction(() => document.querySelector('[data-qa-audio] audio')?.duration > 0)
    const audio = page.locator('[data-qa-audio] audio'), timeline = page.locator('[data-qa-audio] .flora-audio-timeline'), node = page.locator('[data-qa-audio]')
    const position = () => node.evaluate(element => ({ x: element.dataset.x, y: element.dataset.y }))
    async function dragTo(ratio, label) {
      const before = await position(), box = await timeline.boundingBox()
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2, { steps: 12 })
      // Must update while held, not only on pointerup/click.
      const held = await audio.evaluate(media => media.currentTime)
      assert.ok(Math.abs(held - 8 * ratio) < 0.5, `${label} 按住拖动时进度应即时更新，实际 ${held}`)
      await page.mouse.up()
      await page.waitForFunction(() => !document.querySelector('[data-qa-audio] audio').seeking)
      assert.deepEqual(await position(), before, `${label} 拖进度不能移动节点`)
      const marker = await node.locator('.flora-audio-progress').boundingBox()
      assert.ok(Math.abs((marker.x - box.x) / box.width - ratio) < 0.08, `${label} 标记应随进度移动`)
      results.push({ label, time: held })
    }
    async function capture(name) {
      if (process.env.BD_CAPTURE_SCRIPT) {
        const captureScript = fs.readFileSync(process.env.BD_CAPTURE_SCRIPT, 'utf8')
        const snapshot = await page.evaluate(captureScript => {
          const __name = fn => fn
          document.querySelectorAll('[data-qa-audio], [data-qa-audio] *').forEach((element, index) => element.setAttribute('data-bd-inspect-id', `qa-audio-${index}`))
          return eval(captureScript)
        }, captureScript)
        // This review is scoped to the player, not the mocked workspace.
        snapshot.elements = snapshot.elements.filter(element => element.selector?.startsWith('qa-audio-'))
        snapshot.name = name
        states.push(snapshot)
        await page.screenshot({ path: path.join(__dirname, `acceptance/audio-${name}.png`) })
        if (name === '1440-default') await node.screenshot({ path: path.join(__dirname, 'acceptance/audio-node-preview.png') })
        return
      }
      states.push(await page.evaluate(name => ({ name, viewport: { width: innerWidth, height: innerHeight }, elements: [...document.querySelectorAll('[data-qa-audio] .flora-node-card, [data-qa-audio] .flora-audio-player, [data-qa-audio] .flora-audio-play, [data-qa-audio] .flora-audio-timeline, [data-qa-audio] .flora-audio-time')].map((element, i) => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
        return { id: `${name}-${i}`, label: element.className, interactive: element.matches('button,[role=slider]'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, style: { padding: { top: parseFloat(style.paddingTop), right: parseFloat(style.paddingRight), bottom: parseFloat(style.paddingBottom), left: parseFloat(style.paddingLeft) }, rowGap: parseFloat(style.rowGap) || 0, columnGap: parseFloat(style.columnGap) || 0, backgroundColor: style.backgroundColor, boxShadow: style.boxShadow, borderRadius: { topLeft: parseFloat(style.borderTopLeftRadius), topRight: parseFloat(style.borderTopRightRadius), bottomLeft: parseFloat(style.borderBottomLeftRadius), bottomRight: parseFloat(style.borderBottomRightRadius) } } }
      }) }), name))
      await page.screenshot({ path: path.join(__dirname, `acceptance/audio-${name}.png`) })
    }
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 })
      for (const zoom of [0.5, 1, 1.75]) {
        await page.evaluate(({ zoom, width }) => {
          const node = document.querySelector('[data-qa-audio]')
          node.style.setProperty('--flora-node-width', `${width === 390 ? 190 : 400}px`)
          canvasState.scale = zoom
          canvasState.x = -Number(node.dataset.x) * zoom + 24
          canvasState.y = -Number(node.dataset.y) * zoom + 100
          applyCanvasTransformNow()
          node.querySelector('audio').pause(); node.querySelector('audio').currentTime = 0
        }, { width, zoom })
        await dragTo(0.65, `${width}px/${zoom}/暂停`)
        await page.locator('[data-qa-audio] .flora-audio-play').click()
        assert.equal(await audio.evaluate(media => media.paused), false)
        await dragTo(0.3, `${width}px/${zoom}/播放`)
        assert.equal(await audio.evaluate(media => media.paused), false, '拖动进度保留播放状态')
        await audio.evaluate(media => media.pause())
      }
      await page.evaluate(() => {
        const node = document.querySelector('[data-qa-audio]')
        canvasState.scale = 1; canvasState.x = 24 - Number(node.dataset.x); canvasState.y = 100 - Number(node.dataset.y); applyCanvasTransformNow()
      })
      await timeline.focus(); await timeline.press('End')
      assert.ok(await audio.evaluate(media => media.currentTime) > 7.8)
      await timeline.press('Home'); assert.equal(await audio.evaluate(media => media.currentTime), 0)
      await timeline.press('ArrowRight'); assert.ok(await audio.evaluate(media => media.currentTime) > 0)
      const height = await node.evaluate(element => element.offsetHeight)
      assert.equal(height, 176, '音频应使用 128px 播放器与 48px 标题带')
      assert.equal(await node.evaluate(element => Number(element.dataset.renderedHeight)), height, '场景几何应与可见壳体相符')
      await capture(`${width}-focus`)
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.evaluate(() => {
      const node = document.querySelector('[data-qa-audio]')
      node.style.setProperty('--flora-node-width', '400px')
      canvasState.scale = 1; canvasState.x = 24 - Number(node.dataset.x); canvasState.y = 100 - Number(node.dataset.y); applyCanvasTransformNow()
      document.activeElement.blur(); node.classList.remove('is-selected')
    })
    await page.mouse.move(1000, 800); await capture('1440-default')
    await timeline.hover(); await capture('1440-hover')
    await node.evaluate(element => element.classList.add('is-selected')); await capture('1440-selected')
    const portTarget = await node.locator('.canvas-port-output').evaluate(element => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2 + 20, rect.top + rect.height / 2)
      return hit === element || element.contains(hit)
    })
    assert.equal(portTarget, true, '连接端口的透明扩展点击区域应有效')
    await timeline.click()
    await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen())
    await page.waitForFunction(() => Boolean(document.fullscreenElement))
    await dragTo(0.6, '画布全屏')
    await capture('1440-fullscreen')
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => !document.fullscreenElement)
    const box = await timeline.boundingBox(), before = await position()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
    await page.mouse.move(box.x + box.width + 25, box.y + box.height + 20); await page.mouse.up()
    assert.ok(await audio.evaluate(media => media.currentTime) > 7.8, '捕获指针应支持拖出控件并钳制到终点')
    assert.deepEqual(await position(), before)
    await timeline.evaluate(element => {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 72, isPrimary: true, button: 0, clientX: element.getBoundingClientRect().left }))
      element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 72, isPrimary: true }))
    })
    await dragTo(0.4, '取消后重新拖动')
    const shell = await node.locator('.flora-node-shell').boundingBox(), start = await position()
    await page.mouse.move(shell.x + 16, shell.y + 10); await page.mouse.down()
    await page.mouse.move(shell.x + 46, shell.y + 30, { steps: 4 }); await page.mouse.up()
    assert.notDeepEqual(await position(), start, '播放器空白区域仍能拖动节点')
    // Touch PointerEvents exercise the same gesture handler without mouse click.
    await timeline.evaluate(element => {
      const rect = element.getBoundingClientRect()
      for (const [type, ratio] of [['pointerdown', 0.2], ['pointermove', 0.7], ['pointerup', 0.7]]) element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 73, pointerType: 'touch', isPrimary: true, button: 0, clientX: rect.left + rect.width * ratio, clientY: rect.top + rect.height / 2 }))
    })
    assert.ok(Math.abs(await audio.evaluate(media => media.currentTime) - 5.6) < 0.2, '触摸指针应能调节进度')
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(__dirname, 'acceptance/audio-node-report.json'), JSON.stringify({ evidence: '真实宿主画布、实际 WAV 解码；模拟业务 API，未访问用户画布。触摸为 PointerEvent 合成测试。', results, errors, states }, null, 2))
    console.log(JSON.stringify({ checked: results.length, states: states.length, errors }))
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve)); fs.unlinkSync(fixture)
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
