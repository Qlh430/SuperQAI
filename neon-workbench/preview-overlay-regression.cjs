const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }))
    await page.route('**/output/qa-portrait.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#123"/><circle cx="300" cy="450" r="200" fill="#4c8"/></svg>' }))
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'neon-canvas-surface.css', 'flora-node-shell.js', 'flora-node-shell.css', 'flora-generator-composer.js', 'flora-generator-parameters.js', 'flora-generation-history.js', 'flora-generation-history.css', 'canvas-audio-generator.js']) {
        const file = path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name)
        if (fs.existsSync(file)) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file, 'utf8') }))
      }
    }
    await page.goto('http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    if (process.env.GENERATOR_SOURCE) {
      if (fs.existsSync(path.join(process.env.GENERATOR_SOURCE, 'neon-canvas-surface.css'))) await page.addStyleTag({ path: path.join(process.env.GENERATOR_SOURCE, 'neon-canvas-surface.css') })
      for (const [name, key] of [['flora-generation-history.js', 'FloraGenerationHistory'], ['canvas-audio-generator.js', 'CanvasAudioGenerator']]) {
        const file = path.join(process.env.GENERATOR_SOURCE, name)
        if (fs.existsSync(file) && !(await page.evaluate(k => Boolean(window[k]), key))) await page.addScriptTag({ path: file })
      }
    }
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-preview-fix'
      document.getElementById('aiOsDesktop').hidden = false
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaNode = addCanvasImageGeneratorNode({ x: 100, y: 50 })
      canvasState.scale = 1; canvasState.x = 420; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaNode)
      commitCanvasImageJobResult(qaNode, { id: 'qa-pv3', boardId: canvasState.activeBoardId, nodeId: qaNode.dataset.id, model: 'qa', result: { data: [{ url: '/output/qa-portrait.svg', width: 600, height: 900 }] } }, '测试')
    })
    await page.waitForTimeout(500)
    const button = page.locator('#canvasPlane .canvas-node .flora-node-toolbar [data-flora-action="result-preview"]').first()
    await button.click()
    await page.waitForTimeout(500)
    const opened = await page.evaluate(() => {
      const lb = document.querySelector('#lightbox')
      const rect = lb.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        parent: lb.parentElement?.tagName,
        z: getComputedStyle(lb).zIndex,
        w: Math.round(rect.width), h: Math.round(rect.height),
        hitInsideLightbox: Boolean(hit?.closest?.('#lightbox')),
        closeVisible: Boolean(document.querySelector('#lightboxClose')?.getBoundingClientRect().width),
      }
    })
    console.log('OPENED', JSON.stringify(opened))
    assert.equal(opened.parent, 'BODY', '画布内预览挂到 body 层')
    assert.equal(opened.hitInsideLightbox, true, '预览位于画布层之上，可接收点击')
    assert.ok(opened.w > 100 && opened.h > 100, '预览全屏可见')
    assert.equal(opened.closeVisible, true, '关闭按钮可见')
    await page.locator('#lightboxClose').click()
    await page.waitForTimeout(300)
    const closed = await page.evaluate(() => ({
      hidden: document.querySelector('#lightbox').hidden,
      parent: document.querySelector('#lightbox').parentElement?.id || document.querySelector('#lightbox').parentElement?.tagName,
      over: document.querySelector('#lightbox').classList.contains('is-over-canvas'),
    }))
    console.log('CLOSED', JSON.stringify(closed))
    assert.equal(closed.hidden, true, '关闭后隐藏')
    assert.equal(closed.parent, 'aiOsDesktop', '关闭后回到桌面容器')
    assert.equal(closed.over, false, '关闭后移除画布层级类')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(__dirname, 'acceptance/preview-over-canvas.png') })
    console.log(JSON.stringify({ ok: true, checks: 7 }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
