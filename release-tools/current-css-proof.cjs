'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),wb=path.join(root,'neon-workbench'),A=require('./css-production-build.cjs');
const version=process.env.AI_OS_RELEASE_VERSION||'3.0.4';
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid AI_OS_RELEASE_VERSION: '+version);
const scope=path.join(root,'.planning/release-'+version,'css-proof');
const active='dev-preview-3.0.3-1793179107309-125323db';
const app=path.join(root,'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions',active,'resources/app');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const record=(file)=>({path:path.relative(root,file).replaceAll('\\','/'),size:fs.statSync(file).size,sha256:sha(file)});
if(fs.existsSync(scope))throw Error('Refusing to overwrite existing v3.0.4 CSS proof scope');
fs.mkdirSync(scope,{recursive:true});
const inputs=[...A.sources,...A.configs].map(p=>({path:'neon-workbench/'+p,size:fs.statSync(path.join(wb,p)).size,sha256:sha(path.join(wb,p))}));
const snapshots=[],rounds=[];
for(let n=1;n<=2;n++){
 const dir=path.join(scope,'build-'+n);fs.mkdirSync(dir);
 for(const input of inputs){const rel=input.path.slice('neon-workbench/'.length),from=path.join(wb,rel),to=path.join(dir,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);if(fs.statSync(to).size!==input.size||sha(to)!==input.sha256)throw Error('Source snapshot mismatch: '+input.path);}
 fs.symlinkSync(path.join(wb,'node_modules'),path.join(dir,'node_modules'),'junction');
 const logFile=path.join(scope,'build-'+n+'.log'),exitFile=path.join(scope,'build-'+n+'.exit.txt');
 let output='',exitCode=0;
 try{output=execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run build'],{cwd:dir,encoding:'utf8',windowsHide:true,stdio:'pipe',env:process.env});}
 catch(e){output=[e.stdout,e.stderr].filter(Boolean).join('\n');exitCode=typeof e.status==='number'?e.status:1;}
 fs.writeFileSync(logFile,output);fs.writeFileSync(exitFile,String(exitCode)+'\n');
 if(exitCode!==0)throw Error('Isolated v3.0.4 build '+n+' failed; see '+path.relative(root,logFile));
 const outputs=['neon-workbench.css','workbench.js','canvas-document-reader.js'].map(name=>record(path.join(dir,'dist',name)));
 rounds.push({directory:path.relative(root,dir).replaceAll('\\','/'),command:'npm.cmd run build',exitCode,exitReceipt:record(exitFile),log:record(logFile),outputs});
 snapshots.push(outputs.map(o=>({name:path.basename(o.path),size:o.size,sha256:o.sha256})));
}
if(JSON.stringify(snapshots[0])!==JSON.stringify(snapshots[1]))throw Error('Two isolated source builds are not byte-identical');
const baselineFile=path.join(scope,'active-runtime-neon-workbench.css');
fs.copyFileSync(path.join(app,'neon-workbench.css'),baselineFile);
const baseline=record(baselineFile);
const builtCss=snapshots[0].find(o=>o.name==='neon-workbench.css');
if(baseline.size!==builtCss.size||baseline.sha256!==builtCss.sha256)throw Error('Built CSS does not match the active runtime CSS');
for(const [built,actual] of [[snapshots[0].find(o=>o.name==='workbench.js'),path.join(app,'neon-workbench.js')],[snapshots[0].find(o=>o.name==='canvas-document-reader.js'),path.join(app,'canvas-document-reader.js')]])if(built.size!==fs.statSync(actual).size||built.sha256!==sha(actual))throw Error('Built output does not match active runtime: '+built.name);
const dependencies=A.list(path.join(wb,'node_modules')).map(p=>record(path.join(wb,'node_modules',p)));
const proof={format:1,createdAt:new Date().toISOString(),inputs,dependencies,rounds,baseline,contract:`Two isolated source builds are byte-identical and their CSS, workbench bundle, and document-reader bundle exactly match the active 3.0.3 preview runtime. The active runtime CSS is the comparison baseline because the 3.0.1 Golden predates reviewed production source additions. Release target: ${version}.`};
const proofFile=path.join(scope,'proof.json');fs.writeFileSync(proofFile,JSON.stringify(proof,null,2)+'\n');
const runtimeMatch={version:version+'-source-proof',activeRuntime:active,outputs:{css:{buildSha256:builtCss.sha256,runtimeSha256:sha(path.join(app,'neon-workbench.css')),match:true},workbench:{buildSha256:snapshots[0].find(o=>o.name==='workbench.js').sha256,runtimeSha256:sha(path.join(app,'neon-workbench.js')),match:true},documentReader:{buildSha256:snapshots[0].find(o=>o.name==='canvas-document-reader.js').sha256,runtimeSha256:sha(path.join(app,'canvas-document-reader.js')),match:true}}};
fs.writeFileSync(path.join(scope,'runtime-match.json'),JSON.stringify(runtimeMatch,null,2)+'\n');
const proofPath=`.planning/release-${version}/css-proof/proof.json`;
const verified=require('./css-compiler-proof.cjs').verifyProof(root,proofPath);
console.log(JSON.stringify({proof:proofPath,inputs:inputs.length,dependencies:dependencies.length,builds:rounds.length,verified,runtimeMatch},null,2));
