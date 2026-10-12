const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const source = path.join(__dirname, 'design-sources/static-http-api.cjs')
const runtime = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app/static-http-api.js')
const { createStaticHttpApi } = require(process.env.STATIC_HTTP_SOURCE || (fs.existsSync(source) ? source : runtime))

async function startFixtureServer() {
  const directory = path.join(__dirname, 'test-fixtures')
  const api = createStaticHttpApi({
    publicDir: directory, outputDir: directory, mimeTypes: { '.mp4': 'video/mp4' },
    getAuthDisabledUser: () => ({ id: 'qa' }), publicUser: value => value,
    requireAuth: async (req, res) => {
      if (req.headers['x-qa-auth'] === 'deny') { res.writeHead(401); res.end(); return null }
      return { user: { id: 'qa' } }
    },
    assertOutputMediaRead: async (_, url) => {
      if (url.includes('private')) throw Object.assign(new Error('无权限'), { statusCode: 403 })
    },
    sendJson: (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) },
    sendAuthError: (res, error) => { res.writeHead(error.statusCode || 500); res.end() },
  })
  const server = http.createServer(async (req, res) => {
    if (!await api.publicHandle(req, res) && !await api.handle(req, res)) { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

async function run() {
  const { server, origin } = await startFixtureServer()
  try {
    const bytes = fs.readFileSync(path.join(__dirname, 'test-fixtures/video-seek-fixture.mp4'))
    for (const prefix of ['/output/', '/']) {
      const url = `${origin}${prefix}video-seek-fixture.mp4`
      const full = await fetch(url)
      assert.equal(full.status, 200)
      assert.equal(full.headers.get('accept-ranges'), 'bytes', '媒体响应必须声明字节范围支持')
      assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
      for (const [range, start, end] of [['bytes=20-49', 20, 49], ['bytes=20-', 20, bytes.length - 1], ['bytes=-30', bytes.length - 30, bytes.length - 1], [`bytes=0-${bytes.length + 100}`, 0, bytes.length - 1]]) {
        const response = await fetch(url, { headers: { Range: range } })
        assert.equal(response.status, 206, `${prefix}${range} 应返回部分内容`)
        assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`)
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1))
      }
      for (const range of [`bytes=${bytes.length}-`, 'bytes=20-10', 'bytes=-0']) {
        const response = await fetch(url, { headers: { Range: range } })
        assert.equal(response.status, 416)
        assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`)
      }
      const malformed = await fetch(url, { headers: { Range: 'bytes=bad' } })
      assert.equal(malformed.status, 200, '无效语法应忽略 Range')
      const multipart = await fetch(url, { headers: { Range: 'bytes=0-9,20-29' } })
      assert.equal(multipart.status, 200, '不支持的多段请求应返回完整内容')
      const ifRange = await fetch(url, { headers: { Range: 'bytes=20-49', 'If-Range': '"different-revision"' } })
      assert.equal(ifRange.status, 200, '不匹配的 If-Range 应返回完整内容')
    }
    assert.equal((await fetch(`${origin}/output/video-seek-fixture.mp4`, { headers: { Range: 'bytes=0-9', 'x-qa-auth': 'deny' } })).status, 401)
    assert.equal((await fetch(`${origin}/output/private.mp4`, { headers: { Range: 'bytes=0-9' } })).status, 403)
    console.log('媒体范围回归通过：完整/部分/开放/后缀/越界请求、版本条件和访问权限。')
  } finally { await new Promise(resolve => server.close(resolve)) }
}

module.exports = { startFixtureServer }
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
