const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// The workbench package is type:module, so the runtime CommonJS module loads in a
// sandbox exactly like the other canvas-host regressions do.
function loadHostModule(file) {
  const mod = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: mod, exports: mod.exports, require, console, Object, JSON, Number, String, Array, Set, Map, Math, RegExp, Error,
  }, { filename: file })
  return mod.exports
}
const { normalizeMinimaxH3Request, prepareMinimaxH3Workflow } = loadHostModule(path.join(__dirname, 'design-sources/minimax-h3-workflow.js'))

// A trimmed stand-in for the historical graph: same node ids, classes and input
// keys the old workflow used, without keeping a full copy of that workflow.
const legacyTemplate = {
  '206': { class_type: 'VAELoader', inputs: { vae_name: 'a.safetensors' } },
  '207': { class_type: 'VAELoader', inputs: { vae_name: 'b.safetensors' } },
  '208': { class_type: 'CLIPLoader', inputs: { clip_name: 'c.safetensors', type: 'x', device: 'default' } },
  '210': { class_type: 'RandomNoise', inputs: { noise_seed: 0 } },
  '215': { class_type: 'LoadImage', inputs: { image: 'template-1.png' } },
  '216': { class_type: 'LoadImage', inputs: { image: 'template-2.png' } },
  '219': { class_type: 'BasicScheduler', inputs: { scheduler: 'simple', steps: 20, denoise: 1, model: ['385', 0] } },
  '222': {
    class_type: 'MiniMaxH3ReferenceToVideo',
    inputs: {
      prompt: ['238', 0], width: ['229', 0], height: ['229', 1], length: ['225', 0],
      ref_image_size: 'match', clip: ['208', 0], vae: ['206', 0], audio_vae: ['207', 0],
      'ref_images.ref_image_0': ['215', 0], 'ref_images.ref_image_1': ['216', 0],
    },
  },
  '225': { class_type: 'PrimitiveFloat', inputs: { value: 12 } },
  '229': { class_type: 'ResolutionSelector', inputs: { aspect_ratio: '16:9 (Widescreen)', megapixels: 0.6, multiple: 32 } },
  '230': { class_type: 'SaveVideo', inputs: { filename_prefix: 'video/template', format: 'auto', codec: 'auto', video: ['374', 0] } },
  '234': { class_type: 'LoadImage', inputs: { image: 'template-3.png' } },
  '238': { class_type: 'CR Text', inputs: { text: '' } },
  '374': { class_type: 'CreateVideo', inputs: { fps: 24, images: ['372', 0], audio: ['373', 0] } },
  '385': { class_type: 'BasicGuider', inputs: { model: ['389', 0], conditioning: ['390', 0] } },
}

const newPath = path.join(__dirname, 'design-sources/workflows/minimax-h3-video.json')
const newTemplate = JSON.parse(fs.readFileSync(newPath, 'utf8'))

const request = normalizeMinimaxH3Request({
  prompt: '镜头推进，<Picture 1> 作为首帧，参考 <Video 1> 的运镜与 <Audio 1> 的节奏',
  images: [{ url: '/output/a.png', name: 'a.png' }],
  videos: [{ url: '/output/b.mp4', name: 'b.mp4' }],
  audios: [{ url: '/output/c.wav', name: 'c.wav' }],
  aspect_ratio: '9:16', megapixels: 1, steps: 8, duration: 8, ref_image_size: 'max', seed: 12345,
})

