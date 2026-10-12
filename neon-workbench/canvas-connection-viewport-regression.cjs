const { chromium } = require("playwright")
const assert = require("node:assert/strict")

// Port points are measured from the live DOM, which reflects the transform that
// is actually painted. If a pan/zoom is registered but its animation frame has
// not run yet, converting that measurement with the pending viewport shifts
// every wire by the pending delta and snaps it back on the next frame. This
// regression re-measures ports while a pan is pending and requires the wires to
// stay put.
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
    await page.goto("http://127.0.0.1:3199", { waitUntil: "domcontentloaded" })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator"])
      await loadCanvasBoards()
      canvasState.activeBoardId = "qa-connection-viewport"
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
      window.qaNodes = Array.from({ length: 3 }, (_, i) => addCanvasImageGeneratorNode({ x: i * 420, y: 60 }, { focus: false }))
      qaNodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.isRestoring = false
      canvasState.x = 120
      canvasState.y = 90
      canvasState.scale = 0.8
      applyCanvasTransformNow()
      const edge = normalizeVisibleCanvasConnection({ id: "qa-viewport-edge", from: qaNodes[0].dataset.id, to: qaNodes[1].dataset.id, fromPort: "output", toPort: "input" })
      canvasState.connections = [edge]
      canvasVisibleConnectionBaselineIds.add(edge.id)
      renderCanvasConnections()
    })
    await page.waitForTimeout(400)
    const result = await page.evaluate(() => {
      const path = document.querySelector("#canvasConnections .canvas-connection-path")
      const before = path.getAttribute("d")
      // Register a pan without letting its animation frame run yet.
      canvasState.x += 140
      canvasState.y += 60
      // A node mounting mid-gesture invalidates the port cache, forcing a fresh
      // DOM measurement while the plane still shows the previous transform.
      canvasConnectionPortPointCache.clear()
      renderCanvasConnections()
      const whilePending = path.getAttribute("d")
      applyCanvasTransformNow()
      renderCanvasConnections()
      const afterApplied = path.getAttribute("d")
      return { before, whilePending, afterApplied }
    })
    assert.equal(result.whilePending, result.before, `平移未应用时连线不应位移: ${JSON.stringify(result)}`)
    // After the transform applies the path is re-measured; world coordinates
    // must match the original within sub-pixel rounding.
    const numbers = value => (String(value).match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
    const before = numbers(result.before)
    const after = numbers(result.afterApplied)
    assert.equal(after.length, before.length, `路径端点数量应一致: ${JSON.stringify(result)}`)
    after.forEach((value, index) => {
      assert.ok(Math.abs(value - before[index]) < 0.5, `变换应用后连线端点应保持一致: ${JSON.stringify(result)}`)
    })
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, checked: "pending-pan-port-measurement", errors }))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
