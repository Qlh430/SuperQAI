const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const canonical = path.join(__dirname, 'design-sources');
const { createProtocolRegistry } = require(path.join(runtime, 'provider-protocol-registry'));
const { createMediaProtocolAdapters } = loadSource('media-protocol-adapters.js');
function loadSource(name) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(canonical, name), 'utf8'), {
    module, exports: module.exports, require: dep => dep === './provider-test-result' && fs.existsSync(path.join(canonical, 'provider-test-result.js'))
      ? loadSource('provider-test-result.js') : require(path.join(runtime, dep)),
    URL, Date, Set, WeakSet, Map, Object, Number, String, Boolean, Array, Error, TypeError,
    Buffer, Blob, FormData, AbortController, TextDecoder, setTimeout, clearTimeout,
  }, { filename: name });
  return module.exports;
}
async function main() {
  const secret = 'diagnostic-fixture-key';
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=';
  let fixture = {}, requests = [], writes = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    let body; try { body = JSON.parse(raw); } catch { body = raw; }
    requests.push({ path: req.url, method: req.method, headers: req.headers, body });
    let payload = fixture.payload;
    if (fixture.poll && req.method === 'GET') payload = fixture.poll;
    if (fixture.alternative) payload = req.url.includes('/v1beta/models') ? { models: [{ name: 'models/gemini-fixture' }] } : {};
    res.writeHead(fixture.status || 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload ?? {}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adapters = createMediaProtocolAdapters({ wait: async () => {}, maxPolls: 2 });
  const registry = createProtocolRegistry({ adapters });
  const engine = loadSource('provider-protocol-engine.js').createProtocolEngine({ registry, outboundFetch: async (url, options) => {
    assert.equal(new URL(url).hostname, '127.0.0.1', 'Tests may only contact the isolated loopback server');
    return fetch(url, options);
  } });
  const store = { listPublic: () => [], reveal: () => { throw Object.assign(new Error('不存在'), { code: 'provider_not_found' }); }, save: () => { writes++; } };
  const api = loadSource('provider-http-api.js').createProviderHttpApi({ store, registry, engine,
    requireSignedIn: async req => { if (req.auth === 'none') throw Object.assign(new Error('请登录'), { statusCode: 401 }); return { user: { id: 'fixture-admin' }, role: req.auth }; },
    requireRole: async auth => { if (auth.role !== 'superadmin') throw Object.assign(new Error('无权限'), { statusCode: 403 }); },
    readJson: async req => req.body, sendJson: (res, status, body) => Object.assign(res, { status, body }),
  });
  async function request(route, { protocol = 'openai', modelProtocol = 'openai', intent = 'llm.chat', input = { prompt: '测试提示词' }, params = {}, providerMetadata = {}, auth = 'superadmin', ...extra } = {}) {
    const res = { setHeader() {} };
    await api.handle({ url: route, method: 'POST', auth, body: {
      provider: { id: 'fixture', name: '隔离服务', protocol, baseUrl, apiKey: secret, metadata: providerMetadata, models: [{ id: 'fixture-model', protocol: modelProtocol, capabilities: [intent], metadata: { parameterOverrides: { temperature: 0.17 } } }] },
      modelId: 'fixture-model', input, params, ...extra,
    } }, res);
    assert.ok(!JSON.stringify(res.body).includes(secret), 'Response leaked fixture credentials');
    return JSON.parse(JSON.stringify(res));
  }
  const failures = []; let passed = 0;
  async function test(name, run) { requests = []; try { await run(); passed++; console.log(`PASS ${name}`); } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); } }
  try {
    await test('auth blocks upstream and configuration remains untouched', async () => {
      for (const [auth, status] of [['none', 401], ['member', 403]]) assert.equal((await request('/api/providers/test', { auth })).status, status);
      assert.equal(requests.length, 0); assert.equal(writes, 0);
    });
    await test('protocol verification returns available from the real engine', async () => {
      fixture = { payload: { data: [{ id: 'fixture-model' }] } };
      const res = await request('/api/providers/verify-protocol');
      assert.equal(res.body.available, true); assert.equal(res.body.selectedProtocol, 'openai');
    });
    await test('protocol suggestion does not replace the selected protocol', async () => {
      fixture = { alternative: true };
      const res = await request('/api/providers/verify-protocol');
      assert.equal(res.body.available, false); assert.equal(res.body.selectedProtocol, 'openai');
      assert.equal(res.body.recommendedProtocol, 'gemini'); assert.ok(res.body.guidance);
    });
    await test('chat returns real text and explicit parameters', async () => {
      fixture = { payload: { choices: [{ message: { content: `真实回复 ${secret}` } }] } };
      const res = await request('/api/providers/test', { params: { temperature: 0.31 } });
      assert.equal(res.body.test.status, 'succeeded'); assert.match(res.body.test.text, /真实回复/);
      assert.deepEqual(res.body.test.videos, []); assert.deepEqual(res.body.test.audios, []);
      assert.equal(requests[0].body.model, 'fixture-model'); assert.equal(requests[0].body.temperature, 0.31);
      assert.equal(requests[0].headers.authorization, `Bearer ${secret}`);
    });
    await test('model default parameters reach the actual upstream request', async () => {
      fixture = { payload: { choices: [{ message: { content: '回复' } }] } };
      const res = await request('/api/providers/test'); assert.equal(res.body.test.status, 'succeeded'); assert.equal(requests[0].body.temperature, 0.17);
    });
    for (const [route, intent, modelProtocol] of [['test', 'llm.chat', 'openai'], ['test-image', 'image.generate', 'openai-images'], ['test-video', 'video.generate', 'video-adapter'], ['test-audio', 'audio.generate', 'audio-adapter']]) {
      await test(`${intent} rejects HTTP 200 empty result`, async () => {
        fixture = { payload: {} };
        const res = await request(`/api/providers/${route}`, { intent, modelProtocol });
        assert.equal(res.body.test.status, 'invalid'); assert.ok(res.status >= 400); assert.match(res.body.error, /请/);
      });
    }
    await test('vision requires a reference before contacting upstream', async () => {
      fixture = { payload: { choices: [{ message: { content: '看到了图片' } }] } };
      const res = await request('/api/providers/test-vision', { intent: 'llm.chat.vision' });
      assert.equal(res.status, 400); assert.match(res.body.error, /图片|素材/); assert.equal(requests.length, 0);
    });
    await test('vision sends real image and returns text', async () => {
      fixture = { payload: { choices: [{ message: { content: '看到了图片' } }] } };
      const res = await request('/api/providers/test-vision', { intent: 'llm.chat.vision', input: { prompt: '描述参考图', inputImages: [image] } });
      assert.equal(res.body.test.status, 'succeeded'); assert.equal(requests[0].body.messages[0].content[1].image_url.url, image);
    });
    await test('image edit requires reference and posts real multipart', async () => {
      fixture = { payload: { data: [{ b64_json: image.split(',')[1] }] } };
      const absent = await request('/api/providers/test-image-edit', { intent: 'image.edit', modelProtocol: 'openai-images' });
      assert.equal(absent.status, 400); assert.equal(requests.length, 0);
      const res = await request('/api/providers/test-image-edit', { intent: 'image.edit', modelProtocol: 'openai-images', input: { prompt: '保留构图', inputImages: [image] }, params: { size: '1024x1024' } });
      assert.equal(res.body.test.status, 'succeeded'); assert.equal(res.body.test.images[0], image);
      assert.match(requests[0].body, /fixture-model/); assert.match(requests[0].body, /name="image"/); assert.match(requests[0].body, /1024x1024/);
    });
    await test('OpenAI image task submission remains pending after engine parsing', async () => {
      for (const data of [{ task_id: 'openai-pending', status: 'queued' }, [{ task_id: 'openai-pending', status: 'queued' }]]) {
        requests = []; fixture = { payload: { data } };
        const res = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images' });
        assert.equal(res.body.test.status, 'pending'); assert.equal(res.body.test.taskId, 'openai-pending'); assert.equal(requests.length, 1);
      }
    });
    await test('HTTP 200 explicit application failure overrides chat text and image output', async () => {
      for (const [intent, route, modelProtocol] of [['llm.chat', 'test', 'openai'], ['image.generate', 'test-image', 'openai-images']]) {
        fixture = { payload: { error: { message: `failure ${secret}` }, choices: [{ message: { content: '不能算成功' } }], data: [{ url: `${baseUrl}/result.png` }] } };
        const res = await request(`/api/providers/${route}`, { intent, modelProtocol });
        assert.equal(res.body.test.status, 'failed'); assert.equal(res.body.code, 'UPSTREAM_TASK_FAILED'); assert.ok(res.status >= 400);
      }
    });
    await test('HTTP 200 application code failure overrides output', async () => {
      fixture = { payload: { code: 400, message: 'invalid model', data: [{ url: `${baseUrl}/result.png` }] } };
      const res = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images' });
      assert.equal(res.body.test.status, 'failed'); assert.ok(res.status >= 400);
    });
    await test('accepted application codes 201/202 preserve real output and pending task', async () => {
      fixture = { payload: { code: 201, data: [{ url: `${baseUrl}/created.png` }] } };
      const created = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images' });
      assert.equal(created.body.test.status, 'succeeded'); assert.equal(created.body.test.images[0], `${baseUrl}/created.png`);
      fixture = { payload: { code: 202, data: { task_id: 'accepted-image-task', status: 'queued' } } };
      const accepted = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images' });
      assert.equal(accepted.body.test.status, 'pending', JSON.stringify(accepted)); assert.equal(accepted.body.test.taskId, 'accepted-image-task');
      fixture = { payload: { code: 202, task_id: 'accepted-video-task', status: 'queued' } };
      const video = await request('/api/providers/test-video', { intent: 'video.generate', modelProtocol: 'video-adapter' });
      assert.equal(video.body.test.status, 'pending', JSON.stringify(video)); assert.equal(video.body.test.taskId, 'accepted-video-task');
    });
    await test('API returns only whitelist and removes encoded credential media', async () => {
      const encodedSecret = [...secret].map(character => `%${character.charCodeAt(0).toString(16)}`).join('');
      const safe = `${baseUrl}/safe.png`, sensitive = `${baseUrl}/${encodedSecret}/sensitive.png`;
      fixture = { payload: { data: [{ url: safe }, { url: sensitive }], harmlessField: 'raw diagnostics' } };
      const res = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images' });
      assert.equal(res.body.test.status, 'succeeded'); assert.deepEqual(res.body.test.images, [safe]);
      assert.ok(!JSON.stringify(res.body).includes(encodedSecret));
      assert.deepEqual(Object.keys(res.body), ['test']);
    });
    await test('tools require actual tool calls and preserve parameters', async () => {
      fixture = { payload: { choices: [{ message: { content: '随便一段文本' } }] } };
      const invalid = await request('/api/providers/test-tools', { intent: 'llm.tools' });
      assert.equal(invalid.body.test.status, 'invalid');
      fixture = { payload: { choices: [{ message: { tool_calls: [{ id: 'call-fixture', type: 'function', function: { name: 'ping', arguments: '{}' } }] } }] } };
      const res = await request('/api/providers/test-tools', { intent: 'llm.tools', params: { temperature: 0.42 } });
      assert.equal(res.body.test.status, 'succeeded'); assert.equal(res.body.test.toolCallCount, 1);
      assert.equal(requests.at(-1).body.tools[0].function.name, 'ping'); assert.equal(requests.at(-1).body.temperature, 0.42);
    });
    for (const [intent, route, modelProtocol, key, media] of [['video.generate', 'test-video', 'video-adapter', 'videos', 'data:video/mp4;base64,AAAA'], ['audio.generate', 'test-audio', 'audio-adapter', 'audios', 'data:audio/wav;base64,UklGRg==']]) {
      await test(`${intent} presents playable typed base64`, async () => {
        fixture = { payload: { data: [{ b64_json: media.split(',')[1], mime_type: media.slice(5, media.indexOf(';')) }] } };
        const res = await request(`/api/providers/${route}`, { intent, modelProtocol });
        assert.equal(res.body.test.status, 'succeeded'); assert.equal(res.body.test[key][0], media); assert.deepEqual(res.body.test.images, []);
      });
      await test(`${intent} task ID remains pending without extra submission`, async () => {
        fixture = { payload: { task_id: 'task-fixture', status: 'queued' } };
        const res = await request(`/api/providers/${route}`, { intent, modelProtocol });
        assert.equal(res.body.test.status, 'pending'); assert.equal(res.body.test.taskId, 'task-fixture'); assert.equal(requests.length, 1);
      });
    }
    await test('failed media task never becomes successful even with URL', async () => {
      fixture = { payload: { status: 'failed', task_id: 'failed-fixture', data: [{ url: `${baseUrl}/output.mp4` }] } };
      const res = await request('/api/providers/test-video', { intent: 'video.generate', modelProtocol: 'video-adapter' });
      assert.equal(res.body.test.status, 'failed'); assert.ok(res.status >= 400); assert.match(res.body.error, /请/);
    });
    await test('explicit processing states remain pending even with preview media', async () => {
      const { presentTestResult } = loadSource('provider-test-result.js');
      for (const [intent, extension] of [['image.generate', 'png'], ['video.generate', 'mp4'], ['audio.generate', 'mp3']]) {
        for (const status of ['pending', 'queued', 'running', 'processing', 'submitted', 'accepted']) {
          const value = presentTestResult({ task_id: 'processing-task', status, data: [{ url: `${baseUrl}/preview.${extension}` }] }, intent);
          assert.equal(value.status, 'pending', `${intent} ${status} must not be marked complete`);
        }
        assert.equal(presentTestResult({ task_id: 'done-task', status: 'completed', data: [{ url: `${baseUrl}/result.${extension}` }] }, intent).status, 'succeeded');
      }
    });
    await test('APIMart adapter polls the existing task once without reposting', async () => {
      fixture = { payload: { task_id: 'poll-fixture' }, poll: { status: 'completed', data: { images: [{ url: `${baseUrl}/result.png` }] } } };
      const res = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images', providerMetadata: { legacyPlatformProtocol: 'apimart' } });
      assert.equal(res.body.test.status, 'succeeded', JSON.stringify(res)); assert.equal(requests.filter(req => req.method === 'POST').length, 1);
      assert.equal(requests[1].path, '/v1/tasks/poll-fixture');
    });
    await test('adapter polling timeout retains pending task without reposting', async () => {
      fixture = { payload: { task_id: 'pending-fixture' }, poll: { status: 'running' } };
      const res = await request('/api/providers/test-image', { intent: 'image.generate', modelProtocol: 'openai-images', providerMetadata: { legacyPlatformProtocol: 'apimart' } });
      assert.equal(res.body.test.status, 'pending', JSON.stringify(res)); assert.equal(res.body.test.taskId, 'pending-fixture');
      assert.equal(requests.filter(req => req.method === 'POST').length, 1);
    });
    await test('upstream auth failures include Chinese explanation and guidance', async () => {
      fixture = { status: 401, payload: { error: { message: `invalid api key ${secret}` } } };
      const res = await request('/api/providers/test'); assert.equal(res.body.test.status, 'failed'); assert.equal(res.body.code, 'UPSTREAM_AUTH'); assert.match(res.body.error, /密钥|权限/); assert.match(res.body.error, /请/);
    });
    await test('video text without a playable result remains invalid', async () => {
      fixture = { payload: { text: 'task accepted' } };
      const res = await request('/api/providers/test-video', { intent: 'video.generate', modelProtocol: 'video-adapter' });
      assert.equal(res.body.test.status, 'invalid'); assert.equal(res.body.test.videos.length, 0);
    });
    await test('whitelist rejects unsafe sources and wrong media types', async () => {
      const modulePath = path.join(canonical, 'provider-test-result.js');
      assert.ok(fs.existsSync(modulePath), 'canonical result module must exist');
      const { presentTestResult } = loadSource('provider-test-result.js');
      const result = presentTestResult({ data: [{ url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.invalid/file.png' }, { url: `https://example.invalid/file.png?api_key=${secret}` }, { b64_json: 'AAAA', mime_type: 'video/mp4' }] }, 'image.generate', 5, [secret]);
      assert.equal(result.images.length, 0); assert.equal(result.status, 'invalid');
      assert.equal(presentTestResult({ data: [{ url: `${baseUrl}/file.mp3` }] }, 'video.generate').status, 'invalid');
      assert.equal(presentTestResult({ images: [{ url: `${baseUrl}/opaque` }] }, 'video.generate').status, 'invalid');
      const encodedSecret = [...secret].map(character => `%${character.charCodeAt(0).toString(16)}`).join('');
      assert.equal(presentTestResult({ data: [{ url: `${baseUrl}/${encodedSecret}/clip.mp4` }] }, 'video.generate', 0, [secret]).status, 'invalid');
    });
    assert.equal(writes, 0, 'Diagnostics must never save configuration');
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`${passed} diagnostic cases passed; ${failures.length} failed. Real engine, loopback HTTP only, no user configuration or credentials accessed.`);
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
