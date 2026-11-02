const {openFixture,loadModels,settle}=require('./dom-scaling-test-support.cjs');
(async()=>{const f=await openFixture();try{await loadModels(f,36,'A');await settle(f.page);console.log(JSON.stringify(await f.page.evaluate(async()=>{
 const result=[];
 for(const id of ['1','2','3']){
  const before=resolveNodeVisualGeometry(id),m=JSON.parse(JSON.stringify(canvasVirtualStore.get(id)));
  const n=CanvasNodeRepresentation.hydrateNode(id); await new Promise(r=>requestAnimationFrame(r));
  const parts={};for(const sel of ['.flora-node-card','.flora-node-shell','.flora-node-content','.flora-node-label','.flora-node-label-icon','.flora-node-label-title','.flora-node-tag','.flora-node-result-area','.flora-node-live-status','.canvas-node-status','.canvas-h3-status','.canvas-node-result img']){const el=n.querySelector(sel);if(el){const r=el.getBoundingClientRect(),s=getComputedStyle(el);parts[sel]={x:r.x,y:r.y,w:r.width,h:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity,background:s.backgroundColor,border:s.border,radius:s.borderRadius,transform:s.transform,text:el.textContent?.slice(0,100)}}}
  result.push({id,kind:m.kind,before,modelBefore:{width:m.width,height:m.height},modelAfter:{width:canvasVirtualStore.get(id).width,height:canvasVirtualStore.get(id).height},dataset:{...n.dataset},parts});
  document.activeElement?.blur?.();clearCanvasSelection();CanvasNodeRepresentation.dehydrateNode(id);
 }return result;
}),null,2));}finally{await f.close()}})().catch(e=>{console.error(e);process.exitCode=1});
