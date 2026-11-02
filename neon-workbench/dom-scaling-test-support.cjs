/* Isolated browser fixtures. Never contacts the desktop API or writes its data. */
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, '.planning', 'dom-scaling-20261015');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.env.AI_OS_TEST_URL || 'http://127.0.0.1:33217';
if (new globalThis.URL(URL).port === '3199') throw new Error('压力验收禁止使用桌面3199服务');
const SOURCE = process.env.SCALING_SOURCE ? path.resolve(process.env.SCALING_SOURCE) : path.join(__dirname, 'design-sources');
const FLAGS = ['representationManager', 'detailHydration', 'detailCulling'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  const at = p => sorted.length ? sorted[Math.min(sorted.length-1, Math.max(0,Math.ceil(sorted.length*p)-1))] : null;
  return { count: sorted.length, p50: at(.5), p95: at(.95), max: sorted.length ? sorted[sorted.length-1] : null };
};
const writeJSON = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive:true }); fs.writeFileSync(file, JSON.stringify(value,null,2)); };

async function openFixture({ baseline = false, width = 1440, height = 1050 } = {}) {
  const browser = await chromium.launch({ executablePath: EDGE, headless:true, args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--enable-precise-memory-info'] });
  const context = await browser.newContext({ viewport:{width,height}, reducedMotion:'no-preference' });
  const page = await context.newPage();
  const errors = [], requests = [], sourceFiles = [],sourceResources=[];
  const savedModels=new Map(),savedConnections=new Map();
  page.on('pageerror', error => errors.push(error.message));
  let revision = 0;
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new globalThis.URL(request.url()).pathname;
    let body = {}; try { body = request.postDataJSON() || {}; } catch {}
    requests.push({ path:pathname, method:request.method(), operationCount:body.operations?.length || 0, nodeUpsertIds:(body.operations||[]).filter(op=>op.type==='node.upsert').map(op=>String(op.entityId)) });
    let json = { authenticated:false, models:[], nodes:[], connections:[], providers:[], boards:[], projects:[], resources:[], records:[], tasks:[], settings:{}, preferences:{}, operations:[], success:true };
    if (/\/operations$/.test(pathname) && request.method() === 'POST') {
      for(const op of body.operations||[]) {
        const target=op.type.startsWith('node.')?savedModels:op.type.startsWith('connection.')?savedConnections:null;
        if(target){if(op.type.endsWith('.delete'))target.delete(String(op.entityId));else if(op.after)target.set(String(op.entityId),JSON.parse(JSON.stringify(op.after)));}
      }
      json = { success:true, boardRevision:++revision, results:(body.operations || []).map(op => ({ operationId:op.operationId, status:'applied', entityId:op.entityId, entityRevision:revision })) };
    }
    else if (/\/boards$/.test(pathname) && request.method() === 'POST') json = { ...body, id:body.id || 'dom-scaling-mock-board', revision:0, success:true };
    else if (/\/meta$/.test(pathname)) json = { revision };
    else if (/\/nodes$/.test(pathname)) {const ids=new globalThis.URL(request.url()).searchParams.getAll('nodeId');json={nodes:ids.map(id=>savedModels.get(id)).filter(Boolean),connections:[...savedConnections.values()]};}
    // No scene page is supplied: local resident rendering must work on its own.
    else if (/\/viewport$/.test(pathname)) json = { mode:'detail', nodes:[...savedModels.values()], connections:[...savedConnections.values()], complete:true, boardRevision:revision, engineVersion:'canvas-visual-fidelity-v2' };
    await route.fulfill({ status:200, json });
  });
  const overlay = process.env.SOURCE_OVERLAY === '1';
  const baselineDir = baseline && process.env.BASELINE_DIR ? path.resolve(process.env.BASELINE_DIR) : null;
  if(!overlay&&!baselineDir){
    const runtime=process.env.QA_RUNTIME_ROOT ? path.resolve(process.env.QA_RUNTIME_ROOT) : path.join(ROOT,'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
    for(const runtimeName of ['index.html','module-manifest.js','script.js','canvas-node-visuals.js','canvas-virtualizer.js','canvas-representation-manager.js','canvas-representation-host.js','canvas-scene-layer.js','flora-node-shell.js','flora-node-shell.css','flora-generator-composer.js','canvas-text-node-renderer.js','flora-connection-interaction.js','neon-canvas-surface.css','neon-workbench.js','neon-workbench.css']){
      const file=path.join(runtime,runtimeName);sourceFiles.push(file);sourceResources.push({runtimeName,file,servedSHA256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sourceMode:'unmodified static runtime file; no source route'});
    }
  }
  if (overlay || baselineDir) {
    const sourceMap = {
      'canvas-node-visuals.js':'canvas-node-visuals.js', 'neon-canvas-surface.css':'neon-canvas-surface.css',
      'script.js':'script-before-save-bridge.js', 'canvas-virtualizer.js':'canvas-virtualizer.js',
      'canvas-scene-layer.js':'canvas-scene-layer.js', 'flora-node-shell.js':'flora-node-shell.js',
      'flora-node-shell.css':'flora-node-shell.css', 'flora-generator-composer.js':'flora-generator-composer.js',
      'canvas-representation-manager.js':'canvas-representation-manager.js', 'canvas-representation-host.js':'canvas-representation-host.js',
      'flora-connection-interaction.js':'flora-connection-interaction.js', 'canvas-text-node-renderer.js':'canvas-text-node-renderer.js',
    };
    for (const [runtimeName, sourceName] of Object.entries(sourceMap)) {
      const file = baselineDir ? path.join(baselineDir,runtimeName) : path.join(SOURCE,sourceName);
      if (!fs.existsSync(file)) continue;
      await page.route(`**/${runtimeName}*`, async route => {
        let body = fs.readFileSync(file,'utf8');
        if (runtimeName === 'script.js' && !baselineDir) {
          if (!body.includes('saveForNavigation: async function')) body = body.replace('window.CanvasWorkspace = {', 'window.CanvasWorkspace = {\n  saveForNavigation: async function () { await saveCanvasBoardNow(); if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) throw new Error("画布尚未保存成功，请重试后再返回。"); },');
          for (const name of ['canvas-script-production.js','canvas-asset-entry.js']) body += '\n' + fs.readFileSync(path.join(SOURCE,name),'utf8');
        }
        sourceFiles.push(file);
        sourceResources.push({runtimeName,file,servedSHA256:crypto.createHash('sha256').update(body).digest('hex')});
        await route.fulfill({ contentType:runtimeName.endsWith('.css') ? 'text/css' : 'application/javascript', body });
      });
    }
    if (!baselineDir) await page.route('**/*', async (route) => {
      const request = route.request();
      const pathname = new globalThis.URL(request.url()).pathname;
      if (!request.isNavigationRequest() || !/^\/(?:index\.html)?$/.test(pathname)) return route.fallback();
      const response = await route.fetch();
      let body = await response.text();
      const modules = ['canvas-representation-manager.js','canvas-representation-host.js'].filter(name => fs.existsSync(path.join(SOURCE,name)) && !body.includes(name));
      const tags = modules.map(name => `<script src="./${name}?v=dom-scaling-source"></script>`).join('\n');
      if (tags) {
        // The lazy host script is requested by module-manifest on some builds.
        // Insert before the module loader, so the constructor is ready either way.
        const anchor = body.match(/<script\b[^>]*src=["'][^"']*(?:module-loader|script)\.js[^"']*["'][^>]*>/);
        body = anchor ? body.replace(anchor[0], `${tags}\n${anchor[0]}`) : body.replace('</head>',`${tags}\n</head>`);
      }
      await route.fulfill({ response, body });
    });
  }
  await page.addInitScript(({ baseline, flags }) => {
    window.NeonCanvasPerformanceFlags = { ...(window.NeonCanvasPerformanceFlags || {}), ...Object.fromEntries(flags.map(key => [key,!baseline])), diagnostics:true };
  }, {baseline,flags:FLAGS});
  try {
    await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime','canvas-node-generator','canvas-node-minimax-h3','canvas-node-text','canvas-node-note']);
      await loadCanvasBoards();
      canvasState.activeBoardId='dom-scaling-mock-board';
      canvasState.activeBoardPersisted=false;
      canvasState.isRestoring=true;
      // Same editor hosting contract used by the workbench bridge, no node DOM is fabricated.
      const surface=document.createElement('div'); surface.id='neonEngineSurface';
      surface.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column';
      const view=document.querySelector('#canvasView'); surface.append(view); document.body.append(surface);
      view.hidden=false; view.classList.add('active'); view.style.cssText='flex:1;min-height:0;width:100%';
      document.querySelector('#canvasEditorScreen').hidden=false;
      document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      const image=addCanvasImageGeneratorNode({x:0,y:0},{focus:false});
      const h3=addCanvasMinimaxH3Node({x:600,y:0},{prompt:'镜头向前移动，暖色街道',seed:42});
      const text=addCanvasText({x:1200,y:0},{text:'固定种子复杂节点正文',focus:false});
      const note=addCanvasNote({x:1800,y:0},{text:'轻量便签',focus:false});
      window.__domScalingSeeds=[image,h3,text,note].map(node=>serializeCanvasNode(node));
      window.__domScalingPNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
      clearCanvasPlane(); canvasState.isRestoring=false; clearTimeout(canvasState.saveTimer);
      window.__domScaling={events:[], frames:[], longTasks:[], peaks:[], running:false, phase:'idle', activeUntil:0};
      const state=window.__domScaling;
      for (const type of ['pointerdown','pointermove','pointerup','wheel']) document.querySelector('#infiniteCanvas').addEventListener(type,event=>{
        if (!state.running) return;
        const at=performance.now(); state.events.push({at,type,buttons:event.buttons,deltaY:event.deltaY||0});
        state.activeUntil=at+100;
      },{capture:true,passive:true});
      try { new PerformanceObserver(list=>{for(const item of list.getEntries()) if(state.running) state.longTasks.push({startTime:item.startTime,duration:item.duration,phase:state.phase});}).observe({type:'longtask',buffered:true}); } catch {}
      let last=performance.now();
      function frame(now) {
        if (state.running) {
          // A long frame that starts during input stays active even if its end
          // lands more than100ms after that input. Otherwise stalls disappear.
          state.frames.push({at:now,ms:now-last,active:now<=state.activeUntil||last<=state.activeUntil,phase:state.phase,camera:{x:canvasState.x,y:canvasState.y,scale:canvasState.scale}});
        }
        last=now;requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      window.__domScalingSnapshot=()=>{
        const plane=document.querySelector('#canvasPlane');
        const ids=Array.from(canvasVirtualStore.mountedIds());
        const byLevel={full:0,light:0,canvas:0}; const fullSizes=[],lightSizes=[];
        for(const id of ids) { const level=canvasVirtualStore.getMountedLevel(id)||'full'; byLevel[level]=(byLevel[level]||0)+1; const el=canvasVirtualStore.getMounted(id); (level==='light'?lightSizes:fullSizes).push(el?el.querySelectorAll('*').length+1:0); }
        const rect=canvasVirtualizer.getRects().viewport;
        const visibleRect=CanvasVirtualizationRules.getViewportCanvasRect({width:rect.width,height:rect.height},{x:rect.x,y:rect.y,scale:rect.scale},0);
        const visibleIds=Array.from(canvasVirtualStore.query(visibleRect));
        return {at:performance.now(),documentDOM:document.querySelectorAll('*').length,canvasDOM:document.querySelector('#infiniteCanvas')?.querySelectorAll('*').length||0,nodePlaneDOM:plane?.querySelectorAll('*').length||0,total:canvasVirtualStore.size,visible:visibleIds.length,resident:canvasPagedStore.models?.size??canvasVirtualStore.size,full:byLevel.full,light:byLevel.light,canvas:Math.max(0,visibleIds.length-ids.filter(id=>visibleIds.includes(id)).length),fullDOMAverage:fullSizes.length?fullSizes.reduce((a,b)=>a+b,0)/fullSizes.length:0,fullDOMMax:Math.max(0,...fullSizes),lightDOMMax:Math.max(0,...lightSizes),svgConnectionPaths:document.querySelectorAll('#canvasConnections .canvas-connection-path').length,modelConnections:canvasState.connections.length,visibleEndpointConnections:canvasState.connections.filter(edge=>visibleIds.includes(String(edge.from))&&visibleIds.includes(String(edge.to))).length,scene:canvasSceneLayer?.getDiagnostics(),representation:window.CanvasRepresentationDiagnostics?.snapshot?.()||null,pendingOperations:canvasPagedStore.getPendingOperations().length,scenePage:!!canvasPagedStore.scenePage,viewport:{...rect}};
      };
      window.__domScalingCounters=()=>{
        const manager=typeof canvasRepresentation==='undefined'?null:canvasRepresentation?.manager;
        const scene=canvasSceneLayer?.getDiagnostics?.()||{};
        const host=typeof canvasRepresentation==='undefined'?null:canvasRepresentation;
        return {hydrateCount:manager?.transitions?.hydrate?.count||0,dehydrateCount:manager?.transitions?.dehydrate?.count||0,planCount:manager?.planCount||0,sceneRenderCount:scene.renderCount??null,sceneReprojectCount:scene.reprojectCount??null,drawCandidatesRead:scene.candidatesRead??null,sceneCandidateQueries:host?.sceneQueryCount??null,sceneCandidatesRead:host?.sceneCandidatesRead??null};
      };
      // Inspect DOM only when the committed subtree changes. Scanning every rAF
      // would manufacture size-dependent sampling work in the legacy baseline.
      new MutationObserver(()=>{if(state.running){const start=performance.now();state.peaks.push(window.__domScalingSnapshot());state.observationCosts.push(performance.now()-start);}}).observe(document.documentElement,{childList:true,subtree:true});
    });
    return { browser,context,page,errors,requests,sourceFiles,sourceResources,savedModels,savedConnections,baseline,browserVersion:browser.version(),close:()=>browser.close() };
  } catch(error) { await browser.close(); throw error; }
}

async function loadModels(fixture, count, scenario='B') {
  // Each restore represents a fresh mock board. Do not return stale rows from
  // the previous 500-node case through a later 36-node viewport request.
  fixture.savedModels.clear();fixture.savedConnections.clear();
  return fixture.page.evaluate(({count,scenario})=>{
    const clone=value=>JSON.parse(JSON.stringify(value));
    const lightweight=count>=500, cols=scenario==='A'?4:Math.ceil(Math.sqrt(count*1.4));
    const nodes=Array.from({length:count},(_,index)=>{
      const seed=clone(__domScalingSeeds[lightweight?3:index%3]);
      const x=(index%cols)*(lightweight?340:680), y=Math.floor(index/cols)*(lightweight?280:620);
      const model={...seed,id:String(index+1),x,y,width:Number(seed.width)||400,height:Number(seed.height)||400,zOrder:index+1,nodeTitle:`验收节点${index+1}`};
      if(model.kind==='minimax-h3') Object.assign(model,{minimaxH3Prompt:`固定镜头${index+1}`,minimaxH3Steps:4,minimaxH3Duration:12});
      else if(model.kind==='text') Object.assign(model,{text:`固定正文${index+1}`,llmPrompt:`固定指令${index+1}`,llmModel:'qa-text-model'});
      else if(model.kind==='note') model.text=`轻量便签${index+1}`;
      else Object.assign(model,{width:400,height:400,prompt:`固定图片提示词${index+1}`,model:'qa-image-model',size:'1024x1024',resolution:'1',resultSrc:__domScalingPNG,generationHistory:[{id:`history-${index+1}`,kind:'image',src:__domScalingPNG,prompt:`固定图片提示词${index+1}`,model:'qa-image-model',createdAt:'2026-10-15T00:00:00.000Z'}],currentGenerationId:`history-${index+1}`});
      return model;
    });
    const viewport=document.querySelector('#infiniteCanvas');
    const rows=Math.ceil(count/cols), worldWidth=cols*(lightweight?340:680),worldHeight=rows*(lightweight?280:620);
    const scale=scenario==='A'?.55:Math.min((viewport.clientWidth-120)/worldWidth,(viewport.clientHeight-160)/worldHeight,.4);
    if(scale<.1) throw new Error(`全景夹具缩放低于产品最小值：${scale}`);
    const connections=[];
    if(!lightweight)for(let i=6;i+1<count;i+=6)connections.push({id:`qa-edge-${i}`,from:String(i+1),to:String(i+2),fromPort:'output',toPort:'input'});
    const board={id:'dom-scaling-mock-board',title:'DOM扩展性临时验收',createdAt:'2026-10-15T00:00:00.000Z',nodes,connections,viewport:{x:60,y:70,scale}};
    restoreCanvasBoard(board);
    // Undefined revision means a local board; no paged API can substitute the models.
    canvasState.activeBoardPersisted=false;
    canvasState.isRestoring=false;
    clearCanvasSelection();
    canvasVirtualizer.schedule();
    window.CanvasNodeRepresentation?.reconcile();
    clearTimeout(canvasState.saveTimer);
    __domScaling.board=clone(board);
    return {count,scenario,lightweight,cols,rows,viewport:board.viewport,kinds:nodes.reduce((r,n)=>(r[n.kind]=(r[n.kind]||0)+1,r),{})};
  },{count,scenario});
}
async function settle(page, ms=850) { await page.waitForTimeout(ms); await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))); }
async function snapshot(page) { return page.evaluate(()=>__domScalingSnapshot()); }
async function persistenceCheck(fixture) {
  const requestStart=fixture.requests.length;
  const result=await fixture.page.evaluate(async()=>{
    document.activeElement?.blur?.();clearCanvasSelection();
    const modelIds=Array.from(canvasVirtualStore.models.keys());
    const mountedIds=Array.from(canvasVirtualStore.mountedIds());
    collectCanvasDirtyOperations({recordUndo:false});
    const pendingIds=canvasPagedStore.getPendingOperations().filter(op=>op.type==='node.upsert').map(op=>String(op.entityId));
    const missingIds=modelIds.filter(id=>!pendingIds.includes(id));
    const expectedModels=Array.from(canvasVirtualStore.models.values()).map(model=>toCanvasOperationNode(model));
    await saveCanvasBoardNow({recordUndo:false});
    return {modelIds,mountedIds,pendingIds,missingIds,expectedModels,pendingAfter:canvasPagedStore.getPendingOperations().length,persistedIds:Array.from(canvasPersistedNodes.keys())};
  });
  result.ackNodeIds=[...new Set(fixture.requests.slice(requestStart).flatMap(request=>request.nodeUpsertIds||[]))];
  result.missingAckIds=result.modelIds.filter(id=>!result.ackNodeIds.includes(id));
  result.contentDifferences=result.expectedModels.filter(model=>!isDeepStrictEqual(model,fixture.savedModels.get(String(model.id)))).map(model=>({id:model.id,expected:model,actual:fixture.savedModels.get(String(model.id))}));
  delete result.expectedModels;
  result.pass=!result.missingIds.length&&!result.missingAckIds.length&&!result.pendingAfter&&!result.contentDifferences.length;
  return result;
}

