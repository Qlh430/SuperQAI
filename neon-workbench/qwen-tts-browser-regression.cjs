const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=process.env.QWEN_SOURCE||path.join(__dirname,'design-sources');
const output=path.resolve(__dirname,'../.planning/qwen-tts-20261026/browser');
fs.mkdirSync(output,{recursive:true});
const wav=Buffer.alloc(16044); wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});const requests=[],errors=[];let failUpload=false,holdUpload=false,heldUpload,heldReady;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   const url=route.request().url();
   if(url.includes('/audio-models'))return route.fulfill({json:{models:[{id:'qa-qwen',modelId:'qwen-tts',providerId:'local-comfyui',displayName:'Qwen-TTS',capabilities:['audio.generate'],modelProtocol:'audio-speech'},{id:'qa-ace',modelId:'ace-step',providerId:'local-comfyui',displayName:'ACE-Step',capabilities:['audio.generate'],modelProtocol:'comfyui'}]}});
   if(url.includes('/generate-audio')){requests.push(route.request().postDataJSON());return route.fulfill({json:{audio:{url:'/output/qa-result.wav',name:'测试语音',contentType:'audio/wav'}}});}
   if(url.includes('/upload-media')){if(holdUpload){heldUpload=route;heldReady();return;}const replacement=decodeURIComponent(route.request().headers()['x-file-name']||'')==='替换.wav';return route.fulfill(failUpload?{status:403,json:{error:'没有上传参考音频的权限。'}}:{json:{url:replacement?'/output/qa-replacement.wav':'/output/qa-reference.wav',filename:replacement?'qa-replacement.wav':'qa-reference.wav',mimeType:'audio/wav'}});}
   if(url.includes('/assets/resolve'))return route.fulfill({json:{asset:{downloadName:'测试语音.wav'}}});
   return route.fulfill({json:{authenticated:false,models:[],boards:[],projects:[],records:[],providers:[],preferences:{},settings:{}}});
  });
  await page.route('**/output/*.wav',route=>route.fulfill({contentType:'audio/wav',body:wav}));
  for(const name of ['script.js','canvas-audio-generator.js','canvas-audio-generator.css','flora-generator-composer.js','flora-generator-parameters.js','flora-node-shell.js','flora-node-shell.css','flora-generation-history.js']){
   const file=path.join(source,name==='script.js'&&source.endsWith('design-sources')?'script-before-save-bridge.js':name);
   if(fs.existsSync(file))await page.route(`**/${name}*`,route=>route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)}));
  }
  await page.goto(process.env.AI_OS_TEST_URL||'http://127.0.0.1:33199/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   await AiOsModuleLoader.ensure(['canvas-runtime','canvas-node-generator','canvas-node-asset-collection']);await loadCanvasBoards();canvasState.activeBoardId='qa-qwen';
   const surface=document.createElement('div');surface.id='neonEngineSurface';surface.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c';document.body.append(surface);
   const view=document.querySelector('#canvasView');surface.append(view);view.hidden=false;view.classList.add('active');view.style.cssText='flex:1;min-height:0;width:100%';document.querySelector('#canvasEditorScreen').hidden=false;document.body.classList.add('canvas-surface-open');showCanvasEditor();
   window.qaQwen=addCanvasAudioGeneratorNode({x:100,y:150});qaQwen.dataset.qaQwen='true';canvasState.x=420;canvasState.y=0;canvasState.scale=1;applyCanvasTransformNow();selectCanvasNode(qaQwen);
  });
  const node=page.locator('[data-qa-qwen]'),panel=node.locator('.flora-generator-composer');
  await panel.locator('option[value="qa-ace"]').waitFor({state:'attached'});
  await panel.locator('.canvas-audio-generator-mode').selectOption('speech');
  await panel.locator('.canvas-audio-generator-model').selectOption('qa-qwen');
  const voiceMode=panel.locator('.canvas-audio-generator-speed'),voice=panel.locator('.canvas-audio-generator-voice'),text=panel.locator('.canvas-audio-generator-prompt'),design=panel.locator('.canvas-audio-generator-lyrics'),run=panel.locator('.canvas-audio-generator-run');
  assert.deepEqual(await voiceMode.locator('option').allTextContents(),['克隆声音','预设声音','设计声音']);
  assert.equal(await voiceMode.inputValue(),'preset');assert.equal(await voice.inputValue(),'Ryan');assert.equal(await voice.locator('option').count(),9);
  const footerControls=await panel.locator('.canvas-audio-generator-controls > select').evaluateAll(controls=>controls.filter(el=>!el.hidden).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font;const textWidth=Math.max(...[...el.options].map(option=>ctx.measureText(option.textContent).width));return {label:el.getAttribute('aria-label'),width:r.width,height:r.height,top:r.top,needed:textWidth+parseFloat(s.paddingLeft)+Math.max(28,parseFloat(s.paddingRight))+parseFloat(s.borderLeftWidth)+parseFloat(s.borderRightWidth)};}));
  fs.writeFileSync(path.join(output,'footer-controls.json'),JSON.stringify(footerControls,null,2));
  assert.ok(footerControls.every(control=>control.width+1>=control.needed),'模型和音色必须留足完整文字及箭头空间：'+JSON.stringify(footerControls));
  assert.ok(footerControls.every(control=>control.top===footerControls[0].top),'桌面音频底排四个选择框应同一行');
  assert.equal(await panel.locator('.flora-generator-parameter-trigger').first().isVisible(),false);
  await text.fill('预设语音测试');await voice.selectOption('Uncle_fu');await run.click();await page.waitForFunction(()=>CanvasAudioGenerator.serialize(qaQwen).result?.url);
  assert.deepEqual(requests[0].parameters,{voiceMode:'preset',speaker:'Uncle_fu'});
  const downloadPromise=page.waitForEvent('download');await node.locator('[data-flora-action="result-download"]').click();const downloaded=await downloadPromise;assert.equal(downloaded.suggestedFilename(),'测试语音.wav');assert.deepEqual(fs.readFileSync(await downloaded.path()),wav);
  await voiceMode.selectOption('clone');assert.equal(await voice.isHidden(),true);assert.equal(await design.isHidden(),true);
  const referenceButton=panel.locator('.canvas-audio-reference-upload');
  assert.equal(await referenceButton.getAttribute('aria-label'),'添加参考音频');
  assert.equal(await referenceButton.locator('svg[data-lucide="plus"]').count(),1);
  const referenceGeometry=await panel.evaluate(el=>{const add=el.querySelector('.canvas-audio-reference-upload').getBoundingClientRect(),text=el.querySelector('.canvas-audio-generator-prompt').getBoundingClientRect();return {width:add.width,height:add.height,addBottom:add.bottom,promptTop:text.top};});
  assert.equal(referenceGeometry.width,44);assert.equal(referenceGeometry.height,44);assert.ok(referenceGeometry.addBottom<=referenceGeometry.promptTop,'克隆参考加号必须在提示词上方');
  await text.fill('克隆语音测试');await run.click();assert.equal(requests.length,1);await page.getByText('请先上传参考音频。',{exact:false}).first().waitFor();
  const audioCompatibility=await page.evaluate(()=>{
   window.qaAudioSourceA=addCanvasAudioNode({x:-300,y:200},{src:'/output/qa-source-a.wav',name:'音频参考A',mimeType:'audio/wav'});
   window.qaAudioSourceB=addCanvasAudioGeneratorNode({x:-300,y:420},{modelId:'qa-ace'});
   FloraGenerationHistory.add(qaAudioSourceB,{id:'qa-source-b-result',kind:'audio',src:'/output/qa-source-b.wav',name:'音频参考B'});
   const result=getCanvasConnectionCompatibility(qaAudioSourceA,qaQwen,getCanvasNodeOutput(qaAudioSourceA));selectCanvasNode(qaQwen);return result;
  });
  assert.equal(audioCompatibility.ok,true,'音频节点必须能连接克隆声音作为参考');
  await voiceMode.selectOption('preset');
  assert.equal(await page.evaluate(()=>getCanvasConnectionCompatibility(qaAudioSourceA,qaQwen,getCanvasNodeOutput(qaAudioSourceA)).ok),false,'预设声音不能接收克隆音频参考');
  await voiceMode.selectOption('clone');
  await page.evaluate(()=>connectCanvasNodes(qaAudioSourceA.dataset.id,qaQwen.dataset.id));
  assert.equal(await panel.locator('.canvas-audio-reference-player').getAttribute('src'),'/output/qa-source-a.wav');
  await page.evaluate(()=>connectCanvasNodes(qaAudioSourceB.dataset.id,qaQwen.dataset.id));
  assert.equal(await panel.locator('.canvas-audio-reference-player').getAttribute('src'),'/output/qa-source-b.wav');
  assert.equal(await page.evaluate(()=>getCanvasIncomingItems(qaQwen.dataset.id).filter(item=>item.type==='audio').length),1,'新音频连线替换旧参考连线');
  await page.evaluate(()=>{const id=qaQwen.dataset.id;undoCanvasCommand();window.qaQwen=getCanvasNode(id);qaQwen.dataset.qaQwen='true';selectCanvasNode(qaQwen);});
  assert.equal(await panel.locator('.canvas-audio-reference-player').getAttribute('src'),'/output/qa-source-a.wav','撤销应恢复前一条参考');
  await page.evaluate(()=>{const id=qaQwen.dataset.id;redoCanvasCommand();window.qaQwen=getCanvasNode(id);qaQwen.dataset.qaQwen='true';selectCanvasNode(qaQwen);});
  assert.equal(await voiceMode.inputValue(),'clone','撤销重做后界面仍保持克隆声音模式');
  assert.equal(await panel.locator('.canvas-audio-reference-player').getAttribute('src'),'/output/qa-source-b.wav');
  const linkedRestore=await page.evaluate(()=>{const snapshot=CanvasAudioGenerator.serialize(qaQwen),temporary=document.createElement('div');CanvasAudioGenerator.render(temporary,snapshot,{getModels:()=>canvasAudioModelCatalog});const restored=CanvasAudioGenerator.serialize(temporary).qwenDrafts.clone.referenceAudio;CanvasAudioGenerator.unmount(temporary);return {saved:snapshot.qwenDrafts.clone.referenceAudio,restored};});
  assert.deepEqual(linkedRestore.restored,linkedRestore.saved,'连接来源标识在序列化恢复后应保留');
  assert.equal(await voiceMode.inputValue(),'clone','参考恢复检查不能改变当前声音模式');
  await page.screenshot({path:path.join(output,'clone-linked-reference.png')});
  holdUpload=true;const uploadHeld=new Promise(resolve=>heldReady=resolve);
  await panel.locator('input[type=file]').setInputFiles({name:'待替换.wav',mimeType:'audio/wav',buffer:wav});await uploadHeld;
  await page.evaluate(()=>{const source=ensureCanvasNodeMounted(qaAudioSourceB.dataset.id);FloraGenerationHistory.add(source,{id:'qa-source-b-background',kind:'audio',src:'/output/qa-source-b-background.wav',name:'来源后台更新'});});
  holdUpload=false;await heldUpload.fulfill({json:{url:'/output/qa-pending-replacement.wav',filename:'qa-pending-replacement.wav',mimeType:'audio/wav'}});
  await page.waitForFunction(()=>document.querySelector('[data-qa-qwen] .canvas-audio-reference-player')?.getAttribute('src')==='/output/qa-pending-replacement.wav');
  assert.equal(await page.evaluate(()=>getCanvasIncomingItems(qaQwen.dataset.id).filter(item=>item.type==='audio').length),0,'上传过程中来源后台更新不能取消用户的替换上传');
  await page.evaluate(()=>connectCanvasNodes(qaAudioSourceB.dataset.id,qaQwen.dataset.id));
  await page.evaluate(()=>{const source=ensureCanvasNodeMounted(qaAudioSourceB.dataset.id);CanvasAudioGenerator.showResult(source,null);syncCanvasNodeModel(source);refreshCanvasConnectedNodes(source.dataset.id);});
  assert.equal(await panel.locator('.canvas-audio-reference-player').isHidden(),true,'源音频清空时不能使用缓存的旧音频');
  await run.click();assert.equal(requests.length,1,'源音频为空时不能提交旧参考');
  await page.evaluate(()=>{const source=ensureCanvasNodeMounted(qaAudioSourceB.dataset.id);FloraGenerationHistory.add(source,{id:'qa-source-b-new',kind:'audio',src:'/output/qa-source-b-new.wav',name:'音频参考B更新'});});
  assert.equal(await panel.locator('.canvas-audio-reference-player').getAttribute('src'),'/output/qa-source-b-new.wav','来源重新生成时参考更新');
  await panel.locator('.canvas-audio-reference-remove').click();
  assert.equal(await page.evaluate(()=>getCanvasIncomingItems(qaQwen.dataset.id).filter(item=>item.type==='audio').length),0,'移除连线参考时应断开对应音频线');
  await page.evaluate(()=>connectCanvasNodes(qaAudioSourceB.dataset.id,qaQwen.dataset.id));
  await page.evaluate(()=>disconnectCanvasNodes(qaAudioSourceB.dataset.id,qaQwen.dataset.id));
  assert.equal(await panel.locator('.canvas-audio-reference-player').isHidden(),true,'断开参考连线后不能继续使用旧音频');
  await page.evaluate(()=>connectCanvasNodes(qaAudioSourceA.dataset.id,qaQwen.dataset.id));
  const chooserPromise=page.waitForEvent('filechooser');await referenceButton.click();await(await chooserPromise).setFiles({name:'参考.wav',mimeType:'audio/wav',buffer:wav});await panel.locator('.canvas-audio-reference-player').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>getCanvasIncomingItems(qaQwen.dataset.id).filter(item=>item.type==='audio').length),0,'上传参考应替换并断开旧音频参考连线');
  assert.equal(await panel.locator('input[type=file]').evaluate(el=>el.multiple),false);
  assert.equal(await referenceButton.getAttribute('aria-label'),'替换参考音频');
  const replaceChooser=page.waitForEvent('filechooser');await referenceButton.click();await(await replaceChooser).setFiles({name:'替换.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('[data-qa-qwen] .canvas-audio-reference-player')?.getAttribute('src')==='/output/qa-replacement.wav');
  assert.equal(await panel.locator('.canvas-audio-reference-player').count(),1,'再次点击加号只能替换，不能累计播放器');
  await page.screenshot({path:path.join(output,'clone-reference-added.png')});
  await run.click();await page.waitForFunction(()=>document.querySelector('[data-qa-qwen] .canvas-audio-generator-run').disabled===false);
  assert.deepEqual(requests[1].parameters,{voiceMode:'clone',referenceAudio:'/output/qa-replacement.wav'});
  await panel.locator('.canvas-audio-reference-player').evaluate(el=>el.play());
  await voiceMode.selectOption('design');assert.equal(await design.isVisible(),true);assert.equal(await voice.isHidden(),true);assert.equal(await panel.locator('.canvas-audio-reference-player').evaluate(el=>el.paused),true,'切换模式后隐藏的参考音频必须停止');
  await text.fill('设计语音测试');await design.fill('温柔沉稳的女声');await run.click();await page.waitForFunction(()=>document.querySelector('[data-qa-qwen] .canvas-audio-generator-run').disabled===false);
  assert.deepEqual(requests[2].parameters,{voiceMode:'design',instruct:'温柔沉稳的女声'});
  await voiceMode.selectOption('preset');assert.equal(await text.inputValue(),'预设语音测试');assert.equal(await voice.inputValue(),'Uncle_fu');
  await voiceMode.selectOption('clone');assert.equal(await text.inputValue(),'克隆语音测试');assert.equal(await panel.locator('.canvas-audio-reference-player').getAttribute('src'),'/output/qa-replacement.wav');
  const state=await page.evaluate(()=>CanvasAudioGenerator.serialize(qaQwen));assert.equal(JSON.stringify(state).includes('data:audio'),false);
  await page.evaluate(state=>{deleteCanvasNodes([qaQwen]);window.qaQwen=addCanvasAudioGeneratorNode({x:100,y:150},state);qaQwen.dataset.qaQwen='true';selectCanvasNode(qaQwen);},state);
  assert.equal(await voiceMode.inputValue(),'clone');assert.equal(await text.inputValue(),'克隆语音测试');
  await panel.locator('.canvas-audio-reference-remove').click();assert.equal(await panel.locator('.canvas-audio-reference-player').isHidden(),true);
  failUpload=true;await panel.locator('input[type=file]').setInputFiles({name:'参考.wav',mimeType:'audio/wav',buffer:wav});await panel.locator('.flora-generator-status').filter({hasText:'没有上传参考音频的权限。'}).waitFor({timeout:4000}).catch(async error=>{await page.screenshot({path:path.join(output,'error-diagnostic.png')});console.log(await node.locator('[role=status], .canvas-node-footer-status').evaluateAll(elements=>elements.map(el=>({text:el.textContent,hidden:el.hidden,display:getComputedStyle(el).display,html:el.outerHTML.slice(0,500)}))));throw error;});failUpload=false;
  await voiceMode.selectOption('design');await panel.locator('.flora-generator-expand').click();
  const geometry=[];
  for(const width of [390,768,1440,1728]){
   await page.setViewportSize({width,height:1050});await page.waitForTimeout(80);
   const metric=await panel.evaluate(el=>{const a=el.querySelector('.canvas-audio-generator-prompt').getBoundingClientRect(),b=el.querySelector('.canvas-audio-generator-lyrics').getBoundingClientRect();return {width:innerWidth,upper:a.height,lower:b.height,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.ok(Math.abs(metric.upper-metric.lower)<=1);assert.equal(metric.overflow,false);geometry.push(metric);
   await page.screenshot({path:path.join(output,`design-expanded-${width}.png`)});
  }
  await panel.locator('.flora-generator-expand').click();
  await page.setViewportSize({width:1440,height:1050});
  for(const mode of ['clone','preset','design']){await voiceMode.selectOption(mode);await page.screenshot({path:path.join(output,`${mode}-desktop.png`)});}
  await voiceMode.selectOption('preset');await voice.selectOption('Ono_anna');
  for(const width of [390,768,1440,1728]){
   await page.setViewportSize({width,height:1050});await panel.locator('.flora-generator-expand').click();
   const fields=await panel.locator('.canvas-audio-generator-controls > select').evaluateAll(controls=>controls.filter(el=>!el.hidden).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d');ctx.font=s.font;return {text:el.selectedOptions[0]?.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,needed:ctx.measureText(el.selectedOptions[0]?.textContent||'').width+parseFloat(s.paddingLeft)+Math.max(28,parseFloat(s.paddingRight))+2};}));
   assert.ok(fields.every(field=>field.width+1>=field.needed&&field.height===44),'各宽度模型及长音色应完整显示并保持44px高');
   for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++)assert.equal(fields[i].left<fields[j].right&&fields[i].right>fields[j].left&&fields[i].top<fields[j].bottom&&fields[i].bottom>fields[j].top,false,'底部控件不能互相重叠');
   await voice.hover();await voice.focus();await page.screenshot({path:path.join(output,`preset-footer-expanded-${width}.png`)});
   await panel.locator('.flora-generator-expand').click();
  }
  await voiceMode.selectOption('clone');
  for(const width of [390,768,1440,1728]){
   await page.setViewportSize({width,height:1050});await panel.locator('.flora-generator-expand').click();
   const above=await panel.evaluate(el=>el.querySelector('.canvas-audio-reference-upload').getBoundingClientRect().bottom<=el.querySelector('.canvas-audio-generator-prompt').getBoundingClientRect().top);
   assert.equal(above,true,'放大及手机界面的加号位于提示词上方');
   await referenceButton.hover();await referenceButton.focus();await page.screenshot({path:path.join(output,`clone-reference-expanded-${width}.png`)});
   await panel.locator('.flora-generator-expand').click();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({requests,geometry,errors,passed:'三模式、九音色、参考上传/移除/错误、恢复、下载及四宽放大'},null,2));console.log(JSON.stringify({requests:requests.length,geometry,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
