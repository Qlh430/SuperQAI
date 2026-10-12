// 图集机身收缩回归：裁切出的图集单元格下方不再留空白，底部状态行紧贴单元格。
// 图集以外的节点仍保持标准机身，不受这条规则影响。
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
// 视口接口会校验引擎版本：桩数据回「迁移中」既不带错，也不会用空页面覆盖测试里新建的节点。
const VIEWPORT_PAGE = JSON.stringify({ state: "migrating" })

;(async () => {
  const sourceBytes = fs.readFileSync(SOURCE_IMAGE)
  const errors = []
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: Number(process.env.FIT_VIEWPORT || 1600), height: 1100 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/canvas/boards/*/viewport*', route => route.fulfill({ contentType: 'application/json', body: VIEWPORT_PAGE }))
    await page.route('**/api/upload-image', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: RESULT_URL }) }))
    await page.route('**/qa-assets/crop-source.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    await page.route('**/qa-assets/crop-result.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    await page.route('**/api/image-thumbnails*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item: { thumbnailUrl: SOURCE_URL, width: 1536, height: 1024, lightweight: false } }),
    }))
    // 默认用源码验证；设 CROP_USE_DEPLOYED=1 时改测运行时实际部署的文件。
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
      canvasState.activeBoardId = 'qa-gallery-fit'
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
      const node = window.qaCropNode = addCanvasImage(sourceUrl, '裁切来源.png', { x: 120, y: 120 })
      node.dataset.qaCropNode = 'primary'
      canvasState.scale = 1
      canvasState.x = 120 - Number(node.dataset.x)
      canvasState.y = 120 - Number(node.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(node)
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => window.qaCropNode?.querySelector('.canvas-image-upload img')?.naturalWidth > 0)
    await page.locator('[data-qa-crop-node="primary"] [data-flora-action="crop"]').click()
    // 裁剪现在是节点内联模式：宫格裁剪菜单里选 9 宫格 → 确认。
    await page.waitForSelector('#canvasInlineCrop')
    await page.locator('#canvasInlineCrop [data-crop-grid-menu]').click()
    await page.locator('#canvasInlineCrop [data-crop-grid="3x3"]').click()
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 30000 })
    await page.waitForSelector('#canvasPlane .canvas-node-gallery-container')
    await page.waitForTimeout(600)

    const measured = await page.evaluate(() => {
      const node = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      const shell = node.querySelector(':scope > .flora-node-shell')
      const content = shell.querySelector(':scope > .flora-node-content')
      const body = content.querySelector('.flora-node-body-surface')
      const members = body.querySelector('.canvas-gallery-container-members')
      const status = shell.querySelector('.flora-node-live-status')
      const shellBox = shell.getBoundingClientRect()
      const contentBox = content.getBoundingClientRect()
      const membersBox = members.getBoundingClientRect()
      const statusBox = status.getBoundingClientRect()
      const sourceNode = window.qaCropNode
      const sourceShell = sourceNode.querySelector(':scope > .flora-node-shell')
      return {
        fitAttribute: node.dataset.floraFitContent || '',
        kind: node.dataset.floraKind || '',
        members: members.children.length,
        shellHeight: Math.round(shellBox.height),
        nodeHeight: Math.round(node.getBoundingClientRect().height),
        headerBand: Math.round(shellBox.top - node.getBoundingClientRect().top),
        insetTop: Math.round(contentBox.top - shellBox.top),
        bodyHeight: Math.round(body.getBoundingClientRect().height),
        statusHeight: Math.round(statusBox.height),
        tileGapToStatus: Math.round(statusBox.top - membersBox.bottom),
        bottomInset: Math.round(shellBox.bottom - statusBox.bottom),
        sourceFitAttribute: sourceShell ? (sourceNode.dataset.floraFitContent || '') : 'no-shell',
        sourceShellHeight: sourceShell ? Math.round(sourceShell.getBoundingClientRect().height) : 0,
        bodyScrollHeight: Math.round(body.scrollHeight),
        bodyStyle: {
          flex: getComputedStyle(body).flex,
          margin: getComputedStyle(body).margin,
          padding: getComputedStyle(body).padding,
        },
        galleryHeightVar: node.style.getPropertyValue('--flora-node-height'),
      }
    })

    assert.equal(measured.kind, 'gallery', `裁切结果应是图集节点，实际 ${measured.kind}`)
    assert.equal(measured.fitAttribute, 'true', '图集应启用按内容收缩')
    assert.equal(measured.members, 9, `图集应有 9 张图片，实际 ${measured.members}`)
    assert.ok(measured.shellHeight < 400, `图集机身应比标准 400 矮，实际 ${measured.shellHeight}`)
    assert.equal(
      measured.shellHeight,
      measured.insetTop + measured.bodyHeight + measured.bottomInset + measured.statusHeight,
      `机身高度应刚好等于内容区加底部状态行，实际 ${measured.shellHeight}`,
    )
    assert.ok(
      measured.tileGapToStatus >= 8 && measured.tileGapToStatus <= 32,
      `单元格与底部状态行之间不应留下大块空白，实际 ${measured.tileGapToStatus}px`,
    )
    assert.equal(
      measured.nodeHeight,
      measured.headerBand + measured.shellHeight,
      '节点总高应等于标题带加机身',
    )
    assert.notEqual(measured.sourceFitAttribute, 'true', '图片节点不应被图集收缩规则影响')

    // 重新挂载壳体（相当于重新渲染 / 恢复画布）后仍应保持收缩，而不是回到标准机身。
    await page.evaluate(() => {
      const node = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      window.CanvasFloraNodeShell.unmount(node)
      window.CanvasFloraNodeShell.mount(node)
    })
    await page.waitForTimeout(600)
    const afterRemount = await page.evaluate(() => {
      const node = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      const shell = node.querySelector(':scope > .flora-node-shell')
      return {
        fitAttribute: node.dataset.floraFitContent || '',
        shellHeight: Math.round(shell.getBoundingClientRect().height),
        galleryHeightVar: node.style.getPropertyValue('--flora-node-height'),
      }
    })
    assert.equal(afterRemount.shellHeight, measured.shellHeight, `重新挂载壳体后机身高度应保持 ${measured.shellHeight}，实际 ${afterRemount.shellHeight}`)

    // 内容块被拉伸撑满（offsetHeight / scrollHeight 都等于被撑满的高度）时也不能误判，
    // 否则会以为“内容比标准机身还高”，直接放弃收缩。
    const stretched = await page.evaluate(async () => {
      const node = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      const body = node.querySelector('.flora-node-body-surface')
      // 用内联 !important 强行把内容块撑到 384（等价于容器被拉伸填满），
      // 这时 offsetHeight / scrollHeight 都是 384，只有单元格实际占用仍然是 245。
      body.style.setProperty('height', '384px', 'important')
      body.style.setProperty('min-height', '384px', 'important')
      window.CanvasFloraNodeShell.syncToolbar(node)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const shell = node.querySelector(':scope > .flora-node-shell')
      const members = node.querySelector('.canvas-gallery-container-members')
      const box = shell.getBoundingClientRect()
      const membersBox = members.getBoundingClientRect()
      return {
        shellHeight: Math.round(box.height),
        bodyOffset: body.offsetHeight,
        membersInside: membersBox.bottom <= box.bottom + 0.5,
      }
    })
    assert.ok(stretched.bodyOffset > 300, `测试应真的把内容块撑高，实际 ${stretched.bodyOffset}`)
    assert.ok(stretched.shellHeight < 400, `内容块被撑高时仍应收缩，实际机身 ${stretched.shellHeight}`)
    assert.equal(stretched.membersInside, true, '收缩后单元格应仍在机身范围内')

    // 单元格不在 body surface 里（换一层包裹）时也要能收缩，不能整段跳过。
    const relocated = await page.evaluate(async () => {
      const node = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      const members = node.querySelector('.canvas-gallery-container-members')
      const resultArea = node.querySelector('.flora-node-result-area')
        || node.querySelector('.flora-node-content')
      resultArea.append(members)
      window.CanvasFloraNodeShell.refresh(node)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const shell = node.querySelector(':scope > .flora-node-shell')
      const box = shell.getBoundingClientRect()
      const membersBox = members.getBoundingClientRect()
      return {
        shellHeight: Math.round(box.height),
        membersInside: membersBox.bottom <= box.bottom + 0.5,
        fitAttribute: node.dataset.floraFitContent || '',
      }
    })
    assert.ok(relocated.shellHeight < 400, `单元格换包裹层后仍应收缩，实际机身 ${relocated.shellHeight}`)
    assert.equal(relocated.membersInside, true, '收缩后单元格应仍在机身范围内')
    assert.equal(relocated.fitAttribute, 'true', '仍应保持按内容收缩')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    console.log(JSON.stringify({ ok: true, ...measured }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
