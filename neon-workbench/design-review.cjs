const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const phase = process.argv[2] || 'before'
const output = path.resolve(__dirname, '../.design/full-review-20261002', phase)
fs.mkdirSync(output, { recursive: true })
// Reuse the acceptance fixture without executing its browser runner.
const context = { require, __dirname, Date, console, module: { exports: {} } }
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'acceptance.cjs'), 'utf8').split('let browser')[0] + '\nmodule.exports = { fixture, user };', context)
const { fixture, user } = context.module.exports
const svg = (w, h) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#283529"/><text x="10" y="35" fill="white">${w} × ${h}</text></svg>`)
const resources = [
  { resource: { id: 'r1', title: '竖版参考图片', type: 'image', ownerUserId: 'qa', workspaceId: 'p1' }, preview: { kind: 'image', url: svg(400, 800) }, access: { permission: 'owner', capabilities: { share: true, delete: true } } },
  { resource: { id: 'r2', title: '共享横版参考图片', type: 'image', ownerUserId: 'other', workspaceId: 'p2' }, preview: { kind: 'image', url: svg(1000, 300) }, access: { permission: 'read', share: { id: 's1', visibility: 'all' }, capabilities: {} } },
  { resource: { id: 'r3', title: '共享给我的音频', type: 'audio', ownerUserId: 'other' }, access: { permission: 'read', share: { id: 's2', visibility: 'users' }, capabilities: {} } },
  { resource: { id: 'r4', title: '需要口令的共享素材', type: 'image', ownerUserId: 'other' }, access: { locked: true, share: { id: 's3', visibility: 'password' }, capabilities: {} } },
]
const protocol = { id: 'openai', label: 'OpenAI 兼容', summary: '对话和图片生成接口', builtin: true, capabilities: ['llm.chat', 'image.generate'], operations: [{ intent: 'llm.chat', method: 'POST', path: '/chat/completions' }] }
const localModel = { id: 'test-model', name: '本地抠图模型', description: '移除图片背景', installed: true, source: 'external', size: 1024 * 1024 * 100, sha256: 'a'.repeat(64), stored: true, bundledAvailable: true, upstreamRepository: '官方模型源', upstream: { sha256: 'b'.repeat(64) } }
let failing = '', empty = false, role = 'superadmin', delay = false
const mock = (url, method, body) => {
  if (url.pathname === '/api/auth/session') return { authenticated: true, user: { ...user, role } }
  if (url.pathname === '/api/resources') return { resources: empty ? [] : resources }
  if (url.pathname === '/api/protocols') return { protocols: [protocol, { id: 'cli:jimeng', label: '即梦', builtin: true }], platformProtocols: [protocol], modelProtocols: [protocol], editable: role === 'superadmin', capabilities: [{ id: 'llm.chat', label: '对话' }, { id: 'image.generate', label: '生图' }] }
  if (url.pathname === '/api/background-removal/models') return { models: empty ? [] : [localModel] }
  if (url.pathname === '/api/providers/verify-protocol') return { ok: true, message: '协议验证通过。' }
  if (url.pathname === '/api/providers/models') return { models: [{ id: 'discovered-model', displayName: '新发现模型' }] }
  if (url.pathname === '/api/protocols/route-test') return { ok: true, selected: { providerName: '示例连接', modelName: '验收示例模型' }, autoFallback: true }
  if (url.pathname.startsWith('/api/background-removal/models/')) return { model: localModel, remote: localModel.upstream, updateAvailable: true }
  const data = fixture(url, method, body)
  if (empty) for (const key of ['projects', 'boards', 'trash', 'records', 'providers', 'models', 'users']) if (Array.isArray(data[key])) data[key] = []
  return data
}
let browser
;(async () => {
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const page = await browser.newPage()
  const errors = [], states = [], copy = [], checks = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.aiOsHost = { getAutostart: async () => ({ enabled: false }), setAutostart: async enabled => ({ enabled }), getUpdateStatus: async () => ({ status: 'idle', currentVersion: '1.0.5' }), checkForUpdates: async () => ({ status: 'available', currentVersion: '1.0.5', availableVersion: '1.0.6' }) }
  })
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    requests.push({ method: req.method(), path: url.pathname })
    if (failing === url.pathname) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '模拟接口失败，请重试。' }) })
    if (delay && ['/api/images', '/api/chat'].includes(url.pathname)) await new Promise(resolve => setTimeout(resolve, 1200))
    let body = {}; try { body = req.postDataJSON() || {} } catch {}
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mock(url, req.method(), body)) })
  })
  const captureCode = fs.readFileSync(path.resolve(__dirname, '../.design/full-review-20261002/capture-spacing.js'), 'utf8')
  async function capture(name) {
    await page.waitForTimeout(100)
    const state = await page.evaluate(captureCode)
    state.name = name
    states.push(state)
    const texts = await page.evaluate(() => {
      const visible = e => e.checkVisibility({ visibilityProperty: true }) && e.getBoundingClientRect().width > 0
      const root = [...document.querySelectorAll('[role="dialog"]')].find(visible) || [...document.querySelectorAll('main section[aria-label]')].find(visible) || document.querySelector('#root') || document.body
      return { headline: [...root.querySelectorAll('h1,h2,[role="heading"]')].filter(visible).map(e => e.textContent.trim()).join(' / '), body: [...root.querySelectorAll('p,label,dt,legend')].filter(visible).map(e => e.textContent.trim()), actions: [...root.querySelectorAll('button,a,[role="tab"]')].filter(visible).map(e => e.getAttribute('aria-label') || e.textContent.trim()), text: root.innerText }
    })
    copy.push({ name, ...texts })
    fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(states))
    fs.writeFileSync(path.join(output, 'copy.json'), JSON.stringify(copy, null, 2))
    await page.screenshot({ path: path.join(output, `${name}.png`) })
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
    checks.push({ name, ...geometry, overflow: geometry.scrollWidth > geometry.width })
  }
  async function goto(route) {
    await page.goto(`http://127.0.0.1:3199/neon-workbench.html?audit=${Date.now()}#${route}`)
    await page.locator('h1:visible').waitFor()
  }
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 })
    for (const route of ['home', 'projects', 'assets', 'history', 'settings', 'account', 'image', 'chat']) { await goto(route); await capture(`${width}-${route}`) }
    await goto('settings')
    for (const tab of ['外观', '模型服务', '协议中心', '本地模型', '智能助手', '技能', '工作流', '备份', '系统']) {
      await page.getByRole('tab', { name: tab, exact: true }).click(); await capture(`${width}-settings-${tab}`)
    }
    await page.getByRole('tab', { name: '模型服务', exact: true }).click()
    await page.getByRole('button', { name: '管理连接与模型' }).click(); await capture(`${width}-provider-dialog`)
    await page.getByRole('button', { name: '验证协议', exact: true }).click(); await page.getByText('协议验证通过。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await goto('projects')
    await page.getByRole('button', { name: '新建项目', exact: true }).last().click(); await capture(`${width}-project-dialog`)
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await page.getByRole('tab', { name: '回收站', exact: true }).click(); await capture(`${width}-trash`)
    await goto('assets')
    await page.getByRole('button', { name: '预览素材 竖版参考图片' }).click(); await capture(`${width}-asset-dialog`)
    await page.getByRole('button', { name: '共享设置', exact: true }).click(); await capture(`${width}-share-form`)
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await goto('account')
    await page.getByRole('button', { name: '修改密码', exact: true }).click(); await capture(`${width}-password-dialog`)
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await page.getByRole('button', { name: '新增账户', exact: true }).click(); await capture(`${width}-account-dialog`)
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    if (width === 390) {
      await page.getByRole('button', { name: '打开导航' }).click(); await capture(`${width}-navigation-open`); await page.keyboard.press('Escape')
    }
    await goto('home')
    await page.getByRole('button', { name: /^生成图片/ }).hover(); await capture(`${width}-home-hover`)
    await page.getByRole('button', { name: /^生成图片/ }).focus(); await capture(`${width}-home-focus`)
  }
  await page.setViewportSize({ width: 390, height: 760 })
  for (const [route, api] of [['assets', '/api/resources'], ['settings', '/api/providers'], ['account', '/api/admin/users'], ['image', '/api/image-models'], ['chat', '/api/models']]) {
    failing = api; await page.goto(`http://127.0.0.1:3199/neon-workbench.html?error=${Date.now()}#${route}`); await page.locator('text="模拟接口失败，请重试。"').filter({ visible: true }).first().waitFor(); await capture(`390-${route}-error`); failing = ''
  }
  empty = true
  for (const route of ['home', 'projects', 'assets', 'history', 'image', 'chat', 'account']) { await goto(route); await capture(`390-${route}-empty`) }
  empty = false; role = 'user'; await goto('settings'); await capture('390-settings-member'); role = 'superadmin'
  // Capture real unauthenticated entry without simulated session APIs.
  await page.unroute('**/api/**'); await page.goto('http://127.0.0.1:3199/'); await page.waitForTimeout(600); await capture('390-real-login')
  for (const width of [768, 1440, 1728]) { await page.setViewportSize({ width, height: 960 }); await capture(`${width}-real-login`) }
  fs.writeFileSync(path.join(output, 'states.json'), JSON.stringify(states))
  fs.writeFileSync(path.join(output, 'copy.json'), JSON.stringify(copy, null, 2))
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ evidence: '工作台使用模拟 API 与模拟桌面桥接；真实服务仅检查未登录页。', phase, checks, errors, requests }, null, 2))
  console.log(JSON.stringify({ phase, screenshots: states.length, errors, overflow: checks.filter(c => c.overflow), output }, null, 2))
  await browser.close()
  if (errors.length || checks.some(c => c.overflow)) process.exitCode = 1
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
