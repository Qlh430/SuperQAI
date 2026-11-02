// 裁切输出回归：画布节点上的 <img> 通常是长边 640 的缩略图资源，而裁切导出读的是原图。
// 只要几何尺寸取自缩略图，格子坐标就会落回原图左上角，导出的图就不再是预览里的区域。
// 这里复现该状态（节点显示 640 宽缩略图、原图 1536×1024），逐像素校验导出的切片。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_IMAGE = process.env.CROP_SOURCE_IMAGE
  || 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\data\\output\\0e3154dd-c0cf-49cb-85de-09608bcd6c20_1791440818634_ad06c34d.png'
// 源图放在普通静态路径上，让缩略图按线上流程生成（长边 640），
// 再把原始尺寸记进 dataset，与用户现场出现的状态一致。
const SOURCE_URL = '/qa-assets/crop-source.png'
const RESULT_URL = '/qa-assets/crop-result.png'
const ROWS = 3
const COLUMNS = 3
const API_STUB = JSON.stringify({
  authenticated: false, boards: [], projects: [], resources: [], records: [],
  models: [], providers: [], preferences: {}, settings: {}, snapshots: [], users: [], groups: [],
})
// 视口接口会校验引擎版本：桩数据回「迁移中」既不带错，也不会用空页面覆盖测试里新建的节点。
const VIEWPORT_PAGE = JSON.stringify({ state: "migrating" })

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 数据')
  let offset = 8
  let header = null
  const chunks = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') header = data
    else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    offset += length + 12
  }
  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  const bitDepth = header[8]
  const colorType = header[9]
  assert.equal(header[12], 0, '测试图片不应使用隔行扫描')
  assert.equal(bitDepth, 8, '测试图片应为 8 位深度')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)
  let cursor = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor]
    cursor += 1
    for (let index = 0; index < stride; index += 1) {
      const value = raw[cursor + index]
      const left = index >= channels ? pixels[y * stride + index - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + index] : 0
      const upLeft = y > 0 && index >= channels ? pixels[(y - 1) * stride + index - channels] : 0
      let output
      if (filter === 0) output = value
      else if (filter === 1) output = value + left
      else if (filter === 2) output = value + up
      else if (filter === 3) output = value + ((left + up) >> 1)
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        output = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
      } else throw new Error(`未知过滤类型 ${filter}`)
      pixels[y * stride + index] = output & 0xff
    }
    cursor += stride
  }
  const rgb = Buffer.alloc(width * height * 3)
  const channelMap = { 0: [0, 0, 0], 2: [0, 1, 2], 4: [0, 0, 0], 6: [0, 1, 2] }[colorType]
  for (let index = 0; index < width * height; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      rgb[index * 3 + channel] = pixels[index * channels + channelMap[channel]]
    }
  }
  return { width, height, rgb }
}

function slicePixels(image, x, y, width, height) {
  const rgb = Buffer.alloc(width * height * 3)
  for (let row = 0; row < height; row += 1) {
    image.rgb.copy(
      rgb,
      row * width * 3,
      ((y + row) * image.width + x) * 3,
      ((y + row) * image.width + x + width) * 3,
    )
  }
  return { width, height, rgb }
}

function maxChannelDifference(a, b) {
  if (a.rgb.length !== b.rgb.length) return Number.POSITIVE_INFINITY
  let worst = 0
  for (let index = 0; index < a.rgb.length; index += 1) {
    const delta = Math.abs(a.rgb[index] - b.rgb[index])
    if (delta > worst) worst = delta
  }
  return worst
}

// 与画布一致的三等分：中心点四舍五入后再取区间。
function bands(length, count) {
  const regions = []
  let cursor = 0
  for (let index = 1; index < count; index += 1) {
    const center = Math.round((length * index) / count)
    regions.push({ start: cursor, end: center })
    cursor = center
  }
  regions.push({ start: cursor, end: length })
  return regions
}

