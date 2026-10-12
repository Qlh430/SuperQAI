const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const base = process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZAAAAABJRU5ErkJggg=='
const image = `data:image/png;base64,${png}`
const videoFixture = fs.readFileSync(path.join(__dirname, 'test-fixtures/video-seek-fixture.mp4'))
const audioFixture = Buffer.alloc(44 + 16000)
audioFixture.write('RIFF', 0); audioFixture.writeUInt32LE(audioFixture.length - 8, 4); audioFixture.write('WAVEfmt ', 8)
audioFixture.writeUInt32LE(16, 16); audioFixture.writeUInt16LE(1, 20); audioFixture.writeUInt16LE(1, 22)
audioFixture.writeUInt32LE(8000, 24); audioFixture.writeUInt32LE(16000, 28); audioFixture.writeUInt16LE(2, 32); audioFixture.writeUInt16LE(16, 34)
audioFixture.write('data', 36); audioFixture.writeUInt32LE(16000, 40)
const user = { id: 'diagnostics-fixture', username: 'qa', displayName: '诊断验收管理员', role: 'superadmin', status: 'active' }
const caps = [['llm.chat', '对话'], ['llm.chat.vision', '视觉理解'], ['llm.tools', '工具调用'], ['image.edit', '图片编辑'], ['image.generate', '图片生成'], ['video.generate', '视频生成'], ['audio.generate', '音频生成']]
const provider = { id: 'diagnostic-station', name: '模拟诊断服务', baseUrl: 'https://fixture.invalid/v1', protocol: 'openai', enabled: true, hasApiKey: false, metadata: { networkMode: 'auto' }, models: [
  { id: 'diagnostic-all', displayName: '保留已有别名', protocol: 'openai', capabilities: caps.map(([id]) => id), metadata: { resolutions: ['2K', '777x999'], parameterOverrides: { quality: 'high' } } },
  { id: 'unknown-image', capabilities: ['image.generate'], metadata: {} },
] }
let browser, verifyResponse = { available: true, selectedProtocol: 'openai', models: ['diagnostic-all'], attempts: [] }, verifyDelay = 0, testDelay = 0, inferDelay = 0, inferCalls = 0
let testResponse = { status: 'succeeded', text: '诊断文本回复', images: [], videos: [], audios: [], elapsedMs: 1234 }
let testHttpStatus = 200, testError = null, testCalls = [], verifyCalls = [], saves = [], requests = [], errors = []
async function routeApi(route) {
  const request = route.request(), url = new URL(request.url()), method = request.method()
  let body = {}; try { body = request.postDataJSON() || {} } catch {}
  requests.push({ path: url.pathname, method })
  let result = { boards: [], projects: [], resources: [], records: [], models: [], preferences: {}, settings: {} }, status = 200
  if (url.pathname === '/api/auth/session') result = { user, authenticated: true }
  else if (url.pathname === '/api/preferences') result = { preferences: { appearance: { theme: 'neon', scale: 1, animations: 'reduced' } } }
  else if (url.pathname === '/api/providers') {
    if (method === 'POST') { saves.push(structuredClone(body)); result = { provider: body, catalogRevision: 2 } }
    else result = { providers: [provider], catalogRevision: 1 }
  } else if (url.pathname.endsWith('/secret')) throw new Error('测试服务无已存密钥，不应读取真实密钥')
  else if (url.pathname === '/api/protocols') result = { protocols: [{ id: 'openai', label: 'OpenAI 兼容' }, { id: 'anthropic', label: 'Anthropic' }], platformProtocols: [{ id: 'openai', label: 'OpenAI 兼容' }, { id: 'anthropic', label: 'Anthropic' }], modelProtocols: [{ id: 'openai', modelLabel: 'OpenAI 模型协议' }] }
  else if (url.pathname === '/api/providers/infer-protocols') {
    inferCalls++; result = { candidates: [], models: (body.models || []).map(model => ({ ...model, protocol: model.protocol || body.protocol || 'openai' })) }
    if (inferDelay) await new Promise(resolve => setTimeout(resolve, inferDelay))
  }
  else if (url.pathname === '/api/providers/models') result = { modelConfigurations: provider.models }
  else if (url.pathname === '/api/providers/verify-protocol') {
    verifyCalls.push(structuredClone(body)); result = structuredClone(verifyResponse)
    if (verifyDelay) await new Promise(resolve => setTimeout(resolve, verifyDelay))
  } else if (url.pathname.startsWith('/api/providers/test')) {
    testCalls.push({ path: url.pathname, body: structuredClone(body) })
    result = testError ? structuredClone(testError) : { test: structuredClone(testResponse) }; status = testHttpStatus
    if (testDelay) await new Promise(resolve => setTimeout(resolve, testDelay))
  } else if (url.pathname === '/api/image-models') result = { models: [{ id: 'diagnostic-station::diagnostic-all', modelId: 'diagnostic-all', providerId: 'diagnostic-station', resolutions: ['1K', '2K'], metadata: { resolutions: ['1K', '2K'] }, capabilities: ['image.generate'] }], candidates: [], revision: 1, instanceId: 'diagnostic-fixture' }
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) }).catch(error => { if (!/closed|intercepted|handled|aborted/i.test(error.message)) throw error })
}
;(async () => {
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }), page = await context.newPage()
  page.setDefaultTimeout(7000)
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) return route.abort()
    return route.continue()
  })
  await context.route('**/api/**', routeApi)
  await context.route('**/diagnostic-result.*', route => {
    const video = route.request().url().endsWith('.mp4'), buffer = video ? videoFixture : audioFixture
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const headers = { 'Accept-Ranges': 'bytes' }
    let body = buffer, status = 200
    if (range) {
      const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : buffer.length - 1, buffer.length - 1)
      assert.ok(start <= end && end < buffer.length, '本机媒体范围有效')
      status = 206; body = buffer.subarray(start, end + 1)
      headers['Content-Range'] = `bytes ${start}-${end}/${buffer.length}`
    }
    headers['Content-Length'] = String(body.length)
    return route.fulfill({ status, headers, contentType: video ? 'video/mp4' : 'audio/wav', body })
  })
  await context.route('**/diagnostic-broken.mp4', route => route.fulfill({ contentType: 'video/mp4', body: '' }))
  if (process.env.PROVIDER_SOURCE) {
    await context.route('**/neon-workbench.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'dist/workbench.js'), 'utf8') }))
    await context.route('**/neon-workbench.css*', route => route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(__dirname, 'dist/neon-workbench.css'), 'utf8') }))
  }
  await page.goto(`${base}/neon-workbench.html#settings`)
  await page.getByRole('tab', { name: '模型服务', exact: true }).click()
  await page.getByRole('button', { name: '管理连接与模型', exact: true }).click()
  const dialog = page.getByRole('dialog'), modelId = 'diagnostic-all', checks = [], geometry = []
  fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
  const screenshot = state => page.screenshot({ path: path.join(__dirname, `acceptance/provider-diagnostics-${state}.png`) })
  const button = name => dialog.getByRole('button', { name, exact: true })
  await button('保存设置').waitFor()
  await button('删除服务').waitFor()
  assert.equal(await button('保存连接').count(), 0)
  await button(`配置 ${modelId}`).click()
  assert.equal(await dialog.getByRole('textbox', { name: '显示名称', exact: true }).count(), 0, '普通配置没有显示名称输入')
  assert.equal(await dialog.getByRole('combobox', { name: `模型协议 ${modelId}`, exact: true }).count(), 0, '普通配置不显示协议覆盖')
  assert.equal(testCalls.length, 0, '展开模型不能自动调用上游测试')
  for (const [, label] of caps) {
    const chip = button(`${label} ${modelId}`)
    assert.equal(await chip.getAttribute('aria-pressed'), 'true')
    const box = await chip.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, `${label}标签应有44px目标`)
  }
  await button(`图片生成 ${modelId}`).focus(); await page.keyboard.press('Space')
  assert.equal(await button(`图片生成 ${modelId}`).getAttribute('aria-pressed'), 'false')
  await button(`图片生成 ${modelId}`).click()
  assert.equal(await dialog.getByRole('button', { name: new RegExp(`^分辨率 777x999 ${modelId}$`, 'i') }).getAttribute('aria-pressed'), 'true', '保留已有自定义值')
  assert.equal(await button(`分辨率 2K ${modelId}`).getAttribute('aria-pressed'), 'true')
  await button(`分辨率 1K ${modelId}`).waitFor()
  assert.equal(await button(`分辨率 4K ${modelId}`).count(), 0, '未声明4K不能默认支持')
  await dialog.getByRole('textbox', { name: `补充分辨率 ${modelId}`, exact: true }).fill('1234x567')
  await button(`添加分辨率 ${modelId}`).click()
  assert.equal(await dialog.getByRole('button', { name: new RegExp(`^分辨率 1234x567 ${modelId}$`, 'i') }).getAttribute('aria-pressed'), 'true')
  await button(`高级设置 ${modelId}`).click()
  await dialog.getByRole('combobox', { name: `模型协议 ${modelId}`, exact: true }).waitFor()
  const params = dialog.getByRole('textbox', { name: `默认参数 ${modelId}`, exact: true })
  await params.fill('{invalid'); assert.equal(await button('保存设置').isDisabled(), true)
  await params.fill('{"quality":"high","temperature":0.3}')
  assert.equal(await button('保存设置').isDisabled(), false)
  checks.push('保存/删除文案、七项44px能力标签、键盘选择、宿主分辨率候选与保留/补充、高级协议及JSON')
  const protocolStatuses = () => dialog.locator('[role="status"], [role="alert"]').filter({ hasText: /协议|验证|认证失败|连接拒绝/ })
  const key = dialog.locator('#provider-api-key'), url = dialog.getByRole('textbox', { name: '接口地址', exact: true })
  await key.fill('fixture-only-draft-key')
  await button(`高级设置 ${modelId}`).click()
  await button(`图片生成 ${modelId}`).scrollIntoViewIfNeeded()
  await screenshot('default')
  await button(`高级设置 ${modelId}`).click()
  await button('验证协议').click()
  await protocolStatuses().filter({ hasText: /协议验证通过|协议可用|验证成功/ }).first().waitFor()
  assert.equal(verifyCalls.at(-1).provider.apiKey, 'fixture-only-draft-key')
  assert.equal(verifyCalls.at(-1).provider.baseUrl, 'https://fixture.invalid/v1')
  const nearby = await protocolStatuses().filter({ hasText: /协议验证通过|协议可用|验证成功/ }).first().evaluate(element => {
    const verify = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '验证协议')
    let ancestor = verify.parentElement
    for (let i = 0; i < 3 && ancestor; i++, ancestor = ancestor.parentElement) if (ancestor.contains(element) && ancestor.tagName !== 'FORM') return true
    return false
  })
  assert.equal(nearby, true, '协议结果应固定显示在验证/拉取按钮区域')
  await screenshot('protocol-success')
  const stale = async () => { await protocolStatuses().filter({ hasText: /过期|重新验证|已更改|已变更|已修改/ }).first().waitFor() }
  for (const mutate of [() => url.fill('https://changed.invalid/v1'), () => key.fill('fixture-updated-key'), () => dialog.getByRole('combobox', { name: '网络线路', exact: true }).selectOption('direct'), () => dialog.getByRole('combobox', { name: '平台协议', exact: true }).selectOption('anthropic')]) {
    await mutate(); await stale(); await button('验证协议').click(); await protocolStatuses().filter({ hasText: /协议验证通过|协议可用|验证成功/ }).first().waitFor()
  }
  verifyResponse = { available: false, selectedProtocol: 'anthropic', attempts: [{ message: '认证失败，请核对密钥。', code: 'AUTH_FAILED' }], code: 'AUTH_FAILED', guidance: '请检查 API 密钥及服务商权限。' }
  await button('验证协议').click()
  const failedProtocol = protocolStatuses().filter({ hasText: /认证失败/ }).first()
  await failedProtocol.waitFor(); assert.match(await failedProtocol.textContent(), /AUTH_FAILED/); assert.match(await failedProtocol.textContent(), /密钥|权限/)
  await screenshot('protocol-failure')
  verifyResponse = { available: true, selectedProtocol: 'openai', models: ['diagnostic-all'], attempts: [] }; verifyDelay = 450
  await button('验证协议').click(); await url.fill('https://latest.invalid/v1'); await stale()
  await page.waitForTimeout(650); await stale(); verifyDelay = 0
  assert.equal(saves.length, 0)
  checks.push('available判定、就近协议结果、失败代码与中文建议、URL/密钥/线路/协议失效及迟到结果保护')
  const prompt = dialog.getByRole('textbox', { name: `测试提示词 ${modelId}`, exact: true })
  const model = prompt.locator(`xpath=ancestor::div[.//button[@aria-label="配置 ${modelId}"]][1]`)
  await prompt.fill('诊断测试提示词：小猫看书')
  await dialog.locator(`input[type="file"][aria-label="测试参考图 ${modelId}"]`).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  const modelStatus = () => model.locator('[role="status"], [role="alert"]').filter({ hasText: /测试|诊断|任务|失败|结果|回复|通过|完成|无效|处理|等待/ })
  assert.equal(testCalls.length, 0, '填写提示词和素材不执行测试')
  const results = [
    ['测试对话', '/api/providers/test', { text: '诊断文本回复' }],
    ['测试视觉理解', '/api/providers/test-vision', { text: '诊断视觉回复' }],
    ['测试工具调用', '/api/providers/test-tools', { text: '工具已返回真实结果', toolCallCount: 1 }],
    ['测试图片生成', '/api/providers/test-image', { images: [image] }],
    ['测试图片编辑', '/api/providers/test-image-edit', { images: [image] }],
    ['测试视频生成', '/api/providers/test-video', { videos: [`${base}/diagnostic-result.mp4`] }],
    ['测试音频生成', '/api/providers/test-audio', { audios: [`${base}/diagnostic-result.wav`] }],
  ]
  for (const [label, expectedPath, content] of results) {
    testResponse = { status: 'succeeded', text: '', images: [], videos: [], audios: [], elapsedMs: 1234, ...content }
    const before = testCalls.length
    await model.getByRole('button', { name: label, exact: true }).click()
    await modelStatus().filter({ hasText: /测试成功|测试完成|测试通过/ }).first().waitFor()
    assert.equal(testCalls.length, before + 1)
    const call = testCalls.at(-1)
    assert.equal(call.path, expectedPath); assert.equal(call.body.modelId, modelId)
    assert.equal(call.body.provider.apiKey, 'fixture-updated-key'); assert.equal(call.body.provider.baseUrl, 'https://latest.invalid/v1')
    assert.equal(call.body.provider.protocol, 'anthropic'); assert.equal(call.body.provider.networkMode, 'direct')
    assert.match(JSON.stringify(call.body.input), /诊断测试提示词/)
    assert.equal(call.body.params.quality, 'high'); assert.equal(call.body.params.temperature, 0.3)
    if (/视觉|编辑/.test(label)) assert.ok(call.body.input.inputImages.some(value => typeof value === 'string' && value.startsWith('data:image/png;base64,')), '参考图真实dataURL应进入请求')
    if (/工具/.test(label)) { assert.ok(call.body.input.tools.length); assert.match(JSON.stringify(call.body.input.tools), /ping/) }
    if (content.text) await model.getByText(content.text, { exact: true }).waitFor()
    if (content.images) assert.ok(await model.locator('img').evaluateAll(elements => elements.some(element => element.src.startsWith('data:image/png;base64,'))))
    if (content.videos || content.audios) {
      const media = model.locator(content.videos ? 'video[controls]' : 'audio[controls]')
      await media.evaluate(element => new Promise((resolve, reject) => {
        if (element.readyState >= 1 && Number.isFinite(element.duration) && element.duration > 0) return resolve()
        element.addEventListener('loadedmetadata', () => Number.isFinite(element.duration) && element.duration > 0 ? resolve() : reject(new Error('媒体时长无效')), { once: true })
        element.addEventListener('error', () => reject(new Error('本机测试素材解码失败')), { once: true })
      }))
      await media.evaluate(async element => {
        element.muted = true
        await element.play()
        element.pause()
        await new Promise(resolve => { element.addEventListener('seeked', resolve, { once: true }); element.currentTime = element.duration / 2 })
      })
      const playback = await media.evaluate(element => ({ currentTime: element.currentTime, paused: element.paused, duration: element.duration, error: element.error?.code }))
      assert.ok(playback.currentTime > 0 && playback.paused, `${label}本机媒体可播放、暂停并定位进度：${JSON.stringify(playback)}`)
      if (content.videos) {
        await media.evaluate(element => element.requestFullscreen())
        assert.equal(await media.evaluate(element => document.fullscreenElement === element), true)
        await screenshot('video-fullscreen')
        await page.evaluate(() => document.exitFullscreen())
      }
      assert.equal(await model.getByText('结果预览失败', { exact: false }).count(), 0)
    }
    assert.match(await model.textContent(), /1234|1\.234|1\.23|1\.2/)
    await screenshot(`result-${expectedPath.split('/').at(-1)}`)
  }
  testResponse = { status: 'succeeded', text: '', images: [], videos: [`${base}/diagnostic-broken.mp4`], audios: [], elapsedMs: 1200 }
  const beforeBrokenPreview = testCalls.length
  await model.getByRole('button', { name: '测试视频生成', exact: true }).click()
  await model.getByText('测试结果预览加载失败，请检查资源链接或网络后重试。', { exact: true }).waitFor()
  assert.equal(testCalls.length, beforeBrokenPreview + 1, '预览失败不会自动重复提交付费生成')
  assert.equal(await modelStatus().filter({ hasText: /测试成功/ }).count(), 0)
  await screenshot('preview-failure')
  testResponse = { status: 'pending', taskId: 'fixture-task-42', text: '', images: [], videos: [], audios: [], elapsedMs: 1100, message: '任务已提交，等待服务返回结果。' }
  await model.getByRole('button', { name: '测试视频生成', exact: true }).click()
  await model.getByText(/fixture-task-42/).waitFor()
  assert.equal(await modelStatus().filter({ hasText: /测试成功|测试通过|测试完成/ }).count(), 0, 'pending不能成为成功')
  await screenshot('pending')
  testResponse = { status: 'succeeded', text: '', images: [], videos: [], audios: [], elapsedMs: 300 }
  await model.getByRole('button', { name: '测试图片生成', exact: true }).click()
  await modelStatus().filter({ hasText: /未通过|无效|没有.*结果/ }).first().waitFor()
  assert.equal(await modelStatus().filter({ hasText: /测试成功|测试通过|测试完成/ }).count(), 0, 'HTTP成功和空输出不能当作生成成功')
  testResponse = { status: 'invalid', code: 'EMPTY_RESULT', message: '服务未返回有效图片。', guidance: '请检查模型是否支持图片生成。', images: [], videos: [], audios: [], elapsedMs: 300 }
  await model.getByRole('button', { name: '测试图片生成', exact: true }).click()
  await model.getByText(/EMPTY_RESULT/).waitFor(); await model.getByText(/检查模型/).waitFor()
  assert.equal(await modelStatus().filter({ hasText: /测试成功|测试通过|测试完成/ }).count(), 0, '无效结果不能成为成功')
  testHttpStatus = 401; testError = { error: '模拟认证失败，请检查 API 密钥。', code: 'AUTH_FAILED', guidance: '请检查密钥和服务商权限。' }
  await model.getByRole('button', { name: '测试对话', exact: true }).click()
  await model.getByText(/AUTH_FAILED/).waitFor(); await model.getByText(/权限/).waitFor()
  await screenshot('model-failure')
  testHttpStatus = 200; testError = null
  testResponse = { status: 'succeeded', text: '延迟结果不得覆盖新配置', images: [], videos: [], audios: [], elapsedMs: 1234 }; testDelay = 450
  await model.getByRole('button', { name: '测试对话', exact: true }).click(); await params.fill('{"quality":"low"}')
  await modelStatus().filter({ hasText: /过期|重新测试|已更改|已变更|已修改/ }).first().waitFor()
  await page.waitForTimeout(650)
  assert.equal(await model.getByText('延迟结果不得覆盖新配置', { exact: true }).count(), 0)
  await modelStatus().filter({ hasText: /过期|重新测试|已更改|已变更|已修改/ }).first().waitFor(); testDelay = 0
  checks.push('七种能力实际请求、当前草稿参数/提示词/dataURL、工具输入、逐模型文本/图片/音视频与耗时、本机媒体播放暂停定位与视频全屏、损坏预览中文失败且不重复生成、pending/invalid/失败、模型变更与迟到结果保护')
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 })
    await button(`图片生成 ${modelId}`).hover(); await prompt.focus()
    const box = await dialog.boundingBox()
    const dimensions = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, viewport: innerWidth }))
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
    assert.ok(dimensions.pageWidth <= width, `${width}页面横向溢出`)
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `${width}诊断弹窗横向溢出`)
    geometry.push({ width, dialog: box, ...dimensions })
    await page.screenshot({ path: path.join(__dirname, `acceptance/provider-diagnostics-${width}.png`) })
  }
  await button(`配置 unknown-image`).click()
  assert.equal(await button('分辨率 4K unknown-image').count(), 0)
  await dialog.getByRole('textbox', { name: '补充分辨率 unknown-image', exact: true }).waitFor()
  assert.equal(saves.length, 0, '诊断不自动保存配置')
  await button('保存设置').click(); await dialog.waitFor({ state: 'hidden' })
  assert.equal(saves.length, 1)
  const savedModel = saves[0].models.find(model => model.id === modelId)
  assert.equal(savedModel.displayName, '保留已有别名')
  assert.ok(savedModel.metadata.resolutions.includes('777x999') && savedModel.metadata.resolutions.includes('1234x567'))
  assert.deepEqual(savedModel.metadata.parameterOverrides, { quality: 'low' })
  await page.getByRole('button', { name: '管理连接与模型', exact: true }).click()
  await key.waitFor()
  inferDelay = 450
  const previousInference = inferCalls
  await dialog.getByRole('combobox', { name: '平台协议', exact: true }).selectOption('anthropic')
  await page.waitForTimeout(50)
  assert.equal(inferCalls, previousInference + 1, '平台变更实际开始自动匹配')
  assert.equal(await button('保存设置').isDisabled(), true, '自动匹配进行中暂不能保存')
  await dialog.getByRole('checkbox', { name: '全选可用模型', exact: true }).click()
  await button('移除所选（2）').click()
  await dialog.getByText('可用模型（0）', { exact: true }).waitFor()
  await dialog.getByRole('combobox', { name: '平台协议', exact: true }).selectOption('openai')
  await page.waitForTimeout(650)
  assert.equal(await button('保存设置').isDisabled(), false, '匹配中移除全部模型后变更协议应解除匹配状态')
  await button('保存设置').click(); await dialog.waitFor({ state: 'hidden' })
  assert.deepEqual(saves[1].models, [], '迟到匹配不能把清空的模型恢复')
  inferDelay = 0
  checks.push('延迟自动匹配中清空模型再变更协议，保存恢复且空列表不会被迟到结果覆盖')
  assert.deepEqual(errors, [])
  const report = { date: new Date().toISOString(), evidence: '浏览器全部业务API模拟，已阻止外部网络；不读取用户密钥、不修改真实配置、不调用付费服务。本机音视频素材实际播放、暂停、定位进度并检查视频全屏；真实服务商生成媒体与真实登录业务需用户已有会话最终验收。', checks, geometry, errors, testRequests: testCalls.length, verifyRequests: verifyCalls.length, requests: requests.length }
  fs.writeFileSync(path.join(__dirname, 'acceptance/provider-diagnostics-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2)); await browser.close()
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
