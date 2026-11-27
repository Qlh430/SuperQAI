import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { deployComponents } from './component-deploy.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-daily-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'project', 'neon-workbench')
  const runtime = path.join(root, 'AI-OS-Preview-Staging', 'video-hover-icon-centered-20261023-stage-r1', 'resources', 'app')
  const write = (base, file, text) => { const target = path.join(base, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text) }
  for (const file of ['desktop-shell.js', 'script.js', 'server.js', 'package.json']) write(runtime, file, '{}')
  write(source, 'dist/workbench.js', 'new JS')
  write(source, 'dist/neon-workbench.css', 'new CSS')
  write(source, 'host-bridge.js', 'new bridge')
  for (const file of ['neon-workbench.js', 'neon-workbench.css', 'neon-host-bridge.js']) write(runtime, file, 'old')
  write(runtime, 'index.html', '<script src="./neon-host-bridge.js?v=old"></script><script src="./module-manifest.js?v=old"></script>')
  write(runtime, 'module-manifest.js', 'const styles = ["./neon-workbench.css?v=old"];')
  write(runtime, 'neon-workbench.html', '<link href="./neon-workbench.css?v=old"><script src="./neon-workbench.js?v=old"></script>')
  return { root, source, runtime, write, args: { source, runtime, build: false } }
}

test('frontend group updates JS, CSS and bridge; invalidates both entry points; second update is a no-op', async t => {
  const f = fixture(t)
  const result = await deployComponents({ ...f.args, names: ['workbench-frontend'] })
  assert.equal(result.restartRequired, false)
  assert.equal(fs.readFileSync(path.join(f.runtime, 'neon-workbench.css'), 'utf8'), 'new CSS')
  assert.doesNotMatch(fs.readFileSync(path.join(f.runtime, 'neon-workbench.html'), 'utf8'), /v=old/)
  assert.doesNotMatch(fs.readFileSync(path.join(f.runtime, 'index.html'), 'utf8'), /v=old/)
  assert.equal(fs.readFileSync(path.join(f.runtime, 'server.js'), 'utf8'), '{}')
  assert.deepEqual((await deployComponents({ ...f.args, names: ['workbench-frontend'] })).changed, [])
})

test('canvas image viewer updates its Stage entry without deploying unrelated host changes', async t => {
  const { dailyComponents } = await import('./daily-workbench.mjs')
  const { releaseComponents } = await import('./component-deploy.mjs')
  const f = fixture(t)
  const start = 'function openCanvasImageOriginalPreview(node, image) {'
  const end = '\n\nfunction deleteCanvasImageSelection() { /* existing delete */ }\n'
  const installedHost = 'const installed = { saveForNavigation: async function () {} };\n'
  const before = installedHost + start + '\n  openPreview();\n}' + end
  const entry = start + '\n  window.CanvasNodeImageViewer.open({ node, image });\n}'
  f.write(f.runtime, 'script.js', before)
  f.write(f.source, 'design-sources/script-before-save-bridge.js', '// pending source\n' + entry + end)
  for (const file of ['flora-node-shell.js', 'flora-node-shell.css']) f.write(f.source, 'design-sources/' + file, '// viewer ' + file)
  const names = dailyComponents('canvas-image-viewer')
  assert.ok(!releaseComponents.includes('canvas-image-viewer'))
  assert.throws(() => dailyComponents('canvas-image-viewer,workbench-frontend'), /白名单/)
  const result = await deployComponents({ ...f.args, names })
  assert.equal(result.restartRequired, false)
  assert.equal(fs.readFileSync(path.join(result.backupDir, 'script.js'), 'utf8'), before)
  assert.equal(fs.readFileSync(path.join(f.runtime, 'script.js'), 'utf8'), installedHost + entry + end)
  assert.deepEqual((await deployComponents({ ...f.args, names })).changed, [])
})

test('Agent upscale updates its existing canvas entry points without replacing unrelated Stage code', async t => {
  const { dailyComponents, frontendFiles } = await import('./daily-workbench.mjs')
  const { componentInputs, componentTargets } = await import('./component-deploy.mjs')
  const f = fixture(t)
  const names = dailyComponents('canvas-agent-upscale')
  const sentinel = 'function unrelatedPendingCanvasChange() { return 27; }\n'
  const current = ['openCanvasImageToolPanel', 'resolveCanvasImageToolSource', 'runCanvasImageTool',
    'runCanvasComfyNode', 'runAgentCanvasNodeWithGuard'].map(name => `function ${name}() {\n  return 'old';\n}\n`).join('')
    + 'const CanvasAgentCanvasApi = Object.freeze({\n  removeBackground: removeAgentCanvasImageBackground,\n});\n'
  const script = 'const existing = { saveForNavigation: async function () {} };\n' + current + sentinel
  f.write(f.runtime, 'script.js', script)
  for (const target of componentTargets(names)) {
    assert.ok(frontendFiles.has(target), target)
    if (target !== 'script.js') f.write(f.runtime, target, 'old')
  }
  for (const input of componentInputs(names)) {
    f.write(f.source, input, fs.readFileSync(new URL(input, import.meta.url), 'utf8'))
  }
  const result = await deployComponents({ ...f.args, names })
  const installed = fs.readFileSync(path.join(f.runtime, 'script.js'), 'utf8')
  assert.ok(installed.endsWith(sentinel))
  assert.match(installed, /upscaleImage: upscaleAgentCanvasImage/)
  assert.equal(fs.readFileSync(path.join(result.backupDir, 'script.js'), 'utf8'), script)
  assert.deepEqual((await deployComponents({ ...f.args, names })).changed, [])
})

