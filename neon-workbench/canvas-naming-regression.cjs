const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = process.env.AI_OS_TEST_RUNTIME || path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = process.env.AI_OS_TEST_REPORT || path.resolve(__dirname, '../.design/canvas-naming-20261014');
fs.mkdirSync(output, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(output, 'test-data-'));
const base = 'http://127.0.0.1:33199';
const server = spawn(process.execPath, ['server.js'], { cwd: runtime, env: { ...process.env, PORT: '33199', HOST: '127.0.0.1', AI_OS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
fs.writeFileSync(path.join(output, 'test-server.pid'), String(server.pid));
let log = '', browser;
server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
const errors = [], checks = [], geometry = [];
async function main() {
  const deadline = Date.now() + 25000;
  while (!log.includes('AI API console running at http://localhost:33199')) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`独立服务启动失败：${log}`);
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const api = context.request;
  assert.equal((await api.post(`${base}/api/auth/bootstrap`, { data: { username: 'namingqa', displayName: '画布命名验收', password: 'NamingTest-2026!' } })).status(), 201);
  assert.equal((await api.post(`${base}/api/auth/login`, { data: { username: 'namingqa', password: 'NamingTest-2026!' } })).status(), 200);
  const project = await (await api.post(`${base}/api/canvas/projects`, { data: { name: '命名验收项目' } })).json();
  const projects = (await (await api.get(`${base}/api/canvas/projects`)).json()).projects;
  const projectId = project.id || projects.find(p => p.name === '命名验收项目').id;
  const board = await (await api.post(`${base}/api/canvas/boards`, { data: { title: '原画布名称', projectId } })).json();
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  page.on('crash', () => errors.push('画布页面崩溃'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/`);
  const frame = page.frameLocator('#aiOsNeonFrame');
  await frame.getByRole('heading', { name: '今天想创作什么？' }).waitFor();
  await frame.getByRole('button', { name: '重命名画布 原画布名称', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '重命名画布', exact: true });
  assert.equal(await dialog.getByRole('textbox', { name: '画布名称' }).inputValue(), '原画布名称');
  await dialog.getByRole('textbox', { name: '画布名称' }).fill('  最近画布已改名  ');
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await frame.getByRole('button', { name: '重命名画布 最近画布已改名', exact: true }).waitFor();
  const listed = (await (await api.get(`${base}/api/canvas/boards?scope=all`)).json()).boards;
  assert.equal(listed.find(b => b.id === board.id).title, '最近画布已改名');
  const resources = (await (await api.get(`${base}/api/resources`)).json()).resources;
  assert.equal(resources.find(e => e.resource.refId === board.id).resource.title, '最近画布已改名');
  checks.push('最近画布改名真实持久化，去空格，同步素材标题');
  await page.reload();
  await frame.getByRole('button', { name: '重命名画布 最近画布已改名', exact: true }).waitFor();
  await frame.getByRole('button', { name: '项目', exact: true }).click();
  await frame.getByRole('combobox', { name: '项目筛选' }).selectOption(projectId);
  let createCount = 0;
  page.on('request', req => { if (new URL(req.url()).pathname === '/api/canvas/boards' && req.method() === 'POST') createCount++; });
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 });
    await frame.getByRole('button', { name: '新建画布', exact: true }).click();
    const createDialog = frame.getByRole('dialog', { name: '新建画布', exact: true });
    const input = createDialog.getByRole('textbox', { name: '画布名称' });
    await input.waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(await createDialog.getByRole('button', { name: '创建画布', exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(output, `${width}-create-default.png`) });
    await input.fill('    ');
    assert.equal(await createDialog.getByRole('button', { name: '创建画布', exact: true }).isDisabled(), true);
    await input.fill('命名后的新画布');
    await input.focus(); await page.screenshot({ path: path.join(output, `${width}-create-focus.png`) });
    await input.selectText(); await page.screenshot({ path: path.join(output, `${width}-create-selected.png`) });
    await createDialog.getByRole('button', { name: '创建画布', exact: true }).hover();
    await page.screenshot({ path: path.join(output, `${width}-create-hover.png`) });
    geometry.push(await frame.locator('html').evaluate(el => ({ width: innerWidth, scrollWidth: el.scrollWidth, overflow: [...document.querySelectorAll('[role="dialog"] *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.left < -2 || r.right > innerWidth + 2); }).map(e => e.tagName) })));
    await createDialog.getByRole('button', { name: '取消', exact: true }).click();
    await createDialog.waitFor({ state: 'hidden' });
  }
  assert.equal(createCount, 0);
  checks.push('四宽度命名弹窗，空白拦截，取消不创建');
  await page.setViewportSize({ width: 1440, height: 960 });
  await frame.getByRole('button', { name: '新建画布', exact: true }).click();
  const createDialog = frame.getByRole('dialog', { name: '新建画布', exact: true });
  await createDialog.getByRole('textbox', { name: '画布名称' }).fill('  命名后的新画布  ');
  await page.route('**/api/canvas/boards', route => route.request().method() === 'POST' ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: '无权创建' }) }) : route.continue());
  await createDialog.getByRole('button', { name: '创建画布', exact: true }).click();
  await createDialog.getByRole('alert').waitFor();
  assert.equal(await createDialog.getByRole('textbox', { name: '画布名称' }).inputValue(), '  命名后的新画布  ');
  await page.screenshot({ path: path.join(output, 'create-error.png') });
  await page.unroute('**/api/canvas/boards');
  await createDialog.getByRole('button', { name: '创建画布', exact: true }).click();
  await page.getByRole('button', { name: '保存并返回工作台' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(output, 'canvas-fullscreen.png') });
  const newBoards = (await (await api.get(`${base}/api/canvas/boards?scope=all`)).json()).boards;
  const created = newBoards.filter(b => b.title === '命名后的新画布');
  assert.equal(created.length, 1); assert.equal(created[0].projectId, projectId);
  if (process.env.AI_OS_EXPECT_MEDIA_NAMING === '1') {
    await page.waitForFunction(() => !canvasState.boardOpening && !canvasState.isRestoring);
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-audio']);
      window.namingNodes = [
        addCanvasImageGeneratorNode({ x: 100, y: 120 }, { focus: false }),
        addCanvasImageGeneratorNode({ x: 600, y: 120 }, { focus: false }),
        addCanvasVideoGeneratorNode({ x: 1200, y: 120 }, { focus: false }),
        addCanvasAudioGeneratorNode({ x: 1800, y: 120 }, { focus: false }),
      ];
      namingNodes.forEach(node => pinCanvasNode(node.dataset.id));
      canvasState.x = 40; canvasState.y = 40; canvasState.scale = 1;
      applyCanvasTransformNow();
    });
    assert.deepEqual(await page.evaluate(() => namingNodes.map(n => n.dataset.nodeTitle)), ['图片1', '图片2', '视频1', '音频1']);
    const firstId = await page.evaluate(() => namingNodes[0].dataset.id);
    await page.locator(`#canvasPlane [data-id="${firstId}"]`).click({ position: { x: 160, y: 100 } });
    const first = page.locator(`.canvas-node[data-id="${firstId}"]`);
    await first.locator(':scope > .flora-node-label .flora-node-label-title').dblclick();
    const titleInput = first.getByRole('textbox', { name: '节点名称', exact: true });
    await titleInput.fill('场景'); await titleInput.press('Enter');
    await page.waitForFunction(id => document.querySelector(`.canvas-node[data-id="${id}"]`)?.dataset.nodeTitle === '场景', firstId);
    assert.equal(await first.locator(':scope > .flora-node-label .flora-node-label-title').textContent(), '场景');
    const beforePan = await page.evaluate(() => ({ x: canvasState.x, y: canvasState.y }));
    await page.mouse.move(1150, 850); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(1250, 900, { steps: 30 }); await page.mouse.up({ button: 'middle' });
    await page.waitForFunction(({ x, y }) => canvasState.x !== x || canvasState.y !== y, beforePan);
    await page.waitForFunction(() => !document.querySelector('#infiniteCanvas').classList.contains('is-canvas-panning'));
    const dragTarget = first.locator(':scope > .flora-node-label .flora-node-label-icon');
    const rect = await dragTarget.boundingBox(); assert.ok(rect);
    const beforeDrag = await first.evaluate(n => ({ x: n.dataset.x, y: n.dataset.y }));
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 70, rect.y + rect.height / 2 + 50, { steps: 20 }); await page.mouse.up();
    await page.waitForFunction(({ id, before }) => { const n = document.querySelector(`.canvas-node[data-id="${id}"]`); return n.dataset.x !== before.x || n.dataset.y !== before.y; }, { id: firstId, before: beforeDrag });
    const scale = await page.evaluate(() => canvasState.scale);
    await page.mouse.move(1100, 800); await page.mouse.wheel(0, -120);
    await page.waitForFunction(previous => canvasState.scale !== previous, scale);
    await first.locator(':scope > .flora-node-label .flora-node-label-title').hover();
    assert.equal(await first.locator(':scope > .flora-node-label .flora-node-label-title').textContent(), '场景');
    await page.screenshot({ path: path.join(output, 'generator-titles-interaction.png') });
    checks.push('实际画布图片/视频/音频默认编号、标题编辑、中键平移、节点拖动、释放后缩放悬停通过');
  }
  await page.getByRole('button', { name: '保存并返回工作台' }).click();
  await frame.getByRole('heading', { name: '项目与画布' }).waitFor();
  await frame.getByRole('button', { name: '打开画布 命名后的新画布', exact: true }).waitFor();
  if (process.env.AI_OS_EXPECT_MEDIA_NAMING === '1') {
    await frame.getByRole('button', { name: '打开画布 命名后的新画布', exact: true }).click();
    await page.getByRole('button', { name: '保存并返回工作台' }).waitFor();
    await page.waitForFunction(() => !canvasState.boardOpening && canvasVirtualStore.values().some(n => n.nodeTitle === '场景'));
    assert.deepEqual(await page.evaluate(() => canvasVirtualStore.values().map(n => n.nodeTitle).sort()), ['场景', '图片2', '视频1', '音频1'].sort());
    await page.getByRole('button', { name: '保存并返回工作台' }).click();
    await frame.getByRole('heading', { name: '项目与画布' }).waitFor();
    checks.push('节点独立标题保存并重新打开保持一致');
  }
  checks.push('创建失败保留输入，重试只创建一张命名画布，归属正确，全屏进入返回');
  await frame.getByRole('button', { name: '概览', exact: true }).click();
  await frame.getByRole('button', { name: '重命名画布 最近画布已改名', exact: true }).click();
  await dialog.getByRole('textbox', { name: '画布名称' }).fill('失败后保留名称');
  await page.route('**/api/canvas/boards/*/operations', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '保存名称失败，请重试。' }) }));
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click();
  await dialog.getByText('保存名称失败，请重试。', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: '画布名称' }).inputValue(), '失败后保留名称');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.unroute('**/api/canvas/boards/*/operations');
  checks.push('改名失败中文错误和输入保留');
  await frame.getByRole('button').filter({ hasText: '进入无限画布' }).click();
  await frame.getByRole('dialog', { name: '新建画布', exact: true }).waitFor();
  await frame.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await frame.getByRole('button', { name: '重命名画布 最近画布已改名', exact: true }).hover();
  await page.screenshot({ path: path.join(output, '390-recent-hover.png') });
  await frame.getByRole('button', { name: '打开导航' }).click();
  await frame.getByRole('dialog', { name: '工作空间导航' }).getByRole('button', { name: '项目', exact: true }).click();
  await frame.getByRole('heading', { name: '项目与画布' }).waitFor();
  checks.push('概览创建也先命名，移动导航正常');
  assert.deepEqual(errors, []);
  assert.ok(geometry.every(g => g.scrollWidth <= g.width && g.overflow.length === 0));
  if (process.env.RUN_FULL_ACCEPTANCE === '1') {
    const result = await new Promise(resolve => {
      const acceptance = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: base }, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = ''; acceptance.stdout.on('data', d => text += d); acceptance.stderr.on('data', d => text += d);
      acceptance.on('close', code => resolve({ code, text }));
    });
    fs.writeFileSync(path.join(output, 'acceptance-log.txt'), result.text);
    assert.equal(result.code, 0, result.text); checks.push('完整 acceptance.cjs 通过');
  }
  const report = { checks, errors, geometry, boundary: '独立33199服务、临时数据与临时真实登录；403/500错误模拟；完整验收媒体API模拟；未操作用户现有数据及3199服务；Better Design未连接。' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill(); fs.writeFileSync(path.join(output, 'server.log'), log); });
