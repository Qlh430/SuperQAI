// 节点层级回归：选中的节点连同它的悬浮工具栏/底部操作区必须压住其它节点。
// 画布按上板顺序给已挂载节点写 index+2 的 z-index，节点多起来就会盖住选中节点。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_IMAGE = process.env.CROP_SOURCE_IMAGE
  || 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\data\\output\\0e3154dd-c0cf-49cb-85de-09608bcd6c20_1791440818634_ad06c34d.png'
const SOURCE_URL = '/qa-assets/crop-source.png'
const NODE_COUNT = 24
const API_STUB = JSON.stringify({
  authenticated: false, boards: [], projects: [], resources: [], records: [],
  models: [], providers: [], preferences: {}, settings: {}, snapshots: [], users: [], groups: [],
})
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
    await page.route('**/api/image-thumbnails*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item: { thumbnailUrl: SOURCE_URL, width: 1536, height: 1024, lightweight: false } }),
    }))
    await page.route('**/qa-assets/crop-source.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
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
    await page.evaluate(async ({ sourceUrl, nodeCount }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-stacking-board'
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
      // 依次叠加出足够多的节点，让上板顺序的 z-index 超过旧实现的固定 20。
      window.qaNodes = []
      for (let index = 0; index < nodeCount; index += 1) {
        window.qaNodes.push(addCanvasImage(sourceUrl, `N${String(index).padStart(2, '0')}.png`, {
          x: 160 + index * 26,
          y: 150 + index * 22,
        }))
      }
      canvasState.scale = 1
      canvasState.x = 40
      canvasState.y = 40
      applyCanvasTransformNow()
      selectCanvasNode(window.qaNodes[0])
    }, { sourceUrl: SOURCE_URL, nodeCount: NODE_COUNT })
    await page.waitForTimeout(700)
    // 再来一个带底部操作区（生成操作区）的节点：它的操作区向节点外延伸，
    // 正是截图里被别的节点盖住的那一块。
    await page.evaluate(() => {
      window.qaComposerNode = addCanvasApiNode({ x: 420, y: 420 })
      selectCanvasNode(window.qaComposerNode)
    })
    await page.waitForTimeout(500)
    const result = await page.evaluate(() => {
      const nodes = window.qaNodes.filter((node) => node.isConnected)
      const composerNode = window.qaComposerNode
      const others = nodes.filter((node) => node !== composerNode)
      const active = composerNode || window.qaNodes[0]
      const activeZ = Number(getComputedStyle(active).zIndex)
      const maxOtherZ = Math.max(...others.map((node) => Number(getComputedStyle(node).zIndex)))
      const toolbar = active.querySelector('.flora-node-toolbar')
      const box = toolbar.getBoundingClientRect()
      const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      const composer = active.querySelector('.flora-generator-composer')
      const composerBox = composer && !composer.hidden ? composer.getBoundingClientRect() : null
      const composerHit = composerBox
        ? document.elementFromPoint(composerBox.left + composerBox.width / 2, composerBox.top + 10)
        : null
      return {
        nodeCount: nodes.length,
        activeZ,
        maxOtherZ,
        activeIsComposerNode: active === composerNode,
        toolbarVisible: getComputedStyle(toolbar).visibility,
        toolbarHit: Boolean(centre && toolbar.contains(centre)),
        composerOpen: Boolean(composerBox),
        composerHitInside: composerBox ? Boolean(composerHit && composer.contains(composerHit)) : null,
        composerTop: composerBox ? Math.round(composerBox.top) : null,
      }
    })
    assert.ok(result.nodeCount >= 20, `应挂载足够多的节点复现层级问题，实际 ${result.nodeCount}`)
    assert.ok(
      result.activeZ > result.maxOtherZ,
      `选中节点的 z-index（${result.activeZ}）应高于其它节点（最高 ${result.maxOtherZ}）`,
    )
    assert.equal(result.toolbarVisible, 'visible', '选中节点应显示工具栏')
    assert.equal(result.toolbarHit, true, '选中节点的工具栏不应被其它节点挡住')
    assert.equal(result.activeIsComposerNode, true, '应选中带操作区的节点')
    assert.equal(result.composerOpen, true, '带操作区的节点选中后应展开操作区')
    assert.equal(result.composerHitInside, true, '选中节点的操作区顶部不应被其它节点挡住')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    console.log(JSON.stringify({ ok: true, ...result }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
