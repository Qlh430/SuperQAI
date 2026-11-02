const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {OUTPUT,EDGE,URL,openFixture,loadModels,settle,snapshot,persistenceCheck,functionalChecks,gesture,memory,quantiles,writeJSON}=require('./dom-scaling-test-support.cjs');

// Full default: 2 feature modes × 2 scenarios × 4 sizes × 3 fresh-browser rounds.
// NODES=100,200 ROUNDS=1 SCENARIOS=B BASELINE=1 SOURCE_OVERLAY=1 LABEL=red
// BASELINE=1 -> only flag-off; BASELINE=0 -> only default-on; unset -> both.
(async()=>{
  const label=process.env.LABEL||'matrix';
  const folder=path.join(OUTPUT,label);fs.mkdirSync(folder,{recursive:true});
  const counts=(process.env.NODES||'36,100,200,500').split(',').map(Number);
  const scenarios=(process.env.SCENARIOS||'A,B').split(',');
  const rounds=Number(process.env.ROUNDS||3);
  const modes=process.env.BASELINE==='1'?[true]:process.env.BASELINE==='0'?[false]:[true,false];
  const steps=Number(process.env.GESTURE_STEPS||48);
  const results=[];
  const manifest={generatedAt:new Date().toISOString(),label,environment:{browser:EDGE,url:URL,node:process.version,platform:process.platform,viewport:[1440,1050],sourceOverlay:process.env.SOURCE_OVERLAY==='1',scalingSource:process.env.SCALING_SOURCE||null,baselineDir:process.env.BASELINE_DIR||null},protocol:{counts,scenarios,rounds,modes,steps,eventDriver:'Playwright原生middle鼠标与wheel分别测量；无直接Pan/Zoom函数采样',activeFrames:'输入事件后100ms内的rAF间隔，包含跨越100ms期限的输入长帧；整体、手势与settle分别保留',quantiles:'nearest rank: sorted[ceil(N*p)-1]',order:'每个独立重复中交替100/200顺序，每个case使用全新browser',setup:'真实节点模板→本地模型恢复→首次保存完整ACK→原生预热→测量；恢复/首次持久化不混入连续手势采样',memory:'初始/功能回归后/2、4、6次切换后强制GC堆、DOMCounters与真实detachedDOM；CDP DOM.getDetachedDomNodes，协议不支持时V8堆快照detachedness字段',apiBoundary:'所有/api请求均模拟并返回真实格式的operations ACK；不触及桌面3199或用户数据；真实登录业务未覆盖'},results};
  const resultFile=path.join(folder,'results.json');
  if(process.env.RESUME==='1'&&fs.existsSync(resultFile)){
    const previous=JSON.parse(fs.readFileSync(resultFile));
    if(JSON.stringify(previous.protocol)!==JSON.stringify(manifest.protocol)||JSON.stringify(previous.environment)!==JSON.stringify(manifest.environment))throw new Error('续跑环境或协议不同，禁止混合数据');
    for(const result of previous.results){
      if(result.failures.length)throw new Error(`已有失败例${result.id}，禁止通过续跑静默替换`);
      for(const resource of result.sourceResources||[]){const file=resource.file||resource.path;const runtime=path.resolve(__dirname,'../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app',resource.runtimeName);if(crypto.createHash('sha256').update(fs.readFileSync(runtime)).digest('hex')!==resource.servedSHA256)throw new Error(`冻结运行资源已变化：${file||runtime}`);}
      results.push(result);
    }
    manifest.resumedAt=new Date().toISOString();manifest.generatedAt=previous.generatedAt;console.log(`冻结字节校验通过，保留${results.length}个完整新浏览器用例，剩余整例续跑`);
  }
  for(let round=0;round<rounds;round++) {
    const ordered=[...counts];
    if(round%2&&ordered.includes(100)&&ordered.includes(200)){const i=ordered.indexOf(100),j=ordered.indexOf(200);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
    for(const scenario of scenarios)for(const baseline of modes)for(const count of ordered) {
      const id=`${baseline?'baseline':'after'}-${scenario}-${count}-r${round+1}`;
      if(results.some(result=>result.id===id))continue;
      const result={id,baseline,scenario,count,round:round+1,failures:[],knownBaselineBugs:[]};let fixture;
      console.log(`开始 ${id}`);
      try {
        fixture=await openFixture({baseline});
        result.browserVersion=fixture.browserVersion;
        result.model=await loadModels(fixture,count,scenario);await settle(fixture.page,1000);
        result.idle=await snapshot(fixture.page);
        if(result.idle.total!==count)result.failures.push(`模型数${result.idle.total} != ${count}`);
        if(scenario==='B'&&result.idle.visible!==count)result.failures.push(`全景实际可见数${result.idle.visible} != ${count}`);
        if(result.idle.scenePage)result.failures.push('夹具产生服务端scenePage');
        result.initialPersistence=await persistenceCheck(fixture);
        if(!result.initialPersistence.pass)(baseline?result.knownBaselineBugs:result.failures).push('首次保存/ACK未完整覆盖全部未挂载模型内容（原始collector只扫mounted路径）');
        await settle(fixture.page,600);
        const cdp=await fixture.context.newCDPSession(fixture.page);
        result.memoryBefore=await memory(cdp,path.join(folder,`${id}-before`));
        // Unmeasured native warm-up is the same input count for every size and mode.
        const warmBox=await fixture.page.locator('#infiniteCanvas').boundingBox();
        await fixture.page.mouse.move(warmBox.x+35,warmBox.y+warmBox.height*.6);
        await fixture.page.mouse.wheel(0,-5);await fixture.page.mouse.wheel(0,5);await settle(fixture.page,700);
        result.nativePan=await gesture(fixture,cdp,'nativePan',path.join(folder,`${id}-pan.trace.json`),{steps});
        result.nativeZoom=await gesture(fixture,cdp,'nativeZoom',path.join(folder,`${id}-zoom.trace.json`),{steps});
        if(!result.nativePan.actualGesture)result.failures.push('原生Pan未实际改变相机');
        if(!result.nativeZoom.actualGesture)result.failures.push('原生Zoom未实际改变相机');
        if(!baseline){
          const samples=[result.idle,result.nativePan.peak,result.nativeZoom.peak];
          result.browsingBudgets={full:samples.every(s=>s.full<=5),light:samples.every(s=>s.light<=8),canvasDOM:samples.every(s=>s.canvasDOM<=5000),lightElements:samples.every(s=>s.lightDOMMax<=50)};
          if(Object.values(result.browsingBudgets).some(pass=>!pass))result.failures.push(`正常浏览峰值预算失败：${JSON.stringify(result.browsingBudgets)}`);
        }
        result.functional=await functionalChecks(fixture,{strict:!baseline});
        for(const item of result.functional.failures){const knownBefore=baseline&&/^端口连接及真实undo\/redo记录$/.test(item.name)&&/连接撤销失败/.test(item.error);(knownBefore?result.knownBaselineBugs:result.failures).push(`${item.name}: ${item.error}`);}
        result.cycles=[];result.memoryWaypoints=[{phase:'before',...result.memoryBefore},{phase:'after-functional',...await memory(cdp,path.join(folder,`${id}-after-functional`))}];
        if(await fixture.page.evaluate(()=>!!window.CanvasNodeRepresentation)) for(let cycle=0;cycle<6;cycle++) {
          const cycleResult=await fixture.page.evaluate(async cycle=>{
            document.activeElement?.blur?.();clearCanvasSelection();
            const id=String(cycle%3+1);const start=performance.now();await CanvasNodeRepresentation.hydrateNode(id);const hydrated=performance.now();
            const model=canvasVirtualStore.get(id), original={x:canvasState.x,y:canvasState.y};
            // Explicit viewport navigation is a functional/memory cycle, never a native gesture sample.
            canvasState.x=-model.x*canvasState.scale+80;canvasState.y=-model.y*canvasState.scale+80;applyCanvasTransformNow();
            await CanvasNodeRepresentation.dehydrateNode(id);
            Object.assign(canvasState,original);applyCanvasTransformNow();CanvasNodeRepresentation.reconcile();
            return {id,hydrateMs:hydrated-start,cycleMs:performance.now()-start};
          },cycle);
          await settle(fixture.page,600);result.cycles.push(cycleResult);
          if((cycle+1)%2===0)result.memoryWaypoints.push({phase:`after-${cycle+1}-cycles`,...await memory(cdp,path.join(folder,`${id}-cycles-${cycle+1}`))});
        }
        result.memoryAfter=await memory(cdp,path.join(folder,`${id}-after`));
        result.memoryTrend=result.memoryWaypoints.map(point=>({phase:point.phase,usedHeapSize:point.heap.usedSize,nodes:point.dom.nodes,listeners:point.dom.jsEventListeners,detachedTrees:point.detachedDOM.treeCount??null,retainedDetachedNodes:point.detachedDOM.retainedNodeCount??point.detachedDOM.nodeCount??null,detachedCanvasNodeElements:point.detachedDOM.canvasNodeElements??null}));
        result.final=await snapshot(fixture.page);
        result.errors=fixture.errors;result.requests=fixture.requests;result.sourceFiles=[...new Set(fixture.sourceFiles)];
        result.sourceHashes=Object.fromEntries(result.sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
        result.sourceResources=fixture.sourceResources;
        if(fixture.errors.length)result.failures.push(...fixture.errors.map(error=>`pageerror: ${error}`));
        result.cycleHydration=quantiles(result.cycles.map(cycle=>cycle.hydrateMs));
        await fixture.page.screenshot({path:path.join(folder,`${id}.png`)});
      } catch(error) {result.failures.push(error.stack);}
      finally {if(fixture)await fixture.close();}
      results.push(result);writeJSON(path.join(folder,`${id}.json`),result);writeJSON(resultFile,manifest);
      console.log(JSON.stringify({id,idle:result.idle&&{documentDOM:result.idle.documentDOM,canvasDOM:result.idle.canvasDOM,visible:result.idle.visible,full:result.idle.full,light:result.idle.light,canvas:result.idle.canvas},pan:result.nativePan?.activeFrames,zoom:result.nativeZoom?.activeFrames,failures:result.failures}));
    }
  }
  const comparisons=[];
  for(const baseline of modes)for(const scenario of scenarios) {
    const byCount=count=>results.filter(r=>r.baseline===baseline&&r.scenario===scenario&&r.count===count);
    const a=byCount(100),b=byCount(200);if(!a.length||!b.length)continue;
    const median=(rows,fn)=>quantiles(rows.map(fn)).p50;
    const growth=(x,y)=>x>0?y/x-1:null;
    const pair={baseline,scenario,samples:[a.length,b.length],gates:{},metrics:{}};
    for(const key of ['documentDOM','canvasDOM']){
      const peak=r=>Math.max(r.idle?.[key]||0,r.nativePan?.peak?.[key]||0,r.nativeZoom?.peak?.[key]||0);
      const x=median(a,peak),y=median(b,peak);pair.metrics[key]={n100:x,n200:y,growth:growth(x,y)};pair.gates[key]=growth(x,y)!==null&&growth(x,y)<=.2;
    }
    for(const key of ['nativePan','nativeZoom']) {
      const x=median(a,r=>r[key]?.activeFrames.p95),y=median(b,r=>r[key]?.activeFrames.p95);
      pair.metrics[key]={n100:x,n200:y,growth:growth(x,y)};
      pair.gates[`${key}Scaling`]=growth(x,y)!==null&&growth(x,y)<=.25;
      pair.gates[`${key}Absolute`]=x!==null&&y!==null&&x<30&&y<30;
    }
    pair.gates.functional=[...a,...b].every(r=>!r.failures.length);
    pair.knownBaselineBugs=[...a,...b].flatMap(r=>r.knownBaselineBugs||[]);
    pair.gates.fullMatrix= a.length>=3&&b.length>=3;
    comparisons.push(pair);
  }
  manifest.comparisons=comparisons;
  const afterComparisons=comparisons.filter(pair=>!pair.baseline),afterCases=results.filter(result=>!result.baseline);
  const complete=afterCases.length>=24&&[36,100,200,500].every(count=>['A','B'].every(scenario=>afterCases.filter(result=>result.count===count&&result.scenario===scenario).length>=3));
  manifest.verdict={matrixComplete:complete,functionalPassed:afterCases.length>0&&afterCases.every(result=>!result.failures.length),scalingPassed:complete&&afterComparisons.length===2&&afterComparisons.every(pair=>pair.gates.documentDOM&&pair.gates.canvasDOM&&pair.gates.nativePanScaling&&pair.gates.nativeZoomScaling),absoluteFrameTargetPassed:complete&&afterComparisons.length===2&&afterComparisons.every(pair=>pair.gates.nativePanAbsolute&&pair.gates.nativeZoomAbsolute),boundary:complete?null:'不完整矩阵只能用于冒烟/诊断，不能宣称100→200扩展性验收通过'};
  writeJSON(resultFile,manifest);
  console.log(JSON.stringify({output:resultFile,cases:results.length,comparisons,failedCases:results.filter(r=>r.failures.length).map(r=>r.id)}));
  if(results.some(r=>r.failures.length))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
