const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const port = Number(process.env.IMAGE_GENERATOR_QA_PORT || 33199)
const base = `http://127.0.0.1:${port}`
const portable = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64')
const active = fs.readFileSync(path.join(portable, '.ai-runtime/.active-runtime'), 'utf8').trim()
const runtime = process.env.AI_OS_TEST_RUNTIME
  || path.join(portable, '.ai-runtime/versions', active, 'resources/app')
const source = path.join(__dirname, 'design-sources')
const screenshots = path.resolve(__dirname, '../.design/image-generator-size-layout-20261118-run2')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-image-size-qa-'))
const data = path.join(temp, 'data')
const output = path.join(temp, 'output')
fs.mkdirSync(data)
fs.mkdirSync(output)

const server = spawn(process.execPath, ['server.js'], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    AI_OS_SKIP_ENV_FILE: '1',
    AI_OS_DATA_DIR: data,
    AI_OS_OUTPUT_DIR: output,
    AI_OS_SYSTEM_DB_FILE: path.join(data, 'system.sqlite'),
    CANVAS_DB_FILE: path.join(data, 'canvas.db'),
    SETTINGS_FILE: path.join(data, 'settings.json'),
    IMAGE_JOBS_FILE: path.join(data, 'image-jobs.json'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

function waitForServer() {
  return new Promise((resolve, reject) => {
    let log = ''
    const deadline = Date.now() + 20000
    const fail = error => { clearInterval(timer); reject(error) }
    server.stdout.on('data', chunk => { log += chunk })
    server.stderr.on('data', chunk => { log += chunk })
    const timer = setInterval(() => {
      if (server.exitCode !== null) return fail(new Error(`独立验收服务启动失败：${log}`))
      if (log.includes(`AI API console running at http://localhost:${port}`)) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() > deadline) fail(new Error(`独立验收服务启动超时：${log}`))
    }, 100)
  })
}

async function run() {
  if (String(port) === '3199') throw new Error('图片节点回归禁止连接桌面 3199 服务。')
  await waitForServer()
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const errors = []
    const screenshotFiles = []
    fs.mkdirSync(screenshots, { recursive: true })
    const capture = async name => {
      const file = path.join(screenshots, name)
      if (fs.existsSync(file)) throw new Error(`拒绝覆盖已有截图：${file}`)
      await page.screenshot({ path: file })
      screenshotFiles.push(file)
    }
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false, boards: [], projects: [], resources: [], records: [],
        models: [], providers: [], preferences: {}, settings: {},
      }),
    }))
    await page.route('**/api/image-models*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ models: [
        {
          id: 'qa-gpt-image-2',
          modelId: 'gpt-image-2',
          displayName: 'gpt-image-2 · ' + '模拟服务商名称非常长 '.repeat(5),
          providerId: 'qa-openai',
          providerName: '模拟服务商',
          capabilities: ['image.generate'],
          resolutions: ['1', '2', '4'],
          state: 'online',
          platform: 'openai',
          family: 'gpt-image-2',
        },
        {
          id: 'qa-gemini-25',
          modelId: 'gemini-2.5-flash-image',
          displayName: 'gemini-2.5-flash-image',
          providerId: 'qa-google',
          providerName: '模拟服务商',
          capabilities: ['image.generate'],
          resolutions: ['1'],
          state: 'online',
          platform: 'google',
          family: 'gemini-2.5-flash-image',
        },
      ] }),
    }))
    if (process.env.IMAGE_GENERATOR_SOURCE_OVERLAY === '1') {
      for (const [name, file] of [
        ['script.js', 'script-before-save-bridge.js'],
        ['flora-node-shell.css', 'flora-node-shell.css'],
        ['flora-generator-parameters.js', 'flora-generator-parameters.js'],
      ]) {
        await page.route(`**/${name}*`, route => route.fulfill({
          contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript',
          body: fs.readFileSync(path.join(source, file), 'utf8'),
        }))
      }
    }
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    const fixture = await page.evaluate(async () => {
      const loaded = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy'])
      if (loaded?.ok === false) throw new Error(JSON.stringify(loaded))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-image-size-layout'
      canvasState.activeBoardPersisted = false
      canvasState.isRestoring = false
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c'
      const view = document.querySelector('#canvasView')
      surface.append(view)
      document.body.append(surface)
      view.hidden = false
      view.classList.add('active')
      view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      const models = imageModelCatalog
      for (const model of models) {
        IMAGE_MODEL_PLATFORMS[model.id] = model.platform
        IMAGE_MODEL_FAMILIES[model.id] = model.family
      }
      imageModelInput.replaceChildren(...models.map(model => new Option(model.displayName, model.id)))
      imageModelInput.value = 'qa-gpt-image-2'
      if (!Array.from(imageSizeInput.options).some(option => option.value === '1024x1024')) {
        imageSizeInput.add(new Option('1:1', '1024x1024'))
      }
      imageSizeInput.value = '1024x1024'
      if (!Array.from(imageResolutionInput.options).some(option => option.value === '1')) {
        imageResolutionInput.add(new Option('1K', '1'))
      }
      imageResolutionInput.value = '1'
      window.qaImageRequests = []
      runCanvasImageEdit = async node => {
        qaImageRequests.push({
          size: getCanvasOutputSize(node),
          resolution: getCanvasImageResolution(node),
          summary: getCanvasImageRequestSummary(node),
        })
        updateCanvasGenerationResult(node, {
          src: '[image omitted]' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"/>'),
        })
        setCanvasNodeStatus(node, '完成')
      }
      showCanvasEditor()
      const node = addCanvasImageGeneratorNode({ x: 120, y: 60 }, { focus: false })
      node.dataset.qaImageGenerator = 'primary'
      selectCanvasNode(node)
      return {
        id: node.dataset.id,
        size: node.querySelector('.canvas-node-size')?.value,
        resolution: node.querySelector('.canvas-node-resolution')?.value,
        connected: node.isConnected,
      }
    })
    const node = page.locator('[data-qa-image-generator=primary]')
    const panel = node.locator('.flora-generator-composer')
    await panel.waitFor({ state: 'visible' })
    const initial = await node.evaluate(element => ({
      model: element.querySelector('.canvas-node-model').value,
      size: element.querySelector('.canvas-node-size').value,
      resolution: element.querySelector('.canvas-node-resolution').value,
      sizeOptions: Array.from(element.querySelector('.canvas-node-size').options).map(option => option.value),
    }))
    assert.ok(fixture.connected, 'Mock 生图节点挂载到画布')
    assert.equal(initial.size, '1:1', `新节点标准比例：${JSON.stringify({ fixture, initial })}`)
    assert.equal(initial.resolution, '1', `新节点标准 1K：${JSON.stringify(initial)}`)
    await capture('after-default-1440.png')

    const parameterTrigger = panel.locator('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])')
    const parameterPopover = node.locator('.flora-generator-parameter-popover:not(.flora-midjourney-settings-popover)')
    await parameterTrigger.click()
    await parameterPopover.waitFor({ state: 'visible' })
    const standardOneK = parameterPopover.locator('[data-param-kind=resolution][data-param-value="1"]')
    assert.equal(await standardOneK.isDisabled(), false, '标准 1K 不继承 Custom 不支持状态')
    assert.doesNotMatch(await parameterTrigger.innerText(), /custom 不支持/i)
    await capture('after-1k-menu-1440.png')
    await page.keyboard.press('Escape')
    await node.locator('.canvas-node-run').click()
    await page.waitForFunction(() => window.qaImageRequests?.length === 1)
    const afterGeneration = await node.evaluate(element => ({
      size: element.querySelector('.canvas-node-size').value,
      resolution: element.querySelector('.canvas-node-resolution').value,
      saved: serializeCanvasNode(element),
    }))
    const mockRequest = await page.evaluate(() => qaImageRequests[0])
    assert.deepEqual(mockRequest, { size: '1024x1024', resolution: '1k', summary: '1:1 · 1K' })
    assert.equal(afterGeneration.size, '1:1', '生成完成保持尺寸')
    assert.equal(afterGeneration.resolution, '1', '生成完成保持分辨率')
    const restored = await page.evaluate(saved => {
      const restoredNode = restoreCanvasBoardNode({ ...saved, id: 'qa-image-size-restored', x: 720 }, {}, { maxId: 0 })
      restoredNode.dataset.qaImageGenerator = 'restored'
      selectCanvasNode(restoredNode)
      return {
        size: restoredNode.querySelector('.canvas-node-size')?.value,
        resolution: restoredNode.querySelector('.canvas-node-resolution')?.value,
      }
    }, afterGeneration.saved)
    assert.deepEqual(restored, { size: '1:1', resolution: '1' }, '重新打开节点恢复标准参数')

    await node.evaluate(element => {
      const size = element.querySelector('.canvas-node-size')
      size.value = 'custom'
      size.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.evaluate(() => {
      const element = document.querySelector('[data-qa-image-generator=primary]')
      const model = element.querySelector('.canvas-node-model')
      model.value = 'qa-gemini-25'
      model.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const switched = await node.evaluate(element => ({
      model: element.querySelector('.canvas-node-model').value,
      size: element.querySelector('.canvas-node-size').value,
      resolution: element.querySelector('.canvas-node-resolution').value,
    }))
    assert.deepEqual(switched, { model: 'qa-gemini-25', size: '1:1', resolution: '1' }, '切换模型后清理不兼容状态')
    await page.evaluate(() => {
      const element = document.querySelector('[data-qa-image-generator=primary]')
      const model = element.querySelector('.canvas-node-model')
      model.value = 'qa-gpt-image-2'
      model.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const switchedBack = await node.evaluate(element => ({
      size: element.querySelector('.canvas-node-size').value,
      resolution: element.querySelector('.canvas-node-resolution').value,
    }))
    assert.deepEqual(switchedBack, { size: '1:1', resolution: '1' }, '切回原模型恢复标准参数')

    const layouts = []
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 })
      for (const scale of [0.65, 1, 1.5]) {
        layouts.push(await page.evaluate(({ width, scale }) => {
          const element = document.querySelector('[data-qa-image-generator=primary]')
          canvasState.scale = scale
          canvasState.x = width / 2 - Number(element.dataset.x) * scale - 200 * scale
          canvasState.y = 120 - Number(element.dataset.y) * scale
          applyCanvasTransformNow()
          selectCanvasNode(element)
          const visibleNode = element.getBoundingClientRect()
          canvasState.x += width / 2 - (visibleNode.left + visibleNode.width / 2)
          canvasState.y += 360 - (visibleNode.top + visibleNode.height / 2)
          applyCanvasTransformNow()
          window.FloraGeneratorComposer?.sync?.(element)
          const footer = element.querySelector('.flora-generator-footer')
          const button = footer.querySelector('.canvas-node-run')
          const rect = button.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const inViewport = rect.width > 0 && rect.height > 0
            && centerX >= 0 && centerX <= innerWidth && centerY >= 0 && centerY <= innerHeight
          return {
            width, scale,
            footerWidth: footer.clientWidth,
            footerScrollWidth: footer.scrollWidth,
            buttonRight: rect.right,
            footerRight: footer.getBoundingClientRect().right,
            inViewport,
            sendHit: !inViewport || document.elementFromPoint(centerX, centerY)?.closest('.canvas-node-run') === button,
            modelTextOverflow: getComputedStyle(element.querySelector('.image-model-trigger-copy strong')).textOverflow,
          }
        }, { width, scale }))
        await page.waitForTimeout(60)
      }
    }
    assert.ok(layouts.every(layout => layout.sendHit), `各视口发送按钮必须可命中：${JSON.stringify(layouts)}`)
    assert.ok(layouts.every(layout => layout.buttonRight <= layout.footerRight + 1), `发送按钮不能溢出底栏：${JSON.stringify(layouts)}`)
    assert.ok(layouts.every(layout => layout.footerScrollWidth <= layout.footerWidth + 1), `底栏不能横向裁切：${JSON.stringify(layouts)}`)
    assert.ok(layouts.every(layout => layout.modelTextOverflow === 'ellipsis'), '长模型名称使用省略显示')
    assert.deepEqual(errors, [])
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.evaluate(() => {
      canvasState.scale = 1; canvasState.x = 0; canvasState.y = 0; applyCanvasTransformNow()
      selectCanvasNode(document.querySelector('[data-qa-image-generator=primary]'))
    })
    await capture('after-generation-1440.png')
    console.log(JSON.stringify({ ok: true, fixture, initial, afterGeneration: { size: afterGeneration.size, resolution: afterGeneration.resolution }, mockRequest, restored, switched, layouts, screenshotFiles, errors }))
  } finally {
    await browser.close()
  }
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  if (server.exitCode === null) {
    server.kill()
    await new Promise(resolve => server.once('exit', resolve))
  }
  const target = path.resolve(temp)
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep)
    || !path.basename(target).startsWith('aios-image-size-qa-')) {
    throw new Error('验收临时数据目录不符合清理范围，已保留。')
  }
  fs.rmSync(target, { recursive: true, force: true })
})
