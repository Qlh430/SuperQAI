const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const base = process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'
const user = { id: 'qa-canvas-sync', username: 'qa', role: 'superadmin', displayName: '验收管理员', status: 'active' }
const raw = id => ({ id, protocol: 'openai', capabilities: ['image.generate', 'image.edit'], metadata: { resolutions: ['1', '2'] } })
let providers = ['A', 'B'].map(id => ({ id, name: `中转站 ${id}`, protocol: 'openai', baseUrl: 'https://example.invalid/v1', hasApiKey: false, models: [raw('same-model')] }))
let revision = 1, generationCalls = 0, fetches = 0, catalogFail = false, browser
const catalog = () => providers.flatMap(p => p.models.map(m => ({ ...m, id: `${p.id}::${m.id}`, modelId: m.id, providerId: p.id, providerName: p.name, family: 'gpt-image-2' })))
;(async () => {
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()); let body = {}; try { body = request.postDataJSON() || {} } catch {}
    let result = { boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} }
    if (url.pathname === '/api/auth/session') result = request.frame().parentFrame() ? { authenticated: true, user } : { authenticated: false }
    else if (url.pathname === '/api/preferences') result = { preferences: { appearance: { theme: 'neon', scale: 1, animations: 'reduced' } } }
    else if (url.pathname === '/api/providers') {
      if (request.method() === 'POST') { providers = providers.map(p => p.id === body.id ? body : p); revision++; result = { catalogRevision: revision } }
      else result = { providers }
    } else if (url.pathname === '/api/providers/models') result = { modelConfigurations: [raw('new-image')] }
    else if (url.pathname === '/api/protocols') result = { protocols: [{ id: 'openai', label: 'OpenAI 兼容' }] }
    else if (url.pathname === '/api/image-models') {
      fetches++
      if (catalogFail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '模拟目录读取失败' }) })
      result = { models: catalog(), candidates: [], revision, instanceId: 'canvas-sync-fixture', defaultModel: catalog()[0]?.id }
    }
    else if (url.pathname === '/api/images') { generationCalls++; result = {} }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  // Load the current canonical host once, avoiding a second copy of its bridge.
  await page.route('**/neon-host-bridge.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  if (process.env.PROVIDER_SOURCE) {
    await page.route('**/script.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8') }))
    await page.route('**/image-model-picker.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'design-sources/image-model-picker.js'), 'utf8') }))
    await page.route('**/neon-workbench.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'dist/workbench.js'), 'utf8') }))
  }
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async user => {
    await window.AiOsModuleLoader.ensure('canvas-runtime'); await window.AiOsModuleLoader.ensure(['canvas-node-generator','canvas-node-comfy']); await window.AiOsModuleLoader.ensure('image-model-picker'); await loadImageModels(); await loadCanvasBoards(); canvasState.activeBoardId = 'qa-isolated-board'; document.getElementById('aiOsAuthGate')?.remove()
    window.AiOsDesktop = { getSession: () => ({ user }) }; document.getElementById('aiOsDesktop').hidden = false
    const a = addCanvasImageGeneratorNode({ x: 120, y: 100 }), b = addCanvasImageGeneratorNode({ x: 720, y: 100 })
    for (const [node, value] of [[a, 'A::same-model'], [b, 'B::same-model']]) {
      node.dataset.modelSelection = 'exact'; node.dataset.canvasModel = value
      const select = node.querySelector('.canvas-node-model'); select.value = value; select.dataset.modelSelection = 'exact'
      node.querySelector('.canvas-node-prompt').value = '保留提示词'; node.dataset.qaSync = value[0]
    }
    refreshCanvasImageModelSelects()
  }, user)
  await page.addScriptTag({ path: path.join(__dirname, 'host-bridge.js') })
  const frame = page.frameLocator('#aiOsNeonFrame')
  await frame.getByRole('button', { name: '设置', exact: true }).click()
  await frame.getByRole('tab', { name: '模型服务', exact: true }).click()
  await frame.getByRole('button', { name: '管理连接与模型' }).first().click()
  await frame.getByRole('button', { name: '拉取模型', exact: true }).click()
  await frame.getByRole('button', { name: 'new-image', exact: true }).click(); await frame.getByRole('button', { name: '加入所选（1）' }).click()
  await frame.getByRole('button', { name: '移除 same-model', exact: true }).click()
  await frame.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-qa-sync=A] .canvas-node-model')?.dataset.catalogUnavailable === 'true')
  const state = await page.evaluate(() => [...document.querySelectorAll('[data-qa-sync]')].map(node => ({ node: node.dataset.qaSync, model: node.dataset.canvasModel, unavailable: node.querySelector('.canvas-node-model').dataset.catalogUnavailable, choices: [...node.querySelector('.canvas-node-model').options].map(option => option.value), prompt: node.querySelector('.canvas-node-prompt').value, status: node.querySelector('.canvas-node-status')?.textContent })))
  assert.equal(state[0].model, 'A::same-model'); assert.equal(state[0].unavailable, 'true'); assert.match(state[0].status, /重新选择/)
  assert.equal(state[1].model, 'B::same-model'); assert.equal(state[1].unavailable, 'false')
  assert.ok(state.every(item => item.prompt === '保留提示词' && item.choices.includes('A::new-image')))
  await page.evaluate(() => runCanvasImageEdit(document.querySelector('[data-qa-sync=A]'))); assert.equal(generationCalls, 0)
  await page.evaluate(() => { const select = document.querySelector('[data-qa-sync=A] .canvas-node-model'); select.value = 'A::new-image'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  assert.equal(await page.evaluate(() => document.querySelector('[data-qa-sync=A] .canvas-node-model').dataset.catalogUnavailable), 'false')
  catalogFail = true
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ai-os-provider-catalog-changed')))
  await page.waitForFunction(() => document.querySelector('[data-qa-sync=A] .canvas-node-model')?.dataset.catalogError === 'true')
  assert.equal(await page.evaluate(() => document.querySelector('[data-qa-sync=A] .canvas-node-model').value), 'A::new-image')
  assert.match(await page.locator('[data-qa-sync=A] .canvas-node-status').textContent(), /目录更新失败/)
  catalogFail = false
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ai-os-provider-catalog-changed')))
  await page.waitForFunction(() => !document.querySelector('[data-qa-sync=A] .canvas-node-model')?.dataset.catalogError)
  assert.equal(await page.locator('[data-qa-sync=A] .canvas-node-status').textContent(), '准备就绪')
  assert.deepEqual(errors, []); console.log(JSON.stringify({ checks: '同源 iframe 保存实时同步画布；同名中转站模型保留；新增模型显示；移除模型提示且阻止运行；重选恢复；提示词保留', fetches, errors, state }, null, 2))
  fs.writeFileSync(path.join(__dirname, 'acceptance/provider-canvas-sync-report.json'), JSON.stringify({ state, errors, fetches }, null, 2)); await browser.close()
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
