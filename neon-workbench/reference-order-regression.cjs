const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const runtime = path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
const output = path.resolve(__dirname, '../.design/reference-order-20261102', process.env.DEPLOYED ? 'deployed' : 'source');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(runtime, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(runtime + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); res.end(bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(33199, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const errors = [], requests = [], comfyRequests = [], h3Requests = [];
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1050},hasTouch:true});
    page.on('pageerror', e => errors.push(e.message));
    const model = {id:'qa-reference',modelId:'gpt-image-2',providerId:'qa',providerName:'测试服务商',capabilities:['image.generate'],resolutions:['1','2'],state:'online',family:'gpt-image-2'};
    await page.route('**/api/**', r => r.fulfill({json:{authenticated:false,models:[],providers:[],boards:[],projects:[],resources:[],records:[],settings:{},preferences:{}}}));
    await page.route('**/api/image-models*', r => r.fulfill({json:{models:[model]}}));
    await page.route('**/api/image-jobs', r => { requests.push(r.request().postDataJSON()); return r.fulfill({status:400,json:{error:'模拟终止，未执行真实生成'}}); });
    await page.route('**/api/qwen-image21', r => {comfyRequests.push(r.request().postDataJSON()); return r.fulfill({status:400,json:{error:'模拟终止，未执行真实生成'}});});
    await page.route('**/api/minimax-h3-video', r => {h3Requests.push(r.request().postDataJSON()); return r.fulfill({status:400,json:{error:'模拟终止，未执行真实生成'}});});
    if (!process.env.DEPLOYED) for (const name of ['script.js','flora-generator-composer.js','flora-node-shell.css']) await page.route('**/' + name + '*', r => r.fulfill({contentType:name.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(__dirname,'design-sources',name==='script.js'?'script-before-save-bridge.js':name),'utf8')}));
    await page.goto('http://127.0.0.1:33199', {waitUntil:'domcontentloaded'});
    await page.evaluate(async model => {
      await AiOsModuleLoader.ensure(['canvas-runtime','canvas-node-generator','canvas-node-comfy','canvas-node-minimax-h3','canvas-node-text']);
      await loadCanvasBoards(); canvasState.activeBoardId='qa-reference-sort';
      const surface=document.createElement('div'); surface.id='neonEngineSurface'; surface.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e';
      const view=document.querySelector('#canvasView'); surface.append(view); document.body.append(surface); view.hidden=false; view.classList.add('active'); view.style.cssText='flex:1;min-height:0;width:100%';
      document.querySelector('#canvasEditorScreen').hidden=false; document.body.classList.add('canvas-surface-open'); showCanvasEditor();
      imageModelCatalog=[model]; IMAGE_MODEL_PLATFORMS[model.id]='openai'; IMAGE_MODEL_FAMILIES[model.id]='gpt-image-2'; imageModelInput.innerHTML='<option value=qa-reference>测试图片模型</option>'; imageModelInput.value=model.id;
      window.qaTarget=addCanvasImageGeneratorNode({x:100,y:60},{focus:false}); window.qaTargetId=qaTarget.dataset.id;
      const svg=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="'+color+'"/></svg>');
      window.qaSources=['red','gold','green'].map((color,i)=>addCanvasImage(svg(color),'素材'+(i+1),{x:-700,y:i*220}));
      qaSources.forEach(n=>connectCanvasNodes(n.dataset.id,qaTargetId));
      const prompt=qaTarget.querySelector('.canvas-node-prompt'); prompt.value='组合图片1与图片2'; prompt.dispatchEvent(new Event('input',{bubbles:true}));
      canvasState.x=360; canvasState.y=0; canvasState.scale=1; applyCanvasTransformNow(); selectCanvasNode(qaTarget);
    }, model);
    const panel=page.locator('.canvas-node-image .flora-generator-composer').first();
    const names=()=>page.evaluate(()=>[...getCanvasNode(qaTargetId).querySelectorAll('.flora-reference-thumb')].map(n=>n.getAttribute('aria-label')));
    const cards=panel.locator('.flora-reference-thumb');
    if (process.env.CLIPPING_ONLY) {
      await require('./reference-band-clipping-regression.cjs')({page,panel,cards,output,errors});
      return;
    }
    const a=await cards.nth(0).boundingBox(), b=await cards.nth(1).boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width-4,b.y+b.height/2,{steps:12}); await page.screenshot({path:path.join(output,'drag.png')}); await page.mouse.up();
    assert.match((await names())[0], /素材2/, '拖动后第一张必须变成素材2');
    assert.match((await names())[1], /图片2.*素材1/, '编号按新顺序');
    assert.equal(await panel.locator('.canvas-node-prompt').inputValue(),'组合图片2与图片1','本地提示词引用跟随原素材');
    await page.evaluate(async()=>runCanvasImageEdit(getCanvasNode(qaTargetId)));
    assert.equal(requests.length,1,'必须拦截到模拟生成请求');
    assert.match(requests[0].reference_images[0].name, /素材2/, '实际请求按新顺序');
    await page.evaluate(()=>undoCanvasCommand()); await page.waitForTimeout(100); assert.match((await names())[0],/素材1/,'撤销恢复原顺序');
    assert.equal(await panel.locator('.canvas-node-prompt').inputValue(),'组合图片1与图片2','撤销同时恢复提示词');
    await page.evaluate(()=>redoCanvasCommand()); await page.waitForTimeout(100); assert.match((await names())[0],/素材2/,'重做恢复新顺序');
    const restored=await page.evaluate(()=>{const node=getCanvasNode(qaTargetId); const saved=serializeCanvasNode(node); const copy=restoreCanvasBoardNode({...saved,id:'qa-sort-restored'},{},{maxId:0,legacyResults:[]}); canvasState.connections.push(...canvasState.connections.filter(c=>c.to===qaTargetId).map(c=>({...c,to:copy.dataset.id,id:c.id+'-restored'}))); updateCanvasNodeRefs(copy); const order=getCanvasIncomingRefs(copy.dataset.id).map(r=>r.name); unmountCanvasVirtualNode(copy.dataset.id,copy); selectCanvasNode(node); return order;});
    assert.deepEqual(restored,['素材2','素材1','素材3'],'序列化恢复保留顺序');
    const beforeCancel=await names();
    const c0=await cards.nth(0).boundingBox(), c2=await cards.nth(2).boundingBox();
    await page.mouse.move(c0.x+20,c0.y+20); await page.mouse.down(); await page.mouse.move(c2.x+48,c2.y+20,{steps:8}); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await names(),beforeCancel,'Escape不提交排序');
    await page.mouse.move(c0.x+20,c0.y+20); await page.mouse.down(); await page.mouse.move(c2.x+48,c2.y+20,{steps:8});
    await panel.locator('.flora-reference-materials').dispatchEvent('pointercancel',{pointerId:1}); await page.mouse.up();
    assert.deepEqual(await names(),beforeCancel,'pointercancel不提交排序');
    const protocols=await page.evaluate(async()=>{
      const target=getCanvasNode(qaTargetId);
      window.qaTexts=[addCanvasText({x:-1400,y:0},{text:'第一份说明',focus:false}),addCanvasText({x:-1400,y:200},{text:'第二份说明',focus:false})];
      qaTexts.forEach(n=>connectCanvasNodes(n.dataset.id,target.dataset.id));
      let refs=getCanvasIncomingReferenceMaterials(target.dataset.id), texts=refs.filter(r=>r.type==='text');
      CanvasReferenceBridge.sort({targetNodeId:target.dataset.id,fromKey:texts[0].key,toKey:texts[1].key,placement:'after'});
      const prompt=getCanvasGenerationPrompt(target,'自己的要求');
      getCanvasIncomingRefs(target.dataset.id);
      const allOrder=getCanvasNodeRefOrder(target);
      const h3=addCanvasMinimaxH3Node({x:1400,y:0},{focus:false});
      let comfy=addCanvasComfyNode({x:1800,y:0},{focus:false});
      const source=qaSources.map(n=>ensureCanvasNodeMounted(n.dataset.id));
      for (const node of [h3,comfy]) source.forEach(n=>connectCanvasNodes(n.dataset.id,node.dataset.id));
      const images=getCanvasIncomingRefs(h3.dataset.id);
      h3.dataset.minimaxH3ImageOrder=JSON.stringify([images[2].key,images[0].key,images[1].key]);
      updateCanvasNodeRefs(h3);
      const legacy=getCanvasIncomingMinimaxH3Refs(h3).images.map(r=>r.name);
      const field=h3.querySelector('.canvas-h3-prompt'); field.value='@图片1 跟随 <Picture 2>'; field.dispatchEvent(new Event('input',{bubbles:true}));
      let hr=getCanvasIncomingReferenceMaterials(h3.dataset.id);
      CanvasReferenceBridge.sort({targetNodeId:h3.dataset.id,fromKey:hr[0].key,toKey:hr[1].key,placement:'after'});
      const h3order=getCanvasIncomingMinimaxH3Refs(h3).images.map(r=>r.name);
      const h3prompt=field.value;
      selectCanvasNode(h3);
      for (const mode of ['reference','first','last']) { h3.dataset.minimaxH3Mode=mode; await runCanvasMinimaxH3Node(h3); }
      comfy=ensureCanvasNodeMounted(comfy.dataset.id); selectCanvasNode(comfy);
      const cr=getCanvasIncomingRefs(comfy.dataset.id); CanvasReferenceBridge.sort({targetNodeId:comfy.dataset.id,fromKey:cr[0].key,toKey:cr[1].key,placement:'after'});
      const comfyorder=applyCanvasRefOrder(comfy,getCanvasIncomingRefs(comfy.dataset.id)).map(r=>r.name);
      await runCanvasComfyQwen21Node(comfy);
      const h3saved=serializeCanvasNode(h3).refOrder, comfysaved=serializeCanvasNode(comfy).refOrder;
      unmountCanvasVirtualNode(h3.dataset.id,h3); unmountCanvasVirtualNode(comfy.dataset.id,comfy); selectCanvasNode(target);
      return {prompt,allOrder,legacy,h3order,h3prompt,comfyorder,h3saved,comfysaved};
    });
    assert.ok(protocols.prompt.indexOf('第二份说明')<protocols.prompt.indexOf('第一份说明'),'文字按新顺序拼入生成');
    assert.equal(protocols.allOrder.length,5,'读取图片子集不丢失文字顺序');
    assert.deepEqual(protocols.legacy,['素材3','素材1','素材2'],'兼容H3旧顺序');
    assert.deepEqual(protocols.h3order,['素材1','素材3','素材2'],'H3协议素材顺序与操作区一致');
    assert.equal(protocols.h3prompt,'@图片2 跟随 <Picture 1>','H3引用随素材移动');
    assert.deepEqual(h3Requests.map(r=>r.mode),['reference','first','last'],'拦截H3三种实际请求');
    assert.deepEqual(h3Requests[0].images.map(r=>r.name),['素材1','素材3','素材2'],'H3参考按新顺序');
    assert.deepEqual(h3Requests[1].images.map(r=>r.name),['素材1'],'首帧取新顺序第一张');
    assert.deepEqual(h3Requests[2].images.map(r=>r.name),['素材1','素材3'],'首尾帧取新顺序前两张');
    assert.deepEqual(protocols.comfyorder,['素材2','素材1','素材3']);
    assert.equal(comfyRequests.length,1,'拦截ComfyUI实际提交');
    assert.deepEqual(comfyRequests[0].names,['素材2','素材1','素材3'],'ComfyUI请求素材按新顺序');
    assert.equal(protocols.h3saved.length,3); assert.equal(protocols.comfysaved.length,3);
    const grouped=await page.evaluate(async()=>{
      const group=createCanvasNode('group');
      renderCanvasGroupNode(group,{title:'测试图片组',images:qaSources.slice(0,2).map(n=>getCanvasNodeOutput(ensureCanvasNodeMounted(n.dataset.id)))});
      placeCanvasNode(group);
      const target=addCanvasImageGeneratorNode({x:2600,y:0},{focus:false});
      connectCanvasNodes(group.dataset.id,target.dataset.id);
      const refs=getCanvasIncomingReferenceMaterials(target.dataset.id);
      CanvasReferenceBridge.sort({targetNodeId:target.dataset.id,fromKey:refs[0].key,toKey:refs[1].key,placement:'after'});
      const names=getCanvasIncomingRefs(target.dataset.id).map(r=>r.name);
      const order=serializeCanvasNode(target).refOrder;
      unmountCanvasVirtualNode(group.dataset.id,group);
      const offscreen=getCanvasIncomingRefs(target.dataset.id).map(r=>r.name);
      unmountCanvasVirtualNode(target.dataset.id,target);selectCanvasNode(getCanvasNode(qaTargetId));
      return {names,offscreen,order};
    });
    assert.deepEqual(grouped.names,['素材2','素材1'],'图片组成员可单独排序');
    assert.deepEqual(grouped.offscreen,grouped.names,'图片组离屏保持顺序');
    assert.equal(grouped.order.length,2);
    for (const width of [390,768,1440,1728]) {
      await page.setViewportSize({width,height:1050});
      await page.evaluate(width=>{canvasState.x=width/2-300;canvasState.y=0;applyCanvasTransformNow();selectCanvasNode(getCanvasNode(qaTargetId));},width);
      await cards.first().focus(); await page.keyboard.press('Alt+ArrowRight'); assert.match((await names())[0],/素材1/,'键盘后移');
      await page.keyboard.press('Alt+ArrowLeft'); assert.match((await names())[0],/素材2/,'键盘前移');
      await page.screenshot({path:path.join(output,width+'-ordinary.png')});
      await panel.getByRole('button',{name:'放大操作区',exact:true}).click();
      const left=await cards.nth(0).boundingBox(), right=await cards.nth(1).boundingBox();
      const position=await page.evaluate(()=>({x:canvasState.x,y:canvasState.y,nodeX:getCanvasNode(qaTargetId).dataset.x,nodeY:getCanvasNode(qaTargetId).dataset.y}));
      await page.mouse.move(left.x+20,left.y+20); await page.mouse.down(); await page.mouse.move(right.x+48,right.y+20,{steps:8}); await page.mouse.up();
      assert.match((await names())[0],/素材1/,'放大态拖拽排序');
      await cards.nth(1).focus(); await page.keyboard.press('Alt+ArrowLeft');
      assert.match((await names())[0],/素材2/,'放大态键盘恢复');
      const touch=await page.context().newCDPSession(page);
      const ta=await cards.nth(0).boundingBox(), tb=await cards.nth(1).boundingBox();
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ta.x+20,y:ta.y+20}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tb.x+48,y:tb.y+20}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.match((await names())[0],/素材1/,'真实触摸拖动排序');
      await cards.nth(1).focus(); await page.keyboard.press('Alt+ArrowLeft'); await touch.detach();
      assert.match((await names())[0],/素材2/,'触摸后恢复');
      assert.deepEqual(await page.evaluate(()=>({x:canvasState.x,y:canvasState.y,nodeX:getCanvasNode(qaTargetId).dataset.x,nodeY:getCanvasNode(qaTargetId).dataset.y})),position,'排序不移动节点或相机');
      await page.screenshot({path:path.join(output,width+'-expanded.png')}); await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    assert.deepEqual(errors,[]); fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,widths:[390,768,1440,1728],requests:requests.length,comfyRequests:comfyRequests.length,h3Modes:h3Requests.map(r=>r.mode),grouped:grouped.names,touch:true,cancel:true,undoRedo:true,restored:true,errors},null,2)); console.log('参考排序专项通过');
    if (process.env.RUN_REGRESSIONS) for (const file of process.env.RUN_REGRESSIONS.split(',')) {
      const {spawn}=require('node:child_process');
      const runner = 'const fs=require("node:fs"),M=require("node:module"),p=require("node:path");const f=p.resolve(process.argv[1]);const m=new M(f);m.filename=f;m.paths=M._nodeModulePaths(p.dirname(f));m._compile(fs.readFileSync(f,"utf8").replaceAll("http://127.0.0.1:3199","http://127.0.0.1:33199"),f);';
      await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',runner,file],{cwd:__dirname,env:{...process.env,AI_OS_TEST_URL:'http://127.0.0.1:33199',...(!process.env.DEPLOYED?{GENERATOR_SOURCE:process.env.BASELINE_REGRESSION?'':path.join(__dirname,'design-sources')}:{})},stdio:'inherit'});child.on('exit',code=>code===0?resolve():reject(new Error(file+' failed '+code)));});
    }
    if (process.env.RUN_ACCEPTANCE) { const {spawn}=require('node:child_process'); await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['acceptance.cjs'],{cwd:__dirname,env:{...process.env,AI_OS_TEST_URL:'http://127.0.0.1:33199',AI_OS_ACCEPTANCE_DIR:path.join(output,'acceptance')},stdio:'inherit'});child.on('exit',code=>code===0?resolve():reject(new Error('acceptance failed '+code)));}); }
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});



