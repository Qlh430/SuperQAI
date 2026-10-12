// 连线要贴住节点：线从发送节点的右边缘起、到接收节点的左边缘止。
// 端口本身（位置、大小、样式）不动，所以端口圆心仍在节点外 28px 处。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
  ['flora-connection-interaction.js', 'flora-connection-interaction.js', 'application/javascript'],
  ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
  ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
  ['neon-canvas-surface.css', 'neon-canvas-surface.css', 'text/css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/output/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
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
      canvasState.activeBoardId = 'qa-connection-edge-board'
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
      window.qaEdgeSource = addCanvasImage('/output/qa-edge-source.png', '线源.png', { x: 120, y: 200 })
      window.qaEdgeTarget = addCanvasImageGeneratorNode({ x: 760, y: 200 }, { imageName: '线目标' })
      canvasState.scale = 1
      canvasState.x = 60
      canvasState.y = 40
      applyCanvasTransformNow()
      connectCanvasNodes(window.qaEdgeSource.dataset.id, window.qaEdgeTarget.dataset.id, 'input', 'output')
    })
    await page.waitForTimeout(600)

    const read = async () => page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      const source = window.qaEdgeSource
      const target = window.qaEdgeTarget
      const svg = document.querySelector('#canvasConnections')
      const wire = svg?.querySelector('path.canvas-connection-path, path')
      const numbers = (wire?.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []
      const start = numbers.length >= 2 ? { x: numbers[0], y: numbers[1] } : null
      const end = numbers.length >= 2 ? { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] } : null
      const inputPort = Array.from(target.querySelectorAll('[data-canvas-port]')).find((item) => item.dataset.canvasPort === 'input')
      const outputPort = Array.from(source.querySelectorAll('[data-canvas-port]')).find((item) => item.dataset.canvasPort === 'output')
      // 用画布自己的端口取点函数量（连线用的就是它），避免换算口径不一致。
      const outCenter = getCanvasPortPoint(source, 'output')
      const inCenter = getCanvasPortPoint(target, 'input')
      const sourceBox = getCanvasNodeBox(source)
      const targetBox = getCanvasNodeBox(target)
      return {
        start, end,
        outCenter, inCenter,
        sourceRight: round(sourceBox.right),
        targetLeft: round(targetBox.left),
        portArrow: (() => {
          const style = getComputedStyle(outputPort)
          return { right: style.right, width: style.width, height: style.height }
        })(),
        portOffsetFromEdge: round(outCenter.x - sourceBox.right),
      }
    })

    const geometry = await read()
    assert.ok(geometry.start, `应有连线路径：${JSON.stringify(geometry)}`)
    // 线端贴在节点边框上（容差 1px）
    assert.ok(Math.abs(geometry.start.x - geometry.sourceRight) <= 1,
      `线应从发送节点的右边缘起：start=${geometry.start.x} 右边缘=${geometry.sourceRight}`)
    assert.ok(Math.abs(geometry.end.x - geometry.targetLeft) <= 1,
      `线应到接收节点的左边缘止：end=${geometry.end.x} 左边缘=${geometry.targetLeft}`)
    // 同一行时 y 仍对齐端口中心
    assert.ok(Math.abs(geometry.start.y - geometry.outCenter.y) <= 1,
      `水平连线应与端口同一行：${geometry.start.y} vs ${geometry.outCenter.y}`)
    assert.ok(Math.abs(geometry.end.y - geometry.inCenter.y) <= 1,
      `水平连线应与端口同一行：${geometry.end.y} vs ${geometry.inCenter.y}`)
    // 端口本身没动：圆心仍在节点外 28px，尺寸样式照旧
    assert.ok(Math.abs(geometry.portOffsetFromEdge - 28) <= 1,
      `端口圆心仍在节点外 28px：${JSON.stringify(geometry)}`)
    assert.equal(geometry.portArrow.width, '28px', `端口尺寸不变：${JSON.stringify(geometry.portArrow)}`)
    assert.equal(geometry.portArrow.height, '28px', `端口尺寸不变：${JSON.stringify(geometry.portArrow)}`)
    assert.equal(geometry.portArrow.right, '-42px', `端口位置不变：${JSON.stringify(geometry.portArrow)}`)

    // 斜向连线也要落在边框上（且仍然共用同一个束点，见下一段）
    const diagonal = await page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      setCanvasNodePoint(window.qaEdgeTarget, { x: 820, y: 520 })
      placeCanvasNode(window.qaEdgeTarget)
      renderCanvasConnectionsNow()
      const svg = document.querySelector('#canvasConnections')
      const wire = svg?.querySelector('path.canvas-connection-path, path')
      const numbers = (wire?.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []
      const start = { x: numbers[0], y: numbers[1] }
      const end = { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] }
      const sourceBox = getCanvasNodeBox(window.qaEdgeSource)
      const targetBox = getCanvasNodeBox(window.qaEdgeTarget)
      return {
        start, end,
        onSourceEdge: Math.abs(start.x - sourceBox.right) <= 1,
        onTargetEdge: Math.abs(end.x - targetBox.left) <= 1,
        startInsideSource: start.x >= sourceBox.left - 1 && start.x <= sourceBox.right + 1,
        endInsideTarget: end.x >= targetBox.left - 1 && end.x <= targetBox.right + 1,
      }
    })
    assert.equal(diagonal.onSourceEdge, true, `斜向线也应起于发送节点右边缘：${JSON.stringify(diagonal)}`)
    assert.equal(diagonal.onTargetEdge, true, `斜向线也应止于接收节点左边缘：${JSON.stringify(diagonal)}`)

    // 一束分散：同一个端口出去的多根线必须共用同一个起点（束点贴在节点边上），
    // 不是各自算各自的交点——那样看着就散了。
    const bundle = await page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      const source = window.qaEdgeSource
      setCanvasNodePoint(window.qaEdgeTarget, { x: 820, y: 200 })
      placeCanvasNode(window.qaEdgeTarget)
      const targets = [
        window.qaEdgeTarget,
        addCanvasImageGeneratorNode({ x: 880, y: 700 }, { imageName: '束点目标 A' }),
        addCanvasImageGeneratorNode({ x: 880, y: -260 }, { imageName: '束点目标 B' }),
      ]
      connectCanvasNodes(source.dataset.id, targets[1].dataset.id, 'input', 'output')
      connectCanvasNodes(source.dataset.id, targets[2].dataset.id, 'input', 'output')
      renderCanvasConnectionsNow()
      const wires = Array.from(document.querySelectorAll('#canvasConnections path.canvas-connection-path')).map((path) => {
        const numbers = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || []
        return { from: { x: round(numbers[0]), y: round(numbers[1]) }, to: { x: round(numbers[numbers.length - 2]), y: round(numbers[numbers.length - 1]) } }
      })
      const sourceBox = getCanvasNodeBox(source)
      const port = getCanvasPortPoint(source, 'output')
      return {
        count: wires.length,
        starts: wires.map((wire) => `${wire.from.x},${wire.from.y}`),
        uniqueStarts: [...new Set(wires.map((wire) => `${wire.from.x},${wire.from.y}`))],
        allOnRightEdge: wires.every((wire) => Math.abs(wire.from.x - round(sourceBox.right)) <= 1),
        portCenter: `${round(port.x)},${round(port.y)}`,
        edgeRight: round(sourceBox.right),
        removed: targets.slice(1).map((node) => node.dataset.id),
      }
    })
    assert.equal(bundle.count, 3, `应有三条线从同一个端口出去：${JSON.stringify(bundle)}`)
    assert.equal(bundle.uniqueStarts.length, 1, `三条线必须共用同一个束点：${JSON.stringify(bundle)}`)
    assert.equal(bundle.allOnRightEdge, true, `束点应贴在节点右边缘上：${JSON.stringify(bundle)}`)
    assert.notEqual(bundle.uniqueStarts[0], bundle.portCenter, `束点应从端口圆心挪到节点边：${JSON.stringify(bundle)}`)
    assert.equal(bundle.uniqueStarts[0].split(',')[0], String(bundle.edgeRight), `束点 x 应等于节点右边缘：${JSON.stringify(bundle)}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/connection-node-edge-1600.png') })
    assert.deepEqual(errors, [], `页面错误：${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ ok: true, geometry, diagonal, bundle }, null, 1))
  } finally {
    await browser.close()
  }
})()
