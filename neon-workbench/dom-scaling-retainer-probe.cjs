const fs=require('node:fs'),path=require('node:path');
const {openFixture,loadModels,settle,OUTPUT,writeJSON}=require('./dom-scaling-test-support.cjs');
(async()=>{const fixture=await openFixture();try{
 await loadModels(fixture,36,'B');await settle(fixture.page);
 const point=await fixture.page.evaluate(async()=>{await CanvasNodeRepresentation.hydrateNode('1');const n=getCanvasNode('1'),r=n.querySelector('.flora-node-content').getBoundingClientRect();window.__retainerWeak=new WeakRef(n);return{x:r.left+r.width/2,y:r.top+r.height/2};});
 await fixture.page.mouse.move(point.x,point.y);await settle(fixture.page,180);
 await fixture.page.evaluate(async()=>{document.activeElement?.blur();clearCanvasSelection();await CanvasNodeRepresentation.dehydrateNode('1');});await settle(fixture.page,900);
 const cdp=await fixture.context.newCDPSession(fixture.page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
 const weak=await fixture.page.evaluate(()=>{const node=__retainerWeak.deref();return{retained:!!node,connected:node?.isConnected,id:node?.dataset.id};});
 const chunks=[];const handler=e=>chunks.push(e.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',handler);await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false,exposeInternals:true});cdp.off('HeapProfiler.addHeapSnapshotChunk',handler);
 const file=path.join(OUTPUT,`${process.env.LABEL||'retainer'}.heapsnapshot`);fs.writeFileSync(file,chunks.join(''));writeJSON(file+'.json',{weak,errors:fixture.errors});console.log(JSON.stringify({weak,file,errors:fixture.errors}));
 }finally{await fixture.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
