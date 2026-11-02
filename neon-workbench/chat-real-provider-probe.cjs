// Explicit opt-in smoke probe. Credentials are read only from the process
// environment and are never written to files, report bodies or output logs.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const { createProtocolEngine } = require(path.join(runtime,'provider-protocol-engine.js'));
let secret = process.env.AI_OS_PROBE_KEY;
let provider={id:'explicit-probe',protocol:'openai',baseUrl:process.env.AI_OS_PROBE_URL||'https://ai.t8star.org/v1',apiKey:secret,networkMode:'auto'};
let model={id:process.env.AI_OS_PROBE_MODEL||'gpt-6.1-sol',protocol:'openai'};
if(process.env.AI_OS_PROBE_USE_SAVED==='apimart'){
  // Read-only opt-in for the provider the user asked us to debug. Decryption
  // stays inside this process; no database, key-file or configuration writes.
  const {DatabaseSync}=require('node:sqlite');const dataDir=path.resolve(__dirname,'../AI-OS-Portable-1.0.5-win-x64/data');
  const db=new DatabaseSync(path.join(dataDir,'system.sqlite'),{readOnly:true});let row;
  try{row=db.prepare('SELECT p.id,p.base_url,p.provider_protocol,p.encrypted_api_key,p.metadata_json AS provider_metadata,m.metadata_json AS model_metadata,m.model_protocol FROM providers p JOIN provider_models m ON m.provider_id=p.id WHERE m.model_id=? AND p.enabled=1').all(model.id).find(r=>new URL(r.base_url).hostname==='api.apimart.ai');}finally{db.close();}
  if(!row)throw Error('没有找到用户指定的 ApiMart 已启用模型。');
  const {createProviderSecretVault}=require(path.join(runtime,'provider-secret-vault.js'));secret=createProviderSecretVault({dataDir}).decrypt(row.encrypted_api_key);
  provider={id:row.id,protocol:row.provider_protocol,baseUrl:row.base_url,apiKey:secret,metadata:JSON.parse(row.provider_metadata)};
  model={...model,protocol:row.model_protocol,metadata:JSON.parse(row.model_metadata)};
}
if (!secret) throw Error('需要显式提供临时测试凭据。');
const engine=createProtocolEngine();
const checks=[];
async function main(){
  const prompt='请用中文写12段露营产品广告分镜，每段至少160字，依次描述人物动作、镜头、光线和声音。不使用表格。直接输出正文，第12段后另起一行输出“完整结尾-END”。';
  if(process.env.AI_OS_PROBE_CASE!=='vision'){
  const start=Date.now();
  const result=await engine.execute(provider,model,'llm.chat',{messages:[{role:'user',content:prompt}]},{},{totalTimeoutMs:300000});
  assert.equal(result.completionStatus,'completed');assert.ok(result.text.includes('完整结尾-END'));assert.ok(result.text.length>1800);assert.ok(!result.text.includes('\uFFFD'));assert.ok(Number(result.usage?.completion_tokens)>1200);
  checks.push({case:'真实长文超过旧1200token预算并完整结束',elapsedMs:Date.now()-start,characters:result.text.length,finishReason:result.finishReason,completionStatus:result.completionStatus,completionTokens:result.usage?.completion_tokens});
  console.log(JSON.stringify(checks.at(-1)));
  }
  if(process.env.AI_OS_PROBE_CASE!=='long'){
  const png='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'test-fixtures/provider-reference.png')).toString('base64');
  const visionStart=Date.now();
  const vision=await engine.execute(provider,model,'llm.chat.vision',{messages:[{role:'user',content:[{type:'text',text:'以下有几张参考图片？用一句中文回答。'},...Array.from({length:3},()=>({type:'image_url',image_url:{url:png}}))]}]},{},{totalTimeoutMs:300000});
  assert.ok(vision.text);assert.equal(vision.completionStatus,'completed');assert.match(vision.text,/3|三/);
  checks.push({case:'真实三参考图视觉请求',elapsedMs:Date.now()-visionStart,characters:vision.text.length,finishReason:vision.finishReason,completionStatus:vision.completionStatus});
  }
  const report={providerHost:new URL(provider.baseUrl).hostname,model:model.id,checks,evidence:'本机192.168.1.8修复后真实引擎，经通用OpenAI协议直接调用；不代表192.168.1.53已部署或所有真实用户业务均已验收。'};
  const output=path.resolve(__dirname,'../.design/chat-reliability-20261014');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`real-probe-${new URL(provider.baseUrl).hostname}-${model.id}-report.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{const failure={case:process.env.AI_OS_PROBE_CASE||'long',code:e.code||'PROBE_FAILED',stage:e.stage||'',error:String(e.safeMessage||e.message).split(secret).join('[REDACTED]')};console.error(JSON.stringify(failure));const output=path.resolve(__dirname,'../.design/chat-reliability-20261014');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'real-probe-failure.json'),JSON.stringify({providerHost:new URL(provider.baseUrl).hostname,model:model.id,checks,failure},null,2));process.exitCode=1;});
