// 抠图结果：必须是图片生成节点、必须有一条连回原图的连线、名字来自原图而不是后端保存的文件名。
// 旧实现（addCanvasImage + 无连线）在这些断言下必然失败：节点是素材图片节点、canvasState 里没有这条连接。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['flora-node-shell.js', 'flora-node-shell.js'],
  ['flora-node-shell.css', 'flora-node-shell.css'],
  ['flora-generator-composer.js', 'flora-generator-composer.js'],
  ['flora-generation-history.js', 'flora-generation-history.js'],
]
const RESULT_URL = '/output/qa-cutout-result.png'
const BACKEND_FILENAME = 'qa-cutout-source-抠图-抠图_1791792620039_49c42b2f.png'

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    for (const pattern of ['**/output/qa-cutout-source.png', `**${RESULT_URL}`]) {
      await page.route(pattern, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
    }
    // GENERATOR_SOURCE 指向 neon-workbench/design-sources：改源码后、部署前先在这里验证。
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: served.endsWith('.css') ? 'text/css' : 'application/javascript',
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ resultUrl, backendFilename }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-cutout-result-board'
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
      const source = window.qaCutoutSource = addCanvasImage('/output/qa-cutout-source.png', '抠图来源.png', { x: 220, y: 200 })
      canvasState.scale = 1
      canvasState.x = 120 - Number(source.dataset.x)
      canvasState.y = 160 - Number(source.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(source)
      window.qaCutoutResult = placeCanvasCutoutResult(source, {
        url: resultUrl,
        filename: backendFilename,
        width: 1024,
        height: 1024,
      })
    }, { resultUrl: RESULT_URL, backendFilename: BACKEND_FILENAME })
    await page.waitForFunction(() => window.qaCutoutResult?.querySelector('.canvas-node-result img')?.naturalWidth > 0, null, { timeout: 8000 })
    await page.waitForTimeout(600)

    const state = await page.evaluate(() => {
      const source = window.qaCutoutSource
      const result = window.qaCutoutResult
      const connection = canvasState.connections.find(item => item.from === source.dataset.id && item.to === result.dataset.id)
      const hit = document.querySelector(`#canvasConnections .canvas-connection-hit[data-connection-from="${source.dataset.id}"][data-connection-to="${result.dataset.id}"]`)
      const hitCount = document.querySelectorAll('#canvasConnections .canvas-connection-hit').length
      const history = window.FloraGenerationHistory?.serialize(result) || {}
      const model = syncCanvasNodeModel(result) || {}
      return {
        sourceId: source.dataset.id,
        resultId: result.dataset.id,
        classes: Array.from(result.classList),
        kind: resolveCanvasNodeKind(result),
        label: result.querySelector(':scope > .flora-node-label .flora-node-label-title')?.textContent || '',
        ariaLabel: result.querySelector(':scope > .flora-node-label .flora-node-label-title')?.getAttribute('aria-label') || '',
        imageName: result.dataset.imageName,
        modelKind: model.kind,
        modelImageName: model.imageName || '',
        hasConnection: Boolean(connection),
        connectionPorts: connection ? { fromPort: connection.fromPort || 'output', toPort: connection.toPort || 'input' } : null,
        renderedWire: Boolean(hit),
        wireCount: hitCount,
        wireHitAttributes: hit ? { from: hit.getAttribute('data-connection-from'), to: hit.getAttribute('data-connection-to') } : null,
        renderedWireGeometry: hit?.getAttribute('d') || '',
        resultSrc: result.querySelector('.canvas-node-result img')?.getAttribute('src') || '',
        promptField: Boolean(result.querySelector('.canvas-node-prompt')),
        referenceCount: document.querySelectorAll('.flora-generator-reference-area .canvas-node-ref, .flora-generator-reference-area .flora-generator-reference-item').length,
        incomingCount: (getCanvasIncomingItems(result.dataset.id) || []).length,
        historyCount: (history.generationHistory || []).length,
        historySrc: history.generationHistory?.[0]?.src || '',
        currentGenerationId: history.currentGenerationId || '',
        badge: result.querySelector('.flora-generation-history-badge')?.textContent?.trim() || '',
        resultX: Number(result.dataset.x),
        sourceX: Number(source.dataset.x),
        sourceWidth: source.offsetWidth || Number(source.dataset.width || 0),
        resultWidth: result.offsetWidth,
        resultY: Number(result.dataset.y),
        sourceY: Number(source.dataset.y),
        selected: canvasState.selectedIds.has(result.dataset.id),
        selectedCount: canvasState.selectedIds.size,
        composerVisible: (() => {
          const panel = result.querySelector('.flora-generator-composer')
          if (!panel || panel.hidden) return false
          const box = panel.getBoundingClientRect()
          return box.width > 0 && box.height > 0 && box.top >= result.getBoundingClientRect().bottom
        })(),
        visibleWireCount: getVisibleCanvasConnections().length,
      }
    })

    assert.ok(state.classes.includes('canvas-node-generator'), `抠图结果应是图片生成节点：${JSON.stringify(state.classes)}`)
    assert.ok(state.classes.includes('canvas-node-image'), `图片生成节点仍需保留图片节点类：${JSON.stringify(state.classes)}`)
    assert.equal(state.kind, 'generator', `节点类型应为 generator，实际 ${state.kind}`)
    assert.equal(state.label, '抠图来源-抠图.png', `节点标题应为「抠图来源-抠图.png」，实际 ${state.label}`)
    assert.equal(state.imageName, '抠图来源-抠图.png', `节点名应来自原图，实际 ${state.imageName}`)
    assert.ok(!state.imageName.includes('抠图-抠图'), `节点名不应出现重复的抠图后缀：${state.imageName}`)
    assert.ok(!/_\d{10,}/.test(state.imageName), `节点名不应带后端时间戳文件名：${state.imageName}`)
    assert.equal(state.modelKind, 'image', `序列化类型应仍是图片节点，实际 ${state.modelKind}`)
    assert.equal(state.modelImageName, '抠图来源-抠图.png', `序列化应保留节点名，实际 ${state.modelImageName}`)
    assert.equal(state.hasConnection, true, '抠图结果必须与原图相连')
    assert.deepEqual(state.connectionPorts, { fromPort: 'output', toPort: 'input' }, `连线端口：${JSON.stringify(state.connectionPorts)}`)
    assert.equal(state.renderedWire, true, '画布上必须真的画出这条连线')
    assert.deepEqual(state.wireHitAttributes, { from: state.sourceId, to: state.resultId }, `连线两端：${JSON.stringify(state.wireHitAttributes)}`)
    assert.equal(state.wireCount, 1, `画布上应只有这一条连线，实际 ${state.wireCount}`)
    assert.equal(state.visibleWireCount, 1, `可见连线应为 1 条，实际 ${state.visibleWireCount}`)
    assert.ok(state.renderedWireGeometry.includes('M'), `连线路径应有几何数据：${state.renderedWireGeometry}`)
    assert.ok(state.resultSrc.includes('qa-cutout-result.png'), `节点应显示抠好的图，实际 ${state.resultSrc}`)
    assert.equal(state.promptField, true, '图片生成节点应带生成操作区')
    assert.equal(state.incomingCount, 1, `抠图结果应把原图当参考素材，实际 ${state.incomingCount} 条`)
    assert.equal(state.historyCount, 1, `抠图结果应写进节点历史，实际 ${state.historyCount} 条`)
    assert.equal(state.historySrc, RESULT_URL, `历史条目应指向抠好的图，实际 ${state.historySrc}`)
    assert.ok(state.currentGenerationId, '历史应有当前结果 id')
    assert.equal(state.badge, '1', `历史徽标应显示 1，实际 ${state.badge}`)
    assert.ok(state.resultX >= state.sourceX + state.sourceWidth + 24, `结果应落在原图右侧：${state.resultX} <= ${state.sourceX + state.sourceWidth}`)
    assert.equal(state.resultY, state.sourceY, `结果应与原图同高：${state.resultY} vs ${state.sourceY}`)
    assert.equal(state.selected, true, '放置完成后应选中结果节点')
    assert.equal(state.selectedCount, 1, `结果节点应单独选中，实际 ${state.selectedCount} 个`)
    assert.equal(state.composerVisible, true, '结果节点选中后应显示生成操作区，且位于节点下方')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/cutout-result-1440.png') })
    // 窄屏复核：结果节点与它下面的生成操作区在 390px 也要完整可见。
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { focusAgentCanvasNodesInViewport([window.qaCutoutResult]) })
    await page.waitForTimeout(500)
    const narrow = await page.evaluate(() => {
      const node = window.qaCutoutResult
      const panel = node?.querySelector('.flora-generator-composer')
      const box = panel?.getBoundingClientRect()
      return {
        panelHidden: panel ? panel.hidden : null,
        nodeSelected: canvasState.selectedIds.has(node?.dataset.id || ''),
        nodeClasses: Array.from(node?.classList || []),
        panelRect: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
        composerVisible: Boolean(box && box.width > 0 && box.height > 0),
        withinViewport: Boolean(box && box.left >= 0 && box.right <= window.innerWidth + 1),
        widthLimit: window.innerWidth - 32,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    assert.equal(narrow.composerVisible, true, `390px 下生成操作区应可见：${JSON.stringify(narrow)}`)
    assert.equal(narrow.withinViewport, true, `390px 下操作区不应超出视口：${JSON.stringify(narrow)}`)
    assert.ok(narrow.horizontalOverflow <= 0, `390px 下不应出现横向溢出：${narrow.horizontalOverflow}`)
    await page.screenshot({ path: path.join(__dirname, 'acceptance/cutout-result-390.png') })
    console.log(JSON.stringify({ ok: true, state }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
