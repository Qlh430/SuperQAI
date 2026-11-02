const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openFixture,settle}=require('./dom-scaling-test-support.cjs');
const out=path.resolve(__dirname,'../.planning/image-handoff-20261026');fs.mkdirSync(out,{recursive:true});
async function picture(page,id){
  const meta=await page.evaluate(id=>{const node=getCanvasNode(id),body=node.querySelector('.flora-node-content'),img=node.querySelector('.flora-node-result-area img,.canvas-image-upload img,.canvas-assets-body img');const r=body.getBoundingClientRect();return{point:{x:r.left+r.width*.25,y:r.top+r.height*.25},handoff:!!node.querySelector('.canvas-media-handoff'),image:img?{src:img.getAttribute('src'),quality:img.dataset.imageQuality,complete:img.complete,width:img.naturalWidth}:null,status:document.querySelector('.canvas-status')?.textContent};},id);
  const png=await page.screenshot();
  meta.pixel=await page.evaluate(async({png,point})=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'}));const cv=document.createElement('canvas');cv.width=image.width;cv.height=image.height;const ctx=cv.getContext('2d');ctx.drawImage(image,0,0);image.close();return [...ctx.getImageData(Math.round(point.x),Math.round(point.y),1,1).data];},{png:png.toString('base64'),point:meta.point});
  return{...meta,png};
}
const visible=state=>assert.ok(Math.abs(state.pixel[0]-30)<6&&Math.abs(state.pixel[1]-90)<6&&Math.abs(state.pixel[2]-240)<6,`已有图片不得被白底/破图替代：${JSON.stringify({...state,png:undefined})}`);
async function main(){const results=[];
 for(const width of (process.env.HANDOFF_WIDTHS||'1440,390,768,1728').split(',').map(Number))for(const kind of (process.env.HANDOFF_KINDS||'image,comfy,asset').split(',')){
  const f=await openFixture({width,height:1050}),row={width,kind,states:[]};results.push(row);let hold=false,fail=false;
  try{
   await f.page.evaluate(()=>AiOsModuleLoader.ensure(['canvas-node-asset-collection']));
   const data=await f.page.evaluate(()=>{const cv=document.createElement('canvas');cv.width=cv.height=400;const ctx=cv.getContext('2d');ctx.fillStyle='rgb(30,90,240)';ctx.fillRect(0,0,400,400);return cv.toDataURL().split(',')[1];});
   const png=Buffer.from(data,'base64');
   await f.page.route('**/api/image-thumbnails*',route=>route.fulfill({json:{item:{source:'/output/qa-handoff.png',thumbnailUrl:hold?'/output/qa-handoff-full.png':'/output/qa-handoff-thumb.png',width:400,height:400}}}));
   await f.page.route('**/output/qa-handoff*.png',async route=>{if(hold)await new Promise(resolve=>setTimeout(resolve,700));await route.fulfill(fail?{status:404,body:'fixture missing'}:{contentType:'image/png',headers:{'Cache-Control':'no-store'},body:png});});
   await f.page.evaluate(kind=>{const src='/output/qa-handoff.png';const one={...__domScalingSeeds[0],id:'1',kind:kind==='asset'?'asset-collection':kind,x:140,y:300,width:400,height:400,resultSrc:src,generationHistory:[{id:'h1',kind:'image',src}],currentGenerationId:'h1',zOrder:1};if(kind==='asset'){one.assetCollection={mode:'single',members:[{id:'a',kind:'image',src,name:'苹果',mimeType:'image/png'}]};delete one.resultSrc;}const two={...__domScalingSeeds[0],id:'2',x:640,y:300,width:400,height:400,resultSrc:src,generationHistory:[{id:'h2',kind:'image',src}],currentGenerationId:'h2',zOrder:2};restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[one,two,{id:'g',kind:'group',x:124,y:284,width:932,height:480,groupMembers:['1','2'],groupImages:[{name:'苹果',url:src}],zOrder:0}],connections:[],viewport:{x:30,y:30,scale:Math.min(.65,(innerWidth-100)/1200)}});canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();selectCanvasNode(CanvasNodeRepresentation.hydrateNode('g'));},kind);
   await f.page.waitForFunction(()=>canvasSceneTextureCache.get('/output/qa-handoff.png')?.state==='ready');await settle(f.page,700);
   hold=true;fail=true;
   await f.page.evaluate(()=>{imageResources.thumbnailCache.clear();imageResources.thumbnailPromises.clear();});
   await f.page.evaluate(()=>CanvasNodeRepresentation.hydrateNode('1'));await settle(f.page,100);
   let state=await picture(f.page,'1');row.states.push({name:'loading',...state,png:undefined});fs.writeFileSync(path.join(out,`${width}-${kind}-loading.png`),state.png);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));visible(state);assert.equal(state.handoff,true,'完整图片加载前必须保留已解码预览');
   await f.page.waitForFunction(()=>getCanvasNode('1')?.querySelector('img[data-canvas-original-src]')?.dataset.imageQuality==='error',{},{timeout:5000});
   state=await picture(f.page,'1');row.states.push({name:'error',...state,png:undefined});visible(state);assert.equal(state.handoff,true,'加载失败仍保留已有图片');assert.match(state.status,/加载失败|预览/);
   fail=false;
   await f.page.evaluate(()=>imageResources.showThumbnail(getCanvasNode('1').querySelector('img[data-canvas-original-src]')));
   await f.page.waitForFunction(()=>{const node=getCanvasNode('1'),img=node?.querySelector('img[data-canvas-original-src]');return img?.naturalWidth>0&&!node.querySelector('.canvas-media-handoff');});
   state=await picture(f.page,'1');row.states.push({name:'loaded',...state,png:undefined});visible(state);
   const detached=await f.page.evaluate(()=>{const node=getCanvasNode('1');clearCanvasSelection();CanvasNodeRepresentation.dehydrateNode('1');return !node.isConnected&&!node.querySelector('.canvas-media-handoff');});assert.equal(detached,true,'卸载后交接层必须清理');
   if(kind==='image')assert.equal(await f.page.evaluate(()=>{canvasVirtualStore.upsert({...__domScalingSeeds[0],id:'empty',x:1500,y:100,resultSrc:'',generationHistory:[],currentGenerationId:''});return !!CanvasNodeRepresentation.hydrateNode('empty').querySelector('.canvas-media-handoff');}),false,'空生成节点不能误显示加载提示');
   assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,passed:true}));}
main().catch(error=>{console.error(error);process.exitCode=1;});
