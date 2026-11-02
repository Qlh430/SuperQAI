const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'design-sources', 'media-generation-http-api.js'), 'utf8')
const moduleObject = { exports: {} }
new Function('module', 'exports', source)(moduleObject, moduleObject.exports)
const { createMediaGenerationHttpApi } = moduleObject.exports
const calls = []
const api = createMediaGenerationHttpApi({
  handleApiVideo: async () => {},
  handleApiVideoResume: async () => {},
  handleMinimaxH3Video: async () => {},
  handleQwenImage21: async () => {},
  handleQwenImage21Redraw: async (_req, res) => { calls.push('qwen-redraw'); res.status = 202 },
  handleUpscale: async (_req, _res, workflow) => { calls.push(`upscale:${workflow}`) },
  handleUpscaleStatus: () => {},
})

async function run() {
  const redrawResponse = {}
  assert.equal(await api.handle({ method: 'POST', url: '/api/qwen-image21-redraw', headers: { host: 'localhost' } }, redrawResponse), true)
  assert.equal(redrawResponse.status, 202)
  assert.deepEqual(calls, ['qwen-redraw'], '重绘必须进入专用 Qwen 工作流处理器')

  assert.equal(await api.handle({ method: 'POST', url: '/api/upscale', headers: { host: 'localhost' } }, {}), true)
  assert.deepEqual(calls, ['qwen-redraw', 'upscale:ttp'], '普通 TTP 放大路由必须保持原样')
  console.log(JSON.stringify({ ok: true, redrawRoute: 'qwen-image21-redraw', upscaleRoute: 'ttp' }, null, 2))
}

run().catch(error => { console.error(error); process.exit(1) })
