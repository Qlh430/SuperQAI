const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
function load(name) {
  const source = path.join(__dirname, 'design-sources', name);
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(fs.existsSync(source) ? source : path.join(runtime, name), 'utf8'), {
    require: name => require(path.join(runtime, name)), module: mod, exports: mod.exports,
    URL, Date, Set, Map, Object, Number, String, Boolean, Array, Error, TypeError, JSON,
    AbortController, AbortSignal, TextDecoder, FormData, Blob, Response, Buffer, setTimeout, clearTimeout,
  }, { filename: name }); return mod.exports;
}
const { createProtocolEngine } = load('provider-protocol-engine.js');
const { createChatHttpApi } = load('chat-http-api.js');
const provider = { id: 'fixture', protocol: 'openai', baseUrl: 'https://example.invalid/v1', apiKey: 'fixture-secret' };
const model = { id: 'gpt-6.1-sol', protocol: 'openai' };
const completion = (text = '完整中文🎬', reason = 'stop') => ({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: reason }], usage: { completion_tokens: 40 } });
const response = payload => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
const checks = [];
async function test(name, fn) { try { await fn(); checks.push({name,ok:true}); } catch(e) { checks.push({name,ok:false,error:e.message}); } }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const streamResponse = content => new Response(new ReadableStream({start(c){const bytes=Buffer.from(content);for(let i=0;i<bytes.length;i+=2)c.enqueue(bytes.subarray(i,i+2));c.close();}}), {headers:{'content-type':'text/event-stream'}});
const event = p => `data: ${JSON.stringify(p)}\n\n`;
function chatApi(result = {text:'回复',selection:{modelId:'m',providerId:'p'}}) {
  let request;
  const api = createChatHttpApi({ readJson: async req => req.body, sendJson:(res,status,body)=>Object.assign(res,{status,body}),
    performWebSearch:async()=>[],extractLatestUserText:()=>'',buildDirectWeatherAnswer:()=>'',formatUpstreamError:e=>e.message,
    buildChatCompletionMessages:m=>m,hasVisionMessage:()=>false,getPublicProviderModelCatalog:()=>({models:[]}),findPublicProviderCatalogModel:()=>null,
    providerExecutor:{execute:async r=>{request=r;return result;}},normalizeChatImageResponse:r=>r,saveGeneratedImages:async()=>[],providerExecutionHttpStatus:()=>400,
  });return {api,get request(){return request;}};
}
async function main() {
  await test('未设置参数时不注入短输出预算或温度，长文生成期限五分钟', async()=>{const h=chatApi(),res={};await h.api.handle({method:'POST',url:'/api/chat',body:{model:'m',messages:[]}},res);assert.equal(h.request.params.max_tokens,undefined);assert.equal(h.request.params.temperature,undefined);assert.equal(h.request.options.totalTimeoutMs,300000);});
  await test('尊重明确的 completion 预算和推理参数',async()=>{const h=chatApi();await h.api.handle({method:'POST',url:'/api/chat',body:{messages:[],max_completion_tokens:16000,reasoning_effort:'low',temperature:0}},{});assert.equal(h.request.params.max_completion_tokens,16000);assert.equal(h.request.params.reasoning_effort,'low');assert.equal(h.request.params.temperature,0);});
  await test('非流式响应慢于首事件预算仍等到生成完成',async()=>{const engine=createProtocolEngine({outboundFetch:async()=>{await sleep(65);return response(completion());}});assert.equal((await engine.execute(provider,model,'llm.chat',{}, {},{connectTimeoutMs:10,firstEventTimeoutMs:20,totalTimeoutMs:180})).text,'完整中文🎬');});
  await test('非流式超时正确说明等待生成，取消传输并阻止未知提交重试',async()=>{let signal;const engine=createProtocolEngine({outboundFetch:async(u,o)=>{signal=o.signal;await sleep(90);return response(completion());}});await assert.rejects(()=>engine.execute(provider,model,'llm.chat',{}, {},{connectTimeoutMs:10,firstEventTimeoutMs:20,totalTimeoutMs:45}),e=>e.code==='UPSTREAM_TIMEOUT'&&e.stage==='total'&&e.submissionState==='unknown'&&!e.retryable&&/生成|总请求/.test(e.message));assert.equal(signal.aborted,true);});
  await test('JSON length 保留内容并返回未完成原因',async()=>{const engine=createProtocolEngine({outboundFetch:async()=>response(completion('半篇','length'))});const r=await engine.execute(provider,model,'llm.chat');assert.equal(r.text,'半篇');assert.equal(r.finishReason,'length');assert.equal(r.completionStatus,'incomplete');assert.match(r.warning,/输出上限/);});
  await test('HTTP 对外不丢结束原因',async()=>{const h=chatApi({text:'半篇',finishReason:'length',completionStatus:'incomplete',warning:'达到输出上限',selection:{modelId:'m',providerId:'p'}}),res={};await h.api.handle({method:'POST',url:'/api/chat',body:{messages:[]}},res);assert.equal(res.body.choices[0].finish_reason,'length');assert.equal(res.body.completion_status,'incomplete');assert.equal(res.body.warning,'达到输出上限');});
  await test('非流式 SSE length 可识别且中文完整',async()=>{const s=event({choices:[{delta:{content:'完整中文🎬'},finish_reason:null}]})+event({choices:[{delta:{},finish_reason:'length'}]})+'data: [DONE]\n\n';const e=createProtocolEngine({outboundFetch:async()=>streamResponse(s)});const r=await e.execute(provider,model,'llm.chat');assert.equal(r.text,'完整中文🎬');assert.equal(r.finishReason,'length');assert.equal(r.completionStatus,'incomplete');});
  await test('流式字节分块不会截断中文且传回结束原因',async()=>{const s=event({choices:[{delta:{content:'完整中文🎬'}}]})+event({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\n\n';const e=createProtocolEngine({outboundFetch:async()=>streamResponse(s)});const r=await e.stream(provider,model,'llm.chat',{}, {},()=>{});assert.equal(r.text,'完整中文🎬');assert.equal(r.finishReason,'stop');assert.equal(r.completionStatus,'completed');});
  await test('SSE 提前结束不伪装完成',async()=>{const e=createProtocolEngine({outboundFetch:async()=>streamResponse(event({choices:[{delta:{content:'未完'}}]}))});const r=await e.execute(provider,model,'llm.chat');assert.equal(r.text,'未完');assert.equal(r.completionStatus,'incomplete');assert.match(r.warning,/提前|中断/);});
  await test('SSE 上游报错不能吞掉变成成功',async()=>{const e=createProtocolEngine({outboundFetch:async()=>streamResponse(event({error:{message:'服务不可用',code:503}}))});await assert.rejects(()=>e.execute(provider,model,'llm.chat'),/服务|上游/);});
  await test('通用协议 URL 去重且 stream=false 不依赖平台专用代码',async()=>{const e=createProtocolEngine({outboundFetch:async()=>response(completion())});const r=e.buildRequest({...provider,baseUrl:'https://ai.t8star.org/v1'},model,'llm.chat');assert.equal(r.url,'https://ai.t8star.org/v1/chat/completions');assert.equal(r.body.stream,false);assert.equal(r.body.max_tokens,undefined);});
  await test('上游在部分文本后报错也不会静默完成',async()=>{const s=event({choices:[{delta:{content:'已生成部分'}}]})+event({error:{message:'服务不可用',code:503}});const e=createProtocolEngine({outboundFetch:async()=>streamResponse(s)});await assert.rejects(()=>e.execute(provider,model,'llm.chat'),e=>e.code==='UPSTREAM_TASK_FAILED'&&!e.retryable);});
  await test('模型参数默认生效，明确预算覆盖其他旧预算字段',async()=>{const e=createProtocolEngine({outboundFetch:async()=>response(completion())});const configured={...model,metadata:{parameterOverrides:{max_tokens:4096,temperature:.5}}};const a=e.buildRequest(provider,configured,'llm.chat');assert.equal(a.body.max_tokens,4096);assert.equal(a.body.temperature,.5);const b=e.buildRequest(provider,configured,'llm.chat',{}, {max_completion_tokens:16000});assert.equal(b.body.max_tokens,undefined);assert.equal(b.body.max_completion_tokens,16000);});
  await test('Responses 和 Anthropic/Gemini 的结束限制归一化',async()=>{for(const [protocol,body] of [['openai-responses',{output_text:'半篇',status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}],['anthropic',{content:[{type:'text',text:'半篇'}],stop_reason:'max_tokens'}],['gemini',{candidates:[{content:{parts:[{text:'半篇'}]},finishReason:'MAX_TOKENS'}]}]]){const e=createProtocolEngine({outboundFetch:async()=>response(body)});const r=await e.execute({...provider,protocol}, {...model,protocol},'llm.chat');assert.equal(r.text,'半篇');assert.equal(r.completionStatus,'incomplete');}});
  await test('收到响应头后超时仍取消请求且不自动重复提交',async()=>{const e=createProtocolEngine({outboundFetch:async()=>({ok:true,headers:new Headers(),text:async()=>{await sleep(90);return JSON.stringify(completion());}})});await assert.rejects(()=>e.execute(provider,model,'llm.chat',{}, {},{totalTimeoutMs:35}),e=>e.submissionState==='unknown'&&!e.retryable);});
  await test('Anthropic 必填预算默认支持长文且不泄漏其他协议字段',async()=>{const e=createProtocolEngine({outboundFetch:async()=>response(completion())});const p={...provider,protocol:'anthropic'},m={...model,id:'claude-3-haiku-20240307',protocol:'anthropic'};assert.equal(e.buildRequest(p,m,'llm.chat').body.max_tokens,4096);const r=e.buildRequest(p,m,'llm.chat',{}, {max_completion_tokens:8192});assert.equal(r.body.max_tokens,8192);assert.equal(r.body.max_completion_tokens,undefined);});
  await test('文字节点历史序列化保留每版结束状态',async()=>{const scope={URL,Map,Set,WeakMap,JSON,String,Number,Object,Array,Date};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'design-sources/flora-generation-history.js'),'utf8'),scope);const node={dataset:{generationHistory:JSON.stringify([{id:'partial',kind:'text',text:'半篇',completionStatus:'incomplete',finishReason:'length',incompleteReason:'output_limit',warning:'达到输出上限'}]),currentGenerationId:'partial'}};const r=scope.FloraGenerationHistory.serialize(node);assert.equal(r.generationHistory[0].completionStatus,'incomplete');assert.equal(r.generationHistory[0].warning,'达到输出上限');});
  await test('DONE 后取消流不会因 cancel 挂起突破期限',async()=>{const e=createProtocolEngine({outboundFetch:async()=>({ok:true,body:{getReader:()=>({read:async()=>({value:Buffer.from(event({choices:[{delta:{content:'完整'}}]})+'data: [DONE]\n\n'),done:false}),cancel:()=>new Promise(()=>{}),releaseLock(){}})}})});const r=await Promise.race([e.stream(provider,model,'llm.chat',{}, {},()=>{},{totalTimeoutMs:30}),sleep(80).then(()=>{throw Error('流清理超出期限');})]);assert.equal(r.text,'完整');});
  await test('超时错误后的取消流不会挂起或覆盖原错误',async()=>{const e=createProtocolEngine({outboundFetch:async()=>({ok:true,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{}),releaseLock(){}})}})});const failure=await Promise.race([e.stream(provider,model,'llm.chat',{}, {},()=>{},{totalTimeoutMs:25}).then(()=>null,e=>e),sleep(80).then(()=>null)]);assert.equal(failure?.code,'UPSTREAM_TIMEOUT');});
  const output=path.resolve(__dirname,'../.design/chat-reliability-20261014');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'contract-report.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({checks},null,2));if(checks.some(c=>!c.ok))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
