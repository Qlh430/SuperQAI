// 组框与组工具条：白透明的组框、可用的颜色/布局菜单、框选工具条只有打组与布局、
// 布局只排列不打组、颜色与布局落库、组的连接点在右边中间。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const SOURCE_URL = '/qa-assets/qa-group-frame.png'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
  ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
  ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
  ['neon-canvas-surface.css', 'neon-canvas-surface.css', 'text/css'],
]

// 把 rgba()/color(srgb ...) 统一成 0..1 的 {r,g,b,a}，用来判断"白色透明"。
function parseColor(value) {
  const numbers = String(value).match(/-?\d*\.?\d+/g)?.map(Number) || []
  if (String(value).startsWith('color(')) {
    return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers.length > 3 ? numbers[3] : 1 }
  }
  return { r: numbers[0] / 255, g: numbers[1] / 255, b: numbers[2] / 255, a: numbers.length > 3 ? numbers[3] : 1 }
}

function isWhiteish(color, { minAlpha, maxAlpha }) {
  return Math.abs(color.r - color.g) < 0.03 && Math.abs(color.g - color.b) < 0.03
    && color.r > 0.9 && color.a > minAlpha && color.a < maxAlpha
}

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route(`**${SOURCE_URL}`, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
    // GENERATOR_SOURCE 指向 neon-workbench/design-sources：改源码后、部署前先在这里验证。
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source, type] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: type,
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ sourceUrl }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-group-frame-board'
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
      const first = window.qaFrameFirst = addCanvasImage(sourceUrl, '框选 A.png', { x: 160, y: 200 })
      const second = window.qaFrameSecond = addCanvasImage(sourceUrl, '框选 B.png', { x: 660, y: 260 })
      canvasState.scale = 1
      canvasState.x = 60
      canvasState.y = 60
      applyCanvasTransformNow()
      clearCanvasSelection()
      // 框选后的状态：选中多个节点并让选择框可见（工具条只在框选后出现）。
      addCanvasNodeToSelection(first)
      addCanvasNodeToSelection(second)
      canvasState.selectionFrameVisible = true
      updateCanvasSelectionFrame()
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => ['qaFrameFirst', 'qaFrameSecond']
      .every((key) => window[key]?.querySelector('img')?.naturalWidth > 0), null, { timeout: 20000 })
    await page.waitForTimeout(400)

    // ---- 一、框选工具条只有打组与布局 ----
    const toolbar = await page.evaluate(() => {
      const box = document.querySelector('#canvasSelectionBox')
      const tools = box?.querySelector('.canvas-selection-tools')
      const rect = tools?.getBoundingClientRect()
      return {
        boxVisible: Boolean(box && !box.hidden),
        toolbarVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
        aboveSelection: Boolean(rect && rect.top < Math.min(...Array.from(canvasState.selectedIds)
          .map((id) => getCanvasNode(id).getBoundingClientRect().top))),
        buttons: Array.from(tools?.querySelectorAll('button') || []).map((button) => ({
          action: button.dataset.selectionAction,
          text: button.textContent.trim(),
          visible: button.getBoundingClientRect().width > 0,
        })),
      }
    })
    assert.equal(toolbar.boxVisible, true, '框选后应显示选择框')
    assert.equal(toolbar.toolbarVisible, true, `选择工具条应可见：${JSON.stringify(toolbar)}`)
    assert.equal(toolbar.aboveSelection, true, '工具条应在选中节点上方')
    assert.deepEqual(toolbar.buttons.map((item) => item.action), ['group', 'layout'], `选择工具条只应有打组与布局：${JSON.stringify(toolbar.buttons)}`)
    assert.deepEqual(toolbar.buttons.map((item) => item.text), ['打组', '布局'], `按钮文案：${JSON.stringify(toolbar.buttons)}`)
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-selection-toolbar-1440.png') })

    // ---- 二、框选后选布局：只排列、不打组 ----
    await page.locator('[data-selection-action="layout"]').click()
    await page.waitForTimeout(300)
    const selectionMenu = await page.evaluate(() => {
      const menu = document.querySelector('#canvasGroupMenu')
      const rect = menu.getBoundingClientRect()
      return {
        visible: Boolean(menu && !menu.hidden),
        panel: menu.dataset.groupMenu,
        target: menu.dataset.groupMenuTarget,
        options: Array.from(menu.querySelectorAll('[data-group-layout]')).map((button) => button.dataset.groupLayout),
        insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      }
    })
    assert.equal(selectionMenu.visible, true, '点「布局」应打开布局菜单')
    assert.equal(selectionMenu.panel, 'layout', `菜单应是布局面板：${JSON.stringify(selectionMenu)}`)
    assert.equal(selectionMenu.target, 'selection', '菜单目标是框选而不是组')
    assert.deepEqual(selectionMenu.options, ['grid', 'horizontal', 'vertical'], `布局选项：${JSON.stringify(selectionMenu.options)}`)
    assert.equal(selectionMenu.insideViewport, true, `布局菜单要在视口内：${JSON.stringify(selectionMenu)}`)
    // 再点一次同一个按钮应该收起菜单（不是重新打开）。
    await page.locator('[data-selection-action="layout"]').click()
    await page.waitForTimeout(200)
    assert.equal(await page.evaluate(() => document.querySelector('#canvasGroupMenu').hidden), true, '再点一次布局按钮应收起菜单')
    await page.locator('[data-selection-action="layout"]').click()
    await page.waitForTimeout(200)
    assert.equal(await page.evaluate(() => document.querySelector('#canvasGroupMenu').hidden), false, '布局按钮应能重新打开菜单')

    const beforeArrange = await page.evaluate(() => ({
      first: { x: Number(window.qaFrameFirst.dataset.x), y: Number(window.qaFrameFirst.dataset.y) },
      second: { x: Number(window.qaFrameSecond.dataset.x), y: Number(window.qaFrameSecond.dataset.y) },
    }))
    await page.locator('[data-group-layout="horizontal"]').click()
    await page.waitForTimeout(400)
    const arranged = await page.evaluate(() => ({
      first: { x: Number(window.qaFrameFirst.dataset.x), y: Number(window.qaFrameFirst.dataset.y) },
      second: { x: Number(window.qaFrameSecond.dataset.x), y: Number(window.qaFrameSecond.dataset.y) },
      groupCount: document.querySelectorAll('#canvasPlane .canvas-node-group').length,
      menuClosed: document.querySelector('#canvasGroupMenu').hidden,
    }))
    assert.equal(arranged.first.y, arranged.second.y, `水平布局后两个节点应同高：${JSON.stringify(arranged)}`)
    assert.ok(arranged.second.x > arranged.first.x, `水平布局后第二个节点应在右侧：${JSON.stringify(arranged)}`)
    // 排列保持选中范围的左上角不动，所以第一个节点不动、后面的节点被排过去。
    assert.ok(arranged.second.y !== beforeArrange.second.y || arranged.second.x !== beforeArrange.second.x,
      `水平布局应真的移动了后面的节点：${JSON.stringify(arranged)} vs ${JSON.stringify(beforeArrange)}`)
    assert.equal(arranged.groupCount, 0, '只选布局不应打组')
    assert.equal(arranged.menuClosed, true, '选完布局菜单应关闭')

    await page.evaluate(() => { undoCanvasCommand() })
    await page.waitForTimeout(300)
    const undone = await page.evaluate(() => ({
      first: { x: Number(window.qaFrameFirst.dataset.x), y: Number(window.qaFrameFirst.dataset.y) },
      second: { x: Number(window.qaFrameSecond.dataset.x), y: Number(window.qaFrameSecond.dataset.y) },
    }))
    assert.deepEqual(undone, beforeArrange, `布局应可撤销：${JSON.stringify(undone)} vs ${JSON.stringify(beforeArrange)}`)

    // ---- 三、只有点打组才真的打组 ----
    await page.locator('[data-selection-action="group"]').click()
    await page.waitForTimeout(400)
    const grouped = await page.evaluate(() => {
      const group = window.qaFrameGroup = document.querySelector('#canvasPlane .canvas-node-group')
      return {
        groupCount: document.querySelectorAll('#canvasPlane .canvas-node-group').length,
        memberIds: group ? getCanvasGroupMemberIds(group) : [],
        groupId: group?.dataset.id || '',
      }
    })
    assert.equal(grouped.groupCount, 1, '点打组应创建一个组')
    assert.equal(grouped.memberIds.length, 2, `组应有两个成员：${JSON.stringify(grouped.memberIds)}`)

    // ---- 四、组框是白色透明的一层 ----
    const frame = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const style = getComputedStyle(group, '::before')
      return { background: style.backgroundColor, borderColor: style.borderColor }
    })
    const fill = parseColor(frame.background)
    const border = parseColor(frame.borderColor)
    assert.ok(isWhiteish(fill, { minAlpha: 0.03, maxAlpha: 0.3 }), `组框底色应是白色透明：${frame.background}`)
    assert.ok(isWhiteish(border, { minAlpha: 0.12, maxAlpha: 0.45 }), `组框描边应是浅白色：${frame.borderColor}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-frame-default-1440.png') })

    // ---- 五、组的连接点在右边中间 ----
    const port = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      selectCanvasNode(group)
      const element = group.querySelector('.canvas-port')
      const style = getComputedStyle(element)
      const groupBox = group.getBoundingClientRect()
      const portBox = element.getBoundingClientRect()
      return {
        kind: element.dataset.canvasPortKind,
        position: style.position,
        right: style.right,
        opacity: style.opacity,
        portCenterX: portBox.x + portBox.width / 2,
        portCenterY: portBox.y + portBox.height / 2,
        groupRight: groupBox.right,
        groupRightEdgeInner: groupBox.right - 4,
        groupCenterY: groupBox.y + groupBox.height / 2,
        groupLeft: groupBox.left,
      }
    })
    assert.equal(port.kind, 'output', `组端口应是输出端口：${JSON.stringify(port)}`)
    assert.equal(port.position, 'absolute', `组端口应绝对定位（否则会被挤到组框左上角）：${port.position}`)
    assert.ok(Number.parseFloat(port.right) < 0, `组端口应挂在右边外侧：right=${port.right}`)
    assert.ok(port.portCenterX >= port.groupRightEdgeInner, `组端口应贴右边：${port.portCenterX} < ${port.groupRightEdgeInner}`)
    assert.ok(port.portCenterX > port.groupLeft + 200, `组端口不该在左侧：${port.portCenterX} vs 左边 ${port.groupLeft}`)
    assert.ok(Math.abs(port.portCenterY - port.groupCenterY) <= 2, `组端口应垂直居中：${port.portCenterY} vs ${port.groupCenterY}`)
    assert.equal(port.opacity, '1', '选中的组端口应可见')

    // ---- 六、颜色菜单：竖排 8 个色点，能真的选 ----
    await page.locator('.canvas-node-group [data-group-tool="color"]').click()
    await page.waitForTimeout(300)
    const palette = await page.evaluate(() => {
      const menu = document.querySelector('#canvasGroupMenu')
      const rect = menu.getBoundingClientRect()
      return {
        panel: menu.dataset.groupMenu,
        insideViewport: rect.left >= 8 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
        items: Array.from(menu.querySelectorAll('.canvas-group-swatch-button')).map((button) => {
          const swatch = button.querySelector('.canvas-group-swatch')
          const swatchBox = swatch.getBoundingClientRect()
          const buttonBox = button.getBoundingClientRect()
          return {
            value: button.dataset.groupColor,
            active: button.classList.contains('is-active'),
            buttonX: Math.round(buttonBox.x),
            buttonY: Math.round(buttonBox.y),
            swatchWidth: Math.round(swatchBox.width),
            swatchHeight: Math.round(swatchBox.height),
            swatchBackground: getComputedStyle(swatch).backgroundColor,
          }
        }),
      }
    })
    assert.equal(palette.panel, 'color', '点色点应打开颜色面板')
    assert.equal(palette.items.length, 8, `色板应有 8 个颜色（含默认）：${palette.items.length}`)
    assert.deepEqual(palette.items.map((item) => item.value), ['', '#ef4444', '#f97316', '#eab308', '#84cc16', '#14b8a6', '#3b82f6', '#a855f7'], `色板内容：${JSON.stringify(palette.items.map((item) => item.value))}`)
    assert.ok(palette.items.every((item) => item.swatchWidth >= 16 && item.swatchHeight >= 16), `色点必须有尺寸：${JSON.stringify(palette.items)}`)
    assert.equal(new Set(palette.items.map((item) => item.buttonX)).size, 1, `色点应竖排：${JSON.stringify(palette.items.map((item) => item.buttonX))}`)
    for (let index = 1; index < palette.items.length; index += 1) {
      assert.ok(palette.items[index].buttonY > palette.items[index - 1].buttonY, '色点应自上而下排列')
    }
    assert.equal(palette.items[0].active, true, '默认色应是当前选中色')
    assert.equal(parseColor(palette.items[0].swatchBackground).a, 0, `「默认」应是空心圈：${palette.items[0].swatchBackground}`)
    assert.equal(palette.insideViewport, true, '颜色菜单要完整落在视口内')
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-color-palette-1440.png') })

    await page.locator('.canvas-group-menu [data-group-color="#ef4444"]').click()
    await page.waitForTimeout(300)
    const colored = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const style = getComputedStyle(group, '::before')
      const active = document.querySelector('.canvas-group-menu .canvas-group-swatch-button.is-active')
      return {
        groupColor: group.dataset.groupColor,
        background: style.backgroundColor,
        borderColor: style.borderColor,
        activeValue: active?.dataset.groupColor || '',
      }
    })
    const coloredFill = parseColor(colored.background)
    assert.equal(colored.groupColor, '#ef4444', `组应记录所选颜色：${JSON.stringify(colored)}`)
    assert.equal(colored.activeValue, '#ef4444', '颜色面板应把所选颜色标为当前')
    assert.ok(coloredFill.r > coloredFill.g && coloredFill.r > coloredFill.b, `组框底色应带所选色：${colored.background}`)
    assert.ok(parseColor(colored.borderColor).r > 0.2, `组框描边应带所选色：${colored.borderColor}`)

    // ---- 七、组内布局 + 撤销 ----
    const beforeGroupLayout = await page.evaluate(() => getCanvasGroupMemberIds(window.qaFrameGroup)
      .map((id) => ({ id, x: Number(getCanvasNode(id).dataset.x), y: Number(getCanvasNode(id).dataset.y) })))
    await page.locator('.canvas-node-group [data-group-tool="layout"]').click()
    await page.waitForTimeout(200)
    await page.locator('.canvas-group-menu [data-group-layout="vertical"]').click()
    await page.waitForTimeout(400)
    const groupLayout = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const members = getCanvasGroupMemberIds(group).map((id) => getCanvasNode(id))
      const groupBox = group.getBoundingClientRect()
      return {
        layout: group.dataset.groupLayout,
        xs: members.map((node) => Number(node.dataset.x)),
        fits: members.every((node) => {
          const box = node.getBoundingClientRect()
          return box.left >= groupBox.left - 1 && box.right <= groupBox.right + 1
            && box.top >= groupBox.top - 1 && box.bottom <= groupBox.bottom + 1
        }),
        positions: members.map((node) => ({ id: node.dataset.id, x: Number(node.dataset.x), y: Number(node.dataset.y) })),
      }
    })
    assert.equal(new Set(groupLayout.xs).size, 1, `垂直布局后成员应同一列：${JSON.stringify(groupLayout)}`)
    assert.ok(groupLayout.positions.some((item, index) => item.y !== beforeGroupLayout[index]?.y), '垂直布局应真的移动了成员')
    assert.equal(groupLayout.fits, true, `组框应贴合排列后的成员：${JSON.stringify(groupLayout)}`)
    assert.equal(groupLayout.layout, 'vertical', `组应记住所选布局：${groupLayout.layout}`)
    await page.evaluate(() => { undoCanvasCommand() })
    await page.waitForTimeout(300)
    const groupUndone = await page.evaluate(() => getCanvasGroupMemberIds(window.qaFrameGroup)
      .map((id) => ({ id, x: Number(getCanvasNode(id).dataset.x), y: Number(getCanvasNode(id).dataset.y) })))
    assert.deepEqual(groupUndone, beforeGroupLayout, `组内布局应可撤销：${JSON.stringify(groupUndone)}`)

    // ---- 八、颜色与布局落库（保存 → 恢复一轮）----
    const savedModel = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      return syncCanvasNodeModel(group) || {}
    })
    assert.equal(savedModel.groupColor, '#ef4444', `保存的组模型应带颜色：${JSON.stringify(savedModel.groupColor)}`)
    assert.equal(savedModel.groupLayout, 'vertical', `保存的组模型应带布局：${JSON.stringify(savedModel.groupLayout)}`)
    const restored = await page.evaluate(async () => {
      const board = serializeCanvasBoard()
      clearCanvasPlane()
      restoreCanvasBoard(board)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      return {
        color: group?.dataset.groupColor || '',
        layout: group?.dataset.groupLayout || '',
        frameBackground: group ? getComputedStyle(group, '::before').backgroundColor : '',
      }
    })
    assert.equal(restored.color, '#ef4444', `恢复后组颜色应保留：${JSON.stringify(restored)}`)
    assert.equal(restored.layout, 'vertical', `恢复后组布局应保留：${JSON.stringify(restored)}`)
    assert.ok(parseColor(restored.frameBackground).r > parseColor(restored.frameBackground).g, `恢复后组框底色应仍是所选色：${restored.frameBackground}`)

    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      if (group) selectCanvasNode(group)
    })
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-frame-menu-1440.png') })
    console.log(JSON.stringify({ ok: true, toolbar, arranged, frame, port, palette: palette.items.map(({ value, active }) => ({ value, active })), colored, groupLayout: { layout: groupLayout.layout, fits: groupLayout.fits }, restored }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
