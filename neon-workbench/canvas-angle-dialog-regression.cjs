// 换角度回归：拖拽方块 / 方位预设 / 滑杆都写回同一份角度参数，提交体与旧面板一致。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_IMAGE = process.env.CROP_SOURCE_IMAGE
  || 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\data\\output\\0e3154dd-c0cf-49cb-85de-09608bcd6c20_1791440818634_ad06c34d.png'
const SOURCE_URL = '/qa-assets/crop-source.png'
const ANGLE_API_URL = '/api/qwen-edit-angle'
const STATUS_API_URL = '/api/upscale/status'
const API_STUB = JSON.stringify({
  authenticated: false, boards: [], projects: [], resources: [], records: [],
  models: [], providers: [], preferences: {}, settings: {}, snapshots: [], users: [], groups: [],
})
// 视口接口会校验引擎版本，桩成「迁移中」既不报错也不会用空页面覆盖测试里新建的节点。
const VIEWPORT_PAGE = JSON.stringify({ state: "migrating" })
// 任务状态先停在处理中，方便断言「进行中」这一帧；点一次取消后不再返回结果。
let taskStatus = "processing"
let statusPolls = 0

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
    await page.route('**/api/upload-image', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: '/qa-assets/crop-result.png' }) }))
    await page.route(`**${ANGLE_API_URL}`, route => {
      submitted.push(JSON.parse(route.request().postData() || '{}'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task_id: 'qa-angle-task' }) })
    })
    await page.route(`**${STATUS_API_URL}*`, route => {
      statusPolls += 1
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(taskStatus === 'success'
          ? { status: 'success', progress: 100, images: ['/qa-assets/crop-result.png'] }
          : { status: 'processing', progress: 4, message: '' }),
      })
    })
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
      canvasState.activeBoardId = 'qa-angle-board'
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
      const node = window.qaAngleNode = addCanvasImage(sourceUrl, '换角度来源.png', { x: 160, y: 160 })
      node.dataset.qaAngleNode = 'primary'
      node.dataset.imageSrc = sourceUrl
      canvasState.scale = 1
      canvasState.x = 160 - Number(node.dataset.x)
      canvasState.y = 160 - Number(node.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(node)
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => window.qaAngleNode?.querySelector('.canvas-image-upload img')?.naturalWidth > 0)

    // 打开对话框：应挂在 body、盖在画布之上，并带方块与三组控件。
    await page.locator('[data-qa-angle-node="primary"] [data-flora-action="angle"]').click()
    await page.waitForSelector('#canvasAngleDialog:not([hidden])')
    const opened = await page.evaluate(() => {
      const dialog = document.querySelector('#canvasAngleDialog')
      const panel = dialog.querySelector('.canvas-angle-dialog-panel')
      const box = panel.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 12)
      const ranges = Object.fromEntries(Array.from(dialog.querySelectorAll('input[type=range]')).map((input) => [
        input.hasAttribute('data-angle-horizontal') ? 'horizontal'
          : input.hasAttribute('data-angle-vertical') ? 'vertical' : 'zoom',
        { min: input.min, max: input.max, step: input.step, value: input.value },
      ]))
      return {
        parentIsBody: dialog.parentElement === document.body,
        className: dialog.className,
        zIndex: Number(getComputedStyle(dialog).zIndex),
        hitInsidePanel: Boolean(hit && panel.contains(hit)),
        presetCount: dialog.querySelectorAll('[data-angle-preset]').length,
        presetLabels: Array.from(dialog.querySelectorAll('[data-angle-preset] span')).map((item) => item.textContent),
        hasCube: Boolean(dialog.querySelector('.canvas-angle-cube')),
        cubeFocused: document.activeElement === dialog.querySelector('.canvas-angle-cube'),
        title: dialog.querySelector('header strong')?.textContent || '',
        ranges,
      }
    })
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/angle-dialog-1440.png') })
    // 换角度面板已从「铺满视口的模态框」改成「贴在节点下方的面板」，所以不再挂 body。
    assert.equal(opened.parentIsBody, false, '换角度面板应挂在节点下方，不再挂 body')
    const angleHost = await page.evaluate(() => {
      const dialog = document.querySelector('#canvasAngleDialog')
      const node = dialog?.closest?.('.canvas-node')
      if (!dialog || !node) return null
      const dialogRect = dialog.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      return {
        insideNode: Boolean(node.querySelector('#canvasAngleDialog')),
        modalAttr: dialog.querySelector('.canvas-angle-dialog-panel')?.getAttribute('aria-modal'),
        below: Math.abs(dialogRect.top - (nodeRect.bottom + 12)) <= 2,
      }
    })
    assert.equal(angleHost?.insideNode, true, '换角度面板应在原节点内')
    assert.equal(angleHost?.modalAttr, 'false', `面板不再是模态框：${angleHost?.modalAttr}`)
    assert.equal(angleHost?.below, true, `面板应贴在节点下沿：${JSON.stringify(angleHost)}`)
    assert.equal(opened.hitInsidePanel, true, '对话框中心应命中面板')
    assert.equal(opened.title, '拖拽方块调整角度', `标题应说明可拖拽，实际「${opened.title}」`)
    assert.deepEqual(opened.presetLabels, ['左上', '上方', '右上', '左侧', '正面', '右侧', '左下', '下方', '右下'], `方位预设：${opened.presetLabels}`)
    assert.equal(opened.hasCube, true, '应有可拖拽方块')
    assert.equal(opened.ranges.horizontal.min, '-180', '水平范围下限')
    assert.equal(opened.ranges.horizontal.max, '180', '水平范围上限')
    assert.equal(opened.ranges.vertical.min, '-30', '垂直范围下限')
    assert.equal(opened.ranges.vertical.max, '60', '垂直范围上限')
    assert.equal(opened.ranges.zoom.max, '10', '景别缩放上限')

    // 方位预设：正面 / 右侧 写回同一份角度参数。
    await page.locator('[data-angle-preset="front"]').click()
    await page.locator('[data-angle-preset="right"]').click()
    const afterPreset = await page.evaluate(() => ({
      horizontal: window.qaAngleNode.dataset.comfyQwenHorizontal,
      vertical: window.qaAngleNode.dataset.comfyQwenVertical,
      cubeY: document.querySelector('.canvas-angle-cube').style.getPropertyValue('--canvas-angle-y'),
      readout: document.querySelector('[data-angle-horizontal-value]').textContent,
      activePreset: document.querySelector('[data-angle-preset].is-active span')?.textContent || '',
    }))
    assert.equal(afterPreset.horizontal, '90', `右侧预设应写入水平 90，实际 ${afterPreset.horizontal}`)
    assert.equal(afterPreset.vertical, '0', `右侧预设垂直应为 0，实际 ${afterPreset.vertical}`)
    assert.equal(afterPreset.cubeY, '-90deg', `方块横向旋转应跟随水平角：${afterPreset.cubeY}`)
    assert.equal(afterPreset.readout, '90°', `水平读数：${afterPreset.readout}`)
    assert.equal(afterPreset.activePreset, '右侧', `当前方位应高亮右侧，实际「${afterPreset.activePreset}」`)

    // 拖拽方块：横向 1°/2px、纵向 1°/3px（向下拖 = 俯视变小）。
    await page.locator('[data-angle-preset="front"]').click()
    const cube = await page.locator('.canvas-angle-cube').boundingBox()
    await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2)
    await page.mouse.down()
    await page.mouse.move(cube.x + cube.width / 2 + 100, cube.y + cube.height / 2, { steps: 10 })
    await page.mouse.up()
    const afterDrag = await page.evaluate(() => ({
      horizontal: window.qaAngleNode.dataset.comfyQwenHorizontal,
      vertical: window.qaAngleNode.dataset.comfyQwenVertical,
      slider: document.querySelector('[data-angle-horizontal]').value,
      cubeY: document.querySelector('.canvas-angle-cube').style.getPropertyValue('--canvas-angle-y'),
    }))
    // 向右拖 = 把方块往右推：水平角减 50°，方块正面也朝右转（rotateY 取 +50deg），跟着鼠标走。
    assert.equal(afterDrag.horizontal, '-50', `右拖 100px 应减 50°，实际 ${afterDrag.horizontal}`)
    assert.equal(afterDrag.slider, '-50', '滑杆应与拖拽同步')
    assert.equal(afterDrag.cubeY, '50deg', `方块应跟随鼠标向右转：${afterDrag.cubeY}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/angle-dialog-dragged-1440.png') })

    // 滑杆与重置。
    await page.locator('[data-angle-vertical]').fill('45')
    const afterSlider = await page.evaluate(() => ({
      vertical: window.qaAngleNode.dataset.comfyQwenVertical,
      readout: document.querySelector('[data-angle-vertical-value]').textContent,
    }))
    assert.equal(afterSlider.vertical, '45', `滑杆应写入垂直角，实际 ${afterSlider.vertical}`)
    assert.equal(afterSlider.readout, '45°', `垂直读数：${afterSlider.readout}`)
    await page.locator('[data-angle-reset]').click()
    const afterReset = await page.evaluate(() => ({
      horizontal: window.qaAngleNode.dataset.comfyQwenHorizontal,
      vertical: window.qaAngleNode.dataset.comfyQwenVertical,
      zoom: window.qaAngleNode.dataset.comfyQwenZoom,
    }))
    assert.deepEqual(afterReset, { horizontal: '0', vertical: '0', zoom: '5' }, `重置应回到正面中景：${JSON.stringify(afterReset)}`)

    // 提交：请求体与旧面板一致，对话框关闭。
    await page.locator('[data-angle-preset="left-up"]').click()
    await page.locator('[data-angle-submit]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAngleDialog')?.hidden === true, null, { timeout: 15000 })
    await page.waitForFunction(() => window.__qaSubmitted?.length > 0 || true)
    for (let attempt = 0; attempt < 40 && submitted.length === 0; attempt += 1) await page.waitForTimeout(250)
    assert.equal(submitted.length, 1, `应提交一次换角度任务，实际 ${submitted.length}`)
    assert.equal(submitted[0].horizontal_angle, -45, `提交体水平角：${submitted[0].horizontal_angle}`)
    assert.equal(submitted[0].vertical_angle, 30, `提交体垂直角：${submitted[0].vertical_angle}`)
    assert.equal(submitted[0].zoom, 5, `提交体景别：${submitted[0].zoom}`)
    assert.ok(String(submitted[0].image || '').includes('crop-source.png'), `提交体应带来源图片：${submitted[0].image}`)
    assert.deepEqual(Object.keys(submitted[0]).sort(), ['horizontal_angle', 'image', 'name', 'vertical_angle', 'zoom'], `提交体字段应与旧面板一致：${Object.keys(submitted[0])}`)

    // 进行中：结果节点立刻出现，带点阵占位、进度文字与取消按钮。
    await page.waitForSelector('[data-image-generating]', { timeout: 15000 })
    await page.waitForFunction(() => (document.querySelector('[data-image-generating-progress]')?.textContent || '').includes('%'))
    const pending = await page.evaluate(() => {
      const overlay = document.querySelector('[data-image-generating]')
      const node = overlay.closest('.canvas-node')
      const sourceNode = window.qaAngleNode
      const box = overlay.getBoundingClientRect()
      return {
        nodeCount: document.querySelectorAll('#canvasPlane .canvas-node').length,
        rightOfSource: node.getBoundingClientRect().left > sourceNode.getBoundingClientRect().left,
        progress: overlay.querySelector('[data-image-generating-progress]')?.textContent || '',
        cancelLabel: overlay.querySelector('[data-image-generating-cancel]')?.textContent || '',
        gridVisible: Boolean(overlay.querySelector('.canvas-image-generating-grid')),
        overlaySized: box.width > 40 && box.height > 40,
        status: node.querySelector('.flora-node-live-status')?.textContent || '',
        nodeName: node.dataset.imageName || '',
      }
    })
    assert.equal(pending.cancelLabel, '取消', `进行中应有取消按钮：${pending.cancelLabel}`)
    assert.ok(pending.progress.includes('%'), `进行中应显示百分比：${pending.progress}`)
    assert.equal(pending.gridVisible, true, '进行中应有点阵占位')
    assert.equal(pending.overlaySized, true, '占位应铺满结果区')
    assert.equal(pending.rightOfSource, true, '结果节点应落在来源节点右侧')
    assert.equal(pending.nodeCount, 2, `进行中应是来源 + 占位两个节点，实际 ${pending.nodeCount}`)
    assert.ok(pending.nodeName.includes('换角度结果'), `结果节点名称：${pending.nodeName}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/angle-dialog-generating-1440.png') })

    // 取消：占位节点被回收，来源节点给出取消提示。
    await page.locator('[data-image-generating-cancel]').click()
    await page.waitForFunction(() => !document.querySelector('[data-image-generating]'), null, { timeout: 15000 })
    // 节点状态由壳体镜像到底部状态行，等一帧再读。
    await page.waitForFunction(() => (window.qaAngleNode.querySelector('.flora-node-live-status')?.textContent || '').includes('已取消'), null, { timeout: 10000 })
    const afterCancel = await page.evaluate(() => ({
      nodeCount: document.querySelectorAll('#canvasPlane .canvas-node').length,
      status: window.qaAngleNode.querySelector('.flora-node-live-status')?.textContent || '',
      nodes: Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).map((node) => ({
        id: node.dataset.id,
        classes: node.className,
        name: node.dataset.imageName || '',
        generating: node.dataset.generating || '',
      })),
    }))
    assert.equal(afterCancel.nodeCount, 1, `取消后应只剩来源节点，实际 ${afterCancel.nodeCount}：${JSON.stringify(afterCancel.nodes)}`)
    assert.ok(afterCancel.status.includes('已取消'), `取消后来源节点应提示：${afterCancel.status}`)

    // 成功：占位节点直接填图，不额外新建节点。
    taskStatus = 'success'
    await page.locator('[data-qa-angle-node="primary"] [data-flora-action="angle"]').click()
    await page.waitForSelector('#canvasAngleDialog:not([hidden])')
    await page.locator('[data-angle-submit]').click()
    await page.waitForFunction(() => !document.querySelector('[data-image-generating]')
      && document.querySelectorAll('#canvasPlane .canvas-node').length === 2, null, { timeout: 20000 })
    // 完成提示在写历史之后才落下，等它出现再断言。
    await page.waitForFunction(() => (window.qaAngleNode.querySelector('.flora-node-live-status')?.textContent || '').includes('已完成'), null, { timeout: 20000 })
    const afterSuccess = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#canvasPlane .canvas-node'))
      const result = nodes.find((node) => node !== window.qaAngleNode)
      return {
        nodeCount: nodes.length,
        // 画布图片走缩略图资源，原始地址记在 dataset 与 data-original-src 上。
        resultSrc: result?.dataset.resultSrc || result?.dataset.imageSrc || '',
        hasImage: Boolean(result?.querySelector('img')),
        name: result?.dataset.imageName || '',
        status: window.qaAngleNode.querySelector('.flora-node-live-status')?.textContent || '',
      }
    })
    assert.equal(afterSuccess.nodeCount, 2, `成功后应是来源 + 结果两个节点，实际 ${afterSuccess.nodeCount}`)
    assert.equal(afterSuccess.hasImage, true, '成功结果应填进占位节点')
    assert.ok(String(afterSuccess.resultSrc).includes('crop-result'), `结果节点应记住返回的图片地址：${afterSuccess.resultSrc}`)
    assert.ok(String(afterSuccess.name).includes('换角度结果'), `结果节点名称：${afterSuccess.name}`)
    assert.ok(afterSuccess.status.includes('已完成'), `成功后来源节点应提示：${afterSuccess.status}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/angle-dialog-result-1440.png') })

    // 失败：占位节点被回收，错误写回来源节点与画布状态。
    taskStatus = 'failed'
    await page.route(`**${ANGLE_API_URL}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: '工作流未安装' }) }))
    await page.locator('[data-qa-angle-node="primary"] [data-flora-action="angle"]').click()
    await page.waitForSelector('#canvasAngleDialog:not([hidden])')
    await page.locator('[data-angle-submit]').click()
    await page.waitForFunction(() => (document.querySelector('.canvas-status span:last-child')?.textContent || '').includes('失败'), null, { timeout: 20000 })
    const afterFailure = await page.evaluate(() => ({
      nodeCount: document.querySelectorAll('#canvasPlane .canvas-node').length,
      generating: Boolean(document.querySelector('[data-image-generating]')),
      canvasStatus: document.querySelector('.canvas-status span:last-child')?.textContent || '',
      nodeStatus: window.qaAngleNode.querySelector('.flora-node-live-status')?.textContent || '',
    }))
    assert.equal(afterFailure.generating, false, '失败后不应留下进行中的占位')
    assert.equal(afterFailure.nodeCount, 2, `失败后应回到来源 + 既有结果两个节点，实际 ${afterFailure.nodeCount}`)
    assert.ok(afterFailure.canvasStatus.includes('失败'), `画布状态应报错：${afterFailure.canvasStatus}`)
    assert.ok(afterFailure.nodeStatus.includes('失败'), `来源节点状态应报错：${afterFailure.nodeStatus}`)

    // Esc 关闭且不改参数。
    await page.locator('[data-qa-angle-node="primary"] [data-flora-action="angle"]').click()
    await page.waitForSelector('#canvasAngleDialog:not([hidden])')
    await page.keyboard.press('Escape')
    const afterEscape = await page.evaluate(() => ({
      hidden: document.querySelector('#canvasAngleDialog').hidden,
      horizontal: window.qaAngleNode.dataset.comfyQwenHorizontal,
    }))
    assert.equal(afterEscape.hidden, true, 'Esc 应关闭对话框')

    // 窄窗口：两列堆叠，控件仍可用。
    await page.setViewportSize({ width: 390, height: 780 })
    await page.evaluate(() => { selectCanvasNode(window.qaAngleNode) })
    await page.waitForTimeout(200)
    await page.evaluate(() => { openCanvasAngleDialog(window.qaAngleNode) })
    await page.waitForSelector('#canvasAngleDialog:not([hidden])')
    const narrow = await page.evaluate(() => {
      const panel = document.querySelector('.canvas-angle-dialog-panel')
      const body = document.querySelector('.canvas-angle-dialog-body')
      const box = panel.getBoundingClientRect()
      return {
        panelWidth: Math.round(box.width),
        panelHeight: Math.round(box.height),
        columns: getComputedStyle(body).gridTemplateColumns,
        fitsViewport: box.left >= 0 && box.right <= window.innerWidth + 0.5,
      }
    })
    assert.ok(narrow.panelWidth <= 390, `窄窗口面板宽度应适配视口，实际 ${narrow.panelWidth}`)
    assert.equal(narrow.fitsViewport, true, `窄窗口面板不应横向溢出：${JSON.stringify(narrow)}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/angle-dialog-390.png') })
    await page.evaluate(() => { closeCanvasAngleDialog() })
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    console.log(JSON.stringify({ ok: true, opened: { title: opened.title, presets: opened.presetLabels, ranges: opened.ranges }, afterPreset, afterDrag, narrow, submitted: submitted[0] }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
