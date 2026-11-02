'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const A=require('./portable-baseline.cjs');
const root=path.resolve(__dirname,'..'),scope=path.join(root,'.planning/v3.0.1-release-execution-20261020');
const portable=path.join(scope,'portable'),runtime=path.join(portable,'.ai-runtime/versions/3.0.1-win-x64'),app=path.join(runtime,'resources/app'),release=path.join(scope,'release');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const records=()=>A.records(runtime).filter(f=>f.path!=='resources/app/ai-os-components.json');
function makeManifest(assets){
 const components=A.componentRecords(A.records(app).filter(f=>f.path!=='ai-os-components.json'),'3.0.1');
 for(const c of components)if(assets)c.asset=assets[c.id];
 const manifest={format:1,product:'AI OS',version:'3.0.1',runtime:'3.0.1-win-x64',platform:'win32',arch:'x64',minUpdaterVersion:1,compatibility:{nodeMajor:24,electron:'44.1.1',nativeRuntimeChange:'full-runtime-update-required'},components,runtimeFiles:records(),authentication:{mode:'github-release-assets',repository:'Qlh430/SuperQAI',publisherDigitalSignature:false},protocolEvolution:'Deliver a format-1 updater bridge before any future manifest protocol change.'};
 write(path.join(app,'ai-os-components.json'),manifest);return manifest;
}
async function runStage(mode){
 if(mode==='refresh-updater'){
  const to=path.join(app,'desktop/updater.js');fs.copyFileSync(to,path.join(scope,'checkpoint','release-updater-before-managed-copy.js'));
  fs.copyFileSync(path.join(root,'host-sources/app/desktop/updater.js'),to);makeManifest();console.log('Updated isolated candidate managed-file staging fix.');return;
 }
 if(mode==='refresh-brand'){
  const {injectStartupLogo}=await import('../neon-workbench/component-deploy.mjs');
  const index=path.join(app,'index.html'),css=path.join(app,'neon-auth.css');
  fs.copyFileSync(index,path.join(scope,'checkpoint','release-index-before-auth-logo.html'));
  fs.copyFileSync(css,path.join(scope,'checkpoint','release-neon-auth-before-auth-logo.css'));
  fs.copyFileSync(path.join(root,'neon-workbench/design-sources/neon-auth.css'),css);
  fs.writeFileSync(index,injectStartupLogo(fs.readFileSync(index,'utf8'),path.join(root,'neon-workbench')).replace(/(neon-auth\.css\?v=)[^"'\s>]+/g,'$1'+sha(css).slice(0,16)));
  makeManifest();write(path.join(scope,'branding-fix.json'),{indexSha256:sha(index),cssSha256:sha(css),sourceCss:'neon-workbench/design-sources/neon-auth.css',recipe:'component-deploy.injectStartupLogo (both startup and auth marks)'});
  console.log('Explicit SVG injected into auth and startup; updated only isolated candidate.');return;
 }
 if(mode==='prepare'){
  const gate=require('./css-source-preflight.cjs').assess(root);if(!gate.ok)throw Error('CSS production provenance gate failed');write(path.join(scope,'css/source-gate.json'),gate);
  const original=path.join(root,'AI-OS-Portable-1.0.5-win-x64'),active=fs.readFileSync(path.join(original,'.ai-runtime/.active-runtime'),'utf8').trim();
  if(active!=='dev-preview-3.0.1-1792425106358-2f5d80a5')throw Error('Reviewed active preview changed');
  const receipt=JSON.parse(fs.readFileSync(path.join(original,'.ai-runtime/dev-preview/1792425106358-2f5d80a5.json'))),source=path.join(original,'.ai-runtime/versions',active);
  if(fs.existsSync(portable)&&A.records(portable).length)throw Error('Refusing existing final portable');fs.mkdirSync(runtime,{recursive:true});
  const copied=[];
  for(const f of receipt.files){if(['debug.log','resources/app/ai-os-components.json'].includes(f.path))continue;const from=path.join(source,f.path),to=path.join(runtime,f.path);if(fs.statSync(from).size!==f.size||sha(from)!==f.sha256)throw Error('Reviewed preview changed: '+f.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);if(sha(to)!==f.sha256)throw Error('Copy verification failed: '+f.path);copied.push(f);}
  const launcher=path.join(original,'AI OS.exe');fs.copyFileSync(launcher,path.join(portable,'AI OS.exe'));
  write(path.join(portable,'ai-os-portable.json'),{product:'AI OS',version:'3.0.1',format:1,portable:true,dataDirectory:'data',runtimeDirectory:'.ai-runtime/versions/3.0.1-win-x64',versionsDirectory:'.ai-runtime/versions',activePointer:'.ai-runtime/.active-runtime'});
  fs.writeFileSync(path.join(portable,'.ai-runtime/.active-runtime'),'3.0.1-win-x64\n');
  const changes=[];
  const outputs=[['neon-workbench.css','css/build-1/dist/neon-workbench.css'],['neon-workbench.js','css/build-1/dist/workbench.js'],['canvas-document-reader.js','css/build-1/dist/canvas-document-reader.js']];
  const overlay=outputs.map(([to,from])=>[to,path.join(scope,from)]).concat(['updater.js','update-trust.json','update-install.js','rollback-retention.js'].map(n=>['desktop/'+n,path.join(root,'host-sources/app/desktop',n)]));
  for(const [rel,sourceFile] of overlay){const to=path.join(app,rel),before=sha(to),after=sha(sourceFile);if(before===after)continue;fs.copyFileSync(to,path.join(scope,'checkpoint','runtime-'+rel.replaceAll('/','__')));fs.copyFileSync(sourceFile,to);changes.push({path:rel,source:path.relative(root,sourceFile).replaceAll('\\','/'),before,after,size:fs.statSync(to).size});}
  const manifest=makeManifest();require('../host-sources/app/desktop/update-install').validateRuntime(portable,'3.0.1-win-x64');
  write(path.join(scope,'frozen-baseline.json'),{version:'3.0.1',preview:active,previewTreeHash:receipt.treeHash,launcherSha256:sha(launcher),copiedFiles:copied,excluded:['debug.log (development diagnostic, not runtime code)','resources/app/ai-os-components.json (regenerated exact ownership)'],changes,componentHashes:manifest.components.map(c=>({id:c.id,hash:c.hash}))});
  console.log(JSON.stringify({portable,runtime,changes,components:manifest.components.length}));return;
 }
 if(mode==='package'){
  if(!require('./css-source-preflight.cjs').assess(root).ok)throw Error('CSS gate failed');
  const privacy=JSON.parse(fs.readFileSync(path.join(scope,'final-privacy.json')));if(!privacy.ok)throw Error('Privacy audit failed');
  for(const f of ['updater.js','update-trust.json','update-install.js','rollback-retention.js'])if(sha(path.join(app,'desktop',f))!==sha(path.join(root,'host-sources/app/desktop',f)))throw Error('Final updater differs from tested source: '+f);
  if(fs.existsSync(release))throw Error('Refusing existing final release');fs.mkdirSync(release);
  const components=A.componentRecords(A.records(app).filter(f=>f.path!=='ai-os-components.json'),'3.0.1'),assets={};
  for(const c of components){const fileName=`AI-OS-Component-3.0.1-${c.id}.zip`,file=path.join(release,fileName);A.zipFiles(app,c.files,file,c.id);assets[c.id]={fileName,size:fs.statSync(file).size,sha256:sha(file)};}
  const manifest=makeManifest(assets);write(path.join(release,'ai-os-components.json'),manifest);
  require('../host-sources/app/desktop/update-install').validateRuntime(portable,'3.0.1-win-x64');
  const runtimeName='AI-OS-Runtime-3.0.1-win-x64.zip',runtimeZip=path.join(release,runtimeName);A.zipFiles(runtime,A.records(runtime),runtimeZip,'3.0.1-win-x64');
  const cm=path.join(release,'ai-os-components.json');write(path.join(release,'ai-os-update.json'),{format:1,product:'AI OS',version:'3.0.1',platform:'win32',arch:'x64',minUpdaterVersion:1,fileName:runtimeName,size:fs.statSync(runtimeZip).size,sha256:sha(runtimeZip),components:{fileName:'ai-os-components.json',size:fs.statSync(cm).size,sha256:sha(cm)},authentication:{mode:'github-release-assets',repository:'Qlh430/SuperQAI',publisherDigitalSignature:false}});
  const files=A.records(portable),treeHash=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  write(path.join(release,'portable-files.json'),{format:1,product:'AI OS',version:'3.0.1',treeHash,files});
  const zip=path.join(release,'AI-OS-v3.0.1-win-x64-Portable.zip');A.zipFiles(portable,files,zip);
  const upload=A.records(release);fs.writeFileSync(path.join(release,'SHA256SUMS.txt'),upload.map(f=>f.sha256+'  '+f.path).join('\n')+'\n');
  write(path.join(scope,'package-result.json'),{portable:zip,size:fs.statSync(zip).size,sha256:sha(zip),treeHash,fileCount:files.length,upload});
  console.log(fs.readFileSync(path.join(scope,'package-result.json'),'utf8'));return;
 }
 throw Error('Unknown release stage');
}
module.exports={runStage,scope,portable,runtime,app,makeManifest};