test('shared hardlink targets are rejected before any write', async t => {
  const f = fixture(t)
  const kept = path.join(f.root, 'kept.css')
  fs.linkSync(path.join(f.runtime, 'neon-workbench.css'), kept)
  await assert.rejects(deployComponents({ ...f.args, names: ['workbench-frontend'] }), /硬链接|共享/)
  assert.equal(fs.readFileSync(kept, 'utf8'), 'old')
  assert.equal(fs.readFileSync(path.join(f.runtime, 'neon-workbench.js'), 'utf8'), 'old')
})
test('desktop source deployment reports restart and preserves original files in the existing backup', async t => {
  const { componentTargets, componentInputs } = await import('./component-deploy.mjs')
  const f = fixture(t)
  for (const input of componentInputs(['release-host-sync'])) f.write(f.source, input, 'new host source')
  for (const file of componentTargets(['release-host-sync'])) {
    f.write(f.runtime, file, 'old host code')
  }
  const result = await deployComponents({ ...f.args, names: ['release-host-sync'] })
  assert.equal(result.restartRequired, true)
  assert.equal(fs.readFileSync(path.join(result.backupDir, 'desktop/main.js'), 'utf8'), 'old host code')
  assert.equal((await deployComponents({ ...f.args, names: ['release-host-sync'] })).restartRequired, false)
})

test('host-only Agent synchronization does not change browser entry files', async t => {
  const { componentTargets } = await import('./component-deploy.mjs')
  const f = fixture(t)
  for (const file of componentTargets(['release-host-sync'])) {
    const contents = file === 'canvas-agent-conversation.js' ? 'new conversation' : 'same host source'
    f.write(path.resolve(f.source, '../host-sources/app'), file, contents)
    f.write(f.runtime, file, file === 'canvas-agent-conversation.js' ? 'old conversation' : contents)
  }
  f.write(f.runtime, 'module-manifest.js', 'const scripts = ["./canvas-agent-conversation.js?v=old"];')
  const result = await deployComponents({ ...f.args, names: ['release-host-sync'], onlyFiles: ['canvas-agent-conversation.js'] })
  assert.deepEqual(result.changed, ['canvas-agent-conversation.js'])
  assert.equal(result.restartRequired, true)
  assert.match(fs.readFileSync(path.join(f.runtime, 'module-manifest.js'), 'utf8'), /v=old/)
})

test('daily target is fixed, rejects runtime/data/source paths and directory junctions', async t => {
  const { dailyPaths, assertDailyTarget, dailyComponents } = await import('./daily-workbench.mjs')
  const f = fixture(t)
  const expected = path.dirname(path.dirname(f.runtime))
  assert.equal(dailyPaths(f.source).stage, expected)
  assertDailyTarget(f.source, expected)
  for (const wrong of [f.source, path.join(f.root, 'project', 'AI-OS-Portable-1.0.5-win-x64', '.ai-runtime', 'versions', 'stable'), path.join(f.root, 'project', 'data')]) {
    assert.throws(() => assertDailyTarget(f.source, wrong), /固定|目录/)
  }
  assert.throws(() => dailyComponents('chat'), /前端/)
  assert.throws(() => dailyComponents('workbench-frontend,media-naming'), /前端/)
  assert.ok(dailyComponents('skill-management-ui').includes('skill-management-ui'))
  const linked = path.join(path.dirname(expected), 'linked')
  fs.renameSync(expected, linked)
  fs.symlinkSync(linked, expected, 'junction')
  assert.throws(() => assertDailyTarget(f.source, expected), /链接/)
})

test('running Windows host accepts a differently cased spelling of the same Portable paths only', {
  skip: process.platform !== 'win32',
}, async t => {
  const { dailyPaths, runningBackend } = await import('./daily-workbench.mjs')
  const f = fixture(t)
  const { portable } = dailyPaths(f.source)
  const active = 'dev-preview-qa'
  const appRoot = path.join(portable, '.ai-runtime/versions', active, 'resources/app')
  const dataDirectory = path.join(portable, 'data')
  f.write(portable, '.ai-runtime/.active-runtime', active)
  fs.mkdirSync(appRoot, { recursive: true })
  const server = http.createServer((req, res) => res.end(JSON.stringify({ ok: true, pid: process.pid })))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const localUrl = `http://127.0.0.1:${server.address().port}`
  const diag = { pid: process.pid, serverPid: process.pid, appRoot: appRoot.toUpperCase(),
    dataDirectory: dataDirectory.toUpperCase(), localUrl }
  const writeDiagnostic = value => f.write(portable, 'data/.logs/runtime-diagnostics.json', JSON.stringify(value))
  writeDiagnostic(diag)
  assert.equal(await runningBackend(f.source), localUrl)
  writeDiagnostic({ ...diag, dataDirectory: appRoot })
  await assert.rejects(runningBackend(f.source), /目录不一致/)
})

