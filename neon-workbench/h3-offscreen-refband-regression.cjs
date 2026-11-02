const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })

// 画布分页会把离屏节点从 DOM 卸载；参考带、H3 素材列表与生成请求都必须仍然
// 认得出这些连接上的图片/视频/音频，否则用户「连了三个只显示一个」。
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    const submissions = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/minimax-h3-video', route => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'H3测试接口暂不可用' }) })
    })
    await page.route('**/output/**', route => {
      const url = decodeURIComponent(route.request().url())
      if (/\.(mp4|webm|mov|mkv)$/i.test(url)) return route.fulfill({ status: 404, body: '' })
      if (/\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i.test(url)) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') })
    })
    if (process.env.GENERATOR_SOURCE) {
      await page.route('**/script.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, 'script-before-save-bridge.js'), 'utf8'),
      }))
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-asset-collection'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-offscreen-refband-board'
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

      const h3 = addCanvasVideoGeneratorNode({ x: 0, y: 0 }, { engine: 'comfyui' })
      const steps = []
      const mark = (label) => steps.push(`${label}:${document.querySelector('#canvasEditorScreen').hidden ? 'hidden' : 'shown'}`)
      mark('after-h3')
      canvasState.scale = 1
      canvasState.x = 80
      canvasState.y = 120
      applyCanvasTransformNow()
      selectCanvasNode(h3)
      mark('after-select')
      const image1 = addCanvasImage('/output/qa-offscreen-1.png', '图片1', { x: 40, y: 80 })
      mark('after-image1')
      const image2 = addCanvasImage('/output/qa-offscreen-2.png', '图片2', { x: 40, y: 500 })
      mark('after-image2')
      const collection = addCanvasAssetCollection({ x: 40, y: 900 }, {
        title: '素材', mode: 'single',
        members: [{ id: 'qa-offscreen-audio', kind: 'audio', src: '/output/qa-offscreen.wav', name: '参考音频.wav', mimeType: 'audio/wav', source: 'upload' }],
      })
      mark('after-collection')
      const sources = [image1, image2, collection]
      for (const source of sources) connectCanvasNodes(source.dataset.id, h3.dataset.id)
      // 保存后把素材节点挪到离屏位置：恢复时它们不会挂载，复现真实画布的
      // 「连接还在、DOM 已卸载」状态。
      const saved = [h3, ...sources].map(node => serializeCanvasNode(node))
      const nodes = saved.map((node, index) => (index === 0 ? { ...node, x: 0, y: 0 } : { ...node, x: -8000, y: index * 600 }))
      const connections = canvasState.connections
        .filter(item => item.to === h3.dataset.id)
        .map(item => ({ ...item }))
      if (connections.length !== 3) throw new Error(`连接未建立：${connections.length}（${steps.join(' ')}）`)

      // 用保存数据恢复画布：视口只覆盖视频节点，远处素材节点不会被挂载成 DOM。
      clearCanvasSelection()
      canvasState.connections = []
      document.querySelectorAll('#canvasPlane .canvas-node').forEach(node => node.remove())
      canvasVirtualStore.clear?.()
      canvasState.scale = 1
      canvasState.x = Math.round(innerWidth / 2) - 320
      canvasState.y = 160
      restoreCanvasBoard({
        id: 'qa-offscreen-refband-board',
        title: 'qa 离屏素材',
        viewport: { scale: 1, x: canvasState.x, y: canvasState.y },
        nodes,
        connections,
      })
      applyCanvasTransformNow()
      window.qaOffscreen = {
        h3Id: h3.dataset.id,
        sourceIds: sources.map(source => source.dataset.id),
      }
      const restored = getCanvasNode(h3.dataset.id)
      if (restored) selectCanvasNode(restored)
    })
    await page.waitForTimeout(800)

    const state = await page.evaluate(() => {
      const node = getCanvasNode(window.qaOffscreen.h3Id)
      const band = node?.querySelector('.flora-reference-materials')
      return {
        mountedNodes: window.qaOffscreen.sourceIds.map(id => Boolean(getCanvasNode(id))),
        mountedH3: Boolean(node),
        incoming: node ? canvasState.connections.filter(item => item.to === node.dataset.id).length : -1,
        items: node ? getCanvasIncomingItems(node.dataset.id).map(item => ({ type: item.type, url: Boolean(item.url) })) : [],
        materials: node ? getCanvasIncomingReferenceMaterials(node.dataset.id).map(item => item.type) : [],
        cards: band ? Array.from(band.querySelectorAll('.flora-reference-card')).map(card => card.textContent.trim()) : [],
      }
    })
    assert.equal(state.mountedH3, true, '视频节点应挂载在当前视口')
    // 素材合集会挂在场景层，图片素材离开视口则会被分页卸载；旧实现正是在
    // 这里把图片素材丢掉的。
    assert.deepEqual(state.mountedNodes.slice(0, 2), [false, false], `远处图片素材应被分页卸载：${JSON.stringify(state.mountedNodes)}`)
    assert.equal(state.incoming, 3, '连接关系保留三条')
    assert.deepEqual(state.materials, ['image', 'image', 'audio'], `离屏素材仍要解析出全部参考：${JSON.stringify(state.items)}`)
    assert.deepEqual(state.cards, ['图片1', '图片2', '音频1'], `参考带显示三张卡片：${JSON.stringify(state.cards)}`)

    // 提交请求也必须带上离屏素材，否则生成会静默丢参考。
    await page.evaluate(() => {
      const node = getCanvasNode(window.qaOffscreen.h3Id)
      const prompt = node.querySelector('.flora-generator-prompt-area .canvas-h3-prompt')
      prompt.value = '离屏素材参考测试'
      prompt.dispatchEvent(new Event('input', { bubbles: true }))
      node.querySelector('.canvas-node-run').click()
    })
    await page.waitForFunction(() => document.querySelector('.flora-generator-status')?.textContent?.includes('H3测试接口暂不可用'), null, { timeout: 15000 })
    assert.equal(submissions.length, 1, '应提交一次生成请求')
    assert.deepEqual([submissions[0].images.length, submissions[0].videos.length, submissions[0].audios.length], [2, 0, 1],
      `请求带齐离屏素材：${JSON.stringify(submissions[0])}`)
    assert.equal(submissions[0].mode, 'reference')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    console.log(JSON.stringify({
      ok: true,
      mountedNodes: state.mountedNodes,
      materials: state.materials,
      cards: state.cards,
      submission: { mode: submissions[0].mode, images: submissions[0].images.length, videos: submissions[0].videos.length, audios: submissions[0].audios.length },
    }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
