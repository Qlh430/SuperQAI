const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = process.env.PERF_SOURCE || path.join(__dirname, 'design-sources')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const results = [], errors = []
    for (const optimized of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {}, operations: [], success: true } }))
      if (!optimized && process.env.QA_RUNTIME_BASELINE) {
        for (const file of ["flora-generator-composer.js", "flora-node-shell.js", "script.js"]) await page.route(`**/${file}*`, r => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(process.env.QA_RUNTIME_BASELINE, file), "utf8") }))
      }
      if (optimized && !process.env.QA_VISUAL_DEPLOYED) {
        for (const file of ['flora-generator-composer.js', 'flora-node-shell.js']) await page.route(`**/${file}*`, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(source, file), 'utf8') }))
        await page.route('**/script.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(source, 'script-before-save-bridge.js'), 'utf8') }))
      }
      await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
      await page.evaluate(async () => {
        await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-text', 'canvas-node-media', 'canvas-node-minimax-h3'])
        await loadCanvasBoards(); canvasState.activeBoardId = 'qa-perf-visual'; canvasState.isRestoring = true
        const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
        const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
        view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
        document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
        window.qaImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#48a"/></svg>')
        const generator = addCanvasImageGeneratorNode({ x: 100, y: 100 }, { focus: false })
        const text = addCanvasText({ x: 600, y: 100 }, { text: '# 提示词\n\n香蕉被人拿起剥开', name: '文字', focus: false })
        const image = addCanvasUploadPlaceholder({ x: 100, y: 700 }); renderCanvasUploadNode(image, { src: qaImage, name: '素材图片' })
        const video = addCanvasVideoNode({ x: 600, y: 700 }, { focus: false })
        renderCanvasMediaNode(video, 'video', { src: '/output/minimax_h3_1791456128166_2ef47959.mp4', name: '已有视频' })
        const h3 = addCanvasMinimaxH3Node({ x: 1100, y: 100 }, { focus: false })
        window.qaNodes = [generator, text, image, video, h3]; qaNodes.forEach(n => pinCanvasNode(n.dataset.id))
        connectCanvasNodes(text.dataset.id, generator.dataset.id)
        FloraGenerationHistory.hydrate(generator, [{ id: 'qa-history', kind: 'image', src: qaImage }], 'qa-history')
        window.qaFrame = () => new Promise(r => requestAnimationFrame(r))
        window.qaSnapshot = () => {
          const properties = ['width', 'height', 'minWidth', 'minHeight', 'transform', 'bottom', 'fontSize', 'lineHeight', 'borderWidth', 'borderRadius', 'borderColor', 'backgroundColor', 'color', 'boxShadow', 'strokeWidth', 'strokeDasharray']
          const take = (el, pseudo) => { if (!el) return null; const s = getComputedStyle(el, pseudo); return Object.fromEntries(properties.map(p => [p, s[p]])) }
          return qaNodes.map(node => ({
            kind: node.dataset.floraKind,
            title: take(node.querySelector('.flora-node-label-title')),
            toolbar: take(node.querySelector('.flora-node-toolbar')),
            port: take(node.querySelector('.canvas-port')),
            badge: take(node.querySelector('.flora-generation-history-badge')),
            dimensions: take(node.querySelector('.flora-node-image-dimensions')),
            outline: take(node.querySelector('.flora-node-shell'), '::after'),
          })).concat([{ edge: take(document.querySelector('#canvasConnections .canvas-connection-path')), hit: take(document.querySelector('#canvasConnections .canvas-connection-hit')), cursor: take(document.querySelector('.canvas-collab-cursor')) }])
        }
      })
      await page.waitForTimeout(400)
      const samples = []
      for (const scale of [0.25, 0.65, 1, 2]) {
        await page.evaluate(async scale => {
          Object.assign(canvasState, { x: 80, y: 70, scale }); applyCanvasTransformNow(); renderCanvasConnections()
          renderCanvasCollabCursor({ clientId: 'qa-cursor', userId: 'qa', username: '协作测试', x: 30, y: 40, seenAt: Date.now() })
          await qaFrame(); await qaFrame()
          clearInterval(canvasCollabState.cursorPruneTimer); canvasCollabState.cursorPruneTimer = 0
        }, scale)
        for (let index = 0; index < 5; index++) {
          await page.evaluate(async index => { selectCanvasNode(qaNodes[index]); await qaFrame(); await qaFrame() }, index)
          await page.waitForTimeout(250)
          samples.push({ scale, index, styles: await page.evaluate(() => qaSnapshot()) })
        }
      }
      // New nodes, a newly created result/dimensions row and SVG paths must
      // receive the current scale even if the viewport is no longer moving.
      await page.evaluate(async () => {
        canvasState.scale = 0.65; applyCanvasTransformNow(); await qaFrame()
        const node = addCanvasUploadPlaceholder({ x: 1200, y: 700 }); renderCanvasUploadNode(node, { src: qaImage, name: '缩放后新增素材' }); pinCanvasNode(node.dataset.id)
        qaNodes.push(node); selectCanvasNode(node); connectCanvasNodes(node.dataset.id, qaNodes[0].dataset.id)
        await qaFrame(); await qaFrame()
      })
      await page.waitForTimeout(150)
      samples.push({ lifecycle: true, styles: await page.evaluate(() => qaSnapshot()) })
      if (optimized) {
        const values = await page.evaluate(() => {
          const node = qaNodes.at(-1), shell = node.querySelector('.flora-node-shell')
          return { inverse: Number(getComputedStyle(shell, '::after').getPropertyValue('--collab-inverse-scale')), nodeInverse: Number(getComputedStyle(node).getPropertyValue('--collab-inverse-scale')) }
        })
        assert.ok(Math.abs(values.inverse - 1 / 0.65) < 0.0001, '素材选中伪元素直接获得缩放补偿')
        assert.equal(values.nodeInverse, 1, '缩放变量不再向节点所有后代继承')
      }
      results.push(samples); await page.close()
    }
    function equal(actual, expected, key = 'styles') {
      if (typeof actual === 'string' && typeof expected === 'string') {
        const pattern = /-?\d*\.?\d+(?:e[+-]?\d+)?/gi
        assert.equal(actual.replace(pattern, '#'), expected.replace(pattern, '#'), key)
        const a = actual.match(pattern) || [], b = expected.match(pattern) || []
        a.forEach((number, i) => assert.ok(Math.abs(Number(number) - Number(b[i])) < 0.01, `${key}: ${actual} / ${expected}`))
      } else if (actual && expected && typeof actual === 'object') {
        assert.deepEqual(Object.keys(actual), Object.keys(expected), key)
        for (const field of Object.keys(actual)) equal(actual[field], expected[field], `${key}.${field}`)
      } else assert.equal(actual, expected, key)
    }
    equal(results[1], results[0])
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, comparisons: results[0].length, types: ['图片生成', '文字', '素材图片', '素材视频', 'H3视频生成'], scales: [0.25, 0.65, 1, 2], dynamicNodesAndResults: true, errors }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
