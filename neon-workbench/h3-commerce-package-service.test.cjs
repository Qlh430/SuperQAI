const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FILE_NAMES, createH3CommercePackageService, resolveH3CommerceImageSnapshot } = require('../host-sources/app/h3-commerce-package-service');

test('saves exactly four package files under an authorized board directory', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-commerce-package-'));
  let checked = '';
  const service = createH3CommercePackageService({
    outputDir,
    ensureReferencedResource: async (userId, reference) => {
      assert.equal(userId, 'qa-user');
      assert.equal(reference.refId, 'board-1');
      return { id: 'resource-1' };
    },
    resourceAccess: { assertWrite: async (userId, resourceId) => { checked = `${userId}:${resourceId}`; } },
  });
  const files = Object.fromEntries(FILE_NAMES.map(name => [name, `content:${name}`]));
  const result = await service.save('qa-user', 'board-1', files);
  assert.equal(checked, 'qa-user:resource-1');
  assert.deepEqual(result.files.map(file => file.name), FILE_NAMES);
  for (const file of result.files) {
    const diskPath = path.join(outputDir, file.url.replace('/output/', ''));
    assert.equal(fs.readFileSync(diskPath, 'utf8'), files[file.name]);
  }
});

test('rejects incomplete package before creating output', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-commerce-package-'));
  const service = createH3CommercePackageService({
    outputDir,
    ensureReferencedResource: async () => ({ id: 'r' }),
    resourceAccess: { assertWrite: async () => {} },
  });
  await assert.rejects(service.save('qa-user', 'board-1', { 'prompt-a.txt': 'A' }), /缺少文件/);
  assert.deepEqual(fs.readdirSync(outputDir), []);
});

test('duplicate source nodes remain independent, ordered slot references', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-slot-package-'));
  const ids = ['scene', 'main', 'main', 'detail'];
  const urls = ids.map(id => '/output/' + id + '.png');
  const service = createH3CommercePackageService({
    outputDir,
    ensureReferencedResource: async (_, { refId }) => ({ id: refId }),
    resourceAccess: { assertWrite() {}, assertRead() {} },
    async resolveTarget(_owner, _board, _node, sources, snapshots) {
      assert.deepEqual(sources, ids);
      assert.deepEqual(snapshots, urls);
      return sources.map((id, index) => ({ node_id: id, slot: index + 1, url: snapshots[index] }));
    },
  });
  const saved = await service.save('user', 'board', {
    'prompt-a.txt': 'A', 'prompt-b.txt': 'B', 'package.md': 'Plan', 'result.json': '{}',
  }, { node_id: 'video', image_node_ids: ids, image_source_urls: urls });
  const result = await service.read('user', 'board', saved.package_id);
  assert.deepEqual(result.image_references.map(ref => [ref.slot, ref.node_id]), [[1, 'scene'], [2, 'main'], [3, 'main'], [4, 'detail']]);
});

test('four slots keep their exact historical versions even when every slot uses one node', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-slot-history-'));
  const image = {
    kind: 'image', resultSrc: '/output/c.png', currentGenerationId: 'c',
    generationHistory: ['a', 'b', 'c'].map(id => ({ kind: 'image', id, savedUrl: `/output/${id}.png` })),
  };
  const service = createH3CommercePackageService({
    outputDir,
    ensureReferencedResource: async (_, { refId }) => ({ id: refId }),
    resourceAccess: { assertWrite() {}, assertRead() {} },
    resolveTarget: async (_owner, _board, _node, ids, urls) => ids.map((id, index) => ({
      node_id: id, slot: index + 1, ...resolveH3CommerceImageSnapshot(image, urls[index]),
    })),
  });
  const files = { 'prompt-a.txt': 'A', 'prompt-b.txt': 'B', 'package.md': 'Plan', 'result.json': '{}' };
  const urls = ['/output/a.png', '/output/b.png', '/output/c.png', '/output/a.png'];
  const binding = { node_id: 'video', image_node_ids: Array(4).fill('image-001'), image_source_urls: urls };
  const { package_id } = await service.save('user', 'board', files, binding);
  image.resultSrc = '/output/b.png';
  image.currentGenerationId = 'b';
  const stored = await service.read('user', 'board', package_id);
  assert.deepEqual(stored.image_references.map(ref => ref.url), urls);
  assert.deepEqual(stored.image_references.map(ref => ref.result_id), ['a', 'b', 'c', 'a']);
  assert.deepEqual(stored.image_references.map(ref => ref.node_id), binding.image_node_ids);
  await assert.rejects(service.save('user', 'board', files, { ...binding, image_source_urls: ['/output/other.png', ...urls.slice(1)] }), /图片版本/);
});

test('board-authorized read restores four files and the persisted node and ordered image association', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-commerce-readback-'));
  const materialIds = ['scene', 'main', 'other-view', 'detail'];
  const service = createH3CommercePackageService({
    outputDir,
    ensureReferencedResource: async (_user, { refId }) => ({ id: refId }),
    resourceAccess: {
      assertWrite: async () => {},
      assertRead: async (user, id) => {
        if (user !== 'author' || id !== 'board-1') throw Object.assign(new Error('denied'), { statusCode: 403 });
      }
    },
    async resolveTarget(_user, board, target, sourceIds) {
      assert.equal(board, 'board-1');
      assert.equal(target, 'video-1');
      assert.deepEqual(sourceIds, materialIds);
      return sourceIds.map((nodeId, index) => ({ node_id: nodeId, slot: index + 1, url: `/output/${nodeId}.png` }));
    }
  });
  const files = { 'prompt-a.txt': 'first', 'prompt-b.txt': 'second', 'package.md': '# Plan', 'result.json': '{"prompt_a":"first","prompt_b":"second"}' };
  const binding = { node_id: 'video-1', image_node_ids: materialIds };
  const first = await service.save('author', 'board-1', files, binding);
  const stored = await service.read('author', 'board-1', first.package_id);
  assert.equal(stored.node_id, 'video-1');
  assert.deepEqual(stored.image_references.map(item => item.node_id), materialIds);
  assert.equal(stored.contents['prompt-a.txt'], 'first');
  assert.equal(stored.contents['prompt-b.txt'], 'second');
  assert.equal(Object.keys(stored.contents).length, 4);
  assert.match(first.files[0].url, /^\/api\/canvas-agent\/h3-commerce-package\?/);
  await assert.rejects(service.read('other', 'board-1', first.package_id), /denied/);
  await assert.rejects(service.read('author', 'board-1', '../result.json'), /编号/);
  const newer = await service.save('author', 'board-1', { ...files, 'package.md': '# Revised' }, binding);
  assert.notEqual(newer.package_id, first.package_id);
  assert.equal((await service.read('author', 'board-1', first.package_id)).contents['package.md'], '# Plan');
});
