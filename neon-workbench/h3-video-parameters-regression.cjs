const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js'],
  ['flora-generator-composer.js', 'flora-generator-composer.js'],
  ['flora-generator-parameters.js', 'flora-generator-parameters.js'],
  ['canvas-h3-node-renderer.js', 'canvas-h3-node-renderer.js'],
  ['flora-node-shell.js', 'flora-node-shell.js'],
  ['flora-node-shell.css', 'flora-node-shell.css'],
]

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    const submissions = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/minimax-h3-video', route => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'H3测试接口暂不可用' }) })
    })
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
      canvasState.activeBoardId = 'qa-h3-parameters-board'
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
      const node = window.qaH3 = addCanvasVideoGeneratorNode({ x: 200, y: 80 }, { engine: 'comfyui' })
      node.dataset.qaH3 = 'primary'
      canvasState.scale = 1
      canvasState.x = (innerWidth - node.offsetWidth) / 2 - Number(node.dataset.x)
      canvasState.y = 120 - Number(node.dataset.y)
      applyCanvasTransformNow()
      selectCanvasNode(node)
    })
    await page.waitForTimeout(600)

    const footer = await page.evaluate(() => {
      const node = window.qaH3
      const panel = node.querySelector('.flora-generator-composer')
      const settings = panel.querySelector('.flora-generator-settings')
      const trigger = panel.querySelector('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])')
      const visible = element => {
        if (!element) return false
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      }
      const modelField = settings.querySelector('.canvas-h3-field[data-h3-param="model"]')
      return {
        settingsText: (settings.textContent || '').trim().replace(/\s+/g, ' '),
        triggerText: (trigger?.textContent || '').trim(),
        triggerVisible: visible(trigger),
        triggerInsideModelField: Boolean(modelField?.contains(trigger)),
        modelFieldExists: Boolean(modelField),
        modelFieldVisible: visible(modelField),
        modelSelectVisible: visible(modelField?.querySelector('select')),
        modelValue: modelField?.querySelector('select')?.value || '',
        modelCaptionVisible: visible(modelField?.querySelector('span')),
        h3ParamKeys: Array.from(settings.querySelectorAll('[data-h3-param]')).map(element => element.dataset.h3Param),
      }
    })
    assert.equal(footer.triggerVisible, true, '视频参数入口应可见')
    assert.equal(footer.triggerInsideModelField, false, '视频参数入口不能放进模型项里')
    assert.equal(footer.modelFieldExists, true, '模型应作为独立一项保留')
    assert.equal(footer.modelFieldVisible, true, '模型项应在底排可见')
    assert.equal(footer.modelCaptionVisible, false, '模型项不显示「模型」小标题，与其它节点一致')
    assert.equal(footer.modelValue, 'minimax-h3', '模型项保留真实取值')
    assert.ok(!footer.triggerText.includes('MiniMax H3'), `视频参数入口不再使用模型名：${footer.triggerText}`)
    assert.match(footer.triggerText, /16:9/, `视频参数入口显示参数摘要：${footer.triggerText}`)

    const popup = await page.evaluate(() => {
      const node = window.qaH3
      const panel = node.querySelector('.flora-generator-composer')
      const trigger = panel.querySelector('.flora-generator-parameter-trigger:not([data-flora-midjourney-settings])')
      trigger.click()
      return true
    })
    assert.equal(popup, true)
    await page.waitForTimeout(300)
    const popoverState = await page.evaluate(() => {
      const node = window.qaH3
      const popover = node.querySelector('.flora-generator-parameter-popover:not(.flora-midjourney-settings-popover)')
      const visible = element => {
        if (!element) return false
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      }
      const fields = Array.from(popover.querySelectorAll('.canvas-h3-field'))
      const visibleFields = fields.filter(visible)
      const texts = []
      for (const element of popover.querySelectorAll('*')) {
        if (!visible(element)) continue
        const own = Array.from(element.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent.trim()).join(' ').trim()
        if (own) texts.push(own)
      }
      return {
        open: popover.matches(':popover-open'),
        visibleCaptions: visibleFields.map(field => (field.querySelector('span')?.textContent || '').trim()),
        hiddenParams: fields.filter(field => !visible(field)).map(field => field.dataset.h3Param),
        allParams: fields.map(field => field.dataset.h3Param),
        visibleTexts: texts,
        title: (popover.querySelector('.flora-generator-parameter-header strong')?.textContent || '').trim(),
        resolutionHint: (popover.querySelector('.canvas-h3-resolution-hint')?.textContent || '').trim(),
      }
    })
    assert.equal(popoverState.open, true, '视频参数弹层应打开')
    assert.equal(popoverState.title, '视频参数', '弹层标题保持「视频参数」')
    assert.deepEqual(popoverState.visibleCaptions, ['画幅', '分辨率', '采样质量', '时长（秒）'],
      `弹层只保留视频参数：${JSON.stringify(popoverState.visibleCaptions)}`)
    for (const banned of ['模型', '种子', '参考图']) {
      assert.ok(popoverState.visibleTexts.every(text => !text.includes(banned)), `弹层不应出现「${banned}」：${JSON.stringify(popoverState.visibleTexts)}`)
    }
    assert.deepEqual(popoverState.hiddenParams.sort(), ['refImageSize', 'seed'], `参考图与种子保留字段但隐藏：${JSON.stringify(popoverState.hiddenParams)}`)
    assert.match(popoverState.resolutionHint, /预计输出/, '分辨率保留预计输出读数')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/h3-video-parameters-popover.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)

    // 已保存的具体种子不得在恢复后继续生效：走真实序列化 + 恢复流程。
    const seedState = await page.evaluate(() => {
      const node = window.qaH3
      node.dataset.minimaxH3Seed = '12345'
      node.querySelector('[data-h3-param="seed"] input').value = '12345'
      const saved = serializeCanvasNode(node)
      const restored = restoreCanvasBoardNode({ ...saved, id: 'qa-restored-h3' }, {}, { maxId: 0 })
      return {
        savedSeed: saved.minimaxH3Seed,
        dataset: restored.dataset.minimaxH3Seed,
        input: restored.querySelector('[data-h3-param="seed"] input')?.value,
        refImageSize: restored.dataset.minimaxH3RefImageSize,
        refImageSizeInput: restored.querySelector('[data-h3-param="refImageSize"] select')?.value,
        modelFieldVisible: getComputedStyle(restored.querySelector('.canvas-h3-field[data-h3-param="model"]')).display !== 'none',
      }
    })
    assert.equal(String(seedState.savedSeed), '12345', '序列化仍保留历史种子值以便追溯')
    assert.equal(seedState.dataset, '', '重新挂载后种子一律回到随机')
    assert.equal(seedState.input, '', '隐藏的种子输入同步清空')
    assert.equal(seedState.refImageSize, 'match', '参考图保持默认「匹配输出」')
    assert.equal(seedState.refImageSizeInput, 'match')

    await page.evaluate(() => {
      const node = window.qaH3
      node.querySelector('.canvas-h3-prompt').value = '测试：种子必须随机'
      node.dataset.minimaxH3Prompt = '测试：种子必须随机'
    })
    await page.locator('[data-qa-h3="primary"] .canvas-node-run').click()
    await page.waitForFunction(() => document.querySelector('[data-qa-h3="primary"] .flora-generator-status')?.textContent?.includes('H3测试接口暂不可用'), null, { timeout: 15000 })
    assert.equal(submissions.length, 1, 'H3 只提交一次')
    assert.equal(submissions[0].seed, '', `提交请求的种子必须为空（随机）：${JSON.stringify(submissions[0].seed)}`)
    assert.equal(submissions[0].ref_image_size, 'match', '提交请求沿用默认参考图设置')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/h3-video-parameters.png') })
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    console.log(JSON.stringify({ ok: true, footer, popover: popoverState, seedState, submitted: { seed: submissions[0].seed, refImageSize: submissions[0].ref_image_size } }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
