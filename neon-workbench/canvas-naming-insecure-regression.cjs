const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const output = path.resolve(__dirname, '../.design/feature-isolation-20261015/naming-quota');
fs.mkdirSync(output,{recursive:true});
const dataDir = fs.mkdtempSync(path.join(output,'test-data-'));
const address = Object.values(os.networkInterfaces()).flat().find(i=>i.family==='IPv4'&&!i.internal&&i.address.startsWith('192.168.1.'))?.address;
assert.ok(address, '需要局域网地址以验证实际HTTP非安全上下文');
const port='33203', base=`http://${address}:${port}`;
const server=spawn(process.execPath,['server.js'],{cwd:runtime,env:{...process.env,PORT:port,HOST:'0.0.0.0',AI_OS_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
fs.writeFileSync(path.join(output,'test-server.pid'),String(server.pid));
let browser,log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const checks=[], errors=[];
async function main(){
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(`http://127.0.0.1:${port}/api/system/health`)).ok)break;}catch{}if(i===99)throw Error('独立服务启动失败');await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
 const context=await browser.newContext();const api=context.request;
 assert.equal((await api.post(`http://127.0.0.1:${port}/api/auth/bootstrap`,{data:{username:'namingqa',displayName:'命名兼容验收',password:'NamingTest-2026!'}})).status(),201);
 assert.equal((await api.post(base+'/api/auth/login',{data:{username:'namingqa',password:'NamingTest-2026!'}})).status(),200);
 const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 // Also remove it explicitly, so localhost substitutions cannot mask a regression.
 await page.addInitScript(()=>{Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true});});
 for(const width of [390,768,1440,1728]){
  const before=`未命名画布-${width}`, after=`局域网已命名-${width}`;
  const created=await api.post(base+'/api/canvas/boards',{data:{title:before}});assert.equal(created.status(),201);
  const board=await created.json();
  await page.setViewportSize({width,height:960});await page.goto(base+`/neon-workbench.html?width=${width}#projects`);
  const environment=await page.evaluate(()=>({secure:isSecureContext,uuid:typeof crypto.randomUUID}));
  assert.equal(environment.secure,false);assert.equal(environment.uuid,'undefined');
  await page.getByRole('button',{name:`打开画布 ${before}`,exact:true}).waitFor();
  const card=page.getByRole('button',{name:`打开画布 ${before}`,exact:true}).locator('..');
  await card.getByRole('button',{name:'管理画布',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'画布名称',exact:true}).fill(after);
  const posted=page.waitForResponse(r=>r.url().includes(`/api/canvas/boards/${board.id}/operations`)&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'保存名称',exact:true}).click();
  assert.equal((await posted).status(),200);
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] button')].some(b=>b.textContent==='保存名称'&&!b.disabled));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:`打开画布 ${after}`,exact:true}).waitFor();
  await page.screenshot({path:path.join(output,`naming-insecure-${width}.png`)});
  await page.reload();await page.getByRole('button',{name:`打开画布 ${after}`,exact:true}).waitFor();
  const boards=await (await api.get(base+'/api/canvas/boards?scope=all')).json();assert.equal(boards.boards.find(b=>b.id===board.id).title,after);
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(geometry.scrollWidth<=width);
  checks.push({width,...environment,persisted:true,geometry});
 }
 assert.deepEqual(errors,[]);const report={checks,errors,base,boundary:'独立33203测试数据与真实存储API；没有读写用户画布，没有请求收费模型。当前已部署命名实现兼容性验证，不表示历史截图根因已重现。'};
 fs.writeFileSync(path.join(output,'naming-insecure-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server.exitCode===null)server.kill();});
