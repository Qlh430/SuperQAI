const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSystemHttpApi}=require('../host-sources/app/system-http-api.js');
test('readiness reports runtime package version rather than obsolete MVP identity',async()=>{
  let result;
  const api=createSystemHttpApi({dataDir:'.',port:33199,getLanUrls:()=>[],getAuthContext:()=>null,publicUser:x=>x,getAuthDisabledUser:()=>null,systemDb:{},requireSuperAdmin(){},backupService:{},readJson(){},sendJson(_r,_s,body){result=body},appendAudit(){}});
  await api.publicHandle({method:'GET',url:'/api/system/ready'},{});
  assert.equal(result.version,require('../host-sources/app/package.json').version);
});
