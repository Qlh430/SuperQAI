// 添加节点菜单：去掉循环批处理与素材合集，「提示词文本」改名为「文本」。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    if (process.env.GENERATOR_SOURCE) {
      await page.route('**/script.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js'), 'utf8'),
      }))
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-canvas-menu-board'
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
    })
    await page.waitForTimeout(400)
    // 通过画布空白右键打开真实的添加节点菜单。
    const plane = await page.locator('#infiniteCanvas').boundingBox()
    await page.mouse.click(plane.x + 320, plane.y + 240, { button: 'right' })
    await page.waitForTimeout(200)
    const opened = await page.evaluate(() => {
      const menu = document.querySelector('#canvasNodeMenu')
      return { visible: Boolean(menu) && !menu.hidden && getComputedStyle(menu).display !== 'none' }
    })
    if (!opened.visible) {
      // 右键菜单可能先弹出上下文菜单；退回到“添加节点”入口。
      await page.locator('#canvasContextMenu [data-canvas-action="add-node"]').click()
      await page.waitForTimeout(200)
    }
    const menu = await page.evaluate(() => {
      const menu = document.querySelector('#canvasNodeMenu')
      return {
        visible: !menu.hidden && getComputedStyle(menu).display !== 'none',
        groups: Array.from(menu.querySelectorAll('.canvas-menu-group-label')).map(item => item.textContent.trim()),
        entries: Array.from(menu.querySelectorAll('button[data-canvas-node]')).map(button => ({
          key: button.dataset.canvasNode,
          label: button.querySelector('span:last-child')?.textContent?.trim() || '',
        })),
      }
    })
    assert.equal(menu.visible, true, '添加节点菜单应打开')
    assert.deepEqual(menu.groups, ['添加节点', '生成节点', '添加资源'], `菜单分组：${JSON.stringify(menu.groups)}`)
    assert.deepEqual(menu.entries.map(entry => entry.key), ['note', 'text', 'image-generator', 'video-generator', 'audio-generator', 'director3d', 'asset-upload'],
      `菜单入口清单：${JSON.stringify(menu.entries)}`)
    assert.deepEqual(menu.entries.map(entry => entry.label), ['便签', '文本', '图片生成', '视频生成', '音频生成', '3D 导演台', '上传'],
      `菜单入口文案：${JSON.stringify(menu.entries)}`)
    assert.equal(menu.entries.some(entry => entry.key === 'loop'), false, '不再提供循环批处理')
    assert.equal(menu.entries.some(entry => entry.key === 'asset-collection'), false, '不再提供素材合集')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/canvas-node-menu.png') })
    console.log(JSON.stringify({ ok: true, groups: menu.groups, entries: menu.entries }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
