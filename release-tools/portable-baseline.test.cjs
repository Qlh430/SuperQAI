"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./portable-baseline.cjs');
test('version migration updates all protocol identities without changing the input', () => {
  const before = {product:'AI OS',version:'1.0.5',portable:true,dataDirectory:'data',runtimeDirectory:'.ai-runtime/versions/1.0.5-win-x64',activePointer:'.ai-runtime/.active-runtime',versionsDirectory:'.ai-runtime/versions',format:1};
  const result = A.versionIdentity(before,{version:'1.0.5',main:'desktop/main.js'},'3.0.1');
  assert.equal(result.runtime,'3.0.1-win-x64');
  assert.equal(result.portable.runtimeDirectory,'.ai-runtime/versions/3.0.1-win-x64');
  assert.equal(result.portable.version,'3.0.1');
  assert.equal(result.package.version,'3.0.1');
  assert.equal(before.version,'1.0.5');
  assert.throws(()=>A.versionIdentity(before,{main:'wrong.js'},'3.0.1'));
  assert.throws(()=>A.versionIdentity(before,{main:'desktop/main.js'},'../escape'));
});
test('component partition gives every file exactly one owner, versioned packages and restart requirements', () => {
  const files=['package.json','desktop/updater.js','node_modules/a/index.js','canvas-features/node-image.js','index.html','neon-workbench.js'].map((p,i)=>({path:p,size:i,sha256:String(i).repeat(64)}));
  const components=A.componentRecords(files,'3.0.1');
  assert.deepEqual(components.flatMap(c=>c.files).map(f=>f.path).sort(),files.map(f=>f.path).sort());
  assert.equal(new Set(components.flatMap(c=>c.files).map(f=>f.path)).size,files.length);
  assert.ok(components.every(c=>c.restartRequired&&c.version==='3.0.1'));
  assert.throws(()=>A.componentRecords([...files,files[0]],'3.0.1'));
  assert.throws(()=>A.componentRecords([{...files[0],path:'data/private.db'}],'3.0.1'));
});
test('ZIP writer rejects duplicate paths and produces reproducible bytes without spawning', () => {
  const root=fs.mkdtempSync(path.join(__dirname,'../.planning/zip-中文-'));
  try {
    fs.writeFileSync(path.join(root,'文件.txt'),'payload');
    A.zipFiles(root,[{path:'文件.txt'}],path.join(root,'a.zip'),'core');
    A.zipFiles(root,[{path:'文件.txt'}],path.join(root,'b.zip'),'core');
    assert.deepEqual(fs.readFileSync(path.join(root,'a.zip')),fs.readFileSync(path.join(root,'b.zip')));
    assert.equal(fs.readFileSync(path.join(root,'a.zip')).readUInt32LE(0),0x04034b50);
    assert.throws(()=>A.zipFiles(root,[{path:'文件.txt'},{path:'文件.txt'}],path.join(root,'c.zip'),'core'));
  } finally { for(const f of fs.readdirSync(root))fs.unlinkSync(path.join(root,f));fs.rmdirSync(root); }
});
