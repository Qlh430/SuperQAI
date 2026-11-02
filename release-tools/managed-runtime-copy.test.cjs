'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const updater=require('../host-sources/app/desktop/updater');
test('component staging copies only hash-checked managed files and does not inherit runtime logs',()=>{
 assert.equal(typeof updater.copyManagedRuntime,'function');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aios-managed-copy-')),source=path.join(root,'source'),target=path.join(root,'target');
 try {fs.mkdirSync(source);fs.writeFileSync(path.join(source,'core.js'),'real code');fs.writeFileSync(path.join(source,'debug.log'),'machine-specific runtime log');
 const files=[{path:'core.js',size:9,sha256:crypto.createHash('sha256').update('real code').digest('hex')}];
 updater.copyManagedRuntime(source,target,{runtimeFiles:files});assert.deepEqual(fs.readdirSync(target),['core.js']);
 fs.writeFileSync(path.join(source,'core.js'),'corrupted');assert.throws(()=>updater.copyManagedRuntime(source,path.join(root,'corrupt'),{runtimeFiles:files}),/hash|哈希/i);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
