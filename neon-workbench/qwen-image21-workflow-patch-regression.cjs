// 服务端改写 Qwen-image2.1 工作流时的输入名回归（纯 Node，不需要画布或 ComfyUI）：
// 1. 增强器（565）的参考图输入名必须与模板一致——第一张是「图片」，不是「图片1」，
//    写错会让 ComfyUI 报 enhance_prompt() got an unexpected keyword argument 图片1；
// 2. 改写只能改/删模板里已有的输入，不能凭空新增输入名（这是一条通用护栏）；
// 3. 提示词 / 种子 / 尺寸这三个输入也必须落在模板已有的字段上。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// design-sources 下的服务端模块是 CommonJS，而工作台包的 package.json 声明了
// "type": "module"，直接 require 会被当成 ESM；这里按 CommonJS 语义就地求值。
const servicePath = path.join(__dirname, 'design-sources', 'comfy-workflow-task-service.js')
const serviceModule = { exports: {} }
new Function('module', 'exports', 'require', '__filename', '__dirname', fs.readFileSync(servicePath, 'utf8'))(
  serviceModule,
  serviceModule.exports,
  require,
  servicePath,
  path.dirname(servicePath),
)
const { createComfyWorkflowTaskService } = serviceModule.exports

const WORKFLOW_DIR = path.join(__dirname, 'design-sources', 'workflows')
const EDIT_FILE = path.join(WORKFLOW_DIR, 'qwen-image21-edit.json')
const GENERATE_FILE = path.join(WORKFLOW_DIR, 'qwen-image21-generate.json')

function makeService(workflowFiles) {
  const noop = () => {}
  return createComfyWorkflowTaskService({
    mediaTaskService: { set: noop, get: () => null, update: noop, cleanupExpired: noop, values: () => [] },
    workflowFiles,
    comfyClient: {},
    comfyBackgroundRemoval: {},
    getImageReferenceDimensions: () => ({ width: 1024, height: 1024 }),
    runRunningHubOutpaintTask: noop,
    readJson: async () => ({}),
    sendJson: noop,
    formatErrorMessage: (error) => String(error?.message || error || ''),
  })
}

const workflowFiles = {
  ttp: path.join(WORKFLOW_DIR, 'upscale-ttp.json'),
  seedvr2: path.join(WORKFLOW_DIR, 'upscale-seedvr2.json'),
  shoeSwap: path.join(WORKFLOW_DIR, 'shoe-swap.json'),
  outpaint: path.join(WORKFLOW_DIR, 'outpaint.json'),
  runninghubOutpaint: path.join(WORKFLOW_DIR, 'outpaint-runninghub.json'),
  flux2KleinEdit: path.join(WORKFLOW_DIR, 'flux2-klein-edit.json'),
  qwenEditAngle: path.join(WORKFLOW_DIR, 'qwen-edit-angle.json'),
  removeBackground: path.join(WORKFLOW_DIR, 'remove-background.json'),
  qwenImage21Edit: EDIT_FILE,
  qwenImage21Generate: GENERATE_FILE,
}

const service = makeService(workflowFiles)
const readTemplate = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const keySet = (node) => Object.keys(node?.inputs || {})

// ---- 一、模板契约：增强器与编码器的参考图输入名 ----
const editTemplate = readTemplate(EDIT_FILE)
const enhancer = editTemplate['565']
const encoder = editTemplate['497']
assert.equal(enhancer?.class_type, 'TE_Qwen_Image_2_1_Prompt_Enhancer', '编辑模板 565 应是提示词增强器')
assert.equal(encoder?.class_type, 'TextEncodeQwenImage21', '编辑模板 497 应是文本编码器')
const enhancerKeys = keySet(enhancer).filter((key) => /^图片/.test(key))
assert.deepEqual(enhancerKeys, ['图片', '图片2', '图片3', '图片4', '图片5', '图片6', '图片7', '图片8'],
  `增强器的参考图输入名：${JSON.stringify(enhancerKeys)}`)
const encoderKeys = keySet(encoder).filter((key) => /^images\.image_\d$/.test(key))
assert.deepEqual(encoderKeys, ['images.image_1', 'images.image_2', 'images.image_3', 'images.image_4', 'images.image_5', 'images.image_6', 'images.image_7', 'images.image_8'],
  `编码器的参考图输入名：${JSON.stringify(encoderKeys)}`)

