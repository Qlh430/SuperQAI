const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const S=require('./canvas-final-test-support.cjs');
const out=path.resolve(process.env.CANVAS_EVIDENCE_DIR||path.resolve(__dirname,'../.planning/canvas-final-fidelity-20261016/performance'));fs.mkdirSync(out,{recursive:true});
(async()=>{const counts=(process.env.COUNTS||'100,200,2000').split(',').map(Number),rounds=Number(process.env.ROUNDS||3),result={protocol:{counts,rounds,scenarios:['A','B'],nativeInput:'48 original middle pointer/wheel events; all active frames incl transitions; no scenePage, pins or DOM deletion',mixedKinds:6,stressB:'2000 nodes in48 columns at world spacing260x190, product minimum zoom0.1. Overlap is intentional dense overview; all nodes remain drawn.'},cases:[]};
for(let round=1;round<=rounds;round++)for(const scenario of ['A','B'])for(const count of (round%2?counts:[...counts].reverse())){
 const id=`${scenario}-${count}-r${round}`,r={id,count,scenario,round,failures:[]};let f;console.log('begin '+id);
 try{f=await S.openFixture();await S.prepareKinds(f);r.model=await S.loadFinal(f,count,scenario);await S.settle(f.page,1000);r.idle=await S.snapshot(f.page);assert.equal(r.idle.total,count);assert.ok(!r.idle.scenePage);if(scenario==='B')assert.equal(r.idle.visible,count);
 const c=await f.context.newCDPSession(f.page);r.before=await S.memory(c,path.join(out,id+'-before'));await f.page.mouse.move(35,600);await f.page.mouse.wheel(0,-5);await f.page.mouse.wheel(0,5);await S.settle(f.page,700);
 r.pan=await S.gesture(f,c,'nativePan',path.join(out,id+'-pan.trace.json'),{returnPanOrigin:true});r.zoom=await S.gesture(f,c,'nativeZoom',path.join(out,id+'-zoom.trace.json'));
 assert.ok(r.pan.actualGesture);assert.ok(r.zoom.actualGesture);for(const p of [r.idle,r.pan.peak,r.zoom.peak]){assert.equal(p.full,0);assert.ok(p.light<=8);assert.ok(p.canvasDOM<5000);}
 r.cache=await f.page.evaluate(()=>CanvasNodeVisuals.diagnostics());r.after=await S.memory(c,path.join(out,id+'-after'));r.errors=f.errors;r.browser=f.browserVersion;r.sourceResources=f.sourceResources;assert.deepEqual(r.errors,[]);await f.page.screenshot({path:path.join(out,id+'.png')});
 }catch(e){r.failures.push(e.stack||e.message);}finally{if(f)await f.close();}
 result.cases.push(r);S.writeJSON(path.join(out,id+'.json'),r);S.writeJSON(path.join(out,`results-${counts.join('-')}.json`),result);console.log(JSON.stringify({id,dom:r.idle?.documentDOM,canvasDOM:r.idle?.canvasDOM,visible:r.idle?.visible,pan:r.pan?.activeFrames,zoom:r.zoom?.activeFrames,failures:r.failures}));
}if(result.cases.some(r=>r.failures.length))process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
