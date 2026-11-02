const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    page.setDefaultTimeout(10000)
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    const output = path.join(__dirname, 'acceptance', 'composer-expanded'); fs.mkdirSync(output, { recursive: true })
    const referenceImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
    const models = [{ id: 'qa-a', modelId: '测试图片模型一', providerId: 'station', providerName: '测试中转站', capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2'], state: 'online', family: 'gpt-image-2' }, { id: 'qa-b', modelId: '测试图片模型二', providerId: 'station', providerName: '测试中转站', capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2'], state: 'online', family: 'gpt-image-2' }]
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }))
    await page.route('**/api/image-models*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ models }) }))
    await page.route('**/api/upload-image', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: referenceImage }) }))
    if (process.env.GENERATOR_SOURCE) for (const name of ['flora-generator-composer.js', 'flora-node-shell.css', 'image-model-picker.js']) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, name), 'utf8') }))
    await page.goto(process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async models => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-text', 'canvas-node-minimax-h3', 'canvas-node-video-api', 'canvas-node-asset-collection', 'canvas-node-llm'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-expand'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      imageModelCatalog = models
      imageModelInput.replaceChildren(...models.map(m => { const option = document.createElement('option'); option.value = m.id; option.textContent = m.modelId; IMAGE_MODEL_PLATFORMS[m.id] = 'openai'; IMAGE_MODEL_FAMILIES[m.id] = 'gpt-image-2'; return option })); imageModelInput.value = 'qa-a'
      window.qaRuns = []; runCanvasImageEdit = async node => { qaRuns.push({ prompt: node.querySelector('.canvas-node-prompt').value, model: node.querySelector('.canvas-node-model').value }); setCanvasNodeStatus(node, '生成失败：隔离测试失败') }
      window.qaNode = addCanvasImageGeneratorNode({ x: 100, y: 120 }, { focus: false })
      window.qaPrompt = qaNode.querySelector('.canvas-node-prompt'); qaPrompt.value = '原始提示词'
      canvasState.x = 160; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaNode)
    }, models)
    await page.waitForTimeout(200)
    const panel = page.locator('.canvas-node-generator .flora-generator-composer')
    const prompt = panel.locator('.canvas-node-prompt')
    const expand = panel.getByRole('button', { name: '放大操作区', exact: true })
    assert.equal(await expand.count(), 1, '操作区右上角有放大按钮')
    assert.equal(await prompt.evaluate(el => getComputedStyle(el).resize), 'none', '提示词原生缩放角移除')
    await expand.click()
    const dialog = page.locator('.flora-generator-expanded-dialog[open]')
    await dialog.waitFor({ state: 'visible' })
    assert.equal(await prompt.inputValue(), '原始提示词')
    assert.equal(await page.evaluate(() => qaNode.querySelector('.canvas-node-prompt') === qaPrompt), true, '复用原控件，仍属于原节点')
    assert.ok((await prompt.boundingBox()).height > 350, '放大后提示词有更大的编辑空间')
    await prompt.focus()
    assert.equal(await prompt.evaluate(el => getComputedStyle(el).outlineStyle), 'none', '放大编辑聚焦后不出现内部绿框')
    await prompt.fill('放大编辑后的提示词')
    await panel.getByRole('button', { name: '关闭放大操作区', exact: true }).click()
    assert.equal(await dialog.count(), 0)
    assert.equal(await prompt.inputValue(), '放大编辑后的提示词')
    assert.equal(await expand.evaluate(el => el === document.activeElement), true, '关闭后焦点回到入口')
    await expand.click()
    const modelTrigger = panel.locator('.image-model-picker-trigger')
    await modelTrigger.click()
    const menu = page.locator('.flora-generator-model-popover:not([hidden])')
    assert.equal(await menu.evaluate(el => Boolean(el.closest('dialog[open]'))), true, '模型菜单在模态界面内可交互')
    await menu.locator('[data-model-id="qa-b"] .image-model-picker-choice').click()
    assert.equal(await panel.locator('.canvas-node-model').inputValue(), 'qa-b')
    await modelTrigger.click(); await page.keyboard.press('Escape')
    assert.equal(await dialog.count(), 1, 'Esc先关闭模型菜单，保留放大界面')
    assert.equal(await menu.count(), 0)
    await panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])').click()
    const params = panel.locator('.flora-generator-parameter-popover:popover-open')
    await params.waitFor({ state: 'visible' })
    await params.locator('[data-param-kind="size"][data-param-value="16:9"]').click()
    await page.keyboard.press('Escape')
    assert.equal(await dialog.count(), 1, 'Esc先关闭参数浮层')
    await panel.locator('.flora-generator-reference-input').setInputFiles({ name: '参考图.png', mimeType: 'image/png', buffer: Buffer.from(referenceImage.split(',')[1], 'base64') })
    await panel.locator('.flora-generator-reference-area .flora-reference-materials img').first().waitFor()
    assert.equal(await page.evaluate(() => canvasState.connections.filter(c => c.to === qaNode.dataset.id).length), 1, '放大界面上传建立原节点连接')
    await panel.locator('.canvas-node-run').click()
    await panel.getByText('生成失败：隔离测试失败', { exact: true }).waitFor()
    assert.deepEqual(await page.evaluate(() => qaRuns), [{ prompt: '放大编辑后的提示词', model: 'qa-b' }], '生成读取放大编辑的同一组控件且仅提交一次')
    await page.keyboard.press('Escape')
    assert.equal(await dialog.count(), 0, 'Esc关闭编辑界面')
    assert.equal(await prompt.inputValue(), '放大编辑后的提示词')
    assert.equal(await panel.locator('.canvas-node-model').inputValue(), 'qa-b')
    await expand.click(); await page.mouse.click(8, 8)
    assert.equal(await dialog.count(), 0, '点击遮罩关闭')
    const widths = [390, 768, 1440, 1728], scales = [.65, 1, 1.5]
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      for (const scale of scales) {
        await page.evaluate(({ width, scale }) => { canvasState.scale = scale; canvasState.x = width / 2 - 300 * scale; canvasState.y = -80; applyCanvasTransformNow(); selectCanvasNode(qaNode) }, { width, scale })
        await page.waitForTimeout(60)
        for (const state of ['default', 'hover', 'focus']) {
          if (state === 'hover') await expand.hover()
          if (state === 'focus') await expand.focus()
          await page.screenshot({ path: path.join(output, `${width}-${scale}-${state}.png`) })
        }
        await expand.click()
        const rect = await dialog.boundingBox()
        assert.ok(rect.x >= 16 && rect.y >= 16 && rect.x + rect.width <= width - 15 && rect.y + rect.height <= 885, `${width}/${scale} 放大界面在视口内`)
        assert.equal(await prompt.evaluate(el => getComputedStyle(el).resize), 'none')
        const footerRect = await panel.locator('.flora-generator-footer').boundingBox()
        assert.ok(footerRect.y > rect.y + rect.height * .65, '底部操作栏位于放大界面底部')
        const close = panel.getByRole('button', { name: '关闭放大操作区', exact: true })
        for (const button of [close, panel.locator('.canvas-node-run'), modelTrigger, panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])')]) {
          assert.equal(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }), true, '关键按钮真实命中')
        }
        await close.focus(); await page.keyboard.press('Tab')
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Tab焦点限制在放大界面')
        await prompt.focus()
        assert.equal(await prompt.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
        await page.screenshot({ path: path.join(output, `${width}-${scale}-expanded.png`) })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await close.click()
      }
    }
    await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen())
    await expand.click(); await modelTrigger.click()
    await menu.locator('[data-model-id="qa-a"] .image-model-picker-choice').click()
    await page.screenshot({ path: path.join(output, 'fullscreen.png') })
    await panel.getByRole('button', { name: '关闭放大操作区', exact: true }).click()
    await page.evaluate(() => document.exitFullscreen())
    // Switching the board must release the modal and its focus trap.
    await expand.click()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas:board-changed')))
    assert.equal(await dialog.count(), 0)
    await page.evaluate(() => selectCanvasNode(qaNode))
    await expand.click(); await page.evaluate(() => qaNode.remove())
    await page.waitForTimeout(50)
    assert.equal(await page.locator('.flora-generator-expanded-dialog[open]').count(), 0, '删除节点释放对话框')
    // Every shared composer receives the same entry and removes native resize.
    for (const kind of ['text', 'llm', 'minimax-h3', 'video-api', 'audio-generator', 'comfy']) {
      await page.evaluate(kind => {
        const point = { x: 3000, y: 80 }
        window.qaCandidate = ({ text: addCanvasText, llm: addCanvasLlmNode, 'minimax-h3': addCanvasMinimaxH3Node, 'video-api': addCanvasApiVideoNode, 'audio-generator': addCanvasAudioGeneratorNode, comfy: addCanvasComfyNode })[kind](point, { focus: false })
        qaCandidate.dataset.qaKind = kind
        canvasState.x = 400 - 3000; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaCandidate)
      }, kind)
      const candidate = page.locator(`[data-qa-kind="${kind}"]`), candidatePanel = candidate.locator('.flora-generator-composer')
      await candidatePanel.getByRole('button', { name: '放大操作区', exact: true }).click()
      const candidateDialog = candidate.locator('.flora-generator-expanded-dialog[open]')
      assert.equal(await candidateDialog.count(), 1, `${kind}共享放大入口`)
      for (const textarea of await candidatePanel.locator('textarea').all()) assert.equal(await textarea.evaluate(el => getComputedStyle(el).resize), 'none')
      await candidatePanel.getByRole('button', { name: '关闭放大操作区', exact: true }).click()
      await page.evaluate(() => qaCandidate.remove())
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, widths, scales, screenshots: 49, sharedKinds: 7, errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
