const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = [], chats = []
    let uploadFail = false, delayUpload = false, finishUpload
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
    const file = { name: '参考图片.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} } }))
    await page.route('**/api/vision-models', route => route.fulfill({ json: { models: [{ id: 'qa-chat', modelId: 'qa-chat', providerId: 'qa', providerName: '测试', capabilities: ['llm.chat', 'llm.chat.vision'], state: 'online' }] } }))
    await page.route('**/api/upload-image', async route => {
      if (delayUpload) await new Promise(resolve => { finishUpload = resolve })
      await route.fulfill({ status: uploadFail ? 403 : 200, json: uploadFail ? { error: '没有上传权限' } : { url: png } })
    })
    await page.route('**/api/chat', route => {
      chats.push(route.request().postDataJSON())
      return route.fulfill({ json: { choices: [{ message: { content: '参考图片修改后的提示词' } }] } })
    })
    if (process.env.GENERATOR_SOURCE) await page.route('**/script.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js'), 'utf8') }))
    await page.goto(process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const loaded = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-text', 'canvas-node-media', 'canvas-node-asset-collection'])
      if (loaded?.ok === false) throw new Error(JSON.stringify(loaded))
      await loadVisionModels(); await loadCanvasBoards(); canvasState.activeBoardId = 'qa-reference'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaText = addCanvasText({ x: 100, y: 40 }, { focus: false })
      setCanvasTextValue(qaText, '当前文字节点正文')
      qaText.querySelector('.canvas-llm-prompt').value = '根据参考图片修改提示词'
      const model = qaText.querySelector('.canvas-llm-model'); model.value = 'qa-chat'; model.dataset.catalogUnavailable = 'false'
      canvasState.scale = 1; canvasState.x = 160; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaText)
    })
    const panel = page.locator('.canvas-node-text .flora-generator-composer')
    await panel.waitFor({ state: 'visible' })
    const input = panel.locator('.flora-generator-reference-input')
    await input.setInputFiles(file)
    await page.waitForFunction(() => qaText.dataset.floraReferenceUploading !== 'true')
    assert.equal(await page.evaluate(() => canvasState.connections.filter(c => c.to === qaText.dataset.id).length), 1, '通过操作区上传后图片成功连接文字节点')
    assert.equal(await panel.locator('.canvas-llm-thumb img').count(), 1, '连接后操作区显示参考图缩略图')
    assert.equal(await page.evaluate(() => getCanvasTextValue(qaText)), '当前文字节点正文', '添加参考图不覆盖正文')
    assert.equal(await panel.locator('.flora-generator-add-reference').isEnabled(), true)
    await panel.locator('.canvas-llm-run').click()
    await page.waitForFunction(() => getCanvasTextValue(qaText) === '参考图片修改后的提示词')
    const content = chats[0].messages[0].content
    assert.ok(content.some(item => item.type === 'text' && item.text.includes('当前文字节点正文') && item.text.includes('根据参考图片修改提示词')), '同时发送正文和本次要求')
    assert.equal(content.filter(item => item.type === 'image_url').length, 1, '连接图片进入真实构造的模型请求')
    assert.equal(content.find(item => item.type === 'image_url').image_url.url, png)
    await page.evaluate(() => {
      const connection = canvasState.connections.find(c => c.to === qaText.dataset.id)
      disconnectCanvasNodes(connection.from, connection.to)
      connectCanvasNodes(connection.from, connection.to)
    })
    assert.equal(await panel.locator('.canvas-llm-thumb img').count(), 1, '重新连接不会重复缩略图')

    await panel.getByRole('button', { name: '放大操作区', exact: true }).click()
    await input.setInputFiles({ ...file, name: '放大界面参考.png' })
    await page.waitForFunction(() => qaText.dataset.floraReferenceUploading !== 'true')
    assert.equal(await panel.locator('.canvas-llm-thumb img').count(), 2, '放大界面上传也能连接并展示')
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 })
      const rect = await page.locator('.flora-generator-expanded-dialog[open]').boundingBox()
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width, `${width} 放大参考区无横向溢出`)
      assert.equal(await panel.locator('.canvas-llm-thumb img').count(), 2)
    }
    await page.setViewportSize({ width: 1440, height: 1050 })
    await panel.getByRole('button', { name: '关闭放大操作区', exact: true }).click()
    await page.evaluate(() => {
      for (const c of [...canvasState.connections].filter(c => c.to === qaText.dataset.id)) disconnectCanvasNodes(c.from, c.to)
    })
    assert.equal(await panel.locator('.canvas-llm-thumb').count(), 0, '断开连接后移除缩略图')
    const collectionResult = await page.evaluate(png => {
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2
      const secondImage = canvas.toDataURL('image/png')
      const collection = addCanvasAssetCollection({ x: -500, y: 20 }, { members: [
        { id: 'ref-one', kind: 'image', src: png, name: '素材图一' },
        { id: 'ref-two', kind: 'image', src: secondImage, name: '素材图二' },
      ] })
      connectCanvasNodes(collection.dataset.id, qaText.dataset.id)
      return { id: collection.dataset.id, refs: getCanvasIncomingRefs(qaText.dataset.id).length }
    }, png)
    assert.equal(collectionResult.refs, 2, '素材合集中的图片也可连接文字节点')
    assert.equal(await panel.locator('.canvas-llm-thumb img').count(), 2)
    await page.evaluate(async () => { await runCanvasLlmNode(qaText) })
    assert.equal(chats.at(-1).messages[0].content.filter(item => item.type === 'image_url').length, 2, '合集图片全部传入模型')
    await page.evaluate(id => disconnectCanvasNodes(id, qaText.dataset.id), collectionResult.id)
    const mixed = await page.evaluate(png => {
      const collection = addCanvasAssetCollection({ x: -500, y: 400 }, { members: [
        { id: 'mixed-image', kind: 'image', src: png, name: '图片' },
        { id: 'mixed-video', kind: 'video', src: '/test-video.mp4', name: '视频' },
      ] })
      connectCanvasNodes(collection.dataset.id, qaText.dataset.id)
      return canvasState.connections.some(c => c.from === collection.dataset.id && c.to === qaText.dataset.id)
    }, png)
    assert.equal(mixed, false, '图文节点保持不接收视频素材的限制')
    const placeholder = await page.evaluate(() => {
      const image = addCanvasUploadPlaceholder({ x: -500, y: 800 })
      connectCanvasNodes(image.dataset.id, qaText.dataset.id)
      return { id: image.dataset.id, connected: canvasState.connections.some(c => c.from === image.dataset.id && c.to === qaText.dataset.id), refs: getCanvasIncomingRefs(qaText.dataset.id).length }
    })
    assert.equal(placeholder.connected, true, '空图片节点允许预先连接')
    assert.equal(placeholder.refs, 0, '空图片节点不会发送无效图片')
    await page.evaluate(id => disconnectCanvasNodes(id, qaText.dataset.id), placeholder.id)
    uploadFail = true
    await input.setInputFiles(file)
    await panel.getByText('参考图上传失败：没有上传权限', { exact: true }).waitFor()
    assert.equal(await panel.locator('.flora-generator-add-reference').isEnabled(), true)
    assert.equal(await page.evaluate(() => canvasState.connections.filter(c => c.to === qaText.dataset.id).length), 0)
    uploadFail = false; delayUpload = true
    await input.setInputFiles(file)
    await page.waitForFunction(() => qaText.dataset.floraReferenceUploading === 'true')
    while (!finishUpload) await new Promise(resolve => setTimeout(resolve, 10))
    await page.evaluate(() => { canvasState.activeBoardId = 'qa-other-board' })
    finishUpload()
    await panel.getByText('参考图添加失败：画布已切换，参考图未添加。', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => canvasState.connections.filter(c => c.to === qaText.dataset.id).length), 0, '切换画布不串入图片')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, scenarios: ['正常上传连接', '正文保留', '图文请求', '手动重连', '放大上传', '四宽度', '断开清理', '图片合集', '拒绝混合视频合集', '空图片预连接', '上传错误', '上传完成后的添加错误'], errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
