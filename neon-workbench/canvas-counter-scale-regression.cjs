const { chromium } = require("playwright")
const assert = require("node:assert/strict")

// The counter-scale custom property is rewritten on every zoom frame, so only
// elements that are actually painted may consume it. This guards both halves:
// always-visible chrome keeps the value, and the hover/selection-only chrome
// gets it whenever it is visible (and no longer when it is not).
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
      canvasState.activeBoardId = "qa-counter-scale"
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
      window.qaNodes = Array.from({ length: 3 }, (_, i) => addCanvasImageGeneratorNode({ x: i * 460, y: 80 }, { focus: false }))
      qaNodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.isRestoring = false
      canvasState.x = 60
      canvasState.y = 40
      canvasState.scale = 0.5
      applyCanvasTransformNow()
    })
    await page.waitForTimeout(400)
    const result = await page.evaluate(() => {
      const read = element => {
        if (!element) return null
        return getComputedStyle(element).getPropertyValue("--collab-inverse-scale").trim()
      }
      const painted = element => {
        if (!element) return null
        const style = getComputedStyle(element)
        // `visibility` is the authoritative painted/hidden switch here; opacity
        // fades in over a transition and would race this read.
        return style.visibility !== "hidden" && style.display !== "none"
      }
      const node = qaNodes[0]
      const other = qaNodes[1]
      const findToolbar = target => target.querySelector(".flora-node-shell > .flora-node-toolbar")
        || target.querySelector(".flora-node-toolbar")
      const toolbar = findToolbar(node)
      const port = node.querySelector(".canvas-port")
      const otherToolbar = findToolbar(other)

      clearCanvasSelection()
      const deselected = { toolbar: read(toolbar), otherToolbar: read(otherToolbar), port: read(port), toolbarPainted: painted(toolbar) }

      selectCanvasNode(node)
      const selected = { toolbar: read(toolbar), otherToolbar: read(otherToolbar), port: read(port), toolbarPainted: painted(toolbar) }

      // Zoom again while selected: the scoped value must follow the new scale.
      canvasState.scale = 0.25
      applyCanvasTransformNow()
      const rezoomed = { toolbar: read(toolbar), port: read(port) }
      return { deselected, selected, rezoomed }
    })

    // Always-visible chrome always carries the counter-scale (1 / 0.5 = 2).
    assert.equal(result.deselected.port, "2", `端口必须始终反向缩放: ${JSON.stringify(result)}`)
    assert.equal(result.selected.port, "2", `端口必须始终反向缩放: ${JSON.stringify(result)}`)
    // The toolbar is only painted for a selected/connecting node, so it must
    // carry the counter-scale exactly when it is painted.
    assert.equal(result.deselected.toolbarPainted, false, `未选中节点的工具栏应为不可见: ${JSON.stringify(result)}`)
    assert.equal(result.deselected.toolbar, "1", `不可见工具栏不应参与反向缩放: ${JSON.stringify(result)}`)
    assert.equal(result.deselected.otherToolbar, "1", `其他节点工具栏不应参与反向缩放: ${JSON.stringify(result)}`)
    assert.equal(result.selected.toolbarPainted, true, `选中节点的工具栏应可见: ${JSON.stringify(result)}`)
    assert.equal(result.selected.toolbar, "2", `可见工具栏必须反向缩放: ${JSON.stringify(result)}`)
    assert.equal(result.selected.otherToolbar, "1", `未选中节点的工具栏不应跟随: ${JSON.stringify(result)}`)
    // 1 / 0.25 = 4
    assert.equal(result.rezoomed.toolbar, "4", `缩放后选中工具栏必须跟随: ${JSON.stringify(result)}`)
    assert.equal(result.rezoomed.port, "4", `缩放后端口必须跟随: ${JSON.stringify(result)}`)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, checked: "counter-scale-scope", result, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
