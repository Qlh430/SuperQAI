// 组的外壳整理（三条要求）：
// 1. 组里只有干净的组框和上方工具栏：顶部不再有那条被组框阴影压暗的标题带，
//    标题栏里也没有右上角的删除叉，除了组框、名字、成员数和端口不再有别的东西。
// 2. 组右边的连接点与普通节点同一套 Flora 端口外形（28px 空心圆加号、同一间距）。
// 3. 从组的连接点连到别的节点时，整组图片作为对方的参考素材。
// 判据用真实像素和真实拖动：顶部带与框内空隙必须同色（都是那一层白透明框），
// 不能比画布底色更暗；连接用鼠标从组端口真拖到目标节点输入端口一次。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_URL = '/qa-assets/qa-group-chrome-source.png'
const SOLID_COLOR = [120, 180, 240]
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

// 纯色不透明 PNG：组里放纯色图，才量得出有没有被别的层压暗。
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

// 8 位非隔行 PNG 解码（灰度 / 灰度+alpha / 真彩 / 真彩+alpha）。
function decodePng(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, '应是 PNG')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const parts = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
      assert.equal(data.readUInt8(12), 0, '不支持隔行 PNG')
    } else if (type === 'IDAT') {
      parts.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  assert.equal(bitDepth, 8, `不支持的位深：${bitDepth}`)
  assert.ok([0, 2, 4, 6].includes(colorType), `不支持的颜色类型：${colorType}`)
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
      } else if (filter !== 0) throw new Error(`未知 PNG 过滤器：${filter}`)
    }
    previous = line
    for (let x = 0; x < width; x += 1) {
      const from = x * channels
      const to = (y * width + x) * 4
      if (channels === 1) { pixels[to] = line[from]; pixels[to + 1] = line[from]; pixels[to + 2] = line[from]; pixels[to + 3] = 255 }
      else if (channels === 2) { pixels[to] = line[from]; pixels[to + 1] = line[from]; pixels[to + 2] = line[from]; pixels[to + 3] = line[from + 1] }
      else if (channels === 3) { pixels[to] = line[from]; pixels[to + 1] = line[from + 1]; pixels[to + 2] = line[from + 2]; pixels[to + 3] = 255 }
      else { pixels[to] = line[from]; pixels[to + 1] = line[from + 1]; pixels[to + 2] = line[from + 2]; pixels[to + 3] = line[from + 3] }
    }
  }
  return { width, height, pixels }
}

// 取一个点周围 3x3 的均值，避开单像素抗锯齿噪声。
function pixelAt(image, x, y) {
  const total = [0, 0, 0]
  let count = 0
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const px = Math.round(x) + dx
      const py = Math.round(y) + dy
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue
      const index = (py * image.width + px) * 4
      total[0] += image.pixels[index]
      total[1] += image.pixels[index + 1]
      total[2] += image.pixels[index + 2]
      count += 1
    }
  }
  return total.map((value) => Math.round(value / count))
}

