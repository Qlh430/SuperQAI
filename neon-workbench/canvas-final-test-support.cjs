const base=require('./dom-scaling-test-support.cjs');
async function prepareKinds(f){
 const qaRuntime=process.env.QA_RUNTIME_ROOT || require('node:path').join(base.ROOT,'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
 for(const name of ['image','video','audio','text','note','script','upload']){const file=require('node:path').join(qaRuntime,'canvas-features',`node-${name}.js`);f.sourceFiles.push(file);f.sourceResources.push({runtimeName:`canvas-features/node-${name}.js`,file,servedSHA256:require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(file)).digest('hex'),sourceMode:'current official component; isolated fixture loads it if unregistered'});}
 await f.page.route('**/output/fidelity-test.mp4',route=>route.fulfill({status:200,contentType:'video/mp4',body:require('node:fs').readFileSync(require('node:path').join(__dirname,'test-fixtures/video-seek-fixture.mp4'))}));
 const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(Math.sin(i*440/8000*Math.PI*2)*4096),44+i*2);
 await f.page.route('**/output/fidelity-test.wav',route=>route.fulfill({status:200,contentType:'audio/wav',body:wav}));
 return f.page.evaluate(async()=>{
  await AiOsModuleLoader.ensure(['canvas-node-media','canvas-node-asset-collection','canvas-node-llm']);
  const features=[['image','image-generator'],['video','video-generator'],['audio','audio-generator'],['text','text'],['note','note'],['script','script-production'],['upload','asset-upload']];
  // script-production is release-disabled for creation, but its historical renderer
  // remains loaded. hasNode() deliberately reports availability, not registration.
  for(const [file,id] of features)if(id!=='script-production'&&!CanvasFeatureRegistry.hasNode(id))await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`/canvas-features/node-${file}.js`;script.onload=resolve;script.onerror=reject;document.head.append(script);});
  showCanvasNodeMenu({clientX:300,clientY:300});
  const menu=[...document.querySelectorAll('#canvasNodeMenu [data-canvas-node]')].filter(el=>el.getClientRects().length&&!el.hidden).map(el=>({id:el.dataset.canvasNode,label:el.textContent.trim()}));hideCanvasNodeMenu();
  const c=document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='#254451';ctx.fillRect(0,0,600,400);ctx.fillStyle='#d7c4a3';ctx.fillRect(70,60,460,280);ctx.fillStyle='#557c75';ctx.beginPath();ctx.arc(300,200,85,0,Math.PI*2);ctx.fill();
  window.__finalPNG=c.toDataURL();
  const clone=x=>JSON.parse(JSON.stringify(x)),seed=__domScalingSeeds;
  canvasState.isRestoring=true;
  const audio=addCanvasAudioGeneratorNode({x:0,y:0},{prompt:'温暖的开场旁白',parameters:{duration:24}}),script=createCanvasNode('llm');
  // Restore an existing script node for the historical-node performance fixture.
  // Release creation is intentionally disabled; do not bypass that flag.
  CanvasScriptProduction.hydrate(script,{productionWorkflow:{version:1,title:'脚本制作',source:'',settings:{textModel:'',imageModel:'',videoModel:'',ratio:'16:9',style:'',targetDuration:60,characterLayout:'four-views'},shots:[],assets:[],storyboards:[],videos:[],warnings:[]}});
  CanvasScriptProduction.decorate(script);
  const audioModel=serializeCanvasNode(audio),scriptModel=serializeCanvasNode(script);
  scriptModel.productionWorkflow.title='春日品牌短片';scriptModel.productionWorkflow.source='一位年轻人走进春日花园，开始一天的创作。';
  scriptModel.productionWorkflow.shots=[{id:'shot-1'}];scriptModel.productionWorkflow.assets=[{id:'actor-1',type:'character'}];
  const rows=[
   {key:'image-generator',model:{...clone(seed[0]),resultSrc:'',generationHistory:[],currentGenerationId:''}},
   {key:'image-result',model:{...clone(seed[0]),resultSrc:__finalPNG,generationHistory:[{id:'result-1',kind:'image',src:__finalPNG}],currentGenerationId:'result-1',width:400,height:400/1.5,size:'1536x1024'}},
   {key:'h3',model:{...clone(seed[1]),minimaxH3Prompt:'镜头穿过春日花园'}},
   {key:'video-generator',model:{kind:'video-api',width:640,height:360,apiVideoPrompt:'镜头缓缓向前移动'}},
   {key:'video-generator-result',model:{kind:'video-api',width:640,height:360,generationVideoSrc:location.origin+'/output/fidelity-test.mp4',apiVideoPrompt:'本地视频结果验收'}},
   {key:'audio-generator',model:audioModel},
   {key:'audio-generator-result',model:{...clone(audioModel),audioGeneration:{...clone(audioModel.audioGeneration),result:{url:location.origin+'/output/fidelity-test.wav',duration:1}}}},
   {key:'text',model:{...clone(seed[2]),text:'第一行：视觉完整度由内容决定。\n第二行：交互复杂度由用户意图决定。\n文字普通浏览始终可见，保持自动换行和段落。',textRichHtml:'<p>第一行：视觉完整度由内容决定。</p><p>第二行：交互复杂度由用户意图决定。</p><p>文字普通浏览始终可见，保持自动换行和段落。</p>',llmPrompt:'概括这段文案'}},
   {key:'script-generator',model:scriptModel},
   {key:'image',model:{kind:'image',uploadOnly:true,imageSrc:__finalPNG,imageName:'花园参考图',mediaSizeMode:'manual',width:400,height:400/1.5}},
   {key:'video',model:{kind:'video',mediaSrc:'',mediaName:'视频素材',width:400,height:400,posterSrc:__finalPNG}},
   {key:'audio',model:{kind:'audio',mediaSrc:'',mediaName:'旁白素材',width:400,height:128,mediaDuration:24}},
   {key:'note',model:{...clone(seed[3]),text:'创作便签\n画面保持自然光，人物面向镜头。',noteColor:'#eab308'}},
   {key:'group',model:{kind:'group',width:600,height:400,groupColor:'#14b8a6',groupTitle:'参考素材',groupMembers:[]}},
   {key:'asset-video',model:{kind:'asset-collection',width:400,height:400,assetCollection:{mode:'single',members:[{id:'av',kind:'video',src:location.origin+'/output/fidelity-test.mp4',name:'视频素材'}]}}},
   {key:'asset-audio',model:{kind:'asset-collection',width:400,height:128,assetCollection:{mode:'single',members:[{id:'aa',kind:'audio',src:location.origin+'/output/fidelity-test.mp4',name:'音频素材',duration:24}]}}},
  ];
  clearCanvasPlane();canvasState.isRestoring=false;
  window.__finalKindRows=rows.map((row,i)=>({key:row.key,model:{...row.model,id:'1',x:0,y:0,zOrder:1,nodeTitle:row.key==='script-generator'?'脚本生成':CanvasRepresentationVisualIdentity(row.model).kindLabel,nodeLabelId:'fidelity'}}));
  window.__finalMixedSeeds=['image-result','h3','text','audio-generator','script-generator','video-generator'].map(key=>rows.find(r=>r.key===key).model);
  return {rows:__finalKindRows.map(row=>({key:row.key,kind:row.model.kind})),activeFeatures:CanvasFeatureRegistry.listNodes(),currentMenu:menu,renderers:CanvasNodeVisuals.list()};
 });
}
async function loadFinal(f,count,scenario){
 await base.loadModels(f,count>=2000?100:count,scenario==='B'&&count>=2000?'A':scenario);
 return f.page.evaluate(({count,scenario})=>{
  const existing=[...canvasVirtualStore.values()],dense=scenario==='B'&&count>=2000,cols=dense?48:4;
  const nodes=Array.from({length:count},(_,i)=>{const m=existing[i]||{x:(i%cols)*(dense?260:680),y:Math.floor(i/cols)*(dense?190:620)};return {...JSON.parse(JSON.stringify(__finalMixedSeeds[i%__finalMixedSeeds.length])),id:String(i+1),x:count>=2000?(i%cols)*(dense?260:680):m.x,y:count>=2000?Math.floor(i/cols)*(dense?190:620):m.y,zOrder:i+1,nodeTitle:`验收节点${i+1}`,width:Number(__finalMixedSeeds[i%__finalMixedSeeds.length].width)||400,height:Number(__finalMixedSeeds[i%__finalMixedSeeds.length].height)||400};});
  const connections=[];for(let i=6;i+1<count;i+=6)connections.push({id:`final-edge-${i}`,from:String(i+1),to:String(i+2),fromPort:'output',toPort:'input'});
  for(const node of nodes){if(node.kind==='text')node.text=`节点 ${node.id}\n${node.text}`;if(node.productionWorkflow)node.productionWorkflow.title=`脚本项目 ${node.id}`;if(node.audioGeneration)node.audioGeneration.prompt+=` · ${node.id}`;}
  const viewport=dense?{x:30,y:50,scale:.1}:{x:canvasState.x,y:canvasState.y,scale:canvasState.scale};
  restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections,viewport});canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();clearTimeout(canvasState.saveTimer);
  return {count,scenario,kinds:nodes.reduce((r,n)=>(r[n.kind]=(r[n.kind]||0)+1,r),{}),localOnly:!canvasPagedStore.scenePage};
 },{count,scenario});
}
module.exports={...base,prepareKinds,loadFinal};
