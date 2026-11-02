const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    const out = path.join(__dirname, 'acceptance/text-tools'); fs.mkdirSync(out, { recursive: true })
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], preferences: {}, settings: {} } }))
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'flora-node-shell.js', 'flora-node-shell.css', 'canvas-text-node-renderer.js', 'flora-text-tools.js', 'canvas-file-import.js']) await page.route(`**/${name}*`, r => {
        const file = path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name)
        return fs.existsSync(file) ? r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file, 'utf8') }) : r.continue()
      })
      await page.route('http://127.0.0.1:3199/', async r => {
        let html = await (await r.fetch()).text()
        if (!html.includes('flora-text-tools.js')) html = html.replace('<script src="./flora-node-shell.js', '<script src="./flora-text-tools.js"></script><script src="./canvas-file-import.js"></script><script src="./flora-node-shell.js')
        await r.fulfill({ contentType: 'text/html', body: html })
      })
    }
    await page.goto('http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-text', 'canvas-node-media', 'canvas-node-asset-collection'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-text-tools'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaText = addCanvasText({ x: 100, y: 80 }, { text: '# 场景提示\n\n**雪景**与*蓝调*\n\n- 松树\n- 月光', name: '雪景提示', focus: false })
      canvasState.x = 360; canvasState.y = 80; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaText)
    })
    const node = page.locator('.canvas-node-text')
    await page.screenshot({ path: path.join(out, 'default-selected.png') })
    await node.locator('[data-flora-action="text-background"]').click({ timeout: 2500 })
    const palette = page.locator('.flora-text-palette')
    assert.equal(await palette.getByRole('button').count(), 6)
    await palette.locator('[data-text-background="cyan"]').hover()
    await page.screenshot({ path: path.join(out, 'background-palette-hover-focus.png') })
    await palette.locator('[data-text-background="cyan"]').click()
    assert.equal(await node.evaluate(el => serializeCanvasNode(el).textBackground), 'cyan')
    await page.evaluate(() => undoCanvasCommand())
    assert.equal(await node.evaluate(el => serializeCanvasNode(el).textBackground), 'default')
    await page.evaluate(() => redoCanvasCommand())
    assert.equal(await node.evaluate(el => serializeCanvasNode(el).textBackground), 'cyan')
    await node.locator('[data-flora-action="text-expand"]').click()
    const dialog = page.locator('.flora-text-expanded-dialog')
    assert.ok(await dialog.isVisible())
    const editor = dialog.locator('.canvas-text')
    assert.equal(await editor.locator('h1').textContent(), '场景提示')
    assert.equal(await editor.locator('strong').textContent(), '雪景')
    assert.equal(await editor.locator('em').textContent(), '蓝调')
    await editor.evaluate(el => { el.querySelector('em').textContent = '夜色'; el.dispatchEvent(new InputEvent('input', { bubbles: true })) })
    await editor.evaluate(el => {
      const p = document.createElement('p'); p.textContent = '格式检查'; el.append(p); el.focus();
      const range = document.createRange(); range.selectNodeContents(p); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    })
    await page.waitForTimeout(40)
    await dialog.locator('[data-text-format="bold"]').click()
    assert.ok((await editor.locator('strong, b').allTextContents()).includes('格式检查'), '放大界面格式按钮修改当前选区')
    const expandedDownload = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '下载 Markdown 文档', exact: true }).click()
    assert.ok(fs.readFileSync(await (await expandedDownload).path(), 'utf8').includes('**格式检查**'), '放大界面下载包含未关闭的当前编辑内容')
    await dialog.getByRole('button', { name: '关闭文字放大界面', exact: true }).click()
    assert.equal(await node.locator('.canvas-text em').textContent(), '夜色')
    assert.ok(await node.locator('.flora-node-toolbar .flora-text-format-tools').count())
    const download = page.waitForEvent('download')
    await node.locator('[data-flora-action="text-download"]').click()
    const file = await download; assert.equal(file.suggestedFilename(), '雪景提示.md')
    const exported = fs.readFileSync(await file.path(), 'utf8')
    assert.ok(exported.includes('# 场景提示')); assert.ok(exported.includes('**雪景**')); assert.ok(exported.includes('*夜色*')); assert.ok(exported.includes('- 松树'))
    const saved = await node.evaluate(el => serializeCanvasNode(el))
    await page.evaluate(item => {
      window.qaRestored = restoreCanvasBoardNode({ ...item, id: 'qa-text-restored' }, {}, { maxId: 0 }); selectCanvasNode(qaRestored)
    }, saved)
    assert.equal(await page.locator('[data-id="qa-text-restored"]').evaluate(el => el.dataset.textBackground), 'cyan')
    await page.evaluate(() => { unmountCanvasVirtualNode(qaRestored.dataset.id, qaRestored); selectCanvasNode(qaText) })
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 })
      for (const scale of [.65, 1, 1.5]) {
        await page.evaluate(({ width, scale }) => { canvasState.x = width / 2 - 300 * scale; canvasState.y = 100; canvasState.scale = scale; applyCanvasTransformNow(); selectCanvasNode(qaText) }, { width, scale })
        await node.locator('[data-flora-action="text-background"]').click()
        const p = await palette.boundingBox(); assert.ok(p.x >= 0 && p.x + p.width <= width + 1, '色板保持在视口内')
        await page.keyboard.press('Escape')
        await node.locator('[data-flora-action="text-expand"]').click()
        const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
        assert.equal(await editor.locator('em').textContent(), '夜色')
        await editor.focus()
        assert.equal(await editor.evaluate(el => getComputedStyle(el).outlineStyle), 'none', '全屏编辑区无内框')
        await page.screenshot({ path: path.join(out, `${width}-${scale}-expanded.png`) })
        await page.keyboard.press('Escape')
        assert.equal(await dialog.isVisible(), false)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      }
    }
    assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, widths: [390, 768, 1440, 1728], scales: [.65, 1, 1.5], errors }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
