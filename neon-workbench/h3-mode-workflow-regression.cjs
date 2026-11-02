// 服务端生成方式回归：normalize 按模式裁剪素材，prepare 按模式切换工作流模板。
// 默认校验已部署运行时；配合 H3_WORKFLOW_MODULE / H3_WORKFLOW_DIR 可校验源码副本。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const runtimeApp = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app')
const modulePath = process.env.H3_WORKFLOW_MODULE || path.join(runtimeApp, 'minimax-h3-workflow.js')
const workflowDir = process.env.H3_WORKFLOW_DIR || path.join(runtimeApp, 'workflows')
const workflow = require(modulePath)
const readTemplate = name => JSON.parse(fs.readFileSync(path.join(workflowDir, name), 'utf8'))

const framesTemplate = readTemplate('minimax-h3-video-frames.json')
const referenceTemplate = readTemplate('minimax-h3-video.json')
const base = {
  prompt: '测试提示词',
  aspectRatio: '16:9',
  megapixels: 0.6,
  steps: 8,
  duration: 10,
  refImageSize: 'match',
  seed: 123,
  images: [{ url: '/output/a.png', name: 'a.png' }, { url: '/output/b.png', name: 'b.png' }, { url: '/output/c.png', name: 'c.png' }],
  videos: [{ url: '/output/v.mp4', name: 'v.mp4' }],
  audios: [{ url: '/output/s.wav', name: 's.wav' }],
}

const loadImages = generated => Object.entries(generated)
  .filter(([, node]) => node.class_type === 'LoadImage')
  .map(([id, node]) => `${id}:${node.inputs.image}`)
  .sort()

// 1. 素材按生成方式裁剪。
const textRequest = workflow.normalizeMinimaxH3Request({ ...base, mode: 'text' })
assert.deepEqual([textRequest.images.length, textRequest.videos.length, textRequest.audios.length], [0, 0, 0], '文生视频忽略全部素材')
assert.equal(textRequest.mode, 'text')
assert.equal(textRequest.prompt, '测试提示词', '文生视频提示词保持原样')

const firstRequest = workflow.normalizeMinimaxH3Request({ ...base, mode: 'first' })
assert.deepEqual([firstRequest.images.length, firstRequest.videos.length, firstRequest.audios.length], [1, 0, 0], '首帧只保留第一张图片')
const lastRequest = workflow.normalizeMinimaxH3Request({ ...base, mode: 'last' })
assert.deepEqual([lastRequest.images.length, lastRequest.videos.length, lastRequest.audios.length], [2, 0, 0], '首尾帧保留前两张图片')

const referenceRequest = workflow.normalizeMinimaxH3Request({ ...base, mode: 'reference' })
assert.deepEqual([referenceRequest.images.length, referenceRequest.videos.length, referenceRequest.audios.length], [3, 1, 1], '全能参考保留全部素材')
assert.match(referenceRequest.prompt, /参考素材：/, '全能参考自动补齐引用标记')
const untaggedRequest = workflow.normalizeMinimaxH3Request({ ...base, mode: 'first', prompt: '写实镜头 <Picture 1>' })
assert.equal(untaggedRequest.prompt, '写实镜头 <Picture 1>', '首帧等模式不做引用标记校验')

// 2. 文生视频：不接首帧/尾帧，也没有帧加载节点。
const textWorkflow = workflow.prepareMinimaxH3Workflow(framesTemplate, { ...textRequest, seed: 123 }, 'video/qa_text')
const textNode = Object.values(textWorkflow).find(node => node.class_type === 'MiniMaxH3ImageToVideo')
assert.ok(textNode, '文生视频使用 MiniMaxH3ImageToVideo 模板')
assert.equal(Object.hasOwn(textNode.inputs, 'first_frame'), false, '文生视频不接首帧')
assert.equal(Object.hasOwn(textNode.inputs, 'last_frame'), false, '文生视频不接尾帧')
assert.equal(textNode.inputs.prompt, '测试提示词')
assert.deepEqual(loadImages(textWorkflow), [], '文生视频清理模板自带的帧加载节点')
assert.equal(Object.values(textWorkflow).filter(node => node.class_type === 'SaveVideo').length, 1)

