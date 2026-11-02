const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const S=require('./canvas-final-test-support.cjs');
const out=path.resolve(process.env.CANVAS_EVIDENCE_DIR);fs.mkdirSync(out,{recursive:true});
(async()=>{const counts=(process.env.COUNTS||'100,200,2000').split(',').map(Number),rounds=Number(process.env.ROUNDS||3);
 const results={protocol:{counts,rounds,scenarios:['A','B'],groupEvery:20,nativeEvents:48,groupGeometry:'union of three member visible bounds (body + floating identity) +16; members remain independent',api:'isolated mock; no scenePage'},cases:[]};
 for(let round=1;round<=rounds;round++)for(const scenario of ['A','B'])for(const count of round%2?counts:[...counts].reverse()){
  const id=`${scenario}-${count}-r${round}`,r={id,count,scenario,round,failures:[]};let f;console.log('begin '+id);
  try{f=await S.openFixture();await S.prepareKinds(f);await S.loadFinal(f,count,scenario);
   r.fixture=await f.page.evaluate(()=>{const nodes=JSON.parse(JSON.stringify(canvasVirtualStore.values()));let groups=0;
    for(let i=19;i<nodes.length;i+=20){const members=nodes.slice(i-3,i),b=CanvasGeometryRules.unionRects(members.map(getCanvasGroupSubjectBounds).filter(Boolean));
     nodes[i]={kind:'group',id:nodes[i].id,x:b.left-16,y:b.top-16,width:b.right-b.left+32,height:b.bottom-b.top+32,groupTitle:`素材组${++groups}`,groupMembers:members.map(n=>n.id),groupColor:'#14b8a6',zOrder:0};}
    restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections:canvasState.connections,viewport:{x:canvasState.x,y:canvasState.y,scale:canvasState.scale}});
    canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();clearTimeout(canvasState.saveTimer);return{groups,total:nodes.length};});
   await S.settle(f.page,1200);r.idle=await S.snapshot(f.page);assert.equal(r.idle.total,count);assert.ok(!r.idle.scenePage);
   const c=await f.context.newCDPSession(f.page);r.before=await S.memory(c,path.join(out,id+'-before'));
   const diag=()=>f.page.evaluate(()=>window.CanvasGroupDiagnostics?.snapshot()||null);r.groupBefore=await diag();r.textBefore=await f.page.evaluate(()=>CanvasNodeVisuals.diagnostics());
   r.pan=await S.gesture(f,c,'nativePan',path.join(out,id+'-pan.trace.json'),{returnPanOrigin:true});r.groupAfterPan=await diag();r.textAfterPan=await f.page.evaluate(()=>CanvasNodeVisuals.diagnostics());assert.equal(r.textAfterPan.layoutMisses-r.textBefore.layoutMisses,0,'Pan must not rebuild text layout');
   r.zoom=await S.gesture(f,c,'nativeZoom',path.join(out,id+'-zoom.trace.json'));r.groupAfterZoom=await diag();r.textAfterZoom=await f.page.evaluate(()=>CanvasNodeVisuals.diagnostics());assert.equal(r.textAfterZoom.layoutMisses-r.textAfterPan.layoutMisses,0,'Zoom must not rebuild text layout');
   if(r.groupBefore)for(const key of ['membershipPasses','fitPasses','geometryEvents'])assert.equal(r.groupAfterZoom[key]-r.groupBefore[key],0,`camera must not trigger group ${key}`);
   for(const v of [r.idle,r.pan.peak,r.zoom.peak]){assert.equal(v.full,0);assert.ok(v.light<=8);assert.ok(v.canvasDOM<5000);}
   assert.ok(r.pan.actualGesture&&r.zoom.actualGesture);r.after=await S.memory(c,path.join(out,id+'-after'));r.errors=f.errors;assert.deepEqual(f.errors,[]);
   r.browser=f.browserVersion;r.sourceResources=f.sourceResources;await f.page.screenshot({path:path.join(out,id+'.png')});
  }catch(e){r.failures.push(e.stack||e.message);}finally{if(f)await f.close();}
  results.cases.push(r);S.writeJSON(path.join(out,id+'.json'),r);S.writeJSON(path.join(out,'results.json'),results);
  console.log(JSON.stringify({id,dom:r.idle?.documentDOM,canvasDOM:r.idle?.canvasDOM,visible:r.idle?.visible,groups:r.fixture?.groups,pan:r.pan?.activeFrames,zoom:r.zoom?.activeFrames,groupBefore:r.groupBefore,groupAfter:r.groupAfterZoom,failures:r.failures}));
 }if(results.cases.some(r=>r.failures.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
