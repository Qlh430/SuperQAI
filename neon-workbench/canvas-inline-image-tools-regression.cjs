// 内联扩图 / 内联裁剪回归：工具在原节点上直接操作，扩图确认后新建结果节点，
// 裁剪支持「仅裁剪」与「创建分镜格子」（含比例菜单、宫格菜单与自定义行列）。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_IMAGE = process.env.CROP_SOURCE_IMAGE
  || 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\data\\output\\0e3154dd-c0cf-49cb-85de-09608bcd6c20_1791440818634_ad06c34d.png'
const SOURCE_URL = '/qa-assets/crop-source.png'
const RESULT_URL = '/qa-assets/crop-result.png'
const API_STUB = JSON.stringify({
  authenticated: false, boards: [], projects: [], resources: [], records: [],
  models: [], providers: [], preferences: {}, settings: {}, snapshots: [], users: [], groups: [],
})
const VIEWPORT_PAGE = JSON.stringify({ state: "migrating" })

function readPngSize(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, '上传的切片应是 PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

// 只实现 8 位非隔行 PNG（真彩 / 真彩+alpha / 灰度 / 灰度+alpha），够用来逐点比对裁切结果。
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
  assert.ok(colorType === 0 || colorType === 2 || colorType === 4 || colorType === 6, `不支持的颜色类型：${colorType}`)
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
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4
      if (channels === 4) {
        pixels[target] = line[x * 4]
        pixels[target + 1] = line[x * 4 + 1]
        pixels[target + 2] = line[x * 4 + 2]
        pixels[target + 3] = line[x * 4 + 3]
      } else if (channels === 3) {
        pixels[target] = line[x * 3]
        pixels[target + 1] = line[x * 3 + 1]
        pixels[target + 2] = line[x * 3 + 2]
        pixels[target + 3] = 255
      } else if (channels === 2) {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = line[x * 2]
        pixels[target + 3] = line[x * 2 + 1]
      } else {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = line[x]
        pixels[target + 3] = 255
      }
    }
    previous = line
  }
  return { width, height, pixels }
}

// 逐点比对：把裁出来的图和源图对应区域抽样比较，证明裁的是原图、而且和界面上框选的区域一致。
function comparePngRegion(source, crop, originX, originY) {
  const columns = 24
  const rows = 16
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(crop.width - 1, Math.floor(((column + 0.5) * crop.width) / columns))
      const y = Math.min(crop.height - 1, Math.floor(((row + 0.5) * crop.height) / rows))
      const cropIndex = (y * crop.width + x) * 4
      const sourceIndex = ((originY + y) * source.width + (originX + x)) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = Math.abs(crop.pixels[cropIndex + channel] - source.pixels[sourceIndex + channel])
        if (difference > 2) return { ok: false, x, y, channel, difference }
      }
    }
  }
  return { ok: true, samples: columns * rows }
}

