const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.planning/dom-scaling-20261015');
const runtime=JSON.parse(fs.readFileSync(path.join(root,'AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json'))).appRoot;
const folder=path.join(base,process.env.LABEL||'matrix-p3-complete'),sample=JSON.parse(fs.readFileSync(path.join(folder,'baseline-A-36-r1.json')));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const checks=sample.sourceResources.map(item=>({file:item.runtimeName,measuredSHA256:item.servedSHA256,runtimeSHA256:hash(fs.readFileSync(path.join(runtime,item.runtimeName))),frozenSHA256:hash(fs.readFileSync(path.join(base,'runtime-frozen-p3-complete',item.runtimeName)))}));
for(const check of checks){assert.equal(check.measuredSHA256,check.runtimeSHA256,`${check.file}测量后发生变动`);assert.equal(check.runtimeSHA256,check.frozenSHA256,`${check.file}与冻结字节不同`);}
assert.equal(checks.length,15);
const html=fs.readFileSync(path.join(runtime,'index.html'),'utf8');assert.ok(html.indexOf('canvas-representation-host.js')<html.indexOf('module-loader.js'));assert.ok(html.includes('20261016-dom-scaling-p3-final'));
fs.writeFileSync(path.join(base,'deployment-verification.json'),JSON.stringify({checks,moduleOrderPassed:true,runtime,sourceOverlay:false,scope:'全部15项实际运行资源与冻结文件字节相同，没有源码覆盖或导航桥接差异'},null,2));
console.log(JSON.stringify({resourceChecks:checks.length,allBytesMatch:true,moduleOrderPassed:true}));
