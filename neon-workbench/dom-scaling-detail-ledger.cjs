const assert=require('node:assert/strict'),path=require('node:path');
const {openFixture,loadModels,settle,functionalChecks,quantiles,writeJSON,OUTPUT,FLAGS}=require('./dom-scaling-test-support.cjs');
(async()=>{
 const results=[];let fixture;
 try{
  fixture=await openFixture();const cdp=await fixture.context.newCDPSession(fixture.page);
  await fixture.page.evaluate(()=>{
   const ledger=window.__detailLedger={hydrate:[],dehydrate:[],fullSizes:[],fullPeak:0,lightPeak:0,exceptionPeak:0,reasons:{},peakIds:[]};
   const record=canvasRepresentation.manager.recordTransition.bind(canvasRepresentation.manager);
   canvasRepresentation.manager.recordTransition=(kind,ms)=>{ledger[kind]?.push(ms);record(kind,ms);};
   const inspect=()=>{const nodes=canvasVirtualStore.mountedElements(),full=nodes.filter(n=>n.dataset.virtualLevel!=='light');
    if(full.length>ledger.fullPeak){ledger.fullPeak=full.length;ledger.peakIds=full.map(n=>n.dataset.id);}
    ledger.lightPeak=Math.max(ledger.lightPeak,nodes.length-full.length);
    for(const node of full)if(ledger.fullSizes.length<512)ledger.fullSizes.push({kind:canvasVirtualStore.get(node.dataset.id)?.kind,elements:node.querySelectorAll('*').length+1});
    const manager=canvasRepresentation.manager;
    ledger.exceptionPeak=Math.max(ledger.exceptionPeak,manager.protectedExceptions||0);
    for(const [reason,count]of Object.entries(manager.protectedReasons||{}))ledger.reasons[reason]=Math.max(ledger.reasons[reason]||0,count);
   };
   new MutationObserver(inspect).observe(document.querySelector('#canvasPlane'),{childList:true});
  });
  for(const count of (process.env.FLAGS_ONLY?'':process.env.NODES||'36,100,200,500').split(',').filter(Boolean).map(Number)){
   await loadModels(fixture,count,'B');await settle(fixture.page,800);
   await fixture.page.evaluate(()=>Object.assign(__detailLedger,{hydrate:[],dehydrate:[],fullSizes:[],fullPeak:0,lightPeak:0,exceptionPeak:0,reasons:{},peakIds:[]}));
   const functional=await functionalChecks(fixture);
   const ledger=await fixture.page.evaluate(()=>({...__detailLedger,diagnostic:CanvasRepresentationDiagnostics.snapshot()}));
   await fixture.page.evaluate(async()=>{document.activeElement?.blur?.();clearCanvasSelection();window.__releasedDetails=[];for(const id of ['1','2','3']){const node=await CanvasNodeRepresentation.hydrateNode(id);__releasedDetails.push({id,kind:canvasVirtualStore.get(id)?.kind,reference:new WeakRef(node)});await CanvasNodeRepresentation.dehydrateNode(id);}});
   await settle(fixture.page,900);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
   const released=await fixture.page.evaluate(()=>__releasedDetails.map(({id,kind,reference})=>({id,kind,retained:!!reference.deref(),connected:reference.deref()?.isConnected})));
   assert.ok(released.every(item=>!item.retained),'真实卸载后的Full节点不得仍被闭包持有');
   if(process.env.HEAP==='1'){
    const fs=require('node:fs'),chunks=[],handler=e=>chunks.push(e.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',handler);await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false,exposeInternals:true});cdp.off('HeapProfiler.addHeapSnapshotChunk',handler);fs.writeFileSync(path.join(OUTPUT,`ledger-${count}.heapsnapshot`),chunks.join(''));
   }
   results.push({count,functional,ledger,released,hydrate:quantiles(ledger.hydrate),dehydrate:quantiles(ledger.dehydrate)});
   console.log(JSON.stringify({count,fullPeak:ledger.fullPeak,exceptionPeak:ledger.exceptionPeak,reasons:ledger.reasons,released,failures:functional.failures}));
  }
  const flags=[];
  for(const flag of FLAGS){
   await loadModels(fixture,100,'B');await settle(fixture.page,700);
   const result=await fixture.page.evaluate(({flag,trace})=>{
    const mutations=[];const originalUpsert=canvasVirtualStore.upsert.bind(canvasVirtualStore);
    if(trace)canvasVirtualStore.upsert=model=>{if(String(model?.id)==='1')mutations.push({prompt:model.prompt,model:model.model,imageName:model.imageName,resultDownloadUrl:model.resultDownloadUrl,history:model.generationHistory?.length,height:model.height,stack:new Error().stack});return originalUpsert(model);};
    clearTimeout(canvasState.saveTimer);
    const id='1',before=toCanvasOperationNode(canvasVirtualStore.get(id));
    const after={...before,prompt:`开关待提交回归-${flag}`};
    recordCanvasUndo({label:'开关状态回归',forward:[{type:'node.upsert',entityId:id,before,after}],inverse:[{type:'node.upsert',entityId:id,before:after,after:before}]});
    stageCanvasOperation({type:'node.upsert',entityId:id,before,after},{applyLocal:true,recordUndo:true,label:'开关状态回归'});
    const capture=()=>({model:toCanvasOperationNode(canvasVirtualStore.get(id)),pending:canvasPagedStore.getPendingOperations(),undo:JSON.stringify(canvasState.undoStack),connections:JSON.stringify(canvasState.connections)});
    const initial=capture();NeonCanvasPerformanceFlags[flag]=false;CanvasNodeRepresentation.reconcile();
    const disabled=capture();NeonCanvasPerformanceFlags[flag]=true;CanvasNodeRepresentation.reconcile();const restored=capture();
    const undo=undoCanvasCommand(),undoPrompt=canvasVirtualStore.get(id)?.prompt;
    const redo=redoCanvasCommand(),redoPrompt=canvasVirtualStore.get(id)?.prompt;
    clearTimeout(canvasState.saveTimer);
    if(trace)canvasVirtualStore.upsert=originalUpsert;
    return {flag,initial,disabled,restored,undo,redo,undoPrompt,redoPrompt,beforePrompt:before.prompt,mutations};
   },{flag,trace:process.env.TRACE_FLAG==='1'});
   writeJSON(path.join(OUTPUT,`detail-flag-${flag}.json`),result);
   assert.deepEqual(result.disabled.model,result.initial.model,`${flag}回退改变模型`);
   assert.deepEqual(result.restored.model,result.initial.model,`${flag}恢复改变模型`);
   for(const state of [result.disabled,result.restored]){assert.deepEqual(state.pending,result.initial.pending,`${flag}改变待提交操作`);assert.equal(state.undo,result.initial.undo);assert.equal(state.connections,result.initial.connections);}
   assert.ok(result.undo&&result.redo);assert.equal(result.undoPrompt,result.beforePrompt);assert.equal(result.redoPrompt,`开关待提交回归-${flag}`);
   flags.push(result);
  }
  await fixture.page.evaluate(async()=>{
   document.activeElement?.blur?.();clearCanvasSelection();
   const node=await CanvasNodeRepresentation.hydrateNode('1');window.__releasedDetail=new WeakRef(node);
   await CanvasNodeRepresentation.dehydrateNode('1');
  });
  await settle(fixture.page,900);
  await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
  const weak=await fixture.page.evaluate(()=>{const node=__releasedDetail.deref();return {retained:!!node,connected:node?.isConnected,id:node?.dataset.id};});
  const report={results,flags,weak,errors:fixture.errors};
  writeJSON(path.join(OUTPUT,'detail-ledger.json'),report);
  console.log(JSON.stringify({output:path.join(OUTPUT,'detail-ledger.json'),weak,flags:flags.map(f=>f.flag),errors:fixture.errors}));
  assert.ok(results.every(r=>!r.functional.failures.length));assert.deepEqual(fixture.errors,[]);
 }finally{await fixture?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