// --- 历史图：历史节点号优先，行为必须与替换前一致 ---
const legacy = prepareMinimaxH3Workflow(legacyTemplate, request, 'video/legacy')
assert.deepEqual(legacy['222'].inputs.prompt, ['238', 0], '旧图 H3 提示词仍指向 CR Text 节点')
assert.equal(legacy['238'].inputs.text, request.prompt, '旧图 CR Text 收到提示词')
assert.equal(legacy['219'].inputs.steps, 8, '旧图步数写进 BasicScheduler')
assert.equal(legacy['225'].inputs.value, 8, '旧图时长')
assert.equal(legacy['229'].inputs.megapixels, 1, '旧图画幅像素')
assert.equal(legacy['229'].inputs.aspect_ratio, '9:16 (Portrait Widescreen)', '旧图画幅')
assert.equal(legacy['210'].inputs.noise_seed, 12345, '旧图种子')
assert.equal(legacy['230'].inputs.filename_prefix, 'video/legacy', '旧图输出前缀')
for (const id of ['215', '216', '234']) assert.equal(legacy[id], undefined, `旧图模板参考节点 ${id} 被移除`)
assert.equal(legacy['374'].inputs.fps, 24, '旧图管线节点保留')
assert.ok(Object.values(legacy).every(node => node.class_type !== 'LoadImage' || node.inputs.image === 'a.png'), '旧图只留下新建的参考图节点')

// --- 当前图：按类型接管节点号 ---
const fresh = prepareMinimaxH3Workflow(newTemplate, request, 'video/fresh')
assert.equal(fresh['390'].inputs.prompt, request.prompt, '新图提示词写进 H3 节点')
assert.equal(fresh['392'].inputs.steps, 8, '新图步数写进 T8 采样器')
assert.equal(fresh['392'].inputs.sampler_name, 'dual_clock_euler', '新图采样器其余参数保留')
assert.equal(fresh['366'].inputs.value, 8, '新图时长')
assert.equal(fresh['376'].inputs.megapixels, 1, '新图画幅像素')
assert.equal(fresh['376'].inputs.multiple, 32, '新图倍率')
assert.equal(fresh['383'].inputs.noise_seed, 12345, '新图种子')
assert.equal(fresh['375'].inputs.filename_prefix, 'video/fresh', '新图输出前缀')
assert.equal(fresh['364'], undefined, '新图模板 LoadImage 被移除')
assert.equal(fresh['457'], undefined, '新图孤立 LoadImage 被移除')
const wired = Object.entries(fresh['390'].inputs).filter(([key]) => key.startsWith('ref_images.'))
assert.equal(wired.length, 1, '新图按请求重新接线参考图')
assert.equal(fresh[wired[0][1][0]].class_type, 'LoadImage', '参考图指向新建的 LoadImage')
assert.equal(fresh[wired[0][1][0]].inputs.image, 'a.png', '参考图使用上传后的文件名')
const videoRef = Object.entries(fresh['390'].inputs).find(([key]) => key === 'ref_videos.ref_video_0')
assert.ok(videoRef, '新图接上参考视频')
assert.equal(fresh[videoRef[1][0]].class_type, 'GetVideoComponents', '参考视频经组件拆分')
const audioRef = Object.entries(fresh['390'].inputs).find(([key]) => key === 'ref_audios.ref_audio_0')
assert.equal(fresh[audioRef[1][0]].class_type, 'LoadAudio', '新图接上参考音频')
assert.equal(fresh['390'].inputs.length[0], '370', '新图时长仍经数学表达式转帧数')
assert.ok(Object.values(fresh).every(node => node.class_type !== 'LoadImage' || node.inputs.image), '新图不存在无输入的模板图片节点')
for (const [key, value] of Object.entries(fresh['390'].inputs)) {
  if (Array.isArray(value)) assert.ok(fresh[String(value[0])], `新图 ${key} 指向的节点必须存在`)
}

// --- 缺少 H3 节点时必须明确报错 ---
assert.throws(() => prepareMinimaxH3Workflow({ '1': { class_type: 'KSampler', inputs: {} } }, request, 'x'), /MiniMaxH3ReferenceToVideo is missing/)

console.log(JSON.stringify({ ok: true, checks: 28, note: '历史节点号优先与按类型定位两条路径都覆盖，不再保存旧工作流副本' }))
