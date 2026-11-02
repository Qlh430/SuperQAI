const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const out=path.resolve(process.env.CANVAS_EVIDENCE_DIR||path.join(root,'.planning/text-wire-repair-20261018/browser'));
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return res.writeHead(403).end();const p=path.resolve(runtime,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!p.startsWith(runtime+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream'}).end(b));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.AI_OS_TEST_URL='http://127.0.0.1:'+server.address().port;const S=require('./dom-scaling-test-support.cjs'),results=[];try{
 for(const width of [390,768,1440,1728])for(const scale of [.55,.8]){
  const prefix=`${width}-${scale}`;
  const f=await S.openFixture({width});try{
   const rich='<h2>提示词：</h2><p><strong>雪原</strong>，<em>松树</em>与营地。<br>第二行正文</p><p><br></p><p>负面提示词：</p><ul><li>人物、动物</li><li>低清晰度</li></ul>';
   const setup=await f.page.evaluate(({scale,rich,width})=>{const t=__domScalingSeeds[2],i=__domScalingSeeds[0];const nodes=[{...i,id:'a',x:20,y:100,width:160,height:160},{...t,id:'t',x:370,y:80,width:400,height:400,text:'提示词：雪原与松树',textRichHtml:rich},{...i,id:'b',x:1000,y:100,width:160,height:160}];restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections:[{id:'e',from:'a',to:'b',fromPort:'output',toPort:'input'}],viewport:{x:width<768?2-370*scale:20,y:60,scale}});canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();return nodes;},{scale,rich,width});
   await S.settle(f.page,850);
   const before=await f.page.evaluate(()=>({level:canvasRepresentation.level('t'),model:toCanvasOperationNode(canvasVirtualStore.get('t')),geometry:resolveNodeVisualGeometry('t'),full:__domScalingSnapshot().full,wire:document.querySelector('#canvasConnections .canvas-connection-path')?.getAttribute('d'),mask:document.querySelector('#canvasSceneWireOcclusion path')?.getAttribute('d'),maskRef:document.querySelector('#canvasConnections .canvas-connection-path')?.getAttribute('mask'),diagnostics:CanvasNodeVisuals.diagnostics()}));
   const png=await f.page.screenshot({path:path.join(out,`${prefix}-normal.png`)});
   const pixelProbe=await f.page.evaluate(async base64=>{
     const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
     const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
     const g=resolveNodeVisualGeometry('t').outerBounds,v=document.querySelector('#infiniteCanvas').getBoundingClientRect();
     const y=Math.round(v.top+canvasState.y+228*canvasState.scale),end=v.left+canvasState.x+g.right*canvasState.scale-12;
     const baseline=ctx.getImageData(Math.round(end-20),Math.round(v.top+canvasState.y+(g.bottom-40)*canvasState.scale),1,1).data;
     const strip=ctx.getImageData(Math.round(end-40),y,40,1).data;let delta=0;
     for(let i=0;i<strip.length;i++)if(i%4!==3)delta=Math.max(delta,Math.abs(strip[i]-baseline[i%4]));
     return {delta,baseline:[...baseline],y};
   },png.toString('base64'));
   assert.ok(pixelProbe.delta<8,`ordinary wire is visible over node: ${JSON.stringify(pixelProbe)}`);
   assert.equal(await f.page.evaluate(()=>document.querySelector('#canvasConnections').parentElement.id),'canvasNormalWirePlane','ordinary SVG must be physically below Scene');
   const point=await f.page.evaluate(()=>{const g=resolveNodeVisualGeometry('t'),r=document.querySelector('#infiniteCanvas').getBoundingClientRect();return{x:r.left+canvasState.x+(g.outerBounds.left+80)*canvasState.scale,y:r.top+canvasState.y+(g.outerBounds.top+90)*canvasState.scale};});
   await f.page.mouse.click(point.x,point.y);await S.settle(f.page,120);
   const active=await f.page.evaluate(()=>({full:!!getCanvasNode('t'),html:getCanvasNode('t')?.querySelector('.canvas-text-markdown')?.innerHTML,geometry:resolveNodeVisualGeometry('t')}));
   assert.ok(active.full&&active.html.includes('<strong>雪原</strong>'));await f.page.screenshot({path:path.join(out,`${prefix}-full.png`)});
   await f.page.evaluate(()=>{document.activeElement?.blur();clearCanvasSelection();});await S.settle(f.page,850);
   const after=await f.page.evaluate(()=>({model:toCanvasOperationNode(canvasVirtualStore.get('t')),geometry:resolveNodeVisualGeometry('t'),full:__domScalingSnapshot().full,wire:document.querySelector('#canvasConnections .canvas-connection-path')?.getAttribute('d')}));
   assert.equal(after.model.textRichHtml,before.model.textRichHtml);assert.equal(after.wire,before.wire);assert.equal(after.full,0);assert.deepEqual(after.geometry.outerBounds,before.geometry.outerBounds);assert.deepEqual(f.errors,[]);
   await f.page.screenshot({path:path.join(out,`${prefix}-returned.png`)});
   let edit=null,disconnect=null;
   if(width===1440){
     await f.page.evaluate(()=>{const n=openCanvasNodeInteraction('t','editing');CanvasTextNodeRenderer.beginEdit(n);const el=n.querySelector('.canvas-text');el.innerHTML='<p><strong>编辑后结果</strong></p>';el.dispatchEvent(new Event('input',{bubbles:true}));CanvasTextNodeRenderer.commitEdit(n);syncCanvasNodeModel(n);document.activeElement?.blur();clearCanvasSelection();});
     await S.settle(f.page,850);
     edit=await f.page.evaluate(()=>({model:toCanvasOperationNode(canvasVirtualStore.get('t')),full:__domScalingSnapshot().full}));
     assert.ok(edit.model.text.includes('编辑后结果')&&edit.model.textRichHtml.includes('<strong>编辑后结果</strong>'));assert.equal(edit.full,0);
     const target=await f.page.evaluate(()=>{const p=document.querySelector('#canvasConnections .canvas-connection-hit'),m=p.getScreenCTM();for(const t of [.1,.2,.8,.9]){const w=p.getPointAtLength(p.getTotalLength()*t),q=new DOMPoint(w.x,w.y).matrixTransform(m);if(document.elementFromPoint(q.x,q.y)?.classList.contains('canvas-connection-hit'))return{x:q.x,y:q.y};}});
     assert.ok(target,'visible wire must retain hit testing');await f.page.mouse.click(target.x,target.y);await S.settle(f.page,100);
     assert.equal(await f.page.evaluate(()=>canvasState.connections.length),0,'visible wire click disconnects');
     await f.page.evaluate(()=>undoCanvasCommand());await S.settle(f.page,100);
     disconnect=await f.page.evaluate(()=>canvasState.connections.map(e=>({from:e.from,to:e.to,fromPort:e.fromPort,toPort:e.toPort})));
     assert.equal(disconnect.length,1);assert.equal(disconnect[0].from,'a');assert.equal(disconnect[0].to,'b');
   }
   results.push({width,scale,before,active,after,pixelProbe,edit,disconnect,errors:f.errors});
  }finally{await f.close();}
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({pass:true,cases:results.length}));
}finally{await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
