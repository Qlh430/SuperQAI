const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['flora-generator-composer.js', 'flora-generator-composer.js'],
  ['flora-generator-parameters.js', 'flora-generator-parameters.js'],
  ['flora-node-shell.js', 'flora-node-shell.js'],
  ['flora-node-shell.css', 'flora-node-shell.css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: served.endsWith('.css') ? 'text/css' : 'application/javascript',
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-asset-collection'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-composer-panel-board'
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'
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
      window.qaVideo = addCanvasApiVideoNode({ x: 120, y: 60 })
      window.qaReveals = []
      window.addEventListener('flora-generator-reveal', event => window.qaReveals.push({
        deltaX: Number(event.detail?.screenDeltaX),
        deltaY: Number(event.detail?.screenDeltaY),
        canvasXAfter: Number(canvasState.x),
        canvasYAfter: Number(canvasState.y),
      }))
    })
    await page.waitForTimeout(400)

    const bandSnapshot = async () => page.evaluate(() => {
      const node = window.qaVideo
      const panel = node.querySelector('.flora-generator-composer')
      const band = panel.querySelector('.flora-generator-reference-area')
      const visibleText = []
      for (const element of band.querySelectorAll('*')) {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        if (style.display === 'none' || style.visibility === 'hidden' || box.width < 1 || box.height < 1) continue
        const own = Array.from(element.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent.trim()).join(' ').trim()
        if (own) visibleText.push(own)
      }
      const card = panel.querySelector('.flora-reference-card')
      const cardBox = card?.getBoundingClientRect()
      const add = band.querySelector('.flora-generator-add-reference')
      const addBox = add?.getBoundingClientRect()
      const bandBox = band.getBoundingClientRect()
      return {
        visibleText,
        bandLeft: bandBox.left,
        bandRight: bandBox.right,
        cardLeft: cardBox ? cardBox.left : null,
        cardRight: cardBox ? cardBox.right : null,
        addLeft: addBox ? addBox.left : null,
        addWidth: addBox ? addBox.width : null,
        badge: card?.querySelector('.flora-reference-index')?.textContent?.trim() || '',
        cardLabel: card?.querySelector('.flora-reference-thumb')?.getAttribute('aria-label') || '',
        cardTitle: card?.querySelector('.flora-reference-thumb')?.getAttribute('title') || '',
      }
    })

    const settledPlacement = async (label, place, width) => {
      if (width) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(200)
      }
      const before = await page.evaluate(({ place }) => {
        const node = window.qaVideo
        clearCanvasSelection()
        const zoom = canvasState.scale || 1
        if (place === 'right') canvasState.x = innerWidth - 120 - Number(node.dataset.x) * zoom - node.offsetWidth * zoom
        else if (place === 'left') canvasState.x = 40 - Number(node.dataset.x) * zoom
        else canvasState.x = (innerWidth - node.offsetWidth * zoom) / 2 - Number(node.dataset.x) * zoom
        canvasState.y = 80 - Number(node.dataset.y) * zoom
        applyCanvasTransformNow()
        return { panelHiddenAfterClear: node.querySelector('.flora-generator-composer').hidden, canvasX: Number(canvasState.x) }
      }, { place })
      await page.waitForTimeout(80)
      await page.evaluate(() => selectCanvasNode(window.qaVideo))
      await page.waitForTimeout(320)
      return page.evaluate(({ label, before }) => {
        const node = window.qaVideo
        const panel = node.querySelector('.flora-generator-composer')
        const viewport = document.getElementById('infiniteCanvas')
        const nodeBox = node.getBoundingClientRect()
        const panelBox = panel.getBoundingClientRect()
        const viewBox = viewport.getBoundingClientRect()
        return {
          label,
          open: !panel.hidden,
          before,
          canvasX: Number(canvasState.x),
          reveals: window.qaReveals.slice(-2),
          innerWidth,
          centredDelta: panelBox.left - (nodeBox.left + nodeBox.width / 2 - panelBox.width / 2),
          verticalGap: panelBox.top - nodeBox.bottom,
          panelLeft: panelBox.left,
          panelRight: panelBox.right,
          viewportLeft: viewBox.left,
          viewportRight: viewBox.right,
        }
      }, { label, before })
    }

    // 参考带：加号必须紧贴素材卡片，卡片之后不再出现名称或常驻说明。
    const emptyBand = await bandSnapshot()
    assert.ok(emptyBand.visibleText.every(text => !/首帧参考|连接图片节点作为首帧/.test(text)),
      `参考带空态不应出现常驻说明：${JSON.stringify(emptyBand.visibleText)}`)
    assert.ok(emptyBand.addLeft - emptyBand.bandLeft <= 9,
      `空态加号应贴在参考带起点：add=${emptyBand.addLeft} band=${emptyBand.bandLeft}`)

    await page.evaluate(() => {
      const video = window.qaVideo
      const image = window.qaReferenceImage = addCanvasImageGeneratorNode({ x: 640, y: -600 })
      updateCanvasGenerationResult(image, {
        src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#242826"/><circle cx="200" cy="200" r="120" fill="#b8ddba"/></svg>'),
      })
      connectCanvasNodes(image.dataset.id, video.dataset.id, 'input', 'output')
      selectCanvasNode(video)
    })
    await page.waitForTimeout(700)
    const filledBand = await bandSnapshot()
    assert.ok(filledBand.cardRight !== null, '参考带应显示首帧素材卡片')
    assert.equal(filledBand.badge, '图片1', '素材卡片保持原有编号角标')
    assert.ok(/生成结果/.test(filledBand.cardLabel + filledBand.cardTitle),
      `素材名称只通过卡片提示提供：${filledBand.cardLabel} / ${filledBand.cardTitle}`)
    assert.ok(filledBand.visibleText.every(text => !/首帧参考/.test(text)),
      `卡片后不应出现名称文案：${JSON.stringify(filledBand.visibleText)}`)
    assert.ok(Math.abs((filledBand.addLeft - filledBand.cardRight) - 8) <= 1.5,
      `加号应紧贴卡片，间距 8px：cardRight=${filledBand.cardRight} addLeft=${filledBand.addLeft}`)
    assert.ok(Math.abs(filledBand.addWidth - 44) <= 1, `加号保持 44px：${filledBand.addWidth}`)

    // 操作区定位：任何缩放与视口下都对齐节点中心，并在靠边时由画布让位保持完整可见。
    const placements = []
    placements.push(await settledPlacement('scale1-center', 'center'))
    placements.push(await settledPlacement('scale1-right', 'right'))
    placements.push(await settledPlacement('scale1-left', 'left'))
    await page.evaluate(() => { canvasState.scale = 0.6; applyCanvasTransformNow() })
    placements.push(await settledPlacement('scale0.6-right', 'right'))
    await page.evaluate(() => { canvasState.scale = 1.35; applyCanvasTransformNow() })
    placements.push(await settledPlacement('scale1.35-left', 'left'))
    placements.push(await settledPlacement('resized-1100-right', 'right', 1100))
    placements.push(await settledPlacement('resized-390-right', 'right', 390))
    for (const row of placements) {
      assert.ok(row.open, `${row.label} 单选时操作区应展开`)
      assert.ok(Math.abs(row.centredDelta) <= 1.5,
        `${row.label} 操作区必须对齐节点中心：偏差 ${row.centredDelta.toFixed(2)}px`)
      assert.ok(Math.abs(row.verticalGap - 16) <= 1.5,
        `${row.label} 操作区与节点保持 16px 间距：${row.verticalGap.toFixed(2)}px`)
      assert.ok(row.panelLeft >= 16 - 1 && row.panelRight <= row.innerWidth - 16 + 1,
        `${row.label} 靠边时操作区应在窗口内完整可见：panel=${row.panelLeft.toFixed(1)}..${row.panelRight.toFixed(1)} window=${row.innerWidth}`)
      if (row.viewportRight - row.viewportLeft >= row.panelRight - row.panelLeft + 32) {
        assert.ok(row.panelLeft >= row.viewportLeft - 1 && row.panelRight <= row.viewportRight + 1,
          `${row.label} 画布视口足够宽时操作区应留在视口内：panel=${row.panelLeft.toFixed(1)}..${row.panelRight.toFixed(1)} viewport=${row.viewportLeft.toFixed(1)}..${row.viewportRight.toFixed(1)}`)
      }
    }
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(200)
    await settledPlacement('screenshot', 'right')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance', 'composer-panel-reference.png') })
    console.log(JSON.stringify({
      ok: true,
      source: process.env.GENERATOR_SOURCE || 'runtime',
      emptyBand,
      filledBand,
      placements: placements.map(row => ({
        label: row.label,
        centredDelta: Number(row.centredDelta.toFixed(2)),
        verticalGap: Number(row.verticalGap.toFixed(2)),
        panel: [Math.round(row.panelLeft), Math.round(row.panelRight)],
        viewport: [Math.round(row.viewportLeft), Math.round(row.viewportRight)],
        canvasX: row.canvasX,
        reveals: row.reveals,
      })),
    }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
