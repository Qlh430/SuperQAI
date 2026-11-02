const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/script-production-20261013');
fs.mkdirSync(output, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(output, 'test-data-'));
const port = 33199, base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], { cwd: runtime, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AI_OS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', browser, debugPage, releaseJob;
const firstJobGate = new Promise(resolve => { releaseJob = resolve; });
child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
const png = fs.readFileSync(path.join(runtime, 'logo.png'));
const modelReply = { title: '穿越回来只为一件事', assets: [
  { id: 'lin', type: 'character', name: '小林', description: '现代上班族，25岁左右', prompt: '小林，现代上班族，人物外观设定' },
  { id: 'ancient', type: 'character', name: '古人', description: '穿越而来的年轻男子', prompt: '古装年轻男子，统一外观与服装' },
  { id: 'office', type: 'scene', name: '办公室_深夜', description: '现代办公室', prompt: '现代办公室，深夜，电脑冷光' },
  { id: 'phone', type: 'prop', name: '手机', description: '现代智能手机', prompt: '现代智能手机，清晰产品外观' },
], shots: Array.from({ length: 3 }, (_, index) => ({ id: `shot${index}`, duration: 5, assetIds: ['lin', 'ancient', 'office', 'phone'], description: ['小林深夜加班，古人突然出现', '古人好奇地观察手机', '两人在办公室谈话'][index], framing: '中景', blocking: '人物保持相对位置', camera: '缓慢推进', lighting: '冷色办公室灯光', dialogue: '古人：此处……可是天宫？', sound: '键盘与背景声', imagePrompt: '办公室中小林与古人', videoPrompt: '镜头缓慢推进，古人举起手机，小林抬头' })), warnings: ['办公室标题白天与23:48冲突，采用深夜建议，原文保留'] };
const results = [];
async function main() {
  const deadline = Date.now() + 20000;
  while (!log.includes(`AI API console running at http://localhost:${port}`)) { if (child.exitCode !== null || Date.now() > deadline) throw new Error(`独立测试服务启动失败：${log}`); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.post(`${base}/api/auth/bootstrap`, { data: { username: 'productionqa', password: 'Production-2026!', displayName: '制作流程验收' } })).status(), 201);
  assert.equal((await context.request.post(`${base}/api/auth/login`, { data: { username: 'productionqa', password: 'Production-2026!' } })).status(), 200);
  const uploaded = await context.request.post(`${base}/api/upload-image`, { headers: { 'Content-Type': 'image/png', 'X-File-Name': 'qa-production.png' }, data: png });
  assert.equal(uploaded.status(), 200); const image = (await uploaded.json()).url;
  const jobs = new Map(), imageRequests = [], videoRequests = [], chatRequests = [], errors = [];
  const page = await context.newPage(); debugPage = page; page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') fs.appendFileSync(path.join(output, 'console.log'), msg.text() + '\n'); });
  await context.route('**/api/models', route => route.fulfill({ json: { models: [{ id: 'qa-text', displayName: '模拟文本模型' }], defaultModel: 'qa-text' } }));
  await context.route('**/api/vision-models', route => route.fulfill({ json: { models: [{ id: 'qa-text', displayName: '模拟文本模型' }] } }));
  await context.route('**/api/image-models*', route => route.fulfill({ json: { models: ['qa-image'], modelOptions: [{ id: 'qa-image', displayName: '模拟图片模型', platform: 'google', family: 'gemini', capabilities: ['image.generate', 'image.edit'] }], defaultModel: 'qa-image', resolutions: { 'qa-image': ['1', '2'] } } }));
  await context.route('**/api/video-models', route => route.fulfill({ json: { models: [{ id: 'qa-video', displayName: '模拟视频模型', platform: 'openai' }], defaultModel: 'qa-video', durations: { 'qa-video': { min: 4, max: 10 } }, ratios: { 'qa-video': ['16:9', '9:16'] }, resolutions: { 'qa-video': ['720p'] } } }));
  await context.route('**/api/chat', route => {
    const body = route.request().postDataJSON(); chatRequests.push(body);
    let preparation; try { preparation = JSON.parse(body.messages.findLast(m => m.role === 'user').content); } catch {}
    const reply = preparation?.items ? { items: preparation.items.map(item => ({ id: item.id, prompt: item.prompt + '\n保持人物、场景与动作连贯。' })) } : modelReply;
    return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(reply) } }] } });
  });
  await context.route('**/api/image-jobs**', async route => {
    fs.appendFileSync(path.join(output, 'media-debug.log'), route.request().method() + ' ' + route.request().url() + '\n');
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); imageRequests.push(body);
      if (imageRequests.length === 1) await firstJobGate;
      await new Promise(resolve => setTimeout(resolve, 200));
      const job = { id: `qa-job-${imageRequests.length}`, boardId: body.board_id, nodeId: body.node_id, model: body.model, state: 'completed', result: { data: [{ url: image, width: 1, height: 1 }] } };
      jobs.set(job.id, job); return route.fulfill({ json: { job } });
    }
    const id = new URL(route.request().url()).pathname.split('/').pop(); return route.fulfill({ json: { job: jobs.get(id) } });
  });
  const videoFixture = '/output/qa-production-video.mp4';
  await context.route('**/output/qa-production-video.mp4', route => route.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.join(__dirname,'test-fixtures/video-seek-fixture.mp4'))}));
  await context.route('**/api/videos', route => { videoRequests.push(route.request().postDataJSON()); return route.fulfill({ json: { videos: [videoFixture] } }); });
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.AiOsDesktop?.getSession?.()?.user));
  await page.evaluate(async () => {
    const loaded = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-llm', 'canvas-node-video-api']); if (loaded?.ok === false) throw new Error(JSON.stringify(loaded));
    window.qaRawErrors=[]; const safeError=getSafeCanvasImageGenerationError; getSafeCanvasImageGenerationError=(error,...args)=>{qaRawErrors.push({message:error?.message,stack:error?.stack,code:error?.code});return safeError(error,...args)};
    await loadCanvasBoards();
    const surface = document.createElement('section'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column'; document.body.append(surface);
    const view = document.querySelector('#canvasView'); surface.append(view); view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'; document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
    window.qaScript = CanvasScriptProduction.add({ x: 100, y: 80 }); selectCanvasNode(qaScript);
  });
  assert.equal(await page.locator('[data-canvas-node=script-production]').count(), 1);
  await page.evaluate(async () => { await CanvasScriptProduction.open(qaScript); });
  const frame = page.frameLocator('#neonScriptProductionFrame');
  await frame.getByRole('heading', { name: '脚本制作', exact: true }).waitFor();
  await frame.getByRole('textbox', { name: '故事与剧本原文' }).fill(fs.readFileSync('Q:/AI下载/穿越回来只为一件事.md', 'utf8'));
  await frame.getByRole('combobox', { name: '文本模型', exact: true }).selectOption('qa-text');
  await frame.getByRole('button', { name: '拆解剧本并准备资产' }).click();
  await frame.getByText('分镜和三类资产已准备，尚未发送图片生成。', { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(chatRequests.length, 1); assert.equal(imageRequests.length, 0); assert.equal(videoRequests.length, 0);
  const prepared = await page.evaluate(() => JSON.parse(qaScript.dataset.productionWorkflow));
  assert.equal(prepared.assets.length, 4); assert.equal(new Set(prepared.assets.map(a => a.nodeId)).size, 4);
  assert.equal(await page.evaluate(() => [...canvasVirtualStore.values()].filter(n => n.productionStage === 'groups').length), 3);
  results.push('剧本分析创建三类资产节点和组，准备产生零媒体请求');
  await frame.getByRole('button', { name: /^2 资产$/ }).click();
  await frame.getByRole('combobox', { name: '图片模型', exact: true }).selectOption('qa-image');
  await frame.getByRole('tab', { name: /^场景 1$/ }).click();
  const batchButton=frame.getByRole('button',{name:/^一键生成全部资产/});
  await batchButton.hover(); await page.waitForTimeout(300); await page.screenshot({path:path.join(output,'assets-hover.png')});
  await batchButton.focus(); await page.mouse.move(0,0); await page.waitForTimeout(300); await page.screenshot({path:path.join(output,'assets-focus.png')});
  await frame.getByRole('checkbox',{name:'选中资产 办公室_深夜'}).check(); await page.waitForTimeout(300); await page.screenshot({path:path.join(output,'assets-selected.png')});
  await frame.getByRole('checkbox',{name:'选中资产 办公室_深夜'}).uncheck();
  await frame.getByRole('button', { name: /^一键生成全部资产/ }).click();
  await frame.getByRole('dialog', { name: '选择人物图类型' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(output,'character-layout-modal.png')});
  await frame.getByRole('button', { name: '使用此类型并生成' }).click();
  await frame.getByText(/已向画布提交 4 项图片任务/).waitFor();
  const duplicate = await page.evaluate(async () => { const w=JSON.parse(qaScript.dataset.productionWorkflow);const node=ensureCanvasNodeMounted(w.assets.at(-1).nodeId); try {await CanvasScriptProduction.preflight(node);return ''}catch(error){return error.message} });
  assert.match(duplicate,/队列|任务仍在/,'批量排队时原生发送必须被拦截');
  releaseJob();
  await page.waitForFunction(() => JSON.parse(qaScript.dataset.productionWorkflow).assets.every(a => getCanvasNode(a.nodeId)?.dataset.resultSrc || canvasVirtualStore.get(a.nodeId)?.resultSrc), null, { timeout: 20000 });
  await frame.getByRole('button', { name: '刷新画布状态' }).click();
  assert.equal(imageRequests.length, 4); assert.equal(videoRequests.length, 0);
  assert.ok(imageRequests.every(request => request.model === 'qa-image'), '工作台明确选用的图片模型必须传给生成 API');
  results.push('全部资产按钮位于全屏底部，切到场景后仍只发送三类四个待生成资产');
  await frame.getByRole('button', { name: /^3 合成故事板$/ }).click();
  await frame.getByRole('button', { name: '准备 / 更新故事板参考' }).click();
  await page.waitForFunction(() => JSON.parse(qaScript.dataset.productionWorkflow).storyboards.length === 3);
  assert.equal(imageRequests.length, 4);
  const stories = await page.evaluate(() => JSON.parse(qaScript.dataset.productionWorkflow).storyboards);
  assert.equal(stories.length, 3); assert.equal(stories[0].references.length, 4);
  fs.writeFileSync(path.join(output,'prepared-debug.json'), JSON.stringify(await page.evaluate(() => { const w=JSON.parse(qaScript.dataset.productionWorkflow);return {connections:canvasState.connections,status:document.querySelector('#canvasStatus')?.textContent,nodes:[...w.assets,...w.storyboards].map(i=>{const n=ensureCanvasNodeMounted(i.nodeId);return {id:i.nodeId,data:n&&{...n.dataset},refs:getCanvasIncomingRefs(i.nodeId),virtual:canvasVirtualStore.get(i.nodeId)}})} }),null,2));
  await frame.getByRole('button', { name: /^生成全部待生成故事板/ }).click();
  await page.waitForFunction(() => JSON.parse(qaScript.dataset.productionWorkflow).storyboards.every(a => getCanvasNode(a.nodeId)?.dataset.resultSrc || canvasVirtualStore.get(a.nodeId)?.resultSrc), null, { timeout: 20000 });
  assert.equal(imageRequests.length, 7); assert.equal(imageRequests[4].reference_images.length, 4);
  results.push('故事板准备零请求，明确发送后使用四个真实已上传图片引用');
  await frame.getByRole('button', { name: '刷新画布状态' }).click();
  await frame.getByText('已完成 3 / 3', {exact:true}).waitFor();
  await frame.getByRole('button', { name: /^4 视频生成$/ }).click();
  await frame.getByRole('combobox', { name: '视频模型', exact: true }).selectOption('qa-video');
  await frame.getByRole('button', { name: '准备视频节点', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(qaScript.dataset.productionWorkflow).videos.length === 3);
  assert.equal(videoRequests.length, 0);
  await frame.getByRole('button', { name: /^生成全部待生成视频/ }).click();
  await page.waitForFunction(() => JSON.parse(qaScript.dataset.productionWorkflow).videos.every(a => getCanvasNode(a.nodeId)?.dataset.generationVideoSrc || canvasVirtualStore.get(a.nodeId)?.generationVideoSrc), null, { timeout: 20000 });
  assert.equal(videoRequests.length, 3); assert.equal(videoRequests[0].reference_images.length, 1);
  assert.equal(chatRequests.length,3,'脚本、故事板及视频准备分别使用文本模型');
  await frame.getByRole('button', { name: '刷新画布状态' }).click();
  await frame.getByText('已完成 3 / 3', {exact:true}).waitFor();
  assert.equal(await frame.locator('video').count(),3);
  results.push('第四步创建现有视频节点但不自动运行，全部视频明确发送三项');
  for (const width of [390, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [index, label] of ['脚本', '资产', '合成故事板', '视频生成'].entries()) {
      await frame.getByRole('button', { name: new RegExp(`^(?:${index + 1} )?${label}$`) }).click();
      const childFrame = page.frames().find(f => f.url().includes('workspace=script'));
      await childFrame.locator(`button[aria-current="step"]`).waitFor();
      await page.mouse.move(0,0); await page.waitForTimeout(200);
      assert.equal(await childFrame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}/${label} 横向溢出`);
      await page.screenshot({ path: path.join(output, `${width}-step-${index + 1}.png`) });
    }
  }
  results.push('四步在390、768、1440、1728宽度无横向溢出');
  await page.setViewportSize({width:390,height:1000});await frame.getByRole('button',{name:/^(?:2 )?资产$/}).click();
  await frame.getByRole('button',{name:'设定与参考',exact:true}).click();await frame.getByRole('dialog',{name:'场景设定'}).waitFor();await page.waitForTimeout(300);
  const mobileFrame=page.frames().find(f=>f.url().includes('workspace=script'));
  assert.equal(await mobileFrame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'390-asset-modal.png')});await frame.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  results.push('默认、悬停、焦点、选中、全屏、人物类型弹窗与移动端设定弹窗已检查');
  const before = { images: imageRequests.length, videos: videoRequests.length, text: chatRequests.length };
  await frame.getByRole('button', { name: '返回画布', exact: true }).click();
  await page.locator('#neonScriptProductionFrame').waitFor({state:'detached'});
  await page.evaluate(async () => { const item = serializeCanvasNode(qaScript); window.savedProduction = item; await CanvasWorkspace.saveForNavigation(); window.productionBoardId = canvasState.activeBoardId; });
  await page.evaluate(async () => { await CanvasScriptProduction.open(qaScript); });
  await frame.getByText('已同步画布', { exact: true }).waitFor();
  assert.deepEqual({ images: imageRequests.length, videos: videoRequests.length, text: chatRequests.length }, before);
  assert.equal(await page.evaluate(() => savedProduction.productionWorkflow.videos.length), 3);
  const boardId = await page.evaluate(() => productionBoardId);
  const stored = await context.request.get(`${base}/api/canvas/boards/${boardId}/node?nodeId=${prepared.assets[0].nodeId}`);
  assert.equal(stored.status(), 200); assert.equal((await stored.json()).node.productionStage, 'assets');
  results.push('真实宿主保存节点payload，返回再打开不重复文本或媒体任务');
  const invalidWire = await page.evaluate(async () => {
    const w=JSON.parse(qaScript.dataset.productionWorkflow), item=w.storyboards[0], previous=[...canvasState.connections];
    const node=ensureCanvasNodeMounted(item.nodeId);canvasState.connections=canvasState.connections.filter(c=>c.to!==item.nodeId||c.productionSource);
    try {await CanvasScriptProduction.preflight(node);return ''}catch(error){return error.message}finally{canvasState.connections=previous;}
  });
  assert.match(invalidWire,/参考连线/);
  await context.route('**/api/canvas/boards',async route=>{const response=await route.fetch();const data=await response.json();data.boards=data.boards.map(b=>({...b,isOwner:false,permission:'view'}));await route.fulfill({json:data});});
  const denied=await page.evaluate(async()=>{const item=JSON.parse(qaScript.dataset.productionWorkflow).assets[0];try{await CanvasScriptProduction.preflight(ensureCanvasNodeMounted(item.nodeId));return ''}catch(error){return error.message}});
  assert.match(denied,/只读/);assert.deepEqual({ images:imageRequests.length,videos:videoRequests.length,text:chatRequests.length},before);
  results.push('排队阻止重复发送，实际连线变化和只读权限阻止媒体提交');
  assert.deepEqual(errors, []);
  if (process.argv.includes('--acceptance')) {
    const acceptance = spawn(process.execPath, ['acceptance.cjs'], { cwd: __dirname, env: { ...process.env, AI_OS_TEST_URL: base }, stdio: 'inherit' });
    const exit = await new Promise(resolve => acceptance.once('exit', resolve)); assert.equal(exit, 0);
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, errors, imageRequests, videoRequests, mockMedia: true, realStorage: true, dataDir }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results, errors, output }, null, 2));
}
main().catch(async error => {
  let state; try { state = await debugPage.evaluate(() => { const w = JSON.parse(qaScript.dataset.productionWorkflow); return { rawErrors:window.qaRawErrors,workflow:w, nodes:[...w.assets,...w.storyboards,...w.videos].map(i => { const n=getCanvasNode(i.nodeId);return {id:i.nodeId,refs:getCanvasIncomingRefs(i.nodeId), status:n && getCanvasNodeStatusElement(n)?.textContent,data:n && {...n.dataset}}}) }; }); await debugPage.screenshot({path:path.join(output,'failure.png')}); const frame = debugPage.frames().find(f => f.url().includes('workspace=script')); state.ui = await frame?.locator('body').innerText(); } catch {}
  fs.writeFileSync(path.join(output, 'failure.txt'), error.stack + '\n' + JSON.stringify(state, null, 2) + '\n' + log); console.error(error); process.exitCode = 1;
}).finally(async () => { releaseJob(); await browser?.close(); if (child.exitCode === null) child.kill(); });
