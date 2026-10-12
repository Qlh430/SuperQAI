const { chromium } = require("playwright")
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  const css = fs.readFileSync(path.join(__dirname, "design-sources/flora-node-shell.css"), "utf8")
  const cases = [
    { kind: "asset-collection", className: "canvas-node-asset-collection canvas-node-asset-single-image", width: 711, height: 400, content: '<div class="canvas-image-upload"><img data-canvas-original-src="test.png" alt="横版素材"></div>' },
    { kind: "asset-collection", className: "canvas-node-asset-collection canvas-node-asset-single-image", width: 400, height: 620, content: '<div class="canvas-image-upload"><img data-canvas-original-src="test.png" alt="竖版素材"></div>' },
    { kind: "asset-video", className: "canvas-node-asset-collection canvas-node-asset-single-video canvas-node-media canvas-node-media-video", width: 400, height: 711, content: '<div class="canvas-media-shell canvas-media-shell-video has-media"><span class="canvas-media-preview-label">视频预览</span><video class="canvas-video-preview" controls></video></div>' },
    { kind: "asset-audio", className: "canvas-node-asset-collection canvas-node-asset-single-audio canvas-node-media canvas-node-media-audio", width: 400, height: 128, content: '<div class="canvas-media-shell canvas-media-shell-audio has-media"><span class="canvas-media-preview-label">音频预览</span><audio class="canvas-audio-preview" controls></audio></div>' },
    { kind: "generator", className: "canvas-node-image canvas-node-generator", width: 400, height: 400, content: '<textarea class="canvas-node-prompt"></textarea>' },
    { kind: "text", className: "canvas-node-text", width: 400, height: 400, content: '<div class="canvas-text">文字</div>' },
    { kind: "note", className: "canvas-node-note", width: 400, height: 400, content: '<div class="canvas-note-palette"></div><div class="canvas-note-body">便签</div>' },
  ]
  let checked = 0
  try {
    for (const viewportWidth of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width: viewportWidth, height: 960 })
      for (const sample of cases) {
        await page.setContent(`<style>body{margin:0}#canvasPlane{position:relative;transform-origin:0 0}${css}</style><div id="neonEngineSurface"><div id="canvasEditorScreen"><div id="canvasPlane"><article class="canvas-node ${sample.className}"><div class="canvas-node-bar"><span class="canvas-node-title">${sample.kind}</span></div>${sample.content}</article></div></div></div>`)
        await page.addScriptTag({ path: path.join(__dirname, "design-sources/node-action-bar.js") })
        await page.addScriptTag({ path: path.join(__dirname, "design-sources/flora-generator-composer.js") })
        await page.addScriptTag({ path: path.join(__dirname, "design-sources/flora-node-shell.js") })
        await page.evaluate(sample => {
          const node = document.querySelector("article")
          window.CanvasFloraNodeShell.mount(node)
          node.style.setProperty("--flora-node-width", `${sample.width}px`)
          node.style.setProperty("--flora-node-height", `${sample.height}px`)
          node.querySelector(".flora-node-toolbar").style.transition = "none"
        }, sample)
        if (sample.kind === "asset-video") {
          await page.mouse.move(1439, 959)
          const state = await page.evaluate(() => {
            const media = document.querySelector(".canvas-video-preview")
            const center = document.querySelector(".flora-video-center")
            const controls = document.querySelector(".flora-video-controls")
            const play = document.querySelector(".flora-video-play")
            const progress = document.querySelector(".flora-video-progress")
            const expand = document.querySelector(".flora-video-expand")
            const label = document.querySelector(".canvas-media-preview-label")
            return {
              controls: media.controls,
              center: Boolean(center),
              centerLabel: center?.getAttribute("aria-label"),
              centerIcon: center?.querySelector("[data-lucide]")?.getAttribute("data-lucide"),
              player: Boolean(controls),
              playLabel: play?.getAttribute("aria-label"),
              playIcon: play?.querySelector("[data-lucide]")?.getAttribute("data-lucide"),
              progressType: progress?.type,
              progressLabel: progress?.getAttribute("aria-label"),
              expandLabel: expand?.getAttribute("aria-label"),
              expandIcon: expand?.querySelector("[data-lucide]")?.getAttribute("data-lucide"),
              mediaPointerEvents: getComputedStyle(media).pointerEvents,
              controlsPointerEvents: getComputedStyle(controls).pointerEvents,
              labelDisplay: getComputedStyle(label).display,
            }
          })
          assert.equal(state.controls, false)
          assert.equal(state.center, true)
          assert.equal(state.centerLabel, "播放视频")
          assert.equal(state.centerIcon, "play")
          assert.equal(state.player, true)
          assert.equal(state.playLabel, "播放视频")
          assert.equal(state.playIcon, "play")
          assert.equal(state.progressType, "range")
          assert.equal(state.progressLabel, "视频进度")
          assert.equal(state.expandLabel, "放大视频")
          assert.equal(state.expandIcon, "maximize-2")
          assert.equal(state.mediaPointerEvents, "none")
          assert.equal(state.controlsPointerEvents, "none")
          assert.equal(state.labelDisplay, "none")
          await page.locator("article").hover({ position: { x: 12, y: 12 }, force: true })
          assert.equal(await page.locator(".flora-video-controls").evaluate(element => getComputedStyle(element).pointerEvents), "auto")
        }
        if (sample.kind === "asset-audio") {
          const state = await page.evaluate(() => {
            const media = document.querySelector(".canvas-audio-preview")
            const player = document.querySelector(".flora-audio-player")
            const timeline = document.querySelector(".flora-audio-timeline")
            const label = document.querySelector(".canvas-media-preview-label")
            return {
              controls: media.controls,
              mediaHidden: media.getAttribute("aria-hidden"),
              player: Boolean(player),
              bars: document.querySelectorAll(".flora-audio-waveform span").length,
              timelineRole: timeline?.getAttribute("role"),
              timelineLabel: timeline?.getAttribute("aria-label"),
              labelDisplay: getComputedStyle(label).display,
            }
          })
          assert.equal(state.controls, false)
          assert.equal(state.mediaHidden, "true")
          assert.equal(state.player, true)
          assert.equal(state.bars, 48)
          assert.equal(state.timelineRole, "slider")
          assert.equal(state.timelineLabel, "音频进度")
          assert.equal(state.labelDisplay, "none")
        }
        for (const zoom of [0.17, 0.44, 0.49, 1, 1.75]) {
          await page.evaluate(zoom => {
            const plane = document.querySelector("#canvasPlane")
            plane.style.transform = `translate(100px, 200px) scale(${zoom})`
            plane.style.setProperty("--collab-inverse-scale", String(1 / zoom))
          }, zoom)
          for (const selected of [false, true]) {
            await page.evaluate(selected => {
              document.querySelector("article").classList.toggle("is-selected", selected)
            }, selected)
            if (!selected) await page.locator("article").hover({ position: { x: 8, y: 8 }, force: true })
            const geometry = await page.evaluate(() => {
              const node = document.querySelector("article")
              const bar = node.querySelector(".flora-node-toolbar")
              const title = node.querySelector(".flora-node-label").getBoundingClientRect()
              const body = node.querySelector(".flora-node-shell").getBoundingClientRect()
              const rect = bar.getBoundingClientRect()
              return { gap: title.top - rect.bottom, centerDelta: (rect.left + rect.right - body.left - body.right) / 2, barHeight: rect.height, visible: getComputedStyle(bar).visibility }
            })
            const label = JSON.stringify({ viewportWidth, kind: sample.kind, ratio: `${sample.width}x${sample.height}`, zoom, selected, geometry })
            assert.equal(geometry.visible, selected ? "visible" : "hidden", label)
            if (selected) {
              assert.ok(Math.abs(geometry.gap - 12) < 0.1, `标题间距错误：${label}`)
              assert.ok(Math.abs(geometry.centerDelta) < 0.1, `横向中心错误：${label}`)
              assert.ok(Math.abs(geometry.barHeight - 44) < 0.1, `工具栏屏幕尺寸错误：${label}`)
            }
            checked++
          }
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.setContent(`<style>body{margin:0}#canvasPlane{position:relative}${css}</style><div id="neonEngineSurface"><div id="canvasEditorScreen"><div id="canvasPlane"><article class="canvas-node canvas-node-asset-collection" data-id="media-reflow"><div class="canvas-node-bar"><span class="canvas-node-title">素材</span></div><div class="canvas-assets-body"><button class="canvas-assets-empty">添加素材</button></div></article></div></div></div>`)
    await page.addScriptTag({ path: path.join(__dirname, "design-sources/node-action-bar.js") })
    await page.addScriptTag({ path: path.join(__dirname, "design-sources/flora-node-shell.js") })
    await page.evaluate(() => window.CanvasFloraNodeShell.mount(document.querySelector("article")))
    await page.evaluate(() => {
      document.querySelector("article").innerHTML = '<div class="canvas-node-bar"><span class="canvas-node-title">视频素材</span></div><div class="canvas-media-shell canvas-media-shell-video has-media"><video class="canvas-video-preview"></video></div><span class="canvas-node-status">已就绪 · 可预览和输出</span>'
    })
    await page.waitForTimeout(0)
    assert.equal(await page.locator('article[data-id="media-reflow"] > .flora-node-shell').count(), 1, "媒体重渲染后没有恢复 Flora 节点壳体")
    checked += 1
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ checked, errors, result: "四种视口、七种节点与五个缩放比例下，悬停不显示工具栏，选中后工具栏居中并距标题上沿12px；视频和音频使用自定义播放呈现。测试使用真实壳体脚本/CSS的隔离DOM，不调用生产API。" }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
