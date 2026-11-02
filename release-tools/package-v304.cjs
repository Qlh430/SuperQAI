'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const A=require('./portable-baseline.cjs'),root=path.resolve(__dirname,'..'),home=path.join(root,'AI-OS-Portable-1.0.5-win-x64');
const version=process.env.AI_OS_RELEASE_VERSION||'3.0.4';
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid AI_OS_RELEASE_VERSION: '+version);
const output=process.env.AI_OS_RELEASE_OUTPUT||'release';
if(!/^[a-z0-9-]+$/.test(output))throw Error('Invalid release output directory');
const runtimeId=version+'-win-x64',scope=path.join(root,'.planning/release-'+version),portable=path.join(scope,'portable'),release=path.join(scope,output);
const active=fs.readFileSync(path.join(home,'.ai-runtime/.active-runtime'),'utf8').trim(),sourceRuntime=path.join(home,'.ai-runtime/versions',active);
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
if(!active.startsWith('dev-preview-3.0.3-'))throw Error('Unexpected source runtime: '+active);
const resume=fs.existsSync(portable);
if(fs.existsSync(release))throw Error('Release output already exists; use a new AI_OS_RELEASE_OUTPUT to preserve prior artifacts');
if(!resume)fs.mkdirSync(portable,{recursive:true});
fs.mkdirSync(release,{recursive:false});
const runtime=path.join(portable,'.ai-runtime/versions',runtimeId),copyTree=(src,dst)=>{for(const f of A.records(src)){const from=path.join(src,...f.path.split('/')),to=path.join(dst,...f.path.split('/'));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);if(fs.statSync(to).size!==f.size||sha(to)!==f.sha256)throw Error('Runtime copy mismatch: '+f.path)}};
if(!resume){
 copyTree(sourceRuntime,runtime);
 fs.copyFileSync(path.join(home,'AI OS.exe'),path.join(portable,'AI OS.exe'),fs.constants.COPYFILE_EXCL);
 fs.mkdirSync(path.join(portable,'.ai-runtime'),{recursive:true});fs.writeFileSync(path.join(portable,'.ai-runtime/.active-runtime'),runtimeId+'\n',{flag:'wx'});
 write(path.join(portable,'ai-os-portable.json'),{product:'AI OS',version,format:1,portable:true,dataDirectory:'data',runtimeDirectory:'.ai-runtime/versions/'+runtimeId,versionsDirectory:'.ai-runtime/versions',activePointer:'.ai-runtime/.active-runtime'});
 fs.mkdirSync(path.join(portable,'data'),{recursive:false});
}
if(!fs.existsSync(runtime)||!fs.existsSync(path.join(portable,'.ai-runtime/.active-runtime'))||fs.readFileSync(path.join(portable,'.ai-runtime/.active-runtime'),'utf8').trim()!==runtimeId)throw Error('Invalid isolated candidate resume state');
const deploy=path.join(root,'neon-workbench/deploy.mjs'),components='workbench-frontend,brand-display,media-naming,canvas-feature-core,canvas-node-catalog,canvas-text-scroll,canvas-fullscreen-original-preview,canvas-light-visual,canvas-asset-library,startup-gate,audio-node-appearance,ace-step-backend,qwen-tts-backend,canvas-redraw-backend,canvas-redraw-frontend,canvas-group-visual,canvas-final-adjustments,canvas-interaction-final,canvas-agent-context,cutout,h3,chat,tool-crop,tool-outpaint,tool-angle,tool-upscale,node-image,node-video,node-audio,node-text,node-note,node-script,node-upload,release-host-sync';
process.env.AI_OS_CSS_COMPILER_PROOF=process.env.AI_OS_CSS_COMPILER_PROOF||`.planning/release-${version}/css-proof/proof.json`;
const deployArgs=[deploy,'--dev-preview=build','--preview-build-runtime='+runtime,'--components='+components];
execFileSync(process.execPath,[...deployArgs,'--preview-version='+version],{cwd:root,stdio:'inherit',env:process.env});
execFileSync(process.execPath,[...deployArgs,'--verify-components'],{cwd:root,stdio:'inherit',env:process.env});
const app=path.join(runtime,'resources/app');
const sourceSync=require('./release-source-sync.cjs').assess(root,app);
if(!sourceSync.ok)throw Error('Release source synchronization failed: '+JSON.stringify(sourceSync.problems));
write(path.join(release,'release-source-sync.json'),sourceSync);
require('./canvas-representation-contract.cjs').assertCanvasRepresentationCompatible(
 fs.readFileSync(path.join(app,'script.js'),'utf8'),
 fs.readFileSync(path.join(app,'canvas-representation-host.js'),'utf8'),
 app
);
const pkg=JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8'));pkg.version=version;fs.writeFileSync(path.join(app,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const manifest=JSON.parse(fs.readFileSync(path.join(app,'ai-os-components.json'),'utf8'));delete manifest.developmentPreview;manifest.version=version;manifest.runtime=runtimeId;manifest.components=A.componentRecords(A.records(app).filter(f=>f.path!=='ai-os-components.json'),version);manifest.runtimeFiles=A.records(runtime).filter(f=>f.path!=='resources/app/ai-os-components.json');
const gate=require('./css-source-preflight.cjs').assess(root);if(!gate.releaseEligible)throw Error('CSS source release gate failed: '+JSON.stringify(gate.problems));
fs.writeFileSync(path.join(app,'ai-os-components.json'),JSON.stringify(manifest,null,2)+'\n');write(path.join(release,'ai-os-components.json'),manifest);
for(const c of manifest.components){const fileName=`AI-OS-Component-${version}-${c.id}.zip`;A.zipFiles(app,c.files,path.join(release,fileName),c.id);c.asset={fileName,size:fs.statSync(path.join(release,fileName)).size,sha256:sha(path.join(release,fileName))};}
// Persist component asset metadata back into the runtime after all exact archives exist.
fs.writeFileSync(path.join(app,'ai-os-components.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(release,'ai-os-components.json'),JSON.stringify(manifest,null,2)+'\n');
const runtimeFiles=A.records(runtime).filter(f=>f.path!=='resources/app/ai-os-components.json');
const portableFiles=A.records(portable),treeHash=crypto.createHash('sha256').update(JSON.stringify(portableFiles)).digest('hex');
write(path.join(release,'portable-files.json'),{format:1,product:'AI OS',version,treeHash,files:portableFiles});
const runtimeZip='AI-OS-Runtime-'+runtimeId+'.zip';A.zipFiles(runtime,A.records(runtime),path.join(release,runtimeZip),runtimeId);
write(path.join(release,'ai-os-update.json'),{format:1,product:'AI OS',version,platform:'win32',arch:'x64',minUpdaterVersion:1,fileName:runtimeZip,size:fs.statSync(path.join(release,runtimeZip)).size,sha256:sha(path.join(release,runtimeZip)),components:{fileName:'ai-os-components.json',size:fs.statSync(path.join(release,'ai-os-components.json')).size,sha256:sha(path.join(release,'ai-os-components.json'))},authentication:{mode:'github-release-assets',repository:'Qlh430/SuperQAI',publisherDigitalSignature:false}});
require('../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/'+active+'/resources/app/desktop/update-install.js').validateRuntime(portable,runtimeId);
const portableZip='AI-OS-v'+version+'-win-x64-Portable.zip';A.zipFiles(portable,portableFiles,path.join(release,portableZip));
const privacy={files:portableFiles.length,forbiddenPaths:[],literalFindings:[],textFiles:0,textBytes:0};
for(const f of portableFiles){if(/(^|\/)(?:data|output|\.git|\.planning|\.env|test-fixtures|\.desktop)(\/|$)|\.(?:sqlite(?:-wal|-shm)?|db|pem|pfx|key|log)$/i.test(f.path))privacy.forbiddenPaths.push(f.path);if(!/\.(?:js|cjs|mjs|css|html|json|svg|md|txt|yml|yaml|example)$/i.test(f.path))continue;const s=fs.readFileSync(path.join(portable,...f.path.split('/')),'utf8');privacy.textFiles++;privacy.textBytes+=Buffer.byteLength(s);for(const [kind,re] of [['private-key',/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----/],['github-token',/gh[pousr]_[A-Za-z0-9]{30,}/],['openai-key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}/],['aws-access-key',/\bAKIA[A-Z0-9]{16}\b/]])if(re.test(s))privacy.literalFindings.push({path:f.path,kind});}
privacy.ok=!privacy.forbiddenPaths.length&&!privacy.literalFindings.length;if(!privacy.ok)throw Error('Privacy audit failed: '+JSON.stringify(privacy));write(path.join(release,'privacy-audit.json'),privacy);write(path.join(release,'production-source-gate.json'),gate);
const proof=JSON.parse(fs.readFileSync(path.join(root,process.env.AI_OS_CSS_COMPILER_PROOF),'utf8'));write(path.join(release,`v${version}-source-proof.json`),proof);
write(path.join(release,'release-provenance.json'),{version,repository:'https://github.com/Qlh430/SuperQAI',sourceBranch:process.env.AI_OS_RELEASE_BRANCH||'codex/release-v3.0.5',sourceCommit:process.env.AI_OS_RELEASE_COMMIT||'pending-source-commit',activeRuntime:active,runtimeId,compilerProofSha256:sha(path.join(root,process.env.AI_OS_CSS_COMPILER_PROOF)),compilerOutputs:proof.rounds[0].outputs,productionSourceGate:{ok:gate.ok,releaseEligible:gate.releaseEligible},assemblyToolSha256:sha(__filename)});
fs.writeFileSync(path.join(release,'RELEASE_NOTES_ZH.md'),`# AI OS v${version}\n\n修复 Windows x64 Portable 版本中画布节点因 CanvasRepresentationHost 接口不匹配而加载失败、无法拖动的问题。保留文字节点滚动位置恢复。\n\n更新包通过官方 GitHub Release HTTPS 来源和 SHA-256 完整性校验；继续使用现有更新器协议。\n`,{flag:'wx'});
const sums=[];for(const f of A.records(release).filter(f=>f.path!=='SHA256SUMS.txt'))sums.push(`${f.sha256}  ${f.path}`);fs.writeFileSync(path.join(release,'SHA256SUMS.txt'),sums.join('\n')+'\n',{flag:'wx'});
write(path.join(release,'release-files.json'),{version,status:'READY',sourceCommit:process.env.AI_OS_RELEASE_COMMIT||'pending-source-commit',files:A.records(release)});
console.log(JSON.stringify({version,activeRuntime:active,runtimeId,portableFileCount:portableFiles.length,portableZip:{fileName:portableZip,size:fs.statSync(path.join(release,portableZip)).size,sha256:sha(path.join(release,portableZip))},runtimeZip:{fileName:runtimeZip,size:fs.statSync(path.join(release,runtimeZip)).size,sha256:sha(path.join(release,runtimeZip))},components:manifest.components.map(c=>c.asset),privacyOk:privacy.ok,cssReleaseEligible:gate.releaseEligible,release},null,2));
