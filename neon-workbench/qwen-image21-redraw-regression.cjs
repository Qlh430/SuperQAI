const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const servicePath = path.join(__dirname, 'design-sources', 'comfy-workflow-task-service.js')
const serviceModule = { exports: {} }
new Function('module', 'exports', 'require', '__filename', '__dirname', fs.readFileSync(servicePath, 'utf8'))(
  serviceModule, serviceModule.exports, require, servicePath, path.dirname(servicePath),
)
const { createComfyWorkflowTaskService } = serviceModule.exports
const workflowFile = path.join(__dirname, 'design-sources', 'workflows', 'qwen-image21-redraw.json')
const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'))
for (const id of ['193', '22', '260', '262', '38']) assert.ok(workflow[id], `缺少工作流节点 ${id}`)

const tasks = new Map()
const submitted = []
const service = createComfyWorkflowTaskService({
  mediaTaskService: {
    set: (id, value) => tasks.set(id, value),
    get: (id) => tasks.get(id) || null,
    update: (id, patch) => tasks.set(id, { ...(tasks.get(id) || {}), ...patch }),
    cleanupExpired: () => {},
    values: () => [...tasks.values()],
  },
  workflowFiles: {
    ttp: workflowFile, seedvr2: workflowFile, shoeSwap: workflowFile, outpaint: workflowFile,
    runninghubOutpaint: workflowFile, flux2KleinEdit: workflowFile, qwenEditAngle: workflowFile,
    qwenImage21Redraw: workflowFile, removeBackground: workflowFile,
  },
  comfyClient: {
    normalizeUrl: (value) => value || 'http://127.0.0.1:8188',
    uploadDataUrl: async (_url, _data, filename) => ({ name: `uploaded_${filename}` }),
    submitPrompt: async (_url, value) => { submitted.push(value); return 'prompt-redraw' },
  waitForHistory: async () => ({ outputs: { '38': { images: [{ filename: 'out.png', type: 'output' }] } } }),
  saveHistoryImages: async (_url, _history, _prefix, preferredOutputIds) => {
    assert.deepEqual(preferredOutputIds, ['38'], `应从最终保存图像节点 38 取结果，实际取的是 ${JSON.stringify(preferredOutputIds)}`)
    return ['/output/qwen-redraw.png']
  },
  },
  comfyBackgroundRemoval: {},
  getImageReferenceDimensions: () => ({ width: 1024, height: 1024 }),
  runRunningHubOutpaintTask: () => {},
  readJson: async () => ({}),
  sendJson: () => {},
  formatErrorMessage: (error) => String(error?.message || error || ''),
})

async function run() {
  await service.runQwenImage21RedrawTask('redraw-task', {
    comfy_url: 'http://127.0.0.1:8188',
    image: 'data:image/png;base64,image',
    name: '原图.png',
    mask_image: 'data:image/png;base64,mask',
    mask_name: '遮罩.png',
    prompt: '',
  })
  assert.equal(submitted.length, 1)
  const submittedWorkflow = submitted[0]
  assert.equal(submittedWorkflow['193'].inputs.image.startsWith('uploaded_'), true)
  assert.equal(submittedWorkflow['22'].inputs.Text, '')
  assert.equal(submittedWorkflow['290'].inputs.image.startsWith('uploaded_'), true)
  assert.deepEqual(submittedWorkflow['201'].inputs['遮罩'], ['290', 1])
  assert.deepEqual(submittedWorkflow['249'].inputs['遮罩'], ['290', 1])
  assert.deepEqual(submittedWorkflow['262'].inputs.boolean, ['260', 1])
  assert.equal(tasks.get('redraw-task').status, 'success')
  assert.deepEqual(tasks.get('redraw-task').images, ['/output/qwen-redraw.png'])

  await service.runQwenImage21RedrawTask('redraw-task-with-prompt', {
    comfy_url: 'http://127.0.0.1:8188',
    image: 'data:image/png;base64,image',
    name: '原图.png',
    mask_image: 'data:image/png;base64,mask',
    mask_name: '遮罩.png',
    prompt: '把绿色瓶子替换成红色瓶子',
  })
  assert.equal(submitted.length, 2)
  const promptedWorkflow = submitted[1]
  assert.equal(promptedWorkflow['22'].inputs.Text, '把绿色瓶子替换成红色瓶子')
  assert.deepEqual(promptedWorkflow['262'].inputs.boolean, ['260', 1])
  assert.deepEqual(promptedWorkflow['262'].inputs.on_true, ['252', 0])
  assert.deepEqual(promptedWorkflow['262'].inputs.on_false, ['212', 0])
  assert.equal(tasks.get('redraw-task-with-prompt').status, 'success')
  assert.equal(tasks.get('redraw-task-with-prompt').message, '局部重绘完成。')
  assert.deepEqual(tasks.get('redraw-task-with-prompt').images, ['/output/qwen-redraw.png'])
  console.log(JSON.stringify({ ok: true, outputNode: '38', emptyPrompt: true, nonEmptyPrompt: true, maskNode: '290' }, null, 2))
}

run().catch((error) => { console.error(error); process.exit(1) })
