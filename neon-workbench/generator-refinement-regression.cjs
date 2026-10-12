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
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }))
    await page.route('**/output/qa-portrait.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#123"/><circle cx="300" cy="450" r="200" fill="#4c8"/></svg>' }))
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'neon-canvas-surface.css', 'flora-generator-composer.js', 'flora-generator-parameters.js', 'flora-node-shell.js', 'flora-node-shell.css', 'flora-generation-history.js', 'flora-generation-history.css', 'canvas-audio-generator.js']) {
        const file = path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name)
        if (fs.existsSync(file)) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file, 'utf8') }))
      }
    }
    await page.goto(process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    if (process.env.GENERATOR_SOURCE) {
      for (const [name, key] of [['flora-generation-history.js', 'FloraGenerationHistory'], ['canvas-audio-generator.js', 'CanvasAudioGenerator']]) {
        const file = path.join(process.env.GENERATOR_SOURCE, name)
        if (fs.existsSync(file) && !(await page.evaluate(k => Boolean(window[k]), key))) await page.addScriptTag({ path: file })
      }
      const css = path.join(process.env.GENERATOR_SOURCE, 'flora-generation-history.css')
      if (fs.existsSync(css)) await page.addStyleTag({ path: css })
    }
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-refine'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'
      document.body.append(surface)
      const view = document.querySelector('#canvasView'); surface.append(view)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaNode = addCanvasImageGeneratorNode({ x: 100, y: 50 })
      canvasState.scale = 1; canvasState.x = 420; canvasState.y = 0; applyCanvasTransformNow()
      selectCanvasNode(qaNode)
    })
    const node = page.locator('#canvasPlane .canvas-node').first()
    const panel = node.locator('.flora-generator-composer')
    await panel.locator('.canvas-node-prompt').fill('测试提示词')
    // Simulate the busy state the canvas paints while a job runs.
    await page.evaluate(() => {
      const run = qaNode.querySelector('.canvas-node-run')
      setCanvasNodeStatus(qaNode, '图片生成中…')
      window.FloraGeneratorComposer.sync(qaNode)
    })
    await page.waitForTimeout(200)
    const statusInfo = await panel.locator('.flora-generator-status').evaluate(e => ({ text: e.textContent.trim(), hidden: e.hidden, height: e.getBoundingClientRect().height }))
    assert.equal(statusInfo.hidden, true, '生成中不保留状态行')
    assert.equal(statusInfo.height, 0, '状态行不占高度')
    // Busy glyph centring.
    await page.evaluate(() => {
      setCanvasImageNodeGenerationState(qaNode, true)
      window.FloraGeneratorComposer.sync(qaNode)
    })
    await page.waitForTimeout(200)
    const centre = await panel.locator('.canvas-node-run').evaluate(b => {
      const box = b.getBoundingClientRect()
      const icon = b.querySelector('.flora-generator-run-icon')
      if (!icon) return { missing: true }
      const ib = icon.getBoundingClientRect()
      return { dx: Math.abs((ib.left + ib.width / 2) - (box.left + box.width / 2)), dy: Math.abs((ib.top + ib.height / 2) - (box.top + box.height / 2)), w: box.width, h: box.height }
    })
    assert.ok(!centre.missing, '忙碌时运行按钮显示 loader 图标')
    assert.ok(centre.dx <= 0.5 && centre.dy <= 0.5, `运行按钮图标居中 dx=${centre.dx} dy=${centre.dy}`)
    await page.evaluate(() => setCanvasImageNodeGenerationState(qaNode, false))
    // Commit a portrait result through the real host path.
    await page.evaluate(() => {
      const job = { id: 'qa-refine-job', boardId: canvasState.activeBoardId, nodeId: qaNode.dataset.id, model: 'gpt-image-2', result: { data: [{ url: '/output/qa-portrait.svg', width: 1254, height: 1254 }] } }
      commitCanvasImageJobResult(qaNode, job, '测试提示词')
    })
    await page.waitForTimeout(400)
    const saved = await page.evaluate(() => serializeCanvasNode(qaNode).generationHistory)
    const historyEntry = saved[0]
    assert.equal(historyEntry.requestedSize, '1:1', '请求按比例记录，不写死像素')
    assert.deepEqual(historyEntry.actualSize, { width: 1254, height: 1254 }, '实际像素按服务商返回记录')
    const afterCommit=await panel.locator('.flora-generator-status').evaluate(e=>({text:e.textContent.trim(),hidden:e.hidden,height:e.getBoundingClientRect().height}));
    assert.equal(afterCommit.hidden, true, '完成后不保留状态行')
    assert.equal(afterCommit.height, 0, '完成后状态行不占高度')
    assert.equal(await page.locator('#canvasPlane .canvas-result-download:visible').count(), 0, '结果角落不再显示旧下载按钮')
    const toolbarDownload = node.locator('.flora-node-toolbar [data-flora-action="result-download"]')
    assert.equal(await toolbarDownload.isVisible(), true, '结果下载入口在节点工具栏')
    const badge = node.locator('.flora-generation-history-badge')
    const overlap = await page.evaluate(() => {
      const t = qaNode.querySelector('.flora-node-toolbar [data-flora-action="result-download"]')
      const b = qaNode.querySelector('.flora-generation-history-badge')
      if (!t || !b) return null
      const a = t.getBoundingClientRect(), c = b.getBoundingClientRect()
      return !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom)
    })
    assert.equal(overlap, false, '工具栏下载按钮与生成历史角标不重叠')
    assert.equal(await node.locator('.flora-node-toolbar [data-flora-action="model"]').count(), 0, '工具栏不再显示模型按钮')
    assert.equal(await node.locator('.flora-node-toolbar [data-flora-action="parameters"]').count(), 0, '工具栏不再显示隐藏参数按钮')
    const toolbarPreview = node.locator('.flora-node-toolbar [data-flora-action="result-preview"]')
    assert.equal(await toolbarPreview.isVisible(), true, '工具栏显示放大查看按钮')
    await toolbarPreview.click()
    await page.waitForFunction(() => document.querySelector('#lightbox')?.hidden === false)
    assert.equal(await page.locator('#lightboxImage').getAttribute('src'), '/output/qa-portrait.svg', '放大查看打开生成原图')
    // A real click, not a synthetic dispatch: the canvas surface used to paint
    // over this button, which is exactly the "放大看没反应" defect.
    await page.locator('#lightboxClose').click()
    await page.waitForFunction(() => document.querySelector('#lightbox')?.hidden === true)
    assert.equal(await node.locator('.canvas-node-result img').evaluate(element => getComputedStyle(element).cursor), 'grab', '生成节点使用可拖动光标')
    assert.equal(await node.locator('.flora-node-label-title').evaluate(element => element.textContent.trim()), '生成结果', '节点标题显示生成结果')
    await page.evaluate(() => {
      const image = qaNode.querySelector('.canvas-node-result img')
      const box = image.getBoundingClientRect()
      image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }))
    })
    await page.waitForTimeout(120)
    const caption = await page.evaluate(() => {
      const viewport = document.querySelector('#infiniteCanvas')
      const info = viewport.querySelector('.canvas-image-info')
      if (!info) return { missing: true }
      const name = info.querySelector('[data-image-info-name]')
      const size = info.querySelector('[data-image-info-dimensions]')
      return {
        flagged: viewport.classList.contains('flora-generated-image-info'),
        nameHidden: !name || getComputedStyle(name).display === 'none',
        shadow: getComputedStyle(info).textShadow,
        sizeText: size?.textContent?.trim() || '',
      }
    })
    assert.equal(caption.flagged, true, '悬停生成结果时标记信息层')
    assert.equal(caption.nameHidden, true, '悬停信息层不重复显示名称')
    assert.equal(caption.shadow, 'none', '悬停信息层去掉白色光晕')
    await page.screenshot({ path: path.join(__dirname, 'acceptance/refine-node-1440.png') })
    // Fullscreen preview of the history item.
    await badge.click()
    await panel.page().waitForTimeout(200)
    await page.locator('.flora-generation-history-actions button[data-history-action="preview"]').first().click()
    await page.waitForTimeout(600)
    const zoomed = await page.evaluate(async () => {
      const frame = document.querySelector('.flora-generation-history-preview .flora-generation-history-media')
      const image = frame?.querySelector('img')
      if (!frame || !image) return { missing: true }
      const box = frame.getBoundingClientRect()
      frame.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120,
        clientX: box.left + box.width * 0.3, clientY: box.top + box.height * 0.3,
      }))
      const before = getComputedStyle(image).transform
      frame.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120,
        clientX: box.left + box.width * 0.3, clientY: box.top + box.height * 0.3,
      }))
      const after = getComputedStyle(image).transform
      return { before, after, zoom: Number(frame.dataset.zoom || 0) }
    })
    assert.ok(!zoomed.missing, '全屏预览存在可缩放的图片')
    assert.ok(zoomed.zoom > 100, `滚轮向上放大图片 zoom=${zoomed.zoom}`)
    assert.notEqual(zoomed.before, '', '放大后图片带缩放变换')
    assert.notEqual(zoomed.after, zoomed.before, '连续滚轮继续放大')
    await page.evaluate(() => {
      const frame = document.querySelector('.flora-generation-history-preview .flora-generation-history-media')
      frame.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })
    assert.equal(await page.evaluate(() => Number(document.querySelector('.flora-generation-history-preview .flora-generation-history-media').dataset.zoom)), 100, '双击复位缩放')
    const preview = await page.evaluate(() => {
      const media = document.querySelector('.flora-generation-history-preview .flora-generation-history-media')
      const img = media?.querySelector('img')
      if (!media || !img) return { missing: true }
      const mb = media.getBoundingClientRect(), ib = img.getBoundingClientRect()
      return {
        media: { w: Math.round(mb.width), h: Math.round(mb.height) },
        img: { w: Math.round(ib.width), h: Math.round(ib.height) },
        natural: { w: img.naturalWidth, h: img.naturalHeight },
        objectFit: getComputedStyle(img).objectFit,
        computed: { w: getComputedStyle(img).width, h: getComputedStyle(img).height, pos: getComputedStyle(img).position },
        top: Math.round(ib.top), bottom: Math.round(ib.bottom), viewportH: innerHeight,
        docH: document.querySelector('.flora-generation-history-preview-content')?.getBoundingClientRect().height,
      }
    })
    assert.ok(!preview.missing, '全屏预览渲染图片')
    assert.equal(preview.objectFit, 'contain', '全屏预览完整适配')
    assert.ok(preview.img.h <= preview.media.h + 1, `预览图片不超过容器高度 ${preview.img.h} <= ${preview.media.h}`)
    assert.ok(preview.bottom <= preview.viewportH, '预览图片在视口内完整显示')
    await page.screenshot({ path: path.join(__dirname, 'acceptance/refine-preview.png'), fullPage: false })
    assert.deepEqual(errors, [], '页面无脚本错误')
    console.log(JSON.stringify({ ok: true, checks: 30, evidence: '本地模拟业务接口；图片/文本/视频/音频节点未调用真实付费生成。' }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
