'use strict';
// Freeze exact current production sources; no runtime/Golden bytes are inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),wb=path.join(root,'neon-workbench');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function list(base,rel=''){return fs.readdirSync(path.join(base,rel),{withFileTypes:true}).flatMap(e=>{const p=path.posix.join(rel,e.name);if(e.isSymbolicLink())throw Error('linked source');return e.isDirectory()?list(base,p):[p];}).sort();}
const sources=['src','design-sources'].flatMap(d=>list(wb,d)).filter(p=>/\.(?:tsx?|jsx?|cjs|mjs|html|json|css|svg)$/.test(p));
const scan=sources.filter(p=>!p.endsWith('.css')&&p!=='design-sources/canvas-node-visuals.js');
const configs=['package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','build-document-reader.mjs','daily-workbench.mjs','daily-workbench.d.mts'];
const entry=path.join(wb,'src/index.css');
module.exports={list,sha,sources,configs};
if(require.main===module&&['prepare','prepare-final'].includes(process.argv[2])){
 const final=process.argv[2]==='prepare-final';
 let css=fs.readFileSync(entry,'utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);').replace(/^@source .*;\r?\n/gm,'');
 if(!css.includes('@import "./legacy-utility-compat.css";'))css=css.replace('@import "tw-animate-css";','@import "tw-animate-css";\n@import "./legacy-utility-compat.css";');
 css=css.replace(/\n\/\* Exact production scan boundary;[^]*$/,'');
 css+='\n/* Exact production scan boundary; generated from source paths, never class candidates. */\n'+scan.map(p=>'@source "'+path.posix.relative('src',p)+'";').join('\n')+'\n';
 fs.writeFileSync(entry,css);
 const scope=path.join(root,'.planning/v3.0.1-release-execution-20261020/css');fs.mkdirSync(scope,{recursive:true});
 const inputs=[...sources,...configs].map(p=>({path:'neon-workbench/'+p,size:fs.statSync(path.join(wb,p)).size,sha256:sha(path.join(wb,p))}));
 fs.writeFileSync(path.join(scope,final?'source-snapshot-final.json':'source-snapshot.json'),JSON.stringify({format:1,inputs,scanInputs:scan},null,2));
 for(const n of final?[3,4]:[1,2]){
  const dir=path.join(scope,'build-'+n);if(fs.existsSync(dir))throw Error('Refusing existing build');fs.mkdirSync(dir);
  for(const p of [...sources,...configs]){const dest=path.join(dir,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(wb,p),dest);}
  fs.symlinkSync(path.join(wb,'node_modules'),path.join(dir,'node_modules'),'junction');
 }
 console.log(JSON.stringify({scope,sourceFiles:inputs.length,scanFiles:scan.length}));
}
if(require.main===module&&['record','record-final'].includes(process.argv[2])){
 const final=process.argv[2]==='record-final';
 const scope=path.join(root,'.planning/v3.0.1-release-execution-20261020/css'),snapshot=JSON.parse(fs.readFileSync(path.join(scope,final?'source-snapshot-final.json':'source-snapshot.json')));
 const rec=(p,base=root)=>({path:path.relative(base,p).replaceAll('\\','/'),size:fs.statSync(p).size,sha256:sha(p)});
 const modules=path.join(wb,'node_modules');
 const dependencies=list(modules).filter(p=>!p.startsWith('.tmp/')&&!p.startsWith('.cache/')&&!p.startsWith('.bin/')).map(p=>rec(path.join(modules,p)));
 const rounds=(final?[3,4]:[1,2]).map(n=>{const dir=path.join(scope,'build-'+n),exit=path.join(scope,'build-'+n+'.exit.txt'),log=path.join(scope,'build-'+n+'.log');return{directory:path.relative(root,dir).replaceAll('\\','/'),command:'npm.cmd run build',exitCode:Number(fs.readFileSync(exit,'utf8').trim()),exitReceipt:rec(exit),log:rec(log),outputs:['neon-workbench.css','workbench.js','canvas-document-reader.js'].map(p=>rec(path.join(dir,'dist',p)))};});
 const proof={format:1,createdAt:new Date().toISOString(),inputs:snapshot.inputs,scanInputs:snapshot.scanInputs,dependencies,rounds,baseline:rec(path.join(root,'host-sources/golden-generated/neon-workbench.css')),contract:'src/legacy-utility-compat.css is a new explicit legacy HTML compatibility stylesheet; not recovered historical source. No generated artifacts are compiler inputs.'};
 fs.writeFileSync(path.join(scope,'proof.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify(require('./css-compiler-proof.cjs').verifyProof(root),null,2));
}
module.exports={list,sha,sources,configs};
