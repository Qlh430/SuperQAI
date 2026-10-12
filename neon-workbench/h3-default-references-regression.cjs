const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = process.env.H3_DEFAULT_DEPLOYED
  ? path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app')
  : path.join(__dirname, 'design-sources')
function load(file) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require, console })
  return module.exports
}
const api = load(path.join(source, 'minimax-h3-workflow.js'))
const template = JSON.parse(fs.readFileSync(path.join(source, 'workflows/minimax-h3-video.json'), 'utf8'))
const images = [1, 2, 3].map(i => ({ url: `/output/banana-${i}.png`, name: `banana-${i}.png` }))
const videos = [{ url: '/output/clip.mp4', name: 'clip.mp4' }]
const audios = [{ url: '/output/voice.wav', name: 'voice.wav' }]
const request = api.normalizeMinimaxH3Request({ prompt: '香蕉被人拿起剥开', images: images.slice(0, 1), duration: 10, steps: 8 })
assert.equal(request.images.length, 1, '未手写标记的已连接香蕉图必须保留')
assert.ok(request.prompt.includes('<Picture 1>'))
assert.ok(request.prompt.endsWith('香蕉被人拿起剥开'))
const workflow = api.prepareMinimaxH3Workflow(template, { ...request, seed: 42 }, 'video/qa-default')
assert.equal(workflow['3000'].inputs.image, 'banana-1.png', '香蕉文件被实际 LoadImage 加载')
assert.deepEqual(Array.from(workflow['390'].inputs['ref_images.ref_image_0']), ['3000', 0])
const mixed = api.normalizeMinimaxH3Request({ prompt: '<Picture 3> 的主体动起来', images, videos, audios })
assert.equal(mixed.images.length, 3)
assert.equal(mixed.videos.length, 1); assert.equal(mixed.audios.length, 1)
assert.equal(mixed.images[2].name, 'banana-3.png', '显式引用编号保持素材区对应顺序')
assert.ok(mixed.prompt.endsWith('<Picture 3> 的主体动起来'))
for (const tag of ['<Picture 1>', '<Picture 2>', '<Picture 3>', '<Video 1>', '<Audio 1>']) assert.equal(mixed.prompt.split(tag).length - 1, 1, '引用只绑定一次')
const repeated = api.normalizeMinimaxH3Request({ prompt: mixed.prompt, images: mixed.images, videos: mixed.videos, audios: mixed.audios })
assert.equal(repeated.prompt, mixed.prompt, '重复规范化不重复添加前缀')
const explicit = '<Picture 1> 拿起剥开，按 <Video 1> 的运镜和 <Audio 1> 的声音'
assert.equal(api.normalizeMinimaxH3Request({ prompt: explicit, images: images.slice(0, 1), videos, audios }).prompt, explicit)
assert.equal(api.normalizeMinimaxH3Request({ prompt: '纯文字生成' }).prompt, '纯文字生成')
assert.throws(() => api.normalizeMinimaxH3Request({ prompt: '<Picture 4>', images }), /does not match/)
assert.throws(() => api.normalizeMinimaxH3Request({ prompt: '生成', images: Array.from({ length: 10 }, () => images[0]) }), /at most 9/)
const hostFile = process.env.H3_DEFAULT_DEPLOYED ? 'script.js' : 'script-before-save-bridge.js'
const host = fs.readFileSync(path.join(source, hostFile), 'utf8')
const groups = host.slice(host.indexOf('const CANVAS_H3_MENTION_GROUPS ='), host.indexOf('function getCanvasH3MentionItems'))
const binder = host.slice(host.indexOf('function bindCanvasH3PromptReferences('), host.indexOf('let canvasH3MentionState ='))
const bind = vm.runInNewContext(`${groups}\n${binder}\nbindCanvasH3PromptReferences`)
for (const [prompt, refs] of [['香蕉被人拿起剥开', { images: images.slice(0, 1) }], ['<Picture 3> 的主体动起来', { images, videos, audios }], [explicit, { images: images.slice(0, 1), videos, audios }], ['纯文字生成', {}]]) {
  assert.equal(bind(prompt, refs), api.normalizeMinimaxH3Request({ prompt, ...refs }).prompt, '提交端与服务端引用绑定一致')
}
if (process.env.H3_LEGACY_WORKFLOW) {
  const legacy = load(process.env.H3_LEGACY_WORKFLOW)
  const refs = { images, videos, audios }
  const prompt = bind('<Picture 3> 的主体动起来', refs)
  const legacyRequest = legacy.normalizeMinimaxH3Request({ prompt, ...refs })
  assert.equal(legacyRequest.images.length, 3, '当前进程已缓存的旧后端也会保留全部图片')
  assert.equal(legacyRequest.videos.length, 1); assert.equal(legacyRequest.audios.length, 1)
  assert.equal(legacyRequest.prompt, prompt, '旧后端不改变已完整绑定的引用编号')
}
console.log(JSON.stringify({ ok: true, defaultImage: true, mixedReferences: true, stableIndexes: true, idempotent: true, hostParity: true, legacyCompatible: Boolean(process.env.H3_LEGACY_WORKFLOW) }))
