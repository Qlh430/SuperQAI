const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const path = require('node:path')

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 820 } })
    await page.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; }
      html, body, #neonEngineSurface, #canvasEditorScreen, #infiniteCanvas, #canvasPlane { position: fixed; inset: 0; margin: 0; overflow: visible; }
      #infiniteCanvas { width: 1000px; height: 820px; }
      .canvas-node { position: absolute; left: 250px; top: 180px; width: 400px; height: 448px; pointer-events: none; }
      .flora-node-content { position: absolute; top: 48px; left: 0; width: 400px; height: 400px; background: #17191d; pointer-events: auto; }
      .flora-node-port-layer { position: absolute; top: 48px; left: 0; width: 400px; height: 400px; pointer-events: none; }
      .canvas-port { position: absolute; top: 50%; width: 28px; height: 28px; padding: 0; border: 2px solid #888; border-radius: 50%; background: #080a0e; translate: 0 0; transform: translateY(-50%); opacity: 0; visibility: hidden; pointer-events: none; }
      .canvas-port-output { right: -56px; }
      .canvas-port-input { left: -56px; }
      .canvas-node:not([data-flora-port-hover="true"]) .canvas-port:not(:focus-visible) { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
      .canvas-node[data-flora-port-hover="true"] .canvas-port, .canvas-node .canvas-port:focus-visible { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
    </style></head><body><div id="neonEngineSurface"><div id="canvasEditorScreen"><div id="infiniteCanvas"><div id="canvasPlane">
      <div class="canvas-node" data-flora-node="true" id="testNode">
        <div class="flora-node-content"></div>
        <div class="flora-node-port-layer"><button class="canvas-port canvas-port-input" data-canvas-port="input" data-canvas-port-kind="input" aria-label="输入"></button><button class="canvas-port canvas-port-output" data-canvas-port="output" data-canvas-port-kind="output" aria-label="输出"></button></div>
      </div>
    </div></div></div></div></body></html>`)
    const source = process.env.QA_INTERACTION_SOURCE || (process.env.QA_DEPLOYED === '1' ? '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app' : 'design-sources')
    await page.addScriptTag({ path: path.join(__dirname, source, 'flora-connection-interaction.js') })
    await page.evaluate(() => window.FloraConnectionInteraction.install({ getScale: () => 1, isDragging: () => false, onPositionChange() {} }))

    const geometry = await page.evaluate(() => {
      const node = document.querySelector('#testNode')
      const body = node.querySelector('.flora-node-content').getBoundingClientRect()
      const input = node.querySelector('.canvas-port-input').getBoundingClientRect()
      const output = node.querySelector('.canvas-port-output').getBoundingClientRect()
      return { right: body.right, left: body.left, centerY: output.top + output.height / 2, inputX: input.left + input.width / 2, outputX: output.left + output.width / 2 }
    })
    const assertOwnedAndVisible = async label => {
      assert.equal(await page.locator('#testNode').getAttribute('data-flora-port-hover'), 'true', `${label}: 节点仍持有端口悬停`)
      assert.equal(await page.locator('.canvas-port').first().evaluate(port => getComputedStyle(port).visibility), 'visible', `${label}: 端口保持可见`)
    }

    await page.mouse.move(geometry.right - 8, geometry.centerY - 90)
    await page.mouse.move(geometry.right + 12, geometry.centerY - 70, { steps: 3 })
    await assertOwnedAndVisible('沿节点右上侧斜向连接点移动')
    await page.mouse.move(geometry.outputX, geometry.centerY - 15, { steps: 3 })
    await assertOwnedAndVisible('沿上方过渡带靠近连接点')
    await page.mouse.move(geometry.outputX, geometry.centerY)
    await assertOwnedAndVisible('到达连接点')

    await page.mouse.move(20, 20)
    await page.waitForTimeout(30)
    await page.locator('.canvas-port-output').evaluate(port => port.addEventListener('pointerdown', () => { window.qaPortPresses = (window.qaPortPresses || 0) + 1 }))
    await page.mouse.move(geometry.right - 8, geometry.centerY - 90)
    await page.mouse.move(geometry.right + 12, geometry.centerY - 70, { steps: 3 })
    await assertOwnedAndVisible('扩大过渡区内仍有悬停归属')
    await page.mouse.down(); await page.mouse.up()
    assert.equal(await page.evaluate(() => window.qaPortPresses || 0), 0, '扩大后的悬停过渡区不扩大起线点击范围')
    await page.mouse.move(20, 20)
    await page.mouse.move(geometry.outputX, geometry.centerY - 15)
    await page.mouse.down(); await page.mouse.up()
    assert.equal(await page.evaluate(() => window.qaPortPresses || 0), 0, '外侧直接靠近不能激活端口')

    await page.mouse.move(20, 20)
    await page.waitForTimeout(30)
    await page.mouse.move(geometry.right - 8, geometry.centerY + 110)
    await page.mouse.move(geometry.right + 12, geometry.centerY + 75, { steps: 3 })
    await assertOwnedAndVisible('沿节点右下侧斜向连接点移动')
    await page.mouse.move(geometry.outputX, geometry.centerY + 16, { steps: 3 })
    await assertOwnedAndVisible('沿下方过渡带靠近连接点')

    await page.mouse.move(20, 20)
    await page.waitForTimeout(30)
    await page.mouse.move(geometry.left + 8, geometry.centerY - 90)
    await page.mouse.move(geometry.left - 12, geometry.centerY - 70, { steps: 3 })
    await assertOwnedAndVisible('沿节点左上侧斜向连接点移动')
    await page.mouse.move(geometry.inputX, geometry.centerY - 15, { steps: 3 })
    await assertOwnedAndVisible('输入端口上方过渡带保持可见')

    await page.mouse.move(20, 20)
    await page.waitForTimeout(30)
    await page.mouse.move(geometry.left + 8, geometry.centerY + 110)
    await page.mouse.move(geometry.left - 12, geometry.centerY + 75, { steps: 3 })
    await assertOwnedAndVisible('沿节点左下侧斜向连接点移动')
    await page.mouse.move(geometry.inputX, geometry.centerY + 16, { steps: 3 })
    await assertOwnedAndVisible('输入端口下方过渡带保持可见')

    await page.mouse.move(geometry.left - 100, geometry.centerY)
    await page.waitForTimeout(30)
    assert.equal(await page.locator('#testNode').getAttribute('data-flora-port-hover'), null, '离开节点和端口通道后清除悬停归属')
    console.log('连接点斜向过渡回归通过：上/下路径保持端口可见，离开通道后正常收起。')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