// 3. 首帧：只接首帧。
const firstWorkflow = workflow.prepareMinimaxH3Workflow(framesTemplate, { ...firstRequest, seed: 123 }, 'video/qa_first')
const firstNode = Object.values(firstWorkflow).find(node => node.class_type === 'MiniMaxH3ImageToVideo')
assert.ok(firstNode.inputs.first_frame, '首帧模式接上 first_frame')
assert.equal(Object.hasOwn(firstNode.inputs, 'last_frame'), false, '首帧模式不接尾帧')
const firstLoader = firstWorkflow[firstNode.inputs.first_frame[0]]
assert.equal(firstLoader.class_type, 'LoadImage')
assert.equal(firstLoader.inputs.image, 'a.png', '首帧使用第一张上传图片')

// 4. 首尾帧：接前两张图片。
const lastWorkflow = workflow.prepareMinimaxH3Workflow(framesTemplate, { ...lastRequest, seed: 123 }, 'video/qa_last')
const lastNode = Object.values(lastWorkflow).find(node => node.class_type === 'MiniMaxH3ImageToVideo')
assert.equal(lastWorkflow[lastNode.inputs.first_frame[0]].inputs.image, 'a.png', '首尾帧首帧取第一张')
assert.equal(lastWorkflow[lastNode.inputs.last_frame[0]].inputs.image, 'b.png', '首尾帧尾帧取第二张')

// 5. 分辨率、步数、时长、保存前缀按请求注入。
const resolutionSelector = Object.values(lastWorkflow).find(node => node.class_type === 'ResolutionSelector')
assert.equal(resolutionSelector.inputs.aspect_ratio, '16:9 (Widescreen)', '分辨率选择器写入比例')
assert.equal(resolutionSelector.inputs.megapixels, 0.6, '分辨率选择器写入档位')
assert.equal(Object.values(lastWorkflow).find(node => node.class_type === 'MiniMaxH3DualClockSamplerT8').inputs.steps, 8, '采样步数注入')
assert.equal(Object.values(lastWorkflow).find(node => node.class_type === 'PrimitiveFloat').inputs.value, 10, '时长注入')
assert.equal(Object.values(lastWorkflow).find(node => node.class_type === 'RandomNoise').inputs.noise_seed, 123, '种子注入')
assert.ok(Object.values(lastWorkflow).some(node => node.class_type === 'SaveVideo' && node.inputs.filename_prefix === 'video/qa_last'), '保存前缀注入')

// 6. 全能参考仍走多样参考模板，引用素材按顺序接线。
const referenceWorkflow = workflow.prepareMinimaxH3Workflow(referenceTemplate, { ...referenceRequest, seed: 123 }, 'video/qa_reference')
const referenceNode = Object.values(referenceWorkflow).find(node => node.class_type === 'MiniMaxH3ReferenceToVideo')
assert.ok(referenceNode, '全能参考使用 MiniMaxH3ReferenceToVideo 模板')
assert.ok(referenceNode.inputs['ref_images.ref_image_0'], '全能参考接线第一张图片')
assert.ok(referenceNode.inputs['ref_images.ref_image_2'], '全能参考接线第三张图片')
assert.ok(referenceNode.inputs['ref_videos.ref_video_0'], '全能参考接线参考视频')
assert.ok(referenceNode.inputs['ref_audios.ref_audio_0'], '全能参考接线参考音频')
assert.equal(Object.values(referenceWorkflow).filter(node => node.class_type === 'SaveVideo').length, 1)

console.log(JSON.stringify({
  ok: true,
  module: modulePath,
  modes: {
    text: { images: textRequest.images.length, loadImages: loadImages(textWorkflow).length },
    first: { images: firstRequest.images.length, frames: [firstLoader.inputs.image] },
    last: { images: lastRequest.images.length, frames: [lastWorkflow[lastNode.inputs.first_frame[0]].inputs.image, lastWorkflow[lastNode.inputs.last_frame[0]].inputs.image] },
    reference: { images: referenceRequest.images.length, videos: referenceRequest.videos.length, audios: referenceRequest.audios.length },
  },
}))
