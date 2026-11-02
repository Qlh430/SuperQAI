'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const up=require('../host-sources/app/desktop/updater');

test('Electron network fetch is preferred over Node fetch when supplied', async()=>{
  const calls=[];
  const electronNet={fetch:async(...args)=>{calls.push(['electron',args]);return new Response('ok')}};
  const fallback=async(...args)=>{calls.push(['node',args]);return new Response('fallback')};
  const fetcher=up.createUpdateFetcher({electronNet,fallback});
  const response=await fetcher('https://api.github.com/test');
  assert.equal(await response.text(),'ok');
  assert.equal(calls[0][0],'electron');
});

test('Node fetch remains the fallback outside Electron', async()=>{
  const calls=[];
  const fallback=async(...args)=>{calls.push(args);return new Response('fallback')};
  const fetcher=up.createUpdateFetcher({fallback});
  assert.equal(await (await fetcher('https://example.test')).text(),'fallback');
  assert.equal(calls.length,1);
});

test('updater status identifies the injected system network path',()=>{
  const updater=up.createUpdater({currentVersion:'3.0.2',fetchImpl:async()=>new Response('{}'),networkPath:'electron-system'});
  assert.equal(updater.getStatus().networkPath,'electron-system');
});

test('desktop main wires Electron network into the updater',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../host-sources/app/desktop/main.js'),'utf8');
  assert.match(main,/net:\s*electronNet/);
  assert.match(main,/const updateFetcher = createUpdateFetcher\(\{ electronNet \}\)/);
  assert.match(main,/fetchImpl:\s*updateFetcher/);
  assert.match(main,/electronNet\?\.fetch/);
});

test('download keeps the partial file and resumes with the exact Range after a proxy switch',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-os-update-range-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const destination=path.join(root,'runtime.zip');
  const bytes=Buffer.from('0123456789abcdef');
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const part=`${destination}.${hash.slice(0,12)}.part`;
  fs.writeFileSync(part,bytes.subarray(0,6));
  let requestedRange='';
  const fetchImpl=async(_url,options)=>{
    requestedRange=options.headers.Range||'';
    return new Response(bytes.subarray(6),{status:206,headers:{'content-range':'bytes 6-15/16'}});
  };
  await up.downloadFile('https://github.com/Qlh430/SuperQAI/releases/download/v3.0.3/runtime.zip',destination,{size:bytes.length,sha256:hash},{fetchImpl,attempts:1});
  assert.equal(requestedRange,'bytes=6-');
  assert.deepEqual(fs.readFileSync(destination),bytes);
});

test('proxy connection failure is surfaced as a bounded Chinese network error',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-os-update-error-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bytes=Buffer.from('proxy-error');
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  await assert.rejects(
    up.downloadFile('https://github.com/Qlh430/SuperQAI/releases/download/v3.0.3/runtime.zip',path.join(root,'runtime.zip'),{size:bytes.length,sha256:hash},{fetchImpl:async()=>{throw new TypeError('fetch failed')},attempts:1}),
    error=>/网络连接失败/.test(error.message),
  );
});
