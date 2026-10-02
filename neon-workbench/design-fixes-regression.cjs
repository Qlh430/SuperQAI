const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { chromium } = require('playwright')

async function checkApiErrors() {
  const exports = {}
  const context = { exports, fetch: null, window: {}, location: { origin: 'http://127.0.0.1:3199' } }
  context.window.parent = context.window
  const source = fs.readFileSync(path.join(__dirname, 'src/lib/api.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  context.fetch = async () => { throw new Error('Failed to fetch') }
  await assert.rejects(exports.request('/api/resources'), /连接本机服务失败/)
  context.fetch = async () => ({ ok: true, json: async () => { throw new Error('Unexpected token') } })
  await assert.rejects(exports.request('/api/resources'), /服务返回的数据无法读取/)
  context.fetch = async () => ({ ok: false, status: 403, json: async () => { throw new Error('HTML error page') } })
  await assert.rejects(exports.request('/api/resources'), /当前账户没有操作权限/)
  context.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: '模拟服务失败，请重试。' }) })
  await assert.rejects(exports.request('/api/resources'), /模拟服务失败，请重试/)
  const aborted = Object.assign(new Error('Aborted'), { name: 'AbortError' })
  context.fetch = async () => { throw aborted }
  await assert.rejects(exports.request('/api/chat'), error => error === aborted)
  return ['网络失败中文提示', '成功响应损坏不伪造空数据', '非 JSON 权限错误', '保留中文服务错误', '取消请求保留原语义']
}

let browser
;(async () => {
  const checks = await checkApiErrors()
  const context = { require, __dirname, Date, console, module: { exports: {} } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'acceptance.cjs'), 'utf8').split('let browser')[0] + '\nmodule.exports = { fixture };', context)
  const { fixture } = context.module.exports
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const page = await browser.newPage({ viewport: { width: 390, height: 960 } })
  const errors = []
  const providerBodies = []
  let chatRequests = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.aiOsHost = {
      getAutostart: async () => ({ enabled: false }),
      getUpdateStatus: async () => ({ status: 'up-to-date', currentVersion: '1.0.5' }),
      onUpdateStatus: callback => { window.auditUpdate = callback; return () => { window.auditUpdate = null } },
    }
  })
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    let body = {}; try { body = req.postDataJSON() || {} } catch {}
    let result
    if (url.pathname === '/api/protocols') result = { protocols: [{ id: 'openai', label: 'OpenAI 兼容' }] }
    else if (url.pathname === '/api/providers/verify-protocol' || url.pathname === '/api/providers/models') {
      providerBodies.push(body)
      result = url.pathname.endsWith('/models') ? { models: [{ id: 'discovered-model' }] } : { ok: true, message: '协议验证通过。' }
    } else {
      if (url.pathname === '/api/chat') { chatRequests++; await new Promise(resolve => setTimeout(resolve, 1500)) }
      result = fixture(url, req.method(), body)
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) }).catch(() => {})
  })
  await page.goto('http://127.0.0.1:3199/neon-workbench.html#settings')
  await page.getByRole('tab', { name: '系统', exact: true }).click()
  await page.getByText('已是最新', { exact: true }).waitFor()
  await page.evaluate(() => window.auditUpdate({ status: 'unpublished', currentVersion: '1.0.5' }))
  await page.getByText('尚无可用更新', { exact: true }).waitFor()
  await page.evaluate(() => window.auditUpdate({ status: 'error', error: 'ECONNRESET' }))
  await page.getByText('主机操作失败，请检查服务状态后重试。', { exact: true }).waitFor()
  checks.push('宿主推送实时更新及状态错误中文映射')
  await page.getByRole('tab', { name: '模型服务', exact: true }).click()
  await page.getByRole('button', { name: '管理连接与模型' }).click()
  const protocol = page.getByRole('combobox', { name: '接口协议' })
  assert.equal(await protocol.locator('option[value="openai"]').count(), 1)
  await page.getByLabel('API 密钥', { exact: true }).fill('audit-dummy-key')
  await page.getByRole('button', { name: '验证协议', exact: true }).click()
  await page.getByText('协议验证通过。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '拉取模型', exact: true }).click()
  await page.getByText('已读取 1 个模型，可编辑后保存。', { exact: true }).waitFor()
  assert.equal(providerBodies.length, 2)
  for (const body of providerBodies) assert.equal(body.provider.apiKey, 'audit-dummy-key')
  checks.push('协议选项去重及验证和模型发现携带当前密钥')
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.setViewportSize({ width: 768, height: 960 })
  await page.goto('http://127.0.0.1:3199/neon-workbench.html#projects')
  const project = page.getByRole('button', { name: /^秋季新品\s*1$/ })
  await project.waitFor()
  assert.ok((await project.boundingBox()).height >= 44)
  assert.equal(await project.locator('span').first().evaluate(element => element.scrollWidth > element.clientWidth), false)
  checks.push('768px 项目目录名称完整显示且按钮至少44px')
  await page.setViewportSize({ width: 390, height: 960 })
  await page.goto('http://127.0.0.1:3199/neon-workbench.html#chat')
  const input = page.getByRole('textbox', { name: '对话消息' })
  await input.fill('正在发送的消息')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '停止等待', exact: true }).waitFor()
  assert.equal(await input.isEnabled(), true)
  await input.fill('下一条草稿')
  await page.getByRole('button', { name: '停止等待', exact: true }).click()
  await page.getByRole('button', { name: '发送消息', exact: true }).waitFor()
  assert.equal(await input.inputValue(), '正在发送的消息\n\n下一条草稿')
  assert.equal(chatRequests, 1)
  checks.push('等待回复时可继续输入，停止保留两段草稿且不会重新提交')
  await page.unroute('**/api/**')
  await page.goto('http://127.0.0.1:3199/')
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 })
    for (const id of ['aiOsLoginUsername', 'aiOsLoginPassword']) {
      const field = page.locator(`#${id}`)
      await field.waitFor({ state: 'visible' })
      assert.ok((await field.boundingBox()).height >= 44)
    }
  }
  checks.push('真实未登录入口4宽度输入框至少44px；未执行登录')
  assert.deepEqual(errors, [])
  const output = path.resolve(__dirname, '../.design/full-review-20261002/design-fixes-report.json')
  fs.writeFileSync(output, JSON.stringify({ date: new Date().toISOString(), evidence: '模拟 API、模拟主机推送和虚拟 API 请求，不读取真实密钥或写入真实数据。', checks, errors }, null, 2))
  console.log(JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
