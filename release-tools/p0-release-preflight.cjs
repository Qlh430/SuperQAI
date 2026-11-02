'use strict';
// Offline read-only P0 gate. Not wired into deploy, updater or installation.
const fs=require('node:fs'),path=require('node:path');
const P=require('./p0-integrity.cjs');
const SHIP_DIRS=new Set(['core','desktop','canvas-features','assets','bundled-skills','canvas-pdf-cmaps','canvas-pdf-fonts','runtime','server-components','skills','workflows','node_modules']);
const BUILD_OUTPUTS=['neon-workbench.js','neon-workbench.css','canvas-document-reader.js'];
// Exact, typed historical baseline exemptions; never match by suffix/prefix.
const EXCLUDED_DIRECTORIES=new Set(['data','output','tmp','repair-backup-20260930']);
const EXCLUDED_FILES=new Set([
  '.env','ai-os-components.json','analyze-hardcoded.js','test-neon.bat',
  'desktop-shell.js.backup-20260930-155329','index.html.backup-20260930-121810',
  'neon-bridge.css.backup-20260930-121810','neon-bridge.css.backup-20260930-160120',
  'NEON-COMPLETE-SUMMARY.md','NEON-DEPLOYMENT-COMPLETE.md','NEON-DEVIATION-AUDIT.md',
  'NEON-IMPLEMENTATION-STATUS.md','NEON-MIGRATION-PLAN.md','NEON-REDESIGN-PLAN.md','NEON-STAGE3-PROGRESS.md',
  'PAGE-AUDIT-01-HOME.md','PAGE-AUDIT-02-PROJECT.md','PAGE-AUDIT-03-ASSETS.md','PAGE-AUDIT-04-HISTORY.md',
  'PAGE-AUDIT-05-SETTINGS.md','PAGE-AUDIT-06-ACCOUNT.md','PAGE-AUDIT-07-CREATIVE.md','PAGE-AUDIT-BASELINE.md'
]);
// These promoted roots are exhaustive within this gate; other source roots are
// checked only when explicitly declared in manifest inputs.
const AUTHORITATIVE_ROOTS=['host-sources/app','host-sources/golden-generated'];
function inventory(runtime,manifest){
  const files=[],issues=[],excluded=[];
  const directories=new Set([...SHIP_DIRS,...manifest.files.filter(x=>x.path.includes('/')).map(x=>x.path.split('/')[0])]);
  for(const entry of fs.readdirSync(runtime,{withFileTypes:true})){
    const name=entry.name;
    if(entry.isSymbolicLink()){issues.push({code:'linked-runtime-entry',path:name});continue}
    if(entry.isDirectory()&&EXCLUDED_DIRECTORIES.has(name)||entry.isFile()&&EXCLUDED_FILES.has(name)){excluded.push(name);continue}
    if(entry.isDirectory()){
      if(!directories.has(name)){issues.push({code:'unreviewed-runtime-directory',path:name});continue}
      try{for(const rel of P.listTree(P.within(runtime,name)))files.push(name+'/'+rel)}catch(e){issues.push({code:'runtime-inventory',path:name,message:e.message})}
    }else if(entry.isFile()){
      if(/\.(js|css|html|json)$/i.test(name)||['.env.example','logo.png'].includes(name))files.push(name);
      else issues.push({code:'unreviewed-runtime-file',path:name});
    }else issues.push({code:'special-runtime-entry',path:name});
  }
  return{files:files.sort(),issues,excluded};
}
function assess(root,manifest,options){
  P.validateManifest(manifest);
  const runtime=P.within(root,options.runtimeRelative);
  const candidate=P.isolated(root,path.resolve(root,options.candidateRelative));
  const problems=[];
  let sourceCount=0,candidateCheck=null;
  try{sourceCount=P.inputs(root,manifest).size}catch(e){problems.push({code:'source-integrity',message:e.message})}
  const declaredInputs=new Set(manifest.files.flatMap(f=>f.inputs.map(x=>x.path)));
  let authoritativeSourceFiles=0;
  for(const relative of AUTHORITATIVE_ROOTS){
    try{
      const sourceRoot=P.within(root,relative);
      try{fs.lstatSync(sourceRoot)}catch(e){if(e.code==='ENOENT')continue;throw e}
      for(const file of P.listTree(sourceRoot)){
        const rel=relative+'/'+file;authoritativeSourceFiles++;
        if(!declaredInputs.has(rel))problems.push({code:'unowned-authoritative-source',path:rel});
      }
    }catch(e){problems.push({code:'authoritative-source-inventory',path:relative,message:e.message})}
  }
  const actual=inventory(runtime,manifest);problems.push(...actual.issues);
  const expected=new Map(manifest.files.map(x=>[x.path,x]));
  for(const rel of actual.files)if(!expected.has(rel))problems.push({code:'unowned-runtime-file',path:rel});
  for(const f of manifest.files){
    try{const p=P.within(runtime,f.path);if(!fs.statSync(p).isFile()||fs.statSync(p).size!==f.size||P.hashFile(p)!==f.sha256)throw Error('Hash/size mismatch')}
    catch(e){problems.push({code:'runtime-integrity',path:f.path,message:e.message})}
  }
  try{candidateCheck=P.verifyTree(candidate,manifest);if(!candidateCheck.ok)problems.push({code:'candidate-integrity',details:candidateCheck.problems})}
  catch(e){problems.push({code:'candidate-integrity',message:e.message})}
  const builds=[];
  for(const output of BUILD_OUTPUTS){
    const f=expected.get(output),relative=options.buildArtifacts?.[output];
    if(!f||!relative){problems.push({code:'source-build-proof-missing',path:output});continue}
    try{const p=P.isolated(root,path.resolve(root,relative)),bytes=fs.statSync(p).size,sha256=P.hashFile(p);const same=bytes===f.size&&sha256===f.sha256;builds.push({output,artifact:relative,bytes,sha256,matchesGolden:same});if(!same)problems.push({code:'source-build-mismatch',path:output,expectedBytes:f.size,actualBytes:bytes})}
    catch(e){problems.push({code:'source-build-proof-invalid',path:output,message:e.message})}
  }
  // Existing assembly-only callers retain their narrow integrity semantics.
  // Production callers must additionally pass the real CSS provenance gate;
  // identical build hashes alone never establish compiler input provenance.
  let cssSource;
  if(options.releaseMode==='production'){
    cssSource=require('./css-source-preflight.cjs').assess(root);
    if(!cssSource.ok)problems.push({code:'css-source-provenance-unverified',details:cssSource.problems});
  }
  return{ok:problems.length===0,scope:options.releaseMode==='production'?'production-read-only-preflight':'p0-read-only-preflight',installable:false,nativeRuntimeValidated:false,compilerProvenanceAttested:false,sourceCount,authoritativeSourceFiles,runtimeFiles:actual.files.length,excludedRuntimeEntries:actual.excluded,candidate:candidateCheck,builds,...(cssSource?{cssSource}:{}),problems};
}
module.exports={inventory,assess};
if(require.main===module){try{const root=path.resolve(__dirname,'..'),[configFile]=process.argv.slice(2);if(!configFile)throw Error('Usage: node release-tools/p0-release-preflight.cjs .planning/.../preflight-input.json');const configPath=P.isolated(root,path.resolve(root,configFile)),options=JSON.parse(fs.readFileSync(configPath,'utf8'));const manifest=JSON.parse(fs.readFileSync(P.within(root,'release-tools/ownership.json'),'utf8'));const result=assess(root,manifest,options);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1}catch(e){console.error(e.message);process.exitCode=1}}
