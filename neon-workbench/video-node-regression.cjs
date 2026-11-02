const { chromium } = require("playwright")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const output = path.join(__dirname, "acceptance")
fs.mkdirSync(output, { recursive: true })

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  })
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
    page.on("pageerror", error => errors.push(error.message))
    const css = fs.readFileSync(path.join(__dirname, "design-sources/flora-node-shell.css"), "utf8")
    await page.setContent(`
      <style>
        html, body { margin: 0; width: 100%; height: 100%; background: #090a0c; }
        #neonEngineSurface, #canvasEditorScreen, #infiniteCanvas { width: 100%; height: 100%; }
        #canvasPlane { position: relative; width: 100%; height: 100%; }
        ${css}
      </style>
      <div id="neonEngineSurface">
        <div id="canvasEditorScreen">
          <div id="infiniteCanvas">
            <div id="canvasPlane">
              <article
                class="canvas-node canvas-node-asset-collection canvas-node-asset-single-video canvas-node-media canvas-node-media-video"
                data-id="video-node"
                data-x="180"
                data-y="70"
                style="position:absolute;left:180px;top:70px;--flora-node-width:420px;--flora-node-height:720px"
              >
                <div class="canvas-node-bar"><span class="canvas-node-title">视频素材</span></div>
                <div class="canvas-media-shell canvas-media-shell-video has-media">
                  <span class="canvas-media-preview-label">视频预览</span>
                  <video class="canvas-video-preview" src="data:video/webm;base64,AA==" playsinline></video>
                </div>
                <span class="canvas-node-status">已就绪 · 可预览和输出</span>
              </article>
            </div>
          </div>
        </div>
      </div>
    `)
    await page.addScriptTag({
      path: path.join(
        __dirname,
        "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app/assets/vendor/lucide.min.js",
      ),
    })
    await page.addScriptTag({ path: path.join(__dirname, "design-sources/node-action-bar.js") })
    await page.addScriptTag({ path: path.join(__dirname, "design-sources/flora-node-shell.js") })
    await page.evaluate(() => {
      const node = document.querySelector("article")
      window.CanvasFloraNodeShell.mount(node)
      const viewport = document.querySelector("#infiniteCanvas")
      window.__videoNodeDrag = { starts: 0, target: "", x: Number(node.dataset.x), y: Number(node.dataset.y) }
      viewport.addEventListener("pointerdown", event => {
        const dragNode = event.target.closest(".canvas-node")
        if (!dragNode) {
          document.querySelectorAll(".canvas-node.is-selected").forEach(selected => selected.classList.remove("is-selected"))
          return
        }
        if (event.button !== 0) return
        dragNode.classList.add("is-selected")
        window.__videoNodeDrag.starts += 1
        window.__videoNodeDrag.target = event.target.className
        const startX = event.clientX
        const startY = event.clientY
        const x = Number(dragNode.dataset.x)
        const y = Number(dragNode.dataset.y)
        const move = moveEvent => {
          const dx = moveEvent.clientX - startX
          const dy = moveEvent.clientY - startY
          dragNode.dataset.x = String(x + dx)
          dragNode.dataset.y = String(y + dy)
          dragNode.style.left = `${x + dx}px`
          dragNode.style.top = `${y + dy}px`
          window.__videoNodeDrag.x = x + dx
          window.__videoNodeDrag.y = y + dy
        }
        const end = () => {
          window.removeEventListener("pointermove", move)
          window.removeEventListener("pointerup", end)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", end, { once: true })
      })
      const media = document.querySelector(".canvas-video-preview")
      let playing = false
      let currentTime = 0
      Object.defineProperty(media, "paused", { configurable: true, get: () => !playing })
      Object.defineProperty(media, "ended", { configurable: true, get: () => false })
      Object.defineProperty(media, "duration", { configurable: true, get: () => 55 })
      Object.defineProperty(media, "currentTime", {
        configurable: true,
        get: () => currentTime,
        set: value => { currentTime = value },
      })
      media.play = () => {
        playing = true
        media.dispatchEvent(new Event("play"))
        return Promise.resolve()
      }
      media.pause = () => {
        playing = false
        media.dispatchEvent(new Event("pause"))
      }
    })

    const initialState = await page.evaluate(() => {
      const center = document.querySelector(".flora-video-center")
      const controls = document.querySelector(".flora-video-controls")
      return {
        center: Boolean(center),
        centerLabel: center?.getAttribute("aria-label"),
        centerIcon: center?.querySelector("[data-lucide]")?.getAttribute("data-lucide"),
        centerPointerEvents: getComputedStyle(center).pointerEvents,
        controlsOpacity: getComputedStyle(controls).opacity,
        controlsVisibility: getComputedStyle(controls).visibility,
        controlsPointerEvents: getComputedStyle(controls).pointerEvents,
      }
    })
    assert.deepEqual(initialState, {
      center: true,
      centerLabel: "播放视频",
      centerIcon: "play",
      centerPointerEvents: "auto",
      controlsOpacity: "0",
      controlsVisibility: "hidden",
      controlsPointerEvents: "none",
    })
    await page.screenshot({ path: path.join(output, "video-node-default.png") })

    const videoBox = await page.locator(".canvas-video-preview").boundingBox()
    const dragPoint = {
      x: videoBox.x + videoBox.width * 0.28,
      y: videoBox.y + videoBox.height * 0.24,
    }
    await page.mouse.move(dragPoint.x, dragPoint.y)
    await page.mouse.down()
    await page.mouse.move(dragPoint.x + 120, dragPoint.y + 80, { steps: 4 })
    await page.mouse.up()

    const drag = await page.evaluate(() => window.__videoNodeDrag)
    assert.equal(drag.starts, 1)
    assert.ok(Math.abs(drag.x - 300) < 0.1, `拖动后 X 坐标异常：${drag.x}`)
    assert.ok(Math.abs(drag.y - 150) < 0.1, `拖动后 Y 坐标异常：${drag.y}`)
    assert.equal(drag.target.includes("canvas-video-preview"), false)
    assert.equal(await page.locator(".flora-node-toolbar").evaluate(element => getComputedStyle(element).visibility), "visible")

    await page.waitForFunction(() => getComputedStyle(document.querySelector(".flora-video-controls")).opacity === "1")
    const state = await page.evaluate(() => {
      const media = document.querySelector(".canvas-video-preview")
      const center = document.querySelector(".flora-video-center")
      const controls = document.querySelector(".flora-video-controls")
      const play = document.querySelector(".flora-video-play")
      const progress = document.querySelector(".flora-video-progress")
      const expand = document.querySelector(".flora-video-expand")
      return {
        controls: Boolean(controls),
        centerLabel: center.getAttribute("aria-label"),
        playLabel: play.getAttribute("aria-label"),
        progressType: progress.type,
        progressLabel: progress.getAttribute("aria-label"),
        expandLabel: expand.getAttribute("aria-label"),
        mediaPointerEvents: getComputedStyle(media).pointerEvents,
        controlsPointerEvents: getComputedStyle(controls).pointerEvents,
        controlsOpacity: getComputedStyle(controls).opacity,
        controlsPosition: getComputedStyle(controls).position,
      }
    })
    assert.deepEqual(state, {
      controls: true,
      centerLabel: "播放视频",
      playLabel: "播放视频",
      progressType: "range",
      progressLabel: "视频进度",
      expandLabel: "放大视频",
      mediaPointerEvents: "none",
      controlsPointerEvents: "auto",
      controlsOpacity: "1",
      controlsPosition: "absolute",
    })

    await page.locator(".flora-video-center").click()
    assert.equal((await page.evaluate(() => window.__videoNodeDrag.starts)), 1)
    assert.equal(await page.locator(".flora-video-center").getAttribute("data-playing"), "true")
    assert.equal(await page.locator(".flora-video-play").getAttribute("aria-label"), "暂停视频")
    const pictureBox = await page.locator(".canvas-media-shell").boundingBox()
    const picturePoint = { x: pictureBox.x + pictureBox.width * 0.2, y: pictureBox.y + pictureBox.height * 0.25 }
    await page.mouse.click(picturePoint.x, picturePoint.y)
    assert.equal(await page.locator(".canvas-video-preview").evaluate(media => media.paused), true, "播放中单击视频画面应暂停")
    assert.equal((await page.evaluate(() => window.__videoNodeDrag.starts)), 1, "播放中单击画面不能启动节点拖动")
    await page.mouse.move(picturePoint.x, picturePoint.y)
    await page.mouse.down()
    await page.mouse.move(picturePoint.x + 40, picturePoint.y - 20, { steps: 4 })
    await page.mouse.up()
    assert.equal(await page.locator(".canvas-video-preview").evaluate(media => media.paused), true, "暂停时拖动画面不能播放")
    assert.equal((await page.evaluate(() => window.__videoNodeDrag.starts)), 2)
    assert.equal((await page.evaluate(() => window.__videoNodeDrag.x)), 340)
    await page.locator(".flora-video-center").click()
    const progressBox = await page.locator(".flora-video-progress").boundingBox()
    const progressY = progressBox.y + progressBox.height / 2
    await page.mouse.move(progressBox.x + 2, progressY)
    await page.mouse.down()
    await page.mouse.move(progressBox.x + progressBox.width * 0.5, progressY, { steps: 8 })
    await page.mouse.up()
    const currentTime = await page.locator(".canvas-video-preview").evaluate(media => media.currentTime)
    assert.ok(currentTime > 20 && currentTime < 35, `拖动进度条后当前时间异常：${currentTime}`)
    assert.equal((await page.evaluate(() => window.__videoNodeDrag.starts)), 2)
    await page.screenshot({ path: path.join(output, "video-node-hover-controls.png") })
    await page.locator(".flora-video-expand").click()
    await page.waitForFunction(() => document.fullscreenElement === document.querySelector(".canvas-media-shell"))
    assert.equal(await page.locator(".flora-video-expand").getAttribute("aria-label"), "退出视频全屏")
    await page.locator(".flora-video-expand").click()
    await page.waitForFunction(() => !document.fullscreenElement)
    assert.equal((await page.evaluate(() => window.__videoNodeDrag.starts)), 2)
    await page.locator(".flora-video-play").click()
    assert.equal(await page.locator(".flora-video-play").getAttribute("aria-label"), "播放视频")
    await page.mouse.click(50, 50)
    assert.equal(await page.locator("article").evaluate(node => node.classList.contains("is-selected")), false)
    await page.waitForTimeout(180)
    assert.equal(await page.locator(".flora-node-toolbar").evaluate(element => getComputedStyle(element).visibility), "hidden")
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({
      checked: 1,
      errors,
      screenshots: [
        path.join(output, "video-node-default.png"),
        path.join(output, "video-node-hover-controls.png"),
      ],
      result: "默认显示中央播放按钮；悬停后显示紧凑底部控制条。进度条可真实拖动，放大后可再次点击退出；工具栏只随节点选中显示，点击画布空白后隐藏；视频画面可拖动，控件按下不会拖动画布节点。",
    }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
