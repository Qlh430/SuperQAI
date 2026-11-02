const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openFixture,prepareKinds,settle,writeJSON}=require('./canvas-final-test-support.cjs');
const out=path.resolve(__dirname,'../.planning/canvas-final-fidelity-20261016/visual');fs.mkdirSync(out,{recursive:true});
(async()=>{const f=await openFixture();const result={rows:[],errors:f.errors};try{
 result.inventory=await prepareKinds(f);
 for(const item of result.inventory.rows.filter(r=>!process.env.KINDS||process.env.KINDS.split(',').includes(r.key))){
  console.log('begin '+item.key);
  const row={...item,failures:[]},dir=path.join(out,item.key);fs.mkdirSync(dir,{recursive:true});
  try{
   console.log(item.key+' restore full');await f.page.evaluate(key=>{
    const model=__finalKindRows.find(row=>row.key===key).model;
    restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[model],connections:[],labelDefinitions:[{id:'fidelity',name:'视觉验收',color:'#345678'}],viewport:{x:400,y:180,scale:.65}});canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;
    CanvasNodeRepresentation.openInteraction('1','explicit-open');
   },item.key);await settle(f.page,150);
   console.log(item.key+' serialize full');row.full=await f.page.evaluate(()=>{const node=getCanvasNode('1');return {model:serializeCanvasNode(node),dom:node.querySelectorAll('*').length+1,geometry:resolveNodeVisualGeometry('1'),kind:CanvasNodeVisuals.project(canvasVirtualStore.get('1')).renderer};});
   await f.page.screenshot({path:path.join(dir,'full-reference.png')});
   await f.page.evaluate(model=>{
    document.activeElement?.blur?.();clearCanvasSelection();CanvasNodeRepresentation.dehydrateNode('1');
    restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[model],connections:[],labelDefinitions:[{id:'fidelity',name:'视觉验收',color:'#345678'}],viewport:{x:400,y:180,scale:.35}});canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
   },row.full.model);await f.page.mouse.move(1350,950);await settle(f.page,700);
   row.canvas=await f.page.evaluate(()=>({level:CanvasNodeRepresentation.getLevel('1'),snapshot:__domScalingSnapshot(),visual:CanvasNodeVisuals.project(canvasVirtualStore.get('1')),cache:CanvasNodeVisuals.diagnostics(),geometry:resolveNodeVisualGeometry('1')}));
   assert.equal(row.canvas.snapshot.full,0);assert.notEqual(row.canvas.visual.renderer,'unsupported');assert.ok(row.canvas.snapshot.scene.hitRegionCount>0);
   await f.page.screenshot({path:path.join(dir,'normal-canvas.png')});
   await f.page.evaluate(()=>{canvasState.scale=.9;applyCanvasTransformNow();CanvasNodeRepresentation.reconcile();});await settle(f.page,200);
   row.light=await f.page.evaluate(()=>{const n=canvasVirtualStore.getMounted('1');return {level:CanvasNodeRepresentation.getLevel('1'),dom:n?n.querySelectorAll('*').length+1:0,controls:n?.querySelectorAll('textarea,select,input,video,audio,[contenteditable="true"],button').length||0,renderer:n?.querySelector('canvas')?.dataset.visualRenderer,geometry:resolveNodeVisualGeometry('1')};});
   assert.equal(row.light.controls,0);assert.ok(row.light.dom<=50);if(item.kind!=='group')assert.equal(row.light.level,'light');
   await f.page.screenshot({path:path.join(dir,'normal-light.png')});
   const point=await f.page.evaluate(()=>{const b=resolveNodeVisualGeometry('1').outerBounds,v=document.querySelector('#infiniteCanvas').getBoundingClientRect();return {x:v.left+canvasState.x+(b.left+b.right)/2*canvasState.scale,y:v.top+canvasState.y+(b.top+b.bottom)/2*canvasState.scale};});
   await f.page.mouse.click(point.x,point.y);await settle(f.page,700);
   row.selected=await f.page.evaluate(()=>({selected:canvasState.selectedIds.has('1'),full:__domScalingSnapshot().full,level:CanvasNodeRepresentation.getLevel('1')}));assert.ok(row.selected.selected);assert.equal(row.selected.full,1);
   await f.page.screenshot({path:path.join(dir,'selected.png')});
   await f.page.keyboard.press('Enter');await settle(f.page,150);
   row.interaction=await f.page.evaluate(()=>({full:!!getCanvasNode('1'),level:CanvasNodeRepresentation.getLevel('1'),geometry:resolveNodeVisualGeometry('1'),intents:[...canvasRepresentation.intents],model:serializeCanvasNode(getCanvasNode('1'))}));assert.ok(row.interaction.full);
   const a=row.light.geometry.outerBounds,b=row.interaction.geometry.outerBounds;
   for(const key of ['left','top','right','bottom'])assert.ok(Math.abs(a[key]-b[key])<1,`${item.key} changed ${key}: ${a[key]} -> ${b[key]}`);
   await f.page.screenshot({path:path.join(dir,'interaction.png')});
   await f.page.evaluate(()=>{document.activeElement?.blur?.();clearCanvasSelection();CanvasNodeRepresentation.dehydrateNode('1');CanvasNodeRepresentation.reconcile();});await settle(f.page,700);
   row.roundTrip=await f.page.evaluate(()=>({full:__domScalingSnapshot().full,model:canvasVirtualStore.get('1'),visual:CanvasNodeVisuals.project(canvasVirtualStore.get('1')),protectedReasons:[...canvasRepresentation.protection()]}));assert.equal(row.roundTrip.full,0);assert.equal(row.roundTrip.visual.renderer,row.canvas.visual.renderer);
   await f.page.screenshot({path:path.join(dir,'full-to-scene.png')});
  }catch(e){row.failures.push(e.stack||e.message);console.error(item.key,e.message);}
  result.rows.push(row);writeJSON(path.join(out,'results.json'),result);console.log(JSON.stringify({key:item.key,fullDOM:row.full?.dom,lightDOM:row.light?.dom,failures:row.failures.length}));
 }
 result.failures=result.rows.filter(r=>r.failures.length).map(r=>({key:r.key,failures:r.failures}));assert.deepEqual(f.errors,[]);
}finally{writeJSON(path.join(out,'results.json'),result);await f.close();}if(result.failures.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
