const { chromium } = require("playwright")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

// While the pointer button is held for a canvas pan, no node can be clicked, so
// the node layer leaves hit-testing for the duration. Outside a pan every click
// must still land on the node exactly as before.
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
      canvasState.activeBoardId = "qa-pan-hit-test"
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
      window.qaNodes = [addCanvasImageGeneratorNode({ x: 120, y: 120 }, { focus: false })]
      qaNodes.forEach(node => pinCanvasNode(node.dataset.id))
      canvasState.isRestoring = false
      canvasState.x = 60
      canvasState.y = 40
      canvasState.scale = 1
      applyCanvasTransformNow()
      clearCanvasSelection()
    })
    await page.waitForTimeout(400)
    const nodeCenter = await page.evaluate(() => {
      const rect = qaNodes[0].getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })
    const probe = async () => page.evaluate(({ x, y }) => {
      const viewport = document.querySelector("#infiniteCanvas")
      return {
        panning: viewport.classList.contains("is-canvas-panning"),
        onNode: Boolean(document.elementFromPoint(x, y)?.closest?.(".canvas-node")),
      }
    }, nodeCenter)

    const before = await probe()
    assert.equal(before.panning, false, `未拖拽时不应有平移闸门: ${JSON.stringify(before)}`)
    assert.equal(before.onNode, true, `未拖拽时节点应可命中: ${JSON.stringify(before)}`)

    // 空白处左键现在是框选，不再平移：拖拽期间不能出现平移闸门，且要框住节点。
    await page.mouse.move(1150, 900)
    await page.mouse.down()
    await page.mouse.move(1120, 870)
    await page.waitForTimeout(60)
    const duringLeft = await probe()
    assert.equal(duringLeft.panning, false, `左键框选不应开启平移闸门: ${JSON.stringify(duringLeft)}`)
    assert.equal(duringLeft.onNode, true, `左键框选时节点仍应可命中: ${JSON.stringify(duringLeft)}`)
    await page.mouse.up()
    await page.waitForTimeout(60)
    const afterLeft = await probe()
    assert.equal(afterLeft.panning, false, `左键框选释放后不应有平移闸门: ${JSON.stringify(afterLeft)}`)
    assert.equal(afterLeft.onNode, true, `左键框选释放后节点仍应可命中: ${JSON.stringify(afterLeft)}`)

    // 画布平移只保留中键：按住中键拖动时才开启平移闸门。
    await page.mouse.move(1150, 900)
    await page.mouse.down({ button: "middle" })
    await page.mouse.move(1120, 870)
    await page.waitForTimeout(60)
    const during = await probe()
    assert.equal(during.panning, true, `中键拖拽中应开启平移闸门: ${JSON.stringify(during)}`)
    assert.equal(during.onNode, false, `中键拖拽中节点不应参与命中测试: ${JSON.stringify(during)}`)

    await page.mouse.up({ button: "middle" })
    await page.waitForTimeout(60)
    const after = await probe()
    assert.equal(after.panning, false, `释放后应关闭平移闸门: ${JSON.stringify(after)}`)
    assert.equal(after.onNode, true, `释放后节点必须恢复命中: ${JSON.stringify(after)}`)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, checked: "pan-hit-test-gate", before, duringLeft, afterLeft, during, after, errors }))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