;(async () => {
  const sourceBytes = fs.readFileSync(SOURCE_IMAGE)
  const source = decodePng(sourceBytes)
  const columnBands = bands(source.width, COLUMNS)
  const rowBands = bands(source.height, ROWS)
  const uploads = new Map()
  const errors = []

  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.on('pageerror', error => errors.push(error.message))
    // Playwright 用后注册的路由优先，所以通配路由先注册，精确路由后注册。
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/canvas/boards/*/viewport*', route => route.fulfill({ contentType: 'application/json', body: VIEWPORT_PAGE }))
    await page.route('**/api/upload-image', route => {
      const name = decodeURIComponent(route.request().headers()['x-file-name'] || '')
      uploads.set(name, Buffer.from(route.request().postDataBuffer()))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: RESULT_URL }) })
    })
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
    // 线上缩略图由服务端生成并提供原始尺寸；这里用页面内缩放的 640 图代替，
    // 让节点保持「显示缩略图、记录原图尺寸」的状态，不依赖后续升级到原图。
    const thumbnailDataUrl = await page.evaluate(async ({ sourceUrl }) => {
      const original = new Image()
      original.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        original.onload = resolve
        original.onerror = reject
        original.src = sourceUrl
      })
      const scale = Math.min(1, 640 / Math.max(original.naturalWidth, original.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(original.naturalWidth * scale)
      canvas.height = Math.round(original.naturalHeight * scale)
      canvas.getContext('2d').drawImage(original, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    }, { sourceUrl: SOURCE_URL })
    await page.route('**/api/image-thumbnails*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        item: { thumbnailUrl: thumbnailDataUrl, width: source.width, height: source.height, lightweight: false },
      }),
    }))
    await page.evaluate(async ({ sourceUrl }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-crop-board'
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
      const node = window.qaCropNode = addCanvasImage(sourceUrl, '裁切来源.png', { x: 200, y: 140 })
      node.dataset.qaCropNode = 'primary'
      canvasState.scale = 1
      canvasState.x = (innerWidth - node.offsetWidth) / 2 - Number(node.dataset.x)
      canvasState.y = 120 - Number(node.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(node)
    }, { sourceUrl: SOURCE_URL })
    try {
      await page.waitForFunction(() => window.qaCropNode?.querySelector('.canvas-image-upload img')?.naturalWidth > 0)
    } catch {
      const state = await page.evaluate(() => ({
        hasNode: Boolean(window.qaCropNode),
        img: window.qaCropNode?.querySelector('.canvas-image-upload img')?.getAttribute('src')?.slice(0, 60) || '',
        quality: window.qaCropNode?.querySelector('.canvas-image-upload img')?.dataset.imageQuality || '',
        errors: window.qaCropNode?.querySelector('.canvas-image-upload img')?.naturalWidth ?? -1,
      }))
      throw new Error(`节点图片未加载：${JSON.stringify(state)}；页面错误：${errors.join(' | ') || '无'}`)
    }

    const thumbnail = await page.evaluate(() => {
      const img = window.qaCropNode.querySelector('.canvas-image-upload img')
      return {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        quality: img.dataset.imageQuality || '',
        originalWidth: Number(img.dataset.originalWidth || 0),
        originalHeight: Number(img.dataset.originalHeight || 0),
      }
    })
    assert.equal(thumbnail.naturalWidth, 640, `节点应显示 640 宽的缩略图，实际 ${thumbnail.naturalWidth}`)
    assert.equal(thumbnail.quality, 'thumbnail', `节点应处于缩略图状态，实际 ${thumbnail.quality}`)
    assert.equal(thumbnail.originalWidth, source.width, '原图宽度记录应与源图一致')

    await page.locator('[data-qa-crop-node="primary"] [data-flora-action="crop"]').click()
    // 裁剪现在是节点内联模式：尺寸读数直接给在原节点上。
    await page.waitForSelector('#canvasInlineCrop')
    const opened = await page.evaluate(() => ({
      status: document.querySelector('#canvasInlineCrop [data-crop-size]')?.textContent || '',
      mode: 'grid',
    }))
    assert.ok(
      opened.status.includes(`${source.width} × ${source.height}`),
      `裁剪界面应显示原图尺寸 ${source.width} × ${source.height}，实际「${opened.status}」`,
    )
    await page.locator('#canvasInlineCrop [data-crop-grid-menu]').click()
    await page.locator(`#canvasInlineCrop [data-crop-grid="${ROWS}x${COLUMNS}"]`).click()
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    try {
      await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 30000 })
    } catch {
      throw new Error(`裁剪确认后界面未关闭，已上传 ${uploads.size} 张；页面错误：${errors.join(' | ') || '无'}`)
    }
    for (let attempt = 0; attempt < 60 && uploads.size < ROWS * COLUMNS; attempt += 1) await page.waitForTimeout(250)
    assert.equal(uploads.size, ROWS * COLUMNS, `应上传 ${ROWS * COLUMNS} 张切片，实际 ${uploads.size}`)

    const report = []
    for (let row = 1; row <= ROWS; row += 1) {
      for (let column = 1; column <= COLUMNS; column += 1) {
        const key = `r0${row}-c0${column}`
        const entry = Array.from(uploads.keys()).find(name => name.includes(key))
        assert.ok(entry, `缺少 ${key} 的切片上传`)
        const produced = decodePng(uploads.get(entry))
        const columnBand = columnBands[column - 1]
        const rowBand = rowBands[row - 1]
        const expectedWidth = columnBand.end - columnBand.start
        const expectedHeight = rowBand.end - rowBand.start
        assert.equal(
          `${produced.width}x${produced.height}`,
          `${expectedWidth}x${expectedHeight}`,
          `${key} 尺寸应为 ${expectedWidth}x${expectedHeight}`,
        )
        const difference = maxChannelDifference(
          produced,
          slicePixels(source, columnBand.start, rowBand.start, expectedWidth, expectedHeight),
        )
        assert.equal(difference, 0, `${key} 应与原图 x${columnBand.start} y${rowBand.start} 处完全一致，最大通道差 ${difference}`)
        report.push({ key, size: `${produced.width}x${produced.height}`, at: `x${columnBand.start} y${rowBand.start}` })
      }
    }
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    // 比例裁切（默认 1:1）同样要按原图尺寸取中心方块，不能被缩略图尺寸带偏。
    uploads.clear()
    await page.evaluate(() => { selectCanvasNode(window.qaCropNode) })
    await page.waitForTimeout(300)
    await page.locator('[data-qa-crop-node="primary"] [data-flora-action="crop"]').click()
    await page.waitForSelector('#canvasInlineCrop')
    await page.locator('#canvasInlineCrop [data-crop-ratio-menu]').click()
    await page.locator('#canvasInlineCrop [data-crop-ratio="1:1"]').click()
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 30000 })
    for (let attempt = 0; attempt < 60 && uploads.size < 1; attempt += 1) await page.waitForTimeout(250)
    assert.equal(uploads.size, 1, `比例裁切应上传 1 张，实际 ${uploads.size}`)
    const ratioProduced = decodePng(Array.from(uploads.values())[0])
    const ratioSide = Math.min(source.width, source.height)
    const ratioX = Math.round((source.width - ratioSide) / 2)
    assert.equal(`${ratioProduced.width}x${ratioProduced.height}`, `${ratioSide}x${ratioSide}`, '比例裁切应输出 1:1 方块')
    assert.equal(
      maxChannelDifference(ratioProduced, slicePixels(source, ratioX, 0, ratioSide, ratioSide)),
      0,
      `比例裁切应与原图 x${ratioX} y0 的 1:1 区域完全一致`,
    )

    console.log(JSON.stringify({ ok: true, source: `${source.width}x${source.height}`, thumbnail: `${thumbnail.naturalWidth}x${thumbnail.naturalHeight}`, status: opened.status, crops: report }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
