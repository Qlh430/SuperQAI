const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    const submissions = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route('**/api/upload-image', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: '/output/qa-h3-ref.png' }) }))
    await page.route('**/api/upload-media', route => {
      const type = route.request().headers()['content-type'] || ''
      const isVideo = /^video\//.test(type)
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(isVideo
          ? { url: '/output/qa-h3-ref.mp4', filename: 'clip.mp4', mimeType: 'video/mp4' }
          : { url: '/output/qa-h3-ref.wav', filename: 'voice.wav', mimeType: 'audio/wav' }),
      })
    })
    await page.route('**/output/qa-h3-ref.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG, 'base64') }))
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
      canvasState.activeBoardId = 'qa-h3-modes-board'
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
    await page.waitForTimeout(500)

    // 三种素材通过节点自带的槽位上传，和真实使用路径一致。
    const h3 = page.locator('[data-qa-h3="primary"]')
    const slots = h3.locator('.canvas-h3-reference-collection input[type=file]')
    await slots.nth(0).setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
    await page.waitForFunction(() => canvasState.connections.filter(item => item.to === window.qaH3.dataset.id).length === 1)
    await slots.nth(1).setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('00000018667479706d703432', 'hex') })
    await page.waitForFunction(() => canvasState.connections.filter(item => item.to === window.qaH3.dataset.id).length === 2)
    await slots.nth(2).setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: Buffer.from('52494646', 'hex') })
    await page.waitForFunction(() => canvasState.connections.filter(item => item.to === window.qaH3.dataset.id).length === 3)
    await page.waitForTimeout(300)

    // 一、提示词里输入 @ 必须在操作区弹出素材列表。
    const prompt = page.locator('[data-qa-h3="primary"] .flora-generator-prompt-area .canvas-h3-prompt')
    await prompt.click()
    await page.keyboard.type('@')
    await page.waitForSelector('.flora-generator-prompt-area .canvas-h3-mention-menu', { state: 'visible', timeout: 5000 })
    const menu = await page.evaluate(() => {
      const area = document.querySelector('[data-qa-h3="primary"] .flora-generator-prompt-area')
      const menu = area.querySelector('.canvas-h3-mention-menu')
      const box = menu.getBoundingClientRect()
      const areaBox = area.getBoundingClientRect()
      return {
        insidePromptArea: true,
        rect: { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) },
        areaRect: { left: Math.round(areaBox.left), top: Math.round(areaBox.top), width: Math.round(areaBox.width) },
        groups: Array.from(menu.querySelectorAll('.canvas-h3-mention-group')).map(item => item.textContent.trim()),
        options: Array.from(menu.querySelectorAll('.canvas-h3-mention-option')).map(option => ({
          label: option.querySelector('b')?.textContent?.trim() || '',
          name: option.querySelector('small')?.textContent?.trim() || '',
          disabled: option.getAttribute('aria-disabled'),
          hasThumb: Boolean(option.querySelector('img')),
        })),
        ariaExpanded: document.querySelector('[data-qa-h3="primary"] .canvas-h3-prompt').getAttribute('aria-expanded'),
      }
    })
    assert.ok(menu.rect.width > 100 && menu.rect.height > 40, `素材列表应可见：${JSON.stringify(menu.rect)}`)
    assert.deepEqual(menu.groups, ['图片', '视频', '音频'], `素材列表按类型分组：${JSON.stringify(menu.groups)}`)
    assert.deepEqual(menu.options.map(option => option.label), ['<Picture 1>', '<Video 1>', '<Audio 1>'],
      `列表显示模型可读编号：${JSON.stringify(menu.options)}`)
    assert.ok(menu.options.every(option => option.disabled === 'false'), '上传完成后选项都应可选')
    assert.equal(menu.options[0].hasThumb, true, '图片选项显示缩略图')
    assert.equal(menu.ariaExpanded, 'true', '输入框 aria-expanded 同步')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/h3-mention-menu.png') })

    // 默认高亮第一项，回车插入模型可读标记并关闭列表。
    const initialActive = await page.evaluate(() => document.querySelector('.flora-generator-prompt-area .canvas-h3-mention-option.is-active b')?.textContent?.trim() || '')
    assert.equal(initialActive, '<Picture 1>', `默认高亮第一项：${initialActive}`)
    await page.keyboard.press('ArrowDown')
    const movedActive = await page.evaluate(() => document.querySelector('.flora-generator-prompt-area .canvas-h3-mention-option.is-active b')?.textContent?.trim() || '')
    assert.equal(movedActive, '<Video 1>', `方向键移动高亮：${movedActive}`)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const inserted = await page.evaluate(() => {
      const textarea = document.querySelector('[data-qa-h3="primary"] .canvas-h3-prompt')
      return {
        value: textarea.value,
        menuClosed: !document.querySelector('[data-qa-h3="primary"] .canvas-h3-mention-menu'),
        ariaExpanded: textarea.getAttribute('aria-expanded'),
      }
    })
    assert.match(inserted.value, /<Picture 1>/, `插入模型可读标记：${inserted.value}`)
    assert.equal(inserted.menuClosed, true, '选择后关闭列表')
    assert.equal(inserted.ariaExpanded, 'false')

    await prompt.click()
    await prompt.fill('')
    await page.keyboard.type('@')
    await page.waitForSelector('.flora-generator-prompt-area .canvas-h3-mention-menu', { state: 'visible' })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    assert.equal(await page.locator('[data-qa-h3="primary"] .canvas-h3-mention-menu').count(), 0, 'Esc 关闭素材列表')

    // 二、生成方式选项排在参数区之后、发送按钮之前，并切换工作流。
    const modeUi = await page.evaluate(() => {
      const node = window.qaH3
      const panel = node.querySelector('.flora-generator-composer')
      const actions = panel.querySelector('.flora-generator-actions')
      const switcher = panel.querySelector('.canvas-h3-mode-switch')
      const run = panel.querySelector('.canvas-node-run')
      const settings = panel.querySelector('.flora-generator-settings')
      const box = switcher.getBoundingClientRect()
      const runBox = run.getBoundingClientRect()
      const settingsBox = settings.getBoundingClientRect()
      const panelBox = panel.getBoundingClientRect()
      return {
        labels: Array.from(switcher.querySelectorAll('.canvas-h3-mode')).map(button => button.textContent.trim()),
        active: switcher.querySelector('.canvas-h3-mode.is-active')?.textContent?.trim() || '',
        dataset: node.dataset.minimaxH3Mode,
        insideActions: actions.contains(switcher),
        beforeRun: box.right <= runBox.left + 1 || box.bottom <= runBox.top + 1,
        afterSettings: box.left >= settingsBox.right - 1 || box.top >= settingsBox.bottom - 1,
        // 底排参数与生成方式必须同处一行：靠加宽操作区实现，而不是折行。
        modeRowTop: Math.round(box.top),
        settingsRowTop: Math.round(settingsBox.top),
        panelWidth: Math.round(panelBox.width),
        overflowX: document.documentElement.scrollWidth - innerWidth,
      }
    })
    assert.deepEqual(modeUi.labels, ['全能参考', '文生视频', '首帧', '首尾帧'], `四种生成方式：${JSON.stringify(modeUi.labels)}`)
    assert.equal(modeUi.active, '全能参考', '默认全能参考')
    assert.equal(modeUi.dataset, 'reference')
    assert.equal(modeUi.insideActions, true, '选项位于发送按钮所在区')
    assert.equal(modeUi.beforeRun, true, '选项排在发送按钮之前')

    // 参数区与生成方式要在同一行：MiniMax H3 操作区加宽到 960。
    const footerRow = await page.evaluate(() => {
      const node = window.qaH3
      const panel = node.querySelector('.flora-generator-composer')
      const settings = panel.querySelector('.flora-generator-settings').getBoundingClientRect()
      const switcher = panel.querySelector('.canvas-h3-mode-switch').getBoundingClientRect()
      const run = panel.querySelector('.canvas-node-run').getBoundingClientRect()
      return {
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        sameRow: Math.abs((settings.top + settings.height / 2) - (switcher.top + switcher.height / 2)) <= 6,
        afterSettings: switcher.left >= settings.right - 1,
        beforeRun: switcher.right <= run.left + 1 || switcher.bottom <= run.top + 1,
      }
    })
    assert.ok(footerRow.panelWidth > 900 && footerRow.panelWidth <= 962, `MiniMax H3 操作区加宽到 960：${footerRow.panelWidth}`)
    assert.equal(footerRow.sameRow, true, '参数区与生成方式排在同一行')
    assert.equal(footerRow.afterSettings, true, '生成方式排在参数区之后')
    assert.equal(footerRow.beforeRun, true, '生成方式排在发送按钮之前')
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/h3-footer-single-row.png') })
    assert.ok(Math.abs(modeUi.modeRowTop - modeUi.settingsRowTop) <= 2, `底排参数与生成方式同处一行：${JSON.stringify(modeUi)}`)
    assert.ok(modeUi.panelWidth >= 900, `操作区加宽到容纳单行底排：${modeUi.panelWidth}`)
    assert.ok(modeUi.overflowX <= 1, `桌面宽度无横向溢出：${modeUi.overflowX}`)

    // 窄一些的桌面宽度（1100）也必须保持一行；手机宽度只要求不横向溢出。
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.waitForTimeout(400)
    const narrowRow = await page.evaluate(() => {
      const node = window.qaH3
      const panel = node.querySelector('.flora-generator-composer')
      const settings = panel.querySelector('.flora-generator-settings').getBoundingClientRect()
      const switcher = panel.querySelector('.canvas-h3-mode-switch').getBoundingClientRect()
      return {
        sameRow: Math.abs(switcher.top - settings.top) <= 2,
        panelWidth: Math.round(panel.getBoundingClientRect().width),
      }
    })
    assert.equal(narrowRow.sameRow, true, `1100 宽度下底排仍为一行：${JSON.stringify(narrowRow)}`)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(400)
    const phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    assert.ok(phoneOverflow <= 1, `手机宽度无横向溢出：${phoneOverflow}`)
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.waitForTimeout(300)

    // 全能参考提交：带全部素材与模型可读引用。
    await prompt.fill('测试：<Picture 1> 与 <Video 1> 结合')
    await h3.locator('.canvas-node-run').click()
    await page.waitForFunction(() => document.querySelector('[data-qa-h3="primary"] .flora-generator-status')?.textContent?.includes('H3测试接口暂不可用'), null, { timeout: 15000 })
    assert.equal(submissions.length, 1)
    assert.equal(submissions[0].mode, 'reference')
    assert.equal(submissions[0].images.length, 1)
    assert.equal(submissions[0].videos.length, 1)
    assert.equal(submissions[0].audios.length, 1)
    assert.match(submissions[0].prompt, /<Picture 1>/)

    // 切到首帧：只发送一张图片，参考带给出中文提示。
    await page.evaluate(() => document.querySelector('[data-qa-h3="primary"] [data-h3-mode="first"]').click())
    await page.waitForTimeout(200)
    const firstMode = await page.evaluate(() => {
      const node = window.qaH3
      const note = node.querySelector('.flora-generator-mode-note')
      return {
        dataset: node.dataset.minimaxH3Mode,
        active: node.querySelector('.canvas-h3-mode.is-active')?.textContent?.trim() || '',
        note: note ? note.textContent.trim() : '',
        noteVisible: Boolean(note) && !note.hidden,
        serialized: serializeCanvasNode(node).minimaxH3Mode,
      }
    })
    assert.equal(firstMode.dataset, 'first')
    assert.equal(firstMode.active, '首帧')
    assert.equal(firstMode.serialized, 'first', '生成方式进入序列化')
    assert.match(firstMode.note, /首帧模式只使用第一张图片/, `首帧模式提示：${firstMode.note}`)
    assert.equal(firstMode.noteVisible, true)
    await prompt.fill('首帧测试')
    await h3.locator('.canvas-node-run').click()
    await page.waitForFunction(() => document.querySelector('[data-qa-h3="primary"] .flora-generator-status')?.textContent?.includes('H3测试接口暂不可用'), null, { timeout: 15000 })
    assert.equal(submissions.length, 2)
    assert.equal(submissions[1].mode, 'first')
    assert.equal(submissions[1].images.length, 1, '首帧模式只发送一张图片')
    assert.equal(submissions[1].videos.length, 0, '首帧模式不发送视频素材')
    assert.equal(submissions[1].audios.length, 0, '首帧模式不发送音频素材')

    // 文生视频：不带任何素材。
    await page.evaluate(() => document.querySelector('[data-qa-h3="primary"] [data-h3-mode="text"]').click())
    await page.waitForTimeout(150)
    const textNote = await page.evaluate(() => document.querySelector('[data-qa-h3="primary"] .flora-generator-mode-note')?.textContent?.trim() || '')
    assert.match(textNote, /文生视频不使用参考素材/, `文生视频提示：${textNote}`)
    await prompt.fill('文生视频测试')
    await h3.locator('.canvas-node-run').click()
    await page.waitForFunction(() => document.querySelector('[data-qa-h3="primary"] .flora-generator-status')?.textContent?.includes('H3测试接口暂不可用'), null, { timeout: 15000 })
    assert.equal(submissions.length, 3)
    assert.equal(submissions[2].mode, 'text')
    assert.deepEqual([submissions[2].images.length, submissions[2].videos.length, submissions[2].audios.length], [0, 0, 0], '文生视频不发送素材')

    // 恢复画布后生成方式保留。
    const restored = await page.evaluate(() => {
      const node = window.qaH3
      const saved = serializeCanvasNode(node)
      const next = restoreCanvasBoardNode({ ...saved, id: 'qa-restored-h3-modes' }, {}, { maxId: 0 })
      return { saved: saved.minimaxH3Mode, dataset: next.dataset.minimaxH3Mode, active: next.querySelector('.canvas-h3-mode.is-active')?.textContent?.trim() || '' }
    })
    assert.equal(restored.saved, 'text')
    assert.equal(restored.dataset, 'text', '恢复后生成方式保留')
    assert.equal(restored.active, '文生视频')
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)
    console.log(JSON.stringify({ ok: true, menu, modeUi, firstMode, textNote, submissions: submissions.map(item => ({ mode: item.mode, images: item.images.length, videos: item.videos.length, audios: item.audios.length })) }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
