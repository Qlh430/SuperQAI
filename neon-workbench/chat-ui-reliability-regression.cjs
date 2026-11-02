const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/chat-reliability-20261014'); fs.mkdirSync(output,{recursive:true});
const dataDir = fs.mkdtempSync(path.join(output,'test-data-'));
const base = 'http://127.0.0.1:33199';
const server = spawn(process.execPath,['server.js'],{cwd:runtime,env:{...process.env,PORT:'33199',HOST:'127.0.0.1',AI_OS_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',()=>{}); server.stderr.on('data',()=>{});
let browser;
const longText = '# 完整脚本\n\n' + Array.from({length:160},(_,i)=>`镜头${i+1}：中文场景与动作描述。光线、人物、运镜和剪辑节奏都应保持一致。🎬`).join('\n\n') + '\n\n完整结尾-END';
const warning = '已保留部分内容：达到模型输出上限，请继续生成剩余内容。';
let incomplete = false, canvasMode = false;
const records = [], requests = [], checks = [], errors = [], geometry = [];
async function ready(){for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error('独立测试服务启动失败');try{if((await fetch(base+'/api/system/health')).ok)return;}catch{} await new Promise(r=>setTimeout(r,200));}throw Error('独立服务启动超时');}
async function main(){
  await ready();
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
  await page.route('**/api/**',async route=>{
    const u=new URL(route.request().url());let body={};try{body=route.request().postDataJSON()||{};}catch{}
    let result={boards:[],projects:[],resources:[],records:[],models:[],providers:[],preferences:{appearance:{theme:'neon',scale:1,animations:'reduced'}},settings:{}};
    if(u.pathname==='/api/auth/session')result={authenticated:!canvasMode,user:canvasMode?null:{id:'qa',username:'qa',displayName:'测试账户',role:'superadmin',status:'active'}};
    if(['/api/models','/api/vision-models'].includes(u.pathname))result={models:[{id:'qa-chat',modelId:'qa-chat',providerId:'qa',providerName:'测试服务',displayName:'测试文字模型',capabilities:['llm.chat','llm.chat.vision']}]};
    if(u.pathname==='/api/chat'){requests.push(body);result={model:'qa-chat',choices:[{message:{content:longText},finish_reason:incomplete?'length':'stop'}],completion_status:incomplete?'incomplete':'completed',warning:incomplete?warning:''};}
    if(u.pathname==='/api/history/chat'){if(route.request().method()==='POST')records.unshift(body.record);result={records};}
    await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  for(const width of [390,768,1440,1728]){
    incomplete=false;await page.setViewportSize({width,height:960});await page.goto(base+`/neon-workbench.html?qa=${width}#chat`);
    await page.getByRole('textbox',{name:'对话消息'}).fill('生成完整分镜脚本');await page.getByRole('button',{name:'发送消息',exact:true}).click();
    await page.getByText('完整结尾-END',{exact:false}).last().waitFor();
    assert.ok((await page.locator('section[aria-label="对话内容"] article').last().innerText()).endsWith('完整结尾-END'));
    assert.equal(await page.getByText(warning,{exact:true}).count(),0);
    const geo=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));geometry.push(geo);assert.ok(geo.scrollWidth<=width);
    await page.screenshot({path:path.join(output,`chat-complete-${width}.png`)});
    incomplete=true;await page.getByRole('textbox',{name:'对话消息'}).fill('继续写详细镜头');await page.getByRole('button',{name:'发送消息',exact:true}).click();
    await page.getByText(warning,{exact:true}).waitFor();assert.ok((await page.locator('section[aria-label="对话内容"] article').last().innerText()).includes('完整结尾-END'));
    await page.getByRole('textbox',{name:'对话消息'}).fill('继续补充结尾');await page.getByRole('textbox',{name:'对话消息'}).focus();await page.getByRole('button',{name:'发送消息',exact:true}).hover();
    await page.screenshot({path:path.join(output,`chat-warning-focus-${width}.png`)});
  }
  assert.equal(records[0].messages.at(-1).warning,warning);checks.push('四宽度完整长文、未完成提示、悬停焦点、历史保留提示，无横向溢出');
  await page.reload();await page.getByRole('button',{name:'最近对话',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'生成完整分镜脚本',exact:true}).first().click();await page.getByText(warning,{exact:true}).waitFor();checks.push('刷新后从历史打开保留长文和结束提示');
  canvasMode=true;await page.goto(base+'/');
  await page.evaluate(async()=>{
    const loaded=await AiOsModuleLoader.ensure(['canvas-runtime','canvas-node-text']);if(loaded?.ok===false)throw Error('画布模块加载失败');await loadVisionModels();await loadCanvasBoards();canvasState.activeBoardId='qa-chat';
    const surface=document.createElement('div');surface.id='neonEngineSurface';surface.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b';document.body.append(surface);const view=document.querySelector('#canvasView');surface.append(view);view.style.cssText='flex:1;min-height:0;width:100%';view.hidden=false;view.classList.add('active');document.querySelector('#canvasEditorScreen').hidden=false;document.body.classList.add('canvas-surface-open');showCanvasEditor();window.qaText=addCanvasText({x:0,y:40},{focus:false,text:'原始文字'});selectCanvasNode(qaText);const m=qaText.querySelector('.canvas-llm-model');m.innerHTML='<option value="qa-chat">测试文字模型</option>';m.value='qa-chat';qaText.querySelector('.canvas-llm-prompt').value='生成完整脚本';window.qaSounds=0;CanvasGenerationSound._testHooks.setPlayHook(()=>qaSounds++);
  });
  for(const width of [390,768,1440,1728]){
    await page.setViewportSize({width,height:960});await page.evaluate(()=>{const controls=qaText.querySelector('.flora-generator-composer');canvasState.scale=Math.min(.85,(innerWidth-40)/Math.max(Number(qaText.dataset.width||400),controls?.offsetWidth||400));canvasState.x=innerWidth/2-Number(qaText.dataset.width||400)*canvasState.scale/2;canvasState.y=30;applyCanvasTransformNow();selectCanvasNode(qaText);});
    incomplete=true;await page.evaluate(()=>runCanvasLlmNode(qaText));
    assert.equal(await page.evaluate(()=>getCanvasTextValue(qaText)),longText);assert.equal(await page.evaluate(()=>getCanvasNodeStatusElement(qaText).dataset.state),'warning');assert.equal(await page.evaluate(()=>qaSounds),0);
    await page.locator('.flora-generator-status[data-state="warning"]').waitFor();const warningBox=await page.locator('.flora-generator-status[data-state="warning"]').boundingBox();assert.ok(warningBox.x>=0&&warningBox.x+warningBox.width<=width,'警告应完整留在视口');await page.screenshot({path:path.join(output,`canvas-warning-selected-${width}.png`)});
  }
  const saved=await page.evaluate(()=>serializeCanvasNode(qaText));assert.equal(saved.generationHistory.at(-1).completionStatus,'incomplete');
  await page.evaluate(item=>{unmountCanvasVirtualNode(qaText.dataset.id,qaText);window.qaText=restoreCanvasBoardNode({...item,id:'qa-text-warning-restored'}, {},{maxId:0});selectCanvasNode(qaText);},saved);
  assert.equal(await page.evaluate(()=>getCanvasTextValue(qaText)),longText);assert.equal(await page.evaluate(()=>getCanvasNodeStatusElement(qaText).textContent),warning);
  await page.locator('.flora-generator-status[data-state="warning"]').waitFor();checks.push('画布序列化与恢复保留每版输出的未完成标记');
  incomplete=false;await page.evaluate(()=>runCanvasLlmNode(qaText));assert.equal(await page.evaluate(()=>getCanvasTextValue(qaText)),longText);assert.equal(await page.evaluate(()=>getCanvasNodeStatusElement(qaText).textContent),'完成');assert.equal(await page.evaluate(()=>qaSounds),1);checks.push('画布保留全部长文，截断显示警告且不播放完成音；正常结束恢复完成状态');
  const history=await page.evaluate(()=>serializeCanvasNode(qaText).generationHistory);
  await page.locator('.flora-generation-history-badge').click();await page.locator(`.flora-generation-history-choice[data-history-id="${saved.currentGenerationId}"]`).click();assert.equal(await page.evaluate(()=>getCanvasNodeStatusElement(qaText).textContent),warning);
  await page.locator(`.flora-generation-history-choice[data-history-id="${history.at(-1).id}"]`).click();assert.equal(await page.evaluate(()=>getCanvasNodeStatusElement(qaText).textContent),'完成');
  await page.getByRole('button',{name:'关闭生成历史',exact:true}).click();checks.push('切换截断/完整历史版本同步显示或清除旧警告');
  await page.evaluate(()=>document.querySelector('#neonEngineSurface').requestFullscreen());await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.screenshot({path:path.join(output,'canvas-complete-fullscreen.png')});await page.evaluate(()=>document.exitFullscreen());
  await page.getByRole('button',{name:'放大文字',exact:true}).click();await page.getByRole('dialog',{name:'放大文字编辑',exact:true}).waitFor();assert.ok((await page.locator('.flora-text-expanded-body').innerText()).includes('完整结尾-END'));await page.locator('.flora-text-expanded-body .canvas-text').evaluate(e=>{e.scrollTop=e.scrollHeight;e.lastElementChild?.scrollIntoView({block:'end'});});await page.screenshot({path:path.join(output,'canvas-expanded-text-complete-ending.png')});await page.getByRole('button',{name:'关闭文字放大界面',exact:true}).click();checks.push('画布全屏和放大文字编辑中完整结尾可读取');
  assert.ok(requests.every(r=>r.max_tokens===undefined));assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'ui-report.json'),JSON.stringify({checks,errors,geometry,requests:requests.length,contentCharacters:longText.length,evidence:'独立33199临时存储与模拟文本API；未操作用户业务数据。'},null,2));console.log(JSON.stringify({checks,errors,geometry},null,2));
  await browser.close();browser=null;
  if(process.env.RUN_FULL_ACCEPTANCE==='1')await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['acceptance.cjs'],{cwd:__dirname,env:{...process.env,AI_OS_TEST_URL:base},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('完整验收失败 '+code)));});
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
