const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// Static stage only; all API calls are intercepted, without opening the real database.
const root = path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
const report = path.resolve(__dirname, '../.planning/audio-asset-registration-20261026');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

async function main() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(33198, '127.0.0.1', resolve); });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const errors = [], results = [];
  try {
    fs.mkdirSync(report, { recursive: true });
    const page = await browser.newPage(); page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push(error.message));
    let posted, resolveExisting = false;
    await page.route('**/api/**', route => {
      const req = route.request(), url = new URL(req.url());
      let body = { projects: [], boards: [], records: [], resources: [], preferences: {} }, status = 200;
      if (url.pathname === '/api/auth/session') body = { user: { id: 'qa', displayName: '验收账户', role: 'superadmin' } };
      if (url.pathname === '/api/assets/resolve') {
        status = resolveExisting ? 200 : 404;
        body = resolveExisting ? { asset: { id: 'audio-resource', name: '宿主音频' } } : { error: '资源不存在。' };
      }
      if (url.pathname === '/api/asset-library') {
        body = { entries: [], categories: [{ id: 'character', name: '角色' }], folders: [{ id: 'sound', name: '声音', categoryId: 'character' }] };
        if (req.method() === 'POST') {
          posted = req.postDataJSON();
          const valid = posted.items.every(item => item.resourceId || item.media?.url?.startsWith('/output/'));
          status = valid ? 200 : 400;
          body = valid ? { ok: true } : { error: '只能引用宿主保存的媒体文件。' };
        }
      }
      return route.fulfill({ status, json: body });
    });
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto('http://127.0.0.1:33198/neon-workbench.html#home');
      await page.getByRole('heading', { name: '今天想创作什么？', exact: true }).waitFor();
      for (const kind of ['audio', 'image', 'video']) {
        posted = null; resolveExisting = width === 1728;
        const item = { url: `/output/qa-${kind}.${kind === 'audio' ? 'flac' : kind === 'image' ? 'png' : 'mp4'}`, kind, title: '高冷御姐', mimeType: `${kind}/${kind === 'audio' ? 'flac' : kind === 'image' ? 'png' : 'mp4'}` };
        // Exercise the actual canvas host's flat message format and React message listener.
        await page.evaluate(item => window.postMessage({ type: 'neon:add-assets', requestId: 'qa-register', items: [item] }, location.origin), item);
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('资产名称', { exact: true }).waitFor();
        await dialog.getByLabel('资产名称', { exact: true }).fill('高冷御姐');
        await dialog.getByLabel('资产分类').selectOption('character');
        await dialog.getByLabel('资产文件夹').selectOption('sound');
        await Promise.all([
          page.waitForResponse(response => response.url().includes('/api/asset-library') && response.request().method() === 'POST'),
          dialog.getByRole('button', { name: '保存到资产库', exact: true }).click(),
        ]);
        assert.equal(posted?.items[0]?.media?.url, item.url, '画布入库必须把宿主地址映射到 media.url');
        assert.equal(posted.items[0].media.kind, kind);
        assert.equal(posted.items[0].media.mimeType, item.mimeType);
        assert.equal(posted.items[0].name, '高冷御姐');
        assert.equal(posted.items[0].categoryId, 'character');
        assert.equal(posted.items[0].folderId, 'sound');
        if (resolveExisting) assert.equal(posted.items[0].resourceId, 'audio-resource');
        await dialog.waitFor({ state: 'hidden' });
        results.push({ width, kind, resolved: resolveExisting });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '页面不能横向溢出');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(report, 'registration-result.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ passed: results.length, errors }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
