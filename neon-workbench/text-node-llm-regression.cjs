const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    page.setDefaultTimeout(15000)
    const errors = [], chatRequests = []
    const models = Array.from({ length: 16 }, (_, index) => ({
      id: index === 0 ? 'qa-chat' : index === 1 ? 'qa-chat-model' : `qa-model-${index}`,
      modelId: index === 0 ? 'deepseek-v4' : index === 15 ? '文字模型长名称-用于检查菜单完整显示' : `测试文字模型-${index}`,
      providerId: index < 8 ? 'provider-one' : 'provider-two', providerName: index < 8 ? '测试站点一' : '测试站点二',
      capabilities: ['llm.chat', 'llm.chat.vision'], state: 'online',
    }))
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }) }))
    await page.route('**/api/vision-models', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ models }) }))
    await page.route('**/api/chat', r => {
      chatRequests.push(r.request().postDataJSON())
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '模型回答：你好' } }] }) })
    })
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'image-model-picker.js', 'neon-canvas-surface.css', 'flora-node-shell.js', 'flora-node-shell.css', 'flora-generator-composer.js', 'flora-generator-parameters.js', 'flora-generation-history.js', 'flora-generation-history.css', 'canvas-audio-generator.js', 'canvas-text-node-renderer.js']) {
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
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-text'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadVisionModels()
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-text-llm'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaText = addCanvasText({ x: 100, y: 40 }, { focus: false })
      setCanvasTextValue(qaText, '## 测试标题\n\n拖动文字节点')
      canvasState.scale = 1; canvasState.x = 160; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaText)
    })
    await page.waitForTimeout(500)
    // The canvas menus exist once the editor screen is shown.
    const menu = await page.evaluate(() => ({
      create: Boolean(document.querySelector('[data-canvas-node="llm"]')),
      connect: Boolean(document.querySelector('[data-connect-node="llm"]')),
      text: Boolean(document.querySelector('[data-canvas-node="text"]')),
    }))
    assert.equal(menu.create, false, '创建菜单不再提供 LLM 节点')
    assert.equal(menu.connect, false, '连接菜单不再提供 LLM')
    assert.equal(menu.text, true, '文字节点入口保留')
    const menuLabels = await page.evaluate(() => {
      const menu = document.querySelector('#canvasNodeMenu')
      return {
        text: menu?.querySelector('[data-canvas-node="text"] span:last-child')?.textContent?.trim() || '',
        loop: Boolean(menu?.querySelector('[data-canvas-node="loop"]')),
        assetCollection: Boolean(menu?.querySelector('[data-canvas-node="asset-collection"]')),
        groups: Array.from(menu?.querySelectorAll('.canvas-menu-group-label') || []).map(item => item.textContent.trim()),
      }
    })
    assert.equal(menuLabels.text, '文本', `文字节点入口文案改为「文本」：${menuLabels.text}`)
    assert.equal(menuLabels.loop, false, '添加节点菜单不再提供循环批处理')
    assert.equal(menuLabels.assetCollection, false, '添加节点菜单不再提供素材合集')
    assert.deepEqual(menuLabels.groups, ['添加节点', '生成节点', '添加资源'], `菜单分组只剩三组：${JSON.stringify(menuLabels.groups)}`)
    const node = page.locator('#canvasPlane .canvas-node-text')
    const panel = node.locator('.flora-generator-composer')
    await panel.waitFor({ state: 'visible' })
    // The editable surface stays, and the model controls moved underneath it.
    assert.equal(await node.locator('.canvas-text').count(), 1, '文字节点保留可编辑文本区')
    for (const [selector, label] of [['.canvas-llm-prompt', '指令输入'], ['.canvas-llm-model', '模型选择'], ['.canvas-llm-run', '生成按钮'], ['.canvas-llm-images', '参考素材区']]) {
      assert.equal(await panel.locator(selector).count(), 1, `操作区包含${label}`)
    }
    // The floating action pill must stay out of the way: the run button belongs
    // to the composer, and a text node is edited by clicking it.
    const floating = await page.evaluate(() => {
      const bar = qaText.querySelector('.flora-node-actions')
      return {
        exists: Boolean(bar),
        children: bar ? bar.children.length : 0,
        runInBar: Boolean(bar?.querySelector('.canvas-node-run, .canvas-llm-run')),
        hidden: bar ? getComputedStyle(bar).display === 'none' : true,
      }
    })
    assert.equal(floating.runInBar, false, '运行按钮不再落在节点浮动操作栏')
    assert.equal(floating.children, 0, '文字节点浮动操作栏没有多余按钮')
    assert.equal(floating.hidden, true, '空操作栏不渲染成空胶囊')

    // Clicking anywhere on the node, including its text, must reveal the panel.
    await page.evaluate(() => clearCanvasSelection())
    await page.waitForTimeout(200)
    assert.equal(await panel.isVisible(), false, '取消选中后操作区收起')
    await node.locator('.canvas-text').click({ position: { x: 60, y: 70 } })
    await panel.waitFor({ state: 'visible', timeout: 3000 })
    assert.equal(await page.evaluate(() => canvasState.activeNode === qaText), true, '点击文字即可选中该节点')
    assert.equal(await node.locator('.canvas-text').getAttribute('contenteditable'), 'false', '单击只选中，不进入文字编辑')
    assert.equal(await node.locator('[aria-label="打开文字工具"]').count(), 0, '工具栏移除文字工具入口')
    assert.equal(await panel.getByText('可上传图片，或连接图片节点作为视觉输入').count(), 0, '参考区去掉常驻说明')
    const beforeDrag = await page.evaluate(() => ({ x: Number(qaText.dataset.x), y: Number(qaText.dataset.y) }))
    const textBox = await node.locator('.canvas-text').boundingBox()
    await page.mouse.move(textBox.x + 60, textBox.y + 70)
    await page.mouse.down()
    await page.mouse.move(textBox.x + 125, textBox.y + 105, { steps: 8 })
    await page.mouse.up()
    const afterDrag = await page.evaluate(() => ({ x: Number(qaText.dataset.x), y: Number(qaText.dataset.y) }))
    assert.ok(afterDrag.x > beforeDrag.x + 50 && afterDrag.y > beforeDrag.y + 20, '文字主体按住可以移动节点')
    assert.equal(await node.locator('.canvas-text').getAttribute('contenteditable'), 'false', '拖动后仍为预览')
    await node.locator('.canvas-text').dblclick({ position: { x: 60, y: 70 } })
    await page.waitForFunction(() => qaText.querySelector('.canvas-text').contentEditable === 'true')
    await page.keyboard.insertText('双击编辑后的内容')
    const editingBox = await node.locator('.canvas-text').boundingBox()
    const editingPosition = await page.evaluate(() => ({ x: qaText.dataset.x, y: qaText.dataset.y }))
    await page.mouse.move(editingBox.x + 15, editingBox.y + 15)
    await page.mouse.down()
    await page.mouse.move(editingBox.x + 180, editingBox.y + 15, { steps: 5 })
    await page.mouse.up()
    assert.deepEqual(await page.evaluate(() => ({ x: qaText.dataset.x, y: qaText.dataset.y })), editingPosition, '编辑时选择文字不会拖动节点')
    await page.keyboard.press('Escape')
    assert.ok((await page.evaluate(() => getCanvasTextValue(qaText))).includes('双击编辑后的内容'), '双击编辑提交文字')

    const modelTrigger = panel.locator('.image-model-picker-trigger')
    assert.equal(await modelTrigger.count(), 1, '文字模型复用 Flora 模型浮层入口')
    assert.equal(await panel.locator('.canvas-llm-model').isVisible(), false, '不再显示受节点裁切的原生模型菜单')
    const modelPopup = page.getByRole('dialog', { name: '选择文字模型', exact: true })
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 })
      await page.evaluate(() => {
        qaText.dataset.x = '0'; qaText.dataset.y = '40'; updateCanvasNodePosition(qaText)
        canvasState.x = 16; canvasState.y = 0; canvasState.scale = 0.7; applyCanvasTransformNow()
      })
      await modelTrigger.click()
      await modelPopup.waitFor({ state: 'visible' })
      await modelPopup.getByRole('searchbox').fill('')
      const popupBox = await modelPopup.boundingBox()
      assert.ok(popupBox.x >= 15 && popupBox.x + popupBox.width <= width - 15 && popupBox.y >= 15 && popupBox.y + popupBox.height <= 945, `${width}px 模型列表完整位于视口内`)
      assert.equal(await modelPopup.locator('.image-model-provider-group').count(), 2, '文字模型按真实服务商分组')
      const choice = modelPopup.locator('[data-model-id="qa-chat"] .image-model-picker-choice')
      const isTop = await choice.evaluate(el => {
        const rect = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      })
      assert.equal(isTop, true, `${width}px 模型选项未被操作区遮挡`)
      await page.screenshot({ path: path.join(__dirname, `acceptance/text-node-model-list-${width}.png`) })
      await modelPopup.getByRole('searchbox').fill('长名称')
      const longChoice = modelPopup.locator('[data-model-id="qa-model-15"] .image-model-picker-choice')
      await longChoice.click()
      assert.equal(await panel.locator('.canvas-llm-model').inputValue(), 'qa-model-15', '真实菜单选择写回原 select')
      await modelTrigger.click()
      await modelPopup.getByRole('searchbox').fill('deepseek')
      await modelPopup.locator('[data-model-id="qa-chat"] .image-model-picker-choice').focus()
      await page.keyboard.press('Enter')
      assert.equal(await panel.locator('.canvas-llm-model').inputValue(), 'qa-chat', '键盘选择能写回真实模型')
      await modelTrigger.click()
      await page.keyboard.press('Escape')
      assert.equal(await modelPopup.isVisible(), false, 'Escape 关闭菜单')
      assert.equal(await modelTrigger.evaluate(el => document.activeElement === el), true, '关闭菜单后焦点回到入口')
      await modelTrigger.hover()
      await page.screenshot({ path: path.join(__dirname, `acceptance/text-node-interaction-${width}.png`) })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}px 无页面横向溢出`)
    }
    await page.setViewportSize({ width: 1440, height: 1050 })
    await page.evaluate(() => {
      canvasState.scale = 1; canvasState.x = 160; canvasState.y = 0; applyCanvasTransformNow()
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => document.activeElement?.blur())
    await page.mouse.move(1400, 1000)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/text-node-default.png') })
    await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen())
    await page.waitForFunction(() => Boolean(document.fullscreenElement))
    await modelTrigger.click()
    await modelPopup.waitFor({ state: 'visible' })
    assert.equal(await modelPopup.evaluate(el => document.fullscreenElement.contains(el)), true, '模型浮层位于全屏容器内')
    await page.screenshot({ path: path.join(__dirname, 'acceptance/text-node-model-fullscreen.png') })
    await page.keyboard.press('Escape')
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => !document.fullscreenElement)

    const panelBelow = await page.evaluate(() => {
      const body = qaText.querySelector('.flora-node-shell').getBoundingClientRect()
      const box = qaText.querySelector('.flora-generator-composer').getBoundingClientRect()
      return Math.round(box.top - body.bottom)
    })
    assert.ok(panelBelow >= 12 && panelBelow <= 20, `操作区在节点下方（间距 ${panelBelow}px）`)

    // Running with no instruction uses the node's own text as the message.
    // The harness serves an empty model catalog, so give the picker one entry.
    await page.evaluate(() => {
      const select = qaText.querySelector('.canvas-llm-model')
      select.innerHTML = '<option value="qa-chat">测试文本模型</option>'
      select.value = 'qa-chat'
      select.dataset.catalogUnavailable = 'false'
    })
    await page.evaluate(() => setCanvasTextValue(qaText, '请写一句问候'))
    await page.waitForTimeout(120)
    await panel.locator('.canvas-llm-run').click()
    await page.waitForFunction(() => getCanvasTextValue(qaText).includes('模型回答'))
    assert.equal(chatRequests.length, 1, '只调用一次对话接口')
    const sent = JSON.stringify(chatRequests[0])
    assert.ok(sent.includes('请写一句问候'), '节点自身文本作为提问发出')
    const history = await page.evaluate(() => serializeCanvasNode(qaText).generationHistory)
    assert.equal(history.length, 2, '运行前的文本与结果都进入历史')
    assert.equal(history[0].text, '请写一句问候', '历史保留运行前的文本')
    assert.equal(history[1].text, '模型回答：你好', '历史记录模型结果')
    // Switching history rewrites the editable text.
    const firstHistoryId = await page.evaluate(() => serializeCanvasNode(qaText).generationHistory[0].id)
    await node.locator('.flora-generation-history-badge').click()
    await page.locator(`.flora-generation-history-choice[data-history-id="${firstHistoryId}"]`).click()
    await page.waitForTimeout(200)
    await page.locator('.flora-generation-history-panel .flora-generation-history-header button[aria-label="关闭生成历史"]').click()
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => getCanvasTextValue(qaText)), '请写一句问候', '选择历史能回到上一版文本')
    // Serialization carries the composer state, and restore brings it back.
    await page.evaluate(() => {
      // Drive the real controls, which is what the serializer reads.
      const promptBox = qaText.querySelector('.canvas-llm-prompt')
      promptBox.value = '把语气改正式'
      promptBox.dispatchEvent(new Event('input', { bubbles: true }))
      const select = qaText.querySelector('.canvas-llm-model')
      select.innerHTML = '<option value="qa-chat-model">qa-chat-model</option>'
      select.value = 'qa-chat-model'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      qaText.dataset.llmImages = JSON.stringify([{ url: '/output/ref.png', name: 'ref.png' }])
      scheduleCanvasSave()
    })
    const saved = await page.evaluate(() => serializeCanvasNode(qaText))
    assert.equal(saved.kind, 'text', '节点类型仍是文字节点')
    assert.equal(saved.llmPrompt, '把语气改正式', '指令随节点保存')
    assert.equal(saved.llmModel, 'qa-chat-model', '模型随节点保存')
    assert.equal(saved.llmImages.length, 1, '参考图随节点保存')
    await page.evaluate(savedItem => {
      unmountCanvasVirtualNode(qaText.dataset.id, qaText)
      window.qaRestored = restoreCanvasBoardNode({ ...savedItem, id: 'qa-text-restored' }, {}, { maxId: 0 })
      qaRestored.dataset.qaRestored = 'text'
      selectCanvasNode(qaRestored)
    }, saved)
    await page.waitForTimeout(400)
    const restored = page.locator('[data-qa-restored=text]')
    assert.equal(await restored.locator('.canvas-llm-prompt').inputValue(), '把语气改正式', '恢复后指令保留')
    assert.equal(await restored.locator('.canvas-llm-model').inputValue(), 'qa-chat-model', '恢复后模型保留')
    assert.equal(await restored.locator('.canvas-llm-images .canvas-llm-thumb').count(), 1, '恢复后参考图保留')
    assert.ok((await restored.locator('.canvas-text').innerText()).includes('请写一句问候'), '恢复后文本内容保留')
    assert.equal(await restored.locator('.flora-generator-composer').isVisible(), true, '恢复后操作区仍可用')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(__dirname, 'acceptance/text-node-llm.png') })
    console.log(JSON.stringify({ ok: true, checks: 75, widths: [390, 768, 1440, 1728] }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
