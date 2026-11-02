'use strict';
// Read-only fail-closed production gate. A fixed scan boundary is necessary,
// but is deliberately never promoted to compiler provenance by a caller flag.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const postcss=require(path.resolve(__dirname,'../neon-workbench/node_modules/postcss'));
function safeFile(base,file){const rel=path.relative(base,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('outside-workbench');if(fs.lstatSync(base).isSymbolicLink())throw Error('linked-source');let p=base;for(const part of rel.split(path.sep)){p=path.join(p,part);if(fs.lstatSync(p).isSymbolicLink())throw Error('linked-source');}if(!fs.statSync(file).isFile())throw Error('non-file-source');return file;}
function assess(root){
 const problems=[],inputs=[],wb=path.resolve(root,'neon-workbench'),entry=path.join(wb,'src/index.css');let fixed=false;
 try{
  const ast=postcss.parse(fs.readFileSync(safeFile(wb,entry),'utf8'),{from:entry});
  const imports=ast.nodes.filter(n=>n.type==='atrule'&&n.name==='import'&&/^['"]tailwindcss['"](?:\s|$)/.test(n.params));
  fixed=imports.length===1&&/^['"]tailwindcss['"]\s+source\(none\)\s*$/.test(imports[0].params);
  if(!fixed)problems.push({code:'automatic-tailwind-scan',path:'neon-workbench/src/index.css',message:'Tailwind 必须关闭工作目录自动扫描并声明可审查的精确输入。'});
  ast.walkAtRules('source',n=>{
   if(/^not\s/.test(n.params))return;
   if(/^inline\s*\(/.test(n.params)){problems.push({code:'inline-candidate-contract-unreviewed',message:'内联候选不能替代真实源码来源。'});return;}
   const m=/^(["'])([^"']+)\1$/.exec(n.params);
   if(!m||/[?*{}!\[\]]/.test(m[2])){problems.push({code:'non-exact-scan-source',source:n.params});return;}
   const file=path.resolve(path.dirname(entry),m[2]);
   try{safeFile(wb,file);const b=fs.readFileSync(file);inputs.push({path:path.relative(root,file).replaceAll('\\','/'),size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
   catch(e){problems.push({code:e.message==='outside-workbench'?'scan-source-outside-workbench':'invalid-scan-source',source:m[2],message:e.message});}
  });
  if(fixed&&!inputs.length)problems.push({code:'scan-input-closure-missing',message:'缺少精确扫描文件清单。'});
 }catch(e){problems.push({code:'css-source-inspection-failed',message:e.message});}
 let compilerProof;
 try {compilerProof=require('./css-compiler-proof.cjs').verifyProof(root);}
 catch(e){problems.push({code:'reviewed-compiler-proof-missing',message:e.message});}
 const ok=fixed&&problems.length===0;
 return{ok,releaseEligible:ok,compilerProvenanceAttested:ok,boundaryFixed:fixed,scope:'css-source-production-preflight',inputs,compilerProof,problems};
}
module.exports={assess,verifyProof:require('./css-compiler-proof.cjs').verifyProof};
if(require.main===module){const result=assess(path.resolve(__dirname,'..'));console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;}
