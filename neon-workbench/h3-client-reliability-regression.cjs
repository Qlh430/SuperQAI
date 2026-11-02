const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

function hostModule(name) {
  const module = { exports: {} }
  const source = process.env.H3_CLIENT_SOURCE || path.join(__dirname, 'design-sources')
  vm.runInNewContext(fs.readFileSync(path.join(source, name), 'utf8'), {
    module, exports: module.exports, require, console, Buffer, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout, FormData,
  }, { filename: name })
  return module.exports
}
const { createComfyUiClient } = hostModule('comfyui-client.js')
const { createMinimaxH3TaskService } = hostModule('minimax-h3-task-service.js')
const { inspectComfyHistory, collectComfyVideoOutputs, prepareMinimaxH3Workflow, normalizeMinimaxH3Request } = hostModule('minimax-h3-workflow.js')
const history = { outputs: { 375: { images: [{ filename: 'result.mp4', subfolder: 'video', type: 'output' }] } }, status: { completed: true } }
const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109, 109, 112, 52, 49])
function client(fetchImpl, options = {}) {
  const writes = [], requests = []
  const value = createComfyUiClient({
    getDefaultUrl: () => 'http://comfy.test', fetchImpl: async (url, init) => { requests.push({ url, method: init?.method || 'GET' }); return fetchImpl(url, init) },
    imageReferenceToFile() {}, outputDir: '/qa-output', inspectHistory: inspectComfyHistory,
    collectVideoOutputs: collectComfyVideoOutputs, formatErrorMessage: e => String(e?.message || e),
    maxPolls: 4, pollIntervalMs: 0, fs: { writeFileSync: (filename, buffer) => writes.push({ filename, buffer }) },
    ...options,
  })
  return { value, writes, requests }
}

