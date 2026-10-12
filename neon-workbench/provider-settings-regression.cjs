const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const base = process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'
const user = { id: 'qa-provider', username: 'qa', displayName: '验收管理员', role: 'superadmin', status: 'active' }
const imageModel = id => ({ id, displayName: id, protocol: 'openai', capabilities: ['image.generate', 'image.edit'], metadata: { resolutions: ['1', '2'], parameterOverrides: { quality: 'auto' } } })
let providers = [{ id: 'station-a', name: '测试中转站 A', baseUrl: 'https://example.invalid/v1', protocol: 'openai', enabled: true, hasApiKey: true, metadata: { networkMode: 'auto' }, models: [imageModel('gpt-image-2'), { id: 'chat-one', protocol: 'openai', capabilities: ['llm.chat', 'llm.chat.vision'] }] }]
let saveFail = false, secretFail = false, revision = 1
let saved = [], calls = [], browser
const catalog = () => providers.filter(p => p.enabled).flatMap(p => p.models.filter(m => m.capabilities?.includes('image.generate')).map(m => ({ ...m, id: `${p.id}::${m.id}`, modelId: m.id, providerId: p.id, providerName: p.name, resolutions: m.metadata?.resolutions, family: 'gpt-image-2' })))
async function routeApi(route) {
  const req = route.request(), url = new URL(req.url()), method = req.method()
  let body = {}; try { body = req.postDataJSON() || {} } catch {}
  calls.push({ path: url.pathname, method })
  let result = {}, status = 200
  if (url.pathname === '/api/auth/session') result = { user, authenticated: true }
  else if (url.pathname === '/api/preferences') result = { preferences: { appearance: { theme: 'neon', scale: 1, animations: 'reduced' } } }
  else if (url.pathname === '/api/providers') {
    if (method === 'POST') {
      if (saveFail) { status = 503; result = { error: '模拟保存失败，请重试。' } }
      else { saved.push(structuredClone(body)); providers = [{ ...body, hasApiKey: Boolean(body.apiKey) }]; revision++; result = { provider: providers[0], catalogRevision: revision } }
    } else result = { providers, catalogRevision: revision }
  } else if (url.pathname.endsWith('/secret')) { status = secretFail ? 503 : 200; result = secretFail ? { error: '模拟密钥读取失败。' } : { apiKey: 'fixture-only-secret' } }
  else if (url.pathname === '/api/protocols') result = { protocols: [{ id: 'openai', label: 'OpenAI 兼容' }], platformProtocols: [{ id: 'openai', label: 'OpenAI 兼容' }], modelProtocols: [{ id: 'openai', modelLabel: 'OpenAI 模型协议' }] }
  else if (url.pathname === '/api/providers/models') result = { modelConfigurations: [imageModel('gpt-image-2'), imageModel('new-image'), imageModel('new-image'), { id: 'new-chat', capabilities: ['llm.chat'] }, { id: 'new-video', capabilities: ['video.generate'] }, { id: 'other', capabilities: [] }] }
  else if (url.pathname.startsWith('/api/providers/test')) result = { test: { status: 'passed', message: '模拟测试通过' } }
  else if (url.pathname === '/api/image-models') result = { models: catalog(), candidates: [], revision, instanceId: 'provider-isolated-qa', defaultModel: catalog()[0]?.id }
  else if (['/api/models', '/api/vision-models', '/api/video-models'].includes(url.pathname)) result = { models: [], revision, instanceId: 'provider-isolated-qa' }
  else if (url.pathname.startsWith('/api/canvas/')) result = { boards: [], projects: [] }
  else if (url.pathname.startsWith('/api/history')) result = { records: [] }
  else if (url.pathname === '/api/resources') result = { resources: [] }
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) })
}
;(async () => {
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const context = await browser.newContext()
  const page = await context.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = [], geometry = [], checks = [], spacingStates = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/api/**', routeApi)
  await context.addInitScript(() => {
    window.qaModelChanges = 0
    window.addEventListener('neon:models-changed', () => window.qaModelChanges++)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.qaCopiedSecret = value } }, configurable: true })
  })
  if (process.env.PROVIDER_SOURCE) {
    await context.route('**/neon-workbench.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'dist/workbench.js'), 'utf8') }))
    await context.route('**/neon-workbench.css*', route => route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(__dirname, 'dist/neon-workbench.css'), 'utf8') }))
  }
  const open = async () => { await page.getByRole('button', { name: '管理连接与模型' }).click(); await page.waitForFunction(() => !document.querySelector('#provider-api-key')?.disabled) }
  await page.goto(`${base}/neon-workbench.html#settings`)
  await page.getByRole('tab', { name: '模型服务', exact: true }).click(); await open()
  const dialog = page.getByRole('dialog')
  const key = page.locator('#provider-api-key')
  assert.equal(await key.getAttribute('type'), 'password'); assert.equal(await key.inputValue(), 'fixture-only-secret')
  await page.getByRole('button', { name: '复制完整密钥' }).click(); assert.equal(await page.evaluate(() => window.qaCopiedSecret), 'fixture-only-secret')
  await page.getByRole('button', { name: '显示密钥' }).click(); assert.equal(await key.getAttribute('type'), 'text')
  await page.getByRole('button', { name: '隐藏密钥' }).click()
  checks.push('真实草稿密钥默认掩码、显示隐藏、复制完整值')
  await page.getByRole('combobox', { name: '网络线路' }).selectOption('direct')
  await page.getByRole('button', { name: '拉取模型', exact: true }).click()
  await page.getByText('发现的模型（5）', { exact: true }).waitFor()
  assert.equal(saved.length, 0); await page.getByText('可用模型（2）', { exact: true }).waitFor()
  await page.getByRole('textbox', { name: '搜索发现的模型' }).fill('not-exist')
  await page.getByText('没有符合搜索或分类条件的模型。').waitFor()
  await page.getByRole('textbox', { name: '搜索发现的模型' }).fill('new-image')
  await page.getByRole('button', { name: 'new-image', exact: true }).click()
  await page.getByRole('button', { name: '加入所选（1）' }).click(); await page.getByText('可用模型（3）', { exact: true }).waitFor()
  assert.equal(saved.length, 0)
  await page.getByRole('button', { name: '配置 new-image', exact: true }).click()
  await page.getByRole('button', { name: '高级设置 new-image', exact: true }).click()
  const params = page.getByRole('textbox', { name: '默认参数 new-image' })
  await params.fill('{invalid'); assert.equal(await page.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), true)
  await params.fill('{"quality":"high"}')
  const selectedResolutionLabels = await page.getByRole('button', { name: /^分辨率 .+ new-image$/ }).evaluateAll(buttons => buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.getAttribute('aria-label')))
  for (const label of selectedResolutionLabels) await page.getByRole('button', { name: label, exact: true }).click()
  const resolutions = page.getByRole('textbox', { name: '补充分辨率 new-image', exact: true })
  for (const value of ['1K', '2K', '4K']) {
    const candidate = page.getByRole('button', { name: `分辨率 ${value} new-image`, exact: true })
    if (await candidate.count()) await candidate.click()
    else { await resolutions.fill(value); await page.getByRole('button', { name: '添加分辨率 new-image', exact: true }).click() }
  }
  await page.getByRole('button', { name: '上移 new-image', exact: true }).click()
  await page.getByRole('button', { name: '移除 chat-one', exact: true }).click()
  await key.click(); await key.press('ControlOrMeta+A'); await key.press('Backspace'); assert.equal(await key.inputValue(), '')
  saveFail = true; await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.getByText('模拟保存失败，请重试。').waitFor(); assert.equal(await page.evaluate(() => window.qaModelChanges), 0)
  saveFail = false; await page.getByRole('button', { name: '保存设置', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
  assert.equal(saved.length, 1); assert.equal(saved[0].clearApiKey, true, 'key length in submitted draft: ' + saved[0].apiKey?.length); assert.equal(saved[0].apiKey, ''); assert.equal(saved[0].networkMode, 'direct')
  assert.deepEqual(saved[0].models.map(m => m.id), ['gpt-image-2', 'new-image'])
  assert.deepEqual(saved[0].models[1].metadata.parameterOverrides, { quality: 'high' })
  assert.deepEqual(saved[0].models[1].metadata.resolutions, ['1K', '2K', '4K'])
  assert.equal(await page.evaluate(() => window.qaModelChanges), 1)
  checks.push('发现去重/搜索/选择加入/排序移除/无效参数阻止保存；失败不广播，成功清除密钥并同步')
  await open(); await page.getByRole('textbox', { name: '手动添加模型 ID' }).fill('discarded-model'); await dialog.getByRole('button', { name: '添加', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click(); await open()
  assert.equal(await page.getByText('discarded-model', { exact: true }).count(), 0)
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 })
    await page.getByRole('button', { name: '拉取模型', exact: true }).click()
    await page.getByRole('button', { name: '取消选择', exact: true }).waitFor()
    const box = await dialog.boundingBox()
    const a = await page.getByRole('combobox', { name: '平台协议', exact: true }).boundingBox(), b = await page.getByRole('combobox', { name: '网络线路' }).boundingBox()
    assert.ok(width === 390 ? b.y > a.y : Math.abs(a.y - b.y) < 2)
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
    await page.getByRole('button', { name: '取消选择', exact: true }).click()
    await page.getByRole('button', { name: '保存设置', exact: true }).hover()
    await page.getByRole('textbox', { name: '服务名称' }).focus()
    await dialog.evaluate(element => { element.scrollTop = 0 })
    if (process.env.BETTER_DESIGN_STATES) {
      spacingStates.push(await page.evaluate(({ code, width }) => {
        const popup = document.querySelector('[role="dialog"]')
        ;[popup, ...popup.querySelectorAll('*')].forEach((element, index) => element.setAttribute('data-bd-inspect-id', `qa-provider-${index}`))
        const __name = fn => fn
        const snapshot = eval(code)
        snapshot.elements = snapshot.elements.filter(element => element.selector?.startsWith('qa-provider-'))
        snapshot.name = `provider-${width}-focus`
        return snapshot
      }, { code: fs.readFileSync(path.join(__dirname, 'design-audits/audio-spacing-capture.js'), 'utf8'), width }))
    }
    geometry.push({ width, dialog: box, pageWidth: await page.evaluate(() => document.documentElement.scrollWidth) })
    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, `acceptance/provider-settings-${width}.png`) })
  }
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  const bulkModels = Array.from({ length: 347 }, (_, index) => imageModel(`bulk-model-${String(index + 1).padStart(3, '0')}`))
  providers[0].models = bulkModels
  providers[0].hasApiKey = false
  await page.reload(); await page.getByRole('tab', { name: '模型服务', exact: true }).click(); await open()
  const modelCheckbox = id => page.getByRole('checkbox', { name: `选择模型 ${id}`, exact: true })
  const selectAll = page.getByRole('checkbox', { name: '全选可用模型', exact: true })
  assert.equal(await selectAll.count(), 1, '可用模型列表应提供全选勾选控件')
  assert.equal(await page.getByRole('checkbox', { name: /^选择模型 / }).count(), 347)
  assert.equal(await page.getByRole('button', { name: '移除所选（0）', exact: true }).isDisabled(), true)
  await modelCheckbox('bulk-model-001').focus(); await page.keyboard.press('Space')
  await modelCheckbox('bulk-model-003').click()
  assert.equal(await selectAll.getAttribute('aria-checked'), 'mixed')
  assert.equal(await page.getByRole('button', { name: '配置 bulk-model-001', exact: true }).getAttribute('aria-expanded'), 'false', '勾选不应展开配置')
  await page.getByRole('button', { name: '上移 bulk-model-003', exact: true }).click()
  assert.equal(await modelCheckbox('bulk-model-003').getAttribute('aria-checked'), 'true', '排序后仍选中同一ID')
  await page.getByRole('button', { name: '移除 bulk-model-001', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '移除所选（1）', exact: true }).count(), 1, '单项移除应清理选中计数')
  await page.getByRole('button', { name: '移除所选（1）', exact: true }).click()
  await page.getByText('可用模型（345）', { exact: true }).waitFor()
  assert.equal(saved.length, 1, '批量移除只修改草稿，不保存')
  assert.equal(await page.evaluate(() => window.qaModelChanges), 0, '重载后批量移除不广播')
  await dialog.getByRole('button', { name: '取消', exact: true }).click(); await open()
  await page.getByText('可用模型（347）', { exact: true }).waitFor()
  assert.equal(await modelCheckbox('bulk-model-001').getAttribute('aria-checked'), 'false', '取消后丢弃移除和选择')
  await selectAll.click(); assert.equal(await selectAll.getAttribute('aria-checked'), 'true')
  await page.getByRole('button', { name: '移除所选（347）', exact: true }).waitFor()
  await page.getByRole('textbox', { name: '手动添加模型 ID' }).fill('bulk-extra')
  await dialog.getByRole('button', { name: '添加', exact: true }).click()
  assert.equal(await modelCheckbox('bulk-extra').getAttribute('aria-checked'), 'false', '新增模型默认不选中')
  assert.equal(await selectAll.getAttribute('aria-checked'), 'mixed')
  await page.getByRole('button', { name: '移除 bulk-extra', exact: true }).click()
  assert.equal(await selectAll.getAttribute('aria-checked'), 'true')
  await selectAll.click(); assert.equal(await selectAll.getAttribute('aria-checked'), 'false')
  await page.getByRole('button', { name: '移除所选（0）', exact: true }).waitFor()
  await selectAll.click(); await modelCheckbox('bulk-model-347').click()
  assert.equal(await selectAll.getAttribute('aria-checked'), 'mixed')
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 })
    await selectAll.scrollIntoViewIfNeeded(); await selectAll.focus()
    await page.getByRole('button', { name: '移除所选（346）', exact: true }).hover()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `批量选择在${width}不应横向溢出`)
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `弹窗在${width}不应横向溢出`)
    for (const checkbox of [selectAll, modelCheckbox('bulk-model-001')]) { const rect = await checkbox.boundingBox(); assert.ok(rect.width >= 44 && rect.height >= 44) }
    await page.screenshot({ path: path.join(__dirname, `acceptance/provider-bulk-${width}.png`) })
  }
  await page.getByRole('button', { name: '移除所选（346）', exact: true }).click()
  await page.getByText('可用模型（1）', { exact: true }).waitFor()
  assert.equal(await modelCheckbox('bulk-model-347').count(), 1)
  assert.equal(saved.length, 1)
  saveFail = true; await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.getByText('模拟保存失败，请重试。').waitFor(); assert.equal(await page.evaluate(() => window.qaModelChanges), 0)
  assert.equal(await modelCheckbox('bulk-model-347').count(), 1, '保存失败保留批量移除草稿')
  saveFail = false; await page.getByRole('button', { name: '保存设置', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
  assert.deepEqual(saved[1].models.map(model => model.id), ['bulk-model-347'])
  assert.equal(await page.evaluate(() => window.qaModelChanges), 1)
  await open(); await page.getByRole('button', { name: '配置 bulk-model-347', exact: true }).click()
  await page.getByRole('button', { name: '高级设置 bulk-model-347', exact: true }).click()
  await page.getByRole('textbox', { name: '默认参数 bulk-model-347', exact: true }).fill('{invalid')
  assert.equal(await page.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), true)
  await selectAll.click(); await page.getByRole('button', { name: '移除所选（1）', exact: true }).click()
  await page.getByText('可用模型（0）', { exact: true }).waitFor()
  assert.equal(await selectAll.isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '移除所选（0）', exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), false)
  await page.getByRole('textbox', { name: '手动添加模型 ID' }).fill('bulk-model-347')
  await dialog.getByRole('button', { name: '添加', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '保存设置' && !button.disabled))
  assert.equal(await page.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), false, '重新添加不继承已移除模型的参数错误')
  assert.equal(await page.getByRole('button', { name: '配置 bulk-model-347', exact: true }).getAttribute('aria-expanded'), 'false')
  await page.getByRole('button', { name: '移除 bulk-model-347', exact: true }).click()
  await page.screenshot({ path: path.join(__dirname, 'acceptance/provider-bulk-empty.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click(); await open()
  await page.getByText('可用模型（1）', { exact: true }).waitFor()
  await selectAll.click(); await page.getByRole('button', { name: '移除所选（1）', exact: true }).click()
  await page.getByRole('button', { name: '保存设置', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
  assert.deepEqual(saved[2].models, [], '全选清空后可以保存空模型列表')
  checks.push('347项多选/全选/中间态/键盘勾选，排序保留与单项移除清理；新增默认不选，清理展开与参数错误；取消放弃，批量草稿失败保留及保存同步；四宽度44px目标与空列表保存')
  providers[0].hasApiKey = true; secretFail = true
  await page.reload(); await page.getByRole('tab', { name: '模型服务', exact: true }).click()
  await page.getByRole('button', { name: '管理连接与模型' }).click()
  await page.getByText(/读取已保存密钥失败/).waitFor(); assert.equal(await page.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), true)
  checks.push('取消放弃草稿；四宽度布局/悬停/焦点；密钥读取失败阻止误删')
  assert.deepEqual(errors, [])
  const report = { date: new Date().toISOString(), evidence: '全部业务接口由隔离模拟响应覆盖，没有读取或修改用户配置。', checks, geometry, errors, requests: calls.length }
  fs.writeFileSync(path.join(__dirname, 'acceptance/provider-settings-report.json'), JSON.stringify(report, null, 2))
  if (spacingStates.length) fs.writeFileSync(path.join(__dirname, 'design-audits/provider-spacing-states.json'), JSON.stringify(spacingStates, null, 2))
  console.log(JSON.stringify(report, null, 2)); await browser.close()
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
