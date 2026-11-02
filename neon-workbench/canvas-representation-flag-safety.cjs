const assert=require('node:assert/strict'),path=require('node:path');
const {openFixture,loadModels,settle,FLAGS,OUTPUT,writeJSON}=require('./dom-scaling-test-support.cjs');
(async()=>{const fixture=await openFixture(),results=[];
 try{for(const flag of FLAGS){
  await loadModels(fixture,36,'A');await settle(fixture.page,700);
  const result=await fixture.page.evaluate(async flag=>{
   const id='1',node=CanvasNodeRepresentation.hydrateNode(id),camera={x:canvasState.x,y:canvasState.y,scale:canvasState.scale};
   clearCanvasSelection();document.activeElement?.blur();let release;
   const completion=canvasRepresentation.runTask(node,async()=>{await new Promise(resolve=>release=resolve);node.querySelector('.canvas-node-prompt').value='开关回退任务完成';syncCanvasNodeModel(node);});
   NeonCanvasPerformanceFlags[flag]=false;Object.assign(canvasState,{x:-100000,y:-100000});applyCanvasTransformNow();canvasVirtualizer.flushNow();
   const protectedTask=node.isConnected&&getCanvasNode(id)===node;
   release();await completion;
   const value=canvasVirtualStore.get(id).prompt;
   Object.assign(canvasState,camera);NeonCanvasPerformanceFlags[flag]=true;applyCanvasTransformNow();CanvasNodeRepresentation.reconcile();
   return {flag,protectedTask,value,taskCount:canvasRepresentation.tasks.size};
  },flag);results.push(result);assert.equal(result.protectedTask,true,`${flag}关闭不能卸载原任务闭包`);assert.equal(result.value,'开关回退任务完成');assert.equal(result.taskCount,0);
 }
 writeJSON(path.join(OUTPUT,'flag-safety-final.json'),{results,errors:fixture.errors});assert.deepEqual(fixture.errors,[]);console.log(JSON.stringify({ok:true,results}));
 }finally{await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