test('视频下载404必须显示明确的中文错误且不写文件', async () => {
  const { value, writes } = client(async () => new Response('missing', { status: 404 }))
  await assert.rejects(value.saveHistoryVideos('http://comfy.test', history, 'qa_', ['375']), /下载.*result\.mp4.*HTTP 404/)
  assert.equal(writes.length, 0)
})
test('200 HTML/JSON错误响应不会保存成伪MP4', async () => {
  for (const [type, body] of [['text/html', '<html>error</html>'], ['application/json', '{"error":"expired"}']]) {
    const { value, writes } = client(async () => new Response(body, { headers: { 'content-type': type } }))
    await assert.rejects(value.saveHistoryVideos('http://comfy.test', history, 'qa_', ['375']), /下载.*响应类型/)
    assert.equal(writes.length, 0)
  }
})
test('空体与损坏的MP4下载不进入结果', async () => {
  for (const body of [new Uint8Array(), Buffer.from('not an mp4')]) {
    const { value, writes } = client(async () => new Response(body, { headers: { 'content-type': 'video/mp4' } }))
    await assert.rejects(value.saveHistoryVideos('http://comfy.test', history, 'qa_', ['375']), /下载.*(?:为空|无效|不是有效)/)
    assert.equal(writes.length, 0)
  }
})
test('MP4与octet-stream响应按文件数据保存', async () => {
  for (const type of ['video/mp4', 'application/octet-stream']) {
    const { value, writes } = client(async () => new Response(mp4, { headers: { 'content-type': type } }))
    const urls = await value.saveHistoryVideos('http://comfy.test', history, 'qa_', ['375'])
    assert.equal(urls.length, 1)
    assert.equal(writes.length, 1)
    assert.equal(Buffer.compare(writes[0].buffer, mp4), 0)
  }
})
test('历史短暂断网后只重新查询原prompt，不重复生成', async () => {
  let calls = 0
  const { value, requests } = client(async url => {
    if (url.includes('/queue')) return Response.json({ queue_running: [] })
    if (++calls === 1) throw new TypeError('fetch failed')
    return Response.json({ 'prompt-test': history })
  })
  assert.ok(await value.waitForHistory('http://comfy.test', 'prompt-test'))
  assert.equal(calls, 2)
  assert.ok(requests.every(r => r.method === 'GET'))
})
test('历史连续失败提供中文诊断与prompt标识', async () => {
  const { value } = client(async () => { throw new TypeError('fetch failed') })
  await assert.rejects(value.waitForHistory('http://comfy.test', 'prompt-test'), /读取 ComfyUI 任务历史失败.*prompt-test/)
})
test('历史HTTP 503恢复时继续读取同一任务', async () => {
  let calls = 0
  const { value, requests } = client(async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ 'prompt-test': history }))
  assert.ok(await value.waitForHistory('http://comfy.test', 'prompt-test'))
  assert.equal(calls, 2)
  assert.ok(requests.every(r => r.method === 'GET' && r.url.endsWith('/history/prompt-test')))
})
test('历史返回损坏JSON不隐藏成无限等待', async () => {
  const { value } = client(async () => new Response('<html>gateway</html>'))
  await assert.rejects(value.waitForHistory('http://comfy.test', 'prompt-test'), /读取 ComfyUI 任务历史失败.*JSON/)
})
test('失败/中断终态即使带部分视频也不能回传成功', async () => {
  let calls = 0
  const { value, writes } = client(async () => {
    calls++
    return Response.json({ 'prompt-test': { ...history, status: { completed: false, status_str: 'error', messages: [['execution_interrupted', { node_id: '211', node_type: 'VAEDecode' }]] } } })
  })
  await assert.rejects(value.waitForHistory('http://comfy.test', 'prompt-test'), /211.*被中断/)
  assert.equal(calls, 1)
  assert.equal(writes.length, 0)
})
test('部分输出不等于任务成功，必须等ComfyUI终态', () => {
  assert.equal(inspectComfyHistory({ outputs: { 211: { images: [{ filename: 'preview.png' }] } }, status: { completed: false, status_str: 'running' } }).state, 'pending')
})
test('3张图与旧211解码节点保持接线，中断不是多参考不支持', () => {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, 'design-sources/workflows/minimax-h3-video.json'), 'utf8'))
  template['211'] = template['372']; delete template['372']
  template['374'].inputs.images = ['211', 0]
  const request = normalizeMinimaxH3Request({ prompt: '三个参考图保持一致', images: ['a.png', 'b.png', 'c.png'] })
  const prepared = prepareMinimaxH3Workflow(template, request, 'video/qa')
  assert.equal(Object.keys(prepared['390'].inputs).filter(k => k.startsWith('ref_images.')).length, 3)
  assert.equal(prepared['211'].class_type, 'VAEDecode')
  const state = inspectComfyHistory({ status: { completed: false, status_str: 'error', messages: [['execution_interrupted', { node_id: '211', node_type: 'VAEDecode' }]] } })
  assert.equal(state.state, 'error')
  assert.match(state.message, /211.*VAEDecode.*被中断/)
})
test('完整H3服务下载失败保留原prompt并标记中文失败，不登记视频或重复提交', async () => {
  const { value, requests, writes } = client(async url => {
    if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'original-prompt' })
    if (url.includes('/history/')) return Response.json({ 'original-prompt': history })
    return new Response('missing', { status: 404 })
  })
  const tasks = new Map()
  let finish
  const finished = new Promise(resolve => { finish = resolve })
  const service = createMinimaxH3TaskService({
    mediaTaskService: { set: (id, task) => tasks.set(id, task) },
    updateTask: (id, patch) => { tasks.set(id, { ...tasks.get(id), ...patch }); if (patch.status === 'failed') finish() },
    cleanupTasks() {}, workflowFile: path.join(__dirname, 'design-sources/workflows/minimax-h3-video.json'),
    normalizeRequest: normalizeMinimaxH3Request, prepareWorkflow: prepareMinimaxH3Workflow,
    sanitizeReferenceName: name => name, mediaReferenceToFile() {}, comfyClient: value,
    formatErrorMessage: e => e.message, makeUploadToken: () => 'qa', makeUploadFilename: name => name,
  })
  const result = await service.executeComfyVideoProvider({ provider: { baseUrl: 'http://comfy.test' }, input: { prompt: '中文测试' } })
  await finished
  const state = tasks.get(result.task_id)
  assert.equal(state.status, 'failed')
  assert.equal(state.prompt_id, 'original-prompt')
  assert.match(state.message, /下载.*HTTP 404/)
  assert.equal(state.videos.length, 0)
  assert.equal(writes.length, 0)
  assert.equal(requests.filter(r => r.method === 'POST').length, 1)
})
test('全能参考0至9张完整保留，超过上限给中文错误而不静默截断', () => {
  for (let count = 0; count <= 9; count++) {
    const images = Array.from({ length: count }, (_, i) => ({ url: `/output/${i}.png`, name: `第${i + 1}张.png` }))
    const request = normalizeMinimaxH3Request({ prompt: '参考测试', images })
    assert.equal(request.images.length, count)
    assert.deepEqual(Array.from(request.images, x => x.url), images.map(x => x.url))
  }
  assert.throws(() => normalizeMinimaxH3Request({ prompt: '参考测试', images: Array.from({ length: 10 }, () => 'a.png') }), /最多支持 9 张参考图片/)
  for (const [key, label] of [['videos', '参考视频'], ['audios', '参考音频']]) {
    for (let count = 0; count <= 3; count++) assert.equal(normalizeMinimaxH3Request({ prompt: '参考测试', [key]: Array(count).fill('a.mp4') })[key].length, count)
    assert.throws(() => normalizeMinimaxH3Request({ prompt: '参考测试', [key]: Array(4).fill('a.mp4') }), new RegExp(`最多支持 3 段${label}`))
  }
  for (const [mode, count] of [['text', 0], ['first', 1], ['last', 2]]) {
    const request = normalizeMinimaxH3Request({ mode, prompt: '切换模式', images: Array(10).fill('a.png'), videos: Array(4).fill('v.mp4'), audios: Array(4).fill('a.wav') })
    assert.equal(request.images.length, count, '切换生成方式继续只取对应帧')
    assert.equal(request.videos.length, 0)
    assert.equal(request.audios.length, 0)
  }
})
test('缺少提示词和引用编号越界均显示中文错误', () => {
  assert.throws(() => normalizeMinimaxH3Request({ prompt: ' ' }), /请输入 MiniMax H3 视频描述/)
  assert.throws(() => normalizeMinimaxH3Request({ prompt: '<Picture 2>', images: ['a.png'] }), /<Picture 2>.*没有对应的参考素材/)
})
