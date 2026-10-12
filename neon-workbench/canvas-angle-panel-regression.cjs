// 换角度面板两条回归：
// 1. 操作区始终完整：面板完整落在画布可视区里，内部不再被限高滚动（节点贴底时靠平移画布腾地方）；
// 2. 方块上下方向：鼠标下移 → 垂直角变大（俯视）→ 方块顶面转向观察者（前脸上边更宽）。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
  ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
  ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
  ['neon-canvas-surface.css', 'neon-canvas-surface.css', 'text/css'],
]

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

function solidPng(width, height, [red, green, blue]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(2, 9)
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const offset = y * (1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      raw[offset + 1 + x * 3] = red
      raw[offset + 2 + x * 3] = green
      raw[offset + 3 + x * 3] = blue
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function decodePng(buffer) {
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const parts = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data.readUInt8(9)
    } else if (type === 'IDAT') parts.push(Buffer.from(data))
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const raw = zlib.inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const pixels = Buffer.alloc(width * height * 4)
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? line[index - channels] : 0
      const up = previous[index]
      const upLeft = index >= channels ? previous[index - channels] : 0
      if (filter === 1) line[index] = (line[index] + left) & 0xff
      else if (filter === 2) line[index] = (line[index] + up) & 0xff
      else if (filter === 3) line[index] = (line[index] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const estimate = left + up - upLeft
        const toLeft = Math.abs(estimate - left)
        const toUp = Math.abs(estimate - up)
        const toUpLeft = Math.abs(estimate - upLeft)
        const prediction = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
        line[index] = (line[index] + prediction) & 0xff
      }
    }
    previous = line
    for (let x = 0; x < width; x += 1) {
      const from = x * channels
      const to = (y * width + x) * 4
      pixels[to] = line[from]
      pixels[to + 1] = channels === 1 ? line[from] : line[from + 1]
      pixels[to + 2] = channels >= 3 ? line[from + 2] : line[from]
      pixels[to + 3] = 255
    }
  }
  return { width, height, pixels }
}

