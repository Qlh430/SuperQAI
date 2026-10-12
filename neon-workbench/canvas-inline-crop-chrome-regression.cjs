// 裁剪编辑器的两处外观回归：
// 1. 「取消」按钮内容（✕ + 取消）要完整落在按钮框里并居中，和「确认」同一套；
// 2. 裁剪舞台要跟着卡片圆角裁（16px），图片四角不能顶出圆角框外。
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
const SOLID = [240, 60, 60]

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
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1
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

function pixelAt(image, x, y) {
  const px = Math.round(x)
  const py = Math.round(y)
  const index = (py * image.width + px) * 4
  return [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]]
}

function near(color, expected, tolerance = 24) {
  return color.every((value, index) => Math.abs(value - expected[index]) <= tolerance)
}

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    const sourcePng = solidPng(1024, 768, SOLID)
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
      canvasState.activeBoardId = 'qa-crop-chrome-board'
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
      window.qaCropNode = addCanvasImage('/output/qa-crop-source.png', '裁剪源.png', { x: 320, y: 200 })
      canvasState.scale = 1
      canvasState.x = 60
      canvasState.y = 60
      applyCanvasTransformNow()
      selectCanvasNode(window.qaCropNode)
    })
    await page.waitForFunction(() => window.qaCropNode.querySelector('.flora-node-result-area img')?.naturalWidth > 0, null, { timeout: 15000 })
    await page.waitForTimeout(400)

    // 打开裁剪面板
    await page.evaluate(() => window.qaCropNode.querySelector('[data-flora-action="crop"]').click())
    await page.waitForFunction(() => Boolean(document.querySelector('#canvasInlineCrop [data-crop-stage]') || document.querySelector('.canvas-inline-crop [data-crop-stage]')), null, { timeout: 5000 })
    await page.waitForTimeout(400)

    const chrome = await page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      const dialog = document.querySelector('.canvas-inline-crop')
      const cancel = dialog?.querySelector('[data-crop-cancel]')
      const confirm = dialog?.querySelector('[data-crop-confirm]')
      const stage = dialog?.querySelector('[data-crop-stage]')
      const media = window.qaCropNode.querySelector('.flora-node-result-area > .canvas-image-upload, .flora-node-result-area > .canvas-node-result')
      const center = (element) => {
        const box = element.getBoundingClientRect()
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, box }
      }
      const contentBox = () => {
        const range = document.createRange()
        range.selectNodeContents(cancel)
        const box = range.getBoundingClientRect()
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }
      }
      const cancelBox = cancel.getBoundingClientRect()
      const content = contentBox()
      const cancelStyle = getComputedStyle(cancel)
      const stageStyle = stage ? getComputedStyle(stage) : null
      let mediaBox = null
      if (media?.getBoundingClientRect) {
        const box = media.getBoundingClientRect()
        mediaBox = { left: round(box.left), top: round(box.top), width: round(box.width), height: round(box.height) }
      }
      return {
        cancel: {
          box: { left: round(cancelBox.left), top: round(cancelBox.top), width: round(cancelBox.width), height: round(cancelBox.height) },
          center: { x: round(center(cancel).x), y: round(center(cancel).y) },
          content: { x: round(content.x), y: round(content.y), width: round(content.width), height: round(content.height) },
          offsetX: round(content.x - center(cancel).x),
          offsetY: round(content.y - center(cancel).y),
          overflow: cancel.scrollWidth - cancel.clientWidth,
          whiteSpace: cancelStyle.whiteSpace,
        },
        confirm: { center: { x: round(center(confirm).x), y: round(center(confirm).y) }, width: round(confirm.getBoundingClientRect().width) },
        stage: stage
          ? {
            radius: [stageStyle.borderTopLeftRadius, stageStyle.borderTopRightRadius, stageStyle.borderBottomRightRadius, stageStyle.borderBottomLeftRadius],
            overflow: stageStyle.overflow,
            box: { left: round(stage.getBoundingClientRect().left), top: round(stage.getBoundingClientRect().top), width: round(stage.getBoundingClientRect().width), height: round(stage.getBoundingClientRect().height) },
            media: mediaBox,
          }
          : null,
      }
    })

    // 1. 取消按钮：内容完整落在按钮框里并居中（与确认同一套）
    assert.ok(Math.abs(chrome.cancel.offsetX) <= 1, `取消按钮内容应在按钮框里水平居中：${JSON.stringify(chrome.cancel)}`)
    assert.ok(Math.abs(chrome.cancel.offsetY) <= 1, `取消按钮内容应在按钮框里垂直居中：${JSON.stringify(chrome.cancel)}`)
    assert.ok(chrome.cancel.content.width <= chrome.cancel.box.width + 1,
      `取消按钮内容不该溢出按钮框：内容 ${chrome.cancel.content.width} vs 框 ${chrome.cancel.box.width}`)
    assert.ok(chrome.cancel.overflow <= 1, `取消按钮不该有横向溢出：${chrome.cancel.overflow}`)
    // 2. 裁剪舞台跟着卡片圆角裁：16px + overflow hidden
    assert.ok(chrome.stage, `应有裁剪舞台：${JSON.stringify(chrome)}`)
    assert.deepEqual(chrome.stage.radius, ['16px', '16px', '16px', '16px'], `裁剪舞台应四角 16px：${JSON.stringify(chrome.stage.radius)}`)
    assert.equal(chrome.stage.overflow, 'hidden', `裁剪舞台应裁剪溢出：${chrome.stage.overflow}`)
    if (chrome.stage.media) {
      assert.ok(Math.abs(chrome.stage.box.left - chrome.stage.media.left) <= 1 && Math.abs(chrome.stage.box.top - chrome.stage.media.top) <= 1,
        `裁剪舞台应正好盖住图片区域：${JSON.stringify(chrome.stage)}`)
    }

    // 3. 像素：图片四角被圆角裁掉（角上是卡片底色，不是图片的红色），中间仍是图片
    const shot = decodePng(await page.screenshot())
    const stage = chrome.stage.box
    const corner = pixelAt(shot, stage.left + 3, stage.top + 3)
    const middle = pixelAt(shot, stage.left + stage.width / 2, stage.top + stage.height / 2)
    assert.ok(near(middle, SOLID), `舞台中间应是图片本身：${JSON.stringify(middle)}`)
    assert.ok(!near(corner, SOLID, 12), `图片左上角应被圆角裁掉、露出卡片底色：${JSON.stringify(corner)}`)
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-chrome-1440.png') })
    assert.deepEqual(errors, [], `页面错误：${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ ok: true, chrome, pixels: { corner, middle } }, null, 1))
  } finally {
    await browser.close()
  }
})()
