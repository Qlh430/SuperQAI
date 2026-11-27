const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const { Worker } = require("node:worker_threads")
const { chromium } = require("playwright")

const root = path.resolve(__dirname, "..")
const portable = path.join(root, "AI-OS-Portable-1.0.5-win-x64")
const diagnostic = JSON.parse(fs.readFileSync(path.join(portable, "data/.logs/runtime-diagnostics.json")))
const runtimeApp = diagnostic.appRoot
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAE0lEQVR4nGP8//8/AwMDCwMYAAAkFAMDuxa40wAAAABJRU5ErkJggg==",
  "base64",
)

async function run() {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-reference-picker-"))
  const worker = new Worker(path.join(runtimeApp, "canvas-db-worker.js"), {
    workerData: { dbPath: path.join(evidence, "canvas.db") },
  })
  const waiting = new Map()
  let sequence = 0
  worker.on("message", message => {
    const pending = waiting.get(message.id)
    if (!pending) return
    waiting.delete(message.id)
    message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error?.message))
  })
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence)
    waiting.set(id, { resolve, reject })
    worker.postMessage({ id, method, params })
  })
  const boardId = "qa-reference-picker"
  await rpc("createBoard", { id: boardId, title: "隔离素材引用面板验收" })

  const browser = await chromium.launch({ headless: true, channel: "chrome" })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  if (process.argv.includes("--source")) {
    await page.route(/\/(?:script|flora-generator-composer)\.js(?:\?|$)/, async route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1)
      const from = name === "script.js" ? "script-before-save-bridge.js" : name
      let body = fs.readFileSync(path.join(__dirname, "design-sources", from), "utf8")
      if (name === "flora-generator-composer.js") {
        const served = await route.fetch()
        body = (await served.text()).split("\n", 1)[0] + "\n" + body
      }
      return route.fulfill({ contentType: "application/javascript", body })
    })
  }
  await page.route("**/output/qa-reference*.png", route => route.fulfill({ contentType: "image/png", body: pngBytes }))
  await page.route(/\/output\/qa-reference-.+\.(mp4|wav)$/, route => route.fulfill({ status: 204 }))
  const pageErrors = []
  page.on("pageerror", error => pageErrors.push(error.stack || error.message))
  await page.routeWebSocket("**/*", ws => ws.close())
  await page.route("**/api/**", async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith("/export-page") && process.argv.includes("--check-window")) {
      return route.fulfill({ json: { items: [{
        id: "qa-catalog-only", kind: "image", x: 50000, y: 12000, width: 400, height: 400,
        imageName: "远处历史成图", resultSrc: "/output/qa-reference-history.png",
      }] } })
    }
    if (url.pathname.endsWith("/node") && url.searchParams.get("nodeId") === "qa-catalog-only") {
      return route.fulfill({ json: { node: {
        id: "qa-catalog-only", kind: "image", x: 50000, y: 12000, width: 400, height: 400,
        imageName: "远处历史成图", resultSrc: "/output/qa-reference-history.png",
      } } })
    }
    if (url.pathname === "/api/image-thumbnails") {
      const source = url.searchParams.get("source") || ""
      return route.fulfill({ json: { item: { thumbnailUrl: `/output/qa-reference-thumb-${encodeURIComponent(source.split("/").at(-1))}` } } })
    }
    if (url.pathname === "/api/asset-library") return route.fulfill({ json: { entries: [
      { asset: { id: "qa-existing", name: "现有合集资产" }, preview: { kind: "image", url: "/output/qa-reference.png" } },
      { asset: { id: "qa-asset", name: "新资产图片" }, preview: { kind: "image", url: "/output/qa-reference-asset.png" } },
    ] } })
    if (request.method() === "POST" && /\/upload-(?:image|media)$/.test(url.pathname)) {
      const filename = decodeURIComponent(request.headers()["x-file-name"] || "")
      return route.fulfill({ json: { url: "/output/qa-reference-" + filename, asset: { id: "qa-" + filename } } })
    }
    if (url.pathname.endsWith("/operations") && request.method() === "POST") {
      try {
        return route.fulfill({ json: await rpc("applyOperations", { boardId, ...request.postDataJSON() }) })
      } catch (error) {
        return route.fulfill({ status: 400, json: { error: error.message } })
      }
    }
    return route.fulfill({ json: {
      authenticated: false, boards: [], projects: [], resources: [], records: [],
      models: [], imageModels: [], providers: [], preferences: {}, settings: {},
    } })
  })

  try {
    await page.goto("http://127.0.0.1:33200/", { waitUntil: "networkidle" })
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure([
        "canvas-runtime",
        "canvas-node-generator",
        "canvas-node-comfy",
        "canvas-agent-tool-adapters",
        "canvas-node-asset-collection",
        "canvas-node-minimax-h3",
        "canvas-node-video-api",
      ])
      await loadCanvasBoards()
      canvasState.activeBoardId = id
      canvasState.activeBoardPersisted = true
      const surface = document.createElement("div")
      surface.id = "neonEngineSurface"
      surface.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column"
      document.body.append(surface)
      surface.append(document.querySelector("#canvasView"))
      document.querySelector("#canvasView").hidden = false
      document.querySelector("#canvasView").classList.add("active")
      document.querySelector("#canvasEditorScreen").hidden = false
      document.body.classList.add("canvas-surface-open")
      showCanvasEditor()
    }, boardId)

    if (process.argv.includes("--performance")) {
      for (const count of [10, 100, 200]) {
        const targetId = await page.evaluate(count => {
          for (let index = 0; index < count; index += 1) {
            canvasVirtualStore.upsert({ id: `perf-${index}`, kind: "image", x: 8500 + index * 450,
              y: 8000, width: 400, height: 400, uploadOnly: true,
              imageName: `素材 ${String(index).padStart(3, "0")}`, imageSrc: `/output/qa-reference-perf-${index}.png` })
          }
          const target = addCanvasApiNode({ x: 300, y: 100 })
          selectCanvasNode(target)
          FloraGeneratorComposer.mount(target, target.querySelector(".flora-node-shell"))
          return target.dataset.id
        }, count)
        const requests = []
        const capture = request => requests.push(decodeURIComponent(new URL(request.url()).pathname))
        page.on("request", capture)
        const samples = []
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const startIndex = requests.length
          const timing = await page.evaluate(async id => {
            const tasks = []
            const longTasks = new PerformanceObserver(entries => tasks.push(...entries.getEntries()))
            longTasks.observe({ type: "longtask" })
            const start = performance.now()
            getCanvasNode(id).querySelector(".flora-generator-add-reference").click()
            const clickHandler = performance.now() - start
            const panel = document.getElementById(`floraReferencePicker_${id}`)
            const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
            await frame()
            const firstVisible = getComputedStyle(panel).visibility === "visible" ? performance.now() - start : null
            while (!panel.querySelector(".flora-reference-picker-item") && performance.now() - start < 7000) await frame()
            const firstCard = performance.now() - start
            await frame()
            tasks.push(...longTasks.takeRecords())
            longTasks.disconnect()
            return { clickHandler, firstVisible, firstCard, longestTask: Math.max(0, ...tasks.map(task => task.duration)),
              cards: panel.querySelectorAll(".flora-reference-picker-item").length }
          }, targetId)
          await page.waitForTimeout(500)
          const activity = requests.slice(startIndex)
          samples.push({ ...timing, original: activity.filter(path => path.startsWith("/output/qa-reference-perf-")).length,
            thumbnail: activity.filter(path => path.startsWith("/output/qa-reference-thumb-")).length,
            lookups: activity.filter(path => path === "/api/image-thumbnails").length,
            assetRequests: activity.filter(path => path === "/api/asset-library").length })
          await page.locator(`#floraReferencePicker_${targetId} .flora-reference-picker-close`).click()
        }
        console.log(JSON.stringify({ count, samples }))
        if (count === 200 && process.argv.includes("--check-window")) {
          const target = page.locator(`.canvas-node[data-id="${targetId}"] .flora-generator-add-reference`)
          const picker = page.locator(`#floraReferencePicker_${targetId}`)
          await target.click()
          const firstCard = picker.getByRole("button", { name: "素材 000 图片" })
          await firstCard.locator("img[src*='qa-reference-thumb-']").waitFor()
          await picker.locator(".flora-reference-picker-grid").evaluate(grid => { grid.scrollTop = grid.scrollHeight })
          await picker.getByRole("button", { name: /素材 199/ }).waitFor()
          assert.ok(await picker.locator(".flora-reference-picker-item").count() <= 20)
          await picker.getByRole("searchbox").fill("素材 021")
          await picker.getByRole("button", { name: /素材 021/ }).waitFor()
          const beforeAssets = requests.filter(path => path === "/api/asset-library").length
          await picker.getByRole("searchbox").fill("")
          await picker.getByRole("tab", { name: "资产" }).click()
          await picker.getByRole("button", { name: /新资产图片/ }).waitFor()
          assert.equal(requests.filter(path => path === "/api/asset-library").length - beforeAssets, 3)
          await picker.getByRole("tab", { name: "画布" }).click()
          await picker.getByRole("tab", { name: "资产" }).click()
          await picker.getByRole("button", { name: /新资产图片/ }).waitFor()
          assert.equal(requests.filter(path => path === "/api/asset-library").length - beforeAssets, 3)
          await picker.getByRole("tab", { name: "画布" }).click()
          await page.evaluate(() => { canvasState.activeBoardPersisted = true })
          await picker.getByRole("button", { name: "关闭素材面板" }).click()
          await target.click()
          await picker.getByRole("searchbox").fill("远处历史成图")
          await picker.getByRole("button", { name: /远处历史成图/ }).click()
          await picker.getByRole("button", { name: /远处历史成图.*已添加/ }).waitFor()
          const wired = await page.evaluate(id => ({
            edge: canvasState.connections.some(edge => edge.to === id && edge.from === "qa-catalog-only"),
            originalUrl: getCanvasIncomingReferenceMaterials(id).find(item => item.sourceNodeId === "qa-catalog-only")?.url,
          }), targetId)
          assert.deepEqual(wired, { edge: true, originalUrl: "/output/qa-reference-history.png" })
          let releaseAssets
          let markRequested
          const assetReady = new Promise(resolve => { markRequested = resolve })
          const assetDelay = new Promise(resolve => { releaseAssets = resolve })
          await page.route("**/api/asset-library?*", async route => {
            markRequested()
            await assetDelay
            await route.fulfill({ json: { entries: [
              { asset: { id: "late", name: "旧面板延迟返回" }, preview: { kind: "image", url: "/output/qa-reference.png" } },
            ] } }).catch(() => {})
          })
          await page.evaluate(() => dispatchEvent(new Event("ai-os-assets-changed")))
          await picker.getByRole("tab", { name: "资产" }).click()
          try {
            await assetReady
            await picker.getByRole("button", { name: "关闭素材面板" }).click()
            const nextId = await page.evaluate(() => {
              const next = addCanvasApiNode({ x: 700, y: 100 })
              selectCanvasNode(next)
              return next.dataset.id
            })
            await page.locator(`.canvas-node[data-id="${nextId}"] .flora-generator-add-reference`).click()
            const nextPicker = page.locator(`#floraReferencePicker_${nextId}`)
            await nextPicker.getByRole("button", { name: /素材 000/ }).waitFor()
            releaseAssets()
            await page.waitForLoadState("networkidle")
            assert.equal(await nextPicker.getByText("旧面板延迟返回").count(), 0)
            assert.equal(await picker.isVisible(), false)
          } finally { releaseAssets() }
          assert.deepEqual(pageErrors, [])
          console.log(JSON.stringify({ windowedScroll: true, catalogSearch: true, assetCache: true, requestIsolation: true, wired }))
        }
        await page.reload({ waitUntil: "networkidle" }).catch(() => {})
        if (count !== 200) await page.evaluate(async id => {
          await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator"])
          await loadCanvasBoards()
          canvasState.activeBoardId = id
          const surface = document.createElement("div")
          surface.id = "neonEngineSurface"
          surface.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column"
          document.body.append(surface)
          const view = document.querySelector("#canvasView")
          surface.append(view)
          view.hidden = false
          view.classList.add("active")
          document.querySelector("#canvasEditorScreen").hidden = false
          document.body.classList.add("canvas-surface-open")
          showCanvasEditor()
        }, boardId)
      }
      return
    }

    const snapshot = await page.evaluate(async () => {
      const upload = addCanvasImage("/output/qa-reference.png", "上传图片 A", { x: 80, y: 80 })
      upload.dataset.boardId = canvasState.activeBoardId
      syncCanvasNodeModel(upload)
      const collection = addCanvasAssetCollection({ x: 80, y: 360 }, {
        title: "上传素材合集",
        mode: "single",
        members: [{
          id: "qa-uploaded-member",
          assetId: "qa-existing",
          kind: "image",
          src: "/output/qa-reference.png",
          savedUrl: "/output/qa-reference.png",
          name: "上传图片合集成员",
          source: "upload",
        }],
      })
      collection.dataset.boardId = canvasState.activeBoardId
      syncCanvasNodeModel(collection)
      const generated = addCanvasApiNode({ x: 700, y: 80 }, {
        prompt: "生成结果图片",
        name: "生成图片 B",
      })
      appendCanvasGenerationToGallery(generated, { id: "qa-generated-result", src: "/output/qa-reference-generated.png" })
      generated.dataset.imageName = "已生成图片 B"
      syncCanvasNodeModel(generated)
      const text = addCanvasText({ x: 80, y: 700 }, { name: "文字节点", text: "可引用文字", focus: false })
      text.dataset.boardId = canvasState.activeBoardId
      syncCanvasNodeModel(text)
      const target = addCanvasApiNode({ x: 1100, y: 80 }, {
        prompt: "目标图片生成",
        name: "目标生成节点",
      })
      target.dataset.boardId = canvasState.activeBoardId
      syncCanvasNodeModel(target)
      const list = CanvasReferenceBridge.list({ targetNodeId: target.dataset.id })
      return {
        ids: {
          upload: upload.dataset.id,
          collection: collection.dataset.id,
          generated: generated.dataset.id,
          text: text.dataset.id,
          target: target.dataset.id,
        },
        list,
        collectionState: getCanvasAssetCollection(collection),
        collectionSerialized: serializeCanvasNode(collection),
        models: canvasVirtualStore.values().map(model => ({
          id: model.id,
          kind: model.kind,
          uploadOnly: model.uploadOnly,
          imageSrc: model.imageSrc,
          resultSrc: model.resultSrc,
          text: model.text,
        })),
      }
    })

    const panelState = await page.evaluate(async ids => {
      const target = getCanvasNode(ids.target)
      selectCanvasNode(target)
      FloraGeneratorComposer.mount(target, target?.querySelector(".flora-node-shell"))
      target?.querySelector(".flora-generator-add-reference")?.click()
      await new Promise(resolve => setTimeout(resolve, 60))
      const panel = document.querySelector(`#floraReferencePicker_${ids.target}`)
      const cards = [...(panel?.querySelectorAll(".flora-reference-picker-item") || [])]
      const collectionCard = cards.find(card => card.textContent.includes("上传图片合集成员"))
      collectionCard?.click()
      await new Promise(resolve => setTimeout(resolve, 60))
      return {
        opened: Boolean(panel) && !panel.hidden,
        found: cards.some(card => card.textContent.includes("上传图片合集成员")),
        collectionCardText: [...(panel?.querySelectorAll(".flora-reference-picker-item") || [])]
          .find(card => card.textContent.includes("上传图片合集成员"))?.textContent.trim() || "",
        stillOpenAfterAdd: Boolean(panel) && !panel.hidden,
        edges: canvasState.connections.filter(edge => edge.from === ids.collection && edge.to === ids.target),
      }
    }, snapshot.ids)

    assert.equal(panelState.found, true, JSON.stringify({ snapshot, panelState }))
    const wire = await page.evaluate(({ collection, target }) => {
      const source = getCanvasNode(collection)
      if (source) unmountCanvasVirtualNode(collection, source)
      renderCanvasConnections()
      const port = getCanvasConnectionPortPoint(collection, "member-output:qa-uploaded-member")
      const edge = canvasState.connections.find(item => item.from === collection && item.to === target)
      const svg = edge && canvasConnectionElements.get(CanvasConnectionRules.connectionKey(edge))?.path
      return { port, path: svg?.getAttribute("d") || "", references: getCanvasIncomingReferenceMaterials(target).length }
    }, snapshot.ids)
    assert.equal(wire.references, 1, "源节点卸载后仍有真实引用")
    assert.ok(wire.port && wire.path, `虚拟素材成员必须仍能画出连接：${JSON.stringify(wire)}`)
    const connected = await page.evaluate(ids => {
      const target = getCanvasNode(ids.target)
      const item = CanvasReferenceBridge.list({ targetNodeId: ids.target })
        .find(entry => entry.sourceNodeId === ids.collection && entry.type === "image")
      if (!item) throw new Error("素材列表中找不到上传图片合集成员")
      const first = CanvasReferenceBridge.add({
        targetNodeId: ids.target,
        sourceNodeId: item.sourceNodeId,
        sourcePort: item.sourcePort,
      })
      const second = CanvasReferenceBridge.add({
        targetNodeId: ids.target,
        sourceNodeId: item.sourceNodeId,
        sourcePort: item.sourcePort,
      })
      const edges = canvasState.connections.filter(edge => edge.from === ids.collection && edge.to === ids.target)
      return {
        first,
        second,
        targetPoint: { x: Number(target.dataset.x), y: Number(target.dataset.y) },
        edges,
        nodeCount: canvasVirtualStore.values().length,
      }
    }, snapshot.ids)

    assert.equal(pageErrors.length, 0, pageErrors.join("\n"))
    assert.ok(snapshot.list.some(item => item.sourceNodeId === snapshot.ids.upload && item.type === "image"), "上传图片应出现在画布素材列表")
    assert.ok(snapshot.list.some(item => item.sourceNodeId === snapshot.ids.collection && item.type === "image"), `素材合集中的上传图片应出现在画布素材列表：${JSON.stringify(snapshot)}`)
    assert.ok(snapshot.list.some(item => item.sourceNodeId === snapshot.ids.generated && item.type === "image"), "已有生成图片应出现在画布素材列表")
    assert.ok(snapshot.list.some(item => item.sourceNodeId === snapshot.ids.text && item.type === "text"), "文字节点应出现在画布素材列表")
    assert.equal(panelState.opened, true, "素材引用面板应能打开")
    assert.equal(panelState.found, true, "素材面板应显示当前画布上传图片")
    assert.match(panelState.collectionCardText, /已添加/, "面板选择后应显示已添加")
    assert.equal(panelState.stillOpenAfterAdd, true, "选择素材后面板保持打开")
    assert.equal(panelState.edges.length, 1, "面板选择应建立真实素材连接")
    assert.equal(connected.edges.length, 1, "重复选择同一素材不得创建重复连接")
    assert.equal(connected.edges[0].fromPort, "member-output:qa-uploaded-member", "应保留真实素材成员输出端口")
    assert.deepEqual(connected.targetPoint, { x: 1100, y: 80 }, "引用素材不得移动目标节点")
    assert.equal(connected.nodeCount, 5, "引用现有画布素材不得创建重复素材节点")
    const videoId = await page.evaluate(() => {
      const video = addCanvasApiVideoNode({ x: 940, y: 280 })
      selectCanvasNode(video)
      return video.dataset.id
    })
    await page.locator(`.canvas-node[data-id="${videoId}"] .flora-generator-add-reference`).click()
    const videoCases = await page.evaluate(({ collection, upload, generated, videoId }) => {
      const video = getCanvasNode(videoId)
      const picker = document.querySelector(`#floraReferencePicker_${videoId}`)
      for (const id of [upload, generated]) {
        const card = [...picker.querySelectorAll("[data-reference-id]")].find(el => el.dataset.referenceId === `canvas:${id}:output`)
        if (!card) throw new Error("找不到视频节点的参考图选项：" + JSON.stringify({ id, upload, generated, items: CanvasReferenceBridge.list({ targetNodeId: video.dataset.id }) }))
        card.click()
      }
      const edge = (id, port = "input") => canvasState.connections.find(item => item.from === id && item.to === videoId && item.toPort === port)
      const imageEdges = [edge(upload), edge(generated)]
      const imagePaths = imageEdges.map(item => item && canvasConnectionElements.get(
        CanvasConnectionRules.connectionKey(item, canvasState.connections.indexOf(item)))?.path?.getAttribute("d"))
      const duplicate = CanvasReferenceBridge.add({ targetNodeId: videoId, sourceNodeId: upload })
      const existing = CanvasReferenceBridge.addAsset({ targetNodeId: videoId, asset: { id: "qa-existing", kind: "image", url: "/output/qa-reference.png" } })
      const existingEdge = edge(collection)
      const removal = [...video.querySelectorAll(".flora-reference-card")].find(card => card.dataset.referenceKey.includes(upload))
      removal.querySelector(".flora-reference-remove").click()
      const removed = !edge(upload)
      undoCanvasCommand()
      const undo = Boolean(edge(upload))
      redoCanvasCommand()
      const redo = !edge(upload)
      undoCanvasCommand()
      picker.querySelector("[data-reference-tab='asset']").click()
      return { videoId, imagePaths, duplicate, existing, existingEdge, removed, undo, redo }
    }, { ...snapshot.ids, videoId })
    assert.ok(videoCases.imagePaths.every(Boolean), "视频节点连续选择两张已有图应生成两条 SVG 线：" + JSON.stringify(videoCases))
    assert.equal(videoCases.existing.sourceNodeId, snapshot.ids.collection)
    assert.equal(videoCases.existingEdge?.fromPort, "member-output:qa-uploaded-member", "从资产复用合集时连接具体成员")
    assert.ok(videoCases.removed && videoCases.undo && videoCases.redo, "移除参考应断线且可撤销重做")
    const videoPicker = page.locator(`#floraReferencePicker_${videoCases.videoId}`)
    await videoPicker.getByRole("button", { name: /新资产图片/ }).click()
    await videoPicker.getByRole("button", { name: /新资产图片.*已添加/ }).waitFor()
    await videoPicker.getByRole("button", { name: /关闭/ }).click()
    const video = page.locator(`.canvas-node[data-id="${videoCases.videoId}"]`)
    const input = video.locator(".flora-generator-reference-input")
    await input.setInputFiles({ name: "incompatible.mp4", mimeType: "video/mp4", buffer: Buffer.from("stub") })
    await page.waitForFunction(id => document.querySelector(`.canvas-node[data-id="${id}"]`).textContent.includes("视频和音频素材目前只能连接到"), videoCases.videoId)
    await input.setInputFiles([
      { name: "upload.png", mimeType: "image/png", buffer: pngBytes },
      { name: "upload.txt", mimeType: "text/plain", buffer: Buffer.from("参考文字上传测试") },
    ])
    await page.waitForFunction(id => !canvasReferenceUploads.has(canvasState.activeBoardId + ":" + id), videoCases.videoId, { timeout: 5000 })
    const live = await page.evaluate(id => {
      const refs = getCanvasIncomingReferenceMaterials(id)
      const sources = canvasState.connections.flatMap((edge, index) => edge.to === id ? [{
        ...edge, model: canvasVirtualStore.get(edge.from),
        path: Boolean(canvasConnectionElements.get(CanvasConnectionRules.connectionKey(edge, index))?.path?.getAttribute("d")),
      }] : [])
      return { sources, refs, status: getCanvasNodeStatusElement(getCanvasNode(id))?.textContent,
        targetMounted: Boolean(getCanvasNode(id)),
        nodes: canvasVirtualStore.values().map(node => [node.kind, node.nodeTitle, node.text]) }
    }, videoCases.videoId)
    assert.equal(live.sources.length, 6, "两张现有图、合集成员、新资产、上传图和上传文本各有一条连接：" + JSON.stringify({ ...live, sources: live.sources.length, refs: live.refs.map(item => item.name) }))
    assert.ok(live.refs.some(item => item.text === "参考文字上传测试"))
    assert.ok(live.sources.every(edge => edge.toPort === "input" && edge.path))
    assert.ok(live.sources.some(edge => edge.model.assetId === "qa-asset" && edge.model.assetCollection.members[0].src === "/output/qa-reference-asset.png"))
    assert.ok(live.sources.some(edge => edge.model.assetId === "qa-upload.png" && edge.model.imageSrc === "/output/qa-reference-upload.png"))
    assert.equal(await page.evaluate(() => canvasVirtualStore.values().some(model => model.mediaName === "incompatible.mp4")), false)
    const h3Id = await page.evaluate(() => {
      const h3 = addCanvasMinimaxH3Node({ x: 900, y: 160 }, { modelId: "h3" })
      selectCanvasNode(h3)
      return h3.dataset.id
    })
    await page.locator(`.canvas-node[data-id="${h3Id}"] .flora-generator-reference-input`).setInputFiles([
      { name: "upload.mp4", mimeType: "video/mp4", buffer: Buffer.from("mock video") },
      { name: "upload.wav", mimeType: "audio/wav", buffer: Buffer.from("mock audio") },
    ])
    await page.waitForFunction(id => !canvasReferenceUploads.has(canvasState.activeBoardId + ":" + id), h3Id, { timeout: 5000 })
    const h3Refs = await page.evaluate(id => ({
      refs: getCanvasIncomingReferenceMaterials(id).map(item => item.type),
      edges: getVisibleCanvasConnections().filter(({ item }) => item.to === id).length,
    }), h3Id)
    assert.deepEqual(h3Refs, { refs: ["video", "audio"], edges: 2 }, "H3 视频与音频上传各有独立真实连线")

    await page.evaluate(() => saveCanvasBoardNow({ recordUndo: false }))
    const dbNodes = (await rpc("exportBoardPage", { boardId, entity: "nodes" })).items
    const dbEdges = (await rpc("exportBoardPage", { boardId, entity: "connections" })).items
    assert.equal(dbEdges.length, live.sources.length + h3Refs.edges + 1, "SQLite 已写入全部真实连接")
    const saved = await page.evaluate(() => serializeCanvasBoard())
    await page.reload({ waitUntil: "networkidle" })
    await page.evaluate(async data => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-comfy", "canvas-node-asset-collection", "canvas-node-video-api", "canvas-node-minimax-h3"])
      const surface = document.createElement("div")
      surface.id = "neonEngineSurface"
      surface.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column"
      document.body.append(surface)
      const view = document.querySelector("#canvasView")
      surface.append(view)
      view.hidden = false
      view.classList.add("active")
      document.querySelector("#canvasEditorScreen").hidden = false
      document.body.classList.add("canvas-surface-open")
      await openCanvasBoardFromHistory(data)
    }, { ...saved, nodes: dbNodes, connections: dbEdges })
    const restored = await page.evaluate(ids => {
      selectCanvasNode(ensureCanvasNodeMounted(ids.target))
      renderCanvasConnections()
      return {
        list: CanvasReferenceBridge.list({ targetNodeId: ids.target }),
        edges: canvasState.connections.filter(edge => edge.from === ids.collection && edge.to === ids.target),
        hasRestoredPath: getVisibleCanvasConnections().some(({ item, key }) =>
          item.from === ids.collection && item.to === ids.target
          && canvasConnectionElements.get(key)?.path?.getAttribute("d")),
        videoCount: canvasState.connections.filter(edge => edge.to !== ids.target).length,
      }
    }, snapshot.ids)
    assert.ok(restored.list.some(item => item.sourceNodeId === snapshot.ids.collection && item.added), "保存刷新后素材仍应显示为已添加")
    assert.equal(restored.edges.length, 1, "保存刷新后真实素材连接应保留")
    assert.equal(restored.edges[0].fromPort, "member-output:qa-uploaded-member")
    assert.equal(restored.hasRestoredPath, true, "刷新后仍应绘制素材成员的 SVG 路径")
    assert.equal(restored.videoCount, 8, "刷新后八条视频参考连接均从 SQLite 恢复")
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"))
    console.log(JSON.stringify({ ok: true, wire, videoEdges: live.sources.length, savedEdges: dbEdges.length }))
  } finally {
    await browser.close()
    await new Promise(resolve => worker.terminate().then(resolve))
  }
}

run().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
