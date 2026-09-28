"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {createZip} = require('./build-electron-portable');
const {copyTree,removeInside} = require('../desktop/update-files');
let playwright;try{playwright=require('playwright')}catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const ROOT=path.resolve(__dirname,'..');
const suppliedArgument=process.argv.slice(2).find(argument=>!argument.startsWith('--'));
const supplied=path.resolve(suppliedArgument || path.join(ROOT,`dist/AI-OS-Portable-${require('../package.json').version}-win-x64`));
const suppliedManifest=JSON.parse(fs.readFileSync(path.join(supplied,'ai-os-portable.json'),'utf8'));
const baseVersion=String(suppliedManifest.version||'');
if(!/^\d+\.\d+\.\d+$/.test(baseVersion))throw Error(`Unsupported base version for Electron update check: ${baseVersion}`);
const nextVersion=offset=>{const [major,minor,patch]=baseVersion.split('.').map(Number);return `${major}.${minor}.${patch+offset}`};
const testVersions=[nextVersion(1),nextVersion(2)];
const baseRuntimeName=`${baseVersion}-win-x64`;
const temporaryParent=process.env.AI_OS_TEST_TEMP?path.resolve(process.env.AI_OS_TEST_TEMP):os.tmpdir();
fs.mkdirSync(temporaryParent,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=90_000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const r=await check();if(r)return r}catch(e){last=e}await delay(200)}throw Error(`${label}: ${last?.message||'timeout'}`)}
async function waitForMainWindow(app,label='main window'){
  return until(async()=>{
    for(const candidate of app.windows()){
      if(candidate.isClosed())continue;
      if(await candidate.locator('[data-ai-app="settings"]').count().catch(()=>0))return candidate;
    }
  },label,60_000);
}
function alive(pid){try{process.kill(pid,0);return true}catch{return false}}
function stop(pid){if(!pid||!alive(pid))return;try{execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'pipe'})}catch{}}
function hashFile(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function writeComponentManifest(runtimeRoot,version,componentVersion,content){
  const fixture=path.join(runtimeRoot,'resources/app/component-fixture.txt');
  fs.writeFileSync(fixture,content);
  const fileHash=hashFile(fixture),size=fs.statSync(fixture).size;
  const componentHash=crypto.createHash('sha256').update(`${componentVersion}\0${content}`).digest('hex');
  const manifest={
    format:1,
    product:'AI OS',
    version,
    platform:'win32',
    arch:'x64',
    components:[{
      id:'platform-core',
      label:'系统内核',
      version:componentVersion,
      hash:componentHash,
      files:[{path:'component-fixture.txt',size,sha256:fileHash}],
    }],
  };
  fs.writeFileSync(path.join(runtimeRoot,'resources/app/ai-os-components.json'),JSON.stringify(manifest,null,2));
  return manifest;
}
function createHistoricalSnapshot(root,id,ageMs,failed=false){
  const snapshot=path.join(root,'.ai-runtime/rollback',id);
  fs.mkdirSync(path.join(snapshot,'data'),{recursive:true});
  fs.writeFileSync(path.join(snapshot,'data','record.txt'),`snapshot ${id}`);
  if(failed){
    fs.mkdirSync(path.join(snapshot,'failed-data'),{recursive:true});
    fs.writeFileSync(path.join(snapshot,'failed-data','record.txt'),`failed ${id}`);
  }
  const time=new Date(Date.now()-ageMs);
  fs.utimesSync(snapshot,time,time);
}
(async()=>{
  const temp=fs.mkdtempSync(path.join(temporaryParent,'ai-os-electron-update-'));
  const root=path.join(temp,'AI OS 更新测试');
  const sandboxGpuArgs=process.env.AI_OS_TEST_DISABLE_GPU==='1'?['--disable-gpu']:[];
  let electronApp,diag;
  const reports=[];
  try{
    copyTree(supplied,root);
    const base=path.join(root,'.ai-runtime/versions',baseRuntimeName);
    writeComponentManifest(base,baseVersion,`${baseVersion}-base`,`base component ${baseVersion}`);
    if (process.argv.includes('--source-overlay')) {
      for(const file of fs.readdirSync(path.join(ROOT,'desktop')).filter(name=>/\.(js|ps1)$/.test(name)))fs.copyFileSync(path.join(ROOT,'desktop',file),path.join(base,'resources/app/desktop',file));
      for(const file of ['server.js','system-settings-ui.js','system-settings.css'])fs.copyFileSync(path.join(ROOT,file),path.join(base,'resources/app',file));
    }
    const historical={
      oldestSuccess:'01'.repeat(12),
      olderSuccess:'02'.repeat(12),
      latestSuccess:'03'.repeat(12),
      failureResult:'04'.repeat(12),
      young:'05'.repeat(12),
    };
    createHistoricalSnapshot(root,historical.oldestSuccess,24*60*60_000);
    createHistoricalSnapshot(root,historical.olderSuccess,2*60*60_000);
    createHistoricalSnapshot(root,historical.latestSuccess,60*60_000);
    createHistoricalSnapshot(root,historical.failureResult,3*60*60_000,true);
    createHistoricalSnapshot(root,historical.young,30_000);
    const candidates=path.join(temp,'candidates');fs.mkdirSync(candidates);
    const updateDir=path.join(root,'.ai-runtime/updates');fs.mkdirSync(updateDir,{recursive:true});
    fs.writeFileSync(path.join(updateDir,'result.json'),JSON.stringify({status:'updated',id:historical.latestSuccess,previous:baseRuntimeName,candidate:baseRuntimeName,error:null,finishedAt:new Date().toISOString()}));
    // Each candidate is a complete production runtime; only fixture version/failure injection differs.
    for(const version of testVersions){
      const candidate=path.join(candidates,`${version}-win-x64`);copyTree(base,candidate);
      const metadata=path.join(candidate,'resources/app/package.json');const pkg=JSON.parse(fs.readFileSync(metadata,'utf8'));pkg.version=version;fs.writeFileSync(metadata,JSON.stringify(pkg));
      writeComponentManifest(candidate,version,`${version}-candidate`,`candidate component ${version}`);
      if(version===testVersions[1]){
        const server=path.join(candidate,'resources/app/server.js');
        fs.writeFileSync(server,`require('node:fs').writeFileSync(require('node:path').join(process.env.AI_OS_DATA_DIR,'update-test-record.txt'),'failed migration');process.exit(23);\n`);
      }
      createZip(candidate,path.join(temp,`runtime-${version}.zip`));
    }
    fs.writeFileSync(path.join(root,'data/update-test-record.txt'),'preserve this record');
    fs.writeFileSync(path.join(root,'data/.env'),'CANVAS_AGENT_USE_SETTINGS_PROVIDERS=false\n');
    const account={username:'update-test',password:'temporary-update-test-password',displayName:'Update Test'};
    for(const version of testVersions){
      const active=fs.readFileSync(path.join(root,'.ai-runtime/.active-runtime'),'utf8').trim();
      const launchEnv={...process.env,AI_OS_PORTABLE_ROOT:root,CANVAS_AGENT_USE_SETTINGS_PROVIDERS:'false'};delete launchEnv.ELECTRON_RUN_AS_NODE;
      electronApp=await playwright._electron.launch({executablePath:path.join(root,'.ai-runtime/versions',active,'AI OS Runtime.exe'),args:['--hidden','--initialize',...sandboxGpuArgs],env:launchEnv,timeout:40_000});
      await electronApp.firstWindow();
      const page=await waitForMainWindow(electronApp);
      await page.waitForLoadState('networkidle');
      console.log(`Electron ${active} started; testing ${version}`);
      diag=await until(()=>{
        try{return JSON.parse(fs.readFileSync(path.join(root,'data/.logs/runtime-diagnostics.json'),'utf8'))}catch{return null}
      },'runtime diagnostics');
      const origin=diag.localUrl;
      if(version===testVersions[0]){
        const rollbackRoot=path.join(root,'.ai-runtime/rollback');
        await until(()=>!fs.existsSync(path.join(rollbackRoot,historical.oldestSuccess)),'startup rollback snapshot cleanup');
        for(const id of [historical.latestSuccess,historical.failureResult,historical.young]){
          assert.equal(fs.existsSync(path.join(rollbackRoot,id)),true,`rollback snapshot ${id} must be retained`);
        }
        console.log('Startup rollback retention removed expired history and preserved latest/failed/young snapshots');
      }
      if(version===testVersions[0]){
        assert.ok((await page.request.post(origin+'/api/auth/bootstrap',{data:account})).ok());
      }
      assert.ok((await page.request.post(origin+'/api/auth/login',{data:account})).ok());
      await page.reload({waitUntil:'networkidle'});
      const zip=path.join(temp,`runtime-${version}.zip`),bytes=fs.readFileSync(zip);
      const manifest={format:1,product:'AI OS',version,platform:'win32',arch:'x64',minUpdaterVersion:1,fileName:`runtime-${version}.zip`,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
      const repo=`https://github.com/Qlh430/SuperQAI/releases/download/v${version}/`;
      const release={tag_name:`v${version}`,body:'更新流程测试：保留账号和数据',assets:[{name:'ai-os-update.json',browser_download_url:repo+'ai-os-update.json'},{name:manifest.fileName,size:manifest.size,browser_download_url:repo+manifest.fileName}]};
      await electronApp.evaluate((_electron,{release,manifest,zip})=>{
        globalThis.fetch=async url=>{
          if(url.endsWith('/latest'))return Response.json(release);
          if(url.endsWith('.json'))return Response.json(manifest);
          return new Response(process.getBuiltinModule('stream').Readable.toWeb(process.getBuiltinModule('fs').createReadStream(zip)));
        };
      },{release,manifest,zip});
      await page.locator('[data-ai-app="settings"]').click();
      await page.locator('[data-settings-nav="system"]').click();
      await page.locator('[data-update-check]').click();
      await page.locator('[data-update-download]').waitFor();
      await page.locator('[data-update-download]').click();
      const downloaded = await until(async () => {
        const status=await page.evaluate(() => window.aiOsHost.getUpdateStatus());
        return ['ready','error'].includes(status.status) && status;
      },'download and preparation',120_000);
      assert.equal(downloaded.status,'ready',JSON.stringify(downloaded));
      console.log(`Runtime ${version} downloaded and prepared`);
      await page.locator('[data-update-restart]').waitFor({timeout:120_000});
      assert.equal(fs.readFileSync(path.join(root,'.ai-runtime/.active-runtime'),'utf8').trim(),active);
      assert.equal(fs.readFileSync(path.join(root,'data/update-test-record.txt'),'utf8'),'preserve this record');
      assert.ok((await page.request.get(origin+'/api/system/health')).ok(),'service remains available during download');
      const artifacts=path.join(ROOT,'artifacts/electron-updates');fs.mkdirSync(artifacts,{recursive:true});
      if(version===testVersions[0])await page.screenshot({path:path.join(artifacts,'settings-ready.png'),timeout:10_000}).catch(()=>{});
      if(fs.existsSync(path.join(updateDir,'result.json')))fs.unlinkSync(path.join(updateDir,'result.json'));
      const oldPid=diag.pid;
      await page.locator('[data-update-restart]').click();
      const result=await until(()=>{
        const file=path.join(updateDir,'result.json');return fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8'));
      },'update helper completion',120_000);
      assert.equal(result.status,version===testVersions[0]?'updated':'rolled-back',JSON.stringify(result));
      console.log(`Runtime ${version}: ${result.status}`);
      await until(()=>!fs.existsSync(path.join(updateDir,'install.json')),'transaction cleanup');
      diag=await until(()=>{
        const value=JSON.parse(fs.readFileSync(path.join(root,'data/.logs/runtime-diagnostics.json'),'utf8'));
        return value.pid!==oldPid&&alive(value.pid)&&value;
      },'restarted desktop');
      await until(async()=>{const r=await fetch(diag.localUrl+'/api/system/health');return r.ok},'new service');
      const context=await playwright.request.newContext({baseURL:diag.localUrl});
      assert.ok((await context.post('/api/auth/login',{data:account})).ok(),'account preserved');await context.dispose();
      assert.equal(fs.readFileSync(path.join(root,'data/update-test-record.txt'),'utf8'),'preserve this record');
      assert.equal(fs.readFileSync(path.join(root,'.ai-runtime/.active-runtime'),'utf8').trim(),`${testVersions[0]}-win-x64`);
      if(version===testVersions[1])assert.equal(fs.readFileSync(path.join(root,'.ai-runtime/rollback',result.id,'failed-data/update-test-record.txt'),'utf8'),'failed migration');
      reports.push({version,result:result.status,accountPreserved:true,dataPreserved:true});
      // Only stop processes whose diagnostics originated inside this disposable fixture.
      stop(diag.pid);stop(diag.serverPid);await delay(1000);
      await electronApp.close().catch(()=>{});electronApp=null;
    }
    const rollbackActive=fs.readFileSync(path.join(root,'.ai-runtime/.active-runtime'),'utf8').trim();
    assert.equal(rollbackActive,`${testVersions[0]}-win-x64`);
    const rollbackEnv={...process.env,AI_OS_PORTABLE_ROOT:root,CANVAS_AGENT_USE_SETTINGS_PROVIDERS:'false'};
    delete rollbackEnv.ELECTRON_RUN_AS_NODE;
    electronApp=await playwright._electron.launch({executablePath:path.join(root,'.ai-runtime/versions',rollbackActive,'AI OS Runtime.exe'),args:['--hidden',...sandboxGpuArgs],env:rollbackEnv,timeout:40_000});
    await electronApp.firstWindow();
    const rollbackPage=await waitForMainWindow(electronApp,'component rollback main window');
    await rollbackPage.waitForLoadState('networkidle');
    diag=await until(()=>{
      try{return JSON.parse(fs.readFileSync(path.join(root,'data/.logs/runtime-diagnostics.json'),'utf8'))}catch{return null}
    },'component rollback diagnostics');
    const rollbackResultPath=path.join(updateDir,'result.json');
    if(fs.existsSync(rollbackResultPath))fs.unlinkSync(rollbackResultPath);
    const prepared=await rollbackPage.evaluate(()=>window.aiOsHost.rollbackComponent('platform-core'));
    assert.equal(prepared.status,'ready',JSON.stringify(prepared));
    assert.equal(prepared.componentRollback?.componentId,'platform-core');
    const ready=JSON.parse(fs.readFileSync(path.join(updateDir,'ready.json'),'utf8'));
    assert.match(ready.candidate,/--component-rollback-[a-f0-9]{12}$/);
    const rollbackPid=diag.pid;
    await rollbackPage.evaluate(()=>window.aiOsHost.restartToUpdate());
    const rollbackResult=await until(()=>{
      const file=path.join(updateDir,'result.json');return fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8'));
    },'component rollback restart',120_000);
    assert.equal(rollbackResult.status,'updated',JSON.stringify(rollbackResult));
    assert.equal(rollbackResult.candidate,ready.candidate);
    await until(()=>!fs.existsSync(path.join(updateDir,'install.json')),'component rollback transaction cleanup');
    diag=await until(()=>{
      const value=JSON.parse(fs.readFileSync(path.join(root,'data/.logs/runtime-diagnostics.json'),'utf8'));
      return value.pid!==rollbackPid&&alive(value.pid)&&value;
    },'component rollback desktop restart');
    await until(async()=>{const r=await fetch(diag.localUrl+'/api/system/health');return r.ok},'component rollback service');
    assert.equal(fs.readFileSync(path.join(root,'.ai-runtime/.active-runtime'),'utf8').trim(),ready.candidate);
    assert.equal(fs.readFileSync(path.join(root,'.ai-runtime/versions',ready.candidate,'resources/app/component-fixture.txt'),'utf8'),`base component ${baseVersion}`);
    reports.push({componentRollback:'platform-core',candidate:ready.candidate,result:rollbackResult.status,componentRestored:true});
    console.log('Component rollback: prepared through real Electron IPC, restarted and restored the previous component snapshot');
    stop(diag.pid);stop(diag.serverPid);await delay(1000);
    await electronApp.close().catch(()=>{});electronApp=null;
    fs.writeFileSync(path.join(ROOT,'artifacts/electron-updates/results.json'),JSON.stringify(reports,null,2));
    console.log('PASS real Electron settings → check → streaming download → restart → success / failed migration rollback / component rollback, account, data and snapshot retention preserved');
    console.log(JSON.stringify(reports));
    }catch(error){
    try{for(const file of ['helper-error.json','install.json','result.json'])if(fs.existsSync(path.join(root,'.ai-runtime/updates',file)))console.error(file,fs.readFileSync(path.join(root,'.ai-runtime/updates',file),'utf8'))}catch{}
    throw error;
  }finally{
    await electronApp?.close().catch(()=>{});stop(diag?.pid);stop(diag?.serverPid);
    try{const latest=JSON.parse(fs.readFileSync(path.join(root,'data/.logs/runtime-diagnostics.json'),'utf8'));stop(latest.pid);stop(latest.serverPid)}catch{}
    assert.equal(path.dirname(temp),temporaryParent);removeInside(temporaryParent,path.basename(temp));
  }
})().catch(error=>{console.error(error);process.exitCode=1});
