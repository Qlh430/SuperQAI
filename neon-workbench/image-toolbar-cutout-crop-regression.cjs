// 图片节点工具栏：抠图 / 裁剪必须从工具栏可用，并且工作台要盖在画布引擎层之上；
// 右键菜单只保留下载与绘制遮罩。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['flora-node-shell.js', 'flora-node-shell.js'],
  ['flora-node-shell.css', 'flora-node-shell.css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/output/qa-image-tools.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: served.endsWith('.css') ? 'text/css' : 'application/javascript',
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-image-tools-board'
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
      const node = window.qaImage = addCanvasImage('/output/qa-image-tools.png', '抠图裁剪测试.png', { x: 200, y: 140 })
      node.dataset.qaImage = 'primary'
      canvasState.scale = 1
      canvasState.x = (innerWidth - node.offsetWidth) / 2 - Number(node.dataset.x)
      canvasState.y = 180 - Number(node.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(node)
    })
    await page.waitForFunction(() => window.qaImage.querySelector('.canvas-image-upload img')?.naturalWidth > 0)
    await page.waitForTimeout(300)

    // 1. 工具栏动作：抠图 / 裁剪已加入，且顺序在放大之后、下载之前。
    const toolbar = await page.evaluate(() => {
      const node = window.qaImage
      const buttons = Array.from(node.querySelectorAll('.flora-node-toolbar button'))
      return {
        actions: buttons.map(button => ({ action: button.dataset.floraAction, hidden: button.hidden, title: button.title })),
        visibleActions: buttons.filter(button => !button.hidden).map(button => button.dataset.floraAction),
      }
    })
    assert.deepEqual(toolbar.visibleActions, ['preview', 'upscale', 'cutout', 'crop', 'outpaint', 'angle', 'download', 'replace', 'delete'],
      `图片工具栏可见动作：${JSON.stringify(toolbar.visibleActions)}`)
    const cutoutTitle = toolbar.actions.find(item => item.action === 'cutout')?.title || ''
    const cropTitle = toolbar.actions.find(item => item.action === 'crop')?.title || ''
    assert.equal(cutoutTitle, 'AI 抠图', `抠图按钮标题：${cutoutTitle}`)
    assert.equal(cropTitle, '裁剪图片', `裁剪按钮标题：${cropTitle}`)

    // 2. 抠图：面板挂在原节点下方（不再是铺满视口的模态框），中心点仍要命中面板。
    await page.locator('[data-qa-image="primary"] [data-flora-action="cutout"]').click()
    await page.waitForTimeout(600)
    const cutout = await page.evaluate(() => {
      const modal = document.querySelector('.canvas-cutout-modal')
      if (!modal || modal.hidden) return { open: false }
      const box = modal.getBoundingClientRect()
      // 面板贴在节点下方，节点靠下时面板下半部分会落在窗口外，所以按上沿内侧取命中点。
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 20)
      return {
        open: true,
        insideNode: Boolean(window.qaImage.querySelector('.canvas-cutout-modal')),
        className: modal.className,
        zIndex: Number(getComputedStyle(modal).zIndex),
        hitInsideModal: Boolean(hit && modal.contains(hit)),
        modalAttr: modal.querySelector('.canvas-cutout-dialog')?.getAttribute('aria-modal') || null,
        belowNode: Math.abs(box.top - (window.qaImage.getBoundingClientRect().bottom + 12)) <= 2,
      }
    })
    assert.equal(cutout.open, true, '点击抠图应打开抠图弹窗')
    assert.equal(cutout.insideNode, true, '抠图面板应挂在原节点内')
    assert.equal(cutout.modalAttr, 'false', `抠图面板不再是模态框：${cutout.modalAttr}`)
    assert.equal(cutout.belowNode, true, '抠图面板应贴在节点下沿')
    assert.equal(cutout.hitInsideModal, true, '抠图弹窗必须显示在画布之上，中心点应命中弹窗')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/image-toolbar-cutout.png') })
    await page.locator('.canvas-cutout-modal .canvas-cutout-close').click()
    await page.waitForTimeout(300)

    // 3. 裁剪：内联在原节点上（不再弹独立工作台），带模式与比例/宫格入口。
    await page.locator('[data-qa-image="primary"] [data-flora-action="crop"]').click()
    await page.waitForTimeout(500)
    const crop = await page.evaluate(() => {
      const host = document.querySelector('#canvasInlineCrop')
      if (!host) return { open: false }
      const node = document.querySelector('[data-qa-image="primary"]')
      const box = host.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 12)
      return {
        open: true,
        insideNode: Boolean(node?.contains(host)),
        hitInsideHost: Boolean(hit && host.contains(hit)),
        actions: Array.from(host.querySelectorAll('.canvas-inline-crop-bar button')).map(button => button.textContent.trim()),
        lines: host.querySelectorAll('[data-crop-line]').length,
      }
    })
    assert.equal(crop.open, true, '点击裁剪应在原节点上打开裁剪界面')
    assert.equal(crop.insideNode, true, '裁剪界面应挂在来源节点内')
    assert.equal(crop.hitInsideHost, true, '裁剪界面必须能被点到，不能被节点内容挡住')
    assert.deepEqual(crop.actions, ['取消', '宫格裁剪', '宽高比', '确认'], `裁剪操作条：${crop.actions}`)
    assert.equal(crop.lines, 4, `裁剪线应有 4 条，实际 ${crop.lines}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/image-toolbar-crop.png') })
    await page.locator('#canvasInlineCrop [data-crop-cancel]').click()
    await page.waitForTimeout(200)

    // 4. 右键菜单：图片节点不再提供抠图/裁剪，仍保留下载与绘制遮罩。
    const image = await page.locator('[data-qa-image="primary"] .canvas-image-upload img').boundingBox()
    await page.mouse.click(image.x + image.width / 2, image.y + image.height / 2, { button: 'right' })
    await page.waitForTimeout(200)
    const menu = await page.evaluate(() => {
      const menu = document.querySelector('#canvasImageMenu')
      return {
        visible: Boolean(menu) && !menu.hidden,
        visibleActions: Array.from(menu?.querySelectorAll('[data-image-menu-action]') || [])
          .filter(button => !button.hidden)
          .map(button => button.dataset.imageMenuAction),
      }
    })
    assert.equal(menu.visible, true, '图片右键菜单应打开')
    assert.deepEqual(menu.visibleActions, ['download', 'mask'], `图片右键菜单只剩下载与绘制遮罩：${JSON.stringify(menu.visibleActions)}`)
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    console.log(JSON.stringify({ ok: true, toolbar: toolbar.visibleActions, cutout, crop, menu: menu.visibleActions }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
