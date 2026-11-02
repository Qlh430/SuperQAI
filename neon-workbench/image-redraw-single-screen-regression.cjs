const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const bridge = fs.readFileSync(path.join(__dirname, 'design-sources', 'script-before-save-bridge.js'), 'utf8')
function extractFunction(name, asyncFunction = false) {
  const marker = `${asyncFunction ? 'async ' : ''}function ${name}(`
  const start = bridge.indexOf(marker)
  assert.ok(start >= 0, `找不到 ${name}`)
  // This function contains HTML template literals with `${...}` expressions.
  // A raw brace counter mistakes braces inside template text for JS blocks and
  // truncates the function before the modal is appended.
  const endMarker = name === 'openCanvasMaskEditor'
    ? 'async function runCanvasRedrawTool('
    : name === 'raiseCanvasWorkbenchAboveEngine' ? 'async function openCanvasCutoutWorkbench(' : ''
  const end = endMarker ? bridge.indexOf(endMarker, start) : -1
  assert.ok(end > start, `无法定位 ${name} 的结束位置`)
  const source = bridge.slice(start, end).trimEnd()
  assert.equal(source.at(-1), '}', `${name} 没有完整结束`)
  return source
}
;(async () => {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(edge) ? edge : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    // The mask dialog's production positioning comes from the host workbench
    // stylesheet; this isolated function harness only needs the engine layer
    // for raiseCanvasWorkbenchAboveEngine and must not let the stub intercept
    // the real controls' pointer events.
    await page.setContent(`<style>
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .canvas-mask-modal { transform: scale(.9); }
      .canvas-mask-stage { position: relative; width: 600px; height: 400px; border: 4px solid #444; }
      .canvas-mask-image, .canvas-mask-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      .canvas-mask-brush-cursor { position: absolute; pointer-events: none; transform: translate(-50%, -50%); }
    </style><div id="neonEngineSurface" style="position:fixed;inset:0;z-index:2147483000;background:#111;pointer-events:none"></div>`)
    const outcomes = []
    await page.evaluate(({ opener, raiser }) => {
      const drawOperations = []
      const ctx = { clearRect(){}, save(){}, restore(){}, beginPath(){}, arc(...args){ drawOperations.push(['arc', ...args]) }, fill(){}, moveTo(...args){ drawOperations.push(['moveTo', ...args]) }, lineTo(...args){ drawOperations.push(['lineTo', ...args]) }, stroke(){} }
      HTMLCanvasElement.prototype.getContext = () => ctx
      window.maskDrawOperations = drawOperations
      window.clamp = (value, min, max) => Math.max(min, Math.min(max, value))
      // Deliberately simulate a non-1:1 desktop UI scale. Browser client and
      // bounding-rect values are already CSS pixels and must remain unchanged.
      window.toSystemDelta = value => value * 1.5
      window.loadImageElement = async source => source.includes('square')
        ? ({ naturalWidth: 800, naturalHeight: 800 })
        : ({ naturalWidth: 800, naturalHeight: 600 })
      window.initializeMaskFromImageAlpha = () => {}
      window.initializeMaskFromSavedMask = () => {}
      window.redrawMaskPreview = () => {}
      window.hideBrushCursor = () => {}
      window.updateBrushCursor = () => {}
      window.createFlux2MaskPngBlob = async () => new Blob(['mask'])
      window.createOpenAIEditMaskPngBlob = async () => new Blob(['openai-mask'])
      window.createOpenAIEditInputPngBlob = async () => new Blob(['base'])
      window.uploadCanvasImageFile = async file => `/uploaded/${file.name}`
      window.updateCanvasImageMaskPreview = () => {}
      window.setCanvasStatus = () => {}
      window.scheduleCanvasSave = () => {}
      window.refreshCanvasConnectedNodes = () => {}
      window.raiseCanvasWorkbenchAboveEngine = eval(`(${raiser})`)
      window.testNode = { dataset: { imageName: 'portrait.png' }, isConnected: true }
      window.redrawOutcomes = []
      window.openMask = eval(`(${opener})`)
    }, { opener: extractFunction('openCanvasMaskEditor', true), raiser: extractFunction('raiseCanvasWorkbenchAboveEngine') })

    async function openEditor(promptText) {
      await page.evaluate(() => window.openMask(window.testNode, {
        sourceUrl: '/portrait.png',
        onSubmit: value => window.redrawOutcomes.push(value),
      }))
      const prompt = page.locator('.canvas-mask-redraw-prompt')
      await prompt.waitFor({ state: 'visible' })
      if (promptText) await prompt.fill(promptText)
      const button = page.locator('.canvas-mask-submit')
      assert.equal(await button.textContent(), promptText ? '开始重绘' : '移除区域')
      await button.click()
      await page.waitForFunction(() => document.querySelectorAll('.canvas-mask-modal').length === 0)
      assert.equal(await page.locator('.canvas-redraw-modal').count(), 0, '不得再弹出第二个提示词窗口')
      return page.evaluate(() => window.redrawOutcomes.at(-1))
    }

    const redraw = await openEditor('把眼镜替换成黑色镜框')
    assert.equal(redraw.prompt, '把眼镜替换成黑色镜框')
    assert.equal(redraw.maskUrl, '/uploaded/portrait-mask.png')
    const remove = await openEditor('')
    assert.equal(remove.prompt, '')
    assert.equal(remove.maskUrl, '/uploaded/portrait-mask.png')
    await page.evaluate(() => window.openMask(window.testNode, { sourceUrl: '/portrait.png', onSubmit: value => window.redrawOutcomes.push(value) }))
    await page.locator('.canvas-mask-stage').waitFor({ state: 'visible' })
    const stage = page.locator('.canvas-mask-stage')
    const stageBox = await stage.boundingBox()
    const point = { x: stageBox.x + 140, y: stageBox.y + 110 }
    await page.mouse.move(point.x, point.y)
    const cursorGeometry = await page.locator('.canvas-mask-brush-cursor').evaluate(cursor => {
      const stage = document.querySelector('.canvas-mask-stage')
      const canvasRect = stage.querySelector('.canvas-mask-canvas').getBoundingClientRect()
      const canvas = stage.querySelector('.canvas-mask-canvas')
      const stageRect = stage.getBoundingClientRect()
      const imageScale = Math.min(canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height)
      const cursorRect = cursor.getBoundingClientRect()
      return { left: parseFloat(cursor.style.left), top: parseFloat(cursor.style.top), width: parseFloat(cursor.style.width), cursorCenterX: cursorRect.left + cursorRect.width / 2, cursorCenterY: cursorRect.top + cursorRect.height / 2, cursorRect: { left: cursorRect.left, top: cursorRect.top, width: cursorRect.width, height: cursorRect.height }, cursorParent: cursor.parentElement.tagName, cursorTransform: getComputedStyle(cursor).transform, stageLeft: stageRect.left, stageTop: stageRect.top, borderLeft: stage.clientLeft, borderTop: stage.clientTop, stageWidth: stage.clientWidth, stageHeight: stage.clientHeight, canvasWidth: canvasRect.width, canvasHeight: canvasRect.height, imageWidth: canvas.width, imageHeight: canvas.height, contentLeft: (stage.clientWidth - canvas.width * imageScale) / 2, contentTop: (stage.clientHeight - canvas.height * imageScale) / 2, imageScale, canvasClientWidth: canvas.clientWidth, canvasClientHeight: canvas.clientHeight }
    })
    assert.ok(Math.abs(cursorGeometry.cursorCenterX - point.x) < 1, `变换后的宿主界面中光标中心仍须对齐鼠标 X：${JSON.stringify(cursorGeometry)}`)
    assert.ok(Math.abs(cursorGeometry.cursorCenterY - point.y) < 1, `变换后的宿主界面中光标中心仍须对齐鼠标 Y：${JSON.stringify(cursorGeometry)}`)
    assert.ok(Math.abs(cursorGeometry.width - 56 * Math.min(cursorGeometry.canvasWidth / 800, cursorGeometry.canvasHeight / 600)) < 1, `画笔直径应与显示图像比例一致：${JSON.stringify(cursorGeometry)}`)
    const imagePoint = await page.locator('.canvas-mask-canvas').evaluate(canvas => { const rect = canvas.getBoundingClientRect(); return { x: rect.left + rect.width / 4, y: rect.top + rect.height / 2 } })
    await page.mouse.click(imagePoint.x, imagePoint.y)
    const lastDraw = await page.evaluate(() => window.maskDrawOperations.filter(operation => operation[0] === 'arc').at(-1))
    assert.ok(Math.abs(lastDraw?.[1] - 200) < 1, `点击图像四分之一宽处时遮罩应落在原图对应位置，几何=${JSON.stringify(cursorGeometry)}，点=${JSON.stringify(imagePoint)}，绘制=${JSON.stringify(lastDraw)}`)
    assert.ok(Math.abs(lastDraw?.[2] - 300) < 1, `点击图像垂直中心时遮罩应落在原图对应位置，实际绘制：${JSON.stringify(lastDraw)}`)
    await page.locator('.canvas-mask-close').click()
    await page.evaluate(() => window.openMask(window.testNode, { sourceUrl: '/portrait-square.png', onSubmit: value => window.redrawOutcomes.push(value) }))
    await page.locator('.canvas-mask-stage').waitFor({ state: 'visible' })
    await page.evaluate(() => {
      window.maskPointerDiagnostics = []
      document.querySelector('.canvas-mask-canvas').addEventListener('pointerdown', event => { const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect(); window.maskPointerDiagnostics.push({ x: event.clientX, y: event.clientY, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }) }, true)
    })
    const getVisibleImagePoint = async (xRatio, yRatio) => page.locator('.canvas-mask-canvas').evaluate((canvas, ratios) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = rect.width / Math.max(1, canvas.clientWidth)
      const scaleY = rect.height / Math.max(1, canvas.clientHeight)
      const fit = Math.min(canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height)
      const imageWidth = canvas.width * fit * scaleX
      const imageHeight = canvas.height * fit * scaleY
      return {
        x: rect.left + (canvas.clientWidth * scaleX - imageWidth) / 2 + imageWidth * ratios.x,
        y: rect.top + (canvas.clientHeight * scaleY - imageHeight) / 2 + imageHeight * ratios.y,
        geometry: { rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, backingWidth: canvas.width, backingHeight: canvas.height, fit, scaleX, scaleY },
      }
    }, { x: xRatio, y: yRatio })
    for (const [xRatio, yRatio] of [[.05,.5], [.95,.5], [.5,.05], [.5,.95]]) {
      const point = await getVisibleImagePoint(xRatio, yRatio)
      await page.mouse.click(point.x, point.y)
      const draw = await page.evaluate(() => window.maskDrawOperations.filter(operation => operation[0] === 'arc').at(-1))
      const pointer = await page.evaluate(() => window.maskPointerDiagnostics.at(-1))
      assert.ok(Math.abs(draw?.[1] - 800 * xRatio) < 1, `正方形图像水平边缘落点应准确（${xRatio},${yRatio}），鼠标=${JSON.stringify(point)}，pointer=${JSON.stringify(pointer)}，实际绘制：${JSON.stringify(draw)}`)
      assert.ok(Math.abs(draw?.[2] - 800 * yRatio) < 1, `正方形图像垂直边缘落点应准确（${xRatio},${yRatio}），鼠标=${JSON.stringify(point)}，pointer=${JSON.stringify(pointer)}，实际绘制：${JSON.stringify(draw)}`)
    }
    await page.locator('.canvas-mask-zoom-in').click()
    const zoomedPoint = await getVisibleImagePoint(.9, .85)
    await page.mouse.click(zoomedPoint.x, zoomedPoint.y)
    const zoomedDraw = await page.evaluate(() => window.maskDrawOperations.filter(operation => operation[0] === 'arc').at(-1))
    assert.ok(Math.abs(zoomedDraw?.[1] - 720) < 1, `放大后偏右落点应准确，实际绘制：${JSON.stringify(zoomedDraw)}`)
    assert.ok(Math.abs(zoomedDraw?.[2] - 680) < 1, `放大后偏下落点应准确，实际绘制：${JSON.stringify(zoomedDraw)}`)
    assert.deepEqual(pageErrors, [], `界面运行时报错：${pageErrors.join('; ')}`)
    console.log(JSON.stringify({ ok: true, cases: ['填写提示词直接重绘', '留空直接移除', '变换后的宿主界面中光标中心仍对齐鼠标', '图片留白时画笔落点与鼠标一致', '正方形图像四边落笔准确', '放大后偏边落笔准确'], secondDialog: false }, null, 2))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
