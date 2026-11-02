'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { MIME_TYPES } = require('../host-sources/app/media-file-service.js');
const { createStaticHttpApi } = require('../host-sources/app/static-http-api.js');

test('static SVG branding is served with a browser-decodable image MIME type', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-svg-'));
  const svg = fs.readFileSync(path.resolve(__dirname, '../host-sources/app/assets/branding/bendo-logo.svg'));
  fs.mkdirSync(path.join(root, 'assets/branding'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/branding/bendo-logo.svg'), svg);
  const unused = () => { throw Error('Unexpected authentication/output path'); };
  const api = createStaticHttpApi({ publicDir: root, outputDir: root, mimeTypes: MIME_TYPES,
    getAuthDisabledUser: unused, publicUser: unused, requireAuth: unused,
    assertOutputMediaRead: unused, sendJson: unused, sendAuthError: unused });
  const server = http.createServer((req, res) => api.handle(req, res));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/assets/branding/bendo-logo.svg`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml(?:;|$)/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), svg);
    const cached = await fetch(`http://127.0.0.1:${server.address().port}/assets/branding/bendo-logo.svg`,
      { headers: { 'If-None-Match': response.headers.get('etag') } });
    assert.equal(cached.status, 304);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
