const path=require('node:path'),assert=require('node:assert/strict');
const {openFixture,loadModels,settle,persistenceCheck,functionalChecks,memory,writeJSON,OUTPUT}=require('./dom-scaling-test-support.cjs');
(async()=>{const fixture=await openFixture();const output={points:[],failures:[]};try{
 await loadModels(fixture,200,'B');await settle(fixture.page);output.persistence=await persistenceCheck(fixture);output.functional=await functionalChecks(fixture);
 const cdp=await fixture.context.newCDPSession(fixture.page);
 for(let cycle=0;cycle<=60;cycle++){
  if([0,5,10,20,40,60].includes(cycle))output.points.push({cycle,...await memory(cdp,path.join(OUTPUT,`soak-200-${cycle}`))});
  if(cycle===60)break;
  const result=await fixture.page.evaluate(async cycle=>{
   document.activeElement?.blur?.();clearCanvasSelection();const id=String(cycle%3+1),before=toCanvasOperationNode(canvasVirtualStore.get(id));
   await CanvasNodeRepresentation.hydrateNode(id);const full=!!getCanvasNode(id);const downgraded=CanvasNodeRepresentation.dehydrateNode(id),after=toCanvasOperationNode(canvasVirtualStore.get(id));
   return {id,full,downgraded,before,after};
  },cycle);
  if(!result.full||!result.downgraded||JSON.stringify(result.before)!==JSON.stringify(result.after))output.failures.push({cycle,result});
  await settle(fixture.page,550);
 }
 output.errors=fixture.errors;writeJSON(path.join(OUTPUT,'memory-soak-200.json'),output);
 console.log(JSON.stringify({points:output.points.map(p=>({cycle:p.cycle,heap:p.heap.usedSize,nodes:p.dom.nodes,listeners:p.dom.jsEventListeners,detachedFull:p.detachedDOM.canvasNodeElements})),failures:output.failures.length,errors:output.errors}));
 assert.ok(output.persistence.pass);assert.ok(!output.functional.failures.length);assert.deepEqual(output.failures,[]);assert.deepEqual(output.errors,[]);
 }finally{await fixture.close();}})().catch(e=>{console.error(e.message.slice(0,2500));process.exitCode=1;});
