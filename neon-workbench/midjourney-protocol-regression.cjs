const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const source = path.join(__dirname, 'design-sources');
function loadRules() {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(source, 'midjourney-parameter-rules.js'), 'utf8'), { module: mod, exports: mod.exports });
  return mod.exports;
}
const moduleObject = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(source, 'media-protocol-adapters.js'), 'utf8'), {
  require: name => name === './midjourney-parameter-rules' ? loadRules() : require(path.join(runtime, name)),
  module: moduleObject, exports: moduleObject.exports, URL, AbortController, setTimeout, clearTimeout,
});
const adapters = moduleObject.exports.createMediaProtocolAdapters({ wait: async () => {} });
const provider = { id: 'fixture', protocol: 'openai', baseUrl: 'https://api.apimart.ai', apiKey: 'fixture-only' };
const model = { id: 'midjourney', protocol: 'midjourney' };
let checks = 0;
function check(actual, expected) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected); checks++; }
async function submit(params, changes = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ url: 'https://example.invalid/result.png' }] }) };
  };
  await adapters.apimart.execute({ provider, model, intent: 'image.generate', input: { prompt: '测试图片' }, params, fetch, ...changes });
  return calls[0];
}
async function bridgeRegression() {
  // Use the actual host bridge, resolver, executor, registry and engine. Only
  // the configured store and outbound network are fixtures; the new adapter
  // is loaded from design-sources, exactly as deploy.mjs will copy it.
  const { createMediaProviderBridge } = require(path.join(runtime, 'media-provider-bridge.js'));
  const { createCapabilityResolver } = require(path.join(runtime, 'provider-capability-resolver.js'));
  const { createProviderExecutor } = require(path.join(runtime, 'provider-executor.js'));
  const { createProtocolRegistry } = require(path.join(runtime, 'provider-protocol-registry.js'));
  const { createProtocolEngine } = require(path.join(runtime, 'provider-protocol-engine.js'));
  const executionModel = { id: 'opaque-model', modelProtocol: 'midjourney', protocol: 'midjourney',
    capabilities: ['image.generate', 'image.edit'],
    metadata: { parameterOverrides: { version: '8.2', raw: true, hd: true }, fixtureMarker: '完整元数据' } };
  const executionProvider = { ...provider, providerProtocol: 'openai', enabled: true, models: [executionModel] };
  const requests = [], contexts = [];
  const registry = createProtocolRegistry({ adapters: { ...adapters, apimart: {
    ...adapters.apimart,
    async execute(request) { contexts.push(request); return adapters.apimart.execute(request); },
  } } });
  const engine = createProtocolEngine({ registry, outboundFetch: async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ url: 'https://example.invalid/bridge-result.png' }] }) };
  } });
  const resolver = createCapabilityResolver({ store: { listInternal: () => [executionProvider], getAutoFallback: () => false } });
  const bridge = createMediaProviderBridge({ executor: createProviderExecutor({ resolver, engine }) });
  const input = { providerId: provider.id, modelId: executionModel.id, prompt: '完整提交链路', size: '16:9', n: 1 };
  await bridge.generateImage({ ...input, inputImages: ['https://example.invalid/ref.png'], params: {
    version: '6.1', raw: false, chaos: 0, quality: '2', iw: 1.25, stylize: 0, seed: 0, weird: 25, stop: 80, tile: true, draft: true,
  } });
  check(requests.at(-1), { url: 'https://api.apimart.ai/v1/midjourney/generations', body: {
    prompt: input.prompt, size: '16:9', version: '6.1', quality: '2', raw: false, stylize: 0, chaos: 0, weird: 25, iw: 1.25,
    seed: 0, tile: true, stop: 80, image_urls: ['https://example.invalid/ref.png'],
  } });
  check(contexts.at(-1).model.metadata, executionModel.metadata);
  check(contexts.at(-1).model.modelProtocol, 'midjourney');
  check(contexts.at(-1).provider.providerProtocol, 'openai');
  await bridge.generateImage({ ...input, params: { version: '7', raw: false, draft: true, tile: true, chaos: 0, hd: true, stop: 30 } });
  check(requests.at(-1).body, { prompt: input.prompt, size: '16:9', version: '7', raw: false, chaos: 0, tile: true, draft: true });
  await bridge.generateImage({ ...input, params: { version: '8.2', raw: false, hd: false, tile: false, chaos: 0, draft: true, stop: 30 } });
  check(requests.at(-1).body, { prompt: input.prompt, size: '16:9', version: '8.2', raw: false, hd: false, tile: false, chaos: 0 });
  const beforeInvalid = requests.length;
  await assert.rejects(() => submit({}, { model: { id: 'real-id', modelId: 'midjourney-v6', modelProtocol: 'midjourney', providerProtocol: 'apimart' } }), /独立版本/); checks++;
  await assert.rejects(() => bridge.generateImage({ ...input, params: { version: '7', chaos: 101 } }), /变化程度/); checks++;
  check(requests.length, beforeInvalid);
}
async function publicCatalogRegression() {
  const { createProviderCatalogService, providerExecutionHttpStatus } = require(path.join(runtime, 'provider-catalog-service.js'));
  const { createProviderCatalogHttpApi } = require(path.join(runtime, 'provider-catalog-http-api.js'));
  const catalog = createProviderCatalogService({
    providerStore: { publicModelsForCapability: () => [{ id: 'midjourney', providerId: provider.id, providerName: '模拟 APIMart',
      providerProtocol: 'openai', providerHost: 'api.apimart.ai', modelProtocol: 'midjourney', capabilities: ['image.generate', 'image.edit'],
      providerSortOrder: 0, modelSortOrder: 0, parameterOverrides: { version: '7' } }] },
    telemetryService: { getHealthSnapshot: () => new Map([[provider.id, { state: 'online', rank: 0 }]]) },
    imageCatalog: { catalogImageResolutions: () => [], normalizeJimengImageFamily: () => '' },
  });
  const api = createProviderCatalogHttpApi({ getPublicProviderModelCatalog: catalog.getPublicProviderModelCatalog, providerExecutionHttpStatus,
    readCatalogIdentity: () => ({ instanceId: 'fixture', revision: 1 }), sendJson: (res, status, body) => Object.assign(res, { status, body }) });
  const response = {};
  check(await api.handle({ method: 'GET', url: '/api/image-models' }, response), true);
  check(response.status, 200);
  const publicModel = response.body.models[0];
  check({ modelId: publicModel.modelId, modelProtocol: publicModel.modelProtocol, providerProtocol: publicModel.providerProtocol,
    providerHost: publicModel.providerHost, parameterOverrides: publicModel.parameterOverrides },
  { modelId: 'midjourney', modelProtocol: 'midjourney', providerProtocol: 'openai', providerHost: 'api.apimart.ai', parameterOverrides: { version: '7' } });
  check(loadRules().profile(publicModel).known, true);
  check(loadRules().variants(publicModel).length, 8);
  check(response.body.candidates[0].modelProtocol, 'midjourney');
}
async function main() {
  const typed = await submit({ version: '6.1', chaos: '0', quality: 2, iw: '1.25', seed: '0', stylize: '0', weird: '25', raw: true }, { input: { prompt: '测试', inputImages: ['https://example.invalid/ref.png'] } });
  check(typed.body, { prompt: '测试', size: '1:1', version: '6.1', chaos: 0, quality: '2', iw: 1.25, seed: 0, stylize: 0, weird: 25, raw: true, image_urls: ['https://example.invalid/ref.png'] });
  check((await submit({ version: '7', hd: true, stop: 30, draft: true })).body, { prompt: '测试图片', size: '1:1', version: '7', draft: true });
  let count = 0;
  await assert.rejects(() => adapters.apimart.execute({ provider, model, intent: 'image.generate', input: { prompt: '测试' }, params: { version: '6.1', chaos: 101 }, fetch: async () => { count++; throw Error('不得请求'); } }), /变化程度/); checks++;
  check(count, 0);
  const rules = loadRules();
  check(rules.profile(model).versions.map(v => v.key), ['8.2', '8.1', '7', '6.1', '5.2', '5.1', 'niji7', 'niji6']);
  check(rules.variants({ id: 'opaque', modelId: 'midjourney-v7', providerProtocol: 'apimart' }), []);
  check(rules.profile({ id: 'opaque', modelId: 'midjourney-v7', providerProtocol: 'apimart' }).fixedVersion, '7');
  check(rules.variants({ id: 'opaque', modelId: 'midjourney-v6', providerProtocol: 'apimart' }), []);
  check(rules.describe({ id: 'opaque', modelId: 'midjourney-v9', providerProtocol: 'apimart' }).fields, []);
  check(rules.profile({ id: 'midjourney-v7', providerProtocol: 'runninghub' }).known, false);
  check(rules.describe({ id: 'midjourney-v7', providerProtocol: 'runninghub' }).fields, []);
  check(rules.profile({ id: 'opaque', modelProtocol: 'midjourney', providerProtocol: 'openai' }).known, true);
  check(rules.profile({ id: 'opaque', modelId: 'midjourney@imagine-niji6-fast', providerProtocol: 'apimart' }).fixedVersion, '6');
  check(rules.profile({ id: 'opaque', modelId: 'midjourney@imagine-niji6-fast', providerProtocol: 'apimart' }).fixedSpeed, 'fast');
  check(rules.profile({ id: 'midjourney' }).known, true);
  check(rules.payload({ id: 'midjourney-v7', providerProtocol: 'runninghub' }, { chaos: 25, quality: '2', version: '7' }), {});
  const verified = { id: 'midjourney-v7', providerProtocol: 'runninghub', metadata: { midjourneyCapabilities: { verified: true, versions: ['7'], parameters: { chaos: { type: 'number', min: 0, max: 100, step: 1 } } } } };
  check(rules.payload(verified, { chaos: '0', quality: '2' }), { version: '7', chaos: 0 });
  check(rules.describe(model, { version: '8.2', quality: '2', draft: true, stop: 25, hd: true, chaos: 0 }).values, { version: '8.2', niji: false, hd: true, chaos: 0 });
  check(rules.payload(model, { version: '6.1', iw: 1.5 }, { hasImages: false }), { version: '6.1' });
  check(rules.payload(model, { version: '7', niji: true, iw: 2 }, { hasImages: true }), { version: '7', niji: true, iw: 2 });
  assert.throws(() => rules.payload(model, { version: '7', niji: true, iw: 2.1 }, { hasImages: true }), /参考图影响/); checks++;
  assert.throws(() => rules.payload(model, { version: '5.2', quality: '2' }), /生成质量/); checks++;
  assert.throws(() => rules.payload(model, { version: '6.1', seed: 1.2 }), /随机种子/); checks++;
  assert.throws(() => rules.payload(model, { version: '6.1', chaos: 'bad' }), /变化程度/); checks++;
  assert.throws(() => rules.payload(model, { version: '6.1', raw: 'yes' }), /更贴近提示词/); checks++;
  assert.throws(() => rules.payload(model, { version: '9' }), /模型版本/); checks++;
  assert.throws(() => rules.payload(model, { version: '8.2', speed: 'turbo' }), /生成速度/); checks++;
  check(rules.payload(model, { version: '7', raw: 'false', style: 'auto', quality: 'auto', chaos: '0' }), { version: '7', raw: false, chaos: 0 });
  const onDefaults = { ...model, metadata: { parameterOverrides: { version: '8.2', raw: true, hd: true, tile: true } } };
  check(rules.payload(onDefaults, { raw: false, hd: false, tile: false }), { version: '8.2', raw: false, hd: false, tile: false });
  check((await submit({ version: '8.2', raw: false, hd: false, tile: false }, { model: onDefaults })).body, { prompt: '测试图片', size: '1:1', version: '8.2', raw: false, hd: false, tile: false });
  check(rules.payload({ ...model, metadata: { parameterOverrides: { niji: true, version: '7' } } }, { niji: false }), { version: '7', niji: false });
  check(rules.payload(model, { version: '7', negative_prompt: 'default' }), { version: '7', negative_prompt: 'default' });
  check(rules.payload({ ...model, metadata: { parameterOverrides: { version: '7', chaos: 20, quality: '2' } } }, { chaos: 0 }), { version: '7', chaos: 0, quality: '2' });
  check((await submit({ version: '7' }, { model: { id: 'opaque', modelId: 'midjourney', metadata: { parameterOverrides: { chaos: '30' } } } })).body, { prompt: '测试图片', size: '1:1', version: '7', chaos: 30 });
  const refs = Array.from({ length: 5 }, (_, index) => `https://example.invalid/${index}.png`);
  check((await submit({ version: '7', quality: '2', n: 4, resolution: '4K', extra: '--hd' }, { input: { prompt: '原样提示词 --ar 1:1', inputImages: refs } })).body, { prompt: '原样提示词 --ar 1:1', size: '1:1', version: '7', quality: '2', image_urls: refs.slice(0, 4) });
  check(rules.payload(model, { version: '7', cref: 'https://example.invalid/ref.png', cw: 25, sref: 'https://example.invalid/style.png', sw: '0' }), { version: '7', sref: 'https://example.invalid/style.png', sw: 0 });
  check(rules.payload(model, { version: '6.1', cref: 'https://example.invalid/ref.png', cw: '0', style: 'raw', negative_prompt: '模糊', nsfw_check: true, metadata: { origin: 'fixture' } }), { version: '6.1', raw: true, negative_prompt: '模糊', nsfw_check: true, metadata: { origin: 'fixture' }, cref: 'https://example.invalid/ref.png', cw: 0 });
  check((await submit({ midjourneyOperation: 'blend', version: '7', chaos: 40, speed: 'fast' }, { input: { inputImages: ['https://example.invalid/1.png', 'https://example.invalid/2.png'] } })).body, { size: '1:1', speed: 'fast', image_urls: ['https://example.invalid/1.png', 'https://example.invalid/2.png'] });
  assert.equal((await submit({ midjourneyOperation: 'edit', version: '7', chaos: 0 }, { input: { prompt: '编辑', inputImages: ['https://example.invalid/ref.png'] } })).url, 'https://api.apimart.ai/v1/midjourney/generations/edits'); checks++;
  for (const [operation, images] of [['edit', []], ['blend', refs], ['blend', refs.slice(0, 1)]]) {
    await assert.rejects(() => submit({ midjourneyOperation: operation }, { input: { inputImages: images } }), /参考图/); checks++;
  }
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(source, 'midjourney-parameter-rules.js'), 'utf8'), browser);
  check(browser.MidjourneyParameterRules.payload(model, { version: '7', seed: 0 }), { version: '7', seed: 0 });
  await publicCatalogRegression();
  await bridgeRegression();
  console.log(`Midjourney 规则与协议回归：${checks} 项通过（隔离模拟请求，无付费生成）`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
