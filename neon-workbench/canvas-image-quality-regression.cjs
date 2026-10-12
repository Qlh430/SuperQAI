const { chromium } = require("playwright")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

// Canvas images must load a server thumbnail first and only pull the original on
// demand (detail view / download / idle quality pass). Local "/output/" results
// used to bypass that and set the full-size file as src immediately, which put
// big bitmaps in the canvas and made panning paint far more than it needed.
;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.QA_BROWSER || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.route("**/api/**", r => r.fulfill({
      json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {}, operations: [], success: true },
    }))
    if (process.env.PERF_SOURCE) {
      for (const file of ["flora-generator-composer.js", "flora-node-shell.js", "flora-node-tags.js"]) {
        await page.route(`**/${file}*`, r => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(process.env.PERF_SOURCE, file), "utf8") }))
      }
      await page.route("**/script.js*", r => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(process.env.PERF_SOURCE, "script-before-save-bridge.js"), "utf8") }))
    }
    await page.goto("http://127.0.0.1:3199", { waitUntil: "domcontentloaded" })
    const result = await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator"])
      await loadCanvasBoards()
      canvasState.activeBoardId = "qa-image-quality"
      const probe = (source) => {
        const img = document.createElement("img")
        registerCanvasDetailImage(img, source)
        return {
          source,
          directOriginal: img.dataset.canvasDirectOriginal || "",
          quality: img.dataset.imageQuality || "",
          requested: img.dataset.requestedQuality || "",
          hasSrc: img.hasAttribute("src"),
          originalSrc: img.getAttribute("data-original-src") || "",
          managed: img.classList.contains("deferred-image"),
        }
      }
      return { local: probe("/output/qa-image.png"), remote: probe("https://example.invalid/qa.png") }
    })
    // A freshly opened board (or one being panned) must still start the
    // thumbnail for an image that has no source yet; otherwise the node sits
    // empty until the user stops moving.
    const pending = await page.evaluate(async () => {
      const node = addCanvasImageGeneratorNode({ x: 40, y: 40 }, { focus: false })
      pinCanvasNode(node.dataset.id)
      const img = document.createElement("img")
      node.append(img)
      registerCanvasDetailImage(img, "/output/qa-pending.png")
      const before = { quality: img.dataset.imageQuality || "", scheduled: img.dataset.canvasScheduledQuality || "" }
      startPendingCanvasImageThumbnails()
      return { before, after: { quality: img.dataset.imageQuality || "", scheduled: img.dataset.canvasScheduledQuality || "" } }
    })
    assert.equal(pending.before.quality, "unloaded", `待加载图片初始应为未加载: ${JSON.stringify(pending)}`)
    assert.equal(pending.after.scheduled, "thumbnail", `空闲/手势分支必须为未加载图片发起缩略图: ${JSON.stringify(pending)}`)
    // A thumbnail lookup that rejects leaves the element with no src AND no
    // error event, which used to mean a permanently blank node. The watchdog
    // must fall back to the original once.
    const watchdog = await page.evaluate(async () => {
      const node = addCanvasImageGeneratorNode({ x: 80, y: 80 }, { focus: false })
      pinCanvasNode(node.dataset.id)
      const img = document.createElement("img")
      node.append(img)
      const resources = window.imageResources
      const originalThumb = resources.requestThumbnail.bind(resources)
      const originalShow = resources.showOriginal.bind(resources)
      const calls = { showOriginal: [] }
      resources.requestThumbnail = () => new Promise(() => {})   // never resolves
      resources.showOriginal = (target) => { calls.showOriginal.push(target?.getAttribute?.("data-original-src") || ""); return Promise.resolve(true) }
      const previousWatchdog = canvasThumbnailWatchdogMs
      canvasThumbnailWatchdogMs = 60
      try {
        registerCanvasDetailImage(img, "/output/qa-blank.png")
        await new Promise(resolve => setTimeout(resolve, 250))
        return { calls, fallbackFlag: img.dataset.canvasDirectFallback || "", hasSrc: img.hasAttribute("src") }
      } finally {
        canvasThumbnailWatchdogMs = previousWatchdog
        resources.requestThumbnail = originalThumb
        resources.showOriginal = originalShow
      }
    })
    assert.equal(watchdog.fallbackFlag, "true", `空白图片必须被看门狗兜底: ${JSON.stringify(watchdog)}`)
    assert.ok(watchdog.calls.showOriginal.includes("/output/qa-blank.png"),
      `兜底必须加载该图原图: ${JSON.stringify(watchdog)}`)
    // Idle warming must ask for the thumbnails of images near the viewport, so a
    // later pan reveals an already-generated one, and must not repeat itself.
    const warming = await page.evaluate(async () => {
      const node = addCanvasImageGeneratorNode({ x: 60, y: 60 }, { focus: false })
      pinCanvasNode(node.dataset.id)
      node.dataset.resultSrc = "/output/qa-warm.png"
      syncCanvasNodeModel(node)
      const resources = window.imageResources
      const original = resources.requestThumbnail.bind(resources)
      const asked = []
      resources.requestThumbnail = (source) => { asked.push(source); return original(source) }
      try {
        const first = warmCanvasViewportThumbnails()
        const afterFirst = asked.filter(source => source === "/output/qa-warm.png").length
        const second = warmCanvasViewportThumbnails()
        const afterSecond = asked.filter(source => source === "/output/qa-warm.png").length
        return { first, second, afterFirst, afterSecond }
      } finally {
        resources.requestThumbnail = original
      }
    })
    assert.ok(warming.afterFirst >= 1, `空闲预热必须请求视口附近图片的缩略图: ${JSON.stringify(warming)}`)
    assert.equal(warming.afterSecond, warming.afterFirst, `同一来源不应被重复预热: ${JSON.stringify(warming)}`)
    // Both local and remote sources must be handed to the managed loader, which
    // starts from "unloaded" and defers any src assignment.
    for (const [kind, entry] of Object.entries(result)) {
      assert.equal(entry.directOriginal, "", `${kind}: 不应再走"直接原图"分支: ${JSON.stringify(entry)}`)
      assert.equal(entry.quality, "unloaded", `${kind}: 应交给托管加载器（初始未加载）: ${JSON.stringify(entry)}`)
      assert.equal(entry.hasSrc, false, `${kind}: 不应立刻把原图写入 src: ${JSON.stringify(entry)}`)
      assert.equal(entry.originalSrc, entry.source, `${kind}: 原图地址应留作按需升级: ${JSON.stringify(entry)}`)
      assert.equal(entry.managed, true, `${kind}: 应带上托管加载标记: ${JSON.stringify(entry)}`)
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, checked: "canvas-image-quality-pipeline", result, pending, watchdog, warming, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
