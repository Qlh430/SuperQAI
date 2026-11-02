"use strict";
// Isolated release assembly only. Does not deploy, start apps, sign, or publish.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const P=require('./p0-integrity.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sha=file=>hash(fs.readFileSync(file));
function versionIdentity(portable,pkg,version){
  if(!/^\d+\.\d+\.\d+$/.test(version)||pkg.main!=='desktop/main.js'||portable.product!=='AI OS'||portable.dataDirectory!=='data'||portable.activePointer!=='.ai-runtime/.active-runtime')throw Error('Invalid portable identity');
  const runtime=version+'-win-x64';
  return {runtime,portable:{...portable,version,runtimeDirectory:'.ai-runtime/versions/'+runtime},package:{...pkg,version}};
}
function noLinks(file){
  let cursor=path.parse(path.resolve(file)).root;
  for(const part of path.resolve(file).slice(cursor.length).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,part);
    if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Linked path rejected: '+cursor);
  }
}
function records(root,relative=''){
  noLinks(root);
  return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{
    const p=relative?relative+'/'+e.name:e.name,abs=path.join(root,e.name);
    if(e.isSymbolicLink())throw Error('Linked file rejected: '+p);
    if(e.isDirectory())return records(abs,p);
    if(!e.isFile())throw Error('Special file rejected');
    return [{path:p,size:fs.statSync(abs).size,sha256:sha(abs)}];
  }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function componentRecords(files,version){
  const ids=new Map(),seen=new Set();
  for(const f of files){
    P.safeRelative(f.path);
    if(seen.has(f.path.toLowerCase()))throw Error('Duplicate component path');
    seen.add(f.path.toLowerCase());
    const id=f.path==='package.json'?'release-metadata':f.path.startsWith('node_modules/')||f.path.startsWith('runtime/')?'runtime-dependencies':f.path.startsWith('desktop/')?'desktop-updater':f.path.startsWith('canvas-features/')?'canvas-features':'workbench-core';
    if(!ids.has(id))ids.set(id,[]);ids.get(id).push(f);
  }
  return [...ids].sort().map(([id,files])=>{
    files=files.slice().sort((a,b)=>a.path<b.path?-1:1);
    return {id,label:({'release-metadata':'版本标识','runtime-dependencies':'原生与服务依赖','desktop-updater':'桌面与更新器','canvas-features':'画布功能入口','workbench-core':'工作台共享内核'})[id],version,hash:hash(JSON.stringify(files)),files,
      dependencies:id==='runtime-dependencies'?[]:[{id:'runtime-dependencies',version}],restartRequired:true,
      compatibility:{platform:'win32',arch:'x64',manifestFormat:1,minUpdaterVersion:1,nodeMajor:24},
      removalPolicy:'full-runtime-required-for-component-removal',replacementPolicy:'exact-owned-files'};
  });
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipFiles(root,files,output,prefix=''){
  // Fixed DOS date and sorted UTF-8 names yield reproducible ZIP32 archives.
  noLinks(root);noLinks(output);
  if(prefix)P.safeRelative(prefix);
  const seen=new Set();
  for(const f of files){P.safeRelative(f.path);if(seen.has(f.path.toLowerCase()))throw Error('Duplicate ZIP path');seen.add(f.path.toLowerCase());}
  const fd=fs.openSync(output,'wx'),central=[];let offset=0;
  function write(bytes){let n=0;while(n<bytes.length)n+=fs.writeSync(fd,bytes,n,bytes.length-n);offset+=bytes.length;}
  try{
    for(const f of files.slice().sort((a,b)=>a.path<b.path?-1:1)){
      const abs=path.join(root,...f.path.split('/'));noLinks(abs);
      const raw=fs.readFileSync(abs);
      if(f.sha256&&(hash(raw)!==f.sha256||raw.length!==f.size))throw Error('ZIP source integrity: '+f.path);
      const zipped=zlib.deflateRawSync(raw,{level:6}),name=Buffer.from((prefix?prefix+'/':'')+f.path),crc=crc32(raw),start=offset;
      const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x2821,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(zipped.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
      write(header);write(name);write(zipped);
      const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x2821,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(zipped.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(start,42);central.push(c,name);
    }
    const start=offset;for(const c of central)write(c);const size=offset-start;
    if(files.length>65535||offset>0xffffffff)throw Error('ZIP64 not supported');
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(start,16);write(end);fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
}
function copyVerified(source,target,expected){
  noLinks(source);noLinks(target);
  if(fs.statSync(source).size!==expected.size||sha(source)!==expected.sha256)throw Error('Input integrity: '+source);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  if(sha(target)!==expected.sha256)throw Error('Write integrity: '+target);
}
function writeJson(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function build(root,version='3.0.1',suffix=''){
  const old=path.join(root,'.planning/v3.0.1-final-go-no-go-20261018/full-candidate-20261018-r2');
  const oldManifestFile=old+'.manifest.json',m=JSON.parse(fs.readFileSync(oldManifestFile));
  if(sha(oldManifestFile)!=='d89ceed1c509c32b74a32f6feb1e4110be42ee75794fe8082ce558907c80a777')throw Error('Original reviewed manifest changed');
  const ownership=JSON.parse(fs.readFileSync(path.join(root,'release-tools/ownership.json')));P.inputs(root,ownership);
  const identity=versionIdentity(JSON.parse(fs.readFileSync(path.join(old,'ai-os-portable.json'))),JSON.parse(fs.readFileSync(path.join(old,'.ai-runtime/versions/1.0.5-win-x64/resources/app/package.json'))),version);
  const scope=path.join(root,'.planning/v3.0.1-today-20261019');
  if(!/^(?:-[a-z0-9]+)?$/.test(suffix))throw Error('Invalid output suffix');
  const output=path.join(scope,'candidate-'+version+suffix),release=path.join(scope,'release-'+version+suffix);
  noLinks(output);noLinks(release);
  if(fs.existsSync(output)||fs.existsSync(release))throw Error('Refusing existing output');
  // Verify exact input set before first copy. The reviewed candidate is immutable.
  if(JSON.stringify(records(old))!==JSON.stringify(m.files.slice().sort((a,b)=>a.path<b.path?-1:1)))throw Error('Original candidate set/hash mismatch');
  fs.mkdirSync(output);fs.mkdirSync(release);
  const changes=[];
  for(const f of m.files){
    let targetPath=f.path.replace(/^\.ai-runtime\/versions\/1\.0\.5-win-x64\//,'.ai-runtime/versions/'+identity.runtime+'/');
    copyVerified(path.join(old,...f.path.split('/')),path.join(output,...targetPath.split('/')),f);
    if(targetPath!==f.path)changes.push({source:f.path,target:targetPath,recipe:'version-directory-relocation',before:f.sha256,after:f.sha256});
  }
  const app=path.join(output,'.ai-runtime/versions/'+identity.runtime+'/resources/app');
  for(const [relative,bytes] of [['ai-os-portable.json',JSON.stringify(identity.portable,null,2)+'\n'],['.ai-runtime/.active-runtime',identity.runtime+'\n'],['.ai-runtime/versions/'+identity.runtime+'/resources/app/package.json',JSON.stringify(identity.package,null,2)+'\n']]){
    const abs=path.join(output,...relative.split('/')),before=sha(abs);fs.writeFileSync(abs,bytes);changes.push({target:relative,recipe:'versionIdentity',before,after:sha(abs)});
  }
  // Apply only explicit current owner recipes whose bytes changed after the
  // immutable reviewed input candidate. Never take files from an old release.
  for(const f of ownership.files){
    if(f.path==='package.json')continue;
    const target=path.join(app,...f.path.split('/'));
    if(fs.existsSync(target)&&sha(target)===f.sha256)continue;
    const before=fs.existsSync(target)?sha(target):null;
    const bytes=f.recipe==='canvas-script'?Buffer.from(P.render(root,f)):fs.readFileSync(path.join(root,...f.inputs[0].path.split('/')));
    if(bytes.length!==f.size||hash(bytes)!==f.sha256)throw Error('Owned recipe integrity: '+f.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
    changes.push({target:f.path,owner:f.owner,recipe:f.recipe,inputs:f.inputs,before,after:sha(target)});
  }
  fs.mkdirSync(path.join(output,'data'));
  const appCheck=P.verifyTree(app,{...ownership,files:ownership.files.filter(f=>f.path!=='package.json')});
  if(appCheck.problems.some(p=>p.path!=='package.json'))throw Error('App differs from current Golden ownership');
  const components=componentRecords(records(app),version);
  for(const c of components){
    const name='AI-OS-Component-'+version+'-'+c.id+'.zip',file=path.join(release,name);
    zipFiles(app,c.files,file,c.id);c.asset={fileName:name,size:fs.statSync(file).size,sha256:sha(file)};
  }
  const runtimeRoot=path.join(output,'.ai-runtime/versions/'+identity.runtime);
  const manifest={format:1,product:'AI OS',version,platform:'win32',arch:'x64',minUpdaterVersion:1,runtime:identity.runtime,
    runtimeFiles:records(runtimeRoot).filter(f=>f.path!=='resources/app/ai-os-components.json'),
    compatibility:{nodeMajor:24,electron:'44.1.1',nativeRuntimeChange:'full-runtime-update-required'},
    authentication:{status:'pending-authorized-signing',trusted:false},
    protocolEvolution:'Ship updater bridge under format 1 before introducing a higher manifest format; old clients must reject unknown formats.',components};
  writeJson(path.join(release,'ai-os-components.json'),manifest);writeJson(path.join(app,'ai-os-components.json'),manifest);
  require('../host-sources/app/desktop/update-install.js').validateRuntime(output,identity.runtime);
  const releaseGate=require('./css-source-preflight.cjs').assess(root);
  writeJson(path.join(release,'production-source-gate.json'),releaseGate);
  const files=records(output),treeHash=hash(JSON.stringify(files));
  writeJson(path.join(release,'portable-files.json'),{format:1,product:'AI OS',version,treeHash,files});
  writeJson(path.join(release,'derivation.json'),{version,sourceManifestSha256:sha(oldManifestFile),ownershipSha256:sha(path.join(root,'release-tools/ownership.json')),recipeSha256:sha(__filename),changes,generated:[{path:'resources/app/ai-os-components.json',owner:'release-tools/portable-baseline.cjs'}],goldenChanged:false});
  const portableZip='AI-OS-v'+version+'-win-x64-Portable.zip';zipFiles(output,files,path.join(release,portableZip));
  const runtimeZip='AI-OS-Runtime-'+identity.runtime+'.zip';
  zipFiles(runtimeRoot,records(runtimeRoot),path.join(release,runtimeZip),identity.runtime);
  writeJson(path.join(release,'ai-os-update.json'),{format:1,product:'AI OS',version,platform:'win32',arch:'x64',minUpdaterVersion:1,fileName:runtimeZip,size:fs.statSync(path.join(release,runtimeZip)).size,sha256:sha(path.join(release,runtimeZip)),components:{fileName:'ai-os-components.json',size:fs.statSync(path.join(release,'ai-os-components.json')).size,sha256:sha(path.join(release,'ai-os-components.json'))},authentication:{status:'pending-authorized-signing',trusted:false}});
  writeJson(path.join(release,'release-files.json'),{version,status:'BLOCKED',reason:'CSS provenance, publisher authentication, real runtime/update gates required',files:records(release)});
  console.log(JSON.stringify({output,release,version,files:files.length,treeHash,portableZip,sha256:sha(path.join(release,portableZip))},null,2));
}
module.exports={versionIdentity,componentRecords,zipFiles,records,build};
if(require.main===module)build(path.resolve(__dirname,'..'),process.argv[2]||'3.0.1',process.argv[3]||'');
