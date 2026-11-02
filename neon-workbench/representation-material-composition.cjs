const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openFixture,settle}=require('./dom-scaling-test-support.cjs');
const out=path.resolve(__dirname,'../.planning/representation-fidelity-20261016/item-02-visual-composition');
(async()=>{const f=await openFixture();let result;try{
 result=await f.page.evaluate(async()=>{
  await AiOsModuleLoader.ensure(['canvas-node-media']);
  const image=addCanvasImage(__domScalingPNG,'图片素材',{x:100,y:100});
  const video=addCanvasVideoNode({x:800,y:100},{src:''});
  const nodes=[image,video].map(n=>serializeCanvasNode(n));
  restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections:[],viewport:{x:20,y:100,scale:.55}});canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
  return nodes.map(n=>({id:n.id,kind:n.kind}));
 });await settle(f.page,900);
 for(const item of result){item.probe=await f.page.evaluate(async id=>{
  const before=resolveNodeVisualGeometry(id),node=CanvasNodeRepresentation.hydrateNode(id);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const r=node.querySelector('.flora-node-shell')?.getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),s=canvasState.scale;
  const actual=r&&{left:(r.left-v.left-canvasState.x)/s,top:(r.top-v.top-canvasState.y)/s,width:r.width/s,height:r.height/s};
  const expected={left:before.outerBounds.left,top:before.outerBounds.top,width:before.outerBounds.right-before.outerBounds.left,height:before.outerBounds.bottom-before.outerBounds.top};
  const after=resolveNodeVisualGeometry(id);clearCanvasSelection();document.activeElement?.blur?.();CanvasNodeRepresentation.dehydrateNode(id);
  return {before,after,actual,expected};
 },item.id);}
 fs.writeFileSync(path.join(out,process.env.LABEL||'material-composition.json'),JSON.stringify(result,null,2));
 for(const item of result)for(const key of ['left','top','width','height'])assert.ok(Math.abs(item.probe.actual[key]-item.probe.expected[key])<1,`${item.kind} ${key}: ${JSON.stringify(item.probe)}`);
 console.log(JSON.stringify({pass:true,kinds:result.map(x=>x.kind)}));
}finally{await f.close();}})().catch(e=>{console.error(e);process.exitCode=1});
