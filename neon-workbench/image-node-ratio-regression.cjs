const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const output = path.join(__dirname, 'acceptance/image-node-ratio'); fs.mkdirSync(output, { recursive: true })
    const picture = (w, h) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#436e91"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="white" stroke-width="8"/></svg>`)
    const model = { id: 'qa-ratio', modelId: 'gpt-image-2', providerId: 'qa', providerName: '测试服务商', capabilities: ['image.generate'], resolutions: ['1', '2'], state: 'online', family: 'gpt-image-2' }
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {} }) }))
    await page.route('**/api/image-models*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ models: [model] }) }))
    await page.route('**/output/qa-ratio-landscape.png', r => r.fulfill({ contentType: 'image/svg+xml', body: decodeURIComponent(picture(1600, 900).slice('data:image/svg+xml,'.length)) }))
    await page.route('**/output/qa-ratio-portrait.png', r => r.fulfill({ contentType: 'image/svg+xml', body: decodeURIComponent(picture(900, 1600).slice('data:image/svg+xml,'.length)) }))
    if (process.env.GENERATOR_SOURCE) for (const name of ['script.js', 'flora-node-shell.js', 'flora-node-shell.css', 'flora-generator-composer.js']) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name), 'utf8') }))
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async model => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api', 'canvas-node-text'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-ratio'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      imageModelCatalog = [model]; IMAGE_MODEL_PLATFORMS[model.id] = 'openai'; IMAGE_MODEL_FAMILIES[model.id] = 'gpt-image-2'
      imageModelInput.innerHTML = '<option value="qa-ratio">测试图片模型</option>'; imageModelInput.value = model.id
      window.qaNode = addCanvasImageGeneratorNode({ x: 100, y: 60 }, { focus: false }); qaNode.dataset.qaRatio = 'primary'
      canvasState.x = 360; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaNode)
    }, model)
    const node = page.locator('[data-qa-ratio="primary"]'), shell = node.locator(':scope > .flora-node-shell'), panel = node.locator('.flora-generator-composer')
    const title = node.locator('.flora-node-label-title')
    await title.dblclick()
    await node.locator('.flora-node-title-editor').fill('雪景生成')
    await page.screenshot({ path: path.join(output, 'rename-focus.png') })
    await node.locator('.flora-node-title-editor').press('Enter')
    assert.equal(await title.textContent(), '雪景生成')
    assert.equal(await node.locator(':scope > .canvas-node-bar').evaluate(el => getComputedStyle(el).display), 'none')
    async function ratio(expected) {
      await page.waitForTimeout(70)
      const box = await shell.boundingBox(); assert.ok(Math.abs(box.width / box.height - expected) < .005, `主体比例应为 ${expected}，实际 ${box.width / box.height}`)
      const geometry = await node.evaluate(el => ({ saved: serializeCanvasNode(el), box: getCanvasNodeBox(el), height: el.offsetHeight }))
      assert.ok(Math.abs(geometry.saved.width / geometry.saved.height - expected) < .005, '保存主体比例')
      assert.equal(geometry.box.bottom - geometry.box.top, geometry.height, '场景几何与实际节点相同')
      const panelBox = await panel.boundingBox(); assert.ok(Math.abs(panelBox.y - box.y - box.height - 16) < 2, '操作区紧跟主体')
    }
    await panel.locator('.flora-generator-parameter-trigger').click()
    await panel.locator('[data-param-kind="size"][data-param-value="16:9"]').click()
    await ratio(16 / 9)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: path.join(output, 'empty-landscape.png') })
    for (const [value, expected] of [['9:16', 9 / 16], ['1:1', 1], ['4:3', 4 / 3]]) {
      await page.evaluate(value => { const size = qaNode.querySelector('.canvas-node-size'); size.value = value; size.dispatchEvent(new Event('change', { bubbles: true })) }, value)
      await ratio(expected)
    }
    await page.evaluate(() => { const s = qaNode.querySelector('.canvas-node-size'); s.value = '9:16'; s.dispatchEvent(new Event('change', { bubbles: true })) })
    const empty = await node.evaluate(el => serializeCanvasNode(el))
    await page.evaluate(item => { window.qaEmpty = restoreCanvasBoardNode({ ...item, id: 'qa-empty', x: 100 }, {}, { maxId: 0 }); selectCanvasNode(qaEmpty) }, empty)
    await page.waitForTimeout(70)
    assert.ok(Math.abs(await page.evaluate(() => qaEmpty.offsetWidth / (qaEmpty.offsetHeight - 48)) - 9 / 16) < .005, '空节点恢复所选比例')
    await page.evaluate(() => { unmountCanvasVirtualNode(qaEmpty.dataset.id, qaEmpty); selectCanvasNode(qaNode) })
    await page.evaluate(() => { const s = qaNode.querySelector('.canvas-node-size'); s.append(new Option('横向旧像素尺寸', '1536x1024')); s.value = '1536x1024'; s.dispatchEvent(new Event('change', { bubbles: true })) })
    await ratio(1.5)
    await page.evaluate(() => { const s = qaNode.querySelector('.canvas-node-size'); s.append(new Option('自定义', 'custom')); s.value = 'custom'; s.dispatchEvent(new Event('change', { bubbles: true })) })
    const custom = panel.locator('.canvas-custom-size-field')
    await panel.locator('.flora-generator-parameter-trigger').click()
    await custom.locator('[data-size-axis="width"]').fill('1536'); await custom.locator('[data-size-axis="height"]').fill('1024')
    await page.keyboard.press('Escape')
    await ratio(1.5)
    const customSaved = await node.evaluate(el => serializeCanvasNode(el))
    assert.equal(customSaved.size, '1536x1024', '保存自定义实际宽高，不能只保存custom占位')
    await page.evaluate(item => { window.qaCustom = restoreCanvasBoardNode({ ...item, id: 'qa-custom', x: 100 }, {}, { maxId: 0 }); selectCanvasNode(qaCustom) }, customSaved)
    await page.waitForTimeout(60)
    assert.ok(Math.abs(await page.evaluate(() => qaCustom.offsetWidth / (qaCustom.offsetHeight - 48)) - 1.5) < .005, '自定义空节点恢复比例')
    await page.evaluate(() => { unmountCanvasVirtualNode(qaCustom.dataset.id, qaCustom); selectCanvasNode(qaNode) })
    const landscape = '/output/qa-ratio-landscape.png', portrait = '/output/qa-ratio-portrait.png'
    await page.evaluate(src => commitCanvasImageJobResult(qaNode, { id: 'qa-ratio-result', boardId: canvasState.activeBoardId, nodeId: qaNode.dataset.id, result: { data: [{ url: src, width: 1600, height: 900 }] } }, '比例测试'), landscape)
    await page.waitForFunction(() => { const img = qaNode.querySelector('.canvas-node-result img'); return img?.complete && img.naturalWidth > 0 })
    await ratio(16 / 9)
    async function flushImage() {
      const card = await shell.boundingBox(), img = await node.locator('.canvas-node-result img').boundingBox()
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(card[key] - img[key]) < 1, `图片 ${key} 贴合主体`)
      assert.equal(await node.locator('.canvas-node-result img').evaluate(el => getComputedStyle(el).objectFit), 'contain', '完整显示，不能裁切')
    }
    await flushImage()
    assert.equal(await title.textContent(), '雪景生成', '生成后保留名称')
    assert.equal(await node.locator('.flora-node-image-dimensions').textContent(), '1600 × 900')
    await shell.hover()
    assert.equal(await page.locator('.canvas-image-info').evaluate(el => getComputedStyle(el).display), 'none', '旧图片信息栏隐藏')
    const saved = await node.evaluate(el => serializeCanvasNode(el))
    await page.evaluate(item => {
      document.activeElement?.blur(); canvasState.clipboard = { nodes: [item], connections: [] }
      pasteCanvasNodes({ preventDefault() {} }); window.qaCopy = getSelectedCanvasNodes()[0]
    }, saved)
    await page.waitForFunction(() => { const img = qaCopy?.querySelector('.canvas-node-result img'); return img?.complete && img.naturalWidth > 0 })
    await page.waitForTimeout(60)
    assert.equal(await page.evaluate(() => qaCopy.querySelector('.flora-node-label-title').textContent), '雪景生成', '复制保留名称')
    assert.ok(Math.abs(await page.evaluate(() => qaCopy.offsetWidth / (qaCopy.offsetHeight - 48)) - 16 / 9) < .005, '实际复制粘贴保留图片比例')
    await page.evaluate(() => { unmountCanvasVirtualNode(qaCopy.dataset.id, qaCopy); selectCanvasNode(qaNode) })
    await page.evaluate(item => { window.qaRestored = restoreCanvasBoardNode({ ...item, id: 'qa-ratio-restored', x: 100 }, {}, { maxId: 0 }); selectCanvasNode(qaRestored) }, saved)
    await page.locator('[data-id="qa-ratio-restored"] .canvas-node-result img').evaluate(img => img.decode())
    assert.equal(await page.evaluate(() => qaRestored.querySelector('.flora-node-label-title').textContent), '雪景生成', '恢复保留名称')
    assert.ok(Math.abs(await page.evaluate(() => qaRestored.offsetWidth / (qaRestored.offsetHeight - 48)) - 16 / 9) < .005, '真实恢复保留结果比例')
    await page.evaluate(() => { unmountCanvasVirtualNode(qaRestored.dataset.id, qaRestored); selectCanvasNode(qaNode) })
    await page.evaluate(({ landscape, portrait }) => {
      FloraGenerationHistory.hydrate(qaNode, [{ id: 'wide', kind: 'image', src: landscape }, { id: 'tall', kind: 'image', src: portrait }], 'wide')
      FloraGenerationHistory.mount(qaNode, qaNode.querySelector('.flora-node-shell'))
    }, { landscape, portrait })
    await node.locator('.flora-generation-history-badge').click()
    await page.locator('.flora-generation-history-panel [data-history-id="tall"][data-history-action="select"]').click()
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => { const img = qaNode.querySelector('.canvas-node-result img'); return img?.complete && img.naturalWidth > 0 }); await ratio(9 / 16); await flushImage()
    assert.equal(await title.textContent(), '雪景生成', '历史切换保留名称')
    assert.equal(await node.locator('.flora-node-image-dimensions').textContent(), '900 × 1600')
    await page.screenshot({ path: path.join(output, 'portrait-history.png') })
    await page.evaluate(src => updateCanvasGenerationResult(qaNode, { src, savedUrl: src }), landscape)
    await page.waitForFunction(() => { const img = qaNode.querySelector('.canvas-node-result img'); return img?.complete && img.naturalWidth > 0 })
    const widths = [390, 768, 1440, 1728], scales = [.65, 1, 1.5]
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1050 })
      for (const scale of scales) {
        await page.evaluate(({ width, scale }) => { canvasState.x = width / 2 - 300 * scale; canvasState.y = 0; canvasState.scale = scale; applyCanvasTransformNow(); selectCanvasNode(qaNode) }, { width, scale })
        await ratio(16 / 9); await flushImage()
        await page.screenshot({ path: path.join(output, `${width}-${scale}-selected.png`) })
        for (const port of await node.locator('.flora-node-port-layer .canvas-port').all()) {
          const a = await shell.boundingBox(), p = await port.boundingBox(); assert.ok(Math.abs(p.y + p.height / 2 - a.y - a.height / 2) < 1, '连接点保持主体中间')
        }
        if (scale === 1) {
          await shell.hover(); await page.screenshot({ path: path.join(output, `${width}-hover.png`) })
          await panel.locator('.flora-generator-parameter-trigger').focus(); await page.screenshot({ path: path.join(output, `${width}-focus.png`) })
          await page.evaluate(() => clearCanvasSelection()); await page.waitForTimeout(50)
          await page.screenshot({ path: path.join(output, `${width}-default.png`) }); await page.evaluate(() => selectCanvasNode(qaNode))
        }
        await panel.getByRole('button', { name: '放大操作区', exact: true }).click()
        await page.screenshot({ path: path.join(output, `${width}-${scale}-expanded.png`) })
        await panel.getByRole('button', { name: '关闭放大操作区', exact: true }).click()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      }
    }
    await page.evaluate(() => document.querySelector('#neonEngineSurface').requestFullscreen())
    await flushImage(); await page.screenshot({ path: path.join(output, 'fullscreen.png') }); await page.evaluate(() => document.exitFullscreen())
    await page.evaluate(src => { window.qaComfy = addCanvasComfyNode({ x: 100, y: 60 }, { focus: false }); selectCanvasNode(qaComfy); updateCanvasGenerationResult(qaComfy, { src, savedUrl: src }) }, portrait)
    await page.waitForFunction(() => { const img = qaComfy.querySelector('.canvas-node-result img'); return img?.complete && img.naturalWidth > 0 })
    await page.waitForTimeout(80)
    assert.ok(Math.abs(await page.evaluate(() => qaComfy.offsetWidth / (qaComfy.offsetHeight - 48)) - 9 / 16) < .005, 'ComfyUI图片结果采用真实比例')
    await page.screenshot({ path: path.join(output, 'comfy-portrait.png') })
    await page.evaluate(() => { unmountCanvasVirtualNode(qaComfy.dataset.id, qaComfy); selectCanvasNode(qaNode) })
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, widths, scales, screenshots: 40, errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
