// 回归：H3 操作区参考素材不能因为源节点被画布分页（虚拟化）卸载而丢失。
// 失败场景：连接 2 个图片节点 + 1 个素材合集（音频）后，源节点离开视口，
// 参考带只剩 1 张卡片、生成请求也拿不到离屏素材。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['flora-generator-composer.js', 'flora-generator-composer.js'],
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
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-minimax-h3', 'canvas-node-asset-collection'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-h3-refs-virtualization'
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
      const h3 = addCanvasMinimaxH3Node({ x: 400, y: 100 })
      const img1 = addCanvasImage('/output/probe-ref-a.png', '参考图A', { x: -900, y: -600 })
      const img2 = addCanvasImage('/output/probe-ref-b.png', '参考图B', { x: -900, y: 400 })
      const coll = addCanvasAssetCollection({ x: -1700, y: 0 }, {
        title: '素材',
        mode: 'single',
        members: [{
          id: 'qa-audio-1', kind: 'audio', name: '参考音频.wav',
          src: '/output/probe-ref-audio.wav', savedUrl: '/output/probe-ref-audio.wav',
          mimeType: 'audio/wav', createdAt: new Date().toISOString(), source: 'upload',
        }],
      })
      connectCanvasNodes(img1.dataset.id, h3.dataset.id)
      connectCanvasNodes(img2.dataset.id, h3.dataset.id)
      connectCanvasNodes(coll.dataset.id, h3.dataset.id)
      updateCanvasNodeRefs(h3)
      selectCanvasNode(h3)
      window.qa = { h3, img1, img2, coll }
    })
    await page.waitForTimeout(500)

    const snapshot = () => page.evaluate(() => {
      const { h3 } = window.qa
      const panel = h3.querySelector('.flora-generator-composer')
      const band = panel?.querySelector('.flora-reference-materials')
      const cards = [...(band?.querySelectorAll('.flora-reference-card') || [])].map(card => ({
        type: card.dataset.referenceType,
        label: card.querySelector('.flora-reference-index')?.textContent?.trim() || '',
        title: card.querySelector('.flora-reference-thumb')?.getAttribute('title') || '',
      }))
      const incoming = getCanvasIncomingReferenceMaterials(h3.dataset.id).map(item => ({
        type: item.type, name: item.name, url: item.url, key: item.key,
      }))
      const h3Refs = getCanvasIncomingMinimaxH3Refs(h3)
      const h3Counts = { images: h3Refs.images.length, videos: h3Refs.videos.length, audios: h3Refs.audios.length }
      return { cards, cardCount: cards.length, incoming, incomingCount: incoming.length, h3Counts }
    })

    const afterConnect = await snapshot()
    assert.equal(afterConnect.cardCount, 3, `连接三个素材后参考带应显示三张卡片：${JSON.stringify(afterConnect)}`)
    assert.deepEqual(afterConnect.cards.map(card => card.label), ['图片1', '图片2', '音频1'], '参考卡片按图片、图片、音频编号')
    assert.equal(afterConnect.incomingCount, 3, '取值链路应包含离屏的素材合集')

    // 模拟画布分页把三个素材源全部卸载，只留目标节点在视口内。
    await page.evaluate(() => {
      const { h3, img1, img2, coll } = window.qa
      for (const node of [img1, img2, coll]) unmountCanvasVirtualNode(node.dataset.id, node)
      updateCanvasNodeRefs(h3)
    })
    await page.waitForTimeout(400)
    const afterUnmount = await snapshot()
    assert.equal(afterUnmount.incomingCount, 3, `源节点被分页卸载后素材不能丢：${JSON.stringify(afterUnmount)}`)
    assert.equal(afterUnmount.cardCount, 3, '源节点被分页卸载后参考带仍显示三张卡片')
    assert.deepEqual(afterUnmount.cards.map(card => card.title), ['参考图A', '参考图B', '参考音频.wav'], '离屏素材的名称与类型保持可读')
    assert.deepEqual(afterUnmount.h3Counts, { images: 2, videos: 0, audios: 1 }, '离屏后 H3 生成请求仍拿到 2 图 1 音频')

    // 模拟应用重开：目标节点重新挂载，源节点仍全部在离屏。
    await page.evaluate(() => {
      const { h3 } = window.qa
      unmountCanvasVirtualNode(h3.dataset.id, h3)
      const remounted = mountCanvasVirtualNode(h3.dataset.id)
      if (!remounted) throw new Error('H3 节点重新挂载失败')
      window.qa.h3 = remounted
      selectCanvasNode(remounted)
    })
    await page.waitForTimeout(500)
    const afterRemount = await snapshot()
    assert.equal(afterRemount.incomingCount, 3, '重挂目标节点后素材仍应完整')
    assert.equal(afterRemount.cardCount, 3, '重挂目标节点后参考带仍显示三张卡片')

    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, afterConnect, afterUnmount, afterRemount, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
