const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openFixture,loadModels,settle}=require('./dom-scaling-test-support.cjs');
const output=path.resolve(__dirname,'../.planning/representation-fidelity-20261016/item-02-visual-composition');
(async()=>{const f=await openFixture();const results={cases:[],errors:f.errors};try{
 await loadModels(f,36,'A');
 await f.page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');
  x.fillStyle='#253a48';x.fillRect(0,0,600,400);x.fillStyle='#d7c4a3';x.fillRect(90,70,420,260);x.fillStyle='#557c75';x.beginPath();x.arc(300,200,90,0,Math.PI*2);x.fill();
  const model=canvasVirtualStore.get('1');Object.assign(model,{resultSrc:c.toDataURL(),width:400,height:400/1.5,size:'1536x1024',nodeLabelId:'fidelity-tag'});
  model.generationHistory[0].src=model.resultSrc;
  FloraNodeTags.setDefinitions([{id:'fidelity-tag',name:'视觉参考',color:'#345678'}]);canvasRepresentation.localScene=null;
 });
 for(const scale of [.55,.75]){
  await f.page.evaluate(scale=>{document.activeElement?.blur?.();clearCanvasSelection();canvasState.scale=scale;canvasState.x=400;canvasState.y=180;applyCanvasTransformNow();CanvasNodeRepresentation.reconcile();},scale);
  await f.page.mouse.move(1350,950);await settle(f.page,900);
  const before=await f.page.evaluate(()=>{
   const g=resolveNodeVisualGeometry('1'),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),s=canvasState.scale;
   const screen=b=>({left:v.left+canvasState.x+b.left*s,top:v.top+canvasState.y+b.top*s,width:(b.right-b.left)*s,height:(b.bottom-b.top)*s});
   const light=canvasVirtualStore.getMounted('1'),r=light?.querySelector('.canvas-light-media')?.getBoundingClientRect(),title=light?.querySelector('.canvas-light-title')?.getBoundingClientRect();
   return {level:CanvasNodeRepresentation.getLevel('1'),body:screen(g.outerBounds),camera:{x:canvasState.x,y:canvasState.y,scale:s},lightMedia:r&&{left:r.left,top:r.top,width:r.width,height:r.height},lightTitle:title&&{left:title.left,top:title.top,width:title.width,height:title.height},data:toCanvasOperationNode(canvasVirtualStore.get('1'))};
  });
  assert.equal(before.level,scale===.55?'canvas-rich':'light');
  const label=scale===.55?'canvas':'light';
  await f.page.screenshot({path:path.join(output,`normal-${label}.png`)});
  await f.page.screenshot({path:path.join(output,`${label}-to-full-before.png`)});
  await f.page.mouse.click(before.body.left+before.body.width/2,before.body.top+before.body.height/2);await settle(f.page,200);
  const full=await f.page.evaluate(()=>{
   const n=getCanvasNode('1'),rect=sel=>{const r=n.querySelector(sel)?.getBoundingClientRect();return r&&{left:r.left,top:r.top,width:r.width,height:r.height}};
   return {level:CanvasNodeRepresentation.getLevel('1'),body:rect('.flora-node-card'),media:rect('.canvas-node-result img'),title:rect('.flora-node-label-title'),tag:rect('.flora-tag-trigger'),camera:{x:canvasState.x,y:canvasState.y,scale:canvasState.scale}};
  });
  assert.equal(full.level,'full');assert.deepEqual(full.camera,before.camera,'existing camera must not move in this fixture');
  for(const key of ['left','top','width','height']){assert.ok(Math.abs(before.body[key]-full.body[key])<.5,`${label} body ${key}`);assert.ok(Math.abs(before.body[key]-full.media[key])<1,`${label} media ${key}`);}
  if(before.lightTitle)for(const key of ['left','top','height'])assert.ok(Math.abs(before.lightTitle[key]-full.title[key])<.5,`Light title ${key}`);
  await f.page.screenshot({path:path.join(output,`${label}-to-full-after.png`)});
  await f.page.screenshot({path:path.join(output,`selected-full-${label}.png`)});
  await f.page.screenshot({path:path.join(output,`full-to-${label}-before.png`)});
  await f.page.mouse.click(70,500);await f.page.mouse.move(1350,950);await settle(f.page,1100);
  const after=await f.page.evaluate(()=>({level:CanvasNodeRepresentation.getLevel('1'),geometry:resolveNodeVisualGeometry('1'),data:toCanvasOperationNode(canvasVirtualStore.get('1')),full:CanvasRepresentationDiagnostics.snapshot().fullDetailNodes}));
  assert.equal(after.level,before.level);assert.equal(after.full,0);
  for(const key of ['prompt','model','size','resultSrc','nodeTitle','nodeLabelId','width','height'])assert.deepEqual(after.data[key],before.data[key],`round trip ${key}`);
  await f.page.screenshot({path:path.join(output,`full-to-${label}-after.png`)});
  results.cases.push({scale,before,full,after});
 }
 assert.deepEqual(f.errors,[]);results.pass=true;
}finally{fs.writeFileSync(path.join(output,'composition-transitions.json'),JSON.stringify(results,null,2));await f.close();}console.log(JSON.stringify({pass:true,cases:results.cases.length,output}));})().catch(e=>{console.error(e);process.exitCode=1});

