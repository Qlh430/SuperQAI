const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const local = path.join(__dirname, 'design-sources', `${name}.js`);
  if (!fs.existsSync(local)) return require(path.join(runtime, name));
  const mod = { exports: {} }; cache.set(name, mod.exports);
  vm.runInNewContext(fs.readFileSync(local, 'utf8'), {
    module: mod, exports: mod.exports, require: id => id.startsWith('./') ? load(id.slice(2)) : require(id),
    URL, Date, Object, Set, Map, WeakSet, Number, String, Boolean, Array, Error, TypeError,
    Buffer, Uint8Array, AbortController, setTimeout, clearTimeout, globalThis, FormData, Blob,
  }, { filename: local });
  cache.set(name, mod.exports); return mod.exports;
}
function wav() {
  const b = Buffer.alloc(44 + 16000); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(16000, 40); return b;
}
async function main() {
  await deploymentAndAcl();
  let upstream = [], mode = 'binary';
  const bytes = wav();
  const mock = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    upstream.push({ path: req.url, body: JSON.parse(text), auth: req.headers.authorization });
    if (mode === 'failed') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"success":false,"message":"余额不足"}'); }
    else if (req.url === '/v1/audio/speech') { res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(bytes); }
    else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ audio_url: 'https://example.invalid/result.wav' })); }
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${mock.address().port}`;
  const { createMediaProtocolAdapters } = load('media-protocol-adapters');
  const { createProtocolRegistry } = load('provider-protocol-registry');
  const { createProtocolEngine } = load('provider-protocol-engine');
  const registry = createProtocolRegistry({ adapters: createMediaProtocolAdapters() });
  assert.equal(registry.inferModelConfiguration({ id: 'gpt-4o-mini-tts' }, { protocol: 'openai' }).protocol, 'audio-speech');
  assert.equal(registry.inferModelConfiguration({ id: 'tts-1', protocol: 'audio-adapter' }, { protocol: 'openai' }).protocol, 'audio-adapter');
  assert.equal(registry.inferModelConfiguration({ id: 'custom-music', capabilities: ['audio.generate'] }, { protocol: 'openai' }).protocol, 'audio-adapter');
  const engine = createProtocolEngine({ registry, fetchImpl: fetch });
  const models = [{ id: 'tts-1', protocol: 'audio-speech', capabilities: ['audio.generate'], metadata: { parameterOverrides: { voice: 'configured-speaker', response_format: 'wav' } } }, { id: 'generic', protocol: 'audio-adapter', capabilities: ['audio.generate'] }, { id: 'text', protocol: 'openai', capabilities: ['llm.chat'] }];
  const saved = { id: 'p', protocol: 'openai', baseUrl: base, apiKey: 'fixture-key', enabled: true, models };
  const { createProviderHttpApi } = load('provider-http-api');
  let persisted = [], persistFiles = false;
  const { createAudioOutputPersistence } = load('audio-output-persistence');
  const persistAudio = createAudioOutputPersistence({ outputDir: path.join(__dirname, 'acceptance/audio-isolated'), fs: { promises: { mkdir: async () => {}, writeFile: async (filename, data, options) => persisted.push({ filename, data, options }) } }, crypto: { randomUUID: () => 'fixture' } });
  const api = createProviderHttpApi({ store: { listPublic: () => [{ ...saved, apiKey: undefined }], reveal: id => { if (id !== 'p') throw Object.assign(new Error('不存在'), { code: 'provider_not_found' }); return saved; } }, registry, engine,
    persistGeneratedAudio: async value => persistFiles ? persistAudio(value) : { url: `data:${value.contentType};base64,${value.data.toString('base64')}` },
    requireSignedIn: async req => { if (req.headers['x-test-auth'] === 'deny') throw Object.assign(new Error('请登录'), { statusCode: 401 }); return { user: { id: 'ordinary-user' } }; },
    requireRole: async () => { throw Object.assign(new Error('无管理员权限'), { statusCode: 403 }); },
    readJson: async req => { let s = ''; for await (const c of req) s += c; return JSON.parse(s || '{}'); },
    sendJson: (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); },
  });
  const server = http.createServer(async (req, res) => { if (!await api.handle(req, res)) { res.writeHead(404); res.end('{}'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (body, auth = '') => { const r = await fetch(`${origin}/api/providers/generate-audio`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-auth': auth }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try {
    assert.equal((await call({ providerId: 'p', modelId: 'tts-1', prompt: '你好' }, 'deny')).status, 401);
    const speech = await call({ providerId: 'p', modelId: 'tts-1', prompt: '你好', parameters: { speed: 1.2 } });
    assert.equal(speech.status, 200); assert.match(speech.body.audio.url, /^data:audio\/wav;base64,/);
    assert.equal(upstream.at(-1).path, '/v1/audio/speech');
    assert.deepEqual(upstream.at(-1).body, { model: 'tts-1', input: '你好', voice: 'configured-speaker', response_format: 'wav', speed: 1.2 });
    assert.equal(upstream.at(-1).auth, 'Bearer fixture-key');
    assert.ok(!JSON.stringify(speech.body).includes('fixture-key'));
    assert.equal((await call({ providerId: 'p', modelId: 'generic', prompt: '音乐' })).body.audio.url, 'https://example.invalid/result.wav');
    assert.equal(upstream.at(-1).body.intent, 'audio.generate');
    const count = upstream.length;
    for (const [body, expected] of [ [{ providerId: 'p', modelId: 'removed', prompt: 'x' }, 404], [{ providerId: 'p', modelId: 'text', prompt: 'x' }, 400], [{ providerId: 'p', modelId: 'tts-1', prompt: 'x', reference_audio: 'https://example.invalid/ref.wav' }, 400], [{ providerId: 'p', modelId: 'tts-1', prompt: 'x', apiKey: 'evil' }, 400] ]) assert.equal((await call(body)).status, expected);
    assert.equal(upstream.length, count);
    const catalogRes = await fetch(`${origin}/api/providers/audio-models`); assert.equal(catalogRes.status, 200);
    const catalog = await catalogRes.json(); assert.equal(catalog.models.length, 2); assert.equal(catalog.models[0].modelProtocol, 'audio-speech');
    assert.equal(catalog.models[0].parameterOverrides.voice, 'configured-speaker'); assert.equal(catalog.models[0].modelId, 'tts-1');
    assert.ok(!JSON.stringify(catalog).includes(base)); assert.ok(!JSON.stringify(catalog).includes('fixture-key'));
    persistFiles = true; const stored = await call({ providerId: 'p', modelId: 'tts-1', prompt: '保存' });
    assert.equal(stored.body.audio.url, '/output/audio-fixture.wav'); assert.deepEqual(persisted[0].data, bytes); assert.equal(persisted[0].options.flag, 'wx'); persistFiles = false;
    await assert.rejects(() => persistAudio({ data: bytes, contentType: 'audio/wav' }), /登录/);
    mode = 'failed'; assert.equal((await call({ providerId: 'p', modelId: 'tts-1', prompt: 'x' })).status, 502);
    mode = 'binary';
    const fixture = await browserFixture(origin, speech.body.audio.url);
    console.log('PASS audio: real isolated speech binary, generic URL, ordinary auth, saved configuration, failure and browser playback/seek', fixture);
  } finally { server.close(); mock.close(); }
}
async function deploymentAndAcl() {
  const deploy = fs.readFileSync(path.join(__dirname, 'deploy.mjs'), 'utf8');
  const patchSource = deploy.match(/export function patchAudioServerComposition[\s\S]*?\n}\n/)?.[0];
  assert.ok(patchSource, '部署脚本提供可验证的幂等音频服务接线');
  const sandbox = {}; vm.runInNewContext(patchSource.replace('export ', '') + '\nthis.patch = patchAudioServerComposition;', sandbox);
  const original = fs.readFileSync(path.join(runtime, 'server-components/composition.js'), 'utf8');
  const patched = sandbox.patch(original); assert.equal(sandbox.patch(patched), patched);
  new vm.Script(patched, { filename: 'isolated-patched-composition.js' });
  assert.ok(patched.includes('persistGeneratedAudio:')); assert.ok(patched.includes('assetLibrary.registerMedia'));
  assert.ok(patched.includes('source: "generated"')); assert.ok(patched.includes('outputDir: OUTPUT_DIR'));
  assert.throws(() => sandbox.patch('const unrelated = true;'), /不匹配/);
  const htmlTransformation = deploy.slice(deploy.indexOf('html = html\n') >= 0 ? deploy.indexOf('html = html\n') : deploy.indexOf('html = html\r\n'), deploy.indexOf('writeFileSync(indexPath, html'));
  assert.ok(htmlTransformation.startsWith('html = html'));
  const htmlSandbox = { html: fs.readFileSync(path.join(runtime, 'index.html'), 'utf8') };
  for (let pass = 0; pass < 2; pass++) {
    vm.runInNewContext(htmlTransformation, htmlSandbox);
    for (const module of ['flora-generation-history', 'canvas-audio-generator']) {
      assert.equal((htmlSandbox.html.match(new RegExp(`<script src="\\./${module}\\.js`, 'g')) || []).length, 1);
      assert.equal((htmlSandbox.html.match(new RegExp(`<link rel="stylesheet" href="\\./${module}\\.css`, 'g')) || []).length, 1);
      assert.ok(htmlSandbox.html.indexOf(`<script src="./${module}.js`) < htmlSandbox.html.indexOf('<script src="./flora-generator-parameters.js'));
      assert.ok(htmlSandbox.html.indexOf(`href="./${module}.css`) < htmlSandbox.html.indexOf('href="./flora-node-shell.css'));
    }
  }
  const patchOptions = patched.match(/\/\* NEON_AUDIO_OUTPUT_PERSISTENCE_START \*\/[\s\S]*?\/\* NEON_AUDIO_OUTPUT_PERSISTENCE_END \*\//)?.[0];
  assert.ok(patchOptions);
  const { createAssetLibraryService } = require(path.join(runtime, 'asset-library-service'));
  const records = new Map(); let write = null;
  const db = { getResourceByRef: (type, ref) => [...records.values()].find(row => row.refType === type && row.refId === ref), getShareForResource: () => null, getUserById: id => ({ id, username: id, status: 'active' }), getAssetEngagement: () => ({}), listAssetProjectLinks: () => [],
    registerResource: value => { const row = { ...value, id: 'owned-audio', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; records.set(row.id, row); return row; }, getResource: id => records.get(id) };
  const { createResourceAccess } = require(path.join(runtime, 'resource-access'));
  const resourceAccess = createResourceAccess({ db });
  const assetLibrary = createAssetLibraryService({ db, resourceAccess, projectService: {} });
  const fakeFs = { promises: { mkdir: async () => {}, writeFile: async (filename, data) => { write = { filename, data }; } } };
  const wiring = { require: name => { assert.equal(name, '../audio-output-persistence'); return load('audio-output-persistence'); }, OUTPUT_DIR: path.join(__dirname, 'acceptance/audio-isolated'), fs: fakeFs, crypto: { randomUUID: () => 'acl-fixture' }, assetLibrary };
  vm.runInNewContext(`this.options = { ${patchOptions} };`, wiring);
  const saved = await wiring.options.persistGeneratedAudio({ data: wav(), contentType: 'audio/wav', auth: { user: { id: 'creator' } } });
  assert.equal(saved.url, '/output/audio-acl-fixture.wav'); assert.ok(write);
  const resource = [...records.values()][0]; assert.equal(resource.ownerUserId, 'creator'); assert.equal(resource.type, 'audio'); assert.equal(resource.metadata.mimeType, 'audio/wav'); assert.equal(resource.metadata.source, 'generated'); assert.equal(resource.refId, saved.url);
  await resourceAccess.assertRead('creator', resource.id); await assert.rejects(() => resourceAccess.assertRead('another-user', resource.id), error => error.statusCode === 403);
}
async function browserFixture(origin, audioUrl) {
  const { chromium } = createRequire(path.join(__dirname, 'package.json'))('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.AI_OS_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  try {
    const page = await browser.newPage(); let errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await page.setContent('<div id="node"></div>');
    await page.addStyleTag({ path: path.join(__dirname, 'design-sources/canvas-audio-generator.css') });
    await page.addScriptTag({ path: path.join(__dirname, 'design-sources/canvas-audio-generator.js') });
    await page.evaluate(url => { window.results = []; const node = document.querySelector('#node'); window.CanvasAudioGenerator.render(node, { modelId: 'p:tts-1', prompt: '恢复草稿', result: { url } }, { getPrompt: () => '连接文本', getModels: () => [{ id: 'p:tts-1', modelId: 'tts-1', providerId: 'p', providerName: '测试服务', capabilities: ['audio.generate'], modelProtocol: 'audio-speech', parameterOverrides: { voice: 'configured-speaker', response_format: 'wav' } }], onSave() {}, onResult(n, item) { window.results.push(item); } }); }, audioUrl);
    await page.locator('audio').evaluate(a => new Promise(resolve => { if (a.readyState >= 1) resolve(); else a.addEventListener('loadedmetadata', resolve, { once: true }); }));
    await page.locator('audio').evaluate(async a => { await a.play(); a.currentTime = 0.4; });
    assert.ok(await page.locator('audio').evaluate(a => !a.paused && a.currentTime >= 0.4));
    for (const width of [390, 768, 1440, 1728]) { await page.setViewportSize({ width, height: 700 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.locator('.canvas-audio-generator-prompt').fill('新的语音');
    await page.locator('.canvas-audio-generator-run').click();
    await page.waitForFunction(() => window.results.length === 1);
    assert.equal(await page.evaluate(() => window.CanvasAudioGenerator.serialize(document.querySelector('#node')).prompt), '新的语音');
    assert.equal(await page.evaluate(() => window.results[0].prompt), '连接文本', '连接文本用于实际生成与历史，输入草稿保留');
    for (const completion of ['failure', 'success']) {
      await page.evaluate(() => {
        const node = document.querySelector('#node'); CanvasAudioGenerator.unmount(node);
        window.lateResults = 0; window.lateSaves = 0; window.lateStatuses = [];
        const getModels = () => [{ id: 'p:tts-1', modelId: 'tts-1', providerId: 'p', capabilities: ['audio.generate'], modelProtocol: 'audio-speech' }];
        CanvasAudioGenerator.render(node, { modelId: 'p:tts-1', prompt: '待完成草稿' }, {
          getModels, onSave: () => lateSaves++, onResult: () => lateResults++, onStatus: (n, text) => lateStatuses.push(text),
          fetch: (url, options) => { window.pendingSignal = options.signal; return new Promise((resolve, reject) => { window.resolvePending = resolve; window.rejectPending = reject; }); },
        });
        window.inflightAudio = CanvasAudioGenerator.run(node);
        CanvasAudioGenerator.unmount(node);
        CanvasAudioGenerator.render(node, { modelId: 'p:tts-1', prompt: '替换后的草稿' }, { getModels, onSave: () => lateSaves++, onResult: () => lateResults++, onStatus: (n, text) => lateStatuses.push(text) });
      });
      assert.equal(await page.evaluate(() => pendingSignal?.aborted), true, '卸载中止生成请求');
      await page.evaluate(({ completion, audioUrl }) => {
        if (completion === 'failure') rejectPending(new Error('旧请求失败'));
        else resolvePending(new Response(JSON.stringify({ audio: { url: audioUrl } }), { status: 200 }));
        return inflightAudio;
      }, { completion, audioUrl });
      assert.equal(await page.evaluate(() => lateResults + lateSaves), 0, '旧请求不能保存或提交替换节点');
      assert.equal(await page.evaluate(() => lateStatuses.length), 1, '旧请求只能留下最初运行状态，不能覆盖新节点');
      assert.equal(await page.evaluate(() => CanvasAudioGenerator.serialize(document.querySelector('#node')).prompt), '替换后的草稿');
      assert.equal(await page.evaluate(() => CanvasAudioGenerator.serialize(document.querySelector('#node')).result), null);
    }
    assert.equal(errors.length, 0); return '4 widths; restored draft; native playback and seek; saved model request';
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
