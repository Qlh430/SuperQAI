"use strict";
// P0 source promotion only. Does not deploy, repair or update the live application.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./p0-integrity.cjs');
function captureCurrent(root=path.resolve(__dirname,'..')) {
const portable=path.join(root,'AI-OS-Portable-1.0.5-win-x64');
const active=fs.readFileSync(path.join(portable,'.ai-runtime/.active-runtime'),'utf8').trim();
if(!/^[0-9]+\.[0-9]+\.[0-9]+-win-x64$/.test(active))throw Error('Unrecognized active runtime');
const app=path.join(portable,'.ai-runtime/versions',active,'resources/app'),target=P.within(root,'release-tools/ownership.json');
if(fs.existsSync(target))throw Error('Ownership capture already exists; explicit review required before recapture');
const evidence=P.within(root,'.planning/agent-native-p0-20261018');
fs.mkdirSync(evidence,{recursive:true});
const provenanceFile=P.within(root,'.planning/agent-native-p0-20261018/source-provenance.json');
const captureFile=P.within(root,'.planning/agent-native-p0-20261018/source-capture.json');
for(const file of [provenanceFile,captureFile])if(fs.existsSync(file))throw Error('Capture evidence already exists; overwrite forbidden');
const folders=['core','desktop','canvas-features','assets','bundled-skills','canvas-pdf-cmaps','canvas-pdf-fonts','runtime','server-components','skills','workflows','node_modules'];
const top=fs.readdirSync(app,{withFileTypes:true}).filter(e=>e.isFile()&&(/\.(?:js|css|html|json)$/i.test(e.name)||e.name==='.env.example'||e.name==='logo.png')&&!e.name.includes('.backup-')&&!['ai-os-components.json','analyze-hardcoded.js'].includes(e.name)).map(e=>e.name);
const paths=[...top];for(const dir of folders)if(fs.existsSync(path.join(app,dir)))for(const f of P.listTree(path.join(app,dir)))paths.push(dir+'/'+f);
const previous=JSON.parse(fs.readFileSync(path.join(app,'ai-os-components.json'),'utf8')),oldOwner=new Map(previous.components.flatMap(c=>c.files.map(f=>[f.path,c.id])));
function relative(p){return path.relative(root,p).split(path.sep).join('/')}
function record(p){return{path:relative(p),size:fs.statSync(p).size,sha256:P.hashFile(p)}}
function promote(src,dest){P.within(root,relative(dest));fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest)){if(P.hashFile(src)!==P.hashFile(dest))throw Error('Existing source differs: '+relative(dest))}else fs.copyFileSync(src,dest,fs.constants.COPYFILE_EXCL);return record(dest)}
const files=[];let direct=0,promoted=0,cached=0,generated=0;const provenance=[];
for(const rel of paths.sort()){
 P.safeRelative(rel);const src=P.within(app,rel),digest=P.hashFile(src),size=fs.statSync(src).size;let inputs,recipe='copy',origin;
 if(rel==='script.js'){
  inputs=['script-before-save-bridge.js','canvas-script-production.js','canvas-asset-entry.js'].map(x=>record(path.join(root,'neon-workbench/design-sources',x)));recipe='canvas-script';origin='existing-canonical-source-plus-existing-save-bridge';
  const probe={recipe,inputs};if(crypto.createHash('sha256').update(P.render(root,probe)).digest('hex')!==digest)throw Error('Current canvas script cannot be reproduced exactly');generated++;
 }else{
  const options=[path.join(root,'neon-workbench/design-sources',rel)];
  if(rel==='neon-host-bridge.js')options.unshift(path.join(root,'neon-workbench/host-bridge.js'));
  if(rel.startsWith('skills/'))options.push(path.join(root,'neon-workbench/design-sources/script-production-skills',rel.slice(7)));
  let existing=options.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()&&P.hashFile(p)===digest);
  if(existing){inputs=[record(existing)];origin='existing-authoritative-source';direct++}
  else if(/^(node_modules|assets|canvas-pdf-cmaps|canvas-pdf-fonts|runtime)\//.test(rel)||/\.(exe|dll|ico|png|jpg|webp)$/i.test(rel)){
   inputs=[promote(src,path.join(root,'release-tools/.cache/sha256',digest))];origin='pinned-external-artifact';cached++;
  }else{
   const compiled=['neon-workbench.js','neon-workbench.css','canvas-document-reader.js','canvas-pdf-worker.js'].includes(rel);
   inputs=[promote(src,path.join(root,'host-sources',compiled?'golden-generated':'app',rel))];origin=compiled?'golden-generated-checkpoint':'current-runtime-source-promoted';promoted++;
  }
 }
 const owner=rel.startsWith('canvas-features/')?'canvas-features':rel.includes('representation')||rel==='canvas-node-visuals.js'?'canvas-representation':oldOwner.get(rel)||(rel.startsWith('desktop/')?'os-shell':rel.startsWith('node_modules/')?'runtime-dependencies':/^(assets|canvas-pdf|runtime\/)/.test(rel)?'content-assets':'host-app');
 files.push({path:rel,owner,recipe,inputs,size,sha256:digest,origin});provenance.push({path:rel,sourceRuntime:relative(src),sourceRuntimeHash:digest,origin,authoritativeInputs:inputs.map(x=>x.path)});
}
const manifest={format:1,product:'AI OS',scope:'p0-assembly-only',baselineRuntime:active,notInstallable:true,excluded:['data/**','output/**','tmp/**','repair-backup-*/**','*.backup-*','development markdown','ai-os-components.json (stale; excluded from new candidate, not deleted from live runtime)'],files};
P.validateManifest(manifest);
fs.writeFileSync(provenanceFile,JSON.stringify(provenance,null,2),{flag:'wx'});
const result={files:files.length,bytes:files.reduce((n,x)=>n+x.size,0),direct,promoted,cached,generated,treeHash:P.treeHash(files),liveRuntimeModified:false,manifest:relative(target)};fs.writeFileSync(captureFile,JSON.stringify(result,null,2),{flag:'wx'});
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
return result;
}
module.exports={captureCurrent};
if(require.main===module)console.log(JSON.stringify(captureCurrent(),null,2));
