const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const portableRuntime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const runtime = process.env.AI_OS_TEST_RUNTIME || (fs.existsSync(path.join(portableRuntime, 'server.js')) ? portableRuntime : path.resolve(__dirname, '..'));
const output = path.resolve(__dirname, '../.design/auth-onboarding-20261013');
fs.mkdirSync(output, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(output, 'test-data-'));
const port = 33199;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], { cwd: runtime, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AI_OS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
fs.writeFileSync(path.join(output, 'test-server.pid'), String(child.pid));
let log = '';
child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
let browser;
const results = [];
async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); } }
const normalUser = { id: 'fixture', username: 'fixture', displayName: '验收账户', role: 'user', status: 'active', mustChangePassword: false };
async function fixture(route) {
  const req = route.request(), pathname = new URL(req.url()).pathname;
  let body = { projects: [], boards: [], resources: [], records: [], models: [{ id: 'mock', displayName: '模拟模型' }] };
  if (pathname === '/api/auth/session') body = { authenticated: true, user: normalUser };
  if (pathname === '/api/preferences') body = { preferences: { appearance: { scale: 1 } } };
  if (pathname === '/api/chat') body = { choices: [{ message: { content: '模拟对话已完成' } }] };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}
async function main() {
  const deadline = Date.now() + 20000;
  while (true) {
    if (child.exitCode !== null) throw new Error(log);
    if (Date.now() > deadline) throw new Error(`测试服务启动超时：${log}`);
    // Do not accidentally run tests against another process occupying the port.
    if (log.includes(`AI API console running at http://localhost:${port}`)) {
      await fetch(`${base}/api/auth/session`); break;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  await test('缺少 randomUUID 时仍可打开、发送并新建 AI 对话', async () => {
    const context = await browser.newContext();
    try {
      // Serve the same runtime under an HTTP LAN-style origin. Unlike localhost,
      // this is genuinely an insecure context, without stubbing crypto APIs.
      await context.route('http://lan-workbench.test:33199/**', async route => {
        const url = new URL(route.request().url());
        await route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) });
      });
      const page = await context.newPage(), errors = [], saved = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', async route => { if (route.request().method() === 'POST' && new URL(route.request().url()).pathname === '/api/history/chat') saved.push(route.request().postDataJSON().record); await fixture(route); });
      await page.goto('http://lan-workbench.test:33199/neon-workbench.html#chat');
      assert.equal(await page.evaluate(() => isSecureContext), false);
      assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
      await page.getByRole('textbox', { name: '对话消息' }).waitFor({ timeout: 3000 });
      await page.getByRole('textbox', { name: '对话消息' }).fill('测试兼容性');
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      await page.getByText('模拟对话已完成', { exact: true }).waitFor();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: '新对话', exact: true }).click();
      await page.getByRole('textbox', { name: '对话消息' }).fill('第二条测试');
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      await page.getByText('模拟对话已完成', { exact: true }).waitFor();
      await page.waitForTimeout(200);
      assert.equal(saved.length, 2); assert.notEqual(saved[0].id, saved[1].id);
      assert.match(saved[0].id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, 'chat-compatibility.png') });
    } finally { await context.close(); }
  });
  const admin = await browser.newContext();
  const bootstrap = await admin.request.post(`${base}/api/auth/bootstrap`, { data: { username: 'qaadmin', displayName: '验收管理员', password: 'AdminTest-2026!' } });
  assert.equal(bootstrap.status(), 201);
  assert.equal((await admin.request.post(`${base}/api/auth/login`, { data: { username: 'qaadmin', password: 'AdminTest-2026!' } })).status(), 200);
  await test('首次改密只填写新密码及确认；刷新持久化；主动改密仍验证当前密码', async () => {
    const created = await admin.request.post(`${base}/api/admin/users`, { data: { username: 'qafirst', displayName: '新账户验收' } });
    assert.equal(created.status(), 201);
    const temporaryPassword = (await created.json()).temporaryPassword;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: 'qafirst', password: temporaryPassword } })).status(), 200);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/`);
      const frame = page.frameLocator('#aiOsNeonFrame');
      const dialog = frame.getByRole('dialog', { name: '设置登录密码' });
      await dialog.waitFor({ timeout: 5000 });
      assert.equal(await dialog.locator('input[type=password]').count(), 2);
      assert.equal(await page.locator('#aiOsPasswordDialog').evaluate(e => e.open), false);
      await page.screenshot({ path: path.join(output, '390-password-default.png') });
      await dialog.getByRole('button', { name: '更新密码' }).hover();
      await page.screenshot({ path: path.join(output, '390-password-hover.png') });
      await dialog.getByLabel('新密码', { exact: true }).click();
      await page.keyboard.press('Tab');
      await page.screenshot({ path: path.join(output, '390-password-focus.png') });
      await dialog.getByLabel('新密码', { exact: true }).fill('short');
      await dialog.getByLabel('确认新密码', { exact: true }).fill('short');
      await dialog.getByRole('button', { name: '更新密码' }).click();
      await dialog.getByRole('alert').filter({ hasText: '至少需要 8 位' }).waitFor();
      await dialog.getByLabel('新密码', { exact: true }).fill('PermanentTest-2026!');
      await dialog.getByLabel('确认新密码', { exact: true }).fill('DoesNotMatch-2026!');
      await dialog.getByRole('button', { name: '更新密码' }).click();
      await dialog.getByText('两次输入的新密码不一致。', { exact: true }).waitFor();
      for (const width of [390, 768, 1440, 1728]) {
        await page.setViewportSize({ width, height: 960 });
        assert.equal(await dialog.evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
        await dialog.getByLabel('新密码', { exact: true }).focus();
        await page.screenshot({ path: path.join(output, `${width}-first-password.png`) });
      }
      await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
      await page.evaluate(() => document.documentElement.requestFullscreen());
      assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
      await page.screenshot({ path: path.join(output, 'password-fullscreen.png') });
      await page.evaluate(() => document.exitFullscreen());
      await dialog.getByLabel('确认新密码', { exact: true }).fill('PermanentTest-2026!');
      await dialog.getByRole('button', { name: '更新密码' }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await (await context.request.get(`${base}/api/auth/session`)).json()).user.mustChangePassword, false);
      assert.equal((await context.request.get(`${base}/api/preferences`)).status(), 200);
      await page.reload();
      await frame.getByRole('heading', { name: '今天想创作什么？', exact: true }).waitFor();
      assert.equal(await frame.getByRole('dialog').count(), 0);
      assert.equal(await page.locator('#aiOsPasswordDialog').evaluate(e => e.open), false);
      const missing = await context.request.post(`${base}/api/auth/change-password`, { data: { newPassword: 'AnotherTest-2026!' } });
      assert.equal(missing.status(), 401);
      assert.equal((await context.request.post(`${base}/api/auth/change-password`, { data: { currentPassword: 'PermanentTest-2026!', newPassword: 'AnotherTest-2026!' } })).status(), 200);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await test('首次改密拒绝原临时密码与未登录请求', async () => {
    const created = await admin.request.post(`${base}/api/admin/users`, { data: { username: 'qasame', displayName: '密码校验验收' } });
    const temporaryPassword = (await created.json()).temporaryPassword;
    const context = await browser.newContext();
    try {
      assert.equal((await context.request.post(`${base}/api/auth/change-password`, { data: { newPassword: 'ValidTest-2026!' } })).status(), 401);
      await context.request.post(`${base}/api/auth/login`, { data: { username: 'qasame', password: temporaryPassword } });
      const wrongCurrent = await context.request.post(`${base}/api/auth/change-password`, { data: { currentPassword: 'WrongTest-2026!', newPassword: 'ValidTest-2026!' } });
      assert.equal(wrongCurrent.status(), 401);
      const same = await context.request.post(`${base}/api/auth/change-password`, { data: { newPassword: temporaryPassword } });
      assert.equal(same.status(), 400); assert.equal((await same.json()).code, 'weak_password');
      const otherSession = await browser.newContext();
      await otherSession.request.post(`${base}/api/auth/login`, { data: { username: 'qasame', password: temporaryPassword } });
      assert.equal((await context.request.post(`${base}/api/auth/change-password`, { data: { newPassword: 'ValidTest-2026!' } })).status(), 200);
      assert.equal((await otherSession.request.get(`${base}/api/auth/session`)).status(), 401);
      assert.equal((await otherSession.request.post(`${base}/api/auth/login`, { data: { username: 'qasame', password: temporaryPassword } })).status(), 401);
      assert.equal((await otherSession.request.post(`${base}/api/auth/login`, { data: { username: 'qasame', password: 'ValidTest-2026!' } })).status(), 200);
      await otherSession.close();
    } finally { await context.close(); }
  });
  await test('故障恢复回到 Neon 概览，保持宿主旧桌面被覆盖', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage(); let attempts = 0;
      await page.route('**/api/**', fixture);
      await page.route('**/__host', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="aiOsDesktop">旧桌面</div><script>window.AiOsDesktop={getSession:()=>({user:{id:"fixture"}})};</script><script src="/neon-host-bridge.js"></script>' }));
      await page.route('**/neon-workbench.js?*', route => ++attempts === 1 ? route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("模拟页面崩溃")' }) : route.continue());
      await page.goto(`${base}/__host`);
      const frame = page.frameLocator('#aiOsNeonFrame');
      await frame.locator('#neonBootFallback[data-visible=true]').waitFor();
      await frame.locator('#neonBootDesktop').click();
      await frame.getByRole('heading', { name: '今天想创作什么？', exact: true }).waitFor({ timeout: 4000 });
      assert.equal(await page.locator('#aiOsNeonFrame').isVisible(), true);
      assert.match(await page.locator('#aiOsNeonFrame').getAttribute('src'), /#home$/);
      await page.screenshot({ path: path.join(output, 'recovered-neon-home.png') });
    } finally { await context.close(); }
  });
  await admin.close();
  if (process.argv.includes('--acceptance')) {
    await new Promise((resolve, reject) => {
      const acceptance = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: base }, stdio: 'inherit' });
      acceptance.on('error', reject);
      acceptance.on('exit', code => code === 0 ? resolve() : reject(new Error(`全量验收失败：${code}`)));
    });
    results.push({ name: '完整模拟 API 验收', passed: true });
  }
}
main().catch(error => { results.push({ name: '测试环境', passed: false, error: error.stack }); }).finally(async () => {
  await browser?.close();
  child.kill('SIGTERM');
  fs.writeFileSync(path.join(output, 'server.log'), log);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
});
