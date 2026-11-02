const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'design-sources/provider-protocol-engine.js'), 'utf8'), {
 require: name => require(path.join(runtime, name)), module: mod, exports: mod.exports,
 URL, AbortController, AbortSignal, TextDecoder, FormData, Blob, Response, Buffer, setTimeout, clearTimeout,
});
const provider = { id: 'fixture', protocol: 'openai', baseUrl: 'https://example.invalid/v1', apiKey: 'fixture-secret' };
const model = { id: 'deepseek-v4.1-flash', protocol: 'openai' };
const raw = { error: { message: 'failed to pre-consume quota (current balance: ＄0.325776, required: ＄0.360198) (request id: fixture-402) fixture-secret', code: 'insufficient_user_quota' } };
async function run(params = {}, configured = model) {
 let count = 0, sent;
 const engine = mod.exports.createProtocolEngine({ outboundFetch: async (url, options) => { count++; sent = JSON.parse(options.body); return new Response(JSON.stringify(raw), {status:402}); } });
 let error;
 try { await engine.execute(provider, configured, 'llm.chat', {messages:[{role:'user',content:'你好'}]}, params); } catch(e) { error=e; }
 assert.equal(count,1, '预扣失败不得自动重试或缩减预算');
 assert.equal(error.code,'UPSTREAM_QUOTA_EXHAUSTED');
 assert.match(error.safeMessage,/预扣/);
 assert.match(error.safeMessage,/0\.325776/);
 assert.match(error.safeMessage,/0\.360198/);
 assert.match(error.safeMessage,/insufficient_user_quota/);
 assert.match(error.safeMessage,/fixture-402/);
 assert.ok(!error.safeMessage.includes('fixture-secret'));
 return {error, sent};
}
(async()=>{
 const omitted = await run();
 assert.match(omitted.error.safeMessage,/未指定输出上限/);
 assert.equal(omitted.sent.max_tokens,undefined);
 const explicit = await run({max_tokens:8192});
 assert.match(explicit.error.safeMessage,/max_tokens=8192/);
 assert.equal(explicit.sent.max_tokens,8192);
 const configured = await run({}, {...model, metadata:{parameterOverrides:{max_tokens:16000}}});
 assert.match(configured.error.safeMessage,/max_tokens=16000/);
 assert.equal(configured.sent.max_tokens,16000);
 const completion = await run({max_completion_tokens:24000});
 assert.match(completion.error.safeMessage,/max_completion_tokens=24000/);
 assert.equal(completion.sent.max_completion_tokens,24000);
 console.log('PASS 402中文预扣诊断、实际输出预算、原错误脱敏保留、单次提交');
})().catch(e=>{console.error(e);process.exitCode=1;});
