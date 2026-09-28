"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {createZip} = require('./build-electron-portable');
const {createUpdater,extractZipSafe} = require('../desktop/updater');
const {REQUIRED_RUNTIME_FILES} = require('../desktop/update-install');
const {inside,atomicWrite} = require('../desktop/update-files');
(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-os-stage-'));
  try {
    const runtime=path.join(temp,'1.1.0-win-x64');fs.mkdirSync(runtime);
    for(const file of REQUIRED_RUNTIME_FILES) atomicWrite(inside(runtime,file),file.endsWith('package.json')?{version:'1.1.0',main:'desktop/main.js'}:'fixture');
    const zip=path.join(temp,'runtime.zip');createZip(runtime,zip);
    const bytes=fs.readFileSync(zip), repo='https://github.com/Qlh430/SuperQAI/releases/download/v1.1.0/';
    const manifest={format:1,product:'AI OS',version:'1.1.0',platform:'win32',arch:'x64',minUpdaterVersion:1,fileName:'runtime.zip',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    const release={tag_name:'v1.1.0',body:'fixture notes',assets:[{name:'ai-os-update.json',browser_download_url:repo+'ai-os-update.json'},{name:'runtime.zip',size:bytes.length,browser_download_url:repo+'runtime.zip'}]};
    const root=path.join(temp,'portable');fs.mkdirSync(root);
    atomicWrite(inside(root,'.ai-runtime/.active-runtime'),'1.0.0-win-x64');atomicWrite(inside(root,'data/record.txt'),'live');
    let restarted='';
    const updater=createUpdater({portableRoot:root,currentVersion:'1.0.0',fetchImpl:async url=>url.endsWith('/latest')?Response.json(release):url.endsWith('.json')?Response.json(manifest):new Response(bytes),onRestart:async candidate=>{restarted=candidate}});
    const states=[];updater.subscribe(state=>states.push(state.status));
    assert.equal((await updater.check()).status,'available');
    assert.equal((await updater.download()).status,'ready');
    assert.equal(fs.readFileSync(inside(root,'data/record.txt'),'utf8'),'live');
    assert.equal(fs.readFileSync(inside(root,'.ai-runtime/.active-runtime'),'utf8'),'1.0.0-win-x64');
    assert.equal(fs.existsSync(inside(root,'.ai-runtime/updates/install.json')),false);
    assert.equal(fs.existsSync(inside(root,'.ai-runtime/rollback')),false);
    assert.ok(states.includes('downloading')&&states.includes('preparing'));
    const resumed=createUpdater({portableRoot:root,currentVersion:'1.0.0',onRestart:async candidate=>{restarted=candidate}});
    assert.equal(resumed.getStatus().status,'ready');await resumed.restart();assert.equal(restarted,'1.1.0-win-x64');
    const failedRestart=createUpdater({portableRoot:root,currentVersion:'1.0.0',onRestart:async()=>{throw Error('helper unavailable')}});
    assert.equal((await failedRestart.restart()).status,'error');
    assert.equal((await failedRestart.check()).status,'ready','restart errors must retain a usable retry action');
    for(const [index,name] of ['1.1.0-win-x64/../../escape.txt','1.1.0-win-x64/NUL.txt','1.1.0-win-x64/data:stream','1.1.0-win-x64/trailing.'].entries()) {
      const bad=path.join(temp,`bad-${index}.zip`);
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open($env:QA_ZIP,'Create'); try { $z.CreateEntry($env:QA_ENTRY) | Out-Null } finally {$z.Dispose()}"],{windowsHide:true,env:{...process.env,QA_ZIP:bad,QA_ENTRY:name},stdio:'pipe'});
      const dest=path.join(temp,`extract-${index}`);fs.mkdirSync(dest);
      await assert.rejects(extractZipSafe(bad,dest,'1.1.0-win-x64'),/解压失败/);
      assert.deepEqual(fs.readdirSync(dest),[]);
    }
    console.log('PASS real ZIP staging, persisted ready status, data/pointer unchanged before restart, unsafe ZIP names rejected before extraction');
  }finally{assert.equal(path.dirname(temp),os.tmpdir());fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
