'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const postcss=require('../neon-workbench/node_modules/postcss');
const PROOF='.planning/v3.0.1-release-execution-20261020/css/proof.json';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function within(root,p){const f=path.resolve(root,p),r=path.relative(root,f);if(r.startsWith('..')||path.isAbsolute(r))throw Error('compiler proof path outside source');return f;}
function check(root,r){const p=within(root,r.path);if(!fs.statSync(p).isFile()||fs.statSync(p).size!==r.size||hash(p)!==r.sha256)throw Error('compiler proof input/output changed: '+r.path);}
function ruleRecords(file){const out=[];function walk(n,ctx=[]){if(n.type==='rule'||(n.type==='atrule'&&!n.nodes)){out.push({context:ctx.join(' > '),selector:n.type==='rule'?n.selector:'@'+n.name+' '+n.params,body:n.toString()});return;}for(const c of n.nodes||[])walk(c,n.type==='atrule'?[...ctx,'@'+n.name+' '+n.params]:ctx);}walk(postcss.parse(fs.readFileSync(file,'utf8')));return out;}
function compareRules(before,after){
 const a=ruleRecords(before),b=ruleRecords(after),sort=rs=>rs.map(x=>JSON.stringify(x)).sort();
 if(JSON.stringify(sort(a))!==JSON.stringify(sort(b)))throw Error('CSS production rule declarations differ from reviewed baseline');
 const compatibility=new Set(['.collapse','.visible\\!','.capitalize','.lowercase','.ordinal','.shadow','.grayscale','.sepia','.backdrop-filter','.fade-out']);
 const fixed=rs=>rs.filter(x=>!(x.context==='@layer utilities'&&compatibility.has(x.selector)));
 if(JSON.stringify(fixed(a))!==JSON.stringify(fixed(b)))throw Error('CSS cascade order changed outside explicit compatibility contract');
 return{rules:a.length,identicalDeclarations:true,nonCompatibilityCascadeOrderIdentical:true};
}
function verifyProof(root,proofPath=process.env.AI_OS_CSS_COMPILER_PROOF||PROOF){
 if(typeof proofPath!=='string'||!proofPath.trim())throw Error('invalid compiler proof path');
 const file=within(root,proofPath);if(!fs.existsSync(file))throw Error('reviewed compiler proof missing');
 const proof=JSON.parse(fs.readFileSync(file,'utf8'));
 if(proof.format!==1||!Array.isArray(proof.inputs)||!proof.inputs.length||!Array.isArray(proof.dependencies)||!proof.dependencies.length||proof.rounds?.length!==2)throw Error('invalid compiler proof');
 for(const r of [...proof.inputs,...proof.dependencies])check(root,r);
 const build=require('./css-production-build.cjs');
 const currentPaths=[...build.sources,...build.configs].map(p=>'neon-workbench/'+p).sort();
 if(JSON.stringify(currentPaths)!==JSON.stringify(proof.inputs.map(r=>r.path).sort()))throw Error('compiler proof production input set changed');
 const snapshots=[];
 for(const round of proof.rounds){
  if(round.exitCode!==0||!round.directory?.startsWith('.planning/'))throw Error('compiler proof build failed');
  check(root,round.exitReceipt);check(root,round.log);
  if(Number(fs.readFileSync(within(root,round.exitReceipt.path),'utf8').trim())!==0||!fs.readFileSync(within(root,round.log.path),'utf8').includes('tsc -b && vite build'))throw Error('compiler process receipt invalid');
  for(const r of proof.inputs){const rel=r.path.slice('neon-workbench/'.length);check(root,{...r,path:round.directory+'/'+rel});}
  for(const r of round.outputs)check(root,r);
  if(round.outputs.length!==3)throw Error('compiler proof output set missing');
  snapshots.push(round.outputs.map(x=>({name:path.basename(x.path),size:x.size,sha256:x.sha256})));
 }
 if(proof.rounds[0].directory===proof.rounds[1].directory||JSON.stringify(snapshots[0])!==JSON.stringify(snapshots[1]))throw Error('compiler proof is not two independent deterministic builds');
 check(root,proof.baseline);
 const visual=compareRules(within(root,proof.baseline.path),within(root,proof.rounds[0].outputs.find(r=>r.path.endsWith('/neon-workbench.css')).path));
 return{inputs:proof.inputs.length,dependencies:proof.dependencies.length,proof:proofPath,outputs:snapshots[0],visual};
}
module.exports={verifyProof,compareRules,PROOF,hash};