test('daily target rejects shared metadata as well as shared selected resources', async t => {
  const { assertDailyTarget, dailyComponents } = await import('./daily-workbench.mjs')
  const f = fixture(t)
  fs.linkSync(path.join(f.runtime, 'index.html'), path.join(f.root, 'retained.html'))
  assert.throws(() => assertDailyTarget(f.source, path.dirname(path.dirname(f.runtime)), dailyComponents()), /硬链接|共享/)
})

test('Vite entry serves fresh whitelisted stage files and proxies auth, media ranges, body and event streams', async t => {
  const { dailyViteConfig } = await import('./daily-workbench.mjs')
  const { createServer } = await import('vite')
  const f = fixture(t)
  const requests = []
  fs.mkdirSync(path.join(f.root, 'AI_OS_STYLE_PREVIEWS/real'), { recursive: true })
  fs.writeFileSync(path.join(f.root, 'AI_OS_STYLE_PREVIEWS/real/real-01.png'), 'new preview png')
  const backend = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    requests.push({ url: req.url, cookie: req.headers.cookie, range: req.headers.range, method: req.method, body })
    if (req.url === '/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: ready\n\n'); return }
    if (req.url.startsWith('/output/')) { res.writeHead(206, { 'Content-Range': 'bytes 0-2/6' }); res.end('abc'); return }
    if (req.url === '/api/login') res.setHeader('Set-Cookie', 'ai_os_session=test; Path=/; HttpOnly; SameSite=Lax')
    res.end('backend')
  })
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening')
  t.after(() => { backend.closeAllConnections(); backend.close() })
  const server = await createServer(dailyViteConfig({
    source: f.source,
    runtime: f.runtime,
    upstream: `http://127.0.0.1:${backend.address().port}`,
    port: 0,
    previewEntries: [{
      previewPath: '/visual-presets/style/real/real-01.webp',
      sourcePath: 'AI_OS_STYLE_PREVIEWS/real/real-01.png',
    }],
  }))
  t.after(() => server.close())
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  const get = route => fetch(url + route)
  const css = await get('/neon-workbench.css?v=unchanged')
  assert.match(css.headers.get('cache-control'), /no-store/)
  assert.equal(await css.text(), 'old')
  f.write(f.runtime, 'neon-workbench.css', 'changed after start')
  assert.equal(await (await get('/neon-workbench.css?v=unchanged')).text(), 'changed after start')
  f.write(f.source, 'public/visual-presets/sample.webp', 'preview bytes')
  const preview = await get('/visual-presets/sample.webp')
  assert.equal(preview.headers.get('content-type'), 'image/webp')
  assert.equal(await preview.text(), 'preview bytes', 'preview thumbnails are served from the fixed source overlay')
  assert.equal(requests.some(request => request.url === '/visual-presets/sample.webp'), false,
    'static preview requests must not be forwarded to the desktop backend')
  const arrivedPreview = await get('/visual-presets/style/real/real-01.webp')
  assert.equal(arrivedPreview.headers.get('content-type'), 'image/png')
  assert.equal(await arrivedPreview.text(), 'new preview png', 'new original PNGs should link through the stable preview URL without manifest edits')
  assert.equal(await (await get('/')).text(), fs.readFileSync(path.join(f.runtime, 'index.html'), 'utf8'))
  assert.equal(await (await get('/server.js')).text(), 'backend', 'no backend source may be served from stage')
  const login = await fetch(url + '/api/login', { method: 'POST', headers: { Cookie: 'ai_os_session=existing', 'Content-Type': 'application/json' }, body: '{"login":"test"}' })
  assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  assert.deepEqual(requests.find(r => r.url === '/api/login'), { url: '/api/login', cookie: 'ai_os_session=existing', range: undefined, method: 'POST', body: '{"login":"test"}' })
  const media = await fetch(url + '/output/real.mp4', { headers: { Range: 'bytes=0-2', Cookie: 'ai_os_session=existing' } })
  assert.equal(media.status, 206); assert.equal(media.headers.get('content-range'), 'bytes 0-2/6')
  assert.equal(await media.text(), 'abc')
  assert.equal(requests.at(-1).range, 'bytes=0-2')
  assert.equal(await (await get('/events')).text(), 'data: ready\n\n')
  const file = path.join(f.runtime, 'neon-workbench.css'); fs.unlinkSync(file)
  fs.linkSync(path.join(f.source, 'dist/neon-workbench.css'), file)
  assert.equal((await get('/neon-workbench.css')).status, 503, 'changed target safety must fail closed')
})