async function nativeSceneConnection(fixture,from='1',to='2') {
 const {page}=fixture;
 await page.evaluate(async({from,to})=>{document.activeElement?.blur?.();clearCanvasSelection();disconnectCanvasNodes(from,to,'output','input');await CanvasNodeRepresentation.hydrateNode(from);selectCanvasNode(getCanvasNode(from));CanvasNodeRepresentation.dehydrateNode(to);},{from,to});
 await settle(page,700);
 const body=await page.evaluate(id=>{const r=getCanvasNode(id).querySelector('.flora-node-content').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};},from);
 await page.mouse.move(body.x,body.y);await settle(page,100);
 const points=await page.evaluate(({from,to})=>{const port=getCanvasNode(from).querySelector('[data-canvas-port="output"]'),p=port.getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),target=getCanvasRepresentationVisualBounds(canvasVirtualStore.get(to));return {source:{x:p.left+p.width/2,y:p.top+p.height/2},target:{x:v.left+canvasState.x+(target.left+target.right)*canvasState.scale/2,y:v.top+canvasState.y+(target.top+target.bottom)*canvasState.scale/2},targetFull:!!getCanvasNode(to)};},{from,to});
 if(points.targetFull)throw new Error('目标事前已经Full，不能证明Scene连接');
 await page.mouse.move(points.source.x,points.source.y);await page.mouse.down();
 const started=await page.evaluate(()=>!!canvasState.tempConnection);if(!started)throw new Error('实际原生端口拖线未开始');
 await page.mouse.move(points.target.x,points.target.y,{steps:5});await page.mouse.up();await settle(page,150);
 const result=await page.evaluate(({from,to})=>({edge:canvasState.connections.find(e=>e.from===from&&e.to===to),full:__domScalingSnapshot().full}),{from,to});
 if(!result.edge)throw new Error('原生拖线到Scene目标没有建立连接');if(result.full>8)throw new Error('普通连接突破Full预算');return {points,started,...result};
}

