// 画布右上角功能栏常驻 + Agent 面板不压功能栏：
// 1. 没有任何悬停/选中/焦点时，.canvas-actions 也必须可见且可点；
// 2. 打开 Agent 后，面板顶边要在功能栏下沿之下（不再重叠），底边仍在工作区里。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
  ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
  ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
  ['neon-canvas-surface.css', 'neon-canvas-surface.css', 'text/css'],
  ['neon-page-rebuild.css', 'neon-page-rebuild.css', 'text/css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/output/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
    await page.route('**/api/canvas/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source, type] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: type,
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-actions-board'
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
    // 把鼠标挪开、清空选中，制造「没有悬停也没有选中」的状态。
    await page.mouse.move(4, 900)
    await page.evaluate(() => { clearCanvasSelection(); document.activeElement?.blur?.() })
    await page.waitForTimeout(500)

    const read = async () => page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      const actions = document.querySelector('.canvas-actions')
      const style = getComputedStyle(actions)
      const box = actions.getBoundingClientRect()
      const reset = actions.querySelector('#canvasReset') || actions.querySelector('button:not([id])')
      const resetBox = reset?.getBoundingClientRect?.()
      const hit = resetBox ? document.elementFromPoint(resetBox.left + resetBox.width / 2, resetBox.top + resetBox.height / 2) : null
      const panel = document.querySelector('#canvasAgentPanel')
      const panelBox = panel?.getBoundingClientRect?.()
      const panelStyle = panel ? getComputedStyle(panel) : null
      const workspaceBox = document.querySelector('.canvas-workspace')?.getBoundingClientRect?.()
      return {
        actions: {
          opacity: style.opacity,
          visibility: style.visibility,
          pointerEvents: style.pointerEvents,
          box: { left: round(box.left), top: round(box.top), right: round(box.right), bottom: round(box.bottom) },
        },
        resetHit: Boolean(hit && (hit === reset || reset.contains(hit))),
        agentOpen: Boolean(document.querySelector('.canvas-workspace')?.classList.contains('canvas-agent-open')),
        panel: panelBox && panelStyle
          ? {
            top: round(panelBox.top),
            bottom: round(panelBox.bottom),
            height: round(panelBox.height),
            visibility: panelStyle.visibility,
            opacity: panelStyle.opacity,
            cssTop: panelStyle.top,
          }
          : null,
        workspaceBottom: workspaceBox ? round(workspaceBox.bottom) : null,
      }
    })

    const closed = await read()
    assert.equal(closed.actions.opacity, '1', `功能栏应常驻可见（不透明）：${JSON.stringify(closed.actions)}`)
    assert.equal(closed.actions.visibility, 'visible', `功能栏应常驻可见：${JSON.stringify(closed.actions)}`)
    assert.equal(closed.actions.pointerEvents, 'auto', `功能栏应可点：${JSON.stringify(closed.actions)}`)
    assert.equal(closed.resetHit, true, `功能栏按钮应命中自己：${JSON.stringify(closed)}`)

    // 打开 Agent
    await page.evaluate(() => document.querySelector('#canvasAgentToggle')?.click())
    await page.waitForTimeout(600)
    const opened = await read()
    assert.equal(opened.agentOpen, true, `点 Agent 后面板应打开：${JSON.stringify(opened)}`)
    assert.ok(opened.panel, `应有 Agent 面板：${JSON.stringify(opened)}`)
    assert.equal(opened.panel.visibility, 'visible', `面板应可见：${JSON.stringify(opened.panel)}`)
    assert.ok(opened.panel.top >= opened.actions.box.bottom + 4,
      `面板顶边应在功能栏下沿之下：面板 ${opened.panel.top} vs 功能栏底 ${opened.actions.box.bottom}`)
    assert.ok(Math.abs(opened.panel.bottom - opened.workspaceBottom) <= 2,
      `面板底边应仍在工作区底部：${JSON.stringify({ panel: opened.panel, workspaceBottom: opened.workspaceBottom })}`)
    assert.equal(opened.actions.opacity, '1', `打开 Agent 后功能栏仍应可见：${JSON.stringify(opened.actions)}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/canvas-actions-persistent-1440.png') })
    assert.deepEqual(errors, [], `页面错误：${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ ok: true, closed, opened }, null, 1))
  } finally {
    await browser.close()
  }
})()
