'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),A=require('./portable-baseline.cjs');
const {portable,scope,runtime}=require('./final-portable.cjs');
const files=A.records(portable),forbiddenPaths=[],literalFindings=[],reviewPaths=[];let textFiles=0,textBytes=0;
for(const f of files){
 if(/(^|\/)(?:data|output|\.git|\.planning|\.env|test-fixtures|\.desktop)(\/|$)|\.(?:sqlite(?:-wal|-shm)?|db|pem|pfx|key|log)$/i.test(f.path))forbiddenPaths.push(f.path);
 if(/\.env\.example$|(?:secret|token|credential|test|trust)/i.test(f.path))reviewPaths.push(f.path);
 if(!/\.(?:js|cjs|mjs|css|html|json|svg|md|txt|yml|yaml|example)$/i.test(f.path))continue;
 const content=fs.readFileSync(path.join(portable,f.path),'utf8');textFiles++;textBytes+=Buffer.byteLength(content);
 for(const [kind,re] of [['private-key',/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----/],['github-token',/gh[pousr]_[A-Za-z0-9]{30,}/],['openai-key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}/],['aws-access-key',/\bAKIA[A-Z0-9]{16}\b/],['machine-specific-workspace',/[QC]:[\\/](?:音乐|Users[\\/]Administrator)[\\/]/]])if(re.test(content))literalFindings.push({path:f.path,kind});
}
const result={at:new Date().toISOString(),scope:'Exact independent current Portable; no binary secret attestation',files:files.length,bytes:files.reduce((n,f)=>n+f.size,0),forbiddenPaths,literalFindings,reviewPaths,textFiles,textBytes,ok:!forbiddenPaths.length&&!literalFindings.length};
fs.writeFileSync(path.join(scope,'final-privacy.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
