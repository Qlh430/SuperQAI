const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openFixture,settle,writeJSON,ROOT}=require('./dom-scaling-test-support.cjs');
const OUTPUT=path.join(ROOT,'.planning/representation-fidelity-20261016');
(async()=>{const f=await openFixture();const results={checks:[],errors:f.errors};
try{
 if(process.env.SOURCE_OVERLAY==='1')await f.page.route('**/neon-canvas-surface.css*',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(__dirname,'design-sources/neon-canvas-surface.css'),'utf8')}));
 await f.page.evaluate(()=>{
  const nodes=__domScalingSeeds.map((seed,i)=>({...seed,id:String(i+1),x:150+i*520,y:140,width:400,height:400,zOrder:i+1,nodeTitle:['图片','H3','文字','便签'][i],text:'第一行文字保持换行。\n第二行文字不要挤在一起。\n'+'这是需要自动换行的长段落，'.repeat(30),resultSrc:i===0?__domScalingPNG:''}));
  nodes.push({id:'5',kind:'group',x:80,y:60,width:2040,height:550,groupColor:'#f59e0b',groupMembers:[],zOrder:0,title:'橙色组'});
  restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections:[{id:'edge',from:'1',to:'4',fromPort:'output',toPort:'input'}],viewport:{x:50,y:70,scale:.55}});canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
 });await settle(f.page,900);
 results.initial=await f.page.evaluate(()=>({snapshot:__domScalingSnapshot(),group:canvasVirtualStore.get('5'),scene:canvasSceneLayer.getDiagnostics(),layers:[...document.querySelectorAll('#canvasSceneLayer,#canvasPlane,#canvasConnections,#canvasConnectionsOverlay')].map(el=>({id:el.id,parent:el.parentElement.id,z:getComputedStyle(el).zIndex}))}));
 results.geometry=[];
 for(const scale of [.15,.25,.4,.55,.75,1,1.5,2]){
  results.geometry.push(await f.page.evaluate(async scale=>{
   clearCanvasSelection();document.activeElement?.blur?.();canvasState.scale=scale;canvasState.x=40;canvasState.y=20;applyCanvasTransformNow();renderCanvasSceneLayer();
   const rows=[];
   for(const id of ['1','2','3','4','5']){
    const before=JSON.stringify(toCanvasOperationNode(canvasVirtualStore.get(id))),model=canvasVirtualStore.get(id),rect=getCanvasRepresentationVisualBounds(model,canvasVirtualStore.getRect(id));
    const full=CanvasNodeRepresentation.hydrateNode(id);
    const body=full.querySelector('.flora-node-shell')||full.querySelector('.canvas-image-upload')||full;
    const a=body.getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),unit=v.width/document.querySelector('#infiniteCanvas').clientWidth;
    const expected={x:v.left+(canvasState.x+rect.left*scale)*unit,y:v.top+(canvasState.y+rect.top*scale)*unit,w:(rect.right-rect.left)*scale*unit,h:(rect.bottom-rect.top)*scale*unit};
    rows.push({id,kind:model.kind,scale,expected,actual:{x:a.x,y:a.y,w:a.width,h:a.height},positionDelta:Math.hypot(a.x+a.width/2-expected.x-expected.w/2,a.y+a.height/2-expected.y-expected.h/2),sizeDelta:Math.max(Math.abs(a.width-expected.w),Math.abs(a.height-expected.h)),modelChanged:before!==JSON.stringify(toCanvasOperationNode(canvasVirtualStore.get(id)))});
    document.activeElement?.blur?.();clearCanvasSelection();CanvasNodeRepresentation.dehydrateNode(id);
   }return rows;
  },scale));
 }
 await f.page.evaluate(()=>{canvasState.scale=.4;canvasState.x=20;canvasState.y=20;applyCanvasTransformNow();renderCanvasSceneLayer();});
 await f.page.screenshot({path:path.join(OUTPUT,'fidelity-mixed.png')});
 results.visual=await f.page.evaluate(()=>({state:typeof resolveNodeVisualState==='function'?resolveNodeVisualState('5'):null,scene:canvasSceneLayer.getDiagnostics(),connectionParent:document.querySelector('#canvasConnections').parentElement.id}));
 if(process.env.EXPLORE!=='1'){
  assert.ok(results.geometry.flat().every(row=>row.positionDelta<.5&&row.sizeDelta<.5&&!row.modelChanged),'Scene→Full canonical geometry changed: '+JSON.stringify(results.geometry.flat().filter(r=>r.positionDelta>=.5||r.sizeDelta>=.5||r.modelChanged)));
  assert.equal(results.visual.state?.groupColor,'#f59e0b','组必须共享模型中的原始颜色');
  assert.equal(results.visual.connectionParent,'infiniteCanvas','普通SVG不能留在高于Scene的DOM plane');
  assert.ok(results.visual.scene.canvasTextNodes>=1,'普通浏览文字必须有Canvas表示');
 }
 assert.deepEqual(f.errors,[]);
}finally{writeJSON(path.join(OUTPUT,process.env.EXPLORE==='1'?'explore.json':'fidelity-regression.json'),results);await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
