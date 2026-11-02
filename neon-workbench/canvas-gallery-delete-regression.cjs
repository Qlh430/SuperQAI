// 图集删除回归：删除按钮（含节点工具条的删除动作）不再弹确认框，直接删除并保留 Ctrl+Z 撤销。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_IMAGE = process.env.CROP_SOURCE_IMAGE
  || 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\data\\output\\0e3154dd-c0cf-49cb-85de-09608bcd6c20_1791440818634_ad06c34d.png'
const SOURCE_URL = '/qa-assets/crop-source.png'
const RESULT_URL = '/qa-assets/crop-result.png'
const ROWS = 2
const COLUMNS = 2
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/canvas/boards/*/viewport*', route => route.fulfill({ contentType: 'application/json', body: VIEWPORT_PAGE }))
    // 缩略图接口要回一个可用的条目并带上原图尺寸，否则节点图片会落到 error 状态。
    await page.route('**/api/image-thumbnails*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item: { thumbnailUrl: SOURCE_URL, width: 1536, height: 1024, lightweight: false } }),
    }))
    await page.route('**/api/upload-image', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: RESULT_URL }),
    }))
    await page.route('**/qa-assets/crop-source.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    await page.route('**/qa-assets/crop-result.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    // 默认用源码验证；设 CROP_USE_DEPLOYED=1 时改测运行时实际部署的脚本。
    if (process.env.CROP_USE_DEPLOYED !== '1') {
      const scriptSource = process.env.GENERATOR_SOURCE
        ? path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js')
        : path.join(__dirname, 'design-sources/script-before-save-bridge.js')
      await page.route('**/script.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: fs.readFileSync(scriptSource, 'utf8'),
      }))
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ sourceUrl }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-gallery-delete-board'
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
      canvasState.x = (innerWidth - node.offsetWidth) / 2 - Number(node.dataset.x)
      canvasState.y = 120 - Number(node.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(node)
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => window.qaCropNode?.querySelector('.canvas-image-upload img')?.naturalWidth > 0)

    // 先用 2×2 宫格裁切生成一个图集节点。
    await page.locator('[data-qa-crop-node="primary"] [data-flora-action="crop"]').click()
    // 裁剪现在是节点内联模式：宫格裁剪菜单里选 2×2 → 确认。
    await page.waitForSelector('#canvasInlineCrop')
    await page.locator('#canvasInlineCrop [data-crop-grid-menu]').click()
    await page.locator(`#canvasInlineCrop [data-crop-grid="${ROWS}x${COLUMNS}"]`).click()
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 30000 })
    await page.waitForSelector('#canvasPlane .canvas-node-gallery-container')

    const before = await page.evaluate(() => {
      const gallery = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      return {
        title: gallery.querySelector('.canvas-node-title')?.textContent || '',
        deleteButton: Boolean(gallery.querySelector('.canvas-node-delete')),
      }
    })
    assert.equal(before.deleteButton, true, '图集节点应带删除按钮')

    // 点删除：不允许再出现确认框。节点栏的 × 只在悬停/选中时可见，
    // 这里直接触发它的 click 处理函数，测的是“有没有确认框”这一段行为。
    await page.evaluate(() => {
      document.querySelector('#canvasPlane .canvas-node-gallery-container .canvas-node-delete').click()
    })
    await page.waitForTimeout(500)
    const afterDelete = await page.evaluate(() => {
      const panel = document.querySelector('#canvasDeleteConfirm')
      return {
        dialogHidden: panel ? panel.hidden : true,
        dialogAriaHidden: panel?.getAttribute('aria-hidden') ?? 'true',
        galleryCount: document.querySelectorAll('#canvasPlane .canvas-node-gallery-container').length,
        status: document.querySelector('.canvas-status span:last-child')?.textContent || '',
      }
    })
    assert.equal(afterDelete.dialogHidden, true, '删除图集不应再弹确认框')
    assert.equal(afterDelete.dialogAriaHidden, 'true', '确认框应保持 aria-hidden')
    assert.equal(afterDelete.galleryCount, 0, '图集节点应被直接删除')
    assert.ok(afterDelete.status.includes('已删除图集'), `状态应提示已删除图集，实际「${afterDelete.status}」`)

    // 撤销仍可恢复整个图集及其成员。
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)
    const afterUndo = await page.evaluate(() => {
      const gallery = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      return {
        restored: Boolean(gallery),
        members: gallery ? gallery.querySelectorAll('.canvas-gallery-member').length : 0,
      }
    })
    assert.equal(afterUndo.restored, true, 'Ctrl+Z 应恢复图集节点')
    assert.equal(afterUndo.members, ROWS * COLUMNS, `恢复后应保留 ${ROWS * COLUMNS} 张图片，实际 ${afterUndo.members}`)

    // 工具条删除入口（用户截图里那个垃圾桶图标）同样直接删除，不再弹框。
    await page.evaluate(() => {
      const gallery = document.querySelector('#canvasPlane .canvas-node-gallery-container')
      selectCanvasNode(gallery)
    })
    await page.waitForTimeout(300)
    const toolbarDeleteExists = await page.evaluate(() => Boolean(
      document.querySelector('#canvasPlane .canvas-node-gallery-container [data-flora-action="delete"]'),
    ))
    assert.equal(toolbarDeleteExists, true, '图集节点应有工具条删除入口')
    await page.evaluate(() => {
      document.querySelector('#canvasPlane .canvas-node-gallery-container [data-flora-action="delete"]').click()
    })
    await page.waitForTimeout(500)
    const afterToolbar = await page.evaluate(() => ({
      dialogHidden: document.querySelector('#canvasDeleteConfirm')?.hidden ?? true,
      galleryCount: document.querySelectorAll('#canvasPlane .canvas-node-gallery-container').length,
    }))
    assert.equal(afterToolbar.dialogHidden, true, '工具条删除图集也不应弹确认框')
    assert.equal(afterToolbar.galleryCount, 0, '工具条删除应直接移除图集节点')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    console.log(JSON.stringify({
      ok: true,
      title: before.title,
      dialog: 'removed',
      restoredMembers: afterUndo.members,
      status: afterDelete.status,
    }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
