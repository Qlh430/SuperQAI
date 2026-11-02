const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {}, operations: [], success: true } }))
    if (process.env.PERF_SOURCE) {
      for (const file of ['flora-generator-composer.js', 'flora-node-shell.js', 'flora-node-tags.js']) await page.route(`**/${file}*`, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.PERF_SOURCE, file), 'utf8') }))
      await page.route('**/script.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.PERF_SOURCE, 'script-before-save-bridge.js'), 'utf8') }))
    }
    await page.addInitScript(() => {
      window.qaPerf = { observers: {}, calls: {}, longTasks: [] }
      const Original = window.MutationObserver
      window.MutationObserver = class extends Original {
        constructor(callback) {
          const origin = new Error().stack.split('\n')[2]?.trim() || 'unknown'
          super((records, observer) => {
            const start = performance.now()
            try { return callback(records, observer) } finally {
              const stat = qaPerf.observers[origin] ||= { count: 0, ms: 0, records: 0 }
              stat.count++; stat.ms += performance.now() - start; stat.records += records.length
            }
          })
        }
      }
      new PerformanceObserver(list => qaPerf.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration })))).observe({ type: 'longtask', buffered: true })
    })
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api', 'canvas-node-text', 'canvas-node-media'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-performance'; canvasState.isRestoring = true
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaNodes = []
      for (let i = 0; i < 36; i++) {
        const node = i % 6 === 5 ? addCanvasMinimaxH3Node({ x: (i % 6) * 440, y: Math.floor(i / 6) * 480 }, { focus: false })
          : addCanvasImageGeneratorNode({ x: (i % 6) * 440, y: Math.floor(i / 6) * 480 }, { focus: false })
        qaNodes.push(node); pinCanvasNode(node.dataset.id)
      }
      for (let i = 1; i < qaNodes.length; i++) connectCanvasNodes(qaNodes[i - 1].dataset.id, qaNodes[i].dataset.id)
      canvasState.isRestoring = false; canvasState.hasUnsavedChanges = false
      canvasState.scale = 0.3; canvasState.x = 80; canvasState.y = 70; applyCanvasTransformNow(); selectCanvasNode(qaNodes[0])
      for (const name of ['collectCanvasDirtyOperations', 'serializeCanvasNode', 'renderCanvasConnections', 'updateCanvasNodePosition', 'getCanvasIncomingReferenceMaterials', 'getCanvasPortPoint']) {
        const fn = window[name]
        if (typeof fn !== 'function') continue
        window[name] = function (...args) {
          const start = performance.now()
          try { return fn.apply(this, args) } finally { const stat = qaPerf.calls[name] ||= { count: 0, ms: 0 }; stat.count++; stat.ms += performance.now() - start }
        }
      }
      window.qaFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
    })
    await page.waitForTimeout(500)
    if (process.env.PERF_TYPED_COUNTER) await page.evaluate(() => {
      CSS.registerProperty({ name: '--collab-inverse-scale', syntax: '<number>', inherits: true, initialValue: '1' })
    })
    if (process.env.PERF_HOLD_COUNTER) await page.evaluate(() => {
      const style = document.getElementById('canvasPlane').style, set = style.setProperty.bind(style)
      style.setProperty = (name, value, priority) => { if (name !== '--collab-inverse-scale') return set(name, value, priority) }
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
    const report = { nodes: 36, viewport: [1440, 1050], stages: {}, errors }
    async function measure(name, action) {
      await page.evaluate(() => { qaPerf.observers = {}; qaPerf.calls = {}; qaPerf.longTasks = [] })
      await cdp.send('Profiler.start')
      if (name === 'panZoom' && process.env.PERF_TRACE) await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
      const frames = await page.evaluate(action)
      await page.waitForTimeout(120)
      let timeline
      if (name === 'panZoom' && process.env.PERF_TRACE) {
        const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
        await cdp.send('Tracing.end'); const { stream } = await finished
        let trace = ''
        for (;;) { const item = await cdp.send('IO.read', { handle: stream }); trace += item.data; if (item.eof) break }
        await cdp.send('IO.close', { handle: stream })
        const events = JSON.parse(trace).traceEvents, totals = new Map()
        for (const e of events) if (e.ph === 'X' && e.dur) totals.set(e.name, (totals.get(e.name) || 0) + e.dur / 1000)
        timeline = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20)
      }
      const { profile } = await cdp.send('Profiler.stop')
      const sampled = new Map(), callers = new Map(), nodes = new Map(profile.nodes.map(n => [n.id, n])), parents = new Map()
      for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id)
      for (let i = 0; i < (profile.samples || []).length; i++) {
        const node = nodes.get(profile.samples[i]); const fn = node?.callFrame.functionName || '(anonymous)'
        const key = `${fn} ${node?.callFrame.url.split('/').at(-1) || ''}:${(node?.callFrame.lineNumber || 0) + 1}`
        sampled.set(key, (sampled.get(key) || 0) + (profile.timeDeltas[i] || 0) / 1000)
        if (fn === 'getBoundingClientRect') {
          const parent = nodes.get(parents.get(node.id)), caller = parent?.callFrame
          const key = `${caller?.functionName || '(anonymous)'} ${caller?.url.split('/').at(-1) || ''}:${(caller?.lineNumber || 0) + 1}`
          callers.set(key, (callers.get(key) || 0) + (profile.timeDeltas[i] || 0) / 1000)
        }
      }
      const stats = await page.evaluate(() => qaPerf)
      const sorted = [...frames].sort((a, b) => a - b)
      report.stages[name] = { frames: frames.length, frameMedian: sorted[Math.floor(sorted.length / 2)] || 0, frameP95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        ...stats, timeline, cpuTop: [...sampled].sort((a, b) => b[1] - a[1]).slice(0, 14), layoutCallers: [...callers].sort((a, b) => b[1] - a[1]) }
    }
    await measure('idle', async () => { const frames = []; let last = performance.now(); for (let i = 0; i < 30; i++) { await qaFrame(); const now = performance.now(); frames.push(now - last); last = now } return frames })
    await measure('pan', async () => { const frames = []; let last = performance.now(); for (let i = 0; i < 45; i++) { canvasState.x = 80 + Math.sin(i / 8) * 60; applyCanvasTransformNow(); await qaFrame(); const now = performance.now(); frames.push(now - last); last = now } return frames })
    await measure('panZoom', async () => { const frames = []; let last = performance.now(); for (let i = 0; i < 45; i++) { canvasState.x = 80 + Math.sin(i / 8) * 60; canvasState.scale = 0.3 + Math.sin(i / 9) * 0.03; applyCanvasTransformNow(); await qaFrame(); const now = performance.now(); frames.push(now - last); last = now } return frames })
    await measure('drag', async () => { const frames = []; let last = performance.now(); for (let i = 0; i < 45; i++) { qaNodes[0].dataset.x = String(i * 3); updateCanvasNodePosition(qaNodes[0]); await qaFrame(); const now = performance.now(); frames.push(now - last); last = now } return frames })
    await measure('input', async () => { const prompt = qaNodes[0].querySelector('.canvas-node-prompt'); const frames = []; let last = performance.now(); for (let i = 0; i < 20; i++) { prompt.value = '香蕉被人拿起剥开'.repeat(i + 1); prompt.dispatchEvent(new Event('input', { bubbles: true })); await qaFrame(); const now = performance.now(); frames.push(now - last); last = now } return frames })
    assert.deepEqual(errors, [])
    const output = path.resolve(process.env.PERF_OUTPUT || '../.design/canvas-performance/before.json')
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ output, stages: Object.fromEntries(Object.entries(report.stages).map(([key, value]) => [key, { median: value.frameMedian, p95: value.frameP95, longTasks: value.longTasks.length, calls: value.calls, layoutCallers: value.layoutCallers, timeline: value.timeline }])), errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
