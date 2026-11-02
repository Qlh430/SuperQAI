// 图片工具参数面板（放大 / 扩图）回归：面板打开后点里面任何地方都不该关闭，
// 只有点面板和工具栏以外、或按 Esc、或点「执行 / 取消」才收起。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_IMAGE = process.env.CROP_SOURCE_IMAGE
  || 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\data\\output\\0e3154dd-c0cf-49cb-85de-09608bcd6c20_1791440818634_ad06c34d.png'
const SOURCE_URL = '/qa-assets/crop-source.png'
const RESULT_URL = '/qa-assets/crop-result.png'
const API_STUB = JSON.stringify({
  authenticated: false, boards: [], projects: [], resources: [], records: [],
  models: [], providers: [], preferences: {}, settings: {}, snapshots: [], users: [], groups: [],
})
const VIEWPORT_PAGE = JSON.stringify({ state: "migrating" })

;(async () => {
  const sourceBytes = fs.readFileSync(SOURCE_IMAGE)
  const errors = []
  const submitted = []
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/canvas/boards/*/viewport*', route => route.fulfill({ contentType: 'application/json', body: VIEWPORT_PAGE }))
    await page.route('**/api/image-thumbnails*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item: { thumbnailUrl: SOURCE_URL, width: 1536, height: 1024, lightweight: false } }),
    }))
    await page.route('**/api/upload-image', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: RESULT_URL }) }))
    await page.route('**/api/upscale2', route => {
      submitted.push(JSON.parse(route.request().postData() || '{}'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task_id: 'qa-upscale-task' }) })
    })
    await page.route('**/api/upscale/status*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', progress: 100, images: [RESULT_URL] }),
    }))
    await page.route('**/qa-assets/crop-source.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    await page.route('**/qa-assets/crop-result.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    if (process.env.CROP_USE_DEPLOYED !== '1') {
      const overrides = [
        ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
        ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
        ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
      ]
      for (const [served, source, type] of overrides) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: type,
          body: fs.readFileSync(path.join(__dirname, 'design-sources', source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ sourceUrl }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-tool-panel-board'
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.style.flex = '1'
      view.style.minHeight = '0'
      view.style.width = '100%'
      view.hidden = false
      view.classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      const node = window.qaUpscaleNode = addCanvasImage(sourceUrl, '超清来源.png', { x: 220, y: 200 })
      node.dataset.qaUpscaleNode = 'primary'
      node.dataset.imageSrc = sourceUrl
      canvasState.scale = 1
      canvasState.x = 120
      canvasState.y = 120
      applyCanvasTransformNow()
      selectCanvasNode(node)
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => window.qaUpscaleNode?.querySelector('.canvas-image-upload img')?.naturalWidth > 0)

    const panelOpen = () => page.evaluate(() => Boolean(document.querySelector('.flora-node-tool-panel')))

    // 打开面板。
    await page.locator('[data-qa-upscale-node="primary"] [data-flora-action="upscale"]').click()
    await page.waitForSelector('.flora-node-tool-panel')
    assert.equal(await panelOpen(), true, '点超清应展开参数面板')

    // 面板自身必须接住点击（壳体是 pointer-events: none，浮层要自己收回来）。
    const hitInfo = await page.evaluate(() => {
      const panel = document.querySelector('.flora-node-tool-panel')
      const title = panel.querySelector('.flora-node-tool-panel-head strong')
      const box = title.getBoundingClientRect()
      const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return {
        rect: { top: box.top, left: box.left, w: box.width, h: box.height },
        hitInsidePanel: Boolean(centre && panel.contains(centre)),
        hitClass: centre ? (typeof centre.className === 'string' ? centre.className.slice(0, 40) : centre.tagName.toLowerCase()) : '',
      }
    })
    assert.equal(hitInfo.hitInsidePanel, true, `面板应接住点击，实际命中 ${hitInfo.hitClass}`)

    // 点面板标题：不能关闭。
    await page.mouse.click(hitInfo.rect.left + hitInfo.rect.w / 2, hitInfo.rect.top + hitInfo.rect.h / 2)
    await page.waitForTimeout(150)
    assert.equal(await panelOpen(), true, '点面板标题不应关闭面板')

    // 点面板空白处：不能关闭。
    const panelBox = await page.locator('.flora-node-tool-panel').boundingBox()
    await page.mouse.click(panelBox.x + panelBox.width - 12, panelBox.y + panelBox.height - 46)
    await page.waitForTimeout(150)
    assert.equal(await panelOpen(), true, '点面板内部空白不应关闭面板')

    // 操作下拉：面板要留着，值要写进节点。
    await page.locator('.flora-node-tool-panel select').selectOption('4096')
    await page.waitForTimeout(150)
    const afterSelect = await page.evaluate(() => ({
      open: Boolean(document.querySelector('.flora-node-tool-panel')),
      resolution: window.qaUpscaleNode.dataset.comfyResolution || '',
    }))
    assert.equal(afterSelect.open, true, '切换目标长边不应关闭面板')
    assert.equal(afterSelect.resolution, '4096', `目标长边应写进节点，实际 ${afterSelect.resolution}`)

    // 点面板外的画布：应收起。
    const nodeBox = await page.locator('[data-qa-upscale-node="primary"]').boundingBox()
    await page.mouse.click(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height - 24)
    await page.waitForTimeout(200)
    assert.equal(await panelOpen(), false, '点面板以外应收起面板')

    // 重新打开并执行：请求体带分辨率，面板关闭，结果节点出现。
    await page.locator('[data-qa-upscale-node="primary"] [data-flora-action="upscale"]').click()
    await page.waitForSelector('.flora-node-tool-panel')
    await page.locator('.flora-node-tool-panel [data-flora-tool-submit]').click()
    await page.waitForFunction(() => !document.querySelector('.flora-node-tool-panel'), null, { timeout: 15000 })
    for (let attempt = 0; attempt < 40 && submitted.length === 0; attempt += 1) await page.waitForTimeout(250)
    assert.equal(submitted.length, 1, `应提交一次放大任务，实际 ${submitted.length}`)
    assert.equal(submitted[0].resolution, 4096, `提交体分辨率：${submitted[0].resolution}`)
    assert.ok(String(submitted[0].image || '').includes('crop-source'), `提交体应带来源图片：${submitted[0].image}`)
    await page.waitForFunction(() => document.querySelectorAll('#canvasPlane .canvas-node').length === 2, null, { timeout: 20000 })
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    console.log(JSON.stringify({ ok: true, afterSelect, submitted: submitted[0] }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
