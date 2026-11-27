const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const source = path.join(__dirname, 'design-sources/h3-commerce-workflow.js');
const taskServiceSource = path.join(__dirname, 'design-sources/minimax-h3-task-service.js');
const template = JSON.parse(fs.readFileSync(path.join(__dirname, 'design-sources/workflows/h3-commerce-video.json'), 'utf8'));
function load() {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(source, 'utf8'))(Module.createRequire(source), m, m.exports);
  return m.exports;
}
const input = () => ({ prompt_a: '第一段正式提示词', prompt_b: '第二段正式提示词', images: [1, 2, 3, 4].map(i => ({ url: `/output/test-${i}.png`, name: `uploaded-${i}.png` })) });
test('commerce clones complete original API graph and mutates only permitted fields', () => {
  const { normalizeCommerceRequest, prepareCommerceWorkflow } = load();
  const before = structuredClone(template);
  const graph = prepareCommerceWorkflow(template, normalizeCommerceRequest(input()), 'video/test');
  assert.equal(Object.keys(graph).length, 40);
  assert.deepEqual(template, before);
  assert.equal(graph['254'].inputs.prompt, input().prompt_a);
  assert.equal(graph['454'].inputs.prompt, input().prompt_b);
  for (const [index, id] of ['705', '704', '703', '701'].entries()) {
    assert.equal(graph[id].inputs.image, `uploaded-${index + 1}.png`);
    for (const h3 of ['254', '454']) assert.deepEqual(graph[h3].inputs[`ref_images.ref_image_${index}`], [id, 0]);
  }
  const expected = structuredClone(before);
  expected['254'].inputs.prompt = input().prompt_a;
  expected['454'].inputs.prompt = input().prompt_b;
  ['705', '704', '703', '701'].forEach((id, i) => { expected[id].inputs.image = `uploaded-${i + 1}.png`; });
  expected['604'].inputs.filename_prefix = 'video/test';
  assert.deepEqual(graph, expected, 'all samplers, guide, audio, trims, seeds and merge inputs remain byte-equivalent as JSON');
});
test('rejects missing inputs, unsafe references, absent nodes and rewired guide/audio/merge', () => {
  const { normalizeCommerceRequest, prepareCommerceWorkflow } = load();
  for (const change of [{ prompt_a: '' }, { prompt_b: '' }, { images: [] }, { images: [1, 2, 3, 4].map(() => ({ url: 'file:///C:/invalid.png' })) }]) {
    assert.throws(() => normalizeCommerceRequest({ ...input(), ...change }), /提示词|四张|图片|素材/);
  }
  for (const id of ['254', '454', '705', '704', '703', '701', '269', '469', '501', '502', '604']) {
    const graph = structuredClone(template); delete graph[id];
    assert.throws(() => prepareCommerceWorkflow(graph, normalizeCommerceRequest(input()), 'out'), /工作流/);
  }
  for (const [id, field] of [['454', 'ref_audios.ref_audio_0'], ['501', 'image'], ['604', 'audio']]) {
    const graph = structuredClone(template); graph[id].inputs[field] = ['705', 0];
    assert.throws(() => prepareCommerceWorkflow(graph, normalizeCommerceRequest(input()), 'out'), /工作流/);
  }
});
test('commerce ratio and megapixel controls only change inputs on shared ResolutionSelector 115', () => {
  const { prepareCommerceWorkflow } = load();
  const baseline = prepareCommerceWorkflow(template, input(), 'video/test');
  const ratios = [
    ['1:1', '1:1 (Square)'],
    ['2:3', '2:3 (Portrait Photo)'],
    ['3:2', '3:2 (Photo)'],
    ['3:4', '3:4 (Portrait Standard)'],
    ['4:3', '4:3 (Standard)'],
    ['9:16', '9:16 (Portrait Widescreen)'],
    ['16:9', '16:9 (Widescreen)'],
    ['21:9', '21:9 (Ultrawide)'],
  ];
  for (const [aspect_ratio, label] of ratios) {
    for (const megapixels of [0.6, 1]) {
      const expected = structuredClone(baseline);
      Object.assign(expected[115].inputs, { aspect_ratio: label, megapixels });
      const prepared = prepareCommerceWorkflow(template, { ...input(), aspect_ratio, megapixels }, 'video/test');
      assert.deepEqual(prepared[115].inputs, expected[115].inputs, `${aspect_ratio} at ${megapixels} MP reaches ResolutionSelector 115`);
      for (const id of ['254', '454']) {
        assert.deepEqual(prepared[id].inputs.width, ['115', 0], `${id} width uses the selected resolution`);
        assert.deepEqual(prepared[id].inputs.height, ['115', 1], `${id} height uses the selected resolution`);
      }
      expected[254].inputs.prompt = prepared[254].inputs.prompt;
      expected[454].inputs.prompt = prepared[454].inputs.prompt;
      for (const id of ['705', '704', '703', '701']) expected[id].inputs.image = prepared[id].inputs.image;
      expected[604].inputs.filename_prefix = prepared[604].inputs.filename_prefix;
      assert.deepEqual(prepared, expected, 'the selected resolution is the only workflow behavior that changes');
    }
  }
  assert.throws(() => prepareCommerceWorkflow(template, { ...input(), aspect_ratio: '5:7' }, 'video/test'), /画幅/);
  assert.throws(() => prepareCommerceWorkflow(template, { ...input(), megapixels: 12 }, 'video/test'), /分辨率/);
  const changed = structuredClone(template);
  changed[454].inputs.width = ['233', 0];
  assert.throws(() => prepareCommerceWorkflow(changed, input(), 'video/test'), /工作流/);
});
