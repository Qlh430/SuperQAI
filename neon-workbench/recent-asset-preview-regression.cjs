const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/recent-asset-preview-20261014');
fs.mkdirSync(output, { recursive: true });
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#172635"/><circle cx="800" cy="450" r="250" fill="#547c65"/></svg>');
const thumbnail = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#172635"/></svg>');
const media = (id, kind = 'image') => ({ resource: { id, title: id, type: kind, refType: 'output_media', refId: kind === 'video' ? '/fixture.mp4' : image, ownerUserId: 'qa', metadata: { source: 'generated', url: kind === 'video' ? '/fixture.mp4' : image, thumbnailUrl: thumbnail } }, preview: { kind: 'image', url: thumbnail }, access: { capabilities: { share: true, delete: true } } });
const fixtures = () => [media('生成图片'), media('生成视频', 'video'), media('生成竖图'), { ...media('只读图片'), access: { capabilities: {} } }, media('故障图片')];
let resources = fixtures(), failRename = false, failDelete = false, failImage = true;
let browser;
const errors = [], geometry = [], requests = [];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let file = pathname === '/fixture.mp4' ? path.join(__dirname, 'test-fixtures/video-seek-fixture.mp4') : path.resolve(runtime, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (process.env.AI_OS_PREVIEW_DIST === '1' && pathname === '/neon-workbench.js') file = path.join(__dirname, 'dist/workbench.js');
  if (process.env.AI_OS_PREVIEW_DIST === '1' && pathname === '/neon-workbench.css') file = path.join(__dirname, 'dist/neon-workbench.css');
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.mp4': 'video/mp4' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
const dialog = page => page.getByRole('dialog');
async function open(page, title) {
  await page.getByRole('button', { name: `预览素材 ${title}`, exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#home', '最近素材点击必须保留概览路由');
  await dialog(page).waitFor();
  await page.waitForTimeout(250); // Wait for the official Dialog entrance transition before measuring.
}
async function main() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(33199, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/failed-image.png*', route => failImage ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#345"/></svg>' }));
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method(), data = req.postDataJSON();
    requests.push({ path: url.pathname, method, data });
    let body = { projects: [], boards: [], records: [] }, status = 200;
    if (url.pathname === '/api/auth/session') body = { user: { id: 'qa', displayName: '验收账户', role: 'superadmin' } };
    else if (url.pathname === '/api/preferences') body = { preferences: { appearance: { scale: 1 } } };
    else if (url.pathname === '/api/resources') body = { resources };
    else if (url.pathname === '/api/users/directory') body = { users: [{ id: 'other', username: 'other', displayName: '另一账户' }] };
    else if (/^\/api\/resources\/[^/]+$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      if ((method === 'PATCH' && failRename) || (method === 'DELETE' && failDelete)) { status = 503; body = { error: '模拟保存失败，请重试。' }; }
      else if (method === 'PATCH') { resources.find(e => e.resource.id === id).resource.title = data.title; body = { ok: true }; }
      else if (method === 'DELETE') { resources = resources.filter(e => e.resource.id !== id); body = { ok: true }; }
    } else if (url.pathname.endsWith('/shares')) {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      resources.find(e => e.resource.id === id).access.share = { id: 'share-qa', visibility: data.visibility }; body = { ok: true };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const width of [390, 768, 1440, 1728]) {
    resources = fixtures(); resources[2].preview.url = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1600"><rect width="600" height="1600" fill="#456"/></svg>');
    resources[2].resource.metadata.url = resources[2].preview.url;
    resources[4].resource.metadata.url = '/failed-image.png';
    await page.setViewportSize({ width, height: 960 });
    await page.goto(`http://127.0.0.1:33199/neon-workbench.html?qa=${width}#home`);
    await page.getByRole('button', { name: '预览素材 生成图片', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `${width}-default.png`) });
    const trigger = page.getByRole('button', { name: '预览素材 生成图片', exact: true });
    await trigger.hover(); await page.screenshot({ path: path.join(output, `${width}-hover.png`) });
    await trigger.focus(); await page.screenshot({ path: path.join(output, `${width}-focus.png`) });
    await open(page, '生成图片');
    const box = await dialog(page).boundingBox();
    assert.ok(box.width >= width - 2 && box.height >= 958, JSON.stringify(box));
    await dialog(page).locator('img').evaluate(img => img.decode());
    assert.equal(await dialog(page).locator('img').getAttribute('src'), image, '全屏必须展示原图而非缩略图');
    for (const name of ['重命名', '共享设置', '删除']) await dialog(page).getByRole('button', { name, exact: true }).waitFor();
    assert.equal(await dialog(page).getByRole('link', { name: '下载文件' }).getAttribute('href'), image);
    if (width === 1728) {
      const [download] = await Promise.all([page.waitForEvent('download'), dialog(page).getByRole('link', { name: '下载文件' }).click()]);
      const downloadPath = path.join(output, 'download-fixture.svg'); await download.saveAs(downloadPath);
      assert.ok(fs.readFileSync(downloadPath, 'utf8').includes('width="1600"'));
    }
    geometry.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })));
    await page.screenshot({ path: path.join(output, `${width}-fullscreen.png`) });
    await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'hidden' });
    assert.ok(await trigger.evaluate(e => e === document.activeElement), '关闭后必须恢复触发控件焦点');
    if (width >= 1440) {
      await page.getByRole('button', { name: '预览素材 生成竖图', exact: true }).scrollIntoViewIfNeeded();
      const scroll = await page.locator('main').evaluate(e => e.scrollTop);
      await open(page, '生成竖图'); await dialog(page).locator('img').evaluate(img => img.decode());
      await page.screenshot({ path: path.join(output, `${width}-portrait.png`) });
      await dialog(page).getByRole('button', { name: '关闭弹窗' }).click();
      assert.equal(await page.locator('main').evaluate(e => e.scrollTop), scroll);
    }
    await open(page, '生成视频');
    const video = dialog(page).locator('video'); await video.waitFor();
    assert.equal(await video.getAttribute('src'), '/fixture.mp4', '视频封面不能取代视频源');
    assert.equal(await dialog(page).getByRole('link', { name: '下载文件' }).getAttribute('href'), '/fixture.mp4');
    assert.equal(await video.getAttribute('controls'), '');
    await video.evaluate(async v => { await v.play(); });
    await page.waitForTimeout(250); assert.ok(await video.evaluate(v => v.currentTime > 0));
    await page.screenshot({ path: path.join(output, `${width}-video.png`) });
    await page.keyboard.press('Escape');
    await open(page, '生成图片'); await dialog(page).getByRole('button', { name: '重命名', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: '素材名称' }).fill(`改名${width}`);
    await page.screenshot({ path: path.join(output, `${width}-rename.png`) });
    if (width === 390) {
      failRename = true; await dialog(page).getByRole('button', { name: '保存', exact: true }).click();
      await dialog(page).getByRole('alert').waitFor(); await page.screenshot({ path: path.join(output, '390-save-error.png') }); failRename = false;
    }
    await dialog(page).getByRole('button', { name: '保存', exact: true }).click();
    await dialog(page).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: `预览素材 改名${width}`, exact: true }).waitFor();
    await open(page, `改名${width}`); await dialog(page).getByRole('button', { name: '共享设置', exact: true }).click();
    await dialog(page).getByLabel('共享可见范围').selectOption('all');
    await page.screenshot({ path: path.join(output, `${width}-share.png`) });
    await dialog(page).getByRole('button', { name: '保存共享设置' }).click(); await dialog(page).waitFor({ state: 'hidden' });
    await open(page, `改名${width}`); await dialog(page).getByText('图片，共享给全部账户', { exact: true }).waitFor();
    await dialog(page).getByRole('button', { name: '删除', exact: true }).click();
    await page.screenshot({ path: path.join(output, `${width}-delete.png`) });
    if (width === 390) {
      failDelete = true; await dialog(page).getByRole('button', { name: '确认删除' }).click(); await dialog(page).getByRole('alert').waitFor(); failDelete = false;
    }
    await dialog(page).getByRole('button', { name: '确认删除' }).click(); await dialog(page).waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: `预览素材 改名${width}`, exact: true }).count(), 0);
    await open(page, '只读图片'); assert.equal(await dialog(page).getByRole('button', { name: '重命名', exact: true }).count(), 0); assert.equal(await dialog(page).getByRole('button', { name: '删除', exact: true }).count(), 0); await page.keyboard.press('Escape');
    await open(page, '故障图片'); await dialog(page).getByRole('alert').waitFor();
    await page.screenshot({ path: path.join(output, `${width}-media-error.png`) });
    failImage = false; await dialog(page).getByRole('button', { name: '重新加载' }).click(); await dialog(page).locator('img').evaluate(img => img.decode());
    await dialog(page).getByRole('alert').waitFor({ state: 'hidden' }); failImage = true;
    // History keeps the shared full-screen preview and actions.
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '打开历史记录' }).click();
    await page.getByRole('button', { name: '预览素材 生成视频', exact: true }).click(); await dialog(page).locator('video').waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '预览素材 生成视频', exact: true }).click();
    await page.evaluate(() => { location.hash = '#home'; }); await dialog(page).waitFor({ state: 'hidden' });
  }
  assert.deepEqual(errors, []); assert.ok(geometry.every(g => g.scrollWidth <= g.width));
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    const result = await new Promise(resolve => { const child = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: 'http://127.0.0.1:33199' }, stdio: ['ignore', 'pipe', 'pipe'] }); let text = ''; child.stdout.on('data', d => text += d); child.stderr.on('data', d => text += d); child.on('close', code => resolve({ code, text })); });
    fs.writeFileSync(path.join(output, 'acceptance-log.txt'), result.text); assert.equal(result.code, 0, result.text);
  }
  const report = { errors, geometry, checks: ['四宽度直接全屏预览且保留概览', '默认/悬停/焦点/全屏/移动截图', '横竖图片保持比例', '视频真实夹具播放', '重命名与共享刷新', '删除确认与失败重试', '只读权限', '媒体错误与重新加载', 'Esc/关闭与焦点、滚动恢复', '路由切换关闭预览', '历史共用全屏预览与动作'], boundary: '资源及权限 API 为模拟夹具，视频为本地有效 MP4；使用独立33199静态服务，未操作真实用户素材、未调用生成接口、未结束3199服务。' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
