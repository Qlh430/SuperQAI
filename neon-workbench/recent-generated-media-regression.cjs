const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/recent-generated-media-20261014');
fs.mkdirSync(output, { recursive: true });
// Static-only test server. API responses below are fixtures; user data is never opened.
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(runtime, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#171817"/></svg>');
const media = (id, type, source, refType = 'output_media', preview = true) => ({
  resource: { id, title: id, type, refType, refId: `/output/${id}.png`, ownerUserId: 'qa', metadata: { source } },
  preview: preview ? { kind: type === 'video' ? 'video' : 'image', url: type === 'video' ? '/fixture.mp4' : image } : null,
  access: { capabilities: { share: true, delete: true } },
});
const fixtures = [
  ...Array.from({ length: 25 }, (_, i) => media(`上传图片${i}`, 'image', 'upload')),
  media('上传视频', 'video', 'upload'), media('生成记录节点', 'image', undefined, 'history_image'),
  media('生图任务节点', 'job', 'generated', 'image_job'), media('带生成标记的节点', 'image', 'generated', 'history_image'),
  media('未标记来源', 'image', undefined), media('生成音频', 'audio', 'generated'),
  media('未完成生成', 'image', 'generated', 'output_media', false),
  { ...media('口令锁定成品', 'image', 'generated'), access: { locked: true } },
  { ...media('已删除成品', 'image', 'generated'), resource: { ...media('已删除成品', 'image', 'generated').resource, deletedAt: '2026-10-14' } },
  ...Array.from({ length: 24 }, (_, i) => media(`生成图片${i}`, 'image', 'generated')),
];
// Put a finished video among images, after all excluded fixtures.
fixtures.splice(fixtures.length - 23, 0, media('生成视频', 'video', 'generated'));
let browser;
async function main() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(33199, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(4000);
  const errors = [], geometry = []; let resources = fixtures;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === '/api/auth/session' ? { user: { id: 'qa', displayName: '验收账户', role: 'superadmin' } }
      : pathname === '/api/preferences' ? { preferences: { appearance: { scale: 1 } } }
      : pathname === '/api/resources' ? { resources }
      : { projects: [], boards: [], records: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const width of [390, 768, 1440, 1728, 2560]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('http://127.0.0.1:33199/neon-workbench.html#home');
    const recent = page.locator('section').filter({ has: page.getByRole('heading', { name: '最近素材', exact: true }) }).last();
    await recent.getByRole('button', { name: '预览素材 生成图片0', exact: true }).waitFor();
    await page.waitForTimeout(120);
    const names = await recent.locator('[aria-label^="预览素材"]').evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')));
    assert.ok(names.length >= 2);
    assert.ok(names.every(name => /^预览素材 生成(图片\d+|视频)$/.test(name)), names.join(', '));
    assert.ok(names.includes('预览素材 生成视频'));
    const columns = await recent.locator('.neon-recent-grid').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    assert.equal(names.length, columns * 2);
    geometry.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })));
    await page.screenshot({ path: path.join(output, `${width}-recent-default.png`) });
    await recent.getByRole('button', { name: '预览素材 生成图片0', exact: true }).hover();
    await page.screenshot({ path: path.join(output, `${width}-recent-hover.png`) });
    await recent.getByRole('button', { name: '预览素材 生成图片0', exact: true }).focus();
    await page.screenshot({ path: path.join(output, `${width}-recent-focus.png`) });
  }
  resources = fixtures.filter(e => e.resource.metadata.source !== 'generated');
  await page.getByRole('button', { name: '刷新数据' }).click();
  await page.getByText('生成的图片和视频将在这里展示。', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'empty.png') });
  resources = fixtures;
  await page.getByRole('button', { name: '刷新数据' }).click();
  await page.getByRole('button', { name: '预览素材 生成图片0', exact: true }).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.neon-recent-grid').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 10);
  await page.getByRole('button', { name: '打开历史记录' }).click();
  await page.getByRole('button', { name: '预览素材 上传图片0', exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.ok(geometry.every(g => g.scrollWidth <= g.width));
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = ''; child.stdout.on('data', d => text += d); child.stderr.on('data', d => text += d);
      child.on('close', code => resolve({ code, text }));
    });
    fs.writeFileSync(path.join(output, 'acceptance-log.txt'), result.text); assert.equal(result.code, 0, result.text);
  }
  const report = { errors, geometry, checks: ['只展示生成图片/视频成品', '上传、记录/任务节点、音频、来源不明、无预览、锁定、删除均排除', '筛选后再截取两行', '空态及刷新后宽度恢复', '历史仍显示上传素材，资产仅主动入库', '默认/悬停/焦点/移动截图'], boundary: 'API为真实字段结构的模拟夹具；静态独立33199测试服务；未使用真实用户登录、未调用生成服务、未改用户素材或3199服务。' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
