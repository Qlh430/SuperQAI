const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
 const failures=[],checks=[],errors=[];
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{authenticated:false,models:[],providers:[],boards:[],projects:[],resources:[],records:[],settings:{},preferences:{},operations:[],success:true}}));
  if(process.env.PERF_SOURCE)for(const [file,source] of [['script.js','script-before-save-bridge.js'],['flora-node-shell.js','flora-node-shell.js'],['flora-generator-composer.js','flora-generator-composer.js']])await page.route(`**/${file}*`,r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(process.env.PERF_SOURCE,source),'utf8')}));
  await page.goto(process.env.AI_OS_TEST_URL||'http://127.0.0.1:33217',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   await AiOsModuleLoader.ensure(['canvas-runtime','canvas-node-generator']);await loadCanvasBoards();canvasState.activeBoardId='qa-optimizations';canvasState.isRestoring=true;
   const surface=document.createElement('div');surface.id='neonEngineSurface';surface.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column';const view=document.querySelector('#canvasView');surface.append(view);document.body.append(surface);view.hidden=false;view.classList.add('active');view.style.cssText='flex:1;min-height:0;width:100%';document.querySelector('#canvasEditorScreen').hidden=false;document.body.classList.add('canvas-surface-open');showCanvasEditor();
   window.qaNodes=Array.from({length:8},(_,i)=>addCanvasImageGeneratorNode({x:(i%4)*440,y:Math.floor(i/4)*480},{focus:false}));qaNodes.forEach(n=>pinCanvasNode(n.dataset.id));Object.assign(canvasState,{x:60,y:40,scale:.5});applyCanvasTransformNow();
   window.qaFrame=()=>new Promise(r=>requestAnimationFrame(r));
  });await page.waitForTimeout(250);
  const check=(name,fn)=>{try{fn();checks.push(name)}catch(e){failures.push({name,error:e.message})}};
  const icons=await page.evaluate(()=>{
   const stable=document.querySelector('#canvasPlane svg[data-lucide]');const before=stable.outerHTML;
   const a=document.createElement('span'),b=document.createElement('span');a.innerHTML='<i data-lucide="plus"></i>';b.innerHTML='<i data-lucide="x"></i>';document.body.append(a,b);lucide.createIcons({root:a,attrs:{'stroke-width':1.8}});
   const scoped=b.firstElementChild.localName==='i';lucide.createIcons({root:b,attrs:{'stroke-width':1.8}});
   const c=document.createElement('span');c.innerHTML='<i data-lucide="play"></i>';document.body.append(c);lucide.createIcons({root:c});const originalPlay=c.firstElementChild.innerHTML;c.firstElementChild.dataset.lucide='pause';lucide.createIcons({root:c});c.firstElementChild.dataset.lucide='play';lucide.createIcons({root:c});const roundtrip=c.firstElementChild.innerHTML===originalPlay;
   const stableResult=stable.isConnected;NeonCanvasPerformanceFlags.incrementalIcons=false;c.firstElementChild.dataset.lucide='pause';lucide.createIcons({root:c});NeonCanvasPerformanceFlags.incrementalIcons=true;c.firstElementChild.dataset.lucide='play';lucide.createIcons({root:c});const fallbackRoundtrip=c.firstElementChild.innerHTML===originalPlay;
   const legacy=document.createElement('span');legacy.innerHTML='<i icon-name="check"></i>';document.body.append(legacy);lucide.createIcons({root:legacy});const legacyIcon=legacy.firstElementChild.localName==='svg';
   const result={stable:stableResult,unchanged:stable.outerHTML===before,scoped,newIcon:a.firstElementChild.localName,otherIcon:b.firstElementChild.localName,roundtrip,fallbackRoundtrip,legacyIcon};a.remove();b.remove();c.remove();legacy.remove();return result;
  });check('stable-svg-and-scoped-new-icons',()=>{assert.equal(icons.stable,true);assert.equal(icons.unchanged,true);assert.equal(icons.scoped,true);assert.equal(icons.newIcon,'svg');assert.equal(icons.otherIcon,'svg');assert.equal(icons.roundtrip,true);assert.equal(icons.fallbackRoundtrip,true);assert.equal(icons.legacyIcon,true)});
  const scale=await page.evaluate(async()=>{
   const rule=document.querySelector('style[data-flora-scale]').sheet.cssRules[0].style;const setter=rule.setProperty.bind(rule);let writes=0;rule.setProperty=(...args)=>{writes++;return setter(...args)};
   canvasState.scale=.25;applyCanvasTransformNow();await qaFrame();await qaFrame();
   const node=qaNodes[0],toolbar=node.querySelector('.flora-node-toolbar'),port=node.querySelector('.canvas-port');clearCanvasSelection();const hidden=getComputedStyle(toolbar).getPropertyValue('--collab-inverse-scale').trim();selectCanvasNode(node);await qaFrame();
   const selected=getComputedStyle(toolbar).getPropertyValue('--collab-inverse-scale').trim(),portScale=getComputedStyle(port).getPropertyValue('--collab-inverse-scale').trim();const hiddenBadge=getComputedStyle(qaNodes[1].querySelector('.flora-generation-history-badge')).getPropertyValue('--collab-inverse-scale').trim();rule.setProperty=setter;return{writes,hidden,selected,portScale,hiddenBadge};
  });check('painted-scale-with-identical-state-values',()=>{assert.equal(scale.hiddenBadge,'1');assert.equal(scale.hidden,'1');assert.equal(scale.selected,'4');assert.equal(scale.portScale,'4')});
  const composerScope=await page.evaluate(async()=>{selectCanvasNode(qaNodes[0]);await qaFrame();await qaFrame();const node=qaNodes[0],panel=node.querySelector('.flora-generator-composer'),child=panel.querySelector('textarea');return{nodeLeft:node.style.getPropertyValue('--flora-composer-left'),panelLeft:getComputedStyle(panel).getPropertyValue('--flora-composer-left').trim(),childLeft:getComputedStyle(child).getPropertyValue('--flora-composer-left').trim()}});
  check('composer-placement-does-not-inherit-into-content',()=>{assert.ok(Math.abs(parseFloat(composerScope.nodeLeft)-parseFloat(composerScope.panelLeft))<.01);assert.equal(parseFloat(composerScope.childLeft),0)});
  const save=await page.evaluate(()=>{
   canvasState.isRestoring=false;clearTimeout(canvasState.saveTimer);canvasPagedStore.pendingOperations.clear();for(const n of qaNodes)canvasPersistedNodes.set(n.dataset.id,toCanvasOperationNode(syncCanvasNodeModel(n)));
   const serialize=window.serializeCanvasNode;let calls=0;window.serializeCanvasNode=(...args)=>{calls++;return serialize(...args)};const prompt=qaNodes[0].querySelector('.canvas-node-prompt');for(let i=0;i<5;i++){prompt.value='已修改'+i;prompt.dispatchEvent(new Event('input',{bubbles:true}))}const inputCalls=calls;
   // Changes outside the known input path must still be found by the final sweep.
   qaNodes[1].querySelector('.canvas-node-prompt').value='异步变化';collectCanvasDirtyOperations();window.serializeCanvasNode=serialize;clearTimeout(canvasState.saveTimer);
   const ops=canvasPagedStore.getPendingOperations();return{inputCalls,first:ops.find(o=>o.entityId===qaNodes[0].dataset.id)?.after?.prompt,fallback:ops.find(o=>o.entityId===qaNodes[1].dataset.id)?.after?.prompt};
  });check('scoped-input-and-complete-final-save',()=>{assert.ok(save.inputCalls<=5,JSON.stringify(save));assert.equal(save.first,'已修改4');assert.equal(save.fallback,'异步变化')});
  check('no-pageerror',()=>assert.deepEqual(errors,[]));const result={checks,failures,icons,scale,save,errors};console.log(JSON.stringify(result));if(process.env.QA_OUTPUT)fs.writeFileSync(process.env.QA_OUTPUT,JSON.stringify(result,null,2));assert.deepEqual(failures,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