;(async () => {
  const sourceBytes = fs.readFileSync(SOURCE_IMAGE)
  const sourceSize = (() => {
    const header = sourceBytes.subarray(16, 24)
    return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) }
  })()
  const errors = []
  const uploads = []
  const submitted = []
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/canvas/boards/*/viewport*', route => route.fulfill({ contentType: 'application/json', body: VIEWPORT_PAGE }))
    await page.route('**/api/image-thumbnails*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ item: { thumbnailUrl: SOURCE_URL, width: sourceSize.width, height: sourceSize.height, lightweight: false } }),
    }))
    await page.route('**/api/upload-image', route => {
      const name = decodeURIComponent(route.request().headers()['x-file-name'] || '')
      uploads.push({ name, buffer: Buffer.from(route.request().postDataBuffer()) })
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: RESULT_URL }) })
    })
    await page.route('**/api/outpaint', route => {
      submitted.push(JSON.parse(route.request().postData() || '{}'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task_id: 'qa-outpaint-task' }) })
    })
    await page.route('**/api/upscale/status*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', progress: 100, images: [RESULT_URL] }),
    }))
    await page.route('**/qa-assets/crop-source.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    await page.route('**/qa-assets/crop-result.png', route => route.fulfill({ contentType: 'image/png', body: sourceBytes }))
    if (process.env.CROP_USE_DEPLOYED !== '1') {
      const overrides = [
        ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
        ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
        ['flora-node-shell.css', 'flora-node-shell.css', 'text/css'],
        ['flora-connection-interaction.js', 'flora-connection-interaction.js', 'application/javascript'],
      ]
      for (const [served, source, type] of overrides) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: type,
          body: fs.readFileSync(path.join(__dirname, 'design-sources', source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ sourceUrl }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-inline-tools-board'
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
      const node = window.qaInlineNode = addCanvasImage(sourceUrl, '内联工具来源.png', { x: 200, y: 200 })
      node.dataset.qaInlineNode = 'primary'
      node.dataset.imageSrc = sourceUrl
      canvasState.scale = 1
      canvasState.x = 120
      canvasState.y = 120
      applyCanvasTransformNow()
      selectCanvasNode(node)
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => window.qaInlineNode?.querySelector('.canvas-image-upload img')?.naturalWidth > 0)

    // ---- 内联扩图 ----
    await page.locator('[data-qa-inline-node="primary"] [data-flora-action="outpaint"]').click()
    await page.waitForSelector('#canvasInlineOutpaint')
    const outpaintOpen = await page.evaluate(() => {
      const host = document.querySelector('#canvasInlineOutpaint')
      const node = window.qaInlineNode
      return {
        insideNode: Boolean(node.querySelector('#canvasInlineOutpaint')),
        toolbarHidden: getComputedStyle(node.querySelector('.flora-node-toolbar')).display === 'none',
        handles: host.querySelectorAll('[data-inline-outpaint-side]').length,
        sizeText: host.querySelector('[data-inline-outpaint-size]')?.textContent || '',
        hint: host.querySelector('.canvas-inline-outpaint-hint')?.textContent || '',
        padding: {
          left: node.dataset.comfyOutpaintLeft,
          right: node.dataset.comfyOutpaintRight,
        },
      }
    })
    assert.equal(outpaintOpen.insideNode, true, '扩图面板应挂在原节点内')
    assert.equal(outpaintOpen.toolbarHidden, true, '内联工具模式下普通工具栏应让位')
    assert.equal(outpaintOpen.handles, 8, `扩图应有 8 个拖拽把手，实际 ${outpaintOpen.handles}`)
    assert.ok(outpaintOpen.sizeText.includes('扩图'), `应显示扩图后的尺寸：${outpaintOpen.sizeText}`)
    assert.equal(outpaintOpen.hint, '拖动外框进行扩图')
    assert.ok(Number(outpaintOpen.padding.left) > 0, `默认应带左边距：${outpaintOpen.padding.left}`)
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    // 预览图是异步加载的，等它真的解码出来再断言。
    await page.waitForFunction(() => {
      const img = document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-image] img')
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }, null, { timeout: 15000 })
    const debugState = await page.evaluate(() => {
      const node = window.qaInlineNode
      const host = document.querySelector('#canvasInlineOutpaint')
      if (!host) return { missing: 'host' }
      const stage = host.querySelector('[data-inline-outpaint-stage]')
      const frame = host.querySelector('[data-inline-outpaint-frame]')
      const wrap = host.querySelector('[data-inline-outpaint-image]')
      const img = wrap?.querySelector('img')
      if (!stage || !frame || !wrap || !img) {
        return { missing: { stage: !stage, frame: !frame, wrap: !wrap, img: !img }, html: host.innerHTML.slice(0, 200) }
      }
      const rect = (element) => {
        const box = element.getBoundingClientRect()
        return { w: Math.round(box.width), h: Math.round(box.height) }
      }
      return {
        padding: getCanvasComfyPadding(node),
        datasets: {
          left: node.dataset.comfyOutpaintLeft,
          right: node.dataset.comfyOutpaintRight,
          width: node.dataset.comfyOutpaintSourceWidth,
          height: node.dataset.comfyOutpaintSourceHeight,
        },
        stage: rect(stage),
        frame: rect(frame),
        wrap: rect(wrap),
        imgSize: rect(img),
        imgSrc: (img?.getAttribute('src') || '').slice(0, 46),
        imgComplete: img?.complete,
        imgNatural: `${img?.naturalWidth}x${img?.naturalHeight}`,
        sizeText: host.querySelector('[data-inline-outpaint-size]')?.textContent || '',
      }
    })
    // 扩图状态下必须能看见来源图，并且外框比原图更大（左右各带扩出区域）。
    assert.ok(Number(debugState.imgNatural.split('x')[0]) > 0, `扩图预览应加载来源图：${debugState.imgNatural}`)
    assert.ok(debugState.frame.w > debugState.wrap.w, `外框应比原图宽：frame ${debugState.frame.w} / image ${debugState.wrap.w}`)
    assert.ok(debugState.sizeText.includes('1936'), `读数应含左右扩出的宽度：${debugState.sizeText}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-outpaint-1440.png') })

    // 拖右边界：padding 变大，尺寸读数跟着变。
    const rightHandle = await page.locator('#canvasInlineOutpaint [data-inline-outpaint-side="right"]').boundingBox()
    const beforeRight = Number(await page.evaluate(() => window.qaInlineNode.dataset.comfyOutpaintRight))
    const handleHit = await page.evaluate(() => {
      const handle = document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-side="right"]')
      const box = handle.getBoundingClientRect()
      const centre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return {
        rect: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
        hitSide: centre?.dataset?.inlineOutpaintSide || '',
        hitClasses: centre ? (typeof centre.className === 'string' ? centre.className.slice(0, 50) : centre.tagName) : '',
      }
    })
    assert.equal(handleHit.hitSide, 'right', `扩图把手必须能抓到，实际命中 ${handleHit.hitClasses}`)
    await page.mouse.move(rightHandle.x + rightHandle.width / 2, rightHandle.y + rightHandle.height / 2)
    await page.mouse.down()
    await page.mouse.move(rightHandle.x + rightHandle.width / 2 + 60, rightHandle.y + rightHandle.height / 2, { steps: 8 })
    await page.mouse.up()
    const afterDrag = await page.evaluate(() => ({
      right: Number(window.qaInlineNode.dataset.comfyOutpaintRight),
      sizeText: document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-size]')?.textContent || '',
    }))
    assert.ok(afterDrag.right > beforeRight, `右拖后右边距应增大：${beforeRight} → ${afterDrag.right}`)
    assert.ok(afterDrag.sizeText !== outpaintOpen.sizeText, '尺寸读数应随拖拽更新')

    await page.locator('#canvasInlineOutpaint [data-inline-outpaint-submit]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineOutpaint'), null, { timeout: 15000 })
    for (let attempt = 0; attempt < 40 && submitted.length === 0; attempt += 1) await page.waitForTimeout(250)
    assert.equal(submitted.length, 1, `应提交一次扩图任务，实际 ${submitted.length}`)
    assert.equal(submitted[0].direction, 'custom', `扩图请求方向：${submitted[0].direction}`)
    assert.equal(submitted[0].alphaMaskInput, true, '扩图请求应带 alpha 遮罩输入')
    assert.deepEqual(
      ['bottom', 'left', 'right', 'top'].filter((side) => Number(submitted[0][side]) === afterDrag.right),
      ['right'],
      `请求里的右边距应等于界面值：${JSON.stringify(submitted[0])}`,
    )
    await page.waitForFunction(() => document.querySelectorAll('#canvasPlane .canvas-node').length === 2, null, { timeout: 20000 })
    await page.waitForFunction(() => !document.querySelector('[data-image-generating]'), null, { timeout: 20000 })
    // 收尾：把结果节点删掉，方便后面继续验证裁剪。
    await page.evaluate(() => {
      const node = window.qaInlineNode
      const others = Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).filter((item) => item !== node)
      others.forEach((item) => deleteCanvasNodes([item]))
      selectCanvasNode(node)
    })
    await page.waitForTimeout(300)

    // ---- 内联裁剪：仅裁剪 ----
    await page.locator('[data-qa-inline-node="primary"] [data-flora-action="crop"]').click()
    await page.waitForSelector('#canvasInlineCrop')
    const cropOpen = await page.evaluate(() => {
      const host = document.querySelector('#canvasInlineCrop')
      const node = window.qaInlineNode
      if (!host) return { open: false }
      const bar = host.querySelector('.canvas-inline-crop-bar')
      const stage = host.querySelector('[data-crop-stage]')
      const frame = host.querySelector('[data-crop-rect]')
      const nodeImage = node.querySelector('.flora-node-result-area img, .canvas-image-upload img, img')
      const stageBox = stage.getBoundingClientRect()
      const imageBox = nodeImage.getBoundingClientRect()
      return {
        open: true,
        insideNode: Boolean(node.querySelector('#canvasInlineCrop')),
        barActions: Array.from(host.querySelectorAll('.canvas-inline-crop-bar button')).map((button) => button.textContent.trim()),
        lines: host.querySelectorAll('[data-crop-line]').length,
        splits: host.querySelectorAll('[data-crop-split]').length,
        ratioLabel: host.querySelector('[data-crop-ratio-label]')?.textContent || '',
        sizeText: host.querySelector('[data-crop-size]')?.textContent || '',
        barBelowNode: bar ? bar.getBoundingClientRect().top >= node.getBoundingClientRect().bottom - 1 : false,
        // 裁剪层必须正好落在节点图片上，不能出现第二个框或偏移。
        align: {
          dx: stageBox.left - imageBox.left,
          dy: stageBox.top - imageBox.top,
          dw: stageBox.width - imageBox.width,
          dh: stageBox.height - imageBox.height,
        },
        mask: getComputedStyle(frame).boxShadow,
        stageBackground: getComputedStyle(stage).backgroundColor,
        stageBorder: getComputedStyle(stage).borderTopWidth,
      }
    })
    assert.equal(cropOpen.open, true, '点裁剪应在原节点上打开裁剪界面')
    assert.equal(cropOpen.insideNode, true, '裁剪应挂在原节点内')
    assert.deepEqual(cropOpen.barActions, ['取消', '宫格裁剪', '宽高比', '确认'], `操作条按钮：${cropOpen.barActions}`)
    assert.equal(cropOpen.lines, 4, `图上应有 4 条可拖裁剪线，实际 ${cropOpen.lines}`)
    assert.equal(cropOpen.splits, 0, `默认整块裁剪不应出现任何分割线，实际 ${cropOpen.splits}`)
    assert.equal(cropOpen.barBelowNode, true, '操作条应浮在节点下方')
    for (const key of ['dx', 'dy', 'dw', 'dh']) {
      assert.ok(Math.abs(cropOpen.align[key]) <= 1.5, `裁剪线层应贴合节点图片（${key}=${cropOpen.align[key]}，${JSON.stringify(cropOpen.align)}）`)
    }
    assert.equal(cropOpen.mask, 'none', `裁剪框不应再有遮罩，实际 ${cropOpen.mask}`)
    assert.equal(cropOpen.stageBackground, 'rgba(0, 0, 0, 0)', `裁剪层不应有底色，实际 ${cropOpen.stageBackground}`)
    assert.equal(cropOpen.stageBorder, '0px', `裁剪层不应有边框，实际 ${cropOpen.stageBorder}`)
    assert.equal(cropOpen.ratioLabel, '宽高比', `未选比例时按钮应显示“宽高比”，实际 ${cropOpen.ratioLabel}`)
    assert.ok(cropOpen.sizeText.includes(String(sourceSize.width)), `尺寸读数应是原图尺寸：${cropOpen.sizeText}`)

    // 裁剪线本身要能抓到（线只有 1px，另加了命中带）。
    const lineHit = await page.evaluate(() => {
      const line = document.querySelector('#canvasInlineCrop [data-crop-line="left"]')
      const box = line.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2 + 4, box.top + box.height / 2)
      return { side: hit?.dataset?.cropLine || '', classes: hit ? String(hit.className).slice(0, 40) : '' }
    })
    assert.equal(lineHit.side, 'left', `左裁剪线应能被抓到，实际命中 ${lineHit.classes}`)

    // 拖左裁剪线：裁剪框左边内移，读数按原图像素更新。
    const leftLine = await page.locator('#canvasInlineCrop [data-crop-line="left"]').boundingBox()
    const viewBox = await page.locator('#canvasInlineCrop [data-crop-view]').boundingBox()
    await page.mouse.move(leftLine.x + leftLine.width / 2, leftLine.y + leftLine.height / 2)
    await page.mouse.down()
    await page.mouse.move(leftLine.x + viewBox.width * 0.25, leftLine.y + leftLine.height / 2, { steps: 8 })
    await page.mouse.up()
    const afterLineDrag = await page.evaluate(() => ({
      sizeText: document.querySelector('#canvasInlineCrop [data-crop-size]').textContent,
      rectLeft: document.querySelector('#canvasInlineCrop [data-crop-rect]').style.left,
    }))
    assert.ok(afterLineDrag.sizeText !== cropOpen.sizeText, `拖线后读数应变化：${afterLineDrag.sizeText}`)
    assert.ok(parseFloat(afterLineDrag.rectLeft) > 10, `裁剪框左边界应内移：${afterLineDrag.rectLeft}`)

    // 滚轮缩放预览（只影响预览，不改裁剪坐标）。
    const beforeZoom = await page.evaluate(() => document.querySelector('#canvasInlineCrop [data-crop-view]').style.transform)
    const canvasScaleBeforeWheel = await page.evaluate(() => canvasState.scale)
    await page.mouse.move(viewBox.x + viewBox.width / 2, viewBox.y + viewBox.height / 2)
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(150)
    const afterZoom = await page.evaluate(() => ({
      transform: document.querySelector('#canvasInlineCrop [data-crop-view]').style.transform,
      sizeText: document.querySelector('#canvasInlineCrop [data-crop-size]').textContent,
      canvasScale: canvasState.scale,
    }))
    assert.ok(afterZoom.transform !== beforeZoom, `滚轮应缩放预览：${beforeZoom} → ${afterZoom.transform}`)
    assert.equal(afterZoom.sizeText, afterLineDrag.sizeText, '缩放预览不应改变裁剪尺寸')
    assert.equal(afterZoom.canvasScale, canvasScaleBeforeWheel, '滚轮缩放预览不应同时缩放画布')

    // 比例菜单里选 1:1：裁剪框锁成正方形（按原图像素）。
    await page.locator('#canvasInlineCrop [data-crop-ratio-menu]').click()
    await page.waitForSelector('#canvasInlineCrop [data-crop-menu]:not([hidden])')
    const ratioOptions = await page.evaluate(() => Array.from(
      document.querySelectorAll('#canvasInlineCrop [data-crop-ratio] span'),
    ).map((item) => item.textContent))
    assert.deepEqual(ratioOptions, ['原图比例', '1:1', '4:3', '3:4', '16:9', '9:16'], `比例选项：${ratioOptions}`)
    await page.locator('#canvasInlineCrop [data-crop-ratio="1:1"]').click()
    const square = await page.evaluate(() => {
      const frame = document.querySelector('#canvasInlineCrop [data-crop-rect]')
      const stage = document.querySelector('#canvasInlineCrop [data-crop-stage]')
      const frameBox = frame.getBoundingClientRect()
      const stageBox = stage.getBoundingClientRect()
      return {
        ratioLabel: document.querySelector('#canvasInlineCrop [data-crop-ratio-label]').textContent,
        widthRatio: frameBox.width / stageBox.width,
        heightRatio: frameBox.height / stageBox.height,
      }
    })
    assert.equal(square.ratioLabel, '1:1', `比例标签应更新：${square.ratioLabel}`)
    assert.ok(Math.abs(square.widthRatio * sourceSize.width - square.heightRatio * sourceSize.height) < 2,
      `1:1 裁剪框在原图像素上应是正方形：${JSON.stringify(square)}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-ratio-1440.png') })

    uploads.length = 0
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 15000 })
    for (let attempt = 0; attempt < 40 && uploads.length === 0; attempt += 1) await page.waitForTimeout(200)
    assert.equal(uploads.length, 1, `仅裁剪应上传 1 张，实际 ${uploads.length}`)
    const single = readPngSize(uploads[0].buffer)
    assert.equal(single.width, sourceSize.height, `1:1 裁剪宽度应等于原图短边，实际 ${single.width}`)
    assert.equal(single.height, sourceSize.height, `1:1 裁剪高度应等于原图短边，实际 ${single.height}`)
    // 裁出来的像素必须就是原图对应区域：1:1 锁比例后是居中的短边正方形。
    const originX = Math.round((sourceSize.width - sourceSize.height) / 2)
    const fidelity = comparePngRegion(
      decodePng(sourceBytes),
      decodePng(uploads[0].buffer),
      originX,
      0,
    )
    assert.equal(fidelity.ok, true, `裁剪结果应等于原图对应区域，实际 ${JSON.stringify(fidelity)}`)
    await page.waitForFunction(() => document.querySelectorAll('#canvasPlane .canvas-node').length === 2, null, { timeout: 15000 })
    await page.evaluate(() => {
      const node = window.qaInlineNode
      Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).filter((item) => item !== node).forEach((item) => deleteCanvasNodes([item]))
      selectCanvasNode(node)
    })
    await page.waitForTimeout(300)

    // ---- 内联裁剪：自己拖出的区域（不按默认分线）也要裁对 ----
    await page.locator('[data-qa-inline-node="primary"] [data-flora-action="crop"]').click()
    await page.waitForSelector('#canvasInlineCrop')
    const freeView = await page.locator('#canvasInlineCrop [data-crop-view]').boundingBox()
    const rightLine = await page.locator('#canvasInlineCrop [data-crop-line="right"]').boundingBox()
    await page.mouse.move(rightLine.x + rightLine.width / 2, rightLine.y + rightLine.height / 2)
    await page.mouse.down()
    await page.mouse.move(freeView.x + freeView.width / 2, rightLine.y + rightLine.height / 2, { steps: 10 })
    await page.mouse.up()
    const bottomLine = await page.locator('#canvasInlineCrop [data-crop-line="bottom"]').boundingBox()
    await page.mouse.move(bottomLine.x + bottomLine.width / 2, bottomLine.y + bottomLine.height / 2)
    await page.mouse.down()
    await page.mouse.move(bottomLine.x + bottomLine.width / 2, freeView.y + freeView.height / 2, { steps: 10 })
    await page.mouse.up()
    const freeSize = await page.evaluate(() => document.querySelector('#canvasInlineCrop [data-crop-size]').textContent)
    // 拖线时不能顺手连出线来：端口磁吸在内联工具下必须让位。
    const magnetIdle = await page.evaluate(() => ({
      tempConnection: Boolean(canvasState.tempConnection),
      pendingConnection: Boolean(canvasState.pendingConnection),
    }))
    assert.deepEqual(magnetIdle, { tempConnection: false, pendingConnection: false }, `拖裁剪线不应触发连线：${JSON.stringify(magnetIdle)}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-free-1440.png') })
    uploads.length = 0
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 15000 })
    for (let attempt = 0; attempt < 40 && uploads.length === 0; attempt += 1) await page.waitForTimeout(200)
    assert.equal(uploads.length, 1, `自由裁剪应上传 1 张，实际 ${uploads.length}`)
    const free = readPngSize(uploads[0].buffer)
    assert.ok(Math.abs(free.width - sourceSize.width / 2) <= 8, `自由裁剪宽度应接近原图一半：${free.width}`)
    assert.ok(Math.abs(free.height - sourceSize.height / 2) <= 8, `自由裁剪高度应接近原图一半：${free.height}`)
    // 左上角没动过，裁出来的左上区域必须就是原图左上区域。
    const freeFidelity = comparePngRegion(decodePng(sourceBytes), decodePng(uploads[0].buffer), 0, 0)
    assert.equal(freeFidelity.ok, true, `自由裁剪结果应等于原图左上区域，实际 ${JSON.stringify(freeFidelity)}`)
    await page.waitForFunction(() => document.querySelectorAll('#canvasPlane .canvas-node').length === 2, null, { timeout: 15000 })
    await page.evaluate(() => {
      const node = window.qaInlineNode
      Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).filter((item) => item !== node).forEach((item) => deleteCanvasNodes([item]))
      selectCanvasNode(node)
    })
    await page.waitForTimeout(300)

    // ---- 内联裁剪：拖动宫格分线决定怎么切 ----
    await page.locator('[data-qa-inline-node="primary"] [data-flora-action="crop"]').click()
    await page.waitForSelector('#canvasInlineCrop')
    await page.locator('#canvasInlineCrop [data-crop-grid-menu]').click()
    await page.waitForSelector('#canvasInlineCrop [data-crop-menu]:not([hidden])')
    await page.locator('#canvasInlineCrop [data-crop-grid="3x3"]').click()
    await page.waitForSelector('#canvasInlineCrop [data-crop-split="col:0"]')
    const splitOpen = await page.evaluate(() => ({
      splits: document.querySelectorAll('#canvasInlineCrop [data-crop-split]').length,
      positions: Array.from(document.querySelectorAll('#canvasInlineCrop [data-crop-split]')).map((line) => line.style.left || line.style.top),
      size: document.querySelector('#canvasInlineCrop [data-crop-size]').textContent,
      gridLabel: document.querySelector('#canvasInlineCrop [data-crop-grid-label]').textContent,
    }))
    assert.equal(splitOpen.splits, 4, `3×3 宫格应有 4 条可拖分线，实际 ${splitOpen.splits}`)
    assert.deepEqual(splitOpen.positions, ['33.3333%', '66.6667%', '33.3333%', '66.6667%'], `分线默认应等分：${splitOpen.positions}`)
    assert.ok(splitOpen.size.includes('每格'), `等分时应给每格尺寸：${splitOpen.size}`)
    assert.equal(splitOpen.gridLabel, '9 宫格裁剪', `宫格按钮应显示所选宫格：${splitOpen.gridLabel}`)
    const splitBox = await page.locator('#canvasInlineCrop [data-crop-split="col:0"]').boundingBox()
    const splitView = await page.locator('#canvasInlineCrop [data-crop-view]').boundingBox()
    const splitHit = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y)
      return hit?.dataset?.cropSplit || ''
    }, { x: splitBox.x + splitBox.width / 2, y: splitBox.y + splitBox.height / 2 })
    assert.equal(splitHit, 'col:0', `分线本身应能抓到，实际命中 ${splitHit}`)
    await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(splitView.x + splitView.width * 0.3, splitBox.y + splitBox.height / 2, { steps: 8 })
    await page.mouse.up()
    const splitDragged = await page.evaluate(() => ({
      left: document.querySelector('#canvasInlineCrop [data-crop-split="col:0"]').style.left,
      size: document.querySelector('#canvasInlineCrop [data-crop-size]').textContent,
    }))
    const splitLeft = parseFloat(splitDragged.left)
    assert.ok(Math.abs(splitLeft - 30) <= 2, `分线应跟着鼠标走到 30%，实际 ${splitDragged.left}`)
    assert.ok(splitDragged.size.includes('分线自定义'), `拖动分线后读数应写明分线自定义：${splitDragged.size}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-split-drag-1440.png') })
    uploads.length = 0
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 20000 })
    for (let attempt = 0; attempt < 60 && uploads.length < 9; attempt += 1) await page.waitForTimeout(200)
    assert.equal(uploads.length, 9, `3×3 宫格应上传 9 张切片，实际 ${uploads.length}`)
    const splitTiles = uploads.map((item) => ({ name: item.name, size: readPngSize(item.buffer) }))
    const splitTileOf = (row, column) => splitTiles.find((tile) => tile.name.includes(`r0${row}-c0${column}`))
    assert.ok(splitTileOf(1, 1), `应存在 r01-c01 切片：${splitTiles.map((tile) => tile.name).join(' | ')}`)
    // 分线拖到 30%：第一列就该是原图宽度的三成，第二列接着到 66.7%，剩下的是第三列。
    const firstColumnWidth = splitTileOf(1, 1).size.width
    assert.ok(Math.abs(firstColumnWidth - sourceSize.width * 0.3) <= 12, `第一列宽度应约为原图 30%（${firstColumnWidth}）`)
    const splitRowWidth = [splitTileOf(1, 1), splitTileOf(1, 2), splitTileOf(1, 3)].reduce((total, tile) => total + tile.size.width, 0)
    assert.ok(Math.abs(splitRowWidth - sourceSize.width) <= 3, `三列拼起来应等于原图宽：${splitRowWidth} vs ${sourceSize.width}`)
    await page.waitForFunction(() => document.querySelector('#canvasPlane .canvas-node-group'), null, { timeout: 15000 })
    await page.evaluate(() => {
      const node = window.qaInlineNode
      Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).filter((item) => item !== node).forEach((item) => deleteCanvasNodes([item]))
      selectCanvasNode(node)
    })
    await page.waitForTimeout(300)

    // ---- 内联裁剪：创建分镜格子（含自定义行列） ----
    await page.locator('[data-qa-inline-node="primary"] [data-flora-action="crop"]').click()
    await page.waitForSelector('#canvasInlineCrop')
    await page.locator('#canvasInlineCrop [data-crop-grid-menu]').click()
    await page.waitForSelector('#canvasInlineCrop [data-crop-menu]:not([hidden])')
    const gridOptions = await page.evaluate(() => Array.from(
      document.querySelectorAll('#canvasInlineCrop [data-crop-grid] b'),
    ).map((item) => item.textContent))
    assert.deepEqual(gridOptions, ['4 宫格裁剪', '9 宫格裁剪', '16 宫格裁剪', '25 宫格裁剪', '自定义宫格裁剪'], `宫格选项：${gridOptions}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-grid-menu-1440.png') })
    await page.locator('#canvasInlineCrop [data-crop-grid="custom"]').click()
    await page.waitForSelector('#canvasInlineCrop [data-crop-custom-rows]')
    const customDefaults = await page.evaluate(() => ({
      rows: document.querySelector('#canvasInlineCrop [data-crop-custom-rows]').value,
      columns: document.querySelector('#canvasInlineCrop [data-crop-custom-columns]').value,
      hint: document.querySelector('#canvasInlineCrop .canvas-inline-crop-custom p').textContent,
    }))
    assert.deepEqual(customDefaults, { rows: '3', columns: '3', hint: '请选择裁剪宫格（行 × 列）' }, `自定义宫格面板：${JSON.stringify(customDefaults)}`)
    await page.locator('#canvasInlineCrop [data-crop-custom-rows]').fill('2')
    await page.locator('#canvasInlineCrop [data-crop-custom-columns]').fill('3')
    await page.locator('#canvasInlineCrop [data-crop-custom-confirm]').click()
    const gridState = await page.evaluate(() => ({
      label: document.querySelector('#canvasInlineCrop [data-crop-grid-label]').textContent,
      size: document.querySelector('#canvasInlineCrop [data-crop-size]').textContent,
    }))
    assert.equal(gridState.label, '2 × 3 宫格', `自定义行列应写入：${gridState.label}`)
    assert.ok(gridState.size.includes('2 × 3'), `尺寸读数应体现宫格：${gridState.size}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-grid-1440.png') })

    uploads.length = 0
    await page.locator('#canvasInlineCrop [data-crop-confirm]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'), null, { timeout: 20000 })
    for (let attempt = 0; attempt < 60 && uploads.length < 6; attempt += 1) await page.waitForTimeout(200)
    assert.equal(uploads.length, 6, `2×3 宫格应上传 6 张切片，实际 ${uploads.length}`)
    const names = uploads.map((item) => item.name).sort()
    assert.deepEqual(names, ['r01-c01', 'r01-c02', 'r01-c03', 'r02-c01', 'r02-c02', 'r02-c03'].map((key) => names.find((name) => name.includes(key)) || key), `切片命名：${names}`)
    uploads.forEach((item) => {
      const size = readPngSize(item.buffer)
      assert.ok(size.width > 1 && size.height > 1, `切片尺寸应有效：${item.name} ${size.width}x${size.height}`)
      assert.ok(size.width <= sourceSize.width && size.height <= sourceSize.height, `切片不应超过原图：${item.name}`)
    })
    // 2×3 切片要覆盖整张原图：宽度两两相加约等于原图宽，高度三行相加约等于原图高。
    const tiles = uploads.map((item) => ({ name: item.name, size: readPngSize(item.buffer) }))
    const firstRowWidth = tiles.filter((item) => item.name.includes('r01')).reduce((total, item) => total + item.size.width, 0)
    const firstColumnHeight = tiles.filter((item) => item.name.includes('c01')).reduce((total, item) => total + item.size.height, 0)
    assert.ok(Math.abs(firstRowWidth - sourceSize.width) <= 2, `切片总宽应等于原图宽：${firstRowWidth} vs ${sourceSize.width}`)
    assert.ok(Math.abs(firstColumnHeight - sourceSize.height) <= 2, `切片总高应等于原图高：${firstColumnHeight} vs ${sourceSize.height}`)
    await page.waitForFunction(() => document.querySelector('#canvasPlane .canvas-node-group'), null, { timeout: 15000 })

    // ---- 生成节点（带底部操作区）上的裁剪：操作条不能被操作区盖住 ----
    const composerCrop = await page.evaluate(async ({ sourceUrl }) => {
      Array.from(document.querySelectorAll('#canvasPlane .canvas-node')).forEach((item) => deleteCanvasNodes([item]))
      const node = addCanvasApiNode({ x: 240, y: 240 })
      node.dataset.qaInlineNode = 'composer'
      updateCanvasGenerationResult(node, { src: sourceUrl, savedUrl: sourceUrl })
      selectCanvasNode(node)
      return true
    }, { sourceUrl: SOURCE_URL })
    assert.equal(composerCrop, true)
    await page.waitForTimeout(500)
    await page.locator('[data-qa-inline-node="composer"] [data-flora-action="crop"]').click()
    await page.waitForSelector('#canvasInlineCrop')
    await page.waitForTimeout(300)
    const composerState = await page.evaluate(() => {
      const host = document.querySelector('#canvasInlineCrop')
      const node = document.querySelector('[data-qa-inline-node="composer"]')
      const image = node.querySelector('.flora-node-result-area img, .canvas-image-upload img, img')
      const stage = host.querySelector('[data-crop-stage]').getBoundingClientRect()
      const imageBox = image.getBoundingClientRect()
      const bar = host.querySelector('.canvas-inline-crop-bar')
      const confirm = host.querySelector('[data-crop-confirm]')
      const barBox = bar.getBoundingClientRect()
      const confirmBox = confirm.getBoundingClientRect()
      const barHit = document.elementFromPoint(barBox.left + barBox.width / 2, barBox.top + barBox.height / 2)
      const confirmHit = document.elementFromPoint(confirmBox.left + confirmBox.width / 2, confirmBox.top + confirmBox.height / 2)
      const composer = node.querySelector('.flora-generator-composer')
      return {
        align: {
          dx: stage.left - imageBox.left,
          dy: stage.top - imageBox.top,
          dw: stage.width - imageBox.width,
          dh: stage.height - imageBox.height,
        },
        barHitInside: Boolean(barHit && bar.contains(barHit)),
        confirmHitInside: Boolean(confirmHit && confirm.contains(confirmHit)),
        composerSize: composer.getBoundingClientRect().width,
      }
    })
    for (const key of ['dx', 'dy', 'dw', 'dh']) {
      assert.ok(Math.abs(composerState.align[key]) <= 1.5, `生成节点的裁剪层也要贴合结果图（${key}=${composerState.align[key]}）`)
    }
    assert.equal(composerState.barHitInside, true, '生成节点上裁剪操作条必须可点（不能被操作区盖住）')
    assert.equal(composerState.confirmHitInside, true, '生成节点上确认按钮必须可点')
    assert.equal(composerState.composerSize, 0, `裁剪时生成操作区应让位，实际宽度 ${composerState.composerSize}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-crop-generator-1440.png') })
    await page.locator('#canvasInlineCrop [data-crop-cancel]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasInlineCrop'))
    await page.waitForTimeout(500)
    const composerRestored = await page.evaluate(() => {
      const node = document.querySelector('[data-qa-inline-node="composer"]')
      const composer = node.querySelector('.flora-generator-composer')
      const box = composer.hidden ? null : composer.getBoundingClientRect()
      const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + 10) : null
      return {
        visible: Boolean(box && box.width > 0),
        hitInside: Boolean(box && hit && composer.contains(hit)),
        inlineTool: node.dataset.inlineTool || null,
      }
    })
    assert.deepEqual(composerRestored, { visible: true, hitInside: true, inlineTool: null }, `退出裁剪后操作区应恢复：${JSON.stringify(composerRestored)}`)
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    console.log(JSON.stringify({
      ok: true,
      outpaint: {
        sizeText: afterDrag.sizeText,
        right: afterDrag.right,
        request: {
          direction: submitted[0].direction,
          alphaMaskInput: submitted[0].alphaMaskInput,
          padding: { left: submitted[0].left, top: submitted[0].top, right: submitted[0].right, bottom: submitted[0].bottom },
        },
      },
      crop: {
        align: cropOpen.align,
        mask: cropOpen.mask,
        ratio: square.ratioLabel,
        single: `${single.width}x${single.height}`,
        regionFidelity: fidelity,
        free: `${free.width}x${free.height}`,
        freeSizeText: freeSize,
        freeFidelity,
        splitLines: splitOpen,
        splitDrag: { left: splitDragged.left, size: splitDragged.size, firstColumnWidth, rowWidth: splitRowWidth },
        grid: gridState.label,
        tiles: uploads.length,
        composerNode: composerState,
        composerRestored,
      },
    }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