// ---- 二、真跑一遍服务端的改写：1 张、3 张、8 张参考图，都不能新增输入名 ----
const cases = [
  { count: 1, names: ['a.png'] },
  { count: 3, names: ['a.png', 'b.png', 'c.png'] },
  { count: 8, names: ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'g.png', 'h.png'] },
]
for (const { count, names } of cases) {
  const pristine = readTemplate(EDIT_FILE)
  const workflow = readTemplate(EDIT_FILE)
  const used = service.applyQwenImage21References(workflow, names)
  assert.equal(used, count, `${count} 张参考图应全部用上：${used}`)
  for (const nodeId of Object.keys(pristine)) {
    const before = new Set(keySet(pristine[nodeId]))
    const added = keySet(workflow[nodeId]).filter((key) => !before.has(key))
    assert.deepEqual(added, [], `节点 ${nodeId} 被写入了模板里没有的输入名：${JSON.stringify(added)}（${count} 张参考图）`)
  }
  // 用上的槽位要真的接上、按顺序对号入座，没用的槽位要被摘掉。
  const slotTable = [
    ['475', '532', 'images.image_1', '图片'],
    ['505', '551', 'images.image_2', '图片2'],
    ['507', '552', 'images.image_3', '图片3'],
    ['506', '554', 'images.image_4', '图片4'],
    ['541', '553', 'images.image_5', '图片5'],
    ['542', '557', 'images.image_6', '图片6'],
    ['543', '556', 'images.image_7', '图片7'],
    ['544', '555', 'images.image_8', '图片8'],
  ]
  slotTable.forEach(([load, scale, encoderKey, enhancerKey], index) => {
    if (index >= count) {
      assert.equal(workflow[load], undefined, `没用的参考图节点 ${load} 应被摘掉`)
      assert.equal(workflow[scale], undefined, `没用的缩放节点 ${scale} 应被摘掉`)
      assert.equal(workflow['497'].inputs[encoderKey], undefined, `没用的编码器输入 ${encoderKey} 应被摘掉`)
      assert.equal(workflow['565'].inputs[enhancerKey], undefined, `没用的增强器输入 ${enhancerKey} 应被摘掉`)
      return
    }
    assert.equal(workflow[load].inputs.image, names[index], `参考图 ${load} 应写入 ${names[index]}`)
    assert.deepEqual(workflow[scale].inputs.image, [load, 0], `缩放节点 ${scale} 应接上 ${load}`)
    assert.deepEqual(workflow['497'].inputs[encoderKey], [scale, 0], `编码器 ${encoderKey} 应接上 ${scale}`)
    assert.deepEqual(workflow['565'].inputs[enhancerKey], [scale, 0], `增强器 ${enhancerKey} 应接上 ${scale}`)
  })
}

// ---- 三、提示词 / 种子 / 尺寸写在模板已有的字段上 ----
const generated = readTemplate(GENERATE_FILE)
assert.ok(Object.prototype.hasOwnProperty.call(generated['517'].inputs, 'value'), '生成模板 517 应有 value（提示词）')
assert.ok(Object.prototype.hasOwnProperty.call(generated['524'].inputs, 'seed'), '生成模板 524 应有 seed')
assert.deepEqual(keySet(generated['512']).sort(), ['aspect_ratio', 'megapixels', 'multiple'].sort(), `尺寸节点字段：${JSON.stringify(keySet(generated['512']))}`)
const edited = readTemplate(EDIT_FILE)
assert.ok(Object.prototype.hasOwnProperty.call(edited['571'].inputs, 'value'), '编辑模板 571 应有 value（提示词）')
assert.ok(Object.prototype.hasOwnProperty.call(edited['502'].inputs, 'seed'), '编辑模板 502 应有 seed')
assert.deepEqual(keySet(edited['13']).sort(), ['aspect_ratio', 'megapixels', 'multiple'].sort(), `尺寸节点字段：${JSON.stringify(keySet(edited['13']))}`)