function luminance([red, green, blue]) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function channelGap(left, right) {
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])))
}

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
    const page = await browser.newPage({ viewport: { width: 1728, height: 1400 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route(`**${SOURCE_URL}`, route => route.fulfill({ contentType: 'image/png', body: solidPng(64, 64, SOLID_COLOR) }))
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
      canvasState.activeBoardId = 'qa-group-chrome-board'
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
      window.qaChromeFirst = addCanvasImage(sourceUrl, '组内 A.png', { x: 160, y: 200 })
      window.qaChromeSecond = addCanvasImage(sourceUrl, '组内 B.png', { x: 660, y: 200 })
      canvasState.scale = 1
      canvasState.x = 120
      canvasState.y = 60
      applyCanvasTransformNow()
      clearCanvasSelection()
      addCanvasNodeToSelection(window.qaChromeFirst)
      addCanvasNodeToSelection(window.qaChromeSecond)
      createCanvasGroupFromSelection()
      window.qaChromeGroup = document.querySelector('#canvasPlane .canvas-node-group')
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => ['qaChromeFirst', 'qaChromeSecond']
      .every((key) => window[key]?.querySelector('img')?.naturalWidth > 0), null, { timeout: 20000 })
    await page.waitForTimeout(500)

    // ---- 一、组里只有组框和名字：没有删除叉，也没有别的按钮 ----
    const chrome = await page.evaluate(async () => {
      // 计算色可能是 oklab()/color(srgb ...)，统一用 canvas 解析成 sRGB 数值再判断。
      const toRgba = (value) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
        return { r: red / 255, g: green / 255, b: blue / 255, a: alpha / 255 }
      }
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      // 组框的底色/描边要按未选中态量（选中态会换成主色描边），
      // 右上角和标题栏按选中态量（选中时才可能出现标签控件）。
      clearCanvasSelection()
      await new Promise((resolve) => setTimeout(resolve, 400))
      const idleFrame = getComputedStyle(group, '::before')
      const frameIdle = {
        insetTop: idleFrame.top,
        background: idleFrame.backgroundColor,
        border: idleFrame.borderColor,
        fill: toRgba(idleFrame.backgroundColor),
        borderRgba: toRgba(idleFrame.borderColor),
      }
      selectCanvasNode(group)
      // 标签控件在选中后由观察者补挂，等一步再量右上角。
      await new Promise((resolve) => setTimeout(resolve, 400))
      const bar = group.querySelector(':scope > .canvas-node-bar')
      const barStyle = bar ? getComputedStyle(bar) : null
      return {
        deleteButtons: group.querySelectorAll('.canvas-node-delete').length,
        strayButtons: Array.from(group.querySelectorAll(':scope > button'))
          .filter((button) => !button.classList.contains('canvas-port') && !button.classList.contains('canvas-resize-handle'))
          .map((button) => button.className),
        strayBarButtons: bar ? bar.querySelectorAll('button').length : -1,
        barText: bar?.textContent?.trim() || '',
        barBackground: barStyle?.backgroundColor || '',
        barBorderWidth: barStyle?.borderTopWidth || '',
        barShadow: barStyle?.boxShadow || '',
        directChildren: Array.from(group.children).map((child) => String(child.className || child.tagName)),
        childDetails: Array.from(group.children).map((child) => {
          const style = getComputedStyle(child)
          const box = child.getBoundingClientRect()
          return {
            cls: String(child.className || child.tagName),
            box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)].join(','),
            display: style.display,
            opacity: style.opacity,
            visibility: style.visibility,
            hidden: child.hidden === true,
          }
        }),
        frameIdle,
      }
    })
    assert.equal(chrome.deleteButtons, 0, `组里不该有删除叉：${JSON.stringify(chrome)}`)
    assert.deepEqual(chrome.strayButtons, [], `组上除了端口和缩放手柄不该有别的按钮：${JSON.stringify(chrome.strayButtons)}`)
    assert.equal(chrome.strayBarButtons, 0, `组标题栏里不该有按钮（右上角的叉）：${JSON.stringify(chrome)}`)
    assert.equal(chrome.barText, chrome.barText.trim(), '组标题应是纯文本')
    assert.match(chrome.barBackground, /rgba\(0, 0, 0, 0\)|transparent|color\(srgb 0 0 0 \/ 0\)/, `组标题栏不该有底色：${chrome.barBackground}`)
    assert.equal(chrome.barBorderWidth, '0px', `组标题栏不该有描边：${chrome.barBorderWidth}`)
    assert.ok(!chrome.barShadow || chrome.barShadow === 'none', `组标题栏不该有阴影：${chrome.barShadow}`)
    assert.match(chrome.barText, /^(图片组|裁切组|.*组)$/, `组标题应是中文组名：${chrome.barText}`)
    const knownChrome = /canvas-port|canvas-node-bar|canvas-group-count|canvas-resize-handle|canvas-group-tools|flora-node-tag/
    const strayChrome = chrome.childDetails.filter((child) => !knownChrome.test(child.cls))
    assert.deepEqual(strayChrome, [], `组上不该挂别的层：${JSON.stringify(strayChrome)}`)
    const visibleExtra = chrome.childDetails
      .filter((child) => /flora-node-tag/.test(child.cls))
      .filter((child) => child.display !== 'none' && child.hidden !== true && !child.box.endsWith(',0,0'))
    assert.deepEqual(visibleExtra, [], `组上不该有可见的额外标签控件：${JSON.stringify(visibleExtra)}`)

    // ---- 一之二、选中的组右上角必须是空的（之前这里有删除叉和标签控件） ----
    const corner = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const frame = group.getBoundingClientRect()
      const point = { x: frame.right - 26, y: frame.top + 24 }
      return {
        point,
        stack: document.elementsFromPoint(point.x, point.y).slice(0, 3).map((element) => String(element.className || element.tagName)),
        buttons: group.querySelectorAll(':scope > button:not(.canvas-port):not(.canvas-resize-handle)').length,
      }
    })
    assert.equal(corner.buttons, 0, `组右上角不该有按钮：${JSON.stringify(corner)}`)
    assert.equal(corner.stack.some((name) => /flora-tag|canvas-node-delete/.test(name)), false,
      `组右上角不该有标签控件或删除叉：${JSON.stringify(corner)}`)
    assert.ok(chrome.directChildren.filter((cls) => /canvas-node-bar|canvas-port|canvas-group-count|canvas-resize-handle|canvas-group-tools/.test(cls)).length === 5,
      `组自己只应有端口、标题、成员数、缩放手柄和工具栏：${JSON.stringify(chrome.directChildren)}`)
    assert.equal(chrome.frameIdle.insetTop, '0px', `组框应从组的顶边开始，顶部不再留标题带：${chrome.frameIdle.insetTop}`)
    assert.ok(isWhiteish(chrome.frameIdle.fill, { minAlpha: 0.03, maxAlpha: 0.3 }), `组框底色仍是白色透明：${chrome.frameIdle.background}`)
    assert.ok(isWhiteish(chrome.frameIdle.borderRgba, { minAlpha: 0.12, maxAlpha: 0.45 }), `组框描边仍是浅白色：${chrome.frameIdle.border}`)

    // ---- 二、像素：组顶那条带和框内空隙同色，不再比画布底色更暗 ----
    const probes = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const frame = group.getBoundingClientRect()
      const members = getCanvasGroupMemberIds(group).map((id) => getCanvasNode(id)).filter(Boolean)
      const first = members[0].getBoundingClientRect()
      const second = members[1].getBoundingClientRect()
      const canvas = document.querySelector('#infiniteCanvas').getBoundingClientRect()
      return {
        // 顶带左右两侧：避开左边的组名、右边的成员数，也避开上方工具栏阴影落下的位置。
        topStripLeft: { x: frame.left + 200, y: frame.top + 24 },
        topStripRight: { x: frame.right - 200, y: frame.top + 24 },
        // 框内两个成员之间的空隙：同一层白透明框盖在画布上。
        frameGap: { x: (Math.max(first.left, second.left) + Math.min(first.right, second.right)) / 2, y: first.top + first.height / 2 },
        // 画布空白处：没有节点覆盖的底色。
        bareCanvas: { x: canvas.left + 40, y: canvas.top + canvas.height * 0.5 },
      }
    })
    const shot = decodePng(await page.screenshot())
    const topStripLeftPixel = pixelAt(shot, probes.topStripLeft.x, probes.topStripLeft.y)
    const topStripRightPixel = pixelAt(shot, probes.topStripRight.x, probes.topStripRight.y)
    const frameGapPixel = pixelAt(shot, probes.frameGap.x, probes.frameGap.y)
    const bareCanvasPixel = pixelAt(shot, probes.bareCanvas.x, probes.bareCanvas.y)
    assert.ok(channelGap(topStripLeftPixel, frameGapPixel) <= 6,
      `组顶那条带（左）应与框内空隙同色（同一层组框），实测 ${JSON.stringify(topStripLeftPixel)} vs ${JSON.stringify(frameGapPixel)}`)
    assert.ok(channelGap(topStripRightPixel, frameGapPixel) <= 6,
      `组顶那条带（右）应与框内空隙同色（同一层组框），实测 ${JSON.stringify(topStripRightPixel)} vs ${JSON.stringify(frameGapPixel)}`)
    ;[['左', topStripLeftPixel], ['右', topStripRightPixel]].forEach(([label, pixel]) => {
      assert.ok(luminance(pixel) > luminance(bareCanvasPixel) + 1.5,
        `组顶那条带（${label}）应是组框的淡白底，不该被压暗成画布底色：${JSON.stringify(pixel)} vs 画布 ${JSON.stringify(bareCanvasPixel)}`)
      assert.ok(luminance(pixel) - luminance(bareCanvasPixel) < 24,
        `组框是很淡的一层，不该变成亮色卡片（${label}）：${JSON.stringify(pixel)} vs 画布 ${JSON.stringify(bareCanvasPixel)}`)
    })

    // ---- 三、组右边的连接点与普通节点同一套 Flora 端口外形 ----
    const port = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 400))
      const read = (element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          borderWidth: style.borderTopWidth,
          borderRadius: style.borderTopLeftRadius,
          background: style.backgroundColor,
          color: style.color,
          position: style.position,
          right: style.right,
          opacity: style.opacity,
          visibility: style.visibility,
          centerX: box.x + box.width / 2,
          centerY: box.y + box.height / 2,
        }
      }
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const member = document.querySelector('#canvasPlane .canvas-node:not(.canvas-node-group)')
      const groupPort = group.querySelector(':scope > .canvas-port')
      selectCanvasNode(member)
      await settle()
      const memberPort = read(member.querySelector('[data-canvas-port-kind="output"]'))
      selectCanvasNode(group)
      await settle()
      const groupPortSelected = read(groupPort)
      clearCanvasSelection()
      // 端口的显隐是 160ms 过渡，等它走完再读空闲态。
      await settle()
      const groupPortIdle = read(groupPort)
      selectCanvasNode(group)
      const frame = group.getBoundingClientRect()
      return {
        memberPort,
        groupPortSelected,
        groupPortIdle,
        frameRight: frame.right,
        frameCenterY: frame.y + frame.height / 2,
        portKind: groupPort.dataset.canvasPortKind,
        portChildCount: group.querySelectorAll(':scope > .canvas-port').length,
      }
    })
    assert.equal(port.portKind, 'output', '组只有输出端口')
    assert.equal(port.portChildCount, 1, '组上只有一个连接点')
    assert.equal(port.groupPortSelected.width, 28, `组端口应与普通节点同尺寸 28px：${JSON.stringify(port.groupPortSelected)}`)
    assert.equal(port.groupPortSelected.height, 28, `组端口应与普通节点同尺寸 28px：${JSON.stringify(port.groupPortSelected)}`)
    assert.equal(port.groupPortSelected.borderRadius, '50%', `组端口应是圆形：${port.groupPortSelected.borderRadius}`)
    assert.equal(port.groupPortSelected.borderWidth, port.memberPort.borderWidth, '组端口描边应与普通节点一致')
    assert.equal(port.groupPortSelected.background, port.memberPort.background, `组端口底色应与普通节点一致：${port.groupPortSelected.background} vs ${port.memberPort.background}`)
    assert.equal(port.groupPortSelected.color, port.memberPort.color, `组端口图标色应与普通节点一致：${port.groupPortSelected.color} vs ${port.memberPort.color}`)
    assert.equal(port.groupPortSelected.position, 'absolute', `组端口应绝对定位：${port.groupPortSelected.position}`)
    assert.equal(Number.parseFloat(port.groupPortSelected.right), -42, `组端口应挂在组框右边同一间距外：${port.groupPortSelected.right}`)
    assert.ok(Math.abs(port.groupPortSelected.centerY - port.frameCenterY) <= 2, `组端口应垂直居中：${port.groupPortSelected.centerY} vs ${port.frameCenterY}`)
    assert.ok(port.groupPortSelected.centerX > port.frameRight, `组端口应在组框右边外侧：${port.groupPortSelected.centerX} vs ${port.frameRight}`)
    assert.equal(port.groupPortSelected.opacity, '1', '选中组时端口应可见')
    assert.equal(port.groupPortIdle.opacity, '0', `没选中也没悬停时端口应安静隐藏：${JSON.stringify(port.groupPortIdle)}`)
    assert.equal(port.groupPortIdle.visibility, 'hidden', `隐藏态端口不该占位可见：${JSON.stringify(port.groupPortIdle)}`)

    // ---- 四、工具栏在组框上方，且只有颜色 / 布局 / 解组 ----
    const tools = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const box = group.querySelector('.canvas-group-tools')
      const frame = group.getBoundingClientRect()
      const toolsBox = box.getBoundingClientRect()
      return {
        actions: Array.from(box.querySelectorAll('[data-group-tool]')).map((button) => button.dataset.groupTool),
        labels: Array.from(box.querySelectorAll('[data-group-tool]')).map((button) => button.textContent.trim()),
        bottom: toolsBox.bottom,
        frameTop: frame.top,
        overlaps: toolsBox.bottom > frame.top,
        centeredGap: Math.abs((toolsBox.left + toolsBox.right) / 2 - (frame.left + frame.right) / 2),
      }
    })
    assert.deepEqual(tools.actions, ['color', 'layout', 'ungroup'], `组工具栏只应有颜色/布局/解组：${JSON.stringify(tools)}`)
    assert.deepEqual(tools.labels, ['', '布局', '解组'], `组工具栏文案：${JSON.stringify(tools.labels)}`)
    assert.equal(tools.overlaps, false, `工具栏应在组框上方，不压住组框：${JSON.stringify(tools)}`)
    assert.ok(tools.centeredGap <= 4, `工具栏应居中对齐组框：${tools.centeredGap}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-chrome-1728.png') })
    const clip = await page.evaluate(() => {
      const box = document.querySelector('#canvasPlane .canvas-node-group').getBoundingClientRect()
      return {
        x: Math.max(0, Math.floor(box.left - 40)),
        y: Math.max(0, Math.floor(box.top - 60)),
        width: Math.ceil(box.width + 120),
        height: Math.ceil(box.height + 80),
      }
    })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-chrome-detail-1728.png'), clip })

    // ---- 五、从组端口真拖到生成节点：整组作为参考素材 ----
    await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      window.qaChromeTarget = addCanvasImageGeneratorNode({ x: 1200, y: 200 }, { imageName: '整组参考.png' })
      selectCanvasNode(group)
    })
    await page.waitForTimeout(400)
    const drag = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const portBox = group.querySelector(':scope > .canvas-port').getBoundingClientRect()
      const target = window.qaChromeTarget
      const inputBox = (target.querySelector('[data-canvas-port-kind="input"]')
        || target.querySelector('.canvas-port-input')).getBoundingClientRect()
      return {
        from: { x: portBox.x + portBox.width / 2, y: portBox.y + portBox.height / 2 },
        to: { x: inputBox.x + inputBox.width / 2, y: inputBox.y + inputBox.height / 2 },
      }
    })
    await page.mouse.move(drag.from.x, drag.from.y)
    await page.mouse.down()
    await page.mouse.move(drag.from.x + 40, drag.from.y + 20, { steps: 5 })
    await page.mouse.move(drag.to.x, drag.to.y, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    const reference = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      const target = window.qaChromeTarget
      selectCanvasNode(target)
      return {
        connected: canvasState.connections.some((item) => item.from === group.dataset.id && item.to === target.dataset.id),
        connectionCount: canvasState.connections.filter((item) => item.from === group.dataset.id).length,
        output: (() => {
          const output = getCanvasNodeOutput(group)
          return output ? { type: output.type, images: (output.images || []).length } : null
        })(),
        refs: getCanvasIncomingRefs(target.dataset.id).map((item) => item.name),
        refTypes: Array.from(new Set(getCanvasIncomingRefs(target.dataset.id).map((item) => item.type))),
      }
    })
    assert.equal(reference.connected, true, `从组端口拖到节点应建立连接：${JSON.stringify({ reference, drag })}`)
    assert.equal(reference.connectionCount, 1, '组只连出一条线')
    assert.equal(reference.output?.type, 'group', `组的输出应是整组：${JSON.stringify(reference.output)}`)
    assert.equal(reference.output?.images, 2, `组的输出应含组里全部图片：${JSON.stringify(reference.output)}`)
    assert.deepEqual(reference.refs, ['组内 A.png', '组内 B.png'], `目标节点的参考素材应是整组：${JSON.stringify(reference.refs)}`)
    assert.deepEqual(reference.refTypes, ['image'], `整组参考到目标节点后仍是图片素材：${JSON.stringify(reference.refTypes)}`)
    await page.waitForFunction(() => document.querySelectorAll('.canvas-ref-thumb').length >= 2, null, { timeout: 10000 })
    const thumbs = await page.evaluate(() => Array.from(document.querySelectorAll('.canvas-ref-thumb'))
      .map((thumb) => thumb.getAttribute('title') || thumb.dataset.refName || thumb.textContent.trim()))
    assert.equal(thumbs.length, 2, `目标节点的参考素材应显示整组两张：${JSON.stringify(thumbs)}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-as-reference-1728.png') })

    // ---- 六、解组仍然是拆组的方式（没有删除叉也能拆）----
    const ungrouped = await page.evaluate(() => {
      const group = document.querySelector('#canvasPlane .canvas-node-group')
      selectCanvasNode(group)
      group.querySelector('[data-group-tool="ungroup"]').click()
      return {
        groupCount: document.querySelectorAll('#canvasPlane .canvas-node-group').length,
        selected: getSelectedCanvasNodes().length,
        connections: canvasState.connections.filter((item) => item.to === window.qaChromeTarget.dataset.id).length,
      }
    })
    assert.equal(ungrouped.groupCount, 0, '点解组应拆掉组框')
    assert.equal(ungrouped.selected, 2, `解组后成员保持选中：${JSON.stringify(ungrouped)}`)
    assert.equal(ungrouped.connections, 0, '解组后原来从组出去的线一并清掉')

    assert.deepEqual(errors, [], `页面不应有脚本错误：${JSON.stringify(errors)}`)
    console.log('组外壳回归通过：无删除叉、顶部无遮挡带、端口与普通节点同形、整组作为参考素材。')
  } finally {
    await browser.close()
  }
})()
