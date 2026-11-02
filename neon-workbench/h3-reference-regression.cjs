const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }))
    await page.route('**/api/upload-image', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: '/output/qa-h3-ref.png' }) }))
    await page.route('**/api/upload-media', r => {
      const type = r.request().headers()['content-type'] || ''
      const isVideo = /^video\//.test(type)
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(isVideo
        ? { url: '/output/qa-h3-ref.mp4', filename: 'clip.mp4', mimeType: 'video/mp4' }
        : { url: '/output/qa-h3-ref.wav', filename: 'voice.wav', mimeType: 'audio/wav' }) })
    })
    await page.route('**/output/qa-h3-ref.png', r => r.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }))
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'neon-canvas-surface.css', 'flora-node-shell.js', 'flora-node-shell.css', 'flora-generator-composer.js', 'flora-generator-parameters.js', 'flora-generation-history.js', 'flora-generation-history.css', 'canvas-audio-generator.js']) {
        const file = path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name)
        if (fs.existsSync(file)) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file, 'utf8') }))
      }
    }
    await page.goto(process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    if (process.env.GENERATOR_SOURCE) {
      if (fs.existsSync(path.join(process.env.GENERATOR_SOURCE, 'neon-canvas-surface.css'))) await page.addStyleTag({ path: path.join(process.env.GENERATOR_SOURCE, 'neon-canvas-surface.css') })
      for (const [name, key] of [['flora-generation-history.js', 'FloraGenerationHistory'], ['canvas-audio-generator.js', 'CanvasAudioGenerator']]) {
        const file = path.join(process.env.GENERATOR_SOURCE, name)
        if (fs.existsSync(file) && !(await page.evaluate(k => Boolean(window[k]), key))) await page.addScriptTag({ path: file })
      }
    }
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-video-api', 'canvas-node-minimax-h3', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-h3-refs'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaH3 = addCanvasVideoGeneratorNode({ x: 200, y: 80 }, { engine: 'comfyui' })
      window.qaApi = addCanvasVideoGeneratorNode({ x: 900, y: 80 })
      canvasState.scale = 1; canvasState.x = 260; canvasState.y = 0; applyCanvasTransformNow()
      selectCanvasNode(qaH3)
    })
    await page.waitForTimeout(500)
    const h3 = page.locator('#canvasPlane .canvas-node[data-flora-kind="minimax-h3"]')
    const panel = h3.locator('.flora-generator-composer')
    await panel.waitFor({ state: 'visible' })
    assert.equal(await h3.count(), 1, '视频节点切到 ComfyUI 后就是 MiniMax H3 节点')
    const layout = await page.evaluate(() => {
      const grid = document.querySelector('#canvasPlane .canvas-node[data-flora-kind="minimax-h3"] .flora-generator-reference-area > .canvas-h3-reference-grid')
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').map(value => Math.round(parseFloat(value)))
      const sections = Array.from(grid.querySelectorAll('.canvas-h3-reference-collection'))
      const box = grid.getBoundingClientRect()
      return {
        columns: cols.length,
        widths: sections.map(section => Math.round(section.getBoundingClientRect().width)),
        tops: sections.map(section => Math.round(section.getBoundingClientRect().top)),
        gridWidth: Math.round(box.width),
        uploads: grid.querySelectorAll('.canvas-h3-reference-upload').length,
        addReferenceVisible: (() => { const add = document.querySelector('#canvasPlane .canvas-node[data-flora-kind="minimax-h3"] .flora-generator-add-reference'); return Boolean(add) && getComputedStyle(add).display !== 'none' })(),
        borderColor: getComputedStyle(sections[0]).borderColor,
      }
    })
    console.log('H3ROWS', JSON.stringify(layout))
    assert.equal(layout.columns, 3, '素材参考区是一行三列')
    assert.equal(new Set(layout.tops).size, 1, '三个素材槽在同一行')
    assert.equal(layout.uploads, 3, '图片/视频/音频各自有上传入口')
    assert.equal(layout.addReferenceVisible, false, 'H3 不再显示通用加号')
    await page.evaluate(() => { const node = qaH3; canvasState.scale = 1; canvasState.x = 320 - Number(node.dataset.x); canvasState.y = 60 - Number(node.dataset.y); applyCanvasTransformNow(); selectCanvasNode(node) })
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/h3-reference-row.png') })
    // Upload one file per media type through the real slots.
    const slots = h3.locator('.canvas-h3-reference-collection input[type=file]')
    await slots.nth(0).setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
    await page.waitForFunction(() => canvasState.connections.some(c => c.to === qaH3.dataset.id))
    await slots.nth(1).setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('00000018667479706d703432', 'hex') })
    await page.waitForFunction(() => canvasState.connections.filter(c => c.to === qaH3.dataset.id).length === 2)
    await slots.nth(2).setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: Buffer.from('52494646', 'hex') })
    await page.waitForFunction(() => canvasState.connections.filter(c => c.to === qaH3.dataset.id).length === 3)
    const refs = await page.evaluate(() => {
      const state = getCanvasIncomingMinimaxH3Refs(qaH3)
      return { images: state.images.length, videos: state.videos.length, audios: state.audios.length,
        kinds: canvasState.connections.filter(c => c.to === qaH3.dataset.id).map(c => getCanvasNode(c.from)?.className.match(/canvas-node-(image|video|audio)\b/)?.[1] || '') }
    })
    console.log('REFS', JSON.stringify(refs))
    assert.deepEqual([refs.images, refs.videos, refs.audios], [1, 1, 1], '上传后三类参考各有一条')
    // Video node toolbar carries the download action, disabled until a result exists.
    const api = page.locator('#canvasPlane .canvas-node[data-flora-kind="video-api"]')
    const download = api.locator('.flora-node-toolbar [data-flora-action="result-download"]')
    assert.equal(await download.count(), 1, '视频节点工具栏带下载按钮')
    assert.equal(await api.locator('.flora-node-toolbar [data-flora-action="result-preview"]').count(), 0, '视频节点不显示图片放大按钮')
    await page.evaluate(() => selectCanvasNode(qaApi))
    await page.waitForTimeout(120)
    assert.equal(await download.isDisabled(), true, '没有结果时下载按钮不可用')
    await page.evaluate(() => deliverCanvasApiVideoResult(qaApi, ['/output/qa-video.mp4'], '镜头推进'))
    await page.waitForTimeout(300)
    assert.equal(await download.isDisabled(), false, '有视频结果后下载按钮可用')
    assert.equal(await page.evaluate(() => canvasDownloadFileName('生成视频', 'video/mp4', '/output/x.mp4')), '生成视频.mp4', '视频下载保留真实扩展名')
    assert.equal(await page.evaluate(() => canvasDownloadFileName('生成音频', 'audio/wav', '/output/x.wav')), '生成音频.wav', '音频下载保留真实扩展名')
    assert.equal(await page.evaluate(() => canvasDownloadFileName('生成结果', '', '/output/x.png')), '生成结果.png')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(__dirname, 'acceptance/h3-reference-row.png') })
    console.log(JSON.stringify({ ok: true, checks: 14 }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
