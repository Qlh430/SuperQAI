// 扩图不许缩小原图：打开扩图前后，节点里那张图的显示尺寸与位置必须一致；
// 扩区只画在原图四周的带子里（原图那块留空，节点自己的图透出来）；
// 拖边距只改变扩区，原图仍然纹丝不动。
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

// 真实尺寸的纯色 PNG（1024×768）：扩图比例是按原图像素算的，用 1×1 桩图会得到荒唐的缩放。
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

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
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
      canvasState.activeBoardId = 'qa-outpaint-scale-board'
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
      // 一张 1024×768 的素材图：节点按 400 宽显示，扩图比例 = 400 / 1024。
      window.qaOutpaintNode = addCanvasImage('/output/qa-outpaint-source.png', '扩图源.png', { x: 300, y: 260 })
      canvasState.scale = 1
      canvasState.x = 40
      canvasState.y = 40
      applyCanvasTransformNow()
    })
    await page.waitForTimeout(700)

    const read = async () => page.evaluate(() => {
      const round = (value) => Math.round(value * 10) / 10
      const rect = (element) => {
        const box = element?.getBoundingClientRect?.()
        return box
          ? {
            left: round(box.left),
            top: round(box.top),
            width: round(box.width),
            height: round(box.height),
            right: round(box.right),
            bottom: round(box.bottom),
          }
          : null
      }
      const node = window.qaOutpaintNode
      const dialog = document.querySelector('#canvasInlineOutpaint')
      const frame = dialog?.querySelector('[data-inline-outpaint-frame]')
      const slot = dialog?.querySelector('[data-inline-outpaint-image]')
      const band = (side) => dialog?.querySelector(`[data-inline-outpaint-band="${side}"]`)
      const image = node.querySelector('.flora-node-result-area img, .canvas-image-upload img')
      const imageStyle = image ? getComputedStyle(image) : null
      return {
        image: rect(image),
        imageVisible: Boolean(image) && imageStyle.visibility !== 'hidden' && imageStyle.display !== 'none' && Number(imageStyle.opacity) > 0,
        frame: rect(frame),
        slot: rect(slot),
        bands: {
          top: rect(band('top')),
          right: rect(band('right')),
          bottom: rect(band('bottom')),
          left: rect(band('left')),
        },
        bandHidden: {
          top: Boolean(band('top')?.hidden),
          right: Boolean(band('right')?.hidden),
          bottom: Boolean(band('bottom')?.hidden),
          left: Boolean(band('left')?.hidden),
        },
        padding: getCanvasComfyPadding(node),
        source: { width: Number(node.dataset.comfyOutpaintSourceWidth), height: Number(node.dataset.comfyOutpaintSourceHeight) },
        sizeText: dialog?.querySelector('[data-inline-outpaint-size]')?.textContent || '',
        debug: {
          visualScale: Number(node.dataset.comfyOutpaintVisualScale || 0),
          canvasX: Math.round(canvasState.x),
          canvasY: Math.round(canvasState.y),
          viewport: rect(document.querySelector('#infiniteCanvas')),
          stage: rect(dialog?.querySelector('[data-inline-outpaint-stage]')),
          frameStyle: frame ? { left: frame.style.left, top: frame.style.top, width: frame.style.width, height: frame.style.height, position: getComputedStyle(frame).position } : null,
        },
        barTop: (() => {
          const bar = dialog?.querySelector('.canvas-inline-outpaint-bar')
          const barBox = bar?.getBoundingClientRect?.()
          return barBox ? round(barBox.top) : null
        })(),
        open: Boolean(dialog),
      }
    })

    const before = await read()
    assert.equal(before.open, false, '初始不应有扩图编辑器')
    assert.ok(before.image && before.image.width > 100, `节点里应有一张可见的图：${JSON.stringify(before)}`)

    // 打开扩图（工具栏「扩图」）
    await page.evaluate(() => window.qaOutpaintNode.querySelector('[data-flora-action="outpaint"]').click())
    await page.waitForFunction(() => Boolean(document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-frame]')), null, { timeout: 5000 })
    await page.waitForTimeout(400)
    const opened = await read()

    // 1. 原图大小与位置不变，而且仍然可见
    assert.equal(opened.imageVisible, true, `打开扩图后节点里的原图仍应可见：${JSON.stringify(opened)}`)
    assert.ok(Math.abs(opened.image.width - before.image.width) <= 1,
      `原图宽度不该变：打开前 ${before.image.width} → 打开后 ${opened.image.width}`)
    assert.ok(Math.abs(opened.image.height - before.image.height) <= 1,
      `原图高度不该变：打开前 ${before.image.height} → 打开后 ${opened.image.height}`)
    assert.ok(Math.abs(opened.image.left - before.image.left) <= 1 && Math.abs(opened.image.top - before.image.top) <= 1,
      `原图位置不该动：${JSON.stringify({ before: before.image, after: opened.image })}`)

    // 2. 图片槽正好盖住原图（外框是以它为准长出来的）
    assert.ok(Math.abs(opened.slot.left - opened.image.left) <= 1 && Math.abs(opened.slot.top - opened.image.top) <= 1,
      `图片槽应与原图对齐：${JSON.stringify({ slot: opened.slot, image: opened.image })}`)
    assert.ok(Math.abs(opened.slot.width - opened.image.width) <= 1 && Math.abs(opened.slot.height - opened.image.height) <= 1,
      `图片槽应与原图同尺寸：${JSON.stringify({ slot: opened.slot, image: opened.image })}`)

    // 3. 扩区只在原图四周：四条带都在原图外侧，外框 = 原图 + 四边扩出
    const padding = opened.padding
    assert.ok(padding.top > 0 && padding.right > 0 && padding.bottom > 0 && padding.left > 0,
      `默认应带一点四边扩出：${JSON.stringify(padding)}`)
    assert.ok(opened.bands.top.bottom <= opened.image.top + 1,
      `上扩区应在原图上方：${JSON.stringify(opened.bands.top)} vs 原图 top ${opened.image.top}`)
    assert.ok(opened.bands.bottom.top >= opened.image.top + opened.image.height - 1,
      `下扩区应在原图下方：${JSON.stringify(opened.bands.bottom)}`)
    assert.ok(opened.bands.left.right <= opened.image.left + 1,
      `左扩区应在原图左侧：${JSON.stringify(opened.bands.left)}`)
    assert.ok(opened.bands.right.left >= opened.image.left + opened.image.width - 1,
      `右扩区应在原图右侧：${JSON.stringify(opened.bands.right)}`)
    assert.ok(Math.abs(opened.frame.width - (opened.image.width * (opened.source.width + padding.left + padding.right) / opened.source.width)) <= 2,
      `外框宽度 = 原图宽 × (原图+左右扩出)/原图：${JSON.stringify({ frame: opened.frame.width, image: opened.image.width, padding, source: opened.source })}`)
    assert.ok(opened.frame.left <= opened.image.left + 1 && opened.frame.top <= opened.image.top + 1,
      `外框应包住原图：${JSON.stringify({ frame: opened.frame, image: opened.image })}`)

    // 4. 尺寸读数与操作条位置
    assert.equal(opened.sizeText, `${opened.source.width + padding.left + padding.right} × ${opened.source.height + padding.top + padding.bottom} · 扩图`,
      `尺寸读数应是原图+边距：${opened.sizeText}`)
    assert.ok(opened.barTop > opened.frame.top,
      `操作条应在外框下方：bar=${opened.barTop} frameTop=${opened.frame.top}`)

    // 5. 拖右边把手加宽扩区：只有扩区变，原图纹丝不动
    const handleBox = await page.evaluate(() => {
      const handle = document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-side="right"]')
      const box = handle.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    })
    await page.mouse.move(handleBox.x, handleBox.y)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 60, handleBox.y, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const dragged = await read()
    assert.ok(dragged.padding.right > padding.right,
      `向右拖动应加宽右扩区：${padding.right} → ${dragged.padding.right}`)
    assert.ok(Math.abs(dragged.image.width - before.image.width) <= 1 && Math.abs(dragged.image.left - before.image.left) <= 1,
      `拖扩区之后原图仍不该动：${JSON.stringify({ before: before.image, after: dragged.image })}`)
    assert.ok(dragged.bands.right.left >= dragged.image.left + dragged.image.width - 1,
      `右扩区仍在原图右侧：${JSON.stringify(dragged.bands.right)}`)
    assert.equal(dragged.sizeText, `${dragged.source.width + dragged.padding.left + dragged.padding.right} × ${dragged.source.height + dragged.padding.top + dragged.padding.bottom} · 扩图`,
      `尺寸读数应跟着边距走：${dragged.sizeText}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/inline-outpaint-scale-1600.png') })

    // 6. 关闭后原图依旧不变
    await page.evaluate(() => document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-close]').click())
    await page.waitForTimeout(300)
    const closed = await read()
    assert.equal(closed.open, false, '关闭后不应有扩图编辑器')
    assert.ok(Math.abs(closed.image.width - before.image.width) <= 1 && Math.abs(closed.image.left - before.image.left) <= 1,
      `关闭后原图尺寸位置不变：${JSON.stringify({ before: before.image, after: closed.image })}`)
    assert.deepEqual(errors, [], `页面错误：${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ ok: true, before: before.image, opened: { image: opened.image, frame: opened.frame, bands: opened.bands, sizeText: opened.sizeText }, dragged: { image: dragged.image, right: dragged.padding.right, sizeText: dragged.sizeText } }, null, 1))
  } finally {
    await browser.close()
  }
})()
