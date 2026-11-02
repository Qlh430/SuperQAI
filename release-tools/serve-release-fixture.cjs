'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const P=require('./p0-integrity.cjs');
const root=P.isolated(path.resolve(__dirname,'..'),path.resolve(process.argv[2]||''));
const port=Number(process.argv[3]||33217);
if(!Number.isInteger(port)||port<33000||port>33999)throw Error('Isolated QA port required');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method))throw Error('Read only');
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
    const file=P.within(root,relative);
    if(!fs.statSync(file).isFile())throw Error('Not a file');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end('Isolated fixture: no backend or user data');}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,port,root,readOnly:true})));