async function functionalChecks(fixture,{strict=true}={}) {
  const {page}=fixture, checks=[],failures=[],skipped=[];
  async function check(name,fn) { try { const details=await fn(); checks.push({name,details}); } catch(error) { failures.push({name,error:error.message}); } }
  await check('真实本地模型与Scene可见性',async()=>{
    const info=await snapshot(page);
    if(info.scenePage) throw new Error('夹具意外进入服务端Scene分页');
    if(!info.total||!info.visible) throw new Error('没有实际可见模型');
    if(strict&&!info.representation) throw new Error('缺少CanvasRepresentationDiagnostics.snapshot，P0/P1尚未接线');
    if(strict&&info.canvas>0&&!(info.scene?.hitRegionCount>0)) throw new Error('Canvas没有可命中场景节点');
    if(info.visibleEndpointConnections>0&&(info.svgConnectionPaths+(info.scene?.connectionCount||0))<info.visibleEndpointConnections)throw new Error(`可见端点连接未绘制：${JSON.stringify(info)}`);
    return info;
  });
  if(strict) await check('普通浏览Full与Light预算',async()=>{
    const info=await snapshot(page);
    if(info.full>5||info.light>8||info.canvasDOM>5000||info.lightDOMMax>50) throw new Error(JSON.stringify(info));
    return info;
  });
  if(!await page.evaluate(()=>!!window.CanvasNodeRepresentation)) {
    (strict?failures:skipped).push(strict?{name:'Scene→Full→Scene公开入口',error:'缺少CanvasNodeRepresentation'}:{name:'表示层专项',reason:'原始基线不含CanvasNodeRepresentation；只执行模型与真实手势测量'});
    return {checks,failures,skipped};
  }
  const ids=await page.evaluate(()=>Array.from(canvasVirtualStore.models?.keys?.()||[]).slice(0,3));
  const first=ids[0],second=ids[1];
  await check('图片H3文字各类型模型与原控件往返一致',async()=>page.evaluate(async ids=>{
    const fields=['prompt','model','size','resolution','modelParameters','generationHistory','currentGenerationId','resultSrc','minimaxH3Prompt','minimaxH3AspectRatio','minimaxH3Megapixels','minimaxH3Steps','minimaxH3Duration','minimaxH3RefImageSize','minimaxH3Mode','minimaxH3Seed','llmPrompt','llmModel','text','textRichHtml','noteColor'];
    const results=[];
    for(const id of ids){
      document.activeElement?.blur?.();clearCanvasSelection();const model=JSON.parse(JSON.stringify(canvasVirtualStore.get(id)));
      await CanvasNodeRepresentation.hydrateNode(id);const before=serializeCanvasNode(getCanvasNode(id));
      const initialDifferences=fields.filter(field=>Object.hasOwn(model,field)&&JSON.stringify(model[field])!==JSON.stringify(before[field]));
      if(initialDifferences.length)throw new Error(`模型→Full ${id}/${model.kind}：${JSON.stringify(initialDifferences.map(field=>({field,model:model[field],full:before[field]})))}`);
      syncCanvasNodeModel(getCanvasNode(id));await CanvasNodeRepresentation.dehydrateNode(id);const level=CanvasNodeRepresentation.getLevel(id);
      await CanvasNodeRepresentation.hydrateNode(id);const after=serializeCanvasNode(getCanvasNode(id));
      const differences=fields.filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));
      if(differences.length)throw new Error(`Full往返 ${id}/${model.kind}：${differences.join(',')}`);
      results.push({id,kind:model.kind,level,fields:fields.filter(field=>Object.hasOwn(model,field))});
    }
    return results;
  },ids));
  await check(strict?'原生Scene点击升级与选择':'原生Full节点点击选择',async()=>{
    const target=await page.evaluate(strict=>{
      const ids=canvasVirtualStore.query(canvasVirtualizer.getRects().mountRect);
      for(const id of ids) {
        if(strict&&getCanvasNode(id)) continue;
        if(!strict){const node=getCanvasNode(id),content=node?.querySelector('.flora-node-content')||node;if(content){const r=content.getBoundingClientRect();if(r.width&&r.height)return{id,point:{x:r.left+r.width*.5,y:r.top+r.height*.5}};}continue;}
        const item=canvasVirtualStore.get(id),rect=document.querySelector('#infiniteCanvas').getBoundingClientRect();
        const point={x:rect.left+canvasState.x+(item.x+item.width*.5)*canvasState.scale,y:rect.top+canvasState.y+(item.y+item.height*.5)*canvasState.scale};
        if(point.x>rect.left+30&&point.x<rect.right-30&&point.y>rect.top+30&&point.y<rect.bottom-30) return {id,point};
      }
      return null;
    },strict);
    if(!target) throw new Error('当前视口未找到可点击的非Full节点');
    await page.mouse.click(target.point.x,target.point.y); await settle(page,180);
    const result=await page.evaluate(id=>({selected:canvasState.selectedIds.has(id),full:!!getCanvasNode(id),level:CanvasNodeRepresentation.getLevel(id)}),target.id);
    const intentDriven=await page.evaluate(()=>!!window.CanvasNodeVisuals);
    if(!result.selected||!result.full) throw new Error(JSON.stringify(result)); return {target,...result,intentDriven};
  });
  await check(strict?'提示词模型参数历史结果往返':'Full节点编辑与模型一致',async()=>{
    const before=await page.evaluate(async id=>{
      clearCanvasSelection(); await CanvasNodeRepresentation.hydrateNode(id);
      const node=getCanvasNode(id); if(!node) throw new Error('升级未创建原控件');
      selectCanvasNode(node);
      const input=node.querySelector('.canvas-node-prompt,.canvas-h3-prompt,.canvas-llm-prompt,.canvas-note-text');
      if(input) { if('value'in input) input.value='往返编辑：提示词及焦点'; else input.textContent='往返编辑：便签'; input.dispatchEvent(new Event('input',{bubbles:true})); }
      const model=syncCanvasNodeModel(node);
      document.activeElement?.blur?.(); clearCanvasSelection();
      return JSON.parse(JSON.stringify(model));
    },first);
    await settle(page,650);
    const transition=await page.evaluate(async id=>{ await CanvasNodeRepresentation.dehydrateNode(id); return {level:CanvasNodeRepresentation.getLevel(id),model:canvasVirtualStore.get(id)}; },first);
    if(strict&&transition.level==='full') throw new Error('失活后没有降级');
    const after=await page.evaluate(async id=>{await CanvasNodeRepresentation.hydrateNode(id);const node=getCanvasNode(id);if(!node)throw new Error('再次升级失败');return serializeCanvasNode(node);},first);
    const fields=['prompt','model','size','resolution','modelParameters','generationHistory','currentGenerationId','resultSrc','resultDownloadUrl','minimaxH3Prompt','minimaxH3Steps','minimaxH3Duration','minimaxH3Seed','llmPrompt','llmModel','text','noteColor'];
    const differences=fields.filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));
    if(differences.length) throw new Error(`状态不同：${differences.join(',')}`);
    return {fields:fields.filter(field=>Object.hasOwn(before,field)),before,after,demotedLevel:transition.level};
  });
  await check('原生控件焦点保护与文字选区',async()=>{
    const focused=await page.evaluate(async id=>{
      await CanvasNodeRepresentation.hydrateNode(id);const node=getCanvasNode(id);selectCanvasNode(node);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const candidates=[...node.querySelectorAll('textarea,input[type="text"],[contenteditable="true"]')];
      const input=candidates.find(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.disabled);
      if(!input)throw new Error('真实节点无编辑控件');
      input.focus();if(typeof input.setSelectionRange==='function')input.setSelectionRange(1,3);
      await CanvasNodeRepresentation.dehydrateNode(id);CanvasNodeRepresentation.reconcile();
      return {focused:node.contains(document.activeElement),full:!!getCanvasNode(id),start:input.selectionStart,end:input.selectionEnd,index:candidates.indexOf(input),className:input.className};
    },first);
    await settle(page,650);
    const kept=await page.evaluate(id=>({full:!!getCanvasNode(id),focused:getCanvasNode(id)?.contains(document.activeElement),protection:CanvasRepresentationDiagnostics.snapshot().protection}),first);
    if(!focused.full||!focused.focused||!kept.full||!kept.focused)throw new Error(`聚焦控件被卸载：${JSON.stringify({focused,kept})}`);
    await page.evaluate(()=>{document.activeElement?.blur?.();clearCanvasSelection();});await settle(page,650);
    const restored=await page.evaluate(async({id,index})=>{await CanvasNodeRepresentation.dehydrateNode(id);await CanvasNodeRepresentation.hydrateNode(id);const input=getCanvasNode(id)?.querySelectorAll('textarea,input[type="text"],[contenteditable="true"]')[index];return{start:input?.selectionStart,end:input?.selectionEnd,className:input?.className};},{id:first,index:focused.index});
    if(typeof focused.start==='number'&&(restored.start!==focused.start||restored.end!==focused.end))throw new Error(`选区未恢复：${JSON.stringify({focused,restored})}`);
    return {focused,kept,restored};
  });
  if(strict)await check('Scene命中区域与Full可见主体几何一致',async()=>{
    const full=await page.evaluate(async id=>{
      document.activeElement?.blur?.();clearCanvasSelection();await CanvasNodeRepresentation.hydrateNode(id);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const node=getCanvasNode(id),body=node.querySelector('.flora-node-result')||node.querySelector('.flora-node-card')||node.querySelector('.flora-node-content')||node;
      syncCanvasNodeModel(node);
      const r=body.getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect();
      return {body:{left:r.left-v.left,top:r.top-v.top,right:r.right-v.left,bottom:r.bottom-v.top},model:canvasVirtualStore.get(id),scale:canvasState.scale,bodyClass:body.className};
    },first);
    await page.evaluate(async id=>{document.activeElement?.blur?.();clearCanvasSelection();await CanvasNodeRepresentation.dehydrateNode(id);renderCanvasSceneLayer();},first);
    await settle(page,100);
    const scene=await page.evaluate(id=>{const r=canvasSceneLayer?.hitRegions.find(region=>region.id===id);return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom}:null;},first);
    if(!scene)throw new Error('降级后没有Scene命中区域');
    const diff=Object.fromEntries(['left','top','right','bottom'].map(key=>[key,scene[key]-full.body[key]]));
    if(Object.values(diff).some(value=>Math.abs(value)>2))throw new Error(`Scene/Full可见主体偏移：${JSON.stringify({full,scene,diff,worldDiff:Object.fromEntries(Object.entries(diff).map(([key,value])=>[key,value/full.scale]))})}`);
    return {full,scene,diff};
  });
  const firstIsNote=await page.evaluate(id=>canvasVirtualStore.get(id)?.kind==='note',first);
  if(firstIsNote)skipped.push({name:'结果与历史更新',reason:'500轻量便签无媒体结果历史，复杂节点矩阵执行'});
  else await check('结果与历史更新进入同一模型',async()=>page.evaluate(async id=>{
    await CanvasNodeRepresentation.hydrateNode(id); const node=getCanvasNode(id);
    if(!node) throw new Error('无法升级结果节点');
    const item={id:'qa-result-update',kind:'image',src:__domScalingPNG,prompt:'结果更新',model:'qa-image-model'};
    FloraGenerationHistory.add(node,item); applyCanvasGenerationHistoryItem(node,item); syncCanvasNodeModel(node);
    const data=canvasVirtualStore.get(id); if(!data.generationHistory?.some(entry=>entry.id===item.id)) throw new Error('模型未保存新历史');
    return {currentGenerationId:data.currentGenerationId,historyCount:data.generationHistory.length};
  },first));
  await check('多选与框选不批量升级',async()=>{
    await page.evaluate(()=>{document.activeElement?.blur?.();clearCanvasSelection();const r=document.querySelector('#infiniteCanvas').getBoundingClientRect();selectCanvasNodesInScreenRect({left:r.left+20,top:r.top+20,right:r.right-20,bottom:r.bottom-20});});
    await settle(page,650);
    const result=await page.evaluate(()=>({selected:canvasState.selectedIds.size,total:canvasVirtualStore.size,full:__domScalingSnapshot().full}));
    if(result.selected<2) throw new Error(`实际框选不足2个：${JSON.stringify(result)}`);
    if(strict&&result.full>8) throw new Error(`多选Full失去预算：${JSON.stringify(result)}`); return result;
  });
  if(firstIsNote) skipped.push({name:'图片端口连接/undo/redo',reason:'500轻量便签不具备生成端口；复杂节点矩阵执行'});
  else await check('端口连接及真实undo/redo记录',async()=>page.evaluate(async({first,second})=>{
    clearCanvasSelection(); await CanvasNodeRepresentation.hydrateNode(first); await CanvasNodeRepresentation.hydrateNode(second);
    resetCanvasUndoHistory(); connectCanvasNodes(first,second);
    const exists=()=>canvasState.connections.some(edge=>edge.from===first&&edge.to===second);
    if(!exists())throw new Error('产品拒绝连接或未建立真实连接');
    const edge=canvasState.connections.find(edge=>edge.from===first&&edge.to===second);
    const stack=canvasState.undoStack.map(command=>({label:command.label,forward:command.forward,inverse:command.inverse}));
    const undo=undoCanvasCommand(); if(!undo||exists())throw new Error(`连接撤销失败：${JSON.stringify({undo,stack,edge,connections:canvasState.connections,isRestoring:canvasState.isRestoring})}`);
    const redo=redoCanvasCommand(); if(!redo||!exists())throw new Error('连接重做失败');
    return {edge,undo,redo,pending:canvasPagedStore.getPendingOperations().length};
  },{first,second}));
  if(strict&&!firstIsNote)await check('原生拖线到事前无Full的Scene目标',()=>nativeSceneConnection(fixture,first,second));
  await check('复制粘贴与undo/redo保留模型内容',async()=>page.evaluate(async({first,second})=>{
    document.activeElement?.blur?.();clearCanvasSelection();
    await CanvasNodeRepresentation.hydrateNode(first);await CanvasNodeRepresentation.hydrateNode(second);
    selectCanvasNode(getCanvasNode(first));addCanvasNodeToSelection(getCanvasNode(second));
    await copyCanvasSceneSelection();
    const before=canvasVirtualStore.size,clipboard=JSON.parse(JSON.stringify(canvasState.clipboard));
    if(clipboard.nodes.length!==2)throw new Error(`实际复制了${clipboard.nodes.length}个`);
    resetCanvasUndoHistory();pasteCanvasModelClipboard();
    const pastedIds=[...canvasState.selectedIds],pasted=pastedIds.map(id=>canvasVirtualStore.get(id));
    if(canvasVirtualStore.size!==before+2)throw new Error('粘贴没有新增2个模型');
    const fields=['prompt','model','generationHistory','currentGenerationId','minimaxH3Prompt','minimaxH3Steps','text'];
    clipboard.nodes.forEach((original,index)=>{for(const field of fields)if(JSON.stringify(original[field])!==JSON.stringify(pasted[index]?.[field]))throw new Error(`粘贴内容丢失：${field}`);});
    clearCanvasSelection();const undo=undoCanvasCommand();if(!undo||canvasVirtualStore.size!==before)throw new Error('粘贴撤销未恢复节点数');
    const redo=redoCanvasCommand();if(!redo||canvasVirtualStore.size!==before+2)throw new Error('粘贴重做未恢复节点数');
    clearCanvasSelection();undoCanvasCommand();
    return {before,pastedIds,undo,redo,after:canvasVirtualStore.size};
  },{first,second}));
  await check('保存ACK清空待提交操作与重新加载',async()=>{
    const saved=await page.evaluate(async()=>{document.activeElement?.blur?.();clearCanvasSelection();const before=serializeCanvasBoard();await saveCanvasBoardNow();return {before,pending:canvasPagedStore.getPendingOperations().length};});
    if(saved.pending)throw new Error(`模拟操作ACK未清空：${saved.pending}`);
    const loaded=await page.evaluate(board=>{restoreCanvasBoard(board);canvasState.activeBoardPersisted=false;return serializeCanvasBoard();},saved.before);
    if(saved.before.nodes.length!==loaded.nodes.length)throw new Error('加载丢失模型');
    if(JSON.stringify(saved.before.connections)!==JSON.stringify(loaded.connections))throw new Error('加载丢失连接');
    return {nodes:loaded.nodes.length,connections:loaded.connections.length,ackRequests:fixture.requests.filter(r=>/operations$/.test(r.path)).length};
  });
  await check('编辑器进入离开再进入',async()=>page.evaluate(()=>{
    const before=serializeCanvasBoard().nodes.length;
    setCanvasAppScreen('library'); const library=canvasState.appScreen;
    setCanvasAppScreen('editor'); const editor=canvasState.appScreen;
    const after=serializeCanvasBoard().nodes.length;
    if(library!=='library'||editor!=='editor'||after!==before) throw new Error('页面切换丢失模型或状态');
    return {before,after,library,editor};
  }));
  if(!await page.evaluate(()=>window.AiOsDesktop?.isReady?.()))skipped.push({name:'产品全屏状态往返',reason:'无登录独立fixture没有注册桌面应用窗口；desktop-shell明确拒绝沉浸请求，真实产品全屏由已有宿主acceptance和用户会话验收覆盖'});
  else await check('产品全屏状态往返',async()=>page.evaluate(()=>{
    const before=serializeCanvasBoard().nodes.length;
    const entered=setCanvasImmersive(true),enterState=canvasState.isImmersive;
    const exited=setCanvasImmersive(false),exitState=canvasState.isImmersive;
    if(!entered||!enterState||exited||exitState||serializeCanvasBoard().nodes.length!==before)throw new Error(`产品沉浸式全屏状态不一致：${JSON.stringify({entered,enterState,exited,exitState,before,after:serializeCanvasBoard().nodes.length,appScreen:canvasState.appScreen,activeBoardId:canvasState.activeBoardId,control:document.querySelector('#canvasImmersiveToggleButton')?.outerHTML})}`);
    return {entered,enterState,exited,exitState};
  }));
  skipped.push({name:'真实播放/提交中的媒体和任务保护',reason:'夹具不提交外部任务、不自动播放真实登录媒体；保护状态仍需专项和真实业务验收'});
  skipped.push({name:'透明区域命中、拖动resize、重连与组行为',reason:'本文件执行Scene原生命中、框选与建立连接；这些几何和组专项由已有产品回归脚本覆盖，不把未执行的专项列为通过'});
  await page.evaluate(()=>{document.activeElement?.blur?.();clearCanvasSelection();CanvasNodeRepresentation.reconcile();});
  await settle(page,750);
  return {checks,failures,skipped};
}

