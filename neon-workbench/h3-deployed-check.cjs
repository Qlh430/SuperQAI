const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const app = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app')
const dataDir = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/..', 'AI-OS-Portable-1.0.5-win-x64/data')
function loadHostModule(file) {
  const mod = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: mod, exports: mod.exports, require, console, Object, JSON, Number, String, Array, Set, Map, Math, RegExp, Error,
  }, { filename: file })
  return mod.exports
}
const mod = loadHostModule(path.join(app, 'minimax-h3-workflow.js'))
const workflowPath = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/..', 'AI-OS-Portable-1.0.5-win-x64/data/workflows/minimax-h3-video.json')
const template = JSON.parse(fs.readFileSync(path.resolve(workflowPath), 'utf8'))
const request = mod.normalizeMinimaxH3Request({
  prompt: '<Picture 1> 作为首帧，参考 <Video 1> 运镜',
  images: [{ url: '/output/x.png', name: 'x.png' }],
  videos: [{ url: '/output/y.mp4', name: 'y.mp4' }],
  aspect_ratio: '16:9', megapixels: 0.6, steps: 8, duration: 5, ref_image_size: 'match', seed: 777,
})
const workflow = mod.prepareMinimaxH3Workflow(template, request, 'video/check')
assert.equal(workflow['390'].inputs.prompt, request.prompt, 'H3 节点直接收到提示词')
assert.equal(workflow['392'].inputs.steps, 8, 'T8 采样器步数')
assert.equal(workflow['366'].inputs.value, 5, '时长 5 秒')
assert.equal(workflow['376'].inputs.aspect_ratio, '16:9 (Widescreen)', '画幅')
assert.equal(workflow['376'].inputs.megapixels, 0.6, '像素档')
assert.equal(workflow['383'].inputs.noise_seed, 777, '种子')
assert.equal(workflow['375'].inputs.filename_prefix, 'video/check', '输出前缀')
assert.equal(workflow['364'], undefined, '模板图片节点已移除')
assert.ok(Object.keys(workflow).length > 20, '其余管线节点保留')
// 新工作流里 H3 的输入必须仍然指向存在的节点
for (const [key, value] of Object.entries(workflow['390'].inputs)) {
  if (!Array.isArray(value)) continue
  assert.ok(workflow[String(value[0])], `${key} 指向的节点 ${value[0]} 必须存在`)
}
console.log(JSON.stringify({ ok: true, checks: 10, note: '部署后的模块 + 部署后的工作流注入正确' }))
