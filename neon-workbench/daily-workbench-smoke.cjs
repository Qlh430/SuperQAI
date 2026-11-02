// Only API fixtures are used in the browser; never creates real accounts/data.
const { chromium } = require('playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
;(async () => {
  const base = 'http://127.0.0.1:33200'
  const ready = await (await fetch(base + '/api/system/ready')).json()
  assert.equal(ready.ok, true)
  const diagnostic = JSON.parse(fs.readFileSync('../AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json', 'utf8'))
  assert.equal(ready.pid, diagnostic.serverPid)
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  try {
    const page = await browser.newPage()
    const errors = [], overlays = new Set()
    page.on('pageerror', e => errors.push(e.message))
    page.on('response', r => { if (r.headers()['x-ai-os-frontend']) overlays.add(new URL(r.url()).pathname) })
    await page.route('**/api/**', route => {
      const name = new URL(route.request().url()).pathname
      const data = name === '/api/auth/session' ? { authenticated: true, user: { id: 'daily-fixture', username: 'fixture', displayName: '验收账户', role: 'superadmin', status: 'active' } }
        : name === '/api/preferences' ? { preferences: { appearance: { theme: 'neon' } } }
        : { boards: [], projects: [], resources: [], entries: [], categories: [], folders: [], records: [], models: [], providers: [], users: [], groups: [], config: {}, state: {}, settings: {} }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    })
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
    const frame = page.frameLocator('#aiOsNeonFrame')
    await frame.locator('h1:visible').waitFor()
    assert.equal(await page.locator('#aiOsNeonFrame').count(), 1)
    await page.evaluate(() => { window.__dailyBridge = false; window.addEventListener('ai-os-provider-catalog-changed', () => { window.__dailyBridge = true }, { once: true }) })
    await frame.locator('body').evaluate(() => parent.postMessage({ type: 'neon:models-changed', catalogRevision: 1 }, location.origin))
    await page.waitForFunction(() => window.__dailyBridge)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await frame.locator('h1:visible').waitFor()
    assert.deepEqual(errors, [])
    for (const file of ['/', '/neon-host-bridge.js', '/neon-workbench.html', '/neon-workbench.js', '/neon-workbench.css']) assert.ok(overlays.has(file), file)
    const result = { backendPid: ready.pid, hostIframe: true, bridgeMessage: true, refresh: true, errors, overlayFiles: [...overlays].sort(), boundary: '浏览器 API 全部模拟；真实服务仅只读 ready 检查。' }
    fs.writeFileSync('../.design/daily-workbench-20261024/host-smoke.json', JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
