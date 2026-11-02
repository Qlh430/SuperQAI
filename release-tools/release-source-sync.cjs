'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./p0-integrity.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// These outputs are compiled or patched by deploy.mjs; its read-only
// --verify-components pass verifies their current production recipes.
const derived=new Set(['script.js','desktop-shell.js','desktop/startup.html','module-manifest.js','server-components/composition.js','server.js']);
const generated=new Set(['index.html','neon-workbench.html','package.json']);
const bundles={'neon-workbench.js':'workbench.js','neon-workbench.css':'neon-workbench.css','canvas-document-reader.js':'canvas-document-reader.js'};
function assess(root,app){
  const ownership=JSON.parse(fs.readFileSync(path.join(root,'release-tools/ownership.json'),'utf8'));
  const problems=[],files=[],declared=new Set();
  for(const file of ownership.files){
    for(const input of file.inputs)declared.add(input.path);
    const actual=path.join(app,file.path);
    try{
      const output=fs.readFileSync(actual);
      const kind=bundles[file.path]?'compiler-output':derived.has(file.path)?'deploy-recipe':generated.has(file.path)?'generated-entry':'exact-source';
      const source=bundles[file.path]?fs.readFileSync(path.join(root,'neon-workbench/dist',bundles[file.path])):kind==='exact-source'?P.render(root,file):null;
      if(source&&!source.equals(output))problems.push({path:file.path,reason:'current-source-mismatch'});
      files.push({path:file.path,kind,sha256:hash(output),inputs:file.inputs.map(input=>({path:input.path,sha256:P.hashFile(P.within(root,input.path))}))});
    }catch(error){problems.push({path:file.path,reason:error.message});}
  }
  for(const file of P.listTree(path.join(root,'host-sources/app'))){
    const relative='host-sources/app/'+file;
    if(!declared.has(relative))problems.push({path:relative,reason:'unreviewed-host-source'});
  }
  return{format:1,ok:!problems.length,scope:'current-source-not-historical-golden',derivedVerification:'deploy.mjs --verify-components',files,problems};
}
module.exports={assess};
