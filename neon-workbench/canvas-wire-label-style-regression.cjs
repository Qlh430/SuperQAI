const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SOURCE = path.join(__dirname, 'design-sources')
const css = [
  'neon-canvas-surface.css',
  'flora-node-shell.css',
  'flora-node-tags.css',
].map(file => fs.readFileSync(path.join(SOURCE, file), 'utf8')).join('\n')

;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.QA_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.setContent(`<style>
      body { margin: 0; background: #080a0e; }
      #canvasPlane { position: absolute; left: 200px; top: 200px; transform-origin: 0 0; }
      #canvasPlane :is(.canvas-node, .canvas-light-node) { position: absolute; left: 0; top: 0; width: 400px; height: 448px; }
      #canvasPlane .flora-node-label { width: 100%; }
      #canvasPlane .flora-node-tag { width: 120px; }
      #wirePlane { position: absolute; left: 0; top: 0; width: 1px; height: 1px; transform-origin: 0 0; }
    </style><style>${css}</style>
    <div id="neonEngineSurface"><div id="canvasEditorScreen"><div id="canvasPlane">
      <article class="canvas-node" data-flora-node="true" data-has-node-tag="true">
        <div class="flora-node-label"><span class="flora-node-label-icon">T</span><button class="flora-node-label-title">jimeng-2026-02-06-1180-融合这4个人的五官和衣物</button></div>
        <div class="flora-node-tag"><button class="flora-tag-trigger is-tagged"><span>人物</span></button></div>
      </article>
      <article class="canvas-light-node" style="top:520px">
        <div class="flora-node-label"><span class="flora-node-label-icon">T</span><button class="flora-node-label-title">jimeng-2026-02-06-1180-融合这4个人的五官和衣物</button></div>
        <div class="flora-node-tag canvas-light-tag"><button class="flora-tag-trigger is-tagged"><span>人物</span></button></div>
      </article>
    </div><div id="wirePlane"><svg><path class="canvas-connection-path" d="M 0 0 C 100 0 100 100 200 100"/><path class="canvas-connection-path is-related" d="M 0 10 C 100 10 100 110 200 110"/></svg></div></div></div>`)

    const samples = await page.evaluate(() => {
      const plane = document.querySelector('#canvasPlane')
      const wirePlane = document.querySelector('#wirePlane')
      const nodes = [...document.querySelectorAll('.canvas-node, .canvas-light-node')]
      const result = []
      for (const zoom of [0.1, 0.14, 0.25, 0.5, 1]) {
        plane.style.transform = `scale(${zoom})`
        plane.style.setProperty('--collab-inverse-scale', String(1 / zoom))
        wirePlane.style.transform = `scale(${zoom})`
        wirePlane.style.setProperty('--collab-inverse-scale', String(1 / zoom))
        for (const node of nodes) {
          const title = node.querySelector('.flora-node-label-title')
          const label = node.querySelector('.flora-node-label')
          const tag = node.querySelector('.flora-node-tag')
          for (const state of ['normal', 'hover', 'selected']) {
            node.classList.toggle('is-selected', state === 'selected')
            node.classList.toggle('is-hovered', state === 'hover')
            const paths = [...document.querySelectorAll('.canvas-connection-path')]
            const styles = paths.map(path => {
              const style = getComputedStyle(path)
              return { width: style.strokeWidth, dash: style.strokeDasharray, opacity: style.opacity, vectorEffect: style.vectorEffect }
            })
            const labelRect = label.getBoundingClientRect()
            const tagRect = tag.getBoundingClientRect()
            const titleStyle = getComputedStyle(title)
            result.push({ zoom, kind: node.classList.contains('canvas-light-node') ? 'light' : 'full', state, styles, labelRight: labelRect.right, tagLeft: tagRect.left, fontSize: titleStyle.fontSize, fontWeight: titleStyle.fontWeight, titleTop: title.getBoundingClientRect().top })
          }
        }
      }
      return result
    })

    const expectedWire = samples[0].styles
    for (const sample of samples) {
      assert.deepEqual(sample.styles, expectedWire, `连线粗细、虚线和淡化程度应不受缩放或选择状态影响: ${JSON.stringify(sample)}`)
      const [dashOn, dashOff] = sample.styles[0].dash.split(',').map(value => Number.parseFloat(value))
      assert.equal(sample.styles[0].vectorEffect, 'none', `连线应跟随画布缩放: ${JSON.stringify(sample)}`)
      assert.equal(Number.parseFloat(sample.styles[0].width), 3, `连线宽度应使用统一画布坐标值: ${JSON.stringify(sample)}`)
      assert.ok(Math.abs(dashOn - 6) < 0.01 && Math.abs(dashOff - 6) < 0.01, `虚线间隔应使用统一画布坐标值: ${JSON.stringify(sample)}`)
      assert.ok(Math.abs(Number.parseFloat(sample.styles[0].width) * sample.zoom - 3 * sample.zoom) < 0.01, `连线应随画布缩放: ${JSON.stringify(sample)}`)
      assert.ok(Math.abs(dashOn * sample.zoom - 6 * sample.zoom) < 0.01 && Math.abs(dashOff * sample.zoom - 6 * sample.zoom) < 0.01, `虚线应随画布缩放: ${JSON.stringify(sample)}`)
      if (sample.state === 'normal') assert.ok(sample.labelRight < sample.tagLeft, `节点标题应与右侧标签分开: ${JSON.stringify(sample)}`)
      const stateBase = samples.find(item => item.zoom === sample.zoom && item.kind === sample.kind && item.state === 'normal')
      assert.equal(sample.fontSize, stateBase.fontSize, '节点标题字号应在选择状态间保持一致')
      assert.equal(sample.fontWeight, stateBase.fontWeight, '节点标题字重应在选择状态间保持一致')
      assert.ok(Math.abs(sample.titleTop - stateBase.titleTop) < 0.1, '节点标题屏幕位置应在选择状态间保持一致')
    }
    assert.equal(samples.find(sample => sample.zoom === 0.5).styles[0].width, '3px', '50% 缩放时线宽应为 1.5px')
    assert.equal(samples.find(sample => sample.zoom === 0.5).styles[0].dash, '6px, 6px', '50% 缩放时虚线应显示为 3px / 3px')
    assert.equal(samples[0].styles[0].opacity, '0.4', '普通连线应使用更淡的显示强度')
    console.log(JSON.stringify({ ok: true, samples: samples.length, zooms: [0.1, 0.14, 0.25, 0.5, 1], states: ['normal', 'hover', 'selected'], kinds: ['full', 'light'] }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
