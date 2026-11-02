const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sourcePath = process.env.QA_DEPLOYED === '1' ? '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app/script.js' : 'design-sources/script-before-save-bridge.js';
const script = fs.readFileSync(path.resolve(__dirname, sourcePath), 'utf8');
const code = script.slice(script.indexOf('async function openCanvasInlineOutpaint('), script.indexOf('// 扩图外框超出可视区时'));
function harness() {
  const pending = [], touched = [], statuses = [];
  const makeNode = id => { const classes = new Set(['canvas-node']); return { id, isConnected: true, dataset: {}, classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) }, querySelector: () => ({ append() {} }) }; };
  const ctx = { console, pending, touched, statuses, canvasImageToolInteraction: null, canvasInlineOutpaintState: null,
    document: { createElement: () => ({ addEventListener() {}, querySelector: () => ({}), dataset: {} }) },
    window: { addEventListener() {} }, ResizeObserver: class { observe() {} }, requestAnimationFrame: cb => cb(),
    resolveCanvasImageToolSource: node => ({ url: node.id }), getCanvasInlineOutpaint: () => null,
    beginCanvasImageToolInteraction: (node, tool) => { const interaction = { node, tool }; ctx.canvasImageToolInteraction = interaction; return interaction; },
    buildCanvasInlineOutpaintRatioStrip: () => '', loadImageElement: url => new Promise((resolve, reject) => pending.push({ url, resolve, reject })),
    setCanvasInlineOutpaintRatio: node => touched.push(node.id), setCanvasComfyPadding() {}, getCanvasComfyPadding: () => ({}), renderCanvasInlineOutpaintRatioStrip() {},
    layoutCanvasInlineOutpaint() {}, ensureCanvasInlineOutpaintVisible() {}, closeCanvasInlineOutpaint: () => { ctx.canvasInlineOutpaintState = null; },
    setCanvasNodeStatus: (node, message) => statuses.push({ id: node.id, message }) };
  vm.createContext(ctx); vm.runInContext(code, ctx); return { ctx, pending, touched, statuses, a: makeNode('a'), b: makeNode('b') };
}
(async () => {
  const checks = [];
  for (const fail of [false, true]) {
    const h = harness(); const first = h.ctx.openCanvasInlineOutpaint(h.a); const second = h.ctx.openCanvasInlineOutpaint(h.b);
    if (fail) h.pending[0].reject(new Error('旧图片失败')); else h.pending[0].resolve({ naturalWidth: 800, naturalHeight: 600 });
    assert.equal(await first, false, '过期扩图加载必须直接退出');
    assert.equal(h.ctx.canvasInlineOutpaintState?.node, h.b, '旧扩图失败不能关闭新节点操作区');
    assert.deepEqual(h.touched, [], '旧扩图成功不能改参数或重新显示'); assert.deepEqual(h.statuses, [], '旧加载错误不覆盖当前状态');
    h.pending[1].resolve({ naturalWidth: 1200, naturalHeight: 900 }); assert.equal(await second, true); assert.equal(h.b.dataset.comfyOutpaintSourceWidth, '1200');
    checks.push(fail ? '旧扩图失败不关闭新操作区' : '旧扩图完成不重开旧节点');
  }
  console.log(JSON.stringify({ checks }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
