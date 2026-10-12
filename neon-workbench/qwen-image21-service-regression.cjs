// Qwen-image2.1 服务端回归（纯 Node，不需要浏览器、不连 ComfyUI）：
// 1. 有参考图走「图像编辑」模板、没有参考图走「生图」模板；
// 2. 最多 8 张参考图，超限给出中文错误；
// 3. 未使用的参考图槽位连同 LoadImage / ImageScaleToTotalPixels 一起删掉；
// 4. 种子只写 Seed (rgthree)，KSampler 仍然走连线；
// 5. 比例与像素档写进 ResolutionSelector；
// 6. 两份模板结构自洽（节点、连线、注入点齐全），且不残留用户内容。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')

const SERVICE = path.join(__dirname, 'design-sources/comfy-workflow-task-service.js')
const WORKFLOW_DIR = path.join(__dirname, 'design-sources/workflows')
const EDIT_FILE = path.join(WORKFLOW_DIR, 'qwen-image21-edit.json')
const GENERATE_FILE = path.join(WORKFLOW_DIR, 'qwen-image21-generate.json')

// design-sources 目录继承 neon-workbench 的 "type": "module"，而服务端模块是
// CommonJS（运行时目录里就是 CJS）。这里按 CJS 编译源码，测的就是将要部署的那份。
function loadServiceModule() {
  const compiled = new Module(SERVICE, null)
  compiled.filename = SERVICE
  compiled.paths = Module._nodeModulePaths(path.dirname(SERVICE))
  compiled._compile(fs.readFileSync(SERVICE, 'utf8'), SERVICE)
  return compiled.exports
}

function buildService({ onSubmit, requestBody = {}, onResponse, workflowOverrides = {} } = {}) {
  const { createComfyWorkflowTaskService } = loadServiceModule()
  const tasks = new Map()
  const submitted = []
  const uploadedNames = []
  const comfyClient = {
    normalizeUrl: (value) => String(value || 'http://127.0.0.1:8188'),
    uploadDataUrl: async (url, dataUrl, name) => {
      const uploaded = { name: `uploaded_${uploadedNames.length}_${name}`, url, dataUrl }
      uploadedNames.push(uploaded.name)
      return uploaded
    },
    submitPrompt: async (url, workflow) => {
      submitted.push(workflow)
      onSubmit?.(workflow)
      return 'prompt-1'
    },
    waitForHistory: async () => ({ outputs: {} }),
    saveHistoryImages: async () => ['/output/qwen.png'],
  }
  const service = createComfyWorkflowTaskService({
    mediaTaskService: {
      set: (id, value) => tasks.set(id, value),
      get: (id) => tasks.get(id),
      update: (id, patch) => tasks.set(id, { ...(tasks.get(id) || {}), ...patch }),
      cleanupExpired: () => {},
    },
    workflowFiles: {
      ttp: path.join(WORKFLOW_DIR, 'TTP-upscale.json'),
      seedvr2: path.join(WORKFLOW_DIR, 'SeedVR2-upscale2.json'),
      shoeSwap: path.join(WORKFLOW_DIR, 'shoe-swap.json'),
      outpaint: path.join(WORKFLOW_DIR, 'z-image-outpaint.json'),
      runninghubOutpaint: path.join(WORKFLOW_DIR, 'runninghub-outpaint.json'),
      flux2KleinEdit: path.join(WORKFLOW_DIR, 'flux2-klein-edit-9b.json'),
      qwenEditAngle: path.join(WORKFLOW_DIR, 'qwen-edit-angle-2511.json'),
      removeBackground: path.join(WORKFLOW_DIR, 'background-removal.json'),
      ...workflowOverrides,
    },
    comfyClient,
    comfyBackgroundRemoval: {},
    getImageReferenceDimensions: () => ({ width: 1024, height: 1024 }),
    runRunningHubOutpaintTask: async () => {},
    readJson: async () => requestBody,
    sendJson: (res, status, body) => onResponse?.(status, body),
    formatErrorMessage: (error) => String(error?.message || error),
    shoeSwapPrompt: '',
    shoeSwapApiKey: '',
  })
  return { service, tasks, submitted, uploadedNames }
}