// ---- 三之二、编辑模式的出图尺寸：开关必须切到「自定义尺寸」 ----
// 编辑模板的 KSampler 取样尺寸来自 482 ComfySwitchNode：false 时用编码器 497 的 latent
// （跟着参考图尺寸走，模板里第一张参考图固定 1.5 MP → 928×1664），true 时用
// EmptyLatentImage 479（宽高来自 ResolutionSelector 13）。应用面板给了比例/分辨率，
// 就必须打开这个开关，否则用户看到的尺寸和选的不一样。
const switchNode = edited['482']
assert.match(String(switchNode?.class_type || ''), /Switch/i, `编辑模板 482 应是尺寸开关：${switchNode?.class_type}`)
assert.deepEqual(switchNode.inputs.on_true, ['479', 0], `开关打开时应取样 EmptyLatentImage(479) 的 latent：${JSON.stringify(switchNode.inputs)}`)
assert.deepEqual(switchNode.inputs.on_false, ['497', 2], `开关关闭时应取样编码器(497) 的 latent：${JSON.stringify(switchNode.inputs)}`)
assert.equal(switchNode.inputs.switch, false, `模板默认跟随参考图尺寸：${JSON.stringify(switchNode.inputs)}`)
assert.deepEqual(edited['479'].inputs.width, ['13', 0], 'EmptyLatentImage 宽应来自 ResolutionSelector')
assert.deepEqual(edited['479'].inputs.height, ['13', 1], 'EmptyLatentImage 高应来自 ResolutionSelector')
const switched = readTemplate(EDIT_FILE)
assert.equal(service.applyQwenImage21CustomSize(switched, true), true, '应能切开自定义尺寸开关')
assert.equal(switched['482'].inputs.switch, true, `开关应被置为 true：${JSON.stringify(switched['482'].inputs)}`)
assert.deepEqual(keySet(switched['482']), keySet(edited['482']), '切开开关不应新增输入名')
assert.equal(service.applyQwenImage21CustomSize(switched, false), true, '应能关回跟随参考图')
assert.equal(switched['482'].inputs.switch, false, '开关应能关回 false')
// 开关打开 + ResolutionSelector 打上档位后的组合：取样尺寸节点拿到的就是用户选的那一档。
const sized = readTemplate(EDIT_FILE)
service.applyQwenImage21Resolution(sized, '13', '9:16 (Portrait Widescreen)', 2.359296)
service.applyQwenImage21CustomSize(sized, true)
assert.equal(sized['13'].inputs.aspect_ratio, '9:16 (Portrait Widescreen)', '比例应写进 ResolutionSelector')
assert.equal(sized['13'].inputs.megapixels, 2.359296, '像素档应写进 ResolutionSelector')
assert.deepEqual(sized['479'].inputs.width, ['13', 0], '取样尺寸仍由 ResolutionSelector 决定')
assert.equal(sized['482'].inputs.switch, true, '开关打开后取样走 EmptyLatentImage')

// ---- 四、部署到运行时的模板如果存在，也要同源（避免只改仓库、部署还是旧的） ----
const runtimeRoot = path.resolve(__dirname, '..', 'AI-OS-Portable-1.0.5-win-x64', '.ai-runtime', 'versions', '1.0.5-win-x64', 'resources', 'app', 'workflows')
for (const [name, file] of [['编辑', EDIT_FILE], ['生成', GENERATE_FILE]]) {
  const runtimeFile = path.join(runtimeRoot, path.basename(file))
  if (!fs.existsSync(runtimeFile)) {
    console.log(`运行时模板不存在，跳过对照：${runtimeFile}`)
    continue
  }
  const source = readTemplate(file)
  const deployed = readTemplate(runtimeFile)
  assert.deepEqual(Object.keys(deployed).sort(), Object.keys(source).sort(), `运行时${name}模板节点集合应与仓库一致`)
  for (const nodeId of Object.keys(source)) {
    assert.deepEqual(keySet(deployed[nodeId]).sort(), keySet(source[nodeId]).sort(), `运行时${name}模板节点 ${nodeId} 的输入名应与仓库一致`)
  }
}

