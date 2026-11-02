const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const origin = 'http://127.0.0.1:33199';
function loadTs(file, imports, extras = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, 'src/lib', file + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => { assert.ok(imports[name], name); return imports[name]; }, URL, location: { origin, href: origin + '/' }, ...extras });
  return exports;
}
function hostFunction(name) {
  const source = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8');
  const start = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  const rest = source.slice(start + 1), end = rest.slice(1).search(/\n(?:async )?function \w+\(/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
(async () => {
  let virtual = [{ nodeTitle: '图片3' }, { nodeTitle: '视频7' }, { nodeTitle: '场景' }];
  let mounted = [{ dataset: { nodeTitle: '图片5' } }];
  const titleContext = { canvasVirtualStore: { values: () => virtual }, canvasPlane: { querySelectorAll: () => mounted } };
  vm.createContext(titleContext); vm.runInContext(hostFunction('nextCanvasGeneratorTitle'), titleContext);
  assert.equal(titleContext.nextCanvasGeneratorTitle('image'), '图片6');
  assert.equal(titleContext.nextCanvasGeneratorTitle('video'), '视频8');
  assert.equal(titleContext.nextCanvasGeneratorTitle('audio'), '音频1');
  virtual = []; mounted = [];
  assert.equal(titleContext.nextCanvasGeneratorTitle('image'), '图片1', '另一画布独立编号');
  let calls = [];
  const request = async url => { calls.push(url); return { asset: { id: 'asset-actual-old-result', name: '雪地露营', downloadName: '雪地露营.webp' } }; };
  const api = { '@/lib/api': { request }, '@/lib/asset-media': { assetMedia: entry => entry.preview } };
  const library = loadTs('asset-library', api);
  const candidate = await library.resolveAssetCandidate({ name: '独立节点标题', resourceId: 'wrong-node-id', media: { kind: 'image', url: '/output/old-result.webp' } });
  assert.equal(candidate.name, '雪地露营'); assert.equal(candidate.resourceId, 'asset-actual-old-result');
  assert.match(calls[0], /old-result.webp/);
  const denied = loadTs('asset-library', { ...api, '@/lib/api': { request: async () => { throw Object.assign(new Error('无权访问'), { status: 403 }); } } });
  await assert.rejects(() => denied.resolveAssetCandidate(candidate), /无权访问/);
  const legacy = loadTs('asset-library', { ...api, '@/lib/api': { request: async () => { throw Object.assign(new Error('旧资源'), { status: 404 }); } } });
  assert.equal(await legacy.resolveAssetCandidate(candidate), candidate);
  let downloaded, fetched;
  class BlobURL extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} }
  const download = loadTs('media-download', api, {
    URL: BlobURL, setTimeout: fn => fn(),
    fetch: async url => { fetched = url; return { ok: true, blob: async () => ({}) }; },
    document: { body: { append() {} }, createElement: () => ({ click() { downloaded = this.download; }, remove() {} }) },
  });
  await download.downloadMedia('/output/old-result.webp', '节点标题.png');
  assert.equal(downloaded, '雪地露营.webp'); assert.equal(fetched, origin + '/output/old-result.webp');
  const history = loadTs('history-media', { '@/lib/asset-media': { assetMedia: entry => entry.preview } });
  const records = [{ id: 'legacy', type: 'image', title: '96ced101-10da-4d64-8d75-f88b717b7894', createdAt: '2026-10-01', images: [{ src: '/output/old.png' }, { src: '/output/other.png', name: '手动名称' }] }];
  const entries = history.collectHistoryMedia([], records, 'owner');
  assert.ok(!entries[0].entry.resource.title.includes('96ced101'));
  assert.equal(entries.find(item => item.key.endsWith('/other.png')).entry.resource.title, '手动名称');
  records[0].title = '保留用户旧标题';
  assert.equal(history.collectHistoryMedia([], records, 'owner')[0].entry.resource.title, '保留用户旧标题');
  const uploadContext = { IMAGE_UPLOAD_API_URL: '/upload', IMAGE_CHUNK_UPLOAD_API_URL: '/chunk', crypto: { randomUUID: () => 'test' }, fetch: async () => ({ ok: true, json: async () => ({ complete: true, url: '/output/upload.png', asset: { id: 'upload-asset', name: '产品正面' } }) }) };
  vm.createContext(uploadContext);
  vm.runInContext(hostFunction('uploadCanvasImageFile') + '\n' + hostFunction('uploadImageFileInChunks'), uploadContext);
  const file = { name: '产品正面.png', type: 'image/png', size: 100, slice: () => ({}) };
  assert.equal(await uploadContext.uploadCanvasImageFile(file), '/output/upload.png', '原调用仍返回 URL');
  const uploaded = await uploadContext.uploadCanvasImageFile(file, { returnAsset: true });
  assert.equal(uploaded.assetId, 'upload-asset'); assert.equal(uploaded.filename, '产品正面');
  const chunked = await uploadContext.uploadCanvasImageFile({ ...file, size: 7 * 1024 * 1024 }, { returnAsset: true });
  assert.equal(chunked.assetId, 'upload-asset');
  const collection = require('../host-sources/app/canvas-asset-collection-rules.js');
  assert.equal(collection.normalizeMember({ id: 'member-id', assetId: 'upload-asset', kind: 'image', src: uploaded.url }).assetId, 'upload-asset');
  console.log('PASS actual-result lookup, download name/format, permission errors, legacy names, upload/chunk asset IDs');
})().catch(error => { console.error(error); process.exitCode = 1; });