async function beginTrace(cdp) { await cdp.send('Performance.enable'); await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8',transferMode:'ReturnAsStream'}); return cdp.send('Performance.getMetrics'); }
async function endTrace(cdp,file,before) {
  const ended=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.end'); const {stream}=await ended;
  const chunks=[]; for(;;) { const item=await cdp.send('IO.read',{handle:stream}); chunks.push(item.base64Encoded?Buffer.from(item.data,'base64'):Buffer.from(item.data));if(item.eof)break; }
  await cdp.send('IO.close',{handle:stream}); const raw=Buffer.concat(chunks);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,raw);
  const trace=JSON.parse(raw),events=trace.traceEvents||[];
  const totals={UpdateLayoutTree:{count:0,ms:0,elementCount:null,elementCountEvents:0},Layout:{count:0,ms:0,elementCount:null,elementCountEvents:0},Paint:{count:0,ms:0,elementCount:null,elementCountEvents:0}};
  for(const event of events)if(totals[event.name]&&event.ph==='X'){
    const total=totals[event.name];total.count++;total.ms+=(event.dur||0)/1000;
    const count=event.args?.elementCount??event.args?.data?.elementCount??event.args?.beginData?.elementCount;
    if(Number.isFinite(count)){total.elementCount=(total.elementCount||0)+count;total.elementCountEvents++;}
  }
  const after=await cdp.send('Performance.getMetrics'),b=Object.fromEntries(before.metrics.map(m=>[m.name,m.value]));
  const delta=Object.fromEntries(after.metrics.filter(m=>/Duration$|Count$/.test(m.name)).map(m=>[m.name,m.value-(b[m.name]||0)]));
  return {file,traceTotals:totals,cdpMetricsDelta:delta,recalculationElementCountSource:'Trace事件args.elementCount、args.data.elementCount或args.beginData.elementCount；字段不存在时为null，未用DOM大小或样式写入次数推算',traceBytes:raw.length};
}
async function memory(cdp,file) {
  await cdp.send('HeapProfiler.collectGarbage');
  const [heap,dom]=await Promise.all([cdp.send('Runtime.getHeapUsage'),cdp.send('Memory.getDOMCounters')]);
  let detachedDOM;
  try {
    await cdp.send('DOM.enable');
    const detached=await cdp.send('DOM.getDetachedDomNodes');
    if(file)writeJSON(`${file}.detached-dom.json`,detached);
    const trees=detached.detachedNodes.map(entry=>{
      let subtreeNodes=0,canvasNodeElements=0;
      const visit=node=>{if(!node)return;subtreeNodes++;const attrs=node.attributes||[],classIndex=attrs.indexOf('class'),classes=classIndex>=0?String(attrs[classIndex+1]).split(/\s+/):[];if(classes.includes('canvas-node')||classes.includes('canvas-light-node'))canvasNodeElements++;for(const child of node.children||[])visit(child);for(const child of node.shadowRoots||[])visit(child);if(node.templateContent)visit(node.templateContent);};
      visit(entry.treeNode);
      return {nodeName:entry.treeNode.nodeName,backendNodeId:entry.treeNode.backendNodeId,attributes:entry.treeNode.attributes,retainedNodes:entry.retainedNodeIds.length,subtreeNodes,canvasNodeElements};
    });
    detachedDOM={measured:true,source:'CDP DOM.getDetachedDomNodes after HeapProfiler.collectGarbage',treeCount:trees.length,retainedNodeCount:trees.reduce((n,t)=>n+t.retainedNodes,0),canvasNodeElements:trees.reduce((n,t)=>n+t.canvasNodeElements,0),trees,rawFile:file?`${file}.detached-dom.json`:null};
    await cdp.send('DOM.disable');
  } catch(error) {
    const chunks=[];const handler=event=>chunks.push(event.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',handler);
    try {
      await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false,exposeInternals:true});
      const raw=chunks.join('');if(file)fs.writeFileSync(`${file}.heapsnapshot`,raw);
      const dump=JSON.parse(raw),fields=dump.snapshot.meta.node_fields,stride=fields.length,detachedIndex=fields.indexOf('detachedness'),nameIndex=fields.indexOf('name'),typeIndex=fields.indexOf('type'),selfSizeIndex=fields.indexOf('self_size'),nodeTypes=dump.snapshot.meta.node_types[typeIndex];
      const detachedNodes=[];
      if(detachedIndex>=0)for(let offset=0;offset<dump.nodes.length;offset+=stride)if(dump.nodes[offset+detachedIndex]===2)detachedNodes.push({name:dump.strings[dump.nodes[offset+nameIndex]],type:nodeTypes[dump.nodes[offset+typeIndex]],selfSize:dump.nodes[offset+selfSizeIndex]});
      detachedDOM={measured:detachedIndex>=0,source:'V8 heap snapshot node.detachedness===2',nodeCount:detachedNodes.length,nativeNodeCount:detachedNodes.filter(node=>node.type==='native').length,nodes:detachedNodes,rawFile:file?`${file}.heapsnapshot`:null,protocolFallback:error.message,limitation:detachedIndex>=0?null:'当前V8堆快照未提供detachedness字段，无法断言脱离节点数量'};
    } finally {cdp.off('HeapProfiler.addHeapSnapshotChunk',handler);}
  }
  return {heap,dom,detachedDOM};
}
async function gesture(fixture,cdp,kind,file,{steps=48,returnPanOrigin=false}={}) {
  const {page}=fixture;
  const box=await page.locator('#infiniteCanvas').boundingBox(),cx=kind==='nativeZoom'?box.x+35:box.x+box.width*.65,cy=box.y+box.height*.6;
  await page.mouse.move(cx,cy); await settle(page,250);
  const initial=await snapshot(page);
  initial.counters=await page.evaluate(()=>__domScalingCounters());
  const before=await beginTrace(cdp);
  await page.evaluate(({kind,initial})=>{Object.assign(__domScaling,{events:[],frames:[],longTasks:[],peaks:[initial],observationCosts:[],running:true,phase:kind,activeUntil:performance.now()+100});},{kind,initial});
  const driverStarted=performance.now();
  if(kind==='nativePan') {
    await page.mouse.down({button:'middle'});
    for(let i=0;i<steps;i++){const angle=i/(steps-1)*Math.PI*2;await page.mouse.move(cx+Math.sin(angle)*85,cy+Math.cos(angle)*50);await sleep(12);}
    if(returnPanOrigin)await page.mouse.move(cx,cy);
    await page.mouse.up({button:'middle'});
  } else {
    for(let i=0;i<steps;i++){await page.mouse.wheel(0,i<steps/2?-12:12);await sleep(12);}
  }
  const driverMs=performance.now()-driverStarted;
  const inputEnd=await page.evaluate(()=>{const info={counters:__domScalingCounters()};__domScaling.phase='transition-settle';return info;});
  await settle(page,750);
  const sample=await page.evaluate(()=>{__domScaling.running=false;return {events:__domScaling.events,frames:__domScaling.frames,longTasks:__domScaling.longTasks,peaks:__domScaling.peaks,observationCosts:__domScaling.observationCosts};});
  const trace=await endTrace(cdp,file,before);
  sample.final=await snapshot(page);
  sample.final.counters=await page.evaluate(()=>__domScalingCounters());
  const range=key=>{const values=sample.frames.map(frame=>frame.camera[key]);return values.length?Math.max(...values)-Math.min(...values):0;};
  const cameraRange={x:range('x'),y:range('y'),scale:range('scale')};
  const actualGesture=kind==='nativePan'?cameraRange.x>1||cameraRange.y>1:cameraRange.scale>.0001;
  const difference=(end,start,key)=>Number.isFinite(end?.counters?.[key])&&Number.isFinite(start?.counters?.[key])?end.counters[key]-start.counters[key]:null;
  const transitionCounts=Object.fromEntries(['hydrateCount','dehydrateCount','planCount','sceneRenderCount','sceneReprojectCount','drawCandidatesRead','sceneCandidateQueries','sceneCandidatesRead'].map(key=>[key,{duringInput:difference(inputEnd,initial,key),duringSettle:difference(sample.final,inputEnd,key),total:difference(sample.final,initial,key)}]));
  return {...sample,initial,inputEnd,kind,driverMs,cameraRange,actualGesture,transitionCounts,domObservation:{timings:quantiles(sample.observationCosts),totalMs:sample.observationCosts.reduce((a,b)=>a+b,0),protocol:'开始/结束DOM快照在trace和帧窗口之外；测量中仅实际childList变更时采样，不在连续帧中周期扫描DOM；变更观测开销单列并包含在原始帧/trace中'},driverOverhead:'Playwright串行CDP输入确认和12ms节拍包含在原生手势耗时中；活跃帧为最近实际输入事件后100ms，包含跨过此期限的输入长帧；DOM峰值观测器同一规则用于全部大小与开关，不降低产品输入采样',wholeFrames:quantiles(sample.frames.map(f=>f.ms)),activeFrames:quantiles(sample.frames.filter(f=>f.active).map(f=>f.ms)),gestureFrames:quantiles(sample.frames.filter(f=>f.phase===kind).map(f=>f.ms)),transitionFrames:quantiles(sample.frames.filter(f=>f.phase==='transition-settle').map(f=>f.ms)),peak:Object.fromEntries(['documentDOM','canvasDOM','full','light','canvas','fullDOMAverage','lightDOMMax'].map(key=>[key,Math.max(0,...sample.peaks.map(p=>p[key]),sample.final[key])])),trace};
}
module.exports={ROOT,OUTPUT,EDGE,URL,FLAGS,openFixture,loadModels,settle,snapshot,persistenceCheck,functionalChecks,gesture,memory,quantiles,writeJSON};
