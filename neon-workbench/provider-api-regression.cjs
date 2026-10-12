const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const source = path.join(__dirname, 'design-sources/provider-http-api.js');
const moduleObject = { exports: {} };
vm.runInNewContext(fs.readFileSync(fs.existsSync(source) ? source : path.join(runtime, 'provider-http-api.js'), 'utf8'), {
  require: name => require(path.join(runtime, name)), module: moduleObject, exports: moduleObject.exports,
  URL, Date, Set, WeakSet, Object, Number, String, Boolean, Array, Error, TypeError,
});
const { createProviderHttpApi } = moduleObject.exports;
async function main() {
  const secret = 'fixture-secret-only';
  let saved = { id: 'p', name: '服务', protocol: 'openai', baseUrl: 'https://example.invalid', apiKey: secret, models: [{ id: 'm', capabilities: ['llm.chat'] }] };
  let revision = 5, mutations = 0, calls = [], audits = [];
  const publicProvider = () => ({ ...saved, apiKey: '••••', hasApiKey: Boolean(saved.apiKey) });
  const store = {
    listPublic: () => [publicProvider()], getPublic: () => publicProvider(),
    reveal: id => { if (id !== 'p') throw Object.assign(new Error('不存在'), { code: 'provider_not_found' }); return structuredClone(saved); },
    save: payload => { mutations++; saved = { ...saved, ...payload, apiKey: payload.clearApiKey ? '' : payload.apiKey ?? saved.apiKey }; return publicProvider(); },
    setEnabled: (id, enabled) => { if (id !== 'p') throw Object.assign(new Error('不存在'), { code: 'provider_not_found' }); mutations++; saved.enabled = enabled; return publicProvider(); },
    remove: id => { if (id !== 'p') return false; mutations++; return true; },
  };
  const api = createProviderHttpApi({ store,
    registry: { listPublic: () => [], platformProtocolId: p => p, inferModelConfiguration: m => m },
    engine: { fetchModels: async p => { calls.push(p); return [{ id: 'new', apiKey: secret }]; }, verifyProtocol: async p => { calls.push(p); return { ok: true }; }, execute: async p => { calls.push(p); return { text: '成功', apiKey: secret }; } },
    requireSignedIn: async req => { if (req.auth === 'none') throw Object.assign(new Error('请登录'), { statusCode: 401 }); return { user: { id: 'admin' }, role: req.auth }; },
    requireRole: async auth => { if (auth.role !== 'superadmin') throw Object.assign(new Error('无权限'), { statusCode: 403 }); },
    readJson: async req => req.body || {}, sendJson: (res, status, body) => Object.assign(res, { status, body }),
    appendAudit: item => audits.push(item), onCatalogChange: () => ++revision, readCatalogRevision: () => revision,
  });
  async function request(url, body, auth = 'superadmin', method = 'POST') {
    const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; } };
    const handled = await api.handle({ url, body, auth, method }, res);
    return { ...res, handled };
  }
  for (const [auth, status] of [['none', 401], ['member', 403]]) {
    const res = await request('/api/providers/p/secret', {}, auth);
    assert.equal(res.status, status); assert.ok(!JSON.stringify(res).includes(secret));
  }
  const revealed = await request('/api/providers/p/secret');
  assert.equal(revealed.status, 200); assert.deepEqual(JSON.parse(JSON.stringify(revealed.body)), { apiKey: secret });
  assert.equal(revealed.headers['cache-control'], 'no-store');
  assert.equal(mutations, 0); assert.equal(revision, 5); assert.equal(audits.length, 0);
  assert.equal((await request('/api/providers/missing/secret')).status, 404);
  assert.equal((await request('/api/providers/p/secret', {}, 'superadmin', 'GET')).status, 405);
  assert.equal((await request('/api/settings/providers/key')).status, 410);
  for (const route of ['/api/providers/models', '/api/providers/verify-protocol', '/api/providers/test']) {
    for (const draft of [{}, { apiKey: '' }, { clearApiKey: true }, { apiKey: '••••' }]) {
      const res = await request(route, { providerId: 'p', modelId: 'm', provider: { id: 'p', ...draft } });
      assert.equal(res.status, 200);
      assert.equal(calls.at(-1).apiKey, draft.clearApiKey || draft.apiKey === '' ? '' : secret);
      assert.ok(!JSON.stringify(res.body).includes(secret));
      assert.equal(mutations, 0); assert.equal(revision, 5);
    }
  }
  for (const url of ['/api/providers', '/api/providers/p']) assert.ok(!JSON.stringify((await request(url, {}, 'superadmin', 'GET')).body).includes(secret));
  const locked = () => { throw Object.assign(new Error('服务不可用'), { code: 'PROVIDER_SUBSYSTEM_LOCKED' }); };
  api.setAvailability(locked);
  assert.equal((await request('/api/providers/p/secret')).status, 503);
  api.setAvailability(() => true);
  const enabled = await request('/api/providers/p/enabled', { enabled: false });
  assert.equal(enabled.body.catalogRevision, 6);
  const failed = await request('/api/providers/missing', {}, 'superadmin', 'DELETE');
  assert.equal(failed.status, 404); assert.equal(revision, 6); assert.equal(failed.body.catalogRevision, undefined);
  const cleared = await request('/api/providers', { id: 'p', clearApiKey: true });
  assert.equal(cleared.body.catalogRevision, 7); assert.equal(saved.apiKey, '');
  assert.equal((await request('/api/providers/p/secret')).body.apiKey, '');
  const deleted = await request('/api/providers/p', {}, 'superadmin', 'DELETE');
  assert.equal(deleted.body.catalogRevision, 8);
  assert.ok(!JSON.stringify(audits).includes(secret));
  console.log('PASS provider API: authorization, no-store secret, redaction, explicit draft clearing, isolated discovery, saved revisions');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
