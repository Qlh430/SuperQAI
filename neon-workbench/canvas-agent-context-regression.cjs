const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('host-sources/app/canvas-agent-core.js', 'utf8');
const serializer = fs.readFileSync('neon-workbench/design-sources/script-before-save-bridge.js', 'utf8');
const sandbox = {
  module: { exports: {} },
  require: () => ({ CAPABILITY_REGISTRY: [], getRisk: () => 'safe' }),
  globalThis: null,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'canvas-agent-core.js' });
const { summarizeCanvasBoard } = sandbox.module.exports;
const board = {
  id: 'board-1', title: 'Agent context fixture',
  nodes: [
    { id: 'audio', kind: 'audio-generator', nodeTitle: '配音', audioGeneration: { mode: 'speech', qwenMode: 'clone', modelId: 'qwen-tts', prompt: '旁白', parameters: { language: 'zh' }, result: { name: 'voice.wav', url: '/output/voice.wav', duration: 4 }, qwenDrafts: { clone: { referenceAudio: { name: 'ref.wav', url: '/output/ref.wav' } } } } },
    { id: 'api-video', kind: 'video-api', nodeTitle: '广告片', apiVideoPrompt: '镜头推进', apiVideoModel: 'model-x', apiVideoRatio: '16:9', apiVideoResolution: '1080p', apiVideoDuration: 6, apiVideoTaskId: 'task-secret' },
    { id: 'video-result', kind: 'video-output', nodeTitle: '成片', videoHistory: [{ id: 'v1', name: 'scene.mp4', src: '/output/scene.mp4', duration: 8, mimeType: 'video/mp4', promptSummary: '产品展示' }], videoActiveId: 'v1', videoName: 'scene.mp4', videoMimeType: 'video/mp4', videoDuration: 8, videoPromptSummary: '产品展示', videoSrc: '/output/scene.mp4' },
    { id: 'group', kind: 'group', groupTitle: '镜头组', groupMembers: ['audio', 'api-video'], groupLayout: 'row' },
    { id: 'grid', kind: 'grid-editor', nodeTitle: '宫格拆分', gridEditorState: { sourceNodeId: 'video-result', sourceSrc: '/output/source.png', sourceName: 'source.png', sourceWidth: 1200, sourceHeight: 800, rows: 2, columns: 3, uniformGap: 8, selectedCellKey: 'r1-c2' } },
    { id: 'image', kind: 'image', nodeTitle: '参考图', imageName: 'apple.png', imageSrc: '/asset/apple.png', uploadOnly: true, imageJobState: 'completed', prompt: 'red apple', model: 'img-model', size: '1024x1024' },
  ],
  connections: [{ from: 'audio', to: 'api-video', toPort: 'audio' }, { from: 'video-result', to: 'grid', toPort: 'source' }],
};
const context = summarizeCanvasBoard(board, ['group']);
const byId = Object.fromEntries(context.nodes.map(node => [node.id, node]));
assert.equal(byId.group.title, '镜头组');
assert.deepEqual(Array.from(byId.group.member_ids), ['audio', 'api-video']);
assert.equal(byId.audio.mode, 'speech');
assert.equal(byId.audio.qwen_mode, 'clone');
assert.equal(byId.audio.parameters.language, 'zh');
assert.equal(byId.audio.reference_audio.name, 'ref.wav');
assert.equal(byId['api-video'].duration, 6);
assert.equal(byId['video-result'].result_count, 1);
assert.equal(byId['video-result'].active_result.prompt_summary, '产品展示');
assert.equal(byId.grid.rows, 2);
assert.equal(byId.grid.cell_count, 6);
assert.equal(byId.grid.selected_cell, 'r1-c2');
assert.equal(byId.image.material_available, true);
assert.ok(context.connections.some(edge => edge.from === 'audio' && edge.to === 'api-video'));
assert.ok(!JSON.stringify(context).includes('task-secret'));
assert.ok(!JSON.stringify(context).includes('/output/voice.wav'));
for (const fragment of ['base.audioGeneration =', 'base.apiVideoPrompt =', 'serializeCanvasVideoOutputState(node)', 'base.groupMembers =', 'getCanvasGridEditorState(node)']) assert.ok(serializer.includes(fragment), `missing serializer contract: ${fragment}`);
const longBoard = { nodes: Array.from({ length: 100 }, (_, index) => ({ id: `node-${index}`, kind: 'image', imageName: `图${index}` })), connections: [{ from: 'node-99', to: 'node-98', fromPort: 'image', toPort: 'input' }] };
const prioritized = summarizeCanvasBoard(longBoard, ['node-99']);
assert.ok(prioritized.nodes.some(node => node.id === 'node-99'));
assert.ok(prioritized.nodes.some(node => node.id === 'node-98'));
assert.equal(prioritized.total_node_count, 100);
assert.equal(prioritized.nodes.length, 80);
assert.equal(prioritized.connections[0].from_port, 'image');
console.log('canvas-agent-context-regression: PASS');
