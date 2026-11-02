// 校验任务服务按生成方式选模板：文生视频/首帧/首尾帧读 frames 模板，全能参考读默认模板。
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

const runtimeApp = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app')
const modulePath = process.env.H3_TASK_MODULE || path.join(runtimeApp, 'minimax-h3-task-service.js')
const workflowDir = process.env.H3_WORKFLOW_DIR || path.join(runtimeApp, 'workflows')
const workflowModule = process.env.H3_WORKFLOW_MODULE || path.join(runtimeApp, 'minimax-h3-workflow.js')
const referenceFile = path.join(workflowDir, 'minimax-h3-video.json')
const framesFile = path.join(workflowDir, 'minimax-h3-video-frames.json')
const vm = require('node:vm')
function loadHostModule(file) {
  const module = { exports: {} }
  const compiled = vm.runInThisContext('(function(module,exports,require){' + fs.readFileSync(file, 'utf8') + String.fromCharCode(10) + '})', { filename: file })
  compiled(module, module.exports, require)
  return module.exports
}
const { createMinimaxH3TaskService } = loadHostModule(modulePath)
const { normalizeMinimaxH3Request, prepareMinimaxH3Workflow } = loadHostModule(workflowModule)

async function runMode(mode, options = {}) {
  const reads = []
  const submitted = []
  const tasks = new Map()
  const registered = []
  const service = createMinimaxH3TaskService({
    mediaTaskService: { set: (id, value) => tasks.set(id, value), get: id => tasks.get(id), delete: id => tasks.delete(id) },
    registerMedia: async (...args) => {
      assert.notEqual(tasks.get(`qa-${mode}`)?.status, 'success', '视频入库必须先于任务成功');
      registered.push(args);
      return { id: 'qa-video-asset', name: 'BD_video_00001' };
    },
    updateTask: (id, patch) => tasks.set(id, { ...(tasks.get(id) || {}), ...patch }),
    cleanupTasks: () => {},
    workflowFile: options.workflowFile || referenceFile,
    normalizeRequest: normalizeMinimaxH3Request,
    prepareWorkflow: prepareMinimaxH3Workflow,
    sanitizeReferenceName: name => name,
    mediaReferenceToFile: async (url, name) => ({ filename: name, url }),
    comfyClient: {
      normalizeUrl: url => url,
      uploadFile: async (url, media) => ({ name: media.filename, subfolder: '' }),
      submitPrompt: async (url, workflow) => { submitted.push(workflow); return 'qa-prompt' },
      waitForHistory: async () => ({ outputs: { 428: { gifs: [{ filename: 'qa.mp4', subfolder: '' }] } }, status: { completed: true, messages: [['execution_success', {}]] } }),
      saveHistoryVideos: async () => ['/output/qa.mp4'],
    },
    formatErrorMessage: error => String(error?.message || error),
    makeUploadToken: () => 'token',
    makeUploadFilename: (kind, index) => `${kind}_${index + 1}.png`,
    fs: options.realFs ? fs : {
      ...fs,
      readFileSync: (target, encoding) => { reads.push(path.basename(String(target))); return fs.readFileSync(target, encoding) },
    },
    crypto: { randomUUID: () => 'qa-task', randomInt: () => 42 },
    now: () => 1,
  })
  const taskId = `qa-${mode}`
  tasks.set(taskId, { id: taskId, status: 'running', ownerUserId: 'trusted-owner' })
  await service.runTask(taskId, {
    mode,
    prompt: '测试',
    aspectRatio: '16:9',
    megapixels: 0.6,
    steps: options.steps || 8,
    duration: 10,
    refImageSize: 'match',
    seed: 42,
    images: mode === 'reference' ? [{ url: '/output/a.png', name: 'a.png' }] : [{ url: '/output/a.png', name: 'a.png' }, { url: '/output/b.png', name: 'b.png' }],
    videos: [],
    audios: [],
    comfyUrl: 'http://comfy.test',
  })
  assert.deepEqual(registered, [['trusted-owner', { url: '/output/qa.mp4', filename: 'qa.mp4' }, 'video/mp4', { source: 'generated' }]], '视频按任务真实账户统一登记');
  assert.equal(tasks.get(taskId).status, 'success');
  return { reads, template: submitted[0], task: tasks.get(taskId) }
}

;(async () => {
  const reference = await runMode('reference')
  assert.deepEqual(reference.reads, ['minimax-h3-video.json'], `全能参考读默认模板：${reference.reads}`)
  assert.ok(Object.values(reference.template).some(node => node.class_type === 'MiniMaxH3ReferenceToVideo'), '全能参考提交参考模板')

  const qualitySubmissions = []
  for (const mode of ['reference', 'text', 'first', 'last']) {
    for (const steps of [8, 4, 8]) {
      const result = await runMode(mode, { steps })
      const sampler = Object.values(result.template).find(node => node.class_type === 'MiniMaxH3DualClockSamplerT8')
      const lora = result.template[sampler.inputs.model[0]]
      const filename = steps === 4 ? 'minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors' : 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'
      assert.equal(sampler.inputs.steps, steps, mode + ' 实际提交步数')
      assert.equal(lora.inputs.lora_name, filename, mode + ' 实际提交 LoRA 与步数配套')
      qualitySubmissions.push({ mode, steps, lora: lora.inputs.lora_name })
    }
  }

  for (const [mode, frames] of [['text', 0], ['first', 1], ['last', 2]]) {
    const result = await runMode(mode)
    assert.deepEqual(result.reads, ['minimax-h3-video-frames.json'], `${mode} 读首尾帧模板：${result.reads}`)
    const node = Object.values(result.template).find(item => item.class_type === 'MiniMaxH3ImageToVideo')
    assert.ok(node, `${mode} 提交 MiniMaxH3ImageToVideo 模板`)
    assert.equal(Object.hasOwn(node.inputs, 'first_frame'), frames >= 1, `${mode} 首帧接线`)
    assert.equal(Object.hasOwn(node.inputs, 'last_frame'), frames >= 2, `${mode} 尾帧接线`)
    assert.ok(Object.values(result.template).every(item => item.class_type !== 'MiniMaxH3ReferenceToVideo'), `${mode} 不混入参考模板`)
  }

  // 缺少 frames 模板时给出中文错误：用只含默认模板的临时目录模拟。
  const missingDir = path.join(require('node:os').tmpdir(), `qa-h3-missing-${process.pid}`)
  fs.mkdirSync(missingDir, { recursive: true })
  fs.copyFileSync(referenceFile, path.join(missingDir, 'minimax-h3-video.json'))
  let missing = null
  try {
    await runMode('first', { workflowFile: path.join(missingDir, 'minimax-h3-video.json'), realFs: true })
  } catch (error) {
    missing = String(error?.message || error)
  }
  fs.rmSync(missingDir, { recursive: true, force: true })
  assert.ok(missing && missing.includes('minimax-h3-video-frames.json'), `缺少模板时给出中文错误：${missing}`)

  console.log(JSON.stringify({
    ok: true,
    module: modulePath,
    qualitySubmissions,
    referenceTemplate: path.basename(reference.reads[0]),
    modeReads: { text: 'minimax-h3-video-frames.json', first: 'minimax-h3-video-frames.json', last: 'minimax-h3-video-frames.json' },
    missingTemplateError: missing,
  }))
})().catch(error => { console.error(error.message || error); process.exit(1) })
