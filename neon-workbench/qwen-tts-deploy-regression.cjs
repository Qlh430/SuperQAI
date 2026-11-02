const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const deploy=fs.readFileSync(path.join(__dirname,'deploy.mjs'),'utf8').replaceAll('\r\n','\n');
const source=deploy.match(/export function patchQwenTtsComposition[\s\S]*?\n}\n/)?.[0];
assert.ok(source);const context={};vm.runInNewContext(source.replace('export ','')+'\nthis.patch=patchQwenTtsComposition;',context);
const original='const createProviderHttpApiComponent = () => createProviderHttpApi({\n  store:providerStore,\n});';
const patched=context.patch(original);assert.equal(context.patch(patched),patched);new vm.Script(patched);
assert.equal(context.patch(patched,{enabled:false}),original,'其它组件部署到未安装Qwen的运行时不能注入缺少依赖的require');
assert.match(patched,/qwenTtsTaskService/);assert.match(patched,/assertOutputMediaRead, canonicalOutputMedia/);assert.match(patched,/qwen-tts-three-in-one.json/);
assert.throws(()=>context.patch('invalid'),/入口不匹配/);
assert.match(deploy,/--workbench-backend/);assert.match(deploy,/await runningBackend\(source\)/);
for(const args of [['--workbench-backend','--components=workbench-frontend'],['--workbench-backend','--components=qwen-tts-backend','--daily-workbench']]){
 const result=spawnSync(process.execPath,[path.join(__dirname,'deploy.mjs'),...args],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/后端独立部署仅允许/);
}
(async()=>{const {dailyComponents}=await import('./daily-workbench.mjs');assert.throws(()=>dailyComponents('qwen-tts-backend'),/日常开发只允许/);console.log('Qwen-TTS 部署补丁幂等、后端目标限制与前端白名单隔离通过');})().catch(e=>{console.error(e);process.exitCode=1;});