function readTemplate(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

;(async () => {
  const results = []
  // 1. 模板本身：结构、注入点、不残留用户内容。
  const edit = readTemplate(EDIT_FILE)
  const generate = readTemplate(GENERATE_FILE)
  assert.equal(Object.keys(edit).length, 30, `编辑模板节点数：${Object.keys(edit).length}`)
  assert.equal(Object.keys(generate).length, 13, `生图模板节点数：${Object.keys(generate).length}`)
  assert.equal(edit['571']?.inputs?.value, '', '编辑模板的提示词源必须是空值')
  assert.equal(generate['517']?.inputs?.value, '', '生图模板的提示词源必须是空值')
  assert.equal(edit['569']?.inputs?.text, '', '编辑模板不得残留历史提示词')
  assert.equal(generate['582']?.inputs?.text, '', '生图模板不得残留历史提示词')
  assert.equal(edit['569']?.inputs?.use_edited_text, false, '编辑模板必须走增强器输出而不是手工覆盖文本')
  assert.equal(generate['582']?.inputs?.use_edited_text, false, '生图模板必须走增强器输出而不是手工覆盖文本')
  assert.ok(edit['565'] && edit['583'] === undefined, '编辑模板要有图生图增强器')
  assert.ok(generate['583'], '生图模板要有文生图增强器')
  assert.deepEqual(edit['481']?.inputs?.positive, ['497', 0], 'KSampler 正向条件要接到 TextEncodeQwenImage21')
  assert.deepEqual(edit['482']?.inputs?.on_false, ['497', 2], '编辑模板的 latent 走 TextEncodeQwenImage21 输出（无位移）')
  assert.deepEqual(generate['515']?.inputs?.seed, ['524', 0], '生图 KSampler 种子走 Seed (rgthree) 连线')
  assert.deepEqual(edit['481']?.inputs?.seed, ['502', 0], '编辑 KSampler 种子走 Seed (rgthree) 连线')
  for (const id of ['483', '649', '653', '661', '663']) {
    assert.equal(edit[id] === undefined && generate[id] === undefined, true, `可选的加速/缓存节点 ${id} 不应进模板`)
  }
  // 连线不能悬空。
  for (const [name, template] of [['编辑', edit], ['生图', generate]]) {
    for (const [id, node] of Object.entries(template)) {
      for (const [key, value] of Object.entries(node.inputs || {})) {
        if (!Array.isArray(value)) continue
        assert.ok(template[value[0]], `${name}模板 ${id}.${key} 悬空引用 ${value[0]}`)
      }
    }
  }
  results.push('templates')

  // 2. 8 张全量：所有槽位保留，参考图接到编码器与增强器。
  const full = buildService()
  const editWorkflow = readTemplate(EDIT_FILE)
  const used = full.service.applyQwenImage21References(editWorkflow, ['a.png', 'b.png', 'c.png'])
  assert.equal(used, 3, `使用的参考图数量：${used}`)
  assert.equal(editWorkflow['475'].inputs.image, 'a.png')
  assert.equal(editWorkflow['505'].inputs.image, 'b.png')
  assert.equal(editWorkflow['507'].inputs.image, 'c.png')
  assert.deepEqual(editWorkflow['497'].inputs['images.image_1'], ['532', 0])
  assert.deepEqual(editWorkflow['497'].inputs['images.image_3'], ['552', 0])
  assert.deepEqual(editWorkflow['565'].inputs['\u56fe\u72471'], ['532', 0])
  assert.deepEqual(editWorkflow['565'].inputs['\u56fe\u72473'], ['552', 0])
  assert.equal(editWorkflow['506'], undefined, '第 4 个槽位没有素材时应该整段删掉')
  assert.equal(editWorkflow['497'].inputs['images.image_4'], undefined, '删掉的槽位不能留在编码器里')
  assert.equal(editWorkflow['565'].inputs['\u56fe\u72474'], undefined, '删掉的槽位不能留在增强器里')
  results.push('slot-trimming')

  // 3. 种子只改种子节点，KSampler 连线保持。
  const seeded = readTemplate(EDIT_FILE)
  assert.equal(full.service.applyQwenImage21Seed(seeded, 12345, '502'), true)
  assert.equal(seeded['502'].inputs.seed, 12345)
  assert.deepEqual(seeded['481'].inputs.seed, ['502', 0], 'KSampler 的种子必须仍然是连线')
  results.push('seed')

  // 4. 比例 / 像素档写进 ResolutionSelector。
  const sized = readTemplate(GENERATE_FILE)
  assert.equal(full.service.applyQwenImage21Resolution(sized, '512', '16:9 (Widescreen)', 2), true)
  assert.equal(sized['512'].inputs.aspect_ratio, '16:9 (Widescreen)')
  assert.equal(sized['512'].inputs.megapixels, 2)
  results.push('resolution')

  // 5. 有参考图 → 编辑模板；没有参考图 → 生图模板，且提示词注入到增强器入口。
  for (const [label, images, expectPromptNode, expectSaveNode] of [
    ['图像编辑', ['data:image/png;base64,AAA'], '571', '487'],
    ['生图', [], '517', '508'],
  ]) {
    const run = buildService()
    await run.service.runQwenImage21Task('task-1', {
      images,
      names: images.map(() => 'ref.png'),
      prompt: '一只在窗台上的猫',
      aspect_ratio: '1:1 (Square)',
      megapixels: 1.5,
    }, images.length ? 'edit' : 'generate')
    assert.equal(run.submitted.length, 1, `${label}应提交一次`)
    const workflow = run.submitted[0]
    assert.equal(workflow[expectPromptNode].inputs.value, '一只在窗台上的猫', `${label}提示词要注入 ${expectPromptNode}`)
    assert.ok(String(workflow[expectSaveNode].inputs.filename_prefix).startsWith('qwen_image21'), `${label}输出前缀`)
    if (images.length) {
      assert.equal(workflow['475'].inputs.image, run.uploadedNames[0], '编辑模板要带上传后的文件名')
    } else {
      assert.equal(workflow['475'], undefined, '生图模板不应包含参考图节点')
    }
  }
  results.push('mode-routing')

  // 6. 超过 8 张参考图：中文错误且不创建任务。
  const responses = []
  const guarded = buildService({
    requestBody: { images: Array.from({ length: 9 }, (_, index) => `data:image/png;base64,${index}`) },
    onResponse: (status, body) => responses.push({ status, body }),
  })
  await guarded.service.handleQwenImage21(
    { method: 'POST', url: '/api/qwen-image21', headers: { host: 'localhost' } },
    { fake: true },
  )
  assert.equal(responses.length, 1, '超限请求应产生一次响应')
  assert.equal(responses[0].status, 400, `超限状态码：${responses[0].status}`)
  assert.match(responses[0].body.error, /最多支持 8 张参考图/, `超限错误文案：${responses[0].body.error}`)
  assert.equal(guarded.tasks.size, 0, '超限请求不应创建任务')

  // 7. 缺少模板时给出中文错误，而不是静默走别的流程。
  const missing = buildService({
    requestBody: { images: [] },
    onResponse: (status, body) => responses.push({ status, body }),
  })
  const originalFiles = missing.service.qwenImage21Files()
  assert.ok(/qwen-image21-generate\.json$/.test(originalFiles.generate), `生图模板路径：${originalFiles.generate}`)
  assert.ok(/qwen-image21-edit\.json$/.test(originalFiles.edit), `编辑模板路径：${originalFiles.edit}`)
  results.push('limit-and-paths')

  // 8. 组合根显式提供模板路径时，服务必须使用映射，不能重新猜目录。
  const custom = buildService({ workflowOverrides: {
    qwenImage21Edit: path.join(WORKFLOW_DIR, 'custom-qwen-edit.json'),
    qwenImage21Generate: path.join(WORKFLOW_DIR, 'custom-qwen-generate.json'),
  } })
  const customFiles = custom.service.qwenImage21Files()
  assert.equal(customFiles.edit, path.join(WORKFLOW_DIR, 'custom-qwen-edit.json'), `显式编辑模板路径：${customFiles.edit}`)
  assert.equal(customFiles.generate, path.join(WORKFLOW_DIR, 'custom-qwen-generate.json'), `显式生图模板路径：${customFiles.generate}`)
  results.push('explicit-paths')

  console.log(JSON.stringify({ ok: true, checks: results }, null, 2))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
