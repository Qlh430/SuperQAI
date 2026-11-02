const { chromium } = require("playwright")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

// Dragging must not recompute the whole connection layer for every pointermove.
// A burst of moves inside one frame has to collapse into a single paint, and
// that paint must happen in the same frame as the node transform.
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
      for (const file of ["flora-generator-composer.js", "flora-node-shell.js"]) {
        await page.route(`**/${file}*`, r => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(process.env.PERF_SOURCE, file), "utf8") }))
      }
      await page.route("**/script.js*", r => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(process.env.PERF_SOURCE, "script-before-save-bridge.js"), "utf8") }))
    }
    await page.goto("http://127.0.0.1:3199", { waitUntil: "domcontentloaded" })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator"])
      await loadCanvasBoards()
      canvasState.activeBoardId = "qa-drag-frame"
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
      window.qaNodes = Array.from({ length: 6 }, (_, i) => addCanvasImageGeneratorNode({ x: i * 420, y: 60 }, { focus: false }))
      qaNodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.isRestoring = false
      canvasState.hasUnsavedChanges = false
      canvasState.x = 120
      canvasState.y = 90
      canvasState.scale = 0.7
      applyCanvasTransformNow()
      const edge = normalizeVisibleCanvasConnection({ id: "qa-drag-edge", from: qaNodes[0].dataset.id, to: qaNodes[1].dataset.id, fromPort: "output", toPort: "input" })
      canvasState.connections = [edge]
      canvasVisibleConnectionBaselineIds.add(edge.id)
      selectCanvasNode(qaNodes[0])
      renderCanvasConnections()
      window.qaFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
    })
    await page.waitForTimeout(400)
    const result = await page.evaluate(async () => {
      const node = qaNodes[0]
      const originalSetAttribute = Element.prototype.setAttribute
      let dWrites = 0
      Element.prototype.setAttribute = function (name, value) {
        if (name === "d" && this.ownerSVGElement?.id === "canvasConnections") dWrites += 1
        return originalSetAttribute.call(this, name, value)
      }
      const rect = node.getBoundingClientRect()
      const base = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 }
      let duringBurst = 0
      let afterSameFrame = 0
      let afterFrames = 0
      try {
        node.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: rect.left + 40, clientY: rect.top + 40 }))
        dWrites = 0
        for (let i = 0; i < 24; i++) {
          window.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: rect.left + 40 + i * 4, clientY: rect.top + 40 + i * 2 }))
        }
        duringBurst = dWrites
        await window.qaFrame()
        afterSameFrame = dWrites
        await window.qaFrame()
        afterFrames = dWrites
        window.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }))
      } finally {
        Element.prototype.setAttribute = originalSetAttribute
      }
      return { duringBurst, afterSameFrame, afterFrames, moves: 24 }
    })
    // 24 synchronous moves are one paint, not 24: at most a couple of writes for
    // the path plus its hit area.
    assert.ok(result.duringBurst <= 4, `单帧内多次移动不应逐次重算连线: ${JSON.stringify(result)}`)
    assert.ok(result.afterFrames >= 2, `拖动后连线应在同帧内更新: ${JSON.stringify(result)}`)
    assert.equal(result.afterSameFrame, result.afterFrames, `连线应在节点位移的同一帧完成刷新: ${JSON.stringify(result)}`)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, ...result, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
