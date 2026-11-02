// 图片生成节点的 Qwen-image2.1 回归（浏览器内）：
// 1. 模型下拉只剩 Qwen-image2.1，换鞋 / Flux2 Klein / 抠图 / 放大 / 扩图 / 换角度 都不在列表里；
// 2. 比例与像素档进「图片参数」弹层，底排显示参数摘要；
// 3. 放大 / 扩图 / 换角度从工具栏点开参数面板，「执行」才提交；
// 4. 有参考图走图像编辑（images 非空），没有参考图也能提交（文生图）。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['canvas-comfy-node-renderer.js', 'canvas-comfy-node-renderer.js'],
  ['flora-generator-parameters.js', 'flora-generator-parameters.js'],
  ['flora-generator-composer.js', 'flora-generator-composer.js'],
  ['flora-node-shell.js', 'flora-node-shell.js'],
  ['flora-node-shell.css', 'flora-node-shell.css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    const submissions = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/qwen-image21', async (route) => {
      submissions.push(route.request().postDataJSON())
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ task_id: `qa-${submissions.length}`, mode: 'generate' }) })
    })
    await page.route('**/api/upscale/status**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id: 'qa', status: 'success', progress: 100, message: '完成', images: ['/output/qa-qwen-result.png'] }),
    }))
    await page.route('**/output/qa-qwen-*.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: served.endsWith('.css') ? 'text/css' : 'application/javascript',
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-qwen-board'
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.style.flex = '1'
      view.style.minHeight = '0'
      view.style.width = '100%'
      view.hidden = false
      view.classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      const node = window.qaComfy = createCanvasNode('comfy')
      node.dataset.qaComfy = 'primary'
      renderCanvasComfyNode(node, {})
      placeCanvasNode(node)
      node.dataset.x = '240'
      node.dataset.y = '180'
      updateCanvasNodePosition(node)
      canvasState.scale = 1
      canvasState.x = 120
      canvasState.y = 120
      applyCanvasTransformNow()
      selectCanvasNode(node)
      node.dataset.resultSrc = '/output/qa-qwen-result.png'
      window.CanvasFloraNodeShell?.syncToolbar?.(node)
    })
    await page.waitForTimeout(500)

    // 1. 模型列表只剩 Qwen-image2.1。
    const modes = await page.evaluate(() => {
      const select = window.qaComfy.querySelector('.canvas-comfy-mode')
      return { value: select?.value, options: Array.from(select?.options || []).map(option => ({ value: option.value, label: option.textContent })) }
    })
    assert.equal(modes.options.length, 1, `模型选项数量：${modes.options.length}（${JSON.stringify(modes.options)}）`)
    assert.equal(modes.options[0].value, 'qwen-image21', `模型取值：${modes.options[0].value}`)
    assert.equal(modes.options[0].label, 'Qwen-image2.1', `模型文案：${modes.options[0].label}`)
    const removed = await page.evaluate(() => Array.from(window.qaComfy.querySelectorAll('.canvas-comfy-mode option')).map(option => option.textContent))
    for (const gone of ['换鞋', 'Flux2 Klein 图片编辑', '抠图 · ComfyUI', '图片放大', '扩图 · Z-Image', 'Qwen Edit 角度切换']) {
      assert.equal(removed.includes(gone), false, `模型列表不应再出现「${gone}」`)
    }

    // 2. 操作区与参数弹层和 API 版同一套：比例短标签 + 分辨率 1K/2K/4K。
    const params = await page.evaluate(() => {
      const node = window.qaComfy
      const trigger = node.querySelector('.flora-generator-parameter-trigger')
      const labels = selector => Array.from(node.querySelectorAll(selector)).map(span => ({
        text: span.textContent.trim(),
        display: getComputedStyle(span).display,
      }))
      return {
        aspectOptions: Array.from(node.querySelectorAll('.canvas-comfy-aspect option')).map(option => option.textContent.trim()),
        resolutionOptions: Array.from(node.querySelectorAll('.canvas-comfy-megapixels option')).map(option => ({ value: option.value, label: option.textContent.trim(), title: option.dataset.reason || '' })),
        aspectValue: node.querySelector('.canvas-comfy-aspect')?.value,
        tier: node.dataset.comfyTier,
        megapixels: node.dataset.comfyMegapixels,
        caption: trigger?.querySelector('span')?.textContent || '',
        hasPopover: Boolean(node.querySelector('.flora-generator-parameter-popover')),
        fieldLabels: labels('.canvas-comfy-aspect-field > span, .canvas-comfy-megapixels-field > span'),
        referenceText: (node.querySelector('.flora-generator-reference-area')?.textContent || '').replace(/\s+/g, ' ').trim(),
        promptNote: Boolean(node.querySelector('.flora-generator-prompt-note')),
        promptPlaceholder: node.querySelector('.canvas-node-prompt')?.placeholder || '',
      }
    })
    assert.deepEqual(params.aspectOptions, ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'], `比例用短标签：${JSON.stringify(params.aspectOptions)}`)
    assert.deepEqual(params.resolutionOptions.map(option => option.label), ['1K', '2K', '4K'], `分辨率三档：${JSON.stringify(params.resolutionOptions)}`)
    assert.deepEqual(params.resolutionOptions.map(option => option.value), ['1.048576', '4.194304', '14.7456'], `1:1 的像素换算：${JSON.stringify(params.resolutionOptions)}`)
    assert.equal(params.aspectValue, '1:1 (Square)', `默认比例：${params.aspectValue}`)
    assert.equal(params.tier, '1', `默认档位：${params.tier}`)
    assert.equal(params.megapixels, '1.048576', `默认像素档：${params.megapixels}`)
    assert.equal(params.caption, '1:1 · 1K', `底排摘要与 API 版同款：${params.caption}`)
    assert.ok(params.hasPopover, '图片参数弹层应存在')
    assert.match(params.resolutionOptions[0].title, /1K · 约 1024×1024/, `1K 悬停提示要给出尺寸：${params.resolutionOptions[0].title}`)
    assert.match(params.resolutionOptions[2].title, /4K · 约 3840×3840 · 显存占用大/, `4K 悬停提示要标注显存：${params.resolutionOptions[2].title}`)

    // 2之一、尺寸换算要和工作流一致：拿一次真实出图（9:16 · 2K 请求 2.36 MP 时
    // 工作流出的是 1184×2112）反推取整方式；精确面积则落在 1152×2048 这条网格上。
    const sizeModel = await page.evaluate(() => {
      const renderer = window.CanvasComfyNodeRenderer
      return {
        observed: renderer.comfyPixelSizeForMegapixels(2.36, '9:16 (Portrait Widescreen)'),
        exact: renderer.comfyPixelSizeFor('9:16 (Portrait Widescreen)', '2'),
        square1k: renderer.comfyPixelSizeFor('1:1 (Square)', '1'),
        wide2k: renderer.comfyPixelSizeFor('16:9 (Widescreen)', '2'),
        areas: {
          nineSixteen2k: renderer.comfyMegapixelsFor('9:16 (Portrait Widescreen)', '2'),
          square4k: renderer.comfyMegapixelsFor('1:1 (Square)', '4'),
        },
      }
    })
    assert.equal(sizeModel.observed, '1184×2112', `尺寸算法要能复现真实出图：${JSON.stringify(sizeModel)}`)
    assert.equal(sizeModel.exact, '1152×2048', `精确面积应落在 2K 网格：${JSON.stringify(sizeModel)}`)
    assert.equal(sizeModel.square1k, '1024×1024', `1:1 的 1K：${JSON.stringify(sizeModel)}`)
    assert.equal(sizeModel.wide2k, '2048×1152', `16:9 的 2K：${JSON.stringify(sizeModel)}`)
    assert.equal(sizeModel.areas.nineSixteen2k, 2.359296, `9:16 的 2K 名义面积：${JSON.stringify(sizeModel.areas)}`)
    assert.equal(sizeModel.areas.square4k, 14.7456, `1:1 的 4K 名义面积：${JSON.stringify(sizeModel.areas)}`)
    assert.deepEqual(params.fieldLabels.map(label => label.display), ['none', 'none'], `原生「比例/分辨率」标签不该露出来：${JSON.stringify(params.fieldLabels)}`)
    assert.equal(params.promptNote, false, '操作区不再有解释性文案')
    assert.equal(params.promptPlaceholder, '输入本次生成要求，可连接文字或图片作为参考素材', `提示词占位符与 API 版一致：${params.promptPlaceholder}`)
    assert.equal(params.referenceText, '', `参考行只留 +，不该有摘要文字：${JSON.stringify(params.referenceText)}`)

    // 2之二、换比例要按比例重算像素档；换档位要写回档位与像素档。
    const tiers = await page.evaluate(async () => {
      const node = window.qaComfy
      const aspect = node.querySelector('.canvas-comfy-aspect')
      const resolution = node.querySelector('.canvas-comfy-megapixels')
      const caption = () => node.querySelector('.flora-generator-parameter-trigger span')?.textContent || ''
      aspect.value = '16:9 (Widescreen)'
      aspect.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 60))
      const wide = {
        values: Array.from(resolution.options).map(option => option.value),
        labels: Array.from(resolution.options).map(option => option.textContent.trim()),
        tier: node.dataset.comfyTier,
        megapixels: node.dataset.comfyMegapixels,
        caption: caption(),
      }
      node.querySelector('.flora-generator-parameter-trigger').click()
      await new Promise(resolve => setTimeout(resolve, 80))
      node.querySelector('[data-param-kind="resolution"][data-param-value="8.2944"]').click()
      await new Promise(resolve => setTimeout(resolve, 80))
      const picked = { tier: node.dataset.comfyTier, megapixels: node.dataset.comfyMegapixels, caption: caption() }
      node.querySelector('.flora-generator-parameter-close')?.click()
      return { wide, picked }
    })
    assert.deepEqual(tiers.wide.labels, ['1K', '2K', '4K'], `16:9 仍是三档：${JSON.stringify(tiers.wide)}`)
    assert.deepEqual(tiers.wide.values, ['0.589824', '2.359296', '8.2944'], `16:9 的像素换算：${JSON.stringify(tiers.wide)}`)
    assert.equal(tiers.wide.tier, '1', '换比例不该把档位换掉')
    assert.equal(tiers.wide.caption, '16:9 · 1K', `摘要跟着比例走：${tiers.wide.caption}`)
    assert.equal(tiers.picked.tier, '4', `点 4K 应写回档位：${JSON.stringify(tiers.picked)}`)
    assert.equal(tiers.picked.megapixels, '8.2944', `点 4K 应写回像素档：${JSON.stringify(tiers.picked)}`)
    assert.equal(tiers.picked.caption, '16:9 · 4K', `摘要跟着档位走：${tiers.picked.caption}`)
    // 参数弹层的成品照：上面比例、下面分辨率，和 API 版同一套排版。
    await page.evaluate(() => {
      const node = window.qaComfy
      if (!node.querySelector('.flora-generator-parameter-popover')?.matches(':popover-open')) {
        node.querySelector('.flora-generator-parameter-trigger').click()
      }
    })
    await page.waitForTimeout(300)
    const popoverBox = await page.evaluate(() => {
      const box = document.querySelector('.flora-generator-parameter-popover:not(.flora-midjourney-settings-popover)')?.getBoundingClientRect()
      return box && { x: Math.max(0, Math.round(box.x - 12)), y: Math.max(0, Math.round(box.y - 12)), width: Math.round(box.width + 24), height: Math.round(box.height + 24) }
    })
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    if (popoverBox) await page.screenshot({ path: path.join(__dirname, 'acceptance/qwen-image21-parameters.png'), clip: popoverBox })
    await page.evaluate(() => window.qaComfy.querySelector('.flora-generator-parameter-close')?.click())
    await page.waitForTimeout(150)

    // 2之三、档位与像素档跟着节点存档，重新渲染后还是同一个刻度。
    const persisted = await page.evaluate(() => {
      const model = serializeCanvasNode(window.qaComfy)
      const clone = window.qaComfyClone = createCanvasNode('comfy')
      renderCanvasComfyNode(clone, { mode: model.comfyMode, aspectRatio: model.comfyAspectRatio, megapixels: model.comfyMegapixels, tier: model.comfyTier })
      placeCanvasNode(clone)
      selectCanvasNode(window.qaComfy)
      return {
        savedTier: model.comfyTier,
        savedMegapixels: model.comfyMegapixels,
        cloneTier: clone.dataset.comfyTier,
        cloneMegapixels: clone.dataset.comfyMegapixels,
        cloneCaption: clone.querySelector('.flora-generator-parameter-trigger span')?.textContent || '',
        cloneValues: Array.from(clone.querySelectorAll('.canvas-comfy-megapixels option')).map(option => option.value),
      }
    })
    assert.equal(persisted.savedTier, '4', `序列化要带档位：${JSON.stringify(persisted)}`)
    assert.equal(persisted.savedMegapixels, '8.2944', `序列化要带像素档：${JSON.stringify(persisted)}`)
    assert.equal(persisted.cloneTier, '4', `恢复后档位不变：${JSON.stringify(persisted)}`)
    assert.equal(persisted.cloneMegapixels, '8.2944', `恢复后像素档不变：${JSON.stringify(persisted)}`)
    assert.equal(persisted.cloneCaption, '16:9 · 4K', `恢复后摘要不变：${persisted.cloneCaption}`)

    // 2之四、老节点只存像素档时按长边就近归档，不跳档。
    const legacy = await page.evaluate(() => {
      const read = (options) => {
        const clone = createCanvasNode('comfy')
        renderCanvasComfyNode(clone, options)
        const result = { tier: clone.dataset.comfyTier, megapixels: clone.dataset.comfyMegapixels }
        deleteCanvasNodes([clone])
        return result
      }
      deleteCanvasNodes([window.qaComfyClone])
      return {
        wideOld2: read({ aspectRatio: '16:9 (Widescreen)', megapixels: '2.36' }),
        squareOld1: read({ aspectRatio: '1:1 (Square)', megapixels: '1' }),
        squareOld15: read({ aspectRatio: '1:1 (Square)', megapixels: '1.5' }),
        squareOld4: read({ aspectRatio: '1:1 (Square)', megapixels: '4' }),
      }
    })
    assert.deepEqual(legacy.wideOld2, { tier: '2', megapixels: '2.359296' }, `16:9 的 2.36 MP 归到 2K：${JSON.stringify(legacy)}`)
    assert.deepEqual(legacy.squareOld1, { tier: '1', megapixels: '1.048576' }, `1:1 的 1 MP 归到 1K：${JSON.stringify(legacy)}`)
    assert.deepEqual(legacy.squareOld15, { tier: '1', megapixels: '1.048576' }, `1:1 的 1.5 MP 归到 1K：${JSON.stringify(legacy)}`)
    assert.deepEqual(legacy.squareOld4, { tier: '2', megapixels: '4.194304' }, `1:1 的 4 MP 归到 2K：${JSON.stringify(legacy)}`)

    // 3. 工具栏三个工具各自打开自己的界面：放大是节点参数面板，扩图改走节点内联编辑器，
    //    换角度走角度对话框（这两处是既有的既定行为，不是这次改的）。
    const panels = await page.evaluate(async () => {
      const node = window.qaComfy
      const result = {}
      const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      node.querySelector('[data-flora-action="upscale"]').click()
      await settle()
      const upscalePanel = node.querySelector('.flora-node-tool-panel[data-flora-tool="upscale"]')
      result.upscale = {
        open: Boolean(upscalePanel),
        expanded: node.querySelector('[data-flora-action="upscale"]').getAttribute('aria-expanded'),
        hasUpscaleSelect: Boolean(upscalePanel?.querySelector('select')),
        submitLabel: upscalePanel?.querySelector('.flora-node-tool-panel-submit')?.textContent || '',
      }
      node.querySelector('[data-flora-action="outpaint"]').click()
      await settle()
      const outpaint = document.querySelector('#canvasInlineOutpaint')
      result.outpaint = {
        open: Boolean(outpaint),
        insideNode: Boolean(outpaint?.closest('.canvas-node')) && outpaint?.closest('.canvas-node') === node,
        handles: outpaint?.querySelectorAll('[data-inline-outpaint-side]').length || 0,
        submitLabel: outpaint?.querySelector('[data-inline-outpaint-submit]')?.textContent || '',
      }
      document.querySelector('#canvasInlineOutpaint [data-inline-outpaint-close]')?.click()
      await settle()
      node.querySelector('[data-flora-action="angle"]').click()
      await settle()
      const angle = document.querySelector('.canvas-angle-dialog, #canvasAngleDialog')
      result.angle = {
        open: Boolean(angle),
        presets: angle?.querySelectorAll('[data-angle-preset]').length || 0,
        submitLabel: angle?.querySelector('[data-angle-submit]')?.textContent || '',
      }
      return result
    })
    assert.equal(panels.upscale.open, true, `放大应打开参数面板：${JSON.stringify(panels)}`)
    assert.equal(panels.upscale.expanded, 'true', '放大按钮要标记 aria-expanded')
    assert.equal(panels.upscale.hasUpscaleSelect, true, '放大面板要有目标长边选择')
    assert.equal(panels.upscale.submitLabel, '执行', '放大面板要有执行按钮')
    assert.equal(panels.outpaint.open, true, `扩图应打开节点内联编辑器：${JSON.stringify(panels)}`)
    assert.equal(panels.outpaint.insideNode, true, '内联扩图编辑器挂在原节点里')
    assert.equal(panels.outpaint.handles, 8, `扩图编辑器要有 8 个手柄：${panels.outpaint.handles}`)
    assert.equal(panels.outpaint.submitLabel, '执行', '扩图编辑器要有执行按钮')
    assert.equal(panels.angle.open, true, `换角度应打开角度对话框：${JSON.stringify(panels)}`)
    assert.ok(panels.angle.presets >= 8, `角度对话框要有方位预设：${panels.angle.presets}`)
    assert.equal(panels.angle.submitLabel, '生成', '角度对话框要有生成按钮')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/qwen-image21-tool-panel.png') })

    // Esc 收起面板。
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const afterEscape = await page.evaluate(() => Boolean(document.querySelector('.flora-node-tool-panel')))
    assert.equal(afterEscape, false, 'Esc 应收起工具参数面板')

    // 4. 没有参考图也能提交：文生图。
    await page.evaluate(() => {
      const node = window.qaComfy
      node.dataset.canvasGenerationPrompt = '一只坐在窗台上的猫'
      node.dataset.comfyPrompt = '一只坐在窗台上的猫'
      node.querySelector('.canvas-comfy-run').click()
    })
    await page.waitForFunction(() => window.qaComfy.dataset.comfyPrompt === '一只坐在窗台上的猫')
    await page.waitForTimeout(600)
    assert.equal(submissions.length, 1, `提交次数：${submissions.length}`)
    assert.deepEqual(submissions[0].images, [], '没有参考图时 images 应为空数组')
    assert.equal(submissions[0].prompt, '一只坐在窗台上的猫', `提示词：${submissions[0].prompt}`)
    assert.equal(submissions[0].aspect_ratio, '16:9 (Widescreen)', `比例：${submissions[0].aspect_ratio}`)
    assert.equal(submissions[0].megapixels, 8.2944, `4K 的像素换算：${submissions[0].megapixels}`)

    // 5. 连上参考图后走图像编辑：images 带素材。
    await page.evaluate(() => {
      const ref = window.qaRef = addCanvasImage('/output/qa-qwen-ref.png', '参考图.png', { x: -420, y: 180 })
      connectCanvasNodes(ref.dataset.id, window.qaComfy.dataset.id)
      updateCanvasNodeRefs(window.qaComfy)
      refreshCanvasConnectedNodes(window.qaComfy.dataset.id)
      window.qaComfy.querySelector('.canvas-comfy-run').click()
    })
    await page.waitForTimeout(900)
    assert.equal(submissions.length, 2, `带参考图的提交次数：${submissions.length}`)
    assert.equal(Array.isArray(submissions[1].images) && submissions[1].images.length, 1, `参考图数量：${JSON.stringify(submissions[1].images)}`)
    assert.equal(submissions[1].names?.[0], '参考图.png', `参考图名称：${submissions[1].names?.[0]}`)

    // 6. 没有 pageerror。
    assert.deepEqual(errors, [], `页面错误：${JSON.stringify(errors)}`)

    // 7. 出了图的 ComfyUI 节点就是一张图片素材：能连到另一个生成节点当参考图。
    //    （用户反馈「生成的图连接不到另一个生成节点」：原因是它一直按「生成节点」上报输出，
    //    而生成节点只允许连到素材合集，连线被规则挡下来了。）
    const wiring = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 200))
      const readStatus = () => (document.querySelector('.canvas-status span:last-child')?.textContent || '').trim()
      const comfy = window.qaComfy
      comfy.dataset.resultSrc = '/output/qa-qwen-result.png'
      comfy.dataset.imageName = '生成结果.png'
      updateCanvasNodeRefs(comfy)
      const target = window.qaWiringTarget = addCanvasImageGeneratorNode({ x: 1200, y: 700 }, { imageName: '图片生成 5' })
      const own = getCanvasNodeOutput(comfy)
      const ownCompatibility = getCanvasConnectionCompatibility(comfy, target, own, { sourcePort: 'output' })
      connectCanvasNodes(comfy.dataset.id, target.dataset.id, 'input', 'output')
      await settle()
      const connected = canvasState.connections.some((item) => item.from === comfy.dataset.id && item.to === target.dataset.id)
      const status = ownCompatibility?.message || ''
      const refs = getCanvasIncomingRefs(target.dataset.id).map((item) => item.name)
      selectCanvasNode(target)
      await settle()
      const thumbs = target.querySelectorAll('.canvas-ref-thumb').length
      deleteCanvasNodes([target])
      // 空 ComfyUI 节点（还没出图）仍然按「生成节点」上报，连生成节点照样被规则挡住。
      const empty = window.qaWiringEmpty = createCanvasNode('comfy')
      renderCanvasComfyNode(empty, {})
      placeCanvasNode(empty)
      const emptyOutput = getCanvasNodeOutput(empty)
      const other = window.qaWiringOther = addCanvasImageGeneratorNode({ x: 1600, y: 1200 }, { imageName: '图片生成 9' })
      const emptyCompatibility = getCanvasConnectionCompatibility(empty, other, emptyOutput, { sourcePort: 'output' })
      connectCanvasNodes(empty.dataset.id, other.dataset.id, 'input', 'output')
      await settle()
      const emptyStatus = emptyCompatibility?.message || ''
      const emptyConnected = canvasState.connections.some((item) => item.from === empty.dataset.id && item.to === other.dataset.id)
      // 离屏（虚拟节点）走同一口径：有结果就提供图片，没结果才是生成节点。
      const virtual = {
        withResult: getCanvasVirtualNodeOutput({ kind: 'comfy', resultSrc: '/output/qa-qwen-result.png', imageName: '生成结果.png' }),
        withoutResult: getCanvasVirtualNodeOutput({ kind: 'comfy' }),
      }
      deleteCanvasNodes([other, empty])
      return {
        own: own && { type: own.type, url: own.url, name: own.name },
        connected,
        status,
        refs,
        thumbs,
        emptyOutput: emptyOutput && { type: emptyOutput.type, name: emptyOutput.name },
        ownCompatibility: ownCompatibility && { ok: ownCompatibility.ok, message: ownCompatibility.message },
        emptyCompatibility: emptyCompatibility && { ok: emptyCompatibility.ok, message: emptyCompatibility.message },
        emptyConnected,
        emptyStatus,
        virtual: {
          withResult: virtual.withResult && { type: virtual.withResult.type, url: virtual.withResult.url, name: virtual.withResult.name },
          withoutResult: virtual.withoutResult && virtual.withoutResult.type,
        },
      }
    })
    assert.equal(wiring.own.type, 'image', `出图的 ComfyUI 节点应按图片上报：${JSON.stringify(wiring)}`)
    assert.equal(wiring.own.url, '/output/qa-qwen-result.png', `输出应带结果地址：${JSON.stringify(wiring.own)}`)
    assert.equal(wiring.own.name, '生成结果.png', `输出应带节点名：${JSON.stringify(wiring.own)}`)
    assert.equal(wiring.connected, true, `生成的图应能连到另一个生成节点：${JSON.stringify(wiring)}`)
    assert.equal(wiring.ownCompatibility.ok, true, `连生成节点的兼容性判断应通过：${JSON.stringify(wiring.ownCompatibility)}`)
    assert.match(wiring.status, /图片会作为生成参考图/, `连线提示应是图片参考：${wiring.status}`)
    assert.deepEqual(wiring.refs, ['生成结果.png'], `目标节点应拿到这张图作为参考：${JSON.stringify(wiring.refs)}`)
    assert.equal(wiring.thumbs, 1, `参考带应显示一张缩略图：${wiring.thumbs}`)
    assert.equal(wiring.emptyOutput.type, 'generator', `还没出图的 ComfyUI 节点仍按生成节点上报：${JSON.stringify(wiring)}`)
    assert.equal(wiring.emptyCompatibility.ok, false, `空节点连生成节点应被规则挡住：${JSON.stringify(wiring.emptyCompatibility)}`)
    assert.equal(wiring.emptyConnected, false, `空节点连生成节点仍应被规则挡住：${JSON.stringify(wiring)}`)
    assert.match(wiring.emptyStatus, /生成节点只能连接到素材合集/, `空节点的提示保持原样：${wiring.emptyStatus}`)
    assert.equal(wiring.virtual.withResult.type, 'image', `离屏的 ComfyUI 节点也要按结果提供图片：${JSON.stringify(wiring.virtual)}`)
    assert.equal(wiring.virtual.withResult.url, '/output/qa-qwen-result.png', `离屏输出应带结果地址：${JSON.stringify(wiring.virtual)}`)
    assert.equal(wiring.virtual.withoutResult, 'generator', `离屏且无结果时仍是生成节点：${JSON.stringify(wiring.virtual)}`)
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/qwen-image21-wiring.png') })

    console.log(JSON.stringify({
      ok: true,
      modelOptions: modes.options,
      caption: params.caption,
      panels,
      wiring,
      submissions: submissions.map(item => ({ images: item.images.length, prompt: item.prompt, aspect_ratio: item.aspect_ratio, megapixels: item.megapixels })),
    }, null, 2))
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
