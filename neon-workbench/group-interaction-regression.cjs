const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/group-interaction-20261014'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(runtime, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(runtime + path.sep)) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
const stub = { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} };
const source = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#446677"/></svg>');
let browser;
async function drag(page, x, y, dx, dy) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(100); }
async function state(page) { return page.evaluate(() => ({ group: serializeCanvasNode(window.qaGroup), members: window.qaMembers.map(n => serializeCanvasNode(n)) })); }
async function main() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(33199, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  const errors = [], checks = [], geometry = []; page.on('pageerror', e => errors.push(e.message));
  let modelLoads = 0;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/nodes')) {
      modelLoads++;
      const nodes = await page.evaluate(ids=>ids.map(id=>getCanvasNode(id)?serializeCanvasNode(getCanvasNode(id)):canvasVirtualStore.get(id)).filter(Boolean),url.searchParams.getAll('nodeId'));
      return route.fulfill({contentType:'application/json',body:JSON.stringify({nodes,connections:[]})});
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(stub) });
  });
  for (const width of [1440, 390, 768, 1728]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('http://127.0.0.1:33199/');
    await page.evaluate(async src => {
      const loaded = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator']); if (loaded?.ok === false) throw new Error(JSON.stringify(loaded));
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-group';
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'; document.body.append(surface);
      const view = document.querySelector('#canvasView'); surface.append(view); view.style.flex = '1'; view.style.minHeight = '0'; view.style.width = '100%'; view.hidden = false; view.classList.add('active');
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      window.qaMembers = [[120,160,80,240],[232,160,240,240],[120,480,80,80],[232,480,240,80]].map(([x,y,width,height], i) => {
        const image = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width*4}" height="${height*4}"><rect width="100%" height="100%" fill="#446677"/></svg>`);
        return addCanvasImage(image, `组内图片${i}.png`, {x,y}, {displaySize:{width,height}});
      });
      clearCanvasSelection(); window.qaMembers.forEach(addCanvasNodeToSelection); window.qaGroup = createCanvasGroupFromSelection();
      canvasState.scale = Math.min(.85, (innerWidth-64)/Number(window.qaGroup.dataset.width));
      canvasState.x = innerWidth/2 - (Number(window.qaGroup.dataset.x)+Number(window.qaGroup.dataset.width)/2)*canvasState.scale;
      canvasState.y = 180 - Number(window.qaGroup.dataset.y)*canvasState.scale; applyCanvasTransformNow(); clearCanvasSelection();
    }, source);
    await page.waitForTimeout(250);
    const margins = await page.evaluate(() => { const g = getCanvasNodeBox(window.qaGroup), b = getCanvasNodesBounds(window.qaMembers); return [b.left-g.left,b.top-g.top,g.right-b.right,g.bottom-b.bottom]; });
    assert.ok(margins.every(n => n >= 0 && n <= 17), `组框应贴合成员，实际内边距${margins}`);
    const group = page.locator('.canvas-node-group').first();
    const titleBox = await group.locator('.canvas-group-bar').boundingBox(), groupBox = await group.boundingBox();
    if (titleBox.y + titleBox.height > groupBox.y) console.log(await group.locator('.canvas-group-bar').evaluate(e => ({box:e.getBoundingClientRect().toJSON(),parent:e.parentElement.getBoundingClientRect().toJSON(),position:getComputedStyle(e).position,top:getComputedStyle(e).top,height:getComputedStyle(e).height,minHeight:getComputedStyle(e).minHeight,margin:getComputedStyle(e).margin,transform:getComputedStyle(e).transform})));
    assert.ok(titleBox.y + titleBox.height <= groupBox.y, '名称行应位于组外');
    geometry.push({ width, left: groupBox.x, right: groupBox.x+groupBox.width });
    await page.screenshot({ path: path.join(output, `${width}-default.png`) });
    const before = await state(page);
    const blank = await page.evaluate(() => { const a = qaMembers[0].getBoundingClientRect(), b = qaMembers[1].getBoundingClientRect(); return {x:(a.right+b.left)/2,y:a.top+a.height*.25}; });
    await drag(page, blank.x, blank.y, 24, 15);
    const moved = await state(page);
    if (!(moved.group.x > before.group.x)) console.log(await page.evaluate(point=>({point,hit:document.elementFromPoint(point.x,point.y)?.outerHTML.slice(0,350),groupPointer:getComputedStyle(qaGroup).pointerEvents,beforeX:Number(qaGroup.dataset.x),selected:[...canvasState.selectedIds],members:qaMembers.map(n=>({x:n.dataset.x,y:n.dataset.y}))}),blank));
    assert.ok(moved.group.x > before.group.x);
    for (let i=0;i<4;i++) { assert.ok(Math.abs((moved.members[i].x-before.members[i].x)-(moved.group.x-before.group.x))<1); assert.ok(Math.abs((moved.members[i].y-before.members[i].y)-(moved.group.y-before.group.y))<1); }
    const image = await page.locator(`[data-id="${moved.members[0].id}"] .flora-node-result-area`).boundingBox();
    await drag(page, image.x+image.width*.5, image.y+image.height*.5, 6, 10);
    const single = await state(page); assert.ok(single.members[0].y > moved.members[0].y);
    for(let i=1;i<4;i++) assert.equal(single.members[i].x, moved.members[i].x);
    await page.evaluate(() => selectCanvasNode(qaGroup));
    const handle = group.locator('.canvas-resize-handle'); await handle.hover();
    await page.screenshot({ path: path.join(output, `${width}-resize-hover.png`) });
    const box = await handle.boundingBox(), resizedBefore = await state(page);
    await drag(page, box.x+box.width*.65, box.y+box.height*.65, 36, 25);
    const bigger = await state(page); assert.ok(bigger.group.width > resizedBefore.group.width);
    const factors = bigger.members.map((n,i) => n.width/resizedBefore.members[i].width);
    assert.ok(factors[0] > 1 && factors.every(n => Math.abs(n-factors[0])<.01));
    await page.evaluate(() => undoCanvasChange({preventDefault(){}})); await page.waitForTimeout(120);
    const undone = await state(page); assert.ok(Math.abs(undone.members[0].width-resizedBefore.members[0].width)<1);
    await page.evaluate(() => redoCanvasChange()); await page.waitForTimeout(120);
    const redone = await state(page); assert.ok(Math.abs(redone.members[0].width-bigger.members[0].width)<1);
    await page.evaluate(() => selectCanvasNode(qaGroup));
    const smallerHandle = await handle.boundingBox(); await drag(page, smallerHandle.x+smallerHandle.width*.65,smallerHandle.y+smallerHandle.height*.65,-24,-18);
    const smaller = await state(page); assert.ok(smaller.members[0].width < bigger.members[0].width);
    const title = group.getByRole('textbox', {name:'组名称'}); await title.fill('我的裁剪组'); await title.press('Enter');
    assert.equal((await state(page)).group.groupTitle,'我的裁剪组');
    await title.focus(); await page.screenshot({ path: path.join(output, `${width}-title-focus.png`) }); await title.press('Escape');
    const persisted = await state(page);
    await page.evaluate(saved=>{qaGroup.dataset.width='1800';qaGroup.dataset.height='1600';applyCanvasNodeSize(qaGroup);queueCanvasGroupFit(qaGroup);},persisted.group);
    await page.waitForTimeout(120);
    const compact = await state(page); assert.ok(Math.abs(compact.group.width-persisted.group.width)<1 && Math.abs(compact.group.height-persisted.group.height)<1);
    const restored = await page.evaluate(saved=>{const node=restoreCanvasBoardNode({...saved,id:'restored-group'}, {id:canvasState.activeBoardId},{maxId:0}); return serializeCanvasNode(node);},persisted.group);
    assert.equal(restored.groupTitle,'我的裁剪组');
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, `${width}-resized.png`) });
    if(width===1728) {
      const detached = await page.evaluate(()=>{
        const n=qaMembers[3], saved=serializeCanvasNode(n); window.qaDetachedNode=n;
        canvasVirtualStore.mergeSerialized(saved.id,saved);canvasVirtualStore.setMounted(saved.id,null);n.remove(); selectCanvasNode(qaGroup);return saved;
      });
      const h=await handle.boundingBox();
      await drag(page,h.x+h.width*.7,h.y+h.height*.7,32,24);
      await page.waitForTimeout(200);
      const virtual = await page.evaluate(id=>canvasVirtualStore.get(id),detached.id);
      assert.ok(virtual.width>detached.width);
      assert.equal(virtual.mediaSizeMode,'manual');
      checks.push('未挂载成员通过缓存/待保存模型统一缩放');
    }
    checks.push(`${width}：紧凑组框、外部可改名标题、空白拖整组/图片单独拖、整组放大缩小、撤销重做、旧大框自动收紧与标题恢复`);
  }
  assert.deepEqual(errors,[]); assert.ok(geometry.every(g=>g.left>=0&&g.right<=g.width));
  if(process.env.RUN_FULL_ACCEPTANCE==='1') {
    const result=await new Promise(resolve=>{const child=spawn(process.execPath,['acceptance.cjs'],{cwd:__dirname,env:{...process.env,AI_OS_TEST_URL:'http://127.0.0.1:33199'},stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',d=>text+=d);child.stderr.on('data',d=>text+=d);child.on('close',code=>resolve({code,text}));});
    fs.writeFileSync(path.join(output,'acceptance.log'),result.text);assert.equal(result.code,0,result.text);checks.push('完整acceptance通过');
  }
  const report={errors,checks,geometry,boundary:'独立33199静态服务、模拟API和图片；真实运行时DOM操作；未操作用户画布或停止3199，真实登录待业务验收。'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
