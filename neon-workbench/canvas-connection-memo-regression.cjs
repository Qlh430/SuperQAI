const { chromium } = require("playwright")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

// Wire rendering must not repeat work it already did, and panning/zooming must
// not force a fresh DOM measurement of every port: port points are world-space
// and are converted with the applied viewport, so a pan leaves them valid.
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
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator"])
      await loadCanvasBoards()
      canvasState.activeBoardId = "qa-connection-memo"
      canvasState.isRestoring = true
      const surface = document.createElement("div")
      surface.id = "neonEngineSurface"
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e"
      const view = document.querySelector("#canvasView")
      surface.append(view)
      document.body.append(surface)
      view.hidden = false
      view.classList.add("active")
      view.style.cssText = "flex:1;min-height:0;width:100%"
      document.querySelector("#canvasEditorScreen").hidden = false
      document.body.classList.add("canvas-surface-open")
      showCanvasEditor()
      window.qaNodes = Array.from({ length: 3 }, (_, i) => addCanvasImageGeneratorNode({ x: i * 460, y: 90 }, { focus: false }))
      qaNodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.isRestoring = false
      canvasState.x = 60
      canvasState.y = 40
      canvasState.scale = 0.8
      applyCanvasTransformNow()
      canvasState.connections = [
        normalizeVisibleCanvasConnection({ id: "qa-memo-1", from: qaNodes[0].dataset.id, to: qaNodes[1].dataset.id, fromPort: "output", toPort: "input" }),
        normalizeVisibleCanvasConnection({ id: "qa-memo-2", from: qaNodes[1].dataset.id, to: qaNodes[2].dataset.id, fromPort: "output", toPort: "input" }),
      ]
      canvasVisibleConnectionBaselineIds.add("qa-memo-1")
      canvasVisibleConnectionBaselineIds.add("qa-memo-2")
      selectCanvasNode(qaNodes[0])
    })
    await page.waitForTimeout(400)
    const result = await page.evaluate(() => {
      const originalSetAttribute = Element.prototype.setAttribute
      const originalRect = Element.prototype.getBoundingClientRect
      let pathWrites = 0
      let portRects = 0
      Element.prototype.setAttribute = function (name, value) {
        if (name === "d" && this.ownerSVGElement?.id === "canvasConnections") pathWrites += 1
        return originalSetAttribute.call(this, name, value)
      }
      Element.prototype.getBoundingClientRect = function () {
        if (this.classList?.contains?.("canvas-port")) portRects += 1
        return originalRect.call(this)
      }
      try {
        // Force a real geometry change so the baseline pass certainly paints.
        const seed = qaNodes[2]
        seed.dataset.y = String(Number(seed.dataset.y) + 30)
        updateCanvasNodePosition(seed)
        renderCanvasConnections()
        const baselineWrites = pathWrites

        pathWrites = 0
        renderCanvasConnections()
        const noopWrites = pathWrites

        // Pan without moving any node: world geometry is unchanged.
        canvasState.x += 140
        canvasState.y += 60
        applyCanvasTransformNow()
        pathWrites = 0
        portRects = 0
        renderCanvasConnections()
        const panWrites = pathWrites
        const panPortMeasures = portRects

        // A real geometry change must still repaint.
        const moved = qaNodes[0]
        moved.dataset.x = String(Number(moved.dataset.x) + 220)
        updateCanvasNodePosition(moved)
        pathWrites = 0
        renderCanvasConnections()
        const moveWrites = pathWrites

        return { baselineWrites, noopWrites, panWrites, panPortMeasures, moveWrites }
      } finally {
        Element.prototype.setAttribute = originalSetAttribute
        Element.prototype.getBoundingClientRect = originalRect
      }
    })
    assert.ok(result.baselineWrites > 0, `基线应绘制连线: ${JSON.stringify(result)}`)
    assert.equal(result.noopWrites, 0, `无变化的重绘应被跳过: ${JSON.stringify(result)}`)
    assert.equal(result.panWrites, 0, `平移不应改写连线路径: ${JSON.stringify(result)}`)
    assert.equal(result.panPortMeasures, 0, `平移后不应重新测量端口（会强制布局）: ${JSON.stringify(result)}`)
    assert.ok(result.moveWrites > 0, `节点移动后必须重绘连线: ${JSON.stringify(result)}`)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, checked: "connection-render-memo", result, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
