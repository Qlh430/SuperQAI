const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = [], records = [], states = []
    let uploadFail = false, uploads = 0, comfyFail = false, comfyRelease = null
    const comfyRequests = []
    const qaModelCatalogFixture = [
      { id: 'qa-station-a-gpt2', modelId: 'gpt-image-2', providerId: 'qa-station-a', providerName: '测试中转站 A', capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2', '4'], state: 'online', family: 'gpt-image-2' },
      { id: 'qa-station-a-gemini', modelId: 'gemini-3-pro-image-preview', providerId: 'qa-station-a', providerName: '测试中转站 A', capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2', '4'], state: 'online', family: 'gemini-3-pro-image' },
      { id: 'qa-station-b-gpt2', modelId: 'gpt-image-2', providerId: 'qa-station-b', providerName: '测试中转站 B', capabilities: ['image.generate'], resolutions: ['1', '2'], state: 'online', family: 'gpt-image-2' },
      { id: 'qa-station-b-gpt1', modelId: 'gpt-image-1', providerId: 'qa-station-b', providerName: '测试中转站 B', capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2', '4'], state: 'online', family: 'gpt-image-1' },
    ]
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} }) }))
    await page.route('**/api/image-models*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ models: qaModelCatalogFixture, candidates: [], revision: 1, instanceId: 'qa-isolated-models' }) }))
    const referenceImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
    await page.route('**/api/flux2-klein-edit', async route => {
      comfyRequests.push(route.request().postDataJSON())
      if (!comfyFail) await new Promise(resolve => { comfyRelease = resolve })
      await route.fulfill({ status: comfyFail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(comfyFail ? { error: 'ComfyUI测试服务暂不可用' } : { task_id: 'qa-comfy-task' }) })
    })
    await page.route('**/api/upscale/status*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', images: [referenceImage], progress: 100 }) }))
    await page.route('**/api/upload-image', route => {
      uploads++
      return route.fulfill({ status: uploadFail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(uploadFail ? { error: '上传测试接口暂不可用' } : { url: referenceImage }) })
    })
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'flora-generator-composer.js', 'flora-generator-parameters.js', 'image-model-picker.js', 'flora-node-shell.js', 'flora-node-shell.css']) {
        const sourceName = name === 'script.js' ? 'script-before-save-bridge.js' : name
        await page.route(`**/${name}*`, route => route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, sourceName), 'utf8') }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3188'}/`, { waitUntil: 'domcontentloaded' })
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['flora-generator-parameters.js', 'flora-generator-composer.js']) {
        const globalName = name === 'flora-generator-parameters.js' ? 'FloraGeneratorParameters' : 'FloraGeneratorComposer'
        if (fs.existsSync(path.join(process.env.GENERATOR_SOURCE, name)) && !(await page.evaluate(key => Boolean(window[key]), globalName))) await page.addScriptTag({ path: path.join(process.env.GENERATOR_SOURCE, name) })
      }
    }
    await page.evaluate(async (qaModelCatalogFixture) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-asset-collection'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-isolated-board'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'
      document.body.append(surface)
      const view = document.querySelector('#canvasView'); surface.append(view)
      view.style.flex = '1'; view.style.minHeight = '0'; view.style.width = '100%'
      view.hidden = false; view.classList.add('active'); document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      window.qaRuns = []
      window.qaModelCatalog = qaModelCatalogFixture
      imageModelCatalog = qaModelCatalog
      imageModelInput.replaceChildren(...qaModelCatalog.map(model => { const option = document.createElement('option'); option.value = model.id; option.textContent = `${model.modelId} · ${model.providerName}`; return option }))
      qaModelCatalog.forEach(model => { IMAGE_MODEL_PLATFORMS[model.id] = model.id.includes('gemini') ? 'google' : 'openai'; IMAGE_MODEL_FAMILIES[model.id] = model.family })
      imageModelInput.value = qaModelCatalog[0].id
      runCanvasImageEdit = async node => {
        qaRuns.push({ id: node.dataset.id, prompt: node.querySelector('.canvas-node-prompt').value })
        if (window.qaFail) { setCanvasNodeStatus(node, '生成失败：测试接口暂不可用'); return }
        const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#202323"/><circle cx="200" cy="200" r="100" fill="#b8ddba"/></svg>')
        updateCanvasGenerationResult(node, { src: image }); setCanvasNodeStatus(node, '完成')
      }
      const first = addCanvasImageGeneratorNode({ x: 120, y: 60 }); first.dataset.qaGenerator = 'first'
      window.qaInitialGenerator = serializeCanvasNode(first)
      const second = addCanvasImageGeneratorNode({ x: 720, y: 60 }); second.dataset.qaGenerator = 'second'
      showCanvasEditor(); clearCanvasSelection()
      canvasState.scale = 1; canvasState.x = 0; canvasState.y = 0; applyCanvasTransformNow()
    }, qaModelCatalogFixture)
    const first = page.locator('[data-qa-generator=first]'), second = page.locator('[data-qa-generator=second]')
    const panel = first.locator('.flora-generator-composer')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    const captureScript = fs.readFileSync(path.join(__dirname, 'design-audits/audio-spacing-capture.js'), 'utf8')
    async function captureState(name) {
      states.push(await page.evaluate(({ captureScript, name }) => {
        document.querySelectorAll('[data-qa-generator=first], [data-qa-generator=first] *').forEach((element, index) => element.setAttribute('data-bd-inspect-id', `qa-generator-${index}`))
        document.querySelectorAll('.flora-generator-model-popover:not([hidden]), .flora-generator-model-popover:not([hidden]) *').forEach((element, index) => element.setAttribute('data-bd-inspect-id', `qa-generator-popup-${index}`))
        const __name = fn => fn
        const snapshot = eval(captureScript)
        snapshot.elements = snapshot.elements.filter(element => element.selector?.startsWith('qa-generator-'))
        snapshot.name = name
        return snapshot
      }, { captureScript, name }))
    }
    async function arrange(width) {
      await page.setViewportSize({ width, height: 960 })
      await page.evaluate(width => {
        // Earlier scrollIntoView/focus probes can scroll overflow:hidden
        // ancestors. Reset that fixture scroll before a new viewport case.
        for (const element of document.querySelectorAll('#canvasView, #canvasEditorScreen, .canvas-workspace, #infiniteCanvas')) { element.scrollLeft = 0; element.scrollTop = 0 }
        const node = document.querySelector('[data-qa-generator=first]'), zoom = width === 390 ? 0.65 : 1
        canvasState.scale = zoom; canvasState.x = -Number(node.dataset.x) * zoom + (width - 400 * zoom) / 2; canvasState.y = -Number(node.dataset.y) * zoom + 80
        applyCanvasTransformNow(); selectCanvasNode(node)
        const rect = node.getBoundingClientRect(); canvasState.x += (width - rect.width) / 2 - rect.left; applyCanvasTransformNow()
        setCanvasStatus('')
      }, width)
      await page.waitForTimeout(150)
    }
    if (process.env.GENERATOR_BASELINE) {
      for (const width of [390, 768, 1440, 1728]) {
        await arrange(width)
        await page.screenshot({ path: path.join(__dirname, `acceptance/generator-minimal-before-${width}.png`) })
      }
      console.log('已保存同一生成节点的四宽度修改前截图')
      return
    }
    assert.equal(await panel.count(), 1, '生成节点应有独立下方操作区')
    await assert.rejects(panel.waitFor({ state: 'visible', timeout: 150 }), '未选中时不显示操作区')
    await first.locator('.flora-node-card').click({ force: true })
    await panel.waitFor({ state: 'visible' })
    await panel.locator('.flora-generation-mode').waitFor({ state: 'visible' })
    assert.deepEqual(await panel.locator('.flora-generation-mode option').allTextContents(), ['API生成', 'ComfyUI生成'], '生成方式下拉选项使用明确名称')
    assert.equal(await panel.locator('.canvas-engine-caption').isVisible(), false, '不显示引擎文字')
    await panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])').waitFor({ state: 'visible', timeout: 1000 })
    assert.equal(await first.locator('.canvas-node-size').isVisible(), false, '尺寸原控件由组合入口代替')
    assert.equal(await panel.locator('.flora-generator-add-reference').innerText(), '', '参考图入口只显示图标')
    const row = await panel.evaluate(element => {
      const box = selector => { const rect = element.querySelector(selector).getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom } }
      return { refs: box('.flora-generator-reference-area'), prompt: box('.flora-generator-prompt-area'), footer: box('.flora-generator-footer'), mode: box('.flora-generation-mode'), run: box('.canvas-node-run') }
    })
    assert.ok(row.refs.bottom <= row.prompt.top && row.prompt.bottom <= row.footer.top, '参考素材、提示词和参数依次排布')
    assert.ok(Math.abs((row.mode.top + row.mode.bottom - row.run.top - row.run.bottom) / 2) <= 2, '桌面参数与生成按钮在同一排')
    await promptForEngineSwitch()
    const modelTrigger = panel.locator('.image-model-picker-trigger')
    const modelPopup = page.locator('.flora-generator-model-popover:not([hidden])')
    await modelTrigger.click()
    await modelPopup.waitFor({ state: 'visible' })
    assert.equal(await modelPopup.locator('.image-model-provider-heading').count(), 2, '模型按中转站分组')
    assert.match(await modelPopup.innerText(), /测试中转站 A/)
    assert.match(await modelPopup.innerText(), /测试中转站 B/)
    assert.equal(await modelPopup.locator('.image-model-picker-choice small, .flora-model-option-check').count(), 0, '模型列表没有说明和选中勾标')
    await modelPopup.locator('[data-provider-id="qa-station-b"] [data-model-id="qa-station-b-gpt2"] .image-model-picker-choice').click()
    assert.equal(await first.locator('.canvas-node-model').inputValue(), 'qa-station-b-gpt2', '同名模型选择仍保留真实中转站ID')
    assert.equal(await modelTrigger.evaluate(element => document.activeElement === element), true, '选模型后焦点返回')
    assert.equal((await first.evaluate(node => serializeCanvasNode(node))).model, 'qa-station-b-gpt2')
    await modelTrigger.press('Enter')
    await page.waitForTimeout(50)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/model-picker-selected-focus-1440.png') })
    await modelPopup.locator('[aria-selected="true"] .image-model-picker-choice').hover()
    await page.screenshot({ path: path.join(__dirname, 'acceptance/model-picker-selected-hover-1440.png') })
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
    assert.equal(await first.locator('.canvas-node-model').inputValue(), 'qa-station-a-gpt2', '模型列表支持方向键与Enter选择')
    await modelTrigger.click()
    await modelPopup.locator('[data-provider-id="qa-station-a"] .image-model-provider-heading').click()
    await page.keyboard.press('Escape')
    await modelTrigger.press('Enter')
    await page.waitForTimeout(50)
    assert.equal(await modelPopup.locator('.image-model-picker-auto').evaluate(element => document.activeElement === element), true, '选中模型位于折叠分组时焦点回到可见选项')
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
    assert.equal(await first.locator('.canvas-node-model').inputValue(), 'qa-station-b-gpt2', '方向键跳过折叠分组内的隐藏模型')
    await modelTrigger.evaluate(element => { const rect = element.getBoundingClientRect(); element.style.transform = `translateY(${innerHeight - 52 - rect.top}px)` })
    await modelTrigger.click()
    await modelPopup.locator('[data-provider-id="qa-station-b"] .image-model-provider-heading').click()
    await page.keyboard.press('Escape')
    await modelTrigger.click()
    await modelPopup.locator('[data-provider-id="qa-station-a"] .image-model-provider-heading').click()
    await modelPopup.locator('[data-provider-id="qa-station-b"] .image-model-provider-heading').click()
    const expandedBounds = await modelPopup.boundingBox()
    assert.ok(expandedBounds.y >= 16 && expandedBounds.y + expandedBounds.height <= 1050 - 16 + 1, '靠近底边展开中转站分组后重新定位，浮层不超出视口')
    await modelPopup.locator('[data-provider-id="qa-station-a"] [data-model-id="qa-station-a-gpt2"] .image-model-picker-choice').click()
    await modelTrigger.evaluate(element => { element.style.transform = '' })
    const parameterTrigger = panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])')
    const parameterPopup = first.locator('.flora-generator-parameter-popover:not(.flora-midjourney-settings-popover)')
    await parameterTrigger.click()
    await parameterPopup.waitFor({ state: 'visible' })
    await parameterPopup.locator('[data-param-kind=size][data-param-value="16:9"]').click()
    await parameterPopup.locator('[data-param-kind=resolution][data-param-value="2"]').click()
    const popupSaved = await first.evaluate(node => serializeCanvasNode(node))
    assert.equal(popupSaved.size, '16:9', '比例按钮调用原保存路径')
    assert.equal(popupSaved.resolution, '2', '分辨率按钮调用原保存路径')
    assert.equal(await parameterPopup.locator('.canvas-model-options').count(), 1, '原高级参数收进参数浮层')
    const customChoice = parameterPopup.locator('[data-param-kind=size][data-param-value="custom"]')
    if (await customChoice.count()) {
      await customChoice.click()
      await parameterPopup.locator('.canvas-custom-size-field').waitFor({ state: 'visible' })
      await parameterPopup.locator('input[data-size-axis=width]').fill('1536')
      await parameterPopup.locator('input[data-size-axis=height]').fill('1024')
      assert.equal(await first.evaluate(node => getCanvasOutputSize(node)), '1536x1024', '自定义尺寸继续使用原字段和校验')
      await parameterPopup.locator('[data-param-kind=size][data-param-value="16:9"]').click()
    }
    await first.locator('.canvas-node-resolution').evaluate(select => { const option = [...select.options].find(option => option.value === '4'); if (option) { option.disabled = true; option.dataset.reason = '测试：此模型不支持当前分辨率' } })
    const disabledResolution = parameterPopup.locator('[data-param-kind=resolution][data-param-value="4"]')
    if (await disabledResolution.count()) {
      await page.waitForFunction(() => document.querySelector('[data-qa-generator=first] [data-param-kind=resolution][data-param-value="4"]').disabled)
      assert.match(await disabledResolution.getAttribute('title'), /此模型不支持/)
    }
    await page.keyboard.press('Escape')
    assert.equal(await parameterPopup.isVisible(), false, 'Escape关闭参数浮层')
    assert.equal(await parameterTrigger.evaluate(element => document.activeElement === element), true, 'Escape关闭后焦点返回')
    await parameterTrigger.click()
    await page.mouse.click(10, 940)
    assert.equal(await parameterPopup.isVisible(), false, '参数浮层支持外部点击关闭')
    await page.evaluate(() => {
      const node = document.querySelector('[data-qa-generator=first]')
      canvasImageModelPickers.get(node.querySelector('.canvas-node-model')).choose('qa-station-b-gpt1')
      const size = node.querySelector('.canvas-node-size'); size.value = '2048x2048'; size.dispatchEvent(new Event('change', { bubbles: true }))
      setCanvasNodeStatus(node, '待完成')
    })
    if (process.env.GENERATOR_LEGACY_BASELINE) {
      for (const width of [390, 768, 1440, 1728]) {
        await arrange(width); await parameterTrigger.click()
        await page.screenshot({ path: path.join(__dirname, `acceptance/generator-separated-before-${width}.png`) })
        await page.keyboard.press('Escape')
      }
      console.log('已保存旧像素预设与默认状态的四宽度修改前截图'); return
    }
    await parameterTrigger.click()
    await parameterPopup.waitFor({ state: 'visible' })
    const ratioLabels = await parameterPopup.locator('[data-param-kind=size]').allTextContents()
    assert.ok(ratioLabels.every(text => !/\dK/i.test(text)), '旧模型比例区不混入2K/4K预设')
    assert.equal(await parameterPopup.locator('[data-param-kind=size][data-param-value="1:1"]').count(), 1, '同一比例只显示一次')
    assert.equal(await parameterPopup.locator('section[aria-label="选择分辨率"]').isVisible(), true, '旧像素模型也显示独立分辨率组')
    assert.equal(await parameterPopup.locator('[data-param-kind=resolution][data-param-value="4"]').isDisabled(), true, '没有4K方图预设时禁用，不捏造请求尺寸')
    await parameterPopup.locator('[data-param-kind=resolution][data-param-value="1"]').click()
    assert.equal(await first.evaluate(node => getCanvasOutputSize(node)), '1024x1024', '1:1加1K映射到原像素请求')
    await parameterPopup.locator('[data-param-kind=resolution][data-param-value="2"]').click()
    await parameterPopup.locator('[data-param-kind=size][data-param-value="16:9"]').click()
    assert.equal((await first.evaluate(node => serializeCanvasNode(node))).size, '2048x1152', '切比例保留兼容的2K档位')
    await parameterPopup.locator('[data-param-kind=resolution][data-param-value="4"]').click()
    assert.equal(await first.evaluate(node => getCanvasOutputSize(node)), '3840x2160', '16:9加4K使用真实预设')
    await parameterPopup.locator('[data-param-kind=size][data-param-value="1:1"]').click()
    assert.equal(await first.evaluate(node => getCanvasOutputSize(node)), '1024x1024', '没有4K方图时回退到可用预设')
    await parameterPopup.locator('[data-param-kind=size][data-param-value="custom"]').click()
    await parameterPopup.locator('.canvas-custom-size-field').waitFor({ state: 'visible' })
    await parameterPopup.locator('input[data-size-axis=width]').fill('1536')
    await parameterPopup.locator('input[data-size-axis=height]').fill('1024')
    assert.equal(await first.evaluate(node => getCanvasOutputSize(node)), '1536x1024', '拆分后自定义宽高继续走原请求路径')
    await parameterPopup.locator('[data-param-kind=size][data-param-value="1:1"]').click()
    await parameterPopup.locator('[data-param-kind=resolution][data-param-value="2"]').click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
    assert.equal(await panel.locator('.flora-generator-status').isVisible(), false, '默认待完成不占操作区')
    for (const width of [390, 768, 1440, 1728]) {
      await arrange(width); await parameterTrigger.click()
      await page.screenshot({ path: path.join(__dirname, `acceptance/generator-separated-after-${width}.png`) })
      await captureState(`legacy-parameters-${width}`)
      await page.keyboard.press('Escape')
    }
    await page.evaluate(() => {
      const node = document.querySelector('[data-qa-generator=first]')
      canvasImageModelPickers.get(node.querySelector('.canvas-node-model')).choose('qa-station-a-gpt2')
      setCanvasNodeStatus(node, '正在生成图片…')
    })
    await page.waitForTimeout(50)
    assert.equal(await panel.locator('.flora-generator-status').isVisible(), false, '生成中不再占用状态行')
    await page.evaluate(() => setCanvasNodeStatus(document.querySelector('[data-qa-generator=first]'), ''))
    await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=first]')))
    await modelTrigger.click()
    await modelPopup.locator('[data-provider-id="qa-station-a"] [data-model-id="qa-station-a-gpt2"] .image-model-picker-choice').click()
    await modelTrigger.click()
    await page.evaluate(() => clearCanvasSelection())
    assert.equal(await modelPopup.count(), 0, '取消选中清理模型浮层')
    await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=first]')))
    async function promptForEngineSwitch() {
      await first.locator('.canvas-node-prompt').fill('引擎切换保留的提示词')
      await panel.locator('.flora-generation-mode').selectOption('comfyui')
      await page.waitForFunction(() => document.querySelector('[data-qa-generator=first]').dataset.canvasEngine === 'comfyui', null, { timeout: 3000 }).catch(async error => {
        console.error({ errors, node: await first.evaluate(node => ({ classes: node.className, dataset: { ...node.dataset }, switch: node.querySelector('.canvas-engine-switch')?.outerHTML, content: node.textContent.slice(0, 400) })) })
        throw error
      })
      assert.equal(await panel.isVisible(), true, 'ComfyUI与API共用下方操作区，不回退旧节点布局')
      assert.equal(await panel.locator('.flora-generator-add-reference').isVisible(), true)
      assert.equal(await panel.locator('.canvas-node-prompt').inputValue(), '引擎切换保留的提示词')
      await panel.locator('.canvas-node-run').click()
      await panel.getByText('请连接一张图片', { exact: true }).waitFor()
      assert.equal((await first.evaluate(node => serializeCanvasNode(node))).kind, 'comfy', '共用视觉壳体不改变实际执行类型')
      assert.equal((await first.evaluate(node => serializeCanvasNode(node))).comfyPrompt, '引擎切换保留的提示词', 'API草稿无需再次输入即可参与ComfyUI编辑请求')
      const workflow = panel.locator('.canvas-comfy-mode')
      assert.equal(await workflow.locator('option').count(), 8, '工作流列表不会被API模型目录覆盖')
      assert.equal(await panel.locator('.canvas-node-prompt').getAttribute('readonly'), '', '不支持提示词的工作流明确保留只读输入')
      await workflow.selectOption('flux2-klein-edit')
      await panel.locator('.canvas-node-prompt').fill('ComfyUI编辑提示词')
      assert.equal((await first.evaluate(node => serializeCanvasNode(node))).comfyPrompt, 'ComfyUI编辑提示词', '提示词保存到真实ComfyUI节点状态')
      await workflow.selectOption('upscale2')
      await panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])').click()
      const comfyParameters = first.locator('.flora-generator-parameter-popover:not(.flora-midjourney-settings-popover)')
      await comfyParameters.locator('[data-param-kind=resolution][data-param-value="4096"]').click()
      assert.equal((await first.evaluate(node => serializeCanvasNode(node))).comfyResolution, '4096')
      await comfyParameters.locator('.flora-generator-parameter-close').click()
      await workflow.selectOption('outpaint')
      await panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])').click()
      assert.equal(await comfyParameters.locator('.canvas-comfy-outpaint').isVisible(), true, '扩图参数仍可使用')
      await comfyParameters.locator('.flora-generator-parameter-close').click()
      await workflow.selectOption('qwen-edit-angle')
      await panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])').click()
      assert.equal(await comfyParameters.locator('.canvas-comfy-qwen-angle').isVisible(), true, '角度参数仍可使用')
      await comfyParameters.locator('.flora-generator-parameter-close').click()
      await workflow.selectOption('upscale2')
      for (const width of [390, 768, 1440, 1728]) {
        await arrange(width)
        await page.screenshot({ path: path.join(__dirname, `acceptance/comfy-shared-composer-${width}.png`) })
        const box = await panel.boundingBox()
        assert.ok(box.x >= 15 && box.x + box.width <= width - 15, 'ComfyUI操作区在四宽度内保持可见')
      }
      await arrange(1440)
      await panel.locator('.canvas-comfy-mode').hover()
      await page.screenshot({ path: path.join(__dirname, 'acceptance/comfy-shared-hover.png') })
      await panel.locator('.canvas-comfy-mode').focus()
      await page.screenshot({ path: path.join(__dirname, 'acceptance/comfy-shared-focus.png') })
      await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen())
      await panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])').click()
      await page.screenshot({ path: path.join(__dirname, 'acceptance/comfy-shared-fullscreen.png') })
      await comfyParameters.locator('.flora-generator-parameter-close').click()
      await page.evaluate(() => document.exitFullscreen())
      await page.evaluate(() => clearCanvasSelection())
      assert.equal(await panel.isVisible(), false, 'ComfyUI取消选中时收起同一操作区')
      await page.screenshot({ path: path.join(__dirname, 'acceptance/comfy-shared-default.png') })
      await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=first]')))
      await panel.locator('.flora-generation-mode').selectOption('api')
      await panel.waitFor({ state: 'visible' })
      assert.equal(await first.locator('.canvas-node-prompt').inputValue(), 'ComfyUI编辑提示词')
      assert.equal(await panel.count(), 1, '返回API不重复操作区')
      await arrange(1440)
    }
    const shellBox = await first.locator('.flora-node-shell').boundingBox(), panelBox = await panel.boundingBox()
    assert.ok(panelBox.y >= shellBox.y + shellBox.height + 12, '操作区应位于节点正下方')
    assert.ok(panelBox.width > shellBox.width, '桌面操作区应比预览节点宽')
    const prompt = first.locator('.canvas-node-prompt')
    const before = await first.evaluate(element => ({ x: element.dataset.x, y: element.dataset.y }))
    await prompt.fill('第一张图片的提示词')
    await prompt.click(); await prompt.press('Control+A')
    assert.deepEqual(await first.evaluate(element => ({ x: element.dataset.x, y: element.dataset.y })), before, '操作输入不移动节点')
    await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=second]')))
    await second.locator('.flora-generator-composer').waitFor({ state: 'visible' })
    assert.equal(await panel.isVisible(), false)
    await second.locator('.canvas-node-prompt').fill('第二张图片的提示词')
    await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=first]')))
    assert.equal(await prompt.inputValue(), '第一张图片的提示词')
    const parameters = await first.evaluate(node => {
      const size = node.querySelector('.canvas-node-size'), model = node.querySelector('.canvas-node-model')
      const option = [...size.options].find(option => option.value !== size.value && option.value !== 'custom')
      if (!option) throw new Error('宿主未提供尺寸选项')
      size.value = option.value; size.dispatchEvent(new Event('change', { bubbles: true }))
      return { size: size.value, model: model.value }
    })
    const saved = await first.evaluate(node => serializeCanvasNode(node))
    assert.equal(saved.prompt, '第一张图片的提示词', '提示词仍通过宿主序列化保存')
    assert.equal(saved.size, parameters.size, '真实尺寸控件仍能保存')
    assert.equal(saved.model, parameters.model)
    await page.evaluate(() => {
      canvasState.scale = 0.75; canvasState.x += 40; canvasState.y -= 24; applyCanvasTransformNow()
    })
    await page.waitForTimeout(100)
    const transformedBody = await first.locator('.flora-node-shell').boundingBox(), transformedPanel = await panel.boundingBox()
    // 面板屏幕宽度必须等于宿主设定的 --flora-composer-width（反向缩放后应保持稳定）。
    const configuredPanelWidth = await first.evaluate(node => Number.parseFloat(node.style.getPropertyValue('--flora-composer-width')) || 0)
    assert.ok(configuredPanelWidth > 0 && Math.abs(transformedPanel.width - configuredPanelWidth) < 2,
      `无需重选，缩放后控件保持屏幕尺寸（期望 ${configuredPanelWidth}）`)
    assert.ok(Math.abs(transformedPanel.y - transformedBody.y - transformedBody.height - 16) < 2, '无需重选，平移后面板保留16px间距')
    await arrange(1440)
    const hits = await first.evaluate(node => {
      return ['.canvas-port-input', '.flora-node-toolbar .flora-node-action'].map(selector => {
        // Result actions stay hidden until a result exists, so probe the first
        // action the toolbar actually renders.
        const control = selector.includes('port')
          ? node.querySelector(selector)
          : Array.from(node.querySelectorAll(selector)).find(action => action.getBoundingClientRect().width > 0)
        const rect = control.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x - (selector.includes('port') ? 7 : 4), rect.y + rect.height / 2)
        return { success: hit?.closest(selector) === control, selector, className: control.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: hit?.className, pseudo: getComputedStyle(control, '::before').content }
      })
    })
    assert.deepEqual(hits.map(hit => hit.success), [true, true], JSON.stringify(hits))
    await page.evaluate(() => { clearCanvasSelection(); selectCanvasNode(document.querySelector('[data-qa-generator=first]')) })
    assert.equal(await first.locator('.canvas-node-size').inputValue(), parameters.size)
    await first.locator('.canvas-node-run').click()
    assert.equal(await page.evaluate(() => qaRuns.length), 1, '生成只触发一次原回调')
    await first.locator('.flora-node-result-area img').waitFor({ state: 'visible' })
    assert.equal(await prompt.inputValue(), '第一张图片的提示词')
    assert.equal(await first.locator('.flora-generator-reference-area .canvas-node-result').count(), 0, '结果不能被移入参考区')
    await page.evaluate(() => { window.qaFail = true })
    await first.locator('.canvas-node-run').click()
    await first.locator('.flora-generator-composer').getByText('生成失败：测试接口暂不可用', { exact: true }).waitFor()
    assert.equal(await first.locator('.flora-generator-placeholder').isVisible(), false, '有结果时隐藏空态')
    assert.equal(await first.locator('.flora-node-toolbar [data-flora-action="result-download"]').isVisible(), true, '结果下载入口在节点工具栏')
    assert.equal(await first.locator('.canvas-result-download').isVisible(), false, '结果角落不再显示旧下载按钮')
    await first.locator('.flora-generator-reference-input').setInputFiles({ name: '参考图.png', mimeType: 'image/png', buffer: Buffer.from(referenceImage.split(',')[1], 'base64') })
    await first.locator('.flora-generator-reference-area .flora-reference-materials img').first().waitFor()
    assert.equal(await panel.locator('.flora-generator-status').isVisible(), false, '上传成功不再占用状态行')
    assert.equal(uploads, 1, '参考图走宿主上传接口一次')
    assert.equal(await first.evaluate(node => canvasState.connections.filter(connection => connection.to === node.dataset.id).length), 1, '真实素材节点连接到原生成节点')
    assert.ok(await first.locator('.flora-generator-reference-area .flora-reference-materials img').count() > 0, '参考图显示在下方')
    uploadFail = true
    await first.locator('.flora-generator-reference-input').setInputFiles({ name: '参考图失败.png', mimeType: 'image/png', buffer: Buffer.from(referenceImage.split(',')[1], 'base64') })
    await panel.getByText('参考素材上传失败：上传测试接口暂不可用', { exact: true }).waitFor()
    assert.equal(await first.locator('.flora-generator-add-reference').isEnabled(), true)
    await panel.locator('.flora-generation-mode').selectOption('comfyui')
    await panel.locator('.canvas-comfy-mode').selectOption('flux2-klein-edit')
    assert.equal(await first.locator('.flora-generator-reference-area .flora-reference-materials img').count(), 1, '切换ComfyUI保留实际参考图连接')
    await panel.locator('.canvas-node-prompt').fill('把背景改成草地')
    await first.evaluate(node => { CanvasFloraNodeShell.unmount(node); CanvasFloraNodeShell.mount(node); selectCanvasNode(node) })
    await panel.locator('.canvas-node-prompt').fill('把背景改成森林')
    assert.equal((await first.evaluate(node => serializeCanvasNode(node))).comfyPrompt, '把背景改成森林', '重装后提示词仍保存')
    await panel.locator('.canvas-node-run').click()
    await page.waitForFunction(() => document.querySelector('[data-qa-generator=first] .flora-generator-composer').getAttribute('aria-busy') === 'true')
    assert.equal(await panel.locator('.canvas-node-run').isDisabled(), true)
    await page.waitForFunction(() => document.querySelector('[data-qa-generator=first] .flora-generator-run-icon').dataset.runIcon === 'loader-circle')
    await page.waitForTimeout(60)
    assert.equal(comfyRequests.length, 1, '实际ComfyUI运行按钮只提交一次')
    assert.equal(comfyRequests[0].prompt, '把背景改成森林', '宿主真实请求使用操作区提示词')
    assert.equal(comfyRequests[0].image, referenceImage, '宿主真实请求使用保留的参考图')
    comfyRelease()
    assert.equal(await panel.locator('.flora-generator-status').isVisible(), false, '完成后不再占用状态行')
    assert.equal(await first.locator('.flora-node-result-area .canvas-node-result img').isVisible(), true, 'ComfyUI返回结果显示在同一预览区')
    await first.evaluate(node => {
      const saved = serializeCanvasNode(node)
      window.qaSavedComfy = saved
      window.qaRestoredComfy = restoreCanvasBoardNode({ ...saved, id: 'qa-restored-comfy' }, {}, { maxId: 0 })
    })
    const restored = page.locator('[data-id="qa-restored-comfy"]')
    assert.equal(await restored.locator('.canvas-node-prompt').inputValue(), '把背景改成森林', '真实恢复流程保留ComfyUI提示词')
    assert.equal(await restored.locator('.canvas-node-result img').getAttribute('src'), referenceImage, '真实恢复流程保留结果预览')
    await restored.evaluate(node => unmountCanvasVirtualNode(node.dataset.id, node))
    assert.equal(await panel.locator('.canvas-node-run').isEnabled(), true)
    comfyFail = true
    await panel.locator('.canvas-node-run').click()
    await panel.getByText('失败：ComfyUI测试服务暂不可用', { exact: true }).waitFor()
    assert.equal(await panel.locator('.canvas-node-prompt').inputValue(), '把背景改成森林')
    assert.equal(await panel.locator('.canvas-node-run').isEnabled(), true, '失败恢复运行按钮')
    await panel.locator('.flora-generation-mode').selectOption('api')
    await panel.waitFor({ state: 'visible' })
    await arrange(1440)
    const card = await first.locator('.flora-node-card').boundingBox()
    const oldX = Number(await first.getAttribute('data-x'))
    await page.mouse.move(card.x + 80, card.y + 160); await page.mouse.down(); await page.mouse.move(card.x + 120, card.y + 180, { steps: 6 }); await page.mouse.up()
    assert.ok(Number(await first.getAttribute('data-x')) > oldX + 20, '预览主体仍可拖动节点')
    const movedBody = await first.locator('.flora-node-shell').boundingBox(), movedPanel = await panel.boundingBox()
    assert.ok(Math.abs(movedPanel.y - movedBody.y - movedBody.height - 16) < 2, '拖动后操作区跟随节点')
    await page.evaluate(() => clearCanvasSelection())
    await panel.waitFor({ state: 'hidden' })
    await page.evaluate(() => {
      const node = document.querySelector('[data-qa-generator=first]')
      canvasState.scale = 1; canvasState.y = 850 - Number(node.dataset.y); applyCanvasTransformNow(); selectCanvasNode(node)
    })
    await page.waitForTimeout(100)
    assert.ok((await panel.boundingBox()).y <= 800, '底边选中时应平移画布，操作区可访问')
    await panel.locator('.canvas-node-run').scrollIntoViewIfNeeded()
    assert.equal(await panel.locator('.canvas-node-run').isVisible(), true)
    // Multi-selection must not attach an arbitrary node's controls.
    await page.evaluate(() => {
      const first = document.querySelector('[data-qa-generator=first]'), second = document.querySelector('[data-qa-generator=second]')
      canvasState.selectedIds = new Set([first.dataset.id, second.dataset.id])
      first.classList.add('is-selected'); second.classList.add('is-selected'); dispatchCanvasSelectionChange()
    })
    await page.waitForTimeout(50)
    assert.equal(await panel.isVisible(), false)
    assert.equal(await second.locator('.flora-generator-composer').isVisible(), false)
    await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=first]')))
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 })
      for (const zoom of [0.5, 1, 1.75]) {
        await page.evaluate(({ width, zoom }) => {
          const node = document.querySelector('[data-qa-generator=first]')
          canvasState.scale = zoom; canvasState.x = -Number(node.dataset.x) * zoom + 24; canvasState.y = -Number(node.dataset.y) * zoom + 100
          applyCanvasTransformNow(); clearCanvasSelection()
        }, { width, zoom })
        // 操作区不再被夹取到视口内，而是在重新选中节点时由画布让位，因此这里按真实点击顺序重新选中。
        await page.waitForTimeout(60)
        await page.evaluate(() => selectCanvasNode(document.querySelector('[data-qa-generator=first]')))
        await page.waitForTimeout(100)
        const rect = await panel.boundingBox()
        assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1, `${width}/${zoom} 操作面板应在视口内`)
        // 操作区内部可滚动，选中节点时画布让位保证顶部落在窗口内，并留出至少 160px 可操作区域。
        assert.ok(rect.y <= 1050 - 160 + 1, `${width}/${zoom} 面板应可访问`)
        await prompt.fill(`提示词 ${width}/${zoom}`)
        records.push({ width, zoom, rect })
      }
      await arrange(width)
      await prompt.blur()
      await page.screenshot({ path: path.join(__dirname, `acceptance/generator-composer-${width}.png`) })
      await captureState(`selected-${width}`)
    }
    // Compare the empty selected state against the exact same baseline fixture.
    await page.evaluate(() => {
      const node = document.querySelector('[data-qa-generator=first]')
      delete node.dataset.resultSrc; delete node.dataset.resultDownloadUrl
      node.querySelector('.canvas-node-result').replaceChildren(); node.querySelector('.canvas-node-result').hidden = true
      node.querySelector('.canvas-node-prompt').value = ''; setCanvasNodeStatus(node, '')
      node.querySelector('.canvas-node-size').value = qaInitialGenerator.size
      node.querySelector('.canvas-node-size').dispatchEvent(new Event('change', { bubbles: true }))
      canvasImageModelPickers.get(node.querySelector('.canvas-node-model')).choose('__auto__')
      node.querySelector('.canvas-node-resolution').value = qaInitialGenerator.resolution
      node.querySelector('.canvas-node-resolution').dispatchEvent(new Event('change', { bubbles: true }))
      canvasState.connections = []; updateCanvasNodeRefs(node)
      document.querySelectorAll('.canvas-node:not([data-qa-generator])').forEach(reference => { CanvasFloraNodeShell.unmount(reference); reference.remove() })
    })
    for (const width of [390, 768, 1440, 1728]) {
      await arrange(width)
      const generateHit = await panel.locator('.canvas-node-run').evaluate(element => {
        const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        const ancestors = []; let current = element
        while (current && ancestors.length < 12) { const box = current.getBoundingClientRect(), style = getComputedStyle(current); ancestors.push({ id: current.id, className: current.className, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, maxWidth: style.maxWidth, overflow: style.overflow, pointerEvents: style.pointerEvents, display: style.display }); current = current.parentElement }
        return { ok: Boolean(hit && (hit === element || element.contains(hit))), hit: hit?.outerHTML.slice(0, 300), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ancestors }
      })
      assert.equal(generateHit.ok, true, `${width} 生成按钮实际命中，不被宿主视图裁切：${JSON.stringify(generateHit)}`)
      await page.screenshot({ path: path.join(__dirname, `acceptance/generator-composer-after-${width}.png`) })
      await modelTrigger.click()
      await modelPopup.waitFor({ state: 'visible' })
      const modelBounds = await modelPopup.boundingBox()
      assert.ok(modelBounds.x >= 0 && modelBounds.y >= 0 && modelBounds.x + modelBounds.width <= width + 1 && modelBounds.y + modelBounds.height <= 961, `${width} 模型浮层不超出屏幕`)
      await page.screenshot({ path: path.join(__dirname, `acceptance/generator-minimal-model-${width}.png`) })
      await modelPopup.locator('[data-model-id="qa-station-b-gpt2"] .image-model-picker-choice').click()
      await modelTrigger.click()
      await page.screenshot({ path: path.join(__dirname, `acceptance/model-picker-selected-${width}.png`) })
      await captureState(`model-open-${width}`)
      await page.keyboard.press('Escape')
      await first.evaluate(node => canvasImageModelPickers.get(node.querySelector('.canvas-node-model')).choose('__auto__'))
      await parameterTrigger.click()
      await parameterPopup.waitFor({ state: 'visible' })
      const parameterBounds = await parameterPopup.boundingBox()
      assert.ok(parameterBounds.x >= 0 && parameterBounds.y >= 0 && parameterBounds.x + parameterBounds.width <= width + 1 && parameterBounds.y + parameterBounds.height <= 961, `${width} 参数浮层不超出屏幕`)
      assert.equal(await parameterPopup.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, `${width} 参数浮层不横向溢出`)
      await page.screenshot({ path: path.join(__dirname, `acceptance/generator-minimal-parameters-${width}.png`) })
      await captureState(`parameters-open-${width}`)
      await page.keyboard.press('Escape')
    }
    await arrange(1440)
    await panel.locator('.flora-generation-mode').hover()
    await page.screenshot({ path: path.join(__dirname, 'acceptance/generator-composer-hover.png') })
    await captureState('hover-1440')
    await prompt.focus()
    await page.keyboard.press('Tab')
    assert.equal(await panel.locator('.flora-generation-mode').evaluate(element => document.activeElement === element && getComputedStyle(element).outlineStyle !== 'none'), true, '生成方式支持键盘焦点且轮廓可见')
    await page.screenshot({ path: path.join(__dirname, 'acceptance/generator-composer-focus.png') })
    await captureState('focus-1440')
    await panel.locator('.flora-generation-mode').blur()
    await prompt.fill('描述你想要生成的图片，或连接文字节点自动填充。'); await prompt.blur(); await page.mouse.move(10, 940)
    await page.evaluate(() => setCanvasStatus(''))
    const crop = await panel.boundingBox()
    await page.screenshot({ path: path.join(__dirname, 'acceptance/generator-composer-preview.png'), clip: { x: crop.x - 8, y: 74, width: crop.width + 16, height: crop.y + crop.height - 74 } })
    await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen())
    await page.waitForFunction(() => Boolean(document.fullscreenElement))
    await first.evaluate(node => canvasImageModelPickers.get(node.querySelector('.canvas-node-model')).choose('qa-station-b-gpt2'))
    await modelTrigger.click()
    await modelPopup.waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/generator-minimal-model-fullscreen.png') })
    await page.keyboard.press('Escape')
    await parameterTrigger.click()
    await parameterPopup.waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/generator-composer-fullscreen.png') })
    await parameterPopup.locator('.flora-generator-parameter-close').click()
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => !document.fullscreenElement)
    await first.evaluate(node => {
      const prompt = node.querySelector('.canvas-node-prompt')
      window.qaPromptIdentity = prompt
      CanvasFloraNodeShell.unmount(node); CanvasFloraNodeShell.mount(node)
    })
    assert.equal(await first.locator('.flora-generator-composer').count(), 1, '重装不重复面板')
    assert.equal(await first.locator('.flora-generation-mode').count(), 1, '重装不重复下拉或切换监听')
    assert.equal(await first.evaluate(node => node.querySelector('.canvas-node-prompt') === qaPromptIdentity), true, '重装保留原控件')
    const deletion = await second.evaluate(node => {
      window.qaDeletedGenerator = node
      unmountCanvasVirtualNode(node.dataset.id, node)
      return { shell: Boolean(node.querySelector('.flora-node-shell')), panel: Boolean(node.querySelector('.flora-generator-composer')) }
    })
    assert.deepEqual(deletion, { shell: false, panel: false }, '真实宿主卸载清理壳体和操作区')
    assert.equal(await page.locator('[data-qa-generator=second]').count(), 0)
    await page.evaluate(() => {
      const node = addCanvasImageGeneratorNode({ x: 1900, y: 80 })
      window.qaDirectlyRemovedGenerator = node
      node.remove()
    })
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(() => Boolean(qaDirectlyRemovedGenerator.querySelector('.flora-generator-composer'))), false, '直接移除也释放操作区')
    assert.equal(await page.evaluate(() => Boolean(canvasImageModelPickers.get(qaDirectlyRemovedGenerator.querySelector('.canvas-node-model')))), false, '直接移除释放模型浮层监听')
    await page.evaluate(() => clearCanvasSelection())
    assert.equal(await panel.isVisible(), false)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/generator-composer-default.png') })
    await first.evaluate(node => { selectCanvasNode(node); setCanvasImageNodeGenerationState(node, true); setCanvasNodeStatus(node, '正在生成…') })
    await page.waitForFunction(() => document.querySelector('[data-qa-generator=first] .flora-generator-composer').getAttribute('aria-busy') === 'true')
    assert.equal(await first.locator('.canvas-node-run').isDisabled(), true, '生成中复用原按钮禁用状态')
    await page.evaluate(() => clearCanvasPlane())
    assert.equal(await page.locator('.flora-generator-model-popover').count(), 0, '清空画布不遗留模型浮层')
    assert.equal(await page.locator('.flora-generator-composer').count(), 0, '切板清空流程释放全部操作区')
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(__dirname, 'acceptance/generator-composer-report.json'), JSON.stringify({ errors, records, states, comfyRequests, evidence: '真实宿主控件和ComfyUI运行/恢复流程，业务API及任务返回模拟；API生成回调模拟，未写入用户画布。' }, null, 2))
    console.log(JSON.stringify({ checked: records.length, errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