// ---- 四之二、运行时的服务端模块也要带这两处修复 ----
const runtimeServiceFile = path.join(runtimeRoot, '..', 'comfy-workflow-task-service.js')
if (fs.existsSync(runtimeServiceFile)) {
  const runtimeService = fs.readFileSync(runtimeServiceFile, 'utf8')
  assert.match(runtimeService, /sizeSwitch: "482"/, '运行时服务端模块应带自定义尺寸开关')
  assert.match(runtimeService, /enhancerKey: "\\u56fe\\u7247"/, '运行时服务端模块的增强器第一张参考图应是 图片')
} else {
  console.log(`运行时服务端模块不存在，跳过对照：${runtimeServiceFile}`)
}

// ---- 五、端到端（服务端）：真正提交给 ComfyUI 的工作流必须是「用户选的那一档」 ----
async function main() {
  const submitted = []
  const comfyClient = {
    normalizeUrl: (value) => value || 'http://127.0.0.1:8188',
    uploadDataUrl: async (_url, _source, filename) => ({ name: `uploaded_${filename || 'ref.png'}` }),
    submitPrompt: async (_url, workflow) => { submitted.push(workflow); return 'prompt-1' },
    waitForHistory: async () => ({ outputs: {} }),
    saveHistoryImages: async () => ['/output/qwen_edit_result.png'],
  }
  const tasks = new Map()
  const mediaTaskService = {
    set: (id, value) => tasks.set(id, value),
    get: (id) => tasks.get(id) || null,
    update: (id, patch) => tasks.set(id, { ...(tasks.get(id) || {}), ...patch }),
    cleanupExpired: () => {},
    values: () => [...tasks.values()],
  }
  const service = createComfyWorkflowTaskService({
    mediaTaskService,
    workflowFiles,
    comfyClient,
    comfyBackgroundRemoval: {},
    getImageReferenceDimensions: () => ({ width: 1184, height: 2112 }),
    runRunningHubOutpaintTask: () => {},
    readJson: async () => ({}),
    sendJson: () => {},
    formatErrorMessage: (error) => String(error?.message || error || ''),
    updateTask: (taskId, patch) => mediaTaskService.update(taskId, patch),
  })
  await service.runQwenImage21Task('qa-task', {
    comfy_url: 'http://127.0.0.1:8188',
    images: ['data:image/png;base64,AAAA'],
    names: ['输入.png'],
    prompt: '把图中的香蕉换成被咬的苹果',
    aspect_ratio: '9:16 (Portrait Widescreen)',
    megapixels: 2.359296,
  }, 'edit')

  assert.equal(submitted.length, 1, `应提交一次工作流：${submitted.length}`)
  const runtime = submitted[0]
  const pristineEdit = readTemplate(EDIT_FILE)
  assert.equal(runtime['482'].inputs.switch, true, `提交的工作流应打开自定义尺寸开关：${JSON.stringify(runtime['482'].inputs)}`)
  assert.equal(runtime['13'].inputs.aspect_ratio, '9:16 (Portrait Widescreen)', '提交的工作流应带上所选比例')
  assert.equal(runtime['13'].inputs.megapixels, 2.359296, '提交的工作流应带上所选像素档')
  assert.equal(runtime['571'].inputs.value, '把图中的香蕉换成被咬的苹果', '提交的工作流应带上提示词')
  assert.deepEqual(runtime['565'].inputs['图片'], ['532', 0], `增强器第一张参考图应接上缩放节点：${JSON.stringify(runtime['565'].inputs['图片'])}`)
  assert.match(String(runtime['475'].inputs.image || ''), /^uploaded_输入.*\.png$/, `参考图应换成上传后的文件名：${runtime['475'].inputs.image}`)
  for (const nodeId of Object.keys(pristineEdit)) {
    const before = new Set(keySet(pristineEdit[nodeId]))
    const added = keySet(runtime[nodeId]).filter((key) => !before.has(key))
    assert.deepEqual(added, [], `提交的工作流里节点 ${nodeId} 出现了模板没有的输入名：${JSON.stringify(added)}`)
  }
  console.log(JSON.stringify({
    ok: true,
    enhancerKeys,
    encoderKeys,
    cases: cases.map((item) => item.count),
    submittedEdit: {
      switch: runtime['482'].inputs.switch,
      aspect: runtime['13'].inputs.aspect_ratio,
      megapixels: runtime['13'].inputs.megapixels,
      prompt: runtime['571'].inputs.value,
      firstReference: runtime['565'].inputs['图片'],
      uploaded: runtime['475'].inputs.image,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
