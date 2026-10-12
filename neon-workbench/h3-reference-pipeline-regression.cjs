const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const app = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app')
const source = process.env.H3_DEFAULT_DEPLOYED ? app : path.join(__dirname, 'design-sources')
function load(file) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require, console })
  return module.exports
}
;(async () => {
  const api = load(path.join(source, 'minimax-h3-workflow.js'))
  const { createMinimaxH3TaskService } = load(path.join(source, 'minimax-h3-task-service.js'))
  const { createComfyUiClient } = require(path.join(app, 'comfyui-client.js'))
  const image = process.env.H3_REFERENCE_FILE ? fs.readFileSync(process.env.H3_REFERENCE_FILE)
    : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWb8AAAAASUVORK5CYII=', 'base64')
  const video = process.env.H3_RESULT_FILE ? fs.readFileSync(process.env.H3_RESULT_FILE) : Buffer.from('mock-video')
  let uploadName, submitted, uploadCount = 0, failure
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      const send = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)) }
      if (req.url === '/upload/image') {
        const form = await new Request('http://localhost/upload/image', { method: 'POST', headers: req.headers, body }).formData()
        const file = form.get('image')
        assert.deepEqual(Buffer.from(await file.arrayBuffer()), image, '原始香蕉图片字节完整上传')
        uploadName = file.name; uploadCount++
        return send({ name: uploadName, subfolder: 'qa' })
      }
      if (req.url === '/prompt') {
        submitted = JSON.parse(body).prompt
        const h3 = Object.values(submitted).find(node => node.class_type === 'MiniMaxH3ReferenceToVideo')
        const link = h3.inputs['ref_images.ref_image_0']
        assert.ok(link, '实际 HTTP 工作流必须有图片参考连线')
        assert.equal(submitted[link[0]].class_type, 'LoadImage')
        assert.equal(submitted[link[0]].inputs.image, `qa/${uploadName}`, '使用上传后服务器返回的文件名')
        assert.ok(h3.inputs.prompt.includes('<Picture 1>'))
        assert.ok(h3.inputs.prompt.endsWith('香蕉被人拿起剥开'))
        return send({ prompt_id: 'qa-reference-task' })
      }
      if (req.url === '/history/qa-reference-task') return send({ 'qa-reference-task': {
        status: { completed: true, status_str: 'success' }, outputs: { '375': { videos: [{ filename: 'qa-result.mp4', type: 'output' }] } },
      } })
      if (req.url.startsWith('/view?')) { res.setHeader('Content-Type', 'video/mp4'); return res.end(video) }
      res.statusCode = 404; res.end()
    } catch (error) { failure = error; res.statusCode = 500; res.end(JSON.stringify({ error: error.message })) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const comfyUrl = `http://127.0.0.1:${server.address().port}`
    assert.notEqual(server.address().port, 3199)
    const outputDir = path.join(__dirname, '../.design/h3-default-references')
    fs.mkdirSync(outputDir, { recursive: true })
    const mediaReferenceToFile = async (url, filename) => ({ filename, blob: new Blob([image], { type: 'image/png' }) })
    const client = createComfyUiClient({ getDefaultUrl: () => comfyUrl, fetchImpl: fetch, imageReferenceToFile: mediaReferenceToFile,
      outputDir, inspectHistory: api.inspectComfyHistory, collectVideoOutputs: api.collectComfyVideoOutputs, formatErrorMessage: e => String(e.message || e) })
    const states = []
    const service = createMinimaxH3TaskService({ mediaTaskService: { set() {} }, updateTask: (id, state) => states.push(state), cleanupTasks() {},
      workflowFile: path.join(source, 'workflows/minimax-h3-video.json'), normalizeRequest: api.normalizeMinimaxH3Request,
      prepareWorkflow: api.prepareMinimaxH3Workflow, sanitizeReferenceName: api.sanitizeReferenceName,
      mediaReferenceToFile, comfyClient: client, formatErrorMessage: e => e.message,
      makeUploadToken: () => 'qa', makeUploadFilename: (name, token) => `${token}.png` })
    await service.runTask('qa-reference', { ...api.normalizeMinimaxH3Request({ prompt: '香蕉被人拿起剥开', images: [{ url: '/output/banana.png', name: '香蕉.png' }], seed: 42 }), comfyUrl })
    if (failure) throw failure
    assert.equal(uploadCount, 1)
    assert.ok(submitted)
    assert.equal(states.at(-1).status, 'success')
    const saved = path.join(outputDir, path.basename(states.at(-1).videos[0]))
    assert.deepEqual(fs.readFileSync(saved), video, 'HTTP 返回结果完整保存')
    fs.unlinkSync(saved)
    console.log(JSON.stringify({ ok: true, isolatedPort: server.address().port, uploads: uploadCount, referenceWired: true,
      realImageBytes: Boolean(process.env.H3_REFERENCE_FILE), realVideoBytes: Boolean(process.env.H3_RESULT_FILE), inference: 'mock' }))
  } finally { await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
