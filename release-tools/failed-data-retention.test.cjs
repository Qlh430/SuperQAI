'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pruneRollbackSnapshots}=require('../host-sources/app/desktop/rollback-retention');
test('every failed-data snapshot remains protected until explicitly recovered by the user',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aios-recovery-'));
 try {for(const id of ['a'.repeat(24),'b'.repeat(24),'c'.repeat(24)]){const dir=path.join(root,'.ai-runtime/rollback',id,'failed-data');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'new-project.txt'),'new user content');}
 const result=pruneRollbackSnapshots(root,{keepFailed:0,minimumAgeMs:0,now:Date.now()+86400000});
 assert.deepEqual(result.removed,[]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('failed candidate databases remain protected by rollback retention',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aios-db-recovery-'));
 try {for(const id of ['d'.repeat(24),'e'.repeat(24)]){const dir=path.join(root,'.ai-runtime/rollback',id,'database');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'failed-system.sqlite'),'failed candidate database');}
 const result=pruneRollbackSnapshots(root,{keepFailed:0,minimumAgeMs:0,now:Date.now()+86400000});
 assert.deepEqual(result.removed,[]);
 assert.deepEqual(result.protected,['d'.repeat(24),'e'.repeat(24)]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
