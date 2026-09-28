"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {inside,atomicWrite,removeInside}=require('../desktop/update-files');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-os-update-files-'));
try{
  atomicWrite(inside(root,'Unicode 中文/nested/事务.json'),{fixture:true});
  removeInside(root,'Unicode 中文/nested');
  assert.equal(fs.existsSync(inside(root,'Unicode 中文/nested')),false,'recursive update cleanup must remove Chinese paths');
  assert.throws(()=>removeInside(root,'../outside'));
  removeInside(root,'Unicode 中文');
  console.log('PASS update cleanup in Chinese paths and root confinement');
}finally{
  function cleanup(file){if(fs.lstatSync(file).isDirectory()){for(const n of fs.readdirSync(file))cleanup(path.join(file,n));fs.rmdirSync(file)}else fs.unlinkSync(file)}
  cleanup(root);
}
