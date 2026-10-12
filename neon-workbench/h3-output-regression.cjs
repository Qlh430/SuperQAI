const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const app = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app')
const source = path.join(__dirname, 'design-sources')
function load(file) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require, console }, { filename: file })
  return module.exports
}
;(async () => {
  const workflowModule = load(path.join(source, 'minimax-h3-workflow.js'))
  const serviceFile = path.join(process.env.H3_OUTPUT_DEPLOYED ? app : source, 'minimax-h3-task-service.js')
  const { createMinimaxH3TaskService } = load(fs.existsSync(serviceFile) ? serviceFile : path.join(app, 'minimax-h3-task-service.js'))
  const states = [], chosen = []
  let submitted = 0
  let template = JSON.parse(fs.readFileSync(path.join(source, 'workflows/minimax-h3-video.json'), 'utf8'))
  let history = { outputs: { '375': { images: [{ filename: 'minimax_h3_test.mp4', subfolder: 'video', type: 'output' }] } } }
  const service = createMinimaxH3TaskService({
    mediaTaskService: { set() {} }, updateTask: (id, state) => states.push(state), cleanupTasks() {},
    workflowFile: 'workflow.json', normalizeRequest: workflowModule.normalizeMinimaxH3Request,
    prepareWorkflow: workflowModule.prepareMinimaxH3Workflow, sanitizeReferenceName: workflowModule.sanitizeReferenceName,
    mediaReferenceToFile() {}, formatErrorMessage: e => e.message, makeUploadToken: () => 'test', makeUploadFilename: v => v,
    fs: { existsSync: () => true, readFileSync: () => JSON.stringify(template) },
    comfyClient: {
      normalizeUrl: v => v, submitPrompt: async () => { submitted++; return 'prompt-test' }, waitForHistory: async () => history,
      saveHistoryVideos: async (url, record, prefix, ids) => {
        chosen.push(Array.from(ids))
        return workflowModule.collectComfyVideoOutputs(record, ids).map(item => '/output/' + item.filename)
      },
    },
  })
  const request = workflowModule.normalizeMinimaxH3Request({ prompt: '苹果掉落', seed: 42 })
  await service.runTask('task-test', { ...request, comfyUrl: 'http://comfy.test' })
  assert.deepEqual(chosen[0], ['375'], '跟随实际 SaveVideo 节点 375 读取视频')
  assert.equal(states.at(-1).status, 'success', '工作流已完成的视频不会误报失败')
  assert.equal(states.at(-1).videos[0], '/output/minimax_h3_test.mp4', '视频返回原节点')
  template['777'] = template['375']; delete template['375']
  history = { outputs: { '777': { videos: [{ filename: 'renumbered.mp4' }] }, '375': { images: [{ filename: 'stale.mp4' }] } } }
  await service.runTask('task-renumbered', { ...request, comfyUrl: 'http://comfy.test' })
  assert.deepEqual(chosen[1], ['777'], '再次换节点编号仍能读取真实保存节点')
  assert.equal(states.at(-1).videos[0], '/output/renumbered.mp4', '只读取本工作流的结果节点')
  history = { outputs: { '777': { images: [{ filename: 'preview.png' }] } } }
  await assert.rejects(service.runTask('task-empty', { ...request, comfyUrl: 'http://comfy.test' }), /未找到.*视频.*777/, '没有视频时显示含节点编号的中文错误')
  template['230'] = template['777']; delete template['777']
  history = { outputs: { '230': { gifs: [{ filename: 'legacy.mp4', type: 'output' }] } } }
  await service.runTask('task-legacy', { ...request, comfyUrl: 'http://comfy.test' })
  assert.deepEqual(chosen[3], ['230'], '历史保存节点继续可用')
  assert.equal(states.at(-1).videos[0], '/output/legacy.mp4', '历史输出字段仍可读取')
  delete template['230']
  await assert.rejects(service.runTask('task-invalid', { ...request, comfyUrl: 'http://comfy.test' }), /缺少保存视频的节点/, '工作流缺少保存节点时显示中文错误')
  assert.equal(submitted, 4, '缺少保存节点时不向 ComfyUI 提交生成')
  console.log(JSON.stringify({ ok: true, checks: 10 }))
})().catch(e => { console.error(e); process.exitCode = 1 })
