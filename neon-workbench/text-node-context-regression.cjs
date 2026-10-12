const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const requests = [], errors = []
    let fail = false
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} } }))
    await page.route('**/api/vision-models', route => route.fulfill({ json: { models: [{ id: 'qa-chat', modelId: 'qa-chat', providerId: 'qa', providerName: '测试', capabilities: ['llm.chat', 'llm.chat.vision'], state: 'online' }] } }))
    await page.route('**/api/chat', route => {
      requests.push(route.request().postDataJSON())
      return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: { message: '测试服务暂不可用' } } : { choices: [{ message: { content: `第${requests.length}次修改后的完整提示词` } }] } })
    })
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'canvas-text-node-renderer.js']) {
        const file = path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name)
        await page.route(`**/${name}*`, route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(file, 'utf8') }))
      }
    }
    await page.goto(process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const loaded = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-text'])
      if (loaded?.ok === false) throw new Error(JSON.stringify(loaded))
      await loadVisionModels()
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-text-context'
      window.qaText = addCanvasText({ x: 100, y: 40 }, { focus: false })
      const model = qaText.querySelector('.canvas-llm-model')
      model.value = 'qa-chat'; model.dataset.catalogUnavailable = 'false'
    })
    const fullText = '## 提示词\n\n广阔无垠的雪原，远处有松树林，夜晚蓝调时刻。\n\n## 负面提示词\n\n人物、动物、车辆、暖色光源。\n\n' + '完整正文不能因节点滚动而截断。'.repeat(1600)
    const instruction = '给场景里加上一个篝火露营地，要有方盒子越野车在旁边打着车灯'
    async function run(text, requirement) {
      await page.evaluate(async ({ text, requirement }) => {
        if (text !== null) setCanvasTextValue(qaText, text)
        qaText.querySelector('.canvas-llm-prompt').value = requirement
        await runCanvasLlmNode(qaText)
      }, { text, requirement })
      return requests.at(-1)
    }
    function requestText(request) {
      return request.messages.map(message => typeof message.content === 'string' ? message.content : message.content.filter(item => item.type === 'text').map(item => item.text).join('\n')).join('\n')
    }
    const first = requestText(await run(fullText, instruction))
    assert.ok(first.includes(fullText), '填写修改要求时，必须同时发送当前完整正文（包括滚动区外的长文本）')
    assert.ok(first.includes(instruction), '必须同时发送本次修改要求')
    assert.equal(await page.evaluate(() => getCanvasTextValue(qaText)), '第1次修改后的完整提示词', '结果回写同一节点')
    assert.ok(requestText(await run(null, '再改成白天')).includes('第1次修改后的完整提示词'), '再次提交读取最新结果')

    await page.evaluate(() => {
      focusCanvasText(qaText)
      const editor = qaText.querySelector('.canvas-text')
      editor.innerHTML = '<p>手动编辑后的<strong>完整正文</strong></p>'
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const manual = await page.evaluate(() => getCanvasTextValue(qaText))
    assert.ok(manual.includes('手动编辑后'))
    assert.ok(requestText(await run(null, '润色这段')).includes(manual), '读取手动编辑后的当前正文')

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('flora-generation-history-select', { detail: { node: qaText, item: { kind: 'text', text: '历史版本的正文' } } })))
    const history = requestText(await run(null, '修改当前版本'))
    assert.ok(history.includes('历史版本的正文'), '切换历史后读取当前显示的版本')
    assert.ok(!history.includes('第3次修改后的完整提示词'), '不混入未显示的历史版本')

    await page.evaluate(() => setCanvasLlmImages(qaText, [{ value: 'data:image/png;base64,AAA=', name: '测试参考图' }]))
    const vision = await run('带参考图的当前正文', '参考图片修改提示词')
    assert.ok(requestText(vision).includes('带参考图的当前正文'))
    assert.ok(requestText(vision).includes('参考图片修改提示词'))
    assert.ok(vision.messages.some(message => Array.isArray(message.content) && message.content.some(item => item.type === 'image_url' && item.image_url.url === 'data:image/png;base64,AAA=')), '保留视觉参考输入')
    await page.evaluate(() => setCanvasLlmImages(qaText, []))
    assert.ok(requestText(await run('', '从头生成雪景提示词')).includes('从头生成雪景提示词'), '空节点仍支持新建文字')
    const beforeEmpty = requests.length
    await run('  \n  ', '')
    assert.equal(requests.length, beforeEmpty, '全空白正文和空指令不提交')
    assert.ok(requestText(await run(fullText, '')).includes(fullText), '没有额外要求也发送完整正文')
    fail = true
    await run('失败时保留的正文', '修改')
    assert.equal(await page.evaluate(() => getCanvasTextValue(qaText)), '失败时保留的正文')
    assert.ok((await page.evaluate(() => qaText.textContent)).includes('失败：测试服务暂不可用'), '接口失败保留正文并显示中文错误')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, requests: requests.length, scenarios: ['完整长正文与修改要求', '连续修改', '手动编辑', '当前历史版本', '视觉参考', '空节点', '空白校验', '正文直接提交', '失败保留正文'], pageErrors: errors }))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