// 方块正面（带原图的那一面）在投影里的蓝色跨度：上边宽 = 方块顶转向观察者（俯视）。
function frontFaceSpans(image, topRatio = 0.2, bottomRatio = 0.8) {
  const spanAt = (y) => {
    let first = -1
    let last = -1
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4
      const [red, green, blue] = [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]]
      if (blue > 120 && blue > red + 25 && green > 90 && green < 200) {
        if (first < 0) first = x
        last = x
      }
    }
    return last < 0 ? 0 : last - first + 1
  }
  const rows = []
  for (let y = Math.round(image.height * 0.12); y < image.height * 0.95; y += 2) {
    const span = spanAt(y)
    if (span > 6) rows.push({ y, span })
  }
  const top = rows[Math.round(rows.length * topRatio)] || { span: 0 }
  const bottom = rows[Math.round(rows.length * bottomRatio)] || { span: 0 }
  return { rows: rows.length, top: top.span, bottom: bottom.span }
}

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    const sourcePng = solidPng(1024, 768, [120, 180, 240])
    await page.route('**/output/**', route => route.fulfill({ contentType: 'image/png', body: sourcePng }))
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
      canvasState.activeBoardId = 'qa-angle-panel-board'
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
      // 故意把节点放在很靠下的位置：面板必须有地方完整展开。
      window.qaAngleNode = addCanvasImage('/output/qa-angle-source.png', '角度源.png', { x: 420, y: 620 })
      canvasState.scale = 1
      canvasState.x = 60
      canvasState.y = 60
      applyCanvasTransformNow()
      selectCanvasNode(window.qaAngleNode)
    })
    await page.waitForTimeout(900)
    await page.evaluate(() => window.qaAngleNode.querySelector('[data-flora-action="angle"]').click())
    await page.waitForFunction(() => Boolean(document.querySelector('#canvasAngleDialog:not([hidden])')), null, { timeout: 5000 })
    await page.waitForTimeout(500)

    // 1. 操作区完整：面板整体在可视区里，内部不滚动
    const panel = await page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      const dialog = document.querySelector('#canvasAngleDialog')
      const panelBox = dialog.querySelector('.canvas-angle-dialog-panel').getBoundingClientRect()
      const body = dialog.querySelector('.canvas-angle-dialog-body')
      const viewport = document.querySelector('#infiniteCanvas').getBoundingClientRect()
      return {
        panel: { top: round(panelBox.top), bottom: round(panelBox.bottom), height: round(panelBox.height) },
        viewport: { top: round(viewport.top), bottom: round(viewport.bottom), height: round(viewport.height) },
        body: { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight },
        inlineMaxHeight: dialog.querySelector('.canvas-angle-dialog-panel').style.maxHeight || '',
        insideViewport: panelBox.top >= viewport.top - 1 && panelBox.bottom <= viewport.bottom + 1,
      }
    })
    assert.equal(panel.insideViewport, true, `面板应完整落在可视区里：${JSON.stringify(panel)}`)
    assert.ok(panel.body.scrollHeight <= panel.body.clientHeight + 1,
      `面板内容不该需要内部滚动：${JSON.stringify(panel.body)}`)
    assert.equal(panel.inlineMaxHeight, '', `不该再按剩余空间写死 max-height：${panel.inlineMaxHeight}`)

    // 2. 鼠标下移 → 垂直角变大（俯视）；方块顶面转向观察者（前脸上边更宽）
    const drag = await page.evaluate(() => {
      const dialog = document.querySelector('#canvasAngleDialog')
      dialog.querySelector('[data-angle-horizontal]').value = '0'
      dialog.querySelector('[data-angle-vertical]').value = '0'
      renderCanvasAngleDialog()
      return true
    })
    assert.equal(drag, true)
    const cubeBox = await page.evaluate(() => {
      const box = document.querySelector('.canvas-angle-cube').getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    })
    await page.mouse.move(cubeBox.x, cubeBox.y)
    await page.mouse.down()
    await page.mouse.move(cubeBox.x, cubeBox.y + 60, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const afterDrag = await page.evaluate(() => {
      const dialog = document.querySelector('#canvasAngleDialog')
      return {
        vertical: Number(dialog.querySelector('[data-angle-vertical]').value),
        hint: dialog.querySelector('[data-angle-hint]')?.textContent || '',
      }
    })
    assert.ok(afterDrag.vertical > 0, `鼠标下移应让垂直角变大（俯视）：${JSON.stringify(afterDrag)}`)
    assert.match(afterDrag.hint, /俯视/, `下移后提示应是俯视：${afterDrag.hint}`)

    // 像素判据用 45° 俯视（比拖出来的 20° 更明显），拖拽方向由上一步的滑杆读数断言。
    await page.evaluate(() => {
      const dialog = document.querySelector('#canvasAngleDialog')
      dialog.querySelector('[data-angle-horizontal]').value = '0'
      dialog.querySelector('[data-angle-vertical]').value = '45'
      renderCanvasAngleDialog()
    })
    await page.waitForTimeout(250)
    const clip = await page.evaluate(() => {
      const box = document.querySelector('.canvas-angle-stage').getBoundingClientRect()
      return { x: Math.max(0, Math.round(box.left)), y: Math.max(0, Math.round(box.top)), width: Math.round(box.width), height: Math.round(box.height) }
    })
    const shot = decodePng(await page.screenshot({ clip }))
    const spans = frontFaceSpans(shot)
    assert.ok(spans.rows > 8, `方块正面应可见：${JSON.stringify(spans)}`)
    assert.ok(spans.top > spans.bottom + 2,
      `俯视时方块顶面应转向观察者（前脸上边更宽）：${JSON.stringify(spans)}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/angle-panel-complete-1440.png') })

    // 3. 仰视方向相反：前脸下边更宽
    const lowShot = await page.evaluate(async () => {
      const dialog = document.querySelector('#canvasAngleDialog')
      dialog.querySelector('[data-angle-vertical]').value = '-30'
      renderCanvasAngleDialog()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return true
    })
    assert.equal(lowShot, true)
    const shot2 = decodePng(await page.screenshot({ clip }))
    const spans2 = frontFaceSpans(shot2)
    // 仰视最多只能到 −30°（滑杆下限），透视信号比 +45° 小，这里只判方向。
    assert.ok(spans2.bottom > spans2.top,
      `仰视时前脸下边应更宽：${JSON.stringify(spans2)}`)
    assert.deepEqual(errors, [], `页面错误：${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ ok: true, panel, afterDrag, spansAtTop: spans, spansAtBottom: spans2 }, null, 1))
  } finally {
    await browser.close()
  }
})()
